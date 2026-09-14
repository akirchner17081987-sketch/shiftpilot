import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const migration=fs.readFileSync(path.join(root,'supabase','migrations','20260914053105_staged_privileged_aal2_gate_v1.sql'),'utf8');
const stage2Activation=fs.readFileSync(path.join(root,'supabase','migrations','20260914053115_enable_privileged_aal2_stage_2.sql'),'utf8');

const stages={
  2:[
    'manager_list_company_users','manager_create_company_invite',
    'manager_revoke_company_invite','manager_update_company_member'
  ],
  3:[
    'manager_personnel_file_bundle','manager_update_personnel_details',
    'manager_save_personnel_qualification','manager_delete_personnel_qualification',
    'manager_register_personnel_document','manager_delete_personnel_document',
    'manager_add_personnel_note','manager_personnel_deadline_dashboard'
  ],
  4:[
    'manager_authorize_datev_lodas_export','manager_log_datev_lodas_export',
    'manager_time_report_bundle','manager_list_audit_events','manager_list_time_entries',
    'manager_monthly_time_accounts','manager_time_month_status',
    'manager_close_time_month','manager_reopen_time_month'
  ],
  5:[
    'manager_create_time_qr_terminal','manager_rotate_time_qr_terminal',
    'manager_set_time_qr_terminal_active','manager_set_time_qr_terminal_mode',
    'manager_set_time_qr_terminal_pilot_employee','manager_set_time_qr_terminal_pilot_employees'
  ]
};

test('initial staged migration is non-locking and protects its private configuration',()=>{
  assert.match(migration,/enabled boolean not null default false/i);
  const seed=migration.match(/values([\s\S]*?)on conflict \(function_name\)/i)?.[1]||'';
  assert.ok(seed);
  assert.doesNotMatch(seed,/,\s*true\s*\)/i);
  assert.match(migration,/enable row level security/i);
  assert.match(migration,/force row level security/i);
  assert.match(migration,/revoke all on table private\.sf_mfa_protected_rpcs from public, anon, authenticated/i);
  assert.match(migration,/create policy sf_mfa_protected_rpcs_deny_all[\s\S]*?to public[\s\S]*?using \(false\)[\s\S]*?with check \(false\)/i);
});

test('all 27 sensitive RPCs are assigned once to the reviewed rollout stages',()=>{
  const expected=Object.values(stages).flat();
  assert.equal(expected.length,27);
  for(const [stage,names] of Object.entries(stages)){
    for(const name of names){
      const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      assert.match(migration,new RegExp(`\\('${escaped}',\\s*${stage},[^\\n]+false\\)`));
    }
  }
  const inserted=[...migration.matchAll(/\('([a-z][a-z0-9_]*)',\s*[2-5],\s*'[^']+',\s*false\)/g)].map(x=>x[1]);
  assert.equal(inserted.length,27);
  assert.equal(new Set(inserted).size,27);
});

test('PostgREST gate applies only to enabled RPC paths and delegates to the shared AAL2 guard',()=>{
  assert.match(migration,/create schema if not exists gateway/i);
  assert.match(migration,/v_path not like 'rpc\/%'/i);
  assert.match(migration,/where p\.function_name = v_rpc\s+and p\.enabled/i);
  assert.match(migration,/perform private\.sf_assert_aal2\('rpc:' \|\| v_rpc\)/i);
  assert.match(migration,/alter role authenticator\s+set pgrst\.db_pre_request = 'gateway\.sf_enforce_staged_aal2'/i);
  assert.match(migration,/notify pgrst, 'reload config'/i);
});

test('stage 2 activation enables exactly its four RPCs and refuses later-stage drift',()=>{
  assert.match(stage2Activation,/where rollout_stage = 2/i);
  assert.match(stage2Activation,/v_enabled_stage_2 <> 4/i);
  assert.match(stage2Activation,/where rollout_stage between 3 and 5\s+and enabled/i);
  assert.match(stage2Activation,/v_enabled_later_stages <> 0/i);
  assert.doesNotMatch(stage2Activation,/where rollout_stage\s*=\s*[3-5]/i);
});
