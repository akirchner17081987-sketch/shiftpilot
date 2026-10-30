const {test,expect}=require('@playwright/test'),fs=require('fs'),path=require('path'),{html,root}=require('../browser/planning-assistant-fixture.cjs');
test.use({launchOptions:process.env.SF_ASSISTANT_BROWSER_EXECUTABLE?{executablePath:process.env.SF_ASSISTANT_BROWSER_EXECUTABLE}:{}});
async function setup(page){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async r=>{const u=new URL(r.request().url());if(u.hostname!=='sf-assistant.test')return r.abort();if(u.pathname==='/qa-run.js')return r.fulfill({body:''});if(u.pathname.startsWith('/assets/')){const f=path.join(root,u.pathname),type={'.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.ttf':'font/ttf'}[path.extname(f)]||'application/octet-stream';return r.fulfill({contentType:type,body:fs.readFileSync(f)});}return r.fulfill({contentType:'text/html',body:html});});
 await page.goto('http://sf-assistant.test/');await page.getByRole('button',{name:'Planungsassistent',exact:true}).click();return errors;
}
const last=p=>p.locator('#sfPlanningChatLog .is-answer').last();
async function ask(page,q){await page.locator('#sfPlanningChatInput').fill(q);await page.getByRole('button',{name:'Frage senden'}).click();await expect(page.locator('#sfPlanningChatProgress')).toBeHidden();}
async function clean(page,errors){expect(await page.evaluate(()=>__writes)).toBe(0);expect(errors).toEqual([]);expect(await page.evaluate(()=>__errors)).toEqual([]);}
test('everyday language, clarification and why retain their planning period without writes',async({page})=>{
 const errors=await setup(page);await ask(page,'Wer fehlt im Dezember 2026?');await expect(last(page)).toContainText('Meinst du offene Dienste oder abwesende Mitarbeiter?');
 await last(page).getByRole('button',{name:'Offene Dienste',exact:true}).click();await expect(last(page).locator('.sf-chat-basis')).toContainText('2026-12-01 bis 2026-12-31');
 await ask(page,'Und wie sieht es im Januar aus?');await expect(last(page).locator('.sf-chat-basis')).toContainText('2026-01-01 bis 2026-01-31');
 await ask(page,'Warum?');await expect(last(page)).toContainText('Besetzung prüfen');await expect(last(page).locator('.sf-chat-basis')).toContainText('2026-01-01 bis 2026-01-31');await clean(page,errors);
});
test('natural range requests and typed hour answers retain the full period and person',async({page})=>{
 const errors=await setup(page);await ask(page,'Kannst du mir bitte die offenen Dienste vom 01.12.2026 bis 15.12.2026 zeigen?');await expect(last(page).locator('.sf-chat-basis')).toContainText('2026-12-01 bis 2026-12-15');
 await ask(page,'Wie viele Stunden hat Anna Beispiel im Januar 2027?');await expect(last(page)).toContainText('Welche Stunden meinst du?');await ask(page,'die geplanten');await expect(last(page)).toContainText('Anna Beispiel');await expect(last(page).locator('.sf-chat-basis')).toContainText('2027-01-01 bis 2027-01-31');
 await ask(page,'als PDF bitte');await expect(last(page).getByRole('button',{name:'Planungsbericht als PDF herunterladen'})).toBeEnabled();await expect(last(page).locator('.sf-chat-basis')).toContainText('2027-01-01 bis 2027-01-31');await clean(page,errors);
});
test('a combined request runs each recognized task and offers the next step',async({page})=>{
 const errors=await setup(page);await ask(page,'Zeige offene Dienste vom 01.12.2026 bis 15.12.2026 und erstelle einen PDF-Bericht');await expect(last(page).getByRole('list',{name:'Erkannte Aufgaben'}).locator('li')).toHaveCount(2);
 await last(page).getByRole('button',{name:'1. Offene Dienste prüfen',exact:true}).click();await expect(last(page).locator('.sf-chat-basis')).toContainText('2026-12-01 bis 2026-12-15');await last(page).getByRole('button',{name:'Nächster Schritt: PDF-Planungsbericht erstellen',exact:true}).click();
 await expect(last(page).getByRole('button',{name:'Planungsbericht als PDF herunterladen'})).toBeVisible();await expect(last(page)).toContainText('Alle Schritte dieses Auftrags wurden bearbeitet.');await expect(last(page).locator('.sf-chat-basis')).toContainText('2026-12-01 bis 2026-12-15');await clean(page,errors);
});
test('a task clarification can be answered as text and completion never skips an earlier task',async({page})=>{
 const errors=await setup(page);await ask(page,'Prüfe Besetzung, Stunden und Belastung im Dezember 2026');await last(page).getByRole('button',{name:'2. Stunden prüfen',exact:true}).click();await expect(last(page)).toContainText('Welche Stunden meinst du?');await ask(page,'die geplanten');await expect(last(page)).toContainText('Geplante Stunden');await last(page).getByRole('button',{name:'Nächster Schritt: Belastung prüfen',exact:true}).click();
 await expect(last(page).getByRole('button',{name:'Nächster Schritt: Besetzung prüfen',exact:true})).toBeVisible();await expect(last(page)).not.toContainText('Alle Schritte dieses Auftrags wurden bearbeitet.');await clean(page,errors);
});
test('changed plans mark old answers, block stale downloads and rerun the original range',async({page})=>{
 const errors=await setup(page);await ask(page,'Wie viele Stunden hat Anna Beispiel vom 01.12.2026 bis 15.12.2026?');await ask(page,'die geplanten');const old=last(page);await expect(old).toContainText('8 Std.');
 await page.evaluate(()=>assignments.push({id:'changed',date:'2026-12-02',type:'FD',employeeId:'a',start:'06:00',end:'14:00',_dbStatus:'DRAFT'}));await expect(old.locator('.sf-chat-stale')).toContainText('nicht mehr aktuell');await old.getByRole('button',{name:'Erneut prüfen',exact:true}).click();await expect(last(page)).toContainText('16 Std.');await expect(last(page).locator('.sf-chat-basis')).toContainText('2026-12-01 bis 2026-12-15');await expect(last(page).locator('.sf-chat-stale')).toHaveCount(0);
 await ask(page,'als PDF bitte');await page.locator('.sf-chat-period summary').click();await page.locator('#sfPlanningChatMonth').fill('2027-01');await page.locator('#sfPlanningChatMonth').dispatchEvent('change');await expect(last(page).getByRole('button',{name:'Planungsbericht als PDF herunterladen'})).toBeDisabled();await expect(last(page).locator('.sf-chat-stale')).toBeVisible();await last(page).getByRole('button',{name:'Erneut prüfen',exact:true}).click();await expect(last(page).getByRole('button',{name:'Planungsbericht als PDF herunterladen'})).toBeEnabled();await expect(last(page).locator('.sf-chat-basis')).toContainText('2026-12-01 bis 2026-12-15');
 await page.evaluate(()=>SFBackend.companyId='other-company');await expect(page.locator('#sfPlanningChat')).toBeHidden();await expect(page.locator('#sfPlanningChatLog')).toBeEmpty();await clean(page,errors);
});
