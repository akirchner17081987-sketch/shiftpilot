import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260906164859_version_time_tracking_and_accounts.sql',import.meta.url),'utf8');
const companyUserGrantRepair=fs.readFileSync(new URL('../supabase/migrations/20260906172659_restore_company_user_check_execute.sql',import.meta.url),'utf8');
const privateHelperPermissions=fs.readFileSync(new URL('../supabase/migrations/20260906173512_restore_authenticated_private_helper_permissions.sql',import.meta.url),'utf8');

const rpcSignatures=[
  'manager_list_time_entries(uuid,date,date)',
  'manager_save_time_entry(uuid,timestamptz,timestamptz,integer,text,boolean)',
  'manager_review_time_entry(uuid,text,text)',
  'employee_submit_time_entry(uuid,timestamptz,timestamptz,integer,text)',
  'manager_update_time_account_settings(uuid,date,text[])',
  'manager_update_time_account_settings_v2(uuid,date,text[],text)',
  'manager_set_time_account_opening(uuid,date,integer,text)',
  'manager_monthly_time_accounts(uuid,date)',
  'employee_my_time_account_month(date)',
  'manager_monthly_holidays(uuid,date)',
  'manager_time_report_bundle(uuid,date,uuid)',
  'manager_time_month_status(uuid,date)',
  'manager_close_time_month(uuid,date,text)',
  'manager_reopen_time_month(uuid,date,text)'
];

test('all time tracking RPCs are versioned and explicitly protected',()=>{
  for(const signature of rpcSignatures){
    const name=signature.slice(0,signature.indexOf('('));
    assert.match(sql,new RegExp(`create or replace function public\\.${name}\\s*\\(`,'i'),`${name} definition missing`);
    assert.ok(sql.toLowerCase().includes(`revoke all on function public.${signature} from public,anon;`),`${signature} revoke missing`);
    assert.ok(sql.toLowerCase().includes(`grant execute on function public.${signature} to authenticated;`),`${signature} grant missing`);
  }
});

test('security-definer functions use a fixed search path and tenant checks',()=>{
  const publicFunctions=[...sql.matchAll(/create or replace function public\.([a-z0-9_]+)[\s\S]*?\$\$;/gi)];
  assert.equal(publicFunctions.length,rpcSignatures.length);
  for(const match of publicFunctions){
    assert.match(match[0],/security definer/i,`${match[1]} must be SECURITY DEFINER`);
    assert.match(match[0],/set search_path=''/i,`${match[1]} must pin search_path`);
  }
  assert.match(sql,/private\.sf_is_manager\(p_company_id,false\)/);
  assert.match(sql,/private\.sf_employee_id\(\)/);
  assert.match(sql,/cm\.company_id=p_company_id[\s\S]*cm\.user_id=\(select auth\.uid\(\)\)/);
});

test('migration versions account storage, RLS, validation and month locking',()=>{
  for(const table of ['time_entries','time_account_settings','time_account_openings','time_month_closures']){
    assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security;`,'i'));
  }
  assert.match(sql,/Das tatsaechliche Ende darf nicht in der Zukunft liegen/);
  assert.match(sql,/time_entries_closed_month_guard/);
  assert.match(sql,/status in \('OPEN','CLOSED'\)/);
  assert.match(sql,/manager_time_report_bundle/);
  assert.match(sql,/notify pgrst,'reload schema';\s*commit;/i);
});

test('German state codes used by the UI are supported',()=>{
  for(const state of ['DE','DE-BW','DE-BY','DE-BE','DE-BB','DE-HB','DE-HH','DE-HE','DE-MV','DE-NI','DE-NW','DE-RP','DE-SL','DE-SN','DE-ST','DE-SH','DE-TH']){
    assert.ok(sql.includes(`'${state}'`),`${state} missing`);
  }
  assert.match(sql,/regexp_replace\(upper\(coalesce\(p_state,'DE'\)\),'\^DE-',''\)/);
});

test('authenticated company users retain the authorization helper required at login',()=>{
  assert.match(companyUserGrantRepair,/grant usage on schema private to authenticated/i);
  assert.match(companyUserGrantRepair,/revoke all on function private\.can_manage_company_users\(uuid\) from public, anon/i);
  assert.match(companyUserGrantRepair,/grant execute on function private\.can_manage_company_users\(uuid\) to authenticated/i);
});

test('authenticated application paths can execute every private helper they reference',()=>{
  const requiredHelpers=[
    'can_access_personnel_storage(text)',
    'employee_cancel_shift_swap_impl(uuid)',
    'employee_claim_shift_marketplace_impl(uuid,text)',
    'employee_create_shift_swap_impl(uuid,uuid,text)',
    'employee_list_disruption_offers_impl()',
    'employee_list_shift_marketplace_impl()',
    'employee_list_shift_swap_candidates_impl(uuid)',
    'employee_list_shift_swaps_impl()',
    'employee_offer_shift_marketplace_impl(uuid,text)',
    'employee_respond_disruption_offer_impl(uuid,text,text)',
    'employee_respond_shift_swap_impl(uuid,text,text)',
    'employee_submit_absence_request_impl(text,date,date,text,boolean,time,time,text)',
    'is_company_creator(uuid)',
    'manager_add_personnel_note_impl(uuid,text,text,text)',
    'manager_cancel_disruption_impl(uuid,text)',
    'manager_create_disruption_impl(uuid,uuid,text,text)',
    'manager_delete_personnel_document_impl(uuid)',
    'manager_delete_personnel_qualification_impl(uuid)',
    'manager_list_disruption_candidates_impl(uuid)',
    'manager_list_disruptions_impl(uuid)',
    'manager_list_shift_marketplace_impl(uuid)',
    'manager_personnel_deadline_dashboard_impl(uuid)',
    'manager_personnel_file_bundle_impl(uuid)',
    'manager_register_personnel_document_impl(uuid,text,text,text,text,text,bigint,date,date,text)',
    'manager_resolve_legacy_assignment_reviews_impl(uuid,uuid[],text)',
    'manager_review_absence_request_impl(uuid,text,text)',
    'manager_review_shift_swap_impl(uuid,text,text)',
    'manager_save_personnel_qualification_impl(uuid,uuid,text,text,text,text,date,date,text)',
    'manager_send_disruption_offers_impl(uuid,uuid[])',
    'manager_time_report_bundle_v2_impl(uuid,date,uuid)',
    'manager_update_personnel_details_impl(uuid,text,text,text,text,date,text,text,text)',
    'reset_schedule_impl(uuid,text)',
    'sf_is_manager(uuid,boolean)'
  ];
  const compact=privateHelperPermissions.replace(/\s+/g,'').toLowerCase();
  assert.match(privateHelperPermissions,/grant usage on schema private to authenticated/i);
  assert.match(privateHelperPermissions,/from public, anon;/i);
  assert.match(privateHelperPermissions,/to authenticated;/i);
  for(const signature of requiredHelpers){
    assert.ok(compact.includes(`private.${signature}`),`${signature} permission missing`);
  }
});
