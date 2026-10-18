// Real entry, form and scanner assets; synthetic auth/camera, no live service calls.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),dist=path.join(root,'dist');
const source=fs.readFileSync(path.join(dist,'index.html'),'utf8');
const overlay=source.slice(source.indexOf('<div id="sfEntryOverlay"'),source.indexOf('<section id="landingPage">')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
const fixture=`window.qa={authCalls:0,cameraCalls:0,stopped:0};const B=window.SFBackend;B.client={auth:{signInWithPassword:async()=>{qa.authCalls++;return {error:new Error('Synthetic invalid credentials')}}}};B.showLoading=()=>{};B.hideLoading=()=>{};B.authDialog('login');`;
let server,browser,passed=0;
const check=(actual,expected,message)=>{assert.equal(actual,expected,message);passed++};
async function main(){
 server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/qa-init.js'){res.setHeader('Content-Type','application/javascript');return res.end(fixture)}
  if(url.pathname==='/'){
   res.setHeader('Content-Type','text/html');
   res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; media-src 'self' blob:; object-src 'none'; base-uri 'self'");
   return res.end('<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/sf-entry-v2.css"><link rel="stylesheet" href="/assets/sf-entry-access-v1.css"></head><body>'+overlay+['sf-entry-v2','sf-entry-access-v1','sf-entry-globe-v1','supabase-auth-v1'].map(n=>'<script defer src="/assets/'+n+'.js"></script>').join('')+'<script defer src="/qa-init.js"></script></body></html>');
  }
  const route=url.pathname==='/qr-time'?'/qr-time.html':url.pathname;
  const file=path.resolve(dist,'.'+route);
  if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end()}
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'image/svg+xml');res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});
 for(const width of [1440,390,320]){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],external=[];
  context.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external.push(route.request().url());return route.abort()}return route.continue()});
  await page.goto(origin);await page.locator('#sfEntryChoice').waitFor({state:'visible'});
  check(await page.locator('[data-entry-area]').count(),3,'three choices');check(await page.locator('#sfEmail').isVisible(),false,'no premature email login');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no overflow '+width);
  await page.evaluate(()=>window.originalAuth=document.getElementById('sfAuthBackdrop'));
  for(const area of ['mitarbeiter','verwaltung']){
   await page.locator('[data-entry-area="'+area+'"]').click();await page.locator('#sfEmail').waitFor({state:'visible'});
   check(await page.locator('#sfAuthTitle').innerText(),area==='mitarbeiter'?'Mitarbeiterportal':'Verwaltung');
   check(await page.evaluate(()=>originalAuth===document.getElementById('sfAuthBackdrop')),true,'same real form and listeners');
   await page.locator('#sfEmail').fill('synthetic@example.invalid');await page.locator('#sfPassword').fill('synthetic-password');await page.locator('#sfAuthSubmit').click();
   await page.waitForFunction(()=>document.getElementById('sfAuthMsg').textContent.length>0);
   await page.locator('#sfEntryBack').click();check(await page.locator('#sfPassword').inputValue(),'','password cleared on return');
   check(await page.evaluate(()=>SFBackend.role),null,'selection cannot grant a role');
  }
  check(await page.evaluate(()=>qa.authCalls),2,'real auth callback remains wired');
  await page.locator('[data-entry-area="zeit"]').click();await page.locator('#sfEntryTime').waitFor({state:'visible'});
  check(await page.locator('#sfEmail').isVisible(),false,'QR entry does not show email');
  await page.locator('#sfEntryTimeAccount').click();check(await page.locator('#sfAuthTitle').innerText(),'Zeiterfassung');check(await page.evaluate(()=>SFBackend.pendingView),'time');
  await page.locator('#sfEntryBack').click();check(new URL(page.url()).searchParams.has('bereich'),false,'return restores entry URL');
  await page.goto(origin+'/?bereich=mitarbeiter');await page.locator('#sfEmail').waitFor({state:'visible'});check(await page.locator('#sfAuthTitle').innerText(),'Mitarbeiterportal');
  await page.goto(origin+'/#app');await page.locator('#sfEmail').waitFor({state:'visible'});check(await page.locator('#sfAuthTitle').innerText(),'Verwaltung','legacy direct login remains available');
  await page.evaluate(()=>{const reset=document.createElement('div');reset.id='sfPasswordResetBackdrop';document.body.appendChild(reset)});
  await page.waitForFunction(()=>document.getElementById('sfEntryOverlay').inert);
  check(await page.locator('#sfEntryOverlay').evaluate(n=>getComputedStyle(n).zIndex),'24000','recovery dialog is above entry');
  await page.evaluate(()=>document.getElementById('sfPasswordResetBackdrop').remove());await page.waitForFunction(()=>!document.getElementById('sfEntryOverlay').inert);
  await page.goto(origin+'/?bereich=zeit');await page.locator('#sfEntryScan').waitFor({state:'visible'});check(await page.locator('#sfEntryDesktopTime').getAttribute('href'),'/qr-time?entry=desktop','PC clock direct entry');
  await page.evaluate(()=>{Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{qa.cameraCalls++;throw Object.assign(new Error('No synthetic camera'),{name:'NotFoundError'})}})});
  check(await page.evaluate(()=>qa.cameraCalls),0,'camera only starts on explicit click');
  await page.locator('#sfEntryScan').click();await page.locator('#sfQrScannerModal').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('.sf-qr-scan-status').textContent.includes('Keine Kamera'));
  check(await page.evaluate(()=>qa.cameraCalls),1);await page.getByRole('button',{name:'Scanner schließen'}).click();check(await page.locator('#sfEntryScan').evaluate(n=>n===document.activeElement),true,'scanner returns focus');
  // Close before a delayed camera permission resolves; no stream may survive.
  await page.evaluate(()=>{Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:()=>new Promise(resolve=>window.resolveCamera=resolve)})});
  await page.locator('#sfEntryScan').click();await page.locator('#sfQrScannerModal').waitFor({state:'visible'});await page.getByRole('button',{name:'Scanner schließen'}).click();
  await page.evaluate(()=>resolveCamera({getTracks:()=>[{stop(){qa.stopped++}}]}));await page.waitForFunction(()=>qa.stopped===1);check(await page.locator('#sfQrScannerModal').count(),0,'late stream disposed');
  await page.evaluate(()=>{
   Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>new MediaStream()});
   HTMLMediaElement.prototype.play=async()=>{};Object.defineProperty(HTMLMediaElement.prototype,'readyState',{configurable:true,get:()=>4});
   window.BarcodeDetector=class{static async getSupportedFormats(){return ['qr_code']}async detect(){return window.syntheticQr?[{rawValue:syntheticQr}]:[]}};
   window.syntheticQr='https://untrusted.invalid/qr-time?t='+'e'.repeat(64);
  });
  await page.locator('#sfEntryScan').click();await page.waitForFunction(()=>document.querySelector('.sf-qr-scan-status').textContent.includes('gehört nicht'));
  check(new URL(page.url()).pathname,'/','foreign QR target rejected');
  await page.evaluate(()=>window.syntheticQr=location.origin+'/qr-time.html?t='+'e'.repeat(64));
  await page.waitForURL('**/qr-time?t=*');await page.locator('#pin').waitFor({state:'visible'});check(await page.locator('#personnel').isVisible(),true,'valid QR reaches real personal PIN page');
  check(external.length,0,'zero live service requests');assert.deepEqual(errors,[]);passed++;
  await context.close();
 }
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 await page.goto(origin);await page.locator('#sfEntryChoice').waitFor({state:'visible'});await page.locator('[data-entry-area="verwaltung"]').click();
 await page.waitForFunction(()=>!document.getElementById('sfEntrySelected').hidden);
 check(await page.locator('#sfEntrySelected').evaluate(n=>n.getAnimations().length>0),true,'approved reveal animation runs');
 await page.waitForFunction(()=>document.activeElement.id==='sfEntryBack');await page.locator('#sfEntryBack').click();await page.waitForFunction(()=>document.activeElement.matches('[data-entry-area]'));
 check(await page.locator('#sfEntryChoice').isVisible(),true);
 const out=path.join(root,'test-results/entry-access');fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'entry-desktop.png'),animations:'disabled'});
 console.log(JSON.stringify({passed,viewports:[1440,390,320],liveServiceCalls:0}));
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{await browser?.close();server?.close()});
