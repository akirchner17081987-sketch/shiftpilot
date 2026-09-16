begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

-- Exactly one assertion per allowlisted authenticated SECURITY DEFINER RPC.
select plan(35);

-- The fixture is deliberately fictitious and the enclosing transaction always rolls back.
insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('00000000-0000-0000-0000-000000000000','11111111-1111-4111-8111-111111111111','authenticated','authenticated',
   'rpc-owner-a@example.invalid',crypt('not-a-real-password',gen_salt('bf')),now(),
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('00000000-0000-0000-0000-000000000000','22222222-2222-4222-8222-222222222222','authenticated','authenticated',
   'rpc-owner-b@example.invalid',crypt('not-a-real-password',gen_salt('bf')),now(),
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('00000000-0000-0000-0000-000000000000','33333333-3333-4333-8333-333333333333','authenticated','authenticated',
   'rpc-no-tenant@example.invalid',crypt('not-a-real-password',gen_salt('bf')),now(),
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());

insert into public.companies(id,name,created_by) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','RPC Wegwerf-Mandant A','11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','RPC Wegwerf-Mandant B','22222222-2222-4222-8222-222222222222');

insert into public.company_members(company_id,user_id,role,status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','OWNER','ACTIVE'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','OWNER','ACTIVE');

insert into public.employees(
  id,company_id,first_name,last_name,personnel_no,status,auth_user_id,access_status
) values
  ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Erika','Mandant A','RPC-A-001','active','11111111-1111-4111-8111-111111111111','ACTIVE'),
  ('b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'Max','Mandant B','RPC-B-001','active','22222222-2222-4222-8222-222222222222','ACTIVE');

insert into public.shift_templates(company_id,code,name,default_start,default_end)
values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','RPCB','Fiktive B-Schicht','08:00','16:00');

insert into public.shift_assignments(
  id,company_id,employee_id,shift_code,starts_at,ends_at,status,published_at,created_by
) values(
  'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1','RPCB',
  '2026-09-10 08:00:00+00','2026-09-10 16:00:00+00','PUBLISHED','2026-09-01 00:00:00+00',
  '22222222-2222-4222-8222-222222222222'
);

insert into public.shift_change_requests(
  id,company_id,assignment_id,action,employee_id,base_version,old_snapshot,proposed_snapshot,
  reason_code,reason_text,predictable,compliance_status,status,requires_employee_approval,
  requires_works_council,requested_by
) values(
  'b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2','UPDATE',
  'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1',1,
  '{"type":"RPCB","startsAt":"2026-09-10T08:00:00Z","endsAt":"2026-09-10T16:00:00Z"}'::jsonb,
  '{"employeeId":"b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1","type":"RPCB","startsAt":"2026-09-10T09:00:00Z","endsAt":"2026-09-10T17:00:00Z","breakMinutes":30}'::jsonb,
  'OTHER','Fiktiver Fremdmandantentest','UNKNOWN','GREEN','PENDING_EMPLOYEE',true,false,
  '22222222-2222-4222-8222-222222222222'
);

insert into public.company_member_invites(
  id,company_id,email,role,token_hash,status,expires_at,created_by
) values(
  'b4b4b4b4-b4b4-4b4b-8b4b-b4b4b4b4b4b4','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'invite-b@example.invalid','VIEWER',repeat('b',64),'INVITED',now()+interval '7 days',
  '22222222-2222-4222-8222-222222222222'
);

insert into public.time_qr_terminals(
  id,company_id,name,location_note,token_hash,is_active,pilot_mode,pilot_employee_id,created_by,updated_by
) values(
  'b5b5b5b5-b5b5-4b5b-8b5b-b5b5b5b5b5b5','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'RPC-Terminal B','Fiktiver Standort',digest(repeat('b',64),'sha256'),true,true,
  'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1','22222222-2222-4222-8222-222222222222',
  '22222222-2222-4222-8222-222222222222'
);

insert into public.time_qr_pilot_employees(terminal_id,employee_id,company_id,created_by)
values(
  'b5b5b5b5-b5b5-4b5b-8b5b-b5b5b5b5b5b5','b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222'
);

insert into public.push_subscriptions(company_id,user_id,endpoint,p256dh,auth_key,user_agent)
values(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222',
  'https://push.example.invalid/rpc-tenant-b',repeat('p',40),'fictitious-auth-key','RPC test fixture'
);

create or replace function pg_temp.rpc_auth_rejected(p_sql text)
returns boolean language plpgsql as $function$
declare v_message text;
begin
  execute p_sql;
  return false;
exception when others then
  v_message:=sqlerrm;
  return v_message ~* '(berechtig|membership|required|authenticat|angemeld|signed-in|inhaber|administrator|mitarbeiter|zugang|forbidden|denied)';
end;
$function$;

create or replace function pg_temp.rpc_preserves_count(p_call text,p_probe text)
returns boolean language plpgsql as $function$
declare v_before bigint; v_after bigint;
begin
  execute p_probe into v_before;
  execute p_call;
  execute p_probe into v_after;
  return v_before=v_after;
exception when others then
  return false;
end;
$function$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","aal":"aal2","sub":"11111111-1111-4111-8111-111111111111"}',
  true
);

-- Group A: company-scoped manager RPCs. Actor A must not access company B.
-- rpc: manager_close_time_month
select ok(pg_temp.rpc_auth_rejected($call$select public.manager_close_time_month('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',date '2026-08-01','foreign')$call$),'manager_close_time_month rejects company B');
-- rpc: manager_create_company_invite
select ok(pg_temp.rpc_auth_rejected($call$select public.manager_create_company_invite('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','new-b@example.invalid','VIEWER',repeat('c',64))$call$),'manager_create_company_invite rejects company B');
-- rpc: manager_create_time_qr_terminal
select ok(pg_temp.rpc_auth_rejected($call$select public.manager_create_time_qr_terminal('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Foreign terminal','')$call$),'manager_create_time_qr_terminal rejects company B');
-- rpc: manager_import_month_matrix
select ok(pg_temp.rpc_auth_rejected($call$select public.manager_import_month_matrix('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','[]'::jsonb,false)$call$),'manager_import_month_matrix rejects company B');
-- rpc: manager_list_company_users
select ok(pg_temp.rpc_auth_rejected($call$select * from public.manager_list_company_users('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$call$),'manager_list_company_users rejects company B');
-- rpc: manager_list_time_entries
select ok(pg_temp.rpc_auth_rejected($call$select * from public.manager_list_time_entries('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',date '2026-09-01',date '2026-09-30')$call$),'manager_list_time_entries rejects company B');
-- rpc: manager_list_time_qr_pilot_candidates
select ok(pg_temp.rpc_auth_rejected($call$select * from public.manager_list_time_qr_pilot_candidates('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$call$),'manager_list_time_qr_pilot_candidates rejects company B');
-- rpc: manager_list_time_qr_terminals
select ok(pg_temp.rpc_auth_rejected($call$select * from public.manager_list_time_qr_terminals('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$call$),'manager_list_time_qr_terminals rejects company B');
-- rpc: manager_log_datev_lodas_export
select ok(pg_temp.rpc_auth_rejected($call$select public.manager_log_datev_lodas_export('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',date '2026-08-01',1,repeat('d',64))$call$),'manager_log_datev_lodas_export rejects company B');
-- rpc: manager_monthly_holidays
select ok(pg_temp.rpc_auth_rejected($call$select public.manager_monthly_holidays('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',date '2026-09-01')$call$),'manager_monthly_holidays rejects company B');
-- rpc: manager_monthly_time_accounts
select ok(pg_temp.rpc_auth_rejected($call$select public.manager_monthly_time_accounts('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',date '2026-09-01')$call$),'manager_monthly_time_accounts rejects company B');
-- rpc: manager_reopen_time_month
select ok(pg_temp.rpc_auth_rejected($call$select public.manager_reopen_time_month('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',date '2026-08-01','foreign')$call$),'manager_reopen_time_month rejects company B');
-- rpc: manager_time_month_status
select ok(pg_temp.rpc_auth_rejected($call$select public.manager_time_month_status('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',date '2026-09-01')$call$),'manager_time_month_status rejects company B');
-- rpc: manager_time_report_bundle
select ok(pg_temp.rpc_auth_rejected($call$select public.manager_time_report_bundle('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',date '2026-09-01','b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1')$call$),'manager_time_report_bundle rejects company B');
-- rpc: manager_update_time_account_settings
select ok(pg_temp.rpc_auth_rejected($call$select public.manager_update_time_account_settings('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',date '2026-01-01',array['Urlaub']::text[])$call$),'manager_update_time_account_settings rejects company B');
-- rpc: manager_update_time_account_settings_v2
select ok(pg_temp.rpc_auth_rejected($call$select public.manager_update_time_account_settings_v2('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',date '2026-01-01',array['Urlaub']::text[],'DE')$call$),'manager_update_time_account_settings_v2 rejects company B');

-- Group B: entity-scoped manager RPCs. Every target entity belongs to company B.
-- rpc: manager_review_time_entry
select ok(pg_temp.rpc_auth_rejected($call$select public.manager_review_time_entry('b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2','APPROVED','foreign')$call$),'manager_review_time_entry rejects assignment B');
-- rpc: manager_revoke_company_invite
select ok(pg_temp.rpc_auth_rejected($call$select public.manager_revoke_company_invite('b4b4b4b4-b4b4-4b4b-8b4b-b4b4b4b4b4b4')$call$),'manager_revoke_company_invite rejects invite B');
-- rpc: manager_rotate_time_qr_terminal
select ok(pg_temp.rpc_auth_rejected($call$select public.manager_rotate_time_qr_terminal('b5b5b5b5-b5b5-4b5b-8b5b-b5b5b5b5b5b5')$call$),'manager_rotate_time_qr_terminal rejects terminal B');
-- rpc: manager_save_time_entry
select ok(pg_temp.rpc_auth_rejected($call$select public.manager_save_time_entry('b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2','2026-09-10 08:00:00+00','2026-09-10 16:00:00+00',30,'foreign',false)$call$),'manager_save_time_entry rejects assignment B');
-- rpc: manager_set_time_account_opening
select ok(pg_temp.rpc_auth_rejected($call$select public.manager_set_time_account_opening('b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1',date '2026-01-01',0,'foreign')$call$),'manager_set_time_account_opening rejects employee B');
-- rpc: manager_set_time_qr_terminal_active
select ok(pg_temp.rpc_auth_rejected($call$select public.manager_set_time_qr_terminal_active('b5b5b5b5-b5b5-4b5b-8b5b-b5b5b5b5b5b5',false)$call$),'manager_set_time_qr_terminal_active rejects terminal B');
-- rpc: manager_set_time_qr_terminal_mode
select ok(pg_temp.rpc_auth_rejected($call$select public.manager_set_time_qr_terminal_mode('b5b5b5b5-b5b5-4b5b-8b5b-b5b5b5b5b5b5',false)$call$),'manager_set_time_qr_terminal_mode rejects terminal B');
-- rpc: manager_set_time_qr_terminal_pilot_employee
select ok(pg_temp.rpc_auth_rejected($call$select public.manager_set_time_qr_terminal_pilot_employee('b5b5b5b5-b5b5-4b5b-8b5b-b5b5b5b5b5b5','b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1')$call$),'manager_set_time_qr_terminal_pilot_employee rejects terminal B');
-- rpc: manager_set_time_qr_terminal_pilot_employees
select ok(pg_temp.rpc_auth_rejected($call$select public.manager_set_time_qr_terminal_pilot_employees('b5b5b5b5-b5b5-4b5b-8b5b-b5b5b5b5b5b5',array['b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1'::uuid])$call$),'manager_set_time_qr_terminal_pilot_employees rejects terminal B');
-- rpc: manager_update_company_member
select ok(pg_temp.rpc_auth_rejected($call$select public.manager_update_company_member('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','ADMIN','ACTIVE')$call$),'manager_update_company_member rejects member B');

-- Group C: employee RPCs. Employee/user A must not use entities or QR terminals of B.
-- rpc: employee_clock_from_qr
select ok(pg_temp.rpc_auth_rejected($call$select public.employee_clock_from_qr(repeat('b',64),'IN')$call$),'employee_clock_from_qr rejects terminal B');
-- rpc: employee_qr_time_status
select ok(pg_temp.rpc_auth_rejected($call$select public.employee_qr_time_status(repeat('b',64))$call$),'employee_qr_time_status rejects terminal B');
-- rpc: employee_respond_to_shift_change
select ok(pg_temp.rpc_auth_rejected($call$select * from public.employee_respond_to_shift_change('b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3','APPROVED','foreign')$call$),'employee_respond_to_shift_change rejects request B');
-- rpc: employee_submit_time_entry
select ok(pg_temp.rpc_auth_rejected($call$select public.employee_submit_time_entry('b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2','2026-09-10 08:00:00+00','2026-09-10 16:00:00+00',30,'foreign')$call$),'employee_submit_time_entry rejects assignment B');

-- employee_my_time_account_month has no tenant/entity argument. A user without an employee
-- link must not inherit or discover the existing company-B employee context.
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","aal":"aal2","sub":"33333333-3333-4333-8333-333333333333"}',
  true
);
-- rpc: employee_my_time_account_month
select ok(pg_temp.rpc_auth_rejected($call$select public.employee_my_time_account_month(date '2026-09-01')$call$),'employee_my_time_account_month rejects a user without own employee context');

-- Group D: push/global RPCs. Restore actor A, then target company-B state.
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","aal":"aal2","sub":"11111111-1111-4111-8111-111111111111"}',
  true
);
-- rpc: register_push_subscription
select ok(pg_temp.rpc_auth_rejected($call$select public.register_push_subscription('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','https://push.example.invalid/rpc-foreign-registration',repeat('q',40),'foreign-auth-key','RPC test')$call$),'register_push_subscription rejects company B');
-- rpc: send_push_test
select ok(pg_temp.rpc_auth_rejected($call$select public.send_push_test('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$call$),'send_push_test rejects company B');
-- rpc: unregister_push_subscription
select ok(
  pg_temp.rpc_preserves_count(
    $call$select public.unregister_push_subscription('https://push.example.invalid/rpc-tenant-b')$call$,
    $probe$select count(*) from public.push_subscriptions where endpoint='https://push.example.invalid/rpc-tenant-b'$probe$
  ),
  'unregister_push_subscription cannot remove company-B endpoint owned by user B'
);

-- get_push_public_key has no company argument. A user without any active membership or employee
-- link must not receive the shared public key.
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","aal":"aal2","sub":"33333333-3333-4333-8333-333333333333"}',
  true
);
-- rpc: get_push_public_key
select ok(pg_temp.rpc_auth_rejected($call$select public.get_push_public_key()$call$),'get_push_public_key rejects a user without active tenant context');

select jsonb_build_object(
  'planned',35,
  'executed',_currtest(),
  'failed',num_failed(),
  'groups',jsonb_build_array('manager-company','manager-entity','employee','push-global')
) as pgtap_summary;
select * from finish();
rollback;

