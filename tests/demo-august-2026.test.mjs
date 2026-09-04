import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../assets/demo-august-2026-v1.js',import.meta.url),'utf8');
const navigation=fs.readFileSync(new URL('../assets/navigation-compat-v1.js',import.meta.url),'utf8');
const datevFix=fs.readFileSync(new URL('../assets/demo-datev-snapshot-fix-v1.js',import.meta.url),'utf8');
const brandCleanup=fs.readFileSync(new URL('../assets/schichtfunk-brand-cleanup-v2.js',import.meta.url),'utf8');

test('August 2026 demo module is loaded by the application',()=>{
  assert.match(navigation,/demo-august-2026-v1\.js/);
  assert.match(navigation,/demo-datev-snapshot-fix-v1\.js\?v=20260904-2/);
  assert.doesNotThrow(()=>new Function(source));
  assert.doesNotThrow(()=>new Function(datevFix));
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
  assert.match(source,/calendar\.setMonth\(MONTH\)/);
  assert.match(source,/TIME_MONTH_KEY='sf\.time\.selectedMonth'/);
  assert.match(source,/timeInput\.value=MONTH/);
  assert.match(source,/accountInput\.value=MONTH/);
  assert.match(brandCleanup,/sf_demo_session_v1'\)==='active'\?'2026-08':currentMonth\(\)/);
  assert.match(navigation,/demo-august-2026-v1\.js\?v=20260904-2/);
});

test('DATEV demo RPC bridge is patched only once and does not build recursive wrapper chains',()=>{
  assert.match(datevFix,/if\(patched\)return true/);
  assert.doesNotMatch(datevFix,/setTimeout\(ensure,500\)/);
  assert.match(datevFix,/wrapper\.__sfDemoDatevSnapshotFixV2=true/);
});

test('DATEV demo isolates months outside August instead of calling product data',()=>{
  assert.match(datevFix,/if\(name==='manager_time_month_status'\)/);
  assert.match(datevFix,/return \{data:\{status:'OPEN'/);
  assert.match(datevFix,/return \{data:\{employees:\[\],details:\[\],demo:true\},error:null\}/);
  assert.match(datevFix,/return \{data:\[\],error:null\}/);
});
