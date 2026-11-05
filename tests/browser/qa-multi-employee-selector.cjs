const {chromium}=require('playwright');
const fs=require('fs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();
 await page.route('https://qa.example.test/',route=>route.fulfill({status:200,contentType:'text/html',body:'<html><body><div id="host"></div></body></html>'}));
 await page.goto('https://qa.example.test/');
 await page.evaluate(()=>{
  window.__calls=[];
  window.SFBackend={role:'OWNER',companyId:'source',ready:true,productionUrl:'http://localhost:41785/',init:async()=>{},client:{rpc:async(name,args)=>{
   window.__calls.push({name,args});
   if(name==='manager_list_access_users')return {data:{users:[],employees:[{id:'source-profile',name:'Test Person',email:'person@example.test'}],personnel_employees:[]}};
   if(name==='qa_invite_company_options')return {data:[]};
   if(name==='qa_invitable_employee_profiles')return {data:[{company_id:'source',company_name:'A',employee_id:'source-profile',first_name:'Test',last_name:'Person'},{company_id:'other',company_name:'B',employee_id:'other-profile',first_name:'Test',last_name:'Person'},{company_id:'other',company_name:'B',employee_id:'other-profile-2',first_name:'Test',last_name:'Person'}]};
   if(name==='qa_create_multi_employee_invite')return {data:{id:'invite',parameter:'employeeInvite'}};
   return {data:null};
  },functions:{invoke:async()=>({data:{}})}}};
 });
 await page.addScriptTag({content:fs.readFileSync('assets/team-admin-v1.js','utf8')});
 await page.evaluate(()=>window.SFBackend.renderUserManagement(document.querySelector('#host')));
 await page.locator('#sfInviteUser').click();
 await page.locator('#sfInviteEmail').fill('person@example.test');
 await page.locator('#sfAccessEmployee').selectOption('source-profile');
 await page.locator('#sfLoadEmployeeProfiles').click();
 await page.locator('[data-qa-employee="other-profile"]').check();
 await page.locator('[data-qa-employee="other-profile-2"]').check();
 assert.equal(await page.locator('[data-qa-employee="other-profile"]').isChecked(),false);
 await page.locator('#sfCreateTeamInvite').click();
 await page.locator('#sfCopyTeamInvite').waitFor();
 const calls=await page.evaluate(()=>window.__calls);
 const call=calls.find(x=>x.name==='qa_create_multi_employee_invite');
 assert.deepEqual(call.args.p_employees,['source-profile','other-profile-2']);
 assert.equal(call.args.p_email,'person@example.test');
 await browser.close();console.log('PASS: profile lookup, one profile per company, exact invitation selection');
})().catch(e=>{console.error(e);process.exitCode=1});

