begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(22);

-- All identities and records are fictitious; the transaction always rolls back.
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('00000000-0000-0000-0000-000000000000','10101010-1010-4010-8010-101010101010','authenticated','authenticated',
   'sole-owner@example.invalid',crypt('not-a-real-password',gen_salt('bf')),now(),
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('00000000-0000-0000-0000-000000000000','20202020-2020-4020-8020-202020202020','authenticated','authenticated',
   'sole-employee@example.invalid',crypt('not-a-real-password',gen_salt('bf')),now(),
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('00000000-0000-0000-0000-000000000000','30303030-3030-4030-8030-303030303030','authenticated','authenticated',
   'temporary-admin@example.invalid',crypt('not-a-real-password',gen_salt('bf')),now(),
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());

insert into public.companies(id,name,created_by)
values('40404040-4040-4040-8040-404040404040','Ein-OWNER Wegwerf-Testmandant',
  '10101010-1010-4010-8010-101010101010');

insert into public.company_members(company_id,user_id,role,status) values
  ('40404040-4040-4040-8040-404040404040','10101010-1010-4010-8010-101010101010','OWNER','ACTIVE'),
  ('40404040-4040-4040-8040-404040404040','20202020-2020-4020-8020-202020202020','VIEWER','ACTIVE');

insert into public.employees(
  id,company_id,first_name,last_name,personnel_no,contract_end,status,
  email,phone,note,auth_user_id,access_status
) values
  ('50505050-5050-4050-8050-505050505050','40404040-4040-4040-8040-404040404040',
   'Erika','Ein-OWNER-Test','SOLE-001',current_date-31,'active',
   'sole-employee@example.invalid','0000-TEST','Fiktiver Löschtest',
   '20202020-2020-4020-8020-202020202020','ACTIVE'),
  ('60606060-6060-4060-8060-606060606060','40404040-4040-4040-8040-404040404040',
   'Olivia','Owner-Test','SOLE-OWNER',null,'active',
   'sole-owner@example.invalid',null,'Fiktiver Sperrtest',
   '10101010-1010-4010-8010-101010101010','ACTIVE');

select lives_ok(
  $$select private.sf_assert_sole_owner(
    '40404040-4040-4040-8040-404040404040','10101010-1010-4010-8010-101010101010'
  )$$,
  'exactly one active owner and no admin enables the compensating mode'
);

insert into public.company_members(company_id,user_id,role,status)
values('40404040-4040-4040-8040-404040404040','30303030-3030-4030-8030-303030303030','ADMIN','ACTIVE');
select throws_ok(
  $$select private.server_stage_sole_owner_employee_offboarding(
    '70707070-7070-4070-8070-707070707070','40404040-4040-4040-8040-404040404040',
    '50505050-5050-4050-8050-505050505050','10101010-1010-4010-8010-101010101010',
    '11111111-1111-4111-8111-111111111111','Fiktiver Rollenwechsel-Test',current_date-31
  )$$,
  'P0001','SOLE_OWNER_MODE_NOT_AVAILABLE','an active admin disables sole-owner mode'
);
delete from public.company_members
where company_id='40404040-4040-4040-8040-404040404040'
  and user_id='30303030-3030-4030-8030-303030303030';

select throws_ok(
  $$select private.server_stage_sole_owner_employee_offboarding(
    '71717171-7171-4171-8171-717171717171','40404040-4040-4040-8040-404040404040',
    '60606060-6060-4060-8060-606060606060','10101010-1010-4010-8010-101010101010',
    '11111111-1111-4111-8111-111111111111','Fiktiver OWNER-Sperrtest',current_date
  )$$,
  'P0001','SOLE_OWNER_TARGET_BLOCKED','the only owner account is a hard-blocked target'
);

select is(
  private.server_stage_sole_owner_retention_profile(
    '40404040-4040-4040-8040-404040404040',1,
    '{"contactDays":30,"personnelYears":3,"payrollYears":6}'::jsonb,
    '10101010-1010-4010-8010-101010101010','11111111-1111-4111-8111-111111111111',
    'Fiktive Kundenweisung AVV-TEST-001'
  )->>'status','DRAFT','retention profile starts in draft'
);

select throws_ok(
  $$select private.server_confirm_sole_owner_retention_profile(
    (select id from private.privacy_retention_profiles
      where company_id='40404040-4040-4040-8040-404040404040' and version=1),
    '10101010-1010-4010-8010-101010101010','22222222-2222-4222-8222-222222222222'
  )$$,
  'P0001','SOLE_OWNER_COOLING_OFF_ACTIVE','retention profile cannot be confirmed before 24 hours'
);

update private.privacy_retention_profiles set
  created_at=now()-interval '2 days',
  confirmation_not_before=now()-interval '1 day',
  confirmation_expires_at=now()+interval '5 days'
where company_id='40404040-4040-4040-8040-404040404040' and version=1;

select throws_ok(
  $$select private.server_confirm_sole_owner_retention_profile(
    (select id from private.privacy_retention_profiles
      where company_id='40404040-4040-4040-8040-404040404040' and version=1),
    '10101010-1010-4010-8010-101010101010','11111111-1111-4111-8111-111111111111'
  )$$,
  'P0001','NEW_AUTH_SESSION_REQUIRED','retention profile requires a new signed session'
);

select is(
  private.server_confirm_sole_owner_retention_profile(
    (select id from private.privacy_retention_profiles
      where company_id='40404040-4040-4040-8040-404040404040' and version=1),
    '10101010-1010-4010-8010-101010101010','22222222-2222-4222-8222-222222222222'
  )->>'status','APPROVED','unchanged retention profile is confirmed from a new session'
);

select ok(
  (select first_session_fingerprint <> '11111111-1111-4111-8111-111111111111'
      and confirmed_session_fingerprint <> '22222222-2222-4222-8222-222222222222'
      and length(first_session_fingerprint)=64 and length(confirmed_session_fingerprint)=64
   from private.privacy_retention_profiles
   where company_id='40404040-4040-4040-8040-404040404040' and version=1),
  'retention profile stores only SHA-256 session fingerprints'
);

select is(
  private.server_stage_sole_owner_retention_profile(
    '40404040-4040-4040-8040-404040404040',2,
    '{"contactDays":45,"personnelYears":3,"payrollYears":6}'::jsonb,
    '10101010-1010-4010-8010-101010101010','11111111-1111-4111-8111-111111111111',
    'Fiktive Kundenweisung AVV-TEST-002'
  )->>'status','DRAFT','second profile starts as an independent draft'
);
update private.privacy_retention_profiles set
  created_at=now()-interval '2 days',
  confirmation_not_before=now()-interval '1 day',
  confirmation_expires_at=now()+interval '5 days',
  rules='{"contactDays":60,"personnelYears":3,"payrollYears":6}'::jsonb
where company_id='40404040-4040-4040-8040-404040404040' and version=2;
select throws_ok(
  $$select private.server_confirm_sole_owner_retention_profile(
    (select id from private.privacy_retention_profiles
      where company_id='40404040-4040-4040-8040-404040404040' and version=2),
    '10101010-1010-4010-8010-101010101010','22222222-2222-4222-8222-222222222222'
  )$$,
  'P0001','RETENTION_PROFILE_CHANGED','changed retention rules require a new delayed approval'
);

select is(
  private.server_stage_sole_owner_employee_offboarding(
    '80808080-8080-4080-8080-808080808080','40404040-4040-4040-8040-404040404040',
    '50505050-5050-4050-8050-505050505050','10101010-1010-4010-8010-101010101010',
    '11111111-1111-4111-8111-111111111111','Fiktiver Ein-OWNER-Offboardingauftrag',current_date-31
  )->>'status','PENDING_APPROVAL','employee request waits for delayed confirmation'
);

update private.privacy_lifecycle_requests set
  requested_at=now()-interval '2 days',
  confirmation_not_before=now()-interval '1 day',
  confirmation_expires_at=now()+interval '5 days'
where idempotency_key='80808080-8080-4080-8080-808080808080';

select throws_ok(
  $$select private.server_confirm_sole_owner_privacy_request(
    (select id from private.privacy_lifecycle_requests where idempotency_key='80808080-8080-4080-8080-808080808080'),
    '10101010-1010-4010-8010-101010101010','11111111-1111-4111-8111-111111111111',
    (select id from private.privacy_retention_profiles where company_id='40404040-4040-4040-8040-404040404040' and version=1)
  )$$,
  'P0001','NEW_AUTH_SESSION_REQUIRED','employee request requires a new signed session'
);

insert into public.employee_access_invites(company_id,employee_id,email,token_hash,created_by)
values(
  '40404040-4040-4040-8040-404040404040','50505050-5050-4050-8050-505050505050',
  'preview-drift@example.invalid','fictitious-preview-drift-token',
  '10101010-1010-4010-8010-101010101010'
);
select throws_ok(
  $$select private.server_confirm_sole_owner_privacy_request(
    (select id from private.privacy_lifecycle_requests where idempotency_key='80808080-8080-4080-8080-808080808080'),
    '10101010-1010-4010-8010-101010101010','22222222-2222-4222-8222-222222222222',
    (select id from private.privacy_retention_profiles where company_id='40404040-4040-4040-8040-404040404040' and version=1)
  )$$,
  'P0001','OFFBOARDING_PREVIEW_CHANGED','preview drift restarts the approval process'
);
delete from public.employee_access_invites
where company_id='40404040-4040-4040-8040-404040404040'
  and employee_id='50505050-5050-4050-8050-505050505050';

insert into public.company_members(company_id,user_id,role,status)
values('40404040-4040-4040-8040-404040404040','30303030-3030-4030-8030-303030303030','ADMIN','ACTIVE');
select throws_ok(
  $$select private.server_confirm_sole_owner_privacy_request(
    (select id from private.privacy_lifecycle_requests where idempotency_key='80808080-8080-4080-8080-808080808080'),
    '10101010-1010-4010-8010-101010101010','22222222-2222-4222-8222-222222222222',
    (select id from private.privacy_retention_profiles where company_id='40404040-4040-4040-8040-404040404040' and version=1)
  )$$,
  'P0001','SOLE_OWNER_MODE_NOT_AVAILABLE','role drift cancels the compensating path'
);
delete from public.company_members
where company_id='40404040-4040-4040-8040-404040404040'
  and user_id='30303030-3030-4030-8030-303030303030';

insert into private.privacy_legal_holds(
  id,company_id,employee_id,category,status,reason,created_by
) values (
  '90909090-9090-4090-8090-909090909090','40404040-4040-4040-8040-404040404040',
  '50505050-5050-4050-8050-505050505050','ALL','ACTIVE',
  'Fiktiver Legal Hold für Ein-OWNER-Test','10101010-1010-4010-8010-101010101010'
);
select throws_ok(
  $$select private.server_confirm_sole_owner_privacy_request(
    (select id from private.privacy_lifecycle_requests where idempotency_key='80808080-8080-4080-8080-808080808080'),
    '10101010-1010-4010-8010-101010101010','22222222-2222-4222-8222-222222222222',
    (select id from private.privacy_retention_profiles where company_id='40404040-4040-4040-8040-404040404040' and version=1)
  )$$,
  'P0001','Erasure is subject to an active legal hold','an active legal hold blocks confirmation'
);
update private.privacy_legal_holds set status='RELEASED',
  released_by='10101010-1010-4010-8010-101010101010',released_at=now()
where id='90909090-9090-4090-8090-909090909090';

select is(
  private.server_confirm_sole_owner_privacy_request(
    (select id from private.privacy_lifecycle_requests where idempotency_key='80808080-8080-4080-8080-808080808080'),
    '10101010-1010-4010-8010-101010101010','22222222-2222-4222-8222-222222222222',
    (select id from private.privacy_retention_profiles where company_id='40404040-4040-4040-8040-404040404040' and version=1)
  )->>'status','APPROVED','valid delayed second confirmation approves the request'
);

select ok(
  (select requested_by=approved_by and approved_by=confirmed_by
   from private.privacy_lifecycle_requests where idempotency_key='80808080-8080-4080-8080-808080808080'),
  'sole-owner audit identifies the same owner for both separated confirmations'
);

select ok(
  (select first_session_fingerprint<>confirmed_session_fingerprint
      and length(first_session_fingerprint)=64 and length(confirmed_session_fingerprint)=64
   from private.privacy_lifecycle_requests where idempotency_key='80808080-8080-4080-8080-808080808080'),
  'employee request stores two different hashed session fingerprints'
);

select is(
  (select approval_mode from private.privacy_lifecycle_requests
   where idempotency_key='80808080-8080-4080-8080-808080808080'),
  'SOLE_OWNER_DELAYED','approved request retains its compensating-control mode'
);

select is(
  (select count(*)::text from private.privacy_lifecycle_requests
   where request_kind='COMPANY_OFFBOARDING' and approval_mode='SOLE_OWNER_DELAYED'),
  '0','sole-owner API never creates a company deletion request'
);

select is(
  private.server_stage_sole_owner_employee_offboarding(
    '81818181-8181-4181-8181-818181818181','40404040-4040-4040-8040-404040404040',
    '50505050-5050-4050-8050-505050505050','10101010-1010-4010-8010-101010101010',
    '33333333-3333-4333-8333-333333333333','Fiktiver Test eines abgelaufenen Auftrags',current_date-31
  )->>'status','PENDING_APPROVAL','second fictitious request starts pending'
);
update private.privacy_lifecycle_requests set
  requested_at=now()-interval '8 days',
  confirmation_not_before=now()-interval '7 days',
  confirmation_expires_at=now()-interval '1 day'
where idempotency_key='81818181-8181-4181-8181-818181818181';
select throws_ok(
  $$select private.server_confirm_sole_owner_privacy_request(
    (select id from private.privacy_lifecycle_requests where idempotency_key='81818181-8181-4181-8181-818181818181'),
    '10101010-1010-4010-8010-101010101010','44444444-4444-4444-8444-444444444444',
    (select id from private.privacy_retention_profiles where company_id='40404040-4040-4040-8040-404040404040' and version=1)
  )$$,
  'P0001','SOLE_OWNER_CONFIRMATION_EXPIRED','request expires after seven days'
);

select jsonb_build_object('planned',22,'executed',_currtest(),'failed',num_failed()) as pgtap_summary;
select * from finish();
rollback;
