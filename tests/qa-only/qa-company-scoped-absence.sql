-- QA ONLY: preserve the existing absence rules with explicit company identity.
create function private.qa_submit_absence_scoped(p_company uuid,p_absence_type text,p_start_date date,p_end_date date,p_note text default '',p_full_day boolean default true,p_start_time time default null,p_end_time time default null,p_time_note text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); emp uuid:=private.qa_employee_identity(p_company); result uuid; typ text:=btrim(coalesce(p_absence_type,''));
begin
 if typ not in ('Urlaub','Krank','Frei','Fortbildung','Sperrzeit','Sonderurlaub','Sonstiges') then raise exception 'Ungültige Abwesenheitsart'; end if;
 if p_start_date is null or p_end_date is null or p_end_date<p_start_date then raise exception 'Bitte einen gültigen Zeitraum wählen'; end if;
 if p_end_date-p_start_date>366 then raise exception 'Der Zeitraum ist zu lang'; end if;
 if not coalesce(p_full_day,true) and (p_start_time is null or p_end_time is null) then raise exception 'Bei einer Teilabwesenheit müssen Beginn und Ende angegeben werden'; end if;
 perform pg_advisory_xact_lock(hashtextextended('absence-request:'||emp::text,0));
 if exists(select 1 from public.absences a where a.employee_id=emp and a.company_id=p_company and a.status in ('Beantragt','Genehmigt','Erfasst') and daterange(a.start_date,a.end_date,'[]') && daterange(p_start_date,p_end_date,'[]')) then raise exception 'Für diesen Zeitraum besteht bereits eine Abwesenheit oder ein offener Antrag'; end if;
 insert into public.absences(company_id,employee_id,legacy_id,start_date,end_date,absence_type,status,full_day,start_time,end_time,time_note,note,request_source,requested_by,requested_at)
 values(p_company,emp,null,p_start_date,p_end_date,typ,'Beantragt',coalesce(p_full_day,true),case when coalesce(p_full_day,true) then null else p_start_time end,case when coalesce(p_full_day,true) then null else p_end_time end,coalesce(p_time_note,''),left(coalesce(p_note,''),2000),'EMPLOYEE',uid,now()) returning id into result;
 insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
 values(p_company,'ABSENCE_REQUEST_CREATED','absence',result,uid,'EMPLOYEE',jsonb_build_object('status','Beantragt','type',typ,'startDate',p_start_date,'endDate',p_end_date),jsonb_build_object('source','EMPLOYEE_PORTAL'));
 return result;
end $$;
revoke all on function private.qa_submit_absence_scoped(uuid,text,date,date,text,boolean,time,time,text) from public,anon;
grant execute on function private.qa_submit_absence_scoped(uuid,text,date,date,text,boolean,time,time,text) to authenticated;
create function public.qa_submit_absence_scoped(p_company uuid,p_absence_type text,p_start_date date,p_end_date date,p_note text default '',p_full_day boolean default true,p_start_time time default null,p_end_time time default null,p_time_note text default '')
returns uuid language sql set search_path='' as $$
 select private.qa_submit_absence_scoped(p_company,p_absence_type,p_start_date,p_end_date,p_note,p_full_day,p_start_time,p_end_time,p_time_note)
$$;
revoke all on function public.qa_submit_absence_scoped(uuid,text,date,date,text,boolean,time,time,text) from public,anon;
grant execute on function public.qa_submit_absence_scoped(uuid,text,date,date,text,boolean,time,time,text) to authenticated;

