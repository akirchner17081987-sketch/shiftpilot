const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'../../',p),'utf8');
const index=read('index.html');
const timeModule=read('assets/supabase-time-tracking-v1.js').replace(/\}\)\(\);\s*$/,'window.kpiFixtureTime={render(rows){css();managerRows=rows;renderManagerRows();}};})();');
const section=id=>index.match(new RegExp('<section id="'+id+'"[\\s\\S]*?<\\/section>'))[0];
test.use({video:'off',launchOptions:process.env.SF_KPI_LAYOUT_BROWSER?{executablePath:process.env.SF_KPI_LAYOUT_BROWSER}:{}});

async function fixture(page,theme,fontSize){
 const requests=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/*',async r=>{requests.push(r.request().url());if(r.request().url()==='http://kpi-layout.test/')await r.fulfill({contentType:'text/html',body:'<!doctype html><html><head></head><body></body></html>'});else await r.abort();});
 await page.goto('http://kpi-layout.test/');
 await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="appShell"><div class="app"><aside class="sidebar">SchichtFunk</aside><header class="topbar">Kennzahlen</header><main class="main"><div class="content">'+section('view-time')+section('view-reports')+'<div id="dashboard-kpi-control" class="stat"><div class="stat-icon">◷</div><div><small>Geplante Dienste</small><strong>24</strong><em>Dashboard mit Symbol</em></div></div></div></main></div></div>');
 for(const m of index.matchAll(/<style[^>]*>([\s\S]*?)<\/style>|<link\b[^>]*rel="stylesheet"[^>]*>/g)){
  if(m[1]!==undefined)await page.addStyleTag({content:m[1]});
  else{const href=m[0].match(/href="([^"]+)"/)[1].split('?')[0].replace(/^\//,'');const tag=await page.addStyleTag({content:read(href)});if(href==='assets/manager-kpi-layout-v1.css')await tag.evaluate(el=>el.id='kpiLayoutFixtureCss');}
 }
 await page.evaluate(({theme,fontSize})=>{document.documentElement.dataset.sfTheme=theme;document.documentElement.style.fontSize=fontSize+'px';document.documentElement.classList.toggle('sf-font-large',fontSize===17);document.getElementById('view-time').classList.add('active');},{theme,fontSize});
 await page.addScriptTag({content:`
  Object.defineProperty(document,'readyState',{get:()=> 'loading'});
  window.SFBackend={role:'PLANNER',ready:false,companyId:'layout-only'};window.__writes=0;window.saveAll=()=>__writes++;
  window.employees=Array.from({length:24},(_,i)=>({id:'e'+i,first:'Fiktive',last:'Testperson '+i,status:'active',role:'Sicherheitsmitarbeiter',weeklyHours:40}));
  window.__fixtureEmployees=employees;window.TYPES=[{id:'FD',start:'06:00',end:'14:00'}];window.getSoll=()=>24;
  const monday=new Date();monday.setHours(12,0,0,0);monday.setDate(monday.getDate()-(monday.getDay()+6)%7);
  const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  window.assignments=employees.flatMap((e,j)=>Array.from({length:7},(_,i)=>{const d=new Date(monday);d.setDate(d.getDate()+i);return{id:e.id+'a'+i,employeeId:e.id,date:iso(d),type:'FD',start:'06:00',end:'14:00'};}));
  window.absences=[];window.timeEntries=Object.fromEntries(assignments.filter((a,i)=>i%2===0).map(a=>[a.id,{actualStart:'06:00',actualEnd:'14:00',breakMin:0,status:'confirmed'}]));
  window.__timeRows=assignments.map(a=>({assignment_id:a.id,employee_name:employees.find(e=>e.id===a.employeeId).first+' '+employees.find(e=>e.id===a.employeeId).last,shift_code:'FD',starts_at:a.date+'T06:00:00+02:00',ends_at:a.date+'T14:00:00+02:00',planned_break_minutes:0,actual_start:timeEntries[a.id]?a.date+'T06:00:00+02:00':null,actual_end:timeEntries[a.id]?a.date+'T14:00:00+02:00':null,actual_break_minutes:0,entry_status:timeEntries[a.id]?'confirmed':'open'}));
 `});
 await page.addScriptTag({content:timeModule});
 await page.evaluate(()=>{window.renderTimeTracking=()=>kpiFixtureTime.render(__timeRows);renderTimeTracking();});
 await page.addScriptTag({content:read('assets/reports-final-v1.js')});
 await page.evaluate(()=>renderReports());
 await expect(page.locator('#timeStats>.stat')).toHaveCount(4);
 await expect(page.locator('#reportStats>.stat')).toHaveCount(6);
 return{requests,errors};
}

async function geometry(page,id){
 return page.evaluate(id=>{
  const issues=[],stats=document.getElementById(id),outer=stats.getBoundingClientRect(),cards=[...stats.querySelectorAll(':scope>.stat')],measurements=[];
  for(const card of cards){
   const r=card.getBoundingClientRect(),body=card.firstElementChild,b=body.getBoundingClientRect(),css=getComputedStyle(card),expectedWidth=card.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight);
   if(Math.abs(b.width-expectedWidth)>1)issues.push('metric text does not use full card width');
   if(r.width<1||r.left<outer.left-1||r.right>outer.right+1)issues.push('metric outside its workspace');
   if(body.scrollWidth>body.clientWidth+1||card.scrollWidth>card.clientWidth+1||card.scrollHeight>card.clientHeight+1)issues.push('metric content overflows');
   const fields=[...body.querySelectorAll('small,strong,em')];let previousBottom=b.top;
   for(const el of fields){
    const e=el.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);const rects=[...range.getClientRects()],lines=new Set(rects.map(x=>Math.round(x.top))).size;
    if(e.top<previousBottom-1)issues.push('metric fields overlap');previousBottom=e.bottom;
    if(lines>2)issues.push('metric wraps over many lines: '+el.textContent);
    for(const t of rects)if(t.left<b.left-1||t.right>b.right+1||t.top<r.top-1||t.bottom>r.bottom+1)issues.push('metric text clipped: '+el.textContent);
   }
   measurements.push({label:fields[0].textContent,cardWidth:r.width,contentWidth:b.width,value:fields[1].textContent,height:r.height});
  }
  for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++){const a=cards[i].getBoundingClientRect(),b=cards[j].getBoundingClientRect();if(a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1)issues.push('metric cards overlap');}
  return{issues,measurements};
 },id);
}

for(const theme of ['dark','light'])for(const width of [1920,1440,1366,1180,1024,768,390,320])for(const fontSize of [16,17,24]){
 test(`metrics ${theme} ${width}px text ${fontSize}px`,async({page},info)=>{
  await page.setViewportSize({width,height:960});const {requests,errors}=await fixture(page,theme,fontSize);
  if(theme==='dark'&&width===1366&&fontSize===16){
   await page.evaluate(()=>document.getElementById('kpiLayoutFixtureCss').disabled=true);
   const oldWidth=await page.locator('#timeStats>.stat>div').first().evaluate(el=>el.getBoundingClientRect().width);expect(oldWidth).toBeCloseTo(42,0);
   await page.evaluate(()=>document.getElementById('kpiLayoutFixtureCss').disabled=false);
  }
  const time=await geometry(page,'timeStats');expect(time.issues).toEqual([]);
  await page.locator('#timeStats').screenshot({path:info.outputPath('time-metrics.png')});
  await page.locator('#timeSearch').fill('keine-fiktiven-treffer');await expect(page.locator('#timeStats strong').first()).toHaveText('0,0');expect((await geometry(page,'timeStats')).issues).toEqual([]);
  await page.locator('#timeSearch').fill('');await expect(page.locator('#timeStats strong').first()).toHaveText('1.344,0');
  await page.evaluate(()=>{document.getElementById('view-time').classList.remove('active');document.getElementById('view-reports').classList.add('active');renderReports();});
  const reports=await geometry(page,'reportStats');expect(reports.issues).toEqual([]);
  await page.locator('#reportStats').screenshot({path:info.outputPath('report-metrics.png')});
  await page.locator('[data-rp-period="month"]').click();await expect(page.locator('#reportStats>.stat')).toHaveCount(6);expect((await geometry(page,'reportStats')).issues).toEqual([]);
  await page.evaluate(()=>{employees=[];renderReports();});await expect(page.locator('#reportStats strong').first()).toHaveText('0,0');expect((await geometry(page,'reportStats')).issues).toEqual([]);
  expect(await page.locator('#dashboard-kpi-control').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ')[0])).toBe('42px');
  expect(errors).toEqual([]);expect(requests).toEqual(['http://kpi-layout.test/']);expect(await page.evaluate(()=>__writes)).toBe(0);
  await info.attach('metric-measurements',{body:Buffer.from(JSON.stringify({time,reports},null,2)),contentType:'application/json'});
 });
}
