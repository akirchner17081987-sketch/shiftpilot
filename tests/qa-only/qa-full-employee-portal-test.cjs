const {chromium}=require('@playwright/test');const fs=require('fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROME_PATH||undefined,args:['--no-sandbox']});const page=await browser.newPage();page.setDefaultTimeout(4000);
 await page.route('https://qa.example.test/**',r=>r.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'}));await page.goto('https://qa.example.test/?bereich=mitarbeiter&qa_vollportal=1');
 await page.evaluate(()=>{
  window.__calls=[];window.__fail='';window.__opts=[{company_id:'a',company_name:'Firma A',employee_id:'ea'},{company_id:'b',company_name:'Firma B',employee_id:'eb'}];
  window.SFBackend={user:{id:'u'},ensureCompany:async()=>{},hydrateEmployee:async()=>{const company=SFBackend.companyId;if(window.__fail===company)throw Error('Laden fehlgeschlagen');SFBackend.employeePortalData={company:{id:company,name:'Firma '+company.toUpperCase()},employee:{id:'e'+company,first_name:'Test'}}},openEmployeePortal:()=>{document.querySelector('#sfEmployeePortal')?.remove();const root=document.createElement('div');root.id='sfEmployeePortal';root.textContent=SFBackend.employeePortalData.company.name;document.body.append(root)},client:{from:name=>({select:()=>({eq:async()=>({data:name==='company_members'?[]:[{id:'ea'},{id:'eb'}]})})}),rpc:async(name,args)=>{window.__calls.push({name,args});if(name==='qa_employee_company_options')return {data:window.__opts};if(name==='qa_employee_profile_scoped')return {data:{company:{id:args.p_company,name:'Firma '+args.p_company.toUpperCase()},employee:{id:'e'+args.p_company}}};if(name==='qa_set_employee_session_company')return {data:null};return {error:{message:'unexpected'}}}}};
 });
 await page.addScriptTag({content:fs.readFileSync(__dirname+'/../../assets/qa-employee-multi-switch.js','utf8')});await page.addScriptTag({content:fs.readFileSync(__dirname+'/../../assets/qa-full-employee-portal.js','utf8')});
 await page.evaluate(async()=>{await SFBackend.ensureCompany();await SFBackend.hydrateEmployee();SFBackend.openEmployeePortal()});
 assert.match(await page.locator('#sfEmployeePortal').textContent(),/Firma A/);await page.locator('#qaFullCompany').selectOption('b');
 await page.waitForFunction(()=>SFBackend.companyId==='b'&&document.querySelector('#sfEmployeePortal')?.textContent.includes('Firma B'));
 assert.equal(await page.evaluate(()=>SFBackend.employeeDbId),'eb');
 await page.evaluate(()=>window.__fail='a');await page.locator('#qaFullCompany').selectOption('a');await page.getByText('Laden fehlgeschlagen').waitFor();
 assert.deepEqual(await page.evaluate(()=>[SFBackend.companyId,SFBackend.employeeDbId,SFBackend.employeePortalData.company.id]),['b','eb','b']);
 assert.deepEqual(await page.evaluate(()=>window.__calls.filter(x=>x.name==='qa_set_employee_session_company').slice(-2).map(x=>x.args.p_company)),['a','b']);
 await browser.close();console.log('PASS: opt-in full portal switches profile and restores on failure');
})().catch(e=>{console.error(e);process.exitCode=1});
