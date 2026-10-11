const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const {chromium}=require('playwright');const root=path.resolve(__dirname,'../..');
const fixture=`
window.lab={level:'aal1',factors:[],rpcCalls:0,enrollCalls:0,signouts:0,watchers:[],done:false};
window.SFBackend={ready:false,role:'OWNER',boot:async()=>{},client:{
 rpc:async()=>{lab.rpcCalls++;return lab.level==='aal2'?{data:'synthetic-protected-result',error:null}:{data:null,error:{message:'MFA_REQUIRED'}}},
 auth:{getSession:async()=>({data:{session:{user:{id:'synthetic-owner'}}}}),
 onAuthStateChange:fn=>{lab.watchers.push(fn);return{data:{subscription:{unsubscribe(){lab.watchers=lab.watchers.filter(x=>x!==fn)}}}}},
 signOut:async()=>{lab.signouts++;for(const fn of [...lab.watchers])fn('SIGNED_OUT');return{error:null}},
 mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:lab.level,nextLevel:lab.factors.some(x=>x.status==='verified')?'aal2':'aal1'}}),
 listFactors:async()=>({data:{totp:lab.factors}}),
 enroll:async()=>{lab.enrollCalls++;const f={id:'synthetic-factor',factor_type:'totp',status:'unverified'};lab.factors.push(f);return{data:{id:f.id,totp:{secret:'SYNTHETIC-TEST-SECRET',qr_code:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'}}}},
 unenroll:async({factorId})=>{lab.factors=lab.factors.filter(x=>x.id!==factorId);return{error:null}},
 challenge:async()=>({data:{id:'synthetic-challenge'}}),
 verify:async({code})=>{if(code!=='123456')return{error:{message:'Test: ungültiger Code'}};lab.level='aal2';lab.factors[0].status='verified';return{data:{}}}}}}};
`;
(async()=>{const browser=await chromium.launch({headless:true});try{for(const scenario of ['first-enrollment','parallel-startup','cancel']){const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('http://mfa.test/**',r=>r.fulfill({contentType:'text/html',body:'<html><body><h1>Isolierter MFA-Test</h1></body></html>'}));await page.goto('http://mfa.test/');await page.addScriptTag({content:fixture});await page.addScriptTag({content:fs.readFileSync(path.join(root,'assets/supabase-mfa-v1.js'),'utf8')});
 await page.evaluate(parallel=>{SFBackend.installMfaRpcRetry();lab.results=[];Promise.all(Array.from({length:parallel?2:1},()=>SFBackend.client.rpc('manager_absence_overview',{p_company_id:'synthetic-company'}))).then(rows=>{lab.results=rows;lab.done=true})},scenario==='parallel-startup');
 await page.locator('#sfMfaAdd').waitFor();assert.equal(await page.evaluate(()=>SFBackend.ready),false,'Enrollment must work during protected startup');
 if(scenario==='cancel'){await page.locator('#sfMfaSignOut').click();await page.waitForFunction(()=>lab.done);assert.equal(await page.evaluate(()=>lab.rpcCalls),1);assert.equal(await page.evaluate(()=>lab.results[0].data),null);assert.match(await page.evaluate(()=>lab.results[0].error.message),/abgebrochen/);assert.equal(await page.evaluate(()=>lab.signouts),1)}else{
 await page.locator('#sfMfaAdd').click();await page.locator('#sfMfaEnrollCode').fill('000000');await page.locator('#sfMfaEnrollVerify').click();assert.match(await page.locator('#sfMfaMsg').innerText(),/ungültiger Code/);assert.equal(await page.evaluate(()=>lab.done),false);
 await page.locator('#sfMfaEnrollCode').fill('123456');await page.locator('#sfMfaEnrollVerify').click();await page.waitForFunction(()=>lab.done);assert.equal(await page.evaluate(()=>lab.enrollCalls),1);assert.equal(await page.evaluate(()=>lab.rpcCalls),scenario==='parallel-startup'?4:2);assert.equal(await page.evaluate(()=>lab.level),'aal2');assert.equal(await page.evaluate(()=>lab.results.every(x=>x.data==='synthetic-protected-result')),true)}
 assert.equal(await page.evaluate(()=>lab.watchers.length),0);assert.deepEqual(errors,[]);console.log(JSON.stringify({scenario,passed:true}));await page.close();}
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
