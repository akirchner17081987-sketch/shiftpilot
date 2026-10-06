begin;
do $$declare
  company_a uuid:=gen_random_uuid();company_b uuid:=gen_random_uuid();employee_a uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();
  terminal uuid:=gen_random_uuid();v_shift_id uuid:=gen_random_uuid();v jsonb;snapshot jsonb;v_role text;blocked boolean;old_start timestamptz:=clock_timestamp()-interval '3 days';
  request_a text:=repeat('1',64);request_b text:=repeat('2',64);request_c text:=repeat('3',64);request_d text:=repeat('4',64);before_count integer;
begin
  insert into public.companies(id,name) values(company_a,'Fiktives Unternehmen A'),(company_b,'Fiktives Unternehmen B');
  insert into public.employees(id,company_id,first_name,last_name,personnel_no,start_date,status,access_status)
    values(employee_a,company_a,'Fiktive','Testperson','FIKTIV','2020-01-15','active','NONE');
  insert into auth.users(id,email) values(actor,'fiktiver-manager@example.invalid');
  insert into public.company_members(company_id,user_id,role,status) values(company_a,actor,'TIME_TRACKING','ACTIVE');
  perform set_config('request.jwt.claim.sub',actor::text,true);
  insert into public.time_qr_terminals(id,company_id,name,is_active,token_hash)
    values(terminal,company_a,'Fiktiver Standort',true,extensions.digest(repeat('a',64),'sha256'));
  insert into public.time_qr_independent_shifts(id,company_id,employee_id,terminal_id,started_at)
    values(v_shift_id,company_a,employee_a,terminal,old_start);
  insert into public.time_qr_independent_breaks(shift_id,ordinal,started_at) values(v_shift_id,1,old_start+interval '2 hours');
  insert into public.time_qr_independent_events(shift_id,action,punched_at) values(v_shift_id,'CLOCK_IN',old_start);
  snapshot:=public.manager_qr_independent_detail(company_a,v_shift_id);
  assert snapshot->>'revision' is not null,'Snapshot revision missing';
  v:=public.manager_correct_qr_independent_shift(company_a,v_shift_id,old_start,old_start+interval '8 hours','Fiktiv: Dienstende bestätigt',snapshot->>'revision',null);
  assert (v->>'ended_at')::timestamptz=old_start+interval '8 hours','Old shift did not close';
  assert (v->'breaks'->0->>'ended_at')::timestamptz=old_start+interval '8 hours','Open pause did not close with shift';
  assert jsonb_array_length(v->'history')=1,'Audit missing';
  assert v->'history'->0->'metadata'->>'reason'='Fiktiv: Dienstende bestätigt','Audit reason missing';
  assert v->'history'->0->'old_values'->>'ended_at' is null,'Original open end was lost';
  assert v->'history'->0->>'actor_name'='fiktiver-manager@example.invalid','Audit actor missing';
  assert private.sf_confirmed_work_minutes(employee_a,(old_start at time zone 'Europe/Berlin')::date,((old_start+interval '8 hours') at time zone 'Europe/Berlin')::date)=480,'Paid pauses were subtracted from central time';
  assert (select punched_at=old_start from public.time_qr_independent_events where shift_id=v_shift_id and action='CLOCK_IN' limit 1),'Raw punch was rewritten';
  blocked:=false;begin
    perform public.manager_correct_qr_independent_shift(company_a,v_shift_id,old_start,old_start+interval '9 hours','Fiktive Änderung',snapshot->>'revision',null);
  exception when others then blocked:=true;end;assert blocked,'Stale snapshot overwrote a correction';
  snapshot:=public.manager_qr_independent_detail(company_a,v_shift_id);
  blocked:=false;begin perform public.manager_qr_independent_detail(company_b,v_shift_id);exception when others then blocked:=true;end;assert blocked,'Cross-company read succeeded';
  blocked:=false;begin perform public.manager_correct_qr_independent_shift(company_b,v_shift_id,old_start,old_start+interval '9 hours','Fiktive Änderung',snapshot->>'revision',null);exception when others then blocked:=true;end;assert blocked,'Cross-company correction succeeded';
  blocked:=false;begin perform public.manager_correct_qr_independent_shift(company_a,v_shift_id,old_start,old_start+interval '9 hours','x',snapshot->>'revision',null);exception when others then blocked:=true;end;assert blocked,'Missing reason accepted';
  blocked:=false;begin perform public.manager_correct_qr_independent_shift(company_a,v_shift_id,old_start,clock_timestamp()+interval '1 hour','Fiktive Änderung',snapshot->>'revision',null);exception when others then blocked:=true;end;assert blocked,'Future end accepted';
  blocked:=false;begin perform public.manager_correct_qr_independent_shift(company_a,v_shift_id,old_start,old_start+interval '9 hours','Fiktive Änderung',snapshot->>'revision','[]');exception when others then blocked:=true;end;assert blocked,'Existing pause silently deleted';
  blocked:=false;begin perform public.manager_correct_qr_independent_shift(company_a,v_shift_id,old_start,old_start+interval '9 hours','Fiktive Änderung',snapshot->>'revision',jsonb_build_array(jsonb_build_object('number',1,'started_at',old_start-interval '1 minute','ended_at',old_start+interval '1 hour')));exception when others then blocked:=true;end;assert blocked,'Pause outside shift accepted';
  update public.company_members set status='INACTIVE' where user_id=actor;
  blocked:=false;begin perform public.manager_qr_independent_detail(company_a,v_shift_id);exception when others then blocked:=true;end;assert blocked,'Inactive manager could read';
  update public.company_members set status='ACTIVE',role='EMPLOYEE' where user_id=actor;
  blocked:=false;begin perform public.manager_correct_qr_independent_shift(company_a,v_shift_id,old_start,old_start+interval '9 hours','Fiktive Änderung',snapshot->>'revision',null);exception when others then blocked:=true;end;assert blocked,'Employee could correct';
  update public.company_members set role='TIME_TRACKING' where user_id=actor;
  insert into public.time_month_closures(company_id,month_start,status) values(company_a,date_trunc('month',old_start at time zone 'Europe/Berlin')::date,'CLOSED');
  blocked:=false;begin perform public.manager_correct_qr_independent_shift(company_a,v_shift_id,old_start,old_start+interval '9 hours','Fiktive Änderung',snapshot->>'revision',null);exception when others then blocked:=true;end;assert blocked,'Closed month was modified';
  delete from public.time_month_closures where company_id=company_a;
  foreach v_role in array array['OWNER','ADMIN','DISPATCHER','PLANNER','TIME_TRACKING'] loop
    update public.company_members set role=v_role where user_id=actor;
    snapshot:=public.manager_qr_independent_detail(company_a,v_shift_id);
    v:=public.manager_correct_qr_independent_shift(company_a,v_shift_id,(snapshot->>'started_at')::timestamptz-interval '1 minute',(snapshot->>'ended_at')::timestamptz,'Fiktive Rollenprüfung',snapshot->>'revision',null);
    assert v->>'revision'<>snapshot->>'revision','Allowed manager did not correct';
  end loop;
  assert (select count(*) from public.audit_events where entity_id=v_shift_id)=6,'Rejected changes created audits or valid audits missing';
  -- Idempotency for every employee action and a status proof after a lost reply.
  insert into public.time_qr_independent_sessions(token_hash,company_id,employee_id,terminal_id,expires_at)
    values(extensions.digest(repeat('b',64),'sha256'),company_a,employee_a,terminal,clock_timestamp()+interval '30 minutes');
  v:=public.qr_independent_action(repeat('a',64),repeat('b',64),'CLOCK_IN',request_a);
  assert v->>'state'='RUNNING' and (v->>'request_processed')::boolean,'Clock-in proof missing';
  v:=public.qr_independent_action(repeat('a',64),repeat('b',64),'CLOCK_IN',request_a);
  assert (v->>'replayed')::boolean,'Clock-in retry was repeated';
  perform public.qr_independent_action(repeat('a',64),repeat('b',64),'BREAK_START',request_b);
  v:=public.qr_independent_action(repeat('a',64),repeat('b',64),'BREAK_START',request_b);
  assert (v->>'replayed')::boolean and jsonb_array_length(v->'breaks')=1,'Pause duplicated on retry';
  perform pg_sleep(0.01);
  perform public.qr_independent_action(repeat('a',64),repeat('b',64),'BREAK_END',request_c);
  v:=public.qr_independent_action(repeat('a',64),repeat('b',64),'BREAK_END',request_c);assert (v->>'replayed')::boolean,'Pause-end retry failed';
  perform pg_sleep(0.01);
  perform public.qr_independent_action(repeat('a',64),repeat('b',64),'CLOCK_OUT',request_d);
  v:=public.qr_independent_action(repeat('a',64),repeat('b',64),'CLOCK_OUT',request_d);assert (v->>'replayed')::boolean,'Clock-out retry failed';
  v:=public.qr_independent_action(repeat('a',64),repeat('b',64),'STATUS',request_d);
  assert v->>'state'='READY' and v->>'ended_at' is not null and v->>'processed_action'='CLOCK_OUT' and (v->>'request_processed')::boolean,'Status after lost clock-out did not confirm exact request';
  assert (select count(*) from public.time_qr_independent_events where request_id in(request_a,request_b,request_c,request_d))=4,'Repeated requests created more events';
  blocked:=false;begin perform public.qr_independent_action(repeat('a',64),repeat('b',64),'BREAK_START',request_a);exception when others then blocked:=true;end;assert blocked,'Request ID reused for another action';
  v:=public.qr_independent_action(repeat('a',64),repeat('b',64),'STATUS',repeat('5',64));assert not (v->>'request_processed')::boolean,'Unprocessed request falsely confirmed';
  assert not has_function_privilege('anon','public.manager_correct_qr_independent_shift(uuid,uuid,timestamptz,timestamptz,text,text,jsonb)','EXECUTE'),'Anonymous correction exposed';
  assert not has_function_privilege('authenticated','public.qr_independent_action(text,text,text,text)','EXECUTE'),'Employee RPC exposes service-only action';
  assert not has_function_privilege('authenticated','private.sf_qr_independent_snapshot(uuid)','EXECUTE'),'Unscoped snapshot exposed';
  perform set_config('qa.company_id',company_a::text,true);
  perform set_config('qa.shift_id',v_shift_id::text,true);
end;$$;
-- Exercise the real authenticated role: no direct QR table grant is needed.
set local role authenticated;
select public.manager_qr_independent_detail(current_setting('qa.company_id')::uuid,current_setting('qa.shift_id')::uuid)->>'revision' as authenticated_snapshot_revision;
reset role;
rollback;
