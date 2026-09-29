import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../assets/supabase-time-tracking-v1.js',import.meta.url),'utf8');
function harness(now='2026-09-29T20:15:00Z'){
  const mode={value:'day'},month={value:'2026-09'},B={companyTimeZone:'Europe/Berlin'};
  class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return new Date(now).getTime()}}
  const code=source.replace('B.timeTracking={refreshManager:renderManager,refreshEmployee:augmentEmployee}', 'B.timeTracking={periodRange,rowInPeriod,loadManager,rows:()=>managerRows}');
  vm.runInNewContext(code,{window:{SFBackend:B},document:{getElementById:id=>id==='timePeriod'?mode:id==='sfTimeMonthPicker'?month:null,addEventListener(){}},Date:Clock,Intl,Map,Set,Number,String,Math,setTimeout(){},console});
  return{B,mode,month,api:B.timeTracking};
}
const row=(start,end)=>({starts_at:start,ends_at:end});
test('current day includes whole nights on both sides and excludes yesterday daytime',()=>{
  const {api}=harness(),range=api.periodRange();
  assert.equal(range.start,'2026-09-29');assert.equal(range.end,'2026-09-29');
  const night=row('2026-09-28T18:00:00+02:00','2026-09-29T04:00:00+02:00');
  assert.ok(api.rowInPeriod(night,range));assert.equal(night.starts_at,'2026-09-28T18:00:00+02:00');assert.equal(night.ends_at,'2026-09-29T04:00:00+02:00');
  assert.ok(api.rowInPeriod(row('2026-09-29T22:00:00+02:00','2026-09-30T08:00:00+02:00'),range));
  assert.ok(!api.rowInPeriod(row('2026-09-28T06:00:00+02:00','2026-09-28T16:00:00+02:00'),range));
  assert.ok(!api.rowInPeriod(row('2026-09-28T18:00:00+02:00','2026-09-29T00:00:00+02:00'),range));
  assert.ok(!api.rowInPeriod(row('2026-09-30T00:00:00+02:00','2026-09-30T08:00:00+02:00'),range));
});
test('today uses company timezone across UTC midnight and month boundaries',()=>{
  const {api}=harness('2026-09-30T22:30:00Z');assert.equal(api.periodRange().start,'2026-10-01');
  assert.ok(api.rowInPeriod(row('2026-09-30T22:00:00+02:00','2026-10-01T08:00:00+02:00'),api.periodRange()));
});
test('current calendar week uses Monday to Sunday across year boundary',()=>{
  const {api,mode}=harness('2027-01-01T12:00:00Z');mode.value='week';const range=api.periodRange();
  assert.equal(range.start,'2026-12-28');assert.equal(range.end,'2027-01-03');
  assert.ok(api.rowInPeriod(row('2026-12-27T22:00:00+01:00','2026-12-28T08:00:00+01:00'),range));
});
test('day overlap handles both daylight saving time transitions',()=>{
  for(const [now,start,end] of [['2026-03-29T10:00:00Z','2026-03-28T22:00:00+01:00','2026-03-29T08:00:00+02:00'],['2026-10-25T10:00:00Z','2026-10-24T22:00:00+02:00','2026-10-25T08:00:00+01:00']]){
    const {api}=harness(now);assert.ok(api.rowInPeriod(row(start,end),api.periodRange()));
  }
});
test('month keeps full selected month including leap years',()=>{
  const {api,mode,month}=harness();mode.value='month';month.value='2028-02';const range=api.periodRange();
  assert.equal(range.start,'2028-02-01');assert.equal(range.end,'2028-02-29');
});
test('server lookback includes prior night but rows and bulk actions only get overlapping shifts',async()=>{
  const {api,B}=harness();B.role='OWNER';B.companyId='fixture';let params;
  B.client={rpc:async(_name,args)=>{params=args;return{data:[row('2026-09-28T06:00:00+02:00','2026-09-28T16:00:00+02:00'),row('2026-09-28T22:00:00+02:00','2026-09-29T08:00:00+02:00'),row('2026-09-29T22:00:00+02:00','2026-09-30T08:00:00+02:00')]}}};
  await api.loadManager();assert.equal(params.p_start_date,'2026-09-27');assert.equal(params.p_end_date,'2026-09-30');assert.equal(api.rows().length,2);
});
