const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),output=path.join(root,'test-results/personnel-health-privacy');fs.mkdirSync(output,{recursive:true});
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=[...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
const section=source.match(/<section id="view-absence"[\s\S]*?<\/section>/)[0].replace('class="view absence','class="view active absence');
const fixture=`
const employees=[{id:'test-employee',first:'Fiktive',last:'Testperson',personnelNo:'TEST-001'}];
let absences=[{id:'test-absence',employeeId:'test-employee',startDate:'2026-10-01',endDate:'2026-10-02',type:'Abwesend',status:'Genehmigt',fullDay:true,note:'',timeNote:''}];
const assignments=[{id:'test-shift',employeeId:'test-employee',date:'2026-10-01',type:'FD',start:'06:00',end:'14:00'}];
const DAYS=['Mo','Di','Mi','Do','Fr','Sa','So'];let weekStart=new Date('2026-09-28T00:00:00Z');
const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');const currentWeekDates=()=>Array.from({length:7},(_,i)=>new Date(Date.UTC(2026,8,28+i)));
const typeById=()=>({start:'06:00',end:'14:00'});let openedByHR=0;
function openAbsenceDialog(){openedByHR++}function renderCalendar(){}function renderPlanEmployeePool(){}function renderOverview(){}function saveAll(){}function showSaveToast(){}
window.SFBackend={ready:true,role:'PLANNER',client:{from(){throw Error('Unexpected raw medical table access')}},hydrate:async()=>{}};
`;
const html='<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'body{padding:24px}#view-absence{display:block}.qa-label{padding:12px;margin-bottom:16px;background:#14293d;border-radius:8px;color:#d4e7fa}</style></head><body><div class="qa-label">SchichtFunk · Prüf-Vorschau mit fiktiven Testdaten</div>'+section+'<script>'+fixture+'</script><script src="/assets/absence-management-v3.js"></script></body></html>';
(async()=>{const browser=await chromium.launch({headless:true});try{
 for(const [name,width] of [['desktop',1440],['mobile',390]]){
 const page=await browser.newPage({viewport:{width,height:1050},locale:'de-DE'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.setFixedTime(new Date('2026-10-01T10:00Z'));
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='privacy.test')return route.abort();if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:html});return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(root,u.pathname))})});
 await page.goto('http://privacy.test/');await page.locator('.sf-abs-v3-row').waitFor();
 assert.equal(await page.locator('.absence-main-action').isVisible(),false);assert.equal(await page.locator('.sf-abs-v3-delete').count(),0);
 assert.equal(await page.locator('#absenceTypeFilter').isVisible(),false);assert.doesNotMatch(await page.locator('#view-absence').innerText(),/Krank|diagnosis|Synthetic/);
 assert.match(await page.locator('#absencePanel').innerText(),/Abwesend/);assert.match(await page.locator('#absenceConflictSummary').innerText(),/1 Konflikt/);
 await page.screenshot({path:path.join(output,'teamleitung-'+name+'.png'),fullPage:true});
 await page.locator('.sf-abs-v3-actions button').click();await page.locator('#absenceModal').waitFor();assert.match(await page.locator('#absenceModal').innerText(),/Abwesend/);assert.equal(await page.locator('#absenceModal input,#absenceModal textarea').count(),0);assert.equal(await page.evaluate(()=>openedByHR),0);await page.locator('#absenceModal [data-close]').click();
 await page.evaluate(()=>{SFBackend.role='OWNER';absences[0].type='Krank';absences[0].note='Fiktiver medizinischer Hinweis';renderAbsenceDashboard()});
 assert.equal(await page.locator('.absence-main-action').isVisible(),true);assert.equal(await page.locator('.sf-abs-v3-delete').count(),1);assert.match(await page.locator('#absencePanel').innerText(),/Krank/);
 await page.locator('.sf-abs-v3-actions button').first().click();assert.equal(await page.evaluate(()=>openedByHR),1);
 await page.screenshot({path:path.join(output,'personalverwaltung-'+name+'.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({name,passed:true,checks:'role controls, neutral details, conflict retention, HR detail access'}));await page.close();
 }
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
