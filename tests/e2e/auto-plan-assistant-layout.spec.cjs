const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'../../',p),'utf8');
const index=read('index.html');
const start=index.indexOf('<section id="view-auto"');
const section=index.slice(start,index.indexOf('\n  <section id="view-reports"',start)).replace('class="view sf-auto-workspace"','class="view active sf-auto-workspace"');
const planning=index.slice(index.indexOf('let autoPlanPreview=[];'),index.indexOf('\nfunction renderOverviewStats()',index.indexOf('let autoPlanPreview=[];')));
const styles=[...index.matchAll(/<style[^>]*>([\s\S]*?)<\/style>|<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(m=>m[1]!==undefined?'<style>'+m[1]+'</style>':m[0]).join('\n');
const script=s=>'<script>'+s.replace(/<\/script/gi,'<\\/script')+'</script>';
const assistantTag=index.match(/<script\b[^>]*\bsrc="assets\/planning-assistant-v1\.js[^\"]*"><\/script>/)[0];
const modules=['date-month-format-v1.js','employee-rhythm-v1.js','compliance-core-v2.js','supabase-auto-plan-guard-v1.js','individual-month-planner-v1.js','month-optimizer-core-v1.js','auto-plan-workspace-v1.js','month-optimizer-v1.js','help-center-content-v3.js','planning-assistant-core-v1.js'];
const fake=`
window.__writes=0;window.store={get:(key,fallback)=>fallback,set:()=>__writes++};window.saveAll=()=>__writes++;window.showSaveToast=()=>{};window.renderCalendar=()=>{};
window.SFBackend={ready:true,role:'PLANNER',user:{id:'fictitious-user'},companyId:'fictitious-company'};
window.weekStart=new Date('2026-10-05T12:00:00');window.assignments=[];window.absences=[];
window.employees=[{id:'fake',first:'Fiktive',last:'Testperson',status:'active',employment:'Vollzeit',shifts:['FD'],weeklyHours:40,monthlyHours:180}];
window.TYPES=[{id:'FD',name:'Frühdienst',start:'06:00',end:'14:00'}];window.globalSoll={FD:1};window.dailySoll={};
window.iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
window.addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};
window.currentWeekDates=()=>Array.from({length:7},(_,i)=>addDays(weekStart,i));
window.typeById=t=>TYPES.find(x=>x.id===t);window.getSoll=()=>1;
window.assignmentsFor=(d,t)=>assignments.filter(a=>a.date===d&&a.type===t);window.absent=()=>false;
window.employeeMonthlyTarget=()=>180;window.plannedAssignmentHours=()=>8;
window.plannedMonthlyHoursForEmployee=(id,date,simulated=[])=>[...assignments,...simulated].filter(a=>a.employeeId===id&&a.date.startsWith(date.slice(0,7))).length*8;
window.SFShiftModels={isCompanyLoaded:()=>true,planningRestriction:()=>null,activeCodes:()=>TYPES.map(t=>t.id),knownCodes:()=>TYPES.map(t=>t.id)};
window.showView=v=>document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id==='view-'+v));
`;
const html='<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+styles+'</head><body><div id="appShell" class="app"><aside class="sidebar"><p>Fiktive Testdaten</p><button id="showSchedule" onclick="showView(\'schedule\')">Dienstplan</button><button id="showAuto" onclick="showView(\'auto\')">Auto-Planung</button></aside><header class="topbar">SchichtFunk</header><main class="main"><div class="content">'+section+'<section id="view-schedule" class="view"><h1>Dienstplan</h1></section></div></main></div>'+script(fake)+script(planning)+modules.map(p=>'<script src="assets/'+p+'"></script>').join('')+assistantTag+'</body></html>';
test.use({video:'off',launchOptions:process.env.SF_ASSISTANT_BROWSER_EXECUTABLE?{executablePath:process.env.SF_ASSISTANT_BROWSER_EXECUTABLE}:{}});
async function fixture(page,theme,fontSize,role='PLANNER'){
 const errors=[],external=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/*',async r=>{
  const u=new URL(r.request().url());requests.push(u.pathname+u.search);
  if(u.origin!=='http://auto-assistant.test'){external.push(u.href);await r.abort();return;}
  if(u.pathname==='/'){await r.fulfill({contentType:'text/html',body:html.replace("role:'PLANNER'","role:'"+role+"'")});return;}
  if(u.pathname.startsWith('/assets/')){const file=u.pathname.slice(1);await r.fulfill({contentType:file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'application/javascript',body:read(file)});return;}
  await r.abort();
 });
 await page.goto('http://auto-assistant.test/');
 await page.evaluate(({theme,fontSize})=>{document.documentElement.dataset.sfTheme=theme;document.documentElement.style.fontSize=fontSize+'px';document.documentElement.classList.toggle('sf-font-large',fontSize===17);},{theme,fontSize});
 await page.locator('#autoPlanPeriod').selectOption('date');await page.locator('#autoPlanDate').fill('2026-10-06');await page.locator('#autoPlanDate').dispatchEvent('change');
 return {errors,external,requests};
}
async function geometry(page){return page.evaluate(()=>{
 const ids=['generateAutoPlanBtn','sfPlanningAssistantButton','sfPlanningChat'];
 const rects=ids.map(id=>{const el=document.getElementById(id),r=el?.getBoundingClientRect();return{id,visible:!!r&&r.width>0&&r.height>0,left:r?.left,right:r?.right,top:r?.top,bottom:r?.bottom,position:el?getComputedStyle(el).position:null};});
 const issues=[];
 for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];if(a.visible&&b.visible&&a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1)issues.push(a.id+' overlaps '+b.id);}
 if(document.documentElement.scrollWidth>innerWidth+1)issues.push('page has horizontal overflow');
 for(const r of rects)if(r.visible&&(r.left< -1||r.right>innerWidth+1))issues.push(r.id+' outside horizontal viewport');
 const b=document.getElementById('generateAutoPlanBtn'),r=b.getBoundingClientRect();
 if(r.top>=0&&r.bottom<=innerHeight){for(const [x,y] of [[r.left+4,r.top+4],[r.right-4,r.top+4],[r.left+4,r.bottom-4],[r.right-4,r.bottom-4],[(r.left+r.right)/2,(r.top+r.bottom)/2]])if(!b.contains(document.elementFromPoint(x,y)))issues.push('proposal button is covered');}
 return {issues,rects};
});}
const sizes=[1920,1366,1024,768,600,390,320].flatMap(width=>[16,17,24].map(fontSize=>({width,height:width<=600?780:768,fontSize}))).concat([{width:1366,height:480,fontSize:17},{width:768,height:480,fontSize:32},{width:320,height:780,fontSize:32}]);
for(const theme of ['light','dark'])for(const {width,height,fontSize} of sizes)test(`auto assistant ${theme} ${width}x${height}px font ${fontSize}`,async({page},info)=>{
 await page.setViewportSize({width,height});const report=await fixture(page,theme,fontSize);
 const launcher=page.locator('#sfPlanningAssistantButton'),button=page.locator('#generateAutoPlanBtn');
 await expect(launcher).toHaveClass(/sf-chat-docked/);expect(await launcher.evaluate(el=>getComputedStyle(el).position)).toBe('static');
 // Reproduce the scroll position at which the previous fixed launcher covered the CTA.
 await button.evaluate(el=>{const r=el.getBoundingClientRect();window.scrollBy(0,r.bottom-(innerHeight-20));});
 expect((await geometry(page)).issues).toEqual([]);
 await button.click();await expect(page.locator('#autoSuggestionCount')).toHaveText('1');expect(await page.evaluate(()=>assignments.length)).toBe(0);
 await launcher.click();await expect(page.locator('#sfPlanningChat')).toBeVisible();await expect(page.locator('#sfPlanningChatInput')).toBeFocused();
 expect(await page.locator('#sfPlanningChatInput').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})).toBe(true);
 await button.scrollIntoViewIfNeeded();const open=await geometry(page);expect(open.issues).toEqual([]);
 await button.click();await expect(page.locator('#autoSuggestionCount')).toHaveText('1');await expect(page.locator('#sfPlanningChat')).toBeVisible();
 // Use the actual assistant: ask a planning question and retain it while closing/reopening.
 await page.locator('#sfPlanningChatInput').fill('Welche Dienste sind am 06.10.2026 offen?');await page.locator('#sfPlanningChatForm button').click();await expect(page.locator('#sfPlanningChatLog .is-user')).toHaveCount(1);
 await page.keyboard.press('Escape');await expect(page.locator('#sfPlanningChat')).not.toBeVisible();await expect(launcher).toBeFocused();
 const restored=await launcher.evaluate(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,viewport:innerHeight};});
 expect(restored.top).toBeGreaterThanOrEqual(-1);expect(restored.bottom).toBeLessThanOrEqual(restored.viewport+1);
 await launcher.press('Enter');await expect(page.locator('#sfPlanningChatLog .is-user')).toHaveCount(1);
 await page.locator('#sfPlanningChatClose').click();await button.focus();await page.keyboard.press('Enter');await expect(page.locator('#autoSuggestionCount')).toHaveText('1');
 expect(await page.evaluate(()=>__writes)).toBe(0);expect(report.errors).toEqual([]);expect(report.external).toEqual([]);
 expect(report.requests).toContain('/'+assistantTag.match(/src="([^"]+)"/)[1]);
 await info.attach('layout',{body:Buffer.from(JSON.stringify({open,...await geometry(page)},null,2)),contentType:'application/json'});
 if(fontSize===17){await launcher.click();await page.screenshot({path:info.outputPath('assistant-docked.png')});}
});
test('switching views restores floating placement without duplicating assistant or chat',async({page})=>{
 await fixture(page,'light',17);await page.locator('#sfPlanningAssistantButton').click();
 for(let i=0;i<3;i++){
  await page.evaluate(()=>showView('schedule'));await expect(page.locator('#sfPlanningAssistantButton')).not.toHaveClass(/sf-chat-docked/);expect(await page.locator('#sfPlanningChat').evaluate(el=>el.parentNode===document.body)).toBe(true);
  await page.evaluate(()=>showView('auto'));await expect(page.locator('#sfPlanningAssistantButton')).toHaveClass(/sf-chat-docked/);expect(await page.locator('#sfPlanningChat').evaluate(el=>el.parentNode.id)).toBe('sfAutoPlanningAssistantDock');await expect(page.locator('#sfPlanningChat')).toBeVisible();
 }
 await expect(page.locator('#sfPlanningAssistantButton')).toHaveCount(1);await expect(page.locator('#sfPlanningChat')).toHaveCount(1);await expect(page.locator('#sfAutoPlanningAssistantDock')).toHaveCount(1);expect((await geometry(page)).issues).toEqual([]);
 await page.evaluate(()=>{SFBackend.companyId='different-fictitious-company';});await expect(page.locator('#sfPlanningChat')).not.toBeVisible();expect(await page.evaluate(()=>__writes)).toBe(0);
});
for(const role of ['OWNER','ADMIN','DISPATCHER','EMPLOYEE','TIME_TRACKING'])test('assistant access '+role,async({page})=>{
 const report=await fixture(page,'dark',17,role);const visible=['OWNER','ADMIN','DISPATCHER'].includes(role);
 if(visible)await expect(page.locator('#sfPlanningAssistantButton')).toBeVisible();else await expect(page.locator('#sfPlanningAssistantButton')).toBeHidden();
 expect(report.errors).toEqual([]);expect(report.external).toEqual([]);expect(await page.evaluate(()=>__writes)).toBe(0);
});

for(const width of [1366,320])test('month actions and assistant '+width,async({page})=>{
 await page.setViewportSize({width,height:780});const report=await fixture(page,'light',17);
 await page.evaluate(()=>{TYPES.push({id:'SD',start:'14:00',end:'22:00'},{id:'ND',start:'22:00',end:'06:00'});employees[0].shifts=['SD','ND'];});
 await page.locator('#autoPlanPeriod').selectOption('month');await page.locator('#autoPlanMonth').fill('2026-10');await page.locator('#autoPlanMonth').dispatchEvent('change');
 await expect(page.locator('#generateAutoPlanBtn')).toContainText('Individuellen Monat planen');
 await page.locator('#sfPlanningAssistantButton').click();await page.locator('#generateAutoPlanBtn').scrollIntoViewIfNeeded();expect((await geometry(page)).issues).toEqual([]);
 await page.locator('#autoIndividualBlocks').uncheck();await expect(page.locator('#optimizeAutoMonthBtn')).toBeVisible();await page.locator('#optimizeAutoMonthBtn').scrollIntoViewIfNeeded();
 expect(await page.locator('#optimizeAutoMonthBtn').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2));})).toBe(true);
 expect((await geometry(page)).issues).toEqual([]);expect(report.errors).toEqual([]);expect(report.external).toEqual([]);expect(await page.evaluate(()=>__writes)).toBe(0);
});
