const {chromium}=require('@playwright/test');const fs=require('fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROME_PATH||undefined,args:['--no-sandbox']});const page=await browser.newPage();page.setDefaultTimeout(4000);
 await page.route('https://qa.example.test/',r=>r.fulfill({status:200,contentType:'text/html',body:'<html><body><div id="sfEmployeePortal"><div class="sf-portal-grid"></div></div></body></html>'}));await page.goto('https://qa.example.test/');
 await page.evaluate(()=>{window.__calls=[];window.SFBackend={role:'EMPLOYEE',user:{id:'u'},companyId:'b',employeeDbId:'eb',__qaMultiEmployee:true,client:{rpc:async(name,args)=>{window.__calls.push({name,args});return {data:{employee_id:'eb',month:args.p_month,timezone:'Europe/Berlin',as_of:new Date().toISOString(),totals:{paid_seconds:0,night_seconds:0,sunday_seconds:0,holiday_seconds:0},rates:{night:.2,sunday:.5,holiday:1},days:[],pending:[],sources:{}}}}}}});
 await page.addScriptTag({content:fs.readFileSync(__dirname+'/../../assets/employee-wage-preview-v1.js','utf8')});await page.evaluate(()=>SFBackend.wagePreview.render());
 const call=await page.evaluate(()=>window.__calls.at(-1));assert.equal(call.name,'qa_employee_wage_month_scoped');assert.equal(call.args.p_company,'b');
 await page.evaluate(()=>{SFBackend.__qaMultiEmployee=false});await page.evaluate(()=>SFBackend.wagePreview.render());assert.equal(await page.evaluate(()=>window.__calls.at(-1).name),'employee_my_wage_month');
 await browser.close();console.log('PASS: wage preview uses selected company');
})().catch(e=>{console.error(e);process.exitCode=1});
