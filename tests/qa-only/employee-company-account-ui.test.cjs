const {chromium}=require('@playwright/test');const fs=require('fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROME_PATH||undefined,args:['--no-sandbox']});const page=await browser.newPage();page.setDefaultTimeout(4000);
 await page.route('https://qa.example.test/',r=>r.fulfill({status:200,contentType:'text/html',body:'<html><body><div id="sfEmployeePortal"><div class="sf-portal-grid"></div></div></body></html>'}));await page.goto('https://qa.example.test/');
 await page.evaluate(()=>{window.__calls=[];window.SFBackend={role:'EMPLOYEE',user:{id:'u'},companyId:'a',employeeDbId:'ea',__sfMultiEmployee:true,client:{rpc:async(name,args)=>{window.__calls.push({name,args});if(args.p_company==='a')await new Promise(r=>setTimeout(r,350));const id=args.p_company||'legacy';return {data:{employee_id:'e'+id,target_minutes:id==='a'?60:120,credited_total_minutes:0,month_balance_minutes:0,account_balance_minutes:0}}}}}});
 await page.addScriptTag({content:fs.readFileSync(__dirname+'/../../assets/employee-time-account-v2.js','utf8')});
 await page.waitForFunction(()=>window.__calls.some(x=>x.name==='employee_company_time_account_month'&&x.args.p_company==='a'));
 await page.evaluate(()=>{SFBackend.companyId='b';SFBackend.employeeDbId='eb';SFBackend.renderEmployeeTimeAccountV2()});
 await page.waitForFunction(()=>window.__calls.some(x=>x.name==='employee_company_time_account_month'&&x.args.p_company==='b'));
 await page.waitForTimeout(500);assert.match(await page.locator('#sfEmployeeTimeAccount').textContent(),/2[,.]0/);
 await page.evaluate(async()=>{SFBackend.__sfMultiEmployee=false;await SFBackend.renderEmployeeTimeAccountV2()});
 assert.equal(await page.evaluate(()=>window.__calls.some(x=>x.name==='employee_my_time_account_month')),true);
 await browser.close();console.log('PASS: time account routes by company and ignores stale response');
})().catch(e=>{console.error(e);process.exitCode=1});
