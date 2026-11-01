const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const planning=require('../assets/solid-planning-core-v1.js');
const today=require('../assets/today-workspace-core-v1.js');

test('current overview receives local demo records and rejects unhandled RPCs',async()=>{
 const store=new Map(Object.entries({sf_demo_session_v1:'active',sf_demo_data_employees:JSON.stringify([{id:'e1',first:'Anna',last:'Becker',personnelNo:'D001'}]),sf_demo_data_assignments:JSON.stringify([{id:'a1',employeeId:'e1',date:'2026-08-17',type:'O1',start:'07:00',end:'15:00',publishedAt:'2026-07-27'}]),sf_demo_data_globalSoll:JSON.stringify({O1:1}),sf_demo_data_dailySoll:'{}',sf_demo_data_absences:'[]'}));
 const sessionStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
 const XMLHttpRequest=function(){};XMLHttpRequest.prototype.open=function(){};
 const window={SFBackend:{},SFSolidPlanningCore:planning,fetch:async()=>{throw Error('unexpected network')}};
 const ctx={window,sessionStorage,XMLHttpRequest,location:{href:'https://schichtfunk.de/demo'},URL,document:{getElementById:()=>null},setTimeout:()=>0,console,Date,Map,Set,JSON,Promise};
 vm.runInNewContext(fs.readFileSync('assets/demo-marketplace-v1.js','utf8'),ctx);
 const client=window.SFDemoDataClient.create();
 const result=await client.rpc('manager_today_workspace',{p_company_id:'demo-local-company'});
 assert.equal(result.error,null);
 assert.equal(result.data.company_id,'demo-local-company');
 assert.equal(result.data.assignments[0].employee_id,'e1');
 assert.equal(result.data.assignments[0].status,'PUBLISHED');
 assert.doesNotThrow(()=>today.analyze(result.data));
 assert.equal((await client.rpc('unknown_write')).error.code,'SF_DEMO_UNHANDLED');
 await assert.rejects(()=>window.fetch('https://example.supabase.co/rest/v1/employees'),/SF_DEMO_NETWORK_BLOCKED/);
});

test('demo renders the current overview with local data',async()=>{
 const {Window}=await import('happy-dom');const w=new Window({url:'https://schichtfunk.de/demo'});
 try{
  w.document.body.innerHTML='<section id="view-overview" class="view active"></section>';
  for(const [key,value] of Object.entries({sf_demo_session_v1:'active',sf_demo_data_employees:JSON.stringify([{id:'e1',first:'Anna',last:'Becker',personnelNo:'D001'}]),sf_demo_data_assignments:JSON.stringify([{id:'a1',employeeId:'e1',date:'2026-08-17',type:'O1',start:'07:00',end:'15:00',publishedAt:'2026-07-27'}]),sf_demo_data_globalSoll:JSON.stringify({O1:1}),sf_demo_data_dailySoll:'{}',sf_demo_data_absences:'[]'}))w.sessionStorage.setItem(key,value);
  w.SFSolidPlanningCore=planning;w.SFTodayCore=today;w.SFReportsCore=require('../assets/reports-workspace-core-v1.js');
  w.setInterval=()=>0;const later=w.setTimeout.bind(w);w.setTimeout=(fn,ms)=>ms>=1000?0:later(fn,ms);
  w.SFBackend={ready:true,companyId:'demo-local-company',role:'ADMIN',user:{id:'demo-local-user'},updateState(){}};
  w.eval(fs.readFileSync('assets/demo-marketplace-v1.js','utf8'));
  w.eval(fs.readFileSync('assets/today-workspace-v3.js','utf8'));
  await w.SFToday.reload();
  assert.ok(w.document.getElementById('sfTodayWorkspace'));
  assert.match(w.document.getElementById('sfTodayDate').textContent,/SchichtFunk Demo GmbH/);
  assert.equal(w.SFToday.getResult().summary.planned,1);
  assert.equal(w.SFToday.getResult().summary.present,0);
 }finally{await w.happyDOM.abort();w.close()}
});
