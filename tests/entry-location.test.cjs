const test = require('node:test'), assert = require('node:assert/strict');
const {resolve,forBackend} = require('../assets/sf-entry-location-v1.js');
const geo = require('../assets/location-map-core-v1.js');
const employee = team => ({id:'own',company_id:'company',auth_user_id:'user',status:'active',qualifications:['__sp:planningTeam=A','__sp:team='+team]});
test('login targets the assigned business address for each employee, independently of their home city and planning team',()=>{
  for (const [name,address] of [['Leipzig','Nonnenstraße 21'],['Recklinghausen','Westring 45 - 45659 Recklinghausen']]) {
    const site=resolve({...employee(name),city:name==='Leipzig'?'Recklinghausen':'Leipzig'});
    assert.equal(site.name,name);assert.deepEqual(site.coordinates,geo.resolve({name,address,longitude:name==='Leipzig'?12.3419772:7.1795349,latitude:name==='Leipzig'?51.3278275:51.6085523}));
  }
});
test('unassigned, ambiguous and inactive employees never dive into an invented workplace',()=>{
  for (const row of [null,employee(''),employee('Leipzig / Recklinghausen'),employee('Standortleitung'),{city:'Leipzig'},
    {...employee('Leipzig'),status:'inactive'},{...employee('Leipzig'),deleted_at:'2026-10-01'}]) assert.equal(resolve(row),null);
});
test('the hydrated personal employee record resolves without any extra service request',async()=>{
  const backend={ready:true,user:{id:'user'},companyId:'company',employeePortalData:{employee:employee('Leipzig')},client:{from(){throw Error('unnecessary request')}}};
  assert.equal((await forBackend(backend)).name,'Leipzig');assert.equal(backend.role,undefined);
});
function scopedBackend(row=employee('Recklinghausen')) {
  const calls=[];const query={then(fn){return Promise.resolve({data:row}).then(fn)}};
  for (const key of ['select','eq','is','maybeSingle']) query[key]=(...args)=>{calls.push([key,...args]);return query};
  return {calls,backend:{ready:true,user:{id:'user'},companyId:'company',client:{from(table){calls.push(['from',table]);return query}}}};
}
test('management login reads only the linked employee in the active company and never grants rights',async()=>{
  const {backend,calls}=scopedBackend();backend.role='PLANNER';
  assert.equal((await forBackend(backend)).name,'Recklinghausen');
  assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='company_id'&&c[2]==='company'));
  assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='auth_user_id'&&c[2]==='user'));
  assert.ok(calls.some(c=>c[0]==='is'&&c[1]==='deleted_at'&&c[2]===null));
  assert.equal(backend.role,'PLANNER');
});
test('a verified early manager shell can resolve its profile while roster hydration continues',async()=>{
  const {backend}=scopedBackend();backend.ready=false;backend.shellReady=true;
  assert.equal((await forBackend(backend)).name,'Recklinghausen');
});
test('foreign-company and foreign-account profiles are rejected even if transport returns them',async()=>{
  for (const patch of [{company_id:'other'},{auth_user_id:'other'}]) {
    const {backend}=scopedBackend({...employee('Leipzig'),...patch});
    assert.equal(await forBackend(backend),null);
  }
});
test('a response arriving after logout or company switch is not used',async()=>{
  for (const change of [b=>{b.companyId='other'},b=>{b.user=null;b.ready=false}]) {
    let finish;
    const backend={ready:true,user:{id:'user'},companyId:'company'};
    const query={then(fn){return new Promise(resolve=>{finish=()=>resolve({data:employee('Leipzig')})}).then(fn)}};
    for (const key of ['select','eq','is','maybeSingle']) query[key]=()=>query;
    backend.client={from:()=>query};
    const pending=forBackend(backend);await Promise.resolve();change(backend);finish();
    assert.equal(await pending,null);
  }
});
test('the unauthenticated entry never looks up an employee',async()=>{
  let called=false;
  assert.equal(await forBackend({ready:false,client:{from(){called=true}}}),null);assert.equal(called,false);
});
