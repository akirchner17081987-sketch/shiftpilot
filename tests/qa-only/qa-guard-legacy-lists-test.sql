do $test$
declare u uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); peer uuid:=gen_random_uuid(); shift_b uuid:=gen_random_uuid(); shift_market uuid:=gen_random_uuid(); request_b uuid:=gen_random_uuid(); market_b uuid:=gen_random_uuid(); incident uuid:=gen_random_uuid(); offer uuid:=gen_random_uuid(); absence_id uuid; n integer; denied boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'qa-legacy-'||u::text||'@example.invalid','{}'),(other,'qa-legacy-peer-'||other::text||'@example.invalid','{}');
 insert into public.companies(id,name,created_by) values(a,'QA A',u),(b,'QA B',u);
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status) values(eb,b,'QA','B','B',u,'DISABLED'),(ea,a,'QA','A','A',u,'ACTIVE'),(peer,b,'QA','Peer','P',other,'ACTIVE');
 insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status,published_at) values(shift_b,b,eb,'O1','2030-01-01 08:00Z','2030-01-01 16:00Z','PUBLISHED',now()),(shift_market,b,eb,'O1','2030-01-03 08:00Z','2030-01-03 16:00Z','PUBLISHED',now());
 insert into public.shift_swap_requests(id,company_id,assignment_id,original_employee_id,target_employee_id,assignment_version,status) values(request_b,b,shift_b,eb,peer,1,'PENDING_COLLEAGUE'),(market_b,b,shift_market,eb,null,1,'MARKET_OPEN');
 insert into public.disruption_incidents(id,company_id,assignment_id,original_employee_id,assignment_version,incident_type,created_by) values(incident,b,shift_b,eb,1,'OTHER',u);
 insert into public.disruption_offers(id,incident_id,company_id,employee_id,offered_by,expires_at) values(offer,incident,b,eb,u,now()+interval '1 day');
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal1','role','authenticated')::text,true);perform set_config('role','authenticated',true);
 select count(*) into n from public.employee_list_shift_swaps();if n<>0 then raise exception 'Revoked swaps visible'; end if;
 select count(*) into n from public.employee_list_shift_marketplace();if n<>0 then raise exception 'Revoked marketplace visible'; end if;
 select count(*) into n from public.employee_list_disruption_offers();if n<>0 then raise exception 'Revoked disruption offers visible'; end if;
 denied:=false;begin perform public.employee_list_shift_swap_candidates(shift_b);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Revoked candidates visible'; end if;
 absence_id:=public.employee_submit_absence_request('Urlaub','2030-02-01','2030-02-01');
 perform set_config('role','postgres',true);
 if not exists(select 1 from public.absences where id=absence_id and company_id=a and employee_id=ea) then raise exception 'Legacy request assigned to revoked profile'; end if;
end $test$;
