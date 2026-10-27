const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const engine=require('../assets/background-auto-plan-core-v1.js');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function harness(){
 const source=read('tests/solid-planning-ui.test.cjs'),start=source.indexOf('function harness()'),end=source.indexOf('\ntest(',start);
 const h=new Function('vm','read',source.slice(start,end)+';return harness();')(vm,read),c=h.c,B=c.SFBackend,events=new Map();
 c.setTimeout=setTimeout;c.clearTimeout=clearTimeout;c.setInterval=()=>0;c.sessionStorage={getItem:()=>null};c.crypto={randomUUID:()=> '11111111-1111-4111-8111-111111111111'};
 c.document.hidden=false;c.document.querySelector=()=>null;c.document.addEventListener=(name,fn)=>events.set(name,fn);
 for(const id of ['sfBackgroundPlanStatus','view-auto']){const n=h.el(id);n.querySelector=()=>null;n.querySelectorAll=()=>[];n.classList.contains=()=>true;}
 const controls=['autoPlanPeriod','autoPlanMonth','autoPlanMonthCount','generateAutoPlanBtn','applyAutoPlanBtn','clearAutoPlanBtn'].map(h.el);controls.forEach(n=>{n.setAttribute=()=>{};n.removeAttribute=()=>{};});c.document.querySelectorAll=()=>controls;
 Object.assign(B,{role:'OWNER',user:{id:'owner'},projectUrl:'https://example.test',updateState(){}});
 let progressBusy=false;c.SFAutoPlanProgress={start(){progressBusy=true;},phase(){},update(){},message(){},finish(){progressBusy=false;},paint:()=>Promise.resolve(),isBusy:()=>progressBusy};
 let job=null,waitingPayload=null,confirmed=false;
 c.SFAutoPlanWorkspace.confirmApply=async()=>confirmed;
 B.client.rpc=async(name,args)=>{h.calls.push({name,args});if(name==='preview_planning_period')return{data:{fingerprint:'snapshot',protectedIds:[]}};if(name==='start_background_auto_plan'){waitingPayload=args.p_payload;job={id:'job',company_id:B.companyId,status:'QUEUED',progress:0,first_month:args.p_payload.months[0]+'-01',month_count:args.p_payload.months.length};return{data:job}}if(name==='get_background_auto_plan')return{data:job?.company_id===args.p_company_id?job:null};if(name==='cancel_background_auto_plan'){job={...job,status:'CANCELLED'};return{data:job}}if(name==='mark_background_auto_plan_applied'){job={...job,status:'APPLIED'};return{data:job}}if(name==='apply_planning_period')return{data:{created:args.p_assignments.length}};throw Error('Unexpected API '+name);};
 for(const name of ['solid-planning-resume-v1.js','background-auto-plan-core-v1.js','background-auto-plan-v1.js'])vm.runInContext(read('assets/'+name),c);
 const finishServer=()=>{let cp=engine.start(JSON.parse(JSON.stringify(waitingPayload)));while(cp.stage!=='done'){const r=engine.context(waitingPayload,cp);for(let n=0;n<20&&cp.stage!=='done';n++)if(!r.step())break;cp=JSON.parse(JSON.stringify(cp));}job={...job,status:'SUCCEEDED',progress:100,result:engine.result(waitingPayload,cp)};};
 return{...h,events,controls,finishServer,job:()=>job,payload:()=>waitingPayload,confirm:value=>confirmed=value};
}
test('server preview completes while browser polling is hidden and requires explicit draft confirmation',async()=>{
 const h=harness();h.c.document.hidden=true;const planning=h.c.SFMonthOptimizer.optimize();
 for(let n=0;n<50&&!h.payload();n++)await delay(3);assert.ok(h.payload(),'the browser submitted a durable job');assert.equal(h.calls.filter(x=>x.name==='start_background_auto_plan').length,1);
 assert.equal(h.calls.filter(x=>x.name==='claim_background_auto_plan'||x.name==='save_background_auto_plan_step').length,0,'browser never drives the worker');
 h.finishServer();assert.equal(h.c.assignments.length,0,'server completion must not write roster duties');assert.equal(h.calls.filter(x=>x.name==='apply_planning_period').length,0);
 h.c.document.hidden=false;h.events.get('visibilitychange')();await planning;
 assert.ok(h.c.autoPlanPreview?.length||h.run('autoPlanPreview.length')>0);assert.ok(h.c.SFMonthOptimizer.getResult().backgroundJobId);
 await h.c.SFMonthOptimizer.apply();assert.equal(h.calls.filter(x=>x.name==='apply_planning_period').length,0,'cancelled confirmation keeps preview only');
 h.confirm(true);await h.c.SFMonthOptimizer.apply();assert.equal(h.calls.filter(x=>x.name==='apply_planning_period').length,1);assert.equal(h.calls.filter(x=>x.name==='mark_background_auto_plan_applied').length,1);
});
test('company switch disconnects display without cancelling the old company job or importing its result',async()=>{
 const h=harness();h.c.document.hidden=true;const planning=h.c.SFMonthOptimizer.optimize();for(let n=0;n<50&&!h.payload();n++)await delay(3);assert.ok(h.payload());h.c.SFBackend.companyId='other-company';h.c.SFBackend.updateState();await planning;
 assert.equal(h.calls.filter(x=>x.name==='cancel_background_auto_plan').length,0);assert.equal(h.c.SFMonthOptimizer.getResult(),null);assert.equal(h.c.SFMonthOptimizer.isBusy(),false);
});
test('new login resumes an active job and restores planning controls when the job finishes',async()=>{
 const h=harness();h.c.document.hidden=true;const planning=h.c.SFMonthOptimizer.optimize();for(let n=0;n<50&&!h.payload();n++)await delay(3);const current=h.job();h.c.SFBackend.ready=false;h.c.SFBackend.updateState();await planning;
 h.c.SFBackend.ready=true;h.c.SFBackend.updateState();await delay(5);h.finishServer();h.c.document.hidden=false;h.events.get('visibilitychange')();
 for(let n=0;n<100&&!h.c.SFMonthOptimizer.getResult();n++)await delay(5);
 assert.equal(h.c.SFMonthOptimizer.getResult().backgroundJobId,current.id);assert.equal(h.c.SFMonthOptimizer.isBusy(),false);assert.equal(h.el('autoPlanMonth').disabled,false);
});
test('opening a saved result deduplicates review, locks controls and releases them after a company switch',async()=>{
 const h=harness();h.c.document.hidden=true;const planning=h.c.SFMonthOptimizer.optimize();for(let n=0;n<50&&!h.payload();n++)await delay(3);h.finishServer();h.c.document.hidden=false;h.events.get('visibilitychange')();await planning;
 const job=h.job();h.c.changeAutoPlanPeriod();let complete,reads=0;h.c.SFBackend.hydrate=()=>{reads++;return new Promise(resolve=>complete=resolve)};
 const review=h.c.SFMonthOptimizer.restoreBackground(job);await delay(1);assert.equal(h.c.SFMonthOptimizer.isBusy(),true);assert.ok(h.controls.every(n=>n.disabled));
 await h.c.SFMonthOptimizer.restoreBackground(job);assert.equal(reads,1);h.c.SFBackend.companyId='other-company';complete();await review;
 assert.equal(h.c.SFMonthOptimizer.getResult(),null);assert.equal(h.c.SFMonthOptimizer.isBusy(),false);assert.ok(h.controls.slice(0,3).every(n=>!n.disabled),'period controls are enabled again');assert.equal(h.c.SFAutoPlanProgress.isBusy(),false);
});
test('an unresponsive saved-result review terminates and allows a fresh attempt',async()=>{
 const h=harness();h.c.setTimeout=(fn,ms)=>setTimeout(fn,ms===30000?1:ms);h.c.SFBackend.hydrate=()=>new Promise(()=>{});
 const job={id:'saved',company_id:h.c.SFBackend.companyId,first_month:'2027-01-01',month_count:1,result:{metadata:{fingerprint:'snapshot'}}};
 await h.c.SFMonthOptimizer.restoreBackground(job);assert.equal(h.c.SFMonthOptimizer.isBusy(),false);assert.equal(h.c.SFAutoPlanProgress.isBusy(),false);assert.ok(h.controls.slice(0,3).every(n=>!n.disabled),'period controls are enabled again');assert.match(h.c.toast.copy,/dauert zu lange/);
 await h.c.SFMonthOptimizer.restoreBackground(job);assert.equal(h.c.SFMonthOptimizer.isBusy(),false);
});

test('late fingerprint responses cannot import a saved result after company or account changes',async()=>{
 for(const accountChange of [false,true]){
  const h=harness();h.c.document.hidden=true;const planning=h.c.SFMonthOptimizer.optimize();for(let n=0;n<50&&!h.payload();n++)await delay(3);h.finishServer();h.c.document.hidden=false;h.events.get('visibilitychange')();await planning;const job=h.job();h.c.changeAutoPlanPeriod();
  let complete;const old=h.c.SFBackend.client.rpc;h.c.SFBackend.client.rpc=(name,args)=>name==='preview_planning_period'?new Promise(resolve=>complete=resolve):old(name,args);
  const review=h.c.SFMonthOptimizer.restoreBackground(job);for(let n=0;n<20&&!complete;n++)await delay(1);assert.ok(complete);if(accountChange)h.c.SFBackend.user={id:'new-account'};else h.c.SFBackend.companyId='new-company';complete({data:{fingerprint:job.result.metadata.fingerprint}});await review;
  assert.equal(h.c.SFMonthOptimizer.getResult(),null);assert.equal(h.c.SFMonthOptimizer.isBusy(),false);assert.equal(h.run('autoPlanPreview.length'),0);assert.ok(h.controls.slice(0,3).every(n=>!n.disabled));
 }
});
