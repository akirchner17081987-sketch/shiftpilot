const {chromium}=require('playwright');
const fs=require('fs'), assert=require('assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();
 const base=fs.readFileSync('assets/sf-entry-v2.css','utf8'), fixed=fs.readFileSync('assets/sf-entry-access-v1.css','utf8');
 const employee=fs.readFileSync('assets/supabase-employee-access-v1.js','utf8');
 const z=Number(employee.match(/\.sf-employee-register\{position:fixed;inset:0;z-index:(\d+)/)[1]);
 const markup='<div id="sfEntryOverlay" class="sf-entry-dialog-ready"></div><div id="sfEmployeeRegister" style="position:fixed;inset:0;z-index:23000;background:green"></div>';
 async function top(css,level){await page.setContent(markup);await page.locator('#sfEmployeeRegister').evaluate((e,v)=>e.style.zIndex=String(v),level);await page.addStyleTag({content:base+'\n'+css+'\n#sfEntryOverlay{pointer-events:auto!important}'});return await page.evaluate(()=>document.elementFromPoint(innerWidth/2,innerHeight/2).id)}
 assert.equal(await top(fixed,23000),'sfEntryOverlay','baseline must reproduce obstruction');
 assert.equal(await top(fixed,z),'sfEmployeeRegister','registration must be visually on top');
 for(const z of [24001,25000]){await page.locator('#sfEmployeeRegister').evaluate((e,v)=>e.style.zIndex=String(v),z);assert.equal(await page.evaluate(()=>document.elementFromPoint(innerWidth/2,innerHeight/2).id),'sfEmployeeRegister')}
 console.log('Passed: reproduced original overlay, employee registration, team and reset stacking');
 await browser.close();
})().catch(e=>{console.error(e.message);process.exitCode=1});
