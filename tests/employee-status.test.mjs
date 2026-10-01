import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('assets/employee-management-v2.js').replace(/\}\)\(\);\s*$/,'window.statusTest={setEmployeeStatus,overviewTab,bindStatusAvailability};})();');
function harness(){
  const calls=[],filters=[],e={id:'local',_dbId:'db',first:'Fiktiver',last:'Mitarbeiter',personnelNo:'TEST',status:'inactive',availabilityStatus:'red',qualifications:['FD','__sp:availability=red'],rhythmMode:'required',rhythmKind:'cycle',rhythmPattern:'FD, FREI',weeklyHours:40};
  const B={ready:true,companyId:'a',role:'OWNER',empDb:new Map(),empLocal:new Map(),client:{from(table){calls.push(['table',table]);return{update(p){calls.push(['update',p]);this.payload=p;return this},eq(k,v){filters.push([k,v]);return this},is(k,v){filters.push([k,v]);return this},select(){return this},async single(){return {data:{id:'db',status:this.payload.status}}}}}}};
  const fields={},c={window:{SFBackend:B},document:{readyState:'loading',addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[],getElementById:id=>fields[id]||null},sessionStorage:{getItem:()=>null},localStorage:{getItem:()=>null},renderPlanEmployeePool(){},showSaveToast(){},clearTimeout(){},setTimeout(){calls.push(['timer']);return 1},employees:[e]};
  vm.runInNewContext(read('assets/supabase-data-v1.js'),c);vm.runInNewContext(source,c);return{c,B,e,api:c.window.statusTest,calls,filters,fields};
}
test('activate inactive employee, restore availability and persist only status metadata for the selected company',async()=>{
  const {api,B,e,calls,filters}=harness();await api.setEmployeeStatus(e,'active');assert.equal(e.status,'active');assert.equal(e.availabilityStatus,'green');assert.ok(e.qualifications.includes('__sp:availability=green'));assert.ok(e.qualifications.includes('__sp:rhythmPattern=FD, FREI'));
  assert.deepEqual(Object.keys(calls.find(x=>x[0]==='update')[1]).sort(),['qualifications','status']);assert.deepEqual(filters,[['company_id','a'],['id','db'],['deleted_at',null]]);assert.equal(B.employeeStatusSaving,false);
});
test('deactivation retains availability and repeated activation preserves restricted availability',async()=>{
  const {api,e}=harness();e.status='active';e.availabilityStatus='yellow';await api.setEmployeeStatus(e,'inactive');assert.equal(e.status,'inactive');assert.equal(e.availabilityStatus,'yellow');await api.setEmployeeStatus(e,'active');assert.equal(e.availabilityStatus,'yellow');
});
test('deleted profiles, read-only roles and a pending company switch cannot be activated',async()=>{
  const {api,B,e,calls}=harness();e.deletedAt='2026-10-01';await assert.rejects(api.setEmployeeStatus(e,'active'),/gelöscht/);e.deletedAt=null;B.role='TIME_TRACKING';await assert.rejects(api.setEmployeeStatus(e,'active'),/Verwaltungsrechte/);B.role='OWNER';B.companySwitching=true;await assert.rejects(api.setEmployeeStatus(e,'active'),/geladen/);assert.equal(calls.length,0);assert.equal(e.status,'inactive');
});
test('failed persistence does not make an inactive employee appear active locally',async()=>{
  const {api,B,e}=harness();B.persistEmployeeStatus=async()=>{throw Error('offline')};await assert.rejects(api.setEmployeeStatus(e,'active'),/offline/);assert.equal(e.status,'inactive');assert.equal(e.availabilityStatus,'red');assert.equal(B.employeeStatusSaving,false);
});
test('background full sync waits while a status change is in flight',async()=>{
  const {B,calls}=harness();B.employeeStatusSaving=true;await B.sync();assert.deepEqual(calls,[['timer']]);assert.equal(B.syncing,false);
});
test('overview button matches current status and status selectors release legacy inactive blocking',()=>{
  const {api,e,fields}=harness();assert.match(api.overviewTab(e,false),/>Aktivieren<\/button>/);e.status='active';assert.match(api.overviewTab(e,false),/>Deaktivieren<\/button>/);e.status='inactive';let listener;fields.spStatus={value:'active',addEventListener(t,fn){listener=fn}};fields.spAvailabilityStatus={value:'red'};api.bindStatusAvailability(e,'spStatus','spAvailabilityStatus');listener();assert.equal(fields.spAvailabilityStatus.value,'green');
});
