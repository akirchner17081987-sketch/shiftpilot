const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'test-results/employee-orbit');fs.mkdirSync(out,{recursive:true});
const fixture=fs.readFileSync(path.join(__dirname,'employee-absences-qa.cjs'),'utf8').match(/const fixture=String.raw`([\s\S]*?)`;/)[1];
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.SF_QA_CHROMIUM||chromium.executablePath()});try{
 for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}],['small-mobile',{width:360,height:780}],['short-desktop',{width:1100,height:600}]]){
  const page=await browser.newPage({viewport,locale:'de-DE'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='sf.test')return route.abort();if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:html});try{const p=path.join(root,u.pathname);return route.fulfill({contentType:p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':p.endsWith('.png')?'image/png':'image/svg+xml',body:fs.readFileSync(p)})}catch{return route.fulfill({status:404,body:''})}});
  await page.goto('http://sf.test/');await page.waitForFunction(()=>window.SFBackend?.__loaderInitStarted);
  await page.evaluate(fixture.replace('window.SFBackend={','Object.assign(window.SFBackend,{').replace(/confirmSignOut:async\(\)=>\{\}\};/,'confirmSignOut:async()=>{window.__logoutCalls=(window.__logoutCalls||0)+1}});'));
  await page.evaluate(()=>{SFBackend.closeAuth?.();SFBackend.hideLoading?.();SFBackend.openEmployeePortal();SFBackend.employeePortalNavigate('dashboard')});
  const portal=page.locator('#sfEmployeePortal'),dock=portal.locator('.sf-orbit-dock'),popup=portal.locator('#sfEmployeeOrbitPopup');await dock.waitFor();await page.waitForTimeout(1700);
  assert.equal(await dock.locator('button').count(),4);assert.equal(await portal.locator('.sf-employee-side').isVisible(),false);
  assert.equal(await page.locator('#sfEmployeeMobileDock').isVisible().catch(()=>false),false);
  await page.screenshot({path:path.join(out,name+'-dashboard.png')});
  const expected={duties:['shifts','disruptions','marketplace','handover'],requests:['time','changes','swaps','absences','wishes'],account:['account','wage','profile']};
  for(const [group,views] of Object.entries(expected)){
   const trigger=dock.locator('[data-employee-orbit="'+group+'"]');await trigger.click();await popup.waitFor({state:'visible'});
   assert.deepEqual(await popup.locator('[data-employee-orbit-view]').evaluateAll(nodes=>nodes.map(n=>n.dataset.employeeOrbitView)),views);
   assert.equal(await popup.evaluate(n=>n.contains(document.activeElement)),true);
   assert.equal(await popup.evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight}),true);
   await page.keyboard.press('Escape');assert.equal(await trigger.getAttribute('aria-expanded'),'false');assert.equal(await trigger.evaluate(n=>n===document.activeElement),true);
   for(const view of views){await trigger.click();await popup.locator('[data-employee-orbit-view="'+view+'"]').click();assert.equal(await portal.getAttribute('data-sf-portal-active'),view);assert.equal(await popup.getAttribute('aria-hidden'),'true');assert.equal(await trigger.getAttribute('aria-current'),'true');assert.equal(await portal.locator('.sf-portal-stats').isVisible(),false)}
  }
  await dock.locator('[data-employee-orbit="requests"]').click();await page.screenshot({path:path.join(out,name+'-menu.png')});
  await page.keyboard.press('Escape');await dock.locator('[data-employee-orbit="home"]').click();
  const layout=await portal.evaluate(p=>{const top=p.querySelector('.sf-portal-top').getBoundingClientRect(),main=p.querySelector('.sf-portal-main').getBoundingClientRect(),dock=p.querySelector('.sf-orbit-dock').getBoundingClientRect();return {overlap:main.top<top.bottom-1,overflow:p.scrollWidth>innerWidth,dockVisible:dock.bottom<=innerHeight&&dock.top>0}});assert.deepEqual(layout,{overlap:false,overflow:false,dockVisible:true});
  await portal.locator('.sf-employee-theme').click();assert.equal(await page.locator('html').getAttribute('data-sf-theme'),'light');assert.equal(await portal.evaluate(p=>getComputedStyle(p).backgroundColor),'rgb(220, 225, 239)');
  await page.waitForTimeout(250);await page.screenshot({path:path.join(out,name+'-light.png')});await portal.locator('.sf-employee-theme').click();
  // A live count refresh must not detach the pressed controls or close the menu.
  await dock.locator('[data-employee-orbit="duties"]').click();await page.evaluate(()=>{document.querySelector('.sf-employee-tile [data-count-for="shifts"]').textContent='7'});await page.waitForTimeout(100);assert.equal(await popup.getAttribute('aria-hidden'),'false');
  await page.keyboard.press('Escape');await portal.locator('#sfEmployeeLogout').click();assert.equal(await page.evaluate(()=>__logoutCalls),1);
  // Reduced motion must remove the decorative opening animation.
  await page.emulateMedia({reducedMotion:'reduce'});await dock.locator('[data-employee-orbit="duties"]').click();assert.equal(await popup.locator('.sf-orbit-motion-frame').evaluate(n=>n.getAnimations().length),0);
  await page.keyboard.press('Escape');
  // Rebuilds and company switches receive exactly one fresh dock, preserving the view.
  await page.evaluate(()=>{SFBackend.employeePortalData.company={id:'other-company',name:'Zweites Unternehmen'};SFBackend.employeePortalData.employee.updated_at=new Date().toISOString();SFBackend.openEmployeePortal()});await page.waitForTimeout(850);assert.equal(await portal.locator('.sf-orbit-dock').count(),1);assert.match(await portal.locator('.sf-portal-brand').textContent(),/Zweites Unternehmen/);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({name,passed:true,views:13}));await page.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
