import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('assets/time-only-access-v1.js');
function harness(role='TIME_TRACKING',status='ACTIVE'){
  const events={},calls=[],storage=new Map();
  const B={role,user:{id:'fixture',email:'time@example.invalid'},companyId:'company-a',ready:true,
    ensureCompany:async()=>calls.push('ensure'),hydrate:async()=>calls.push('full hydrate'),sync:async()=>calls.push('sync'),importLegacy:async()=>calls.push('import'),
    baseOpenApp:view=>calls.push(['open',view]),updateState(){},
    client:{rpc:async(name,args)=>{calls.push([name,args]);return {data:{name:'Fixture',timezone:'Europe/Berlin'}}},from:()=>({select:()=>({eq:async()=>({data:[{company_id:'company-a',role,status}]})})})}};
  const buttons=['time','schedule','employees','settings','reports'].map(view=>({dataset:{view},disabled:false,title:'',attrs:{},getAttribute(k){return this.attrs[k]},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]}}));
  const document={head:{appendChild(){}},body:{classList:{toggle(){}}},createElement:()=>({}),querySelector:()=>null,getElementById:()=>null,
    querySelectorAll:s=>s==='[data-view="time"]'?[buttons[0]]:buttons.slice(1),addEventListener:(name,fn)=>events[name]=fn};
  const context={window:{SFBackend:B},document,sessionStorage:{setItem:(k,v)=>storage.set(k,v)},MutationObserver:class{observe(){}},queueMicrotask:fn=>fn(),
    employees:[{id:'old'}],assignments:[{id:'old'}],absences:[{id:'old'}],timeEntries:{old:{}},globalSoll:{},dailySoll:{},console};
  vm.runInNewContext(source,context);return{B,calls,buttons,events,context,storage};
}
test('time-only login disables other sections and preserves time access',()=>{
  const {B,buttons}=harness();assert.equal(B.pendingView,'time');assert.equal(buttons[0].disabled,false);
  for(const button of buttons.slice(1)){assert.equal(button.disabled,true);assert.equal(button.attrs['aria-disabled'],'true');assert.match(button.title,/nicht verfügbar/)}
});
test('restored or direct app navigation opens time and blocks forbidden clicks',()=>{
  const {B,calls,events,buttons}=harness();B.baseOpenApp('settings');assert.deepEqual(calls.at(-1),['open','time']);
  let prevented=false,stopped=false;events.click({target:{closest:()=>buttons[1]},preventDefault(){prevented=true},stopImmediatePropagation(){stopped=true}});assert.ok(prevented&&stopped);
});
test('restricted hydration calls only time context and clears previous session data',async()=>{
  const {B,calls,context,storage}=harness();await B.hydrate();await B.sync();await B.importLegacy();
  assert.deepEqual(calls.map(x=>x[0]),['time_access_context']);assert.equal(context.employees.length,0);assert.equal(context.assignments.length,0);assert.equal(context.absences.length,0);
  assert.equal(B.companyTimeZone,'Europe/Berlin');assert.equal(storage.get('sf.time.mode'),'entries');
});
test('disabled time-only member cannot bootstrap a different company',async()=>{
  const {B,calls}=harness('TIME_TRACKING','DISABLED');await assert.rejects(B.ensureCompany(),/deaktiviert/);assert.equal(calls.length,0);
});
test('manager roles retain normal hydration, sync and navigation',async()=>{
  const {B,calls,buttons}=harness('OWNER');await B.hydrate();await B.sync();B.baseOpenApp('settings');
  assert.equal(calls[0],'full hydrate');assert.equal(calls[1],'sync');assert.deepEqual(calls[2],['open','settings']);assert.equal(buttons[1].disabled,false);
});
test('role guard loads before boot and direct navigation is restricted',()=>{
  const loader=read('assets/conflict-plausibility-v1.js');assert.ok(loader.indexOf("'assets/time-only-access-v1.js'")<loader.indexOf("'assets/supabase-time-month-close-v1.js'"));
  const data=read('assets/supabase-data-v1.js');assert.ok(data.indexOf("if(B.role==='TIME_TRACKING')")<data.indexOf('await B.importLegacy();await B.hydrate()'));
  assert.match(read('index.html'),/function switchView\(name\)\{if\(window.SFBackend\?\.role==='TIME_TRACKING'\)name='time'/);
  assert.match(read('assets/time-workspace-v2.js'),/if\(B.role==='TIME_TRACKING'&&next!=='entries'\)return/);
});
