// Real built offline page and lifecycle assets, synthetic release server; no account calls.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const dist=path.resolve(__dirname,'../../dist'),current=JSON.parse(fs.readFileSync(path.join(dist,'pwa-release.json'))).version;
let published=current,server,browser;
async function main(){
  server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    res.setHeader('Cache-Control','no-store');
    if(url.pathname==='/pwa-release.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({version:published}));}
    if(url.pathname==='/'){
      res.setHeader('Content-Type','text/html');
      return res.end('<!doctype html><html lang="de"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="sf-release" content="'+current+'"><link rel="stylesheet" href="/assets/pwa-runtime-v1.css"><script defer src="/assets/pwa-runtime-v1.js"></script></head><body><button style="position:fixed;top:12px;right:12px" type="button">Hilfe</button><main><h1>Test-Arbeitsbereich</h1><label>Notiz <input id="draft"></label></main></body></html>');
    }
    const file=path.resolve(dist,'.'+url.pathname);
    if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
    res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'image/svg+xml');res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
  for(const width of [1440,390,320]){
    published=current;
    const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin);await page.locator('#sfPwaStatus').waitFor({state:'hidden'});
    await page.getByLabel('Notiz').fill('Offene Änderung');published='b'.repeat(20);
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.getByRole('button',{name:'Neu laden',exact:true}).waitFor({state:'visible'});
    assert.equal(await page.getByLabel('Notiz').inputValue(),'Offene Änderung');
    await page.getByRole('button',{name:'Hilfe',exact:true}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'update banner fits '+width);
    await context.setOffline(true);await page.getByText('Offline. Neue Änderungen und Zeitbuchungen benötigen eine Verbindung.',{exact:true}).waitFor({state:'visible'});
    await context.setOffline(false);await page.getByRole('button',{name:'Neu laden',exact:true}).waitFor({state:'visible'});
    await page.getByRole('button',{name:'Hinweis ausblenden',exact:true}).click();await page.locator('#sfPwaStatus').waitFor({state:'hidden'});
    await page.goto(origin+'/offline.html');await page.getByRole('heading',{name:'SchichtFunk ist gerade nicht erreichbar.',exact:true}).waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'offline screen fits '+width);
    const height=await page.getByRole('button',{name:'Erneut versuchen',exact:true}).evaluate(el=>el.getBoundingClientRect().height);assert.ok(height>=44,'touch target');
    await page.getByRole('button',{name:'Erneut versuchen',exact:true}).click();await page.getByRole('heading',{name:'Test-Arbeitsbereich',exact:true}).waitFor({state:'visible'});
    assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PWA browser QA passed: update keeps drafts, network recovery, offline retry and 1440/390/320px layouts.');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server?.close();});
