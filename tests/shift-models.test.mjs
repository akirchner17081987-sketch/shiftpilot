import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../assets/shift-models-v1.js',import.meta.url),'utf8');
const row=(code,active=true)=>({code,name:code,default_start:'06:00:00',default_end:'14:00:00',css_class:'teal',active});
const model={code:'F8',name:' Frühdienst ',start:'22:00',end:'06:00',soll:2,color:'teal'};
function harness(){
  const calls=[],tables={shift_templates:[row('F8')],global_staffing_requirements:[{shift_code:'F8',required_count:2}],daily_staffing_overrides:[]};
  const B={ready:true,role:'OWNER',companyId:'a',sync:async()=>calls.push(['sync',B.companyId]),client:{rpc:async(name,args)=>{calls.push([name,args]);return{data:{archived:false}}},from(table){return{select(){return this},eq(k,v){calls.push([table,k,v]);return this},order(){return this},then(resolve){resolve({data:tables[table]})}}}}};
  const c={window:{SFBackend:B},document:{getElementById:()=>null},sessionStorage:{getItem:()=>null},clearTimeout(){},TYPES:[{id:'old'}],selectedType:'old',globalSoll:{},dailySoll:{}};
  vm.runInNewContext(source,c);c.window.SFShiftModels.apply([row('F8')],'a');return{c,B,M:c.window.SFShiftModels,calls,tables};
}
test('active catalogue replaces defaults, preserves archived lookup and clears empty selection',()=>{
  const {c,M}=harness();M.apply([row('NEW'),row('OLD',false)],'a');assert.deepEqual(Array.from(M.activeCodes()),['NEW']);assert.equal(M.find('OLD').active,false);assert.equal(c.selectedType,'NEW');
  M.apply([],'a');assert.equal(c.TYPES.length,0);assert.equal(c.selectedType,null);assert.equal(M.find('OLD'),undefined);
});
test('switching company cannot expose old catalogue or rights',()=>{
  const {B,M}=harness();B.companyId='b';assert.equal(M.find('F8'),null);assert.equal(M.canManage(),false);M.apply([row('B8')],'b');assert.deepEqual(Array.from(M.activeCodes()),['B8']);assert.equal(M.find('F8'),undefined);
});
test('input supports overnight shifts and rejects invalid times, names, staffing and colors',()=>{
  const {M}=harness();assert.equal(M.validate(model).name,'Frühdienst');for(const delta of [{code:'bad code'},{name:'<script>'},{start:'24:01'},{end:'22:00'},{soll:1.5},{soll:100},{color:'red'}])assert.throws(()=>M.validate({...model,...delta}));
});
test('CRUD flushes pending work, calls RPC and reloads only selected company catalogue',async()=>{
  const {B,M,c,calls}=harness();B.syncTimer=1;await M.perform('CREATE',model);assert.equal(calls[0][0],'sync');assert.equal(calls[1][1].p_company_id,'a');assert.equal(calls[1][1].p_action,'CREATE');assert.equal(c.globalSoll.F8,2);assert.equal(B.shiftModelSaving,false);assert.equal(M.busy,false);assert.equal(calls.filter(x=>x[1]==='company_id').length,3);
});
test('roles, pending switches and failed saves cannot mutate models',async()=>{
  const {B,M,calls}=harness();B.role='VIEWER';await assert.rejects(M.perform('REMOVE',{code:'F8'}),/Planungsrechte/);B.role='OWNER';B.companySwitching=true;await assert.rejects(M.perform('REMOVE',{code:'F8'}),/geladen/);B.companySwitching=false;B.syncTimer=1;B.sync=async()=>B.lastSyncError=Error('save failed');await assert.rejects(M.perform('REMOVE',{code:'F8'}),/save failed/);assert.equal(calls.length,0);assert.equal(B.shiftModelSaving,false);
});
test('database removal stays committed when refreshing fails and tells user to reload',async()=>{
  const {B,M}=harness();B.client.from=()=>({select(){return this},eq(){return this},order(){return this},then(resolve){resolve({error:Error('offline')})}});await assert.rejects(M.perform('REMOVE',{code:'F8'}),/wurde gespeichert.*neu/);assert.equal(M.busy,false);
});
test('employee permissions and filters follow active models while keeping historical qualifications',()=>{
  const {c,M}=harness();M.apply([row('N8'),row('OLD',false),row('Teamleiter')],'a');c.document.readyState='loading';c.document.addEventListener=()=>{};
  const employeeSource=fs.readFileSync(new URL('../assets/employee-management-v2.js',import.meta.url),'utf8').replace(/\}\)\(\);\s*$/, 'window.modelTest={normalizeEmployee,qualifications,syncQualificationFilter};})();');
  vm.runInNewContext(employeeSource,c);const api=c.window.modelTest,e={shifts:['N8','OLD','unknown'],role:'Teamleiter'};api.normalizeEmployee(e);assert.deepEqual(Array.from(e.shifts),['N8','OLD','Teamleiter']);assert.deepEqual(Array.from(api.qualifications(e)),['N8','Teamleiter']);
  const box={dataset:{},innerHTML:'',querySelector:()=>({dataset:{q:'OLD'}}),querySelectorAll:()=>[]};api.syncQualificationFilter({querySelector:()=>box});assert.match(box.innerHTML,/data-q="N8"/);assert.doesNotMatch(box.innerHTML,/data-q="OLD"/);
  M.apply([row('N8')],'a');api.normalizeEmployee(e);assert.deepEqual(Array.from(e.shifts),['N8']);
});

test('morning OT switch counts three distinct O3 workers from the previous night through 08:00',()=>{
 const {c,M}=harness();M.apply([{...row('O3'),default_start:'22:00',default_end:'08:00'}, {...row('OT1'),default_start:'06:00',default_end:'16:00'}, {...row('OT2'),default_start:'08:00',default_end:'18:00',morning_ot_switch_min:3}],'a');
 c.globalSoll={OT1:1,OT2:1};c.assignments=[1,2,3].map(employeeId=>({employeeId,type:'O3',date:'2026-11-30',start:'22:00',end:'08:00'}));
 assert.equal(M.morningOtSwitch('2026-12-01'),true);assert.equal(M.requiredSoll('2026-12-01','OT1',1),0);assert.equal(M.requiredSoll('2026-12-01','OT2',1),2);
 assert.equal(M.morningOtSwitch('2026-11-30'),false);c.assignments[2].end='07:00';assert.equal(M.morningOtSwitch('2026-12-01'),false);c.assignments[2].end='08:00';c.assignments[2].employeeId=2;assert.equal(M.morningOtSwitch('2026-12-01'),false);
});
test('morning OT proposals change times and revert when a supporting O3 is removed; protected OT1 is counted',()=>{
 const {c,M}=harness();M.apply([{...row('O3'),default_start:'22:00',default_end:'08:00'}, {...row('OT1'),default_start:'06:00',default_end:'16:00'}, {...row('OT2'),default_start:'08:00',default_end:'18:00',morning_ot_switch_min:3}],'a');
 c.employees=[{id:'day',shifts:['OT1','OT2']}];c.globalSoll={OT1:1,OT2:1};c.assignments=[];const night=[1,2,3].map(employeeId=>({employeeId,type:'O3',date:'2026-12-01'})),a={employeeId:'day',date:'2026-12-02',type:'OT1',start:'06:00',end:'16:00'};
 M.normalizeMorningOt([...night,a],[]);assert.equal(a.type,'OT2');assert.equal(a.start,'08:00');assert.equal(a.end,'18:00');M.normalizeMorningOt([night[0],night[1],a],[]);assert.equal(a.type,'OT1');assert.equal(a.start,'06:00');
 c.assignments=[...night,{...a,date:'2026-12-02'}];assert.equal(M.requiredSoll('2026-12-02','OT2',1),1);assert.equal(M.requiredSoll('2026-12-02','OT1',1),1);
 c.window.SFBackend.companyId='b';assert.equal(M.morningOtSwitch('2026-12-02'),false);
});
