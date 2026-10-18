-- No assumed entitlement or weekday/calendar-day deduction in rotating shifts.
-- HR confirms chargeable days per absence and calendar year. Changes invalidate
-- the confirmation rather than silently retaining an incorrect debit.
begin;
create table private.employee_leave_accounts (
 employee_id uuid not null references public.employees(id) on delete cascade,
 company_id uuid not null references public.companies(id) on delete cascade,
 year integer not null check(year between 2000 and 2200),
 entitlement numeric(6,2) not null check(entitlement between 0 and 366),
 carryover numeric(6,2) not null check(carryover between 0 and 366),
 revision integer not null default 1,
 updated_by uuid not null, updated_at timestamptz not null default now(),
 primary key(employee_id,year)
);
create index employee_leave_accounts_company_year on private.employee_leave_accounts(company_id,year);
create table private.employee_leave_charges (
 absence_id uuid not null references public.absences(id) on delete cascade,
 year integer not null check(year between 2000 and 2200),
 days numeric(6,2) not null check(days between 0 and 366),
 absence_snapshot jsonb not null,
 updated_by uuid not null, updated_at timestamptz not null default now(),
 primary key(absence_id,year)
);
alter table private.employee_leave_accounts enable row level security;
alter table private.employee_leave_charges enable row level security;
revoke all on private.employee_leave_accounts,private.employee_leave_charges from public,anon,authenticated;

create function private.leave_absence_snapshot(a public.absences) returns jsonb
language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('company_id',a.company_id,'employee_id',a.employee_id,
  'type',a.absence_type,'from',a.start_date,'to',a.end_date,
  'full',a.full_day,'start',a.start_time,'end',a.end_time)
$$;

create function private.leave_account_bundle(p_employee_id uuid,p_year integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a private.employee_leave_accounts%rowtype; rows_ jsonb; approved_ numeric; pending_ numeric;
 missing_ integer; pending_missing_ integer;
begin
 if p_year is null or p_year not between 2000 and 2200 then raise exception 'Ungültiges Urlaubsjahr'; end if;
 select * into a from private.employee_leave_accounts where employee_id=p_employee_id and year=p_year;
 with entries as (
  select b.id,b.start_date,b.end_date,b.status,b.full_day,c.days as saved_days,
   private.leave_absence_snapshot(b) as expected_snapshot,
   case when c.absence_snapshot=private.leave_absence_snapshot(b) then c.days else null end as days,
   c.absence_id is not null and c.absence_snapshot<>private.leave_absence_snapshot(b) as changed,
   least(b.end_date,make_date(p_year,12,31))-greatest(b.start_date,make_date(p_year,1,1))+1 as max_days
  from public.absences b left join private.employee_leave_charges c on c.absence_id=b.id and c.year=p_year
  where b.employee_id=p_employee_id and b.absence_type='Urlaub'
   and b.start_date<=make_date(p_year,12,31) and b.end_date>=make_date(p_year,1,1)
   and b.status in ('Beantragt','Genehmigt','Erfasst')
 ) select coalesce(jsonb_agg(to_jsonb(entries) order by start_date,id),'[]'::jsonb),
  coalesce(sum(days) filter(where status in ('Genehmigt','Erfasst')),0),
  coalesce(sum(days) filter(where status='Beantragt'),0),
  count(*) filter(where status in ('Genehmigt','Erfasst') and days is null),
  count(*) filter(where status='Beantragt' and days is null)
 into rows_,approved_,pending_,missing_,pending_missing_ from entries;
 return jsonb_build_object('employee_id',p_employee_id,'year',p_year,'configured',a.employee_id is not null,
  'entitlement',a.entitlement,'carryover',a.carryover,'revision',coalesce(a.revision,0),
  'approved_days',approved_,'pending_days',pending_,'unconfirmed_approved',missing_,
  'unconfirmed_pending',pending_missing_,'complete',a.employee_id is not null and missing_=0,
  'remaining',case when a.employee_id is not null and missing_=0 then a.entitlement+a.carryover-approved_ else null end,
  'absences',rows_,'as_of',statement_timestamp());
end;$$;

create function private.employee_my_leave_account(p_company_id uuid,p_year integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e uuid;
begin
 if auth.uid() is null or private.sf_has_time_only_login() then raise exception 'Kein Mitarbeiterzugang' using errcode='42501'; end if;
 select id into e from public.employees b where b.company_id=p_company_id and b.auth_user_id=auth.uid()
  and b.status='active' and b.access_status='ACTIVE' and b.deleted_at is null
  and not exists(select 1 from public.company_members m where m.company_id=b.company_id and m.user_id=auth.uid() and m.status<>'ACTIVE')
 order by id limit 1;
 if e is null then raise exception 'Kein aktiver Mitarbeiterzugang für dieses Unternehmen' using errcode='42501'; end if;
 return private.leave_account_bundle(e,p_year);
end;$$;

create function private.manager_leave_account(p_company_id uuid,p_employee_id uuid,p_year integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or private.personnel_admin_role(p_company_id) is null or private.sf_has_time_only_login() then
  raise exception 'Urlaubskonten sind nur für die Personalverwaltung freigegeben' using errcode='42501'; end if;
 if not exists(select 1 from public.employees where id=p_employee_id and company_id=p_company_id and deleted_at is null) then
  raise exception 'Mitarbeiter gehört nicht zum Unternehmen' using errcode='42501'; end if;
 return private.leave_account_bundle(p_employee_id,p_year);
end;$$;

create function private.manager_save_leave_account(p_company_id uuid,p_employee_id uuid,p_year integer,
 p_entitlement numeric,p_carryover numeric,p_expected_revision integer,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare role_ text; old_ private.employee_leave_accounts%rowtype;
begin
 role_:=private.personnel_admin_role(p_company_id);
 if auth.uid() is null or role_ is null or private.sf_has_time_only_login() then raise exception 'Keine Berechtigung' using errcode='42501'; end if;
 if p_year is null or p_year not between 2000 and 2200 or p_entitlement is null or p_carryover is null
  or p_entitlement::text in ('NaN','Infinity','-Infinity') or p_carryover::text in ('NaN','Infinity','-Infinity')
  or p_entitlement not between 0 and 366 or p_carryover not between 0 and 366
  or p_entitlement<>round(p_entitlement,2) or p_carryover<>round(p_carryover,2)
  or length(btrim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'Anspruch, Übertrag und Begründung prüfen'; end if;
 -- Employee lock also serializes the first insert and all charge changes.
 perform 1 from public.employees where id=p_employee_id and company_id=p_company_id and deleted_at is null for update;
 if not found then raise exception 'Mitarbeiter gehört nicht zum Unternehmen' using errcode='42501'; end if;
 select * into old_ from private.employee_leave_accounts where employee_id=p_employee_id and year=p_year;
 if p_expected_revision is distinct from coalesce(old_.revision,0) then raise exception 'Urlaubskonto wurde zwischenzeitlich geändert. Bitte neu laden.' using errcode='40001'; end if;
 insert into private.employee_leave_accounts(employee_id,company_id,year,entitlement,carryover,revision,updated_by)
 values(p_employee_id,p_company_id,p_year,p_entitlement,p_carryover,coalesce(old_.revision,0)+1,auth.uid())
 on conflict(employee_id,year) do update set entitlement=excluded.entitlement,carryover=excluded.carryover,
 revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now();
 insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
 values(p_company_id,'LEAVE_ACCOUNT_SAVED','employee',p_employee_id,auth.uid(),role_,
  jsonb_build_object('year',p_year,'entitlement',old_.entitlement,'carryover',old_.carryover),
  jsonb_build_object('year',p_year,'entitlement',p_entitlement,'carryover',p_carryover),jsonb_build_object('reason',btrim(p_reason)));
 return private.leave_account_bundle(p_employee_id,p_year);
end;$$;

create function private.manager_set_leave_charge(p_absence_id uuid,p_year integer,p_days numeric,
 p_expected_snapshot jsonb,p_expected_days numeric,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.absences%rowtype; role_ text; old_ private.employee_leave_charges%rowtype; max_ integer;
begin
 -- Match the existing approval workflow's lock order (absence before employee).
 select * into a from public.absences where id=p_absence_id for update;
 role_:=private.personnel_admin_role(a.company_id);
 if auth.uid() is null or role_ is null or private.sf_has_time_only_login() then raise exception 'Keine Berechtigung' using errcode='42501'; end if;
 if a.id is null or a.absence_type<>'Urlaub' or a.status not in ('Beantragt','Genehmigt','Erfasst') then raise exception 'Kein offener oder bestätigter Urlaub'; end if;
 if p_year is null or p_year not between 2000 and 2200 then raise exception 'Ungültiges Urlaubsjahr'; end if;
 max_:=least(a.end_date,make_date(p_year,12,31))-greatest(a.start_date,make_date(p_year,1,1))+1;
 if max_<=0 or p_days is null or p_days::text in ('NaN','Infinity','-Infinity') or p_days<0 or p_days>max_ or p_days<>round(p_days,2)
  or length(btrim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'Urlaubstage, Jahr und Begründung prüfen'; end if;
 if p_expected_snapshot is distinct from private.leave_absence_snapshot(a) then raise exception 'Urlaub wurde zwischenzeitlich geändert. Bitte neu laden.' using errcode='40001'; end if;
 perform 1 from public.employees where id=a.employee_id and company_id=a.company_id and deleted_at is null for update;
 if not found then raise exception 'Mitarbeiter nicht verfügbar'; end if;
 select * into old_ from private.employee_leave_charges where absence_id=p_absence_id and year=p_year;
 if p_expected_days is distinct from old_.days then raise exception 'Urlaubstage wurden zwischenzeitlich geändert. Bitte neu laden.' using errcode='40001'; end if;
 insert into private.employee_leave_charges(absence_id,year,days,absence_snapshot,updated_by)
 values(a.id,p_year,p_days,private.leave_absence_snapshot(a),auth.uid())
 on conflict(absence_id,year) do update set days=excluded.days,absence_snapshot=excluded.absence_snapshot,updated_by=excluded.updated_by,updated_at=now();
 insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
 values(a.company_id,'LEAVE_CHARGE_CONFIRMED','absence',a.id,auth.uid(),role_,jsonb_build_object('year',p_year,'days',old_.days),
  jsonb_build_object('year',p_year,'days',p_days),jsonb_build_object('reason',btrim(p_reason)));
 return private.leave_account_bundle(a.employee_id,p_year);
end;$$;

create function private.manager_approve_leave_request(p_absence_id uuid,p_allocations jsonb,p_expected_snapshot jsonb,p_review_note text) returns text
language plpgsql security definer set search_path='' as $$
declare a public.absences%rowtype; item_ jsonb; old_days_ numeric; year_ integer; years_ integer; status_ text;
begin
 select * into a from public.absences where id=p_absence_id for update;
 if auth.uid() is null or private.personnel_admin_role(a.company_id) is null or private.sf_has_time_only_login() then raise exception 'Keine Berechtigung' using errcode='42501'; end if;
 if a.id is null or a.absence_type<>'Urlaub' or a.status<>'Beantragt' then raise exception 'Kein offener Urlaubsantrag'; end if;
 if p_expected_snapshot is distinct from private.leave_absence_snapshot(a) then raise exception 'Urlaub wurde zwischenzeitlich geändert. Bitte neu laden.' using errcode='40001'; end if;
 years_:=extract(year from a.end_date)::integer-extract(year from a.start_date)::integer+1;
 if p_allocations is null or jsonb_typeof(p_allocations)<>'array' then raise exception 'Urlaubstage je Jahr bestätigen'; end if;
 if jsonb_array_length(p_allocations)<>years_ or (select count(distinct value->>'year') from jsonb_array_elements(p_allocations))<>years_ then raise exception 'Urlaubstage für jedes betroffene Jahr bestätigen'; end if;
 status_:=private.manager_review_absence_request_impl(p_absence_id,'APPROVE',p_review_note);
 for item_ in select value from jsonb_array_elements(p_allocations) loop
  year_:=(item_->>'year')::integer;
  select days into old_days_ from private.employee_leave_charges where absence_id=p_absence_id and year=year_;
  perform private.manager_set_leave_charge(p_absence_id,year_,(item_->>'days')::numeric,p_expected_snapshot,old_days_,'Urlaubstage bei Genehmigung bestätigt');
 end loop;
 return status_;
end;$$;

-- Only guarded endpoints are callable. The internal bundle never accepts a
-- caller-provided employee ID without an authorization check in its wrapper.
revoke all on function private.leave_absence_snapshot(public.absences),private.leave_account_bundle(uuid,integer) from public,anon,authenticated;
revoke all on function private.employee_my_leave_account(uuid,integer),private.manager_leave_account(uuid,uuid,integer),
 private.manager_save_leave_account(uuid,uuid,integer,numeric,numeric,integer,text),
 private.manager_set_leave_charge(uuid,integer,numeric,jsonb,numeric,text),private.manager_approve_leave_request(uuid,jsonb,jsonb,text) from public,anon;
grant execute on function private.employee_my_leave_account(uuid,integer),private.manager_leave_account(uuid,uuid,integer),
 private.manager_save_leave_account(uuid,uuid,integer,numeric,numeric,integer,text),
 private.manager_set_leave_charge(uuid,integer,numeric,jsonb,numeric,text),private.manager_approve_leave_request(uuid,jsonb,jsonb,text) to authenticated;
create function public.employee_my_leave_account(p_company_id uuid,p_year integer) returns jsonb
language sql stable security invoker set search_path='' as $$select private.employee_my_leave_account(p_company_id,p_year)$$;
create function public.manager_leave_account(p_company_id uuid,p_employee_id uuid,p_year integer) returns jsonb
language sql stable security invoker set search_path='' as $$select private.manager_leave_account(p_company_id,p_employee_id,p_year)$$;
create function public.manager_save_leave_account(p_company_id uuid,p_employee_id uuid,p_year integer,p_entitlement numeric,p_carryover numeric,p_expected_revision integer,p_reason text) returns jsonb
language sql security invoker set search_path='' as $$select private.manager_save_leave_account(p_company_id,p_employee_id,p_year,p_entitlement,p_carryover,p_expected_revision,p_reason)$$;
create function public.manager_set_leave_charge(p_absence_id uuid,p_year integer,p_days numeric,p_expected_snapshot jsonb,p_expected_days numeric,p_reason text) returns jsonb
language sql security invoker set search_path='' as $$select private.manager_set_leave_charge(p_absence_id,p_year,p_days,p_expected_snapshot,p_expected_days,p_reason)$$;
create function public.manager_approve_leave_request(p_absence_id uuid,p_allocations jsonb,p_expected_snapshot jsonb,p_review_note text default '') returns text
language sql security invoker set search_path='' as $$select private.manager_approve_leave_request(p_absence_id,p_allocations,p_expected_snapshot,p_review_note)$$;
revoke all on function public.employee_my_leave_account(uuid,integer),public.manager_leave_account(uuid,uuid,integer),
 public.manager_save_leave_account(uuid,uuid,integer,numeric,numeric,integer,text),public.manager_set_leave_charge(uuid,integer,numeric,jsonb,numeric,text),public.manager_approve_leave_request(uuid,jsonb,jsonb,text) from public,anon;
grant execute on function public.employee_my_leave_account(uuid,integer),public.manager_leave_account(uuid,uuid,integer),
 public.manager_save_leave_account(uuid,uuid,integer,numeric,numeric,integer,text),public.manager_set_leave_charge(uuid,integer,numeric,jsonb,numeric,text),public.manager_approve_leave_request(uuid,jsonb,jsonb,text) to authenticated;
notify pgrst,'reload schema';
commit;
