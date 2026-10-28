-- Read-only operational evidence; no absence notes, wish reasons or private qualifications.
create or replace function private.manager_fairness_evidence(company_ uuid,from_ date,to_ date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tz_ text;profiles_ jsonb;wishes_ jsonb;takeovers_ jsonb;
begin
 if auth.uid() is null or not private.sf_is_manager(company_,false) then raise exception 'Keine Auswertungsrechte.' using errcode='42501';end if;
 if from_ is null or to_ is null or to_<from_ or to_-from_>30 or date_trunc('month',from_)<>date_trunc('month',to_) then raise exception 'Ungültiger Monatsabschnitt.' using errcode='22023';end if;
 select coalesce(timezone,'Europe/Berlin') into strict tz_ from public.companies where id=company_;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'role',e.role,'employment',e.employment,'weekly_hours',e.weekly_hours,
  'eligible_dates',(select coalesce(jsonb_agg(d.day::date),'[]') from generate_series(from_,to_,interval '1 day') d(day)
    where (e.start_date is null or d.day::date>=e.start_date) and (e.contract_end is null or d.day::date<=e.contract_end)
    and not(coalesce(private.sf_month_rhythm(e,d.day::date)->>'mode','off')='required' and private.sf_month_rhythm(e,d.day::date)->>'expected'='FREI')))),'[]') into profiles_
 from public.employees e where e.company_id=company_ and e.deleted_at is null;
 select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'employee_id',w.employee_id,'kind',w.kind,'status',w.status,'start_date',w.start_date,'end_date',w.end_date,'shift_code',w.shift_code,'updated_at',w.updated_at)),'[]') into wishes_
 from public.planning_wishes w where w.company_id=company_ and w.start_date<=to_ and w.end_date>=from_;
 select coalesce(jsonb_agg(x),'[]') into takeovers_ from (
  select o.employee_id,a.id as assignment_id,o.responded_at as confirmed_at,'Ersatzanfrage' as source
   from public.disruption_offers o join public.disruption_incidents i on i.id=o.incident_id and i.company_id=company_
   join public.shift_assignments a on a.id=i.assignment_id and a.employee_id=o.employee_id and a.company_id=company_
   where o.company_id=company_ and o.status='ACCEPTED' and i.status='RESOLVED' and (a.starts_at at time zone tz_)::date between from_ and to_
  union all
  select r.replacement_employee_id,a.id,r.created_at,'Dokumentierte Ersatzübernahme'
   from private.disruption_replacements r join public.shift_change_requests c on c.id=r.change_id and c.status='APPLIED'
   join public.shift_assignments a on a.id=coalesce(r.replacement_assignment_id,(r.source_snapshot->>'id')::uuid) and a.employee_id=r.replacement_employee_id and a.company_id=company_
   where r.company_id=company_ and (a.starts_at at time zone tz_)::date between from_ and to_
  union all
  select s.target_employee_id,a.id,s.colleague_decided_at,'Schicht-Marktplatz'
   from public.shift_swap_requests s join public.shift_change_requests c on c.id=s.change_request_id and c.status='APPLIED'
   join public.shift_assignments a on a.id=s.assignment_id and a.employee_id=s.target_employee_id and a.company_id=company_
   where s.company_id=company_ and s.status='APPLIED' and (a.starts_at at time zone tz_)::date between from_ and to_
 ) x;
 return jsonb_build_object('profiles',profiles_,'wishes',wishes_,'takeovers',takeovers_, 'published_dates',(select coalesce(jsonb_agg(d.day::date),'[]') from generate_series(from_,to_,interval '1 day') d(day) where exists(select 1 from public.plan_publications p where p.company_id=company_ and p.week_start<=d.day::date and p.week_start+6>=d.day::date and p.published_at is not null))); 
end $$;
revoke all on function private.manager_fairness_evidence(uuid,date,date) from public,anon;
grant execute on function private.manager_fairness_evidence(uuid,date,date) to authenticated;
create or replace function public.manager_reports_workspace(p_company_id uuid,p_start_date date,p_end_date date)
returns jsonb language sql stable security invoker set search_path='' as $$
 select private.manager_reports_workspace(p_company_id,p_start_date,p_end_date)||jsonb_build_object('fairness',private.manager_fairness_evidence(p_company_id,p_start_date,p_end_date));
$$;
notify pgrst,'reload schema';
