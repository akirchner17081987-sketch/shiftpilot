do $test$
declare u uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); ida uuid; idb uuid; idc uuid; idd uuid; rejected boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'qa-absence-'||u::text||'@example.invalid','{}'::jsonb),(other,'qa-absence-other-'||other::text||'@example.invalid','{}'::jsonb);
 insert into public.companies(id,name,created_by) values(a,'QA A',u),(b,'QA B',u),(c,'QA foreign',other);
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,auth_user_id,access_status) values(ea,a,'QA','A','QA-A',u,'ACTIVE'),(eb,b,'QA','B','QA-B',u,'ACTIVE');
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal1','role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 ida:=public.qa_submit_absence_scoped(a,'Urlaub','2030-01-02','2030-01-03');
 idb:=public.qa_submit_absence_scoped(b,'Urlaub','2030-01-02','2030-01-03');
 idc:=public.qa_submit_absence_scoped(b,'Home-Office','2030-01-05','2030-01-05');
 idd:=public.qa_submit_absence_scoped(b,'Kind Krank','2030-01-06','2030-01-06');
 rejected:=false;
 begin perform public.qa_submit_absence_scoped(a,'Urlaub','2030-01-03','2030-01-04'); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Overlapping absence accepted'; end if;
 rejected:=false;
 begin perform public.qa_submit_absence_scoped(c,'Urlaub','2030-01-02','2030-01-03'); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Foreign company accepted'; end if;
 perform set_config('role','postgres',true);
 if not exists(select 1 from public.absences where id=ida and employee_id=ea and company_id=a) or not exists(select 1 from public.absences where id=idb and employee_id=eb and company_id=b) then raise exception 'Absence assigned to wrong company'; end if;
 if not exists(select 1 from public.absences where id=idc and employee_id=eb and absence_type='Home-Office') or not exists(select 1 from public.absences where id=idd and employee_id=eb and absence_type='Kind Krank') then raise exception 'Current portal categories missing'; end if;
 if (select count(*) from public.audit_events where entity_id in (ida,idb) and event_type='ABSENCE_REQUEST_CREATED')<>2 then raise exception 'Audit events missing'; end if;
end $test$;
