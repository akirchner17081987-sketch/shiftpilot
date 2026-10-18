const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const css=read('index.html').match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];
const fixture=String.raw`
window.__calls=[];window.__swaps=[];window.__fail=false;window.__empty=false;window.__hydrations=0;
const duty={id:'duty',shift_code:'FD',starts_at:'2027-02-01T05:00:00Z',ends_at:'2027-02-01T13:00:00Z',status:'PUBLISHED',published_at:'2026-10-01T00:00Z',version:1};
window.renderCalendar=()=>{};window.showSaveToast=()=>{};
window.SFBackend={role:'EMPLOYEE',ready:true,user:{id:'u-a'},companyId:'company',employeeDbId:'a',employeePortalData:{employee:{id:'a'},shifts:[duty]},sfFormatDate:v=>new Date(v).toLocaleDateString('de-DE',{timeZone:'Europe/Berlin'}),sfFormatTime:v=>new Date(v).toLocaleTimeString('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'}),hydrate:async()=>{__hydrations++},client:{
from:table=>{const query={select:()=>query,eq:()=>query,in:()=>query,order:()=>query,then:(resolve,reject)=>Promise.resolve({data:table==='shift_swap_requests'?__swaps.filter(s=>s.status==='PENDING_MANAGER').map(s=>({...s,original_employee_id:'a',target_employee_id:'b'})):table==='employees'?[{id:'a',first_name:'Anna',last_name:'Test'},{id:'b',first_name:'Ben',last_name:'Test'}]:[duty]}).then(resolve,reject)};return query},
rpc:async(name,args={})=>{__calls.push({name,args});if(name==='employee_list_shift_swap_candidates')return {data:__empty?[]:[{employee_id:'b',display_name:'Ben Test',employee_role:'Mitarbeiter'}]};
if(name==='employee_list_shift_swaps')return {data:__swaps.map(s=>({...s,direction:SFBackend.employeeDbId==='a'?'OUTGOING':'INCOMING',other_employee_name:SFBackend.employeeDbId==='a'?'Ben Test':'Anna Test',...duty,id:s.id,assignment_id:'duty',status:s.status}))};
if(__fail){__fail=false;return {error:{message:'Test-Verbindung unterbrochen'}}}
if(name==='employee_create_shift_swap'){__swaps.push({id:'swap-'+__swaps.length,assignment_id:'duty',status:'PENDING_COLLEAGUE',reason:args.p_reason,requested_at:new Date().toISOString()});return {data:__swaps.at(-1).id}}
const s=__swaps.find(x=>x.id===args.p_swap_id);
if(name==='employee_cancel_shift_swap'){s.status='CANCELLED';return {data:'CANCELLED'}}
if(name==='employee_respond_shift_swap'){s.status=args.p_decision==='APPROVE'?'PENDING_MANAGER':'REJECTED_COLLEAGUE';return {data:s.status}}
if(name==='manager_review_shift_swap'){s.status=args.p_decision==='APPROVE'?'APPLIED':'REJECTED_MANAGER';return {data:[{status:s.status,message:'Entscheidung gespeichert',assignment_id:'duty'}]}}
return {data:[]};}}};
window.asEmployee=async id=>{SFBackend.role='EMPLOYEE';SFBackend.user={id:'u-'+id};SFBackend.employeeDbId=id;SFBackend.employeePortalData={employee:{id},shifts:id==='a'?[duty]:[]};document.getElementById('sfEmployeePortal').hidden=false;document.getElementById('view-schedule').hidden=true;await SFBackend.shiftSwap.refreshEmployee()};
`;
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.SF_QA_CHROMIUM?{executablePath:process.env.SF_QA_CHROMIUM}:{})});try{
for(const [name,viewport,theme] of [['desktop-dark',{width:1440,height:1000},'dark'],['desktop-light',{width:1440,height:1000},'light'],['mobile-dark',{width:390,height:844},'dark'],['mobile-light',{width:360,height:780},'light']]){
 const page=await browser.newPage({viewport,locale:'de-DE'}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-10-18T07:00Z'));
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='sf.test')return route.abort();if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="de" data-sf-theme="'+theme+'"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+read('assets/employee-portal-polish-v1.css')+'</style></head><body><div id="sfEmployeePortal" class="sf-employee-orbit" data-sf-portal-active="swaps"><div class="sf-portal-grid"><div style="display:grid"></div></div></div><section id="view-schedule" class="active" hidden><div class="calendar"></div></section><script>'+fixture+'</script><script src="/assets/supabase-shift-swap-v1.js"></script></body></html>'});return route.fulfill({contentType:'application/javascript',body:read(url.pathname.slice(1))})});
 await page.goto('http://sf.test/');await page.waitForTimeout(1100);await page.evaluate(()=>SFBackend.shiftSwap.refreshEmployee());
 const modal=page.locator('#sfSwapModal');
 async function start(){await page.locator('[data-swap-start]').click();await page.locator('[data-swap-pick]').click();await modal.locator('#sfSwapCandidate option[value="b"]').waitFor({state:'attached'})}
 await start();await modal.locator('#sfSwapReason').fill('Privater Termin');await page.evaluate(()=>__fail=true);await modal.locator('#sfSwapSubmit').click();await modal.locator('#sfSwapError.show').waitFor();assert.equal(await modal.locator('#sfSwapSubmit').isEnabled(),true);
 await modal.locator('#sfSwapSubmit').click();await modal.waitFor({state:'detached'});await page.locator('[data-swap-cancel]').waitFor();assert.match(await page.locator('.sf-sx-next').textContent(),/antwortet/);
 assert.deepEqual(await page.evaluate(()=>__calls.find(x=>x.name==='employee_create_shift_swap').args),{p_assignment_id:'duty',p_target_employee_id:'b',p_reason:'Privater Termin'});
 await page.evaluate(()=>asEmployee('b'));await page.locator('[data-swap-decision="APPROVE"]').click();await modal.locator('#sfSwapSubmit').click();await modal.waitFor({state:'detached'});assert.match(await page.locator('.sf-sx-next').textContent(),/Disposition/);
 await page.evaluate(async()=>{SFBackend.role='PLANNER';SFBackend.user={id:'planner'};document.getElementById('sfEmployeePortal').hidden=true;document.getElementById('view-schedule').hidden=false;await SFBackend.shiftSwap.refreshManager()});await page.locator('[data-manager-decision="APPROVE"]').click();await modal.locator('#sfSwapSubmit').click();await modal.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>__hydrations),1);assert.equal(await page.locator('#sfSwapManager').count(),0);
 for(const who of ['a','b']){await page.evaluate(who=>asEmployee(who),who);await page.locator('[data-swap-filter="history"]').click();assert.match(await page.locator('.sf-sx-next').textContent(),/Dienstplan aktualisiert/)}
 // New request can be cancelled; incoming refusal is represented without approval.
 await page.evaluate(()=>{__swaps=[];return asEmployee('a')});await start();await modal.locator('#sfSwapSubmit').click();await modal.waitFor({state:'detached'});await page.locator('[data-swap-cancel]').click();await modal.locator('#sfSwapSubmit').click();await modal.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>__swaps[0].status),'CANCELLED');
 await page.evaluate(()=>{__swaps=[];return asEmployee('a')});await start();await modal.locator('#sfSwapSubmit').click();await modal.waitFor({state:'detached'});await page.evaluate(()=>asEmployee('b'));await page.locator('[data-swap-decision="REJECT"]').click();await modal.locator('#sfSwapSubmit').click();await modal.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>__swaps[0].status),'REJECTED_COLLEAGUE');
 await page.evaluate(()=>{__swaps=[];__empty=true;return asEmployee('a')});await page.locator('[data-swap-start]').click();await page.locator('[data-swap-pick]').click();await page.waitForFunction(()=>document.getElementById('sfSwapCandidateInfo').textContent.includes('Aktuell gibt'));assert.equal(await modal.locator('#sfSwapSubmit').isDisabled(),true);
 const box=await modal.locator('.sf-swap-modal').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=viewport.width,'Dialog fits');assert.deepEqual(errors,[]);
 fs.mkdirSync(path.join(root,'test-results/shift-swap'),{recursive:true});await page.screenshot({path:path.join(root,'test-results/shift-swap',name+'.png')});console.log(JSON.stringify({name,passed:true}));await page.close();
}
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
