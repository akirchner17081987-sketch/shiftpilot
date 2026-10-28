begin;
do $test$
declare c uuid:=gen_random_uuid(); other_c uuid:=gen_random_uuid();
 admin_ uuid:=gen_random_uuid(); lead_ uuid:=gen_random_uuid(); outsider_ uuid:=gen_random_uuid();
 emp_ uuid:=gen_random_uuid(); terminal_ uuid:=gen_random_uuid(); shift_ uuid:=gen_random_uuid(); break_ uuid:=gen_random_uuid();
 count_ int; now_ timestamptz:=clock_timestamp(); shift2_ uuid:=gen_random_uuid(); assign_ uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email) values(admin_,'fake-admin@example.invalid'),(lead_,'fake-lead@example.invalid'),(outsider_,'fake-outside@example.invalid');
 insert into public.companies(id,name,created_by) values(c,'Fake test company',admin_),(other_c,'Fake other company',outsider_);
 insert into public.company_members(company_id,user_id,role,status,access_role) values
 (c,admin_,'ADMIN','ACTIVE','ADMIN'),(c,lead_,'PLANNER','ACTIVE','TEAM_LEAD'),(other_c,outsider_,'ADMIN','ACTIVE','ADMIN');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_,'role','authenticated','aal','aal2')::text,true);
 insert into public.employees(id,company_id,first_name,last_name,personnel_no) values(emp_,c,'Test','Mitarbeiter','TEST-123');
 insert into public.time_qr_terminals(id,company_id,name,token_hash) values(terminal_,c,'Fake terminal',decode(repeat('aa',32),'hex'));
 insert into public.time_qr_independent_shifts(id,company_id,employee_id,terminal_id,started_at) values(shift_,c,emp_,terminal_,clock_timestamp()-interval '3 hours');
 insert into public.time_qr_independent_breaks(id,shift_id,ordinal,started_at,ended_at) values
 (break_,shift_,1,now_-interval '1 hour 45 minutes',now_-interval '1 hour');
 perform private.sf_notify_long_qr_breaks();
 if exists(select 1 from public.notifications where kind='QR_BREAK_OVER_LIMIT' and entity_id=shift_) then raise exception '45 minutes alerted'; end if;
 update public.time_qr_independent_breaks set started_at=now_-interval '2 hours' where id=break_;
 perform private.sf_notify_long_qr_breaks();
 select count(*) into count_ from public.notifications where kind='QR_BREAK_OVER_LIMIT' and entity_id=shift_;
 if count_<>0 then raise exception 'exactly 60 minutes raised notification'; end if;
 update public.time_qr_independent_breaks set ended_at=ended_at+interval '1 second' where id=break_;
 perform private.sf_notify_long_qr_breaks();
 select count(*) into count_ from public.notifications where kind='QR_BREAK_OVER_LIMIT' and entity_id=shift_;
 if count_<>2 then raise exception 'expected 2 admin/team lead notifications, got %',count_; end if;
 if exists(select 1 from public.notifications where kind='QR_BREAK_OVER_LIMIT' and entity_id=shift_ and user_id=outsider_) then raise exception 'cross company alert'; end if;
 if exists(select 1 from private.push_dispatches p join public.notifications n on n.id=p.notification_id where n.kind='QR_BREAK_OVER_LIMIT' and n.entity_id=shift_) then raise exception 'push was enqueued'; end if;
 perform private.sf_notify_long_qr_breaks();
 select count(*) into count_ from public.notifications where kind='QR_BREAK_OVER_LIMIT' and entity_id=shift_;
 if count_<>2 then raise exception 'duplicate notifications'; end if;
 update public.time_qr_independent_shifts set ended_at=now_ where id=shift_;
 insert into public.time_qr_independent_shifts(id,company_id,employee_id,terminal_id,started_at)
 values(shift2_,c,emp_,terminal_,now_-interval '25 hours');
 insert into public.time_qr_independent_breaks(shift_id,ordinal,started_at,ended_at) values
 (shift2_,1,now_-interval '24 hours',now_-interval '23 hours 25 minutes');
 perform private.sf_notify_long_qr_breaks();
 if exists(select 1 from public.notifications where kind='QR_BREAK_OVER_LIMIT' and entity_id=shift2_) then raise exception '35 minute pause alerted'; end if;
 insert into public.time_qr_independent_breaks(shift_id,ordinal,started_at) values(shift2_,2,clock_timestamp()-interval '26 minutes');
 perform private.sf_notify_long_qr_breaks();
 select count(*) into count_ from public.notifications where kind='QR_BREAK_OVER_LIMIT' and entity_id=shift2_;
 if count_<>2 then raise exception 'split and ongoing pause failed, got %',count_; end if;
 insert into public.shift_templates(company_id,code,name,default_start,default_end) values(c,'TEST','Test','09:00','17:00');
 insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at)
 values(assign_,c,emp_,'TEST',now_-interval '4 hours',now_+interval '4 hours');
 insert into public.time_entries(assignment_id,company_id,actual_start,status)
 values(assign_,c,now_-interval '4 hours','open');
 insert into public.time_qr_breaks(company_id,terminal_id,assignment_id,employee_id,started_at,ended_at)
 values(c,terminal_,assign_,emp_,now_-interval '2 hours',now_-interval '59 minutes');
 perform private.sf_notify_long_qr_breaks();
 select count(*) into count_ from public.notifications where kind='QR_BREAK_OVER_LIMIT' and entity_id=assign_;
 if count_<>2 then raise exception 'assigned QR flow failed, got %',count_; end if;
end
$test$;
rollback;
select 'boundary, recipients, company isolation, no push, duplicates, split/ongoing and assigned QR passed' as result;
