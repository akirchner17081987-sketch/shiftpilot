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

test('exclusive weekday FD and team weekend FD-WE reject wrong staff, days and times',()=>{
 const {M}=harness();M.apply([
  {...row('FD'),allowed_personnel_nos:['2048','26','2001'],exclusive_employees:true,strict_weekdays:true,strict_times:true,optional_weekdays:[1,2,3,4,5]},
  {...row('FD-WE'),requires_planning_team:true,strict_weekdays:true,strict_times:true,optional_weekdays:[6,7],rhythm_alias:'FD'},
  {...row('SD'),default_start:'14:00',default_end:'22:00'}
 ],'a');
 const day={personnelNo:'2048'},team={personnelNo:'126',qualifications:['__sp:planningTeam=D']},other={personnelNo:'999'};
 for(const no of ['2048','26','2001'])assert.equal(M.allowsEmployee('FD',{personnelNo:no},'2027-01-04'),true);
 assert.equal(M.allowsEmployee('FD',day,'2027-01-02'),false);
 assert.equal(M.allowsEmployee('FD',team,'2027-01-04'),false);
 assert.equal(M.allowsEmployee('FD-WE',day,'2027-01-02'),false);
 assert.equal(M.allowsEmployee('SD',day,'2027-01-04'),false);
 assert.equal(M.allowsEmployee('FD-WE',team,'2027-01-02'),true);
 assert.equal(M.allowsEmployee('FD-WE',team,'2027-01-04'),false);
 assert.equal(M.allowsEmployee('FD-WE',other,'2027-01-02'),false);
 assert.match(M.planningRestriction('FD',day,'2027-01-04','07:00','15:00'),/06:00 bis 14:00/);
 assert.equal(M.planningRestriction('FD',day,'2027-01-04','06:00','14:00'),null);
});
test('strict weekday demand cannot be reenabled with daily overrides; ordinary models retain overrides',()=>{
 const {M,c}=harness();M.apply([{...row('FD'),strict_weekdays:true,optional_weekdays:[1,2,3,4,5]}, {...row('FD-WE'),strict_weekdays:true,optional_weekdays:[6,7]}, {...row('OTHER'),optional_weekdays:[6,7]}],'a');
 c.dailySoll={'2027-01-02':{FD:9},'2027-01-04':{'FD-WE':9,OTHER:2}};
 assert.equal(M.rawRequired('2027-01-02','FD',3),0);assert.equal(M.rawRequired('2027-01-04','FD-WE',3),0);assert.equal(M.rawRequired('2027-01-04','OTHER',3),2);assert.equal(M.rawRequired('2027-01-02','FD-WE',3),3);
});
test('team rhythm resolves FD to FD-WE while personal weekday FD stays unchanged',()=>{
 const {M,c}=harness();M.apply([{...row('FD'),allowed_personnel_nos:['2048'],exclusive_employees:true,strict_weekdays:true,optional_weekdays:[1,2,3,4,5]}, {...row('FD-WE'),requires_planning_team:true,strict_weekdays:true,optional_weekdays:[6,7],rhythm_alias:'FD'}],'a');
 vm.runInNewContext(fs.readFileSync(new URL('../assets/employee-rhythm-v1.js',import.meta.url),'utf8'),c);
 const team={personnelNo:'126',planningTeam:'D',rhythmStart:'2027-01-02',rhythmPattern:'FD,FD'},day={personnelNo:'2048',rhythmMode:'required',rhythmStart:'2027-01-04',rhythmPattern:'FD,FD,FD,FD,FD,FREI,FREI'};
 assert.equal(c.window.SFRhythm.check(team,'FD-WE','2027-01-02').allowed,true);assert.equal(c.window.SFRhythm.check(team,'FD-WE','2027-01-04').allowed,false);
 assert.equal(c.window.SFRhythm.check(day,'FD','2027-01-04').allowed,true);
 assert.equal(c.window.SFRhythm.config(day).pattern[0],'FD');assert.equal(c.window.SFRhythm.check(day,'O1','2027-01-09').expected,'FREI');
 M.apply([row('FD')],'a');assert.equal(M.teamRhythmCode('FD'),'FD');
});
test('manual compliance treats staff and shift time restrictions as hard conflicts',()=>{
 const {M,c}=harness();M.apply([{...row('FD'),allowed_personnel_nos:['2048'],exclusive_employees:true,strict_weekdays:true,strict_times:true,optional_weekdays:[1,2,3,4,5]},row('SD')],'a');
 Object.assign(c,{assignments:[],absences:[],store:{get:(_key,fallback)=>fallback,set:()=>{}},typeById:code=>c.TYPES.find(t=>t.id===code),getSoll:()=>3,assignmentsFor:()=>[]});
 vm.runInNewContext(fs.readFileSync(new URL('../assets/compliance-core-v2.js',import.meta.url),'utf8'),c);
 const day={id:'d',personnelNo:'2048',status:'active',shifts:['FD','SD']};
 assert.ok(c.window.SFCompliance.check(day,'FD','2027-01-04','07:00','15:00').hard.some(x=>x.includes('06:00 bis 14:00')));
 assert.ok(c.window.SFCompliance.check(day,'SD','2027-01-04').hard.some(x=>x.includes('ausschließlich')));
 assert.equal(c.window.SFCompliance.check(day,'FD','2027-01-04').hard.length,0);
});
