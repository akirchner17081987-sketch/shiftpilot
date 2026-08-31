-- SchichtFunk: sichere Benutzer- und Rechteverwaltung
create extension if not exists pgcrypto;

create table if not exists public.company_member_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  role text not null check (role in ('ADMIN','DISPATCHER','PLANNER','VIEWER')),
  token_hash text not null unique,
  status text not null default 'INVITED' check (status in ('INVITED','CLAIMED','REVOKED','EXPIRED')),
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  claimed_by uuid references auth.users(id),
  claimed_at timestamptz,
  unique(company_id,email)
);
alter table public.company_member_invites enable row level security;
create index if not exists company_member_invites_created_by_idx on public.company_member_invites(created_by);
create index if not exists company_member_invites_claimed_by_idx on public.company_member_invites(claimed_by) where claimed_by is not null;

create or replace function private.can_manage_company_users(p_company_id uuid)
returns boolean language sql stable security definer set search_path='public','pg_temp' as $$
  select exists(select 1 from public.company_members cm where cm.company_id=p_company_id and cm.user_id=auth.uid() and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN'));
$$;
revoke all on function private.can_manage_company_users(uuid) from public,anon,authenticated;

drop policy if exists company_member_invites_manage on public.company_member_invites;
create policy company_member_invites_manage on public.company_member_invites for all to authenticated
using (private.can_manage_company_users(company_id))
with check (private.can_manage_company_users(company_id));

create or replace function public.manager_list_company_users(p_company_id uuid)
returns table(record_id uuid,user_id uuid,email text,role text,status text,kind text,created_at timestamptz,expires_at timestamptz,is_self boolean)
language plpgsql security definer set search_path='public','auth','pg_temp' as $$
begin
  if not private.can_manage_company_users(p_company_id) then raise exception 'Nicht berechtigt'; end if;
  update public.company_member_invites set status='EXPIRED' where company_id=p_company_id and status='INVITED' and expires_at<=now();
  return query
    select cm.user_id,cm.user_id,coalesce(u.email,''),cm.role,cm.status,'MEMBER',cm.created_at,null::timestamptz,cm.user_id=auth.uid()
    from public.company_members cm join auth.users u on u.id=cm.user_id where cm.company_id=p_company_id
    union all
    select i.id,null::uuid,i.email,i.role,i.status,'INVITE',i.created_at,i.expires_at,false
    from public.company_member_invites i where i.company_id=p_company_id and i.status in ('INVITED','EXPIRED')
    order by created_at;
end $$;

create or replace function public.manager_create_company_invite(p_company_id uuid,p_email text,p_role text,p_token_hash text)
returns uuid language plpgsql security definer set search_path='public','auth','pg_temp' as $$
declare v_id uuid; v_email text:=lower(trim(coalesce(p_email,''))); v_role text:=upper(trim(coalesce(p_role,'')));
begin
  if not private.can_manage_company_users(p_company_id) then raise exception 'Nicht berechtigt'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'Ungültige E-Mail-Adresse'; end if;
  if v_role not in ('ADMIN','DISPATCHER','PLANNER','VIEWER') then raise exception 'Ungültige Rolle'; end if;
  if length(coalesce(p_token_hash,''))<>64 then raise exception 'Ungültiger Einladungsschlüssel'; end if;
  if exists(select 1 from public.company_members cm join auth.users u on u.id=cm.user_id where cm.company_id=p_company_id and lower(u.email)=v_email) then raise exception 'Für diese E-Mail besteht bereits ein Benutzer'; end if;
  insert into public.company_member_invites(company_id,email,role,token_hash,status,expires_at,created_by)
  values(p_company_id,v_email,v_role,p_token_hash,'INVITED',now()+interval '7 days',auth.uid())
  on conflict(company_id,email) do update set role=excluded.role,token_hash=excluded.token_hash,status='INVITED',expires_at=excluded.expires_at,created_by=auth.uid(),created_at=now(),claimed_by=null,claimed_at=null
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.manager_revoke_company_invite(p_invite_id uuid)
returns void language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_company uuid;
begin
  select company_id into v_company from public.company_member_invites where id=p_invite_id;
  if v_company is null or not private.can_manage_company_users(v_company) then raise exception 'Nicht berechtigt'; end if;
  update public.company_member_invites set status='REVOKED' where id=p_invite_id and status in ('INVITED','EXPIRED');
end $$;

create or replace function public.manager_update_company_member(p_company_id uuid,p_user_id uuid,p_role text,p_status text)
returns void language plpgsql security definer set search_path='public','auth','pg_temp' as $$
declare v_actor_role text; v_target_role text; v_role text:=upper(trim(coalesce(p_role,''))); v_status text:=upper(trim(coalesce(p_status,'')));
begin
  select role into v_actor_role from public.company_members where company_id=p_company_id and user_id=auth.uid() and status='ACTIVE';
  if v_actor_role not in ('OWNER','ADMIN') then raise exception 'Nicht berechtigt'; end if;
  select role into v_target_role from public.company_members where company_id=p_company_id and user_id=p_user_id;
  if v_target_role is null then raise exception 'Benutzer nicht gefunden'; end if;
  if v_target_role='OWNER' then raise exception 'Die Inhaberrolle ist geschützt'; end if;
  if v_role not in ('ADMIN','DISPATCHER','PLANNER','VIEWER') or v_status not in ('ACTIVE','DISABLED') then raise exception 'Ungültige Rolle oder Status'; end if;
  if p_user_id=auth.uid() and v_status<>'ACTIVE' then raise exception 'Der eigene Zugang kann nicht gesperrt werden'; end if;
  update public.company_members set role=v_role,status=v_status where company_id=p_company_id and user_id=p_user_id;
end $$;

create or replace function private.handle_schichtfunk_company_signup()
returns trigger language plpgsql security definer set search_path='public','auth','pg_temp' as $$
declare v_token text; v_hash text; v_inv public.company_member_invites%rowtype;
begin
  v_token:=coalesce(new.raw_user_meta_data->>'sf_company_invite','');
  if v_token='' then return new; end if;
  v_hash:=encode(digest(v_token,'sha256'),'hex');
  select * into v_inv from public.company_member_invites where token_hash=v_hash and status='INVITED' and expires_at>now() for update;
  if v_inv.id is null or lower(coalesce(new.email,''))<>lower(v_inv.email) then return new; end if;
  insert into public.company_members(company_id,user_id,role,status) values(v_inv.company_id,new.id,v_inv.role,'ACTIVE')
  on conflict(company_id,user_id) do update set role=excluded.role,status='ACTIVE';
  update public.company_member_invites set status='CLAIMED',claimed_by=new.id,claimed_at=now() where id=v_inv.id;
  return new;
end $$;

drop trigger if exists on_schichtfunk_company_signup on auth.users;
create trigger on_schichtfunk_company_signup after insert on auth.users for each row execute function private.handle_schichtfunk_company_signup();

revoke all on function public.manager_list_company_users(uuid) from public,anon;
revoke all on function public.manager_create_company_invite(uuid,text,text,text) from public,anon;
revoke all on function public.manager_revoke_company_invite(uuid) from public,anon;
revoke all on function public.manager_update_company_member(uuid,uuid,text,text) from public,anon;
grant execute on function public.manager_list_company_users(uuid) to authenticated;
grant execute on function public.manager_create_company_invite(uuid,text,text,text) to authenticated;
grant execute on function public.manager_revoke_company_invite(uuid) to authenticated;
grant execute on function public.manager_update_company_member(uuid,uuid,text,text) to authenticated;
