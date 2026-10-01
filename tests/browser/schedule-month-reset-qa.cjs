const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.SF_PLAYWRIGHT_PATH||(process.platform==='win32'?'C:/Users/lhz_d/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright':'@playwright/test'));
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const fixture=`
window.__errors=[];addEventListener('error',e=>__errors.push(e.message));addEventListener('unhandledrejection',e=>__errors.push(String(e.reason)));
let assignments=[{id:'nov',date:'2026-11-30'},{id:'dec',date:'2026-12-01'},{id:'jan',date:'2027-01-01'}];let autoPlanPreview=[{date:'2026-12-15'}],autoPlanAnalyzed=true,autoPlanApplied=4;
window.__period={mode:'week',start:'2026-11-30',end:'2026-12-06'};window.SchichtFunkCalendarView={getPeriod:()=>__period};
window.__calls=[];window.__deleted=[];window.__preview={monthStart:'2026-12-01',monthEnd:'2026-12-31',total:3,draft:1,published:2,canDelete:true};window.__fail=false;window.__hold=false;
window.showSaveToast=(...args)=>window.__toast=args;window.renderCalendar=window.renderPlanEmployeePool=window.renderOverview=window.updateStats=()=>{};
window.SFBackend={ready:true,role:'OWNER',companyId:'company-a',companyName:'Fiktives Testunternehmen',sync:async()=>{},hydrate:async()=>{},client:{rpc:async(name,args)=>{
 __calls.push({name,args});if(name==='preview_schedule_month_reset')return {data:{...__preview}};
 if(name==='reset_company_schedule_month'){if(__fail)return {error:{message:'Monat wurde inzwischen abgeschlossen'}};if(__hold)await new Promise(r=>window.__release=r);__deleted.push(args);return {data:{deletedAssignments:3}};}
 throw Error('Unexpected RPC: '+name);
}},bindAccessibleModal(back,{initialFocus}={}){const opener=document.activeElement;const close=()=>{back.remove();opener?.focus()};back.addEventListener('keydown',e=>{if(e.key==='Escape')close()});back.querySelector(initialFocus||'button')?.focus();return close;}};
`;
async function run(){
 const browser=await chromium.launch({headless:true,...(process.env.SF_CHROME_PATH?{executablePath:process.env.SF_CHROME_PATH}:{})});const results=[];
 try{for(const [name,width,height,theme] of [['desktop-dark',1280,900,'dark'],['desktop-light',1280,900,'light'],['mobile',390,844,'light']]){
  const context=await browser.newContext({viewport:{width,height},locale:'de-DE',timezoneId:'Europe/Berlin'}),page=await context.newPage();
  await page.route('http://sf.test/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html data-sf-theme="${theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><section id="view-schedule" class="view active"><div class="cal-toolbar"></div></section></body></html>`}));
  await page.goto('http://sf.test/');await page.addStyleTag({content:'*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}'});await page.addScriptTag({content:fixture});await page.addScriptTag({content:read('assets/supabase-schedule-reset-v1.js')});
  const button=page.locator('#sfDeleteScheduleMonthBtn');await button.waitFor();assert.equal(await button.isDisabled(),true,'Week view cannot implicitly select a month');
  await page.evaluate(()=>{__period={mode:'month',start:'2026-12-01',end:'2026-12-31'};document.dispatchEvent(new Event('sf:schedule-period-changed'))});
  await button.click();const dialog=page.getByRole('dialog');await dialog.waitFor();assert.match(await dialog.textContent(),/Dezember 2026 löschen/);
  assert.equal(await page.evaluate(()=>__deleted.length),0,'Opening preview must not delete');await page.locator('#sfResetConfirm').fill('LÖSCHEN');assert.equal(await page.locator('#sfResetSubmit').isDisabled(),true,'Generic confirmation denied');
  await page.locator('#sfResetConfirm').fill('LÖSCHEN 2026-11');assert.equal(await page.locator('#sfResetSubmit').isDisabled(),true,'Wrong month denied');
  await page.locator('#sfResetConfirm').fill('LÖSCHEN 2026-12');assert.equal(await page.locator('#sfResetSubmit').isEnabled(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'No horizontal overflow');
  const bounds=await dialog.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width,'Entire dialog fits the viewport');
  await dialog.evaluate(el=>{el.scrollTop=0});
  fs.mkdirSync(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results','month-reset-'+name+'.png'),fullPage:true});
  await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>__deleted.length),0,'Escape does not delete');
  await button.click();await page.locator('#sfResetConfirm').fill('LÖSCHEN 2026-12');await page.evaluate(()=>__fail=true);await page.locator('#sfResetSubmit').click();await page.locator('#sfResetMsg.show').waitFor();assert.match(await page.locator('#sfResetMsg').textContent(),/inzwischen abgeschlossen/);assert.equal(await page.evaluate(()=>__deleted.length),0);
  await page.evaluate(()=>{__fail=false;__hold=true});await page.locator('#sfResetSubmit').click();await page.waitForFunction(()=>!!window.__release);
  await page.keyboard.press('Escape');assert.equal(await dialog.count(),1,'Saving dialog cannot be escaped');assert.equal(await page.locator('#sfResetCancel').isDisabled(),true);assert.equal(await page.evaluate(()=>SFBackend.scheduleResetting),true);
  await page.evaluate(()=>__release());await dialog.waitFor({state:'detached'});const deleted=await page.evaluate(()=>__deleted);assert.deepEqual(deleted,[{p_company_id:'company-a',p_month:'2026-12-01',p_confirmation:'LÖSCHEN 2026-12'}]);
  assert.deepEqual(await page.evaluate(()=>assignments.map(a=>a.id)),['nov','jan'],'Other months stay locally intact');assert.equal(await page.evaluate(()=>autoPlanPreview.length),0,'Invalid preview removed');
  await page.evaluate(()=>{__preview.closed=true;__preview.canDelete=false});await button.click();await dialog.waitFor();assert.match(await dialog.textContent(),/abgeschlossen/);assert.equal(await page.locator('#sfResetConfirm').count(),0);assert.equal(await page.locator('#sfResetSubmit').isDisabled(),true);await page.locator('#sfResetCancel').click();
  await page.evaluate(()=>{__preview.closed=false;__preview.recordedTimeEntries=1});await button.click();await dialog.waitFor();assert.match(await dialog.textContent(),/erfasste Arbeitszeiten/);await page.locator('#sfResetCancel').click();
  await page.evaluate(()=>{__preview.recordedTimeEntries=0;__preview.canDelete=true;__hold=false});await button.click();await page.locator('#sfResetConfirm').fill('LÖSCHEN 2026-12');await page.evaluate(()=>SFBackend.companyId='company-b');await page.locator('#sfResetSubmit').click();await page.locator('#sfResetMsg.show').waitFor();assert.equal(await page.evaluate(()=>__deleted.length),1,'Changed company cannot delete stale selection');
  assert.deepEqual(await page.evaluate(()=>__errors),[]);results.push({name,passed:true});await context.close();
 }}finally{await browser.close()}
 console.log(JSON.stringify({browser_checks:results}));
}
run().catch(e=>{console.error(e);process.exitCode=1});
