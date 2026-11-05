const {chromium}=require('@playwright/test');const fs=require('fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROME_PATH||undefined,args:['--no-sandbox']});const page=await browser.newPage();page.setDefaultTimeout(4000);
 await page.route('https://qa.example.test/**',r=>r.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'}));await page.goto('https://qa.example.test/?bereich=mitarbeiter&qa_vollportal=1');
 await page.evaluate(()=>{
  window.__calls=[];window.__fail='';window.__opts=[{company_id:'a',company_name:'Firma A',employee_id:'ea'},{company_id:'b',company_name:'Firma B',employee_id:'eb'}];
  const companies=window.__opts.map(x=>({id:x.company_id,name:x.company_name,timezone:'Europe/Berlin'}));
  const emps=window.__opts.map(x=>({id:x.employee_id,company_id:x.company_id,auth_user_id:'u',status:'active',access_status:'ACTIVE',deleted_at:null}));
  function from(name){const rows=name==='companies'?companies:name==='employees'?emps:[];let filters=[];const result=()=>rows.filter(x=>filters.every(fn=>fn(x)));const q={select:()=>q,eq:(k,v)=>{filters.push(x=>x[k]===v);return q},is:(k,v)=>{filters.push(x=>x[k]===v);return q},not:()=>q,order:()=>q,in:()=>q,single:async()=>name==='companies'&&result()[0]?.id===window.__fail?{error:{message:'Laden fehlgeschlagen'}}:{data:result()[0]||null},maybeSingle:async()=>({data:result()[0]||null}),then:(resolve,reject)=>Promise.resolve({data:result()}).then(resolve,reject)};return q}
  window.SFBackend={user:{id:'u'},ensureCompany:async()=>{},hydrateEmployee:async()=>{},openEmployeePortal:()=>{document.querySelector('#sfEmployeePortal')?.remove();const root=document.createElement('div');root.id='sfEmployeePortal';root.textContent=SFBackend.employeePortalData.company.name;document.body.append(root)},client:{from,rpc:async(name,args)=>{window.__calls.push({name,args});if(name==='qa_employee_company_options')return {data:window.__opts};if(name==='qa_employee_profile_scoped')return {data:{company:{id:args.p_company,name:'Firma '+args.p_company.toUpperCase()},employee:{id:'e'+args.p_company}}};if(name==='qa_set_employee_session_company'){if(window.__setterFail===args.p_company){window.__setterFail='';return {error:{message:'Sitzung konnte nicht gespeichert werden'}}}return {data:null}}return {error:{message:'unexpected'}}}}};
 });
 await page.addScriptTag({content:fs.readFileSync(__dirname+'/../../assets/qa-employee-multi-switch.js','utf8')});await page.addScriptTag({content:fs.readFileSync(__dirname+'/../../assets/qa-full-employee-portal.js','utf8')});
 await page.evaluate(async()=>{await SFBackend.ensureCompany();await SFBackend.hydrateEmployee();SFBackend.openEmployeePortal()});
 assert.match(await page.locator('#sfEmployeePortal').textContent(),/Firma A/);await page.locator('#qaFullCompany').selectOption('b');
 await page.waitForFunction(()=>SFBackend.companyId==='b'&&document.querySelector('#sfEmployeePortal')?.textContent.includes('Firma B'));
 assert.equal(await page.evaluate(()=>SFBackend.employeeDbId),'eb');
 await page.evaluate(()=>window.__fail='a');await page.locator('#qaFullCompany').selectOption('a');await page.getByText('Laden fehlgeschlagen').waitFor();
 assert.deepEqual(await page.evaluate(()=>[SFBackend.companyId,SFBackend.employeeDbId,SFBackend.employeePortalData.company.id]),['b','eb','b']);
 assert.deepEqual(await page.evaluate(()=>window.__calls.filter(x=>x.name==='qa_set_employee_session_company').map(x=>x.args.p_company)),['a','b']);
 await page.evaluate(()=>{window.__fail='';window.__setterFail='a'});await page.locator('#qaFullCompany').selectOption('a');await page.getByText('Sitzung konnte nicht gespeichert werden').waitFor();
 assert.deepEqual(await page.evaluate(()=>[SFBackend.companyId,SFBackend.employeeDbId]),['b','eb']);
 assert.deepEqual(await page.evaluate(()=>window.__calls.filter(x=>x.name==='qa_set_employee_session_company').slice(-2).map(x=>x.args.p_company)),['a','b']);
 await browser.close();console.log('PASS: opt-in full portal switches profile and restores on failure');
})().catch(e=>{console.error(e);process.exitCode=1});
