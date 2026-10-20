const {test,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path'),{html,root}=require('../browser/planning-assistant-fixture.cjs');
test.use({launchOptions:process.env.SF_ASSISTANT_BROWSER_EXECUTABLE?{executablePath:process.env.SF_ASSISTANT_BROWSER_EXECUTABLE}:{}});
async function setup(page,theme='dark'){
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='sf-assistant.test')return route.abort();if(u.pathname.startsWith('/assets/')){const f=path.join(root,u.pathname);return route.fulfill({contentType:f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'image/svg+xml',body:fs.readFileSync(f)});}if(u.pathname==='/qa-run.js')return route.fulfill({body:''});return route.fulfill({contentType:'text/html',body:html});});
 await page.goto('http://sf-assistant.test/?theme='+theme);
 await page.evaluate(()=>{
  SFCompliance.policy.solidPlanningRules={enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin'};
  employees.forEach((e,i)=>{delete e.planningTeam;e.personnelNo=String(119+i);e.employment='Teilzeit';e.monthlyHours=32;e.role='Mitarbeiter';e.shifts=i===2?[]:['FD','ND'];});
  assignments=[{id:'a1',date:'2026-12-02',type:'FD',employeeId:'a',start:'06:00',end:'14:00',_dbStatus:'DRAFT'}];globalSoll={FD:0,SD:0,ND:0};dailySoll={'2026-12-02':{FD:1}};
 });
 await page.getByRole('button',{name:'Planungsassistent',exact:true}).click();
}
async function ask(page,q){await page.evaluate(()=>SFPlanningAssistant.open());await page.locator('#sfPlanningChatInput').fill(q);await page.getByRole('button',{name:'Frage senden'}).click();await expect(page.locator('#sfPlanningChatProgress')).toBeHidden();}
for(const theme of ['dark','light'])test(`forecast and both structured scenario forms are read-only and usable in ${theme}`,async({page},testInfo)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await setup(page,theme);
 await ask(page,'Frühwarnung Dezember 2026');await expect(page.locator('#sfPlanningChatLog')).toContainText('Frühwarnung – Vertretungsreserve');await expect(page.locator('#sfPlanningChatLog')).toContainText('Wenig Reserve');
 await ask(page,'Urlaubsfolgen prüfen');let form=page.locator('.sf-chat-analysis-form[data-kind="leaveImpact"]').last();
 await form.locator('[name="employeeId"]').selectOption('a');await form.locator('[name="startDate"]').fill('2026-12-02');await form.locator('[name="endDate"]').fill('2026-12-02');
 await form.getByRole('button',{name:'Auswirkungen prüfen'}).click();await expect(page.locator('#sfPlanningChatLog .is-answer').last()).toContainText('Urlaubsfolgen – Simulation');await expect(page.locator('#sfPlanningChatLog .is-answer').last()).toContainText('1 direkte Vertretungen');
 await expect(page.locator('#sfPlanningChatLog .is-answer').last()).toContainText('Ben');expect(await page.evaluate(()=>assignments.length)).toBe(1);expect(await page.evaluate(()=>absences.length)).toBe(0);
 await ask(page,'Dienstverschiebung prüfen');form=page.locator('.sf-chat-analysis-form[data-kind="changeImpact"]').last();
 await form.locator('[name="assignmentId"]').selectOption('a1');await form.locator('[name="targetEmployeeId"]').selectOption('b');
 await page.screenshot({path:testInfo.outputPath('aenderungsformular-'+theme+'.png')});
 await form.getByRole('button',{name:'Auswirkungen prüfen'}).click();const answer=page.locator('#sfPlanningChatLog .is-answer').last();await expect(answer).toContainText('Dienständerung – Vorschau');await expect(answer).toContainText('8 → 0 h');await expect(answer).toContainText('0 → 8 h');
 expect(await page.evaluate(()=>assignments[0].employeeId)).toBe('a');expect(await page.evaluate(()=>__writes)).toBe(0);
 await expect(page.getByRole('button',{name:'Vorschläge als Entwurf übernehmen',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Fragen & Beispiele'}).click();await expect(page.locator('#sfPlanningQuestionGuide')).toContainText('Vorausschauen und Änderungen prüfen');
 const bounds=await page.locator('#sfPlanningChat').evaluate(n=>({width:n.getBoundingClientRect().width,screen:innerWidth,overflow:n.scrollWidth-n.clientWidth}));expect(bounds.width).toBeLessThanOrEqual(bounds.screen);expect(bounds.overflow).toBeLessThanOrEqual(1);
 await page.evaluate(()=>{SFBackend.companyId='other-company';});await expect(page.locator('#sfPlanningChat')).toBeHidden();await page.evaluate(()=>SFPlanningAssistant.open());await expect(page.locator('#sfPlanningChatLog')).not.toContainText('Urlaubsfolgen – Simulation');
 expect(errors).toEqual([]);
});
test('native assignment editor previews unsaved fields and invalidates the report on another edit',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await setup(page);
 await page.addStyleTag({path:path.join(root,'assets/assignment-ux-v4.css')});await page.addScriptTag({path:path.join(root,'assets/assignment-ux-v4.js')});
 await expect.poll(()=>page.evaluate(()=>!!editAssignment.__sfChatService)).toBe(true);await page.evaluate(()=>{SFPlanningAssistant.close();editAssignment('a1');});
 await page.locator('#spEditEmp').selectOption('b');await page.locator('#sfAssignmentImpactButton').click();await expect(page.locator('#sfAssignmentImpactPreview')).toContainText('Dienständerung – Vorschau');await expect(page.locator('#sfAssignmentImpactPreview')).toContainText('0 → 8 h');
 expect(await page.evaluate(()=>assignments[0].employeeId)).toBe('a');expect(await page.evaluate(()=>__writes)).toBe(0);
 await page.locator('#spEditDate').fill('2026-12-03');await expect(page.locator('#sfAssignmentImpactPreview')).toContainText('Eingaben geändert');await page.locator('#sfAssignmentImpactButton').click();await expect(page.locator('#sfAssignmentImpactPreview')).toContainText('zusätzliche offene Pflichtposition');
 expect(await page.evaluate(()=>assignments[0].date)).toBe('2026-12-02');
 await page.evaluate(()=>{SFBackend.role='EMPLOYEE';});await expect(page.locator('#sfAssignmentImpactPreview')).toHaveCount(0);await expect(page.locator('#sfAssignmentImpactButton')).toHaveCount(0);expect(errors).toEqual([]);
});
