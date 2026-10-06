const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
test.use({video:'off',launchOptions:process.env.SF_QR_BROWSER_EXECUTABLE?{executablePath:process.env.SF_QR_BROWSER_EXECUTABLE}:{}});
const baseline=Date.parse('2026-10-06T04:00:00Z');
async function qr(page,state='READY'){
  let status={ok:true,state,name:'Fiktive Testperson',terminal_name:'Fiktiver Standort',started_at:state==='READY'?null:'2026-10-05T23:00:00Z',ended_at:null,breaks:[]};
  const behavior={loss:'',offline:false},saved=new Map(),calls=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date(baseline-1000)});await page.clock.pauseAt(new Date(baseline));
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.hostname==='qr-pause.test'){
      const file=url.pathname==='/qr-time.html'?'qr-time.html':url.pathname==='/assets/qr-pause-total-v1.js'?'assets/qr-pause-total-v1.js':url.pathname==='/assets/schichtfunk-logo.svg'?'assets/schichtfunk-logo.svg':null;
      return file?route.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':'image/svg+xml',body:fs.readFileSync(path.join(root,file))}):route.abort();
    }
    if(url.hostname!=='zbvloohfjleadjnqhbbh.supabase.co')throw new Error('Unexpected external request');
    const respond=body=>route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS'}});
    const input=req.postDataJSON();calls.push(input);
    if(input.action==='LOGIN')return respond({ok:true,sessionToken:'f'.repeat(64)});
    if(input.action==='STATUS'&&behavior.offline)return route.abort();
    if(input.action!=='STATUS'&&!saved.has(input.requestId)){
      saved.set(input.requestId,{action:input.action,stamp:new Date(baseline).toISOString()});
      if(input.action==='CLOCK_IN')status={...status,state:'RUNNING',started_at:new Date(baseline).toISOString(),ended_at:null};
      if(input.action==='CLOCK_OUT')status={...status,state:'READY',ended_at:new Date(baseline).toISOString()};
    }
    if(input.action===behavior.loss){behavior.loss='';return route.abort()}
    const stored=saved.get(input.requestId);
    return respond({...status,as_of:new Date(baseline).toISOString(),punched_at:stored?.stamp,request_processed:!!stored,processed_action:stored?.action,processed_at:stored?.stamp});
  });
  await page.goto('http://qr-pause.test/qr-time.html?t='+'e'.repeat(64));await page.locator('#personnel').fill('FIKTIV');await page.locator('#startDate').fill('15012020');await page.locator('#loginButton').click();await expect(page.locator('#clock')).toBeVisible();
  return{behavior,calls,saved,errors};
}
test('lost clock-in reply recovers its stored request in Chromium',async({page})=>{
  const h=await qr(page);h.behavior.loss='CLOCK_IN';await page.locator('#start').click();
  await expect(page.locator('#state')).toHaveText('Arbeitszeit läuft');await expect(page.locator('#message')).toContainText('gespeichert');expect(h.saved.size).toBe(1);expect(h.calls.at(-1).action).toBe('STATUS');expect(h.errors).toEqual([]);
});
test('lost clock-out reply freezes the counter at the recorded end',async({page})=>{
  const h=await qr(page,'RUNNING');h.behavior.loss='CLOCK_OUT';await page.locator('#end').click();await expect(page.locator('#state')).toHaveText('Dienst beendet');await page.clock.runFor(60000);await expect(page.locator('#attendanceTotal')).toHaveText('05:00:00');expect(h.saved.size).toBe(1);expect(h.errors).toEqual([]);
});
test('unconfirmed punch can retry the same identifier without duplicate attendance',async({page})=>{
  const h=await qr(page);h.behavior.loss='CLOCK_IN';h.behavior.offline=true;await page.locator('#start').click();await expect(page.locator('#retryBooking')).toBeVisible();await expect(page.locator('#start')).toBeDisabled();await expect(page.locator('#logout')).toBeEnabled();
  h.behavior.offline=false;await page.locator('#retryBooking').click();await expect(page.locator('#state')).toHaveText('Arbeitszeit läuft');expect(h.saved.size).toBe(1);const attempts=h.calls.filter(c=>c.action==='CLOCK_IN');expect(attempts).toHaveLength(2);expect(attempts[0].requestId).toBe(attempts[1].requestId);expect(h.errors).toEqual([]);
});

async function manager(page,{width=390,theme='light',lost=false,stale=false,role='TIME_TRACKING'}={}){
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:900});
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());if(url.hostname!=='qr-pause.test')throw new Error('Unexpected external request');
    if(url.pathname==='/manager')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="de" data-sf-theme="${theme}"><head><style>:root{--bg:${theme==='light'?'#e4e9ee':'#091724'};--bg2:${theme==='light'?'#f0f3f6':'#112334'};--text:${theme==='light'?'#142b3d':'#eef7ff'};--muted:${theme==='light'?'#475e70':'#a7bbcb'};--line:${theme==='light'?'#b6c5ce':'#294559'};--teal:#72e1c5}body{margin:0;font-family:system-ui}</style></head><body><main id="view-time"></main></body></html>`});
    return route.abort();
  });
  await page.goto('http://qr-pause.test/manager');
  await page.evaluate(({lost,stale,role})=>{
    let record={id:'fictitious-shift',revision:'before',timezone:'Europe/Berlin',employee_name:'Fiktive Testperson mit sehr langem Namen',terminal_name:'Fiktiver Standort mit vollständiger Bezeichnung',started_at:'2026-10-03T04:00:00.123456Z',ended_at:null,breaks:[{number:1,started_at:'2026-10-03T06:00:00Z',ended_at:null}],history:[]};
    window.qaCalls=[];window.SFBackend={role,companyId:'fictitious-company',client:{rpc(name,args){
      window.qaCalls.push({name,args});let output;
      if(name==='manager_qr_independent_detail')output=Promise.resolve({data:structuredClone(record)});
      else if(stale)output=Promise.resolve({error:{message:'Die Buchung wurde inzwischen geändert. Bitte schließen und erneut öffnen'}});
      else{
        const old=structuredClone(record);record={...record,revision:'after',started_at:args.p_started_at,ended_at:args.p_ended_at,breaks:args.p_breaks.map(p=>({...p,ended_at:p.ended_at||args.p_ended_at})),history:[{created_at:'2026-10-06T04:00:00Z',reason:args.p_reason,metadata:{expectedRevision:args.p_expected_revision},old_values:old,new_values:{...record,started_at:args.p_started_at,ended_at:args.p_ended_at}}]};
        output=lost?Promise.resolve({error:{message:'Fiktive Antwort verloren'}}):Promise.resolve({data:structuredClone(record)});
      }
      output.abortSignal=()=>output;return output;
    }}};window.renderTimeTracking=async()=>{};
  },{lost,stale,role});
  await page.addScriptTag({content:fs.readFileSync(path.join(root,'assets/qr-manager-correction-v1.js'),'utf8')});
  await page.evaluate(()=>window.SFBackend.qrCorrection.open('fictitious-shift'));
  return{errors};
}
for(const width of [320,1280])for(const theme of ['light','dark'])test(`manager correction is readable at ${width}px in ${theme} mode`,async({page},info)=>{
  const h=await manager(page,{width,theme});await expect(page.locator('#sfQrCorrection')).toBeVisible();await expect(page.locator('#sfQrCorrectionSave')).toBeEnabled();
  expect(await page.locator('.sf-qrc-dialog').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&el.scrollWidth<=el.clientWidth&&[...el.querySelectorAll('label,small,p,button')].every(x=>parseFloat(getComputedStyle(x).fontSize)>=14)})).toBe(true);
  await info.attach(`qr-correction-${theme}-${width}`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});expect(h.errors).toEqual([]);
});
test('manager closes an old booking with reason and paid open pause',async({page})=>{
  const h=await manager(page);await page.locator('#sfQrCorrectionSave').click();expect((await page.evaluate(()=>qaCalls.filter(c=>c.name==='manager_correct_qr_independent_shift'))).length).toBe(0);
  await page.locator('#sfQrCorrectionEnd').fill('2026-10-03T14:00');await page.locator('#sfQrCorrectionReason').fill('Fiktiv: tatsächliches Dienstende bestätigt');await page.locator('#sfQrCorrectionSave').click();await expect(page.locator('#sfQrCorrection')).toHaveCount(0);
  const calls=await page.evaluate(()=>qaCalls.filter(c=>c.name==='manager_correct_qr_independent_shift'));expect(calls).toHaveLength(1);expect(calls[0].args.p_started_at).toBe('2026-10-03T04:00:00.123456Z');expect(calls[0].args.p_ended_at).toBe('2026-10-03T12:00:00.000Z');expect(calls[0].args.p_breaks[0].ended_at).toBeNull();expect(h.errors).toEqual([]);
});
test('lost correction reply is verified through its audit without a second save',async({page})=>{
  const h=await manager(page,{lost:true});await page.locator('#sfQrCorrectionEnd').fill('2026-10-03T14:00');await page.locator('#sfQrCorrectionReason').fill('Fiktive bestätigte Korrektur');await page.locator('#sfQrCorrectionSave').click();await expect(page.locator('#sfQrCorrection')).toHaveCount(0);
  expect(await page.evaluate(()=>qaCalls.filter(c=>c.name==='manager_correct_qr_independent_shift').length)).toBe(1);expect(h.errors).toEqual([]);
});
test('concurrent change keeps the dialog open with an understandable message',async({page})=>{
  await manager(page,{stale:true});await page.locator('#sfQrCorrectionEnd').fill('2026-10-03T14:00');await page.locator('#sfQrCorrectionReason').fill('Fiktive Korrektur');await page.locator('#sfQrCorrectionSave').click();await expect(page.locator('#sfQrCorrectionMessage')).toContainText('inzwischen geändert');await expect(page.locator('#sfQrCorrectionClose')).toBeEnabled();
});
test('employee role cannot open a manager correction',async({page})=>{
  const h=await manager(page,{role:'EMPLOYEE'});await expect(page.locator('#sfQrCorrection')).toHaveCount(0);expect(await page.evaluate(()=>qaCalls.length)).toBe(0);expect(h.errors).toEqual([]);
});
