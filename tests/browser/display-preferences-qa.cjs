// Run: node tests/browser/display-preferences-qa.cjs (after playwright install chromium).
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..');
const out=path.join(root,'test-results/display-preferences');fs.mkdirSync(out,{recursive:true});
const read=p=>fs.readFileSync(path.join(root,p),'utf8'),index=read('index.html');
const styles=[...index.matchAll(/<style[^>]*>([\s\S]*?)<\/style>|<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(m=>m[1]!==undefined?m[1]:read(m[0].match(/href="([^"]+)"/)[1].split('?')[0])).join('\n');
const scripts=['assets/settings-management-v2.js','assets/schedule-week-board-v2-phase1.js','assets/schedule-readability-v1.js','assets/schedule-employee-pool-polish-v1.js'].map(read);
const script=s=>'<script>'+s.replace(/<\/script/gi,'<\\/script')+'</script>';
const functions=['renderPlanEmployeePool','plannedAssignmentHours','plannedMonthlyHoursForEmployee','employeeMonthlyTarget'].map(name=>index.split('\n').find(l=>l.startsWith('function '+name+'('))).join('\n');
const fixture=`window.SFBackend={role:'OWNER',ready:false,account(){}};window.SFCompliance={};window.__writes=0;window.saveAll=()=>__writes++;window.showSaveToast=(...a)=>window.lastToast=a;window.selectedPlanEmployeeId=null;window.absences=[];
window.iso=d=>d.toISOString().slice(0,10);window.addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};window.weekStart=new Date('2026-10-05T12:00:00Z');window.currentWeekDates=()=>Array.from({length:7},(_,i)=>addDays(weekStart,i));window.DAYS=[];
window.TYPES=[{id:'FD',name:'Frühdienst',start:'06:00',end:'14:00',cls:'teal'}];window.globalSoll={FD:2};window.dailySoll={};window.typeById=id=>TYPES.find(t=>t.id===id);window.getSoll=()=>2;window.assignmentsFor=(date,id)=>assignments.filter(a=>a.date===date&&a.type===id);
window.employees=[{id:'e1',first:'Alex',last:'Muster',personnelNo:'1001',role:'Mitarbeiter',status:'active',weeklyHours:40,monthlyHours:180,shifts:['FD']}];window.assignments=[{id:'a1',employeeId:'e1',date:'2026-10-05',type:'FD',start:'06:00',end:'14:00'},{id:'a2',employeeId:'e1',date:'2026-11-01',type:'FD',start:'18:00',end:'04:00'}];
window.renderCalendar=()=>{};window.editAssignment=()=>{};window.updateStats=()=>{};
#{functions}`.replaceAll('#{functions}',functions);
const body='<div id="appShell"><main class="main"><section id="view-settings" class="view active"><div class="page-head"></div></section><section id="view-schedule" class="view"><div class="employee-pool"><div class="employee-pool-head"><h3>Mitarbeiter-Pool</h3><input id="planEmployeeSearch"></div><div id="planEmployeePool" class="employee-pool-list"></div></div><div class="calendar"><div class="cal-toolbar"><div class="seg"></div></div><div id="calendarGrid"></div><div id="sollList"></div><div id="testTimeline" class="assignment"><b>FD<span class="sf-display-person-name"> · Muster, Alex</span></b><span>06:00 – 14:00</span></div></div></section></main></div>';
const savedStandard={density:'comfortable',fontSize:'normal',scheduleDensity:'normal',highContrast:false,showNames:true,showTimes:true,showHours:true,statusSymbols:true};
async function visible(page,id){await page.evaluate(id=>document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id)),id)}
async function textVisible(page,selector){return page.locator(selector).first().isVisible()}
async function state(page){return page.evaluate(()=>({html:document.documentElement.className,body:document.body.className,storage:localStorage.getItem('sp_settings_v2')}))}
let browser;
(async()=>{
 browser=await chromium.launch({headless:true,...(process.env.SF_DISPLAY_BROWSER?{executablePath:process.env.SF_DISPLAY_BROWSER}:{})});const reports=[];
 for(const [name,width,theme,role] of [['dark',1280,'dark','OWNER'],['light',1100,'light','ADMIN'],['mobile',390,'dark','PLANNER'],['small-mobile',320,'light','DISPATCHER']]){
  const context=await browser.newContext({viewport:{width,height:950},locale:'de-DE',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const html='<!doctype html><html lang="de" data-sf-theme="'+theme+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+styles+'#appShell{display:block!important}.main{max-width:1280px;margin:auto;padding:20px}#view-settings{max-width:1200px;margin:auto}#view-schedule .assignment{position:relative;width:200px;top:auto;left:auto;height:60px}</style></head><body>'+body+script(fixture)+script('window.SFBackend.role='+JSON.stringify(role)+';')+scripts.map(script).join('\n')+script('document.addEventListener("DOMContentLoaded",()=>renderPlanEmployeePool());')+'</body></html>';
  await context.addInitScript(()=>{if(!localStorage.getItem('sp_settings_v2'))localStorage.setItem('sp_settings_v2',JSON.stringify({density:'compact',fontSize:'large',scheduleDensity:'compact',unrelated:'preserve'}))});
  await page.route('http://display.test/**',r=>r.fulfill({contentType:'text/html',body:html}));
  await page.goto('http://display.test/');await page.locator('[data-setting-tab="display"]').click();
  assert.equal(await page.locator('.sf-display-illustration').count(),6);assert.equal(await page.locator('.sf-display-profile').count(),3);
  assert.equal(await page.locator('#sfFontSize').inputValue(),'large','legacy preferences retained');
  const initial=await state(page);
  await page.locator('[data-display-profile="standard"]').click();
  assert.equal(await page.locator('#sfDisplayState').innerText(),'Ungespeicherte Änderungen');
  assert.deepEqual(await state(page),initial,'draft must not save or apply');
  const normalFont=await page.locator('#sfDisplayLive .employee-pool-info>b').evaluate(e=>parseFloat(getComputedStyle(e).fontSize));
  await page.locator('[data-display-profile="readable"]').click();
  const largeFont=await page.locator('#sfDisplayLive .employee-pool-info>b').evaluate(e=>parseFloat(getComputedStyle(e).fontSize));assert(largeFont>normalFont,'preview font must enlarge');
  assert.equal(await page.locator('#sfDisplayLive').getAttribute('data-contrast'),'true');
  await page.locator('[data-display-check="showNames"]').uncheck();await page.locator('[data-display-check="showTimes"]').uncheck();await page.locator('[data-display-check="showHours"]').uncheck();await page.locator('[data-display-check="statusSymbols"]').uncheck();
  assert.equal(await textVisible(page,'#sfDisplayLive .employee-pool-info>b'),false);
  assert.equal(await textVisible(page,'#sfDisplayLive .sf-week-shift-main small'),false);
  assert.equal(await textVisible(page,'#sfDisplayLive .sf-display-hours'),false);
  assert.equal(await textVisible(page,'#sfDisplayLive .sf-week-open'),true);
  assert.equal(await page.locator('#sfDisplayLive .sf-display-live-symbol').count(),0);
  assert.equal((await state(page)).storage,initial.storage);
  await page.locator('#sfSaveDisplay').click();
  assert.equal(await page.locator('#sfDisplayState').innerText(),'Darstellung gespeichert');
  const saved=JSON.parse((await state(page)).storage);assert.equal(saved.unrelated,'preserve');assert.equal(saved.highContrast,true);assert.equal(saved.showHours,false);
  assert.equal(await page.evaluate(()=>__writes),0,'appearance cannot change planning data');
  await page.screenshot({path:path.join(out,'display2-'+name+'-saved.png'),fullPage:true});
  await visible(page,'view-schedule');
  assert.equal(await textVisible(page,'#planEmployeePool .employee-pool-info>b'),false);
  assert.equal(await textVisible(page,'#sfWeekBoardV2 .sf-week-employee-info>b'),false);
  assert.equal(await textVisible(page,'#sfWeekBoardV2 .sf-week-employee-info>small'),false);
  assert.equal(await textVisible(page,'#planEmployeePool .sf-display-hours'),false);
  assert.equal(await textVisible(page,'#testTimeline .sf-display-person-name'),false);
  assert.equal(await textVisible(page,'#testTimeline>span'),false);
  assert.equal(await textVisible(page,'#sfWeekBoardV2 .sf-week-open'),true);
  assert.equal(await textVisible(page,'#sfWeekBoardV2 .sf-week-shift-count b'),true);
  assert.equal(await textVisible(page,'#sfWeekBoardV2 .sf-display-status-symbol'),false);
  await visible(page,'view-settings');await page.locator('[data-display-check="showHours"]').check();
  await page.locator('[data-setting-tab="account"]').click();await page.locator('[data-setting-tab="display"]').click();
  assert.equal(await page.locator('[data-display-check="showHours"]').isChecked(),true,'draft survives tab changes');
  assert.equal(await page.locator('#sfDisplayState').innerText(),'Ungespeicherte Änderungen');
  await page.locator('#sfResetDisplay').click();assert.equal(await page.locator('#sfFontSize').inputValue(),'normal');
  assert.equal(JSON.parse((await state(page)).storage).showHours,false,'reset is a draft until applied');
  await page.locator('#sfSaveDisplay').click();
  assert.deepEqual(JSON.parse((await state(page)).storage),{...savedStandard,unrelated:'preserve'});
  await visible(page,'view-schedule');
  assert.equal(await textVisible(page,'#planEmployeePool .employee-pool-info>b'),true);
  assert.equal(await textVisible(page,'#sfWeekBoardV2 .sf-week-employee-info>b'),true);
  assert.equal(await textVisible(page,'#sfWeekBoardV2 .sf-week-employee-info>small'),true);
  assert.equal(await textVisible(page,'#planEmployeePool .sf-display-hours'),true);
  assert.equal(await textVisible(page,'#sfWeekBoardV2 .sf-display-status-symbol'),true);
  assert.match(await page.locator('#planEmployeePool .sf-display-hours').innerText(),/SOLL 180 h · IST geplant 8 h/);
  await page.evaluate(()=>{window.SchichtFunkCalendarView={getPeriod:()=>({mode:'month',start:'2026-11-01',end:'2026-11-30'})};document.dispatchEvent(new Event('sf:schedule-period-changed'))});
  assert.match(await page.locator('#planEmployeePool .sf-display-hours').innerText(),/IST geplant 10 h/,'month context and overnight hours');
  await visible(page,'view-settings');
  await page.locator('[data-display-profile="overview"]').click();await page.locator('#sfSaveDisplay').click();
  assert.equal(await page.locator('#sfScheduleDensity').inputValue(),'compact');
  await page.reload();await page.locator('[data-setting-tab="display"]').click();
  assert.equal(await page.locator('#sfScheduleDensity').inputValue(),'compact','settings survive reload');
  assert.equal(await page.locator('[data-display-profile="overview"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-display-profile="readable"]').click();await page.locator('#sfSaveDisplay').click();
  const contrast=await page.locator('#sfDisplayLive .sf-week-shift').evaluate(el=>{const fg=getComputedStyle(el.querySelector('strong')).color,bg=getComputedStyle(el).backgroundColor;const lum=s=>{const a=s.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return a[0]*.2126+a[1]*.7152+a[2]*.0722};const a=lum(fg),b=lum(bg);return{fg,bg,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}});assert(contrast.ratio>=7,'high contrast ratio');
  const contrastSamples=await page.evaluate(()=>['#sfDisplayLive .sf-week-open','.sf-set-note','#view-schedule .employee-drag','#view-schedule .sf-week-open'].flatMap(sel=>{const e=document.querySelector(sel);if(!e)return[];const fg=getComputedStyle(e).color,bg=getComputedStyle(e).backgroundColor;const lum=s=>{const a=s.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return a[0]*.2126+a[1]*.7152+a[2]*.0722};const a=lum(fg),b=lum(bg);return[{sel,fg,bg,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}]}));assert(contrastSamples.every(s=>s.ratio>=7),JSON.stringify(contrastSamples));
  await page.locator('[data-display-check="highContrast"]').uncheck();assert.equal(await page.locator('#sfDisplayLive').getAttribute('data-contrast'),'false');assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('sf-display-high-contrast')),true,'draft contrast cannot apply globally');
  await page.locator('[data-display-check="highContrast"]').check();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');
  await page.locator('#sfDisplayPreviewLink').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'sfDisplayLiveTitle');
  const warning=await page.locator('#sfDisplayLive .sf-week-open').evaluate(e=>({color:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor,text:e.textContent}));assert(warning.color!==warning.bg,'warning must remain readable');
  await page.evaluate(()=>{document.querySelector('.main').scrollTo({top:0,behavior:'instant'});document.body.scrollTo({top:0,behavior:'instant'});window.scrollTo({top:0,behavior:'instant'})});
  await page.screenshot({path:path.join(out,'display2-'+name+'.png')});
  await page.evaluate(()=>{document.querySelector('.main').scrollTo({top:document.querySelector('.main').scrollHeight,behavior:'instant'});document.body.scrollTo({top:document.body.scrollHeight,behavior:'instant'});window.scrollTo({top:document.body.scrollHeight,behavior:'instant'})});
  const bar=await page.locator('.sf-display-actions').boundingBox();assert(bar.y>=0&&bar.y+bar.height<=950,'save bar stays in viewport');
  await page.screenshot({path:path.join(out,'display2-'+name+'-footer.png')});
  assert.deepEqual(errors,[]);reports.push({name,role,profiles:true,preview:true,draftIsolation:true,detailSwitches:true,monthHours:true,persistence:true,contrast,noPlanningWrites:true,noOverflow:true});await context.close();
 }
 await browser.close();fs.writeFileSync(path.join(out,'display2-results.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1});



