const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'../../',p),'utf8');
const index=read('index.html'),styles=[...index.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
const management=read('assets/employee-management-v2.js').replace(/\}\)\(\);\s*$/,'window.employeeCardFixture={init};})();');
test.use({video:'off',launchOptions:process.env.SF_EMPLOYEE_LAYOUT_BROWSER?{executablePath:process.env.SF_EMPLOYEE_LAYOUT_BROWSER}:{}});

async function fixture(page,theme,fontSize){
 const requests=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async r=>{requests.push(r.request().url());if(r.request().url()==='http://employee-layout.test/')await r.fulfill({contentType:'text/html',body:'<!doctype html><html><head></head><body></body></html>'});else await r.abort();});
 await page.goto('http://employee-layout.test/');
 await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="appShell"><div class="app"><aside class="sidebar">SchichtFunk</aside><header class="topbar">Personalverwaltung</header><main class="main"><div class="content"><section id="view-employees" class="view active"><div class="page-head"><div><h1>Mitarbeiter</h1><p>Stammdaten, Schichtfreigaben und Verfügbarkeit</p></div><button class="primary" id="addEmployeeBtn">Mitarbeiter anlegen</button></div><div class="panel-grid"></div></section></div></main></div></div>');
 await page.addStyleTag({content:styles});await page.addStyleTag({content:read('assets/employee-core-v1.css')});await page.addStyleTag({content:read('assets/manager-theme-v1.css')});
 await page.evaluate(({theme,fontSize})=>{document.documentElement.dataset.sfTheme=theme;document.documentElement.style.fontSize=fontSize+'px';document.documentElement.classList.toggle('sf-font-large',fontSize===17);},{theme,fontSize});
 await page.addScriptTag({content:`
 Object.defineProperty(document,'readyState',{get:()=> 'loading'});
 window.selectedEmployeeId=null;window.assignments=[];window.absences=[];window.timeEntries={};window.__writes=0;
 window.renderEmployees=()=>{};window.renderCalendar=()=>{};window.renderPlanEmployeePool=()=>{};window.updateStats=()=>{};window.showSaveToast=()=>{};window.saveAll=()=>__writes++;
 window.SFBackend={ready:true,companyId:'layout-fixture',role:'PLANNER'};
 window.TYPES=['FD','SD','ND','O1','O2','O3','OT1','OT2','OT3','OT','QA','TR','Teamleiter','Sonderdienst-Lang'].map(id=>({id,start:'06:00',end:'14:00'}));
 window.SFShiftModels={isCompanyLoaded:()=>true,activeCodes:()=>TYPES.map(x=>x.id),knownCodes:()=>TYPES.map(x=>x.id)};window.typeById=id=>TYPES.find(t=>t.id===id);window.employeeMonthlyTarget=e=>e.monthlyHours;
 window.employees=Array.from({length:28},(_,i)=>({id:'e'+i,first:i===0?'Alexandra-Maria Elisabeth':'Fiktive',last:i===0?'von Hohenlohe-Waldenburg-Schillingsfürst':'Testperson '+String(i).padStart(2,'0'),role:i===0?'Stellvertretende Einsatzleitung · Sicherheitsmitarbeiterin und Brandschutzbeauftragte':'Sicherheitsmitarbeiter',personnelNo:String(2000+i),team:'Objekt Nord & Süd · Sicherheitsdienst',planningTeam:i%3===0?'A':'',status:i>0&&i%5===0?'inactive':'active',availabilityStatus:['green','yellow','red'][i%3],weeklyHours:40,monthlyHours:180,employment:'Vollzeit',shifts:i===0?TYPES.map(t=>t.id):['FD'],qualifications:i===0?TYPES.map(t=>t.id):['FD'],rhythmMode:'off'}));
 const now=new Date(),month=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');window.assignments=Array.from({length:27},(_,i)=>({id:'a'+i,employeeId:'e0',type:'FD',date:month+'-'+String(i+1).padStart(2,'0')}));
 `});
 await page.addScriptTag({content:read('assets/employee-rhythm-v1.js')});await page.addScriptTag({content:management});await page.evaluate(()=>employeeCardFixture.init());
 await expect(page.locator('.sp-emp-row')).toHaveCount(28);
 return{requests,errors};
}

async function geometry(page){
 return page.evaluate(()=>{
  const issues=[],box=e=>e.getBoundingClientRect(),inside=(a,b)=>a.left>=b.left-1&&a.right<=b.right+1&&a.top>=b.top-1&&a.bottom<=b.bottom+1;
  const list=box(document.querySelector('.sp-emp-list-card')),profile=box(document.querySelector('.sp-emp-profile'));
  if(profile.left>list.left+1&&list.right>profile.left-1)issues.push('list and profile overlap');
  for(const el of document.querySelectorAll('.sp-emp-tools input,.sp-emp-tools select,.sp-emp-tools label,.sp-emp-qual-filter'))if(!inside(box(el),list))issues.push('filter exceeds list card: '+(el.id||el.className));
  const rows=[...document.querySelectorAll('.sp-emp-row')];
  for(const row of rows){
   const r=box(row);if(row.scrollWidth>row.clientWidth+1||row.scrollHeight>row.clientHeight+1)issues.push('card clips content: '+row.dataset.id);
   for(const el of row.querySelectorAll('.sp-emp-name,.sp-emp-role,.sp-emp-meta>span,.sp-q,.sp-emp-arrow')){
    if(getComputedStyle(el).display==='none')issues.push('card detail hidden: '+el.className);
    const range=document.createRange();range.selectNodeContents(el);for(const rect of range.getClientRects())if(!inside(rect,r))issues.push('text outside card: '+row.dataset.id+' '+el.className);
   }
  }
  const header=document.querySelector('.sp-profile-head');if(header){const h=box(header);for(const el of header.querySelectorAll('h2,p,.sp-availability')){const range=document.createRange();range.selectNodeContents(el);for(const r of range.getClientRects())if(!inside(r,h))issues.push('profile header clips text');}}
  const main=document.querySelector('.main');if(main.scrollWidth>main.clientWidth+1)issues.push('workspace has horizontal overflow');
  return{issues,rows:rows.length,listWidth:Math.round(list.width),cardHeights:rows.map(r=>Math.round(box(r).height))};
 });
}

for(const theme of ['dark','light'])for(const width of [1920,1440,1366,1180,1024,768,390,320])for(const fontSize of [16,24]){
 test(`employee cards ${theme} ${width}px text ${fontSize}px`,async({page},info)=>{
  await page.setViewportSize({width,height:960});const {requests,errors}=await fixture(page,theme,fontSize);
  const before=await geometry(page);expect(before.issues).toEqual([]);
  await page.locator('.sp-emp-row[data-id="e0"]').click();await expect(page.locator('.sp-profile-head h2')).toHaveText('Alexandra-Maria Elisabeth von Hohenlohe-Waldenburg-Schillingsfürst');
  await page.getByLabel('Suche',{exact:true}).fill('Hohenlohe');await expect(page.locator('.sp-emp-row')).toHaveCount(1);
  await expect(page.locator('.sp-emp-role')).toContainText('Brandschutzbeauftragte');await expect(page.locator('.sp-qual-set .sp-q')).toHaveCount(14);await expect(page.locator('.sp-emp-meta')).toContainText('27');
  await page.getByLabel('Status',{exact:true}).selectOption('inactive');await expect(page.locator('.sp-emp-row')).toHaveCount(0);await page.getByLabel('Status',{exact:true}).selectOption('active');
  await page.getByLabel('Verfügbarkeit',{exact:true}).selectOption('yellow');await expect(page.locator('.sp-emp-row')).toHaveCount(0);await page.getByLabel('Verfügbarkeit',{exact:true}).selectOption('green');
  await page.locator('#spEmpTeam').selectOption('__planning_A');await expect(page.locator('.sp-emp-row')).toHaveCount(1);await page.locator('[data-q="QA"]').click();await expect(page.locator('.sp-emp-row')).toHaveCount(1);
  const after=await geometry(page);expect(after.issues).toEqual([]);expect(errors).toEqual([]);expect(requests).toEqual(['http://employee-layout.test/']);expect(await page.evaluate(()=>__writes)).toBe(0);
  await info.attach('layout-measurements',{body:Buffer.from(JSON.stringify({before,after},null,2)),contentType:'application/json'});
  await page.screenshot({path:info.outputPath('employee-cards.png'),fullPage:true});
 });
}
