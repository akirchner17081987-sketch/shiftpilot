begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

select is(
  (select count(*)::text from private.sf_mfa_protected_rpcs),
  '27','the reviewed AAL2 allowlist contains 27 sensitive RPCs'
);

select is(
  (select count(*)::text from private.sf_mfa_protected_rpcs where enabled),
  '0','the initial migration enables no production gate'
);

select results_eq(
  $$select rollout_stage,count(*)::bigint from private.sf_mfa_protected_rpcs group by rollout_stage order by rollout_stage$$,
  $$values (2::smallint,4::bigint),(3::smallint,8::bigint),(4::smallint,9::bigint),(5::smallint,6::bigint)$$,
  'the four rollout stages retain their reviewed function counts'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","aal":"aal1","sub":"abababab-abab-4aba-8aba-abababababab"}',
  true
);
select set_config('request.path','rpc/manager_list_company_users',true);

select lives_ok(
  $$select gateway.sf_enforce_staged_aal2()$$,
  'aal1 remains allowed while the reviewed stage is disabled'
);

update private.sf_mfa_protected_rpcs
set enabled=true,updated_at=now()
where rollout_stage=2;

select throws_ok(
  $$select gateway.sf_enforce_staged_aal2()$$,
  'P0001','MFA_REQUIRED','aal1 is rejected after the test-only stage activation'
);

select set_config('request.path','rest/v1/company_members',true);
select lives_ok(
  $$select gateway.sf_enforce_staged_aal2()$$,
  'non-RPC Data API requests are outside the staged gate'
);

select set_config('request.path','rpc/bootstrap_company',true);
select lives_ok(
  $$select gateway.sf_enforce_staged_aal2()$$,
  'an unlisted RPC remains outside the staged gate'
);

select set_config('request.path','rpc/manager_list_company_users',true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","aal":"aal2","sub":"abababab-abab-4aba-8aba-abababababab"}',
  true
);
select lives_ok(
  $$select gateway.sf_enforce_staged_aal2()$$,
  'aal2 passes an enabled protected RPC gate'
);

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select lives_ok(
  $$select gateway.sf_enforce_staged_aal2()$$,
  'service-role workers keep their separate trusted server boundary'
);

select ok(
  exists(
    select 1 from pg_roles
    where rolname='authenticator'
      and coalesce(array_to_string(rolconfig,','),'') like '%pgrst.db_pre_request=gateway.sf_enforce_staged_aal2%'
  ),
  'authenticator is configured to invoke the staged gate'
);

select jsonb_build_object(
  'planned',10,
  'executed',_currtest(),
  'failed',num_failed()
) as pgtap_summary;
select * from finish();
rollback;
