const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'../../'+p),'utf8');
const index=read('index.html'),section=index.slice(index.indexOf('<section id="view-auto"'),index.indexOf('\n  <section id="view-reports"',index.indexOf('<section id="view-auto"'))).replace('class="view sf-auto-workspace"','class="view active sf-auto-workspace"');
const planning=index.slice(index.indexOf('let autoPlanPreview=[];'),index.indexOf('\nfunction renderOverviewStats()',index.indexOf('let autoPlanPreview=[];')));
async function fixture(page,theme='dark'){
 await page.route('https://schichtfunk.de/__auto-plan-workspace-fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head></head><body></body></html>'}));await page.goto('https://schichtfunk.de/__auto-plan-workspace-fixture');
 await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><div id="appShell"><main class="main"><div class="content">${section}</div></main></div>`);
 await page.addScriptTag({path:path.join(__dirname,'../../assets/csp-actions-v1.js')});
 await page.addStyleTag({content:index.match(/<style>\n([\s\S]*?)<\/style>/)[1]});await page.addStyleTag({content:read('assets/manager-theme-v1.css')});await page.addStyleTag({content:read('assets/date-month-controls-v1.css')});await page.addStyleTag({content:read('assets/auto-plan-period-v1.css')});await page.addStyleTag({content:'.main{padding:20px}body{height:auto}#appShell{min-width:0}button:disabled{cursor:not-allowed}'});await page.evaluate(t=>document.documentElement.dataset.sfTheme=t,theme);
 await page.addScriptTag({content:`window.weekStart=new Date(2026,8,28);window.assignments=[];window.employees=[{id:'test',first:'Fiktive',last:'Person',status:'active',employment:'Vollzeit',shifts:['FD'],weeklyHours:40}];window.TYPES=[{id:'FD',name:'Frühdienst',start:'06:00',end:'14:00'}];window.absences=[];window.globalSoll={};window.dailySoll={};window.iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');window.addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};window.typeById=t=>TYPES.find(x=>x.id===t);window.getSoll=()=>1;window.assignmentsFor=(d,t)=>assignments.filter(a=>a.date===d&&a.type===t);window.absent=()=>false;window.plannedAssignmentHours=()=>8;window.employeeMonthlyTarget=()=>180;window.plannedMonthlyHoursForEmployee=(id,date,simulated=[])=>[...assignments,...simulated].filter(a=>a.employeeId===id&&a.date.startsWith(date.slice(0,7))).length*8;window.showSaveToast=()=>{};window.saveCalls=0;window.saveAll=()=>saveCalls++;window.renderCalendar=()=>{};window.openedView=null;window.showView=v=>openedView=v;window.SFBackend={companyId:${JSON.stringify(theme==='dark'?'a':'b')}};window.SFCompliance={policy:{monthlyPlanningMaxHours:220},isWeekPublished:()=>false,check:()=>({hard:[],soft:[]})};window.selectedMonth=null;window.SchichtFunkCalendarView={setMonth:v=>selectedMonth=v,setMode:()=>{}};`});
 await page.addScriptTag({content:read('assets/date-month-format-v1.js')});await page.addScriptTag({content:planning});await page.addScriptTag({content:read('assets/employee-rhythm-v1.js')});await page.addScriptTag({content:read('assets/supabase-auto-plan-guard-v1.js')});await page.addScriptTag({content:read('assets/auto-plan-workspace-v1.js')});
 await page.addScriptTag({content:read('assets/solid-planning-core-v1.js')});await page.addScriptTag({content:read('assets/individual-month-planner-v1.js')});await page.addScriptTag({content:read('assets/month-optimizer-core-v1.js')});await page.addScriptTag({content:read('assets/auto-plan-progress-v1.js')});await page.addScriptTag({content:read('assets/month-optimizer-v1.js')});await page.addScriptTag({content:read('assets/auto-plan-repair-core-v1.js')});await page.addScriptTag({content:read('assets/auto-plan-assurance-v1.js')});
 await page.locator('#autoPlanPeriod').selectOption('month');await page.locator('#autoPlanMonth').fill('2026-12');await page.locator('#autoPlanMonth').dispatchEvent('change');
}
async function generatePreview(page){await page.locator('#generateAutoPlanBtn').click();await expect(page.locator('#sfAutoProgressLabel')).toHaveText('Planung abgeschlossen',{timeout:100000});await expect(page.locator('#generateAutoPlanBtn')).toBeEnabled();}
async function openRuleSection(page,key){
 const overview=page.locator('#autoRuleDetails');if(await overview.getAttribute('open')===null)await overview.locator(':scope > summary').click();
 const section=overview.locator(`[data-rule-section="${key}"]`);if(await section.getAttribute('open')===null)await section.locator(':scope > summary').click();return section;
}
async function previewEditor(page){await page.addScriptTag({content:read('assets/auto-plan-preview-editor-v1.js')});await page.evaluate(()=>renderAutoPlanning());}
async function completeApply(page){await expect(page.locator('#sfAutoApplyTitle')).toHaveText('Entwurf übernommen');await page.locator('.sf-auto-apply [data-close]').click();}
test('planner changes a short staffed day through the server only after a successful save',async({page})=>{
 await fixture(page);await page.addScriptTag({content:read('assets/shift-models-v1.js')});
 await page.evaluate(()=>{
  SFShiftModels.apply([{code:'FD',active:true,default_start:'06:00',default_end:'14:00'}],SFBackend.companyId);globalSoll={FD:3};getSoll=(d,t)=>SFShiftModels.requiredSoll(d,t,d==='2026-12-01'?3:0);
  SFCompliance.policy.solidPlanningRules={timezone:'Europe/Paris'};SFBackend.ready=true;SFBackend.role='PLANNER';window.__staffingFail=true;window.__staffingCalls=0;
  SFBackend.client={rpc:async(name,p)=>{if(name!=='set_planning_staffing_exception')throw Error(name);__staffingCalls++;if(__staffingFail)return{error:{message:'Speicherung fehlgeschlagen'}};return{data:{rules:{staffingExceptions:{[p.p_date]:{[p.p_code]:{required:p.p_required,reason:p.p_reason}}}},daily:[{date:p.p_date,code:p.p_code,required:p.p_required}],oldFingerprint:null,newFingerprint:null}};}};
  autoPlanPreview=[{id:'a',employeeId:'test',type:'FD',date:'2026-12-01',start:'06:00',end:'14:00'}];autoPlanAnalyzed=true;autoPlanApplied=0;
 });await previewEditor(page);const cell=page.locator('[data-staffing-shift="FD"] td').first();await cell.locator('.sf-auto-staffing-target').click();
 await page.getByLabel('SOLL für diesen Tag',{exact:true}).fill('1');await page.getByLabel('Begründung der Besetzungsausnahme').fill('Reduzierte Besetzung abgestimmt');await page.getByRole('button',{name:'Nur für diesen Tag speichern',exact:true}).click();
 await expect(page.locator('#sfStaffingExceptionDialog [data-error]')).toContainText('Speicherung fehlgeschlagen');await expect(cell).toContainText('SOLL 3');
 await page.evaluate(()=>__staffingFail=false);await page.getByRole('button',{name:'Nur für diesen Tag speichern',exact:true}).click();await expect(page.locator('#sfStaffingExceptionDialog')).toHaveCount(0);await expect(cell).toContainText('SOLL 1');expect(await page.evaluate(()=>SFCompliance.policy.solidPlanningRules.timezone)).toBe('Europe/Paris');expect(await page.evaluate(()=>__staffingCalls)).toBe(2);
});
for(const theme of ['dark','light'])test('planner changes a short staffed day target, preserves other days and restores it in '+theme,async({page})=>{
 await fixture(page,theme);await page.addScriptTag({content:read('assets/shift-models-v1.js')});
 await page.evaluate(()=>{
  SFShiftModels.apply([{code:'FD',active:true,default_start:'06:00',default_end:'14:00'}],SFBackend.companyId);
  globalSoll={FD:3};getSoll=(d,t)=>SFShiftModels.requiredSoll(d,t,d==='2026-12-01'||d==='2026-12-02'?3:0);
  employees=[{id:'a',first:'Test',last:'A',status:'active',shifts:['FD'],weeklyHours:40},{id:'b',first:'Test',last:'B',status:'active',shifts:['FD'],weeklyHours:40}];
  autoPlanPreview=employees.map(e=>({id:e.id,employeeId:e.id,type:'FD',date:'2026-12-01',start:'06:00',end:'14:00'}));autoPlanAnalyzed=true;autoPlanApplied=0;
 });await previewEditor(page);
 const cell=page.locator('[data-staffing-shift="FD"] td').first();
 await expect(cell).toContainText('SOLL 3');await expect(cell.locator('.sf-auto-staffing-add')).toBeVisible();
 await cell.getByRole('button',{name:'2026-12-01 · FD · SOLL ändern',exact:true}).click();
 await page.getByLabel('SOLL für diesen Tag',{exact:true}).fill('2');await page.getByLabel('Begründung der Besetzungsausnahme').fill('Personalmangel abgestimmt');
 await page.getByRole('button',{name:'Nur für diesen Tag speichern',exact:true}).click();
 await expect(page.locator('#sfStaffingExceptionDialog')).toHaveCount(0);await expect(cell).toContainText('SOLL 2');await expect(cell).not.toHaveClass(/is-short/);
 expect(await page.evaluate(()=>getSoll('2026-12-02','FD'))).toBe(3);expect(await page.evaluate(()=>autoPlanPreview.length)).toBe(2);
 await cell.locator('.sf-auto-staffing-target').click();await page.getByLabel('SOLL für diesen Tag',{exact:true}).fill('0');await page.getByRole('button',{name:'Nur für diesen Tag speichern',exact:true}).click();
 await expect(cell).toContainText('SOLL 0');expect(await page.evaluate(()=>autoPlanPreview.length)).toBe(2);
 await cell.locator('.sf-auto-staffing-target').click();await page.getByRole('button',{name:'Ausnahme aufheben',exact:true}).click();await expect(cell).toContainText('SOLL 3');
 await page.evaluate(()=>{SFBackend.ready=true;SFBackend.role='EMPLOYEE';renderAutoPlanning()});await expect(page.locator('.sf-auto-staffing-target')).toHaveCount(0);
});
test('automatic repair backfills a flexible employee and closes a cross-day qualification bottleneck',async({page})=>{
 await fixture(page);await page.locator('#autoFairDistribution').uncheck();await page.evaluate(()=>{
  employees=[{id:'flex',first:'Flexible',last:'Person',status:'active',employment:'Teilzeit',monthlyHours:8,weeklyHours:40,shifts:['FD','ND']},{id:'single',first:'Frühdienst',last:'Person',status:'active',employment:'Teilzeit',monthlyHours:8,weeklyHours:40,shifts:['FD']}];
  TYPES.push({id:'ND',start:'18:00',end:'02:00'});employeeMonthlyTarget=e=>e.monthlyHours;getSoll=(d,t)=>Number(d==='2026-12-01'&&t==='FD'||d==='2026-12-02'&&t==='ND');
 });await generatePreview(page);
 expect(await page.evaluate(()=>autoPlanPreview.map(a=>[a.date,a.type,a.employeeId]))).toEqual([['2026-12-01','FD','single'],['2026-12-02','ND','flex']]);
 await expect(page.locator('#autoUnresolvedCount')).toHaveText('0');await expect(page.locator('#autoPlanAssurance')).toContainText('Vorschlag automatisch geprüft');await expect(page.locator('#autoPlanAssurance')).toContainText('1 Umbesetzungen mit Ersatzbesetzung');await expect(page.locator('#applyAutoPlanBtn')).toBeEnabled();
 expect(await page.evaluate(()=>({saved:saveCalls,rows:assignments.length}))).toEqual({saved:0,rows:0});
});
test('final audit exposes changed contracts and missing validators and prevents an invalid save',async({page})=>{
 await fixture(page);await page.evaluate(()=>getSoll=d=>Number(d==='2026-12-01'));await generatePreview(page);await expect(page.locator('#autoPlanAssurance')).toContainText('Vorschlag automatisch geprüft');
 await page.evaluate(()=>{employees[0].contractEnd='2026-11-30';renderAutoPlanning()});await expect(page.locator('#autoPlanAssurance')).toContainText('1 Regelkonflikte');await expect(page.locator('#applyAutoPlanBtn')).toBeDisabled();await page.evaluate(()=>applyAutoPlanPreview());expect(await page.evaluate(()=>saveCalls)).toBe(0);await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.evaluate(()=>{delete employees[0].contractEnd;window.savedGuard=SFAutoPlanGuard;SFAutoPlanGuard=null;renderAutoPlanning()});await expect(page.locator('#autoPlanAssurance')).toContainText('noch nicht geladen');await expect(page.locator('#applyAutoPlanBtn')).toBeDisabled();
 await page.evaluate(()=>{SFAutoPlanGuard=savedGuard;renderAutoPlanning()});await expect(page.locator('#applyAutoPlanBtn')).toBeEnabled();await expect(page.locator('#autoPlanAssurance')).toContainText('Vorschlag automatisch geprüft');
});
for(const theme of ['dark','light'])test(`equal 180-hour targets balance twelve-hour January duties without saving in ${theme}`,async({page})=>{
 await fixture(page,theme);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluate(()=>{
  const anchors=['2026-10-19','2026-10-18','2026-10-10','2026-10-15','2026-10-11','2026-10-19'];
  employees=anchors.map((start,i)=>({id:String(i),first:'Test',last:'Person '+i,status:'active',employment:'Vollzeit',weeklyHours:40,maxWeeklyHours:60,monthlyHours:180,maxConsecutiveShifts:i===5?6:4,shifts:['TS','N'],rhythmMode:i===5?'off':'required',rhythmStart:start,rhythmPattern:'ALLE,ALLE,ALLE,ALLE,FREI,FREI,FREI,ALLE,ALLE,ALLE,FREI,FREI'}));
  TYPES=[{id:'TS',name:'Tagdienst',start:'06:00',end:'18:00'},{id:'N',name:'Nachtdienst',start:'18:00',end:'06:00'}];SFCompliance.policy={monthlyPlanningMaxHours:220,standardMaxShiftHours:12};employeeMonthlyTarget=e=>e.monthlyHours;plannedAssignmentHours=()=>12;plannedMonthlyHoursForEmployee=(id,date,sim=[])=>[...assignments,...sim].filter(a=>a.employeeId===id&&a.date.startsWith(date.slice(0,7))).length*12;getSoll=(date,type)=>date.startsWith('2027-01')?(type==='TS'?2:1):0;
 });
 await page.locator('#autoPlanMonth').fill('2027-01');await page.locator('#autoPlanMonth').dispatchEvent('change');await generatePreview(page);
 const result=await page.evaluate(()=>({hours:employees.map(e=>autoPlanPreview.filter(a=>a.employeeId===e.id).length*12).sort((a,b)=>a-b),open:autoPlanUnresolved.length,saved:saveCalls,assignments:assignments.length,valid:autoPlanPreview.every(a=>SFAutoPlanGuard.passesTimeRules(a.employeeId,a.type,a.date,autoPlanPreview.filter(b=>b!==a)))}));
 expect(result).toEqual({hours:[180,180,180,192,192,192],open:0,saved:0,assignments:0,valid:true});await expect(page.locator('.sf-auto-draft-summary')).toContainText('1.116 h');expect(errors).toEqual([]);
 await page.locator('#autoStaircase').screenshot({path:test.info().outputPath('balanced-january-'+theme+'.png')});
});
for(const theme of ['dark','light'])test(`draft apply shows pending save, elapsed time and completion without duplicate writes in ${theme}`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page,theme);
 await page.evaluate(()=>{autoPlanPreview=[{id:'p',employeeId:'test',date:'2026-12-01',type:'FD',start:'06:00',end:'14:00'}];autoPlanAnalyzed=true;SFBackend.ready=true;SFBackend.syncCalls=0;SFBackend.sync=()=>{SFBackend.syncCalls++;return new Promise(resolve=>window.releaseApplySave=resolve);};renderAutoPlanning();});
 await page.locator('#applyAutoPlanBtn').click();await page.getByRole('button',{name:'Als Entwurf übernehmen',exact:true}).click();
 await expect(page.locator('#sfAutoApplyTitle')).toHaveText('Vorschläge werden übernommen');await expect(page.locator('.sf-auto-apply-steps .is-current')).toHaveText('Entwurf speichern');await expect(page.locator('.sf-auto-apply [role="progressbar"]')).toBeVisible();await expect(page.locator('#generateAutoPlanBtn')).toBeDisabled();await expect(page.locator('.sf-auto-apply footer')).toBeHidden();
 await expect(page.locator('#sfAutoApplyTime')).not.toHaveText('Vergangen: 0 s');await page.keyboard.press('Escape');await expect(page.locator('#sfAutoApplyTitle')).toBeVisible();await page.evaluate(()=>applyAutoPlanPreview());expect(await page.evaluate(()=>SFBackend.syncCalls)).toBe(1);expect(await page.evaluate(()=>SFBackend.autoPlanApplying)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:test.info().outputPath('apply-pending-'+theme+'.png'),fullPage:true});
 await page.evaluate(()=>releaseApplySave());await expect(page.locator('#sfAutoApplyTitle')).toHaveText('Entwurf übernommen');await expect(page.locator('#sfAutoApplyDetail')).toContainText('Veröffentlichung erfolgt gesondert');await expect(page.locator('.sf-auto-apply [role="progressbar"]')).toBeHidden();expect(await page.evaluate(()=>SFBackend.autoPlanApplying)).toBe(false);expect(await page.evaluate(()=>assignments.length)).toBe(1);
 await page.locator('.sf-auto-apply [data-schedule]').click();expect(await page.evaluate(()=>openedView)).toBe('schedule');expect(errors).toEqual([]);
});
test('a rejected draft save shows an error and never announces successful completion',async({page})=>{
 await fixture(page);await page.evaluate(()=>{autoPlanPreview=[{id:'p',employeeId:'test',date:'2026-12-01',type:'FD',start:'06:00',end:'14:00'}];autoPlanAnalyzed=true;SFBackend.ready=true;SFBackend.sync=async()=>{SFBackend.lastSyncError=Error('Test: Verbindung unterbrochen');};renderAutoPlanning();});
 await page.locator('#applyAutoPlanBtn').click();await page.getByRole('button',{name:'Als Entwurf übernehmen',exact:true}).click();await expect(page.locator('#sfAutoApplyTitle')).toHaveText('Übernahme nicht abgeschlossen');await expect(page.locator('#sfAutoApplyDetail')).toContainText('Speicherung konnte nicht bestätigt werden');await expect(page.locator('#sfAutoApplyDetail')).toContainText('Verbindung unterbrochen');await expect(page.locator('.sf-auto-apply [data-schedule]')).toBeHidden();expect(await page.evaluate(()=>SFBackend.autoPlanApplying)).toBe(false);await page.locator('.sf-auto-apply [data-close]').click();await expect(page.locator('#generateAutoPlanBtn')).toBeEnabled();
});
for(const theme of ['dark','light'])test(`orange staffing vacancy selects qualified available employees and refreshes counts in ${theme}`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page,theme);
 await page.evaluate(()=>{
  const person={status:'active',employment:'Vollzeit',shifts:['FD'],weeklyHours:40,monthlyHours:180};employees=[{...person,id:'alice',first:'Alice',last:'Passend',personnelNo:'100'},{...person,id:'bob',first:'Bob',last:'Passend',personnelNo:'101'},{...person,id:'wrong',first:'Ohne',last:'Freigabe',shifts:[]},{...person,id:'away',first:'Im',last:'Urlaub'},{...person,id:'fixed',first:'Fest',last:'Frei',rhythmMode:'required',rhythmStart:'2026-12-01',rhythmPattern:'FREI,ALLE'}];absent=id=>id==='away';getSoll=date=>date==='2026-12-01'?2:0;autoPlanAnalyzed=true;renderAutoPlanning();
 });await previewEditor(page);
 const cell=page.locator('[data-staffing-shift="FD"] td').first();await expect(cell).toHaveClass(/is-short/);
 await cell.locator('.sf-auto-staffing-add').focus();await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();await expect(page.locator('#sfPreviewFrom')).toHaveValue('2026-12-01');await expect(page.locator('#sfPreviewTo')).toHaveValue('2026-12-01');await expect(page.locator('#sfPreviewShift')).toHaveValue('FD');await expect(page.locator('#sfPreviewSearch')).toBeFocused();
 await expect(page.locator('#sfPreviewEmployee option')).toHaveCount(4);await expect(page.locator('#sfPreviewEmployee option[value="fixed"]')).toBeEnabled();await expect(page.locator('#sfPreviewEmployee')).not.toContainText('Urlaub');await page.locator('#sfPreviewUnavailable summary').click();await expect(page.locator('#sfPreviewUnavailable')).toContainText('Keine Freigabe');await expect(page.locator('#sfPreviewUnavailable')).toContainText('abwesend');await expect(page.locator('#sfPreviewUnavailable')).not.toContainText('freien Tag');
 await page.locator('#sfPreviewSearch').fill('niemand');await expect(page.getByRole('button',{name:'In Vorplanung übernehmen',exact:true})).toBeDisabled();await expect(page.locator('#sfPreviewCandidatesStatus')).toContainText('Keine passenden');await page.locator('#sfPreviewSearch').fill('Bob Passend');await expect(page.locator('#sfPreviewEmployee option')).toHaveCount(2);await page.locator('#sfPreviewSearch').fill('101');await expect(page.locator('#sfPreviewEmployee option')).toHaveCount(2);await page.locator('#sfPreviewEmployee').selectOption('bob');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:test.info().outputPath('vacancy-picker-'+theme+'.png'),fullPage:true});await page.getByRole('button',{name:'In Vorplanung übernehmen',exact:true}).click();await expect(cell).toContainText('IST 1');await expect(cell).toHaveClass(/is-short/);expect(await page.evaluate(()=>autoPlanPreview.map(a=>a.employeeId))).toEqual(['bob']);expect(await page.evaluate(()=>assignments.length)).toBe(0);expect(await page.evaluate(()=>saveCalls)).toBe(0);
 await cell.locator('.sf-auto-staffing-add').click();await expect(page.locator('#sfPreviewEmployee option[value="bob"]')).toHaveCount(0);await expect(page.locator('#sfPreviewUnavailable')).toContainText('bereits ein Dienst');await page.locator('#sfPreviewEmployee').selectOption('alice');await page.getByRole('button',{name:'In Vorplanung übernehmen',exact:true}).click();await expect(cell).toHaveClass(/is-balanced/);await expect(cell).toContainText('IST 2');await expect(cell.locator('.sf-auto-staffing-add')).toHaveCount(0);expect(await page.evaluate(()=>assignments.length)).toBe(0);
 await page.getByRole('button',{name:'Rückgängig',exact:true}).click();await expect(cell.locator('.sf-auto-staffing-add')).toBeVisible();await cell.locator('.sf-auto-staffing-add').click();await page.keyboard.press('Escape');await expect(cell.locator('.sf-auto-staffing-add')).toBeFocused();expect(errors).toEqual([]);
});
test('orange shared leader vacancy selects the correct qualified TL alternative and enforces role while allowing conscious transition overrides',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page);await page.addScriptTag({content:read('assets/shift-models-v1.js')});
 await page.evaluate(()=>{
  SFShiftModels.apply(['TL-LE','TL-RE'].map(code=>({code,active:true,default_start:'20:00',default_end:'06:00',coverage_group:'TL LE/RE',coverage_required:1})),SFBackend.companyId);
  const person={status:'active',employment:'Vollzeit',weeklyHours:40,monthlyHours:180,role:'Teamleiter',shifts:['TL-RE']};employees=[{...person,id:'right',first:'RE',last:'Leitung'},{...person,id:'notleader',first:'Keine',last:'Leitung',role:'Operator'},{...person,id:'left',first:'LE',last:'Leitung',shifts:['TL-LE']}];getSoll=()=>0;autoPlanAnalyzed=true;renderAutoPlanning();
 });await previewEditor(page);
 const cell=page.locator('[data-staffing-group="TL LE/RE"] td').first();await expect(page.locator('[data-staffing-shift="TL-LE"] td').first().locator('.sf-auto-staffing-add')).toHaveCount(0);await cell.locator('.sf-auto-staffing-add').click();await expect(page.locator('#sfPreviewEmployee option[value="right"]')).toContainText('TL-RE');await expect(page.locator('#sfPreviewEmployee option[value="left"]')).toContainText('TL-LE');await expect(page.locator('#sfPreviewEmployee option[value="notleader"]')).toHaveCount(0);await expect(page.locator('#sfPreviewUnavailable')).toContainText('Leitungsrolle');await page.locator('#sfPreviewEmployee').selectOption('right');await page.getByRole('button',{name:'In Vorplanung übernehmen',exact:true}).click();await expect(cell).toContainText('IST 1');await expect(cell.locator('.sf-auto-staffing-add')).toHaveCount(0);expect(await page.evaluate(()=>autoPlanPreview.map(a=>[a.employeeId,a.type,a.coverageGroup]))).toEqual([['right','TL-RE','TL LE/RE']]);expect(await page.evaluate(()=>assignments.length)).toBe(0);
 await page.getByRole('button',{name:'Rückgängig',exact:true}).click();await page.evaluate(()=>{SFCompliance={policy:{solidPlanningRules:{enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',preventLeaderToO1:true,maxCalendarWeekHours:55}}};TYPES.push({id:'O1',start:'18:00',end:'04:00',active:true,optionalWeekdays:[1,2,3,4,5,6,7]});employees=employees.filter(e=>e.id==='right');employees[0].shifts.push('O1');assignments=[{id:'next',employeeId:'right',date:'2026-12-02',type:'O1',start:'18:00',end:'04:00'}];getSoll=(d,t)=>Number(d==='2026-12-02'&&t==='O1');renderAutoPlanning();});
 await cell.locator('.sf-auto-staffing-add').click();await expect(page.locator('#sfPreviewEmployee option[value="right"]')).toBeEnabled();await page.locator('#sfPreviewEmployee').selectOption('right');await expect(page.getByRole('button',{name:'In Vorplanung übernehmen',exact:true})).toBeEnabled();expect(errors).toEqual([]);
});

for(const theme of ['dark','light'])test(`preview editor changes, removes, restores and adds duties before the confirmed save in ${theme}`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page,theme);
 await page.evaluate(()=>{employees.push({...employees[0],id:'second',first:'Zweite',last:'Person'});getSoll=date=>Number(date==='2026-12-01'||date==='2026-12-02');});
 await generatePreview(page);await previewEditor(page);
 const original=await page.evaluate(()=>JSON.stringify(autoPlanPreview)),first=await page.evaluate(()=>autoPlanPreview[0]),other=first.employeeId==='test'?'second':'test';
 await page.getByRole('button',{name:'Dienst hinzufügen',exact:true}).click();
 await page.locator('#sfPreviewFrom').fill('2026-12-03');await page.locator('#sfPreviewFrom').dispatchEvent('change');
 await expect(page.locator('#sfPreviewEmployee option:not(:disabled)')).toHaveCount(3);await page.keyboard.press('Escape');
 await page.getByRole('button',{name:new RegExp(first.date+' · Dienst ändern')}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);if(theme==='light')expect(await page.locator('#sfPreviewTo').evaluate(e=>{const s=getComputedStyle(e);return s.color===s.webkitTextFillColor})).toBe(true);await page.screenshot({path:test.info().outputPath('preview-dialog-'+theme+'.png'),fullPage:true});
 // Employee-row editing deliberately locks the employee. The general editor
 // used by suggestion actions is the supported route for reassignment.
 await expect(page.locator('#sfPreviewEmployee')).toHaveAttribute('type','hidden');await expect(page.locator('#sfPreviewEmployee')).toHaveValue(first.employeeId);await page.keyboard.press('Escape');await page.evaluate(id=>SFAutoPlanPreviewEditor.open({id}),first.id);
 await page.locator('#sfPreviewEmployee').selectOption(other);await page.getByRole('button',{name:'In Vorplanung übernehmen',exact:true}).click();
 expect(await page.evaluate(()=>assignments.length)).toBe(0);expect(await page.evaluate(date=>autoPlanPreview.find(a=>a.date===date).employeeId,first.date)).toBe(other);
 await page.getByRole('button',{name:new RegExp(first.date+' · Dienst ändern')}).click();await page.getByRole('button',{name:'Nur diesen Dienst entfernen',exact:true}).click();
 await expect(page.locator('#autoUnresolvedCount')).toHaveText('1');expect(await page.evaluate(()=>autoPlanPreview.length)).toBe(1);
 await page.getByRole('button',{name:'Rückgängig',exact:true}).click();expect(await page.evaluate(()=>autoPlanPreview.length)).toBe(2);
 await page.getByRole('button',{name:'Rückgängig',exact:true}).click();expect(await page.evaluate(()=>JSON.stringify(autoPlanPreview))).toBe(original);
 await page.getByRole('button',{name:new RegExp(first.date+' · Dienst ändern')}).click();await page.getByRole('button',{name:'Nur diesen Dienst entfernen',exact:true}).click();
 await page.getByRole('button',{name:'Dienst hinzufügen',exact:true}).click();await page.locator('#sfPreviewFrom').fill(first.date);await page.locator('#sfPreviewTo').fill(first.date);await page.locator('#sfPreviewTo').dispatchEvent('change');await page.locator('#sfPreviewEmployee').selectOption(first.employeeId);await page.getByRole('button',{name:'In Vorplanung übernehmen',exact:true}).click();
 await expect(page.locator('#autoUnresolvedCount')).toHaveText('0');expect(await page.evaluate(()=>assignments.length)).toBe(0);
 await page.screenshot({path:test.info().outputPath('preview-edited-'+theme+'.png'),fullPage:true});
 await page.locator('#applyAutoPlanBtn').click();await page.getByRole('button',{name:'Als Entwurf übernehmen',exact:true}).click();await completeApply(page);
 expect(await page.evaluate(()=>assignments.length)).toBe(2);expect(await page.evaluate(()=>saveCalls)).toBe(1);expect(await page.evaluate(()=>assignments.every(a=>!a.publishedAt))).toBe(true);expect(errors).toEqual([]);
});
test('preview editor accepts a shorter work block without warning and still supports complete ranges',async({page})=>{
 await fixture(page);await page.evaluate(()=>{employees=[{id:'e',first:'Block',last:'Person',status:'active',employment:'Vollzeit',shifts:['O1'],weeklyHours:40,maxWeeklyHours:55,monthlyHours:180,rhythmMode:'required',rhythmStart:'2026-12-01',rhythmPattern:'ALLE,ALLE,ALLE,FREI,FREI'}];TYPES=[{id:'O1',name:'O1',start:'18:00',end:'04:00'}];getSoll=date=>Number(date<='2026-12-03');plannedAssignmentHours=()=>10;autoPlanPreview=[1,2,3].map(n=>({id:'p'+n,date:'2026-12-0'+n,type:'O1',start:'18:00',end:'04:00',employeeId:'e',blockId:'whole'}));autoPlanAnalyzed=true;renderAutoPlanning();});await previewEditor(page);
 await page.evaluate(()=>removeAutoSuggestion(1));expect(await page.evaluate(()=>autoPlanPreview.length)).toBe(2);await expect(page.locator('#sfAutoPreviewTools')).not.toContainText('unvollständig');await expect(page.locator('#sfAutoPreviewTools')).not.toContainText('Vor der Übernahme korrigieren');await expect(page.locator('#applyAutoPlanBtn')).toBeEnabled();
 await page.getByRole('button',{name:'Rückgängig',exact:true}).click();await expect(page.locator('#applyAutoPlanBtn')).toBeEnabled();
 await page.evaluate(()=>{autoPlanPreview=[];renderAutoPlanning();});
 await page.getByRole('button',{name:'Dienst hinzufügen',exact:true}).click();await page.locator('#sfPreviewFrom').fill('2026-12-01');await page.locator('#sfPreviewTo').fill('2026-12-03');await page.locator('#sfPreviewTo').dispatchEvent('change');await page.locator('#sfPreviewEmployee').selectOption('e');await page.getByRole('button',{name:'In Vorplanung übernehmen',exact:true}).click();
 expect(await page.evaluate(()=>autoPlanPreview.length)).toBe(3);expect(await page.evaluate(()=>assignments.length)).toBe(0);await expect(page.locator('#applyAutoPlanBtn')).toBeEnabled();
});
test('preview editor accepts a consciously planned overnight block despite automatic recovery limits',async({page})=>{
 await fixture(page);await page.locator('#autoPlanMonth').fill('2027-01');await page.locator('#autoPlanMonth').dispatchEvent('change');
 await page.evaluate(()=>{
  employees=[{id:'e',personnelNo:'2046',first:'Dennis',last:'Klima',status:'active',employment:'Vollzeit',shifts:['O2'],weeklyHours:40,maxWeeklyHours:55,monthlyHours:180}];
  TYPES=[{id:'O2',name:'O2',start:'20:00',end:'06:00'}];getSoll=d=>Number(d>='2027-01-07'&&d<='2027-01-09');plannedAssignmentHours=()=>10;
  assignments=[{id:'previous',employeeId:'e',date:'2027-01-04',type:'O2',start:'20:00',end:'06:00'}];
  SFCompliance={policy:{solidPlanningRules:{enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',maxConsecutiveShifts:4,maxConsecutiveNightShifts:4,minFreeCalendarDays:2,minNightRecoveryCalendarDays:2,minBlockRestHours:48,maxCalendarWeekHours:55}}};autoPlanAnalyzed=true;renderAutoPlanning();
 });
 await page.addScriptTag({content:read('assets/compliance-core-v2.js')});await previewEditor(page);
 await page.evaluate(()=>SFAutoPlanPreviewEditor.open({dates:['2027-01-07','2027-01-08','2027-01-09'],employeeId:'e',rowEmployee:true}));
 await expect(page.locator('#sfPreviewEditError')).toBeEmpty();
 await expect(page.locator('#sfPreviewFiveDays')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'In Vorplanung übernehmen',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'In Vorplanung übernehmen',exact:true}).click();
 expect(await page.evaluate(()=>autoPlanPreview.length)).toBe(3);
 await expect(page.locator('#applyAutoPlanBtn')).toBeEnabled();
 await page.locator('#applyAutoPlanBtn').click();await page.getByRole('button',{name:'Als Entwurf übernehmen',exact:true}).click();await completeApply(page);
 expect(await page.evaluate(()=>assignments.length)).toBe(4);
 expect(await page.evaluate(()=>assignments.filter(a=>a.rhythmOverride?.manualPlanning).length)).toBe(3);
});
test('preview editor edits a monthly replacement without counting the old draft twice',async({page})=>{
 await fixture(page);await page.evaluate(()=>{employees=['a','b'].map(id=>({id,first:'Test',last:id,status:'active',employment:'Teilzeit',shifts:['FD'],weeklyHours:40,monthlyHours:16}));employeeMonthlyTarget=e=>e.monthlyHours;getSoll=date=>Number(date==='2026-12-01'||date==='2026-12-02');assignments=[1,2].map(n=>({id:'old'+n,date:'2026-12-0'+n,type:'FD',employeeId:'a',start:'06:00',end:'14:00'}));});
 await page.locator('#optimizeAutoMonthBtn').click();await expect(page.locator('#autoSuggestionCount')).toHaveText('2');await previewEditor(page);
 const first=await page.evaluate(()=>autoPlanPreview[0]);await page.evaluate(id=>SFAutoPlanPreviewEditor.open({id}),first.id);
 const newEmployee=first.employeeId==='a'?'b':'a';await page.locator('#sfPreviewEmployee').selectOption(newEmployee);await page.getByRole('button',{name:'In Vorplanung übernehmen',exact:true}).click();
 expect(await page.evaluate(()=>assignments.every(a=>a.id.startsWith('old')))).toBe(true);
 await page.locator('#applyAutoPlanBtn').click();await page.getByRole('button',{name:'Als Entwurf übernehmen',exact:true}).click();await completeApply(page);
 expect(await page.evaluate(()=>assignments.length)).toBe(2);expect(await page.evaluate(date=>assignments.find(a=>a.date===date).employeeId,first.date)).toBe(newEmployee);expect(await page.evaluate(()=>saveCalls)).toBe(1);
});
test('preview editor validates a three-night range as a whole before adding and applying',async({page})=>{
 await fixture(page);await page.locator('#autoPlanMonth').fill('2027-01');await page.locator('#autoPlanMonth').dispatchEvent('change');
 await page.evaluate(()=>{
  employees=[{id:'e',first:'Block',last:'Nacht',status:'active',employment:'Vollzeit',shifts:['O2'],weeklyHours:40,maxWeeklyHours:55,monthlyHours:180,rhythmMode:'required',rhythmStart:'2027-01-28',rhythmPattern:'ALLE,ALLE,ALLE,FREI,FREI'}];
  TYPES=[{id:'O2',name:'O2',start:'20:00',end:'06:00'}];getSoll=date=>Number(date>='2027-01-28'&&date<='2027-02-02');plannedAssignmentHours=()=>10;plannedMonthlyHoursForEmployee=(id,date,sim=[])=>[...assignments,...sim].filter(a=>a.employeeId===id&&a.date.startsWith(date.slice(0,7))).length*10;
  assignments=[{id:'next',employeeId:'e',date:'2027-02-02',type:'O2',start:'20:00',end:'06:00'}];SFCompliance={policy:{solidPlanningRules:{enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',maxConsecutiveShifts:4,maxConsecutiveNightShifts:4,minFreeCalendarDays:2,minNightRecoveryCalendarDays:2,minBlockRestHours:48,maxCalendarWeekHours:55,threeNightBlockRecoveryFullCalendarDays:1}}};autoPlanAnalyzed=true;renderAutoPlanning();
 });
 await page.addScriptTag({content:read('assets/compliance-core-v2.js')});await previewEditor(page);
 await page.getByRole('button',{name:'Dienst hinzufügen',exact:true}).click();await page.locator('#sfPreviewFrom').fill('2027-01-28');await page.locator('#sfPreviewTo').fill('2027-01-30');await page.locator('#sfPreviewTo').dispatchEvent('change');await page.locator('#sfPreviewEmployee').selectOption('e');await page.getByRole('button',{name:'In Vorplanung übernehmen',exact:true}).click();
 expect(await page.evaluate(()=>autoPlanPreview.length)).toBe(3);await expect(page.locator('#applyAutoPlanBtn')).toBeEnabled();
 await page.locator('#applyAutoPlanBtn').click();await page.getByRole('button',{name:'Als Entwurf übernehmen',exact:true}).click();await completeApply(page);expect(await page.evaluate(()=>assignments.length)).toBe(4);
});
test('automatic planning finds the complete three-night block and applies it with boundary recovery',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page);
 await page.locator('#autoPlanMonth').fill('2027-01');await page.locator('#autoPlanMonth').dispatchEvent('change');
 await page.evaluate(()=>{
  employees=[{id:'e',first:'Block',last:'Nacht',status:'active',employment:'Vollzeit',shifts:['O2'],weeklyHours:40,maxWeeklyHours:55,monthlyHours:180,rhythmMode:'required',rhythmStart:'2027-01-28',rhythmPattern:'ALLE,ALLE,ALLE,FREI,FREI'}];
  TYPES=[{id:'O2',name:'O2',start:'20:00',end:'06:00'}];getSoll=date=>Number(date>='2027-01-28'&&date<='2027-01-30');plannedAssignmentHours=()=>10;plannedMonthlyHoursForEmployee=(id,date,sim=[])=>[...assignments,...sim].filter(a=>a.employeeId===id&&a.date.startsWith(date.slice(0,7))).length*10;
  assignments=[{id:'next',employeeId:'e',date:'2027-02-02',type:'O2',start:'20:00',end:'06:00'}];SFCompliance={policy:{solidPlanningRules:{enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',maxConsecutiveShifts:4,maxConsecutiveNightShifts:4,minFreeCalendarDays:2,minNightRecoveryCalendarDays:2,minBlockRestHours:48,maxCalendarWeekHours:55,threeNightBlockRecoveryFullCalendarDays:1}}};renderAutoPlanning();
 });
 expect(await page.evaluate(()=>SFAutoPlanGuard.passesTimeRules('e','O2','2027-01-30'))).toBe(false);
 await generatePreview(page);expect(await page.evaluate(()=>autoPlanPreview.map(a=>a.date))).toEqual(['2027-01-28','2027-01-29','2027-01-30']);
 expect(await page.evaluate(()=>assignments.length)).toBe(1);await expect(page.locator('#autoMonthHours')).toContainText('vollständigen Arbeitsblock');
 await page.locator('#applyAutoPlanBtn').click();await page.getByRole('button',{name:'Als Entwurf übernehmen',exact:true}).click();await completeApply(page);expect(await page.evaluate(()=>assignments.length)).toBe(4);expect(errors).toEqual([]);
});
test('OT monthly cap schedules staggered days off and retains coverage before confirmed apply',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page);await page.locator('#autoPlanMonth').fill('2028-03');await page.locator('#autoPlanMonth').dispatchEvent('change');
 await page.evaluate(()=>{
  employees=['a','b','c'].map(id=>({id,_dbId:'db-'+id,first:'OT',last:id,status:'active',employment:'Vollzeit',monthlyHours:220,weeklyHours:40,maxWeeklyHours:55,maxConsecutiveShifts:5,shifts:['OT1','OT2','OT3']}));
  TYPES=[{id:'OT1',name:'OT1',start:'06:00',end:'16:00'},{id:'OT2',name:'OT2',start:'08:00',end:'18:00'},{id:'OT3',name:'OT3',start:'10:00',end:'20:00'}];getSoll=()=>0;employeeMonthlyTarget=e=>e.monthlyHours;plannedAssignmentHours=()=>10;plannedMonthlyHoursForEmployee=(id,date,sim=[])=>[...assignments,...sim].filter(a=>a.employeeId===id&&a.date.startsWith(date.slice(0,7))).length*10;
  SFCompliance={policy:{solidPlanningRules:{enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',maxConsecutiveShifts:4,maxCalendarWeekHours:55,minFreeCalendarDays:2,minBlockRestHours:48,otOnlyMonthlyMaxHours:200,otOnlyMaxCalendarWeekHours:55,otOnlyMaxConsecutiveShifts:5,otOnlyMinFreeCalendarDays:2,otOnlyMinBlockRestHours:48,otWeekdayRoster:{employeeIds:['db-a','db-b','db-c'],weekdays:[1,2,3,4,5],allowDaysOff:true,minimumDailyStaff:2},conditionalStaffing:[{shift:'OT1',sourceShift:'O3',sourceDayOffset:-1,coverageStart:'06:00',coverageEnd:'08:00',minimum:3,fallbackCount:1},{shift:'OT3',sourceShift:'O1',sourceDayOffset:0,coverageStart:'18:00',coverageEnd:'20:00',minimum:3,fallbackCount:1}]}}};for(const date of autoPlanningDates().filter(d=>SFSolidPlanningCore.weekday(d)<=5))for(let n=0;n<3;n++){assignments.push({id:date+'night'+n,employeeId:'night'+n,date:SFSolidPlanningCore.plus(date,-1),type:'O3',start:'22:00',end:'08:00',_dbStatus:'PUBLISHED',publishedAt:'2026-10-01'});assignments.push({id:date+'early'+n,employeeId:'early'+n,date,type:'O1',start:'18:00',end:'04:00',_dbStatus:'PUBLISHED',publishedAt:'2026-10-01'});}renderAutoPlanning();
 });
 await generatePreview(page);expect(await page.evaluate(()=>employees.map(e=>autoPlanPreview.filter(a=>a.employeeId===e.id).length))).toEqual([20,20,20]);expect(await page.evaluate(()=>SFMonthOptimizer.getResult().criticalOpen)).toBe(0);
 const otRules=await openRuleSection(page,'ot');await expect(otRules.locator('dl > div').filter({has:page.getByText('Monatsobergrenze',{exact:true})}).locator('dd')).toHaveText('200 h');await expect(page.locator('#autoMonthHours')).toContainText('220 h SOLL / 200 h Obergrenze');await page.locator('#applyAutoPlanBtn').click();await page.getByRole('button',{name:'Als Entwurf übernehmen',exact:true}).click();await completeApply(page);expect(await page.evaluate(()=>assignments.filter(a=>['a','b','c'].includes(a.employeeId)).length)).toBe(60);expect(errors).toEqual([]);
});
for(const priorType of ['TL-RE','O2'])test(`preview editor permits conscious ${priorType} transitions while automatic transition rules stay strict`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page);
 await page.evaluate((priorType)=>{
  employees=[{id:'leader',first:'Team',last:'Leitung',role:'Teamleiter',status:'active',employment:'Vollzeit',monthlyHours:180,weeklyHours:40,maxWeeklyHours:55,shifts:['TL-LE','TL-RE','O1','O2','O3']}];
  TYPES=['TL-LE','TL-RE','O1','O2','O3'].map(id=>({id,name:id,start:id==='O1'?'18:00':id==='O3'?'22:00':'20:00',end:id==='O1'?'04:00':id==='O3'?'08:00':'06:00'}));
  assignments=[{id:'prior',employeeId:'leader',date:'2026-12-06',type:priorType,start:'20:00',end:'06:00'}];plannedAssignmentHours=()=>10;plannedMonthlyHoursForEmployee=(id,date,sim=[])=>[...assignments,...sim].filter(a=>a.employeeId===id&&a.date.startsWith(date.slice(0,7))).length*10;
  getSoll=(date,type)=>Number(date==='2026-12-06'&&type===priorType||date==='2026-12-07'&&['O1','O2'].includes(type));SFCompliance={policy:{solidPlanningRules:{enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',preventLeaderToO1:true,preventDescendingShifts:true,maxCalendarWeekHours:55,maxConsecutiveShifts:4,maxConsecutiveNightShifts:4,minFreeCalendarDays:2,minNightRecoveryCalendarDays:2,minBlockRestHours:48}}};autoPlanAnalyzed=true;renderAutoPlanning();
 },priorType);await previewEditor(page);
 await page.getByRole('button',{name:'Dienst hinzufügen',exact:true}).click();await page.locator('#sfPreviewFrom').fill('2026-12-07');await page.locator('#sfPreviewTo').fill('2026-12-07');await page.locator('#sfPreviewShift').selectOption('O1');
 await expect(page.locator('#sfPreviewEmployee option[value="leader"]')).toHaveJSProperty('disabled',false);expect(await page.evaluate(()=>SFAutoPlanGuard.transitionConflict('leader','O1','2026-12-07'))).toContain(priorType==='TL-RE'?'Nach TL-LE oder TL-RE':'Absteigender Schichtwechsel O2 → O1');
 await page.locator('#sfPreviewShift').selectOption('O2');await expect(page.locator('#sfPreviewEmployee option[value="leader"]')).toHaveJSProperty('disabled',false);await page.locator('#sfPreviewEmployee').selectOption('leader');await page.getByRole('button',{name:'In Vorplanung übernehmen',exact:true}).click();expect(await page.evaluate(()=>autoPlanPreview.map(a=>a.type))).toEqual(['O2']);
 await page.locator('#applyAutoPlanBtn').click();await page.getByRole('button',{name:'Als Entwurf übernehmen',exact:true}).click();await completeApply(page);expect(await page.evaluate(()=>assignments.map(a=>a.type))).toEqual([priorType,'O2']);expect(errors).toEqual([]);
});
test('preview editor recalculates mandatory vacancies after removing and refilling a duty',async({page})=>{
 await fixture(page);await page.evaluate(()=>{employees=[{id:'leader',first:'Leitung',last:'Test',role:'Teamleiter',status:'active',employment:'Vollzeit',shifts:['TL-LE'],weeklyHours:40,maxWeeklyHours:55,monthlyHours:180}];TYPES=[{id:'TL-LE',name:'TL-LE',start:'20:00',end:'06:00'}];SFCompliance={policy:{solidPlanningRules:{enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',maxConsecutiveNightShifts:4,minNightRecoveryCalendarDays:2,maxCalendarWeekHours:55,criticalShifts:[{code:'TL-LE',minimum:1,weekdays:[1]}]}}};getSoll=date=>Number(new Date(date+'T12:00:00').getDay()===1);plannedAssignmentHours=()=>10;plannedMonthlyHoursForEmployee=(id,date,sim=[])=>[...assignments,...sim].filter(a=>a.employeeId===id&&a.date.startsWith(date.slice(0,7))).length*10;});
 await generatePreview(page);await previewEditor(page);expect(await page.evaluate(()=>SFMonthOptimizer.getResult().criticalOpen)).toBe(0);
 const removed=await page.evaluate(()=>autoPlanPreview[0]);await page.evaluate(()=>removeAutoSuggestion(0));expect(await page.evaluate(()=>SFMonthOptimizer.getResult().criticalOpen)).toBe(1);await expect(page.locator('#applyAutoPlanBtn')).toBeDisabled();
 await page.getByRole('button',{name:'Dienst hinzufügen',exact:true}).click();await page.locator('#sfPreviewFrom').fill(removed.date);await page.locator('#sfPreviewTo').fill(removed.date);await page.locator('#sfPreviewTo').dispatchEvent('change');await page.locator('#sfPreviewEmployee').selectOption('leader');await page.getByRole('button',{name:'In Vorplanung übernehmen',exact:true}).click();
 expect(await page.evaluate(()=>SFMonthOptimizer.getResult().criticalOpen)).toBe(0);await expect(page.locator('#applyAutoPlanBtn')).toBeEnabled();expect(await page.evaluate(()=>assignments.length)).toBe(0);
});
test('preview editor counts a manually restored OT crew member in the shared staffing group',async({page})=>{
 await fixture(page);await page.evaluate(()=>{TYPES=['OT1','OT2','OT3'].map((id,i)=>({id,name:id,start:['06:00','08:00','10:00'][i],end:['16:00','18:00','20:00'][i]}));employees=['one','two','three'].map(id=>({id,first:'Tag',last:id,status:'active',employment:'Vollzeit',shifts:['OT1','OT2','OT3'],weeklyHours:50,maxWeeklyHours:55,monthlyHours:180}));SFCompliance={policy:{solidPlanningRules:{enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',maxCalendarWeekHours:55,otOnlyMonthlyMaxHours:220,otOnlyMaxCalendarWeekHours:55,otWeekdayRoster:{employeeIds:['one','two','three'],weekdays:[1]}}}};getSoll=(date,type)=>Number(date==='2026-12-07');plannedAssignmentHours=()=>10;autoPlanPreview=employees.map((e,i)=>({id:'crew'+i,employeeId:e.id,date:'2026-12-07',type:TYPES[i].id,start:TYPES[i].start,end:TYPES[i].end,coverageGroup:'OT-DAY'}));autoPlanAnalyzed=true;renderAutoPlanning();});await previewEditor(page);
 await page.evaluate(()=>removeAutoSuggestion(1));await expect(page.locator('#autoUnresolvedCount')).toHaveText('10');
 await page.getByRole('button',{name:'Dienst hinzufügen',exact:true}).click();await page.locator('#sfPreviewFrom').fill('2026-12-07');await page.locator('#sfPreviewTo').fill('2026-12-07');await page.locator('#sfPreviewShift').selectOption('OT2');await page.locator('#sfPreviewEmployee').selectOption('two');await page.getByRole('button',{name:'In Vorplanung übernehmen',exact:true}).click();
 await expect(page.locator('#autoUnresolvedCount')).toHaveText('9');expect(await page.evaluate(()=>autoPlanPreview.find(a=>a.employeeId==='two').coverageGroup)).toBe('OT-DAY');expect(await page.evaluate(()=>assignments.length)).toBe(0);
});
test('adding O1 across three days replaces obsolete OT3 fallback with OT2 in the preview',async({page})=>{
 await fixture(page);await page.evaluate(()=>{
  const dates=['2026-12-07','2026-12-08','2026-12-09'];TYPES=[{id:'O1',start:'18:00',end:'04:00'},{id:'OT2',start:'08:00',end:'18:00'},{id:'OT3',start:'10:00',end:'20:00'}];
  employees=['night1','night2','extra'].map(id=>({id,first:'Nacht',last:id,status:'active',employment:'Vollzeit',shifts:['O1'],weeklyHours:55,monthlyHours:180})).concat(['crew1','crew2','crew3'].map(id=>({id,first:'Tag',last:id,status:'active',employment:'Vollzeit',shifts:['OT2','OT3'],weeklyHours:55,monthlyHours:180})));
  SFCompliance.policy={monthlyPlanningMaxHours:200,solidPlanningRules:{enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',maxCalendarWeekHours:55,conditionalStaffing:[{shift:'OT3',sourceShift:'O1',sourceDayOffset:0,minimum:3,fallbackCount:1,coverageStart:'18:00',coverageEnd:'20:00'}],otWeekdayRoster:{employeeIds:['crew1','crew2','crew3'],weekdays:[1,2,3,4,5],allowDaysOff:true,minimumDailyStaff:2}}};
  getSoll=(date,type)=>!dates.includes(date)?0:type==='O1'?3:type==='OT3'?assignments.filter(a=>a.date===date&&a.type==='O1').length>=3?0:1:type==='OT2'?3-(assignments.filter(a=>a.date===date&&a.type==='O1').length>=3?0:1):0;
  plannedAssignmentHours=()=>10;autoPlanPreview=dates.flatMap(date=>[['night1','O1'],['night2','O1'],['crew1','OT2'],['crew2','OT2'],['crew3','OT3']].map(([employeeId,type])=>({id:date+'-'+employeeId,employeeId,date,type,start:typeById(type).start,end:typeById(type).end,coverageGroup:type.startsWith('OT')?'OT-DAY':undefined})));
  autoPlanAnalyzed=true;renderAutoPlanning();
 });await previewEditor(page);
 await page.evaluate(()=>SFAutoPlanPreviewEditor.open({employeeId:'extra',dates:['2026-12-07','2026-12-08','2026-12-09'],rowEmployee:true}));
 await expect(page.locator('#sfPreviewEditError')).toBeEmpty();await expect(page.locator('#sfPreviewAutoAdjustment')).toContainText('3 bisherige OT3-Ersatzdienste');await expect(page.getByRole('button',{name:'In Vorplanung übernehmen',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'In Vorplanung übernehmen',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(await page.evaluate(()=>({o1:autoPlanPreview.filter(a=>a.type==='O1').length,ot2:autoPlanPreview.filter(a=>a.type==='OT2').length,ot3:autoPlanPreview.filter(a=>a.type==='OT3').length,saved:assignments.length}))).toEqual({o1:9,ot2:9,ot3:0,saved:0});
});
test('preview editor flags changed OT demand when a source night is removed',async({page})=>{
 await fixture(page);await page.evaluate(()=>{TYPES=['O1','OT1','OT2','OT3'].map(id=>({id,name:id,start:id==='O1'?'18:00':'08:00',end:id==='O1'?'04:00':'18:00'}));employees=['night','one','two','three'].map(id=>({id,first:'Test',last:id,status:'active',employment:'Vollzeit',shifts:TYPES.map(t=>t.id),weeklyHours:55}));getSoll=(date,type)=>date!=='2026-12-07'?0:type==='O1'||type==='OT1'?1:type==='OT2'?(assignments.some(a=>a.type==='O1'&&a.date===date)?2:1):(assignments.some(a=>a.type==='O1'&&a.date===date)?0:1);autoPlanPreview=['O1','OT1','OT2','OT2'].map((type,i)=>({id:'p'+i,employeeId:employees[i].id,date:'2026-12-07',type,start:typeById(type).start,end:typeById(type).end}));autoPlanAnalyzed=true;renderAutoPlanning();});await previewEditor(page);
 await page.evaluate(()=>removeAutoSuggestion(0));await expect(page.locator('#sfAutoPreviewTools')).toContainText('OT2: Die benötigte Besetzung ist bereits vollständig.');await expect(page.locator('#applyAutoPlanBtn')).toBeDisabled();expect(await page.evaluate(()=>assignments.length)).toBe(0);
 await page.getByRole('button',{name:'Rückgängig',exact:true}).click();await expect(page.locator('#applyAutoPlanBtn')).toBeEnabled();
});
test('preview editor permits a conscious fixed-weekly exception without changing the automatic rule',async({page})=>{
 await fixture(page);await page.evaluate(()=>{employees=[{id:'fixed',first:'Fest',last:'Person',status:'active',employment:'Vollzeit',shifts:['O3','FD'],weeklyHours:40,monthlyHours:180,rhythmMode:'required',rhythmStart:'2026-11-30',rhythmPattern:'O3,O3,O3,O3,FREI,FREI,FREI'}];TYPES.push({id:'O3',name:'O3',start:'22:00',end:'08:00'});getSoll=()=>1;autoPlanAnalyzed=true;renderAutoPlanning();});await previewEditor(page);
 await page.getByRole('button',{name:'Dienst hinzufügen',exact:true}).click();await page.locator('#sfPreviewFrom').fill('2026-12-04');await page.locator('#sfPreviewTo').fill('2026-12-04');await page.locator('#sfPreviewTo').dispatchEvent('change');
 await expect(page.locator('#sfPreviewEmployee option[value="fixed"]')).toHaveJSProperty('disabled',false);expect(await page.evaluate(()=>sfRhythmCheck(employees[0],'FD','2026-12-04').allowed)).toBe(false);await page.keyboard.press('Escape');
});
for(const theme of ['dark','light'])test(`clear month selection, preview review and confirmed draft in ${theme} theme`,async({page})=>{
 await fixture(page,theme);await expect(page.locator('#autoPlanWeekField')).toBeHidden();await expect(page.locator('#autoPlanDateField')).toBeHidden();await expect(page.locator('#autoPlanMonthField')).toBeVisible();await expect(page.locator('#autoPeriodRange')).toHaveText('Dezember 2026');await expect(page.locator('#autoPeriodDates')).toContainText('1.12.2026 bis 31.12.2026');await expect(page.locator('#autoStats')).toContainText('Analyse noch nicht gestartet');await expect(page.locator('#autoResults')).toBeHidden();const monthImage=await page.locator('#autoPlanMonth').evaluate(e=>getComputedStyle(e).backgroundImage);expect(monthImage).toContain('Dez.');if(theme==='light')expect(monthImage).toContain('%23172434');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:test.info().outputPath(`auto-ready-${theme}.png`),fullPage:true});
 await generatePreview(page);await expect(page.locator('#autoResults')).toBeVisible();await expect(page.locator('#autoSuggestionCount')).not.toHaveText('0');await expect(page.locator('#applyAutoPlanBtn')).toBeEnabled();expect(await page.evaluate(()=>assignments.length)).toBe(0);
 await page.getByRole('button',{name:'Alle Tage öffnen',exact:true}).click();await page.locator('#autoSuggestions button').first().click();await expect(page.locator('#autoUnresolvedCount')).not.toHaveText('0');await page.screenshot({path:test.info().outputPath(`auto-reviewed-${theme}.png`),fullPage:true});
 await page.locator('#applyAutoPlanBtn').click();await expect(page.getByRole('dialog')).toContainText('Als Entwurf speichern');await page.getByRole('dialog').getByRole('button',{name:'Abbrechen',exact:true}).click();expect(await page.evaluate(()=>assignments.length)).toBe(0);
 await page.locator('#applyAutoPlanBtn').click();await page.getByRole('dialog').getByRole('button',{name:'Als Entwurf übernehmen',exact:true}).click();await completeApply(page);await expect(page.locator('#autoAnalysis')).toContainText('als Entwurf übernommen');expect(await page.evaluate(()=>assignments.every(a=>!a.publishedAt))).toBe(true);expect(await page.evaluate(()=>saveCalls)).toBe(1);expect(await page.evaluate(()=>selectedMonth)).toBe('2026-12');await page.locator('#autoOpenScheduleBtn').click();expect(await page.evaluate(()=>openedView)).toBe('schedule');
});
test('unresolved required rhythm gives a reason and links to the correct planning week',async({page})=>{
 await fixture(page);await page.evaluate(()=>{employees[0].rhythmMode='required';employees[0].rhythmStart='2026-12-01';employees[0].rhythmPattern='FREI'});await generatePreview(page);await expect(page.locator('#autoUnresolvedPanel')).toHaveAttribute('open','');await expect(page.locator('#autoUnresolved')).toContainText('verbindliche Rhythmus');await expect(page.locator('#autoAnalysis')).toContainText('keine Besetzung vorgeschlagen');await expect(page.locator('#applyAutoPlanBtn')).toBeDisabled();await page.getByRole('button',{name:'Im Dienstplan prüfen',exact:true}).first().click();expect(await page.evaluate(()=>iso(weekStart))).toBe('2026-11-30');expect(await page.evaluate(()=>openedView)).toBe('schedule');
});
test('switching period invalidates a prior preview and Escape cancels the confirmation',async({page})=>{
 await fixture(page);await generatePreview(page);await page.locator('#autoPlanPeriod').selectOption('date');await expect(page.locator('#autoPlanMonthField')).toBeHidden();await expect(page.locator('#autoPlanDateField')).toBeVisible();await expect(page.locator('#autoResults')).toBeHidden();await expect(page.locator('#applyAutoPlanBtn')).toBeDisabled();await page.locator('#autoPlanDate').fill('2026-12-01');await page.locator('#autoPlanDate').dispatchEvent('change');await generatePreview(page);await page.locator('#applyAutoPlanBtn').click();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);expect(await page.evaluate(()=>assignments.length)).toBe(0);await expect(page.locator('#applyAutoPlanBtn')).toBeEnabled();
});
test('a TL from RE fills one shared LE/RE position and no second TL remains mandatory',async({page})=>{
 await fixture(page);await page.addScriptTag({content:read('assets/shift-models-v1.js')});await page.evaluate(()=>{globalSoll={'TL-LE':1,'TL-RE':1};dailySoll={};SFShiftModels.apply(['TL-LE','TL-RE'].map((code,i)=>({code,name:code,active:true,default_start:'20:00',default_end:'06:00',coverage_group:'TL LE/RE',coverage_required:1,sort_order:i})),'a');employees=[{id:'re',first:'Fiktive',last:'TL RE',status:'active',shifts:['TL-RE'],weeklyHours:40}];getSoll=(date,type)=>SFShiftModels.requiredSoll(date,type,globalSoll[type]||0);plannedAssignmentHours=()=>10;renderAutoPlanning()});
 await page.locator('#autoPlanPeriod').selectOption('date');await page.locator('#autoPlanDate').fill('2026-12-01');await page.locator('#autoPlanDate').dispatchEvent('change');await generatePreview(page);await expect(page.locator('#autoSuggestionCount')).toHaveText('1');await expect(page.locator('#autoUnresolvedCount')).toHaveText('0');await expect(page.locator('#autoSuggestions')).toContainText('TL-RE');await expect(page.locator('#autoSuggestions')).toContainText('Deckt TL LE/RE gemeinsam ab');await page.screenshot({path:test.info().outputPath('shared-tl-re-preview.png'),fullPage:true});
 await page.locator('#applyAutoPlanBtn').click();await page.getByRole('dialog').getByRole('button',{name:'Als Entwurf übernehmen',exact:true}).click();await completeApply(page);expect(await page.evaluate(()=>assignments.map(a=>a.type))).toEqual(['TL-RE']);expect(await page.evaluate(()=>autoOpenSlots().length)).toBe(0);await expect(page.locator('#autoAnalysis')).toContainText('als Entwurf übernommen');
});
test('separate weekly maximum allows a fifth ten-hour shift while 220 full-time monthly hours remain mandatory',async({page})=>{
 await fixture(page);await page.locator('#autoPlanPeriod').selectOption('date');await page.locator('#autoPlanDate').fill('2026-12-06');await page.evaluate(()=>{TYPES[0].start='20:00';TYPES[0].end='06:00';employees[0].maxWeeklyHours=50;plannedAssignmentHours=()=>10;employeeMonthlyTarget=()=>400;assignments=['2026-11-30','2026-12-01','2026-12-02','2026-12-03'].map(date=>({date,type:'FD',employeeId:'test',start:'20:00',end:'06:00'}));plannedMonthlyHoursForEmployee=(employeeId,date,sim=[])=>[...assignments,...sim].filter(a=>a.employeeId===employeeId&&a.date.startsWith(date.slice(0,7))).length*10});await page.locator('#autoPlanDate').dispatchEvent('change');
 await expect(page.getByText('Wochenmaximum berücksichtigen',{exact:true})).toBeVisible();await expect(page.locator('#autoRuleValues')).toContainText('Automatisch max. 220 h/Monat');await generatePreview(page);await expect(page.locator('#autoSuggestionCount')).toHaveText('1');await expect(page.locator('#autoSuggestions')).toContainText('40.0 Std. / 50.0 Std. Maximum');await page.screenshot({path:test.info().outputPath('auto-fifth-ten-hour-shift.png'),fullPage:true});
 await page.locator('#autoRespectHours').uncheck();await page.evaluate(()=>plannedMonthlyHoursForEmployee=()=>210);await generatePreview(page);await expect(page.locator('#autoSuggestionCount')).toHaveText('1');await expect(page.locator('#autoSuggestions')).toContainText('210.0 / 220.0 Std. Maximum');await page.evaluate(()=>plannedMonthlyHoursForEmployee=()=>215);await generatePreview(page);await expect(page.locator('#autoSuggestionCount')).toHaveText('0');await expect(page.locator('#autoUnresolved')).toContainText('Wochen- oder Monatsstunden');await expect(page.locator('#autoUnresolved')).toContainText('keinen Personalmangel');await expect(page.locator('#applyAutoPlanBtn')).toBeDisabled();await page.screenshot({path:test.info().outputPath('auto-220h-month-cap.png'),fullPage:true});
});

for(const theme of ['dark','light'])test(`reserve Monday to Thursday O3 first, retain 180 SOLL and save 190 hours in ${theme}`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page,theme);
 await page.evaluate(()=>{
  TYPES=[{id:'O3',name:'O3',start:'22:00',end:'08:00'}];employees=[{id:'flex',first:'Flexible',last:'Person',status:'active',employment:'Vollzeit',shifts:['O3'],weeklyHours:40,maxWeeklyHours:40,monthlyHours:180},{id:'115',first:'Feste',last:'O3',status:'active',employment:'Vollzeit',shifts:['O3'],weeklyHours:40,maxWeeklyHours:40,monthlyHours:180,rhythmMode:'required',rhythmStart:'2026-08-31',rhythmPattern:'O3, O3, O3, O3, FREI, FREI, FREI'}];employeeMonthlyTarget=e=>e.monthlyHours;plannedAssignmentHours=()=>10;plannedMonthlyHoursForEmployee=(id,date,sim=[])=>[...assignments,...sim].filter(a=>a.employeeId===id&&a.date.startsWith(date.slice(0,7))).length*10;
 });
 await page.locator('#autoPlanPeriod').selectOption('month');await page.locator('#autoPlanMonth').fill('2026-12');await generatePreview(page);
 const fixed=await page.evaluate(()=>autoPlanPreview.filter(a=>a.employeeId==='115'));expect(fixed).toHaveLength(19);expect(fixed.every(a=>[1,2,3,4].includes(new Date(a.date+'T12:00:00').getDay()))).toBe(true);expect(fixed.every(a=>a.type==='O3')).toBe(true);expect(await page.evaluate(()=>assignments.length)).toBe(0);
 await expect(page.locator('#autoRuleValues')).toContainText('Automatisch max. 220 h/Monat');await expect(page.locator('#autoSuggestions')).toContainText('Feste Schichtvorgabe');await expect(page.locator('#autoSuggestions')).toContainText('Monats-SOLL 180.0');await page.screenshot({path:test.info().outputPath(`fixed-O3-190h-${theme}.png`),fullPage:true});
 await page.locator('#applyAutoPlanBtn').click();await page.getByRole('dialog').getByRole('button',{name:'Als Entwurf übernehmen',exact:true}).click();await completeApply(page);expect(await page.evaluate(()=>assignments.filter(a=>a.employeeId==='115').length)).toBe(19);expect(await page.evaluate(()=>saveCalls)).toBe(1);expect(errors).toEqual([]);
});
test('confirmed fixed weekly priority reserves all nineteen O3 duties despite stale cycle metadata',async({page})=>{
 await fixture(page);
 await page.evaluate(()=>{
  TYPES=[{id:'O3',name:'O3',start:'22:00',end:'08:00'},{id:'SD',name:'SD',start:'14:00',end:'22:00'}];
  employees=[{id:'bound',first:'Feste',last:'O3',status:'active',employment:'Vollzeit',shifts:['O3','SD'],weeklyHours:40,maxWeeklyHours:55,monthlyHours:180,rhythmMode:'required',rhythmStart:'2026-10-07',rhythmPattern:'ALLE,ALLE,ALLE,ALLE,FREI,FREI,FREI,ALLE,ALLE,ALLE,FREI,FREI'}];
  SFCompliance={policy:{solidPlanningRules:{enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',maxConsecutiveShifts:4,maxConsecutiveNightShifts:4,minFreeCalendarDays:2,minNightRecoveryCalendarDays:2,minBlockRestHours:48,maxCalendarWeekHours:55,fixedWeeklyRoster:{employeeIds:['bound'],code:'O3',weekdays:[1,2,3,4],monthlyMaxHours:190,maxMonthlyShifts:19}}}};
  getSoll=()=>1;employeeMonthlyTarget=e=>e.monthlyHours;plannedAssignmentHours=a=>a.type==='O3'?10:8;
  plannedMonthlyHoursForEmployee=(id,date,sim=[])=>[...assignments,...sim].filter(a=>a.employeeId===id&&a.date.startsWith(date.slice(0,7))).reduce((n,a)=>n+plannedAssignmentHours(a),0);
 });
 await generatePreview(page);
 const fixed=await page.evaluate(()=>autoPlanPreview.filter(a=>a.employeeId==='bound'));
 expect(fixed).toHaveLength(19);expect(fixed.every(a=>a.type==='O3'&&[1,2,3,4].includes(new Date(a.date+'T12:00:00').getDay()))).toBe(true);
 await page.locator('#applyAutoPlanBtn').click();await page.getByRole('dialog').getByRole('button',{name:'Als Entwurf übernehmen',exact:true}).click();await completeApply(page);
 expect(await page.evaluate(()=>assignments.filter(a=>a.employeeId==='bound').length)).toBe(19);
});
for(const theme of ['dark','light'])test(`staircase shows staggered workrest blocks and protects free days in ${theme}`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page,theme);
 await page.evaluate(()=>{const pattern='ALLE, ALLE, ALLE, ALLE, FREI, FREI, FREI, ALLE, ALLE, ALLE, FREI, FREI';employees=Array.from({length:3},(_,i)=>({id:'cycle'+i,personnelNo:String(i+1),first:'Fiktive',last:'Person '+i,status:'active',employment:'Vollzeit',shifts:['FD'],weeklyHours:40,maxWeeklyHours:50,monthlyHours:180,rhythmMode:'required',rhythmStart:'2026-12-'+String(i+1).padStart(2,'0'),rhythmPattern:pattern}));});
 await generatePreview(page);await expect(page.locator('.sf-auto-stair-table > tbody:not(.sf-auto-staffing) tr')).toHaveCount(3);await expect(page.locator('.sf-auto-stair-table thead th')).toHaveCount(32);await expect(page.locator('[data-staffing-shift=FD] td')).toHaveCount(31);await expect(page.locator('[data-staffing-shift=FD]')).toContainText('SOLL 1');await expect(page.locator('#autoStaircase')).toContainText('Rhythmusfrei');await expect(page.locator('#autoSuggestions')).toContainText('Arbeitsblock');
 expect(await page.evaluate(()=>autoPlanPreview.every(a=>SFRhythm.check(employees.find(e=>e.id===a.employeeId),a.type,a.date).allowed))).toBe(true);expect(await page.evaluate(()=>assignments.length)).toBe(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.locator('.sf-auto-staircase').screenshot({path:test.info().outputPath(`staircase-${theme}.png`)});await page.locator('.sf-auto-stair-scroll').evaluate(e=>e.scrollLeft=e.scrollWidth);await expect(page.locator('.sf-auto-stair-table > tbody:not(.sf-auto-staffing) tr').first().locator('th')).toBeVisible();expect(errors).toEqual([]);
});
test('part-time limits and relative workload stay authoritative even with weekly maximum disabled',async({page})=>{
 await fixture(page);await page.locator('#autoRespectHours').uncheck();await page.evaluate(()=>{
  employees=[{id:'full',first:'Vollzeit',last:'180',status:'active',employment:'Vollzeit',shifts:['FD'],weeklyHours:40,monthlyHours:180},{id:'part',first:'Teilzeit',last:'162',status:'active',employment:'Teilzeit',shifts:['FD'],weeklyHours:40,monthlyHours:162}];employeeMonthlyTarget=e=>e.monthlyHours;getSoll=date=>Number(date==='2026-12-01');
  // Use the same saved duties for candidate ranking and the fairness pass.
  window.seedMonthHours=(full,part)=>{assignments=[['full',full],['part',part]].flatMap(([employeeId,count])=>Array.from({length:count},(_,i)=>({id:employeeId+i,employeeId,date:'2026-12-'+String(i+5).padStart(2,'0'),type:'FD',start:'06:00',end:'14:00'})))};seedMonthHours(22,19);
 });await generatePreview(page);expect(await page.evaluate(()=>autoPlanPreview.map(a=>a.employeeId))).toEqual(['part']);
 await page.evaluate(()=>{employees[1].monthlyHours=144;seedMonthHours(26,18)});await generatePreview(page);expect(await page.evaluate(()=>autoPlanPreview.map(a=>a.employeeId))).toEqual(['full']);await expect(page.locator('#autoSuggestions')).toContainText('208.0 / 220.0');
 await page.evaluate(()=>seedMonthHours(27,18));await generatePreview(page);await expect(page.locator('#autoSuggestionCount')).toHaveText('0');await expect(page.locator('#autoUnresolved')).toContainText('Wochen- oder Monatsstunden');await expect(page.locator('#autoUnresolved')).toContainText('keinen Personalmangel');
});
test('whole blocks stay grouped for removal, safe shorter blocks fill demand and O3 cannot step back to TL',async({page})=>{
 await fixture(page);await page.evaluate(()=>{employees=[{id:'block',first:'Block',last:'Test',status:'active',employment:'Vollzeit',shifts:['FD'],weeklyHours:40,maxWeeklyHours:50,rhythmMode:'required',rhythmStart:'2026-12-01',rhythmPattern:'ALLE, ALLE, ALLE, ALLE, FREI, FREI, FREI, ALLE, ALLE, ALLE, FREI, FREI'}];getSoll=date=>Number(date>='2026-12-01'&&date<='2026-12-04')});
 await generatePreview(page);await expect(page.locator('#autoSuggestionCount')).toHaveText('4');expect(await page.evaluate(()=>new Set(autoPlanPreview.map(x=>x.blockId)).size)).toBe(1);
 await page.locator('#autoSuggestions button').first().click();await expect(page.locator('#autoSuggestionCount')).toHaveText('0');await expect(page.locator('#autoUnresolvedCount')).toHaveText('4');
 await page.evaluate(()=>getSoll=date=>Number(['2026-12-01','2026-12-03','2026-12-04'].includes(date)));await generatePreview(page);expect(await page.evaluate(()=>autoPlanPreview.map(a=>a.date))).toEqual(['2026-12-01','2026-12-03','2026-12-04']);await expect(page.locator('#autoUnresolvedCount')).toHaveText('0');expect(await page.evaluate(()=>autoPlanPreview.every(a=>SFRhythm.check(employees[0],a.type,a.date).allowed&&SFAutoPlanGuard.passesTimeRules(a.employeeId,a.type,a.date,autoPlanPreview.filter(b=>b!==a))))).toBe(true);
 await page.evaluate(()=>{TYPES=[{id:'O3',start:'22:00',end:'08:00'},{id:'TL-LE',start:'20:00',end:'06:00'}];employees[0].shifts=['O3','TL-LE'];employees[0].rhythmMode='off';assignments=[{employeeId:'block',date:'2026-12-01',type:'O3'}]});expect(await page.evaluate(()=>autoEligibleEmployees('TL-LE','2026-12-02').length)).toBe(0);expect(await page.evaluate(()=>autoEligibleEmployees('TL-LE','2026-12-03').length)).toBe(1);
});

for(const theme of ['dark','light'])test(`monthly optimization redistributes unfair drafts only after confirmation in ${theme}`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page,theme);
 await page.evaluate(()=>{
  employees=['a','b'].map(id=>({id,first:'Test',last:id,status:'active',employment:'Teilzeit',shifts:['FD'],weeklyHours:40,monthlyHours:16}));employeeMonthlyTarget=e=>e.monthlyHours;getSoll=date=>Number(date<='2026-12-04');
  assignments=['01','02','03','04'].map(d=>({id:d,date:'2026-12-'+d,type:'FD',employeeId:'a',start:'06:00',end:'14:00'}));
 });
 const original=await page.evaluate(()=>JSON.stringify(assignments));await page.locator('#optimizeAutoMonthBtn').click();await expect(page.locator('#autoMonthHours')).toContainText('Monatsstunden prüfen');await expect(page.locator('#autoMonthHours')).toContainText('32 h');await expect(page.locator('#autoSuggestionCount')).toHaveText('4');expect(await page.evaluate(()=>JSON.stringify(assignments))).toBe(original);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:test.info().outputPath(`month-optimization-${theme}.png`),fullPage:true});
 await page.locator('#applyAutoPlanBtn').click();await expect(page.getByRole('dialog')).toContainText('4 bisherige flexible Entwürfe');await expect(page.getByRole('dialog')).toContainText('ersetzen');await page.getByRole('dialog').getByRole('button',{name:'Abbrechen',exact:true}).click();expect(await page.evaluate(()=>JSON.stringify(assignments))).toBe(original);
 await page.locator('#applyAutoPlanBtn').click();await page.getByRole('dialog').getByRole('button',{name:'Als Entwurf übernehmen',exact:true}).click();await completeApply(page);expect(await page.evaluate(()=>employees.map(e=>assignments.filter(a=>a.employeeId===e.id).length))).toEqual([2,2]);expect(await page.evaluate(()=>saveCalls)).toBe(1);expect(errors).toEqual([]);
});

test('confirmed January optimization opens the saved January plan with its actual calendar and month totals',async({page})=>{
 await fixture(page);
 await page.evaluate(()=>{
  document.querySelector('.content').insertAdjacentHTML('beforeend','<section id="view-schedule" class="view"><div class="page-head"><h1>Wochenplanung</h1></div><div><b id="statShifts"></b><em></em><b id="statEmployees"></b><b id="statOpen"></b><b id="statCoverage"></b></div><span id="availableTxt"></span><div class="cal-toolbar"><div class="seg"><button>Woche</button><button>Monat</button></div><button id="prevWeek">Zurück</button><button id="nextWeek">Weiter</button><button id="todayBtn">Heute</button><span id="weekLabel"></span></div><div><div id="calendarGrid"></div><div id="sollList"></div></div></section>');
  showView=v=>{openedView=v;document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id==='view-'+v))};
  employees=['a','b'].map(id=>({id,first:'Test',last:id,status:'active',employment:'Teilzeit',shifts:['FD'],weeklyHours:40,monthlyHours:16}));employeeMonthlyTarget=e=>e.monthlyHours;getSoll=date=>Number(date>='2027-01-01'&&date<='2027-01-04');
  assignments=['01','02','03','04'].map(d=>({id:d,date:'2027-01-'+d,type:'FD',employeeId:'a',start:'06:00',end:'14:00'}));
 });
 await page.addScriptTag({content:read('assets/schedule-month-view-v1.js')});await page.evaluate(()=>SchichtFunkCalendarView.setMonth('2026-12'));
 await page.locator('#autoPlanMonth').fill('2027-01');await page.locator('#autoPlanMonth').dispatchEvent('change');
 await page.locator('#optimizeAutoMonthBtn').click();await page.locator('#applyAutoPlanBtn').click();await page.getByRole('dialog').getByRole('button',{name:'Als Entwurf übernehmen',exact:true}).click();await completeApply(page);
 expect(await page.evaluate(()=>SchichtFunkCalendarView.getPeriod())).toEqual({mode:'month',start:'2027-01-01',end:'2027-01-31'});
 await page.locator('#autoOpenScheduleBtn').click();await expect(page.locator('#view-schedule')).toBeVisible();await expect(page.locator('#weekLabel')).toHaveText('Januar 2027');
 await expect(page.locator('#sfMonthView .sf-month-kpi').first()).toContainText('4');await expect(page.locator('[data-month-date="2027-01-01"]')).toContainText('FD · 1');await expect(page.locator('#statEmployees')).toHaveText('2');
});
test('three actual O3 from the previous night transfer OT1 to OT2 and removing one restores OT1',async({page})=>{
 await fixture(page);await page.addScriptTag({content:read('assets/shift-models-v1.js')});
 await page.evaluate(()=>{SFShiftModels.apply([{code:'O3',active:true,default_start:'22:00',default_end:'08:00'}, {code:'OT1',active:true,default_start:'06:00',default_end:'16:00'}, {code:'OT2',active:true,default_start:'08:00',default_end:'18:00',morning_ot_switch_min:3}],'a');globalSoll={O3:3,OT1:1,OT2:1};dailySoll={};employees=[{id:'day',first:'Tag',last:'Test',status:'active',employment:'Vollzeit',shifts:['OT1','OT2'],weeklyHours:40}];assignments=[1,2,3].map(employeeId=>({employeeId,type:'O3',date:'2026-11-30',start:'22:00',end:'08:00'}));});
 expect(await page.evaluate(()=>SFShiftModels.requiredSoll('2026-12-01','OT1',1))).toBe(0);expect(await page.evaluate(()=>SFShiftModels.requiredSoll('2026-12-01','OT2',1))).toBe(2);
 await page.evaluate(()=>{autoPlanPreview=[{id:'ot',employeeId:'day',date:'2026-12-01',type:'OT1',start:'06:00',end:'16:00'}];SFShiftModels.normalizeMorningOt(autoPlanPreview,assignments)});expect(await page.evaluate(()=>autoPlanPreview[0].type)).toBe('OT2');expect(await page.evaluate(()=>autoPlanPreview[0].start)).toBe('08:00');
 await page.evaluate(()=>{assignments.pop();SFShiftModels.normalizeMorningOt(autoPlanPreview,assignments)});expect(await page.evaluate(()=>autoPlanPreview[0].type)).toBe('OT1');expect(await page.evaluate(()=>autoPlanPreview[0].start)).toBe('06:00');
});

for(const theme of ['dark','light'])test(`draft counts and personal hour balances remain readable while scrolling in ${theme}`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page,theme);
 await page.evaluate(()=>{getSoll=()=>0;employees=[{id:'one',personnelNo:'26',first:'Test',last:'Person',status:'active',weeklyHours:40,monthlyHours:16},{id:'two',first:'Ohne',last:'Dienst',status:'active',weeklyHours:40,monthlyHours:24}];employeeMonthlyTarget=e=>e.monthlyHours;assignments=[{employeeId:'one',date:'2026-12-01',type:'FD'}];autoPlanPreview=[{employeeId:'one',date:'2026-12-02',type:'FD'}];autoPlanAnalyzed=true;renderAutoPlanning()});
 await expect(page.locator('.sf-auto-draft-summary')).toContainText('1 / 2');await expect(page.locator('.sf-auto-draft-summary')).toContainText('2 Dienste');await expect(page.locator('.sf-auto-draft-summary')).toContainText('16 h');
 const person=page.locator('.sf-auto-stair-table > tbody:not(.sf-auto-staffing) tr').first();await expect(person).toContainText('Plan-IST 16 h');await expect(person).toContainText('SOLL 16 h');await expect(person).toContainText('Differenz 0 h');await expect(page.locator('.sf-auto-stair-table > tbody:not(.sf-auto-staffing) tr').nth(1)).toContainText('Differenz -24 h');
 await person.locator('.sf-auto-draft-metrics').scrollIntoViewIfNeeded();await page.locator('.sf-auto-stair-scroll').evaluate(e=>e.scrollLeft=e.scrollWidth);await expect(person.locator('.sf-auto-draft-metrics')).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.locator('.sf-auto-staircase').screenshot({path:test.info().outputPath(`draft-hours-${theme}.png`)});
 await page.evaluate(()=>removeAutoSuggestion(0));await expect(person).toContainText('Plan-IST 8 h');await expect(person).toContainText('Differenz -8 h');await expect(page.locator('.sf-auto-draft-summary')).toContainText('1 Dienst');expect(errors).toEqual([]);
});

test('Secontec January draft restricts weekday FD and weekend FD-WE independently of broad permissions',async({page})=>{
 await fixture(page);await page.addScriptTag({content:read('assets/shift-models-v1.js')});
 await page.evaluate(()=>{
  SFShiftModels.apply([{code:'FD',active:true,default_start:'06:00',default_end:'14:00',allowed_personnel_nos:['2048','26','2001'],exclusive_employees:true,strict_weekdays:true,strict_times:true,optional_weekdays:[1,2,3,4,5]},{code:'FD-WE',active:true,default_start:'06:00',default_end:'14:00',requires_planning_team:true,strict_weekdays:true,strict_times:true,optional_weekdays:[6,7],rhythm_alias:'FD'}],'a');
  employees=['2048','26','2001'].map(personnelNo=>({id:personnelNo,personnelNo,first:'Tagdienst',last:personnelNo,status:'active',employment:'Vollzeit',shifts:['FD','FD-WE'],weeklyHours:40,maxWeeklyHours:40,monthlyHours:180,rhythmMode:'required',rhythmStart:'2026-11-30',rhythmPattern:'FD,FD,FD,FD,FD,FREI,FREI'})).concat(['A','B','C'].map(planningTeam=>({id:planningTeam,personnelNo:planningTeam,first:'Team',last:planningTeam,status:'active',employment:'Vollzeit',shifts:['FD','FD-WE'],planningTeam,weeklyHours:40,monthlyHours:180,rhythmStart:'2026-11-30',rhythmPattern:'FD'})));
  globalSoll={FD:3,'FD-WE':3};getSoll=(date,type)=>SFShiftModels.requiredSoll(date,type,globalSoll[type]||0);employeeMonthlyTarget=e=>e.monthlyHours;
 });
 await page.locator('#autoPlanMonth').fill('2027-01');await page.locator('#autoPlanMonth').dispatchEvent('change');await generatePreview(page);
 const data=await page.evaluate(()=>({fd:autoPlanPreview.filter(a=>a.type==='FD'),we:autoPlanPreview.filter(a=>a.type==='FD-WE'),free:SFRhythm.check(employees[0],'O1','2027-01-09').expected}));
 expect(data.fd).toHaveLength(63);expect(data.we).toHaveLength(30);expect(data.fd.every(a=>['2048','26','2001'].includes(a.employeeId)&&new Date(a.date+'T12:00:00').getDay()%6!==0)).toBe(true);expect(data.we.every(a=>['A','B','C'].includes(a.employeeId)&&[0,6].includes(new Date(a.date+'T12:00:00').getDay()))).toBe(true);expect(data.free).toBe('FREI');
 await expect(page.locator('#autoUnresolvedCount')).toHaveText('0');await expect(page.locator('#autoStaircase')).toContainText('168 h');await expect(page.locator('#autoStaircase')).toContainText('180 h');
});

test('individual January planning enforces night recovery, reports shortages and submits atomically',async({page})=>{
 test.setTimeout(150000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page);
 await page.addScriptTag({content:read('assets/shift-models-v1.js')});
 const input=JSON.parse(read('tests/fixtures/individual-january-2027.json'));
 await page.evaluate(input=>{
  SFShiftModels.apply([
   {code:'SD',active:true,default_start:'14:00',default_end:'22:00'},
   {code:'FD-WE',active:true,default_start:'06:00',default_end:'14:00',strict_weekdays:true,strict_times:true,optional_weekdays:[6,7]},
   {code:'FD',active:true,default_start:'06:00',default_end:'14:00',strict_weekdays:true,strict_times:true,optional_weekdays:[1,2,3,4,5],allowed_personnel_nos:['2048','26','2001'],exclusive_employees:true},
   {code:'ND',active:true,default_start:'22:00',default_end:'06:00'}
  ],'a');
  employees=input.employees.map(e=>({id:e.id,personnelNo:e.id,first:'Test',last:e.id,status:'active',employment:e.target===180?'Vollzeit':'Teilzeit',monthlyHours:e.target,weeklyHours:40,maxWeeklyHours:e.weeklyLimit,maxConsecutiveShifts:e.maxConsecutive,shifts:e.permissions,rhythmMode:'off'})).concat(['2048','26','2001'].map(id=>({id,personnelNo:id,first:'Tagdienst',last:id,status:'active',employment:'Vollzeit',monthlyHours:180,weeklyHours:40,maxWeeklyHours:40,shifts:['FD'],rhythmMode:'required',rhythmStart:'2026-12-28',rhythmPattern:'FD,FD,FD,FD,FD,FREI,FREI'})));
  assignments=input.base.map((a,i)=>({...a,id:'boundary-'+i}));globalSoll={FD:3,'FD-WE':4,SD:6,ND:6};dailySoll={};getSoll=(d,t)=>SFShiftModels.requiredSoll(d,t,globalSoll[t]||0);employeeMonthlyTarget=e=>e.monthlyHours;
  plannedAssignmentHours=a=>{const t=typeById(a.type),s=new Date(a.date+'T'+(a.start||t.start)+':00'),e=new Date(a.date+'T'+(a.end||t.end)+':00');if(e<=s)e.setDate(e.getDate()+1);return(e-s)/3600000};
  showSaveToast=(title,copy)=>window.lastToast={title,copy};
 },input);
 await page.locator('#autoPlanMonth').fill('2027-01');await page.locator('#autoPlanMonth').dispatchEvent('change');
 await expect(page.locator('#autoIndividualBlocks')).toBeChecked();await expect(page.locator('#autoIndividualBlocks')).toBeEnabled();await expect(page.locator('#generateAutoPlanBtn')).toContainText('Individuellen Monat planen');
 const before=await page.evaluate(()=>JSON.stringify(assignments));
 await generatePreview(page);
 await expect(page.locator('#applyAutoPlanBtn')).toBeEnabled({timeout:100000});
 expect(await page.evaluate(()=>JSON.stringify(assignments))).toBe(before);
 const result=await page.evaluate(()=>{const r=SFMonthOptimizer.getResult();return{toast:window.lastToast,individual:r?.individualIds.length,preview:autoPlanPreview.length,open:autoPlanUnresolved.length,fd:autoPlanPreview.filter(a=>a.type==='FD'),we:autoPlanPreview.filter(a=>a.type==='FD-WE'),valid:SFIndividualMonthPlanner.validate(r.individualInput,autoPlanPreview.filter(a=>r.individualIds.includes(String(a.employeeId))))}});
 expect(result.individual).toBe(17);expect(result.valid).toBe(true);expect(result.preview).toBeGreaterThanOrEqual(403);expect(result.open).toBe(475-result.preview);expect(result.fd).toHaveLength(63);expect(result.we).toHaveLength(40);expect(result.fd.every(a=>['2048','26','2001'].includes(a.employeeId))).toBe(true);
 await expect(page.locator('#autoMonthHours')).toContainText(`${(result.preview*8).toLocaleString('de-DE')} h geplant / 3.800 h Bedarf`);await expect(page.locator('#autoStats')).toContainText(`${result.preview} / 475`);await expect(page.locator('#autoMonthHours')).toContainText(`${result.preview} geplante Personaleinsätze insgesamt`);await expect(page.locator('#autoMonthHours')).toContainText(`${result.open} Pflichtpositionen offen`);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.locator('#autoMonthHours').screenshot({path:test.info().outputPath('individual-month-totals.png')});
 await page.locator('#applyAutoPlanBtn').click();await page.getByRole('dialog').getByRole('button',{name:'Abbrechen',exact:true}).click();expect(await page.evaluate(()=>JSON.stringify(assignments))).toBe(before);
 // The server stub rejects the RPC; the browser must retain every existing duty and the preview.
 await page.evaluate(()=>{
  SFBackend.ready=true;SFBackend.empDb=new Map(employees.map(e=>[e.id,'db-'+e.id]));SFBackend.asgDb=new Map();SFBackend.hydrate=async()=>{};window.rpcCalls=[];SFBackend.client={rpc:async(name,args)=>{rpcCalls.push({name,args});return{error:{message:'Test: Transaktion abgelehnt'}}}};
 });
 await page.locator('#applyAutoPlanBtn').click();await page.getByRole('dialog').getByRole('button',{name:'Als Entwurf übernehmen',exact:true}).click();await expect(page.locator('#sfAutoApplyTitle')).toHaveText('Übernahme nicht abgeschlossen');await expect(page.locator('#sfAutoApplyDetail')).toContainText('Transaktion abgelehnt');await page.locator('.sf-auto-apply [data-close]').click();
 await expect.poll(()=>page.evaluate(()=>rpcCalls.length)).toBe(1);
 const rpc=await page.evaluate(()=>rpcCalls[0]);expect(rpc.name).toBe('apply_individual_month_optimization');expect(rpc.args.p_individual_employee_ids).toHaveLength(17);expect(rpc.args.p_assignments).toHaveLength(result.preview);expect(rpc.args.p_company_id).toBe('a');expect(rpc.args.p_month).toBe('2027-01-01');expect(rpc.args.p_respect_weekly).toBe(true);
 expect(await page.evaluate(()=>JSON.stringify(assignments))).toBe(before);expect(await page.evaluate(()=>autoPlanPreview.length)).toBe(result.preview);expect(await page.evaluate(()=>lastToast.copy)).toContain('Transaktion abgelehnt');expect(errors).toEqual([]);
});

test('individual checkbox clicks and keyboard switches from week to month while retaining the selected month',async({page})=>{
 await fixture(page);await page.evaluate(()=>{TYPES=[{id:'SD',start:'14:00',end:'22:00'},{id:'ND',start:'22:00',end:'06:00'},{id:'FD-WE',start:'06:00',end:'14:00'},{id:'OT',start:'06:00',end:'16:00'}];plannedAssignmentHours=a=>a.type==='OT'?10:8;employees[0].shifts=['SD','ND','FD-WE'];});
 await page.locator('#autoPlanMonth').fill('2027-01');await page.locator('#autoPlanPeriod').selectOption('week');
 await expect(page.locator('#autoIndividualBlocks')).toBeEnabled();await expect(page.locator('#autoIndividualBlocksHint')).toContainText('Aktivieren wechselt');
 await page.locator('#autoIndividualBlocks').uncheck();await expect(page.locator('#autoPlanPeriod')).toHaveValue('week');
 await page.getByText('Individuelle Blockplanung im Monat',{exact:true}).click();await expect(page.locator('#autoIndividualBlocks')).toBeChecked();await expect(page.locator('#autoPlanPeriod')).toHaveValue('month');await expect(page.locator('#autoPlanMonthField')).toBeVisible();await expect(page.locator('#autoPlanMonth')).toHaveValue('2027-01');
 await page.locator('#autoIndividualBlocks').uncheck();await expect(page.locator('#autoIndividualBlocks')).not.toBeChecked();await expect(page.locator('#autoPlanPeriod')).toHaveValue('month');
 await page.locator('#autoPlanPeriod').selectOption('week');await page.locator('#autoIndividualBlocks').press('Space');await expect(page.locator('#autoPlanPeriod')).toHaveValue('month');await expect(page.locator('#autoIndividualBlocks')).toBeChecked();expect(await page.evaluate(()=>saveCalls)).toBe(0);expect(await page.evaluate(()=>assignments.length)).toBe(0);
 await page.evaluate(()=>{TYPES.find(t=>t.id==='ND').end='08:00';plannedAssignmentHours=a=>a.type==='ND'?10:8;renderAutoPlanning()});await expect(page.locator('#autoIndividualBlocks')).toBeDisabled();await expect(page.locator('#autoIndividualBlocksHint')).toContainText('Schichtmodelle dieses Unternehmens nicht verfügbar');await expect(page.locator('#autoBlocksOption')).toBeHidden();
});


test('solid planning previews six months with visible recovery rules and sends one atomic draft RPC',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page);
 await page.evaluate(()=>{window.qaPeriodProgress=[];const update=SFAutoPlanProgress.update;SFAutoPlanProgress.update=p=>{qaPeriodProgress.push({completed:p.completed,total:p.total});update(p)}});
 await page.evaluate(()=>{window.SFCompliance={policy:{monthlyPlanningMaxHours:190,monthlyPlanningMaxShifts:18,solidPlanningRules:{enabled:true,timezone:'Europe/Berlin',maxConsecutiveShifts:4,minFreeStartDays:2,minBlockRestHours:48,criticalCoverageGroups:[],criticalShifts:[]}},isWeekPublished:()=>false,check:()=>({hard:[],soft:[]})};employees=['a','b'].map(id=>({id,first:'Test',last:id,status:'active',employment:'Teilzeit',shifts:['FD'],weeklyHours:40,monthlyHours:16}));employeeMonthlyTarget=e=>e.monthlyHours;getSoll=date=>Number(+date.slice(-2)<=2);window.periodCalls=[];Object.assign(SFBackend,{ready:true,empDb:new Map([['a','db-a'],['b','db-b']]),asgDb:new Map(),sync:async()=>{},hydrate:async()=>{},client:{rpc:async(name,args)=>{periodCalls.push({name,args});return{data:name==='preview_planning_period'?{fingerprint:'same',protectedIds:[]}:{created:12}}}}});renderAutoPlanning();});
 await expect(page.locator('#autoPlanMonthCountField')).toBeVisible();await page.locator('#autoPlanMonth').fill('2027-01');await page.locator('#autoPlanMonthCount').selectOption('6');await generatePreview(page);await expect(page.locator('#autoSuggestionCount')).toHaveText('12');await expect(page.locator('#sfAutoProgressPercent')).toHaveText('100 %');expect(await page.evaluate(()=>qaPeriodProgress.every((p,i)=>p.total===72&&(i===0||p.completed>=qaPeriodProgress[i-1].completed)))).toBe(true);expect(await page.evaluate(()=>qaPeriodProgress.at(-1).completed)).toBe(72);const recovery=await openRuleSection(page,'recovery');await expect(recovery.locator('dl > div').filter({has:page.getByText('Ruhe zwischen Blöcken',{exact:true})}).locator('dd')).toHaveText('Mind. 48 h');const hours=await openRuleSection(page,'hours');await expect(hours.locator('dl > div').filter({has:page.getByText('Monatsobergrenze',{exact:true})}).locator('dd')).toHaveText('190 h');await expect(page.locator('#autoMonthHours')).toContainText('96 h geplant / 96 h Bedarf');await expect(page.locator('#autoRespectHours')).toBeDisabled();expect(await page.evaluate(()=>assignments.length)).toBe(0);expect(await page.evaluate(()=>autoPlanningDates().length)).toBe(181);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.locator('#applyAutoPlanBtn').click();await page.getByRole('dialog').getByRole('button',{name:'Als Entwurf übernehmen',exact:true}).click();await completeApply(page);expect(await page.evaluate(()=>periodCalls.map(x=>x.name))).toEqual(['preview_planning_period','apply_planning_period']);expect(await page.evaluate(()=>periodCalls[1].args.p_month_count)).toBe(6);expect(await page.evaluate(()=>periodCalls[1].args.p_assignments.length)).toBe(12);expect(errors).toEqual([]);
});

for(const theme of ['dark','light'])test(`real progress, network phase, duplicate prevention and reset in ${theme}`,async({page})=>{
 await fixture(page,theme);await page.setViewportSize({width:theme==='light'?390:1440,height:1000});
 await page.evaluate(()=>{
   window.qaCalls=0;window.qaValues=[];
   const original=SFMonthOptimizerCore.optimize;
   SFMonthOptimizerCore.optimize=(input,options)=>{qaCalls++;let last;return original(input,{...options,progress:p=>{last=p;options.progress(p);qaValues.push(Number(document.getElementById('sfAutoProgressBar').getAttribute('aria-valuenow')))},yieldStep:async()=>{if(last?.iteration===64)await new Promise(resolve=>window.qaResumePlan=resolve);else await options.yieldStep()}})};
   Object.assign(SFBackend,{ready:true,sync:()=>new Promise(resolve=>window.qaResumeData=resolve),hydrate:async()=>{},client:{rpc:async()=>({data:{fingerprint:'qa',protectedIds:[]},error:null})}});
   window.qaRun=SFMonthOptimizer.optimize();
 });
 await expect(page.locator('#sfAutoProgress')).toBeVisible();await expect(page.locator('#sfAutoProgressPercent')).toHaveText('In Arbeit');await expect(page.locator('#sfAutoProgressBar')).not.toHaveAttribute('aria-valuenow',/.+/);
 await expect(page.locator('#generateAutoPlanBtn')).toBeDisabled();await page.evaluate(()=>SFMonthOptimizer.optimize());expect(await page.evaluate(()=>qaCalls)).toBe(0);
 await page.evaluate(()=>qaResumeData());await expect(page.locator('#sfAutoProgressBar')).toHaveAttribute('aria-valuenow','50');await expect(page.locator('#sfAutoProgressDetail')).toContainText('64/128');await expect(page.locator('#view-auto')).toHaveAttribute('aria-busy','true');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.locator('#sfAutoProgress').screenshot({path:test.info().outputPath('progress-'+theme+'.png')});
 await page.evaluate(()=>SFMonthOptimizer.optimize());expect(await page.evaluate(()=>qaCalls)).toBe(1);
 await page.evaluate(()=>qaResumePlan());await page.evaluate(()=>qaRun);await expect(page.locator('#sfAutoProgressPercent')).toHaveText('100 %');await expect(page.locator('#sfAutoProgressLabel')).toHaveText('Planung abgeschlossen');await expect(page.locator('#view-auto')).not.toHaveAttribute('aria-busy',/.+/);await expect(page.locator('#applyAutoPlanBtn')).toBeEnabled();
 expect(await page.evaluate(()=>qaValues.every((n,i)=>i===0||n>=qaValues[i-1]))).toBe(true);expect(await page.evaluate(()=>assignments.length)).toBe(0);
 await page.locator('#clearAutoPlanBtn').click();await expect(page.locator('#sfAutoProgress')).toBeHidden();
});
test('a failed monthly planning run never reports completion and releases its controls',async({page})=>{
 await fixture(page);await page.evaluate(()=>{Object.assign(SFBackend,{ready:true,sync:async()=>{throw Error('Test: Verbindung unterbrochen')},client:{}});window.qaRun=SFMonthOptimizer.optimize()});await page.evaluate(()=>qaRun);
 await expect(page.locator('#sfAutoProgress')).toHaveClass(/is-error/);await expect(page.locator('#sfAutoProgressDetail')).toContainText('Verbindung unterbrochen');await expect(page.locator('#sfAutoProgressPercent')).not.toHaveText('100 %');await expect(page.locator('#optimizeAutoMonthBtn')).toBeEnabled();expect(await page.evaluate(()=>assignments.length)).toBe(0);expect(await page.evaluate(()=>SFAutoPlanProgress.isBusy())).toBe(false);
});

test('holiday IST/SOLL overview shows zero regular OT crew and ordinary OT demand, with normal weekdays preserved',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page);await page.addScriptTag({content:read('assets/ot-weekend-holiday-policy.js')});await page.addScriptTag({content:read('assets/shift-models-v1.js')});
 await page.evaluate(()=>{SFCompliance={policy:{solidPlanningRules:{enabled:true,otDayHolidayExclusion:true,otDayHolidayStates:['DE','SN','NW'],otHolidayStatesBySite:{Leipzig:'SN',Recklinghausen:'NW'}}}};SFShiftModels.apply(['OT1','OT2','OT3','OT'].map(code=>({code,active:true,default_start:'08:00',default_end:'18:00',optional_weekdays:code==='OT'?[6,7]:[1,2,3,4,5]})),SFBackend.companyId);globalSoll={OT1:1,OT2:2,OT3:1,OT:3};getSoll=(date,type)=>dailySoll[date]?.[type]??globalSoll[type]??0;document.getElementById('autoPlanMonth').value='2027-01';autoPlanAnalyzed=true;renderAutoPlanning()});
 for(const code of ['OT1','OT2','OT3'])await expect(page.locator('[data-staffing-shift="'+code+'"] td').first()).toHaveText('IST 0SOLL 0');await expect(page.locator('[data-staffing-shift=OT] td').first()).toHaveText('IST 0SOLL 3');await expect(page.locator('[data-staffing-shift=OT2] td').nth(3)).toHaveText('IST 0SOLL 2');expect(await page.evaluate(()=>autoOpenSlots(['2027-01-01']).map(x=>x.type))).toEqual(['OT','OT','OT']);expect(await page.evaluate(()=>assignments.length)).toBe(0);expect(errors).toEqual([]);
});

test('fixed 4/3/3/2 monthly nights remain whole through optimization and local confirmed apply',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page);
 await page.evaluate(()=>{const pattern='ALLE, ALLE, ALLE, ALLE, FREI, FREI, FREI, ALLE, ALLE, ALLE, FREI, FREI';SFCompliance={policy:{solidPlanningRules:{enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',maxConsecutiveShifts:4,maxConsecutiveNightShifts:4,preferredNightBlockLength:4,minNightRecoveryCalendarDays:2,minFreeCalendarDays:2,minBlockRestHours:48,maxCalendarWeekHours:55,monthlyMaxHours:190,tenHourMaxShifts:18,threeNightBlockRecoveryFullCalendarDays:1}},isWeekPublished:()=>false};employees=[{id:'test',first:'Fiktive',last:'Person',role:'Sicherheitsmitarbeiter',status:'active',employment:'Vollzeit',monthlyHours:180,weeklyHours:55,maxWeeklyHours:55,shifts:['O3'],rhythmMode:'required',rhythmStart:'2027-01-01',rhythmPattern:pattern}];TYPES=[{id:'O3',start:'22:00',end:'08:00'}];plannedAssignmentHours=()=>10;plannedMonthlyHoursForEmployee=(id,date,sim=[])=>[...assignments,...sim].filter(a=>a.employeeId===id&&a.date.startsWith(date.slice(0,7))).length*10;document.getElementById('autoPlanMonth').value='2027-01';changeAutoPlanPeriod()});
 await generatePreview(page);expect(await page.evaluate(()=>autoPlanPreview.length)).toBe(18);expect(await page.evaluate(()=>autoPlanPreview.every(a=>SFRhythm.check(employees[0],a.type,a.date).allowed))).toBe(true);expect(await page.evaluate(()=>SFSolidPlanningCore.errors(employees[0],autoPlanPreview,SFCompliance.policy.solidPlanningRules))).toEqual([]);
 const blocks=await page.evaluate(()=>{const counts=new Map();autoPlanPreview.forEach(a=>counts.set(a.blockId,(counts.get(a.blockId)||0)+1));return [...counts.values()]});expect(blocks.sort()).toEqual([3,3,4,4,4]);
 await page.locator('#applyAutoPlanBtn').click();await page.getByRole('dialog').getByRole('button',{name:'Als Entwurf übernehmen',exact:true}).click();await completeApply(page);expect(await page.evaluate(()=>assignments.length)).toBe(18);expect(errors).toEqual([]);
});
