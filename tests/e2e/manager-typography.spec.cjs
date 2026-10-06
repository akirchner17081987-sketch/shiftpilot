const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'../../',p),'utf8');
const index=read('index.html');
const section=id=>index.match(new RegExp('<section id="'+id+'"[\\s\\S]*?<\\/section>'))[0];
const timeModule=read('assets/supabase-time-tracking-v1.js').replace(/\}\)\(\);\s*$/,'window.typographyTime={render(rows){css();managerRows=rows;renderManagerRows();}};})();');
const styles=[...index.matchAll(/<style[^>]*>([\s\S]*?)<\/style>|<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(m=>{
 if(m[1]!==undefined)return '<style>'+m[1]+'</style>';
 const p=m[0].match(/href="([^"]+)"/)[1].split('?')[0].replace(/^\//,'');
 return '<style'+(p==='assets/manager-typography-v1.css'?' id="typographyCss"':'')+'>'+read(p)+'</style>';
}).join('\n');
const scripts=['assets/settings-management-v2.js','assets/schedule-week-board-v2-phase1.js',
 'assets/schedule-readability-v1.js','assets/schedule-month-view-v1.js',
 'assets/reports-final-v1.js','assets/today-dashboard-v2.js'].map(read);
const fakeData=`
 window.SFBackend={role:'PLANNER',ready:false,companyId:'fictitious-typography',account(){}};
 window.__writes=0;window.saveAll=()=>__writes++;window.showSaveToast=()=>{};
 window.iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 window.addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};
 window.weekStart=new Date();weekStart.setHours(12,0,0,0);weekStart.setDate(weekStart.getDate()-(weekStart.getDay()+6)%7);
 window.currentWeekDates=()=>Array.from({length:7},(_,i)=>addDays(weekStart,i));
 window.DAYS=[];window.globalSoll={O1:2,O3:2,Teamleiter:1};window.dailySoll={};
 window.TYPES=[{id:'O1',name:'Objektschutz',start:'06:00',end:'14:00',cls:'blue'},
  {id:'O3',name:'Spätdienst',start:'14:00',end:'22:00',cls:'teal'},
  {id:'Teamleiter',name:'Teamleitung',start:'06:00',end:'14:00',cls:'amber'}];
 window.typeById=id=>TYPES.find(t=>t.id===id);window.getSoll=(date,id)=>globalSoll[id]||0;
 window.employees=[{id:'e1',first:'Fiktive',last:'Testperson Nord',status:'active',role:'Sicherheitsmitarbeiter',weeklyHours:40},
  {id:'e2',first:'Fiktive',last:'Testperson Süd',status:'active',role:'Teamleitung',weeklyHours:40}];
 window.assignments=currentWeekDates().flatMap(d=>TYPES.map((t,i)=>({id:iso(d)+t.id,employeeId:i===1?'e2':'e1',date:iso(d),type:t.id,start:t.start,end:t.end,publishedAt:'2026-01-01T00:00:00Z'})));
 window.assignmentsFor=(date,id)=>assignments.filter(a=>a.date===date&&a.type===id);
 window.absences=[];window.timeEntries={};window.renderCalendar=()=>{};window.updateStats=()=>{};
 window.__timeRows=assignments.map((a,i)=>({assignment_id:a.id,employee_name:employees.find(e=>e.id===a.employeeId).first+' '+employees.find(e=>e.id===a.employeeId).last,employee_note:'Fiktiver Prüfhinweis',shift_code:a.type,
  starts_at:a.date+'T'+a.start+':00+02:00',ends_at:a.date+'T'+a.end+':00+02:00',planned_break_minutes:0,
  actual_start:i%2?a.date+'T'+a.start+':00+02:00':null,actual_end:i%2?a.date+'T'+a.end+':00+02:00':null,actual_break_minutes:0,entry_status:i%2?'confirmed':'open'}));
`;
const body='<div id="appShell" class="app"><aside class="sidebar"><div class="nav-group-label">Planung</div></aside><header class="topbar">SchichtFunk</header><main class="main"><div class="content">'
 +'<section id="view-overview" class="view active"></section>'
 +section('view-settings')+section('view-time')+section('view-reports')+section('view-schedule')
 +'</div></main></div><div id="landing-control"><small style="font-size:10px">Öffentliche Seite</small></div><div id="sfEmployeePortal"><em style="font-size:11px">Portal-Kontrolle</em></div>';
const script=source=>'<script>'+source.replace(/<\/script/gi,'<\\/script')+'</script>';
const html='<!doctype html><html lang="de"><head><meta name="viewport" content="width=device-width,initial-scale=1">'+styles+'</head><body>'+body
 +script(fakeData)+script(timeModule)+scripts.map(script).join('\n')
 +script(`document.addEventListener('DOMContentLoaded',()=>{
   window.renderTimeTracking=()=>typographyTime.render(__timeRows);renderTimeTracking();
   document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-overview'));
 });`)+ '</body></html>';
test.use({video:'off',launchOptions:process.env.SF_TYPOGRAPHY_BROWSER?{executablePath:process.env.SF_TYPOGRAPHY_BROWSER}:{}});

async function fixture(page,theme){
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/*',async r=>{requests.push(r.request().url());if(r.request().url()==='http://typography.test/')await r.fulfill({contentType:'text/html',body:html});else await r.abort();});
 await page.goto('http://typography.test/');
 await page.evaluate(theme=>document.documentElement.dataset.sfTheme=theme,theme);
 await expect(page.locator('.td-kpi')).toHaveCount(6);
 return{errors,requests};
}
async function show(page,id){await page.evaluate(id=>document.querySelectorAll('#appShell .view').forEach(v=>v.classList.toggle('active',v.id===id)),id);}
async function setSize(page,value){
 await show(page,'view-settings');await page.locator('[data-setting-tab="display"]').click();
 await page.locator('#sfFontSize').selectOption(value);await page.locator('#sfSaveDisplay').click();
 await expect(page.locator('html')).toHaveClass(value==='large'?/sf-font-large/:/^(?!.*sf-font-large).*$/);
 await show(page,'view-overview');
}
async function measure(page,selector,minFont,checkGeometry=true){
 const data=await page.locator(selector).evaluateAll((els,{minFont,checkGeometry})=>{
  const issues=[],measurements=[];
  for(const el of els){
   const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;
   const css=getComputedStyle(el),size=parseFloat(css.fontSize);measurements.push({text:el.textContent.trim(),size});
   if(size<minFont-.02)issues.push('too small: '+el.textContent+' '+size);
   if(checkGeometry){
    const range=document.createRange();range.selectNodeContents(el);
    for(const t of range.getClientRects())if(t.left<r.left-1||t.right>r.right+1||t.top<r.top-1||t.bottom>r.bottom+1)issues.push('text outside its box: '+el.textContent);
    let scrollX=false,scrollY=false;
    for(let p=el.parentElement;p&&p.id!=='appShell';p=p.parentElement){const c=getComputedStyle(p),b=p.getBoundingClientRect();
     if(['auto','scroll'].includes(c.overflowX)&&p.scrollWidth>p.clientWidth)scrollX=true;
     if(['auto','scroll'].includes(c.overflowY)&&p.scrollHeight>p.clientHeight)scrollY=true;
     if(!scrollX&&['hidden','clip'].includes(c.overflowX)&&(r.left<b.left-1||r.right>b.right+1))issues.push('text clipped horizontally: '+el.textContent);
     if(!scrollY&&['hidden','clip'].includes(c.overflowY)&&(r.top<b.top-1||r.bottom>b.bottom+1))issues.push('text clipped vertically: '+el.textContent);
    }
   }
  }
  return{issues,measurements};
 },{minFont,checkGeometry});
 expect(data.measurements.length,'visible samples for '+selector).toBeGreaterThan(0);expect(data.issues).toEqual([]);return data.measurements;
}

for(const theme of ['dark','light'])for(const width of [1920,1366,1180,768,390,320])for(const size of ['normal','large','150%']){
 test(`manager text ${theme} ${width}px ${size}`,async({page},info)=>{
  await page.setViewportSize({width,height:1000});const {errors,requests}=await fixture(page,theme);
  if(theme==='dark'&&width===1366&&size==='normal'){
   await page.evaluate(()=>document.getElementById('typographyCss').disabled=true);
   expect(await page.locator('.td-kpi em').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBe(9);
   await page.evaluate(()=>document.getElementById('typographyCss').disabled=false);
  }
  await setSize(page,size==='large'?'large':'normal');
  if(size==='150%')await page.evaluate(()=>document.documentElement.style.fontSize='24px');
  const root=size==='large'?17:size==='150%'?24:16,note=root*.875,secondary=root*.8125;
  const today=await measure(page,'.td-kpi em,.td-card-head p,.td-row small,.td-autopilot p,.td-status',note);
  const kpis=await measure(page,'.td-kpi em',note);
  await measure(page,'.td-pill,.td-cov b,.td-cov span',secondary);
  await page.locator('#view-overview').screenshot({path:info.outputPath('today-text.png')});
  await page.evaluate(()=>renderTodayDashboard(false));expect(await measure(page,'.td-kpi em',note)).toEqual(kpis);
  await show(page,'view-time');await measure(page,'#timeStats .stat em',note);await measure(page,'.sf-time-status,.sf-time-action',secondary);
  await show(page,'view-reports');await measure(page,'#reportStats .stat em,.sf-rp-card-head p',note);await measure(page,'.sf-rp-state',secondary);
  await show(page,'view-schedule');await page.evaluate(()=>SchichtFunkCalendarView.setMonth('2026-10'));
  await measure(page,'.sf-month-date small,.sf-month-shift,.sf-month-open,.sf-month-empty',secondary);
  await page.locator('#sfMonthView').screenshot({path:info.outputPath('calendar-text.png')});
  await page.evaluate(()=>SchichtFunkCalendarView.setMode('week'));
  await measure(page,'.sf-week-day-coverage,.sf-week-shift-main small,.sf-week-employee-info small',secondary);
  await page.locator('#sfWeekBoardV2').screenshot({path:info.outputPath('week-text.png')});
  await show(page,'view-settings');await page.locator('[data-setting-tab="display"]').click();await measure(page,'.sf-set-note',note);
  expect(await page.locator('#landing-control small').evaluate(el=>getComputedStyle(el).fontSize)).toBe('10px');
  expect(await page.locator('#sfEmployeePortal em').evaluate(el=>getComputedStyle(el).fontSize)).toBe('11px');
  expect(errors).toEqual([]);expect(requests).toEqual(['http://typography.test/']);expect(await page.evaluate(()=>__writes)).toBe(0);
  await info.attach('text-sizes',{body:Buffer.from(JSON.stringify({rootFont:root,today},null,2)),contentType:'application/json'});
 });
}

test('Größer applies, survives a reload and returns to Standard',async({page})=>{
 const {errors,requests}=await fixture(page,'dark');
 await setSize(page,'normal');const normal=await measure(page,'.td-kpi em',14);
 await setSize(page,'large');const large=await measure(page,'.td-kpi em',14.875);
 expect(large.every((x,i)=>x.size>normal[i].size)).toBe(true);
 await page.reload();await expect(page.locator('html')).toHaveClass(/sf-font-large/);
 expect(await measure(page,'.td-kpi em',14.875)).toEqual(large);
 await setSize(page,'normal');expect(await measure(page,'.td-kpi em',14)).toEqual(normal);
 expect(JSON.parse(await page.evaluate(()=>localStorage.getItem('sp_settings_v2'))).fontSize).toBe('normal');
 expect(errors).toEqual([]);expect(requests).toEqual(['http://typography.test/','http://typography.test/']);expect(await page.evaluate(()=>__writes)).toBe(0);
});
