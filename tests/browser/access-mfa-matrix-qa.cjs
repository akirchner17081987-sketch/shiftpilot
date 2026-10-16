// Browser-only authorization UX checks with synthetic auth responses; no service credentials.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 let checks=0;
 try{
  for(const mobile of [false,true]){
   const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:900}});
   await page.route('https://security-fixture.invalid/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body><div id="correction" style="position:fixed;inset:0;z-index:38000;background:#123">Synthetic correction</div></body>'}));
   await page.goto('https://security-fixture.invalid/');
   await page.evaluate(()=>{
    const state=window.authFixture={aal:'aal1',factor:true,calls:0,challenges:0,signedOut:false};
    window.SFBackend={role:'TIME_TRACKING',accessRole:'EMPLOYEE',ready:true,can:key=>['manageTime','confirmTime'].includes(key),boot:async()=>true,client:{
     rpc:async()=>{state.calls++;return state.aal==='aal2'?{data:{ok:true}}:{error:{message:'MFA_REQUIRED'}};},
     auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),refreshSession:async()=>({}),signOut:async()=>{state.signedOut=true;state.aal='aal1';return{};},mfa:{
      getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:state.aal,nextLevel:state.factor?'aal2':'aal1'}}),
      listFactors:async()=>({data:{totp:state.factor?[{id:'synthetic-factor',factor_type:'totp',status:'verified'}]:[]}}),
      challenge:async()=>{state.challenges++;return{data:{id:'synthetic-challenge'}};},
      verify:async({code})=>{if(code!=='123456')return{error:{message:'Falscher Code'}};state.aal='aal2';state.factor=true;return{data:{}};},
      enroll:async()=>({data:{id:'synthetic-factor',totp:{qr_code:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',secret:'SYNTHETIC-NONSECRET'}}}),
      unenroll:async()=>({})
     }}
    }};
   });
   await page.addScriptTag({content:fs.readFileSync('assets/supabase-mfa-v1.js','utf8')});
   await page.evaluate(()=>{SFBackend.installMfaRpcRetry();window.pending=SFBackend.client.rpc('synthetic_time_correction');});
   await page.locator('#sfMfaCode').waitFor();
   assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#sfMfaModal')).zIndex),'100000');checks++;
   await page.locator('#sfMfaCode').fill('000000');await page.locator('#sfMfaVerify').click();
   await page.locator('#sfMfaMsg').filter({hasText:'Falscher Code'}).waitFor();assert.equal(await page.evaluate(()=>authFixture.calls),1);checks++;
   await page.locator('#sfMfaCode').fill('123456');await page.locator('#sfMfaVerify').click();
   assert.equal((await page.evaluate(()=>pending)).data.ok,true);assert.equal(await page.evaluate(()=>authFixture.calls),2);checks++;
   await page.evaluate(()=>SFBackend.client.rpc('another_sensitive_action'));assert.equal(await page.evaluate(()=>authFixture.challenges),2); // one bad and one successful code attempt
   assert.equal(await page.locator('#sfMfaModal').count(),0);checks++;
   await page.evaluate(()=>{authFixture.aal='aal1';authFixture.factor=false;window.pending=SFBackend.requireSensitiveMfa();});
   await page.locator('#sfMfaAdd').click();await page.locator('#sfMfaEnrollCode').fill('123456');await page.locator('#sfMfaEnrollVerify').click();
   assert.equal(await page.evaluate(()=>pending),true);assert.equal(await page.evaluate(()=>authFixture.aal),'aal2');checks++;
   await page.evaluate(()=>{authFixture.aal='aal1';window.beforeCancel=authFixture.calls;window.pending=SFBackend.client.rpc('cancelled_sensitive_action');});
   await page.locator('#sfMfaCancel').click();const cancelled=await page.evaluate(()=>pending);assert.ok(cancelled.error);assert.equal(await page.evaluate(()=>authFixture.calls-beforeCancel),1);checks++;
   await page.close();
  }
  console.log(JSON.stringify({passed:checks,viewports:['desktop','mobile'],realServiceCalls:0}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
