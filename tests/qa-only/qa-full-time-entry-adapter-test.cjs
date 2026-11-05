const {chromium}=require('@playwright/test');const fs=require('fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROME_PATH||undefined,args:['--no-sandbox']});const page=await browser.newPage();page.setDefaultTimeout(4000);
 await page.route('https://qa.example.test/',r=>r.fulfill({status:200,contentType:'text/html',body:'<html><body><div id="sfEmployeePortal"><div class="sf-portal-grid"></div></div></body></html>'}));await page.goto('https://qa.example.test/');
 await page.evaluate(()=>{window.__calls=[];const end=new Date(Date.now()-3600000),start=new Date(Date.now()-10800000);window.SFBackend={role:'EMPLOYEE',user:{id:'u'},companyId:'b',employeeDbId:'eb',__qaMultiEmployee:true,companyTimeZone:'Europe/Berlin',employeePortalData:{shifts:[{id:'shift-b',company_id:'b',employee_id:'eb',shift_code:'O1',starts_at:start.toISOString(),ends_at:end.toISOString(),status:'PUBLISHED',published_at:start.toISOString(),break_minutes:0}]},client:{from:()=>({select:()=>({in:async()=>({data:[]})})}),rpc:async(name,args)=>{window.__calls.push({name,args});return {data:{status:'recorded'}}}}}});
 await page.addScriptTag({content:fs.readFileSync(__dirname+'/../../assets/supabase-time-tracking-v1.js','utf8')});await page.evaluate(()=>SFBackend.timeTracking.refreshEmployee());
 await page.locator('[data-time-report]').first().click();await page.locator('#sfTimeModal .sf-time-confirm').click();await page.waitForFunction(()=>window.__calls.length>0);
 const call=await page.evaluate(()=>window.__calls[0]);assert.equal(call.name,'qa_submit_time_entry_scoped');assert.equal(call.args.p_company,'b');assert.equal(call.args.p_assignment_id,'shift-b');
 await page.evaluate(()=>SFBackend.timeTracking.refreshEmployee());await page.locator('[data-time-report]').first().click();await page.evaluate(()=>{SFBackend.companyId='a';SFBackend.employeeDbId='ea'});await page.locator('#sfTimeModal .sf-time-confirm').click();
 assert.match(await page.locator('#sfTimeMessage').textContent(),/Zugang wurde geändert/);assert.equal(await page.evaluate(()=>window.__calls.length),1);
 await browser.close();console.log('PASS: time submission uses selected company');
})().catch(e=>{console.error(e);process.exitCode=1});
