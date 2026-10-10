-- Operational read-only snapshot. Tenant/permission checks precede every data read.
-- Private definer avoids per-row RLS overhead; the public API is security invoker.
create or replace function private.manager_today_workspace(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare zone_ text; day_ date; start_ timestamptz; end_ timestamptz; can_time_ boolean;
 times_ jsonb:='[]'; qr_ jsonb:='[]';
begin
 if auth.uid() is null or not private.sf_is_manager(p_company_id,false) then
  raise exception 'Für dieses Unternehmen fehlen Planungsrechte.' using errcode='42501';
 end if;
 select timezone into strict zone_ from public.companies where id=p_company_id;
 day_:=(now() at time zone zone_)::date;
 start_:=day_::timestamp at time zone zone_;
 end_:=(day_+2)::timestamp at time zone zone_;
 can_time_:=private.sf_can_manage_time(p_company_id);
 if can_time_ then
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'employee_id',a.employee_id,
   'start',t.actual_start,'end',t.actual_end,'status',t.status,'shift',a.shift_code,'site_id',m.site_id,
   'break_minutes',t.break_minutes,'breaks',coalesce((select jsonb_agg(jsonb_build_object('start',b.started_at,'end',b.ended_at) order by b.started_at)
    from public.time_qr_breaks b where b.company_id=p_company_id and b.assignment_id=a.id),'[]'))),'[]') into times_
  from public.time_entries t join public.shift_assignments a on a.id=t.assignment_id and a.company_id=p_company_id
   join public.employees e on e.id=a.employee_id and e.company_id=p_company_id and e.deleted_at is null
   left join public.shift_templates m on m.company_id=p_company_id and m.code=a.shift_code
  where t.company_id=p_company_id and a.status<>'CANCELLED' and t.actual_start is not null
   and t.actual_start<end_ and (t.actual_end>start_ or t.actual_end is null);
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'employee_id',q.employee_id,
   'start',q.started_at,'end',q.ended_at,'site_id',t.site_id,'terminal',t.name,'shift',null,
   'breaks',coalesce((select jsonb_agg(jsonb_build_object('start',b.started_at,'end',b.ended_at) order by b.ordinal)
    from public.time_qr_independent_breaks b where b.shift_id=q.id),'[]'))),'[]') into qr_
  from public.time_qr_independent_shifts q
   join public.employees e on e.id=q.employee_id and e.company_id=p_company_id and e.deleted_at is null
   left join public.time_qr_terminals t on t.id=q.terminal_id and t.company_id=p_company_id
  where q.company_id=p_company_id and q.started_at<end_ and (q.ended_at>start_ or q.ended_at is null);
 end if;
 return jsonb_build_object('company_id',p_company_id,'timezone',zone_,'today',day_,'as_of',now(),'can_time',can_time_,
  'company_name',(select name from public.companies where id=p_company_id),'times',times_,'qr',qr_,
  'employees',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'legacy_id',e.legacy_id,'first',e.first_name,'last',e.last_name,'personnel_no',e.personnel_no,'status',e.status)
   order by e.last_name,e.first_name,e.id) from public.employees e where e.company_id=p_company_id and e.deleted_at is null),'[]'),
  'models',coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order,t.code) from public.shift_templates t where t.company_id=p_company_id),'[]'),
  'sites',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'code',s.code,'name',s.name,'is_active',s.is_active) order by s.name) from public.company_locations s where s.company_id=p_company_id),'[]'),
  'global',coalesce((select jsonb_object_agg(shift_code,required_count) from public.global_staffing_requirements where company_id=p_company_id),'{}'),
  'daily',coalesce((select jsonb_agg(jsonb_build_object('date',work_date,'shift',shift_code,'required',required_count)) from public.daily_staffing_overrides where company_id=p_company_id and work_date between day_-1 and day_+1),'[]'),
  'rules',coalesce((select solid_planning_rules from public.company_compliance_policy where company_id=p_company_id),'{}'),
  'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'legacy_id',a.legacy_id,'employee_id',a.employee_id,'shift',a.shift_code,'start',a.starts_at,'end',a.ends_at,
   'date',(a.starts_at at time zone zone_)::date,'status',a.status,'site_id',t.site_id,'break_minutes',a.break_minutes))
   from public.shift_assignments a join public.employees e on e.id=a.employee_id and e.company_id=p_company_id and e.deleted_at is null
    left join public.shift_templates t on t.company_id=p_company_id and t.code=a.shift_code
   where a.company_id=p_company_id and a.status<>'CANCELLED' and a.starts_at<end_
    and (a.ends_at>start_-interval '1 day' or (can_time_ and exists(select 1 from public.time_entries te where te.company_id=p_company_id and te.assignment_id=a.id and te.actual_start is not null and te.actual_end is null)))),'[]'),
  'absences',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'employee_id',a.employee_id,'from',a.start_date,'to',a.end_date,'type',a.absence_type,'status',a.status,'full_day',a.full_day,'start_time',a.start_time,'end_time',a.end_time))
   from public.absences a where a.company_id=p_company_id and a.start_date<=day_+1 and a.end_date>=day_-1 and a.status in ('Genehmigt','Erfasst','APPROVED')),'[]'),
  'incidents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'assignment_id',a.id,'employee_id',d.original_employee_id,'status',d.status,'shift',a.shift_code,'start',a.starts_at,'end',a.ends_at,'site_id',t.site_id,
   'pending_count',(select count(*) from public.disruption_offers o where o.company_id=p_company_id and o.incident_id=d.id and o.status='OFFERED' and o.expires_at>now())))
   from public.disruption_incidents d join public.shift_assignments a on a.id=d.assignment_id and a.company_id=p_company_id
    left join public.shift_templates t on t.company_id=p_company_id and t.code=a.shift_code
   where d.company_id=p_company_id and d.status='OPEN'),'[]'));
end $$;
revoke all on function private.manager_today_workspace(uuid) from public,anon;
grant execute on function private.manager_today_workspace(uuid) to authenticated;
create or replace function public.manager_today_workspace(p_company_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select private.manager_today_workspace(p_company_id);
$$;
revoke all on function public.manager_today_workspace(uuid) from public,anon;
grant execute on function public.manager_today_workspace(uuid) to authenticated;
-- Keep every active incident reachable; only historical rows are bounded.
create or replace function private.manager_list_disruptions_impl(p_company_id uuid)
returns table(id uuid,status text,assignment_id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz,original_employee_id uuid,original_employee text,incident_type text,note text,created_at timestamptz,offer_count bigint,pending_count bigint,accepted_employee text)
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid();
begin
  if not exists(select 1 from public.company_members cm where cm.company_id=p_company_id and cm.user_id=v_uid and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER')) then raise exception 'Keine Berechtigung'; end if;
  return query select d.id,d.status,d.assignment_id,a.shift_code,a.starts_at,a.ends_at,d.original_employee_id,trim(o.first_name||' '||o.last_name),d.incident_type,d.note,d.created_at,
    count(x.id),count(x.id) filter(where x.status='OFFERED' and x.expires_at>now()),max(trim(e.first_name||' '||e.last_name)) filter(where x.status='ACCEPTED')
  from public.disruption_incidents d join public.shift_assignments a on a.id=d.assignment_id join public.employees o on o.id=d.original_employee_id
  left join public.disruption_offers x on x.incident_id=d.id left join public.employees e on e.id=x.employee_id
  where d.company_id=p_company_id and a.company_id=p_company_id and o.company_id=p_company_id and o.deleted_at is null
    and (d.status='OPEN' or d.id in (select h.id from public.disruption_incidents h where h.company_id=p_company_id and h.status<>'OPEN' order by h.created_at desc limit 100))
  group by d.id,a.id,o.id order by case when d.status='OPEN' then 0 else 1 end,d.created_at desc;
end $$;

notify pgrst,'reload schema';
