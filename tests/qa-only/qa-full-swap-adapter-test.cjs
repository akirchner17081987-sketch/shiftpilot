const {chromium}=require('@playwright/test');const fs=require('fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROME_PATH||undefined,args:['--no-sandbox']});
 const page=await browser.newPage();page.setDefaultTimeout(4000);
 await page.route('https://qa.example.test/',r=>r.fulfill({status:200,contentType:'text/html',body:'<html><body><div id="sfEmployeePortal"><main class="sf-portal-main"><div class="sf-portal-grid"><div class="sf-shift-item" data-assignment-id="shift-b"><span class="sf-item-state">Veröffentlicht</span></div></div></main></div></body></html>'}));
 await page.goto('https://qa.example.test/');
 await page.evaluate(()=>{
  window.__calls=[];window.SFBackend={role:'EMPLOYEE',companyId:'b',employeeDbId:'eb',user:{id:'user'},__qaMultiEmployee:true,employeePortalData:{shifts:[{id:'shift-b',shift_code:'O1',starts_at:'2030-01-01T08:00:00Z',ends_at:'2030-01-01T16:00:00Z',status:'PUBLISHED',published_at:'2026-01-01T00:00:00Z'}]},client:{rpc:async(name,args)=>{
   window.__calls.push({name,args});if(name==='qa_employee_list_shift_swaps_scoped')return {data:[]};if(name==='qa_swap_candidates_scoped')return {data:[{employee_id:'colleague',display_name:'Kollege',employee_role:'Mitarbeiter'}]};if(name==='qa_create_swap_scoped')return args.p_company==='b'?{data:'request'}:{error:{message:'Nicht berechtigt'}};return {error:{message:'unexpected '+name}};
  }}};
 });
 await page.addScriptTag({content:fs.readFileSync(__dirname+'/../../assets/supabase-shift-swap-v1.js','utf8')});
 await page.evaluate(()=>SFBackend.shiftSwap.refreshEmployee());
 await page.locator('.sf-swap-mini').first().click();await page.locator('#sfSwapCandidate').waitFor({state:'visible'});
 await page.locator('#sfSwapSubmit').click();
 await page.waitForFunction(()=>window.__calls.some(x=>x.name==='qa_create_swap_scoped'));
 const calls=await page.evaluate(()=>window.__calls);
 assert.deepEqual(calls.find(x=>x.name==='qa_swap_candidates_scoped').args,{p_company:'b',p_assignment:'shift-b'});
 assert.deepEqual(calls.find(x=>x.name==='qa_create_swap_scoped').args,{p_company:'b',p_assignment:'shift-b',p_target:'colleague',p_reason:''});
 await page.evaluate(async()=>{SFBackend.__qaMultiEmployee=false;await SFBackend.shiftSwap.refreshEmployee()});
 assert.equal(await page.evaluate(()=>window.__calls.some(x=>x.name==='employee_list_shift_swaps')),true);
 await browser.close();console.log('PASS: original swap module uses company-scoped QA routes');
})().catch(e=>{console.error(e);process.exitCode=1});
