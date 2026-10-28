const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('periodic workspace installers retain each other and hydrate wishes once',async()=>{
 const {Window}=await import('happy-dom'),w=new Window({url:'https://example.test'}),timers=[];try{
  w.document.body.innerHTML='<div id="appShell"></div>';w.setInterval=fn=>{timers.push(fn);return timers.length};w.setTimeout=()=>0;w.clearTimeout=()=>{};
  let hydrates=0,updates=0,feeds=0;const B=w.SFBackend={ready:false,hydrate:async()=>{hydrates++;return 'ok'},updateState:()=>{updates++;return 'updated'}};
  for(const file of ['wish-planning-core-v1.js','solid-planning-core-v1.js','reports-workspace-core-v1.js','today-workspace-core-v1.js','shift-handover-core-v1.js','staffing-simulator-core-v1.js','wish-planning-v1.js','background-auto-plan-v1.js','reports-workspace-v1.js','today-workspace-v3.js','shift-handover-v1.js','staffing-simulator-v1.js'])w.eval(fs.readFileSync('assets/'+file,'utf8'));
  for(let i=0;i<20;i++)for(const fn of timers)fn();const hydrate=B.hydrate,update=B.updateState;
  for(let i=0;i<50;i++)for(const fn of timers)fn();assert.equal(B.hydrate,hydrate,'periodic installs must not stack');assert.equal(B.updateState,update,'state guards must not stack');
  Object.assign(B,{ready:true,role:'OWNER',companyId:'fictional',user:{id:'tester'},client:{rpc:async name=>{if(name==='planning_wish_feed'){feeds++;return{data:{company_id:'fictional',wishes:[]}}}return{data:{}}}}});
  await B.hydrate();assert.equal(hydrates,1);assert.equal(feeds,1,'one hydrate causes one wishes refresh');assert.equal(B.updateState(),'updated');assert.equal(updates,1);
 }finally{w.happyDOM.abort();w.close();}
});
