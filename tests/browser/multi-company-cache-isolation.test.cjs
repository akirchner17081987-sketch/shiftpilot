// Local browser rehearsal only: synthetic data, no external services or credentials.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {readFileSync,existsSync}=require('node:fs');
const {join}=require('node:path');
const {chromium}=require('playwright');

test('service worker network update and offline fallback; tab-scoped company selections',async()=>{
  const root=join(__dirname,'../..');
  const worker=readFileSync(join(root,'schichtfunk-sw.js'));
  let version='old',disconnect=false;
  const server=http.createServer((req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/assets/cache-probe.js'){
      if(disconnect){req.socket.destroy();return}
      res.writeHead(200,{'Content-Type':'application/javascript','Cache-Control':'public, max-age=0'});res.end(version);return;
    }
    if(path==='/schichtfunk-sw.js'){res.writeHead(200,{'Content-Type':'application/javascript'});res.end(worker);return}
    if(path==='/offline.html'){res.writeHead(200,{'Content-Type':'text/html'});res.end('OFFLINE ONLY');return}
    if(path.startsWith('/assets/')){res.writeHead(200,{'Content-Type':'application/octet-stream'});res.end('fixture');return}
    res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Local QA fixture</title>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    const executablePath=process.env.SF_QA_CHROMIUM||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath());
    browser=await chromium.launch({headless:true,executablePath});
    const context=await browser.newContext(),page=await context.newPage();
    const base=`http://127.0.0.1:${server.address().port}`;
    await page.goto(base);
    await page.evaluate(async()=>{await navigator.serviceWorker.register('/schichtfunk-sw.js');await navigator.serviceWorker.ready});
    await page.reload();
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    const getAsset=()=>page.evaluate(async()=>await (await fetch('/assets/cache-probe.js?v=1')).text());
    assert.equal(await getAsset(),'old');
    disconnect=true;
    assert.equal(await getAsset(),'old','network failure may serve the previously cached asset');
    disconnect=false;version='new';
    assert.equal(await getAsset(),'new','network success replaces the previously cached asset');
    disconnect=true;
    assert.equal(await getAsset(),'new','the updated asset is used for the next network failure');
    disconnect=false;
    await page.evaluate(()=>sessionStorage.setItem('sfEmployeeCompany:qa-user','company-a'));
    const second=await context.newPage();await second.goto(base);
    assert.equal(await second.evaluate(()=>sessionStorage.getItem('sfEmployeeCompany:qa-user')),null);
    await second.evaluate(()=>sessionStorage.setItem('sfEmployeeCompany:qa-user','company-b'));
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('sfEmployeeCompany:qa-user')),'company-a');
    assert.equal(await second.evaluate(()=>sessionStorage.getItem('sfEmployeeCompany:qa-user')),'company-b');
    await context.close();
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
});
