import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorizeLifecycleRequest, parseLifecycleRequest } from '../supabase/functions/_shared/privacy-lifecycle.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const allowlist=JSON.parse(fs.readFileSync(path.join(root,'supabase','security-definer-allowlist.json'),'utf8'));
const verifier=fs.readFileSync(path.join(root,'supabase','tests','security_definer_allowlist.sql'),'utf8');
const lifecycle=fs.readFileSync(path.join(root,'supabase','migrations','20260913083032_privacy_lifecycle_v1.sql'),'utf8');

test('SECURITY DEFINER allowlist is exact and reviewable',()=>{
  assert.equal(allowlist.functions.length,35);
  assert.equal(new Set(allowlist.functions.map(x=>`${x.name}(${x.arguments})`)).size,35);
  for(const fn of allowlist.functions){
    assert.ok(fn.boundary.length>=8,`${fn.name} needs an authorization boundary`);
    assert.match(verifier,new RegExp(`'${fn.name}'`));
  }
  assert.match(verifier,/ANON_EXECUTE/);
  assert.match(verifier,/USER_METADATA_AUTHORIZATION/);
  assert.match(verifier,/DYNAMIC_SQL/);
});

test('privacy lifecycle remains private, idempotent and non-destructive in v1',()=>{
  assert.match(lifecycle,/idempotency_key uuid not null unique/i);
  assert.match(lifecycle,/PENDING_APPROVAL/);
  assert.match(lifecycle,/legal_hold_until/);
  assert.match(lifecycle,/execution_enabled', false/);
  assert.match(lifecycle,/revoke all on table private\.privacy_lifecycle_requests from public, anon, authenticated/i);
  assert.doesNotMatch(lifecycle,/\bdelete\s+from\s+public\./i);
  assert.doesNotMatch(lifecycle,/\bupdate\s+public\./i);
  assert.doesNotMatch(lifecycle,/cron\.schedule/i);
});

test('fictitious tenant can preview but staging requires owner/admin with MFA',()=>{
  const owner='11111111-1111-4111-8111-111111111111';
  const other='22222222-2222-4222-8222-222222222222';
  const company='33333333-3333-4333-8333-333333333333';
  const employee='44444444-4444-4444-8444-444444444444';
  const membership={company_id:company,user_id:owner,role:'OWNER',status:'ACTIVE'};
  const preview=parseLifecycleRequest({action:'preview',companyId:company,employeeId:employee});
  assert.equal(authorizeLifecycleRequest({membership,userId:owner,aal:'aal1',request:preview}),true);

  const stage=parseLifecycleRequest({action:'stage',companyId:company,employeeId:employee,
    idempotencyKey:'55555555-5555-4555-8555-555555555555',reason:'Fiktiver Offboarding-Test'});
  assert.throws(()=>authorizeLifecycleRequest({membership,userId:owner,aal:'aal1',request:stage}),/MFA_REQUIRED/);
  assert.equal(authorizeLifecycleRequest({membership,userId:owner,aal:'aal2',request:stage}),true);
  assert.throws(()=>authorizeLifecycleRequest({membership,userId:other,aal:'aal2',request:stage}),/FORBIDDEN/);
  assert.throws(()=>authorizeLifecycleRequest({membership:{...membership,role:'EMPLOYEE'},userId:owner,aal:'aal2',request:stage}),/FORBIDDEN/);
});
