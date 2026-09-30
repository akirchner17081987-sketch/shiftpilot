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
