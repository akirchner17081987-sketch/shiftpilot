import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260908005000_qr_time_pilot_guard_v1.sql',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../assets/supabase-qr-pilot-guard-v1.js',import.meta.url),'utf8');
const nav=fs.readFileSync(new URL('../assets/navigation-compat-v1.js',import.meta.url),'utf8');

test('QR terminals default to locked pilot mode',()=>{
  assert.match(migration,/pilot_mode boolean not null default true/i);
  assert.match(migration,/pilot_employee_id uuid references public\.employees\(id\)/i);
  assert.match(migration,/alter column is_active set default false/i);
  assert.match(migration,/check \(not is_active or pilot_employee_id is not null\)/i);
  assert.match(migration,/is_active, pilot_mode,[\s\S]*false, true, null/i);
});

test('employee QR status and clocking are protected by the server-side pilot guard',()=>{
  assert.match(migration,/private\.sf_assert_qr_pilot_access\(p_token\)/);
  assert.match(migration,/v_terminal\.pilot_employee_id <> v_employee_id/);
  assert.match(migration,/e\.status = 'active'/);
  assert.match(migration,/e\.auth_user_id is not null/);
  assert.match(migration,/employee_clock_from_qr_unchecked/);
  assert.match(migration,/revoke all on function public\.employee_clock_from_qr_unchecked\(text,text\) from public, anon, authenticated/i);
  assert.match(migration,/time_qr_punches_pilot_guard/);
});

test('pilot candidates expose only minimal fields and require active linked accounts',()=>{
  assert.match(migration,/manager_list_time_qr_pilot_candidates/);
  assert.match(migration,/'display_name'/);
  assert.match(migration,/'personnel_no'/);
  assert.match(migration,/e\.status = 'active'[\s\S]*e\.auth_user_id is not null/);
  assert.doesNotMatch(migration,/jsonb_build_object\([\s\S]{0,400}'email'/i);
  assert.doesNotMatch(migration,/jsonb_build_object\([\s\S]{0,400}'phone'/i);
});

test('only admins can assign pilot employees or activate terminals',()=>{
  const assign=migration.match(/create or replace function public\.manager_set_time_qr_terminal_pilot_employee[\s\S]*?grant execute on function public\.manager_set_time_qr_terminal_pilot_employee\(uuid,uuid\) to authenticated;/i)?.[0]||'';
  const activate=migration.match(/create or replace function public\.manager_set_time_qr_terminal_active[\s\S]*?grant execute on function public\.manager_set_time_qr_terminal_active\(uuid,boolean\) to authenticated;/i)?.[0]||'';
  assert.match(assign,/private\.sf_is_manager\(v_terminal\.company_id, true\)/i);
  assert.match(activate,/private\.sf_is_manager\(v_terminal\.company_id, true\)/i);
  assert.match(activate,/Bitte zuerst einen Pilot-Mitarbeiter freigeben/);
});

test('manager UI selects one pilot employee and blocks activation until ready',()=>{
  assert.match(ui,/manager_list_time_qr_pilot_candidates/);
  assert.match(ui,/manager_set_time_qr_terminal_pilot_employee/);
  assert.match(ui,/Pilot noch nicht startbereit/);
  assert.match(ui,/Kein freigabefähiger Mitarbeiter vorhanden/);
  assert.match(ui,/e\.preventDefault\(\);e\.stopImmediatePropagation\(\)/);
  assert.doesNotMatch(ui,/localStorage\.setItem/i);
  assert.doesNotMatch(ui,/sessionStorage\.setItem/i);
});

test('pilot guard integration is loaded with QR terminal management',()=>{
  assert.match(nav,/supabase-qr-pilot-guard-v1\.js\?v=20260908-1/);
});
