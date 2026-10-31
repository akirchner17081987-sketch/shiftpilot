const {test,expect}=require('@playwright/test'),fs=require('fs'),path=require('path'),{html,root}=require('../browser/planning-assistant-fixture.cjs');
test.use({launchOptions:process.env.SF_ASSISTANT_BROWSER_EXECUTABLE?{executablePath:process.env.SF_ASSISTANT_BROWSER_EXECUTABLE}:{}});
async function setup(page,theme='dark'){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async r=>{const u=new URL(r.request().url());if(u.hostname!=='sf-assistant.test')return r.abort();if(u.pathname==='/qa-run.js')return r.fulfill({body:''});if(u.pathname.startsWith('/assets/')){const f=path.join(root,u.pathname);return r.fulfill({contentType:f.endsWith('.css')?'text/css':'application/javascript',body:fs.readFileSync(f)});}return r.fulfill({contentType:'text/html',body:html});});
 await page.goto('http://sf-assistant.test/?theme='+theme);
 await page.evaluate(()=>{window.__assignmentAttempts=0;window.assignEmployeeByDrop=(employeeId,type,date)=>{__assignmentAttempts++;const e=employees.find(e=>e.id===employeeId),t=typeById(type);if(SFCompliance.check(e,type,date,t.start,t.end).hard.length)throw Error('Final rule check failed');assignments.push({id:'vacancy-'+__assignmentAttempts,employeeId,type,date,start:t.start,end:t.end,_dbStatus:'DRAFT'});saveAll();};});
 return errors;
}
const last=p=>p.locator('#sfPlanningChatLog .is-answer').last();
async function selectCandidate(page){
 await page.locator('#sfVacancySummary').getByRole('button',{name:'Offene Stellen prüfen'}).click();
 await expect(last(page)).toContainText('Offene Stellen');
 await last(page).getByRole('button',{name:'Mitarbeiter vorschlagen',exact:true}).first().click();
 await expect(last(page)).toContainText('Ersatz für FD');
 const ben=last(page).locator('[data-sf-chat-result]').filter({has:page.getByRole('heading',{name:'Ben Beispiel',exact:true})});
 await expect(ben).toContainText('Freigabe FD');await ben.getByRole('button',{name:'Auswirkung prüfen'}).click();
 return page.locator('#sfVacancyImpact');
}
for(const theme of ['dark','light'])test('vacancies, ranked suggestions and confirmed impact refresh the remaining holes in '+theme,async({page},info)=>{
 const errors=await setup(page,theme),before=await page.evaluate(()=>JSON.stringify({assignments,globalSoll,dailySoll}));
 await expect(page.locator('#sfVacancySummary')).toContainText('123 offene Positionen');
 let dialog=await selectCandidate(page);
 await expect(dialog).toContainText('123 → 122');await expect(dialog).toContainText('IST 1 → 2 · SOLL 2');await expect(dialog).toContainText('0 → 8 h · SOLL 180 h');
 const bounds=await dialog.boundingBox(),vp=page.viewportSize();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(vp.width+1);expect(bounds.y).toBeGreaterThanOrEqual(0);expect(bounds.y+bounds.height).toBeLessThanOrEqual(vp.height+1);
 await page.mouse.click(2,2);await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'Abbrechen',exact:true}).click();
 expect(await page.evaluate(()=>JSON.stringify({assignments,globalSoll,dailySoll}))).toBe(before);expect(await page.evaluate(()=>__writes)).toBe(0);
 await last(page).getByRole('button',{name:'Auswirkung prüfen'}).first().click();dialog=page.locator('#sfVacancyImpact');await dialog.getByRole('button',{name:'Auswirkung schließen'}).click();expect(await page.evaluate(()=>__writes)).toBe(0);
 await last(page).getByRole('button',{name:'Auswirkung prüfen'}).first().click();dialog=page.locator('#sfVacancyImpact');
 await info.attach('vacancy-impact-'+theme,{body:await page.screenshot(),contentType:'image/png'});
 await dialog.getByRole('button',{name:'Mitarbeiter einplanen',exact:true}).click();await expect(dialog).toHaveCount(0);
 await expect(page.locator('#sfVacancySummary')).toContainText('122 offene Positionen');await expect(last(page)).toContainText('122 offene Positionen');
 expect(await page.evaluate(()=>__writes)).toBe(1);expect(await page.evaluate(()=>__assignmentAttempts)).toBe(1);
 expect(await page.evaluate(()=>assignments.filter(a=>a.employeeId==='b'&&a.date==='2026-12-01'&&a.type==='FD').length)).toBe(1);
 expect(await page.evaluate(()=>JSON.stringify({globalSoll,dailySoll}))).toBe(JSON.stringify({globalSoll:{FD:2,SD:1,ND:1},dailySoll:{}}));
 expect(await page.evaluate(()=>assignments.find(a=>a.id==='a1').employeeId)).toBe('a');expect(errors).toEqual([]);
});
test('stale impact cannot assign and company changes clear the preview and private summary',async({page})=>{
 const errors=await setup(page);const dialog=await selectCandidate(page);
 await page.evaluate(()=>employees[1].weeklyHours=1);await expect(dialog.getByRole('button',{name:'Mitarbeiter einplanen'})).toBeDisabled();await expect(dialog).toContainText('Planungsdaten oder Zeitraum wurden geändert');expect(await page.evaluate(()=>__writes)).toBe(0);
 await page.evaluate(()=>SFBackend.companyId='other-company');await expect(dialog).toHaveCount(0);await expect(page.locator('#sfPlanningChat')).toBeHidden();expect(await page.evaluate(()=>__assignmentAttempts)).toBe(0);
 await page.evaluate(()=>SFBackend.role='EMPLOYEE');await expect(page.locator('#sfVacancySummary')).toHaveCount(0);expect(errors).toEqual([]);
});
test('published periods show impact but cannot be changed through the assistant',async({page})=>{
 const errors=await setup(page);await page.evaluate(()=>SFCompliance.isWeekPublished=()=>true);const dialog=await selectCandidate(page);await expect(dialog).toContainText('veröffentlicht');await expect(dialog.getByRole('button',{name:'Mitarbeiter einplanen'})).toBeDisabled();expect(await page.evaluate(()=>__writes)).toBe(0);expect(errors).toEqual([]);
});
