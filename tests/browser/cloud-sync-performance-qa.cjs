const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const setup=`
window.__calls=[];window.__toasts=[];window.__errors=[];
window.addEventListener('error',e=>__errors.push(e.message));window.addEventListener('unhandledrejection',e=>__errors.push(String(e.reason)));
window.confirm=()=>true;window.showSaveToast=(...args)=>__toasts.push(args);
var employees=[],assignments=[],absences=[],globalSoll={},dailySoll={},timeEntries={},TYPES=[];
const rows=Array.from({length:1000},(_,i)=>({id:String(i).padStart(6,'0'),company_id:'test-company',employee_id:'test-person',legacy_id:'shift-'+i,status:'DRAFT',shift_code:'TEST',starts_at:'2026-11-02T08:00:00Z',ends_at:'2026-11-02T16:00:00Z',version:1}));
window.SFBackend={companyId:'test-company',user:{id:'test-owner'},ready:true};window.SFCompliance={};
SFBackend.client={rpc:async()=>({data:0,error:null}),from(table){
 const filters=[],orders=[];let count=null,mode='read',payload;
 const q={select(){return q},eq(k,v){filters.push([k,'eq',v]);return q},in(k,v){filters.push([k,'in',v]);return q},neq(k,v){filters.push([k,'neq',v]);return q},gt(k,v){filters.push([k,'gt',v]);return q},order(k){orders.push(k);return q},limit(n){count=n;return q},range(first,last){count=last-first+1;return q},upsert(p){mode='upsert';payload=p;return q},update(){mode='update';return q},delete(){mode='delete';return q},single(){return q},then(resolve,reject){return new Promise(done=>setTimeout(done,3)).then(()=>{
 __calls.push({table,mode,filters:[...filters]});
 if(mode==='delete'){const ids=filters.find(f=>f[0]==='id'&&f[1]==='in')[2];const result=[];for(let i=rows.length-1;i>=0;i--)if(ids.includes(rows[i].id)&&rows[i].company_id==='test-company'&&rows[i].status==='DRAFT'){result.push({id:rows[i].id});rows.splice(i,1)}return {data:result,error:null}}
 if(mode==='upsert')return {data:Array.isArray(payload)?payload.map(p=>({...p,id:rows.find(r=>r.legacy_id===p.legacy_id)?.id})):[],error:null};
 if(mode==='update')return {data:[],error:null};
 if(table==='companies')return {data:{name:'Testunternehmen',timezone:'Europe/Berlin'},error:null};
 if(table==='company_compliance_policy')return {data:{},error:null};
 if(table==='employees')return {data:[{id:'test-person',legacy_id:'employee',first_name:'Test',last_name:'Person',status:'active',weekly_hours:40,qualifications:[]}],error:null};
 if(table!=='shift_assignments')return {data:[],error:null};
 const result=rows.filter(r=>filters.every(([k,op,v])=>op==='eq'?r[k]===v:op==='neq'?r[k]!==v:op==='gt'?r[k]>v:true)).sort((a,b)=>a.id.localeCompare(b.id));return {data:result.slice(0,count??1000),error:null};
 }).then(resolve,reject)}};return q;
}};
window.saveAll=()=>{window.__syncPromise=SFBackend.sync()};
window.__rowCount=()=>rows.length;
`;
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();await page.route('https://sf.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><button id="delete">Schicht löschen</button></body></html>'}));await page.goto('https://sf.test/');
  await page.addScriptTag({content:setup});await page.addScriptTag({content:read('assets/supabase-data-v1.js')});await page.addScriptTag({content:read('assets/assignment-quick-delete-v1.js')});
  const loadMs=await page.evaluate(async()=>{const t=performance.now();await SFBackend.hydrate();return performance.now()-t});
  assert.equal(await page.evaluate(()=>assignments.length),1000);
  await page.evaluate(()=>{document.getElementById('delete').onclick=()=>spQuickDeleteAssignment('shift-0')});
  const deleteMs=await page.evaluate(async()=>{const t=performance.now();document.getElementById('delete').click();await __syncPromise;return performance.now()-t});
  assert.equal(await page.evaluate(()=>__rowCount()),999);assert.equal(await page.evaluate(()=>SFBackend.lastSyncError),null);
  assert.ok(await page.evaluate(()=>__toasts.some(t=>t[0]==='Löschung wird gespeichert')));assert.ok(await page.evaluate(()=>__toasts.some(t=>t[0]==='Löschung gespeichert')));
  const bulkMs=await page.evaluate(async()=>{assignments=assignments.slice(200);const t=performance.now();await SFBackend.sync();return performance.now()-t});
  assert.equal(await page.evaluate(()=>__rowCount()),799);assert.equal(await page.evaluate(()=>SFBackend.lastSyncError),null);
  const batches=await page.evaluate(()=>__calls.filter(c=>c.table==='shift_assignments'&&c.mode==='delete').map(c=>c.filters.find(f=>f[0]==='id')[2].length));assert.deepEqual(batches,[1,100,100]);
  assert.ok(await page.evaluate(()=>__toasts.some(t=>t[0]==='Schichten werden gelöscht'&&t[1].includes('200 von 200'))));
  assert.deepEqual(await page.evaluate(()=>__errors),[]);console.log(JSON.stringify({fixtures:1000,loadMs,deleteMs,bulkMs,batches,backend:'mock with 3ms per request'}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
