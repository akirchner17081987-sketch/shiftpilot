// Real built pages and enforced response headers. Only fictitious data is used.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{chromium}=require('@playwright/test');
const root=path.resolve(__dirname,'../..'),dist=path.join(root,'dist'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const policy=JSON.parse(read('vercel.json')).headers.find(r=>r.source==='/(.*)').headers.find(h=>h.key==='Content-Security-Policy').value;
const auth=require('../fixtures/site-loading-auth.cjs'),data=require('../fixtures/today-data.cjs').fixture();data.company_id='qa';
const registry=Object.fromEntries([...read('assets/csp-actions-v1.js').matchAll(/"([^"]+)":function\(event\)\{([^\n]+)\},?$/gm)].map(m=>[m[1],m[2]]));
const key=body=>{const found=Object.entries(registry).find(([,v])=>v===body);assert.ok(found,'Known action '+body);return found[0];};
const action={choose:key("chooseType(decodeURIComponent(this.getAttribute('data-sf-click-arg0')||''))"),day:key("dayClick(event,decodeURIComponent(this.getAttribute('data-sf-click-arg0')||''))"),back:key('showLanding();return false'),month:key('SFAutoPlanWorkspace.stairMonth(this.value)'),keydown:key('handleAbsenceEmployeeKeydown(event)'),mouse:key("event.preventDefault();selectAbsenceEmployee(decodeURIComponent(this.getAttribute('data-sf-mousedown-arg0')||''))"),edit:key("editAssignment(decodeURIComponent(this.getAttribute('data-sf-click-arg0')||''))")};
const eventsFixture=`window.qa={calls:[],events:[],overrides:0,writes:0,renders:0};window.chooseType=v=>qa.calls.push(v);window.dayClick=(ev,v)=>qa.events.push({value:v,current:ev.currentTarget.id,target:ev.target.id});window.showLanding=()=>qa.back=true;window.SFAutoPlanWorkspace={stairMonth:v=>qa.month=v};window.handleAbsenceEmployeeKeydown=ev=>qa.keydown={key:ev.key,current:ev.currentTarget.id};window.selectAbsenceEmployee=v=>qa.selected=v;window.editAssignment=id=>qa.edited=id;window.assignments=[{id:'fixture-assignment',employeeId:'fictitious',type:'FD',date:'2027-01-04'}];window.employees=[];window.saveAll=()=>qa.writes++;window.renderCalendar=()=>qa.renders++;window.renderAssignments=()=>'<div class="assignment" data-assignment-id="fixture-assignment" data-sf-click="${action.edit}" data-sf-click-arg0="fixture-assignment"></div>';`;
let server,browser,origin;let passed=0;const results=[];
function html(body,scripts=[]){return '<!doctype html><html><head><meta charset="utf-8"><script src="/assets/csp-actions-v1.js"></script></head><body>'+body+scripts.map(src=>'<script src="'+src+'"></script>').join('')+'</body></html>';}
async function main(){
 server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),report=u.searchParams.get('mode')==='report',role=u.searchParams.get('role');
  res.setHeader(report?'Content-Security-Policy-Report-Only':'Content-Security-Policy',policy);res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(u.pathname==='/__events'){res.setHeader('Content-Type','text/html');return res.end(html(`<button id="choose" data-sf-click="${action.choose}" data-sf-click-arg0="FD"><span id="nested">Auswahl</span></button><button id="day" data-sf-click="${action.day}" data-sf-click-arg0="2027-01-04"><span id="day-child">Tag</span></button><a id="back" href="/#wrong" data-sf-click="${action.back}">Zurück</a><input id="month" data-sf-change="${action.month}"><input id="keys" data-sf-keydown="${action.keydown}"><button id="mouse" data-sf-mousedown="${action.mouse}" data-sf-mousedown-arg0="employee">Wählen</button>`,['/__events-fixture.js','/assets/assignment-quick-delete-v1.js']));}
  if(u.pathname==='/__exports'){res.setHeader('Content-Type','text/html');return res.end(html('<canvas id="qr"></canvas>',['/assets/vendor/xlsx-0.18.5.min.js','/assets/vendor/jspdf-2.5.2.min.js','/assets/vendor/jspdf-autotable-3.8.4.min.js','/assets/vendor/qrcode-1.5.4.min.js','/assets/vendor/jsqr-1.4.0.js']));}
  if(u.pathname==='/__events-fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(eventsFixture);}
  if(u.pathname==='/__prep.js'){res.setHeader('Content-Type','text/javascript');return res.end('window.qa={role:'+JSON.stringify(role)+',start:performance.now(),rpcs:[],writes:[],today:'+JSON.stringify(data)+'};');}
  if(u.pathname==='/__parsed.js'){res.setHeader('Content-Type','text/javascript');return res.end('qa.parsedMs=performance.now()-qa.start;');}
  const rel=u.pathname==='/'?'index.html':decodeURIComponent(u.pathname).slice(1),file=path.resolve(dist,rel);
  if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end();}
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
  let body=fs.readFileSync(file);
  if(role&&rel==='index.html')body=body.toString().replace('<head>','<head><script src="/__prep.js?role='+role+'"></script>').replace('</body>','<div id="qaParsed" hidden></div><script src="/__parsed.js"></script></body>');
  if(role&&rel==='assets/supabase-auth-v1.js')body=auth;
  res.end(body);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,...(process.env.SF_CSP_CHROMIUM_PATH?{executablePath:process.env.SF_CSP_CHROMIUM_PATH}:{})});
 async function pageFor(url,viewport={width:1440,height:1000},extra){
  const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());page.on('console',m=>{if(/violates the following Content Security Policy|Refused to (?:load|execute).*Content Security Policy/i.test(m.text()))errors.push(m.text());});
  await page.addInitScript(()=>{window.cspViolations=[];document.addEventListener('securitypolicyviolation',e=>cspViolations.push({directive:e.effectiveDirective,blocked:e.blockedURI,disposition:e.disposition}));});
  await page.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin!==origin){if(extra&&await extra(r,u))return;external.push(u.href);return r.abort();}
   // Authentication is the only synthetic module; all other shipped modules are unchanged.
   if(url.includes('role=')&&u.pathname==='/assets/supabase-auth-v1.js')return r.fulfill({contentType:'text/javascript',body:auth});
   return r.continue();});
  await page.goto(origin+url);return {context,page,errors,external};
 }
 async function clean(h,label){assert.deepEqual(h.errors,[],label+' JS errors');assert.deepEqual(h.external,[],label+' external network');assert.deepEqual(await h.page.evaluate(()=>cspViolations),[],label+' CSP violations');await h.context.close();results.push(label);passed++;}
 for(const mode of ['report','enforce'])for(const role of ['SIGNED_OUT','OWNER','ADMIN','PLANNER','DISPATCHER','VIEWER','TIME_TRACKING','EMPLOYEE']){
  const h=await pageFor('/?role='+role+'&mode='+mode,role==='PLANNER'?{width:390,height:844}:undefined);
  await h.page.waitForFunction(()=>window.qa?.done,null,{timeout:45000}).catch(async e=>{console.error(role,h.errors,await h.page.evaluate(()=>window.qa));throw e;});
  assert.deepEqual(await h.page.evaluate(()=>qa.writes),[]);
  if(!['SIGNED_OUT','EMPLOYEE'].includes(role))assert.equal(await h.page.locator('#sfBillingNav').evaluate(n=>n.hidden),!['OWNER','ADMIN'].includes(role));
  if(role==='EMPLOYEE'){await h.page.locator('#sfEmployeePortal').waitFor({state:'attached',timeout:10000}).catch(async e=>{console.error('Employee fixture',h.errors,await h.page.evaluate(()=>({role:SFBackend.role,ready:SFBackend.ready,qa,violations:cspViolations,body:document.body.innerText.slice(-1000)})));throw e;});}
  if(role==='TIME_TRACKING')assert.equal(await h.page.locator('#view-time').evaluate(n=>n.classList.contains('active')),true);
  await clean(h,mode+' '+role);
 }
 // Real local Supabase SDK and original authentication UI, without a signed-in account.
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const h=await pageFor('/',viewport);await h.page.locator('[data-entry-area="verwaltung"]').waitFor({timeout:45000});await h.page.locator('[data-entry-area="verwaltung"]').click();await h.page.locator('#sfEmail').waitFor();assert.equal(await h.page.evaluate(()=>typeof SFBackend.client.auth.signInWithPassword),'function');await clean(h,'real SDK login '+viewport.width);
 }
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const h=await pageFor('/__events',viewport),p=h.page;await p.locator('#nested').click();assert.deepEqual(await p.evaluate(()=>qa.calls),['FD']);
  const malicious="');window.CSP_PWNED=1;//<img src=x onerror=alert(1)>";
  await p.evaluate(v=>{const n=document.querySelector('#choose');n.setAttribute('data-sf-click-arg0',encodeURIComponent(v));n.click();},malicious);
  assert.equal(await p.evaluate(()=>qa.calls.at(-1)),malicious);assert.equal(await p.evaluate(()=>window.CSP_PWNED),undefined);
  await p.locator('#day-child').click();assert.deepEqual(await p.evaluate(()=>qa.events),[{value:'2027-01-04',current:'day',target:'day-child'}]);
  assert.equal(await p.evaluate(()=>document.getElementById('back').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}))),false);assert.equal(await p.evaluate(()=>qa.back),true);
  await p.locator('#month').fill('2027-02');await p.locator('#month').dispatchEvent('change');assert.equal(await p.evaluate(()=>qa.month),'2027-02');
  await p.locator('#keys').press('Enter');assert.deepEqual(await p.evaluate(()=>qa.keydown),{key:'Enter',current:'keys'});
  assert.equal(await p.evaluate(()=>document.getElementById('mouse').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}))),false);assert.equal(await p.evaluate(()=>qa.selected),'employee');
  await p.evaluate(()=>{const n=document.getElementById('choose');n.onclick=()=>qa.overrides++;n.click();});assert.equal(await p.evaluate(()=>qa.overrides),1);assert.equal(await p.evaluate(()=>qa.calls.length),2);
  await p.evaluate(k=>{const n=document.createElement('button');n.setAttribute('data-sf-click',k);n.setAttribute('data-sf-click-arg0','dynamic');document.body.append(n);n.click();const focus=document.createElement('input');focus.setAttribute('data-sf-focus',k);document.body.append(focus);focus.focus();},action.choose);assert.equal(await p.evaluate(()=>qa.calls.length),3);
  await p.evaluate(()=>{document.body.insertAdjacentHTML('beforeend','<section id="assignment">'+renderAssignments('2027-01-04')+'</section>');document.getElementById('assignment').addEventListener('click',()=>qa.unwantedBubble=true);});
  p.removeAllListeners('dialog');p.on('dialog',d=>d.accept());await p.locator('.sp-assignment-x').click();assert.equal(await p.evaluate(()=>assignments.length),0);assert.equal(await p.evaluate(()=>qa.writes),1);assert.equal(await p.evaluate(()=>qa.edited),undefined);assert.equal(await p.evaluate(()=>qa.unwantedBubble),undefined);
  await clean(h,'callbacks '+viewport.width);
 }

 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const calls=[],h=await pageFor('/qr-time.html?t='+'e'.repeat(64),viewport,async(r,u)=>{
   if(u.href!=='https://zbvloohfjleadjnqhbbh.supabase.co/functions/v1/qr-independent')return false;
   const request=r.request(),headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
   if(request.method()==='OPTIONS'){await r.fulfill({status:204,headers});return true;}
   const input=request.postDataJSON();calls.push(input.action);
   const data=['LOGIN','SET_PIN'].includes(input.action)?{ok:true,sessionToken:'f'.repeat(64)}:{ok:true,state:'READY',name:'Fiktive Testperson',breaks:[],timezone:'Europe/Berlin',terminal_name:'Fiktiver Standort'};
   await r.fulfill({headers,contentType:'application/json',body:JSON.stringify(data)});return true;
  }),p=h.page;
  await p.locator('#personnel').fill('FIKTIV');await p.locator('#pin').fill('739281');await p.locator('#loginButton').click();await p.locator('#clock').waitFor();assert.equal(await p.locator('#pin').inputValue(),'');
  await p.locator('#logout').click();await p.locator('#loginMode').selectOption('SETUP');await p.locator('#setupCode').fill('482719530618');await p.locator('#pin').fill('739281');await p.locator('#pinRepeat').fill('739281');await p.locator('#loginButton').click();await p.locator('#clock').waitFor();assert.ok(calls.includes('LOGIN')&&calls.includes('SET_PIN'));assert.equal(calls.includes('BEGIN'),false);
  await clean(h,'QR PIN and setup '+viewport.width);
 }
 const demoCalls=[],demo=await pageFor('/demo.html',undefined,async(r,u)=>{
  if(!u.href.startsWith('https://zbvloohfjleadjnqhbbh.supabase.co/functions/v1/demo-'))return false;
  const request=r.request(),headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type,authorization,x-demo-failure','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
  if(request.method()==='OPTIONS'){await r.fulfill({status:204,headers});return true;}
  demoCalls.push(u.pathname+':'+request.method());
  const logged=request.method()==='POST'||!!request.headers().authorization;
  await r.fulfill({status:logged?200:401,headers,contentType:'application/json',body:JSON.stringify({ok:logged,accessToken:'fictitious-demo-token',expiresAt:new Date(Date.now()+3600000).toISOString()})});return true;
 });await demo.page.locator('#demoUser').fill('FIKTIV');await demo.page.locator('#demoPassword').fill('fiktives-demo-passwort');await demo.page.locator('#demoSubmit').click();
 await demo.page.waitForFunction(()=>window.__sfDemoModeV1&&window.SFBackend?.ready&&!document.documentElement.classList.contains('sf-demo-booting'),null,{timeout:45000}).catch(async e=>{console.error('Demo',demo.errors,await demo.page.evaluate(()=>({violations:cspViolations,text:document.body.innerText.slice(-1500)})));throw e;});
 assert.ok(demoCalls.some(x=>x.endsWith('demo-auth:POST')));await clean(demo,'demo document rewrite and boot');
 const exports=await pageFor('/__exports');const generated=await exports.page.evaluate(async()=>{
  const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['Fiktiv','Stunden'],['Testperson',8]]),'Test');const bytes=XLSX.write(workbook,{type:'array',bookType:'xlsx'}),parsed=XLSX.read(bytes,{type:'array'});
  const pdf=new jspdf.jsPDF();pdf.autoTable({head:[['Fiktiv','Stunden']],body:[['Testperson','8']]});const pdfBytes=new Uint8Array(pdf.output('arraybuffer'));
  const text='https://schichtfunk.de/qr-time.html?t='+'e'.repeat(64),canvas=document.getElementById('qr');await QRCode.toCanvas(canvas,text,{width:512,margin:4});const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);const qr=jsQR(pixels.data,pixels.width,pixels.height);
  return {xlsx:XLSX.utils.sheet_to_json(parsed.Sheets.Test,{header:1}),pdfHeader:new TextDecoder().decode(pdfBytes.slice(0,5)),pdfBytes:pdfBytes.length,qr:qr?.data,expected:text};
 });assert.deepEqual(generated.xlsx,[['Fiktiv','Stunden'],['Testperson',8]]);assert.equal(generated.pdfHeader,'%PDF-');assert.ok(generated.pdfBytes>1000);assert.equal(generated.qr,generated.expected);await clean(exports,'local XLSX PDF QR libraries');
 // Native Chromium CSP enforcement, not a source-text assertion or eval-based test.
 const attack=await pageFor('/__events');await attack.page.evaluate(()=>{
  const script=document.createElement('script');script.textContent='window.CSP_INLINE_RAN=1';document.head.append(script);
  const image=document.createElement('img');image.setAttribute('onerror','window.CSP_EVENT_RAN=1');image.src='/__missing.png';document.body.append(image);
  const cdn=document.createElement('script');cdn.src='https://cdn.jsdelivr.net/npm/evil.js';document.head.append(cdn);
 });await attack.page.waitForFunction(()=>cspViolations.some(v=>v.directive==='script-src-attr')&&cspViolations.filter(v=>v.directive==='script-src-elem').length>=2);
 assert.equal(await attack.page.evaluate(()=>window.CSP_INLINE_RAN),undefined);assert.equal(await attack.page.evaluate(()=>window.CSP_EVENT_RAN),undefined);assert.deepEqual(attack.external,[]);assert.ok((await attack.page.evaluate(()=>cspViolations)).every(v=>v.disposition==='enforce'));await attack.context.close();passed++;results.push('inline/attribute/CDN injection blocked');
 console.log(JSON.stringify({passed,results,realServiceCalls:0}));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();if(server)await new Promise(r=>{server.closeAllConnections();server.close(r);});});
