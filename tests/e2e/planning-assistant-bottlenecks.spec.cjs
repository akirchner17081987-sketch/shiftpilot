const {test,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path'),{html,root}=require('../browser/planning-assistant-fixture.cjs');
test.use({launchOptions:process.env.SF_ASSISTANT_BROWSER_EXECUTABLE?{executablePath:process.env.SF_ASSISTANT_BROWSER_EXECUTABLE}:{}});
async function setup(page){
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='sf-assistant.test')return route.abort();if(u.pathname.startsWith('/assets/')){const f=path.join(root,u.pathname);return route.fulfill({contentType:f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'image/svg+xml',body:fs.readFileSync(f)});}if(u.pathname==='/qa-run.js')return route.fulfill({body:''});return route.fulfill({contentType:'text/html',body:html});});
 await page.goto('http://sf-assistant.test/');
 await page.evaluate(()=>{
  sessionStorage.setItem('sf_demo_session_v1','active');SFCompliance.policy.solidPlanningRules={enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin'};
  employees=employees.slice(0,2);employees.forEach((e,i)=>{delete e.planningTeam;e.personnelNo=String(119+i);e.employment='Teilzeit';e.monthlyHours=8;e.role=i?'Mitarbeiter':'Teamleiter';e.shifts=i?['FD']:['FD','ND'];});
  assignments=[{id:'move-me',date:'2026-12-02',type:'FD',start:'06:00',end:'14:00',employeeId:'a',_dbStatus:'DRAFT'}];globalSoll={FD:0,SD:0,ND:0};dailySoll={'2026-12-02':{FD:1,ND:1}};
 });
 await page.getByRole('button',{name:'Planungsassistent',exact:true}).click();
}
async function ask(page,q){await page.evaluate(()=>SFPlanningAssistant.open());await page.locator('#sfPlanningChatInput').fill(q);await page.getByRole('button',{name:'Frage senden'}).click();await expect(page.locator('#sfPlanningChatProgress')).toBeHidden();}
test('persistent question guide, repair preview, confirmation and stale preview protection',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await setup(page);
 await ask(page,'Offene Dienste prüfen');
 await page.getByRole('button',{name:'Fragen & Beispiele',exact:true}).click();await expect(page.locator('#sfPlanningQuestionGuide')).toBeVisible();await expect(page.locator('#sfPlanningChatLog')).toBeHidden();
 await page.locator('#sfPlanningQuestionGuide summary').filter({hasText:'Plan prüfen und Engpässe lösen'}).click();
 await page.screenshot({path:testInfo.outputPath('fragenkatalog.png')});
 await page.locator('#sfPlanningQuestionGuide').getByRole('button',{name:'Engpasslöser starten',exact:true}).click();
 await expect(page.locator('#sfPlanningChatLog')).toContainText('Engpasslöser – Entscheidungsvorschlag');await expect(page.locator('#sfPlanningQuestionGuide')).toBeHidden();
 await expect(page.locator('#sfPlanningChatLog')).toContainText('1 → 0');expect(await page.evaluate(()=>assignments.length)).toBe(1);
 await page.screenshot({path:testInfo.outputPath('engpass-vorschau.png')});
 const take=page.getByRole('button',{name:'Vorschläge als Entwurf übernehmen',exact:true}).last();await take.click();
 await page.getByRole('button',{name:'Abbrechen',exact:true}).click();expect(await page.evaluate(()=>assignments.length)).toBe(1);
 await take.click();await page.getByRole('button',{name:'Jetzt als Entwurf übernehmen',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>assignments.length)).toBe(2);expect(await page.evaluate(()=>assignments.find(a=>a.type==='ND').employeeId)).toBe('a');expect(await page.evaluate(()=>assignments.find(a=>a.type==='FD').employeeId)).toBe('b');
 await page.getByRole('button',{name:'Fragen & Beispiele',exact:true}).click();await expect(page.locator('#sfPlanningQuestionGuide')).toBeVisible();
 const bounds=await page.locator('#sfPlanningChat').evaluate(n=>({width:n.getBoundingClientRect().width,screen:innerWidth,overflow:n.scrollWidth-n.clientWidth}));expect(bounds.width).toBeLessThanOrEqual(bounds.screen);expect(bounds.overflow).toBeLessThanOrEqual(1);
 await page.getByRole('button',{name:'Zurück zum Gespräch',exact:true}).click();await expect(page.locator('#sfPlanningChatLog')).toContainText('Offene Dienste');
 // A stale signature must prevent a second write.
 await page.evaluate(()=>{assignments=[{id:'move-again',date:'2026-12-02',type:'FD',start:'06:00',end:'14:00',employeeId:'a',_dbStatus:'DRAFT'}];});await ask(page,'Engpasslöser starten');
 await page.evaluate(()=>{window.__toasts=[];window.showSaveToast=(...args)=>__toasts.push(args);employees[1].monthlyHours=4;});
 await page.getByRole('button',{name:'Vorschläge als Entwurf übernehmen',exact:true}).last().click();expect(await page.evaluate(()=>assignments.length)).toBe(1);expect(await page.evaluate(()=>__toasts.at(-1)[1])).toContain('nicht mehr aktuell');
 expect(errors).toEqual([]);
});
test('server-protected drafts are excluded after refreshing; analysis never saves',async({page})=>{
 await setup(page);await page.evaluate(()=>{
  sessionStorage.removeItem('sf_demo_session_v1');window.__rpcCalls=[];SFBackend.sync=async()=>{};SFBackend.hydrate=async()=>{};
  SFBackend.client={rpc:async(name)=>{__rpcCalls.push(name);return {data:{fingerprint:'current',protectedIds:['move-me']}};}};
  document.body.append(document.createElement('span'));
 });
 await expect.poll(()=>page.evaluate(()=>!!SFBackend.hydrate.__sfChatGuard)).toBe(true);
 await ask(page,'Engpasslöser starten');await expect(page.locator('#sfPlanningChatLog')).toContainText('1 → 1');
 await expect(page.getByRole('button',{name:'Vorschläge als Entwurf übernehmen',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>__rpcCalls)).toEqual(['preview_planning_period']);expect(await page.evaluate(()=>assignments.length)).toBe(1);
 await page.evaluate(()=>{SFBackend.role='EMPLOYEE';});await expect(page.locator('#sfPlanningAssistantButton')).toBeHidden();
});
