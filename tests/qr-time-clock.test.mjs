import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const sql=fs.readFileSync(new URL('../database/qr_time_clock_v1.sql',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../assets/supabase-qr-time-clock-v1.js',import.meta.url),'utf8');
const nav=fs.readFileSync(new URL('../assets/navigation-compat-v1.js',import.meta.url),'utf8');

test('QR station tokens are opaque, hashed and revocable',()=>{
  assert.match(sql,/token_hash bytea not null unique/i);
  assert.match(sql,/digest\(convert_to\(coalesce\(p_token,''\),'UTF8'\),'sha256'\)/i);
  assert.match(sql,/gen_random_bytes\(32\)/i);
  assert.doesNotMatch(sql,/\btoken\s+text\s+not null/i);
  assert.match(sql,/manager_rotate_time_clock_station_impl/i);
  assert.match(sql,/manager_set_time_clock_station_active_impl/i);
});

test('QR station and event tables have no direct browser access',()=>{
  for(const table of ['time_clock_stations','time_clock_events']){
    assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security;`,'i'));
    assert.match(sql,new RegExp(`revoke all on public\\.${table} from public, anon, authenticated;`,'i'));
  }
  assert.match(sql,/create schema if not exists qr_private/i);
  assert.match(sql,/revoke all on schema qr_private from public, anon, authenticated/i);
});

test('privileged QR implementations stay outside the exposed public schema',()=>{
  const privateFunctions=[
    'manager_list_time_clock_stations_impl',
    'manager_create_time_clock_station_impl',
    'manager_rotate_time_clock_station_impl',
    'manager_set_time_clock_station_active_impl',
    'employee_qr_clock_state_impl',
    'employee_qr_clock_impl'
  ];
  for(const name of privateFunctions){
    const re=new RegExp(`create or replace function qr_private\\.${name}[\\s\\S]*?security definer[\\s\\S]*?set search_path=''`,'i');
    assert.match(sql,re,`${name} must be private SECURITY DEFINER with fixed search_path`);
  }
  for(const name of ['manager_list_time_clock_stations','manager_create_time_clock_station','manager_rotate_time_clock_station','manager_set_time_clock_station_active','employee_qr_clock_state','employee_qr_clock']){
    const re=new RegExp(`create or replace function public\\.${name}[\\s\\S]*?security invoker[\\s\\S]*?set search_path=''`,'i');
    assert.match(sql,re,`${name} public wrapper must stay SECURITY INVOKER`);
  }
});

test('clock actions are server-timed, assignment-bound and duplicate guarded',()=>{
  assert.match(sql,/clock_timestamp\(\)/i);
  assert.match(sql,/e\.auth_user_id=v_user/i);
  assert.match(sql,/sa\.employee_id=v_employee\.id/i);
  assert.match(sql,/sa\.status='PUBLISHED' or sa\.published_at is not null/i);
  assert.match(sql,/starts_at - interval '2 hours'/i);
  assert.match(sql,/starts_at \+ interval '4 hours'/i);
  assert.match(sql,/interval '20 seconds'/i);
  assert.match(sql,/pg_advisory_xact_lock/i);
  assert.match(sql,/capture_method='QR'/i);
  assert.match(sql,/'CLOCK_IN'/i);
  assert.match(sql,/'CLOCK_OUT'/i);
  assert.match(sql,/status='recorded'/i);
  assert.match(sql,/sf_notify_managers/i);
});

test('employee UI checks state before committing a QR booking',()=>{
  const stateIndex=ui.indexOf("B.client.rpc('employee_qr_clock_state'");
  const commitIndex=ui.indexOf("B.client.rpc('employee_qr_clock'");
  assert.ok(stateIndex>=0,'state RPC missing');
  assert.ok(commitIndex>=0,'commit RPC missing');
  assert.ok(stateIndex<commitIndex,'state RPC must appear before booking RPC in the scan flow');
  assert.match(ui,/Dienstbeginn buchen/);
  assert.match(ui,/Dienstende buchen/);
  assert.match(ui,/employeeScanBusy/);
  assert.match(ui,/clearScanToken\(\)/);
});

test('manager UI can create, rotate and deactivate QR stations',()=>{
  assert.match(ui,/manager_list_time_clock_stations/);
  assert.match(ui,/manager_create_time_clock_station/);
  assert.match(ui,/manager_rotate_time_clock_station/);
  assert.match(ui,/manager_set_time_clock_station_active/);
  assert.match(ui,/qrcode@1\.5\.4\/build\/qrcode\.min\.js/);
  assert.match(ui,/QR als PNG speichern/);
  assert.match(ui,/Drucken/);
});

test('QR integration is loaded by the existing navigation integration loader',()=>{
  assert.match(nav,/supabase-qr-time-clock-v1\.js\?v=20260908-1/);
  assert.match(nav,/data-sf-qr-time-clock/);
});
