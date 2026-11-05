const {chromium}=require('playwright');
const fs=require('fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('https://qa.example.test/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<html><body><div id="sfEntryOverlay"><span id="sfEntryStatus"></span><span id="sfEntryBar"></span><span id="sfEntryCounter"></span><p id="sfEntryWarning" hidden></p><button id="sfEntrySkip"></button><div id="sfEntryLoginSlot"></div></div></body></html>'}));
 await page.goto('https://qa.example.test/?bereich=mitarbeiter');
 await page.evaluate(()=>{
  const opts=[{company_id:'a',company_name:'Unternehmen A',employee_id:'ea'},{company_id:'b',company_name:'Unternehmen B',employee_id:'eb'}];
  window.SFBackend={user:{id:'test-user'},ready:false,ensureCompany:async()=>{},hydrateEmployee:async()=>{},openEmployeePortal:()=>{},client:{
   from:name=>({select:()=>({eq:async()=>({data:name==='company_members'?[]:[{id:'ea'},{id:'eb'}]})})}),
   rpc:async(name,args)=>name==='qa_employee_company_options'?{data:opts}:{data:{company:{id:args.p_company,name:'Unternehmen '+args.p_company.toUpperCase()},employee:{id:'e'+args.p_company,first_name:'Test',last_name:'Person',personnel_no:'PN-'+args.p_company}}},auth:{signOut:async()=>({error:null})}
  }};
 });
 await page.addScriptTag({content:fs.readFileSync('assets/qa-employee-multi-switch.js','utf8')});
 await page.addScriptTag({content:fs.readFileSync('assets/sf-entry-v2.js','utf8')});
 assert.equal(await page.locator('#sfEntryOverlay').count(),1);
 await page.evaluate(async()=>{await SFBackend.ensureCompany();await SFBackend.hydrateEmployee();SFBackend.ready=true;SFBackend.openEmployeePortal()});
 await page.locator('#sfEntryOverlay').waitFor({state:'detached',timeout:5000});
 assert.equal(await page.locator('#qaCompanyName').textContent(),'Unternehmen A');
 await page.locator('#qaCompany').selectOption('b');await page.getByText('Unternehmen gewechselt.').waitFor();
 assert.equal(await page.locator('#qaPersonnel').textContent(),'PN-b');
 await browser.close();console.log('PASS: ready employee portal dismisses 3/4 entry overlay and allows company switch');
})().catch(e=>{console.error(e);process.exitCode=1});

