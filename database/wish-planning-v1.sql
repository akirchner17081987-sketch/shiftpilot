-- Wunschplanung: authenticated self service, manager decisions and durable free-time promises.
create table public.planning_wishes (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 employee_id uuid not null references public.employees(id) on delete cascade,
 client_id uuid not null,
 kind text not null check(kind in ('OFF','SHIFT')),
 start_date date not null,
 end_date date not null check(end_date>=start_date and end_date-start_date<=30),
 starts_at timestamptz not null,
 ends_at timestamptz not null check(ends_at>starts_at),
 timezone text not null,
 shift_code text,
 priority text not null default 'NORMAL' check(priority in ('NORMAL','IMPORTANT')),
 note text not null default '' check(length(note)<=500),
 status text not null default 'PENDING' check(status in ('PENDING','PROMISED','ACCEPTED','REJECTED','WITHDRAWN','RELEASE_REQUESTED','RELEASED')),
 decision_reason text not null default '' check(length(decision_reason)<=1000),
 decided_at timestamptz,
 decided_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 created_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),
 revision integer not null default 1,
 unique(company_id,client_id),
 check((kind='OFF' and shift_code is null and status<>'ACCEPTED') or (kind='SHIFT' and length(shift_code)>0 and status not in ('PROMISED','RELEASE_REQUESTED','RELEASED')))
);
create index planning_wishes_company_period_idx on public.planning_wishes(company_id,start_date,end_date);
create index planning_wishes_employee_period_idx on public.planning_wishes(employee_id,starts_at,ends_at);
create index planning_wishes_created_by_idx on public.planning_wishes(created_by);
create index planning_wishes_decided_by_idx on public.planning_wishes(decided_by);
create table public.planning_wish_events (
 id uuid primary key default gen_random_uuid(),
 wish_id uuid not null references public.planning_wishes(id) on delete cascade,
 company_id uuid not null references public.companies(id) on delete cascade,
 employee_id uuid not null references public.employees(id) on delete cascade,
 action text not null, from_status text, to_status text not null,
 reason text not null default '', actor_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create index planning_wish_events_wish_idx on public.planning_wish_events(wish_id,created_at);
create index planning_wish_events_company_idx on public.planning_wish_events(company_id);
create index planning_wish_events_employee_idx on public.planning_wish_events(employee_id);
create index planning_wish_events_actor_idx on public.planning_wish_events(actor_id);
alter table public.planning_wishes enable row level security;
alter table public.planning_wish_events enable row level security;
revoke all on public.planning_wishes,public.planning_wish_events from public,anon,authenticated;
grant select on public.planning_wishes,public.planning_wish_events to authenticated;
create function private.sf_can_read_wish(company_ uuid,employee_ uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not private.sf_has_time_only_login() and (
 private.sf_is_manager(company_,false) or exists(select 1 from public.employees e where e.id=employee_ and e.company_id=company_ and e.auth_user_id=auth.uid() and e.status='active' and e.deleted_at is null and e.access_status='ACTIVE'));
$$;
revoke all on function private.sf_can_read_wish(uuid,uuid) from public,anon;
grant execute on function private.sf_can_read_wish(uuid,uuid) to authenticated;
create policy planning_wishes_read on public.planning_wishes for select to authenticated using(private.sf_can_read_wish(company_id,employee_id));
create policy planning_wish_events_read on public.planning_wish_events for select to authenticated using(private.sf_can_read_wish(company_id,employee_id));

create function private.planning_wish_action(p_company_id uuid,p_action text,p_id uuid,p_revision integer,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.planning_wishes; e public.employees; manager_ boolean; own_ boolean; old_status text; reason_ text:=btrim(coalesce(p_input->>'reason','')); zone_ text; today_ date; next_status text; conflict_ integer;
begin
 if auth.uid() is null or private.sf_has_time_only_login() then raise exception 'Kein Zugang zur Wunschplanung.' using errcode='42501'; end if;
 manager_:=private.sf_is_manager(p_company_id,false);
 -- Same lock as every assignment write, marketplace approval and atomic plan replacement.
 -- Concurrent promise and duty writes cannot both pass their conflict check.
 perform pg_advisory_xact_lock(hashtextextended('open-market:'||p_company_id::text,0));
 select coalesce(timezone,'Europe/Berlin') into zone_ from public.companies where id=p_company_id;
 today_:=(now() at time zone zone_)::date;
 if p_action='SUBMIT' then
  select * into e from public.employees where company_id=p_company_id and id=(p_input->>'employee_id')::uuid and status='active' and deleted_at is null;
  if e.id is null or not coalesce(manager_ or (e.auth_user_id=auth.uid() and e.access_status='ACTIVE'),false) then raise exception 'Keine Berechtigung für diesen Mitarbeiter.' using errcode='42501'; end if;
  select * into w from public.planning_wishes where company_id=p_company_id and client_id=(p_input->>'client_id')::uuid;
  if found then
   if w.employee_id<>e.id or w.created_by is distinct from auth.uid() then raise exception 'Anfragekennung ist bereits vergeben.'; end if;
   return to_jsonb(w);
  end if;
  w.start_date:=(p_input->>'from')::date;w.end_date:=(p_input->>'to')::date;
  if w.start_date is null or w.end_date is null or w.start_date<today_ or w.end_date<w.start_date or w.end_date-w.start_date>30 or w.end_date>today_+interval '2 years' then raise exception 'Bitte 1–31 zukünftige Tage innerhalb der nächsten zwei Jahre wählen.'; end if;
  if (e.start_date is not null and w.start_date<e.start_date) or (e.contract_end is not null and w.end_date>e.contract_end) then raise exception 'Der Wunsch liegt außerhalb des Vertragszeitraums.'; end if;
  if p_input->>'kind'='SHIFT' and not exists(select 1 from public.shift_templates t where t.company_id=p_company_id and t.code=p_input->>'shift' and t.active and t.code=any(e.shift_permissions)) then raise exception 'Bitte eine aktive freigegebene Schicht auswählen.'; end if;
  if exists(select 1 from public.planning_wishes x where x.employee_id=e.id and x.status in ('PENDING','PROMISED','ACCEPTED','RELEASE_REQUESTED') and x.start_date<=w.end_date and x.end_date>=w.start_date) then raise exception 'Für diesen Zeitraum besteht bereits ein aktiver Wunsch. Bitte diesen zuerst prüfen.'; end if;
  if (select count(*) from public.planning_wishes where employee_id=e.id and created_at>now()-interval '1 day')>=50 then raise exception 'Heute wurden bereits 50 Wünsche erfasst. Bitte vorhandene Wünsche prüfen.'; end if;
  insert into public.planning_wishes(company_id,employee_id,client_id,kind,start_date,end_date,starts_at,ends_at,timezone,shift_code,priority,note,created_by)
  values(p_company_id,e.id,(p_input->>'client_id')::uuid,p_input->>'kind',w.start_date,w.end_date,w.start_date::timestamp at time zone zone_,(w.end_date+1)::timestamp at time zone zone_,zone_,case when p_input->>'kind'='SHIFT' then p_input->>'shift' end,coalesce(p_input->>'priority','NORMAL'),btrim(coalesce(p_input->>'note','')),auth.uid()) returning * into w;
  old_status:=null;
 else
  select * into w from public.planning_wishes where id=p_id and company_id=p_company_id for update;
  if w.id is null or not private.sf_can_read_wish(w.company_id,w.employee_id) then raise exception 'Wunsch nicht verfügbar oder keine Berechtigung.' using errcode='42501'; end if;
  if p_revision is null or p_revision<>w.revision then raise exception 'Der Wunsch wurde inzwischen geändert. Bitte aktualisieren.' using errcode='40001'; end if;
  select * into e from public.employees where id=w.employee_id;
  own_:=e.auth_user_id=auth.uid() and e.status='active' and e.deleted_at is null and e.access_status='ACTIVE';
  old_status:=w.status;
  if p_action in ('APPROVE','REJECT') then
   if not manager_ or w.status<>'PENDING' then raise exception 'Nur die Planung darf offene Wünsche entscheiden.' using errcode='42501'; end if;
   if w.start_date<today_ then raise exception 'Vergangene Wünsche können nicht nachträglich zugesagt werden.'; end if;
   if e.status<>'active' or e.deleted_at is not null then raise exception 'Der Mitarbeiter ist nicht mehr aktiv.'; end if;
   if p_action='REJECT' and length(reason_)<5 then raise exception 'Bitte die Ablehnung nachvollziehbar begründen (mindestens 5 Zeichen).'; end if;
   next_status:=case when p_action='REJECT' then 'REJECTED' when w.kind='OFF' then 'PROMISED' else 'ACCEPTED' end;
   if next_status='PROMISED' then
    select count(*) into conflict_ from public.shift_assignments a where a.company_id=w.company_id and a.employee_id=w.employee_id and a.status<>'CANCELLED' and a.starts_at<w.ends_at and a.ends_at>w.starts_at;
    if conflict_>0 then raise exception 'Freizeitzusage blockiert: % vorhandene Dienste überschneiden sich, einschließlich Nachtübertrag. Bitte zuerst bewusst umplanen.',conflict_; end if;
   elsif next_status='ACCEPTED' and not exists(select 1 from public.shift_templates t where t.company_id=w.company_id and t.code=w.shift_code and t.active and t.code=any(e.shift_permissions)) then raise exception 'Die gewünschte Schicht ist nicht mehr freigegeben oder aktiv.';
   end if;
   update public.planning_wishes set decided_at=now(),decided_by=auth.uid(),decision_reason=reason_ where id=w.id;
  elsif p_action='WITHDRAW' then
   if not coalesce(own_,false) or w.status not in ('PENDING','ACCEPTED') then raise exception 'Nur eigene offene Wünsche oder Schichtpräferenzen können zurückgezogen werden.' using errcode='42501'; end if;
   next_status:='WITHDRAWN';
  elsif p_action='ASK_RELEASE' then
   if not manager_ or w.status<>'PROMISED' then raise exception 'Nur die Planung kann die Freigabe einer bestehenden Zusage anfragen.' using errcode='42501'; end if;
   if length(reason_)<5 then raise exception 'Bitte den Anlass der Freigabeanfrage begründen (mindestens 5 Zeichen).'; end if;
   next_status:='RELEASE_REQUESTED';
  elsif p_action='RELEASE' then
   if not coalesce(own_,false) or w.status not in ('PROMISED','RELEASE_REQUESTED') then raise exception 'Nur der betroffene Mitarbeiter kann seine Freizeitzusage freigeben.' using errcode='42501'; end if;
   if p_input->>'confirmed' is distinct from 'true' then raise exception 'Bitte die Freigabe ausdrücklich bestätigen.'; end if;
   next_status:='RELEASED';
  elsif p_action='KEEP' then
   if not coalesce(own_,false) or w.status<>'RELEASE_REQUESTED' then raise exception 'Nur der betroffene Mitarbeiter kann die Zusage beibehalten.' using errcode='42501'; end if;
   next_status:='PROMISED';
  else raise exception 'Ungültige Wunschaktion.'; end if;
  update public.planning_wishes set status=next_status,revision=revision+1,updated_at=now() where id=w.id returning * into w;
 end if;
 insert into public.planning_wish_events(wish_id,company_id,employee_id,action,from_status,to_status,reason,actor_id)
 values(w.id,w.company_id,w.employee_id,p_action,old_status,w.status,reason_,auth.uid());
 insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata)
 values(w.company_id,'PLANNING_WISH_'||p_action,'planning_wish',w.id,auth.uid(),case when manager_ then 'MANAGER' else 'EMPLOYEE' end,jsonb_build_object('status',w.status,'startDate',w.start_date,'endDate',w.end_date,'kind',w.kind),jsonb_build_object('revision',w.revision));
 return to_jsonb(w);
end $$;
revoke all on function private.planning_wish_action(uuid,text,uuid,integer,jsonb) from public,anon;
grant execute on function private.planning_wish_action(uuid,text,uuid,integer,jsonb) to authenticated;
create function public.planning_wish_action(p_company_id uuid,p_action text,p_id uuid default null,p_revision integer default null,p_input jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select private.planning_wish_action(p_company_id,p_action,p_id,p_revision,p_input); $$;
revoke all on function public.planning_wish_action(uuid,text,uuid,integer,jsonb) from public,anon;
grant execute on function public.planning_wish_action(uuid,text,uuid,integer,jsonb) to authenticated;

create function private.sf_guard_free_time_promise() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='CANCELLED' then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('open-market:'||new.company_id::text,0));
 if exists(select 1 from public.planning_wishes w where w.company_id=new.company_id and w.employee_id=new.employee_id and w.kind='OFF' and w.status in ('PROMISED','RELEASE_REQUESTED') and w.starts_at<new.ends_at and w.ends_at>new.starts_at) then
  raise exception 'Geschützte Freizeitzusage: Dieser Dienst überschneidet sich mit zugesagter Freizeit. Nur der Mitarbeiter kann die Zusage ausdrücklich freigeben.' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function private.sf_guard_free_time_promise() from public,anon,authenticated;
create trigger a1_free_time_promise before insert or update of company_id,employee_id,starts_at,ends_at,status on public.shift_assignments for each row execute function private.sf_guard_free_time_promise();

create function private.planning_wish_bundle(p_company_id uuid,p_month date) returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='15s' as $$
declare manager_ boolean; employee_ uuid; zone_ text; from_ date; until_ date;
begin
 if auth.uid() is null or private.sf_has_time_only_login() then raise exception 'Kein Zugang zur Wunschplanung.' using errcode='42501'; end if;
 manager_:=private.sf_is_manager(p_company_id,false);
 select id into employee_ from public.employees where company_id=p_company_id and auth_user_id=auth.uid() and status='active' and deleted_at is null and access_status='ACTIVE';
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
revoke all on function private.planning_wish_bundle(uuid,date) from public,anon;
grant execute on function private.planning_wish_bundle(uuid,date) to authenticated;
create function public.planning_wish_bundle(p_company_id uuid,p_month date) returns jsonb language sql stable security invoker set search_path='' as $$ select private.planning_wish_bundle(p_company_id,p_month); $$;
revoke all on function public.planning_wish_bundle(uuid,date) from public,anon;
grant execute on function public.planning_wish_bundle(uuid,date) to authenticated;

create function private.planning_wish_feed(p_company_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.sf_is_manager(p_company_id,false) then raise exception 'Keine Planungsberechtigung.' using errcode='42501'; end if;
 return jsonb_build_object('company_id',p_company_id,'wishes',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'employee_id',w.employee_id,'start_date',w.start_date,'end_date',w.end_date,'starts_at',w.starts_at,'ends_at',w.ends_at,'kind',w.kind,'shift_code',w.shift_code,'priority',w.priority,'status',w.status,'revision',w.revision) order by w.id) from public.planning_wishes w where w.company_id=p_company_id and w.status in ('PENDING','PROMISED','ACCEPTED','RELEASE_REQUESTED')),'[]'));
end $$;
revoke all on function private.planning_wish_feed(uuid) from public,anon;
grant execute on function private.planning_wish_feed(uuid) to authenticated;
create function public.planning_wish_feed(p_company_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.planning_wish_feed(p_company_id); $$;
revoke all on function public.planning_wish_feed(uuid) from public,anon;
grant execute on function public.planning_wish_feed(uuid) to authenticated;

CREATE OR REPLACE FUNCTION private.sf_month_optimization_snapshot(company_ uuid, month_ date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor_ uuid:=auth.uid();tz_ text;last_ date;rows_ jsonb;fingerprint_ text;protected_ jsonb;
BEGIN
 IF actor_ IS NULL OR NOT EXISTS(SELECT 1 FROM public.company_members WHERE company_id=company_ AND user_id=actor_
  AND status='ACTIVE' AND role IN('OWNER','ADMIN','PLANNER','DISPATCHER')) THEN RAISE EXCEPTION 'Für dieses Unternehmen fehlen aktive Planungsrechte.'; END IF;
 IF month_ IS NULL OR extract(day FROM month_)<>1 THEN RAISE EXCEPTION 'Bitte einen Kalendermonat auswählen.'; END IF;
 SELECT coalesce(timezone,'Europe/Berlin') INTO tz_ FROM public.companies WHERE id=company_;
 last_:=(month_+interval '1 month')::date;
 IF EXISTS(SELECT 1 FROM public.time_month_closures WHERE company_id=company_ AND month_start=month_ AND status='CLOSED')
 THEN RAISE EXCEPTION 'Der Monat ist abgeschlossen.'; END IF;
 IF EXISTS(SELECT 1 FROM public.plan_publications WHERE company_id=company_
  AND week_start<=last_-1 AND week_start+6>=month_ AND published_at IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.shift_assignments WHERE company_id=company_ AND status='PUBLISHED'
  AND starts_at>=month_::timestamp AT TIME ZONE tz_ AND starts_at<last_::timestamp AT TIME ZONE tz_)
 THEN RAISE EXCEPTION 'Der Monat enthält veröffentlichte Dienste oder Wochen.'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'::jsonb) INTO rows_ FROM public.shift_assignments a
  WHERE company_id=company_ AND status<>'CANCELLED' AND starts_at>=(month_-7)::timestamp AT TIME ZONE tz_
  AND starts_at<(last_+7)::timestamp AT TIME ZONE tz_;
 SELECT coalesce(jsonb_agg(a.id ORDER BY a.id),'[]'::jsonb) INTO protected_ FROM public.shift_assignments a
  JOIN public.employees e ON e.id=a.employee_id AND e.company_id=company_
  WHERE a.company_id=company_ AND a.status<>'CANCELLED' AND a.starts_at>=month_::timestamp AT TIME ZONE tz_
   AND a.starts_at<last_::timestamp AT TIME ZONE tz_ AND (
   a.status<>'DRAFT' OR coalesce(a.note,'')~*'(markt|market|freiwill|tausch)'
   OR ((private.sf_month_rhythm(e,(a.starts_at AT TIME ZONE tz_)::date)->>'mode')='required'
    AND (private.sf_month_rhythm(e,(a.starts_at AT TIME ZONE tz_)::date)->>'expected') NOT IN('ALLE','FREI'))
   OR EXISTS(SELECT 1 FROM public.time_entries t WHERE t.assignment_id=a.id AND
    (t.actual_start IS NOT NULL OR t.actual_end IS NOT NULL OR t.status<>'open' OR t.confirmed_at IS NOT NULL OR t.submitted_at IS NOT NULL
     OR coalesce(t.employee_note,'')<>'' OR coalesce(t.manager_note,'')<>''))
   OR EXISTS(SELECT 1 FROM public.time_qr_punches q WHERE q.assignment_id=a.id)
   OR EXISTS(SELECT 1 FROM public.time_qr_breaks q WHERE q.assignment_id=a.id)
   OR EXISTS(SELECT 1 FROM public.open_shift_market_claims q WHERE q.assignment_id=a.id)
   OR EXISTS(SELECT 1 FROM public.shift_swap_requests q WHERE q.assignment_id=a.id)
   OR EXISTS(SELECT 1 FROM public.shift_change_requests q WHERE q.assignment_id=a.id));
 SELECT md5(jsonb_build_object('assignments',rows_,'protected',protected_,
  'planningPolicy',(SELECT to_jsonb(p) FROM public.company_compliance_policy p WHERE company_id=company_),
  'employees',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]'::jsonb) FROM public.employees e WHERE company_id=company_),
  'absences',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'::jsonb) FROM public.absences a WHERE company_id=company_),
  'templates',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb) FROM public.shift_templates t WHERE company_id=company_),
  'soll',(SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.shift_code),'[]'::jsonb) FROM public.global_staffing_requirements g WHERE company_id=company_),
  'daily',(SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.work_date,g.shift_code),'[]'::jsonb) FROM public.daily_staffing_overrides g WHERE company_id=company_),
  'wishes',(SELECT coalesce(jsonb_agg(to_jsonb(w) ORDER BY w.id),'[]'::jsonb) FROM public.planning_wishes w WHERE w.company_id=company_ AND w.start_date<=last_+1 AND w.end_date>=month_-1),
  'teams',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.team_code),'[]'::jsonb) FROM public.company_planning_teams t WHERE company_id=company_))::text) INTO fingerprint_;
 RETURN jsonb_build_object('fingerprint',fingerprint_,'protectedIds',protected_,'month',month_);
END $function$
;

CREATE OR REPLACE FUNCTION private.staffing_simulator_snapshot(p_company_id uuid, p_first_month date, p_month_count integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '30s'
AS $function$
declare zone_ text; finish_ date; data_ jsonb;
begin
 if auth.uid() is null or not private.sf_is_manager(p_company_id,true) then raise exception 'Nur Inhaber und Administratoren können Personalszenarien prüfen.' using errcode='42501'; end if;
 if p_first_month is null or extract(day from p_first_month)<>1 or p_month_count is null or p_month_count not in (3,6,12)
 or p_first_month<'2020-01-01' or p_first_month>current_date+interval '5 years' then raise exception 'Bitte einen Startmonat und 3, 6 oder 12 Monate wählen.'; end if;
 select coalesce(timezone,'Europe/Berlin') into strict zone_ from public.companies where id=p_company_id;
 finish_:=(p_first_month+make_interval(months=>p_month_count))::date;
 data_:=jsonb_build_object('company_id',p_company_id,'company_name',(select name from public.companies where id=p_company_id),'timezone',zone_,'from',p_first_month,'to',finish_-1,
 'excluded_placeholders',(select count(*) from public.employees e where e.company_id=p_company_id and e.deleted_at is null and e.status='active' and e.qualifications @> array['__sp:planningPlaceholder=1']),
 'wishes',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'employee_id',w.employee_id,'start_date',w.start_date,'end_date',w.end_date,'starts_at',w.starts_at,'ends_at',w.ends_at,'kind',w.kind,'shift_code',w.shift_code,'priority',w.priority,'status',w.status,'revision',w.revision)) from public.planning_wishes w where w.company_id=p_company_id and w.start_date<=finish_ and w.end_date>=p_first_month-1 and w.status in ('PENDING','PROMISED','ACCEPTED','RELEASE_REQUESTED')),'[]'),
 'rules',coalesce((select solid_planning_rules from public.company_compliance_policy where company_id=p_company_id),'{}'),
 'employees',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'first',e.first_name,'last',e.last_name,'personnelNo',e.personnel_no,'role',e.role,'employment',e.employment,'weeklyHours',e.weekly_hours,
  'startDate',e.start_date,'contractEnd',e.contract_end,'status',e.status,'shifts',e.shift_permissions,
  'qualifications',coalesce((select jsonb_agg(q) from unnest(e.qualifications) q where q ~ '^__sp:(monthlyHours|maxWeekly|maxConsecutive|availability|planningTeam|team|rhythmMode|rhythmStart|rhythmKind|rhythmPattern|rhythmExemptOt|preferred)='),'[]'),
  'rhythms',coalesce((select jsonb_object_agg(d::date::text,r) from generate_series(p_first_month::timestamp,(finish_-1)::timestamp,interval '1 day') d cross join lateral (select private.sf_month_rhythm(e,d::date) r) x where r->>'mode'='required'),'{}')) order by e.last_name,e.first_name,e.id)
 from public.employees e where e.company_id=p_company_id and e.deleted_at is null and e.status='active' and not coalesce(e.qualifications @> array['__sp:planningPlaceholder=1'],false)),'[]'),
 'models',coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order,t.code) from public.shift_templates t where t.company_id=p_company_id),'[]'),
 'global',coalesce((select jsonb_object_agg(shift_code,required_count) from public.global_staffing_requirements where company_id=p_company_id),'{}'),
 'daily',coalesce((select jsonb_agg(jsonb_build_object('date',work_date,'shift',shift_code,'required',required_count)) from public.daily_staffing_overrides where company_id=p_company_id and work_date>=p_first_month and work_date<finish_),'[]'),
 'boundary',coalesce((select jsonb_agg(jsonb_build_object('employeeId',a.employee_id,'type',a.shift_code,'date',(a.starts_at at time zone zone_)::date,
 'start',to_char(a.starts_at at time zone zone_,'HH24:MI'),'end',to_char(a.ends_at at time zone zone_,'HH24:MI'),'startMs',extract(epoch from a.starts_at)*1000,'endMs',extract(epoch from a.ends_at)*1000,
 '_marketApproved',exists(select 1 from public.open_shift_market_claims c where c.assignment_id=a.id and c.status='APPLIED')))
 from public.shift_assignments a where a.company_id=p_company_id and a.status<>'CANCELLED'
 and ((a.starts_at >= (p_first_month-interval '1 month') at time zone zone_ and a.starts_at<p_first_month::timestamp at time zone zone_)
 or (a.starts_at>=finish_::timestamp at time zone zone_ and a.starts_at<(finish_+interval '1 month') at time zone zone_))),'[]'),
 'absences',coalesce((select jsonb_agg(jsonb_build_object('employeeId',a.employee_id,'from',a.start_date,'to',a.end_date,'fullDay',a.full_day,'startTime',a.start_time,'endTime',a.end_time))
 from public.absences a where a.company_id=p_company_id and a.start_date<=finish_ and a.end_date>=p_first_month-1 and a.status in ('Genehmigt','Erfasst','APPROVED')),'[]'));
 return data_||jsonb_build_object('fingerprint',md5(data_::text),'as_of',now());
end $function$
;

notify pgrst,'reload schema';
