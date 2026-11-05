const {chromium}=require('@playwright/test');
const fs=require('fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROME_PATH||undefined,args:['--no-sandbox']});
 const page=await browser.newPage();
 await page.route('https://qa.example.test/',route=>route.fulfill({status:200,contentType:'text/html',body:'<html><body><div id="host"></div></body></html>'}));
 await page.goto('https://qa.example.test/');
 await page.evaluate(()=>{
  window.__calls=[];window.__reject=false;
  window.SFBackend={role:'OWNER',companyId:'a',ready:true,init:async()=>{},client:{rpc:async(name,args)=>{
   window.__calls.push({name,args});
   if(name==='manager_list_access_users')return {data:{users:[{kind:'EMPLOYEE',record_id:'ea',employee_id:'ea',user_id:'user',email:'person@example.test',role:'EMPLOYEE',status:'ACTIVE',permissions:[],is_self:false}],employees:[{id:'new-profile',name:'Neue Person',email:'new@example.test'}],personnel_employees:[]}};
   if(name==='qa_managed_employee_profiles')return {data:[{company_id:'a',company_name:'Firma A',employee_id:'ea',enabled:true},{company_id:'b',company_name:'Firma B',employee_id:'eb',enabled:true}]};
   if(name==='qa_set_employee_profile_access')return window.__reject?{error:{message:'Nicht berechtigt'}}:{data:null};
   return {data:null};
  }}};
 });
 await page.addScriptTag({content:fs.readFileSync(__dirname+'/../../assets/team-admin-v1.js','utf8')});
 await page.evaluate(()=>SFBackend.renderUserManagement(document.querySelector('#host')));
 await page.locator('[data-qa-employee-access]').click();
 await page.locator('[data-qa-profile="eb"]').uncheck();
 await page.getByText('Freigabe gespeichert.').waitFor();
 assert.deepEqual(await page.evaluate(()=>window.__calls.find(x=>x.name==='qa_set_employee_profile_access').args),{p_source:'a',p_employee:'ea',p_target:'eb',p_enabled:false});
 await page.evaluate(()=>window.__reject=true);
 await page.locator('[data-qa-profile="eb"]').click();
 await page.getByText('Nicht berechtigt',{exact:true}).waitFor();
 assert.equal(await page.locator('[data-qa-profile="eb"]').isChecked(),false);
 await page.locator('[data-close]').click();
 await page.evaluate(()=>SFBackend.openQaEmployeeCompanies({_dbId:'ea'}));
 await page.locator('[data-qa-profile="eb"]').waitFor();
 assert.match(await page.locator('#qaEmployeeCompanies').textContent(),/Firma B/);
 await page.locator('[data-close]').click();await page.evaluate(()=>SFBackend.openQaEmployeeCompanies({_dbId:'new-profile'}));
 assert.equal(await page.locator('#sfInviteEmail').inputValue(),'new@example.test');assert.equal(await page.locator('#sfAccessEmployee').inputValue(),'new-profile');
 await browser.close();console.log('PASS: access checkbox, scoped save and failed update rollback');
})().catch(e=>{console.error(e);process.exitCode=1});
