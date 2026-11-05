const {chromium}=require('playwright');
const fs=require('fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route('https://qa.example.test/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'}));
 await page.goto('https://qa.example.test/?bereich=mitarbeiter');
 await page.evaluate(()=>{
  window.__options=[{company_id:'a',company_name:'Unternehmen A',employee_id:'ea'},{company_id:'b',company_name:'Unternehmen B',employee_id:'eb'}];
  window.__fault='';window.__calls=[];window.__baseline=0;
  window.SFBackend={user:{id:'u1'},ensureCompany:async()=>{window.__baseline++},hydrateEmployee:async()=>{},openEmployeePortal:()=>{},client:{
   from:name=>({select:()=>({eq:async()=>({data:name==='company_members'?[]:[{id:'ea'},{id:'eb'}]})})}),
   rpc:async(name,args)=>{window.__calls.push({name,args});if(name==='qa_employee_company_options')return {data:window.__options};if(name==='qa_employee_profile_scoped')return window.__fault===args.p_company?{error:{message:'Kein Zugriff'}}:{data:{company:{id:args.p_company,name:'Unternehmen '+args.p_company.toUpperCase()},employee:{id:'e'+args.p_company,first_name:'Test',last_name:args.p_company.toUpperCase(),personnel_no:'PN-'+args.p_company}}};return {error:{message:'Unexpected call'}}},
   auth:{signOut:async()=>({error:null})}
  }};
 });
 await page.addScriptTag({content:fs.readFileSync('assets/qa-employee-multi-switch.js','utf8')});
 await page.evaluate(async()=>{await SFBackend.ensureCompany();await SFBackend.hydrateEmployee();SFBackend.openEmployeePortal()});
 assert.equal(await page.locator('#qaCompanyName').textContent(),'Unternehmen A');
 assert.equal(await page.locator('#qaPersonnel').textContent(),'PN-a');
 await page.locator('#qaCompany').selectOption('b');
 await page.getByText('Unternehmen gewechselt.').waitFor();
 assert.equal(await page.locator('#qaCompanyName').textContent(),'Unternehmen B');
 assert.equal(await page.locator('#qaPersonnel').textContent(),'PN-b');
 assert.deepEqual(await page.evaluate(()=>[SFBackend.companyId,SFBackend.employeeDbId]),['b','eb']);
 await page.evaluate(()=>{window.__fault='a'});
 await page.locator('#qaCompany').selectOption('a');
 await page.getByText('Kein Zugriff').waitFor();
 assert.deepEqual(await page.evaluate(()=>[SFBackend.companyId,SFBackend.employeeDbId]),['b','eb']);
 assert.equal(await page.locator('#qaCompany').inputValue(),'b');
 await page.evaluate(()=>{window.__fault='';window.__options=[window.__options[0]]});
 await page.evaluate(async()=>{await SFBackend.ensureCompany();await SFBackend.hydrateEmployee();SFBackend.openEmployeePortal()});
 assert.equal(await page.locator('#qaCompanyName').textContent(),'Unternehmen A');
 assert.equal(await page.locator('#qaCompany option').count(),1);
 await page.evaluate(()=>{window.__options=[]});
 const blocked=await page.evaluate(async()=>{try{await SFBackend.ensureCompany();return false}catch(e){return e.code==='employee_portal_disabled'}});
 assert.equal(blocked,true);
 assert.equal(await page.evaluate(()=>window.__baseline),0);
 await page.evaluate(()=>{window.SFBackend.client.from=name=>({select:()=>({eq:async()=>({data:name==='company_members'?[]:[{id:'ea'}]})})})});
 await page.evaluate(()=>SFBackend.ensureCompany());
 assert.equal(await page.evaluate(()=>window.__baseline),1);
 await browser.close();console.log('PASS: multi-profile login, company switch, failure rollback, revoked access and mobile viewport');
})().catch(e=>{console.error(e);process.exitCode=1});

