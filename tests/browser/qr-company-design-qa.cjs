const {chromium}=require('@playwright/test');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const ids=['11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222'];
const orange={theme_key:'secontec',dark_primary:'#EA5A06',dark_accent:'#F28A4A',dark_background:'#101418',dark_surface:'#1A2026',dark_text:'#FFFFFF',dark_muted:'#C6CDD3'};
const server=http.createServer((req,res)=>{
 let name=new URL(req.url,'http://localhost').pathname;if(name==='/qr-time')name='/qr-time.html';
 const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return}
 const ext=path.extname(file);res.writeHead(200,{'content-type':ext==='.html'?'text/html; charset=utf-8':ext==='.js'?'application/javascript':ext==='.css'?'text/css':ext==='.svg'?'image/svg+xml':'application/octet-stream'});
 fs.createReadStream(file).pipe(res)
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});let running=false;
  await page.route('**/functions/v1/qr-independent',async route=>{
   const input=route.request().postDataJSON(),action=input.action;let data={ok:true};
   if(action==='DESKTOP_TERMINALS')data.terminals=[{id:ids[0],company_name:'Secontec',terminal_name:'VOC EAST'},{id:ids[1],company_name:'Original',terminal_name:'Test'}];
   else if(action==='LOGIN')data.sessionToken='a'.repeat(64);
   else if(action==='STATUS')Object.assign(data,{state:running?'RUNNING':'READY',name:'Test Person',terminal_name:'Teststandort',breaks:[],as_of:new Date().toISOString(),company_branding:input.terminalId===ids[0]?orange:null});
   else Object.assign(data,{state:(running=true,'RUNNING'),name:'Test Person',breaks:[],as_of:new Date().toISOString()});
   await route.fulfill({json:data});
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/qr-time?entry=desktop');
  await page.locator('#desktopTerminal option').nth(1).waitFor();
  async function login(id){await page.selectOption('#desktopTerminal',id);await page.fill('#personnel','123');await page.fill('#pin','123789');await page.click('#loginButton');await page.locator('#clock').waitFor({state:'visible'})}
  await login(ids[0]);
  assert.equal(await page.locator('#start').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(234, 90, 6)');
  assert.match(await page.locator('.brand img').getAttribute('src'),/secontec-logo/);
  await page.click('#start');await page.locator('#end').waitFor({state:'visible'});
  assert.equal(await page.locator('html').getAttribute('data-qr-brand'),'active');
  await page.click('#logout');await page.locator('#login').waitFor({state:'visible'});
  assert.equal(await page.locator('html').getAttribute('data-qr-brand'),null);
  assert.match(await page.locator('.brand img').getAttribute('src'),/schichtfunk-logo/);
  running=false;await login(ids[1]);assert.equal(await page.locator('html').getAttribute('data-qr-brand'),null);
  console.log('QR Unternehmensdesign: Anmeldung, Buchung und Abmeldung erfolgreich');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(err=>{console.error(err);process.exitCode=1;server.close()});
