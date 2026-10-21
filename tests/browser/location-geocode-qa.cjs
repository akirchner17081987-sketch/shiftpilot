// Real map engine + profile UI, simulated authenticated transport, no external requests.
const {chromium}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),out=path.join(root,'test-results/location-geocode');
const fixture=`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/location-map-v1.css"><link rel="stylesheet" href="/assets/company-profile-v1.css"><style>body{margin:0;background:#06131f;color:#e0eefa;font-family:Arial,sans-serif}#map{max-width:1200px;margin:auto}.sf-scene{height:580px}#settings{padding:16px}html[data-theme=light] body{background:#e5e9ed;color:#223344}</style></head><body><div id="appShell"><main><div id="map"></div><div id="settings"><div id="sfSettingsV2"><div class="sf-set-head"><span class="status"></span></div></div><div id="sfSettingBody"></div></div></main></div>
<script>
window.fixture={calls:[],company:'company-a',profile:{company_id:'company-a',name:'QA Sicherheitsunternehmen A',timezone:'Europe/Berlin',can_edit:true,revision:1,contacts:[],sites:[{id:'object-a',company_id:'company-a',code:'A',name:'Eigenes Objekt A',address:'Beispielstraße 86, 04158 Leipzig-Nord',is_active:true,geocode_status:'pending'}]}};
window.SFBackend={ready:false,companyId:'company-a',user:{id:'manager'},role:'OWNER',accessRole:'OWNER',client:{rpc:async()=>({data:structuredClone(fixture.profile)}),functions:{invoke:async(name,args)=>{fixture.calls.push({name,body:args.body});await new Promise(r=>setTimeout(r,200));const site={...fixture.profile.sites[0],latitude:51.3887705,longitude:12.357991,geocode_status:'verified',geocode_address:fixture.profile.sites[0].address,geocode_source:'nominatim'};fixture.profile.sites[0]=site;return {data:{site}}}}}};
</script><script src="/assets/company-profile-v1.js"></script><script src="/assets/location-map-core-v1.js"></script><script src="/assets/location-map-v1.js"></script><script>
SFBackend.ready=true;
window.map=SFLocationMap.create(document.querySelector('#map'),{getData(){const p=SFCompanyProfile.current();return p?{companyId:p.company_id,selected:'',asOf:new Date().toISOString(),timezone:'Europe/Berlin',fresh:true,sites:p.sites.filter(s=>s.is_active).map(s=>({...s,status:'good',label:'Test',actions:0,open:0,present:0}))}:null},select(){return true},motion:()=> 'off',active:()=>true});
document.addEventListener('sf:company-profile-change',()=>map.sync());SFCompanyProfile.load();
</script></body></html>`;
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true});try{
 for(const [width,theme] of [[1440,'dark'],[1440,'light'],[390,'dark']]){
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.hostname!=='location-qa.invalid'){external.push(u.origin);return route.abort();}
   if(u.pathname==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:fixture});
   const file=path.resolve(root,'dist','.'+u.pathname);if(!file.startsWith(path.join(root,'dist','assets')+path.sep)||!fs.existsSync(file))return route.abort();
   return route.fulfill({contentType:file.endsWith('.css')?'text/css':file.endsWith('.webp')?'image/webp':'application/javascript',body:fs.readFileSync(file)});
  });
  await page.goto('https://location-qa.invalid/');await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  await page.waitForFunction(()=>!!document.querySelector('[data-orbit-site="object-a"]:not(.sf-unmapped)'));
  assert.equal(await page.locator('.sf-point').count(),1);assert.equal(await page.locator('.sf-geocode-attribution').isVisible(),true);
  assert.deepEqual(await page.evaluate(()=>fixture.calls),[{name:'location-geocode',body:{company_id:'company-a',site_id:'object-a'}}]);
  await page.locator('[data-orbit-site="object-a"]').click();await page.locator('.sf-popup:not([hidden])').waitFor();assert.equal(await page.locator('#sfLocationPopupTitle').textContent(),'Eigenes Objekt A');assert.doesNotMatch(await page.locator('.sf-popup-note').textContent(),/nicht verifiziert/);
  await page.evaluate(()=>SFCompanyProfile.render(document.querySelector('#sfSettingBody')));await page.locator('[data-company-panel="sites"]').click();assert.match(await page.locator('[data-site-geo="object-a"]').textContent(),/Auf der Karte verortet/);
  await page.screenshot({path:path.join(out,theme+'-'+width+'.png'),fullPage:true});
  await page.evaluate(async()=>{SFBackend.companyId='company-b';fixture.profile={...fixture.profile,company_id:'company-b',name:'Unternehmen B',sites:[{id:'object-b',company_id:'company-b',code:'B',name:'Eigenes Objekt B',address:'Andere Straße 1, 12345 Ort',is_active:true,geocode_status:'verified',geocode_address:'Andere Straße 1, 12345 Ort',geocode_source:'legacy_verified',longitude:8,latitude:50}]};await SFCompanyProfile.load({force:true});map.sync();});
  await page.locator('[data-orbit-site="object-b"]:not(.sf-unmapped)').waitFor();assert.equal(await page.locator('[data-orbit-site="object-a"]').count(),0);assert.equal(await page.locator('.sf-geocode-attribution').isVisible(),false);assert.equal(await page.locator('.sf-point').count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,'No horizontal overflow');assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('Location geocoding browser QA passed: '+theme+' '+width);await context.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
