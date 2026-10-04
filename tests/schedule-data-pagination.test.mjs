import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../assets/supabase-data-v1.js',import.meta.url),'utf8');
function harness({failPage=false}={}){
  const rows=Array.from({length:1562},(_,i)=>({id:String(i).padStart(6,'0'),company_id:'target',employee_id:'person',legacy_id:'shift-'+i,status:'DRAFT',shift_code:'FD',starts_at:i<1251?'2026-12-01T05:00:00Z':'2027-01-01T05:00:00Z',ends_at:i<1251?'2026-12-01T13:00:00Z':'2027-01-01T13:00:00Z',version:1}));
  rows.push({...rows[0],id:'999998',company_id:'other'}, {...rows[0],id:'999999',status:'CANCELLED'});
  const calls=[],deletes=[];
  const c={console,Map,Set,Date,Intl,localStorage:{getItem:()=>null},sessionStorage:{getItem:()=>null},document:{querySelector:()=>null},employees:[],assignments:[{id:'previous'}],absences:[],globalSoll:{},dailySoll:{},timeEntries:{},TYPES:[],setTimeout:()=>0,clearTimeout(){}};
  c.window=c;c.SFBackend={companyId:'target',user:{id:'manager'},ready:true};
  c.SFBackend.client={from(table){
    const filters=[],orders=[];let count=null,mode='read',payload;
    const q={select(){return q},eq(k,v){filters.push([k,'eq',v]);return q},neq(k,v){filters.push([k,'neq',v]);return q},gt(k,v){filters.push([k,'gt',v]);return q},order(k){orders.push(k);return q},limit(n){count=n;return q},upsert(p){mode='upsert';payload=p;return q},update(){mode='update';return q},delete(){mode='delete';return q},single(){return q},then(resolve,reject){return Promise.resolve().then(()=>{
      calls.push({table,filters:[...filters],orders:[...orders],count,mode});
      if(mode==='delete'){deletes.push(filters.find(f=>f[0]==='id')[2]);return {data:[],error:null}}
      if(mode==='upsert')return {data:Array.isArray(payload)?payload.map(p=>({...p,id:rows.find(r=>r.legacy_id===p.legacy_id)?.id})):[],error:null};
      if(mode==='update')return {data:[],error:null};
      if(table==='companies')return {data:{name:'Test',timezone:'Europe/Berlin'},error:null};
      if(table==='company_compliance_policy')return {data:{},error:null};
      if(table==='employees')return {data:[{id:'person',legacy_id:'employee',first_name:'Test',last_name:'Person',status:'active',weekly_hours:40,qualifications:[]}],error:null};
      if(table!=='shift_assignments')return {data:[],error:null};
      if(failPage&&filters.some(f=>f[1]==='gt'))return {data:null,error:{message:'Second page unavailable'}};
      const data=rows.filter(r=>filters.every(([k,op,v])=>op==='eq'?r[k]===v:op==='neq'?r[k]!==v:r[k]>v)).sort((a,b)=>a.id.localeCompare(b.id));
      return {data:data.slice(0,count??1000),error:null};
    }).then(resolve,reject)}};return q;
  }};
  vm.createContext(c);vm.runInContext(source,c);return {c,calls,deletes};
}

test('hydration loads January beyond 1000 duties and keeps tenant and status filters on every page',async()=>{
  const {c,calls}=harness();await c.SFBackend.hydrate();
  assert.equal(c.assignments.length,1562);
  assert.equal(c.assignments.filter(a=>a.date.startsWith('2027-01')).length,311);
  assert.equal(new Set(c.assignments.map(a=>a._dbId)).size,1562);
  assert.equal(c.SFBackend.asgDb.size,1562);
  const pages=calls.filter(q=>q.table==='shift_assignments');assert.equal(pages.length,4);
  for(const q of pages){assert.deepEqual(q.orders,['id']);assert.equal(q.count,500);assert.ok(q.filters.some(f=>f[0]==='company_id'&&f[2]==='target'));assert.ok(q.filters.some(f=>f[0]==='status'&&f[1]==='neq'&&f[2]==='CANCELLED'))}
});

test('a later-page error retains the complete previous local plan and restores synchronization state',async()=>{
  const {c}=harness({failPage:true}),previous=c.assignments;
  await assert.rejects(c.SFBackend.hydrate(),{message:'Second page unavailable'});
  assert.equal(c.assignments,previous);assert.equal(c.SFBackend.asgDb.size,0);assert.equal(c.SFBackend.suppressSync,false);
});

test('synchronization finds a removed draft beyond the first 1000 without deleting retained duties',async()=>{
  const {c,deletes}=harness();await c.SFBackend.hydrate();
  c.assignments=c.assignments.filter(a=>a._dbId!=='001561');await c.SFBackend.sync();
  assert.equal(c.SFBackend.lastSyncError,null);assert.deepEqual(deletes,['001561']);
});
