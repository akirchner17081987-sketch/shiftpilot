-- Adds synthetic fixtures to access-profiles-bootstrap.sql; no real employee data.
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select,insert,update,delete on storage.objects to authenticated;
create table public.absences(
 id uuid primary key default gen_random_uuid(),company_id uuid,employee_id uuid,legacy_id text,
 start_date date,end_date date,absence_type text,status text,full_day boolean default true,
 start_time time,end_time time,time_note text default '',note text default '',
 created_at timestamptz default now(),updated_at timestamptz default now(),request_source text,
 requested_by uuid,requested_at timestamptz,reviewed_by uuid,reviewed_at timestamptz,review_note text default '');
alter table public.absences enable row level security;
create policy old_absence_select on public.absences for select to authenticated using (
 private.sf_is_manager(company_id,false) or exists(select 1 from public.employees e where e.id=employee_id and e.auth_user_id=auth.uid()));
create policy old_absence_writes on public.absences for all to authenticated
 using(private.sf_is_manager(company_id,false)) with check(private.sf_is_manager(company_id,false));
grant select,insert,update,delete on public.absences to authenticated;
alter table public.audit_events enable row level security;
create policy old_audit_read on public.audit_events for select to authenticated using(private.sf_is_manager(company_id,true));
grant select on public.audit_events to authenticated;
alter table public.time_month_closures enable row level security;
create policy old_closure_read on public.time_month_closures for select to authenticated using(private.sf_is_manager(company_id,false));
grant select on public.time_month_closures to authenticated;
create table public.notifications(id uuid default gen_random_uuid(),company_id uuid,user_id uuid,employee_id uuid,
 kind text,title text,message text,link_view text,entity_type text,entity_id uuid,metadata jsonb,
 is_read boolean default false,read_at timestamptz,created_at timestamptz default now(),unique(user_id,kind,entity_id));
create table public.time_account_settings(company_id uuid,account_start_date date,credited_absence_types text[],federal_state text);

create policy employee_self_fixture on public.employees for select to authenticated using(auth_user_id=auth.uid() and status='active');
create table public.company_compliance_policy(company_id uuid,standard_min_rest_hours numeric,standard_max_shift_hours numeric);
grant select on public.companies,public.company_compliance_policy,public.shift_assignments to authenticated;
create function private.sf_has_time_only_login() returns boolean language sql stable as $$select false$$;

CREATE OR REPLACE FUNCTION private.sf_put_notification(p_company_id uuid, p_user_id uuid, p_employee_id uuid, p_kind text, p_title text, p_message text, p_link_view text, p_entity_type text, p_entity_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
begin
  if p_user_id is null or p_company_id is null or p_entity_id is null then return; end if;
  insert into public.notifications(company_id,user_id,employee_id,kind,title,message,link_view,entity_type,entity_id,metadata)
  values(p_company_id,p_user_id,p_employee_id,p_kind,left(coalesce(p_title,''),180),left(coalesce(p_message,''),1200),p_link_view,p_entity_type,p_entity_id,coalesce(p_metadata,'{}'::jsonb))
  on conflict(user_id,kind,entity_id)
  do update set
    employee_id=excluded.employee_id,
    title=excluded.title,
    message=excluded.message,
    link_view=excluded.link_view,
    entity_type=excluded.entity_type,
    metadata=excluded.metadata,
    is_read=false,
    read_at=null,
    created_at=now();
end
$function$
;

CREATE OR REPLACE FUNCTION private.sf_notify_managers(p_company_id uuid, p_kind text, p_title text, p_message text, p_link_view text, p_entity_type text, p_entity_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare r record;
begin
  for r in
    select cm.user_id
    from public.company_members cm
    where cm.company_id=p_company_id
      and cm.status='ACTIVE'
      and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER')
  loop
    perform private.sf_put_notification(p_company_id,r.user_id,null,p_kind,p_title,p_message,p_link_view,p_entity_type,p_entity_id,p_metadata);
  end loop;
end
$function$
;
