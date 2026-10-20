-- Keep ordinary writes and internal cleanup on the cheap guard path.
create or replace function private.sf_guard_erasure_shared_writes() returns trigger
language plpgsql security definer set search_path='' as $$
declare company_ uuid; row_ jsonb; job_ record; refs_ text[]; names_ text[];
begin
 -- Avoid serializing large OLD/NEW snapshots during ordinary writes or cleanup.
 if tg_op='INSERT' then
  if not exists(select 1 from private.employee_erasure_jobs where company_id=new.company_id)
   or private.sf_erasure_context_plan(new.company_id) is not null then return new; end if;
 elsif tg_op='DELETE' then
  if not exists(select 1 from private.employee_erasure_jobs where company_id=old.company_id)
   or private.sf_erasure_context_plan(old.company_id) is not null then return old; end if;
 else
  if not exists(select 1 from private.employee_erasure_jobs where company_id in(old.company_id,new.company_id))
   or (old.company_id is not distinct from new.company_id and private.sf_erasure_context_plan(new.company_id) is not null) then return new; end if;
 end if;
 for row_ in select v from (values(case when tg_op<>'INSERT' then to_jsonb(old) end),(case when tg_op<>'DELETE' then to_jsonb(new) end)) q(v) where v is not null loop
  company_:=nullif(row_->>'company_id','')::uuid;
  if company_ is null or private.sf_erasure_context_plan(company_) is not null then continue; end if;
  for job_ in select plan from private.employee_erasure_jobs where company_id=company_ loop
   perform pg_advisory_xact_lock(hashtextextended('open-market:'||company_::text,0));
   refs_:=array(select jsonb_array_elements_text(job_.plan->'references'));
   names_:=array(select jsonb_array_elements_text(job_.plan->'names'));
   if private.sf_erasure_scrub(row_,refs_,names_) is distinct from row_ then
    raise exception 'Für diesen Mitarbeiter läuft die endgültige Löschung. Änderungen sind bis zum Abschluss gesperrt';
   end if;
  end loop;
 end loop;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function private.sf_guard_erasure_shared_writes() from public,anon,authenticated,service_role;
