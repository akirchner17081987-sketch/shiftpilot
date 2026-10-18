// Real entry form, role resolution, employee hydration and employee renderer;
// synthetic account/session and transport, no live authentication or data changes.
const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('dist/index.html'),overlay=html.slice(html.indexOf('<div id="sfEntryOverlay"'),html.indexOf('<section id="landingPage">')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
(async()=>{const browser=await chromium.launch({headless:true});let checks=0;try{
 for(const width of [390,1440])for(const area of ['mitarbeiter','verwaltung']){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="de"><head><meta charset="utf-8"></head><body>'+overlay+'<section id="landingPage"></section><div id="appShell" style="display:none"><div class="side-bottom"><div class="user-row"><small></small></div></div><main id="managerWorkspace">Verwaltung</main></div></body></html>'}));
  await page.goto('https://portal-entry.invalid/');await page.addStyleTag({content:read('assets/sf-entry-v2.css')+read('assets/sf-entry-access-v1.css')});
  await page.evaluate(()=>{window.openApp=()=>{};});
  for(const file of ['sf-entry-v2','sf-entry-access-v1','supabase-auth-v1'])await page.addScriptTag({content:read('assets/'+file+'.js')});
  await page.evaluate(()=>{
   window.qa={calls:[],managerBoot:0,session:{user:{id:'user-a',email:'dual-role@example.invalid'}}};const B=SFBackend;
   const own={id:'employee-a',company_id:'company-a',auth_user_id:'user-a',first_name:'Alex',last_name:'Fiktiv',status:'active',access_status:'ACTIVE',deleted_at:null,email:'dual-role@example.invalid',weekly_hours:40};
   const data={company_members:[{company_id:'company-a',role:'PLANNER',status:'ACTIVE',extra_permissions:['manage_time']}],employees:[own,{...own,id:'foreign-employee',auth_user_id:'someone-else',first_name:'Andere Person'}],companies:[{id:'company-a',name:'Testbetrieb',timezone:'Europe/Berlin'}],shift_assignments:[],absences:[],shift_change_requests:[],shift_templates:[],company_compliance_policy:[]};
   B.client={auth:{signInWithPassword:async()=>({data:{session:qa.session}})},rpc:async(name,args)=>{qa.calls.push({rpc:name,args});if(name!=='access_profile_context')throw Error('Unexpected RPC '+name);return {data:{role:'TEAM_LEAD',permissions:['manage_time'],personnel_employee_ids:['foreign-employee']}}},from(table){const filters=[];let single=false;const q={select(){return q},eq(k,v){filters.push([k,v]);return q},is(k,v){filters.push([k,v]);return q},not(){return q},order(){return q},single(){single=true;return q},maybeSingle(){single=true;return q},then(resolve,reject){qa.calls.push({table,filters});const rows=(data[table]||[]).filter(row=>filters.every(([k,v])=>k==='user_id'?v==='user-a':v===null?row[k]==null:row[k]===v));return Promise.resolve({data:single?rows[0]||null:rows}).then(resolve,reject)}};return q;}};
   B.ensureCompany=async()=>{throw Error('Unexpected bootstrap')};B.boot=async session=>{qa.managerBoot++;B.user=session.user;await B.ensureCompany();B.ready=true;return true};
   B.baseOpenApp=()=>{document.querySelector('#appShell').style.display='block';B.closeAuth()};B.showLoading=()=>{};B.hideLoading=()=>{};B.updateState=()=>{};B.hydrate=async()=>{};
  });
  for(const file of ['supabase-employee-access-v1','supabase-employee-access-guard-v1','time-only-access-v1','access-profiles-v1'])await page.addScriptTag({content:read('assets/'+file+'.js')});
  await page.evaluate(()=>SFBackend.authDialog('login'));
  await page.locator('[data-entry-area="'+area+'"]').click();await page.locator('#sfEmail').fill('dual-role@example.invalid');await page.locator('#sfPassword').fill('synthetic-password');await page.locator('#sfAuthSubmit').click();await page.waitForFunction(()=>SFBackend.ready);
  const state=await page.evaluate(()=>({role:SFBackend.role,accessRole:SFBackend.accessRole,canPlan:SFBackend.can('plan'),canManageTime:SFBackend.can('manageTime'),scope:SFBackend.personnelConversationEmployeeIds,employee:SFBackend.employeePortalData?.employee?.id,calls:qa.calls,managerBoot:qa.managerBoot}));
  assert.equal(new URL(page.url()).searchParams.get('bereich'),area);checks++;
  if(area==='mitarbeiter'){
   await page.locator('#sfEmployeePortal').waitFor();assert.match(await page.locator('#sfEmployeePortal').innerText(),/Hallo Alex/);assert.doesNotMatch(await page.locator('#sfEmployeePortal').innerText(),/Andere Person/);assert.equal(await page.locator('#appShell').count(),0);checks+=3;
   assert.equal(state.role,'EMPLOYEE');assert.equal(state.accessRole,'EMPLOYEE');assert.equal(state.canPlan,false);assert.equal(state.canManageTime,false);assert.deepEqual(state.scope,[]);assert.equal(state.employee,'employee-a');assert.equal(state.managerBoot,0);assert.equal(state.calls.some(c=>c.rpc==='access_profile_context'),false);checks+=8;
   for(const table of ['shift_assignments','absences','shift_change_requests']){const c=state.calls.find(c=>c.table===table);assert.ok(c.filters.some(([k,v])=>k==='employee_id'&&v==='employee-a'));assert.ok(c.filters.some(([k,v])=>k==='company_id'&&v==='company-a'));checks+=2;}
   await page.evaluate(async()=>{SFBackend.ready=false;await SFBackend.boot(qa.session)});assert.equal(await page.evaluate(()=>qa.managerBoot),0);assert.equal(await page.evaluate(()=>SFBackend.role),'EMPLOYEE');checks+=2;
  }else{
   assert.equal(state.role,'PLANNER');assert.equal(state.accessRole,'TEAM_LEAD');assert.equal(state.canPlan,true);assert.equal(state.canManageTime,true);assert.equal(state.managerBoot,1);assert.equal(await page.locator('#sfEmployeePortal').count(),0);assert.equal(await page.locator('#managerWorkspace').isVisible(),true);checks+=7;
  }
  assert.deepEqual(errors,[]);checks++;await context.close();
 }
 console.log('Portal entry browser QA passed: '+checks+' checks; employee/management selection, dual-role login, own-data hydration, session restoration, 390/1440px.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
