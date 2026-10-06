begin;
do $$declare
 company_a uuid;company_b uuid;employee_a uuid;terminal_a uuid;terminal_a2 uuid;terminal_b uuid;
 v_shift_id uuid;v jsonb;blocked boolean;
begin
 insert into public.companies default values returning id into company_a;
 insert into public.companies default values returning id into company_b;
 insert into public.employees(company_id,first_name,last_name,personnel_no,start_date)
 values(company_a,'Fiktive','Testperson','FIKTIV-100','2020-01-15') returning id into employee_a;
 insert into public.time_qr_terminals(company_id,name,location_note,token_hash)
 values(company_a,'Fiktiver Standort A','Fiktiver Eingang',extensions.digest(repeat('a',64),'sha256')) returning id into terminal_a;
 insert into public.time_qr_terminals(company_id,name,location_note,token_hash)
 values(company_a,'Fiktiver Standort A2','Fiktives anderes Terminal',extensions.digest(repeat('c',64),'sha256')) returning id into terminal_a2;
 insert into public.time_qr_terminals(company_id,name,token_hash)
 values(company_b,'Fiktiver fremder Standort',extensions.digest(repeat('b',64),'sha256')) returning id into terminal_b;
 v:=public.qr_independent_login(repeat('a',64),'FIKTIV-100','2020-01-15',repeat('d',64));
 assert (v->>'ok')::boolean,'Fictitious login failed';
 v:=public.qr_independent_action(repeat('a',64),repeat('d',64),'STATUS');
 assert v->>'state'='READY' and v->>'terminal_name'='Fiktiver Standort A','Ready location wrong';
 assert v->>'location_note'='Fiktiver Eingang' and v->>'timezone'='Europe/Berlin','Location note/timezone missing';
 assert abs(extract(epoch from ((v->>'as_of')::timestamptz-clock_timestamp())))<5,'Server snapshot missing or stale';
 insert into public.time_qr_independent_shifts(company_id,employee_id,terminal_id,started_at)
 values(company_a,employee_a,terminal_a,clock_timestamp()-interval '6 hours') returning id into v_shift_id;
 v:=public.qr_independent_login(repeat('c',64),'FIKTIV-100','2020-01-15',repeat('e',64));
 v:=public.qr_independent_action(repeat('c',64),repeat('e',64),'STATUS');
 assert v->>'state'='RUNNING' and v->>'terminal_name'='Fiktiver Standort A','Existing booking location changed to scanned terminal';
 assert (v->>'started_at')::timestamptz<(v->>'as_of')::timestamptz-interval '5 hours','Existing begin lost';
 v:=public.qr_independent_action(repeat('a',64),repeat('d',64),'BREAK_START');
 assert v->>'state'='BREAK' and jsonb_array_length(v->'breaks')=1,'Pause begin failed';
 update public.time_qr_independent_breaks set started_at=clock_timestamp()-interval '30 minutes' where shift_id=v_shift_id;
 v:=public.qr_independent_action(repeat('a',64),repeat('d',64),'CLOCK_OUT');
 assert (v->>'pause_automatically_closed')::boolean and v->>'state'='READY','Clock-out did not close pause';
 assert v->>'terminal_name'='Fiktiver Standort A','Clock-out location missing';
 assert v#>>'{breaks,0,ended_at}'=v->>'ended_at','Pause and clock-out timestamps differ';
 assert abs(extract(epoch from ((v->>'ended_at')::timestamptz-(v->>'started_at')::timestamptz))-21600)<5,'Paid attendance was reduced';
 v:=public.qr_independent_action(repeat('a',64),repeat('d',64),'CLOCK_IN');
 assert jsonb_array_length(v->'breaks')=0 and v->>'state'='RUNNING','New booking did not reset';
 blocked:=false;
 begin perform public.qr_independent_action(repeat('b',64),repeat('d',64),'STATUS');
 exception when others then blocked:=sqlerrm like 'Anmeldung abgelaufen%';end;
 assert blocked,'Foreign terminal read an authenticated booking';
 update public.time_qr_terminals set is_active=false where id=terminal_a;
 blocked:=false;
 begin perform public.qr_independent_action(repeat('a',64),repeat('d',64),'STATUS');
 exception when others then blocked:=sqlerrm like 'Anmeldung abgelaufen%';end;
 assert blocked,'Disabled terminal returned live data';
 assert not has_function_privilege('anon','public.qr_independent_action(text,text,text)','EXECUTE'),'Anonymous direct execution';
 assert not has_function_privilege('authenticated','public.qr_independent_action(text,text,text)','EXECUTE'),'Authenticated direct execution';
 assert has_function_privilege('service_role','public.qr_independent_action(text,text,text)','EXECUTE'),'Edge service lost execution';
 raise notice 'PASS: server time, ready/running/original locations, paid pauses, next booking and company/session guards';
end$$;
rollback;
