import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../assets/open-shift-marketplace-v1.js',import.meta.url),'utf8');
function module(){const context={window:{SFBackend:{}},document:{},Map,Set};vm.runInNewContext(source,context);return context.window.SFOpenShiftMarket;}
test('open demand is grouped by both date and shift, retaining each missing place',()=>{
 const result=module().groups([{date:'2026-12-02',type:'ND'},{date:'2026-12-01',type:'FD'},{date:'2026-12-01',type:'ND'},{date:'2026-12-01',type:'FD'}]);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),[{date:'2026-12-01',type:'FD',count:2},{date:'2026-12-01',type:'ND',count:1},{date:'2026-12-02',type:'ND',count:1}]);
});
test('grouping neither changes input nor invents positions for fully staffed dates',()=>{
 const data=[{date:'2026-12-01',type:'FD',reason:'Kein Vorschlag'}],before=JSON.stringify(data);module().groups(data);assert.equal(JSON.stringify(data),before);assert.equal(module().groups([]).length,0);
});

// Real sync implementation: immutable August history plus a new December draft.
function syncFixture(){
 const writes=[],saved={shift_assignments:[{id:'db-aug',legacy_id:'aug',status:'PUBLISHED'}],absences:[{id:'absence-aug',legacy_id:'absence-aug'}]},fail={time:false};
 const B={ready:true,companyId:'company-a',user:{id:'owner'},client:{from(table){
  let operation=null,payload=null,id=null,single=false;
  const query={upsert(value){operation='upsert';payload=value;return query},update(value){operation='update';payload=value;return query},delete(){operation='delete';return query},select(){return query},eq(key,value){if(key==='id')id=value;return query},single(){single=true;return query},then(resolve,reject){return Promise.resolve().then(()=>{
   if(operation){writes.push({table,payload,id});const rows=Array.isArray(payload)?payload:[payload];
    if(rows.some(r=>String(r?.start_date||r?.starts_at||'').startsWith('2026-08')||r?.assignment_id==='db-aug'))return {data:null,error:{message:'Der Monat ist abgeschlossen (August)'}};
    if(table==='time_entries'&&fail.time)return {data:null,error:{message:'Verbindung unterbrochen'}};
    if(table==='shift_assignments')for(const r of rows){const record={...r,id:'db-'+r.legacy_id};saved[table]=saved[table].filter(x=>x.legacy_id!==r.legacy_id).concat(record);}
   }
   let data=saved[table]||[];if(id)data=data.filter(x=>x.id===id);return {data:single?(data[0]||null):data,error:null};
  }).then(resolve,reject)}};return query;
 }}},context={window:{SFBackend:B,SFCompliance:{publications:{},policy:null}},localStorage:{getItem(){return null}},assignments:[{id:'aug',_dbId:'db-aug',_dbStatus:'PUBLISHED',employeeId:'emp',type:'FD',date:'2026-08-01',start:'06:00',end:'14:00'},{id:'dec',employeeId:'emp',type:'FD',date:'2026-12-01',start:'06:00',end:'14:00'}],absences:[{id:'absence-aug',_dbId:'absence-aug',employeeId:'emp',startDate:'2026-08-20',endDate:'2026-08-20',type:'Urlaub',status:'Genehmigt',fullDay:true,note:''}],employees:[],globalSoll:{},dailySoll:{},timeEntries:{aug:{actualStart:'06:00',actualEnd:'14:00',breakMin:0,status:'confirmed'}},typeById:()=>({start:'06:00',end:'14:00'}),setTimeout(){},clearTimeout(){},console:{error(){},warn(){}},Date,Map};
 vm.runInNewContext(fs.readFileSync(new URL('../assets/supabase-data-v1.js',import.meta.url),'utf8'),context);
 B.empDb.set('emp','db-emp');B.asgDb.set('aug','db-aug');B.absDb.set('absence-aug','absence-aug');B.hydrate=async()=>{};
 vm.runInNewContext(fs.readFileSync(new URL('../assets/supabase-delta-sync-v1.js',import.meta.url),'utf8'),context);
 return {B,context,writes,saved,fail};
}
test('December drafts sync without rewriting closed August times or absences',async()=>{
 const f=syncFixture();await f.B.sync();assert.equal(f.B.lastSyncError,null);assert.equal(f.saved.shift_assignments.find(a=>a.legacy_id==='dec').status,'DRAFT');
 assert.deepEqual(f.writes.map(x=>x.table),['shift_assignments']);await f.B.sync();assert.equal(f.writes.length,1,'A second synchronization does not rewrite clean rows');
});
test('new December time entries save once and remain clean on repeat synchronization',async()=>{
 const f=syncFixture();await f.B.sync();f.context.timeEntries.dec={actualStart:'06:00',actualEnd:'14:00',breakMin:0,status:'open'};await f.B.sync();await f.B.sync();
 assert.equal(f.B.lastSyncError,null);assert.equal(f.writes.filter(x=>x.table==='time_entries').length,1);
});
test('an actual modification to closed August time still reaches the server guard',async()=>{
 const f=syncFixture();f.context.timeEntries.aug.actualEnd='15:00';await f.B.sync();assert.match(f.B.lastSyncError.message,/August/);assert.equal(f.writes.filter(x=>x.table==='time_entries').length,1);
});
test('failed December time writes retain dirty state for retry',async()=>{
 const f=syncFixture();await f.B.sync();f.context.timeEntries.dec={actualStart:'06:00',actualEnd:'14:00',status:'open'};f.fail.time=true;await f.B.sync();assert.match(f.B.lastSyncError.message,/unterbrochen/);
 f.fail.time=false;await f.B.sync();assert.equal(f.B.lastSyncError,null);await f.B.sync();assert.equal(f.writes.filter(x=>x.table==='time_entries').length,2);
});
test('changed closed absences are blocked and a company refresh resets time baselines',async()=>{
 const f=syncFixture();f.context.absences[0].note='Änderung';await f.B.sync();assert.match(f.B.lastSyncError.message,/August/);
 f.context.absences[0].note='';await f.B.sync();assert.equal(f.B.lastSyncError,null);
 f.context.timeEntries.dec={actualStart:'06:00',actualEnd:'14:00',status:'open'};await f.B.hydrate();await f.B.sync();assert.equal(f.writes.filter(x=>x.table==='time_entries').length,0,'Hydrated time rows are a fresh baseline');
});
