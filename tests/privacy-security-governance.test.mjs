import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorizeLifecycleRequest, parseLifecycleRequest } from '../supabase/functions/_shared/privacy-lifecycle.js';
import { compareStorageManifests } from '../scripts/storage-restore-manifest.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const allowlist=JSON.parse(fs.readFileSync(path.join(root,'supabase','security-definer-allowlist.json'),'utf8'));
const verifier=fs.readFileSync(path.join(root,'supabase','tests','security_definer_allowlist.sql'),'utf8');
const lifecycle=fs.readFileSync(path.join(root,'supabase','migrations','20260913083032_privacy_lifecycle_v1.sql'),'utf8');
const approvalSql=fs.readFileSync(path.join(root,'supabase','migrations','20260913084344_privacy_lifecycle_approval_v2.sql'),'utf8');
const lifecycleDbTest=fs.readFileSync(path.join(root,'supabase','tests','privacy_lifecycle_test.sql'),'utf8');
const lifecycleEdge=fs.readFileSync(path.join(root,'supabase','functions','privacy-lifecycle','index.ts'),'utf8');

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
  assert.match(lifecycle,/on conflict \(idempotency_key\) do nothing/i);
  assert.match(lifecycle,/Idempotency key belongs to another request/i);
  assert.match(lifecycle,/PENDING_APPROVAL/);
  assert.match(lifecycle,/legal_hold_until/);
  assert.match(lifecycle,/execution_enabled', false/);
  assert.match(lifecycle,/revoke all on table private\.privacy_lifecycle_requests from public, anon, authenticated/i);
  assert.match(lifecycle,/alter table private\.privacy_lifecycle_requests enable row level security/i);
  assert.match(lifecycle,/request\.jwt\.claim\.role/i);
  assert.match(lifecycle,/Service role required/i);
  assert.doesNotMatch(lifecycle,/\bdelete\s+from\s+public\./i);
  assert.doesNotMatch(lifecycle,/\bupdate\s+public\./i);
  assert.doesNotMatch(lifecycle,/cron\.schedule/i);
});

test('privacy approval enforces two-person control, legal holds and safe queue claims',()=>{
  assert.match(approvalSql,/requested_by = p_approved_by/i);
  assert.match(approvalSql,/Approved retention profile required/i);
  assert.match(approvalSql,/privacy_legal_holds/i);
  assert.match(approvalSql,/enable row level security/i);
  assert.match(approvalSql,/for update skip locked/i);
  assert.match(approvalSql,/status = 'APPROVED'/i);
  assert.match(approvalSql,/Worker does not own executing request/i);
  assert.match(approvalSql,/sf_assert_service_role/i);
  assert.doesNotMatch(approvalSql,/\bdelete\s+from\s+public\./i);
  assert.doesNotMatch(approvalSql,/\bupdate\s+public\./i);
  assert.doesNotMatch(approvalSql,/cron\.schedule/i);
});

test('privacy Edge Function pins its Supabase client dependency',()=>{
  assert.match(lifecycleEdge,/npm:@supabase\/supabase-js@\d+\.\d+\.\d+/);
  assert.doesNotMatch(lifecycleEdge,/npm:@supabase\/supabase-js@2["']/);
});

test('disposable database fixture is fictitious and always rolled back',()=>{
  assert.match(lifecycleDbTest,/example\.invalid/i);
  assert.match(lifecycleDbTest,/DSFA Wegwerf-Testmandant/i);
  assert.match(lifecycleDbTest,/select plan\(16\)/i);
  assert.match(lifecycleDbTest,/expired inline legal hold becomes claimable automatically/i);
  assert.match(lifecycleDbTest,/select \* from finish\(\)/i);
  assert.match(lifecycleDbTest,/rollback\s*;/i);
  assert.doesNotMatch(lifecycleDbTest,/schichtfunk\.de/i);
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

  const approval=parseLifecycleRequest({action:'approve',companyId:company,
    requestId:'66666666-6666-4666-8666-666666666666',
    retentionProfileId:'77777777-7777-4777-8777-777777777777'});
  assert.throws(()=>authorizeLifecycleRequest({membership,userId:owner,aal:'aal1',request:approval}),/MFA_REQUIRED/);
  assert.equal(authorizeLifecycleRequest({membership,userId:owner,aal:'aal2',request:approval}),true);
});

test('fictitious Storage restore requires exact object hashes',()=>{
  const a='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64);
  const expected=[
    {bucket:'personnel-documents',path:'tenant/employee/a.pdf',size:120,sha256:a},
    {bucket:'personnel-documents',path:'tenant/employee/b.png',size:240,sha256:b}
  ];
  assert.deepEqual(compareStorageManifests(expected,[...expected]),{
    ok:true,expectedCount:2,restoredCount:2,missing:[],unexpected:[],mismatched:[]
  });
  const bad=compareStorageManifests(expected,[
    {bucket:'personnel-documents',path:'tenant/employee/a.pdf',size:120,sha256:c},
    {bucket:'personnel-documents',path:'tenant/employee/c.txt',size:1,sha256:c}
  ]);
  assert.equal(bad.ok,false);
  assert.deepEqual(bad.missing,['personnel-documents/tenant/employee/b.png']);
  assert.deepEqual(bad.mismatched,['personnel-documents/tenant/employee/a.pdf']);
  assert.deepEqual(bad.unexpected,['personnel-documents/tenant/employee/c.txt']);
});
