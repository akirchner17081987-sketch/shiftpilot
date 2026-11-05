-- TEST ENVIRONMENT ONLY. This does not enable a multi-company portal.
create table private.qa_employee_invite_targets (
  invite_id uuid not null references public.employee_access_invites(id) on delete cascade,
  company_id uuid not null references public.companies(id),
  employee_id uuid not null references public.employees(id),
  primary key (invite_id, company_id), unique (invite_id, employee_id)
);
alter table private.qa_employee_invite_targets enable row level security;
revoke all on private.qa_employee_invite_targets from public, anon, authenticated;

create function private.qa_clear_employee_invite_targets() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.token_hash is distinct from old.token_hash or new.email is distinct from old.email
     or new.employee_id is distinct from old.employee_id or new.company_id is distinct from old.company_id
     or new.expires_at is distinct from old.expires_at or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by then
    delete from private.qa_employee_invite_targets where invite_id=old.id;
  end if;
  return new;
end $$;
revoke all on function private.qa_clear_employee_invite_targets() from public, anon, authenticated;
create trigger qa_clear_employee_invite_targets after update on public.employee_access_invites
for each row execute function private.qa_clear_employee_invite_targets();

create function private.qa_create_multi_employee_invite(p_source uuid, p_employees uuid[], p_email text, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare emp public.employees%rowtype; source_employee uuid; result jsonb; invite uuid; mail text:=lower(trim(coalesce(p_email,'')));
begin
  if auth.uid() is null or private.sf_request_aal()<>'aal2' then raise exception 'Zwei-Faktor-Bestätigung erforderlich' using errcode='42501'; end if;
  if p_source is null or p_employees is null or cardinality(p_employees)<2 or cardinality(p_employees)>20
     or array_position(p_employees,null) is not null
     or cardinality(p_employees)<>(select count(distinct x) from unnest(p_employees) x)
  then raise exception 'Ungültige Profilauswahl'; end if;
  if exists(select 1 from auth.users u where lower(u.email)=mail) then raise exception 'Für diese E-Mail besteht bereits ein Konto'; end if;
  if (select count(*) from public.employees e where e.id=any(p_employees))<>cardinality(p_employees)
     or (select count(distinct e.company_id) from public.employees e where e.id=any(p_employees))<>cardinality(p_employees)
  then raise exception 'Ein Profil pro Unternehmen erforderlich'; end if;
  for emp in select * from public.employees where id=any(p_employees) order by company_id,id for update loop
    perform pg_advisory_xact_lock(hashtextextended(emp.company_id::text,7041));
    if not private.can_manage_company_users(emp.company_id) then raise exception 'Nicht berechtigt für ein ausgewähltes Unternehmen' using errcode='42501'; end if;
    if emp.status<>'active' or emp.deleted_at is not null or emp.auth_user_id is not null
       or emp.access_status='DISABLED' or lower(trim(coalesce(emp.email,'')))<>mail
    then raise exception 'Mitarbeiterprofil nicht verfügbar oder E-Mail stimmt nicht überein'; end if;
    if exists(select 1 from public.employee_access_invites i where i.company_id=emp.company_id and lower(i.email)=mail and i.claimed_at is null and i.expires_at>now())
       or exists(select 1 from public.company_member_invites i where i.company_id=emp.company_id and lower(i.email)=mail and i.status='INVITED' and i.expires_at>now())
    then raise exception 'Eine offene Einladung besteht bereits'; end if;
    if emp.company_id=p_source then source_employee:=emp.id; end if;
  end loop;
  if source_employee is null then raise exception 'Quellunternehmen fehlt'; end if;
  result:=private.manager_create_access_invite(p_source,mail,'EMPLOYEE','{}'::text[],p_token_hash,source_employee);
  if result->>'parameter'<>'employeeInvite' then raise exception 'Ungültige Einladungsart'; end if;
  invite:=(result->>'id')::uuid;
  delete from private.qa_employee_invite_targets where invite_id=invite;
  insert into private.qa_employee_invite_targets(invite_id,company_id,employee_id)
    select invite,e.company_id,e.id from public.employees e where e.id=any(p_employees) and e.id<>source_employee;
  return result;
end $$;
revoke all on function private.qa_create_multi_employee_invite(uuid,uuid[],text,text) from public, anon;
grant execute on function private.qa_create_multi_employee_invite(uuid,uuid[],text,text) to authenticated;
create function public.qa_create_multi_employee_invite(p_source uuid,p_employees uuid[],p_email text,p_token_hash text)
returns jsonb language sql set search_path = '' as $$
  select private.qa_create_multi_employee_invite(p_source,p_employees,p_email,p_token_hash)
$$;
revoke all on function public.qa_create_multi_employee_invite(uuid,uuid[],text,text) from public, anon;
grant execute on function public.qa_create_multi_employee_invite(uuid,uuid[],text,text) to authenticated;

create function private.qa_finish_multi_employee_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare inv public.employee_access_invites%rowtype; target record; emp public.employees%rowtype;
begin
  if nullif(new.raw_user_meta_data->>'sf_employee_invite','') is null then return new; end if;
  select * into inv from public.employee_access_invites where claimed_by=new.id and claimed_at is not null
    and token_hash=encode(extensions.digest(new.raw_user_meta_data->>'sf_employee_invite','sha256'),'hex') for update;
  if not found then raise exception 'Einladung nicht gültig'; end if;
  for target in select * from private.qa_employee_invite_targets where invite_id=inv.id order by company_id,employee_id loop
    select * into emp from public.employees where id=target.employee_id for update;
    if not found or emp.company_id<>target.company_id or emp.status<>'active' or emp.deleted_at is not null
       or emp.auth_user_id is not null or emp.access_status='DISABLED' or lower(trim(coalesce(emp.email,'')))<>lower(inv.email)
    then raise exception 'Mitarbeiterprofil nicht mehr verfügbar'; end if;
    update public.employees set auth_user_id=new.id,access_status='ACTIVE',access_linked_at=now(),updated_at=now() where id=emp.id;
  end loop;
  return new;
end $$;
revoke all on function private.qa_finish_multi_employee_signup() from public, anon, authenticated;
create trigger zz_qa_multi_employee_signup after insert on auth.users
for each row execute function private.qa_finish_multi_employee_signup();

