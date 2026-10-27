// Real page, isolated auth fixture and deliberate resource failures; never contacts production.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),auth=require('../fixtures/site-loading-auth.cjs');
const fixture=require('../fixtures/today-data.cjs').fixture();fixture.company_id='qa';
let server,browser;
async function main(){
 server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname==='/pwa-release.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({version:'a'.repeat(20)}))}
 let file=u.pathname==='/'?'index.html':u.pathname.slice(1);if(file.includes('..')||!fs.existsSync(path.join(root,file))){res.writeHead(404);return res.end()}
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');
 let body=file==='assets/supabase-auth-v1.js'?auth:fs.readFileSync(path.join(root,file));if(file==='index.html')body=body.toString().replace('<head>','<head><script>window.qa={role:"SIGNED_OUT",start:performance.now(),rpcs:[],writes:[],today:'+JSON.stringify(fixture)+'};</script>').replace('</body>','<div id="qaParsed" hidden></div></body>');res.end(body);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});
 async function scenario(name,target,mode){const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();let documents=0,attempts=0;console.log('Starting '+name);page.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame())documents++});page.on('dialog',d=>d.dismiss());
 await context.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==origin)return route.abort();if(u.pathname===target&&r.resourceType()==='script'){attempts++;if(mode==='once'&&attempts>1)return route.continue();if(mode==='hang'){await new Promise(r=>setTimeout(r,22000));return route.abort('timedout').catch(()=>{})}return route.abort('failed')}return route.continue()});
 await page.goto(origin,{waitUntil:'commit',timeout:15000});console.log('Committed '+name);
 if(mode==='once'){await page.waitForFunction(()=>window.qa?.done,{timeout:45000});assert.equal(attempts,2,name);assert(documents<=2,name);assert.equal(await page.evaluate(()=>qa.writes.length),0)}
 else {await page.getByRole('button',{name:'Seite erneut laden',exact:true}).waitFor({state:'visible',timeout:45000});assert.equal(await page.evaluate(()=>!!qa.initMs),false,name);const bounds=await page.getByRole('button',{name:'Seite erneut laden',exact:true}).boundingBox();assert(bounds&&bounds.y>=0&&bounds.y+bounds.height<=720,name+' recovery in viewport');assert(documents<=2,name);assert(attempts<=4,name);await page.screenshot({path:path.join(root,'test-results/startup-recovery-'+name+'.png')});}
 console.log(JSON.stringify({name,documents,attempts,recovered:mode==='once',recoveryButton:mode!=='once'}));await context.close();}
 fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
 await scenario('dynamic-once','/assets/status-toast-v2.js','once');
 await scenario('dynamic-unavailable','/assets/status-toast-v2.js','always');
 await scenario('dynamic-timeout','/assets/status-toast-v2.js','hang');
 await scenario('static-once','/assets/csp-actions-v1.js','once');
 await scenario('static-timeout','/assets/csp-actions-v1.js','hang');
 await scenario('static-unavailable','/assets/csp-actions-v1.js','always');
 console.log('Startup recovery QA passed: transient, permanent and timed-out assets; visible recovery; no reload loops, auth or writes after failed base load.');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server?.closeAllConnections?.();server?.close()});
