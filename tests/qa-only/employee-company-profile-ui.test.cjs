const {chromium}=require('@playwright/test');const fs=require('fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROME_PATH||undefined,args:['--no-sandbox']});const page=await browser.newPage();page.setDefaultTimeout(4000);
 await page.route('https://qa.example.test/',r=>r.fulfill({status:200,contentType:'text/html',body:'<html><body><div id="sfEmployeePortal"><div class="sf-portal-grid"></div></div></body></html>'}));await page.goto('https://qa.example.test/');
 await page.evaluate(()=>{window.__calls=[];window.SFBackend={role:'EMPLOYEE',user:{id:'u'},companyId:'b',employeeDbId:'eb',__sfMultiEmployee:true,employeePortalData:{employee:{id:'eb'}},openEmployeePortal:()=>{},client:{rpc:async(name,args)=>{window.__calls.push({name,args});if(name==='employee_company_profile'||name==='employee_my_profile')return {data:{employee:{id:'eb',first_name:'Test',shift_permissions:[],qualifications:[]},company:{id:'b',timezone:'Europe/Berlin'},details:{},rhythm:{},requests:[],qualifications:[],templates:[],as_of:new Date().toISOString(),today:'2030-01-01'}};if(name==='employee_company_profile_request')return {data:'request-b'};return {error:{message:'Unexpected'}}}}}});
 await page.addScriptTag({content:fs.readFileSync(__dirname+'/../../assets/employee-profile-v1.js','utf8')});
 await page.evaluate(()=>SFBackend.employeeProfile.request('contact','Telefonnummer korrigieren'));
 await page.locator('#sfEmployeeProfile form button[type="submit"]').click();await page.waitForFunction(()=>window.__calls.some(x=>x.name==='employee_company_profile_request'));
 assert.deepEqual(await page.evaluate(()=>window.__calls.find(x=>x.name==='employee_company_profile_request').args),{p_company:'b',p_category:'contact',p_message:'Telefonnummer korrigieren'});
 assert.equal(await page.evaluate(()=>window.__calls.some(x=>x.name==='employee_company_profile'&&x.args.p_company==='b')),true);
 await page.evaluate(()=>SFBackend.employeeProfile.request('other','Bitte Daten prüfen'));
 const before=await page.evaluate(()=>window.__calls.length);await page.evaluate(()=>{SFBackend.companyId='a';SFBackend.employeeDbId='ea'});await page.locator('#sfEmployeeProfile form button[type="submit"]').click();
 await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.__calls.length),before);
 await page.evaluate(()=>{SFBackend.companyId='b';SFBackend.employeeDbId='eb';SFBackend.__sfMultiEmployee=false});await page.evaluate(()=>SFBackend.employeeProfile.render());
 assert.equal(await page.evaluate(()=>window.__calls.some(x=>x.name==='employee_my_profile')),true);
 await browser.close();console.log('PASS: profile and correction request use selected company');
})().catch(e=>{console.error(e);process.exitCode=1});
