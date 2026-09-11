import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const prelock=fs.readFileSync(new URL('../supabase/migrations/20260908000049_qr_time_pilot_prelock_v1.sql',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260908000120_qr_time_pilot_guard_v1.sql',import.meta.url),'utf8');
const assignmentLock=fs.readFileSync(new URL('../supabase/migrations/20260908000129_qr_pilot_assignment_lock_v1.sql',import.meta.url),'utf8');
const privateClock=fs.readFileSync(new URL('../supabase/migrations/20260908000135_qr_pilot_private_clock_base_v1.sql',import.meta.url),'utf8');
const whitelist=fs.readFileSync(new URL('../supabase/migrations/20260908000200_qr_pilot_multi_employee_v1.sql',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../assets/supabase-qr-pilot-guard-v1.js',import.meta.url),'utf8');
const nav=fs.readFileSync(new URL('../assets/navigation-compat-v1.js',import.meta.url),'utf8');

test('existing and new QR terminals are locked before pilot activation',()=>{
  assert.match(prelock,/update public\.time_qr_terminals[\s\S]*set is_active = false/i);
  assert.match(migration,/pilot_mode boolean not null default true/i);
  assert.match(migration,/alter column is_active set default false/i);
  assert.match(whitelist,/create table if not exists public\.time_qr_pilot_employees/i);
});

test('employee QR status and clocking are protected by the server-side pilot whitelist',()=>{
  assert.match(whitelist,/create or replace function private\.sf_assert_qr_pilot_access\(p_token text\)/i);
  assert.match(whitelist,/p\.employee_id\s*=\s*v_employee_id/i);
  assert.match(whitelist,/e\.status\s*=\s*'active'/i);
  assert.match(whitelist,/e\.auth_user_id is not null/i);
  assert.match(whitelist,/create or replace function private\.sf_enforce_qr_punch_pilot\(\)/i);
  assert.match(migration,/time_qr_punches_pilot_guard/i);
  assert.match(privateClock,/alter function public\.employee_clock_from_qr_unchecked\(text,text\)[\s\S]*set schema private/i);
  assert.match(privateClock,/revoke all on function private\.employee_clock_from_qr_unchecked\(text,text\)[\s\S]*from public,\s*anon,\s*authenticated/i);
  assert.match(privateClock,/return private\.employee_clock_from_qr_unchecked\(p_token, p_expected_action\)/i);
});

test('pilot whitelist uses RLS and no direct client rights',()=>{
  assert.match(whitelist,/alter table public\.time_qr_pilot_employees enable row level security/i);
  assert.match(whitelist,/revoke all on table public\.time_qr_pilot_employees from public,\s*anon,\s*authenticated/i);
  assert.match(whitelist,/primary key \(terminal_id, employee_id\)/i);
});

test('pilot candidates expose only minimal fields and require active linked accounts',()=>{
  assert.match(migration,/manager_list_time_qr_pilot_candidates/);
  assert.match(migration,/'display_name'/);
  assert.match(migration,/'personnel_no'/);
  assert.match(migration,/e\.status\s*=\s*'active'[\s\S]*e\.auth_user_id is not null/);
  assert.doesNotMatch(migration,/jsonb_build_object\([\s\S]{0,400}'email'/i);
  assert.doesNotMatch(migration,/jsonb_build_object\([\s\S]{0,400}'phone'/i);
});

test('only admins can change the pilot whitelist or activate terminals',()=>{
  const assign=whitelist.match(/create or replace function public\.manager_set_time_qr_terminal_pilot_employees[\s\S]*?grant execute on function public\.manager_set_time_qr_terminal_pilot_employees\(uuid,uuid\[\]\) to authenticated;/i)?.[0]||'';
  const activate=whitelist.match(/create or replace function public\.manager_set_time_qr_terminal_active[\s\S]*?grant execute on function public\.manager_set_time_qr_terminal_active\(uuid,boolean\) to authenticated;/i)?.[0]||'';
  assert.match(assign,/private\.sf_is_manager\(v_terminal\.company_id,\s*true\)/i);
  assert.match(assign,/v_terminal\.is_active/i);
  assert.match(assign,/Maximal 10 Pilot-Mitarbeiter/i);
  assert.match(activate,/private\.sf_is_manager\(v_terminal\.company_id,\s*true\)/i);
  assert.match(activate,/Bitte zuerst mindestens einen Pilot-Mitarbeiter freigeben/i);
});

test('manager UI supports multiple selected pilot employees and blocks activation until ready',()=>{
  assert.match(ui,/manager_list_time_qr_pilot_candidates/);
  assert.match(ui,/manager_set_time_qr_terminal_pilot_employees/);
  assert.match(ui,/p_employee_ids:employeeIds/);
  assert.match(ui,/Mehrfachauswahl/i);
  assert.match(ui,/Bitte zuerst mindestens einen Pilot-Mitarbeiter auswählen/);
  assert.match(ui,/Pilotbetrieb kann noch nicht aktiviert werden/);
  assert.match(ui,/e\.preventDefault\(\);e\.stopImmediatePropagation\(\)/);
  assert.doesNotMatch(ui,/localStorage\.setItem/i);
  assert.doesNotMatch(ui,/sessionStorage\.setItem/i);
});

test('pilot guard integration is loaded with QR terminal management',()=>{
  assert.match(nav,/supabase-qr-pilot-guard-v1\.js\?v=20260910-1/);
});
