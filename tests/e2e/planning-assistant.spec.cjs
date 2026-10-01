const {test,expect}=require('@playwright/test');
test.use({launchOptions:process.env.SF_ASSISTANT_BROWSER_EXECUTABLE?{executablePath:process.env.SF_ASSISTANT_BROWSER_EXECUTABLE}:{}});
const fs=require('fs'),path=require('path');
const {html,root}=require('../browser/planning-assistant-fixture.cjs');
for(const theme of ['dark','light'])test('Planning assistant '+theme+' chat, access and responsive layout',async({page},testInfo)=>{
 const external=[];
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='sf-assistant.test'){external.push(url.href);await route.abort();return;}
  if(url.pathname.startsWith('/assets/')){
   const file=path.join(root,url.pathname);if(!file.startsWith(path.join(root,'assets'))){await route.abort();return;}
   const ext=path.extname(file),contentType={'.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}[ext]||'application/octet-stream';
   await route.fulfill({contentType,body:fs.readFileSync(file)});return;
  }
  if(url.pathname==='/qa-run.js'){await route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(root,'tests/browser/planning-assistant-qa.js'))});return;}
  await route.fulfill({contentType:'text/html',body:html});
 });
 await page.goto('http://sf-assistant.test/?theme='+theme);
 await page.waitForFunction(()=>!!window.__qaResults,null,{timeout:15000});
 const report=await page.evaluate(()=>({results:window.__qaResults,errors:window.__errors}));
 await testInfo.attach('assistant-checks',{body:Buffer.from(JSON.stringify(report,null,2)),contentType:'application/json'});
 expect(report.results.filter(x=>!x.pass)).toEqual([]);expect(report.errors).toEqual([]);expect(external).toEqual([]);
 await testInfo.attach('assistant-'+theme,{body:await page.screenshot(),contentType:'image/png'});
 await page.keyboard.press('Escape');await expect(page.locator('#sfPlanningChat')).not.toBeVisible();
});
