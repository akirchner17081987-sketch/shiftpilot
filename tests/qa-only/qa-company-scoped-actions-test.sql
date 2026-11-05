do $test$
declare u uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); ca uuid:=gen_random_uuid(); cb uuid:=gen_random_uuid(); aa uuid:=gen_random_uuid(); ab uuid:=gen_random_uuid(); sa uuid:=gen_random_uuid(); sb uuid:=gen_random_uuid(); ia uuid:=gen_random_uuid(); oa uuid:=gen_random_uuid(); rejected boolean; outcome text;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'qa-actions-'||u::text||'@example.invalid','{}'::jsonb),(other,'qa-actions-other-'||other::text||'@example.invalid','{}'::jsonb);
 insert into public.companies(id,name,created_by) values(a,'QA A',u),(b,'QA B',u);
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status) values(ea,a,'QA','A','QA-A',u,'ACTIVE'),(eb,b,'QA','B','QA-B',u,'ACTIVE'),(ca,a,'Other','A','QA-CA',other,'ACTIVE'),(cb,b,'Other','B','QA-CB',other,'ACTIVE');
 insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at) values(aa,a,ea,'A','2030-02-01 08:00Z','2030-02-01 16:00Z'),(ab,b,cb,'B','2030-02-01 08:00Z','2030-02-01 16:00Z');
 insert into public.shift_swap_requests(id,company_id,assignment_id,original_employee_id,target_employee_id,assignment_version,status) values(sa,a,aa,ea,ca,1,'PENDING_COLLEAGUE'),(sb,b,ab,cb,eb,1,'PENDING_COLLEAGUE');
 insert into public.disruption_incidents(id,company_id,assignment_id,original_employee_id,assignment_version,incident_type,created_by) values(ia,a,aa,ea,1,'OTHER',u);
 insert into public.disruption_offers(id,incident_id,company_id,employee_id,offered_by,expires_at) values(oa,ia,a,ea,u,now()+interval '1 day');
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal1','role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 rejected:=false;
 begin perform public.qa_cancel_swap_scoped(b,sa); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Cross-company swap cancellation accepted'; end if;
 rejected:=false;
 begin perform public.qa_respond_swap_scoped(a,sb,'REJECT'); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Cross-company swap response accepted'; end if;
 rejected:=false;
 begin perform public.qa_respond_offer_scoped(b,oa,'DECLINE'); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Cross-company offer response accepted'; end if;
 outcome:=public.qa_cancel_swap_scoped(a,sa); if outcome<>'CANCELLED' then raise exception 'Cancellation failed'; end if;
 outcome:=public.qa_respond_swap_scoped(b,sb,'REJECT'); if outcome<>'REJECTED_COLLEAGUE' then raise exception 'Swap response failed'; end if;
 select status into outcome from public.qa_respond_offer_scoped(a,oa,'DECLINE'); if outcome<>'DECLINED' then raise exception 'Offer response failed'; end if;
 perform set_config('role','postgres',true);
 if (select status from public.shift_swap_requests where id=sa)<>'CANCELLED' or (select status from public.shift_swap_requests where id=sb)<>'REJECTED_COLLEAGUE' or (select status from public.disruption_offers where id=oa)<>'DECLINED' then raise exception 'Wrong state'; end if;
end $test$;

