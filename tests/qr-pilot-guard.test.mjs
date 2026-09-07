import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const prelock=fs.readFileSync(new URL('../supabase/migrations/20260908004500_qr_time_pilot_prelock_v1.sql',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260908005000_qr_time_pilot_guard_v1.sql',import.meta.url),'utf8');
const assignmentLock=fs.readFileSync(new URL('../supabase/migrations/20260908005100_qr_pilot_assignment_lock_v1.sql',import.meta.url),'utf8');
const privateClock=fs.readFileSync(new URL('../supabase/migrations/20260908005200_qr_pilot_private_clock_base_v1.sql',import.meta.url),'utf8');
const multiPilot=fs.readFileSync(new URL('../supabase/migrations/20260908005300_qr_pilot_multi_employee_v1.sql',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../assets/supabase-qr-pilot-guard-v1.js',import.meta.url),'utf8');
const nav=fs.readFileSync(new URL('../assets/navigation-compat-v1.js',import.meta.url),'utf8');

test('existing and new QR terminals are locked before pilot activation',()=>{
  assert.match(prelock,/update public\.time_qr_terminals[\s\S]*set is_active = false/i);
  assert.match(migration,/pilot_mode boolean not null default true/i);
  assert.match(migration,/alter column is_active set default false/i);
  assert.match(migration,/is_active, pilot_mode,[\s\S]*false, true, null/i);
});

test('employee QR status and clocking are protected by server-side pilot checks',()=>{
  assert.match(migration,/private\.sf_assert_qr_pilot_access\(p_token\)/);
  assert.match(migration,/time_qr_punches_pilot_guard/);
  assert.match(privateClock,/alter function public\.employee_clock_from_qr_unchecked\(text,text\)[\s\S]*set schema private/i);
  assert.match(privateClock,/revoke all on function private\.employee_clock_from_qr_unchecked\(text,text\)[\s\S]*from public, anon, authenticated/i);
  assert.match(privateClock,/return private\.employee_clock_from_qr_unchecked\(p_token, p_expected_action\)/i);
  assert.match(multiPilot,/create or replace function private\.sf_assert_qr_pilot_access/i);
  assert.match(multiPilot,/p\.employee_id = v_employee_id/i);
  assert.match(multiPilot,/e\.status = 'active'/i);
  assert.match(multiPilot,/e\.auth_user_id is not null/i);
  assert.match(multiPilot,/create or replace function private\.sf_enforce_qr_punch_pilot/i);
  assert.match(multiPilot,/p\.employee_id = new\.employee_id/i);
});

test('multiple pilot employees use a private allowlist with no direct client access',()=>{
  assert.match(multiPilot,/create table if not exists public\.time_qr_pilot_employees/i);
  assert.match(multiPilot,/primary key \(terminal_id, employee_id\)/i);
  assert.match(multiPilot,/enable row level security/i);
  assert.match(multiPilot,/revoke all on table public\.time_qr_pilot_employees from public, anon, authenticated/i);
  assert.match(multiPilot,/manager_set_time_qr_terminal_pilot_employees/i);
  assert.match(multiPilot,/maximal 10 pilot-mitarbeiter/i);
  assert.match(multiPilot,/v_terminal\.is_active and v_ids is distinct from v_current_ids/i);
});

test('pilot candidates expose only minimal fields and require active linked accounts',()=>{
  assert.match(migration,/manager_list_time_qr_pilot_candidates/);
  assert.match(migration,/'display_name'/);
  assert.match(migration,/'personnel_no'/);
  assert.match(migration,/e\.status = 'active'[\s\S]*e\.auth_user_id is not null/);
  assert.doesNotMatch(migration,/jsonb_build_object\([\s\S]{0,400}'email'/i);
  assert.doesNotMatch(migration,/jsonb_build_object\([\s\S]{0,400}'phone'/i);
});

test('only admins can change pilot allowlist or activate terminals',()=>{
  assert.match(multiPilot,/manager_set_time_qr_terminal_pilot_employees[\s\S]*private\.sf_is_manager\(v_terminal\.company_id, true\)/i);
  assert.match(multiPilot,/manager_set_time_qr_terminal_active[\s\S]*private\.sf_is_manager\(v_terminal\.company_id, true\)/i);
  assert.match(multiPilot,/mindestens einen Pilot-Mitarbeiter freigeben/i);
});

test('manager UI supports multi-selection and blocks activation until at least one employee is selected',()=>{
  assert.match(ui,/manager_list_time_qr_pilot_candidates/);
  assert.match(ui,/manager_set_time_qr_terminal_pilot_employees/);
  assert.match(ui,/select multiple data-qrt-pilot-select/);
  assert.match(ui,/selectedOptions/);
  assert.match(ui,/Mehrfachauswahl möglich/);
  assert.match(ui,/mindestens einen Pilot-Mitarbeiter auswählen/);
  assert.match(ui,/e\.preventDefault\(\);e\.stopImmediatePropagation\(\)/);
  assert.doesNotMatch(ui,/localStorage\.setItem/i);
  assert.doesNotMatch(ui,/sessionStorage\.setItem/i);
});

test('pilot guard integration uses the V2 cache marker',()=>{
  assert.match(nav,/supabase-qr-pilot-guard-v1\.js\?v=20260908-2/);
});
