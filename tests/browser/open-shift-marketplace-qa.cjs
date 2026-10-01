const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.SF_PLAYWRIGHT_PATH||(process.platform==='win32'?'C:/Users/lhz_d/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright':'@playwright/test'));
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const appStyle=read('index.html').match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];
const fixture=`
window.__errors=[];window.addEventListener('error',e=>__errors.push(e.message));window.addEventListener('unhandledrejection',e=>__errors.push(String(e.reason)));
let autoPlanPreview=[],autoPlanAnalyzed=true,autoPlanApplied=0,autoPlanApplying=false;
const TYPES=[{id:'FD',name:'Frühdienst',start:'06:00',end:'14:00'},{id:'ND',name:'Nachtdienst',start:'22:00',end:'06:00'}];
const typeById=id=>TYPES.find(x=>x.id===id);
function autoOpenSlots(){return [{date:'2026-12-01',type:'FD'},{date:'2026-12-01',type:'FD'},{date:'2026-12-01',type:'ND'}]}
window.showSaveToast=(...args)=>window.__toast=args;window.renderCalendar=()=>{};window.switchView=view=>{document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id==='view-'+view))};
window.__calls=[];window.__open=[];window.__legacy=[];window.__reviews=[];window.__publishError=false;
window.SFBackend={ready:true,role:'PLANNER',companyId:'company-a',companyTimeZone:'Europe/Berlin',sync:async()=>{},hydrate:async()=>{},client:{rpc:async(name,args)=>{
__calls.push({name,args});if(name.includes('list_shift_marketplace'))return {data:__legacy};if(name.includes('list_open_shift_market'))return {data:__open};
if(name==='manager_publish_open_shifts'){if(__publishError)return {error:{message:'Speicherung fehlgeschlagen'}};__open=args.p_slots.map((s,i)=>({id:'offer-'+i,kind:'OPEN_POSITION',is_claim:false,is_own:false,status:'MARKET_OPEN',shift_code:s.type,starts_at:s.date+'T'+typeById(s.type).start+':00+01:00',ends_at:(s.type==='ND'?'2026-12-02':s.date)+'T'+typeById(s.type).end+':00+01:00',offered_by:'Offener Bedarf · Planung',remaining_count:s.count,can_take:true,company_name:'Testunternehmen'}));return {data:{published_positions:args.p_slots.reduce((n,s)=>n+s.count,0),offer_count:args.p_slots.length}};}
if(name==='employee_claim_open_shift'){const o=__open.find(x=>x.id===args.p_offer_id);__open=[...__open.filter(x=>x.id!==o.id),{...o,id:'claim-'+o.id,is_claim:true,status:'PENDING_MANAGER',can_take:false,claimed_by:'Test Mitarbeiter',rhythm_warning:'Team E: Rhythmus erwartet einen freien Tag'}];return {data:{status:'PENDING_MANAGER'}};}
if(name==='manager_review_open_shift_claim'){__reviews.push(args);__open=__open.map(x=>x.id===args.p_claim_id?{...x,status:'APPLIED',assignment_id:'new-assignment'}:x);return {data:{status:'APPLIED',message:'Verbindlich eingetragen'}};}
return {data:null};}},bindAccessibleModal(back,{initialFocus}={}){const opener=document.activeElement;const close=()=>{back.remove();opener?.focus()};back.addEventListener('keydown',e=>{if(e.key==='Escape')close()});back.querySelector(initialFocus||'button')?.focus();return close;}};
window.renderAutoPlanning=()=>SFOpenShiftMarket.renderPublishEntry({analyzed:true,applied:0,count:autoPlanPreview.length,remaining:autoOpenSlots()});
`;
const html=`<!doctype html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${appStyle}</style><link rel="stylesheet" href="/assets/auto-plan-period-v1.css"><link rel="stylesheet" href="/assets/manager-theme-v1.css"><link rel="stylesheet" href="/assets/open-shift-marketplace-v1.css"></head><body><div id="appShell"><nav id="nav"></nav><main class="content"><section class="view active" id="view-auto"><h1>Auto-Planung</h1><div id="autoAnalysis"></div></section><section id="view-overview" class="view"></section></main></div><div id="sfEmployeePortal"><div class="sf-portal-grid"></div></div><script>${fixture}</script><script src="/assets/open-shift-marketplace-v1.js"></script><script src="/assets/supabase-shift-marketplace-v1.js"></script><script>renderAutoPlanning()</script></body></html>`;
async function run(){
 const executablePath=process.env.SF_CHROME_PATH||(process.platform==='win32'?'C:/Users/lhz_d/AppData/Local/ms-playwright/chromium-1193/chrome-win/chrome.exe':undefined);
 const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
 fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
 const reports=[];
 try{for(const [name,viewport,theme] of [['desktop-dark',{width:1280,height:900},'dark'],['desktop-light',{width:1280,height:900},'light'],['mobile',{width:390,height:844},'dark']]){
  const context=await browser.newContext({viewport,locale:'de-DE',timezoneId:'Europe/Berlin'}),page=await context.newPage();
  await page.route('http://sf.test/**',route=>{const url=new URL(route.request().url());if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});const file=path.join(root,url.pathname);if(!file.startsWith(root))return route.abort();try{return route.fulfill({contentType:file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':'image/png',body:fs.readFileSync(file)})}catch{return route.fulfill({status:404,body:''})}});
  await page.goto('http://sf.test/');await page.evaluate(t=>document.documentElement.dataset.sfTheme=t,theme);
  await page.evaluate(()=>{autoPlanPreview=[{date:'2026-12-01',type:'FD'}];renderAutoPlanning()});assert.equal(await page.locator('#sfPublishOpenShifts').isDisabled(),true,'Unapplied suggestions block publication');
  await page.evaluate(()=>{autoPlanPreview=[];renderAutoPlanning()});await page.locator('#sfPublishOpenShifts').click();
  await page.locator('#sfOpenMarketPublish').waitFor();assert.equal(await page.evaluate(()=>__calls.filter(x=>x.name==='manager_publish_open_shifts').length),0,'Opening dialog must not publish');
  await page.locator('[data-select-all]').uncheck();assert.equal(await page.locator('[data-publish]').isDisabled(),true);
  await page.locator('[data-slot="0"]').check();await page.locator('[data-count="0"]').fill('1');assert.match(await page.locator('[data-publish-summary]').textContent(),/1 Platz in 1 Dienst/);
  await page.locator('#sfOpenMarketPublish [data-cancel]').click();assert.equal(await page.evaluate(()=>__calls.filter(x=>x.name==='manager_publish_open_shifts').length),0,'Cancel must not publish');
  await page.locator('#sfPublishOpenShifts').click();await page.locator('[data-select-all]').uncheck();await page.locator('[data-slot="0"]').check();await page.locator('[data-count="0"]').fill('1');
  await page.screenshot({path:path.join(root,'test-results/marketplace-publish-'+name+'.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal page overflow');
  await page.evaluate(()=>__publishError=true);await page.locator('[data-publish]').click();await page.waitForFunction(()=>document.querySelector('[data-publish-error]').textContent.length);assert.equal(await page.locator('[data-publish]').isEnabled(),true,'Failed publication can be retried');
  await page.evaluate(()=>__publishError=false);await page.locator('[data-publish]').click();await page.locator('#sfOpenMarketPublish').waitFor({state:'detached'});
  const published=await page.evaluate(()=>__calls.filter(x=>x.name==='manager_publish_open_shifts').at(-1).args);assert.deepEqual(published.p_slots,[{date:'2026-12-01',type:'FD',count:1}]);
  await page.evaluate(async()=>{SFBackend.role='EMPLOYEE';await SFShiftMarketplace.refreshEmployee()});await page.locator('#sfMarketEmployee [data-take]').click();await page.locator('#sfMarketModal [data-submit]').click();await page.waitForFunction(()=>__open[0]?.status==='PENDING_MANAGER');
  assert.equal(await page.evaluate(()=>__reviews.length),0,'Employee claim cannot approve itself');
  await page.evaluate(async()=>{SFBackend.role='PLANNER';await SFShiftMarketplace.refreshManager();SFShiftMarketplace.openDashboard()});
  await page.locator('#view-marketplace [data-review="APPROVE"]').click();await page.locator('#sfMarketModal [data-submit]').click();assert.equal(await page.evaluate(()=>__reviews.length),0,'Rhythm confirmation is mandatory');
  await page.locator('[data-accept-rhythm]').check();await page.locator('#sfMarketModal [data-submit]').click();await page.waitForFunction(()=>__reviews.length===1);assert.equal(await page.evaluate(()=>__reviews[0].p_accept_rhythm),true);
  // Existing demo/legacy offers without an end timestamp still render.
  await page.evaluate(async()=>{__legacy=[{id:'legacy',shift_code:'FD',starts_at:'2026-12-04T06:00:00+01:00',offered_by:'Altangebot',status:'MARKET_OPEN',can_take:true}];await SFShiftMarketplace.refreshManager()});
  assert.equal((await page.evaluate(()=>__errors)).length,0,'Browser must have no unhandled errors');reports.push({name,passed:true});await context.close();
 }}finally{await browser.close()}
 console.log(JSON.stringify({browser_checks:reports}));
}
run().catch(e=>{console.error(e);process.exitCode=1});

