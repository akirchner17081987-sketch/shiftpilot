import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260908003000_qr_time_tracking_v1.sql',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../qr-time.html',import.meta.url),'utf8');

const has=(pattern,message)=>assert.match(sql,pattern,message);

test('QR time tracking creates terminal and append-only punch tables',()=>{
  has(/create table if not exists public\.time_qr_terminals/i,'terminal table missing');
  has(/create table if not exists public\.time_qr_punches/i,'punch table missing');
  has(/punch_type text not null check \(punch_type in \('CLOCK_IN','CLOCK_OUT'\)\)/i,'punch types must be constrained');
});

test('QR tables are RLS protected and not directly exposed',()=>{
  has(/alter table public\.time_qr_terminals enable row level security/i,'terminal RLS missing');
  has(/alter table public\.time_qr_punches enable row level security/i,'punch RLS missing');
  has(/revoke all on table public\.time_qr_terminals from public, anon, authenticated/i,'terminal direct grants must be revoked');
  has(/revoke all on table public\.time_qr_punches from public, anon, authenticated/i,'punch direct grants must be revoked');
});

test('employee identity and timestamp are resolved server-side',()=>{
  has(/v_employee := private\.sf_employee_id\(\)/i,'employee must come from authenticated account mapping');
  has(/v_now timestamptz := clock_timestamp\(\)/i,'server time must drive punches');
  has(/auth\.uid\(\), 'CLOCK_IN', v_now/i,'clock-in must use auth uid and server time');
  has(/auth\.uid\(\), 'CLOCK_OUT', v_now/i,'clock-out must use auth uid and server time');
});

test('QR tokens are high entropy and stored only as hashes',()=>{
  has(/extensions\.gen_random_bytes\(32\)/i,'terminal token must have 256 bits of entropy');
  has(/token_hash bytea not null unique/i,'only token hash should be persisted');
  has(/extensions\.digest\(v_token,'sha256'\)/i,'created token must be hashed');
  assert.doesNotMatch(sql,/\btoken text\b[\s\S]*create table if not exists public\.time_qr_terminals/i,'terminal table must not contain plaintext token');
});

test('security definer QR functions use a fixed empty search path and explicit grants',()=>{
  for(const fn of ['private.sf_qr_time_context','public.employee_qr_time_status','public.employee_clock_from_qr','public.manager_create_time_qr_terminal','public.manager_list_time_qr_terminals','public.manager_rotate_time_qr_terminal','public.manager_set_time_qr_terminal_active']){
    const escaped=fn.replaceAll('.','\\.');
    assert.match(sql,new RegExp(`create or replace function ${escaped}[\\s\\S]{0,500}?security definer[\\s\\S]{0,80}?set search_path = ''`,'i'),`${fn} must pin search_path`);
  }
  has(/grant execute on function public\.employee_qr_time_status\(text\) to authenticated/i,'status RPC grant missing');
  has(/grant execute on function public\.employee_clock_from_qr\(text,text\) to authenticated/i,'clock RPC grant missing');
});

test('QR booking protects closed months and duplicate/stale submissions',()=>{
  has(/private\.sf_is_time_month_closed/i,'month closure check missing');
  has(/pg_advisory_xact_lock/i,'concurrent scans must be serialized');
  has(/interval '20 seconds'/i,'rapid duplicate scans must be rejected');
  has(/p_expected_action/i,'client must confirm the server-derived action');
});

test('mobile QR page does not accept employee id or timestamp from the browser',()=>{
  assert.match(html,/employee_qr_time_status/,'status RPC is not used by scan page');
  assert.match(html,/employee_clock_from_qr/,'clock RPC is not used by scan page');
  assert.doesNotMatch(html,/p_employee_id\s*:/i,'browser must never supply employee id');
  assert.doesNotMatch(html,/p_actual_(start|end)\s*:/i,'browser must never supply actual timestamps');
  assert.match(html,/Arbeitszeit jetzt starten/,'clock-in confirmation missing');
  assert.match(html,/Arbeitszeit jetzt beenden/,'clock-out confirmation missing');
});
