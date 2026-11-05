const {chromium}=require('@playwright/test');const fs=require('fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROME_PATH||undefined,args:['--no-sandbox']});const page=await browser.newPage();page.setDefaultTimeout(5000);
 await page.route('https://qa.example.test/**',r=>r.fulfill({status:200,contentType:'text/html',body:'<html><head></head><body><div id="landingPage"></div><div id="appShell"></div></body></html>'}));await page.goto('https://qa.example.test/?bereich=mitarbeiter&qa_vollportal=1');
 await page.evaluate(()=>{
  window.__fail='';window.__calls=[];
  const companies=[{id:'a',name:'Firma A',timezone:'Europe/Berlin'},{id:'b',name:'Firma B',timezone:'Europe/Berlin'}];
  const emps=companies.map(c=>({id:'e'+c.id,company_id:c.id,auth_user_id:'u',status:'active',access_status:'ACTIVE',deleted_at:null,first_name:'Test',last_name:c.id.toUpperCase(),personnel_no:'PN-'+c.id,shift_permissions:['O1']}));
  const shifts=companies.map(c=>({id:'shift-'+c.id,company_id:c.id,employee_id:'e'+c.id,status:'PUBLISHED',published_at:'2026-01-01T00:00:00Z',starts_at:'2030-01-01T08:00:00Z',ends_at:'2030-01-01T16:00:00Z',shift_code:'O1-'+c.id}));
  const tables={companies,employees:emps,company_members:[],shift_assignments:shifts,absences:[],shift_change_requests:[],shift_templates:[],company_compliance_policy:[],shift_change_approvals:[],time_entries:[]};
  function from(name){let rows=tables[name]||[],filters=[],result=()=>{const data=rows.filter(x=>filters.every(fn=>fn(x)));return {data,error:null}};const q={select:()=>q,eq:(k,v)=>{filters.push(x=>x[k]===v);return q},is:(k,v)=>{filters.push(x=>x[k]===v);return q},not:(k,op,v)=>{filters.push(x=>x[k]!==v);return q},order:()=>q,in:(k,values)=>{filters.push(x=>values.includes(x[k]));return q},single:async()=>{const x=result();if(name==='companies'&&x.data[0]?.id==='a'&&window.__delayA)await new Promise(r=>setTimeout(r,500));if(name==='companies'&&x.data[0]?.id===window.__fail)return {error:{message:'Laden fehlgeschlagen'}};return {data:x.data[0]||null,error:null}},maybeSingle:async()=>({data:result().data[0]||null,error:null}),then:(resolve,reject)=>Promise.resolve(result()).then(resolve,reject)};return q}
  const opts=companies.map(c=>({company_id:c.id,company_name:c.name,employee_id:'e'+c.id}));
  window.SFDialog={alert:async()=>{}};window.SFBackend={user:{id:'u'},ensureCompany:async()=>{},client:{from,rpc:async(name,args)=>{window.__calls.push({name,args});if(name==='qa_employee_company_options')return {data:opts};if(name==='qa_employee_profile_scoped')return {data:{company:companies.find(x=>x.id===args.p_company),employee:emps.find(x=>x.company_id===args.p_company)}};if(name==='qa_set_employee_session_company')return {data:null};return {error:{message:'Unexpected RPC '+name}}},auth:{signOut:async()=>({})}}};
 });
 for(const file of ['supabase-employee-access-v1.js','qa-employee-multi-switch.js','qa-full-employee-portal.js'])await page.addScriptTag({content:fs.readFileSync(__dirname+'/../../assets/'+file,'utf8')});
 await page.evaluate(async()=>{await SFBackend.ensureCompany();await SFBackend.hydrateEmployee();SFBackend.openEmployeePortal()});
 assert.match(await page.locator('#sfEmployeePortal').textContent(),/Firma A/);assert.match(await page.locator('#sfEmployeePortal').textContent(),/O1-a/);
 await page.evaluate(()=>{window.__delayA=true;window.__oldLoad=SFBackend.hydrateEmployee().catch(()=>{})});
 await page.locator('#qaFullCompany').selectOption('b');await page.waitForFunction(()=>SFBackend.employeeDbId==='eb'&&document.querySelector('#sfEmployeePortal')?.textContent.includes('O1-b'));
 assert.doesNotMatch(await page.locator('#sfEmployeePortal').textContent(),/O1-a/);
 await page.evaluate(()=>window.__oldLoad);assert.equal(await page.evaluate(()=>SFBackend.employeePortalData.company.id),'b');await page.evaluate(()=>window.__delayA=false);
 await page.evaluate(()=>window.__fail='a');await page.locator('#qaFullCompany').selectOption('a');await page.getByText('Laden fehlgeschlagen').waitFor();
 assert.deepEqual(await page.evaluate(()=>[SFBackend.companyId,SFBackend.employeeDbId,SFBackend.employeePortalData.company.id]),['b','eb','b']);
 await browser.close();console.log('PASS: real portal hydration and rendering switch profiles with mocked backend');
})().catch(e=>{console.error(e);process.exitCode=1});
