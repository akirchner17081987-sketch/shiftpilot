const {chromium}=require('@playwright/test');const fs=require('fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROME_PATH||undefined,args:['--no-sandbox']});const page=await browser.newPage();page.setDefaultTimeout(4000);
 await page.route('https://qa.example.test/',r=>r.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'}));await page.goto('https://qa.example.test/');
 await page.evaluate(()=>{window.__calls=[];window.SFDialog={confirm:async()=>true};window.SFBackend={role:'EMPLOYEE',user:{id:'u'},companyId:'b',employeeDbId:'eb',__sfMultiEmployee:true,hydrateEmployee:async()=>{},openEmployeePortal:()=>{},client:{rpc:async(name,args)=>{window.__calls.push({name,args});return {data:[{status:'REJECTED'}]}}}}});
 await page.addScriptTag({content:fs.readFileSync(__dirname+'/../../assets/supabase-employee-change-response-v1.js','utf8')});
 await page.evaluate(()=>SFBackend.respondToShiftChange('change-b','REJECTED'));
 assert.deepEqual(await page.evaluate(()=>window.__calls[0]),{name:'employee_company_respond_shift_change',args:{p_company:'b',p_change_id:'change-b',p_decision:'REJECTED',p_comment:''}});
 await page.evaluate(()=>{SFDialog.confirm=()=>new Promise(resolve=>{window.__confirm=resolve});window.__pending=SFBackend.respondToShiftChange('old-change','REJECTED')});
 await page.evaluate(()=>{SFBackend.companyId='a';SFBackend.employeeDbId='ea';window.__confirm(true)});await page.evaluate(()=>window.__pending);
 assert.equal(await page.evaluate(()=>window.__calls.length),1);
 await page.evaluate(()=>{SFBackend.__sfMultiEmployee=false;SFDialog.confirm=async()=>true});await page.evaluate(()=>SFBackend.respondToShiftChange('legacy-change','REJECTED'));
 assert.equal(await page.evaluate(()=>window.__calls.at(-1).name),'employee_respond_to_shift_change');
 await browser.close();console.log('PASS: shift changes use selected company and reject stale confirmations');
})().catch(e=>{console.error(e);process.exitCode=1});
