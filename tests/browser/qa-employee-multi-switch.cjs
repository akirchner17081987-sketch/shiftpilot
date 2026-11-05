const {chromium}=require('playwright');
const fs=require('fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route('https://qa.example.test/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'}));
 await page.goto('https://qa.example.test/?bereich=mitarbeiter');
 await page.evaluate(()=>{
  window.__options=[{company_id:'a',company_name:'Unternehmen A',employee_id:'ea'},{company_id:'b',company_name:'Unternehmen B',employee_id:'eb'}];
  window.__fault='';window.__wrong='';window.__slow=false;window.__calls=[];window.__baseline=0;window.__absences={a:[],b:[]};
  window.SFBackend={user:{id:'u1'},accessRole:'ADMIN',accessPermissions:['manage_time'],personnelConversationEmployeeIds:['sensitive'],ensureCompany:async()=>{window.__baseline++},hydrateEmployee:async()=>{},openEmployeePortal:()=>{},client:{
   from:name=>({select:()=>({eq:async()=>({data:name==='company_members'?[]:[{id:'ea'},{id:'eb'}]})})}),
   rpc:async(name,args)=>{window.__calls.push({name,args});if(name==='qa_employee_company_options')return {data:window.__options};if(name==='qa_employee_profile_scoped'){if(window.__slow)await new Promise(r=>setTimeout(r,1500));return window.__fault===args.p_company?{error:{message:'Kein Zugriff'}}:{data:{company:{id:args.p_company,name:'Unternehmen '+args.p_company.toUpperCase()},employee:{id:'e'+args.p_company,first_name:'Test',last_name:args.p_company.toUpperCase(),personnel_no:'PN-'+args.p_company}}}}if(name==='qa_employee_time_account_scoped')return {data:{employee_id:window.__wrong===args.p_company?'wrong':'e'+args.p_company,target_minutes:args.p_company==='a'?60:120,confirmed_work_minutes:30}};if(name==='qa_employee_qr_bookings_scoped')return {data:{employee_id:'e'+args.p_company,rows:args.p_company==='a'?[{}]:[{},{}]}};if(name==='qa_employee_shifts_scoped')return {data:[{shift_code:'DIENST-'+args.p_company,starts_at:'2030-01-01T08:00:00Z',ends_at:'2030-01-01T16:00:00Z'}]};if(name==='qa_employee_absences_scoped')return {data:window.__absences[args.p_company]};if(name==='qa_submit_absence_scoped'){window.__absences[args.p_company].push({absence_type:args.p_absence_type,start_date:args.p_start_date,end_date:args.p_end_date,status:'Beantragt'});return {data:'new-absence'}}if(name.startsWith('qa_employee_list_'))return {data:args.p_company==='a'?[{}]:[{},{}]};return {error:{message:'Unexpected call'}}},
   auth:{signOut:async()=>({error:null})}
  }};
 });
 await page.addScriptTag({content:fs.readFileSync('assets/qa-employee-multi-switch.js','utf8')});
 await page.evaluate(async()=>{await SFBackend.ensureCompany();await SFBackend.hydrateEmployee();SFBackend.openEmployeePortal()});
 assert.equal(await page.locator('#qaCompanyName').textContent(),'Unternehmen A');
 assert.equal(await page.locator('#qaPersonnel').textContent(),'PN-a');
 assert.equal(await page.locator('#qaTarget').textContent(),'1 Std.');assert.equal(await page.locator('#qaQrCount').textContent(),'1');
 assert.match(await page.locator('#qaShiftList').textContent(),/DIENST-a/);
 assert.deepEqual(await page.evaluate(()=>[SFBackend.accessRole,SFBackend.accessPermissions,SFBackend.personnelConversationEmployeeIds]),['EMPLOYEE',[],[]]);
 await page.evaluate(()=>{window.__slow=true});await page.locator('#qaCompany').selectOption('b');
 assert.equal(await page.locator('#qaAbsenceFrom').isDisabled(),true);
 await page.getByText('Unternehmen gewechselt.').waitFor();
 await page.evaluate(()=>{window.__slow=false});assert.equal(await page.locator('#qaAbsenceFrom').isDisabled(),false);
 assert.equal(await page.locator('#qaCompanyName').textContent(),'Unternehmen B');
 assert.equal(await page.locator('#qaPersonnel').textContent(),'PN-b');
 assert.equal(await page.locator('#qaTarget').textContent(),'2 Std.');assert.equal(await page.locator('#qaQrCount').textContent(),'2');assert.equal(await page.locator('#qaSwapCount').textContent(),'2');
 assert.match(await page.locator('#qaShiftList').textContent(),/DIENST-b/);
 await page.locator('#qaAbsenceFrom').fill('2030-02-01');await page.locator('#qaAbsenceTo').fill('2030-02-02');await page.locator('#qaAbsenceForm button[type="submit"]').click();await page.getByText('Testantrag gespeichert.').waitFor();
 assert.equal(await page.locator('#qaAbsenceList li').count(),1);assert.match(await page.locator('#qaAbsenceList').textContent(),/2030-02-01/);
 assert.equal(await page.evaluate(()=>window.__calls.find(x=>x.name==='qa_submit_absence_scoped').args.p_company),'b');
 assert.deepEqual(await page.evaluate(()=>[SFBackend.companyId,SFBackend.employeeDbId]),['b','eb']);
 await page.evaluate(()=>{window.__fault='a'});
 await page.locator('#qaCompany').selectOption('a');
 await page.getByText('Kein Zugriff').waitFor();
 assert.deepEqual(await page.evaluate(()=>[SFBackend.companyId,SFBackend.employeeDbId]),['b','eb']);
 assert.equal(await page.locator('#qaCompany').inputValue(),'b');
 await page.evaluate(()=>{window.__fault='';window.__wrong='a'});
 await page.locator('#qaCompany').selectOption('a');await page.getByText('Die geladenen Zeitdaten gehören nicht zum ausgewählten Profil.').waitFor();
 assert.equal(await page.locator('#qaTarget').textContent(),'2 Std.');assert.equal(await page.locator('#qaCompany').inputValue(),'b');
 await page.evaluate(()=>{window.__wrong='';window.__options=[window.__options[0]]});
 await page.evaluate(async()=>{await SFBackend.ensureCompany();await SFBackend.hydrateEmployee();SFBackend.openEmployeePortal()});
 assert.equal(await page.locator('#qaCompanyName').textContent(),'Unternehmen A');
 assert.equal(await page.locator('#qaCompany option').count(),1);
 assert.match(await page.locator('#qaAbsenceList').textContent(),/Keine Abwesenheiten vorhanden/);
 await page.evaluate(()=>{window.__options=[]});
 const blocked=await page.evaluate(async()=>{try{await SFBackend.ensureCompany();return false}catch(e){return e.code==='employee_portal_disabled'}});
 assert.equal(blocked,true);
 assert.equal(await page.evaluate(()=>window.__baseline),0);
 await page.evaluate(()=>{window.SFBackend.client.from=name=>({select:()=>({eq:async()=>({data:name==='company_members'?[]:[{id:'ea'}]})})})});
 await page.evaluate(()=>SFBackend.ensureCompany());
 assert.equal(await page.evaluate(()=>window.__baseline),1);
 await browser.close();console.log('PASS: multi-profile login, company switch, failure rollback, revoked access and mobile viewport');
})().catch(e=>{console.error(e);process.exitCode=1});

