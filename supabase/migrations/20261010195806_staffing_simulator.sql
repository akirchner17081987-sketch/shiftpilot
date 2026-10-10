-- Isolated strategic planning: no production assignment or employee writes.
create table public.staffing_simulations (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 80),
 config jsonb not null check(jsonb_typeof(config)='object' and octet_length(config::text)<=32768),
 revision integer not null default 1,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null
);
create index staffing_simulations_company_updated_idx on public.staffing_simulations(company_id,updated_at desc);
create index staffing_simulations_updated_by_idx on public.staffing_simulations(updated_by);
alter table public.staffing_simulations enable row level security;
revoke all on public.staffing_simulations from anon,authenticated;
grant select on public.staffing_simulations to authenticated;
create policy staffing_simulations_admin_read on public.staffing_simulations for select to authenticated
 using (private.sf_is_manager(company_id,true));

create function private.manage_staffing_simulation(p_company_id uuid,p_action text,p_id uuid,p_revision integer,p_name text,p_config jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare row_ public.staffing_simulations;
begin
 if auth.uid() is null or not private.sf_is_manager(p_company_id,true) then raise exception 'Nur Inhaber und Administratoren können Personalszenarien verwalten.' using errcode='42501'; end if;
 if p_action='delete' then
  delete from public.staffing_simulations where id=p_id and company_id=p_company_id and revision=p_revision returning * into row_;
 elsif p_action='save' then
  if p_config->>'version' is distinct from '1' or jsonb_typeof(p_config->'scenarios') is distinct from 'array' or jsonb_array_length(p_config->'scenarios') not between 1 and 4 then raise exception 'Ungültige Szenarien.'; end if;
  if p_id is null then
   perform pg_advisory_xact_lock(hashtextextended(p_company_id::text,194));
   if (select count(*) from public.staffing_simulations where company_id=p_company_id)>=50 then raise exception 'Maximal 50 Vergleiche. Bitte zuerst einen alten Vergleich löschen.'; end if;
   insert into public.staffing_simulations(company_id,name,config,updated_by) values(p_company_id,btrim(p_name),p_config,auth.uid()) returning * into row_;
  else
   update public.staffing_simulations set name=btrim(p_name),config=p_config,revision=revision+1,updated_at=now(),updated_by=auth.uid()
    where id=p_id and company_id=p_company_id and revision=p_revision returning * into row_;
  end if;
 else raise exception 'Ungültige Aktion.'; end if;
 if row_.id is null then raise exception 'Der Vergleich wurde inzwischen geändert oder ist nicht mehr verfügbar. Bitte die Liste neu laden.' using errcode='40001'; end if;
 return to_jsonb(row_);
end $$;
revoke all on function private.manage_staffing_simulation(uuid,text,uuid,integer,text,jsonb) from public,anon;
grant execute on function private.manage_staffing_simulation(uuid,text,uuid,integer,text,jsonb) to authenticated;
create function public.manage_staffing_simulation(p_company_id uuid,p_action text,p_id uuid default null,p_revision integer default null,p_name text default null,p_config jsonb default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.manage_staffing_simulation(p_company_id,p_action,p_id,p_revision,p_name,p_config); $$;
revoke all on function public.manage_staffing_simulation(uuid,text,uuid,integer,text,jsonb) from public,anon;
grant execute on function public.manage_staffing_simulation(uuid,text,uuid,integer,text,jsonb) to authenticated;

create function private.staffing_simulator_snapshot(p_company_id uuid,p_first_month date,p_month_count integer)
returns jsonb language plpgsql stable security definer set search_path='' set statement_timeout='30s' as $$
declare zone_ text; finish_ date; data_ jsonb;
begin
 if auth.uid() is null or not private.sf_is_manager(p_company_id,true) then raise exception 'Nur Inhaber und Administratoren können Personalszenarien prüfen.' using errcode='42501'; end if;
 if p_first_month is null or extract(day from p_first_month)<>1 or p_month_count is null or p_month_count not in (3,6,12)
 or p_first_month<'2020-01-01' or p_first_month>current_date+interval '5 years' then raise exception 'Bitte einen Startmonat und 3, 6 oder 12 Monate wählen.'; end if;
 select coalesce(timezone,'Europe/Berlin') into strict zone_ from public.companies where id=p_company_id;
 finish_:=(p_first_month+make_interval(months=>p_month_count))::date;
 data_:=jsonb_build_object('company_id',p_company_id,'company_name',(select name from public.companies where id=p_company_id),'timezone',zone_,'from',p_first_month,'to',finish_-1,
 'rules',coalesce((select solid_planning_rules from public.company_compliance_policy where company_id=p_company_id),'{}'),
 'employees',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'first',e.first_name,'last',e.last_name,'personnelNo',e.personnel_no,'role',e.role,'employment',e.employment,'weeklyHours',e.weekly_hours,
  'startDate',e.start_date,'contractEnd',e.contract_end,'status',e.status,'shifts',e.shift_permissions,
  'qualifications',coalesce((select jsonb_agg(q) from unnest(e.qualifications) q where q like '__sp:%'),'[]'),
  'rhythms',coalesce((select jsonb_object_agg(d::date::text,r) from generate_series(p_first_month::timestamp,(finish_-1)::timestamp,interval '1 day') d cross join lateral (select private.sf_month_rhythm(e,d::date) r) x where r->>'mode'='required'),'{}')) order by e.last_name,e.first_name,e.id)
 from public.employees e where e.company_id=p_company_id and e.deleted_at is null and e.status='active'),'[]'),
 'models',coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order,t.code) from public.shift_templates t where t.company_id=p_company_id),'[]'),
 'global',coalesce((select jsonb_object_agg(shift_code,required_count) from public.global_staffing_requirements where company_id=p_company_id),'{}'),
 'daily',coalesce((select jsonb_agg(jsonb_build_object('date',work_date,'shift',shift_code,'required',required_count)) from public.daily_staffing_overrides where company_id=p_company_id and work_date>=p_first_month and work_date<finish_),'[]'),
 'boundary',coalesce((select jsonb_agg(jsonb_build_object('employeeId',a.employee_id,'type',a.shift_code,'date',(a.starts_at at time zone zone_)::date,
 'start',to_char(a.starts_at at time zone zone_,'HH24:MI'),'end',to_char(a.ends_at at time zone zone_,'HH24:MI'),'startMs',extract(epoch from a.starts_at)*1000,'endMs',extract(epoch from a.ends_at)*1000,
 '_marketApproved',exists(select 1 from public.open_shift_market_claims c where c.assignment_id=a.id and c.status='APPLIED')))
 from public.shift_assignments a where a.company_id=p_company_id and a.status<>'CANCELLED'
 and ((a.starts_at >= (p_first_month-interval '1 month') at time zone zone_ and a.starts_at<p_first_month::timestamp at time zone zone_)
 or (a.starts_at>=finish_::timestamp at time zone zone_ and a.starts_at<(finish_+8)::timestamp at time zone zone_))),'[]'),
 'absences',coalesce((select jsonb_agg(jsonb_build_object('employeeId',a.employee_id,'from',a.start_date,'to',a.end_date,'fullDay',a.full_day,'startTime',a.start_time,'endTime',a.end_time))
 from public.absences a where a.company_id=p_company_id and a.start_date<=finish_ and a.end_date>=p_first_month-1 and a.status in ('Genehmigt','Erfasst','APPROVED')),'[]'));
 return data_||jsonb_build_object('fingerprint',md5(data_::text),'as_of',now());
end $$;
revoke all on function private.staffing_simulator_snapshot(uuid,date,integer) from public,anon;
grant execute on function private.staffing_simulator_snapshot(uuid,date,integer) to authenticated;
create function public.staffing_simulator_snapshot(p_company_id uuid,p_first_month date,p_month_count integer)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.staffing_simulator_snapshot(p_company_id,p_first_month,p_month_count); $$;
revoke all on function public.staffing_simulator_snapshot(uuid,date,integer) from public,anon;
grant execute on function public.staffing_simulator_snapshot(uuid,date,integer) to authenticated;
notify pgrst,'reload schema';
