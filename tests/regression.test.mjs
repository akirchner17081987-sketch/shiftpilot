import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const index = read('index.html');
const employeeManagement = read('assets/employee-management-v2.js');
const marketplace = read('assets/supabase-shift-marketplace-v1.js');
const supabaseData = read('assets/supabase-data-v1.js');
const roleEscalationFix = read('database/fix_company_member_role_escalation.sql');
const securityHardening = read('database/security_hardening_v1.sql');

test('all local scripts and styles referenced by index.html exist', () => {
  const references = [...index.matchAll(/<(?:script|link)\b[^>]+(?:src|href)=["']([^"']+)["']/gi)]
    .map(match => match[1].split('?')[0])
    .filter(path => path && !/^(?:https?:|data:|#)/i.test(path));

  assert.ok(references.length > 0, 'No local assets were found in index.html');
  const missing = [...new Set(references)].filter(path => !existsSync(resolve(root, path)));
  assert.deepEqual(missing, [], `Missing assets: ${missing.join(', ')}`);
});

test('all JavaScript assets pass the Node syntax check', () => {
  const scripts = [...index.matchAll(/<script\b[^>]+src=["']([^"']+\.js)(?:\?[^"']*)?["']/gi)]
    .map(match => match[1])
    .filter(path => !/^https?:/i.test(path));

  for (const script of [...new Set(scripts)]) {
    execFileSync(process.execPath, ['--check', resolve(root, script)], { stdio: 'pipe' });
  }
});

test('every static sidebar destination has a matching view', () => {
  const destinations = [...index.matchAll(/data-view=["']([^"']+)["']/g)].map(match => match[1]);
  const dynamicViews = new Set(['marketplace']);
  const missing = [...new Set(destinations)]
    .filter(view => !dynamicViews.has(view))
    .filter(view => !index.includes(`id="view-${view}"`) && !index.includes(`id='view-${view}'`));

  assert.deepEqual(missing, [], `Navigation without a view: ${missing.join(', ')}`);
});

test('marketplace navigation is rebound and opens its dashboard', () => {
  assert.match(marketplace, /marketButton\.onclick=openDashboard/);
  assert.match(marketplace, /closest\('\[data-view="marketplace"\]'\).*openDashboard\(\)/);
  assert.match(marketplace, /window\.switchView\?\.\('marketplace'\)/);
  assert.match(marketplace, /id='view-marketplace'/);
});

test('Teamleiter permission survives normalization and qualification saving', () => {
  assert.match(employeeManagement, /e\.shifts=Array\.from\(new Set\(\[\.\.\.\(e\.shifts\|\|\[\]\)\.filter\(x=>Q\.includes\(x\)\),\.\.\.\(e\.role==='Teamleiter'\?\['Teamleiter'\]:\[\]\)\]\)\)/);
  assert.match(employeeManagement, /e\.shifts=e\.qualifications\.filter\(x=>Q\.includes\(x\)\)/);
  assert.doesNotMatch(employeeManagement, /e\.shifts=e\.qualifications\.filter\(x=>x!=='Teamleiter'\)/);
  assert.match(supabaseData, /shift_permissions:e\.shifts\|\|\[\]/);
  assert.match(supabaseData, /shifts:x\.shift_permissions\|\|\[\]/);
});

test('employee email is preserved from form through cloud hydration', () => {
  assert.match(employeeManagement, /email:document\.getElementById\('spEmail'\)\.value\.trim\(\)/);
  assert.match(employeeManagement, /if\(email\)email\.value=e\.email\|\|''/);
  assert.match(supabaseData, /email:e\.email\|\|null/);
  assert.match(supabaseData, /email:x\.email\|\|''/);
});

test('company members cannot directly promote or reactivate themselves', () => {
  assert.match(roleEscalationFix, /drop policy if exists company_members_update on public\.company_members/i);
  assert.match(roleEscalationFix, /revoke update on table public\.company_members from authenticated/i);
  assert.doesNotMatch(roleEscalationFix, /grant update on (?:table )?public\.company_members to authenticated/i);
});

test('privileged database functions and grants remain hardened', () => {
  for (const name of [
    'employee_respond_to_shift_change',
    'manager_create_company_invite',
    'manager_list_company_users',
    'manager_revoke_company_invite',
    'manager_update_company_member'
  ]) {
    assert.match(securityHardening, new RegExp(`alter function public\\.${name}\\([^;]+\\) set search_path = ''`, 'i'));
    assert.match(securityHardening, new RegExp(`revoke all on function public\\.${name}\\([^;]+\\) from public, anon`, 'i'));
  }
  assert.match(securityHardening, /revoke all on table public\.company_member_invites from anon/i);
  assert.match(securityHardening, /revoke all on table public\.employee_access_invites from anon/i);
  assert.match(securityHardening, /revoke truncate, references, trigger on all tables in schema public from authenticated, anon/i);
});
