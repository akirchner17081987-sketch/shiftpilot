-- Personal direct messages. No management override, no message text in audit/push.
create table public.direct_messages (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 body text not null check (char_length(btrim(body,E' \t\n\r')) between 1 and 2000),
 client_message_id uuid not null,
 created_at timestamptz not null default now(),
 read_at timestamptz,
 constraint direct_messages_no_self check (sender_id <> recipient_id),
 constraint direct_messages_retry_unique unique(sender_id,client_message_id)
);
create index direct_messages_sender_thread on public.direct_messages(company_id,sender_id,recipient_id,created_at desc,id desc);
create index direct_messages_recipient_thread on public.direct_messages(company_id,recipient_id,sender_id,created_at desc,id desc);
create index direct_messages_unread on public.direct_messages(company_id,recipient_id) where read_at is null;
create index direct_messages_sender_rate on public.direct_messages(sender_id,created_at desc);
alter table public.direct_messages enable row level security;
revoke all on public.direct_messages from public,anon,authenticated;
grant select on public.direct_messages to authenticated;

-- Lookup must bypass the employees' own-row policy to find colleagues, but returns
-- only eligibility. Disabled membership takes precedence over an employee link.
create function private.sf_message_user_active(p_company_id uuid,p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and p_user_id is not null
 and exists(select 1 from auth.users u where u.id=p_user_id and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()))
 and not exists(select 1 from public.company_members m where m.company_id=p_company_id and m.user_id=p_user_id and m.status<>'ACTIVE')
 and (exists(select 1 from public.company_members m where m.company_id=p_company_id and m.user_id=p_user_id and m.status='ACTIVE' and m.role in ('OWNER','ADMIN','PLANNER','DISPATCHER','VIEWER'))
 or exists(select 1 from public.employees e where e.company_id=p_company_id and e.auth_user_id=p_user_id and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null))
$$;
revoke all on function private.sf_message_user_active(uuid,uuid) from public,anon,authenticated;
create function private.sf_message_actor_active(p_company_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.sf_message_user_active(p_company_id,auth.uid())
$$;
revoke all on function private.sf_message_actor_active(uuid) from public,anon;
grant execute on function private.sf_message_actor_active(uuid) to authenticated;
create policy direct_messages_participant_read on public.direct_messages for select to authenticated
 using (((select auth.uid())=sender_id or (select auth.uid())=recipient_id) and private.sf_message_actor_active(company_id));

create function private.messages_contacts(p_company_id uuid)
returns table(user_id uuid,display_name text,access_role text) language plpgsql stable security definer set search_path='' as $$
begin
 if not private.sf_message_actor_active(p_company_id) then raise exception 'MESSAGE_ACCESS_DENIED';end if;
 return query
 select u.id,coalesce(nullif(btrim(concat_ws(', ',e.last_name,e.first_name)),''),nullif(u.raw_user_meta_data->>'full_name',''),split_part(u.email,'@',1),'Zugang'),coalesce(m.access_role,'EMPLOYEE')
 from (select m.user_id from public.company_members m where m.company_id=p_company_id
       union select e.auth_user_id from public.employees e where e.company_id=p_company_id and e.auth_user_id is not null) candidates
 join auth.users u on u.id=candidates.user_id
 left join public.company_members m on m.company_id=p_company_id and m.user_id=u.id
 left join lateral(select x.first_name,x.last_name from public.employees x where x.company_id=p_company_id and x.auth_user_id=u.id and x.deleted_at is null order by x.id limit 1) e on true
 where u.id<>auth.uid() and private.sf_message_user_active(p_company_id,u.id)
 order by 2,u.id;
end $$;

create function private.messages_inbox(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_result jsonb;
begin
 if not private.sf_message_actor_active(p_company_id) then raise exception 'MESSAGE_ACCESS_DENIED';end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc,t.id desc),'[]'::jsonb) into v_result from (
  select l.id,l.peer_id,l.body,l.created_at,l.sender_id,
   (select count(*) from public.direct_messages u where u.company_id=p_company_id and u.recipient_id=v_actor and u.sender_id=l.peer_id and u.read_at is null) unread
  from (select distinct on (peer_id) * from (
    select d.id,d.recipient_id peer_id,d.body,d.created_at,d.sender_id from public.direct_messages d where d.company_id=p_company_id and d.sender_id=v_actor
    union all
    select d.id,d.sender_id peer_id,d.body,d.created_at,d.sender_id from public.direct_messages d where d.company_id=p_company_id and d.recipient_id=v_actor
   ) a order by peer_id,created_at desc,id desc) l order by l.created_at desc,l.id desc limit 100
 ) t;
 return jsonb_build_object('conversations',v_result,'unread',(select count(*) from public.direct_messages where company_id=p_company_id and recipient_id=v_actor and read_at is null));
end $$;

create function private.messages_unread(p_company_id uuid)
returns bigint language plpgsql stable security definer set search_path='' as $$
begin
 if not private.sf_message_actor_active(p_company_id) then raise exception 'MESSAGE_ACCESS_DENIED';end if;
 return (select count(*) from public.direct_messages where company_id=p_company_id and recipient_id=auth.uid() and read_at is null);
end $$;

create function private.messages_thread(p_company_id uuid,p_peer_id uuid,p_before_at timestamptz default null,p_before_id uuid default null)
returns setof public.direct_messages language plpgsql stable security definer set search_path='' as $$
begin
 if not private.sf_message_actor_active(p_company_id) then raise exception 'MESSAGE_ACCESS_DENIED';end if;
 return query select d.* from public.direct_messages d
 where d.company_id=p_company_id and ((d.sender_id=auth.uid() and d.recipient_id=p_peer_id) or (d.recipient_id=auth.uid() and d.sender_id=p_peer_id))
 and (p_before_at is null or (d.created_at,d.id)<(p_before_at,p_before_id))
 order by d.created_at desc,d.id desc limit 50;
end $$;

create function private.messages_send(p_company_id uuid,p_recipient_id uuid,p_body text,p_client_message_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_existing public.direct_messages;v_id uuid;v_body text:=btrim(p_body,E' \t\n\r');
begin
 if not private.sf_message_actor_active(p_company_id) then raise exception 'MESSAGE_ACCESS_DENIED';end if;
 if p_client_message_id is null or p_recipient_id is null or p_recipient_id=v_actor then raise exception 'MESSAGE_INVALID_RECIPIENT';end if;
 if v_body is null or char_length(v_body) not between 1 and 2000 then raise exception 'MESSAGE_INVALID_BODY';end if;
 if not private.sf_message_user_active(p_company_id,p_recipient_id) then raise exception 'MESSAGE_RECIPIENT_UNAVAILABLE';end if;
 -- Serialize this sender: safe retries and a small abuse limit across devices.
 perform pg_advisory_xact_lock(hashtextextended(v_actor::text,8431));
 select * into v_existing from public.direct_messages where sender_id=v_actor and client_message_id=p_client_message_id;
 if found then
  if v_existing.company_id<>p_company_id or v_existing.recipient_id<>p_recipient_id or v_existing.body<>v_body then raise exception 'MESSAGE_RETRY_MISMATCH';end if;
  return v_existing.id;
 end if;
 if (select count(*) from public.direct_messages where sender_id=v_actor and created_at>now()-interval '1 minute')>=30 then raise exception 'MESSAGE_RATE_LIMIT';end if;
 insert into public.direct_messages(company_id,sender_id,recipient_id,body,client_message_id)
 values(p_company_id,v_actor,p_recipient_id,v_body,p_client_message_id) returning id into v_id;
 return v_id;
end $$;

create function private.messages_mark_read(p_company_id uuid,p_message_ids uuid[])
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
 if not private.sf_message_actor_active(p_company_id) then raise exception 'MESSAGE_ACCESS_DENIED';end if;
 if coalesce(cardinality(p_message_ids),0)>50 then raise exception 'MESSAGE_INVALID_PAGE';end if;
 update public.direct_messages set read_at=now() where company_id=p_company_id and recipient_id=auth.uid() and id=any(p_message_ids) and read_at is null;
 get diagnostics v_count=row_count;return v_count;
end $$;

-- Only invoker wrappers are exposed to the Data API. Private implementations
-- perform authorization on every call; nobody gets insert/update/delete grants.
create function public.messages_contacts(p_company_id uuid) returns table(user_id uuid,display_name text,access_role text) language sql security invoker set search_path='' as $$select * from private.messages_contacts(p_company_id)$$;
create function public.messages_inbox(p_company_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.messages_inbox(p_company_id)$$;
create function public.messages_unread(p_company_id uuid) returns bigint language sql security invoker set search_path='' as $$select private.messages_unread(p_company_id)$$;
create function public.messages_thread(p_company_id uuid,p_peer_id uuid,p_before_at timestamptz default null,p_before_id uuid default null) returns setof public.direct_messages language sql security invoker set search_path='' as $$select * from private.messages_thread(p_company_id,p_peer_id,p_before_at,p_before_id)$$;
create function public.messages_send(p_company_id uuid,p_recipient_id uuid,p_body text,p_client_message_id uuid) returns uuid language sql security invoker set search_path='' as $$select private.messages_send(p_company_id,p_recipient_id,p_body,p_client_message_id)$$;
create function public.messages_mark_read(p_company_id uuid,p_message_ids uuid[]) returns integer language sql security invoker set search_path='' as $$select private.messages_mark_read(p_company_id,p_message_ids)$$;
do $$declare r record;begin
 for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname in ('messages_contacts','messages_inbox','messages_unread','messages_thread','messages_send','messages_mark_read') loop
  execute format('revoke all on function %s from public,anon,authenticated',r.signature);
  execute format('grant execute on function %s to authenticated',r.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
