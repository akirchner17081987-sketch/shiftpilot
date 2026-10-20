-- One documented exception per manual duty. Required rhythms used by solvers stay unchanged.
alter table public.shift_assignments add column rhythm_override jsonb;
-- Pure invoker helpers retain underlying company RLS; no private API is exposed.
grant execute on function private.sf_month_rhythm(public.employees,date),private.sf_month_meta(text[],text),private.sf_fixed_weekly_roster(uuid,uuid) to authenticated;

create function public.manager_set_manual_rhythm_exceptions(p_company_id uuid,p_enabled boolean,p_expected boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p_ public.company_compliance_policy;
begin
 if auth.uid() is null or not exists(select 1 from public.company_members where company_id=p_company_id and user_id=auth.uid() and status='ACTIVE' and role in('OWNER','ADMIN')) then raise exception using errcode='42501',message='Nur Inhaber und Administratoren dürfen diese Einstellung ändern.'; end if;
 if p_enabled is null or p_expected is null then raise exception 'Ungültige Einstellung.'; end if;
 select * into p_ from public.company_compliance_policy where company_id=p_company_id for update;
 if not found or coalesce((p_.solid_planning_rules->>'manualRhythmExceptions')::boolean,true) is distinct from p_expected then raise exception using errcode='40001',message='Die Einstellung wurde zwischenzeitlich geändert. Bitte neu laden.'; end if;
 update public.company_compliance_policy set solid_planning_rules=coalesce(solid_planning_rules,'{}')||jsonb_build_object('manualRhythmExceptions',p_enabled) where company_id=p_company_id returning * into p_;
 return jsonb_build_object('company_id',p_company_id,'solid_planning_rules',p_.solid_planning_rules);
end $$;
revoke all on function public.manager_set_manual_rhythm_exceptions(uuid,boolean,boolean) from public,anon;
grant execute on function public.manager_set_manual_rhythm_exceptions(uuid,boolean,boolean) to authenticated;

create function private.sf_normalize_manual_rhythm_override() returns trigger language plpgsql security invoker set search_path='' as $$
declare role_ text; reason_ text; e_ public.employees; rhythm_ jsonb; tz_ text; expected_ text;
begin
 if new.rhythm_override='null'::jsonb then new.rhythm_override:=null; end if;
 if new.status='CANCELLED' then return new; end if;
 if tg_op='UPDATE' and row(new.company_id,new.employee_id,new.shift_code,new.starts_at,new.ends_at,new.rhythm_override)
  is not distinct from row(old.company_id,old.employee_id,old.shift_code,old.starts_at,old.ends_at,old.rhythm_override) then return new; end if;
 if new.rhythm_override is null then return new; end if;
 if new.rhythm_override ? 'actor_id' and (
  (new.rhythm_override->>'employee_id')::uuid is distinct from new.employee_id
  or new.rhythm_override->>'shift_code' is distinct from new.shift_code
  or (new.rhythm_override->>'starts_at')::timestamptz is distinct from new.starts_at
  or (new.rhythm_override->>'ends_at')::timestamptz is distinct from new.ends_at) then
  raise exception 'Die bestätigte Rhythmusausnahme gilt nur für den ursprünglichen Dienst. Bitte die Änderung neu bestätigen.';
 end if;
 select role into role_ from public.company_members where company_id=new.company_id and user_id=auth.uid() and status='ACTIVE' and role in('OWNER','ADMIN','PLANNER','DISPATCHER');
 if auth.uid() is null or role_ is null then raise exception using errcode='42501',message='Nur Planungsberechtigte dürfen eine Rhythmusausnahme bestätigen.'; end if;
 if not coalesce((select coalesce((solid_planning_rules->>'manualRhythmExceptions')::boolean,true) from public.company_compliance_policy where company_id=new.company_id),false) then raise exception 'Neue manuelle Rhythmusausnahmen sind für dieses Unternehmen deaktiviert.'; end if;
 reason_:=trim(new.rhythm_override->>'reason');
 if jsonb_typeof(new.rhythm_override)<>'object' or reason_ is null or length(reason_) not between 1 and 500 then raise exception 'Bitte eine Begründung mit 1 bis 500 Zeichen angeben.'; end if;
 select * into e_ from public.employees where company_id=new.company_id and id=new.employee_id and status='active' and deleted_at is null;
 if not found or not coalesce(new.shift_code=any(e_.shift_permissions),false) then raise exception 'Mitarbeiter oder Schichtfreigabe ist nicht gültig.'; end if;
 select coalesce(timezone,'Europe/Berlin') into tz_ from public.companies where id=new.company_id;
 if e_.start_date>(new.starts_at at time zone tz_)::date or e_.contract_end<(new.starts_at at time zone tz_)::date then raise exception 'Der Dienst liegt außerhalb der Vertragslaufzeit.'; end if;
 rhythm_:=private.sf_month_rhythm(e_,(new.starts_at at time zone tz_)::date);expected_:=rhythm_->>'expected';
 if rhythm_->>'mode' is distinct from 'required' or expected_ is null or expected_='ALLE'
  or (coalesce((rhythm_->>'exemptOt')::boolean,false) and new.shift_code in('OT1','OT2','OT3'))
  or upper(new.shift_code)=any(regexp_split_to_array(expected_,'[+|/]')) then raise exception 'Für diesen Dienst ist keine Rhythmusausnahme erforderlich. Bitte neu prüfen.'; end if;
 new.rhythm_override:=jsonb_build_object('reason',reason_,'expected',expected_,'actor_id',auth.uid(),'actor_role',role_,'confirmed_at',clock_timestamp(),'employee_id',new.employee_id,'shift_code',new.shift_code,'starts_at',new.starts_at,'ends_at',new.ends_at);
 return new;
end $$;
revoke all on function private.sf_normalize_manual_rhythm_override() from public,anon;
grant execute on function private.sf_normalize_manual_rhythm_override() to authenticated;
create trigger a02_manual_rhythm_override before insert or update on public.shift_assignments for each row execute function private.sf_normalize_manual_rhythm_override();

-- Copy only the non-rhythm scope checks for the single, already validated manual exception.
-- All qualification, contract, model, weekday, holiday, time and responsibility guards remain.
do $migration$
declare source_ text; first_ int; last_ int;
begin
 source_:=pg_get_functiondef('private.sf_shift_scope_error(uuid,uuid,text,timestamptz,timestamptz)'::regprocedure);
 first_:=strpos(source_,' fixed_:=private.sf_fixed_weekly_roster(');last_:=strpos(source_,' SELECT code INTO exclusive_');
 if first_=0 or last_<=first_ then raise exception 'Unexpected scope function. Review migration.'; end if;
 source_:=left(source_,first_-1)||substr(source_,last_);
 source_:=replace(source_,'FUNCTION private.sf_shift_scope_error(','FUNCTION private.sf_manual_nonrhythm_scope_error(');
 execute source_;
end $migration$;
revoke all on function private.sf_manual_nonrhythm_scope_error(uuid,uuid,text,timestamptz,timestamptz) from public,anon;
grant execute on function private.sf_manual_nonrhythm_scope_error(uuid,uuid,text,timestamptz,timestamptz) to authenticated;

create or replace function public.enforce_shift_employee_scope() returns trigger language plpgsql set search_path='' as $$
declare err_ text;
begin
 if new.status='CANCELLED' then return new; end if;
 if tg_op='UPDATE' and row(new.company_id,new.employee_id,new.shift_code,new.starts_at,new.ends_at,new.status)
  is not distinct from row(old.company_id,old.employee_id,old.shift_code,old.starts_at,old.ends_at,old.status) then return new; end if;
 if new.rhythm_override is not null then
  err_:=private.sf_manual_nonrhythm_scope_error(new.company_id,new.employee_id,new.shift_code,new.starts_at,new.ends_at);
 else err_:=private.sf_shift_scope_error(new.company_id,new.employee_id,new.shift_code,new.starts_at,new.ends_at); end if;
 if err_ is not null then raise exception using errcode='23514',message=err_; end if;
 return new;
end $$;

create function private.sf_audit_manual_rhythm_override() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.rhythm_override is null or new.status='CANCELLED' then return null; end if;
 if tg_op='UPDATE' and new.rhythm_override is not distinct from old.rhythm_override then return null; end if;
 insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
 values(new.company_id,'MANUAL_RHYTHM_OVERRIDE','shift_assignment',new.id,auth.uid(),new.rhythm_override->>'actor_role',new.rhythm_override);
 return null;
end $$;
revoke all on function private.sf_audit_manual_rhythm_override() from public,anon;
grant execute on function private.sf_audit_manual_rhythm_override() to authenticated;
create trigger sf_audit_manual_rhythm_override after insert or update on public.shift_assignments for each row execute function private.sf_audit_manual_rhythm_override();

create function public.manager_save_manual_rhythm_assignment(p_company_id uuid,p_assignment_id uuid,p_employee_id uuid,p_shift_code text,p_starts_at timestamptz,p_ends_at timestamptz,p_break_minutes integer,p_note text,p_reason text,p_expected_version integer,p_legacy_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a_ public.shift_assignments; tz_ text; day_ date;
begin
 if auth.uid() is null or not exists(select 1 from public.company_members where company_id=p_company_id and user_id=auth.uid() and status='ACTIVE' and role in('OWNER','ADMIN','PLANNER','DISPATCHER')) then raise exception using errcode='42501',message='Für dieses Unternehmen fehlen aktive Planungsrechte.'; end if;
 if p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at or coalesce(p_break_minutes,-1)<0 or p_break_minutes>extract(epoch from(p_ends_at-p_starts_at))/60 or nullif(trim(p_reason),'') is null or length(trim(p_reason))>500 then raise exception 'Ungültiger Dienst oder fehlende Ausnahmebegründung.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('open-market:'||p_company_id::text,0));
 select coalesce(timezone,'Europe/Berlin') into tz_ from public.companies where id=p_company_id;day_:=(p_starts_at at time zone tz_)::date;
 if exists(select 1 from public.plan_publications where company_id=p_company_id and published_at is not null and day_ between week_start and week_start+6)
  or exists(select 1 from public.shift_assignments where company_id=p_company_id and status='PUBLISHED' and (starts_at at time zone tz_)::date=day_) then raise exception 'Veröffentlichter Plan: bitte den bestehenden Änderungs- und Freigabeablauf verwenden.'; end if;
 if p_assignment_id is not null then
  select * into a_ from public.shift_assignments where company_id=p_company_id and id=p_assignment_id for update;
  if not found or a_.status<>'DRAFT' or a_.version is distinct from p_expected_version then raise exception using errcode='40001',message='Der Dienst wurde inzwischen geändert. Bitte neu laden.'; end if;
  update public.shift_assignments set employee_id=p_employee_id,shift_code=p_shift_code,starts_at=p_starts_at,ends_at=p_ends_at,break_minutes=p_break_minutes,note=coalesce(p_note,''),rhythm_override=jsonb_build_object('reason',trim(p_reason)),version=version+1 where company_id=p_company_id and id=p_assignment_id returning * into a_;
 else
  if nullif(trim(p_legacy_id),'') is null then raise exception 'Die Dienstkennung fehlt.'; end if;
  select * into a_ from public.shift_assignments where company_id=p_company_id and legacy_id=p_legacy_id;
  if found then
   if a_.status='DRAFT' and a_.employee_id=p_employee_id and a_.shift_code=p_shift_code and a_.starts_at=p_starts_at and a_.ends_at=p_ends_at and a_.rhythm_override->>'reason'=trim(p_reason) then return to_jsonb(a_); end if;
   raise exception 'Die Dienstkennung ist bereits vergeben. Bitte neu laden.';
  end if;
  insert into public.shift_assignments(company_id,employee_id,legacy_id,shift_code,starts_at,ends_at,break_minutes,note,status,created_by,rhythm_override)
   values(p_company_id,p_employee_id,p_legacy_id,p_shift_code,p_starts_at,p_ends_at,p_break_minutes,coalesce(p_note,''),'DRAFT',auth.uid(),jsonb_build_object('reason',trim(p_reason))) returning * into a_;
 end if;
 return to_jsonb(a_);
end $$;
revoke all on function public.manager_save_manual_rhythm_assignment(uuid,uuid,uuid,text,timestamptz,timestamptz,integer,text,text,integer,text) from public,anon;
grant execute on function public.manager_save_manual_rhythm_assignment(uuid,uuid,uuid,text,timestamptz,timestamptz,integer,text,text,integer,text) to authenticated;

-- Preserve exceptions during optimization and carry explicit confirmations through published-plan approvals.
do $migration$
declare source_ text;
begin
 source_:=pg_get_functiondef('private.sf_month_optimization_snapshot(uuid,date)'::regprocedure);
 if strpos(source_,$needle$a.status<>'DRAFT' OR coalesce(a.note,'')$needle$)=0 then raise exception 'Unexpected protected-duty snapshot. Review migration.'; end if;
 execute replace(source_,$needle$a.status<>'DRAFT' OR coalesce(a.note,'')$needle$,$replacement$a.status<>'DRAFT' OR a.rhythm_override IS NOT NULL OR coalesce(a.note,'')$replacement$);
 source_:=pg_get_functiondef('public.apply_shift_change(uuid)'::regprocedure);
 if strpos(source_,'break_minutes=v_break,note=v_note,version=')=0 or strpos(source_,'break_minutes,note,status,published_at,version,last_change_request_id,created_by)')=0 or strpos(source_,$needle$v_start,v_end,v_break,v_note,'PUBLISHED'$needle$)=0 then raise exception 'Unexpected published-change function. Review migration.'; end if;
 source_:=replace(source_,'break_minutes=v_break,note=v_note,version=',$replacement$break_minutes=v_break,note=v_note,rhythm_override=nullif(r.proposed_snapshot->'rhythmOverride','null'::jsonb),version=$replacement$);
 source_:=replace(source_,'break_minutes,note,status,published_at,version,last_change_request_id,created_by)','break_minutes,note,rhythm_override,status,published_at,version,last_change_request_id,created_by)');
 source_:=replace(source_,$needle$v_start,v_end,v_break,v_note,'PUBLISHED'$needle$,$replacement$v_start,v_end,v_break,v_note,nullif(r.proposed_snapshot->'rhythmOverride','null'::jsonb),'PUBLISHED'$replacement$);
 execute source_;
end $migration$;
