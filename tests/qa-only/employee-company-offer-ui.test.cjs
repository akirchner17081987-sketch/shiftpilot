const {chromium}=require('@playwright/test');const fs=require('fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROME_PATH||undefined,args:['--no-sandbox']});const page=await browser.newPage();page.setDefaultTimeout(4000);
 await page.route('https://qa.example.test/',r=>r.fulfill({status:200,contentType:'text/html',body:'<html><body><div id="sfEmployeePortal"><div class="sf-portal-grid"></div></div></body></html>'}));await page.goto('https://qa.example.test/');
 await page.evaluate(()=>{window.__calls=[];window.showSaveToast=()=>{};window.SFBackend={role:'EMPLOYEE',user:{id:'u'},companyId:'b',employeeDbId:'eb',__sfMultiEmployee:true,client:{rpc:async(name,args)=>{window.__calls.push({name,args});if(name==='employee_company_list_offers')return {data:[{offer_id:'offer-b',offer_status:'OFFERED',shift_code:'O1',starts_at:'2030-01-01T08:00:00Z',expires_at:'2030-01-01T07:00:00Z'}]};if(name==='employee_company_respond_offer')return {data:[{status:'DECLINED'}]};return {error:{message:'unexpected '+name}}}}}});
 await page.addScriptTag({content:fs.readFileSync(__dirname+'/../../assets/disruption-autopilot-v1.js','utf8')});
 await page.locator('#sfDisruptionEmployee [data-decline]').click();await page.locator('#sfDisruptionResponse [data-submit]').click();
 await page.waitForFunction(()=>window.__calls.some(x=>x.name==='employee_company_respond_offer'));
 assert.deepEqual(await page.evaluate(()=>window.__calls.find(x=>x.name==='employee_company_respond_offer').args),{p_company:'b',p_offer:'offer-b',p_decision:'DECLINE',p_comment:''});
 await page.evaluate(()=>{SFBackend.__sfMultiEmployee=false;SFDisruptionAutopilot.refresh()});
 await page.waitForFunction(()=>window.__calls.some(x=>x.name==='employee_list_disruption_offers'));
 await browser.close();console.log('PASS: disruption offer response uses selected company');
})().catch(e=>{console.error(e);process.exitCode=1});
