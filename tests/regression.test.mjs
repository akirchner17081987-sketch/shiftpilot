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
const mobileCss = read('assets/mobile-responsive-v1.css');
const readiness = read('assets/readiness-traffic-light-v1.js');
const readinessMigration = read('database/shift_readiness_v1.sql');
const disruption = read('assets/disruption-autopilot-v1.js');
const disruptionMigration = read('database/disruption_autopilot_v1.sql');
const notifications = read('assets/supabase-notifications-v1.js');
const employeePortalLayout = read('assets/employee-portal-workspace-v2.js');
const moduleLoader = read('assets/conflict-plausibility-v1.js');

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
  const dynamicViews = new Set(['marketplace', 'disruptions']);
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

test('mobile layout constrains the app shell and keeps primary controls usable', () => {
  assert.match(index, /assets\/mobile-responsive-v1\.css/);
  assert.match(mobileCss, /grid-template-columns:\s*var\(--sidebar\)\s+minmax\(0,\s*1fr\)/);
  assert.match(mobileCss, /@media\s*\(max-width:\s*560px\)/);
  assert.match(mobileCss, /#newTemplateBtn[\s\S]*display:\s*none\s*!important/);
  assert.match(mobileCss, /\.calendar,[\s\S]*overflow-x:\s*auto/);
  assert.match(index, /function switchView\(name\)\{const appMain=document\.querySelector\('\.main'\);if\(appMain\)appMain\.scrollTop=0;window\.scrollTo\(0,0\)/);
});

test('readiness traffic light explains staffing, permissions, compliance and confirmations', () => {
  assert.match(index, /assets\/readiness-traffic-light-v1\.js/);
  assert.match(readiness, /Besetzung \$\{actual\}\/\$\{slot\.required\}/);
  assert.match(readiness, /emp\.shifts\|\|\[\]\)\.includes\(slot\.type\)/);
  assert.match(readiness, /C\.roleAllows\(emp,slot\.type\)/);
  assert.match(readiness, /C\.check\(emp,slot\.type,slot\.date/);
  assert.match(readiness, /ISSUE_REPORTED/);
  assert.match(readiness, /Bestätigung ausstehend/);
  assert.match(readiness, /Einsatzbereitschaft ·/);
});

test('shift confirmations are protected by least-privilege RLS', () => {
  assert.match(readinessMigration, /alter table public\.shift_assignment_confirmations enable row level security/i);
  assert.match(readinessMigration, /revoke all on table public\.shift_assignment_confirmations from public, anon, authenticated/i);
  assert.match(readinessMigration, /grant select, insert, update on table public\.shift_assignment_confirmations to authenticated/i);
  assert.doesNotMatch(readinessMigration, /grant delete/i);
  assert.match(readinessMigration, /for update[\s\S]*using \([\s\S]*with check \(/i);
  assert.match(readinessMigration, /e\.auth_user_id = \(select auth\.uid\(\)\)/i);
  assert.match(readinessMigration, /sa\.status = 'PUBLISHED'/i);
});

test('disruption autopilot ranks candidates and provides manager and employee workflows', () => {
  assert.match(index, /assets\/disruption-autopilot-v1\.js/);
  assert.match(disruption, /Störfall-Autopilot/);
  assert.match(disruption, /manager_list_disruption_candidates/);
  assert.match(disruption, /manager_send_disruption_offers/);
  assert.match(disruption, /employee_respond_disruption_offer/);
  assert.match(disruption, /Top 3 anfragen/);
  assert.match(disruption, /Schicht verbindlich übernehmen/);
  assert.match(notifications, /DISRUPTION_OFFER:'⚡'/);
  assert.match(notifications, /employee-disruptions':'disruptions'/);
  assert.match(notifications, /SFDisruptionAutopilot\?\.open/);
});

test('disruption workflow is tenant-isolated and resolves the first acceptance atomically', () => {
  assert.match(disruptionMigration, /alter table public\.disruption_incidents enable row level security/i);
  assert.match(disruptionMigration, /alter table public\.disruption_offers enable row level security/i);
  assert.match(disruptionMigration, /revoke all on table public\.disruption_incidents, public\.disruption_offers from public, anon, authenticated/i);
  assert.match(disruptionMigration, /where id=v_pre\.incident_id for update/i);
  assert.match(disruptionMigration, /where id=v_incident\.assignment_id for update/i);
  assert.match(disruptionMigration, /private\.sf_swap_candidate_reason\(v_assignment\.id,v_employee\.id\)/i);
  assert.match(disruptionMigration, /update public\.disruption_offers set status='EXPIRED'[\s\S]*id<>v_offer\.id/i);
  assert.match(disruptionMigration, /public\.apply_shift_change\(v_change_id\)/i);
  assert.match(disruptionMigration, /cm\.user_id=v_uid[\s\S]*cm\.status='ACTIVE'[\s\S]*cm\.role in \('OWNER','ADMIN','DISPATCHER','PLANNER'\)/i);
});

test('employee portal uses a categorized workspace with company header and right navigation', () => {
  assert.match(moduleLoader, /assets\/employee-portal-workspace-v2\.js/);
  assert.match(employeePortalLayout, /sf-employee-side/);
  assert.match(employeePortalLayout, /right:0;top:0;bottom:0/);
  assert.match(employeePortalLayout, /d\.company\?\.name/);
  assert.match(employeePortalLayout, /MITARBEITERPORTAL ·/);
  assert.match(employeePortalLayout, /data-sf-employee-view/);
  assert.match(employeePortalLayout, /sfEmployeePortalView/);
  assert.match(employeePortalLayout, /@media\(max-width:820px\)/);
  assert.match(notifications, /employeePortalNavigate\?\.\(target\)/);
});
