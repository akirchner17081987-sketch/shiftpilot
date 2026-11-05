const {chromium}=require('@playwright/test');const fs=require('fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROME_PATH||undefined,args:['--no-sandbox']});const page=await browser.newPage();page.setDefaultTimeout(5000);
 await page.route('https://qa.example.test/',r=>r.fulfill({status:200,contentType:'text/html',body:'<html><body><div id="sfEmployeePortal"><div class="sf-portal-grid"></div></div></body></html>'}));await page.goto('https://qa.example.test/');
 await page.evaluate(()=>{window.__calls=[];window.SFBackend={role:'EMPLOYEE',user:{id:'u'},companyId:'a',employeeDbId:'ea',__qaMultiEmployee:true,employeePortalData:{shifts:[]},client:{rpc:async(name,args)=>{window.__calls.push({name,args});if(args?.p_company==='a')await new Promise(r=>setTimeout(r,500));if(name==='qa_open_market_scoped')return {data:[]};if(name==='qa_employee_list_shift_marketplace_scoped')return {data:[{id:'offer-'+args.p_company,shift_code:'SHIFT-'+args.p_company,status:'MARKET_OPEN',is_own:false,can_take:false,starts_at:'2030-01-01T08:00:00Z'}]};return {data:[]}}}}});
 await page.addScriptTag({content:fs.readFileSync(__dirname+'/../../assets/supabase-shift-marketplace-v1.js','utf8')});
 await page.waitForFunction(()=>window.__calls.some(x=>x.name==='qa_employee_list_shift_marketplace_scoped'&&x.args.p_company==='a'));
 await page.evaluate(()=>{SFBackend.companyId='b';SFBackend.employeeDbId='eb';SFShiftMarketplace.refreshEmployee()});
 await page.waitForFunction(()=>window.__calls.some(x=>x.name==='qa_employee_list_shift_marketplace_scoped'&&x.args.p_company==='b'));
 await page.getByText('SHIFT-b',{exact:false}).first().waitFor();assert.doesNotMatch(await page.locator('#sfMarketEmployee').textContent(),/SHIFT-a/);
 assert.equal(await page.evaluate(()=>window.__calls.some(x=>x.name==='qa_open_market_scoped'&&x.args.p_company==='b'&&x.args.p_action==='employee_list')),true);
 await page.evaluate(()=>{SFBackend.__qaMultiEmployee=false;SFShiftMarketplace.refreshEmployee()});
 await page.waitForFunction(()=>window.__calls.some(x=>x.name==='employee_list_shift_marketplace'));
 await browser.close();console.log('PASS: marketplace switches company and discards stale results');
})().catch(e=>{console.error(e);process.exitCode=1});
