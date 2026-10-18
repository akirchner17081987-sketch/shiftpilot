const {chromium}=require('@playwright/test');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const browser=await chromium.launch({headless:true});let passed=0;
 try{for(const [name,viewport] of [['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),calls=[];
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.hostname==='qr.invalid'){
    const file=path.join(root,url.pathname==='/'?'qr-time.html':url.pathname.slice(1));
    if(!file.startsWith(root+'/')||!fs.existsSync(file))return route.abort();
    return route.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':'image/svg+xml',body:fs.readFileSync(file)});
   }
   if(url.pathname==='/functions/v1/qr-independent'){
    const headers={'Access-Control-Allow-Origin':'https://qr.invalid','Access-Control-Allow-Headers':'content-type'};
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
    const input=request.postDataJSON();calls.push(input);
    if(input.action==='LOGIN'&&input.pin==='382719')return route.fulfill({status:401,headers,contentType:'application/json',body:JSON.stringify({ok:false,error:'Anmeldung nicht möglich.'})});
    return route.fulfill({headers,contentType:'application/json',body:JSON.stringify(input.action==='LOGIN'||input.action==='SET_PIN'?{ok:true,sessionToken:'f'.repeat(64)}:{ok:true,state:'READY',name:'Fiktive Testperson',breaks:[],timezone:'Europe/Berlin',terminal_name:'Fiktiver Standort'})});
   }
   throw new Error('Unexpected service request: '+url.hostname);
  });
  await page.goto('https://qr.invalid/qr-time.html?t='+'e'.repeat(64));
  assert.equal(await page.locator('#pin').isVisible(),true);assert.equal(await page.locator('#startDate').isVisible(),false);assert.equal(await page.locator('#pin').getAttribute('type'),'password');passed++;
  await page.locator('#personnel').fill('FIKTIV');await page.locator('#pin').fill('382719');await page.locator('#loginButton').click();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('nicht möglich'));
  assert.equal(await page.locator('#pin').inputValue(),'');assert.equal(calls.length,1);assert.ok(!('startDate' in calls[0]));passed++;
  await page.locator('#pin').fill('739281');await page.locator('#loginButton').click();await page.locator('#clock').waitFor();assert.equal(await page.locator('#pin').inputValue(),'');passed++;
  await page.locator('#logout').click();await page.locator('#loginMode').selectOption('SETUP');await page.locator('#setupCode').fill('482719530618');await page.locator('#pin').fill('739281');await page.locator('#pinRepeat').fill('982741');const before=calls.length;
  await page.locator('#loginButton').click();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('nicht überein'));assert.equal(calls.length,before);passed++;
  await page.locator('#setupCode').fill('482719530618');await page.locator('#pin').fill('739281');await page.locator('#pinRepeat').fill('739281');await page.locator('#loginButton').click();await page.locator('#clock').waitFor();const setup=calls.find(x=>x.action==='SET_PIN');assert.equal(setup.setupCode,'482719530618');assert.equal(await page.locator('#setupCode').inputValue(),'');assert.equal(await page.locator('#pinRepeat').inputValue(),'');passed++;
  await page.locator('#logout').click();await page.locator('#loginMode').selectOption('LEGACY');await page.locator('#startDate').fill('15012020');await page.locator('#loginButton').click();await page.locator('#clock').waitFor();assert.equal(calls.findLast(x=>x.action==='LOGIN').startDate,'2020-01-15');passed++;
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);passed++;
  await context.close();
 }
 // Exercise actual admin UI with synthetic role/session responses, without any live services.
 for(const [name,viewport] of [['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport}),page=await context.newPage();
  await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><section id="view-time" class="active"></section></body></html>');
  await page.evaluate(()=>{
   window.syntheticCalls=[];window.syntheticMfa=0;window.desktopEnabled=false;
   window.SFBackend={role:'OWNER',companyId:'company',user:{id:'owner'},requireSensitiveMfa:async()=>{window.syntheticMfa++},client:{rpc:async(name,args)=>{
    window.syntheticCalls.push({name,...args});
    if(name==='manager_list_time_qr_terminals')return{data:[{id:'terminal',name:'Fiktiver Standort',is_active:true}]};
    if(name==='manager_qr_desktop_access'){if(args.p_terminal_id)window.desktopEnabled=args.p_enabled;return{data:[{id:'terminal',desktop_enabled:window.desktopEnabled}]}};
    if(args.p_action==='ISSUE_CODE')return{data:{ok:true,setup_code:'482719530618'}};
    return{data:{ok:true,pin_required:false,employees:[{employee_id:'employee',name:'Fiktive Testperson',personnel_no:'FIKTIV',pin_ready:false,legacy_allowed:true}]}};
   }}};
  });
  await page.addScriptTag({path:path.join(root,'assets/supabase-qr-terminal-admin-v1.js')});
  await page.evaluate(()=>window.SFBackend.qrTerminalAdmin.refresh());
  page.on('dialog',d=>d.accept());await page.locator('[data-qrt-desktop]').click();await page.waitForFunction(()=>window.desktopEnabled);
  await page.waitForFunction(()=>document.querySelector('[data-qrt-desktop]').textContent.includes('ausschalten'));
  assert.ok(await page.evaluate(()=>window.syntheticCalls.some(c=>c.name==='manager_qr_desktop_access'&&c.p_terminal_id==='terminal'&&c.p_enabled===true&&c.p_expected_enabled===false)));passed++;
  assert.equal(await page.locator('#sfQrTerminalAdmin > :first-child').getAttribute('id'),'sfQrPinAccess');assert.equal(await page.locator('#sfQrPinAdminOpen').isVisible(),true);await page.locator('#sfQrPinAdminOpen').click();await page.locator('#sfQrPinAdminModal').waitFor();assert.equal(await page.locator('#sfQrPinEnable').isDisabled(),true);assert.ok(await page.evaluate(()=>window.syntheticMfa>0));passed++;
  await page.locator('[data-pin-code]').click();await page.locator('#sfQrPinSetupCode').waitFor();assert.equal(await page.locator('#sfQrPinSetupCode').textContent(),'482719530618');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);passed++;
  await page.evaluate(()=>window.SFBackend.companyId='different');await page.locator('#sfQrPinAdminModal').waitFor({state:'detached'});assert.equal(await page.locator('#sfQrPinSetupCode').count(),0);passed++;
  await context.close();
 }
 console.log(JSON.stringify({passed,viewports:['desktop','mobile'],realServiceCalls:0}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
