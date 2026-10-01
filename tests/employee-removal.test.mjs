import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../assets/employee-removal-v1.js',import.meta.url),'utf8');
function harness(){
  const calls=[],snapshot={employee_id:'db-1',employee_name:'Fiktiver Mitarbeiter',companyId:'a',localId:'1',fingerprint:'version1'};
  const B={ready:true,companyId:'a',role:'OWNER',sync:async()=>calls.push(['sync']),hydrate:async()=>{calls.push(['hydrate']);assert.equal(B.employeeRemovalBusy,true)},client:{rpc:async(name,args)=>{calls.push([name,args]);return{data:name==='manager_employee_removal_preview'?snapshot:{removed:true}}}}};
  const c={window:{SFBackend:B},sessionStorage:{getItem:()=>null},clearTimeout(){},selectedEmployeeId:'1',selectedPlanEmployeeId:'1'};
  vm.runInNewContext(source,c);return{D:c.window.SFEmployeeRemoval,B,c,calls,snapshot};
}
test('name and separate checkbox are both required; no destructive call on invalid confirmation',async()=>{
  const {D,snapshot,calls}=harness();for(const [name,ack] of [['',true],['Wrong Name',true],['Fiktiver Mitarbeiter',false],['Fiktiver Mitarbeiter',1]])await assert.rejects(D.commit(snapshot,name,ack),/vollständigen Namen/);assert.equal(calls.length,0);
});
test('company, role and concurrent operation restrictions prevent removal',async()=>{
  const {D,B,snapshot,calls}=harness();B.role='TIME_TRACKING';await assert.rejects(D.commit(snapshot,snapshot.employee_name,true),/Verwaltungsrechte/);B.role='OWNER';B.companyId='b';await assert.rejects(D.commit(snapshot,snapshot.employee_name,true),/gewechselt/);B.companyId='a';B.companySwitching=true;await assert.rejects(D.commit(snapshot,snapshot.employee_name,true),/geladen/);assert.equal(calls.length,0);assert.equal(D.busy,false);assert.equal(B.employeeRemovalBusy,undefined);
});
test('preview and confirmed removal use the selected company and flush pending edits',async()=>{
  const {D,B,c,calls,snapshot}=harness();B.syncTimer=1;const preview=await D.preview({id:'1',_dbId:'db-1'});assert.equal(calls[0][0],'sync');assert.equal(calls[1][1].p_company_id,'a');await D.commit(preview,' Fiktiver Mitarbeiter ',true);assert.equal(calls[2][0],'manager_remove_employee');assert.equal(calls[2][1].p_fingerprint,snapshot.fingerprint);assert.equal(calls[2][1].p_acknowledged,true);assert.equal(calls[3][0],'hydrate');assert.equal(c.selectedEmployeeId,null);assert.equal(c.selectedPlanEmployeeId,null);assert.equal(D.busy,false);
});
test('stale server preview leaves local selection unchanged and performs no reload',async()=>{
  const {D,B,c,calls,snapshot}=harness();B.client.rpc=async()=>({error:Error('Die betroffenen Daten wurden inzwischen geändert.')});await assert.rejects(D.commit(snapshot,snapshot.employee_name,true),/geändert/);assert.equal(c.selectedEmployeeId,'1');assert.equal(calls.length,0);assert.equal(D.busy,false);
});
test('failed hydration after a committed deletion tells the user to reload',async()=>{
  const {D,B,snapshot}=harness();B.hydrate=async()=>{throw Error('offline')};await assert.rejects(D.commit(snapshot,snapshot.employee_name,true),/wurde gelöscht.*Seite neu/);assert.equal(D.busy,false);
});
test('demo removal changes only isolated session fixtures and never calls backend',async()=>{
  const {D,c,calls,snapshot}=harness();c.sessionStorage.getItem=()=> 'active';c.employees=[{id:'1'},{id:'2'}];c.assignments=[{id:'d1',employeeId:'1'},{id:'d2',employeeId:'2'}];c.absences=[{employeeId:'1'},{employeeId:'2'}];c.timeEntries={d1:{},d2:{}};c.saveAll=()=>{};
  await D.commit({...snapshot,demo:true},snapshot.employee_name,true);assert.equal(c.employees.length,1);assert.equal(c.assignments.length,1);assert.equal(c.absences.length,1);assert.equal(c.timeEntries.d1,undefined);assert.ok(c.timeEntries.d2);assert.equal(calls.length,0);
});
test('removed personnel are hidden from overview and direct profile selection',()=>{
  const c={window:{},document:{readyState:'loading',addEventListener(){}},employees:[{id:'1',deletedAt:'2026-10-01',status:'inactive'},{id:'2',first:'Remaining',last:'Employee',status:'active',shifts:[]}],selectedEmployeeId:'1'};
  const management=fs.readFileSync(new URL('../assets/employee-management-v2.js',import.meta.url),'utf8').replace(/\}\)\(\);\s*$/,'window.testRemoval={emp};})();');vm.runInNewContext(management,c);assert.equal(c.window.testRemoval.emp(),undefined);c.selectedEmployeeId='2';assert.equal(c.window.testRemoval.emp().id,'2');
});
