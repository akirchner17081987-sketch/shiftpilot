const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const html=fs.readFileSync(path.resolve(__dirname,'../../qr-time.html'),'utf8');
(async()=>{const browser=await chromium.launch({headless:true});try{
for(const [name,viewport] of [['desktop',{width:1000,height:900}],['mobile',{width:390,height:844}]]){
 const page=await browser.newPage({viewport,locale:'de-DE'}),calls=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 const status={ok:true,name:'Synthetic QR Test',state:'BREAK',started_at:'2026-10-02T00:00:00Z',ended_at:null,breaks:[{number:1,started_at:'2026-10-02T06:00:00Z',ended_at:null}]};
 await page.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(url.hostname==='sf.test')return route.fulfill({contentType:'text/html',body:html});if(url.pathname.endsWith('/qr-independent')){const args=request.postDataJSON();calls.push(args.action);return route.fulfill({contentType:'application/json',body:JSON.stringify(args.action==='LOGIN'?{ok:true,sessionToken:'synthetic'}:args.action==='CLOCK_OUT'?{...status,state:'READY',ended_at:'2026-10-02T08:00:00Z',punched_at:'2026-10-02T08:00:00Z',pause_automatically_closed:true,breaks:[{...status.breaks[0],ended_at:'2026-10-02T08:00:00Z'}]}:status)})}return route.abort()});
 await page.goto('http://sf.test/qr-time.html?t='+'e'.repeat(64));await page.locator('#personnel').fill('SYNTHETIC');await page.locator('#startDate').fill('15012020');await page.locator('#loginButton').click();await page.locator('#pauseEnd').waitFor();assert.equal(await page.locator('#end').isVisible(),true);assert.match(await page.locator('#stateDetail').textContent(),/auch die laufende Pause/);
 await page.locator('#end').click();await page.locator('#start').waitFor();assert.match(await page.locator('#message').textContent(),/Pause wurde automatisch zum selben Zeitpunkt beendet/);assert.equal(await page.locator('#pauseEnd').isVisible(),false);assert.equal(await page.locator('#end').isVisible(),false);assert.deepEqual(calls,['LOGIN','STATUS','CLOCK_OUT']);assert.deepEqual(errors,[]);console.log(JSON.stringify({name,passed:true}));await page.close();
}
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
