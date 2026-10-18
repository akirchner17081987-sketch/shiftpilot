const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'test-results/internal-messages');fs.mkdirSync(out,{recursive:true});
const fixture=`
window.__xss=false;window.__failSend=false;window.__failInbox=false;window.__delay=0;window.__calls=[];window.__sentKeys=[];
window.__contacts=[{user_id:'bob',display_name:'Test, Bob',access_role:'EMPLOYEE'},{user_id:'owner',display_name:'Inhaberin, Eva',access_role:'OWNER'},{user_id:'lead',display_name:'Leitung, Lea',access_role:'TEAM_LEAD'},{user_id:'xss',display_name:'<img src=x onerror="__xss=true">',access_role:'ADMIN'}];
window.__messages=[{id:'received-1',sender_id:'bob',recipient_id:'alice',body:'Kannst du morgen übernehmen?',created_at:'2026-10-18T10:30:00.000Z',read_at:null}];
window.SFBackend={ready:true,role:'OWNER',companyId:'company-a',user:{id:'alice'},finishSignOut(){this.ready=false;this.user=null},async switchCompany(id){this.companyId=id;__messages=[]},client:{async rpc(name,args){
 __calls.push({name,args});const delay=__delay;let data,error;
 const list=__messages.filter(m=>m.company_id===undefined||m.company_id===args.p_company_id);
 if(name==='messages_contacts')data=structuredClone(__contacts);
 if(name==='messages_unread')data=list.filter(m=>m.recipient_id===SFBackend.user.id&&!m.read_at).length;
 if(name==='messages_inbox'){
  if(__failInbox)return {error:{message:'network error'}};
  const peers=[...new Set(list.map(m=>m.sender_id===SFBackend.user.id?m.recipient_id:m.sender_id))];
  data={unread:list.filter(m=>m.recipient_id===SFBackend.user.id&&!m.read_at).length,conversations:peers.map(p=>{const row=list.filter(m=>m.sender_id===p||m.recipient_id===p).at(-1);return {...row,peer_id:p,unread:list.filter(m=>m.sender_id===p&&m.recipient_id===SFBackend.user.id&&!m.read_at).length}})};
 }
 if(name==='messages_thread'){
  const rows=list.filter(m=>(m.sender_id===args.p_peer_id&&m.recipient_id===SFBackend.user.id)||(m.recipient_id===args.p_peer_id&&m.sender_id===SFBackend.user.id)).sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
  data=structuredClone(rows.filter(m=>!args.p_before_at||m.created_at<args.p_before_at||(m.created_at===args.p_before_at&&m.id<args.p_before_id)).slice(0,50));
 }
 if(name==='messages_mark_read'){let n=0;list.forEach(m=>{if(args.p_message_ids.includes(m.id)&&m.recipient_id===SFBackend.user.id&&!m.read_at){m.read_at=new Date().toISOString();n++}});data=n}
 if(name==='messages_send'){
  __sentKeys.push(args.p_client_message_id);const old=__messages.find(m=>m.client_message_id===args.p_client_message_id);
  if(!old)__messages.push({id:crypto.randomUUID(),sender_id:SFBackend.user.id,recipient_id:args.p_recipient_id,body:args.p_body,created_at:new Date().toISOString(),read_at:null,client_message_id:args.p_client_message_id,company_id:args.p_company_id});
  data=old?.id||__messages.at(-1).id;
  if(__failSend)error={message:'network response lost'};
 }
 if(delay)await new Promise(r=>setTimeout(r,delay));return {data,error};
}}};`;
const html=employee=>`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#040d1d;color:#edf5ff;font-family:system-ui}.topbar,.sf-portal-top{padding:20px;display:flex;align-items:center;gap:10px}.top-actions{display:flex;gap:10px}.ghost{background:#10233b;color:#edf5ff;border:1px solid #294763;padding:10px}.spacer{flex:1}</style><link rel="stylesheet" href="/assets/internal-messages-v1.css"></head><body>${employee?'<div id="sfEmployeePortal"><div class="sf-portal-top"><b>Mitarbeiterportal</b><div class="spacer"></div><button id="sfEmployeeLogout">Abmelden</button></div></div>':'<div class="topbar"><b>Verwaltung</b><div class="spacer"></div><div class="top-actions"></div></div>'}<script>${fixture}${employee?"SFBackend.role='EMPLOYEE';":''}</script><script src="/assets/internal-messages-v1.js"></script></body></html>`;
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 for(const [name,viewport,employee] of [['desktop',{width:1440,height:1000},false],['mobile',{width:390,height:844},true],['small-mobile',{width:360,height:740},true]]){
  const page=await browser.newPage({viewport,locale:'de-DE'}),errors=[];page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='messages.test')return route.abort();if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:html(employee)});const file=path.join(root,u.pathname);return route.fulfill({contentType:file.endsWith('.css')?'text/css':'application/javascript',body:fs.readFileSync(file)})});
  await page.goto('https://messages.test/');await page.evaluate(()=>SFBackend.messages.refresh());
  const launch=page.getByRole('button',{name:'Nachrichten, 1 ungelesen',exact:true});await launch.click();
  const dialog=page.getByRole('dialog',{name:'Nachrichten',exact:true});await dialog.getByRole('button',{name:/Test, Bob/}).click();
  await dialog.locator('.sf-msg-log').getByText('Kannst du morgen übernehmen?',{exact:true}).waitFor();await page.waitForFunction(()=>__messages[0].read_at!==null);
  assert.equal(await page.locator('.sf-message-badge').isVisible(),false);
  assert.equal(await dialog.locator('.sf-msg-compose').isVisible(),true);
  await dialog.locator('textarea').fill('Hallo Bob!\n<img src=x onerror="__xss=true">');
  await page.evaluate(()=>__failSend=true);await dialog.getByRole('button',{name:'Senden',exact:true}).click();
  await dialog.getByRole('status').filter({hasText:'Senden konnte nicht bestätigt werden'}).waitFor();
  assert.match(await dialog.locator('textarea').inputValue(),/Hallo Bob/);assert.equal(await dialog.getByRole('button',{name:'Senden',exact:true}).isEnabled(),true);
  await dialog.getByRole('button',{name:'Nachrichten schließen',exact:true}).click();await page.locator('.sf-message-launch').click();await dialog.getByRole('button',{name:/Test, Bob/}).click();
  assert.match(await dialog.locator('textarea').inputValue(),/Hallo Bob/);
  await page.evaluate(()=>{__failSend=false;__delay=80});await dialog.getByRole('button',{name:'Senden',exact:true}).click();
  await page.evaluate(()=>document.querySelector('.sf-msg-compose').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  await page.waitForFunction(()=>document.querySelector('.sf-msg-compose textarea').value==='');await page.waitForFunction(()=>!document.querySelector('.sf-msg-compose textarea').disabled);
  assert.equal(await page.evaluate(()=>__messages.filter(m=>m.client_message_id).length),1);assert.equal(await page.evaluate(()=>new Set(__sentKeys).size),1);assert.equal(await page.evaluate(()=>__sentKeys.length),2);
  assert.equal(await page.evaluate(()=>__xss),false);await page.evaluate(()=>__delay=0);
  await dialog.locator('textarea').fill('Mein Entwurf bleibt hier.');
  if(employee)await dialog.getByRole('button',{name:'Zurück zu den Gesprächen',exact:true}).click();
  await dialog.getByRole('button',{name:'+ Neue Nachricht',exact:true}).click();await dialog.getByRole('searchbox').fill('Inhaberin');
  await dialog.getByRole('button',{name:/Inhaberin, Eva/}).click();assert.equal(await dialog.locator('textarea').inputValue(),'');
  await dialog.locator('textarea').fill('Frage an die Inhaberin');await dialog.getByRole('button',{name:'Senden',exact:true}).click();
  await page.waitForFunction(()=>__messages.some(m=>m.recipient_id==='owner'));await page.waitForFunction(()=>!document.querySelector('.sf-msg-compose textarea').disabled);
  if(employee)await dialog.getByRole('button',{name:'Zurück zu den Gesprächen',exact:true}).click();
  await dialog.getByRole('searchbox').fill('Test');await dialog.getByRole('button',{name:/Test, Bob/}).click();
  assert.equal(await dialog.locator('textarea').inputValue(),'Mein Entwurf bleibt hier.');
  await page.screenshot({path:path.join(out,name+'-dark.png'),fullPage:true});
  await page.evaluate(()=>document.documentElement.dataset.sfTheme='light');await page.screenshot({path:path.join(out,name+'-light.png'),fullPage:true});
  assert.equal(await dialog.evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  // Backdrop clicks preserve drafts and the dialog. Escape restores focus.
  await page.locator('#sfMessages').dispatchEvent('click');assert.equal(await dialog.isVisible(),true);
  await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);assert.equal(await page.locator('.sf-message-launch').evaluate(n=>n===document.activeElement),true);
  await page.locator('.sf-message-launch').click();await dialog.getByRole('button',{name:/Test, Bob/}).click();assert.equal(await dialog.locator('textarea').inputValue(),'Mein Entwurf bleibt hier.');
  // Older-page history and reading only visible loaded messages.
  await page.evaluate(()=>{for(let i=0;i<120;i++)__messages.push({id:'old-'+String(i).padStart(3,'0'),sender_id:'bob',recipient_id:'alice',body:'Nachricht '+i,created_at:'2026-01-01T10:00:00.000Z',read_at:'2026-01-02T10:00:00.000Z'})});
  await page.evaluate(()=>SFBackend.messages.refresh());await dialog.getByRole('button',{name:'Ältere Nachrichten laden',exact:true}).waitFor();await dialog.getByRole('button',{name:'Ältere Nachrichten laden',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.sf-msg-bubble').length>=100);
  await dialog.getByRole('button',{name:'Ältere Nachrichten laden',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.sf-msg-bubble').length===122);
  assert.equal(await dialog.getByRole('button',{name:'Ältere Nachrichten laden',exact:true}).isVisible(),false);
  // Directory renders untrusted names as text, and failed refresh retains drafts.
  if(employee)await dialog.getByRole('button',{name:'Zurück zu den Gesprächen',exact:true}).click();
  await dialog.getByRole('button',{name:'+ Neue Nachricht',exact:true}).click();await dialog.getByRole('searchbox').fill('<img');await dialog.getByRole('button',{name:/<img/}).click();
  assert.equal(await dialog.locator('.sf-msg-thread-head img').count(),0);assert.equal(await page.evaluate(()=>__xss),false);
  await dialog.locator('textarea').fill('Unveränderter Text');await page.evaluate(()=>{__failInbox=true;SFBackend.messages.refresh()});
  await page.waitForTimeout(100);assert.equal(await dialog.locator('textarea').inputValue(),'Unveränderter Text');
  // A delayed previous-company response cannot repopulate a switched identity.
  await page.evaluate(()=>{__failInbox=false;__delay=180;SFBackend.messages.refresh();SFBackend.switchCompany('company-b')});
  assert.equal(await dialog.count(),0);await page.waitForTimeout(250);await page.evaluate(()=>{__delay=0;SFBackend.messages.open()});
  await dialog.getByText(/Noch keine Gespräche/).waitFor();assert.equal(await dialog.locator('textarea').inputValue(),'');assert.equal(await dialog.locator('.sf-msg-bubble').count(),0);
  await page.evaluate(()=>SFBackend.finishSignOut());assert.equal(await dialog.count(),0);assert.equal(await page.locator('.sf-message-launch').count(),0);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({name,passed:true}));await page.close();
 }
 // Integration with the complete real shell and employee portal, using the same
 // isolated employee fixture as the portal regression suite. No live login.
 const fullHtml=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const employeeFixture=fs.readFileSync(path.join(__dirname,'employee-absences-qa.cjs'),'utf8').match(/const fixture=String.raw`([\s\S]*?)`;/)[1].replace('order:()=>run(),then:','in:()=>q,order:()=>run(),then:');
 for(const [name,viewport] of [['shell-desktop',{width:1440,height:1000}],['shell-mobile',{width:360,height:780}]]){
  const page=await browser.newPage({viewport,locale:'de-DE'});page.setDefaultTimeout(10000);
  await page.addInitScript(()=>{const pending=new Promise(()=>{});Object.defineProperty(window,'SFPageReady',{configurable:true,get:()=>pending,set(){}})});
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='messages.test')return route.abort();if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:fullHtml});try{const file=path.join(root,u.pathname);return route.fulfill({contentType:/\.m?js$/.test(file)?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'image/svg+xml',body:fs.readFileSync(file)})}catch{return route.fulfill({status:404,body:''})}});
  await page.goto('https://messages.test/');await page.waitForFunction(()=>window.SFBackend?.__employeePortalWorkspaceV2&&SFBackend.messages);
  await page.evaluate(employeeFixture.replace('window.SFBackend={','Object.assign(window.SFBackend,{').replace(/confirmSignOut:async\(\)=>\{\}\};/,'confirmSignOut:async()=>{}});'));
  await page.evaluate('const realBackend=window.SFBackend;'+fixture+'const fakeBackend=window.SFBackend;window.SFBackend=realBackend;realBackend.client.rpc=fakeBackend.client.rpc;realBackend.user={id:"alice"};realBackend.companyId="company-a";');
  await page.evaluate(()=>{SFBackend.closeAuth?.();SFBackend.hideLoading?.();SFBackend.role='OWNER';document.getElementById('landingPage')?.style.setProperty('display','none');document.getElementById('appShell')?.style.setProperty('display','flex');SFBackend.messages.refresh()});
  const managerLaunch=page.locator('.topbar .sf-message-launch');await managerLaunch.waitFor();assert.equal(await managerLaunch.isVisible(),true);await managerLaunch.click();
  const dialog=page.locator('#sfMessages');await dialog.locator('[data-msg-peer="bob"]').click();await dialog.locator('.sf-msg-log p').filter({hasText:'Kannst du morgen'}).waitFor();
  await page.screenshot({path:path.join(out,name+'-manager.png'),fullPage:true});await dialog.locator('[data-msg-action="close"]').click();
  await page.evaluate(()=>{SFBackend.role='EMPLOYEE';SFBackend.openEmployeePortal();SFBackend.employeePortalNavigate('dashboard');SFBackend.messages.refresh()});
  const employeeLaunch=page.locator('#sfEmployeePortal .sf-message-launch');await employeeLaunch.waitFor();assert.equal(await employeeLaunch.isVisible(),true);
  await page.waitForFunction(()=>{const p=document.querySelector('#sfEmployeePortal'),top=p.querySelector('.sf-portal-top').getBoundingClientRect(),main=p.querySelector('.sf-portal-main').getBoundingClientRect();return p.classList.contains('sf-employee-orbit')&&main.top>=top.bottom-1});
  assert.equal(await employeeLaunch.evaluate(n=>{const r=n.getBoundingClientRect();return r.right<=innerWidth&&r.left>=0}),true);
  if(name==='shell-mobile')assert.equal(await page.evaluate(()=>{const p=document.querySelector('#sfEmployeePortal'),message=p.querySelector('.sf-message-launch').getBoundingClientRect(),logout=p.querySelector('#sfEmployeeLogout').getBoundingClientRect();return Math.abs(message.top-logout.top)<3}),true);
  await page.screenshot({path:path.join(out,name+'-employee-header.png'),fullPage:true});await employeeLaunch.click();await dialog.locator('[data-msg-peer="bob"]').click();await dialog.locator('.sf-msg-log p').filter({hasText:'Kannst du morgen'}).waitFor();
  assert.equal(await dialog.locator('[role="dialog"]').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
  console.log(JSON.stringify({name,passed:true}));await page.close();
 }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
