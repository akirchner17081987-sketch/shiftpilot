import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
