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
  assert.match(read('assets/time-workspace-v2.js'),/if\(B.role==='TIME_TRACKING'&&next==='account'\)return/);
});

test('restricted workspace opens QR bookings but keeps accounts and terminal management blocked',async()=>{
  const nodes=new Map(),timers=[],calls=[],storage=new Map();
  function element(){
    const classes=new Set();
    return {dataset:{},attrs:{},children:[],classList:{toggle(k,on){on?classes.add(k):classes.delete(k)},contains:k=>classes.has(k)},
      setAttribute(k,v){this.attrs[k]=v},appendChild(node){this.children.push(node);if(node.id)nodes.set(node.id,node)},
      set innerHTML(value){this.children=[...value.matchAll(/data-time-mode="([^"]+)"/g)].map(match=>Object.assign(element(),{dataset:{timeMode:match[1]}}))},
      querySelectorAll:()=>nodes.get('sfTimeWorkspaceTabs')?.children||[],
      querySelector(selector){return this.children.find(node=>selector.includes(node.dataset.timeMode))||null}};
  }
  const view=element(),head=element();view.querySelector=()=>head;nodes.set('view-time',view);
  const B={role:'TIME_TRACKING',qrIndependentReport:{refresh:async()=>calls.push('report')},qrTerminalAdmin:{refresh:async()=>calls.push('terminal')},timeAccounts:{refreshManager:async()=>calls.push('account')}};
  const document={head:element(),documentElement:{},getElementById:id=>nodes.get(id)||null,createElement:element,
    querySelector:()=>null,querySelectorAll:()=>nodes.get('sfTimeWorkspaceTabs')?.children||[],addEventListener(){}};
  vm.runInNewContext(read('assets/time-workspace-v2.js'),{window:{SFBackend:B},document,sessionStorage:{getItem:()=>null,setItem:(k,v)=>storage.set(k,v)},
    MutationObserver:class{observe(){}},setTimeout:fn=>timers.push(fn),requestAnimationFrame:fn=>fn(),console});
  await timers[0]();
  const tabs=nodes.get('sfTimeWorkspaceTabs'),qr=tabs.children.find(b=>b.dataset.timeMode==='qr'),account=tabs.children.find(b=>b.dataset.timeMode==='account');
  assert.equal(qr.textContent,'QR-Erfassung');assert.notEqual(qr.disabled,true);assert.equal(account.disabled,true);
  await qr.onclick();assert.equal(storage.get('sf.time.mode'),'qr');assert.equal(view.classList.contains('sf-tw-qr'),true);assert.deepEqual(calls,['report']);
  await account.onclick();assert.equal(storage.get('sf.time.mode'),'qr');assert.deepEqual(calls,['report']);
  assert.match(nodes.get('sfTimeWorkspaceV2Css').textContent,/\.sf-tw-qr>\.card:not\(#sfQrTerminalAdmin\):not\(#sfQrIndependentReport\)/);
});

test('cold login and subsequent reload use the restricted core boot',async()=>{
  const {B,calls,context}=harness();
  B.role=null;B.ready=false;
  context.localStorage={getItem:()=>null,removeItem(){throw new Error('must not clear legacy data')}};
  B.showLoading=()=>{};B.hideLoading=()=>{};
  B.ensureCompany=async()=>{B.companyId='company-a';B.role='TIME_TRACKING'};
  B.client.from=table=>{throw new Error('unexpected table access: '+table)};
  vm.runInNewContext(read('assets/supabase-data-v1.js'),context);
  for(let i=0;i<2;i++){
    assert.equal(await B.boot({user:{id:'fixture'}}),true);
    assert.equal(B.ready,true);assert.equal(B.role,'TIME_TRACKING');
  }
  await B.hydrate();
  assert.equal(calls.filter(x=>x[0]==='time_access_context').length,3);
  assert.equal(B.storeBridged,undefined);
});

test('service worker refreshes auth and role scripts despite cached HTTP assets',async()=>{
  const events={},requests=[],cacheWrites=[];
  const cache={match:async()=>({stale:true}),put:(request,response)=>cacheWrites.push(request.url)};
  const fresh={ok:true,headers:{get:()=>''},clone(){return this}};
  const context={URL,Response,console,self:{location:{origin:'https://example.invalid'},addEventListener:(type,fn)=>events[type]=fn},
    caches:{open:async()=>cache},fetch:async(request,options)=>{requests.push(options);return fresh}};
  vm.runInNewContext(read('schichtfunk-sw.js'),context);
  for(const file of ['conflict-plausibility-v1','supabase-auth-v1','supabase-data-v1','time-only-access-v1']){
    let response;
    events.fetch({request:{method:'GET',url:'https://example.invalid/assets/'+file+'.js?v=old',mode:'cors'},respondWith:p=>response=p,
      waitUntil(){throw new Error('must not serve stale role scripts')}});
    assert.equal(await response,fresh);
  }
  assert.equal(cacheWrites.length,4);assert.ok(requests.every(x=>x.cache==='no-cache'));
});
