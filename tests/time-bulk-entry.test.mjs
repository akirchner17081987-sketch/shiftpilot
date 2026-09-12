import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('manager UI offers a guarded bulk time-entry action',()=>{
  const ui=read('assets/supabase-time-tracking-v1.js');
  assert.match(ui,/Alle offenen Zeiten erfassen/);
  assert.doesNotMatch(ui,/sfTimeBulkAcknowledge/);
  assert.match(ui,/sf-time-bulk-apply/);
  assert.match(ui,/manager_bulk_record_time_entries/);
  assert.match(ui,/p_confirm:true/);
  assert.match(ui,/Geschlossene Monate, zukünftige Schichten und vorhandene Zeiteinträge/);
});

test('demo supports bulk time entry without external calls',()=>{
  const demo=read('assets/demo-marketplace-v1.js');
  const gate=read('demo.html');
  assert.match(demo,/name==='manager_bulk_record_time_entries'/);
  assert.match(demo,/row\.actual_start=row\.starts_at/);
  assert.match(demo,/row\.entry_status=args\.p_confirm\?'confirmed':'recorded'/);
  assert.match(gate,/demo-marketplace-v1\.js\?v=20260911-bulk2/);
});

test('selected month drives the query and stale requests cannot overwrite it',()=>{
  const ui=read('assets/supabase-time-tracking-v1.js');
  const loader=read('assets/conflict-plausibility-v1.js');
  assert.match(ui,/document\.getElementById\('sfTimeMonthPicker'\)\?\.value/);
  assert.match(ui,/return\{start:`\$\{selected\}-01`,end:`\$\{selected\}-\$\{last\}`\}/);
  assert.match(ui,/const request=\+\+managerLoadSequence/);
  assert.match(ui,/if\(request!==managerLoadSequence\)return false/);
  assert.match(ui,/const applied=await loadManager\(monthOverride\);if\(applied\)renderManagerRows\(\)/);
  assert.match(ui,/periodRange\(monthOverride\)/);
  assert.match(ui,/sfTimeMonthPicker'\)\?\.value!==monthOverride/);
  assert.match(loader,/supabase-time-tracking-v1\.js'\?'20260912-monthfix2'/);
  assert.match(loader,/time-month-picker-v1\.js'\?'20260912-monthfix2'/);
});

test('bulk RPC is atomic, restricted and protects existing or ineligible rows',()=>{
  const sql=read('supabase/migrations/20260911080807_manager_bulk_record_include_planned_shifts.sql');
  assert.match(sql,/security definer/i);
  assert.match(sql,/set search_path=''/i);
  assert.match(sql,/private\.sf_is_manager\(p_company_id,false\)/i);
  assert.match(sql,/sa\.status<>'CANCELLED'/i);
  assert.doesNotMatch(sql,/sa\.status='PUBLISHED'/i);
  assert.match(sql,/te\.assignment_id is null/i);
  assert.match(sql,/sa\.ends_at<=now\(\)/i);
  assert.match(sql,/sf_is_time_month_closed/i);
  assert.match(sql,/on conflict\(assignment_id\) do nothing/i);
  assert.match(sql,/jsonb_build_object\('bulk',true/i);
  assert.match(sql,/revoke all .* from public,anon/i);
  assert.match(sql,/grant execute .* to authenticated/i);
});
