const {chromium}=require('@playwright/test');const fs=require('fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROME_PATH||undefined,args:['--no-sandbox']});const page=await browser.newPage();page.setDefaultTimeout(4000);
 await page.route('https://qa.example.test/',r=>r.fulfill({status:200,contentType:'text/html',body:'<html><body><div id="sfEmployeePortal"><div class="sf-portal-grid"></div></div></body></html>'}));await page.goto('https://qa.example.test/');
 await page.evaluate(()=>{
  window.__calls=[];
  const client={rpc:async(name,args)=>{window.__calls.push({name,args});return {data:'request-b'}},from:()=>{const q={select:()=>q,eq:()=>q,order:async()=>({data:[]})};return q}};
  window.SFBackend={role:'EMPLOYEE',user:{id:'u'},companyId:'b',employeeDbId:'eb',__qaMultiEmployee:true,employeePortalData:{employee:{id:'eb'},absences:[]},client};
 });
 await page.addScriptTag({content:fs.readFileSync(__dirname+'/../../assets/supabase-absence-employee-v3.js','utf8')});
 await page.evaluate(()=>SFBackend.openEmployeeAbsenceRequestV3(null,'Home-Office'));
 await page.locator('#sfAe3From').fill('2030-03-01');await page.locator('#sfAe3To').fill('2030-03-02');await page.locator('#sfAe3Submit').click();
 await page.waitForFunction(()=>window.__calls.length>0);
 const call=await page.evaluate(()=>window.__calls[0]);assert.equal(call.name,'qa_submit_absence_scoped');assert.equal(call.args.p_company,'b');assert.equal(call.args.p_absence_type,'Home-Office');
 await page.evaluate(()=>SFBackend.openEmployeeAbsenceRequestV3(null,'Urlaub'));await page.evaluate(()=>{SFBackend.companyId='a';SFBackend.employeeDbId='ea'});await page.locator('#sfAe3Submit').click();
 assert.match(await page.locator('#sfAe3Msg').textContent(),/Zugang hat sich geändert/);assert.equal(await page.evaluate(()=>window.__calls.length),1);
 await page.locator('#sfAe3Cancel').click();await page.evaluate(()=>{SFBackend.__qaMultiEmployee=false;SFBackend.openEmployeeAbsenceRequestV3(null,'Urlaub')});await page.locator('#sfAe3Submit').click();
 await page.waitForFunction(()=>window.__calls.length===2);assert.equal(await page.evaluate(()=>window.__calls[1].name),'employee_submit_absence_request_for_company');
 await browser.close();console.log('PASS: absence request uses selected company and blocks a stale form');
})().catch(e=>{console.error(e);process.exitCode=1});
