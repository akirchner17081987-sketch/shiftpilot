// Read-only production smoke test: fresh context, no credentials or business writes.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const out=path.resolve('test-results/live-startup');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'de-DE',timezoneId:'Europe/Berlin'});
  const page=await context.newPage(),errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText}));
  try{
   await page.goto('https://schichtfunk.de/',{waitUntil:'domcontentloaded',timeout:60000});
   await page.locator('#sfEntryChoice').waitFor({state:'visible',timeout:45000});
   assert.equal(await page.locator('#sfEntryCounter').textContent(),'4 / 4');
   for(const area of ['verwaltung','mitarbeiter','zeit'])assert.equal(await page.locator('[data-entry-area="'+area+'"]').isVisible(),true);
   assert.deepEqual(errors,[]);
   console.log('LIVE_STARTUP_PASSED: production chooser ready, all three areas visible, no script errors.');
   console.log('LIVE_RELEASE:',await page.locator('meta[name="sf-release"]').getAttribute('content'));
  }finally{
   console.log('PUBLIC_PAGE_ERRORS:',JSON.stringify(errors));console.log('PUBLIC_NETWORK_FAILURES:',JSON.stringify(failed));
   await page.screenshot({path:path.join(out,'SchichtFunk-Live-Start.png'),fullPage:true});
   fs.writeFileSync(path.join(out,'state.json'),JSON.stringify({url:page.url(),counter:await page.locator('#sfEntryCounter').textContent().catch(()=>null),errors,failed},null,2));
  }
  await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
