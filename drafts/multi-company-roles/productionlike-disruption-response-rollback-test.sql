-- TEST BRANCH ONLY. Fictitious data in a transaction; no production execution.
begin;
do $test$
declare
 owner_id uuid; user_id uuid; a uuid; b uuid; c uuid; target uuid;
 original_id uuid; v_assignment uuid; v_incident uuid; v_offer uuid;
 observed text; destination uuid; n integer; denied boolean;
begin
 select id into strict owner_id from auth.users where email='a.kirchner17081987+sfqa1105@gmail.com';
 select id into strict user_id from auth.users where email='a.kirchner17081987+sfgemeinsam1106@gmail.com';
 select id into strict a from public.companies where name='QA Mehrunternehmen Verwaltung';
 select id into strict b from public.companies where name='QA Mehrunternehmen B 1107';
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2')::text,true);
 for c in select unnest(array[a,b]) loop
   select id into strict target from public.employees where company_id=c and auth_user_id=user_id and personnel_no in ('QA-1107-A','QA-1107-B');
   update public.employees set shift_permissions=array['QATEST'] where id=target;
   insert into public.employees(company_id,first_name,last_name,personnel_no,role,shift_permissions) values(c,'Original','QA-Test','QA-ORIGINAL','Mitarbeiter',array['QATEST']) returning id into original_id;
   insert into public.shift_templates(company_id,code,name,default_start,default_end) values(c,'QATEST','QA Test','06:00','14:00');
   insert into public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,break_minutes,status,published_at,version)
     values(c,original_id,'QATEST','2027-02-08 06:00+00','2027-02-08 14:00+00',0,'PUBLISHED',now(),1) returning id into v_assignment;
   insert into public.disruption_incidents(company_id,assignment_id,original_employee_id,assignment_version,incident_type,created_by)
     values(c,v_assignment,original_id,1,'OTHER',owner_id) returning id into v_incident;
   insert into public.disruption_offers(company_id,incident_id,employee_id,offered_by,expires_at)
     values(c,v_incident,target,owner_id,now()+interval '1 day') returning id into v_offer;
   -- An unrelated identity must not be able to answer the offer.
   execute 'set local role authenticated';
   denied:=false;
   begin
     perform public.employee_respond_disruption_offer(v_offer,'DECLINE','');
   exception when insufficient_privilege then denied:=true;
   end;
   if not denied then raise exception 'Foreign identity was not denied'; end if;
   execute 'reset role';
   update public.employees set access_status='DISABLED' where id=target;
   perform set_config('request.jwt.claim.sub',user_id::text,true);
   perform set_config('request.jwt.claims',jsonb_build_object('sub',user_id,'role','authenticated','aal','aal2')::text,true);
   execute 'set local role authenticated';
   denied:=false;
   begin
     perform public.employee_respond_disruption_offer(v_offer,'DECLINE','');
   exception when insufficient_privilege then denied:=true;
   end;
   if not denied then raise exception 'Disabled identity was not denied'; end if;
   execute 'reset role';
   update public.employees set access_status='ACTIVE' where id=target;
   execute 'set local role authenticated';
   select count(*) into n from public.employee_list_disruption_offers_for_company(c) x where x.offer_id=v_offer;
   if n<1 then raise exception 'Expected offer missing'; end if;
   select r.status into observed from public.employee_respond_disruption_offer(v_offer,'ACCEPT','QA-Test') r;
   execute 'reset role';
   if observed <> 'ACCEPTED' then raise exception 'Unexpected result: %',observed; end if;
   select employee_id into destination from public.shift_assignments where id=v_assignment;
   if destination is distinct from target then raise exception 'Assignment was not transferred to correct employee'; end if;
   perform set_config('request.jwt.claim.sub',owner_id::text,true);
   perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2')::text,true);
 end loop;
 raise notice 'PASS: accepted and transferred in both QA companies';
end $test$;
rollback;
