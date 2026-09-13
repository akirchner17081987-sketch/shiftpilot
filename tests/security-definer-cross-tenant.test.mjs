import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const allowlist=JSON.parse(fs.readFileSync(path.join(root,'supabase','security-definer-allowlist.json'),'utf8'));
const sql=fs.readFileSync(path.join(root,'supabase','tests','security_definer_cross_tenant_test.sql'),'utf8');

test('cross-tenant SQL covers every allowlisted RPC exactly once',()=>{
  const markers=[...sql.matchAll(/^-- rpc: ([a-z0-9_]+)$/gm)].map(match=>match[1]);
  const expected=allowlist.functions.map(item=>item.name).sort();
  assert.equal(markers.length,35);
  assert.equal(new Set(markers).size,35);
  assert.deepEqual([...markers].sort(),expected);
  assert.match(sql,/select plan\(35\)/i);
  assert.match(sql,/RPC Wegwerf-Mandant A/);
  assert.match(sql,/RPC Wegwerf-Mandant B/);
  assert.match(sql,/example\.invalid/);
  assert.match(sql,/set local role authenticated/i);
  assert.match(sql,/select \* from finish\(\)/i);
  assert.match(sql,/rollback\s*;/i);
});

test('cross-tenant harness accepts only authorization-class rejections',()=>{
  assert.match(sql,/rpc_auth_rejected/);
  assert.match(sql,/v_message ~\* '\(berechtig\|membership\|required/);
  assert.match(sql,/rpc_preserves_count/);
  assert.match(sql,/unregister_push_subscription cannot remove company-B endpoint/);
  assert.doesNotMatch(sql,/schichtfunk\.de/i);
  assert.doesNotMatch(sql,/\bcommit\s*;/i);
});

