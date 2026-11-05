const {chromium}=require('@playwright/test');const fs=require('fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROME_PATH||undefined,args:['--no-sandbox']});const page=await browser.newPage();page.setDefaultTimeout(4000);
 await page.route('https://qa.example.test/',r=>r.fulfill({status:200,contentType:'text/html',body:'<html><body><div id="sfEmployeePortal"><div class="sf-portal-grid"></div></div></body></html>'}));await page.goto('https://qa.example.test/');
 await page.evaluate(()=>{window.__calls=[];window.SFBackend={role:'EMPLOYEE',user:{id:'u'},companyId:'b',employeeDbId:'eb',__sfMultiEmployee:true,client:{rpc:async(name,args)=>{window.__calls.push({name,args});return {data:{employee_id:'eb',month:args.p_month,timezone:'Europe/Berlin',as_of:new Date().toISOString(),rows:[]}}}}}});
 await page.addScriptTag({content:fs.readFileSync(__dirname+'/../../assets/employee-qr-bookings-v1.js','utf8')});
 await page.evaluate(()=>SFBackend.openEmployeeQrMonth('2030-02'));
 const call=await page.evaluate(()=>window.__calls.at(-1));assert.deepEqual(call,{name:'employee_company_qr_bookings',args:{p_company:'b',p_month:'2030-02-01'}});
 await page.evaluate(()=>{SFBackend.__sfMultiEmployee=false});await page.evaluate(()=>SFBackend.openEmployeeQrMonth('2030-02'));
 assert.equal(await page.evaluate(()=>window.__calls.at(-1).name),'employee_my_qr_bookings');
 await browser.close();console.log('PASS: QR history uses selected company');
})().catch(e=>{console.error(e);process.exitCode=1});
