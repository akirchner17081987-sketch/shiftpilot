const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'../../',p),'utf8');
const index=read('index.html');
const section=id=>index.match(new RegExp('<section id="'+id+'"[\\s\\S]*?<\\/section>'))[0];
const styles=[...index.matchAll(/<style[^>]*>([\s\S]*?)<\/style>|<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(m=>{
 if(m[1]!==undefined)return '<style>'+m[1]+'</style>';
 const p=m[0].match(/href="([^"]+)"/)[1].split('?')[0].replace(/^\//,'');
 return '<style'+(p==='assets/manager-schedule-time-layout-v1.css'?' id="workspaceLayoutCss"':'')+'>'+read(p)+'</style>';
}).join('\n');
const fakeData=`
 window.SFBackend={role:'PLANNER',ready:false,companyId:'fictitious-layout'};
 window.__writes=0;window.__refreshes=[];window.saveAll=()=>__writes++;
 window.iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 window.addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};
 window.weekStart=new Date('2026-10-05T12:00:00');
 window.currentWeekDates=()=>Array.from({length:7},(_,i)=>addDays(weekStart,i));
 window.TYPES=[{id:'O1',start:'06:00',end:'14:00',cls:'blue'},
  {id:'Teamleiter',start:'06:00',end:'14:00',cls:'amber'},
  {id:'Nachtdienst Objektschutz Nord',start:'22:00',end:'06:00',cls:'teal'},
  {id:'Objektschutz-Leitstelle Sonderdienst',start:'14:00',end:'22:00',cls:'violet'}];
 window.typeById=id=>TYPES.find(t=>t.id===id);
 window.getSoll=(date,id)=>id==='O1'?12:id==='Teamleiter'?3:1;
 window.employees=[{id:'e1',first:'Fiktive',last:'Testperson Nord',status:'active'},
  {id:'e2',first:'Fiktive',last:'Testperson Süd',status:'active'},
  {id:'e3',first:'Fiktive',last:'Testperson Fernwarte',status:'active'}];
 window.assignments=currentWeekDates().flatMap(d=>TYPES.flatMap((t,i)=>Array.from({length:i===0?2:1},(_,j)=>({id:iso(d)+i+j,employeeId:employees[(i+j)%3].id,date:iso(d),type:t.id,start:t.start,end:t.end,publishedAt:'2026-10-01T00:00:00Z'}))));
 window.assignmentsFor=(date,id)=>assignments.filter(a=>a.date===date&&a.type===id);
 window.SFShiftModels={coverageInfo:(date,id)=>id==='Teamleiter'?{label:'Gemeinsame Leitung Nord / Süd',target:3,filled:1,missing:2,coveredCodes:['Teamleiter']}:null};
 window.absences=[];window.timeEntries={};window.renderCalendar=()=>{};window.updateStats=()=>{};
 window.renderTimeTracking=()=>{__refreshes.push('entries');};
 SFBackend.timeAccounts={refreshManager:async()=>{__refreshes.push('account');}};
 SFBackend.qrTerminalAdmin={refresh:async()=>{__refreshes.push('terminals');}};
 SFBackend.qrIndependentReport={refresh:async()=>{__refreshes.push('qr-report');}};
`;
const script=s=>'<script>'+s.replace(/<\/script/gi,'<\\/script')+'</script>';
const body='<div id="appShell" class="app"><aside class="sidebar">SchichtFunk</aside><header class="topbar">Layoutprüfung</header><main class="main"><div class="content">'
 +section('view-schedule')+section('view-time')+'</div></main></div>';
const html='<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+styles+'</head><body>'+body+script(fakeData)
 +['assets/schedule-week-board-v2-phase1.js','assets/schedule-readability-v1.js','assets/time-workspace-v2.js','assets/time-month-picker-v1.js'].map(p=>script(read(p))).join('\n')
 +script(`document.addEventListener('DOMContentLoaded',()=>{
  const view=document.getElementById('view-time');
  for(const [id,text] of [['sfTimeAccounts','Fiktives Stundenkonto'],['sfQrTerminalAdmin','Fiktive QR-Terminals'],['sfQrIndependentReport','Fiktive QR-Buchungen']]){
   const panel=document.createElement('div');panel.id=id;panel.className='card';panel.textContent=text;view.appendChild(panel);
  }
 });`)+ '</body></html>';
test.use({video:'off',launchOptions:process.env.SF_WORKSPACE_LAYOUT_BROWSER?{executablePath:process.env.SF_WORKSPACE_LAYOUT_BROWSER}:{}});

async function fixture(page,theme,fontSize,role='PLANNER'){
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/*',async r=>{requests.push(r.request().url());if(r.request().url()==='http://workspace-layout.test/')await r.fulfill({contentType:'text/html',body:html.replace("role:'PLANNER'","role:'"+role+"'")});else await r.abort();});
 await page.goto('http://workspace-layout.test/');
 await page.evaluate(({theme,fontSize})=>{document.documentElement.dataset.sfTheme=theme;document.documentElement.style.fontSize=fontSize+'px';document.documentElement.classList.toggle('sf-font-large',fontSize===17);},{theme,fontSize});
 await expect(page.locator('#sfTimeWorkspaceTabs button')).toHaveCount(3);
 await expect(page.locator('#sfTimePeriodControls')).toHaveCount(1);
 return{errors,requests};
}
async function show(page,id){await page.evaluate(id=>document.querySelectorAll('#appShell .view').forEach(v=>v.classList.toggle('active',v.id===id)),id);}
async function scheduleGeometry(page){
 return page.evaluate(()=>{
  const issues=[],measurements=[];
  for(const card of document.querySelectorAll('#sfWeekBoardV2 .sf-week-shift:not(.is-inactive)')){
   const head=card.querySelector('.sf-week-shift-head'),name=head.querySelector('strong'),time=head.querySelector('small'),badge=head.querySelector('.sf-week-shift-count b');
   const box=head.getBoundingClientRect(),fields=[name,time,badge];let previousBottom=box.top;
   for(const el of fields){const r=el.getBoundingClientRect(),css=getComputedStyle(el),range=document.createRange();range.selectNodeContents(el);
    if(css.textOverflow==='ellipsis'||css.whiteSpace==='nowrap')issues.push('shift field can be abbreviated: '+el.textContent);
    if(r.top<previousBottom-1)issues.push('shift fields overlap: '+card.dataset.type);previousBottom=r.bottom;
    if(el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1)issues.push('shift field overflows: '+el.textContent);
    for(const t of range.getClientRects())if(t.left<box.left-1||t.right>box.right+1||t.top<box.top-1||t.bottom>box.bottom+1)issues.push('shift text outside header: '+el.textContent);
   }
   if(name.textContent!==card.dataset.type)issues.push('shift name differs from complete code');
   measurements.push({name:name.textContent,time:time.textContent,staffing:badge.textContent,width:box.width});
  }
  return{issues,measurements};
 });
}
async function tabsGeometry(page){
 return page.evaluate(()=>{
  const view=document.getElementById('view-time'),head=view.querySelector('.page-head'),tabs=document.getElementById('sfTimeWorkspaceTabs'),r=head.getBoundingClientRect(),t=tabs.getBoundingClientRect(),issues=[];
  if(head.scrollWidth>head.clientWidth+1)issues.push('time header overflows');
  if(t.left<r.left-1||t.right>r.right+1)issues.push('tabs outside time header');
  for(const other of head.children)if(other!==tabs&&other.getBoundingClientRect().height&&other.getBoundingClientRect().bottom>t.top-1)issues.push('tabs do not have a separate row');
  const buttons=[...tabs.querySelectorAll('button')],measurements=[];
  for(const b of buttons){const x=b.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(b);
   if(x.left<t.left-1||x.right>t.right+1)issues.push('tab outside tab list: '+b.textContent);
   if(b.scrollWidth>b.clientWidth+1||b.scrollHeight>b.clientHeight+1)issues.push('tab label overflows: '+b.textContent);
   for(const q of range.getClientRects())if(q.left<x.left-1||q.right>x.right+1||q.top<x.top-1||q.bottom>x.bottom+1)issues.push('tab text outside button');
   measurements.push({label:b.textContent,width:x.width,height:x.height});
  }
  for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++){const a=buttons[i].getBoundingClientRect(),b=buttons[j].getBoundingClientRect();if(a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1)issues.push('tabs overlap');}
  return{issues,measurements,headerWidth:r.width,tabsWidth:t.width};
 });
}

for(const theme of ['dark','light'])for(const width of [1920,1366,1363,1024,768,390,320])for(const fontSize of [16,17,24]){
 test(`schedule and time ${theme} ${width}px text ${fontSize}px`,async({page},info)=>{
  await page.setViewportSize({width,height:960});const {errors,requests}=await fixture(page,theme,fontSize);
  const modes=[];
  for(const mode of ['compact','board']){
   await page.locator('[data-sf-week-mode="'+mode+'"]').click();const data=await scheduleGeometry(page);
   expect(data.measurements.length).toBe(28);expect(data.issues).toEqual([]);modes.push({mode,...data});
   await page.locator('.sf-week-shift[data-type="Objektschutz-Leitstelle Sonderdienst"]').first().screenshot({path:info.outputPath('shift-'+mode+'.png')});
  }
  const last=page.locator('#sfWeekBoardV2 .sf-week-shift').last().locator('button').first();await last.focus();
  await info.attach('last-column-focus',{body:Buffer.from(JSON.stringify(await last.evaluate(el=>{
   const a=el.getBoundingClientRect(),wrap=document.getElementById('sfWeekBoardV2'),b=wrap.getBoundingClientRect();
   return{button:{left:a.left,right:a.right,width:a.width},wrap:{left:b.left,right:b.right,width:b.width,scrollLeft:wrap.scrollLeft,clientWidth:wrap.clientWidth,scrollWidth:wrap.scrollWidth},focused:document.activeElement===el};
  }),null,2)),contentType:'application/json'});
  expect(await last.evaluate(el=>{const a=el.getBoundingClientRect(),b=document.getElementById('sfWeekBoardV2').getBoundingClientRect();return a.left>=b.left-1&&a.right<=b.right+1;})).toBe(true);
  const previous=page.locator('#sfWeekBoardV2 .sf-week-shift').nth(26).locator('button').first();await previous.focus();await page.keyboard.press('Tab');await expect(last).toBeFocused();
  expect(await last.evaluate(el=>{const a=el.getBoundingClientRect(),b=document.getElementById('sfWeekBoardV2').getBoundingClientRect();return a.left>=b.left-1&&a.right<=b.right+1;})).toBe(true);
  await show(page,'view-time');
  for(const period of ['day','week','month','custom']){await page.locator('#timePeriod').selectOption(period);expect((await tabsGeometry(page)).issues).toEqual([]);}
  const tabs=await tabsGeometry(page);await page.locator('#view-time .page-head').screenshot({path:info.outputPath('time-header.png')});
  const entries=page.locator('[data-time-mode="entries"]'),account=page.locator('[data-time-mode="account"]'),qr=page.locator('[data-time-mode="qr"]');
  await entries.focus();await page.keyboard.press('Tab');await expect(account).toBeFocused();await page.keyboard.press('Enter');await expect(account).toHaveAttribute('aria-selected','true');
  await expect(page.locator('#sfTimeAccounts')).toBeVisible();await expect(page.locator('#sfTimePeriodControls')).toBeHidden();expect((await tabsGeometry(page)).issues).toEqual([]);
  await page.keyboard.press('Tab');await expect(qr).toBeFocused();await page.keyboard.press('Enter');await expect(qr).toHaveAttribute('aria-selected','true');
  await expect(page.locator('#sfQrTerminalAdmin')).toBeVisible();expect((await tabsGeometry(page)).issues).toEqual([]);
  await entries.click();await expect(entries).toHaveAttribute('aria-selected','true');await expect(page.locator('#sfTimePeriodControls')).toBeVisible();
  expect(await page.evaluate(()=>__refreshes)).toEqual(expect.arrayContaining(['account','terminals','qr-report','entries']));
  expect(errors).toEqual([]);expect(requests).toEqual(['http://workspace-layout.test/']);expect(await page.evaluate(()=>__writes)).toBe(0);
  await info.attach('workspace-measurements',{body:Buffer.from(JSON.stringify({modes,tabs},null,2)),contentType:'application/json'});
 });
}

for(const role of ['OWNER','TIME_TRACKING'])test(`time tabs respect ${role} access`,async({page})=>{
 await page.setViewportSize({width:390,height:960});const {errors,requests}=await fixture(page,'light',24,role);await show(page,'view-time');
 const entries=page.locator('[data-time-mode="entries"]'),account=page.locator('[data-time-mode="account"]'),qr=page.locator('[data-time-mode="qr"]');
 if(role==='TIME_TRACKING'){
  await expect(account).toBeDisabled();await expect(qr).toHaveText('QR-Erfassung');await entries.focus();await page.keyboard.press('Tab');await expect(qr).toBeFocused();
 }else{await expect(account).toBeEnabled();await expect(qr).toHaveText('QR-Terminals');await qr.focus();}
 await page.keyboard.press('Enter');await expect(qr).toHaveAttribute('aria-selected','true');expect((await tabsGeometry(page)).issues).toEqual([]);
 const calls=await page.evaluate(()=>__refreshes);expect(calls).toContain('qr-report');expect(calls.includes('terminals')).toBe(role!=='TIME_TRACKING');
 expect(errors).toEqual([]);expect(requests).toEqual(['http://workspace-layout.test/']);expect(await page.evaluate(()=>__writes)).toBe(0);
});
