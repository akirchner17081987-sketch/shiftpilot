do $test$
declare u uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); target uuid:=gen_random_uuid(); disabled uuid:=gen_random_uuid(); as1 uuid:=gen_random_uuid(); as2 uuid:=gen_random_uuid(); as3 uuid:=gen_random_uuid(); foreign_shift uuid:=gen_random_uuid(); offer uuid:=gen_random_uuid(); result uuid; status_result text; n int; denied boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'qa-swap-'||u::text||'@example.invalid','{}'),(other,'qa-peer-'||other::text||'@example.invalid','{}');
 insert into public.companies(id,name,created_by) values(a,'QA A',u),(b,'QA B',u);
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status,shift_permissions) values
 (ea,a,'QA','A','A',u,'ACTIVE',array['O1']),(eb,b,'QA','B','B',u,'ACTIVE',array['O1']),(target,b,'QA','Target','T',other,'ACTIVE',array['O1']),(disabled,b,'QA','Disabled','D',null,'DISABLED',array['O1']);
 insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,published_at) values
 (as1,b,eb,'O1','2030-01-01 08:00Z','2030-01-01 16:00Z','PUBLISHED',now()),(as2,b,eb,'O1','2030-01-03 08:00Z','2030-01-03 16:00Z','PUBLISHED',now()),(as3,b,target,'O1','2030-01-05 08:00Z','2030-01-05 16:00Z','PUBLISHED',now()),(foreign_shift,a,ea,'O1','2030-01-07 08:00Z','2030-01-07 16:00Z','PUBLISHED',now());
 insert into public.shift_swap_requests(id,company_id,assignment_id,original_employee_id,assignment_version,status) values(offer,b,as3,target,1,'MARKET_OPEN');
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal1','role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 denied:=false;begin perform public.qa_offer_market_scoped(a,as1,'');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Foreign company shift offered'; end if;
 denied:=false;begin perform public.qa_claim_market_scoped(a,offer,'');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Foreign company offer claimed'; end if;
 denied:=false;begin perform public.qa_create_swap_scoped(b,as1,disabled,'');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Disabled target accepted'; end if;
 denied:=false;begin perform public.qa_swap_candidates_scoped(a,as1);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Foreign company candidate lookup allowed'; end if;
 select count(*) into n from public.qa_swap_candidates_scoped(b,as1) where employee_id=target;
 if n<>1 then raise exception 'Eligible colleague missing'; end if;
 result:=public.qa_create_swap_scoped(b,as1,target,'test'); if result is null then raise exception 'Swap creation failed'; end if;
 result:=public.qa_offer_market_scoped(b,as2,'test'); if result is null then raise exception 'Offer creation failed'; end if;
 status_result:=public.qa_claim_market_scoped(b,offer,'test'); if status_result<>'PENDING_MANAGER' then raise exception 'Offer claim failed'; end if;
 perform set_config('role','postgres',true);
end $test$;
