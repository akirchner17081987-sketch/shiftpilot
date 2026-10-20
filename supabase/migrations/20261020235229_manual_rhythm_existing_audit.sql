-- Use the existing trusted audit trigger; clients never gain INSERT rights on audit_events.
do $migration$
begin
 if not exists(select 1 from pg_trigger where tgrelid='public.shift_assignments'::regclass and tgname='sf_audit_shift_assignments' and tgenabled in('O','A') and tgfoid='private.capture_audit_change()'::regprocedure) then
  raise exception 'The trusted assignment audit trigger must be active.';
 end if;
end $migration$;
drop trigger sf_audit_manual_rhythm_override on public.shift_assignments;
drop function private.sf_audit_manual_rhythm_override();


-- Published changes also use the existing trusted assignment/request audit triggers.
-- Keep the approval and actor checks in the invoker RPC; never grant client audit writes.
do $migration$
declare source_ text; duplicate_ text := $duplicate$  insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
  values(r.company_id,'SHIFT_CHANGE_APPLIED','shift_change_request',r.id,v_actor,v_actor_role,r.old_snapshot,r.proposed_snapshot,jsonb_build_object('assignment_id',v_id,'action',r.action));$duplicate$;
begin
 if not exists(select 1 from pg_trigger where tgrelid='public.shift_change_requests'::regclass and tgname='sf_audit_shift_change_requests' and tgenabled in('O','A') and tgfoid='private.capture_audit_change()'::regprocedure) then
  raise exception 'The trusted change request audit trigger must be active.';
 end if;
 source_:=pg_get_functiondef('public.apply_shift_change(uuid)'::regprocedure);
 if strpos(source_,duplicate_)=0 then raise exception 'Unexpected published-change audit path. Review migration.'; end if;
 execute replace(source_,duplicate_,'  -- Assignment and APPLIED request changes are captured by existing audit triggers.');
end $migration$;
