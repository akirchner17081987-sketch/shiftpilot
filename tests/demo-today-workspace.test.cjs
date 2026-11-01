const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const planning=require('../assets/solid-planning-core-v1.js');
const today=require('../assets/today-workspace-core-v1.js');
const todayDate=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

test('current overview receives local demo records and rejects unhandled RPCs',async()=>{
 const store=new Map(Object.entries({sf_demo_session_v1:'active',sf_demo_data_employees:JSON.stringify([{id:'e1',first:'Anna',last:'Becker',personnelNo:'D001'}]),sf_demo_data_assignments:JSON.stringify([{id:'a1',employeeId:'e1',date:todayDate(),type:'O1',start:'07:00',end:'15:00',publishedAt:'2026-07-27'}]),sf_demo_data_globalSoll:JSON.stringify({O1:1}),sf_demo_data_dailySoll:'{}',sf_demo_data_absences:'[]'}));
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
 const report=await client.rpc('manager_reports_workspace',{p_company_id:'demo-local-company',p_start_date:todayDate(),p_end_date:todayDate()});
 assert.equal(report.error,null);
 assert.equal(require('../assets/reports-workspace-core-v1.js').analyze(report.data).summary.duties,1);
 assert.equal((await client.rpc('manager_reports_workspace',{p_company_id:'other-company',p_start_date:todayDate(),p_end_date:todayDate()})).error.code,'SF_DEMO_UNHANDLED');
 assert.ok((await client.rpc('manager_reports_workspace',{p_company_id:'demo-local-company',p_start_date:'2026-02-30',p_end_date:'2026-03-01'})).error);
 assert.equal((await client.rpc('unknown_write')).error.code,'SF_DEMO_UNHANDLED');
 await assert.rejects(()=>window.fetch('https://example.supabase.co/rest/v1/employees'),/SF_DEMO_NETWORK_BLOCKED/);
});

test('demo renders the current overview with local data',async()=>{
 const {Window}=await import('happy-dom');const w=new Window({url:'https://schichtfunk.de/demo'});
 try{
  w.document.body.innerHTML='<section id="view-overview" class="view active"></section>';
  for(const [key,value] of Object.entries({sf_demo_session_v1:'active',sf_demo_data_employees:JSON.stringify([{id:'e1',first:'Anna',last:'Becker',personnelNo:'D001'}]),sf_demo_data_assignments:JSON.stringify([{id:'a1',employeeId:'e1',date:todayDate(),type:'O1',start:'07:00',end:'15:00',publishedAt:'2026-07-27'}]),sf_demo_data_globalSoll:JSON.stringify({O1:1}),sf_demo_data_dailySoll:'{}',sf_demo_data_absences:'[]'}))w.sessionStorage.setItem(key,value);
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

test('the demo seeds the current planning month while preserving August payroll examples',()=>{
 const values=new Map([['sf_demo_session_v1','active']]);
 const sessionStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v))};
 const context={sessionStorage,window:{SFBackend:{}},document:{readyState:'loading',addEventListener(){}},MutationObserver:function(){this.observe=()=>{}},employees:[{id:'e1',personnelNo:'D001',first:'Anna',last:'Becker',weeklyHours:40}],assignments:[],dailySoll:{},timeEntries:{},absences:[],store:{set(){}},Date,Intl,JSON,console,setTimeout(){}};
 vm.runInNewContext(fs.readFileSync('assets/demo-august-2026-v1.js','utf8'),context);
 assert.equal(context.window.SchichtFunkDemoAugust2026.ensurePrepared(),true);
 const assignments=JSON.parse(values.get('sf_demo_data_assignments'));
 assert.ok(assignments.some(a=>a.id.startsWith('demo-aug26-')));
 if(!todayDate().startsWith('2026-08'))assert.ok(assignments.some(a=>a.id.startsWith('demo-current-'+todayDate().slice(0,7))));
 const timeEntries=JSON.parse(values.get('sf_demo_data_timeEntries'));
 assert.ok(Object.keys(timeEntries).some(id=>id.startsWith('demo-aug26-')));
});

test('the current reports dashboard loads only the demo company',async()=>{
 const {Window}=await import('happy-dom');const w=new Window({url:'https://schichtfunk.de/demo'});
 try{
  w.document.body.innerHTML='<section id="view-reports" class="view active"></section>';
  const day=todayDate();
  for(const [key,value] of Object.entries({sf_demo_session_v1:'active',sf_demo_data_employees:JSON.stringify([{id:'e1',first:'Anna',last:'Becker',personnelNo:'D001',weeklyHours:40}]),sf_demo_data_assignments:JSON.stringify([{id:'a1',employeeId:'e1',date:day,type:'O1',start:'07:00',end:'15:00',publishedAt:'2026-07-27'}]),sf_demo_data_globalSoll:JSON.stringify({O1:1}),sf_demo_data_dailySoll:'{}',sf_demo_data_absences:'[]'}))w.sessionStorage.setItem(key,value);
  w.SFSolidPlanningCore=planning;w.SFReportsCore=require('../assets/reports-workspace-core-v1.js');
  w.setInterval=()=>0;const later=w.setTimeout.bind(w);w.setTimeout=(fn,ms)=>ms>=1000?0:later(fn,ms);
  w.SFBackend={ready:true,companyId:'demo-local-company',role:'ADMIN',user:{id:'demo-local-user'},updateState(){}};
  w.eval(fs.readFileSync('assets/demo-marketplace-v1.js','utf8'));
  w.eval(fs.readFileSync('assets/reports-workspace-v1.js','utf8'));
  await w.SFReports.reload();
  assert.equal(w.SFReports.getResult().data.company_id,'demo-local-company');
  assert.equal(w.SFReports.getResult().summary.duties,1);
  assert.match(w.document.getElementById('sfReportsWorkspace').textContent,/Auswertungs-Dashboard/);
 }finally{await w.happyDOM.abort();w.close()}
});

test('employee perspective uses the same published demo duties and recorded times as planning',async()=>{
 const {Window}=await import('happy-dom');const w=new Window({url:'https://schichtfunk.de/demo'});
 try{
  w.sessionStorage.setItem('sf_demo_session_v1','active');
  w.document.body.innerHTML='<div id="appShell"><div class="top-actions"></div><section id="view-overview" class="view active"></section></div>';
  w.employees=[{id:'e1',personnelNo:'D001',first:'Anna',last:'Becker',weeklyHours:40,status:'active'}];
  w.assignments=[{id:'published',employeeId:'e1',date:'2026-11-01',type:'O1',start:'07:00',end:'15:00',publishedAt:'2026-10-27'},{id:'draft',employeeId:'e1',date:'2026-11-02',type:'O1',start:'07:00',end:'15:00',_dbStatus:'DRAFT'}];
  w.absences=[];w.timeEntries={published:{actualStart:'07:00',actualEnd:'15:00',breakMin:30,status:'confirmed'}};w.SFSolidPlanningCore=planning;
  w.setTimeout=()=>0;w.scrollTo=()=>{};
  w.SFBackend={client:{rpc:async()=>({data:[]})},restoreNonEmployeeShell(){},openEmployeePortal(){},employeePortalNavigate(){}};
  w.eval(fs.readFileSync('assets/demo-role-switch-v1.js','utf8'));w.SFDemoPerspective.set('employee');
  const data=w.SFBackend.employeePortalData;
  assert.deepEqual(Array.from(data.shifts,a=>a.id),['published']);
  assert.equal(data.shifts[0].starts_at,'2026-11-01T06:00:00.000Z');
  assert.equal(data.timeEntries[0].assignment_id,'published');
  assert.equal(data.timeEntries[0].actual_start,data.shifts[0].starts_at);
 }finally{await w.happyDOM.abort();w.close()}
});

test('the demo bootstrap seeds exactly five fictional employees and no dangling absences',async()=>{
 const {Window}=await import('happy-dom');const w=new Window({url:'https://schichtfunk.de/demo'});
 try{
  w.sessionStorage.setItem('sf_demo_session_v1','active');
  w.document.body.innerHTML='<main id="landingPage"></main><main id="appShell"><section id="view-overview"></section></main>';
  w.employees=[];w.assignments=[];w.absences=[];w.globalSoll={};w.dailySoll={};w.timeEntries={};w.weekStart=new Date();w.store={};w.TYPES=[];
  w.SFBackend={client:{__sfDemoLocalClientV1:true}};w.SFDemoAPI={fetchAuth:async()=>({ok:true,json:async()=>({})})};
  w.setTimeout=()=>0;w.scrollTo=()=>{};
  w.eval(fs.readFileSync('assets/demo-mode-v1.js','utf8'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await new Promise(resolve=>setImmediate(resolve));
  const employees=JSON.parse(w.sessionStorage.getItem('sf_demo_data_employees'));
  const absences=JSON.parse(w.sessionStorage.getItem('sf_demo_data_absences'));
  assert.equal(employees.length,5);
  assert.ok(employees.every(e=>e.email.endsWith('@demo.schichtfunk.invalid')));
  assert.ok(absences.every(a=>employees.some(e=>e.id===a.employeeId)));
  w.SFSolidPlanningCore=planning;
  w.eval(fs.readFileSync('assets/demo-marketplace-v1.js','utf8'));
  const client=w.SFDemoDataClient.create();
  const times=await client.rpc('manager_list_time_entries',{});
  assert.ok(times.data.every(t=>employees.some(e=>e.id===t.employee_id)));
  const market=await client.rpc('manager_list_shift_marketplace',{});
  const names=new Set(employees.map(e=>e.first+' '+e.last));
  assert.ok(market.data.every(m=>names.has(m.offered_by)&&(!m.claimed_by||names.has(m.claimed_by))));
 }finally{await w.happyDOM.abort();w.close()}
});
