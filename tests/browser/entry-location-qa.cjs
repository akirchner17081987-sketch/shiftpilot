// Cinematic login with the real form, role resolution, employee hydration and geographic engine;
// synthetic account/session and transport, no live authentication or data changes.
const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('dist/index.html'),overlay=html.slice(html.indexOf('<div id="sfEntryOverlay"'),html.indexOf('<section id="landingPage">')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
(async()=>{const browser=await chromium.launch({headless:true});let checks=0;try{
 for(const {width,area,team,motion='no-preference',noEngine=false,role='PLANNER',linked=true} of [
  ...[390,1440].flatMap(width=>['mitarbeiter','verwaltung'].map(area=>({width,area,team:width===390?'Leipzig':'Recklinghausen'}))),
  {width:320,area:'mitarbeiter',team:'Recklinghausen',motion:'reduce'},
  {width:390,area:'mitarbeiter',team:'Leipzig',noEngine:true},
  {width:390,area:'mitarbeiter',team:'Standortleitung'},
  ...[390,1440].map(width=>({width,area:'verwaltung',team:'',role:'ADMIN',linked:false}))
 ]){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:motion}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{const url=new URL(r.request().url());if(noEngine&&url.pathname.endsWith('/location-map-engine-v1.js'))return r.abort();if(url.pathname.startsWith('/assets/')){const file=path.resolve(root,'dist','.'+url.pathname);if(!file.startsWith(path.join(root,'dist','assets')+path.sep)||!fs.existsSync(file))return r.abort();return r.fulfill({contentType:file.endsWith('.webp')?'image/webp':'application/javascript',body:fs.readFileSync(file)});}return r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="de"><head><meta charset="utf-8"></head><body>'+overlay+'<section id="landingPage"></section><div id="appShell" style="display:none"><div class="side-bottom"><div class="user-row"><small></small></div></div><main id="managerWorkspace">Verwaltung</main></div></body></html>'});});
  await page.goto('https://portal-entry.invalid/');await page.addStyleTag({content:read('assets/sf-entry-v2.css')+read('assets/sf-entry-access-v1.css')+read('assets/sf-entry-dive-v1.css')});
  await page.evaluate(()=>{window.openApp=()=>{};});
  for(const file of ['globe-surface-v1','sf-entry-v2','sf-entry-access-v1','sf-entry-globe-v1','sf-entry-location-v1','sf-entry-dive-v1','supabase-auth-errors-v1','supabase-auth-v1'])await page.addScriptTag({content:read('assets/'+file+'.js')});
  assert.equal(await page.evaluate(()=>SFGlobeSurface.prepare()),true,'own authored surface is loaded for the actual login test');
  await page.evaluate(({team,role,linked})=>{
   window.qa={calls:[],managerBoot:0,session:{user:{id:'user-a',email:'dual-role@example.invalid'}}};const B=SFBackend;
   const own={id:'employee-a',company_id:'company-a',auth_user_id:'user-a',first_name:'Alex',last_name:'Fiktiv',status:'active',access_status:'ACTIVE',deleted_at:null,email:'dual-role@example.invalid',weekly_hours:40,qualifications:['__sp:team='+team]};
   const data={company_members:[{company_id:'company-a',role,status:'ACTIVE',extra_permissions:['manage_time']}],employees:linked?[own,{...own,id:'foreign-employee',auth_user_id:'someone-else',first_name:'Andere Person'}]:[],companies:[{id:'company-a',name:'Testbetrieb',timezone:'Europe/Berlin'}],shift_assignments:[],absences:[],shift_change_requests:[],shift_templates:[],company_compliance_policy:[]};
   B.client={auth:{signInWithPassword:async()=>({data:{session:qa.session}})},rpc:async(name,args)=>{qa.calls.push({rpc:name,args});if(name!=='access_profile_context')throw Error('Unexpected RPC '+name);return {data:{role:role==='ADMIN'?'ADMIN':'TEAM_LEAD',permissions:['manage_time'],personnel_employee_ids:['foreign-employee']}}},from(table){const filters=[];let single=false;const q={select(){return q},eq(k,v){filters.push([k,v]);return q},is(k,v){filters.push([k,v]);return q},not(){return q},order(){return q},single(){single=true;return q},maybeSingle(){single=true;return q},then(resolve,reject){qa.calls.push({table,filters});const rows=(data[table]||[]).filter(row=>filters.every(([k,v])=>k==='user_id'?v==='user-a':v===null?row[k]==null:row[k]===v));return Promise.resolve({data:single?rows[0]||null:rows}).then(resolve,reject)}};return q;}};
   B.ensureCompany=async()=>{throw Error('Unexpected bootstrap')};B.boot=async session=>{qa.managerBoot++;B.user=session.user;await B.ensureCompany();B.ready=true;return true};
   B.baseOpenApp=()=>{document.querySelector('#appShell').style.display='block';B.closeAuth()};B.showLoading=()=>{};B.hideLoading=()=>{};B.updateState=()=>{};B.hydrate=async()=>{};
  },{team,role,linked});
  for(const file of ['supabase-employee-access-v1','supabase-employee-access-guard-v1','time-only-access-v1','access-profiles-v1'])await page.addScriptTag({content:read('assets/'+file+'.js')});
  if(!linked)await page.evaluate(async()=>{
   await SFEntryDive.prepare();
   const d3=SFLocationMapEngine.d3,orthographic=d3.geoOrthographic;
   d3.geoOrthographic=function(...args){
    const projection=orthographic(...args),rotate=projection.rotate;
    projection.rotate=function(value){if(value)window.diveCenter=[-value[0],-value[1]];return rotate.apply(this,arguments)};
    return projection;
   };
   window.diveRadius=0;window.diveInitialRadius=null;
   const arc=CanvasRenderingContext2D.prototype.arc;
   CanvasRenderingContext2D.prototype.arc=function(...args){if(this.canvas.id==='sfEntryDiveCanvas'){if(window.diveInitialRadius===null)window.diveInitialRadius=args[2];window.diveRadius=Math.max(window.diveRadius,args[2]);}return arc.apply(this,args)};
  });
  await page.evaluate(()=>SFBackend.authDialog('login'));
  await page.locator('[data-entry-area="'+area+'"]').click();await page.locator('#sfEmail').fill('dual-role@example.invalid');await page.locator('#sfPassword').fill('synthetic-password');await page.locator('#sfAuthSubmit').click();await page.waitForFunction(()=>SFBackend.ready);
  if(motion!=='reduce'&&!noEngine){
  await page.waitForFunction(()=>document.getElementById('sfEntryOverlay')?.classList.contains('sf-entry-success'));
  assert.equal(await page.locator('#sfEntryWelcomeTitle').innerText(),!team||team==='Standortleitung'?'Willkommen bei SchichtFunk.':'Willkommen in '+team+'.');checks++;
  assert.equal(await page.locator('#sfEntryDiveCanvas').count(),1);checks++;
  assert.equal(await page.locator('#sfAuthBackdrop').count(),1,'the actual form remains for its fade');checks++;
  assert.equal(await page.locator('#sfPassword').inputValue(),'','password is cleared before the fade');checks++;
  await page.waitForTimeout(2300);
  const out=path.join(root,'test-results/entry-location');fs.mkdirSync(out,{recursive:true});
  await page.screenshot({path:path.join(out,area+'-'+team+'-focus.png')});
  if(!linked){
   // Compare the actual first and maximum drawn radii. Screenshot/GPU latency can
   // place a wall-clock 'before' sample near the end of the six-second animation.
   await page.waitForFunction(()=>diveInitialRadius>0&&diveRadius>diveInitialRadius*12,{},{timeout:6000});
   const {before,after}=await page.evaluate(()=>({before:diveInitialRadius,after:diveRadius}));
   assert.ok(after>before*12,'unassigned admin actually zooms into the globe: '+before+' -> '+after);checks++;
   const destination=await page.evaluate(()=>{const {d3,countries}=SFLocationMapEngine;const germany=countries.features.find(f=>f.properties?.id==='DEU');return {center:diveCenter,inGermany:!!germany&&d3.geoContains(germany,diveCenter)}});
   assert.equal(destination.inGermany,true,'unassigned admin camera must enter Germany, received '+JSON.stringify(destination.center));checks++;
   assert.equal(await page.locator('#sfEntryWelcomeTitle').innerText(),'Willkommen bei SchichtFunk.');checks++;
   await page.screenshot({path:path.join(out,'admin-no-workplace-'+width+'-zoom.png')});
  }
  if(linked&&width===1440&&area==='verwaltung'){
    await page.evaluate(()=>{const m=document.createElement('div');m.id='sfMfaModal';m.textContent='Synthetic security challenge';document.body.appendChild(m)});
    await page.waitForFunction(()=>!document.getElementById('sfEntryOverlay').classList.contains('sf-entry-success'));
    assert.equal(await page.locator('#sfEntryDiveCanvas').count(),0);checks++;
    assert.equal(await page.locator('#sfEntryOverlay').count(),1);checks++;
    await page.evaluate(()=>document.getElementById('sfMfaModal').remove());
    await page.waitForFunction(()=>document.getElementById('sfEntryOverlay')?.classList.contains('sf-entry-success'));
  }
  }
  await page.locator('#sfEntryOverlay').waitFor({state:'detached',timeout:12000});checks++;
  const state=await page.evaluate(()=>({role:SFBackend.role,accessRole:SFBackend.accessRole,canPlan:SFBackend.can('plan'),canManageTime:SFBackend.can('manageTime'),scope:SFBackend.personnelConversationEmployeeIds,employee:SFBackend.employeePortalData?.employee?.id,calls:qa.calls,managerBoot:qa.managerBoot}));
  assert.equal(new URL(page.url()).searchParams.get('bereich'),area);checks++;
  if(area==='mitarbeiter'){
   await page.locator('#sfEmployeePortal').waitFor();assert.match(await page.locator('#sfEmployeePortal').innerText(),/Hallo Alex/);assert.doesNotMatch(await page.locator('#sfEmployeePortal').innerText(),/Andere Person/);assert.equal(await page.locator('#appShell').count(),0);checks+=3;
   assert.equal(state.role,'EMPLOYEE');assert.equal(state.accessRole,'EMPLOYEE');assert.equal(state.canPlan,false);assert.equal(state.canManageTime,false);assert.deepEqual(state.scope,[]);assert.equal(state.employee,'employee-a');assert.equal(state.managerBoot,0);assert.equal(state.calls.some(c=>c.rpc==='access_profile_context'),false);checks+=8;
   for(const table of ['shift_assignments','absences','shift_change_requests']){const c=state.calls.find(c=>c.table===table);assert.ok(c.filters.some(([k,v])=>k==='employee_id'&&v==='employee-a'));assert.ok(c.filters.some(([k,v])=>k==='company_id'&&v==='company-a'));checks+=2;}
   await page.evaluate(async()=>{SFBackend.ready=false;await SFBackend.boot(qa.session)});assert.equal(await page.evaluate(()=>qa.managerBoot),0);assert.equal(await page.evaluate(()=>SFBackend.role),'EMPLOYEE');checks+=2;
  }else{
   assert.equal(state.role,role);assert.equal(state.accessRole,role==='ADMIN'?'ADMIN':'TEAM_LEAD');assert.equal(state.canPlan,true);assert.equal(state.canManageTime,true);assert.equal(state.managerBoot,1);assert.equal(await page.locator('#sfEmployeePortal').count(),0);assert.equal(await page.locator('#managerWorkspace').isVisible(),true);checks+=7;
  }
  assert.deepEqual(errors,[]);checks++;await context.close();
 }
 console.log('Location login browser QA passed: '+checks+' checks; Leipzig/Recklinghausen employee and team leader logins, retained real login fade, protected reveal, MFA interruption, 320/390/1440px, reduced motion, missing workplace, unassigned admins with measured camera zoom into Germany and failed geometry loading.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
