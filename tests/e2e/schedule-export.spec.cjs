const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'../../',file),'utf8');
let deps;
try{deps={xlsx:require.resolve('xlsx/dist/xlsx.full.min.js'),pdf:require.resolve('jspdf/dist/jspdf.umd.min.js'),table:require.resolve('jspdf-autotable/dist/jspdf.plugin.autotable.js')}}catch{}
if(process.env.CI&&!deps)throw Error('Real XLSX/PDF test dependencies are required in CI.');
async function fixture(page){
  await page.route('https://schichtfunk.de/__schedule-export',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="de"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>'}));await page.goto('https://schichtfunk.de/__schedule-export');
  await page.setContent('<div class="company-card"><b>Test GmbH</b></div><section id="view-schedule"><div class="page-head"><h1>Monatsplanung</h1><button>Veröffentlichen</button></div><input id="planEmployeeSearch" value="Anna"></section>');
  await page.addScriptTag({content:`window.SFBackend={companyId:'company-a',role:'PLANNER',ready:true};window.SchichtFunkCalendarView={getPeriod:()=>({mode:'month',start:'2026-12-01',end:'2026-12-31'})};window.employees=[{id:'A',first:'Anna',last:'Test',status:'active',personnelNo:'001',planningTeam:'A'},{id:'B',first:'Berta',last:'Test',status:'active'},{id:'C',first:'Chris',last:'Other',status:'active',company_id:'company-b'}];window.TYPES=[{id:'FD',name:'Frühdienst',start:'06:00',end:'14:00'},{id:'ND',name:'Nachtdienst',start:'22:00',end:'06:00'}];window.assignments=[{employeeId:'A',date:'2026-12-01',type:'FD'},{employeeId:'A',date:'2026-12-31',type:'ND'},{employeeId:'B',date:'2026-12-02',type:'FD',start:'07:00',end:'14:00'},{employeeId:'C',date:'2026-12-01',type:'FD',company_id:'company-b'}];window.absences=[];window.getSoll=()=>2;`});
  await page.addStyleTag({content:read('assets/schedule-export-v1.css')});
  await page.addScriptTag({content:read('assets/schedule-export-core-v1.js')});await page.addScriptTag({content:read('assets/schedule-export-v1.js')});
}
test('one export action selects the complete month and ignores employee search; company boundaries and roles are enforced',async({page})=>{
  await fixture(page);await page.getByRole('button',{name:'Gesamtdienstplan als Excel oder PDF exportieren'}).click();await expect(page.locator('#sfPlanExportMonth')).toHaveValue('2026-12');await expect(page.locator('.sf-plan-export-summary')).toContainText('31 Tage · 2 Mitarbeiter · 3 Dienste · 23 Planstunden');
  const plan=await page.evaluate(()=>SFScheduleExport.snapshot('2026-12'));expect(plan.rows.map(r=>r.person.id)).toEqual(['A','B']);expect(plan.days).toHaveLength(31);
  await page.evaluate(()=>SFBackend.role='EMPLOYEE');const denied=await page.evaluate(()=>{try{SFScheduleExport.snapshot('2026-12');return false}catch{return true}});expect(denied).toBe(true);
});
test('library failures show a retryable message and restore the controls',async({page})=>{
  await fixture(page);await page.route('https://cdn.jsdelivr.net/**',route=>route.abort());await page.getByRole('button',{name:'Gesamtdienstplan als Excel oder PDF exportieren'}).click();await page.getByRole('button',{name:'Excel herunterladen'}).click();await expect(page.locator('.sf-plan-export-status')).toContainText('konnte nicht geladen werden');await expect(page.getByRole('button',{name:'Excel herunterladen'})).toBeEnabled();await expect(page.locator('#sfPlanExportMonth')).toBeEnabled();
});
test('real XLSX and PDF downloads contain the complete December plan and the PDF appendix',async({page})=>{
  test.skip(!deps,'Real export libraries run in CI.');await fixture(page);for(const lib of [deps.xlsx,deps.pdf,deps.table])await page.addScriptTag({content:fs.readFileSync(lib,'utf8')});
  await page.getByRole('button',{name:'Gesamtdienstplan als Excel oder PDF exportieren'}).click();
  const xlsxReady=page.waitForEvent('download');await page.getByRole('button',{name:'Excel herunterladen'}).click();const xlsx=await xlsxReady;expect(xlsx.suggestedFilename()).toBe('SchichtFunk_Gesamtdienstplan_2026-12.xlsx');const bytes=fs.readFileSync(await xlsx.path()),X=require('xlsx'),wb=X.read(bytes,{type:'buffer'});expect(wb.SheetNames).toEqual(['Monatsplan','Schichtdetails','Besetzung','Hinweise']);const matrix=X.utils.sheet_to_json(wb.Sheets.Monatsplan,{header:1});expect(matrix[6]).toHaveLength(36);expect(matrix[7][0]).toBe('001');expect(matrix[7][33]).toContain('ND 22:00');expect(matrix[8][1]).toBe('Berta Test');
  const pdfReady=page.waitForEvent('download');await page.getByRole('button',{name:'PDF herunterladen'}).click();const pdf=await pdfReady;expect(pdf.suggestedFilename()).toBe('SchichtFunk_Gesamtdienstplan_2026-12.pdf');const raw=fs.readFileSync(await pdf.path()).toString('latin1');expect(raw.startsWith('%PDF-')).toBe(true);expect(raw).toContain('SchichtFunk');expect(raw).toContain('Anna Test');expect(raw).toContain('07:00');expect(raw).toContain('Berta Test');
});
