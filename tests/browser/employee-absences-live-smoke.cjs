// Prüft veröffentlichte Assets und echte Portal-Handler mit synthetischen Mitarbeiterdaten.
// Alle Datenzugriffe sind lokal ersetzt; es werden keine Anträge in Produktion gespeichert.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');
const output=path.resolve(__dirname,'../../test-results/employee-absences');fs.mkdirSync(output,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'de-DE'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://www.schichtfunk.de/',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.SFBackend?.__loaderInitStarted,null,{timeout:30000});
  await page.locator('#sfAuthBackdrop').waitFor({timeout:30000});
  await page.evaluate(()=>{
    const B=window.SFBackend;
    const q={select:()=>q,eq:()=>q,order:()=>Promise.resolve({data:[]}),maybeSingle:async()=>({data:null}),then:resolve=>Promise.resolve({data:[]}).then(resolve)};
    Object.assign(B,{ready:true,role:'EMPLOYEE',user:{id:'qa-local-user'},companyId:'qa-local-company',employeeDbId:'qa-local-employee',companyTimeZone:'Europe/Berlin',client:{from:()=>q,rpc:async()=>({data:[]}),auth:{signOut:async()=>({})}},hydrateEmployee:async()=>{}});
    B.employeePortalData={employee:{id:'qa-local-employee',first_name:'Browser',last_name:'Prüfung',personnel_no:'QA',email:'qa@example.invalid',weekly_hours:40,employment:'Vollzeit',work_time_model:'SHIFT',shift_permissions:['FD']},company:{name:'Funktionsprüfung',timezone:'Europe/Berlin'},templates:[],shifts:[],absences:[],requests:[],approvals:[],timeEntries:[]};
    B.closeAuth?.();B.hideLoading?.();B.openEmployeePortal();B.employeePortalNavigate('absences');
  });
  const area=page.locator('#sfEmployeeAbsenceCard'),modal=page.locator('#sfAbsenceEmployeeV3Modal');await area.waitFor();
  const sheetGuard=await page.evaluate(()=>[...document.scripts].some(s=>s.src.includes('employee-mobile-pwa-polish-v2.js?v=20261002-sheetguard1')));
  if(sheetGuard){
    await page.setViewportSize({width:390,height:844});
    const more=page.locator('#sfEmployeeMobileDock [data-sf-mobile-more]');await more.click();
    await page.waitForFunction(()=>document.querySelector('.sf-portal-main').inert);
    await page.setViewportSize({width:1440,height:1000});
    await page.waitForFunction(()=>!document.querySelector('.sf-portal-main').inert);
    assert.equal(await page.locator('#sfEmployeeMobileMore').evaluate(el=>el.classList.contains('open')),false);
  }
  for(const type of ['Urlaub','Sonderurlaub','Krank','Kind Krank','Home-Office']){
    await area.locator(`[data-absence-category="${type}"] b`).click();await modal.waitFor();assert.equal(await modal.locator('#sfAe3Type').inputValue(),type);assert.equal(await modal.isVisible(),true);await modal.locator('#sfAe3Cancel').click();await modal.waitFor({state:'detached'});
  }
  await area.locator('.sf-ae3-add').click();await modal.waitFor();assert.equal(await modal.isVisible(),true);
  await page.screenshot({path:path.join(output,'live-primary-dialog.png')});
  console.log(JSON.stringify({url:page.url(),categories:5,requestButton:true,sheetGuard,errors}));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
