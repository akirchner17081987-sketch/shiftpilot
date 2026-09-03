import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../assets/demo-august-2026-v1.js',import.meta.url),'utf8');
const navigation=fs.readFileSync(new URL('../assets/navigation-compat-v1.js',import.meta.url),'utf8');

test('August 2026 demo module is loaded by the application',()=>{
  assert.match(navigation,/demo-august-2026-v1\.js/);
  assert.doesNotThrow(()=>new Function(source));
});

test('demo reference month covers all 31 days and includes O1S and QA',()=>{
  assert.match(source,/MONTH='2026-08'/);
  assert.match(source,/length:31/);
  assert.match(source,/D003:'O1S'/);
  assert.match(source,/D004:'QA'/);
  assert.match(source,/dailySoll\[date\]=\{\.\.\.counts\}/);
});

test('August demo provides confirmed time entries and a closed month for DATEV',()=>{
  assert.match(source,/entry_status:'confirmed'/);
  assert.match(source,/manager_time_month_status/);
  assert.match(source,/status:'CLOSED'/);
  assert.match(source,/manager_time_report_bundle/);
  assert.match(source,/manager_list_time_entries/);
});

test('DATEV demo uses numeric personnel numbers and an absence example',()=>{
  assert.match(source,/personnel_no:String\(1001\+i\)/);
  assert.match(source,/absence_types:'Urlaub'/);
  assert.match(source,/absence_credit_minutes:480/);
});

test('August is selected as the initial demo month without affecting production mode',()=>{
  assert.match(source,/sf_demo_session_v1/);
  assert.match(source,/input\.value=MONTH/);
  assert.match(source,/setMode\?\.\('month'\)/);
});
