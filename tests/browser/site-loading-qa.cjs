// The shipped page and real integrations, with isolated authentication/data boundaries.
// Executed only on the GitHub Actions runner; no real credentials or data mutations.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'test-results/site-loading'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),base=process.env.SF_SITE_LOADING_BASE;
const originals=new Map();if(base){for(const p of execFileSync('git',['diff','--name-only',base,'HEAD'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(p=>p.endsWith('.html')||p.startsWith('assets/'))){try{originals.set(p,execFileSync('git',['show',base+':'+p],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}))}catch{}}}
const source=(v,p)=>v==='baseline'&&originals.has(p)?originals.get(p):read(p);
const auth=String.raw`
(()=>{const B=window.SFBackend=window.SFBackend||{},emptyEmployee=()=>({company:{id:'qa',name:'QA Unternehmen',timezone:'Europe/Berlin'},employee:{id:'qa-employee',first_name:'Vorname',last_name:'Nachname',personnel_no:'1001',status:'active',weekly_hours:40,employment:'Vollzeit'},shifts:[],changes:[],requests:[],absence_requests:[],absences:[],marketplace:[],swap_requests:[],notifications:[],templates:[],incidents:[]});
B.ready=false;B.role=null;B.companyTimeZone='Europe/Berlin';B.loginOnly=true;B.hasLegacy=false;B.showLoading=()=>{};B.hideLoading=()=>{};B.updateState=()=>{};B.clearLegacy=()=>{};B.baseOpenApp=window.openApp;B.authDialog=()=>{};B.closeAuth=()=>{};B.boot=async()=>{};
const client={from(table){let single=false;let q;q=new Proxy({},{get(_,key){if(key==='then')return resolve=>resolve({data:single?{id:'qa',name:'QA Unternehmen',timezone:'Europe/Berlin'}:[],error:null});return(...args)=>{if(['insert','update','delete','upsert'].includes(key)){qa.writes.push(table+':'+key);throw Error('Fixture rejects writes')}if(['single','maybeSingle'].includes(key))single=true;return q}}});return q},async rpc(name,args){qa.rpcs.push(name);if(!/^(manager_|employee_|list_|get_|read_)/.test(name))throw Error('Fixture rejects RPC '+name);if(name==='manager_today_workspace')return{data:qa.today,error:null};if(name==='manager_company_profile')return{data:{company_id:'qa',name:'QA Unternehmen',timezone:'Europe/Berlin',contacts:[],sites:qa.today.sites.map(s=>({...s,code:s.id==='east'?'LE':s.id==='west'?'RE':'QA',address:s.address||(s.id==='east'?'Nonnenstraße 21, 04229 Leipzig':s.id==='west'?'Westring 45, 45659 Recklinghausen':'')})),can_edit:false},error:null};if(name==='employee_portal_overview')return{data:emptyEmployee(),error:null};return{data:[],error:null}},channel(){const c={on:()=>c,subscribe:()=>c,unsubscribe:()=>{}};return c},removeChannel(){},auth:{getSession:async()=>({data:{session:null},error:null}),getUser:async()=>({data:{user:B.user},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal2',nextLevel:'aal2'},error:null}),listFactors:async()=>({data:{all:[{id:'qa-totp',factor_type:'totp',status:'verified'}],totp:[{id:'qa-totp',factor_type:'totp',status:'verified'}]},error:null})}}};
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
 if(!['SIGNED_OUT','EMPLOYEE'].includes(role))assert.equal(await page.locator('#sfBillingNav').evaluate(n=>n.hidden),!['OWNER','ADMIN'].includes(role),'Abrechnung follows admin permissions');
 if(role==='EMPLOYEE'){assert.equal(await page.locator('#sfEmployeePortal').count(),1)}
 if(!['SIGNED_OUT','EMPLOYEE'].includes(role))assert.equal(await page.locator('#sfBillingNav').evaluate(n=>n.hidden),!['OWNER','ADMIN'].includes(role),'Abrechnung follows admin permissions');
 if(role==='TIME_TRACKING'){assert.equal(await page.locator('#view-time').evaluate(n=>n.classList.contains('active')),true)}
 if(role==='OWNER'){assert.deepEqual(data.startup,{shellVisible:true,ready:false,shellReady:true,entryDismissed:true,viewInert:true,status:true});assert.equal(await page.locator('#sfStartupStatus').count(),0);assert.equal(await page.locator('#appShell').evaluate(n=>n.getAttribute('aria-busy')),null)}
 if(windowOrbit(data)) {
   if(['SIGNED_OUT','EMPLOYEE','TIME_TRACKING','VIEWER'].includes(role)){assert.equal(await page.locator('[data-orbit-site]').count(),0,'restricted roles receive no site summaries');assert.equal(await page.evaluate(()=>SFToday?.getSiteOverview?.()??null),null);}
   if(role!=='SIGNED_OUT'&&role!=='EMPLOYEE')assert.equal(await page.locator('#appShell>.sidebar').isVisible(),false,'legacy main navigation stays hidden for every manager role');
   if(role==='TIME_TRACKING') {
     await page.locator('[data-orbit-category="personal"]').click();
     assert.equal(await page.locator('#sfOrbitPopup [data-orbit-target="time"]').isEnabled(),true);
     for(const category of ['overview','planning','analysis','settings'])assert.equal(await page.locator('[data-orbit-category="'+category+'"]').isDisabled(),true);
     assert.equal(await page.locator('#sfOrbitPopup .sf-orbit-entry:not(:disabled)').count(),1,'time-only navigation must not widen permissions');
     await page.keyboard.press('Escape');
   }
   if(role==='EMPLOYEE')assert.equal(await page.locator('#sfOrbitDock').isVisible(),false);
 }
 if(extra){
 if(windowOrbit(data)) {
   await page.waitForFunction(()=>window.SFLocationMapEngine&&document.querySelectorAll('[data-orbit-site]').length===2);
   const overviewButton=page.locator('[data-orbit-category="overview"]'),assistant=page.locator('#appShell .top-actions #sfPlanningAssistantButton');
   await assistant.waitFor({state:'visible'});await assistant.click();await page.locator('#sfPlanningChat').waitFor({state:'visible'});await assistant.click();await page.locator('#sfPlanningChat').waitFor({state:'hidden'});
   const sitePin=id=>page.locator('[data-orbit-site="'+id+'"]'),card=page.locator('#sfOrbitSiteInfo'),globe=page.locator('.sf-location-map canvas');
   assert.equal(await card.isVisible(),false,'categories appear only after location selection');
   assert.equal(await page.locator('.sf-location-map .sf-route').count(),0,'no connections on the resting map');
   await sitePin('east').hover();assert.equal(await card.isVisible(),false,'hover does not open the location dialog');
   await sitePin('east').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#sfTodaySite').inputValue(),'east');
   assert.equal(await sitePin('east').getAttribute('aria-expanded'),'true');assert.match(await card.innerText(),/Leipzig/);
   assert.equal(await card.locator('[data-kind="present"] .sf-pop-value').innerText(),'1');
   await card.locator('[data-kind="coverage"]').click();assert.equal(await card.isVisible(),false);assert.equal(await page.locator('#sfTodaySite').inputValue(),'east');
   assert.equal(await page.locator('details[data-orbit-detail="coverage"]').evaluate(n=>n.open),true,'opens existing coverage workflow for selected location');
   await sitePin('west').click();assert.equal(await card.locator('[data-kind="present"] .sf-pop-value').innerText(),'0');
   await card.locator('[data-kind="actions"]').click();assert.match(await page.locator('#sfTodayActions .sf-td-section-head p').innerText(),/Recklinghausen/);
   for(const scope of await page.locator('.sf-td-alert-scope').allTextContents())assert.ok(scope==='Recklinghausen'||scope.startsWith('Unternehmensweit'));
   await sitePin('east').click();await card.locator('[data-kind="present"]').click();assert.equal(await page.locator('#sfTodayPeopleFilter').inputValue(),'present');
   await sitePin('east').click();await page.keyboard.press('Escape');assert.equal(await card.isVisible(),false);
   await sitePin('east').click();await page.evaluate(()=>SFToday.reload(true));assert.equal(await card.isVisible(),true,'normal refresh preserves the selected location dialog');
   await page.evaluate(()=>{SFBackend.companySwitching=true;SFOrbit.refreshOverview()});assert.equal(await page.locator('[data-orbit-site]').count(),0);assert.equal(await card.isVisible(),false);
   await page.evaluate(async()=>{SFBackend.companySwitching=false;await SFToday.reload(true);SFOrbit.refreshOverview()});await sitePin('east').waitFor();
   await page.evaluate(async()=>{window.__originalQaSites=structuredClone(qa.today.sites);for(let i=0;i<7;i++)qa.today.sites.push({id:'extra-'+i,name:'Teststandort '+i,is_active:true});await SFToday.reload(true)});
   assert.equal(await page.locator('[data-orbit-site]').count(),9,'all locations remain selectable, including unverified addresses');
   await sitePin('extra-6').click();assert.match(await card.innerText(),/Kartenposition nicht verifiziert/);
   await page.evaluate(async()=>{qa.today.sites=window.__originalQaSites;delete window.__originalQaSites;await SFToday.reload(true)});
   await page.evaluate(async()=>{qa.today.sites.push({id:'hue',name:'Hürth',address:'Kalscheurener Str. 19, 50354 Hürth',is_active:true},{id:'han',name:'Hannover',address:'Georgstraße 38, 30159 Hannover',is_active:true},{id:'sch',name:'Schkeuditz',address:'Döbichauer Str. 1-3, 04435 Schkeuditz',is_active:true},{id:'aus',name:'Bergheim',address:'Handelszentrum 5, 5101 Bergheim bei Salzburg',is_active:true});await SFCompanyProfile.load({force:true});await SFToday.reload(true);SFOrbit.refreshOverview();});
   assert.equal(await page.locator('[data-orbit-site]').count(),6);
   await page.locator('#sfTodaySite').selectOption('');
   const stillFrame=await globe.evaluate(n=>n.toDataURL());await page.waitForTimeout(150);assert.equal(await globe.evaluate(n=>n.toDataURL()),stillFrame,'the map remains still');
   await page.locator('.sf-location-map .sf-view').click();assert.equal(await page.locator('.sf-location-map .sf-view').getAttribute('aria-pressed'),'true');await page.locator('.sf-location-map .sf-view').click();
   for(const [theme,width] of [['dark',1920],['dark',1440],['light',1440],['dark',390],['light',390],['dark',320]]){
     await page.setViewportSize({width,height:1000});await page.evaluate(t=>SFManagerTheme.apply(t,false),theme);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,'map fits '+width);
     await page.locator('.sf-orbit-hero').scrollIntoViewIfNeeded();
     await page.waitForTimeout(80);
     const composition=await page.evaluate(()=>{const hero=document.querySelector('.sf-orbit-hero'),scene=hero.querySelector('.sf-scene').getBoundingClientRect(),title=hero.querySelector('h1').getBoundingClientRect(),filter=hero.querySelector('#sfTodaySite').getBoundingClientRect(),content=hero.querySelector('.sf-orbit-hero-content').getBoundingClientRect(),pins=[...hero.querySelectorAll('[data-orbit-site]')].map(b=>b.getBoundingClientRect());return{scene:{x:scene.x,y:scene.y,right:scene.right,bottom:scene.bottom,width:scene.width,height:scene.height},title:{x:title.x,y:title.y,right:title.right,bottom:title.bottom},filter:{bottom:filter.bottom},content:{bottom:content.bottom},pinTop:Math.min(...pins.map(p=>p.top))};});
     assert.ok(composition.scene.y<=composition.title.y&&composition.scene.bottom>=composition.filter.bottom,'map continues behind title and filter: '+width);
     assert.ok(composition.scene.width/composition.scene.height<3,'map has generous height on wide screens: '+width);
     assert.ok(composition.pinTop>=composition.content.bottom+30,'location labels stay clear of wrapped heading and filters: '+width);
     const filterContrast=await page.locator('.sf-orbit-status-scope label>span').evaluate(el=>{const lum=value=>{const rgb=value.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};const a=lum(getComputedStyle(el).color),b=lum('rgb(11,41,58)');return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);});assert.ok(filterContrast>=4.5,'location filter label remains legible over the map: '+theme+' '+width);

     await page.screenshot({path:path.join(out,'orbit-integrated-map-'+theme+'-'+width+'.png'),animations:'disabled'});
     await sitePin('east').click();await card.scrollIntoViewIfNeeded();const rect=await card.boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=width+1,'location dialog fits '+width);
     const contrast=await card.evaluate(el=>{const heading=el.querySelector('h3'),background=el.querySelector('.sf-pop-header');const luminance=value=>{const rgb=value.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};const a=luminance(getComputedStyle(heading).color),b=luminance(getComputedStyle(background).backgroundColor);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);});assert.ok(contrast>=4.5,'location heading contrast in '+theme+' at '+width);
     await page.screenshot({path:path.join(out,'orbit-site-info-'+theme+'-'+width+'.png'),animations:'disabled'});
     await card.locator('.sf-close').click();assert.equal(await card.isVisible(),false);
     for(const id of ['west','hue','han','sch','aus']){await sitePin(id).click();await card.scrollIntoViewIfNeeded();const r=await card.boundingBox(),dock=await page.locator('#sfOrbitDock').boundingBox();assert.ok(r.y>=0&&r.y+r.height<=dock.y+1,'all categories stay above fixed navigation: '+JSON.stringify({id,width,dialog:r,dock}));await card.locator('.sf-close').click();}
   }
   await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{SFManagerTheme.apply('dark',false);SFOrbit.setMotion('off')});
   await page.evaluate(async rich=>{window.__beforeActionQa=qa.today;qa.today=rich;qa.today.company_id='qa';await SFToday.reload();SFToday.selectSite('');SFToday.openMetric('actions');},fixtures.rich());
   for(const [theme,width] of [['dark',1440],['light',1440],['dark',768],['light',390],['dark',320]]){
     await page.setViewportSize({width,height:1000});await page.evaluate(t=>SFManagerTheme.apply(t,false),theme);
     await page.locator('#sfTodayActions').scrollIntoViewIfNeeded();
     assert.equal(await page.locator('#sfTodayAlerts .sf-td-alert').count(),width<=520?2:4);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,'compact task area fits '+width);
     const tasks=await page.locator('#sfTodayActions').boundingBox();assert.ok(tasks.height<1000,'responsive hint pages stay compact: '+width);
     await page.screenshot({path:path.join(out,'orbit-compact-actions-'+theme+'-'+width+'.png'),animations:'disabled'});
   }
   await page.evaluate(async()=>{qa.today=window.__beforeActionQa;delete window.__beforeActionQa;await SFToday.reload();SFOrbit.refreshOverview();});
   await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>SFManagerTheme.apply('dark',false));
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
   await overviewButton.click();assert.equal(await page.locator('#view-overview').evaluate(n=>n.classList.contains('active')),true,'direct overview button activates the existing route');
   assert.equal(await page.locator('#sfOrbitPopup').getAttribute('aria-hidden'),'true','overview navigation closes the category menu');
   await page.locator('[data-orbit-category="personal"]').click();await page.waitForFunction(()=>document.querySelectorAll('#sfOrbitPopup .sf-orbit-entry').length===7);assert.equal(await page.locator('#sfOrbitPopup .sf-orbit-entry').count(),7);
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
     const dockBounds=await page.locator('#sfOrbitDock').boundingBox();assert.ok(menu.y+menu.height<=dockBounds.y-8,'submenu stays above the entire navigation, including mobile rows');
     const overviewBounds=await overviewButton.boundingBox(),planningBounds=await page.locator('[data-orbit-category="planning"]').boundingBox();
     assert.ok(Math.abs(overviewBounds.y-planningBounds.y)<2&&overviewBounds.x+overviewBounds.width<=planningBounds.x+1,'daily overview is beside planning');
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,'page fits viewport');
     assert.equal(await page.evaluate(()=>{const b=document.querySelector('#sfOrbitPopup [data-orbit-target="billing"]'),r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return b.contains(hit);}),true,'assistant must not cover the last menu entry');
     await page.screenshot({path:path.join(out,'orbit-'+theme+'-'+width+'.png'),animations:'disabled'});
     await page.keyboard.press('Escape');
   }
   await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>SFManagerTheme.apply('dark',false));
 }
 for(const view of ['schedule','employees','absence','auto','time','billing','reports','settings']){await page.evaluate(v=>showView(v),view);await page.locator('#view-'+view+'.active').waitFor({state:'visible'});assert.equal(await page.locator('#view-'+view).evaluate(n=>n.classList.contains('active')),true,view+' navigation');if(windowOrbit(data))assert.equal(await page.locator('#appShell>.sidebar').isVisible(),false,'legacy navigation stays hidden in '+view);if(view==='billing'){await page.locator('#sfBillingContent #sfDatevMonth').waitFor();assert.equal(await page.locator('#view-time #sfDatevPanel,#view-reports #sfDatevPanel').count(),0);await page.locator('#sfDatevMonth').fill('2026-08');await page.locator('#sfDatevMonth').dispatchEvent('change');}}
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

