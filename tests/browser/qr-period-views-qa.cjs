'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.SF_QR_BROWSER_EXECUTABLE||process.env.SF_BROWSER_EXECUTABLE||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<html data-sf-theme="light"><head><style>*{box-sizing:border-box}body{margin:20px;font:14px Arial;--text:#183145;--muted:#617285;--bg2:#eef3f6;--line:#b9cbd6;--teal:#087f74;--danger:#bc203c}.card{min-width:0}</style></head><body><section id="view-time"><div id="timeStats"></div></section></body></html>');
  await page.evaluate(()=>{
   window.calls=[];window.inFlight=0;window.maxFlight=0;window.delay=0;window.failMonth='';window.corrections=[];
   window.SFBackend={role:'OWNER',companyId:'A',companyTimeZone:'Europe/Berlin',qrCorrection:{open:id=>window.corrections.push(id)},client:{rpc:async(name,args)=>{
    const company=args.p_company_id;window.calls.push({...args,name});window.inFlight++;window.maxFlight=Math.max(window.maxFlight,window.inFlight);
    const wait=window.delay,failure=window.failMonth;
    if(wait)await new Promise(r=>setTimeout(r,wait));
    window.inFlight--;
    if(args.p_start_date.slice(0,7)===failure)return {error:{message:'Fixture: Teilabfrage fehlgeschlagen'}};
    const first=args.p_start_date.slice(0,7),days=new Date(args.p_end_date+'T00:00:00Z').getUTCDate();
    return{data:Array.from({length:60},(_,i)=>({
     id:company+'-'+first+'-'+i,employee_name:i===59&&first.endsWith('-12')?'Suchtreffer Dezember':'Beispielperson',
     personnel_no:i===59&&first.endsWith('-12')?'9999':String(100+i),terminal_name:'Beispielstandort',
     started_at:first+'-'+String(Math.min(days,1+i%days)).padStart(2,'0')+'T08:00:00+01:00',
     ended_at:first+'-'+String(Math.min(days,1+i%days)).padStart(2,'0')+'T16:00:00+01:00',
     paid_minutes:480,pause_minutes:15,breaks:[{number:1,started_at:first+'-01T12:00:00+01:00',ended_at:first+'-01T12:15:00+01:00'}]
    }))};
   }}};
  });
  await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../../assets/qr-independent-report-v1.js'),'utf8')});
  const done=async n=>page.waitForFunction(n=>document.querySelector('#sfQrReportMessage')?.textContent===n+' Buchung'+(n===1?'':'en'),n);
  await page.evaluate(()=>window.SFBackend.qrIndependentReport.refresh());await done(60);
  await page.locator('#sfQrReportYear').evaluate(el=>{el.value='2028';el.dispatchEvent(new Event('change',{bubbles:true}))});
  await page.locator('#sfQrReportMonth').selectOption('2');await done(60);
  assert.match(await page.locator('#sfQrReportRange').textContent(),/01.02.2028.*29.02.2028/);
  assert.equal((await page.evaluate(()=>window.calls.at(-1))).p_end_date,'2028-02-29');
  await page.evaluate(()=>window.calls=[]);
  await page.locator('[data-sfqr-period="quarter"]').click();await done(180);
  let calls=await page.evaluate(()=>window.calls);assert.equal(calls.length,3);
  assert.deepEqual(calls.map(c=>[c.p_start_date,c.p_end_date]).sort(),[['2028-01-01','2028-01-31'],['2028-02-01','2028-02-29'],['2028-03-01','2028-03-31']]);
  await page.evaluate(()=>{window.calls=[];window.delay=12;window.maxFlight=0});
  await page.locator('[data-sfqr-period="year"]').click();await done(720);
  calls=await page.evaluate(()=>window.calls);assert.equal(calls.length,12);
  assert.equal(await page.evaluate(()=>window.maxFlight),2);
  const days=calls.reduce((n,c)=>n+(Date.parse(c.p_end_date)-Date.parse(c.p_start_date))/86400000+1,0);assert.equal(days,366);
  assert.equal(await page.locator('#sfQrReportRows > tr:not(.sfqr-detail)').count(),50);
  assert.match(await page.locator('#sfQrReportPageInfo').textContent(),/Seite 1 von 15.*720/);
  await page.locator('#sfQrReportPageNext').click();assert.match(await page.locator('#sfQrReportPageInfo').textContent(),/Seite 2 von 15/);
  await page.locator('[data-sfqr-detail]').first().click();
  await page.locator('.sfqr-detail:not([hidden]) [data-sfqr-correct]').click();
  assert.ok((await page.evaluate(()=>window.corrections[0])).startsWith('A-2028-12-'));
  await page.locator('#sfQrReportSearch').fill('9999');await done(1);
  assert.match(await page.locator('#sfQrReportRows').textContent(),/Suchtreffer Dezember/);
  assert.equal(await page.locator('#sfQrReportPagination').isVisible(),false);
  await page.locator('#sfQrReportSearch').fill('');await done(720);
  await page.locator('[data-sfqr-step="-1"]').click();await done(720);assert.match(await page.locator('#sfQrReportRange').textContent(),/2027/);
  await page.locator('[data-sfqr-period="custom"]').click();await done(720);
  await page.locator('#sfQrReportFrom').evaluate(el=>{el.value='2026-12-15';el.dispatchEvent(new Event('change',{bubbles:true}))});
  await page.locator('#sfQrReportTo').evaluate(el=>{el.value='2027-01-15';el.dispatchEvent(new Event('change',{bubbles:true}))});await done(120);
  calls=await page.evaluate(()=>window.calls.slice(-2));
  assert.deepEqual(calls.map(c=>[c.p_start_date,c.p_end_date]).sort(),[['2026-12-15','2026-12-31'],['2027-01-01','2027-01-15']]);
  await page.locator('#sfQrReportTo').evaluate(el=>{el.value='2028-01-15';el.dispatchEvent(new Event('change',{bubbles:true}))});
  assert.match(await page.locator('#sfQrReportMessage').textContent(),/höchstens 366 Tagen/);
  await page.locator('[data-sfqr-period="year"]').click();await done(720);
  await page.evaluate(()=>{window.delay=50;window.failMonth='2026-02'});
  await page.locator('#sfQrReportYear').evaluate(el=>{el.value='2026';el.dispatchEvent(new Event('change',{bubbles:true}))});
  await page.waitForFunction(()=>document.querySelector('#sfQrReportMessage').textContent.includes('Teilabfrage fehlgeschlagen'));
  assert.equal(await page.locator('#sfQrReportRows > tr:not(.sfqr-detail)').count(),1);
  assert.equal(await page.locator('[data-sfqr-detail]').count(),0);
  await page.evaluate(()=>{window.failMonth='';window.delay=60;window.SFBackend.qrIndependentReport.refresh();window.SFBackend.companyId='B';window.SFBackend.qrIndependentReport.refresh()});
  await done(720);await page.waitForTimeout(100);
  await page.locator('[data-sfqr-detail]').first().click();await page.locator('.sfqr-detail:not([hidden]) [data-sfqr-correct]').click();
  assert.ok((await page.evaluate(()=>window.corrections.at(-1))).startsWith('B-'));
  // Rapid switches must never let a stale annual response overwrite a monthly result.
  await page.evaluate(()=>{window.SFBackend.qrIndependentReport.refresh();});
  await page.locator('[data-sfqr-period="month"]').click();await done(60);await page.waitForTimeout(100);await done(60);
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no page overflow on mobile');
  await page.screenshot({path:path.join(__dirname,'../../test-results/qr-periods-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1280,height:900});await page.screenshot({path:path.join(__dirname,'../../test-results/qr-periods-desktop.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: month/quarter/year, leap dates, disjoint monthly requests, bounded concurrency, global search, pagination/details, custom dates, partial failures, stale/company switches, mobile layout');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
