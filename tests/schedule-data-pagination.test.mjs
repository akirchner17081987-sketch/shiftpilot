import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const source=read('assets/supabase-data-v1.js');
function harness({failPage=false,failPrivate=false,logoutDuringPrivate=false,role='OWNER',accessRole,permissions=[],failAudit=false,shortDelete=false}={}){
  const rows=Array.from({length:1562},(_,i)=>({id:String(i).padStart(6,'0'),company_id:'target',employee_id:'person',legacy_id:'shift-'+i,status:'DRAFT',shift_code:'FD',starts_at:i<1251?'2026-12-01T05:00:00Z':'2027-01-01T05:00:00Z',ends_at:i<1251?'2026-12-01T13:00:00Z':'2027-01-01T13:00:00Z',version:1}));
  rows.push({...rows[0],id:'999998',company_id:'other'}, {...rows[0],id:'999999',status:'CANCELLED'});
  const calls=[],deletes=[];
  const c={console,Map,Set,Date,Intl,localStorage:{getItem:()=>null},sessionStorage:{getItem:()=>null},document:{querySelector:()=>null},employees:[],assignments:[{id:'previous'}],absences:[],globalSoll:{},dailySoll:{},timeEntries:{},TYPES:[],setTimeout:()=>0,clearTimeout(){}};
  c.window=c;c.SFBackend={companyId:'target',user:{id:'manager'},ready:true,role,accessRole,accessPermissions:permissions};
  c.SFBackend.client={rpc:async(name,args)=>{if(name==='company_private_client_configuration'){if(logoutDuringPrivate){c.SFBackend.clearCompanyPrivateConfiguration();c.SFBackend.companyId=null;}return {data:{helpArticles:{auto:{internal:'private-test'}}},error:failPrivate?{message:'Private configuration unavailable'}:null};}return {data:name==='employee_roster_generation'?0:[],error:null};},from(table){
    const filters=[],orders=[];let count=null,mode='read',payload;
    const q={select(){return q},eq(k,v){filters.push([k,'eq',v]);return q},in(k,v){filters.push([k,'in',v]);return q},neq(k,v){filters.push([k,'neq',v]);return q},gt(k,v){filters.push([k,'gt',v]);return q},order(k){orders.push(k);return q},limit(n){count=n;return q},range(first,last){count=last-first+1;filters.push(['range','slice',first]);return q},upsert(p){mode='upsert';payload=p;return q},update(){mode='update';return q},delete(){mode='delete';return q},single(){return q},then(resolve,reject){return Promise.resolve().then(()=>{
      calls.push({table,filters:[...filters],orders:[...orders],count,mode});
      if(mode==='delete'){const ids=filters.find(f=>f[0]==='id')[2];deletes.push(...ids);return {data:(shortDelete?ids.slice(0,-1):ids).map(id=>({id})),error:null}}
      if(mode==='upsert')return {data:Array.isArray(payload)?payload.map(p=>({...p,id:rows.find(r=>r.legacy_id===p.legacy_id)?.id})):[],error:null};
      if(mode==='update')return {data:[],error:null};
      if(table==='audit_events'&&failAudit)return {data:null,error:{code:'57014',message:'canceling statement due to statement timeout'}};
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


test('private configuration is hydrated for the selected authenticated company',async()=>{const{c}=harness();await c.SFBackend.hydrate();assert.equal(c.SFBackend.companyPrivateConfiguration.companyId,'target');assert.equal(c.SFBackend.companyPrivateConfiguration.data.helpArticles.auto.internal,'private-test');c.SFBackend.clearCompanyPrivateConfiguration();assert.equal(c.SFBackend.companyPrivateConfiguration,null);});
test('failed private configuration blocks hydration before replacing data',async()=>{const{c}=harness({failPrivate:true}),previous=c.assignments;await assert.rejects(c.SFBackend.hydrate(),{message:'Private configuration unavailable'});assert.equal(c.assignments,previous);assert.equal(c.SFBackend.companyPrivateConfiguration,undefined);});
test('logout invalidates a late private response before any company data is applied',async()=>{const{c}=harness({logoutDuringPrivate:true}),previous=c.assignments;await c.SFBackend.hydrate();assert.equal(c.SFBackend.companyPrivateConfiguration,null);assert.equal(c.assignments,previous);});

test('team-leader startup never reads the admin-only audit table, even when it would time out',async()=>{
 for(const role of ['PLANNER','DISPATCHER','VIEWER']){
  const {c,calls}=harness({role,accessRole:'TEAM_LEAD',permissions:role==='VIEWER'?['read_only']:['personnel_conversations'],failAudit:true});
  await c.SFBackend.hydrate();
  assert.equal(c.assignments.length,1562,role+' loads the complete plan');
  assert.equal(calls.some(q=>q.table==='audit_events'),false,role+' must not issue the restricted audit query');
  assert.deepEqual(Array.from(c.SFCompliance.auditEvents),[]);
  assert.equal(c.SFBackend.suppressSync,false);
 }
});

test('owner and administrator startup retain their authorized audit query and its errors',async()=>{
 for(const role of ['OWNER','ADMIN']){
  const {c,calls}=harness({role,accessRole:role});await c.SFBackend.hydrate();
  const audit=calls.filter(q=>q.table==='audit_events');assert.equal(audit.length,1);
  assert.ok(audit[0].filters.some(f=>f[0]==='company_id'&&f[2]==='target'));assert.equal(audit[0].count,500);
  const failed=harness({role,accessRole:role,failAudit:true});
  await assert.rejects(failed.c.SFBackend.hydrate(),{code:'57014',message:'canceling statement due to statement timeout'});
 }
});

test('large draft deletion is tenant-scoped, batched and leaves retained duties untouched',async()=>{
  const {c,calls,deletes}=harness();await c.SFBackend.hydrate();
  c.assignments=c.assignments.filter((_,i)=>i>=1251);await c.SFBackend.sync();
  assert.equal(c.SFBackend.lastSyncError,null);assert.equal(deletes.length,1251);
  assert.equal(new Set(deletes).size,1251);
  const batches=calls.filter(q=>q.table==='shift_assignments'&&q.mode==='delete');
  assert.equal(batches.length,13);
  for(const q of batches){assert.ok(q.filters.some(f=>f[0]==='company_id'&&f[2]==='target'));assert.ok(q.filters.some(f=>f[0]==='status'&&f[2]==='DRAFT'));assert.ok(q.filters.find(f=>f[0]==='id')[2].length<=100);}
});


test('cloud deletion reports success after the database confirms every requested row',async()=>{
  const {c}=harness(),toasts=[];c.showSaveToast=(...args)=>toasts.push(args);await c.SFBackend.hydrate();
  c.assignments=c.assignments.filter(a=>a._dbId!=='001561');await c.SFBackend.sync();
  assert.equal(c.SFBackend.lastSyncError,null);assert.ok(toasts.some(t=>t[0]==='Löschung gespeichert'));
});

test('incomplete database deletion reports an error rather than a success',async()=>{
  const {c}=harness({shortDelete:true}),toasts=[];c.showSaveToast=(...args)=>toasts.push(args);await c.SFBackend.hydrate();
  c.assignments=c.assignments.filter(a=>a._dbId!=='001561');await c.SFBackend.sync();
  assert.match(c.SFBackend.lastSyncError.message,/Nicht alle Schichtentwürfe/);
  assert.ok(toasts.some(t=>t[0]==='Cloud-Synchronisierung fehlgeschlagen'));
  assert.ok(!toasts.some(t=>t[0]==='Löschung gespeichert'));
});

test('quick deletion does not claim cloud success before synchronization',()=>{
  const messages=[],c={window:{SFBackend:{ready:true}},assignments:[{id:'a',_dbId:'db-a',date:'2026-12-01',type:'TEST',employeeId:'e'}],employees:[{id:'e',first:'Test',last:'Person'}],confirm:()=>true,showSaveToast:(...args)=>messages.push(args),saveAll(){},Date};
  vm.runInNewContext(read('assets/assignment-quick-delete-v1.js'),c);c.window.spQuickDeleteAssignment('a');
  assert.equal(messages[0][0],'Löschung wird gespeichert');assert.equal(c.assignments.length,0);
});

test('a second synchronization is queued while another save or month reset is in progress',async()=>{
  const {c,calls}=harness();let queued=0;c.SFBackend.scheduleSync=()=>queued++;
  c.SFBackend.syncing=true;await c.SFBackend.sync();assert.equal(queued,1);assert.equal(calls.length,0);
  c.SFBackend.syncing=false;c.SFBackend.scheduleResetting=true;await c.SFBackend.sync();assert.equal(queued,2);assert.equal(calls.length,0);
});

test('quick delete routes published shifts to the protected change workflow without removing them',()=>{
  const messages=[],opened=[],c={window:{SFBackend:{ready:true},editAssignment:id=>opened.push(id)},assignments:[{id:'a',date:'2026-12-01',type:'TEST',employeeId:'e',_dbStatus:'PUBLISHED'}],employees:[],confirm:()=>{throw Error('Must not confirm direct deletion')},showSaveToast:(...args)=>messages.push(args),Date};
  vm.runInNewContext(read('assets/assignment-quick-delete-v1.js'),c);c.window.spQuickDeleteAssignment('a');
  assert.equal(c.assignments.length,1);assert.deepEqual(opened,['a']);assert.equal(messages[0][0],'Veröffentlichte Schicht');
});

test('repeated quick-delete clicks cannot start a second deletion for the same draft',()=>{
  let saves=0,confirms=0;const c={window:{SFBackend:{ready:true}},assignments:[{id:'a',date:'2026-12-01',type:'TEST',employeeId:'e'}],employees:[{id:'e',first:'Test',last:'Person'}],confirm:()=>{confirms++;return true},showSaveToast(){},saveAll(){saves++},Date};
  vm.runInNewContext(read('assets/assignment-quick-delete-v1.js'),c);c.window.spQuickDeleteAssignment('a');c.window.spQuickDeleteAssignment('a');
  assert.equal(confirms,1);assert.equal(saves,1);assert.equal(c.assignments.length,0);
});
