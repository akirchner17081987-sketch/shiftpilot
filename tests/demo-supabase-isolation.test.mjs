import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const adapter=fs.readFileSync(new URL('../assets/demo-marketplace-v1.js',import.meta.url),'utf8');
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
