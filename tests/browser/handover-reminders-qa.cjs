const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const board='00000000-0000-4000-8000-000000000011',item='00000000-0000-4000-8000-000000000012',notice='00000000-0000-4000-8000-000000000013';
const setup=({role,board,item,notice})=>{
 window.qa={calls:[],filters:[],failure:false,delay:0};window.switchView=view=>{qa.view=view};
 const metadata={company_id:'company-a',board_id:board,item_id:item,starts_at:'2026-09-01T20:00:00Z'};
 qa.notice={id:notice,company_id:'company-a',user_id:'user-a',entity_type:'handover_reminder',kind:'HANDOVER_CRITICAL_OVERDUE',metadata,title:'Kritische Aufgabe überfällig',message:'Bitte im Portal prüfen.',link_view:role==='EMPLOYEE'?'employee-handover':'handover',is_read:false,created_at:new Date().toISOString()};
 const b={id:board,company_id:'company-a',state:'WORKING',site:'Leitstelle',shift_code:'ND',starts_at:metadata.starts_at,ends_at:'2026-09-02T04:00:00Z',revision:1,crew_ids:['employee-a'],incoming:[],reports:[],events:[],next_shift:null,items:[{id:item,kind:'TASK',title:'Fiktive Aufgabe',detail:'Nur im Portal sichtbar',status:'OPEN',critical:true,due_at:'2026-09-01T22:00:00Z',responsible_employee_id:'employee-a'}]};
 window.SFBackend={user:{id:'user-a'},companyId:'company-a',role,employeeDbId:'employee-a',companyTimeZone:'Europe/Berlin',updateState(){},openEmployeePortal:async()=>{},employeePortalNavigate:async view=>{qa.view=view},client:{rpc:async(name,args)=>{qa.calls.push({name,args});if(qa.delay)await new Promise(r=>setTimeout(r,qa.delay));return {data:{company_id:args.p_company_id,manager:role!=='EMPLOYEE',can_report:false,timezone:'Europe/Berlin',as_of:new Date().toISOString(),shifts:[],boards:[b],employees:[{id:'employee-a',first:'Anna',last:'Fiktiv'}]}};},from:()=>{const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);qa.filters.push([k,v]);return q},order(){return q},limit(){return q},update(){return q},async maybeSingle(){if(qa.delay)await new Promise(r=>setTimeout(r,qa.delay));return qa.failure?{error:{message:'network test'}}:{data:filters.every(([k,v])=>qa.notice[k]===v)?qa.notice:null}},then(resolve,reject){return Promise.resolve({data:[qa.notice]}).then(resolve,reject)}};return q;}}};
};
(async()=>{const browser=await chromium.launch({headless:true});let passed=0;try{
 for(const role of ['EMPLOYEE','OWNER'])for(const width of [360,1440]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html><head><meta charset="utf-8"></head><body><header class="topbar"><div class="top-actions"></div></header><nav id="nav"><button data-view="auto"></button></nav><main><section id="view-auto"></section><section id="view-overview"></section></main><div id="sfEmployeePortal"><div class="sf-portal-top"></div><div class="sf-portal-grid"></div></div></body></html>'}));
  await page.goto('https://schichtfunk.de/');await page.evaluate(setup,{role,board,item,notice});
  for(const file of ['assets/shift-handover-core-v1.js','assets/shift-handover-v1.js','assets/supabase-notifications-v1.js'])await page.addScriptTag({content:read(file)});
  await page.addStyleTag({content:read('assets/shift-handover-v1.css')});
  await page.evaluate(()=>SFBackend.notifications.refresh());await page.evaluate(()=>SFBackend.notifications.open());
  assert.ok(await page.locator('.sf-notify-item.warn').count());await page.locator('.sf-notify-item').click();
  const host=role==='EMPLOYEE'?'#sfHandoverEmployee':'#sfHandoverManager';await page.locator(host+' [data-ho-item="'+item+'"]').waitFor();
  assert.equal(await page.locator(host+' [name="from"]').first().inputValue(),'2026-09-01');assert.equal(await page.locator(host+' [data-ho-select]').inputValue(),board);assert.equal(await page.evaluate(()=>qa.view),'handover');passed+=3;
  // Push opens the same board after reading only this user's company-scoped notice.
  await page.evaluate(({notice,role})=>{history.replaceState({},'', '/?sf_push_view='+encodeURIComponent(role==='EMPLOYEE'?'employee-handover':'handover')+'&sf_push_notification='+notice+'#app');qa.calls=[];qa.filters=[]},{notice,role});
  await page.addScriptTag({content:read('assets/push-notifications-v1.js')});await page.waitForFunction(()=>sessionStorage.getItem('sf_pending_push_view')===null&&qa.filters.some(([k])=>k==='user_id'));
  assert.ok(await page.evaluate(()=>qa.filters.some(([k,v])=>k==='user_id'&&v==='user-a')&&qa.filters.some(([k,v])=>k==='company_id'&&v==='company-a')));passed++;
  const calls=await page.evaluate(()=>qa.calls.length);await page.evaluate(()=>SFHandover.openNotification({company_id:'foreign-company',board_id:'00000000-0000-4000-8000-000000000011',starts_at:'2026-09-01T20:00:00Z'}));assert.equal(await page.evaluate(()=>qa.calls.length),calls);passed++;
  await page.evaluate(()=>{qa.delay=150;SFHandover.openNotification(qa.notice.metadata);SFBackend.user={id:'different-user'};SFBackend.updateState()});await page.waitForTimeout(250);assert.equal(await page.locator(host+' [data-ho-item]').count(),0);assert.equal(await page.evaluate(()=>SFHandover.getData()),null);passed++;
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log(`Handover reminder browser QA passed: ${passed} checks, manager/employee, exact historic/night board, authenticated push route, company isolation and stale-identity protection; 360/1440px.`);
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
