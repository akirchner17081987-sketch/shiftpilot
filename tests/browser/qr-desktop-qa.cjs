// Built CSP-safe desktop and QR pages, shared synthetic server state; zero live punches.
const {chromium}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),dist=path.join(root,'dist');
const id='00000000-0000-4000-8000-000000000022',other='00000000-0000-4000-8000-000000000023';
(async()=>{
 const browser=await chromium.launch({headless:true});let passed=0;
 try{for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:320,height:844}]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),calls=[],errors=[];let offline=true;
  let state={ok:true,state:'READY',name:'Fiktive Testperson',breaks:[],timezone:'Europe/Berlin',terminal_name:'VOC TEST'};
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.hostname==='qr.invalid'){
    const file=path.resolve(dist,'.'+(url.pathname==='/qr-time'?'/qr-time.html':url.pathname));
    if(!file.startsWith(dist+'/')||!fs.existsSync(file))return route.abort();
    return route.fulfill({headers:{'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src https://zbvloohfjleadjnqhbbh.supabase.co; object-src 'none'; base-uri 'self'"},contentType:file.endsWith('.html')?'text/html':/\.m?js$/.test(file)?'application/javascript':'image/svg+xml',body:fs.readFileSync(file)});
   }
   if(url.pathname==='/functions/v1/qr-independent'){
    const headers={'Access-Control-Allow-Origin':'https://qr.invalid','Access-Control-Allow-Headers':'content-type'};
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
    const input=request.postDataJSON();calls.push(input);
    const reply=(body,status=200)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(body)});
    if(input.action==='DESKTOP_TERMINALS')return offline?reply({ok:false,error:'Verbindung unterbrochen'},503):reply({ok:true,terminals:[{id,company_name:'Betrieb A',terminal_name:'VOC TEST'},{id:other,company_name:'Betrieb B',terminal_name:'VOC TEST'}]});
    if(input.action==='LOGIN'||input.action==='SET_PIN')return input.pin==='382719'?reply({ok:false,error:'Anmeldung nicht möglich.'},401):reply({ok:true,sessionToken:'f'.repeat(64)});
    const now=new Date().toISOString();
    if(input.action==='CLOCK_IN')state={...state,state:'RUNNING',started_at:now,ended_at:null};
    if(input.action==='BREAK_START')state={...state,state:'BREAK',breaks:[{number:1,started_at:now,ended_at:null}]};
    if(input.action==='BREAK_END'){state.state='RUNNING';state.breaks[0].ended_at=now}
    if(input.action==='CLOCK_OUT')state={...state,state:'READY',ended_at:now};
    return reply({...state,as_of:now,punched_at:now});
   }
   throw new Error('Unexpected service request: '+url.hostname);
  });
  await page.goto('https://qr.invalid/qr-time?entry=desktop');await page.locator('#desktopDirectoryRetry').waitFor();assert.equal(await page.locator('#login').isVisible(),false);passed++;
  offline=false;await page.locator('#desktopDirectoryRetry').click();await page.locator('#desktopTerminal').waitFor();
  assert.equal(await page.locator('#loginButton').isDisabled(),true);assert.equal(await page.locator('#loginMode option[value="LEGACY"]').count(),1);passed++;
  assert.deepEqual(await page.locator('#desktopTerminal option').allTextContents(),['Bitte auswählen','Betrieb A · VOC TEST','Betrieb B · VOC TEST']);
  await page.locator('#desktopTerminal').selectOption(other);await page.locator('#personnel').fill('FIKTIV');await page.locator('#pin').fill('739281');
  await page.locator('#desktopTerminal').selectOption(id);assert.equal(await page.locator('#pin').inputValue(),'');assert.equal(await page.locator('#personnel').inputValue(),'');passed++;
  await page.locator('#personnel').fill('FIKTIV');await page.locator('#pin').fill('382719');await page.locator('#loginButton').click();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('nicht möglich'));assert.equal(await page.locator('#pin').inputValue(),'');passed++;
  await page.locator('#pin').fill('739281');await page.locator('#loginButton').click();await page.locator('#clock').waitFor();
  assert.equal(calls.filter(c=>['CLOCK_IN','BREAK_START','BREAK_END','CLOCK_OUT'].includes(c.action)).length,0);assert.equal(await page.locator('#desktopTerminal').isVisible(),false);passed++;
  await page.locator('#start').click();await page.waitForFunction(()=>document.querySelector('#state').textContent==='Arbeitszeit läuft');
  const phone=await context.newPage();await phone.goto('https://qr.invalid/qr-time?t='+'e'.repeat(64));await phone.locator('#personnel').fill('FIKTIV');await phone.locator('#pin').fill('739281');await phone.locator('#loginButton').click();await phone.locator('#clock').waitFor();assert.equal(await phone.locator('#state').textContent(),'Arbeitszeit läuft');passed++;
  await phone.locator('#pauseStart').click();await phone.waitForFunction(()=>document.querySelector('#state').textContent==='Pause läuft');
  await page.locator('#statusRefresh').click();await page.waitForFunction(()=>document.querySelector('#state').textContent==='Pause läuft');
  await page.locator('#pauseEnd').click();await page.waitForFunction(()=>document.querySelector('#state').textContent==='Arbeitszeit läuft');
  await phone.locator('#statusRefresh').click();await phone.waitForFunction(()=>document.querySelector('#state').textContent==='Arbeitszeit läuft');
  await phone.locator('#end').click();await phone.waitForFunction(()=>document.querySelector('#state').textContent==='Dienst beendet');
  await page.locator('#statusRefresh').click();await page.waitForFunction(()=>document.querySelector('#state').textContent==='Dienst beendet');passed++;
  assert.deepEqual(calls.filter(c=>['CLOCK_IN','BREAK_START','BREAK_END','CLOCK_OUT'].includes(c.action)).map(c=>c.action),['CLOCK_IN','BREAK_START','BREAK_END','CLOCK_OUT']);
  assert.ok(calls.filter(c=>c.terminalId).every(c=>!('qrToken'in c)));assert.ok(calls.find(c=>c.action==='CLOCK_IN').terminalId===id);assert.ok(calls.find(c=>c.action==='CLOCK_OUT').qrToken);passed++;
  await page.locator('#logout').click();await page.locator('#loginMode').selectOption('SETUP');await page.locator('#setupCode').fill('482719530618');await page.locator('#pin').fill('739281');await page.locator('#pinRepeat').fill('739281');await page.locator('#loginButton').click();await page.locator('#clock').waitFor();
  const setup=calls.find(c=>c.action==='SET_PIN');assert.equal(setup.terminalId,id);assert.equal(setup.setupCode,'482719530618');assert.equal(await page.locator('#setupCode').inputValue(),'');passed++;
  await page.locator('#logout').click();await page.locator('#loginMode').selectOption('LEGACY');
  assert.equal(await page.locator('#pin').isVisible(),false);assert.equal(await page.locator('#startDate').isVisible(),true);passed++;
  await page.locator('#startDate').fill('15012020');await page.locator('#loginButton').click();await page.locator('#clock').waitFor();
  const dateLogin=calls.findLast(c=>c.action==='LOGIN');assert.equal(dateLogin.terminalId,id);assert.equal(dateLogin.startDate,'2020-01-15');assert.ok(!('pin'in dateLogin));assert.equal(await page.locator('#startDate').inputValue(),'');passed++;
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);passed++;
  if(viewport.width===1280){const out=path.join(root,'test-results/qr-desktop');fs.mkdirSync(out,{recursive:true});await page.locator('#logout').click();await page.screenshot({path:path.join(out,'pc-login.png')});}
  await context.close();
 }
 console.log(JSON.stringify({passed,viewports:[1280,390,320],realServiceCalls:0}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
