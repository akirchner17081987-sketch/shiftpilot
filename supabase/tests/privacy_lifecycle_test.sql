begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(23);

-- This fixture is intentionally fictitious and rolls back completely.
select set_config('request.jwt.claim.role','service_role',true);

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','authenticated','authenticated',
   'privacy-owner@example.invalid',crypt('not-a-real-password',gen_salt('bf')),now(),
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('00000000-0000-0000-0000-000000000000','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','authenticated','authenticated',
   'privacy-approver@example.invalid',crypt('not-a-real-password',gen_salt('bf')),now(),
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('00000000-0000-0000-0000-000000000000','abababab-abab-4aba-8aba-abababababab','authenticated','authenticated',
   'privacy-employee@example.invalid',crypt('not-a-real-password',gen_salt('bf')),now(),
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());

insert into public.companies(id,name,created_by)
values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','DSFA Wegwerf-Testmandant','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

insert into public.company_members(company_id,user_id,role,status) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','OWNER','ACTIVE'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','ADMIN','ACTIVE'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','abababab-abab-4aba-8aba-abababababab','EMPLOYEE','ACTIVE');

insert into public.employees(
  id,company_id,first_name,last_name,personnel_no,contract_end,status,auth_user_id,access_status
) values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'Erika','Test','TEST-DSFA-001',current_date-31,'inactive',
  'abababab-abab-4aba-8aba-abababababab','DISABLED'
);

insert into private.privacy_retention_profiles(
  id,company_id,version,status,rules,created_by,approved_by,approved_at
) values (
  'ffffffff-ffff-4fff-8fff-ffffffffffff','cccccccc-cccc-4ccc-8ccc-cccccccccccc',1,'APPROVED',
  '{"contactDays":30,"personnelYears":3,"payrollYears":6}'::jsonb,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',now()
);

select is(
  private.sf_employee_offboarding_preview(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd',current_date-31
  )->>'execution_enabled','false','preview never enables execution'
);

select is(
  private.sf_employee_offboarding_preview(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd',current_date-31
  )->>'employee_id','dddddddd-dddd-4ddd-8ddd-dddddddddddd','preview is bound to test employee'
);

select is(
  private.sf_employee_offboarding_preview(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd',current_date-31
  )->>'version','2','expanded preview version is active'
);

select ok(
  (private.sf_employee_offboarding_preview(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd',current_date-31
  )->'counts') ?& array[
    'access_invites','assignment_confirmations','time_entries','time_account_openings',
    'shift_change_requests','shift_swap_requests','disruption_incidents','disruption_offers',
    'personnel_details','notifications','push_subscriptions','audit_payload_references',
    'month_snapshot_references','restricting_auth_references','cascading_auth_references',
    'set_null_auth_references'
  ],
  'expanded preview inventories every offboarding data domain'
);

select is(
  private.sf_employee_offboarding_preview(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd',current_date-31
  )->'auth_user_ids'->>0,
  'abababab-abab-4aba-8aba-abababababab',
  'preview is bound to the employee auth account'
);

select is(
  private.sf_employee_offboarding_preview(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd',current_date-31
  )->'auth_reference_counts'->'memberships'->>'current_company',
  '1','preview identifies the current company membership'
);

select is(
  private.sf_employee_offboarding_preview(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd',current_date-31
  )->'auth_account'->>'delete_eligible_after_session_revoke',
  'true','account is eligible only after the expected current links are removed'
);

insert into public.companies(id,name,created_by)
values('dededede-dede-4ede-8ede-dededededede','Zweiter DSFA Wegwerf-Testmandant',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

insert into public.company_members(company_id,user_id,role,status)
values('dededede-dede-4ede-8ede-dededededede','abababab-abab-4aba-8aba-abababababab',
  'EMPLOYEE','ACTIVE');

select is(
  private.sf_employee_offboarding_preview(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd',current_date-31
  )->'counts'->>'other_company_memberships',
  '1','preview detects another company membership linked to the same auth account'
);

select is(
  private.sf_employee_offboarding_preview(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd',current_date-31
  )->'auth_account'->>'delete_eligible_after_session_revoke',
  'false','another company membership blocks auth account deletion'
);

select ok(
  private.server_stage_employee_offboarding(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Fiktiver Test ohne Produktivdaten',current_date-31
  ) is not null,
  'staging creates an idempotent request'
);

select is(
  (select status from private.privacy_lifecycle_requests where idempotency_key='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  'PENDING_APPROVAL','new request awaits approval'
);

select throws_ok(
  $$select private.server_approve_privacy_request(
    (select id from private.privacy_lifecycle_requests where idempotency_key='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','ffffffff-ffff-4fff-8fff-ffffffffffff',null
  )$$,
  'P0001','Two-person approval required','requester cannot approve own request'
);

select is(
  private.server_approve_privacy_request(
    (select id from private.privacy_lifecycle_requests where idempotency_key='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','ffffffff-ffff-4fff-8fff-ffffffffffff',null
  )->>'status','APPROVED','second owner/admin can approve'
);

insert into private.privacy_legal_holds(
  id,company_id,employee_id,category,status,reason,created_by
) values (
  '99999999-9999-4999-8999-999999999999','cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','ALL','ACTIVE',
  'Fiktiver Rechtsstreit für Sperrtest','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

select is(private.server_claim_due_privacy_request('worker-test-0001')::text,null::text,
  'active legal hold blocks worker claim');

update private.privacy_legal_holds set
  status='RELEASED',released_by='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',released_at=now()
where id='99999999-9999-4999-8999-999999999999';

select is(private.server_claim_due_privacy_request('worker-test-0001')->>'status','EXECUTING',
  'released hold permits atomic claim');
select is(private.server_claim_due_privacy_request('worker-test-0002')::text,null::text,
  'second worker cannot claim executing request');

select throws_ok(
  $$select private.server_finish_privacy_request(
    (select id from private.privacy_lifecycle_requests where idempotency_key='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
    'worker-test-wrong',true,'{}'::jsonb,null
  )$$,
  'P0001','Worker does not own executing request','wrong worker cannot finish request'
);

select is(
  private.server_finish_privacy_request(
    (select id from private.privacy_lifecycle_requests where idempotency_key='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
    'worker-test-0001',true,'{"database":"not-executed","storage":"not-executed"}'::jsonb,null
  )->>'status','COMPLETED','owning worker can complete test request'
);

select is(
  (select attempt_count::text from private.privacy_lifecycle_requests where idempotency_key='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  '1','claim increments attempt counter once'
);

select lives_ok(
  $$select private.server_stage_employee_offboarding(
    '12121212-1212-4212-8212-121212121212','cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Fiktiver Test einer zeitlich befristeten Sperre',current_date-31
  )$$,
  'a second request can be staged for timed-hold testing'
);

select is(
  private.server_approve_privacy_request(
    (select id from private.privacy_lifecycle_requests where idempotency_key='12121212-1212-4212-8212-121212121212'),
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','ffffffff-ffff-4fff-8fff-ffffffffffff',now()+interval '1 day'
  )->>'status','APPROVED','timed hold preserves approved state'
);

select is(private.server_claim_due_privacy_request('worker-test-0003')::text,null::text,
  'future inline legal hold blocks worker claim');

update private.privacy_lifecycle_requests set legal_hold_until=now()-interval '1 second'
where idempotency_key='12121212-1212-4212-8212-121212121212';

select is(private.server_claim_due_privacy_request('worker-test-0003')->>'status','EXECUTING',
  'expired inline legal hold becomes claimable automatically');

select * from finish();
rollback;
