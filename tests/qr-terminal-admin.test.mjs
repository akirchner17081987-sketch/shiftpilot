import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const admin=fs.readFileSync(new URL('../assets/supabase-qr-terminal-admin-v1.js',import.meta.url),'utf8');
const guard=fs.readFileSync(new URL('../assets/supabase-qr-terminal-role-guard-v1.js',import.meta.url),'utf8');
const nav=fs.readFileSync(new URL('../assets/navigation-compat-v1.js',import.meta.url),'utf8');
const workspace=fs.readFileSync(new URL('../assets/time-workspace-v2.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const deletion=fs.readFileSync(new URL('../supabase/migrations/20260929020000_qr_terminal_admin_delete_v1.sql',import.meta.url),'utf8');

test('QR terminal management uses the protected manager RPCs',()=>{
  assert.match(admin,/manager_list_time_qr_terminals/);
  assert.match(admin,/manager_create_time_qr_terminal/);
  assert.match(admin,/manager_rotate_time_qr_terminal/);
  assert.match(admin,/manager_set_time_qr_terminal_active/);
});

test('new terminal token is only consumed through the returned QR path',()=>{
  assert.match(admin,/q\.data\.qr_path/);
  assert.doesNotMatch(admin,/localStorage\.setItem\([^\n]*token/i);
  assert.doesNotMatch(admin,/sessionStorage\.setItem\([^\n]*token/i);
});

test('manager can save and print the generated QR code',()=>{
  assert.match(admin,/\/assets\/vendor\/qrcode-1\.5\.4\.min\.js/);
  assert.ok(fs.statSync(new URL('../assets/vendor/qrcode-1.5.4.min.js',import.meta.url)).size>1000);
  assert.match(admin,/PNG speichern/);
  assert.match(admin,/Drucken/);
  assert.match(admin,/toDataURL\('image\/png'\)/);
});

test('manager loads the current code from the server each time',()=>{
  assert.match(admin,/manager_get_time_qr_terminal_qr_path/);
  assert.doesNotMatch(admin,/sessionStorage/);
  assert.doesNotMatch(admin,/knownQrPath/);
});

test('inactive terminals can be deleted only when the server confirms safety',()=>{
  assert.match(admin,/t\.is_active\?'':'<button class="ghost" data-qrt-delete>Löschen<\/button>'/);
  assert.match(admin,/manager_delete_time_qr_terminal/);
  assert.match(admin,/Terminals mit Zeitbuchungen können nicht gelöscht werden/);
  assert.match(deletion,/private\.sf_is_manager\(v_terminal\.company_id,true\)/);
  assert.match(deletion,/if v_terminal\.is_active then/);
  assert.match(deletion,/public\.time_qr_punches/);
  assert.match(deletion,/TIME_QR_TERMINAL_DELETED/);
  assert.match(deletion,/delete from vault\.secrets/);
  assert.match(deletion,/revoke all on function public\.manager_delete_time_qr_terminal\(uuid\) from public,anon/);
});

test('dispatcher and planner receive read-only QR terminal controls',()=>{
  assert.match(guard,/const ADMIN=new Set\(\['OWNER','ADMIN'\]\)/);
  assert.match(guard,/DISPATCHER/);
  assert.match(guard,/PLANNER/);
  assert.match(guard,/button\.disabled=true/);
  assert.match(guard,/button\.hidden=true/);
  assert.match(guard,/Lesemodus/);
});

test('QR terminal UI and role guard are loaded by the existing integration loader',()=>{
  assert.match(nav,/supabase-qr-terminal-admin-v1\.js\?v=20260929-3/);
  assert.match(nav,/supabase-qr-terminal-role-guard-v1\.js\?v=20260908-1/);
  assert.match(index,/navigation-compat-v1\.js\?v=20260930-timeonly2/);
});

test('time workspace exposes QR terminals as a dedicated third tab',()=>{
  assert.match(workspace,/data-time-mode="qr"[^>]*>QR-Terminals</);
  assert.match(workspace,/sf-tw-qr/);
  assert.match(workspace,/B\.qrTerminalAdmin\?\.refresh\?\.\(\)/);
  assert.match(workspace,/grid-template-columns:1fr 1fr 1fr/);
});
