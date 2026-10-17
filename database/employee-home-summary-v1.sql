-- Read-only employee home: one authenticated identity, explicitly scoped company.
create or replace function private.employee_home_summary_impl(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 v_uid uuid:=auth.uid(); v_employee public.employees%rowtype;
 v_now timestamptz:=statement_timestamp(); v_timezone text; v_next jsonb; v_qr jsonb;
 v_changes integer; v_replacements integer; v_feedback integer;
begin
 if v_uid is null or p_company_id is null then
  raise exception 'Bitte mit einem Mitarbeiterzugang anmelden' using errcode='42501';
 end if;
 if private.sf_has_time_only_login() then
  raise exception 'Dieser Zugang ist nur für die Zeiterfassung' using errcode='42501';
 end if;
 select e.* into v_employee from public.employees e
 where e.auth_user_id=v_uid and e.company_id=p_company_id
  and e.status='active' and e.access_status='ACTIVE'
  and not exists(select 1 from public.company_members m where m.company_id=e.company_id
   and m.user_id=v_uid and m.status<>'ACTIVE')
 order by e.id limit 1;
 if not found then raise exception 'Kein aktiver Mitarbeiterzugang für dieses Unternehmen' using errcode='42501'; end if;
 select coalesce(c.timezone,'Europe/Berlin') into v_timezone from public.companies c where c.id=p_company_id;
 select jsonb_build_object('id',a.id,'shift_code',a.shift_code,'name',coalesce(t.name,a.shift_code),
  'starts_at',a.starts_at,'ends_at',a.ends_at,'break_minutes',a.break_minutes,
  'site_name',nullif(l.name,''),'site_address',coalesce(l.address,'')) into v_next
 from public.shift_assignments a
 left join public.shift_templates t on t.company_id=a.company_id and t.code=a.shift_code
 left join public.company_locations l on l.id=t.site_id and l.company_id=a.company_id
 where a.company_id=p_company_id and a.employee_id=v_employee.id
  and a.status='PUBLISHED' and a.published_at is not null and a.ends_at>v_now
 order by a.starts_at,a.id limit 1;
 -- Deliberately no month boundary: a night shift can start in the previous month.
 select jsonb_build_object('id',s.id,'started_at',s.started_at,'terminal_name',t.name,
  'location_note',coalesce(t.location_note,''),
  'state',case when exists(select 1 from public.time_qr_independent_breaks b where b.shift_id=s.id and b.ended_at is null) then 'BREAK' else 'RUNNING' end,
  'attendance_seconds',greatest(0,extract(epoch from(v_now-s.started_at))),
  'pause_seconds',coalesce((select sum(greatest(0,extract(epoch from(coalesce(b.ended_at,v_now)-b.started_at)))) from public.time_qr_independent_breaks b where b.shift_id=s.id),0)) into v_qr
 from public.time_qr_independent_shifts s
 join public.time_qr_terminals t on t.id=s.terminal_id and t.company_id=s.company_id
 where s.company_id=p_company_id and s.employee_id=v_employee.id and s.ended_at is null
 order by s.started_at desc,s.id limit 1;
 select count(*)::integer into v_changes from public.shift_change_requests r
 where r.company_id=p_company_id and r.employee_id=v_employee.id and r.requires_employee_approval
  and r.status not in ('APPLIED','REJECTED','CANCELLED','SUPERSEDED','BLOCKED')
  and not exists(select 1 from public.shift_change_approvals a where a.change_request_id=r.id
   and a.approval_type='EMPLOYEE' and a.status<>'PENDING');
 select count(*)::integer into v_replacements from public.disruption_offers o
 join public.disruption_incidents i on i.id=o.incident_id and i.company_id=o.company_id
 join public.shift_assignments a on a.id=i.assignment_id and a.company_id=o.company_id
 where o.company_id=p_company_id and o.employee_id=v_employee.id and o.status='OFFERED'
  and o.expires_at>v_now and i.status='OPEN' and a.ends_at>v_now;
 select count(*)::integer into v_feedback from public.notifications n
 where n.company_id=p_company_id and n.user_id=v_uid and n.employee_id=v_employee.id and not n.is_read
  and n.kind in ('ABSENCE_DECISION','ABSENCE_REQUEST_APPROVED','ABSENCE_REQUEST_REJECTED','PROFILE_DECISION');
 return jsonb_build_object('employee_id',v_employee.id,'company_id',p_company_id,'as_of',v_now,
  'timezone',coalesce(v_timezone,'Europe/Berlin'),'next_shift',v_next,'qr',v_qr,
  'tasks',jsonb_build_object('changes',v_changes,'replacements',v_replacements,'feedback',v_feedback));
end;$$;
revoke all on function private.employee_home_summary_impl(uuid) from public,anon;
grant execute on function private.employee_home_summary_impl(uuid) to authenticated;
create or replace function public.employee_home_summary(p_company_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select private.employee_home_summary_impl(p_company_id);
$$;
revoke all on function public.employee_home_summary(uuid) from public,anon;
grant execute on function public.employee_home_summary(uuid) to authenticated;
comment on function public.employee_home_summary(uuid) is 'Read-only own published shift, QR status and actionable counts for the selected employee company.';
