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
const employeeRhythm = read('assets/employee-rhythm-v1.js');
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
const employeeWagePreview = read('assets/employee-wage-preview-v1.js');
const supabaseAuth = read('assets/supabase-auth-v1.js');
const moduleLoader = read('assets/conflict-plausibility-v1.js');
const timeAccounts = read('assets/supabase-time-accounts-v1.js');
const complianceCore = read('assets/compliance-core-v2.js');
const schedulePublish = read('assets/supabase-publish-v1.js');
const absenceConcurrencyMigration = read('supabase/migrations/20260901155037_prevent_concurrent_duplicate_absence_requests.sql');
const absenceOverlapMigration = read('supabase/migrations/20260901155043_enforce_absence_overlap_rules.sql');
const employeeCompletenessMigration = read('supabase/migrations/20260901102727_require_complete_active_employee_identity.sql');
const absenceManagement = read('assets/absence-management-v3.js');
const employeeAbsence = read('assets/supabase-absence-employee-v3.js');
const autoPlanPeriodCss = read('assets/auto-plan-period-v1.css');
const settingsManagement = read('assets/settings-management-v2.js');
const complianceUi = read('assets/compliance-ui-v2.js');
const auditLogs = read('assets/audit-logs-v1.js');
const auditMigration = read('supabase/migrations/20260901202710_add_secure_audit_logs.sql');
const auditReaderHardening = read('supabase/migrations/20260901202920_harden_audit_log_reader.sql');
const auditPolicyHardening = read('supabase/migrations/20260902112933_restrict_audit_events_to_admins.sql');

test('Audit-Logs are an administrator-only filtered detail workspace', () => {
  assert.match(index, /data-view="audit" id="sfAuditNav" hidden/);
  assert.match(index, /id="view-audit"/);
  assert.match(index, /id="sfAuditFrom" type="date"/);
  assert.match(index, /id="sfAuditTo" type="date"/);
  assert.match(index, /id="sfAuditActor"/);
  assert.match(index, /id="sfAuditAction"/);
  assert.match(index, /name==='audit'&&!\['OWNER','ADMIN'\]\.includes\(B\?\.role\)/);
  assert.match(auditLogs, /ADMIN=new Set\(\['OWNER','ADMIN'\]\)/);
  assert.match(auditLogs, /manager_list_audit_events/);
  assert.match(auditLogs, /manager_list_company_users/);
  assert.match(auditLogs, /const accessTimer=setInterval/);
  assert.match(auditLogs, /if\(B\.role\|\|attempts>=40\)clearInterval\(accessTimer\)/);
  assert.match(auditLogs, /AUDIT-DETAIL/);
  assert.match(auditLogs, /Vorher/);
  assert.match(auditLogs, /Nachher/);
  assert.match(auditLogs, /function changeRows\(oldValues,newValues\)/);
  assert.match(auditLogs, /Technische Details anzeigen/);
  assert.match(auditLogs, /REQUESTED:'Beantragt'/);
  assert.match(auditLogs, /APPROVED:'Genehmigt'/);
  assert.match(auditLogs, /FULL_SCHEDULE_RESET:'Gesamten Dienstplan gelöscht'/);
  assert.match(auditLogs, /PLAN_PUBLISHED:'Dienstplan veröffentlicht'/);
  assert.match(auditLogs, /ABSENCE_REQUEST_APPROVED:'Abwesenheitsantrag genehmigt'/);
  assert.match(auditLogs, /schedule:'Dienstplan'/);
  assert.match(auditLogs, /absence:'Abwesenheit'/);
  assert.doesNotMatch(auditLogs, /r\.id\.slice\(0,8\)/);
  assert.match(auditLogs, />Audit-ID<\/b><code>\$\{esc\(r\.id\)\}/);
  assert.match(auditLogs, />Objekt-ID<\/b><code>\$\{esc\(r\.entity_id\)\}/);
});

test('Audit backend is append-only, tenant-scoped and captured by database triggers', () => {
  assert.match(auditMigration, /alter table public\.audit_events force row level security/);
  assert.match(auditMigration, /revoke all on table public\.audit_events from anon, authenticated/);
  assert.match(auditMigration, /grant select on table public\.audit_events to authenticated/);
  assert.match(auditMigration, /private\.can_manage_company_users\(company_id\)/);
  assert.match(auditMigration, /before update or delete on public\.audit_events/);
  assert.match(auditMigration, /after insert or update or delete/);
  assert.match(auditMigration, /backendCaptured/);
  assert.match(auditMigration, /if not private\.can_manage_company_users\(p_company_id\)/);
  assert.match(auditMigration, /limit least\(greatest\(coalesce\(p_limit, 250\), 1\), 1000\)/);
  assert.match(auditReaderHardening, /security invoker/);
  assert.doesNotMatch(auditReaderHardening, /join auth\.users/);
  assert.match(auditPolicyHardening, /drop policy if exists audit_select/);
  assert.match(auditPolicyHardening, /revoke insert, update, delete on table public\.audit_events from anon, authenticated/);
});

test('administrators can open Audit & Compliance from the settings navigation', () => {
  assert.match(settingsManagement, /\['compliance','🛡','Audit & Compliance'\]/);
  assert.match(settingsManagement, /compliance:\['Audit & Compliance','Änderungsverlauf, Audit-Ereignisse/);
  assert.match(settingsManagement, /C\.renderComplianceSettings\(b\)/);
  assert.match(complianceUi, /C\.renderComplianceSettings=target=>/);
  assert.match(complianceUi, /host\.appendChild\(card\)/);
  assert.match(complianceUi, /Audit-Logs öffnen/);
});

test('auto planning supports a selected week, calendar month, or exact date', () => {
  assert.match(index, /id="autoPlanPeriod"[^>]*>[\s\S]*?<option value="week">Wöchentliche Planung<\/option><option value="month">Monatliche Planung<\/option><option value="date">Genaues Datum der Planung<\/option>/);
  assert.match(index, /id="autoPlanWeekDate" type="date"/);
  assert.match(index, /id="autoPlanDate" type="date"/);
  assert.match(index, /id="autoPlanMonth" type="month"/);
  assert.match(index, /function autoPlanningDates\(\)/);
  assert.match(index, /function autoMonday\(value\)/);
  assert.match(index, /if\(mode==='date'\)return\[document\.getElementById\('autoPlanDate'\)/);
  assert.match(index, /autoPlannedHours\(e\.id,simulated,date\)/);
  assert.match(index, /function autoOpenSlots\(\)\{const dates=autoPlanningDates\(\)/);
});

test('O1S and QA are available as fixed overnight shifts', () => {
  assert.match(index, /\{id:'O1S',name:'O1S',start:'18:00',end:'04:00',cls:'violet'\}/);
  assert.match(index, /\{id:'QA',name:'QA',start:'20:00',end:'06:00',cls:'blue'\}/);
  assert.match(index, /globalSoll=store\.get\('globalSoll',\{O1:3,O1S:0,O2:2,QA:0,/);
  assert.match(employeeManagement, /const Q=\['O1','O1S','O2','QA','O3','OT1','OT2','OT','Teamleiter'\]/);
});

test('individual monthly target hours are persisted and enforced during planning', () => {
  const assignmentUx = read('assets/assignment-ux-v4.js');
  assert.match(employeeManagement, /__sp:monthlyHours=/);
  assert.match(employeeManagement, /id="spMonthlyHours"/);
  assert.match(employeeManagement, /Monatliche Sollstunden/);
  assert.match(employeeManagement, /employeeMonthlyTarget==='function'\?employeeMonthlyTarget\(e\)/);
  assert.match(index, /function employeeMonthlyTarget\(employee\)/);
  assert.match(index, /function plannedMonthlyHoursForEmployee\(employeeId,date,simulated=\[\],ignoreId=null\)/);
  assert.match(index, /overMonth=!!\(respectHours&&monthTarget&&monthHours\+dur>monthTarget\+0\.01\)/);
  assert.match(index, /filter\(x=>!respectHours\|\|\(!x\.overWeek&&!x\.overMonth\)\)/);
  assert.match(index, /Wochen- und Monatsstunden berücksichtigen/);
  assert.match(assignmentUx, /Monats-SOLL würde auf/);
});

test('employee overview is sorted alphabetically by last name and first name', () => {
  assert.match(employeeManagement, /function employeeNameCompare\(a,b\)/);
  assert.match(employeeManagement, /String\(a\.last\|\|''\)\.localeCompare\(String\(b\.last\|\|''\),'de-DE',options\)/);
  assert.match(employeeManagement, /String\(a\.first\|\|''\)\.localeCompare\(String\(b\.first\|\|''\),'de-DE',options\)/);
  assert.match(employeeManagement, /\.sort\(employeeNameCompare\)/);
  assert.match(employeeManagement, /<b>\$\{esc\(e\.last\)\}, \$\{esc\(e\.first\)\}<\/b>/);
  assert.match(index, /<b>\$\{e\.last\}, \$\{e\.first\}<\/b>/);
});

test('employee rhythm settings are visible, persisted and enforced by planning', () => {
  assert.match(index, /assets\/employee-rhythm-v1\.js/);
  assert.match(employeeManagement, /id="spWorkTimeModel"/);
  assert.match(employeeManagement, /id="spRhythmMode"/);
  assert.match(employeeManagement, /id="spRhythmStart"/);
  assert.match(employeeManagement, /id="spRhythmPattern"/);
  assert.match(employeeManagement, /__sp:rhythmMode=/);
  assert.match(employeeManagement, /__sp:rhythmStart=/);
  assert.match(employeeManagement, /__sp:rhythmPattern=/);
  assert.match(employeeManagement, /rhythm\?\.mode==='required'&&!rhythm\.allowed/);
  assert.match(index, /sfRhythmCheck\(e,type,date\)\.mode!==\'required\'/);
  assert.match(index, /rhythmPenalty=rhythm&&!rhythm\.allowed&&rhythm\.mode===\'preferred\'\?40:0/);
  const browserWindow = {};
  Function('window', employeeRhythm)(browserWindow);
  const required = {rhythmMode:'required',rhythmStart:'2026-09-01',rhythmPattern:'O1, O2, FREI'};
  assert.equal(browserWindow.sfRhythmCheck(required,'O1','2026-09-01').allowed, true);
  assert.equal(browserWindow.sfRhythmCheck(required,'O1','2026-09-02').allowed, false);
  assert.equal(browserWindow.sfRhythmCheck(required,'O2','2026-09-05').allowed, true);
  assert.equal(browserWindow.sfRhythmCheck(required,'O1','2026-09-03').expected, 'FREI');
});

test('long auto-planning result lists scroll inside their cards', () => {
  assert.match(autoPlanPeriodCss, /#autoSuggestions,#autoUnresolved\{max-height:min\(58vh,680px\);overflow-y:auto/);
  assert.match(autoPlanPeriodCss, /overscroll-behavior:contain/);
  assert.match(autoPlanPeriodCss, /scrollbar-gutter:stable/);
});

test('private hourly wage recalculates while the value is entered', () => {
  assert.match(employeeWagePreview, /rateInput\.oninput=.*setTimeout\(saveRate,250\)/);
  assert.match(employeeWagePreview, /rateInput\.onchange=saveRate/);
});
const employeeAccess = read('assets/supabase-employee-access-v1.js');
const shiftSwap = read('assets/supabase-shift-swap-v1.js');
const timeTracking = read('assets/supabase-time-tracking-v1.js');
const employeeIsolation = read('database/employee_portal_data_isolation_v1.sql');
const passwordReset = read('assets/supabase-password-reset-v1.js');
const webManifest = JSON.parse(read('site.webmanifest'));
const vercelConfig = JSON.parse(read('vercel.json'));

test('all local scripts and styles referenced by index.html exist', () => {
  const references = [...index.matchAll(/<(?:script|link)\b[^>]+(?:src|href)=["']([^"']+)["']/gi)]
    .map(match => match[1].split('?')[0])
    .filter(path => path && !/^(?:https?:|data:|#)/i.test(path));

  assert.ok(references.length > 0, 'No local assets were found in index.html');
  const missing = [...new Set(references)].filter(path => !existsSync(resolve(root, path.replace(/^\//, ''))));
  assert.deepEqual(missing, [], `Missing assets: ${missing.join(', ')}`);
});

test('SchichtFunk favicon and installable app icons are complete', () => {
  assert.match(index, /rel="icon" href="\/favicon\.ico" sizes="any"/);
  assert.match(index, /rel="apple-touch-icon" sizes="180x180"/);
  assert.match(index, /rel="manifest" href="\/site\.webmanifest"/);
  assert.equal(webManifest.short_name, 'SchichtFunk');
  assert.equal(webManifest.theme_color, '#08111f');
  assert.deepEqual(webManifest.icons.map(icon => icon.sizes), ['192x192', '512x512', '512x512']);
  for (const path of ['favicon.ico', 'assets/favicon-16x16.png', 'assets/favicon-32x32.png', 'assets/apple-touch-icon.png', 'assets/schichtfunk-app-icon-192.png', 'assets/schichtfunk-app-icon-512.png', 'assets/schichtfunk-app-icon-maskable-512.png']) {
    assert.ok(existsSync(resolve(root, path)), `${path} fehlt`);
  }
});

test('production responses are protected by restrictive security headers', () => {
  const globalHeaders = vercelConfig.headers.find(rule => rule.source === '/(.*)')?.headers ?? [];
  const values = Object.fromEntries(globalHeaders.map(header => [header.key, header.value]));

  assert.match(values['Content-Security-Policy'], /default-src 'self'/);
  assert.match(values['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.match(values['Content-Security-Policy'], /connect-src 'self' https:\/\/zbvloohfjleadjnqhbbh\.supabase\.co wss:\/\/zbvloohfjleadjnqhbbh\.supabase\.co/);
  assert.equal(values['X-Content-Type-Options'], 'nosniff');
  assert.equal(values['X-Frame-Options'], 'DENY');
  assert.equal(values['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.match(values['Permissions-Policy'], /camera=\(\)/);
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

test('manager navigation follows planning, personnel, and analysis workflows', () => {
  const nav = index.slice(index.indexOf('<nav class="nav" id="nav">'), index.indexOf('</nav>', index.indexOf('<nav class="nav" id="nav">')));
  const expected = ['data-view="overview"', 'data-nav-group="planning"', 'data-view="schedule"', 'data-view="auto"', 'data-nav-group="personal"', 'data-view="employees"', 'data-view="absence"', 'data-view="time"', 'data-nav-group="analysis"', 'data-view="reports"', 'data-view="audit"'];
  let cursor = -1;
  for (const marker of expected) {
    const next = nav.indexOf(marker);
    assert.ok(next > cursor, `${marker} is not in the expected navigation order`);
    cursor = next;
  }
  assert.match(index, /\.nav-group-label\{[^}]*text-transform:uppercase/);
  assert.match(index, /\.company-card,\.nav-group-label\{display:none\}/);
  assert.match(marketplace, /querySelector\('\[data-nav-group="personal"\]'\)/);
  assert.match(disruption, /querySelector\('\[data-view="marketplace"\]'\)\|\|nav\.querySelector\('\[data-nav-group="personal"\]'\)/);
});

test('marketplace navigation is rebound and opens its dashboard', () => {
  assert.match(marketplace, /marketButton\.onclick\s*=\s*openDashboard/);
  assert.match(marketplace, /closest\(["']\[data-view="marketplace"\]["']\)[\s\S]{0,80}openDashboard\(\)/);
  assert.match(marketplace, /window\.switchView\?\.\(["']marketplace["']\)/);
  assert.match(marketplace, /v\.id\s*=\s*["']view-marketplace["']/);
});

test('employee portal loads only employee-owned approvals and time entries', () => {
  assert.match(employeeAccess, /\.eq\('auth_user_id',B\.user\.id\)\.eq\('status','active'\)/);
  assert.match(employeeAccess, /\.in\('change_request_id',requestIds\)/);
  assert.match(employeeAccess, /\.in\('assignment_id',assignmentIds\)/);
  assert.doesNotMatch(employeeAccess, /from\('shift_change_approvals'\)\.select\('\*'\)\.eq\('company_id',B\.companyId\)/);
  assert.doesNotMatch(employeeAccess, /from\('time_entries'\)\.select\('\*'\)\.eq\('company_id',B\.companyId\)/);
});

test('employee portal RLS requires an active employee and matching ownership chain', () => {
  assert.match(employeeIsolation, /auth_user_id = \(select auth\.uid\(\)\)[\s\S]*status = 'active'/);
  assert.match(employeeIsolation, /cr\.company_id = shift_change_approvals\.company_id/);
  assert.match(employeeIsolation, /sa\.company_id = time_entries\.company_id/);
  assert.match(employeeIsolation, /e\.company_id = time_entries\.company_id/);
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

test('employee profile saves do not trigger a full absence synchronization', () => {
  assert.match(supabaseData, /B\.persistEmployee=async e=>/);
  assert.match(employeeManagement, /async function persistEmployeeOnly\(e\)/);
  assert.match(employeeManagement, /await persistEmployeeOnly\(e\)/);
  const saveOverviewSource = employeeManagement.slice(employeeManagement.indexOf('async function saveOverview'), employeeManagement.indexOf('function openShiftModal'));
  assert.doesNotMatch(saveOverviewSource, /saveAll\(\)/);
});

test('cloud-native absences keep their database identity during later syncs', () => {
  assert.match(supabaseData, /const cloudNative=a\._dbId&&String\(a\.id\)===String\(a\._dbId\)/);
  assert.match(supabaseData, /legacy_id:cloudNative\?null:String\(a\.id\)/);
  assert.match(supabaseData, /from\('absences'\)\.update\(payload\).*\.eq\('id',dbId\)/);
  assert.match(supabaseData, /await B\.persistAbsences\(absences\)/);
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
  assert.match(employeePortalLayout, /sf-employee-nav-btn\{[^}]*min-height:44px!important/);
  assert.match(employeePortalLayout, /sf-portal-top \.ghost\{min-height:44px/);
  assert.match(employeePortalLayout, /scroll-snap-type:x proximity/);
  assert.match(employeePortalLayout, /sf-employee-nav-scroll::\-webkit-scrollbar\{height:6px\}/);
  assert.match(notifications, /sf-notify-btn\{[^}]*min-width:44px;height:44px/);
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
  assert.match(employeePortalLayout, /sf-employee-side\{position:absolute;z-index:10;left:0;top:0;bottom:0/);
  assert.match(employeePortalLayout, /sf-portal-main\{position:absolute;left:var\(--sf-employee-nav\);right:0/);
  assert.match(employeePortalLayout, /d\.company\?\.name/);
  assert.match(employeePortalLayout, /MITARBEITERPORTAL ·/);
  assert.match(employeePortalLayout, /data-sf-employee-view/);
  assert.match(employeePortalLayout, /sfEmployeePortalView/);
  assert.match(employeePortalLayout, /@media\(max-width:820px\)/);
  assert.match(employeePortalLayout, /assets\/schichtfunk-company-logo\.png/);
  assert.match(employeePortalLayout, /width="1500" height="436"/);
  assert.match(employeePortalLayout, /object-fit:contain/);
  assert.doesNotMatch(employeePortalLayout, /logo\.textContent=initials\(company\)/);
  assert.match(notifications, /employeePortalNavigate\?\.\(target\)/);
});

test('employee portal reports offline and reconnecting cloud states', () => {
  assert.match(employeePortalLayout, /navigator\.onLine!==false/);
  assert.match(employeePortalLayout, /Keine Netzwerkverbindung/);
  assert.match(employeePortalLayout, /Cloud-Verbindung wird hergestellt/);
  assert.match(employeePortalLayout, /addEventListener\('offline',updateConnectionState\)/);
  assert.match(employeePortalLayout, /addEventListener\('online'/);
});

test('expired sessions clear protected state and reopen login with an explanation', () => {
  assert.match(supabaseAuth, /signOut\(\{scope:'local'\}\)/);
  assert.match(supabaseAuth, /event==='SIGNED_OUT'\)B\.handleSignedOut\(\)/);
  assert.match(supabaseAuth, /__explicitSignOut/);
  assert.match(supabaseAuth, /Deine Anmeldung ist abgelaufen\. Bitte melde dich erneut an\./);
  assert.match(supabaseAuth, /document\.getElementById\('sfEmployeePortal'\)\?\.remove\(\)/);
});

test('concurrent absence requests are serialized per employee before overlap validation', () => {
  assert.match(absenceConcurrencyMigration, /pg_advisory_xact_lock/);
  assert.match(absenceConcurrencyMigration, /absence-request:' \|\| v_employee\.id::text/);
  const lockPosition = absenceConcurrencyMigration.indexOf('pg_advisory_xact_lock');
  const overlapPosition = absenceConcurrencyMigration.indexOf('if exists (');
  assert.ok(lockPosition >= 0 && lockPosition < overlapPosition);
  assert.match(absenceConcurrencyMigration, /status in \('Beantragt','Genehmigt','Erfasst'\)/);
  assert.match(absenceConcurrencyMigration, /daterange\(a\.start_date,a\.end_date,'\[\]'\).*daterange\(p_start_date,p_end_date,'\[\]'\)/s);
});

test('absence overlap rules are enforced in the database and respect partial-day times', () => {
  assert.match(absenceOverlapMigration, /before insert or update of employee_id, start_date, end_date, full_day, start_time, end_time, status/);
  assert.match(absenceOverlapMigration, /pg_advisory_xact_lock/);
  assert.match(absenceOverlapMigration, /tsrange\([\s\S]*'\[\)'[\s\S]*\) && tsrange\(v_new_start, v_new_end, '\[\)'\)/);
  assert.match(absenceOverlapMigration, /a\.id is distinct from new\.id/);
  assert.match(absenceOverlapMigration, /new\.status not in \('Beantragt', 'Genehmigt', 'Erfasst'\)/);
  assert.match(absenceManagement, /const overlaps=\(a,b\)=>/);
  assert.match(absenceManagement, /x\[0\]<y\[1\]&&y\[0\]<x\[1\]/);
  assert.match(absenceManagement, /status\(a\)!=='Abgelehnt'&&overlaps\(a,candidate\)/);
});

test('exactly ten hours is neutral while longer shifts remain flagged', () => {
  assert.match(complianceCore, /if\(duration>10\)hard\.push/);
  assert.doesNotMatch(complianceCore, /duration>=10|duration>8/);
  assert.match(schedulePublish, /if\(mins>600\)\{long\+\+/);
  assert.doesNotMatch(schedulePublish, /mins>=600|Ab 10 Stunden/);
  assert.match(schedulePublish, /Über 10 Stunden/);
});

test('regular published shifts do not require individual employee confirmation', () => {
  assert.match(readiness, /changed\?'nachträgliche Änderung':shortNotice\?'kurzfristig veröffentlicht':''/);
  assert.match(readiness, /Date\.now\(\)&&confirmationReason\(a\)/);
  assert.match(readiness, /if\(!shift\|\|!confirmationReason\(shift,d\.requests/);
  assert.match(readiness, /shift_assignments'\)\.select\('id,last_change_request_id'/);
  assert.match(employeeAccess, /company_compliance_policy.*employee_confirmation_under_hours/);
});

test('employee portal falls back safely when compliance policy is not readable', () => {
  assert.match(employeeAccess, /company_compliance_policy.*maybeSingle\(\)/);
  assert.match(employeeAccess, /for\(const q of \[emp,company,shifts,abs,req,tpl\]\)/);
  assert.match(employeeAccess, /for\(const q of \[apv,te\]\)/);
  assert.doesNotMatch(employeeAccess, /for\(const q of \[[^\]]*policy[^\]]*\]\)/);
  assert.match(employeeAccess, /policy\.error\?\{employee_confirmation_under_hours:24\}/);
  assert.match(employeeAccess, /finally\{B\.hideLoading\?\.\(\)\}/);
});

test('employee shift swaps refresh only on demand', () => {
  assert.match(shiftSwap, /class="sf-swap-refresh">↻ Aktualisieren<\/button>/);
  assert.match(shiftSwap, /sf-swap-refresh'\)\.addEventListener\('click'/);
  assert.doesNotMatch(shiftSwap, /setInterval\(\(\)=>\{if\(B\.role==='EMPLOYEE'/);
  assert.doesNotMatch(shiftSwap, /visibilitychange[\s\S]{0,160}B\.role==='EMPLOYEE'/);
  assert.match(shiftSwap, /setInterval\(\(\)=>\{if\(MANAGER\.has\(B\.role\)/);
  assert.doesNotMatch(shiftSwap, /querySelector\('#sfEmployeeSwapCard'\)\?\.remove/);
  assert.doesNotMatch(marketplace, /querySelector\("#sfEmployeeSwapCard"\)\?\.remove/);
  assert.doesNotMatch(marketplace, /#sfEmployeePortal #sfEmployeeSwapCard\s*\{\s*display:block!important\s*\}/);
  assert.match(marketplace, /if \(MANAGER\.has\(B\.role\)\) refresh\(\)/);
  assert.match(employeePortalLayout, /setHtmlIfChanged\(head,/);
  assert.match(employeePortalLayout, /setHtmlIfChanged\(brand,/);
  const renderStateSource = employeePortalLayout.slice(employeePortalLayout.indexOf('function renderState'), employeePortalLayout.indexOf('function navigate'));
  assert.doesNotMatch(renderStateSource, /scrollTop/);
  assert.match(shiftSwap, /#sfEmployeeSwapCard \.sf-swap-main\{display:flex;flex-direction:column;gap:6px;line-height:1\.6\}/);
  assert.match(employeePortalLayout, /function integrateAddedCards\(cards\)/);
  assert.match(employeePortalLayout, /cards\.forEach\(card=>\{if\(!portal\.contains\(card\)\)return/);
  assert.doesNotMatch(employeePortalLayout, /MutationObserver\(\(\)=>[\s\S]{0,250}arrange\(\)/);
});

test('stale marketplace offers close and refresh after another employee claims them', () => {
  assert.match(marketplace, /nicht mehr verfügbar\|bereits vergeben/i);
  assert.match(marketplace, /await employeeLoad\(\);[\s\S]*unavailable\.code = "OFFER_UNAVAILABLE"/);
  assert.match(marketplace, /x\?\.code === "OFFER_UNAVAILABLE"/);
  assert.match(marketplace, /close\(\);[\s\S]*"Angebot bereits vergeben"/);
  assert.match(marketplace, /x\?\.code === "OFFER_UNAVAILABLE"[\s\S]*?close\(\);[\s\S]*?return;[\s\S]*?b\.disabled = false/);
});

test('active employees require core identity data and incomplete profiles are explained', () => {
  assert.match(employeeCompletenessMigration, /employees_active_identity_complete_check/);
  assert.match(employeeCompletenessMigration, /status <> 'active'/);
  assert.match(employeeCompletenessMigration, /btrim\(first_name\) <> ''/);
  assert.match(employeeCompletenessMigration, /btrim\(last_name\) <> ''/);
  assert.match(employeeCompletenessMigration, /btrim\(coalesce\(personnel_no, ''\)\) <> ''/);
  assert.match(employeeAccess, /Stammdaten unvollständig/);
  assert.match(employeeAccess, /Schichtberechtigungen/);
  assert.match(employeeAccess, /\$\{profileWarning\}<div class="sf-portal-stats">/);
  assert.match(employeeAccess, /first_name\|\|name\|\|'Mitarbeiter'/);
  assert.match(employeeAccess, /work_time_model\|\|'–'/);
});

test('employee dates and overnight shifts use the company timezone', () => {
  assert.match(employeeAccess, /company\?\.timezone\|\|B\.companyTimeZone\|\|'Europe\/Berlin'/);
  assert.match(employeeAccess, /timeZone:timeZone\(\)/);
  assert.match(employeeAccess, /dateKey\(start\)!==dateKey\(end\)\?' \(Folgetag\)'/);
  assert.match(employeeAccess, /B\.companyTimeZone=company\.data\?\.timezone\|\|'Europe\/Berlin'/);
  assert.match(shiftSwap, /B\.sfShiftTimeRange/);
  assert.match(marketplace, /timeZone: B\.companyTimeZone \|\| "Europe\/Berlin"/);
  assert.match(timeTracking, /const tz=\(\)=>B\.companyTimeZone\|\|'Europe\/Berlin'/);
  assert.match(timeTracking, /function zonedParts\(v\)/);
  assert.match(timeTracking, /check===v\?new Date\(instant\)\.toISOString\(\):null/);

  const format = (value, options) => new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', ...options }).format(new Date(value));
  assert.equal(format('2026-10-24T20:00:00.000Z', { hour: '2-digit', minute: '2-digit' }), '22:00');
  assert.equal(format('2026-10-25T05:00:00.000Z', { hour: '2-digit', minute: '2-digit' }), '06:00');
  assert.equal((new Date('2026-10-25T05:00:00.000Z') - new Date('2026-10-24T20:00:00.000Z')) / 3600000, 9);
});

test('employee dialogs trap focus, close with Escape and announce errors', () => {
  assert.match(employeePortalLayout, /B\.bindAccessibleModal=function/);
  assert.match(employeePortalLayout, /event\.key==='Escape'/);
  assert.match(employeePortalLayout, /event\.key!=='Tab'/);
  assert.match(employeePortalLayout, /opener\?\.isConnected/);
  for (const source of [shiftSwap, marketplace, timeTracking, employeeAbsence]) {
    assert.match(source, /role="alert" aria-live="assertive"/);
    assert.match(source, /aria-labelledby=/);
    assert.match(source, /bindAccessibleModal/);
  }
});

test('employee portal navigation and notification badge use hardened contrast colors', () => {
  assert.match(employeePortalLayout, /color:#7894aa/);
  assert.match(employeePortalLayout, /active \.sf-employee-nav-copy small\{color:#a7c8c2\}/);
  assert.match(notifications, /background:#a92343;color:#fff/);
});

test('employee forms expose clear labels, required fields, help and live status messages', () => {
  assert.match(employeeAbsence, /label\.htmlFor=id/);
  assert.match(employeeAbsence, /Mit \* gekennzeichnete Felder sind Pflichtfelder/);
  assert.match(employeeAbsence, /field\.setAttribute\('aria-describedby','sfAe3Help'\)/);
  assert.match(employeeAbsence, /field\.setAttribute\('aria-required',String\(partial\)\)/);
  assert.match(shiftSwap, /label for="sfSwapCandidate"/);
  assert.match(shiftSwap, /role="status" aria-live="polite"/);
  assert.match(shiftSwap, /aria-describedby="sfSwapCandidateInfo"/);
  assert.match(shiftSwap, /label for="sfSwapComment"/);
  assert.match(marketplace, /label for="sfMarketNote"/);
  assert.match(marketplace, /aria-describedby="sfMarketDescription"/);
  assert.match(timeTracking, /label for="sfTimeStart"/);
  assert.match(timeTracking, /label for="sfTimeEnd"/);
  assert.match(timeTracking, /label for="sfTimeBreak"/);
  assert.match(timeTracking, /label for="sfTimeNote"/);
  assert.match(timeTracking, /required aria-required="true"/);
  assert.match(index, /id="saveToast" class="save-toast" role="status" aria-live="polite"/);
});

test('employee startup skips manager-only modules and detaches inactive application shells', () => {
  assert.match(moduleLoader, /const managerStart=files\.indexOf\('assets\/supabase-time-month-close-v1\.js'\)/);
  assert.match(moduleLoader, /if\(B\.role!==\'EMPLOYEE\'\)await loadManager\(\)/);
  assert.match(moduleLoader, /const present=file=>/);
  assert.match(moduleLoader, /if\(present\(file\)\)\{next\(\);return\}/);
  assert.match(moduleLoader, /if\(i>=managerStart\)\{start\(\);return\}/);
  assert.match(employeeAccess, /const detachNonEmployeeShell=/);
  assert.match(employeeAccess, /detachNonEmployeeShell\(\);document\.getElementById\('sfEmployeePortal'\)/);
  assert.match(employeeAccess, /event==='SIGNED_OUT'\)restoreNonEmployeeShell\(\)/);
});

test('manager time workspace loads in dependency order and repairs a DATEV-only placeholder', () => {
  const closeIndex = moduleLoader.indexOf("'assets/supabase-time-month-close-v1.js'");
  const workspaceIndex = moduleLoader.indexOf("'assets/time-workspace-v2.js'");
  const datevIndex = moduleLoader.indexOf("'assets/datev-lodas-export-v1.js'");
  assert.ok(closeIndex >= 0 && workspaceIndex > closeIndex && datevIndex > workspaceIndex);
  assert.match(moduleLoader, /'assets\/time-month-picker-v1\.js'/);
  assert.match(moduleLoader, /'assets\/datev-sic-download-v1\.js'/);
  assert.match(timeAccounts, /matches\('\[data-datev-only-host\]'\)/);
  assert.match(timeAccounts, /if\(preservedDatev\)wrap\.appendChild\(preservedDatev\)/);
});

test('password recovery uses a parseable callback and requires a valid session', () => {
  assert.match(passwordReset, /redirectTo:PROD\+'\?'\+RESET_PARAM\+'=1'/);
  assert.doesNotMatch(passwordReset, /redirectTo:[^\n]+#app/);
  assert.match(passwordReset, /normalizeLegacyRecoveryUrl\(\)/);
  assert.match(passwordReset, /u\.hash\.startsWith\(marker\)/);
  assert.match(passwordReset, /const \{data\}=await B\.client\.auth\.getSession\(\)/);
  assert.match(passwordReset, /data\?\.session\?B\.passwordResetNewDialog\(\):B\.passwordResetInvalidDialog\(\)/);
  assert.match(passwordReset, /Neuen Link anfordern/);
});
