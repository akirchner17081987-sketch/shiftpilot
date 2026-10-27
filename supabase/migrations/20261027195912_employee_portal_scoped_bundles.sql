-- Personal portal reads stay employee-bound for dual-role logins. Manager RPCs remain unchanged.
create function private.employee_planning_wish_bundle(p_company_id uuid,p_month date) returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='15s' as $$
declare manager_ boolean; employee_ uuid; zone_ text; from_ date; until_ date;
begin
 if auth.uid() is null or private.sf_has_time_only_login() then raise exception 'Kein Zugang zur Wunschplanung.' using errcode='42501'; end if;
 manager_:=false;
 employee_:=private.sf_handover_employee(p_company_id);
 if not manager_ and employee_ is null then raise exception 'Keine Berechtigung für dieses Unternehmen.' using errcode='42501'; end if;
 if p_month is null or extract(day from p_month)<>1 or p_month<'2020-01-01' or p_month>current_date+interval '2 years' then raise exception 'Bitte einen gültigen Monat auswählen.'; end if;
 select coalesce(timezone,'Europe/Berlin') into zone_ from public.companies where id=p_company_id;
 from_:=(p_month-interval '2 months')::date;until_:=(p_month+interval '1 month')::date;
 return jsonb_build_object('company_id',p_company_id,'employee_id',employee_,'manager',manager_,'timezone',zone_,'as_of',now(),'month',p_month,'fairness_from',from_,'fairness_to',until_-1,
 'employees',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'legacy_id',e.legacy_id,'first',e.first_name,'last',e.last_name,'shifts',e.shift_permissions,'weeklyHours',e.weekly_hours) order by e.last_name,e.first_name,e.id) from public.employees e where e.company_id=p_company_id and e.status='active' and e.deleted_at is null and (manager_ or e.id=employee_)),'[]'),
 'templates',coalesce((select jsonb_agg(jsonb_build_object('code',t.code,'name',t.name,'start',t.default_start,'end',t.default_end) order by t.sort_order,t.code) from public.shift_templates t where t.company_id=p_company_id and t.active),'[]'),
 'wishes',coalesce((select jsonb_agg(to_jsonb(w)||jsonb_build_object('conflicts',(select count(*) from public.shift_assignments a where a.company_id=w.company_id and a.employee_id=w.employee_id and a.status<>'CANCELLED' and a.starts_at<w.ends_at and a.ends_at>w.starts_at),'events',coalesce((select jsonb_agg(jsonb_build_object('action',h.action,'from_status',h.from_status,'to_status',h.to_status,'reason',h.reason,'created_at',h.created_at) order by h.created_at,h.id) from public.planning_wish_events h where h.wish_id=w.id),'[]')) order by w.start_date,w.created_at,w.id)
 from public.planning_wishes w where w.company_id=p_company_id and w.start_date<until_ and w.end_date>=from_ and (manager_ or w.employee_id=employee_)),'[]'),
 'duties',coalesce((select jsonb_agg(jsonb_build_object('employeeId',a.employee_id,'type',a.shift_code,'starts_at',a.starts_at,'ends_at',a.ends_at) order by a.starts_at,a.id) from public.shift_assignments a where a.company_id=p_company_id and a.status='PUBLISHED' and a.published_at is not null and a.starts_at<until_::timestamp at time zone zone_ and a.ends_at>from_::timestamp at time zone zone_ and (manager_ or a.employee_id=employee_)),'[]'));
end $$;
revoke all on function private.employee_planning_wish_bundle(uuid,date) from public,anon;
grant execute on function private.employee_planning_wish_bundle(uuid,date) to authenticated;
create function public.employee_planning_wish_bundle(p_company_id uuid,p_month date) returns jsonb language sql stable security invoker set search_path='' as $$ select private.employee_planning_wish_bundle(p_company_id,p_month); $$;
revoke all on function public.employee_planning_wish_bundle(uuid,date) from public,anon;
grant execute on function public.employee_planning_wish_bundle(uuid,date) to authenticated;

create or replace function private.employee_shift_handover_bundle(p_company_id uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare manager_ boolean; employee_ uuid; tz text; boards_ jsonb; shifts_ jsonb;
begin
 manager_:=false;employee_:=private.sf_handover_employee(p_company_id);
 if auth.uid() is null or private.sf_has_time_only_login() or (not manager_ and employee_ is null) then
 raise exception 'Keine Übergaberechte.' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>31 then raise exception 'Bitte höchstens 32 Tage auswählen.'; end if;
 select timezone into strict tz from public.companies where id=p_company_id;
 select coalesce(jsonb_agg(x order by x->>'start',x->>'shift'),'[]') into shifts_ from (
 select jsonb_build_object('assignment_id',min(a.id::text),'shift',a.shift_code,'start',a.starts_at,'end',a.ends_at,
 'site_id',s.site_id,'site',coalesce(l.name,'Ohne Standort'),'people',count(*)) x
 from public.shift_assignments a join public.shift_templates s on s.company_id=a.company_id and s.code=a.shift_code
 left join public.company_locations l on l.id=s.site_id and l.company_id=p_company_id
 where a.company_id=p_company_id and a.status='PUBLISHED' and a.published_at is not null
 and a.ends_at>p_from::timestamp at time zone tz and a.starts_at<(p_to+1)::timestamp at time zone tz
 and (manager_ or a.employee_id=employee_) group by a.shift_code,a.starts_at,a.ends_at,s.site_id,l.name) grouped;
 select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object(
 'site',coalesce((select name from public.company_locations where id=b.site_id),'Ohne Standort'),
 'crew_ids',coalesce((select jsonb_agg(a.employee_id) from public.shift_assignments a join public.shift_templates t on t.company_id=a.company_id and t.code=a.shift_code where a.company_id=b.company_id and a.shift_code=b.shift_code and a.starts_at=b.starts_at and a.ends_at=b.ends_at and a.status='PUBLISHED' and a.published_at is not null and t.site_id is not distinct from b.site_id),'[]'),
 'next_shift',(select jsonb_build_object('assignment_id',x.id,'shift',x.shift_code,'start',x.starts_at,'end',x.ends_at) from public.shift_assignments x join public.shift_templates t on t.company_id=x.company_id and t.code=x.shift_code where x.company_id=b.company_id and x.status='PUBLISHED' and x.published_at is not null and x.starts_at>=b.ends_at and x.starts_at<=b.ends_at+interval '7 days' and t.site_id is not distinct from b.site_id and (b.site_id is not null or x.shift_code=b.shift_code) order by x.starts_at,x.shift_code,x.ends_at,x.id limit 1),
 'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.critical desc,i.due_at,i.created_at) from public.shift_handover_items i where i.board_id=b.id),'[]'),
 'incoming',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'shift',o.shift_code,'start',o.starts_at,'sent_at',o.sent_at,'received_at',o.received_at,'revision',o.revision)) from public.shift_handovers o where o.target_id=b.id),'[]'),
 'reports',case when manager_ and private.sf_can_manage_time(p_company_id) then coalesce((select jsonb_agg(to_jsonb(r) order by r.version desc) from public.shift_handover_reports r where r.board_id=b.id),'[]') else '[]'::jsonb end,
 'events',coalesce((select jsonb_agg(jsonb_build_object('action',ev.action,'detail',ev.detail,'created_at',ev.created_at) order by ev.created_at desc) from public.shift_handover_events ev where ev.board_id=b.id),'[]')
 ) order by b.starts_at desc),'[]') into boards_ from public.shift_handovers b
 where b.company_id=p_company_id and b.ends_at>p_from::timestamp at time zone tz
 and b.starts_at<(p_to+1)::timestamp at time zone tz and exists(select 1 from public.shift_assignments own_a
 join public.shift_templates own_t on own_t.company_id=own_a.company_id and own_t.code=own_a.shift_code
 where own_a.company_id=b.company_id and own_a.employee_id=employee_
 and own_a.status='PUBLISHED' and own_a.published_at is not null and own_a.shift_code=b.shift_code
 and own_a.starts_at=b.starts_at and own_a.ends_at=b.ends_at and own_t.site_id is not distinct from b.site_id);
 return jsonb_build_object('company_id',p_company_id,'manager',manager_,'can_report',manager_ and private.sf_can_manage_time(p_company_id),'timezone',tz,'as_of',now(),'shifts',shifts_,'boards',boards_,
 'employees',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'first',e.first_name,'last',e.last_name) order by e.last_name,e.first_name)
 from public.employees e where e.company_id=p_company_id and e.deleted_at is null and exists(
 select 1 from public.shift_assignments a join public.shift_templates t on t.company_id=a.company_id and t.code=a.shift_code
 join public.shift_handovers b on b.company_id=a.company_id and b.shift_code=a.shift_code and b.starts_at=a.starts_at and b.ends_at=a.ends_at and b.site_id is not distinct from t.site_id
 where a.employee_id=e.id and a.status='PUBLISHED' and a.published_at is not null and exists(select 1 from public.shift_assignments own_a
 join public.shift_templates own_t on own_t.company_id=own_a.company_id and own_t.code=own_a.shift_code
 where own_a.company_id=b.company_id and own_a.employee_id=employee_
 and own_a.status='PUBLISHED' and own_a.published_at is not null and own_a.shift_code=b.shift_code
 and own_a.starts_at=b.starts_at and own_a.ends_at=b.ends_at and own_t.site_id is not distinct from b.site_id)
 and b.ends_at>p_from::timestamp at time zone tz and b.starts_at<(p_to+1)::timestamp at time zone tz)),'[]'));
end $$;

revoke all on function private.employee_shift_handover_bundle(uuid,date,date) from public,anon;
grant execute on function private.employee_shift_handover_bundle(uuid,date,date) to authenticated;
create or replace function public.employee_shift_handover_bundle(p_company_id uuid,p_from date,p_to date) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.employee_shift_handover_bundle(p_company_id,p_from,p_to); $$;
revoke all on function public.employee_shift_handover_bundle(uuid,date,date) from public,anon;
grant execute on function public.employee_shift_handover_bundle(uuid,date,date) to authenticated;

notify pgrst,'reload schema';
