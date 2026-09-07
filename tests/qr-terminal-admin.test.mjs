import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const admin=fs.readFileSync(new URL('../assets/supabase-qr-terminal-admin-v1.js',import.meta.url),'utf8');
const guard=fs.readFileSync(new URL('../assets/supabase-qr-terminal-role-guard-v1.js',import.meta.url),'utf8');
const nav=fs.readFileSync(new URL('../assets/navigation-compat-v1.js',import.meta.url),'utf8');

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
  assert.match(admin,/qrcode@1\.5\.4\/build\/qrcode\.min\.js/);
  assert.match(admin,/PNG speichern/);
  assert.match(admin,/Drucken/);
  assert.match(admin,/toDataURL\('image\/png'\)/);
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
  assert.match(nav,/supabase-qr-terminal-admin-v1\.js\?v=20260908-1/);
  assert.match(nav,/supabase-qr-terminal-role-guard-v1\.js\?v=20260908-1/);
});
