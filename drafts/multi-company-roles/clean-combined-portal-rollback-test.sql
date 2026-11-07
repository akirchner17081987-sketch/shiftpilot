-- Isolated test only, after the complete candidate package and index change.
begin;
do $test$
declare
 owner_ uuid:=gen_random_uuid(); user_ uuid:=gen_random_uuid(); other_ uuid:=gen_random_uuid();
 a_ uuid:=gen_random_uuid(); b_ uuid:=gen_random_uuid(); c_ uuid:=gen_random_uuid();
 ea_ uuid:=gen_random_uuid(); eb_ uuid:=gen_random_uuid(); ec_ uuid:=gen_random_uuid();
 qa_ uuid:=gen_random_uuid(); qb_ uuid:=gen_random_uuid(); qc_ uuid:=gen_random_uuid();
 ta_ uuid:=gen_random_uuid(); tb_ uuid:=gen_random_uuid(); tc_ uuid:=gen_random_uuid();
 sa_ uuid:=gen_random_uuid(); sb_ uuid:=gen_random_uuid(); future_ uuid:=gen_random_uuid();
 colleague_ uuid:=gen_random_uuid(); swap_shift_ uuid:=gen_random_uuid(); swap_ uuid:=gen_random_uuid();
 absence_a uuid; absence_b uuid; offer_ uuid; denied boolean; actual_ integer;
begin
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
  (owner_,'qa-owner-'||owner_||'@example.invalid',now(),'{}'),(user_,'qa-user-'||user_||'@example.invalid',now(),'{}'),(other_,'qa-other-'||other_||'@example.invalid',now(),'{}');
 insert into public.companies(id,name,created_by) values(a_,'QA portal A',owner_),(b_,'QA portal B',owner_),(c_,'QA portal foreign',owner_);
 insert into public.company_members(company_id,user_id,role,status,access_role) values
  (a_,owner_,'OWNER','ACTIVE','OWNER'),(b_,owner_,'OWNER','ACTIVE','OWNER'),(c_,owner_,'OWNER','ACTIVE','OWNER');
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status,status,shift_permissions) values
  (ea_,a_,'QA','A','QA-A',user_,'ACTIVE','active',array['QA']),
  (eb_,b_,'QA','B','QA-B',user_,'ACTIVE','active',array['QA']),
  (ec_,c_,'QA','C','QA-C',other_,'ACTIVE','active',array['QA']),
  (colleague_,a_,'QA','Colleague','QA-COLLEAGUE',null,'ACTIVE','active',array['QA']);
 insert into public.shift_templates(company_id,code,name,default_start,default_end) values
  (a_,'QA','QA shift','08:00','16:00'),(b_,'QA','QA shift','08:00','16:00'),(c_,'QA','QA shift','08:00','16:00');
 perform set_config('request.jwt.claim.sub',owner_::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_,'role','authenticated','aal','aal2')::text,true);
 insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,published_at) values
  (sa_,a_,ea_,'QA',now()-interval '5 minutes',now()+interval '1 hour','PUBLISHED',now()),
  (sb_,b_,eb_,'QA',now()-interval '5 minutes',now()+interval '1 hour','PUBLISHED',now()),
  (future_,a_,ea_,'QA',now()+interval '10 days',now()+interval '10 days 8 hours','PUBLISHED',now()),
  (swap_shift_,a_,colleague_,'QA',now()+interval '15 days',now()+interval '15 days 8 hours','PUBLISHED',now());
 insert into public.shift_swap_requests(id,company_id,assignment_id,original_employee_id,target_employee_id,assignment_version,status,requested_by)
 values(swap_,a_,swap_shift_,colleague_,ea_,1,'PENDING_COLLEAGUE',owner_);
 insert into public.time_qr_terminals(id,company_id,name,token_hash,is_active,pilot_mode) values
  (ta_,a_,'QA Terminal A',extensions.digest(repeat('a',64),'sha256'),true,false),
  (tb_,b_,'QA Terminal B',extensions.digest(repeat('b',64),'sha256'),true,false),
  (tc_,c_,'QA Terminal C',extensions.digest(repeat('c',64),'sha256'),true,false);
 insert into public.time_qr_independent_shifts(id,company_id,employee_id,terminal_id,started_at) values
  (qa_,a_,ea_,ta_,now()),(qb_,b_,eb_,tb_,now()),(qc_,c_,ec_,tc_,now());
 perform set_config('request.jwt.claim.sub',user_::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',user_,'role','authenticated','aal','aal2')::text,true);
 execute 'set local role authenticated';
 if (public.employee_my_qr_bookings_for_company(a_,null)->>'employee_id')::uuid<>ea_ or (public.employee_my_qr_bookings_for_company(b_,null)->>'employee_id')::uuid<>eb_ then raise exception 'wrong QR history identity';end if;
 if (public.employee_my_qr_bookings_for_company(a_,null)->'rows'->0->>'id')::uuid<>qa_ or (public.employee_my_qr_bookings_for_company(b_,null)->'rows'->0->>'id')::uuid<>qb_ then raise exception 'QR history crossed company';end if;
 denied:=false;begin perform public.employee_my_qr_bookings_for_company(c_,null);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'foreign QR history accepted';end if;
 if (public.employee_qr_time_status(repeat('a',64))->>'assignment_id')::uuid<>sa_ or (public.employee_qr_time_status(repeat('b',64))->>'assignment_id')::uuid<>sb_ then raise exception 'QR terminal used wrong profile';end if;
 denied:=false;begin perform public.employee_qr_time_status(repeat('c',64));exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'foreign QR terminal accepted';end if;
 if public.employee_clock_from_qr(repeat('a',64),'CLOCK_IN')->>'action'<>'CLOCK_IN' then raise exception 'QR clock-in failed A';end if;
 if public.employee_clock_from_qr(repeat('b',64),'CLOCK_IN')->>'action'<>'CLOCK_IN' then raise exception 'QR clock-in failed B';end if;
 execute 'reset role';
 update public.time_qr_punches set punched_at=now()-interval '2 minutes' where assignment_id=sa_;
 execute 'set local role authenticated';
 if public.employee_qr_break_from_qr(repeat('a',64),'BREAK_START')->>'action'<>'BREAK_START' then raise exception 'QR break start failed';end if;
 execute 'reset role';
 update public.time_qr_punches set punched_at=now()-interval '2 minutes' where assignment_id=sa_;
 execute 'set local role authenticated';
 if public.employee_qr_break_from_qr(repeat('a',64),'BREAK_END')->>'action'<>'BREAK_END' then raise exception 'QR break end failed';end if;
 execute 'reset role';
 update public.time_qr_punches set punched_at=now()-interval '2 minutes' where assignment_id=sa_;
 execute 'set local role authenticated';
 if public.employee_clock_from_qr(repeat('a',64),'CLOCK_OUT')->>'action'<>'CLOCK_OUT' then raise exception 'QR clock-out failed';end if;
 if public.employee_qr_time_status(repeat('a',64))->>'state'<>'COMPLETED' or public.employee_qr_time_status(repeat('b',64))->>'state'<>'RUNNING' then raise exception 'QR states mixed between companies';end if;
 absence_a:=public.employee_submit_absence_request_for_company(a_,'Urlaub',current_date+40,current_date+40,'QA',true,null,null,'');
 absence_b:=public.employee_submit_absence_request_for_company(b_,'Urlaub',current_date+40,current_date+40,'QA',true,null,null,'');
 denied:=false;begin perform public.employee_submit_absence_request_for_company(c_,'Urlaub',current_date+41,current_date+41,'QA',true,null,null,'');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'foreign absence accepted';end if;
 offer_:=public.employee_offer_shift_marketplace(future_,'QA');
 if not exists(select 1 from public.employee_list_shift_marketplace_for_company(a_) where id=offer_) then raise exception 'market offer missing';end if;
 if exists(select 1 from public.employee_list_shift_marketplace_for_company(b_) where id=offer_) then raise exception 'market offer crossed company';end if;
 if jsonb_typeof(public.employee_list_open_shift_market_for_company(a_))<>'array' then raise exception 'open-market list failed';end if;
 if not exists(select 1 from public.employee_list_shift_swaps_for_company(a_) where id=swap_) or exists(select 1 from public.employee_list_shift_swaps_for_company(b_) where id=swap_) then raise exception 'swap list crossed company';end if;
 perform set_config('request.jwt.claim.sub',other_::text,true);
 denied:=false;begin perform public.employee_respond_shift_swap(swap_,'REJECT','QA');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'foreign swap response accepted';end if;
 perform set_config('request.jwt.claim.sub',user_::text,true);
 if public.employee_respond_shift_swap(swap_,'REJECT','QA')<>'REJECTED_COLLEAGUE' then raise exception 'own swap response failed';end if;
 execute 'reset role';
 if not exists(select 1 from public.absences where id=absence_a and company_id=a_ and employee_id=ea_) or not exists(select 1 from public.absences where id=absence_b and company_id=b_ and employee_id=eb_) then raise exception 'absence assigned to wrong profile';end if;
 update public.employees set access_status='DISABLED' where id=ea_;
 execute 'set local role authenticated';
 denied:=false;begin perform public.employee_submit_absence_request_for_company(a_,'Urlaub',current_date+41,current_date+41,'QA',true,null,null,'');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'disabled absence accepted';end if;
 denied:=false;begin perform public.employee_my_qr_bookings_for_company(a_,null);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'disabled QR history accepted';end if;
 if (public.employee_my_qr_bookings_for_company(b_,null)->>'employee_id')::uuid<>eb_ then raise exception 'active company B lost';end if;
 execute 'reset role';
 select count(*) into actual_ from (select auth_user_id from public.employees where auth_user_id is not null group by auth_user_id having count(*)>1) duplicate_accounts;
 if actual_<>1 then raise exception 'rollback preflight missed disabled profile';end if;
 -- The old global index must not be restored while multiple profiles exist.
 denied:=false;begin execute 'create unique index employees_auth_user_id_uidx on public.employees(auth_user_id) where auth_user_id is not null';exception when unique_violation then denied:=true;end;
 if not denied then raise exception 'global index incorrectly accepted multiple profiles';end if;
 select count(*) into actual_ from public.employees where id in(ea_,eb_);
 if actual_<>2 then raise exception 'profile changed during rejected rollback';end if;
end $test$;
rollback;
