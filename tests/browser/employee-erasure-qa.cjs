const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
 const browser=await chromium.launch({headless:true});
 try {
  for(const [width,height] of [[1280,900],[390,844]]) {
   const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://erasure.example.invalid/**',route=>route.fulfill({contentType:'text/html',body:'<html lang="de"><head><style>:root{--panel:#eef1f5;--bg:#e4e8ee;--text:#1b293a;--line:#9aabba;--muted:#43556b}body{font:16px Arial}button{padding:10px}.sp-emp-list-card-head{display:flex;flex-wrap:wrap;gap:8px}</style></head><body><div id="spEmployeeV2"><div class="sp-emp-list-card-head"><h3>Mitarbeiterübersicht</h3></div></div></body></html>'}));
   await page.goto('https://erasure.example.invalid/');
   await page.evaluate(()=>{
    window.calls=[];window.toasts=[];window.fixtureFail=false;
    window.SFBackend={ready:true,role:'OWNER',companyId:'20000000-0000-0000-0000-000000000001',empDb:new Map(),hydrate:async()=>calls.push('hydrate'),clearLegacy:()=>calls.push('clearLegacy'),client:{rpc:async(name)=>({data:name==='owner_employee_erasure_list'?[{employee_id:'30000000-0000-0000-0000-000000000001',employee_name:'Fixture Employee',personnel_no:'9001',removed:true}]:{employee_id:'30000000-0000-0000-0000-000000000001',employee_name:'Fixture Employee',company_name:'Fixture Company',fingerprint:'a'.repeat(32),counts:{shift_assignments:4,time_entries:2,absences:1},documents:3}}),functions:{invoke:async(name,opts)=>{calls.push(opts.body);return fixtureFail?{error:{message:'Fiktiver Verbindungsfehler'}}:{data:{complete:true,verified:true}}}}}};
    window.showSaveToast=(...args)=>toasts.push(args);
   });
   await page.addScriptTag({path:path.resolve('assets/employee-erasure-v1.js')});
   await page.getByRole('button',{name:'Vollständig löschen',exact:true}).click();
   await page.getByLabel('Mitarbeiter auswählen').selectOption('30000000-0000-0000-0000-000000000001');
   const confirm=page.getByRole('button',{name:'Alle Mitarbeiterdaten endgültig löschen'});
   await confirm.waitFor();assert(await confirm.isDisabled());
   await page.getByLabel('Vollständigen Namen zur Bestätigung eingeben').fill('Wrong employee');
   await page.getByRole('checkbox').check();assert(await confirm.isDisabled());
   await page.getByLabel('Vollständigen Namen zur Bestätigung eingeben').fill('Fixture Employee');assert(await confirm.isEnabled());
   const dimensions=await page.evaluate(()=>{const d=document.querySelector('.sf-erasure-dialog');return {width:d.getBoundingClientRect().width,screen:innerWidth,overflow:d.scrollWidth-d.clientWidth};});
   assert(dimensions.width<=dimensions.screen);assert(dimensions.overflow<=1);
   await page.evaluate(()=>fixtureFail=true);await confirm.click();
   await page.getByRole('alert').filter({hasText:'Fiktiver Verbindungsfehler'}).waitFor();assert.equal((await page.evaluate(()=>toasts)).length,0);
   await page.evaluate(()=>fixtureFail=false);await page.getByRole('button',{name:'Löschung erneut versuchen'}).click();
   await page.waitForFunction(()=>!document.querySelector('#sfEmployeeErasureDialog'));
   const calls=await page.evaluate(()=>window.calls);assert(calls.includes('clearLegacy'));assert(calls.includes('hydrate'));assert.equal((await page.evaluate(()=>toasts)).length,1);
   assert.equal(calls.filter(x=>typeof x==='object')[0].confirmation,'Fixture Employee');
   await page.evaluate(()=>SFBackend.role='ADMIN');await page.evaluate(()=>SFEmployeeErasure.open());assert.equal(await page.locator('[role=dialog]').count(),0);
   assert.deepEqual(errors,[]);await page.close();console.log(`Employee erasure UI ${width}px: name confirmation, archived selection, retry, permissions and layout passed`);
  }
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
