import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const adapter=fs.readFileSync(new URL('../assets/demo-marketplace-v1.js',import.meta.url),'utf8');
const qrBridge=fs.readFileSync(new URL('../assets/demo-qr-local-bridge-v1.js',import.meta.url),'utf8');
const navigation=fs.readFileSync(new URL('../assets/navigation-compat-v1.js',import.meta.url),'utf8');
const auth=fs.readFileSync(new URL('../assets/supabase-auth-v1.js',import.meta.url),'utf8');
const mode=fs.readFileSync(new URL('../assets/demo-mode-v1.js',import.meta.url),'utf8');
const marketplace=fs.readFileSync(new URL('../assets/supabase-shift-marketplace-v1.js',import.meta.url),'utf8');

test('demo client is fail-closed and blocks Supabase transports',()=>{
  assert.match(adapter,/SF_DEMO_UNHANDLED/);
  assert.match(adapter,/SF_DEMO_NETWORK_BLOCKED/);
  assert.match(adapter,/__sfDemoLocalClientV1/);
  assert.doesNotMatch(adapter,/return originalRpc\(/);
  assert.doesNotMatch(adapter,/\|\|originalFrom\(/);
});

test('demo supplies local handlers for previously leaking calls',()=>{
  for(const name of ['shift_swap_requests','time_account_settings','manager_monthly_holidays','employee_list_shift_marketplace','employee_offer_shift_marketplace','employee_claim_shift_marketplace','employee_cancel_shift_swap'])assert.match(adapter,new RegExp(name));
  for(const name of ['manager_list_time_qr_terminals','manager_list_time_qr_pilot_candidates'])assert.match(qrBridge,new RegExp(name));
  assert.match(qrBridge,/__sfDemoLocalClientV1/);
  assert.match(qrBridge,/return \{data:\[\],error:null\}/);
  assert.match(navigation,/demo-qr-local-bridge-v1\.js/);
  assert.ok(navigation.indexOf('demo-qr-local-bridge-v1.js')<navigation.indexOf('supabase-qr-terminal-admin-v1.js'));
});

test('employee marketplace loads independently and never stays on an endless placeholder',()=>{
  assert.match(marketplace,/employeeBusy\s*=\s*false/);
  assert.match(marketplace,/managerBusy\s*=\s*false/);
  assert.match(marketplace,/renderEmployeeError\(e\)/);
  assert.match(marketplace,/data-sf-employee-view=\"marketplace\"/);
  assert.match(marketplace,/sf:demo-perspective-change/);
});

test('cloud bootstrap skips Supabase SDK in an active demo session',()=>{
  assert.match(auth,/sf_demo_session_v1.*SFDemoDataClient/);
  assert.match(mode,/B\.ready=true/);
});
