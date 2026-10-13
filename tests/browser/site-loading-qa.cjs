// The shipped page and real integrations, with isolated authentication/data boundaries.
// Executed only on the GitHub Actions runner; no real credentials or data mutations.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'test-results/site-loading'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),base=process.env.SF_SITE_LOADING_BASE;
const originals=new Map();if(base){for(const p of execFileSync('git',['diff','--name-only',base,'HEAD'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(p=>p.endsWith('.html')||p.startsWith('assets/'))){try{originals.set(p,execFileSync('git',['show',base+':'+p],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}))}catch{}}}
const source=(v,p)=>v==='baseline'&&originals.has(p)?originals.get(p):read(p);
const auth=String.raw`
(()=>{const B=window.SFBackend=window.SFBackend||{},emptyEmployee=()=>({company:{id:'qa',name:'QA Unternehmen',timezone:'Europe/Berlin'},employee:{id:'qa-employee',first_name:'Vorname',last_name:'Nachname',personnel_no:'1001',status:'active',weekly_hours:40,employment:'Vollzeit'},shifts:[],changes:[],requests:[],absence_requests:[],absences:[],marketplace:[],swap_requests:[],notifications:[],templates:[],incidents:[]});
B.ready=false;B.role=null;B.companyTimeZone='Europe/Berlin';B.loginOnly=true;B.hasLegacy=false;B.showLoading=()=>{};B.hideLoading=()=>{};B.updateState=()=>{};B.clearLegacy=()=>{};B.baseOpenApp=window.openApp;B.authDialog=()=>{};B.closeAuth=()=>{};B.boot=async()=>{};
const client={from(table){let single=false;let q;q=new Proxy({},{get(_,key){if(key==='then')return resolve=>resolve({data:single?{id:'qa',name:'QA Unternehmen',timezone:'Europe/Berlin'}:[],error:null});return(...args)=>{if(['insert','update','delete','upsert'].includes(key)){qa.writes.push(table+':'+key);throw Error('Fixture rejects writes')}if(['single','maybeSingle'].includes(key))single=true;return q}}});return q},async rpc(name,args){qa.rpcs.push(name);if(!/^(manager_|employee_|list_|get_|read_)/.test(name))throw Error('Fixture rejects RPC '+name);if(name==='manager_today_workspace')return{data:qa.today,error:null};if(name==='employee_portal_overview')return{data:emptyEmployee(),error:null};return{data:[],error:null}},channel(){const c={on:()=>c,subscribe:()=>c,unsubscribe:()=>{}};return c},removeChannel(){},auth:{getSession:async()=>({data:{session:null},error:null}),getUser:async()=>({data:{user:B.user},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal2',nextLevel:'aal2'},error:null}),listFactors:async()=>({data:{all:[{id:'qa-totp',factor_type:'totp',status:'verified'}],totp:[{id:'qa-totp',factor_type:'totp',status:'verified'}]},error:null})}}};
B.init=async()=>{qa.initMs=performance.now()-qa.start;qa.initParsed=!!document.getElementById('qaParsed');qa.globals=['SFShiftModels','SFAutoPlanWorkspace','SFHelpContent','SFToday','SFReports','SFWishPlanning','SFStaffingSimulator','SFHandover'].filter(k=>!!window[k]);if(qa.role==='SIGNED_OUT'){qa.done=true;return}
B.client=client;B.ensureCompany=async()=>{B.role=qa.role;B.accessRole=({PLANNER:'TEAM_LEAD',DISPATCHER:'TEAM_LEAD',VIEWER:'TEAM_LEAD',TIME_TRACKING:'EMPLOYEE'})[qa.role]||qa.role;B.accessPermissions=qa.role==='VIEWER'?['read_only']:qa.role==='TIME_TRACKING'?['manage_time','confirm_time']:['PLANNER','DISPATCHER'].includes(qa.role)?['publish_schedule','manage_time','confirm_time']:[];B.companyId='qa';B.companyMemberships=[{company_id:'qa',role:qa.role}];};B.importLegacy=async()=>{};B.installStoreBridge=()=>{};B.installComplianceBridge=()=>{};
B.hydrate=B.hydrateTimeOnly=async()=>{employees=[];assignments=[];absences=[];globalSoll={};dailySoll={};if(B.beginStartup){await new Promise(r=>setTimeout(r,250));qa.startup={shellVisible:getComputedStyle(document.getElementById('appShell')).display!=='none',ready:B.ready,shellReady:B.shellReady,entryDismissed:document.getElementById('sfEntryOverlay')?.classList.contains('sf-entry-out')||!document.getElementById('sfEntryOverlay'),viewInert:document.querySelector('#appShell .view').inert,status:!!document.getElementById('sfStartupStatus')};}};B.hydrateEmployee=async()=>{B.employeeDbId='qa-employee';B.employeePortalData=emptyEmployee()};await B.boot({user:{id:'qa-user',email:'qa@example.invalid'}});if(qa.role!=='EMPLOYEE')B.baseOpenApp(qa.role==='TIME_TRACKING'?'time':'overview');qa.done=true;};
})();`;
let server,browser,qaPage;
async function main(){fs.mkdirSync(out,{recursive:true});const counters=new Map(),fixtures=require('../fixtures/today-data.cjs'),today=fixtures.fixture();today.company_id='qa';today.company_name='SchichtFunk · Designvorschau';today.assignments=[fixtures.assignment('qa-aa','a'),fixtures.assignment('qa-ab','b')];today.qr=[fixtures.booking('qa-qa','a'),fixtures.booking('qa-qb','b','2026-10-10T09:00:00Z')];
 server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),referer=new URL(req.headers.referer||'http://localhost/?variant=current'),variant=url.searchParams.get('variant')||referer.searchParams.get('variant')||'current';
 if(url.pathname==='/'||url.pathname==='/index.html'){
 const role=url.searchParams.get('role')||'SIGNED_OUT';let html=source(variant,'index.html');const prep='<script>window.qa={role:'+JSON.stringify(role)+',start:performance.now(),rpcs:[],writes:[],today:'+JSON.stringify(today)+'};document.addEventListener("DOMContentLoaded",()=>qa.dclMs=performance.now()-qa.start,{once:true});</script>';
 html=html.replace('<head>', '<head>'+prep).replace('</body>','<div id="qaParsed" hidden></div><script>qa.parsedMs=performance.now()-qa.start;</script></body>');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(html);
 }
 const file=url.pathname.slice(1);if(!file||file.includes('..')||!fs.existsSync(path.join(root,file))){res.writeHead(404);return res.end()}
 const countKey=variant+'|'+file;counters.set(countKey,(counters.get(countKey)||0)+1);
 const js=file.endsWith('.js'),css=file.endsWith('.css');res.setHeader('Content-Type',js?'text/javascript; charset=utf-8':css?'text/css; charset=utf-8':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream');res.setHeader('Cache-Control','public, max-age=86400');
 let body=file==='assets/supabase-auth-v1.js'?auth:js||css?source(variant,file):fs.readFileSync(path.join(root,file));
 // Controlled round-trip latency; baseline/current source preparation occurs before navigation.
 setTimeout(()=>res.end(body),js||css?35:0);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true});const metrics={conditions:'Real page and modules with synthetic auth/read-only data, 35 ms asset latency. Timings are fixture measurements, not a signed-in production session.'};
 async function run(variant,role,extra=false){const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],external=[],dialogs=[];qaPage=page;page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.dismiss()});
 await page.route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){external.push(r.request().url());return r.abort()}return r.continue()});
 await page.goto(origin+'/?variant='+variant+'&role='+role);await page.waitForFunction(()=>qa.done,{timeout:45000}).catch(async e=>{console.error({variant,role,errors,dialogs,qa:await page.evaluate(()=>qa)});throw e});
 const data=await page.evaluate(()=>({...qa,scriptCount:document.scripts.length,paths:[...document.scripts].filter(s=>s.src).map(s=>new URL(s.src).pathname),styles:[...document.querySelectorAll('link[rel="stylesheet"]')].map(s=>new URL(s.href).pathname)}));
 assert.deepEqual(errors,[],role+' '+variant+' JS errors');assert.deepEqual(dialogs,[],role+' unexpected dialogs');assert.deepEqual(data.writes,[]);assert.equal(external.length,0,'No external requests or live authentication');
 if(variant==='current'){assert.equal(data.initParsed,true);assert.equal(new Set(data.paths).size,data.paths.length,'No duplicate module execution');assert.equal(data.paths.some(p=>p.includes('demo-reset')),false);assert.equal(data.paths.some(p=>p.includes('demo-august')),false);
 assert.ok(data.globals.includes('SFHelpContent')&&data.globals.includes('SFAutoPlanWorkspace')&&data.globals.includes('SFHandover'),'Static dependencies present before authentication');
 if(role==='SIGNED_OUT'||role==='EMPLOYEE'){assert.equal(data.paths.some(p=>p.includes('datev-lodas-export')),false);assert.equal(data.paths.some(p=>p.includes('time-month-picker')),false);assert.equal(data.paths.some(p=>p.includes('supabase-personnel-file-v1')),false)}
 if(role==='OWNER'&&!extra){assert.equal(data.paths.some(p=>p.includes('datev-lodas-export')),false);assert.equal(data.paths.some(p=>p.includes('supabase-personnel-file-v1')),false)}
 if(role==='EMPLOYEE'){assert.equal(await page.locator('#sfEmployeePortal').count(),1)}
 if(role==='TIME_TRACKING'){assert.equal(await page.locator('#view-time').evaluate(n=>n.classList.contains('active')),true)}
 if(role==='OWNER'){assert.deepEqual(data.startup,{shellVisible:true,ready:false,shellReady:true,entryDismissed:true,viewInert:true,status:true});assert.equal(await page.locator('#sfStartupStatus').count(),0);assert.equal(await page.locator('#appShell').evaluate(n=>n.getAttribute('aria-busy')),null)}
 if(windowOrbit(data)) {
   if(['SIGNED_OUT','EMPLOYEE','TIME_TRACKING','VIEWER'].includes(role)){assert.equal(await page.locator('[data-orbit-site]').count(),0,'restricted roles receive no site summaries');assert.equal(await page.evaluate(()=>SFToday?.getSiteOverview?.()??null),null);}
   if(role!=='SIGNED_OUT'&&role!=='EMPLOYEE')assert.equal(await page.locator('#appShell>.sidebar').isVisible(),false,'legacy main navigation stays hidden for every manager role');
   if(role==='TIME_TRACKING') {
     await page.locator('[data-orbit-category="personal"]').click();
     assert.equal(await page.locator('#sfOrbitPopup [data-orbit-target="time"]').isEnabled(),true);
     for(const category of ['planning','analysis','settings'])assert.equal(await page.locator('[data-orbit-category="'+category+'"]').isDisabled(),true);
     assert.equal(await page.locator('#sfOrbitPopup .sf-orbit-entry:not(:disabled)').count(),1,'time-only navigation must not widen permissions');
     await page.keyboard.press('Escape');
   }
   if(role==='EMPLOYEE')assert.equal(await page.locator('#sfOrbitDock').isVisible(),false);
 }
 if(extra){
 if(windowOrbit(data)) {
   await page.waitForFunction(()=>document.querySelectorAll('.sf-orbit-overview-metrics [data-td-kpi]').length===3);
   const assistant=page.locator('#appShell .top-actions #sfPlanningAssistantButton');await assistant.waitFor({state:'visible'});
   await assistant.click();await page.locator('#sfPlanningChat').waitFor({state:'visible'});await assistant.click();await page.locator('#sfPlanningChat').waitFor({state:'hidden'});
   await page.evaluate(()=>{
     const name=document.querySelector('#appShell .topbar .user-row b'),role=document.querySelector('#appShell .topbar .user-row small'),avatar=document.querySelector('#appShell .topbar .user-row .avatar'),company=document.querySelector('#appShell .topbar .company-card b');
     if(name)name.textContent='Designvorschau';if(role)role.textContent='Testkonto';if(avatar)avatar.textContent='SF';if(company)company.textContent='SchichtFunk';
   });
   assert.equal(await page.locator('#sfTodayWorkspace [data-td-kpi]').count(),6,'all original daily KPIs remain available');
   assert.deepEqual(await page.locator('.sf-orbit-overview-metrics [data-td-kpi]').evaluateAll(nodes=>nodes.map(n=>n.dataset.tdKpi)),['present','coverage','actions']);
   const sitePin=id=>page.locator('[data-orbit-site="'+id+'"]');
   await sitePin('east').waitFor();assert.equal(await sitePin('east').getAttribute('data-status'),'good');assert.equal(await sitePin('west').getAttribute('data-status'),'attention');
   assert.equal(await sitePin('east').evaluate(n=>n.closest('[aria-hidden="true"]')),null,'interactive site controls are exposed to assistive technology');
   await sitePin('east').focus();assert.match(await page.locator('#sfOrbitSiteInfo').innerText(),/Leipzig/);assert.match(await page.locator('#sfOrbitSiteInfo').innerText(),/Jetzt anwesend\s+1/);
   await page.keyboard.press('Enter');assert.equal(await page.locator('#sfTodaySite').inputValue(),'east');assert.equal(await sitePin('east').getAttribute('aria-pressed'),'true');
   assert.match(await page.locator('details[data-orbit-detail="filters"]>summary').innerText(),/Leipzig/);
   await page.keyboard.press('Escape');assert.equal(await page.locator('#sfOrbitSiteInfo').isVisible(),false);
   await page.evaluate(()=>SFToday.reload(true));assert.equal(await page.locator('#sfTodaySite').inputValue(),'east','site selection survives normal refresh');
   await sitePin('west').click();assert.equal(await page.locator('#sfTodaySite').inputValue(),'west');assert.equal(await page.evaluate(()=>SFToday.getResult().summary.present),0);
   assert.equal(await sitePin('east').getAttribute('data-status'),'good','other site status remains available while a site is filtered');
   await page.getByRole('button',{name:'Standortfilter zurücksetzen',exact:true}).click();assert.equal(await page.locator('#sfTodaySite').inputValue(),'');
   await page.evaluate(()=>{const B=SFBackend;B.companySwitching=true;SFOrbit.refreshOverview()});assert.equal(await page.locator('[data-orbit-site]').count(),0,'company switch clears previous location names and cards synchronously');
   assert.equal(await page.locator('#sfOrbitSiteInfo').isVisible(),false);assert.equal(await page.evaluate(()=>SFToday.getSiteOverview()),null);
   await page.evaluate(async()=>{SFBackend.companySwitching=false;await SFToday.reload(true);SFOrbit.refreshOverview()});await sitePin('east').waitFor();
   await page.evaluate(async()=>{window.__originalQaSites=qa.today.sites.slice();for(let i=0;i<7;i++)qa.today.sites.push({id:'extra-'+i,name:'Teststandort '+i,is_active:true});await SFToday.reload(true)});
   assert.equal(await page.locator('[data-orbit-site]').count(),6,'large location lists retain compact pages');
   await page.getByRole('button',{name:'Weitere Standorte',exact:true}).click();assert.equal(await page.locator('[data-orbit-site]').count(),3);
   await sitePin('extra-6').click();assert.equal(await page.locator('#sfTodaySite').inputValue(),'extra-6');
   await page.getByRole('button',{name:'Vorherige Standorte',exact:true}).click();assert.equal(await page.locator('[data-orbit-site]').count(),6);
   await page.getByRole('button',{name:'Standortfilter zurücksetzen',exact:true}).click();
   await page.evaluate(async()=>{qa.today.sites=window.__originalQaSites;delete window.__originalQaSites;await SFToday.reload(true)});await sitePin('east').waitFor();
   await page.evaluate(()=>document.activeElement?.blur?.());await sitePin('east').hover();
   await page.waitForTimeout(200);assert.equal(await page.locator('#sfOrbitSiteInfo').isVisible(),true,'hover card does not cover its own trigger');
   await page.locator('.sf-orbit-hero-copy h1').hover();assert.equal(await page.locator('#sfOrbitSiteInfo').isVisible(),false);
   for(const key of ['figures','coverage','transitions','shortcuts','filters'])assert.equal(await page.locator('details[data-orbit-detail="'+key+'"]').evaluate(n=>n.open),false,'secondary information starts collapsed: '+key);
   await page.locator('details[data-orbit-detail="figures"]>summary').click();
   await page.evaluate(()=>SFToday.reload(true));
   assert.equal(await page.locator('details[data-orbit-detail="figures"]').evaluate(n=>n.open),true,'expanded details survive automatic data refresh');
   await page.locator('[data-td-kpi="planned"]').click();
   assert.equal(await page.locator('#sfTodayPeopleFilter').inputValue(),'planned','existing secondary KPI keeps its real filter handler');
   await page.locator('.sf-orbit-overview-metrics [data-td-kpi="coverage"]').click();
   assert.equal(await page.locator('details[data-orbit-detail="coverage"]').evaluate(n=>n.open),true,'coverage KPI reveals the corresponding detail before scrolling');
   await page.locator('details[data-orbit-detail="filters"]>summary').click();
   await page.locator('#sfTodaySite').selectOption('east');
   assert.equal(await page.locator('details[data-orbit-detail="filters"]>summary').innerText(),'Filter · Leipzig · Alle Schichten','active filter stays visible in the collapsed summary');
   assert.equal(await page.evaluate(()=>{const s=SFToday.getResult().summary;return [...document.querySelectorAll('.sf-orbit-overview-metrics strong')].map(n=>n.textContent).join('|')===[s.present??'–',s.open,s.actions].join('|');}),true,'hero uses actual scoped daily values');
   await page.locator('[data-td-action="reset"]').click();
   await page.locator('details[data-orbit-detail="filters"]>summary').click();
   for(const key of ['figures','coverage']){const d=page.locator('details[data-orbit-detail="'+key+'"]');if(await d.evaluate(n=>n.open))await d.locator('summary').click();}
   await page.evaluate(()=>{document.body.scrollTop=400;document.getElementById('sfOrbitHome').click()});
   await page.waitForFunction(()=>document.body.scrollTop<1&&document.querySelector('#appShell .main').scrollTop<1,'Orbit home resets all actual scroll containers');
   const globe=page.locator('.sf-orbit-globe');
   assert.equal(await globe.count(),1,'overview has one native globe, without external graphics requests');
   assert.equal(await globe.evaluate(n=>n.getContext('2d').getImageData(n.width/2,n.height/2,1,1).data[3]),255,'Earth is rendered even without animation');
   await page.evaluate(()=>{SFOrbit.setMotion('full');window.__orbitGlobeSnapshot=document.querySelector('.sf-orbit-globe').toDataURL()});
   await page.waitForFunction(()=>document.querySelector('.sf-orbit-globe').toDataURL()!==window.__orbitGlobeSnapshot);
   await page.evaluate(()=>SFOrbit.setMotion('subtle'));
   const subtleFrame=await globe.evaluate(n=>n.toDataURL());
   await page.waitForFunction(previous=>document.querySelector('.sf-orbit-globe').toDataURL()!==previous,subtleFrame);
   await page.evaluate(()=>{document.querySelector('#appShell .main').scrollTop=0;window.scrollTo(0,0);SFOrbit.setMotion('off')});
   assert.equal(await page.locator('.sf-orbit-emblem').evaluate(n=>n.getAnimations({subtree:true}).length),0,'motion off includes the decorative Orbit graphic');
   const stillFrame=await globe.evaluate(n=>n.toDataURL());await page.waitForTimeout(200);
   assert.equal(await globe.evaluate(n=>n.toDataURL()),stillFrame,'motion off stops globe rotation and blinking');
   await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>SFOrbit.setMotion('full'));
   const reducedFrame=await globe.evaluate(n=>n.toDataURL());await page.waitForTimeout(200);
   assert.equal(await globe.evaluate(n=>n.toDataURL()),reducedFrame,'system reduced motion also stops the canvas');
   await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>SFOrbit.setMotion('off'));
   for(const [theme,width] of [['dark',1440],['light',1440],['dark',390],['light',390],['dark',320]]){
     await page.setViewportSize({width,height:1000});await page.evaluate(t=>{SFManagerTheme.apply(t,false);document.activeElement?.blur?.();for(const el of [document.body,document.documentElement,document.getElementById('appShell'),document.querySelector('#appShell .main')])el.scrollTo({top:0,left:0,behavior:'instant'});window.scrollTo({top:0,left:0,behavior:'instant'})},theme);
     await page.waitForFunction(()=>document.body.scrollTop<1&&document.querySelector('#appShell .main').scrollTop<1&&window.scrollY<1);
     const hero=await page.locator('.sf-orbit-hero').boundingBox(),bar=await page.locator('#appShell>.topbar').boundingBox();assert.ok(bar.y>=-1&&hero.y>=bar.y+bar.height-1&&hero.y<bar.y+bar.height+50,'graphic hero and topbar are the first visible workspace content');
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,'Orbit overview fits '+width);
     const emblem=await page.locator('.sf-orbit-emblem').boundingBox();assert.ok(emblem.x>=0&&emblem.x+emblem.width<=width+1,'graphic fits the viewport');
     for(const key of ['present','coverage','actions'])assert.equal(await page.locator('.sf-orbit-overview-metrics [data-td-kpi="'+key+'"]').isVisible(),true);
     assert.equal(await assistant.isVisible(),true,'planning assistant remains available in the header at '+width);
     await page.screenshot({path:path.join(out,'orbit-overview-'+theme+'-'+width+'.png'),animations:'disabled'});
     await sitePin('east').click();assert.equal(await page.locator('#sfTodaySite').inputValue(),'east','site tap works at '+width);
     const tooltip=await page.locator('#sfOrbitSiteInfo').boundingBox();assert.ok(tooltip.x>=0&&tooltip.x+tooltip.width<=width+1,'site info fits '+width);
     await page.screenshot({path:path.join(out,'orbit-site-info-'+theme+'-'+width+'.png'),animations:'disabled'});
     await page.getByRole('button',{name:'Standortfilter zurücksetzen',exact:true}).click();await page.evaluate(()=>document.activeElement?.blur?.());
   }
   await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{SFManagerTheme.apply('dark',false);SFOrbit.setMotion('full')});
   for(let i=0;i<30;i++){await globe.screenshot({path:path.join(out,'orbit-globe-frame-'+String(i).padStart(2,'0')+'.png')});await page.waitForTimeout(150);}
   const mainBefore=await page.locator('#appShell .main').boundingBox();
   await page.locator('[data-orbit-category="planning"]').click();
   await page.waitForFunction(()=>document.querySelectorAll('#sfOrbitPopup .sf-orbit-entry').length===4);
   assert.equal(await page.locator('#sfOrbitPopup .sf-orbit-entry').count(),4);
   const size=await page.locator('#sfOrbitPopup').boundingBox();assert.ok(size.width<=300,'compact menu');
   const mainAfter=await page.locator('#appShell .main').boundingBox();
   for(const axis of ['x','y','width'])assert.equal(mainAfter[axis],mainBefore[axis],'opening must not move the workspace');
   assert.equal(await page.locator('#sfOrbitPopup').evaluate(n=>getComputedStyle(n).position),'fixed','menu is outside the document flow; background data may change content height');
   await page.locator('#sfOrbitPopup [data-orbit-target="schedule"]').click();
   assert.equal(await page.locator('#view-schedule').evaluate(n=>n.classList.contains('active')),true,'proxy must activate original route');
   const inactiveFrame=await globe.evaluate(n=>n.toDataURL());await page.waitForTimeout(200);
   assert.equal(await globe.evaluate(n=>n.toDataURL()),inactiveFrame,'globe rendering pauses outside the overview');
   assert.equal(await page.locator('[data-orbit-category="planning"] small').innerText(),'Dienstplan');
   await page.locator('[data-orbit-category="personal"]').click();await page.waitForFunction(()=>document.querySelectorAll('#sfOrbitPopup .sf-orbit-entry').length===6);assert.equal(await page.locator('#sfOrbitPopup .sf-orbit-entry').count(),6);
   await page.locator('[data-orbit-category="analysis"]').click();await page.waitForFunction(()=>document.querySelectorAll('#sfOrbitPopup .sf-orbit-entry').length===2);assert.equal(await page.locator('#sfOrbitPopup .sf-orbit-entry').count(),2);
   await page.keyboard.press('Escape');assert.equal(await page.locator('#sfOrbitPopup').getAttribute('aria-hidden'),'true');
   await page.evaluate(()=>SFOrbit.setMotion('subtle'));assert.equal(await page.evaluate(()=>localStorage.getItem('sf_orbit_motion_v1')),'subtle');
   await page.evaluate(()=>SFOrbit.setMotion('off'));await page.locator('[data-orbit-category="planning"]').click();
   assert.equal(await page.locator('#sfOrbitPopup').evaluate(n=>n.getAnimations({subtree:true}).length),0,'off must remove all menu effects');
   await page.keyboard.press('Escape');await page.evaluate(()=>SFOrbit.setMotion('full'));
   await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>SFOrbit.effectiveMotion()==='off');
   await page.emulateMedia({reducedMotion:'no-preference'});
   await page.locator('[data-orbit-category="settings"]').click();await page.locator('[data-setting-tab="display"]').click();
   await page.locator('select[data-orbit-motion]').selectOption('subtle');assert.equal(await page.evaluate(()=>SFOrbit.motion()),'subtle');
   await page.locator('select[data-orbit-motion]').selectOption('full');
   for(const [theme,width] of [['dark',1440],['light',390],['dark',320]]){
     await page.setViewportSize({width,height:1000});await page.evaluate(t=>SFManagerTheme.apply(t,false),theme);
     assert.equal(await page.locator('#appShell>.sidebar').isVisible(),false,'legacy main navigation stays hidden at every viewport');
     const settingNav=page.locator('#sfSettingsV2 .sf-set-nav'),settingPanel=page.locator('#sfSettingsV2 .sf-set-panel');
     const navBox=await settingNav.boundingBox(),panelBox=await settingPanel.boundingBox();
     assert.ok(navBox.y+navBox.height<=panelBox.y+1,'settings navigation sits above the workspace, never on the left');
     assert.equal(await settingNav.evaluate(n=>getComputedStyle(n).display),'flex','compact horizontal settings navigation');
     for(const tab of ['account','planning','display']){
       const button=page.locator('#sfSettingsV2 [data-setting-tab="'+tab+'"]');await button.click();
       assert.equal(await button.evaluate(n=>n.classList.contains('active')),true,'original settings tab remains reachable: '+tab);
       assert.equal(await button.locator('span').last().isVisible(),true,'settings label stays readable');
       await page.waitForFunction(tab=>{const b=document.querySelector('#sfSettingsV2 [data-setting-tab="'+tab+'"]'),r=b.getBoundingClientRect(),rail=b.parentElement.getBoundingClientRect();return r.left>=rail.left-1&&r.right<=rail.right+1;},tab);
     }
     await page.screenshot({path:path.join(out,'orbit-settings-'+theme+'-'+width+'.png'),animations:'disabled'});
     assert.equal(await page.locator('#appShell .topbar .company-card').isVisible(),true,'company switching stays available on mobile');
     await page.locator('[data-orbit-category="personal"]').click();
     const menu=await page.locator('#sfOrbitPopup').boundingBox();assert.ok(menu.x>=0&&menu.x+menu.width<=width+1,'menu fits viewport');
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,'page fits viewport');
     assert.equal(await page.evaluate(()=>{const b=document.querySelector('#sfOrbitPopup [data-orbit-target="time"]'),r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return b.contains(hit);}),true,'assistant must not cover the last menu entry');
     await page.screenshot({path:path.join(out,'orbit-'+theme+'-'+width+'.png'),animations:'disabled'});
     await page.keyboard.press('Escape');
   }
   await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>SFManagerTheme.apply('dark',false));
 }
 for(const view of ['schedule','employees','absence','auto','time','reports','settings']){await page.evaluate(v=>showView(v),view);await page.locator('#view-'+view+'.active').waitFor({state:'visible'});assert.equal(await page.locator('#view-'+view).evaluate(n=>n.classList.contains('active')),true,view+' navigation');if(windowOrbit(data))assert.equal(await page.locator('#appShell>.sidebar').isVisible(),false,'legacy navigation stays hidden in '+view)}
 await page.evaluate(()=>{employees=[{id:'qa-e',first:'Vorname',last:'Nachname',status:'active',employment:'Vollzeit',weeklyHours:40,shifts:TYPES.map(t=>t.id),qualifications:[]}];const t=TYPES[0];assignments=[{id:'qa-a',employeeId:'qa-e',type:t.id,date:iso(weekStart),start:t.start,end:t.end}];showView('schedule');editAssignment('qa-a')});await page.locator('#spAssignModal').waitFor();await page.evaluate(()=>spCloseAssignModal());
 await page.locator('#sfHelpButton').click();await page.locator('#sfHelpModal:not([hidden])').waitFor();assert.ok(await page.locator('#sfHelpResults .sf-help-article').count()>0);await page.locator('#sfHelpClose').click();
 for(const [theme,width]of[['dark',1440],['light',390]]){await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.dataset.sfTheme=t,theme);await page.evaluate(()=>showView('auto'));if(width<820)await page.waitForFunction(()=>document.querySelector('#appShell .sidebar').getBoundingClientRect().right<=1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);await page.screenshot({path:path.join(out,'auto-'+theme+'-'+width+'.png'),animations:'disabled'})}
 assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>qa.writes),[]);
 }
 }
 await context.close();return{parsedMs:data.parsedMs,dclMs:data.dclMs,initMs:data.initMs,scripts:data.paths.length,globals:data.globals};
 }
 if(base)metrics.baseline=await run('baseline','SIGNED_OUT');metrics.current=await run('current','SIGNED_OUT');
 if(base)assert.ok(metrics.current.parsedMs<metrics.baseline.parsedMs*.8,'Deferred modules must materially reduce parser blocking');
 metrics.owner=await run('current','OWNER',true);for(const role of ['ADMIN','PLANNER','DISPATCHER','VIEWER','EMPLOYEE','TIME_TRACKING'])metrics[role]=await run('current',role);
 // Exercise the actual demo entry and its document.write/defer chain with synthetic demo authorization.
 const demoContext=await browser.newContext({serviceWorkers:'block'}),demoPage=await demoContext.newPage(),demoErrors=[],demoExternal=[];
 demoPage.on('pageerror',e=>{demoErrors.push(e.message);console.error('Demo page error:',e.stack)});
 await demoPage.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin)return r.continue();if(u.hostname==='zbvloohfjleadjnqhbbh.supabase.co'&&['/functions/v1/demo-auth','/functions/v1/demo-analytics'].includes(u.pathname))return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({expiresAt:new Date(Date.now()+3600000).toISOString()})});demoExternal.push(u.href);return r.abort()});
 await demoPage.goto(origin+'/demo.html');await demoPage.waitForFunction(()=>window.__sfDemoReadyV1===true,{timeout:45000}).catch(async e=>{console.error({demoErrors,demoExternal,gate:await demoPage.locator('#sfDemoBootGate').evaluate(n=>({text:n.innerText,dataset:{...n.dataset}})).catch(()=>null)});throw e});
 assert.equal(await demoPage.locator('#sfDemoResetBtn').count(),1);await demoPage.locator('#sfDemoResetBtn').click();await demoPage.locator('.sf-demo-reset-modal').waitFor();await demoPage.locator('.sf-demo-reset-cancel').click();assert.deepEqual(demoErrors,[],'Demo JS errors');assert.deepEqual(demoExternal,[],'Demo must not reach production data');
 assert.equal(await demoPage.evaluate(()=>SFBackend.client.__sfDemoLocalClientV1),true);assert.ok(await demoPage.evaluate(()=>employees.length>=15));
 await demoPage.evaluate(()=>SFDemoPerspective.set('employee'));assert.equal(await demoPage.locator('#sfEmployeePortal').count(),1);await demoPage.evaluate(()=>SFDemoPerspective.set('manager'));assert.equal(await demoPage.evaluate(()=>SFBackend.role),'ADMIN');
 assert.deepEqual(demoErrors,[]);metrics.demo={ready:true,localClient:true,perspectives:['manager','employee']};await demoContext.close();
 const result=[...counters].filter(([key])=>key.startsWith('current|')).map(([key,count])=>({path:key.slice(8),count}));metrics.requestPaths=result.length;
 fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(metrics,null,2));console.log(JSON.stringify(metrics,null,2));console.log('Site loading QA passed: real static/dynamic modules, complete DOM before auth, duplicate-free execution, signed-out and seven roles, navigation, assignment dialog, help, light/dark and no production requests or writes.');
}
function windowOrbit(data){return data.paths.includes('/assets/orbit-shell-v1.js')}
main().catch(async e=>{console.error(e);process.exitCode=1;if(qaPage&&!qaPage.isClosed()){await qaPage.screenshot({path:path.join(out,'orbit-failure.png'),animations:'disabled'}).catch(()=>{});fs.writeFileSync(path.join(out,'orbit-failure.html'),await qaPage.content().catch(()=>''));}}).finally(async()=>{await browser?.close();await new Promise(r=>server?.close(r)||r())});

