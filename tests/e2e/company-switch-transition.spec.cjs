const {test,expect}=require('@playwright/test');
const fixture=`<!doctype html><html><head><script src="/assets/sf-entry-preflight-v1.js"></script><link rel="stylesheet" href="/assets/sf-entry-v2.css"><script defer src="/assets/sf-entry-v2.js"></script></head><body>
<div id="sfEntryOverlay"><div class="sf-entry-inner"><div class="sf-entry-loading">
<div class="sf-entry-handoff" role="status"><div class="sf-entry-handoff-orbit"></div><div class="sf-entry-handoff-copy"><strong>Unternehmen wird gewechselt</strong><span>Arbeitsbereich und Design werden vorbereitet.</span></div></div>
<div id="sfEntryCustomer" hidden><img id="sfEntryCustomerLogo" alt=""></div><p id="sfEntryStatus"></p><div class="sf-entry-bar"><span id="sfEntryBar"></span></div><span id="sfEntryCounter"></span><div id="sfEntryWarning" hidden></div><button id="sfEntrySkip">Weiter</button></div></div><div id="sfEntryLoginSlot"></div></div>
<div id="appShell" style="display:none"></div><div id="sfMfaModal" style="display:none"></div></body></html>`;
async function prepare(page){
 await page.addInitScript(()=>{sessionStorage.setItem('sf_company_transition_v1',String(Date.now()));window.SFBackend={ready:false,shellReady:false,user:{id:'fixture'},companyId:'company-a',client:{}}});
 await page.route('**/company-handoff-test',r=>r.fulfill({status:200,contentType:'text/html',body:fixture}));
 await page.goto('/company-handoff-test');
}
test('wechsel bleibt sichtbar bis das Design des bestaetigten Unternehmens bereit ist',async({page})=>{
 await prepare(page);const overlay=page.locator('#sfEntryOverlay');
 await expect(overlay).toHaveClass(/sf-entry-company-handoff/);
 await expect(page.getByText('Unternehmen wird gewechselt')).toBeVisible();
 await page.evaluate(()=>{SFBackend.shellReady=true;document.getElementById('appShell').style.display='block'});
 await expect(overlay).toBeVisible();
 await page.evaluate(()=>{SFBackend.ready=true;window.dispatchEvent(new CustomEvent('schichtfunk:corporate-theme-ready',{detail:{companyId:'company-b',theme:'secontec'}}))});
 await expect(overlay).toHaveClass(/sf-entry-company-handoff/);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('schichtfunk:corporate-theme-ready',{detail:{companyId:'company-a',theme:'original'}})));
 await expect(overlay).toHaveCount(0,{timeout:5000});
});
test('Sicherheitsabfrage bleibt erreichbar',async({page})=>{
 await prepare(page);await page.evaluate(()=>{document.getElementById('sfMfaModal').style.display='block'});
 await expect(page.locator('#sfEntryOverlay')).not.toHaveClass(/sf-entry-company-handoff/);
 await expect(page.locator('#sfMfaModal')).toBeVisible();
});
test('reduzierte Bewegung stoppt die Rotation',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await prepare(page);
 await expect(page.locator('.sf-entry-handoff-orbit')).toBeVisible();
 const animation=await page.locator('.sf-entry-handoff-orbit').evaluate(e=>getComputedStyle(e,'::before').animationName);
 expect(animation).toBe('none');
});
