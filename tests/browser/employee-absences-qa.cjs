const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const output=path.join(root,'test-results/employee-absences');fs.mkdirSync(output,{recursive:true});
const css=fs.readFileSync(path.join(root,'index.html'),'utf8').match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];
const scripts=['supabase-employee-access-v1.js','supabase-absence-workflow-v1.js','supabase-absence-manager-v2.js','supabase-absence-employee-v3.js','supabase-time-tracking-v1.js','employee-portal-workspace-v2.js','employee-portal-vertical-layout-v1.js','employee-shifts-month-v1.js','employee-mobile-pwa-polish-v2.js'];
const fixture=String.raw`
window.__blockedRequests=0;document.addEventListener('click',event=>{if(event.target.closest?.('[data-sf-absence-request="1"],#sfEmployeeAbsenceAdd,#sfEmployeeAbsenceAddV2')){__blockedRequests++;event.stopImmediatePropagation();}},true);
sessionStorage.setItem('sfEmployeePortalView','absences');window.__calls=[];window.__queries=[];window.__rows=[];window.__failLoad=false;window.__failSubmit=false;window.__delay=0;window.__rpcDelay=0;window.__xss=false;window.__demoRows=[];window.__portalRefresh=0;
window.employees=[{id:'local-employee',_dbId:'employee-1',first:'Anna',last:'Beispiel'}];window.assignments=[];window.absences=[];
const absence=(id,i,status,type='Urlaub')=>({id,company_id:'test-company',employee_id:'employee-1',absence_type:type,start_date:'2026-11-'+String(i+1).padStart(2,'0'),end_date:'2026-11-'+String(i+2).padStart(2,'0'),status,full_day:true,request_source:'EMPLOYEE',requested_at:'2026-10-01T10:'+String(i).padStart(2,'0')+':00Z',note:i===0?'Optionaler Kommentar <img src=x onerror="window.__xss=true">':'',review_note:status==='Abgelehnt'?'Bitte anderen Zeitraum wählen.':status==='Genehmigt'?'Vertretung ist eingeplant.':'',reviewed_at:status==='Beantragt'?null:'2026-10-01T12:00:00Z'});
window.testAbsences=()=>[...Array.from({length:16},(_,i)=>absence('a'+i,i,i<7?'Beantragt':i<12?'Genehmigt':'Abgelehnt',['Urlaub','Sonderurlaub','Krank','Kind Krank','Home-Office','Fortbildung'][i%6])),{...absence('foreign',20,'Beantragt'),employee_id:'other-employee'}];
window.renderAbsenceDashboard=()=>{};window.showSaveToast=()=>{};
window.SFBackend={role:'EMPLOYEE',ready:true,user:{id:'employee-user'},companyId:'test-company',companyTimeZone:'Europe/Berlin',employeeDbId:'employee-1',employeePortalData:{employee:{id:'employee-1',first_name:'Anna',last_name:'Beispiel',weekly_hours:40,employment:'Vollzeit',work_time_model:'SHIFT',shift_permissions:['FD'],personnel_no:'1001',email:'example@example.invalid'},company:{id:'test-company',name:'SchichtFunk Vorschau',timezone:'Europe/Berlin'},templates:[],shifts:[],absences:[],requests:[],approvals:[],timeEntries:[]},client:{auth:{signOut:async()=>({})},from:table=>{let filters={};const run=async()=>{__queries.push({table,filters:{...filters}});const rows=__rows.filter(a=>Object.entries(filters).every(([key,value])=>String(a[key])===String(value))).map(a=>({...a})),delay=__delay;if(delay)await new Promise(r=>setTimeout(r,delay));return __failLoad?{error:{message:'Test unavailable'}}:{data:table==='absences'?rows:[]};};const q={select:()=>q,eq:(key,value)=>{filters[key]=value;return q},order:()=>run(),then:(resolve,reject)=>run().then(resolve,reject)};return q;},rpc:async(name,args)=>{if(["employee_submit_absence_request","manager_review_absence_request"].includes(name))__calls.push({name,args});if(__rpcDelay)await new Promise(r=>setTimeout(r,__rpcDelay));if(__failSubmit)return {error:{message:'Für diesen Zeitraum besteht bereits eine Abwesenheit oder ein offener Antrag'}};if(name==='employee_submit_absence_request'){const row={id:'submitted-'+__calls.length,company_id:'test-company',employee_id:'employee-1',absence_type:args.p_absence_type,start_date:args.p_start_date,end_date:args.p_end_date,status:'Beantragt',full_day:args.p_full_day,start_time:args.p_start_time,end_time:args.p_end_time,note:args.p_note,request_source:'EMPLOYEE',requested_at:new Date().toISOString()};__rows.push(row);return {data:row.id};}if(name==='manager_review_absence_request'){const row=__rows.find(x=>x.id===args.p_absence_id);row.status=args.p_decision==='REJECT'?'Abgelehnt':row.absence_type==='Krank'?'Erfasst':'Genehmigt';row.review_note=args.p_review_note;row.reviewed_at=new Date().toISOString();return {data:row.status};}return {data:[]};}},hydrateEmployee:async()=>{__portalRefresh++;if(SFBackend.client.__sfDemoLocalClientV1)SFBackend.employeePortalData={...SFBackend.employeePortalData,absences:__demoRows};},hydrate:async()=>{},confirmSignOut:async()=>{}};
`;
const fullHtml=fs.readFileSync(path.join(root,'index.html'),'utf8');
const html='<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><link rel="stylesheet" href="/assets/employee-shifts-month-v1.css"></head><body><section id="view-absence" class="active" style="display:none"><div class="page-head"></div><div class="absence-manage-card"></div></section><script>'+fixture+'</script>'+scripts.map(s=>'<script src="/assets/'+s+'"></script>').join('')+'<script>SFBackend.openEmployeePortal()</script></body></html>';
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.SF_QA_CHROMIUM?{executablePath:process.env.SF_QA_CHROMIUM}:{})});try{
for(const fullApp of [false,true]){
for(const [name,viewport] of [['desktop',{width:1560,height:1050}],['mobile',{width:390,height:844}],['small-mobile',{width:360,height:780}]]){
const page=await browser.newPage({viewport,locale:'de-DE'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-10-01T22:30:00Z'));
await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='sf.test')return route.abort();const pathname=new URL(route.request().url()).pathname;if(pathname==='/')return route.fulfill({contentType:'text/html',body:fullApp?fullHtml:html});const p=path.join(root,pathname);try{return route.fulfill({contentType:p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':'image/svg+xml',body:fs.readFileSync(p)})}catch{return route.fulfill({status:404,body:''})}});
await page.goto('http://sf.test/');if(fullApp){await page.waitForFunction(()=>SFBackend.__loaderInitStarted);await page.waitForTimeout(300);await page.evaluate(fixture.replace('window.SFBackend={','Object.assign(window.SFBackend,{').replace(/confirmSignOut:async\(\)=>\{\}\};/,'confirmSignOut:async()=>{}});'));await page.evaluate(()=>{SFBackend.closeAuth?.();SFBackend.hideLoading?.();SFBackend.openEmployeePortal();SFBackend.employeePortalNavigate('absences')});}const area=page.locator('#sfEmployeeAbsenceCard'),modal=page.locator('#sfAbsenceEmployeeV3Modal');await area.waitFor();await page.waitForTimeout(1200);if(fullApp)await page.evaluate(()=>SFBackend.employeePortalNavigate('absences'));await area.waitFor();assert.equal(await area.isVisible(),true);assert.match(await area.locator('.sf-empty').textContent(),/noch leer/);assert.equal(await area.locator('[data-absence-category]').count(),5);

// A settled workspace must keep cards attached: competing legacy layout
// observers used to move every card out and back on every animation frame.
const cardMoves=await page.evaluate(()=>new Promise(resolve=>{
  const card=document.getElementById('sfEmployeeAbsenceCard');let removals=0;
  const observer=new MutationObserver(records=>records.forEach(record=>{
    if([...record.removedNodes].includes(card))removals++;
  }));
  observer.observe(document.getElementById('sfEmployeePortal'),{childList:true,subtree:true});
  setTimeout(()=>{observer.disconnect();resolve(removals)},250);
}));
assert.equal(cardMoves,0,'Settled portal cards must not be detached by competing layouts');

// A background refresh must not remove a pressed request button before mouseup.
await area.locator('[data-absence-category="Urlaub"] b').scrollIntoViewIfNeeded();
const pressedRequest=await area.locator('[data-absence-category="Urlaub"] b').boundingBox();
await page.mouse.move(pressedRequest.x+pressedRequest.width/2,pressedRequest.y+pressedRequest.height/2);
await page.mouse.down();
await page.evaluate(()=>SFBackend.refreshEmployeeAbsences());
await page.mouse.up();
await modal.waitFor({timeout:1500});
assert.equal(await modal.locator('#sfAe3Type').inputValue(),'Urlaub','Refresh during a mouse press must keep the request clickable');
await modal.locator('#sfAe3Cancel').click();

// Closing one dialog must not redirect focus after a new dialog has opened.
await area.locator('[data-absence-category="Urlaub"]').click();await modal.waitFor();
await modal.locator('#sfAe3Cancel').click();
await area.locator('[data-absence-category="Krank"]').click();await modal.waitFor();
await page.waitForFunction(()=>document.activeElement?.id==='sfAe3Type');
await page.waitForTimeout(120);
assert.equal(await page.evaluate(()=>document.activeElement?.id),'sfAe3Type','Previous dialog callbacks must leave focus inside the new form');
await modal.locator('#sfAe3Cancel').click();

if(fullApp){
  // Echte Menübedienung statt direktem Navigate-Aufruf: Overlay und inert prüfen.
  const original=page.viewportSize();
  await page.setViewportSize({width:390,height:844});
  const more=page.locator('#sfEmployeeMobileDock [data-sf-mobile-more]'),sheet=page.locator('#sfEmployeeMobileMore');
  await more.click();await sheet.waitFor();await page.waitForFunction(()=>document.querySelector('.sf-portal-main').inert);
  await sheet.locator('[data-sf-employee-view="absences"]').click();
  await page.waitForFunction(()=>!document.querySelector('.sf-portal-main').inert);await area.waitFor();
  await more.click();await page.waitForFunction(()=>document.querySelector('.sf-portal-main').inert);
  await page.setViewportSize({width:1440,height:1000});
  await page.waitForFunction(()=>!document.querySelector('.sf-portal-main').inert);
  assert.equal(await sheet.evaluate(el=>el.classList.contains('open')),false,'Hidden mobile menu must release its background lock');
  assert.equal(await sheet.getAttribute('aria-hidden'),'true');
  for(const type of ['Urlaub','Sonderurlaub','Krank','Kind Krank','Home-Office']){
    await area.locator('[data-absence-category="'+type+'"] b').click();await modal.waitFor();
    assert.equal(await modal.locator('#sfAe3Type').inputValue(),type);await modal.locator('#sfAe3Cancel').click();
    // Reopen immediately; a closing dialog must not steal the new dialog's focus.
  }
  await area.locator('.sf-ae3-add').click();await modal.waitFor();await modal.locator('#sfAe3Cancel').click();await page.waitForTimeout(100);
  await page.setViewportSize({width:390,height:844});await more.click();
  await page.waitForFunction(()=>document.querySelector('.sf-portal-main').inert);
  await sheet.evaluate(el=>el.remove());
  await page.waitForFunction(()=>!document.querySelector('.sf-portal-main').inert);
  assert.equal(await page.locator('#sfEmployeePortal').evaluate(el=>el.classList.contains('sf-mobile-sheet-open')),false,'Removing a menu must release its background lock');
  await page.setViewportSize(original);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}

await area.locator('.sf-ae3-add').click();await modal.waitFor();assert.deepEqual(await modal.locator('#sfAe3Type option').allTextContents(),['Urlaub','Sonderurlaub','Krank','Kind Krank','Home-Office']);assert.equal(await modal.locator('#sfAe3From').inputValue(),'2026-10-02','Company timezone default date');assert.equal(await modal.locator('#sfAe3To').inputValue(),'2026-10-02');await page.waitForFunction(()=>document.activeElement?.id==='sfAe3Type');await page.keyboard.press('Escape');assert.equal(await modal.count(),0);assert.equal(await page.evaluate(()=>__calls.length),0);
await page.evaluate(()=>SFBackend.openEmployeePortal());await page.waitForTimeout(750);await area.locator('[data-absence-category="Home-Office"] b').click();assert.equal(await modal.locator('#sfAe3Type').inputValue(),'Home-Office','Child element click opens prefilled request');await modal.locator('#sfAe3Cancel').click();assert.equal(await page.evaluate(()=>__calls.length),0);
await page.evaluate(async()=>{__rows=testAbsences();await SFBackend.refreshEmployeeAbsences()});assert.equal(await area.locator('[data-absence-count="pending"]').textContent(),'7');assert.equal(await area.locator('[data-absence-count="confirmed"]').textContent(),'5');assert.equal(await area.locator('[data-absence-count="all"]').textContent(),'16');assert.equal(await area.locator('.sf-ae3-row').count(),10);await area.locator('[data-absence-more]').click();assert.equal(await area.locator('.sf-ae3-row').count(),16);assert.equal(await area.locator('[data-absence-id="foreign"]').count(),0);assert.equal(await page.evaluate(()=>__xss),false);assert.equal(await area.locator('.sf-ae3-note img').count(),0);assert.equal(await page.locator('[data-count-for="absences"]').first().textContent(),'16');
await page.evaluate(()=>document.querySelector('.sf-portal-main').scrollTop=0);await page.screenshot({path:path.join(output,'employee-absences-'+name+'.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await area.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
await area.locator('[data-absence-filter="rejected"]').click();assert.equal(await area.locator('.sf-ae3-row').count(),4);assert.match(await area.locator('.sf-ae3-feedback').first().textContent(),/Bitte anderen Zeitraum/);await area.locator('#sfEmployeeAbsenceFilter').selectOption('Fortbildung');assert.equal(await area.locator('.sf-ae3-row').count(),0);await area.locator('[data-absence-reset]').click();assert.equal(await page.locator('[data-count-for="absences"]').first().textContent(),'16');
await area.locator('.sf-ae3-add').click();await modal.locator('#sfAe3From').fill('2026-12-05');await modal.locator('#sfAe3To').fill('2026-12-04');await modal.locator('#sfAe3Submit').click();assert.match(await modal.locator('#sfAe3Msg').textContent(),/Enddatum darf nicht/);assert.equal(await page.evaluate(()=>__calls.length),0);await modal.locator('#sfAe3To').fill('2026-12-07');assert.match(await modal.locator('#sfAe3Duration').textContent(),/3 Kalendertage/);await modal.locator('#sfAe3Note').fill('Optionaler Kommentar');await page.screenshot({path:path.join(output,'employee-absence-form-'+name+'.png')});assert.equal(await modal.locator('.sf-ae3-card').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
await page.evaluate(()=>__failSubmit=true);await modal.locator('#sfAe3Submit').click();assert.match(await modal.locator('#sfAe3Msg').textContent(),/bereits eine Abwesenheit/);assert.equal(await modal.locator('#sfAe3Note').inputValue(),'Optionaler Kommentar');assert.equal(await modal.locator('#sfAe3Submit').isDisabled(),false);await page.evaluate(()=>{__failSubmit=false;__rpcDelay=160});await modal.locator('#sfAe3Submit').click();assert.equal(await modal.locator('#sfAe3Submit').isDisabled(),true);await modal.waitFor({state:'detached'});await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>__calls.length),2,'One failed write plus one successful write');assert.deepEqual(await page.evaluate(()=>__calls.at(-1)),{name:'employee_submit_absence_request',args:{p_absence_type:'Urlaub',p_start_date:'2026-12-05',p_end_date:'2026-12-07',p_note:'Optionaler Kommentar',p_full_day:true,p_start_time:null,p_end_time:null,p_time_note:''}});assert.match(await area.locator('.sf-ae3-success').textContent(),/eingereicht/);assert.equal(await area.locator('[data-absence-filter="pending"]').getAttribute('aria-pressed'),'true');assert.equal(await area.locator('[data-absence-count="pending"]').textContent(),'8');assert.equal(await area.isVisible(),true);
await page.evaluate(()=>__rpcDelay=0);
for(const [i,type] of ['Sonderurlaub','Krank','Kind Krank','Home-Office'].entries()){await area.locator(`[data-absence-category="${type}"]`).click();assert.equal(await modal.locator('#sfAe3Type').inputValue(),type);await modal.locator('#sfAe3From').fill('2027-01-'+String(i+1).padStart(2,'0'));await modal.locator('#sfAe3To').fill('2027-01-'+String(i+1).padStart(2,'0'));await modal.locator('#sfAe3Submit').click();await modal.waitFor({state:'detached'});await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>__calls.at(-1).args.p_absence_type),type);assert.equal(await page.evaluate(()=>__calls.at(-1).args.p_note),'');}
assert.equal(await area.locator('[data-absence-count="pending"]').textContent(),'12');assert.equal(await area.locator('[data-absence-count="all"]').textContent(),'21');
await page.evaluate(async()=>{__failLoad=true;await SFBackend.refreshEmployeeAbsences()});assert.match(await area.locator('.sf-ae3-load-error').textContent(),/zuletzt geladene Stand/);assert.equal(await area.locator('[data-absence-count="all"]').textContent(),'21');await page.evaluate(()=>__failLoad=false);await area.locator('.sf-ae3-load-error [data-absence-refresh]').click();await area.locator('.sf-ae3-load-error').waitFor({state:'detached'});
await page.evaluate(async()=>{SFBackend.role='PLANNER';SFBackend.user={id:'planner-user'};SFBackend.restoreNonEmployeeShell?.();document.getElementById('appShell')?.style.setProperty('display','block');document.getElementById('sfEmployeePortal').remove();document.getElementById('view-absence').style.display='block';await SFBackend.renderAbsenceManagerV2()});const managers=page.locator('#sfAbsenceManagerV2');await managers.waitFor();assert.equal(await managers.locator('.sf-abs-mgr-v2-row').count(),13);const submitted=managers.locator('[data-id="submitted-6"]');assert.match(await submitted.textContent(),/Home-Office/);await submitted.locator('[data-decision="APPROVE"]').click();await page.locator('#sfAbsMgrV2Note').fill('Home-Office ist genehmigt.');await page.locator('#sfAbsMgrV2Submit').click();await page.locator('#sfAbsMgrV2Modal').waitFor({state:'detached'});await page.waitForTimeout(200);assert.deepEqual(await page.evaluate(()=>__calls.at(-1)),{name:'manager_review_absence_request',args:{p_absence_id:'submitted-6',p_decision:'APPROVE',p_review_note:'Home-Office ist genehmigt.'}});
await page.evaluate(()=>{SFBackend.role='EMPLOYEE';SFBackend.user={id:'employee-user'};document.getElementById('view-absence').style.display='none';SFBackend.openEmployeePortal()});await area.waitFor();await page.evaluate(()=>SFBackend.refreshEmployeeAbsences());await area.locator('[data-absence-filter="confirmed"]').click();assert.match(await area.locator('[data-absence-id="submitted-6"] .sf-ae3-feedback').textContent(),/Home-Office ist genehmigt/);
await page.evaluate(async()=>{__delay=250;const pending=SFBackend.refreshEmployeeAbsences();SFBackend.user={id:'other-user'};SFBackend.employeeDbId='employee-2';SFBackend.employeePortalData={...SFBackend.employeePortalData,employee:{...SFBackend.employeePortalData.employee,id:'employee-2'},absences:[]};SFBackend.renderEmployeeAbsencesV3();await pending;});assert.equal(await area.locator('.sf-ae3-row').count(),0);assert.equal(await area.locator('[data-absence-count="all"]').textContent(),'0');assert.equal(await area.locator('[data-absence-filter="all"]').getAttribute('aria-pressed'),'true');assert.equal(await page.evaluate(()=>__blockedRequests),0,'Request buttons must run before competing document handlers');assert.deepEqual(errors,[]);console.log(JSON.stringify({name,fullApp,passed:true}));await page.close();
}
}}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
