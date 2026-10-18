const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../assets/push-notifications-v1.js'),'utf8');
(async()=>{
 const browser=await chromium.launch({headless:true});let passed=0;
 try{
 for(const width of [360,768,1440]){
  const context=await browser.newContext({viewport:{width,height:950}});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:8px"><main id="sfEmployeePortal"><div class="sf-employee-dashboard"></div></main><section id="sfNotifyPanel"><div class="sf-notify-head"></div></section></body></html>'}));
  await page.goto('https://schichtfunk.de/');
  await page.evaluate(()=>{
   window.qa={calls:[],permissionRequests:0,subscription:null,serverId:null,mode:'granted'};
   const notification={permission:'default',requestPermission:async()=>{qa.permissionRequests++;notification.permission=qa.mode;return qa.mode;}};
   Object.defineProperty(window,'Notification',{configurable:true,value:notification});window.PushManager=function(){};
   const reg={active:true,update:async()=>{},pushManager:{getSubscription:async()=>qa.subscription,subscribe:async options=>{
    qa.calls.push('subscribe');qa.subscription={endpoint:'https://example.invalid/fake',toJSON:()=>({endpoint:'https://example.invalid/fake',keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}}),unsubscribe:async()=>{qa.calls.push('unsubscribe');qa.subscription=null;return true;}};return qa.subscription;}}};
   Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{getRegistration:async()=>reg,register:async()=>reg,ready:Promise.resolve(reg)}});
   window.SFBackend={user:{id:'fictional-user'},companyId:'fictional-company',role:'EMPLOYEE',client:{rpc:async(name,args)=>{qa.calls.push(name);if(qa.failRegister&&name==='register_push_subscription')return {error:{message:'network failed'}};if(name==='register_push_subscription')qa.serverId='fake-id';if(name==='unregister_push_subscription')qa.serverId=null;return {data:name==='get_push_public_key'?btoa(String.fromCharCode(4,...new Array(64).fill(1))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,''):'ok'};},from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:qa.serverId?{id:qa.serverId,enabled:true}:null})};return q;}}};
  });
  await page.addScriptTag({content:source});
  const card=page.locator('#sfEmployeePushCard');await card.locator('[data-sf-push-enable]').waitFor();
  assert.equal(await page.evaluate(()=>qa.permissionRequests),0);
  await card.locator('[data-sf-push-enable]').click();await card.locator('[data-sf-push-test]').waitFor();
  assert.equal(await page.evaluate(()=>qa.permissionRequests),1);
  await card.locator('[data-sf-push-test]').click();await page.waitForFunction(()=>qa.calls.includes('send_push_test'));
  await card.locator('[data-sf-push-disable]').click();await page.waitForFunction(()=>qa.calls.includes('unsubscribe'));
  assert.equal(await page.evaluate(()=>qa.serverId),null);
  await page.evaluate(()=>{Notification.permission='default';qa.mode='denied'});
  await card.locator('[data-sf-push-enable]').click();await page.waitForFunction(()=>document.querySelector('#sfEmployeePushCard')?.textContent.includes('blockiert'));
  await page.evaluate(()=>{Notification.permission='default';qa.mode='granted';qa.failRegister=true});
  await card.locator('[data-sf-push-enable]').click();await page.waitForFunction(()=>document.querySelector('#sfEmployeePushCard')?.textContent.includes('Internetverbindung'));
  assert.ok(await card.locator('[data-sf-push-enable]').count());
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Push UI overflows');assert.deepEqual(errors,[]);
  passed+=7;await context.close();
 }
 const ios=await browser.newContext({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 Version/18.4 Mobile/15E148 Safari/604.1'});const p=await ios.newPage();await p.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<div id="sfEmployeePortal"><div class="sf-employee-dashboard"></div></div>'}));await p.goto('https://schichtfunk.de/');await p.addScriptTag({content:source});assert.equal(await p.evaluate(()=>SFBackend.pushNotifications.compatibility()[0]),'ios-install');passed++;await ios.close();
 console.log(`Push browser QA passed: ${passed} checks; activation, permission denial, test action, unsubscribe, server failure, iOS install guidance, 360/768/1440px. All browser APIs mocked; no real messages sent.`);
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
