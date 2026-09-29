begin;
do $$
declare
 u uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); other_c uuid:=gen_random_uuid();
 e uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
 result jsonb; rejected boolean; n integer; statement text;
begin
 insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values(u,'authenticated','authenticated','time-role-'||u||'@example.invalid','{}','{}',now(),now());
 insert into public.companies(id,name,created_by) values(c,'Time role rollback fixture',u),(other_c,'Foreign rollback fixture',u);
 insert into public.company_members(company_id,user_id,role,status) values(c,u,'TIME_TRACKING','ACTIVE');
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status)
 values(e,c,'Test','Time role','TIME-FIXTURE',u,'ACTIVE');
 insert into public.shift_templates(company_id,code,name,default_start,default_end)
 values(c,'TIMEFIX','Fixture','08:00','16:00');
 insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,created_by)
 values(a,c,e,'TIMEFIX',now()-interval '3 days',now()-interval '3 days'+interval '8 hours','DRAFT',u),
 (b,c,e,'TIMEFIX',now()-interval '2 days',now()-interval '2 days'+interval '8 hours','DRAFT',u);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',u::text,true);
 execute 'set local role authenticated';
 result:=public.time_access_context(c);
 if result->>'name'<>'Time role rollback fixture' then raise exception 'FAIL context';end if;
 select count(*) into n from public.manager_list_time_entries(c,current_date-5,current_date);
 if n<>2 then raise exception 'FAIL time read count %',n;end if;
 result:=public.manager_save_time_entry(a,now()-interval '3 days',now()-interval '3 days'+interval '8 hours',0,'Fixture',false);
 if result->>'status'<>'recorded' then raise exception 'FAIL save';end if;
 result:=public.manager_review_time_entry(a,'CONFIRM','Fixture confirmed');
 if result->>'status'<>'confirmed' then raise exception 'FAIL review';end if;
 result:=public.manager_bulk_record_time_entries(c,current_date-5,current_date,'Fixture bulk',true);
 if (result->>'updated')::int<>1 then raise exception 'FAIL bulk %',result;end if;
 result:=public.manager_qr_independent_report(c,current_date-5,current_date);
 if jsonb_typeof(result)<>'array' then raise exception 'FAIL QR report';end if;
 foreach statement in array array[
 'select * from public.employees where company_id='||quote_literal(c),
 'select * from public.shift_assignments where company_id='||quote_literal(c),
 'select * from public.absences where company_id='||quote_literal(c),
 'select * from public.companies where id='||quote_literal(c),
 'select * from public.company_compliance_policy where company_id='||quote_literal(c),
 'select * from public.audit_events where company_id='||quote_literal(c),
 'select * from public.time_entries where company_id='||quote_literal(c)
 ] loop
 execute 'select count(*) from ('||statement||') q' into n;
 if n<>0 then raise exception 'FAIL direct data exposed: %',statement;end if;
 end loop;
 foreach statement in array array[
 'select * from public.employee_list_shift_swaps()',
 'select * from public.employee_list_disruption_offers()',
 'select * from public.employee_list_shift_marketplace()',
 'select public.employee_my_time_account_month(current_date)',
 format('select public.time_access_context(%L)',other_c),
 format('select * from public.manager_list_time_entries(%L,current_date-5,current_date)',other_c),
 format('select public.manager_qr_independent_report(%L,current_date-5,current_date)',other_c),
 format('select * from public.manager_list_company_users(%L)',c),
 format('select public.manager_create_company_invite(%L,%L,%L,%L)',c,'denied@example.invalid','ADMIN',repeat('0',64)),
 format('select public.manager_update_company_member(%L,%L,%L,%L)',c,u,'ADMIN','ACTIVE'),
 format('select public.manager_monthly_time_accounts(%L,current_date)',c),
 format('select public.manager_close_time_month(%L,current_date,%L)',c,'Denied fixture'),
 format('select public.manager_list_time_qr_terminals(%L)',c)
 ] loop
 rejected:=false;
 begin execute statement;exception when others then
 if sqlerrm ~* '(berechtig|inhaber|administrator|owner|admin|required|membership)' then rejected:=true;else raise;end if;
 end;
 if not rejected then raise exception 'FAIL forbidden RPC accepted: %',statement;end if;
 end loop;
 rejected:=false;
 begin
 insert into public.employees(company_id,first_name,last_name) values(c,'Forbidden','Fixture');
 exception when insufficient_privilege then rejected:=true;
 end;
 if not rejected then raise exception 'FAIL direct employee insert';end if;
 execute 'reset role';
 update public.company_members set status='DISABLED' where company_id=c and user_id=u;
 execute 'set local role authenticated';
 rejected:=false;
 begin perform public.time_access_context(c);exception when others then if sqlerrm like '%berechtigt%' then rejected:=true;else raise;end if;end;
 if not rejected then raise exception 'FAIL disabled time login';end if;
 rejected:=false;
 begin perform public.bootstrap_company('Forbidden fixture');exception when others then if sqlerrm like '%deaktiviert%' then rejected:=true;else raise;end if;end;
 if not rejected then raise exception 'FAIL disabled bootstrap';end if;
 execute 'reset role';
end $$;
rollback;
