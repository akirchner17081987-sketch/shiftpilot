const {test,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path'),{html,root}=require('../browser/planning-assistant-fixture.cjs');
test.use({launchOptions:process.env.SF_ASSISTANT_BROWSER_EXECUTABLE?{executablePath:process.env.SF_ASSISTANT_BROWSER_EXECUTABLE}:{}});
async function setup(page,theme='dark'){
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='sf-assistant.test')return route.abort();if(u.pathname.startsWith('/assets/')){const f=path.join(root,u.pathname);return route.fulfill({contentType:f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'image/svg+xml',body:fs.readFileSync(f)});}if(u.pathname==='/qa-run.js')return route.fulfill({body:''});return route.fulfill({contentType:'text/html',body:html});});
 await page.goto('http://sf-assistant.test/?theme='+theme);
 await page.evaluate(()=>{
  sessionStorage.setItem('sf_demo_session_v1','active');SFCompliance.policy.solidPlanningRules={enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin'};
  employees=employees.slice(0,2);employees.forEach((e,i)=>{delete e.planningTeam;e.personnelNo=String(119+i);e.employment='Teilzeit';e.monthlyHours=8;e.role=i?'Mitarbeiter':'Teamleiter';e.shifts=i?['FD']:['FD','ND'];});
  assignments=[{id:'move-me',date:'2026-12-02',type:'FD',start:'06:00',end:'14:00',pause:30,note:'Koordination',employeeId:'a',_dbStatus:'DRAFT'}];globalSoll={FD:0,SD:0,ND:0};dailySoll={'2026-12-02':{FD:1,ND:1}};
 });
 await page.getByRole('button',{name:'Planungsassistent',exact:true}).click();
}
async function ask(page,q){await page.evaluate(()=>SFPlanningAssistant.open());await page.locator('#sfPlanningChatInput').fill(q);await page.getByRole('button',{name:'Frage senden'}).click();await expect(page.locator('#sfPlanningChatProgress')).toBeHidden();}
const last=page=>page.locator('#sfPlanningChatLog .is-answer').last();
for(const theme of ['dark','light'])test('orders, multi-month form and resumable guided mode in '+theme,async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await setup(page,theme);
 await ask(page,'Planungsauftrag starten');let form=page.locator('.sf-chat-analysis-form').last();await form.locator('[name=month]').fill('2026-12');await form.locator('[name=focus]').selectOption('leaders');await form.locator('[name=goal]').selectOption('both');await form.getByRole('button',{name:'Vorschau erstellen'}).click();await expect(last(page)).toContainText('Planungsauftrag – Vorschau');await expect(last(page)).toContainText('Fokus: Beispiel, Anna');expect(await page.evaluate(()=>__writes)).toBe(0);
 await ask(page,'Mehrmonatsausgleich starten');form=page.locator('.sf-chat-analysis-form').last();await form.locator('[name=month]').fill('2026-12');await form.locator('[name=count]').selectOption('3');await form.getByRole('button',{name:'Vorschau erstellen'}).click();await expect(last(page)).toContainText('2026-12 bis 2027-02');expect(await page.evaluate(()=>__writes)).toBe(0);
 await ask(page,'Hilf mir, Dezember 2026 fertigzustellen');await expect(last(page)).toContainText('Geführte Monatsplanung');await page.screenshot({path:info.outputPath('gefuehrte-planung-'+theme+'.png')});
 await last(page).locator('.sf-chat-wizard li').filter({hasText:'Stundenverteilung'}).getByRole('button',{name:'Als geprüft markieren'}).click();await expect(last(page).locator('.sf-chat-wizard li').filter({hasText:'Stundenverteilung'})).toContainText('Erledigt');
 await page.evaluate(()=>SFPlanningAssistant.reset());await ask(page,'Planung fortsetzen');await expect(last(page)).toContainText('2026-12');await expect(last(page).locator('.sf-chat-wizard li').filter({hasText:'Stundenverteilung'})).toContainText('Erledigt');
 await page.evaluate(()=>assignments[0].note='Manuell verändert');await ask(page,'Planung fortsetzen');await expect(last(page).locator('.sf-chat-wizard li').filter({hasText:'Stundenverteilung'})).toContainText('Offen');
 await page.evaluate(()=>SFBackend.companyId='other');await expect(page.locator('#sfPlanningChat')).toBeHidden();await ask(page,'Nimm die letzte Änderung des Assistenten zurück.');await expect(last(page)).toContainText('kein rücknehmbarer');
 expect(errors).toEqual([]);
});
test('confirmed undo restores metadata, leaves unrelated duties and blocks later changes',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await setup(page);await ask(page,'Bringe die Teamleiter im Dezember 2026 auf ihre Sollstunden');
 await last(page).getByRole('button',{name:'Vorschläge als Entwurf übernehmen'}).click();await page.getByRole('button',{name:'Jetzt als Entwurf übernehmen',exact:true}).click();await expect.poll(()=>page.evaluate(()=>assignments.length)).toBe(2);
 await ask(page,'Nimm die letzte Änderung des Assistenten zurück.');await expect(last(page)).toContainText('Rücknahme – Vorschau');expect(await page.evaluate(()=>assignments.length)).toBe(2);
 await last(page).getByRole('button',{name:'Rücknahme bestätigen'}).click();await page.getByRole('button',{name:'Abbrechen',exact:true}).click();expect(await page.evaluate(()=>assignments.length)).toBe(2);
 await last(page).getByRole('button',{name:'Rücknahme bestätigen'}).click();await page.getByRole('button',{name:'Rücknahme jetzt bestätigen'}).click();await expect.poll(()=>page.evaluate(()=>assignments.length)).toBe(1);expect(await page.evaluate(()=>({employeeId:assignments[0].employeeId,pause:assignments[0].pause,note:assignments[0].note}))).toEqual({employeeId:'a',pause:30,note:'Koordination'});
 await ask(page,'Engpasslöser Dezember 2026');await last(page).getByRole('button',{name:'Vorschläge als Entwurf übernehmen'}).click();await page.getByRole('button',{name:'Jetzt als Entwurf übernehmen',exact:true}).click();await expect.poll(()=>page.evaluate(()=>assignments.length)).toBe(2);
 await page.evaluate(()=>assignments[0].note='Spätere Notiz');await ask(page,'Änderungen rückgängig machen');await expect(last(page)).toContainText('zwischenzeitlich geändert');await expect(last(page).getByRole('button',{name:'Rücknahme bestätigen'})).toHaveCount(0);expect(errors).toEqual([]);
});
test('server period payload spans three months and reverses pure additions atomically',async({page})=>{
 await setup(page);await page.evaluate(()=>{
  sessionStorage.removeItem('sf_demo_session_v1');SFCompliance.isWeekPublished=d=>d==='2027-02-15';assignments=[];dailySoll={'2026-12-02':{FD:1}};window.__rpcCalls=[];SFBackend.sync=async()=>{};SFBackend.hydrate=async()=>{};SFBackend.empDb=new Map(employees.map(e=>[e.id,e.id]));SFBackend.asgDb=new Map();
  SFBackend.client={rpc:async(name,payload)=>{__rpcCalls.push({name,payload});if(name==='preview_planning_period')return {data:{fingerprint:'fresh',protectedIds:[]}};
   assignments=assignments.filter(a=>!payload.p_replace_ids.includes(a._dbId));for(const a of payload.p_assignments){const local={id:a.legacy_id,_dbId:a.legacy_id,employeeId:a.employee_id,date:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format(new Date(a.starts_at)),type:a.shift_code,start:'06:00',end:'14:00',note:a.note,pause:a.break_minutes,version:1,_dbStatus:'DRAFT'};assignments.push(local);SFBackend.asgDb.set(local.id,local.id);}return {data:{created:payload.p_assignments.length}};
  }};
 });await expect.poll(()=>page.evaluate(()=>!!SFBackend.hydrate.__sfChatGuard)).toBe(true);
 await ask(page,'Mehrmonatsausgleich über drei Monate ab Dezember 2026');await last(page).getByRole('button',{name:'Vorschläge als Entwurf übernehmen'}).click();await page.getByRole('button',{name:'Jetzt als Entwurf übernehmen',exact:true}).click();await expect.poll(()=>page.evaluate(()=>assignments.length)).toBe(1);expect(await page.evaluate(()=>__rpcCalls.find(x=>x.name==='apply_planning_period').payload.p_month_count)).toBe(3);
 await ask(page,'Änderungen rückgängig machen');await last(page).getByRole('button',{name:'Rücknahme bestätigen'}).click();await page.getByRole('button',{name:'Rücknahme jetzt bestätigen'}).click();await expect.poll(()=>page.evaluate(()=>assignments.length)).toBe(0);const calls=await page.evaluate(()=>__rpcCalls.filter(x=>x.name==='apply_planning_period'));expect(calls).toHaveLength(2);expect(calls[1].payload.p_assignments).toEqual([]);expect(calls[1].payload.p_replace_ids).toHaveLength(1);expect(calls[1].payload.p_fingerprint).toBe('fresh');
});
