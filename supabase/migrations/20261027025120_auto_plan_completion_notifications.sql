-- Opt-in recipient preferences are personal and company scoped; every run keeps a snapshot.
create table private.auto_plan_notification_preferences (
 company_id uuid not null references public.companies(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 recipients uuid[] not null default '{}', updated_at timestamptz not null default now(),
 primary key(company_id,user_id), check(cardinality(recipients)<=100)
);
alter table private.auto_plan_notification_preferences enable row level security;
revoke all on private.auto_plan_notification_preferences from public,anon,authenticated,service_role;
alter table private.autonomous_planning_runs add column notification_recipients uuid[] not null default '{}';
create table private.auto_plan_completion_outbox (
 run_id uuid primary key references private.autonomous_planning_runs(id) on delete cascade,
 created_at timestamptz not null default now(), processed_at timestamptz,
 attempts int not null default 0, last_error text
);
alter table private.auto_plan_completion_outbox enable row level security;
revoke all on private.auto_plan_completion_outbox from public,anon,authenticated,service_role;

create function private.sf_auto_plan_recipient(company_ uuid,user_ uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.company_members m where m.company_id=company_ and m.user_id=user_
 and m.status='ACTIVE' and m.role in('OWNER','ADMIN','PLANNER','DISPATCHER'))
$$;
revoke all on function private.sf_auto_plan_recipient(uuid,uuid) from public,anon,authenticated,service_role;

create function private.sf_auto_plan_notification_options(company_ uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare selected_ uuid[];choices_ jsonb;
begin
 perform private.sf_background_plan_authorize(company_);
 if private.sf_has_time_only_login() then raise exception 'Planungszugang erforderlich.' using errcode='42501';end if;
 select recipients into selected_ from private.auto_plan_notification_preferences where company_id=company_ and user_id=auth.uid();
 select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',coalesce(nullif(btrim(concat_ws(', ',e.last_name,e.first_name)),''),nullif(u.raw_user_meta_data->>'full_name',''),split_part(u.email,'@',1),'Zugang'),
 'role',m.role,'access_role',m.access_role,'self',m.user_id=auth.uid(),
 'push_enabled',exists(select 1 from public.push_subscriptions ps where ps.user_id=m.user_id and ps.enabled)) order by coalesce(e.last_name,u.email),m.user_id),'[]'::jsonb)
 into choices_ from public.company_members m join auth.users u on u.id=m.user_id
 left join lateral(select x.first_name,x.last_name from public.employees x where x.company_id=company_ and x.auth_user_id=m.user_id and x.deleted_at is null order by x.id limit 1)e on true
 where m.company_id=company_ and private.sf_auto_plan_recipient(company_,m.user_id);
 return jsonb_build_object('choices',choices_,'selected',coalesce((select jsonb_agg(id) from unnest(selected_)id where private.sf_auto_plan_recipient(company_,id)),'[]'::jsonb));
end $$;
revoke all on function private.sf_auto_plan_notification_options(uuid) from public,anon,authenticated,service_role;

-- Keep the existing checked start/result controls and their complete authorization chain.
alter function private.sf_autonomy_control(uuid,text,jsonb,uuid,date) rename to sf_autonomy_control_before_notifications;
revoke all on function private.sf_autonomy_control_before_notifications(uuid,text,jsonb,uuid,date) from public,anon,authenticated,service_role;
create function private.sf_autonomy_control(company_ uuid,action_ text,config_ jsonb,run_ uuid,month_ date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare data_ jsonb;ids_ uuid[];options_ jsonb:=config_;
begin
 perform private.sf_background_plan_authorize(company_);
 if private.sf_has_time_only_login() then raise exception 'Planungszugang erforderlich.' using errcode='42501';end if;
 if action_ in('RUN','NOTIFY_SAVE') and config_ ? 'notify_user_ids' then
  if jsonb_typeof(config_->'notify_user_ids') is distinct from 'array' then raise exception 'Ungültige Benachrichtigungsempfänger.';end if;
  if jsonb_array_length(config_->'notify_user_ids')>100 or exists(select 1 from jsonb_array_elements(config_->'notify_user_ids')v where jsonb_typeof(v)<>'string' or (v#>>'{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'Ungültige Benachrichtigungsempfänger.';end if;
  select coalesce(array_agg(distinct v::uuid),'{}'::uuid[]) into ids_ from jsonb_array_elements_text(config_->'notify_user_ids')v;
  if exists(select 1 from unnest(ids_)id where not private.sf_auto_plan_recipient(company_,id)) then raise exception 'Ein Empfänger hat keine aktiven Planungsrechte in diesem Unternehmen.' using errcode='42501';end if;
  insert into private.auto_plan_notification_preferences(company_id,user_id,recipients) values(company_,auth.uid(),ids_)
  on conflict(company_id,user_id) do update set recipients=excluded.recipients,updated_at=now();
  options_:=config_-'notify_user_ids';
 end if;
 if action_='NOTIFY_SAVE' and (not coalesce(config_ ? 'notify_user_ids',false) or options_<>'{}'::jsonb) then raise exception 'Ungültige Benachrichtigungseinstellungen.';end if;
 data_:=private.sf_autonomy_control_before_notifications(company_,case when action_='NOTIFY_SAVE' then 'GET' else action_ end,options_,run_,month_);
 if action_<>'RESULT' then data_:=data_||jsonb_build_object('notifications',private.sf_auto_plan_notification_options(company_));end if;
 return data_;
end $$;
revoke all on function private.sf_autonomy_control(uuid,text,jsonb,uuid,date) from public,anon,service_role;
grant execute on function private.sf_autonomy_control(uuid,text,jsonb,uuid,date) to authenticated;

create function private.sf_auto_plan_recipient_snapshot() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 select coalesce((select array_agg(id) from private.auto_plan_notification_preferences p cross join lateral unnest(p.recipients)id
 where p.company_id=new.company_id and p.user_id=new.actor_id and private.sf_auto_plan_recipient(new.company_id,id)),'{}'::uuid[]) into new.notification_recipients;
 return new;
end $$;
revoke all on function private.sf_auto_plan_recipient_snapshot() from public,anon,authenticated,service_role;
create trigger auto_plan_recipient_snapshot before insert on private.autonomous_planning_runs for each row execute function private.sf_auto_plan_recipient_snapshot();

create function private.sf_auto_plan_completion_queue() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status in('READY','REVIEW','APPLIED','FAILED') and cardinality(new.notification_recipients)>0 then
  insert into private.auto_plan_completion_outbox(run_id) values(new.id) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function private.sf_auto_plan_completion_queue() from public,anon,authenticated,service_role;
create trigger auto_plan_completion_queue after insert or update of status on private.autonomous_planning_runs for each row execute function private.sf_auto_plan_completion_queue();

-- Separate durable dispatch: a notification/provider failure cannot roll back a finished plan.
create function private.sf_auto_plan_completion_dispatch() returns int
language plpgsql security definer set search_path='' set statement_timeout='30s' as $$
declare o record;r private.autonomous_planning_runs;recipient_ uuid;company_name_ text;period_ text;message_ text;title_ text;sent_ int:=0;
begin
 for o in select * from private.auto_plan_completion_outbox where processed_at is null and attempts<10 order by created_at limit 20 for update skip locked loop
  begin
   select * into r from private.autonomous_planning_runs where id=o.run_id;
   if r.status not in('READY','REVIEW','APPLIED','FAILED','CANCELLED') then continue;end if;
   if r.status<>'CANCELLED' then
    select name into company_name_ from public.companies where id=r.company_id;
    period_:=to_char(r.first_month,'MM.YYYY')||case when r.month_count>1 then '–'||to_char(r.first_month+make_interval(months=>r.month_count-1),'MM.YYYY') else '' end;
    if r.status='FAILED' or r.summary is null then title_:='Auto-Planung nicht abgeschlossen';message_:='Der Lauf konnte nicht abgeschlossen werden. Bitte den Status prüfen.';
    elsif coalesce((r.summary->>'open')::int,0)>0 then title_:='Auto-Planung beendet · Lücken prüfen';message_:=(r.summary->>'checked')||' Dienste geplant · '||(r.summary->>'open')||' Pflichtpositionen offen.';
    else title_:='Auto-Planung fertig · vollständig besetzt';message_:=coalesce(r.summary->>'checked','0')||' Dienste geplant · keine offenen Pflichtpositionen.';end if;
    if r.summary is not null and coalesce((r.summary->>'errors')::int,0)>0 then message_:=message_||' '||(r.summary->>'errors')||' Prüfpunkte beachten.';end if;
    if r.status='APPLIED' then message_:=message_||' Geprüfter Entwurf gespeichert.';elsif r.summary is not null then message_:=message_||' Vorschlag zur Prüfung bereit.';end if;
    foreach recipient_ in array r.notification_recipients loop
     if private.sf_auto_plan_recipient(r.company_id,recipient_) then
      perform private.sf_put_notification(r.company_id,recipient_,null,'AUTO_PLAN_FINISHED',title_,company_name_||' · '||period_||': '||message_,'auto','autonomous_planning_run',r.id,
       jsonb_build_object('company_id',r.company_id,'run_id',r.id,'first_month',r.first_month,'month_count',r.month_count,'status',r.status));
     end if;
    end loop;
   end if;
   update private.auto_plan_completion_outbox set processed_at=now(),attempts=attempts+1,last_error=null where run_id=o.run_id;sent_:=sent_+1;
  exception when others then update private.auto_plan_completion_outbox set attempts=attempts+1,last_error=left(SQLERRM,500) where run_id=o.run_id;
  end;
 end loop;
 return sent_;
end $$;
revoke all on function private.sf_auto_plan_completion_dispatch() from public,anon,authenticated,service_role;
select cron.schedule('schichtfunk-auto-plan-completion','* * * * *',$$select private.sf_auto_plan_completion_dispatch();$$);
-- Delivery-time check also blocks a role revoked after the completion message was queued.
create function private.sf_auto_plan_notification_active(notification_ uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.notifications n join private.autonomous_planning_runs r on r.id=n.entity_id and r.company_id=n.company_id
 where n.id=notification_ and n.kind='AUTO_PLAN_FINISHED' and n.entity_type='autonomous_planning_run'
 and n.user_id=any(r.notification_recipients) and private.sf_auto_plan_recipient(n.company_id,n.user_id))
$$;
revoke all on function private.sf_auto_plan_notification_active(uuid) from public,anon,authenticated;
grant execute on function private.sf_auto_plan_notification_active(uuid) to service_role;
create function public.server_auto_plan_notification_active(p_notification_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$select private.sf_auto_plan_notification_active(p_notification_id)$$;
revoke all on function public.server_auto_plan_notification_active(uuid) from public,anon,authenticated;
grant execute on function public.server_auto_plan_notification_active(uuid) to service_role;
notify pgrst,'reload schema';
