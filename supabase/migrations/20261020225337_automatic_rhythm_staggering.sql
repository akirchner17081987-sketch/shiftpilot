-- Company opt-in, reviewed initial rhythm phases. No company values are seeded.
create or replace function public.manager_save_rhythm_staggering(p_company_id uuid,p_enabled boolean,p_expected jsonb,p_changes jsonb default '[]'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare policy_ public.company_compliance_policy; employee_ public.employees; change_ jsonb;
 old_start_ date; new_start_ date; pattern_ text[]; mode_ text; team_ text; kind_ text; result_ jsonb:='[]'; updated_ text[];
begin
 if auth.uid() is null or not exists(select 1 from public.company_members where company_id=p_company_id and user_id=auth.uid() and status='ACTIVE' and role in('OWNER','ADMIN')) then
  raise exception using errcode='42501',message='Nur Inhaber und Administratoren dürfen Rhythmuseinstiege ändern.';
 end if;
 if p_enabled is null or p_expected is null or jsonb_typeof(p_expected)<>'object' or p_changes is null or jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes)>30 then raise exception 'Ungültige Rhythmusstaffelung.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('open-market:'||p_company_id::text,0));
 select * into policy_ from public.company_compliance_policy where company_id=p_company_id for update;
 if not found or coalesce(policy_.solid_planning_rules,'{}') is distinct from p_expected then raise exception using errcode='40001',message='Die Unternehmenseinstellungen wurden geändert. Bitte neu laden.'; end if;
 if jsonb_array_length(p_changes)>0 and (not p_enabled or coalesce(policy_.solid_planning_rules->>'enabled','false')='true') then raise exception 'Das Unternehmensregelwerk lässt diese individuelle Staffelung nicht zu.'; end if;
 if jsonb_array_length(p_changes)<>(select count(distinct x->>'employee_id') from jsonb_array_elements(p_changes) x) then raise exception 'Mitarbeiter wurden mehrfach angegeben.'; end if;
 -- Parent row locks also serialize concurrent new shift FK checks for these employees.
 perform 1 from public.employees where company_id=p_company_id and id in(select (x->>'employee_id')::uuid from jsonb_array_elements(p_changes) x) order by id for update;
 for change_ in select x from jsonb_array_elements(p_changes) x loop
  select * into employee_ from public.employees where company_id=p_company_id and id=(change_->>'employee_id')::uuid and status='active' and deleted_at is null;
  if not found then raise exception 'Mitarbeiter ist nicht mehr aktiv oder gehört nicht zum Unternehmen.'; end if;
  if change_->'expected_qualifications' is null or jsonb_typeof(change_->'expected_qualifications')<>'array' or to_jsonb(coalesce(employee_.qualifications,array[]::text[])) is distinct from change_->'expected_qualifications' then raise exception using errcode='40001',message='Mitarbeitervorgaben wurden geändert. Bitte neu berechnen.'; end if;
  if exists(select 1 from public.shift_assignments where company_id=p_company_id and employee_id=employee_.id and status<>'CANCELLED') then raise exception 'Mitarbeiter mit gespeicherten Diensten behalten ihren Rhythmuseinstieg.'; end if;
  select substr(q,17) into mode_ from unnest(employee_.qualifications) q where q like '__sp:rhythmMode=%' limit 1;
  select substr(q,17) into kind_ from unnest(employee_.qualifications) q where q like '__sp:rhythmKind=%' limit 1;
  select substr(q,19) into team_ from unnest(employee_.qualifications) q where q like '__sp:planningTeam=%' limit 1;
  select substr(q,18)::date into old_start_ from unnest(employee_.qualifications) q where q like '__sp:rhythmStart=%' limit 1;
  select regexp_split_to_array(upper(substr(q,20)),'[,;]') into pattern_ from unnest(employee_.qualifications) q where q like '__sp:rhythmPattern=%' limit 1;
  select array_agg(trim(x) order by n) into pattern_ from unnest(pattern_) with ordinality a(x,n);
  if kind_ is distinct from 'cycle' or mode_ is distinct from 'required' or coalesce(team_,'')<>'' or old_start_ is null or coalesce(cardinality(pattern_),0) not between 2 and 365 or not ('ALLE'=any(pattern_) and 'FREI'=any(pattern_)) or exists(select 1 from unnest(pattern_) x where x not in('ALLE','FREI')) then raise exception 'Nur individuelle verbindliche ALLE/FREI-Zyklen können gestaffelt werden.'; end if;
  new_start_:=(change_->>'start')::date;
  if new_start_ is null or new_start_>old_start_ or old_start_-new_start_>=cardinality(pattern_) then raise exception 'Ungültiger Rhythmuseinstieg.'; end if;
  select coalesce(array_agg(q order by n) filter(where q not like '__sp:rhythmStart=%'),array[]::text[])||array['__sp:rhythmStart='||new_start_::text] into updated_ from unnest(employee_.qualifications) with ordinality a(q,n);
  update public.employees set qualifications=updated_ where company_id=p_company_id and id=employee_.id;
  result_:=result_||jsonb_build_array(jsonb_build_object('id',employee_.id,'start',new_start_,'qualifications',updated_));
 end loop;
 update public.company_compliance_policy set solid_planning_rules=coalesce(solid_planning_rules,'{}')||jsonb_build_object('automaticRhythmStaggering',p_enabled) where company_id=p_company_id returning * into policy_;
 return jsonb_build_object('company_id',p_company_id,'solid_planning_rules',policy_.solid_planning_rules,'employees',result_);
end $$;
revoke all on function public.manager_save_rhythm_staggering(uuid,boolean,jsonb,jsonb) from public,anon;
grant execute on function public.manager_save_rhythm_staggering(uuid,boolean,jsonb,jsonb) to authenticated;

-- The final atomic month guard must use the same saved duration as preview/manual guards.
do $migration$
declare source_ text; old_ text:=$old$row_.ends_at-row_.starts_at>interval '10 hours'$old$;
begin
 select pg_get_functiondef('private.sf_apply_month_optimization(uuid,date,text,uuid[],jsonb,boolean)'::regprocedure) into source_;
 if position(old_ in source_)=0 then raise exception 'Unexpected month duration guard; review before applying.'; end if;
 source_:=replace(source_,old_,$new$row_.ends_at-row_.starts_at>make_interval(secs => (3600*coalesce((select standard_max_shift_hours from public.company_compliance_policy where company_id=company_),10))::double precision)$new$);
 execute source_;
end $migration$;
