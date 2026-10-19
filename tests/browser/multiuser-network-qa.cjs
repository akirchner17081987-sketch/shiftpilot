// Real shipped manager/employee UI; independent browser contexts; shared synthetic
// read transport. No production login, real personal records or outbound writes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'test-results/multiuser-network');
const fixtures=require('../fixtures/today-data.cjs'),auth=require('../fixtures/site-loading-auth.cjs');
let server,browser;
async function main(){
 fs.mkdirSync(out,{recursive:true});
 let ended=false,latency=0;const requests=[],writes=[],errors=[];
 const today=()=>{const d=fixtures.fixture();d.company_id='qa';d.company_name='Isolierter Mehrbenutzertest';d.employees[0]={id:'qa-employee',first:'Fiktiv',last:'Netztest',personnel_no:'119'};d.assignments=[fixtures.assignment('qa-shift','qa-employee')];d.qr=[fixtures.booking('qa-booking','qa-employee',ended?'2026-10-10T09:00:00Z':null)];return d;};
 const qr=month=>({employee_id:'qa-employee',month,timezone:'Europe/Berlin',as_of:'2026-10-10T10:00:00Z',truncated:false,rows:[{id:'qa-booking',started_at:'2026-10-10T04:00:00Z',ended_at:ended?'2026-10-10T09:00:00Z':null,attendance_minutes:ended?300:360,pause_minutes:15,terminal_name:'Fiktives Terminal',breaks:[{number:1,started_at:'2026-10-10T07:00:00Z',ended_at:'2026-10-10T07:15:00Z',minutes:15}]}]});
 let boundary=auth.replace("async rpc(name,args){qa.rpcs.push(name);",`async rpc(name,args){qa.rpcs.push(name);if(['manager_today_workspace','employee_my_qr_bookings'].includes(name)){const r=await fetch('/__test_rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args,actor:qa.actor})});return r.json();}`)
 .replace("id:'qa-user'","id:qa.actor==='admin'?'qa-admin':'qa-worker'");
 assert.notEqual(boundary,auth);
 server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/__test_rpc'){
   let text='';for await(const chunk of req)text+=chunk;const input=JSON.parse(text),record={actor:input.actor,rpc:input.name,start:Date.now()};requests.push(record);
   let output;
   if(input.name==='manager_today_workspace'&&input.actor==='admin'&&input.args.p_company_id==='qa')output={data:today()};
   else if(input.name==='employee_my_qr_bookings'&&input.actor==='employee')output={data:qr(input.args.p_month)};
   else{writes.push(input);output={error:{message:'Synthetic transport rejects this operation'}};}
   await new Promise(r=>setTimeout(r,latency));record.end=Date.now();res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(output));
  }
  if(u.pathname==='/'){
   const actor=u.searchParams.get('actor')==='employee'?'employee':'admin',role=actor==='admin'?'ADMIN':'EMPLOYEE';
   const prep=`<script>window.qa={role:${JSON.stringify(role)},actor:${JSON.stringify(actor)},start:performance.now(),rpcs:[],writes:[],today:${JSON.stringify(today())}};</script>`;
   const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace('<head>','<head>'+prep).replace('</body>','<div id="qaParsed" hidden></div></body>');
   res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);
  }
  const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
  const body=u.pathname==='/assets/supabase-auth-v1.js'?boundary:fs.readFileSync(file);
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.webp')?'image/webp':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream');res.end(body);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});
 const adminContext=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),employeeContext=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 const admin=await adminContext.newPage(),employee=await employeeContext.newPage();
 for(const page of [admin,employee]){page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-10-10T10:00:00Z'));await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());}
 await Promise.all([admin.goto(origin+'/?actor=admin'),employee.goto(origin+'/?actor=employee')]);
 await Promise.all([admin.waitForFunction(()=>qa.done&&SFToday?.getResult?.()),employee.waitForFunction(()=>qa.done&&SFBackend.role==='EMPLOYEE'&&document.getElementById('sfEmployeePortal'))]);
 await employee.evaluate(()=>SFBackend.employeePortalNavigate('time'));await employee.locator('#sfEmployeeQrBookings .sf-qb-entry').first().waitFor();
 assert.equal(await admin.evaluate(()=>SFToday.getResult().summary.present),1);assert.equal(await employee.locator('#sfEmployeeQrBookings').isVisible(),true);
 assert.equal(await employee.locator('#appShell').count(),0,'employee has no management shell');
 assert.equal(await admin.evaluate(()=>SFBackend.user.id),'qa-admin');assert.equal(await employee.evaluate(()=>SFBackend.user.id),'qa-worker');
 await admin.evaluate(()=>localStorage.setItem('qa-profile-marker','admin'));assert.equal(await employee.evaluate(()=>localStorage.getItem('qa-profile-marker')),null,'contexts do not share local session storage');
 // Two independent clients read one server-side fixture at overlapping times.
 latency=250;const start=requests.length;
 await Promise.all([admin.evaluate(()=>SFToday.reload(true)),employee.evaluate(()=>SFBackend.renderEmployeeQrBookings())]);
 const pair=requests.slice(start).filter(r=>['manager_today_workspace','employee_my_qr_bookings'].includes(r.rpc));
 const a=pair.find(r=>r.actor==='admin'),e=pair.find(r=>r.actor==='employee');assert.ok(a&&e&&Math.max(a.start,e.start)<Math.min(a.end,e.end),'requests overlap on the shared test server');latency=0;
 // A real browser network disconnect affects one profile only.
 await employeeContext.setOffline(true);await employee.locator('[data-qb="refresh"]').click();await employee.waitForFunction(()=>document.querySelector('.sf-qb-feedback')?.textContent.includes('fehlgeschlagen'));
 assert.equal(await employee.locator('.sf-qb-entry').count(),1,'last confirmed booking survives offline refresh');
 ended=true;await admin.evaluate(()=>SFToday.reload(true));assert.equal(await admin.evaluate(()=>SFToday.getResult().summary.present),0);assert.equal(await admin.evaluate(()=>SFToday.getResult().summary.finished),1);
 await employeeContext.setOffline(false);await employee.locator('[data-qb="refresh"]').click();await employee.waitForFunction(()=>document.querySelector('.sf-qb-entry')?.textContent.includes('5 Std. 00 Min.'));
 assert.match(await employee.locator('.sf-qb-entry').first().innerText(),/15 Min\./,'paid pause remains separate');
 // Conversely, lost manager connectivity never invents absence warnings.
 await adminContext.setOffline(true);await admin.evaluate(()=>SFToday.reload(true));assert.match(await admin.locator('#sfTodayStatus').innerText(),/fehlgeschlagen/);assert.equal(await admin.evaluate(()=>SFToday.getResult().summary.missing),null);
 await employee.locator('[data-qb="refresh"]').click();await employee.waitForFunction(()=>!document.querySelector('[data-qb="refresh"]').disabled);
 await adminContext.setOffline(false);await admin.evaluate(()=>SFToday.reload(true));assert.equal(await admin.evaluate(()=>SFToday.getResult().reliable),true);
 await admin.locator('#sfTodayPeople').scrollIntoViewIfNeeded();await admin.screenshot({path:path.join(out,'admin-after-reconnect.png')});await employee.screenshot({path:path.join(out,'employee-after-reconnect.png')});
 assert.equal(writes.length,0);assert.deepEqual(await admin.evaluate(()=>qa.writes),[]);assert.deepEqual(await employee.evaluate(()=>qa.writes),[]);assert.deepEqual(errors,[]);
 const evidence={passed:true,productionLogin:false,transport:'shared synthetic read-only HTTP boundary',separateBrowserContexts:2,overlappingReadRequests:true,employeeOfflineRecovery:true,adminOfflineRecovery:true,consistentCompletedBooking:true,attendanceMinutes:300,paidPauseMinutes:15,productionWrites:0,errors};
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));await adminContext.close();await employeeContext.close();
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();await new Promise(r=>server?.close(r)||r())});
