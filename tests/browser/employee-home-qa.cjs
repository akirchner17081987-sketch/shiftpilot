const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'../..'),out=path.join(root,'test-results/employee-home');fs.mkdirSync(out,{recursive:true});
const base=fs.readFileSync(path.join(__dirname,'employee-absences-qa.cjs'),'utf8').match(/const fixture=String.raw`([\s\S]*?)`;/)[1].replace('order:()=>run(),then:','in:()=>q,order:()=>run(),then:');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const extra=String.raw`
window.__homeCalls=0;window.__homeFail=false;window.__homeDelay=0;window.__scans=0;window.__notices=0;
window.__homePayload={employee_id:'employee-1',company_id:'test-company',timezone:'Europe/Berlin',as_of:'2026-10-31T23:30:00Z',next_shift:{id:'next',shift_code:'O3',name:'Nachtdienst',starts_at:'2026-11-01T01:00:00Z',ends_at:'2026-11-01T09:00:00Z',site_name:'VOC EAST',site_address:'Teststraße 10'},qr:{id:'qr',state:'BREAK',started_at:'2026-10-31T21:00:00Z',terminal_name:'VOC EAST',location_note:'Haupteingang',attendance_seconds:9000,pause_seconds:1800},tasks:{changes:2,replacements:1,feedback:3}};
SFBackend.employeePortalData.shifts=[{...__homePayload.next_shift,employee_id:'employee-1',status:'PUBLISHED',published_at:'2026-10-01T12:00:00Z'}];
const homeOldRpc=SFBackend.client.rpc;SFBackend.client.rpc=async(name,args)=>{if(name!=='employee_home_summary')return homeOldRpc(name,args);__homeCalls++;const payload=JSON.parse(JSON.stringify(__homePayload)),fail=__homeFail;await new Promise(r=>setTimeout(r,__homeDelay));return fail?{error:{message:'Synthetic outage'}}:{data:payload}};
SFBackend.notifications={open:()=>__notices++};
`;
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.SF_QA_CHROMIUM||chromium.executablePath()});try{
 for(const [name,viewport,theme] of [['desktop',{width:1440,height:1000},'dark'],['desktop-light',{width:1440,height:1000},'light'],['mobile',{width:390,height:844},'dark'],['small-mobile-light',{width:360,height:780},'light']]){
  const page=await browser.newPage({viewport,locale:'de-DE'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-10-31T23:30:00Z'));
  await page.addInitScript(t=>localStorage.setItem('schichtfunk-manager-theme',t),theme);
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='sf.test')return route.abort();if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:html});try{const p=path.join(root,u.pathname);return route.fulfill({contentType:p.endsWith('.js')||p.endsWith('.mjs')?'application/javascript':p.endsWith('.css')?'text/css':p.endsWith('.png')?'image/png':'image/svg+xml',body:fs.readFileSync(p)})}catch{return route.fulfill({status:404,body:''})}});
  await page.goto('http://sf.test/');await page.waitForFunction(()=>window.SFBackend?.__loaderInitStarted);await page.waitForTimeout(500);
  await page.evaluate(base.replace('window.SFBackend={','Object.assign(window.SFBackend,{').replace(/confirmSignOut:async\(\)=>\{\}\};/,'confirmSignOut:async()=>{}});')+extra);
  await page.evaluate(()=>{SFBackend.closeAuth?.();SFBackend.hideLoading?.();SFBackend.openEmployeePortal();SFBackend.employeePortalNavigate('dashboard')});
  const home=page.locator('#sfEmployeeHome');await home.getByText('Nachtdienst',{exact:true}).waitFor();await page.waitForTimeout(1700);await page.evaluate(()=>{SFBackend.closeAuth?.();SFBackend.hideLoading?.();document.getElementById('sfEntryOverlay')?.remove()});
  assert.equal(await home.locator('.sf-home-shortcuts button').count(),4);assert.equal(await page.locator('.sf-employee-tiles').isVisible(),false);assert.equal(await page.locator('#sfEmployeeQrStatus').isVisible(),false);
  assert.match(await home.locator('.sf-home-next').textContent(),/VOC EAST/);assert.match(await home.locator('.sf-home-next').textContent(),/Beginn in 1 Std. 30 Min./);assert.match(await home.locator('[data-home-attendance]').textContent(),/2 Std. 30 Min./);assert.match(await home.locator('[data-home-pause]').textContent(),/0 Std. 30 Min./);
  assert.equal(await home.locator('.sf-home-task-list button').count(),3);
  await page.screenshot({path:path.join(out,name+'.png'),fullPage:false});
  assert.equal(await home.evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  // The details action must open the next duty's month, even after an older saved selection.
  await page.evaluate(()=>{sessionStorage.setItem('sfMyShiftsMonth:employee-user:test-company:employee-1',JSON.stringify({month:'2027-02',view:'list'}))});await home.locator('[data-home-details]').click();await page.locator('#sfMyShiftMonth').waitFor();assert.equal(await page.locator('#sfMyShiftMonth').inputValue(),'2026-11');
  await page.evaluate(()=>SFBackend.employeePortalNavigate('dashboard'));await home.getByText('Nachtdienst',{exact:true}).waitFor();
  await home.locator('[data-home-view="notifications"]').click();assert.equal(await page.evaluate(()=>__notices),1);
  const calls=await page.evaluate(()=>__homeCalls);await page.waitForTimeout(1200);assert.equal(await page.evaluate(()=>__homeCalls),calls);
  // A server-confirmed pause ends: attendance continues while closed pause totals stay fixed.
  await page.evaluate(()=>{__homePayload.qr.state='RUNNING';__homePayload.qr.pause_seconds=2100;__homePayload.tasks={changes:0,replacements:0,feedback:0};SFEmployeeHome.refresh()});await home.getByText('Im Dienst',{exact:true}).waitFor();assert.equal(await home.getByText('Alles erledigt',{exact:true}).isVisible(),true);assert.equal(await home.locator('.sf-home-task-list').count(),0);
  await page.evaluate(()=>{__homeFail=true;SFEmployeeHome.refresh()});await home.getByText(/Aktualisierung fehlgeschlagen/).waitFor();assert.match(await home.textContent(),/Nachtdienst/);
  // No open QR record means no fabricated attendance, and the existing scanner remains the action.
  await page.evaluate(()=>{__homeFail=false;__homePayload.qr=null;document.getElementById('sfEmployeeQrStatus').querySelector('[data-sf-qr-scan]')?.remove();const button=document.createElement('button');button.dataset.sfQrScan='';button.onclick=()=>window.__scans++;document.getElementById('sfEmployeeQrStatus').append(button);SFEmployeeHome.refresh()});await home.getByText('Keine laufende QR-Buchung',{exact:true}).waitFor();await home.locator('[data-home-scan]').click();assert.equal(await page.evaluate(()=>__scans),1);
  // Ignore a delayed response after switching company, even when both memberships share a login.
  await page.evaluate(()=>{__homeDelay=300;SFEmployeeHome.refresh();SFBackend.companyId='second';SFBackend.employeeDbId='employee-2';SFBackend.employeePortalData.employee.id='employee-2';SFBackend.employeePortalData.company.id='second';__homePayload={employee_id:'employee-2',company_id:'second',as_of:'2026-10-31T23:30:00Z',timezone:'Europe/Vienna',next_shift:null,qr:null,tasks:{changes:0,replacements:0,feedback:0}};__homeDelay=0;SFEmployeeHome.refresh()});await home.getByText('Noch kein weiterer Dienst freigegeben',{exact:true}).waitFor();await page.waitForTimeout(500);assert.equal(await home.getByText('Nachtdienst',{exact:true}).count(),0);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({name,passed:true}));await page.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
