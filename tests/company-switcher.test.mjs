import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const member=(company_id,role='OWNER',status='ACTIVE')=>({company_id,role,status});
function harness(rows=[member('a'),member('b','VIEWER')]){
  const session=new Map(),queries=[],events=[],document={head:{appendChild(){}},createElement:()=>({}),getElementById:()=>null,querySelector:()=>null,addEventListener(){}};
  const B={ready:true,user:{id:'alex'},companyId:'a',role:'OWNER',hasLegacy:true,legacy:{employees:[{id:'old'}]},updateState(){},
    showLoading:t=>events.push(t),hideLoading:()=>events.push('hide'),sync:async()=>events.push('sync'),
    ensureCompany:async()=>events.push('bootstrap'),client:{from(table){const filters=[];return{select(){return this},eq(k,v){filters.push([k,v]);return this},then(resolve){queries.push({table,filters});resolve({data:rows.filter(x=>filters.every(([k,v])=>k==='user_id'?v==='alex':x[k]===v)),error:null});}}}}};
  const context={window:{SFBackend:B},document,sessionStorage:{getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,String(v)),removeItem:k=>session.delete(k)},
    location:{reload:()=>events.push('reload')},clearTimeout:id=>events.push(['clear',id]),console};
  vm.runInNewContext(read('assets/company-switcher-v1.js'),context);
  return{B,session,queries,events,context,rows};
}
test('preference never grants membership and ignores disabled companies',()=>{
  const {B,session}=harness();session.set('sf_active_company_v1:alex','forbidden');
  assert.equal(B.pickCompanyMembership([member('b','OWNER','DISABLED'),member('a')]).company_id,'a');
  assert.equal(session.has('sf_active_company_v1:alex'),false);
});
test('restores chosen company with its own role and prevents legacy import',()=>{
  const {B,session}=harness();session.set('sf_active_company_v1:alex','b');
  assert.equal(B.pickCompanyMembership([member('a'),member('b','VIEWER')]).role,'VIEWER');
  assert.equal(B.hasLegacy,false);assert.deepEqual(Object.keys(B.legacy),[]);
  B.user={id:'different-user'};assert.equal(B.pickCompanyMembership([member('a'),member('b')]).company_id,'a');
});
test('first single-company login retains existing legacy import behavior',()=>{
  const {B,session}=harness([member('a')]);B.pickCompanyMembership([member('a')]);
  assert.equal(B.hasLegacy,true);assert.equal(session.size,0);
});
test('without a preference the original membership stays selected after a clone',()=>{
  const {B}=harness();
  assert.equal(B.pickCompanyMembership([
    {...member('b'),created_at:'2026-09-30T22:40:00Z'},
    {...member('a'),created_at:'2026-06-01T08:00:00Z'}
  ]).company_id,'a');
});
test('final employee guard selects the preferred membership before employee fallback',async()=>{
  const {B,session,context,queries}=harness();session.set('sf_active_company_v1:alex','b');
  vm.runInNewContext(read('assets/supabase-employee-access-guard-v1.js'),context);
  await B.ensureCompany();assert.equal(B.companyId,'b');assert.equal(B.role,'VIEWER');
  assert.deepEqual(queries.map(x=>x.table),['company_members']);
});
test('switch rechecks access, saves pending work under old company and reloads caches',async()=>{
  const {B,session,queries,events}=harness();B.syncTimer=123;
  B.sync=async()=>events.push(['sync',B.companyId]);
  session.set('sf_workspace_state_v2','old employee file');
  assert.equal(await B.switchCompany('b'),true);
  assert.equal(B.companyId,'a');assert.equal(B.ready,false);assert.equal(B.suppressSync,true);
  assert.equal(session.get('sf_active_company_v1:alex'),'b');assert.equal(session.has('sf_workspace_state_v2'),false);
  assert.equal(session.get('sf_active_view_v1'),'overview');
  assert.deepEqual(events.slice(-3),[['clear',123],['sync','a'],'reload']);
  assert.ok(queries[0].filters.some(([k,v])=>k==='user_id'&&v==='alex'));
});
test('revoked, unknown, and employee access cannot switch',async()=>{
  const {B,events,rows}=harness();rows[1].status='DISABLED';
  await assert.rejects(B.switchCompany('b'),/kein aktiver Zugang/);
  await assert.rejects(B.switchCompany('forbidden'),/kein aktiver Zugang/);
  B.role='EMPLOYEE';await assert.rejects(B.switchCompany('a'),/kein aktiver Zugang/);
  assert.equal(events.includes('reload'),false);assert.equal(B.companyId,'a');assert.equal(B.ready,true);
});
test('save failure and running sync keep the current company',async()=>{
  const {B,events,session}=harness();B.syncing=true;await assert.rejects(B.switchCompany('b'),/noch gespeichert/);
  B.syncing=false;B.syncTimer=123;B.sync=async()=>B.lastSyncError=new Error('Speichern fehlgeschlagen');
  await assert.rejects(B.switchCompany('b'),/Speichern fehlgeschlagen/);
  assert.equal(events.includes('reload'),false);assert.equal(session.get('sf_active_company_v1:alex'),undefined);assert.equal(B.ready,true);
});
test('all startup selectors use the preferred active company and loader precedes boot',()=>{
  for(const file of ['supabase-auth-v1.js','supabase-employee-access-v1.js','supabase-employee-access-guard-v1.js']){
    const source=read('assets/'+file);assert.match(source,/pickCompanyMembership/);assert.doesNotMatch(source,/eq\('status','ACTIVE'\)\.limit\(1\)/);
  }
  const loader=read('assets/conflict-plausibility-v1.js');assert.ok(loader.indexOf("'assets/company-switcher-v1.js'")<loader.indexOf("'assets/supabase-data-v1.js'"));
});
