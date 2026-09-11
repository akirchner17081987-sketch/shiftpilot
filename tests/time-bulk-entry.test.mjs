import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('manager UI offers a guarded bulk time-entry action',()=>{
  const ui=read('assets/supabase-time-tracking-v1.js');
  assert.match(ui,/Alle offenen Zeiten erfassen/);
  assert.match(ui,/sfTimeBulkAcknowledge/);
  assert.match(ui,/manager_bulk_record_time_entries/);
  assert.match(ui,/p_confirm:direct\.checked/);
  assert.match(ui,/Geschlossene Monate, zukünftige Schichten und vorhandene Zeiteinträge/);
});

test('demo supports bulk time entry without external calls',()=>{
  const demo=read('assets/demo-marketplace-v1.js');
  assert.match(demo,/name==='manager_bulk_record_time_entries'/);
  assert.match(demo,/row\.actual_start=row\.starts_at/);
  assert.match(demo,/row\.entry_status=args\.p_confirm\?'confirmed':'recorded'/);
});

test('bulk RPC is atomic, restricted and protects existing or ineligible rows',()=>{
  const sql=read('supabase/migrations/20260911074521_manager_bulk_record_time_entries.sql');
  assert.match(sql,/security definer/i);
  assert.match(sql,/set search_path=''/i);
  assert.match(sql,/private\.sf_is_manager\(p_company_id,false\)/i);
  assert.match(sql,/sa\.status='PUBLISHED'/i);
  assert.match(sql,/te\.assignment_id is null/i);
  assert.match(sql,/sa\.ends_at<=now\(\)/i);
  assert.match(sql,/sf_is_time_month_closed/i);
  assert.match(sql,/on conflict\(assignment_id\) do nothing/i);
  assert.match(sql,/jsonb_build_object\('bulk',true/i);
  assert.match(sql,/revoke all .* from public,anon/i);
  assert.match(sql,/grant execute .* to authenticated/i);
});
