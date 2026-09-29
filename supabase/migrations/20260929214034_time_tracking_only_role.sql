-- Dedicated role: time entry APIs only; never broaden sf_is_manager.
alter table public.company_members drop constraint company_members_role_check;
alter table public.company_members add constraint company_members_role_check
 check (role in ('OWNER','ADMIN','DISPATCHER','PLANNER','VIEWER','TIME_TRACKING'));
alter table public.company_member_invites drop constraint company_member_invites_role_check;
alter table public.company_member_invites add constraint company_member_invites_role_check
 check (role in ('ADMIN','DISPATCHER','PLANNER','VIEWER','TIME_TRACKING'));

create or replace function private.sf_is_time_only(p_company_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.company_members cm where cm.company_id=p_company_id
 and cm.user_id=(select auth.uid()) and cm.role='TIME_TRACKING');
$$;
create or replace function private.sf_can_manage_time(p_company_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.sf_is_manager(p_company_id,false) or exists(
 select 1 from public.company_members cm where cm.company_id=p_company_id
 and cm.user_id=(select auth.uid()) and cm.role='TIME_TRACKING' and cm.status='ACTIVE');
$$;
create or replace function private.sf_has_time_only_login()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.company_members cm
 where cm.user_id=(select auth.uid()) and cm.role='TIME_TRACKING')
 and not exists(select 1 from public.company_members cm
 where cm.user_id=(select auth.uid()) and cm.status='ACTIVE' and cm.role<>'TIME_TRACKING');
$$;
revoke all on function private.sf_is_time_only(uuid),private.sf_can_manage_time(uuid),private.sf_has_time_only_login() from public,anon;
grant execute on function private.sf_is_time_only(uuid),private.sf_has_time_only_login() to authenticated;
-- sf_can_manage_time is only called inside trusted time RPCs.
revoke all on function private.sf_can_manage_time(uuid) from authenticated;

-- Older permissive membership policies must not expose whole employee/plan records.
-- Time-only clients use narrowly scoped RPCs; direct table writes stay blocked.
do $$
declare r record;
begin
 for r in select c.relname from pg_catalog.pg_class c
 join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and c.relrowsecurity
 and c.relname<>'company_members' and exists(
 select 1 from pg_catalog.pg_attribute a where a.attrelid=c.oid
 and a.attname='company_id' and not a.attisdropped)
 loop
  execute format('create policy time_only_no_direct_access on public.%I as restrictive for all to authenticated using (not private.sf_is_time_only(company_id)) with check (not private.sf_is_time_only(company_id))',r.relname);
 end loop;
end $$;
create policy time_only_company_settings_block on public.companies as restrictive for all
 to authenticated using (not private.sf_is_time_only(id) and not (select private.sf_has_time_only_login()))
 with check (not private.sf_is_time_only(id) and not (select private.sf_has_time_only_login()));
create policy time_only_no_membership_creation on public.company_members as restrictive for insert
 to authenticated with check (not (select private.sf_has_time_only_login()));

create or replace function public.time_access_context(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.sf_can_manage_time(p_company_id) then raise exception 'Nicht berechtigt'; end if;
 return (select jsonb_build_object('name',c.name,'timezone',coalesce(c.timezone,'Europe/Berlin'))
 from public.companies c where c.id=p_company_id);
end $$;
revoke all on function public.time_access_context(uuid) from public,anon;
grant execute on function public.time_access_context(uuid) to authenticated;

CREATE OR REPLACE FUNCTION private.manager_bulk_record_time_entries(p_company_id uuid, p_start_date date, p_end_date date, p_note text DEFAULT ''::text, p_confirm boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_total integer:=0;
  v_updated integer:=0;
  v_skipped_existing integer:=0;
  v_skipped_future integer:=0;
  v_skipped_invalid integer:=0;
  v_reopened_months integer:=0;
  v_month date;
begin
  if not private.sf_can_manage_time(p_company_id) then
    raise exception 'Nicht berechtigt';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then
    raise exception 'Ungueltiger Zeitraum';
  end if;
  if p_end_date-p_start_date>366 then
    raise exception 'Der Zeitraum darf hoechstens 366 Tage umfassen';
  end if;
  if length(coalesce(p_note,''))>1000 then
    raise exception 'Die Bemerkung darf hoechstens 1.000 Zeichen enthalten';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_company_id::text||p_start_date::text||p_end_date::text,0
  ));

  select count(*) into v_total
  from public.shift_assignments sa
  where sa.company_id=p_company_id and sa.status<>'CANCELLED'
    and sa.starts_at::date between p_start_date and p_end_date;

  select count(*) into v_skipped_existing
  from public.shift_assignments sa
  join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
  where sa.company_id=p_company_id and sa.status<>'CANCELLED'
    and sa.starts_at::date between p_start_date and p_end_date;

  select count(*) into v_skipped_future
  from public.shift_assignments sa
  left join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
  where sa.company_id=p_company_id and sa.status<>'CANCELLED' and te.assignment_id is null
    and sa.starts_at::date between p_start_date and p_end_date and sa.ends_at>now();

  select count(*) into v_skipped_invalid
  from public.shift_assignments sa
  left join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
  where sa.company_id=p_company_id and sa.status<>'CANCELLED' and te.assignment_id is null
    and sa.starts_at::date between p_start_date and p_end_date and sa.ends_at<=now()
    and (
      sa.ends_at<=sa.starts_at or sa.ends_at-sa.starts_at>interval '24 hours'
      or coalesce(sa.break_minutes,0)<0
      or coalesce(sa.break_minutes,0)>=extract(epoch from(sa.ends_at-sa.starts_at))/60
    );

  -- Eine Sammeluebernahme ist die ausdrueckliche Entscheidung, dass Plan = Ist gilt.
  -- Falls der Zeitraum bereits abgeschlossen war, wird nur fuer wirklich uebernehmbare
  -- fehlende Eintraege kontrolliert wieder geoeffnet. Die bestehende RPC protokolliert
  -- jede Wiedereroeffnung und beschraenkt sie auf OWNER/ADMIN.
  for v_month in
    select distinct date_trunc('month',sa.starts_at)::date
    from public.shift_assignments sa
    left join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
    join public.time_month_closures c
      on c.company_id=sa.company_id
     and c.month_start=date_trunc('month',sa.starts_at)::date
     and c.status='CLOSED'
    where sa.company_id=p_company_id and sa.status<>'CANCELLED' and te.assignment_id is null
      and sa.starts_at::date between p_start_date and p_end_date and sa.ends_at<=now()
      and sa.ends_at>sa.starts_at and sa.ends_at-sa.starts_at<=interval '24 hours'
      and coalesce(sa.break_minutes,0)>=0
      and coalesce(sa.break_minutes,0)<extract(epoch from(sa.ends_at-sa.starts_at))/60
    order by 1
  loop
    if not private.sf_is_manager(p_company_id,true) then
      raise exception 'Der Monat ist abgeschlossen. Nur Inhaber und Administratoren duerfen ihn fuer die Sammeluebernahme oeffnen.';
    end if;
    perform public.manager_reopen_time_month(
      p_company_id,
      v_month,
      'Automatisch fuer die Sammeluebernahme unveraenderter Planzeiten geoeffnet'
    );
    v_reopened_months:=v_reopened_months+1;
  end loop;

  with candidates as (
    select sa.id,sa.company_id,sa.starts_at,sa.ends_at,coalesce(sa.break_minutes,0) as break_minutes
    from public.shift_assignments sa
    left join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
    where sa.company_id=p_company_id and sa.status<>'CANCELLED' and te.assignment_id is null
      and sa.starts_at::date between p_start_date and p_end_date and sa.ends_at<=now()
      and sa.ends_at>sa.starts_at and sa.ends_at-sa.starts_at<=interval '24 hours'
      and coalesce(sa.break_minutes,0)>=0
      and coalesce(sa.break_minutes,0)<extract(epoch from(sa.ends_at-sa.starts_at))/60
  ), inserted as (
    insert into public.time_entries(
      assignment_id,company_id,actual_start,actual_end,break_minutes,status,
      manager_note,source,correction_note,submitted_at,confirmed_by,confirmed_at,
      updated_at,updated_by,version
    )
    select id,company_id,starts_at,ends_at,break_minutes,
      case when p_confirm then 'confirmed' else 'recorded' end,
      left(coalesce(p_note,''),1000),'MANAGER','',
      case when p_confirm then now() else null end,
      case when p_confirm then auth.uid() else null end,
      case when p_confirm then now() else null end,
      now(),auth.uid(),1
    from candidates
    on conflict(assignment_id) do nothing
    returning assignment_id,company_id,actual_start,actual_end,break_minutes,status,version
  ), audited as (
    insert into public.audit_events(
      company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata
    )
    select company_id,
      case when p_confirm then 'TIME_ENTRY_CONFIRMED' else 'TIME_ENTRY_SAVED' end,
      'time_entry',assignment_id,auth.uid(),'MANAGER',
      jsonb_build_object(
        'actualStart',actual_start,'actualEnd',actual_end,'breakMinutes',break_minutes,
        'status',status,'version',version
      ),
      jsonb_build_object('bulk',true,'planEqualsActual',true,'comment',left(coalesce(p_note,''),1000))
    from inserted
    returning 1
  )
  select count(*) into v_updated from audited;

  return jsonb_build_object(
    'total',v_total,
    'updated',v_updated,
    'status',case when p_confirm then 'confirmed' else 'recorded' end,
    'reopenedMonths',v_reopened_months,
    'skippedExisting',v_skipped_existing,
    'skippedFuture',v_skipped_future,
    'skippedClosed',0,
    'skippedUnpublished',0,
    'skippedInvalid',v_skipped_invalid
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.manager_create_company_invite(p_company_id uuid, p_email text, p_role text, p_token_hash text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_email text:=lower(trim(coalesce(p_email,''))); v_role text:=upper(trim(coalesce(p_role,'')));
begin
  if not private.can_manage_company_users(p_company_id) then raise exception 'Nicht berechtigt'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'Ungültige E-Mail-Adresse'; end if;
  if v_role not in ('ADMIN','DISPATCHER','PLANNER','VIEWER','TIME_TRACKING') then raise exception 'Ungültige Rolle'; end if;
  if length(coalesce(p_token_hash,''))<>64 then raise exception 'Ungültiger Einladungsschlüssel'; end if;
  if exists(select 1 from public.company_members cm join auth.users u on u.id=cm.user_id where cm.company_id=p_company_id and lower(u.email)=v_email) then raise exception 'Für diese E-Mail besteht bereits ein Benutzer'; end if;
  insert into public.company_member_invites(company_id,email,role,token_hash,status,expires_at,created_by)
  values(p_company_id,v_email,v_role,p_token_hash,'INVITED',now()+interval '7 days',auth.uid())
  on conflict(company_id,email) do update set role=excluded.role,token_hash=excluded.token_hash,status='INVITED',expires_at=excluded.expires_at,created_by=auth.uid(),created_at=now(),claimed_by=null,claimed_at=null
  returning id into v_id;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.manager_list_time_entries(p_company_id uuid, p_start_date date, p_end_date date)
 RETURNS TABLE(assignment_id uuid, employee_id uuid, employee_name text, personnel_no text, shift_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, planned_break_minutes integer, actual_start timestamp with time zone, actual_end timestamp with time zone, actual_break_minutes integer, entry_status text, employee_note text, manager_note text, correction_note text, submitted_at timestamp with time zone, confirmed_at timestamp with time zone, version integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.sf_can_manage_time(p_company_id) then raise exception 'Nicht berechtigt'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then
    raise exception 'Ungueltiger Zeitraum';
  end if;
  return query
  select sa.id,e.id,trim(concat_ws(' ',e.first_name,e.last_name)),coalesce(e.personnel_no,''),
    sa.shift_code,sa.starts_at,sa.ends_at,coalesce(sa.break_minutes,0),
    te.actual_start,te.actual_end,coalesce(te.break_minutes,sa.break_minutes,0),
    coalesce(te.status,'open'),coalesce(te.employee_note,''),coalesce(te.manager_note,''),
    coalesce(te.correction_note,''),te.submitted_at,te.confirmed_at,coalesce(te.version,0)
  from public.shift_assignments sa
  join public.employees e on e.id=sa.employee_id and e.company_id=sa.company_id
  left join public.time_entries te on te.assignment_id=sa.id and te.company_id=sa.company_id
  where sa.company_id=p_company_id and sa.status<>'CANCELLED'
    and sa.starts_at::date between p_start_date and p_end_date
  order by sa.starts_at,e.last_name,e.first_name;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.manager_qr_independent_report(p_company_id uuid, p_start_date date, p_end_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb; v_timezone text;
begin
  if not private.sf_can_manage_time(p_company_id) then raise exception 'Keine Berechtigung'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date
     or p_end_date-p_start_date>62 then raise exception 'Bitte einen Zeitraum bis 63 Tage wählen'; end if;
  select coalesce(timezone,'Europe/Berlin') into v_timezone from public.companies where id=p_company_id;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at desc),'[]'::jsonb)
  into v_result from (
    select s.id, btrim(e.first_name||' '||e.last_name) employee_name,e.personnel_no,
      s.started_at,s.ended_at,t.name terminal_name,
      coalesce((select jsonb_agg(jsonb_build_object('number',b.ordinal,'started_at',b.started_at,'ended_at',b.ended_at)
        order by b.ordinal) from public.time_qr_independent_breaks b where b.shift_id=s.id),'[]'::jsonb) breaks,
      case when s.ended_at is not null then round(extract(epoch from (s.ended_at-s.started_at))/60)::integer end paid_minutes,
      (select coalesce(round(sum(extract(epoch from (coalesce(b.ended_at,clock_timestamp())-b.started_at)))/60),0)::integer
       from public.time_qr_independent_breaks b where b.shift_id=s.id) pause_minutes
    from public.time_qr_independent_shifts s
    join public.employees e on e.id=s.employee_id
    join public.time_qr_terminals t on t.id=s.terminal_id
    where s.company_id=p_company_id
      and (s.started_at at time zone v_timezone)::date between p_start_date and p_end_date
    order by s.started_at desc
  ) x;
  return v_result;
end;$function$
;

CREATE OR REPLACE FUNCTION public.manager_review_time_entry(p_assignment_id uuid, p_decision text, p_comment text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_company uuid; v_result jsonb;
begin
  select sa.company_id into v_company from public.shift_assignments sa where sa.id=p_assignment_id;
  if v_company is null or not private.sf_can_manage_time(v_company) then raise exception 'Nicht berechtigt'; end if;
  if private.sf_is_time_month_closed(v_company,(select actual_start::date from public.time_entries where assignment_id=p_assignment_id)) then
    raise exception 'Der Monat ist abgeschlossen';
  end if;
  if upper(coalesce(p_decision,'')) not in ('CONFIRM','CORRECTION') then raise exception 'Ungueltige Entscheidung'; end if;
  if upper(p_decision)='CORRECTION' and length(trim(coalesce(p_comment,'')))<3 then
    raise exception 'Bitte einen Korrekturhinweis angeben';
  end if;
  update public.time_entries set
    status=case when upper(p_decision)='CONFIRM' then 'confirmed' else 'correction_requested' end,
    manager_note=case when upper(p_decision)='CONFIRM' then coalesce(p_comment,'') else manager_note end,
    correction_note=case when upper(p_decision)='CORRECTION' then p_comment else '' end,
    confirmed_by=case when upper(p_decision)='CONFIRM' then auth.uid() else null end,
    confirmed_at=case when upper(p_decision)='CONFIRM' then now() else null end,
    correction_requested_by=case when upper(p_decision)='CORRECTION' then auth.uid() else null end,
    correction_requested_at=case when upper(p_decision)='CORRECTION' then now() else null end,
    updated_at=now(),updated_by=auth.uid(),version=version+1
  where assignment_id=p_assignment_id returning to_jsonb(time_entries.*) into v_result;
  if v_result is null then raise exception 'Zeiteintrag nicht gefunden'; end if;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
  values(v_company,case when upper(p_decision)='CONFIRM' then 'TIME_ENTRY_CONFIRMED' else 'TIME_ENTRY_CORRECTION_REQUESTED' end,
    'time_entry',p_assignment_id,auth.uid(),'MANAGER',v_result,jsonb_build_object('comment',coalesce(p_comment,'')));
  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.manager_save_time_entry(p_assignment_id uuid, p_actual_start timestamp with time zone, p_actual_end timestamp with time zone, p_break_minutes integer, p_note text, p_confirm boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_assignment public.shift_assignments%rowtype; v_old jsonb; v_new jsonb;
begin
  select * into v_assignment from public.shift_assignments where id=p_assignment_id for update;
  if not found or not private.sf_can_manage_time(v_assignment.company_id) then raise exception 'Nicht berechtigt'; end if;
  perform private.sf_validate_time_values(p_actual_start,p_actual_end,p_break_minutes);
  if private.sf_is_time_month_closed(v_assignment.company_id,p_actual_start::date) then
    raise exception 'Der Monat ist abgeschlossen';
  end if;
  select to_jsonb(te) into v_old from public.time_entries te where te.assignment_id=p_assignment_id;
  insert into public.time_entries(
    assignment_id,company_id,actual_start,actual_end,break_minutes,status,
    manager_note,source,correction_note,submitted_at,confirmed_by,confirmed_at,updated_at,updated_by,version
  ) values (
    p_assignment_id,v_assignment.company_id,p_actual_start,p_actual_end,p_break_minutes,
    case when p_confirm then 'confirmed' else 'recorded' end,coalesce(p_note,''),'MANAGER','',
    case when p_confirm then coalesce((select submitted_at from public.time_entries where assignment_id=p_assignment_id),now()) else null end,
    case when p_confirm then auth.uid() else null end,case when p_confirm then now() else null end,now(),auth.uid(),1
  ) on conflict(assignment_id) do update set
    actual_start=excluded.actual_start,actual_end=excluded.actual_end,
    break_minutes=excluded.break_minutes,status=excluded.status,
    manager_note=excluded.manager_note,source='MANAGER',correction_note='',
    confirmed_by=excluded.confirmed_by,confirmed_at=excluded.confirmed_at,
    correction_requested_by=null,correction_requested_at=null,updated_at=now(),updated_by=auth.uid(),
    version=public.time_entries.version+1;
  select to_jsonb(te) into v_new from public.time_entries te where te.assignment_id=p_assignment_id;
  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(v_assignment.company_id,case when p_confirm then 'TIME_ENTRY_CONFIRMED' else 'TIME_ENTRY_SAVED' end,
    'time_entry',p_assignment_id,auth.uid(),'MANAGER',v_old,v_new,'{}'::jsonb);
  return v_new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.manager_update_company_member(p_company_id uuid, p_user_id uuid, p_role text, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor_role text; v_target_role text; v_role text:=upper(trim(coalesce(p_role,''))); v_status text:=upper(trim(coalesce(p_status,'')));
begin
  select role into v_actor_role from public.company_members where company_id=p_company_id and user_id=auth.uid() and status='ACTIVE';
  if v_actor_role not in ('OWNER','ADMIN') then raise exception 'Nicht berechtigt'; end if;
  select role into v_target_role from public.company_members where company_id=p_company_id and user_id=p_user_id;
  if v_target_role is null then raise exception 'Benutzer nicht gefunden'; end if;
  if v_target_role='OWNER' then raise exception 'Die Inhaberrolle ist geschützt'; end if;
  if v_role not in ('ADMIN','DISPATCHER','PLANNER','VIEWER','TIME_TRACKING') or v_status not in ('ACTIVE','DISABLED') then raise exception 'Ungültige Rolle oder Status'; end if;
  if p_user_id=auth.uid() and v_status<>'ACTIVE' then raise exception 'Der eigene Zugang kann nicht gesperrt werden'; end if;
  update public.company_members set role=v_role,status=v_status where company_id=p_company_id and user_id=p_user_id;
end $function$
;

CREATE OR REPLACE FUNCTION private.bootstrap_company_impl(p_name text DEFAULT 'SchichtFunk'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company uuid;
  v_user uuid := auth.uid();
  v_name text := left(coalesce(nullif(trim(p_name), ''), 'SchichtFunk'), 160);
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  -- Prevent concurrent first-login requests from creating two companies for
  -- the same account while preserving the original idempotent behaviour.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user::text, 0)
  );

  select cm.company_id
    into v_company
  from public.company_members cm
  where cm.user_id = v_user
    and cm.status = 'ACTIVE'
  order by cm.created_at
  limit 1;

  if v_company is not null then
    return v_company;
  end if;

  if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist deaktiviert'; end if;

  insert into public.companies(name, created_by)
  values (v_name, v_user)
  returning id into v_company;

  insert into public.company_members(company_id, user_id, role, status)
  values (v_company, v_user, 'OWNER', 'ACTIVE');

  insert into public.shift_templates(
    company_id, code, name, default_start, default_end, css_class, sort_order
  ) values
    (v_company, 'O1', 'O1', '07:00', '15:00', 'violet', 1),
    (v_company, 'O2', 'O2', '15:00', '23:00', 'blue', 2),
    (v_company, 'Teamleiter', 'Teamleiter', '08:00', '16:00', 'amber', 3),
    (v_company, 'O3', 'O3', '23:00', '07:00', 'pink', 4),
    (v_company, 'OT1', 'OT1', '10:00', '18:00', 'teal', 5),
    (v_company, 'OT2', 'OT2', '12:00', '20:00', 'cyan', 6),
    (v_company, 'OT', 'OT', '18:00', '02:00', 'violet', 7);

  insert into public.global_staffing_requirements(
    company_id, shift_code, required_count
  ) values
    (v_company, 'O1', 3),
    (v_company, 'O2', 2),
    (v_company, 'Teamleiter', 2),
    (v_company, 'O3', 2),
    (v_company, 'OT1', 1),
    (v_company, 'OT2', 2),
    (v_company, 'OT', 3);

  insert into public.company_compliance_policy(company_id)
  values (v_company);

  insert into public.audit_events(
    company_id,
    event_type,
    entity_type,
    entity_id,
    actor_id,
    actor_role,
    new_values
  ) values (
    v_company,
    'COMPANY_BOOTSTRAPPED',
    'company',
    v_company,
    v_user,
    'OWNER',
    pg_catalog.jsonb_build_object('name', v_name)
  );

  return v_company;
end;
$function$
;
notify pgrst,'reload schema';
