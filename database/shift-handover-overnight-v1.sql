-- Include currently running overnight duties; date filters use actual interval overlap.
create or replace function private.shift_handover_bundle(p_company_id uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare manager_ boolean; employee_ uuid; tz text; boards_ jsonb; shifts_ jsonb;
begin
 manager_:=private.sf_is_manager(p_company_id,false);employee_:=private.sf_handover_employee(p_company_id);
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
 and b.starts_at<(p_to+1)::timestamp at time zone tz and private.sf_handover_access(b.id);
 return jsonb_build_object('company_id',p_company_id,'manager',manager_,'can_report',manager_ and private.sf_can_manage_time(p_company_id),'timezone',tz,'as_of',now(),'shifts',shifts_,'boards',boards_,
 'employees',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'first',e.first_name,'last',e.last_name) order by e.last_name,e.first_name)
 from public.employees e where e.company_id=p_company_id and e.deleted_at is null and exists(
 select 1 from public.shift_assignments a join public.shift_templates t on t.company_id=a.company_id and t.code=a.shift_code
 join public.shift_handovers b on b.company_id=a.company_id and b.shift_code=a.shift_code and b.starts_at=a.starts_at and b.ends_at=a.ends_at and b.site_id is not distinct from t.site_id
 where a.employee_id=e.id and a.status='PUBLISHED' and a.published_at is not null and private.sf_handover_access(b.id)
 and b.ends_at>p_from::timestamp at time zone tz and b.starts_at<(p_to+1)::timestamp at time zone tz)),'[]'));
end $$;

notify pgrst,'reload schema';
