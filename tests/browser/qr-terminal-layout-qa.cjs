// Production QR modules with fictitious responses; never connects to production data.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'test-results/qr-terminal-layout');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const styles=[...index.matchAll(/<style[^>]*>([\s\S]*?)<\/style>|<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(m=>m[1]!==undefined?'<style>'+m[1]+'</style>':m[0]).join('\n');
const html=`<!doctype html><html lang="de" data-sf-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><div id="appShell" style="display:block;padding:20px;height:auto;overflow:visible"><section id="view-time" class="view active"><div id="timeStats"></div></section></div><script>
window.fixture={terminals:[{id:'qa1',name:'QR-Testterminal',is_active:false,pilot_mode:false},{id:'qa2',name:'QA EAST',is_active:true,pilot_mode:false},{id:'qa3',name:'QA WEST',is_active:false,pilot_mode:false},{id:'qa4',name:'Pilotterminal mit einem längeren Namen',is_active:false,pilot_mode:true,pilot_employee_ids:['e1'],pilot_employee_names:['Fiktive Testperson']}].map(t=>({...t,location_note:'Fiktiver Eingang',updated_at:'2026-10-10T12:00:00Z'}))};
window.SFBackend={role:'OWNER',ready:false,companyId:'layout-fixture',client:{rpc:async n=>({data:n==='manager_list_time_qr_terminals'?fixture.terminals:n==='manager_list_time_qr_pilot_candidates'?[{id:'e1',display_name:'Fiktive Testperson',personnel_no:'0001'}]:[],error:null})}};
window.SFCompanyProfile={load:async()=>{},current:()=>({can_edit:SFBackend.role==='OWNER'}),siteOptions:()=>'<option value="">Kein Standort zugeordnet</option><option value="site1">Fiktiver Unternehmensstandort mit einem langen Namen</option>'};
</script><script src="/assets/supabase-qr-terminal-admin-v1.js"></script><script src="/assets/supabase-qr-pilot-guard-v1.js"></script></body></html>`;
let server,browser;
async function main(){
 fs.mkdirSync(out,{recursive:true});server=http.createServer((req,res)=>{const p=new URL(req.url,'http://fixture.test').pathname;if(p==='/'){res.setHeader('Content-Type','text/html');res.end(html);return}const file=path.resolve(root,'.'+p);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return}res.setHeader('Content-Type',p.endsWith('.css')?'text/css':p.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(fs.readFileSync(file));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,...(process.env.SF_CHROME_PATH?{executablePath:process.env.SF_CHROME_PATH}:{})});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.evaluate(async()=>{await SFBackend.qrTerminalAdmin.refresh();await SFBackend.qrOperationGuard.refresh()});await page.locator('.sf-qrt-pilot').last().waitFor();
 for(const theme of ['dark','light'])for(const width of [1920,1366,1024,768,390,320])for(const fontSize of [16,24]){
  await page.setViewportSize({width,height:1000});await page.evaluate(({theme,fontSize})=>{document.documentElement.dataset.sfTheme=theme;document.documentElement.style.fontSize=fontSize+'px';document.documentElement.classList.toggle('sf-font-large',fontSize===24)},{theme,fontSize});
  const issues=await page.evaluate(()=>{
   const issues=[],rect=e=>e.getBoundingClientRect(),overlap=(a,b)=>{a=rect(a);b=rect(b);return a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1},contains=(a,b)=>{a=rect(a);b=rect(b);return b.left>=a.left-1&&b.right<=a.right+1&&b.top>=a.top-1&&b.bottom<=a.bottom+1};
   if(document.documentElement.scrollWidth>innerWidth+2)issues.push('page overflow');
   const panels=[...document.querySelectorAll('.sf-qrt-pilot')];if(panels.length!==4)issues.push('missing terminal panels');
   const edges=panels.map(rect);if(edges.some(e=>Math.abs(e.left-edges[0].left)>1||Math.abs(e.right-edges[0].right)>1))issues.push('operation frames have different widths');
   for(const row of document.querySelectorAll('.sf-qrt-row')){
    const panel=row.querySelector('.sf-qrt-pilot'),main=row.querySelector('.sf-qrt-main'),actions=row.querySelector('.sf-qrt-actions'),css=getComputedStyle(row);if(Math.abs(rect(panel).width-(row.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight)))>1)issues.push('operation frame does not use the card content width');
    for(const el of [main,actions,panel,...row.querySelectorAll('select,button,.sf-qrt-mode-help')])if(!contains(row,el))issues.push('control outside terminal: '+el.textContent.slice(0,35));
    if(overlap(main,actions)||overlap(panel,actions)||overlap(panel,main))issues.push('terminal sections overlap');
    const mode=panel.querySelector('.sf-qrt-mode-grid');for(const el of mode.children)if(!contains(panel,el))issues.push('mode outside operation frame');if(overlap(mode.children[0],mode.children[1]))issues.push('mode label and help overlap');
    if(row.scrollWidth>row.clientWidth+1)issues.push('terminal overflow '+row.dataset.qrtId+' '+row.scrollWidth+'/'+row.clientWidth+' '+[...row.querySelectorAll('*')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.className+':'+e.scrollWidth+'/'+e.clientWidth).join(','));
   }
   const head=document.querySelector('.sf-qrt-head'),create=head.querySelector('.sf-qrt-create');for(const el of create.children)if(!contains(head,el))issues.push('create control outside header');const controls=[...create.children];for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++)if(overlap(controls[i],controls[j]))issues.push('create controls overlap');
   return issues;
  });assert.deepEqual(issues,[],theme+'/'+width+'/'+fontSize);
  if(fontSize===16&&[1920,390].includes(width))await page.locator('.sf-qrt-row').first().screenshot({path:path.join(out,theme+'-'+width+'.png')});
 }
 await page.evaluate(async()=>{SFBackend.role='PLANNER';await SFBackend.qrTerminalAdmin.refresh();await SFBackend.qrOperationGuard.refresh()});assert.equal(await page.locator('[data-qrt-site-save]:visible').count(),0);assert.equal(await page.locator('[data-qrt-mode]').count(),0);assert.equal(await page.locator('.sf-qrt-pilot').count(),4);assert.deepEqual(errors,[]);console.log('QR terminal layout QA passed: equal operation frames, contained controls, no overlaps, dark/light, desktop/mobile, large text and read-only role.');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();await new Promise(r=>server?.close(r)||r())});
