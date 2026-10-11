import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script, runInNewContext} from 'node:vm';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const page = read('index.html');
const logo = read('assets/schichtfunk-logo-v2-entry.svg');
const boot = read('assets/sf-entry-v2.js');
const css = read('assets/sf-entry-v2.css');

function logoutHarness({demo=false, signOut=async()=>({})}={}) {
  const timers=new Map(), removed=[], storageCleared=[], navigations=[], dialogs=[];
  const nodes=new Map(); let nextTimer=0;
  for (const id of ['appShell','landingPage','sfEmployeePortal','sfNotifyPanel']) {
    const node={style:{values:{},setProperty(key,value){this.values[key]=value}},remove(){removed.push(id);nodes.delete(id)}};
    nodes.set(id,node);
  }
  const message={className:'',textContent:''};
  const context={window:{},document:{getElementById:id=>nodes.get(id),querySelector:selector=>selector==='#sfAuthMsg'?message:null},
    sessionStorage:{getItem:key=>key==='sf_demo_session_v1'&&demo?'active':null,removeItem:key=>storageCleared.push(['session',key])},
    localStorage:{removeItem:key=>storageCleared.push(['local',key])},
    location:{pathname:'/',search:'?sfPerf=1',hash:'#app',replace(url){const B=context.window.SFBackend;navigations.push({url,ready:B.ready,user:B.user,companyId:B.companyId,role:B.role,appDisplay:nodes.get('appShell').style.values.display,cleared:storageCleared.length})}},
    history:{replaceState(){}},console:{warn(){},error(){}},
    setTimeout(fn,ms){timers.set(++nextTimer,{fn,ms});return nextTimer},clearTimeout:id=>timers.delete(id)};
  runInNewContext(read('assets/supabase-auth-v1.js'),context);
  const B=context.window.SFBackend;
  Object.assign(B,{ready:true,user:{id:'test-user'},companyId:'test-company',role:'OWNER',client:{auth:{signOut}},
    hideLoading(){},closeAuth(){},updateState(){},authDialog:mode=>dialogs.push(mode)});
  return {B,nodes,removed,storageCleared,navigations,dialogs,message,
    runTimer(ms){const entry=[...timers].find(([,timer])=>timer.ms===ms);assert.ok(entry,'missing timer '+ms);timers.delete(entry[0]);return entry[1].fn()}};
}

test('explicit local logout clears the session and hides protected views before restarting the animated root', async()=>{
  const scopes=[];const h=logoutHarness({signOut:async options=>{scopes.push(options.scope);return {}}});
  await h.B.signOutSafely();
  assert.deepEqual(scopes,['local']);
  assert.deepEqual(h.navigations,[{url:'/',ready:false,user:null,companyId:null,role:null,appDisplay:'none',cleared:2}]);
  assert.deepEqual(h.removed,['sfEmployeePortal','sfNotifyPanel']);
  assert.deepEqual(h.dialogs,[]);
  h.B.finishSignOut(true);
  assert.equal(h.navigations.length,1,'duplicate SIGNED_OUT completion must not navigate twice');
});

test('a stalled local signout still clears local state before returning to the animated root', async()=>{
  const h=logoutHarness({signOut:()=>new Promise(()=>{})});
  const pending=h.B.signOutSafely();h.runTimer(5000);await pending;
  assert.equal(h.navigations.length,1);assert.equal(h.navigations[0].url,'/');
  assert.equal(h.navigations[0].cleared,2);assert.equal(h.B.ready,false);
});

test('session expiry keeps the existing reauthentication message without a reload loop',()=>{
  const h=logoutHarness();h.B.finishSignOut(false);h.runTimer(0);
  assert.deepEqual(h.navigations,[]);assert.deepEqual(h.storageCleared,[]);assert.deepEqual(h.dialogs,['login']);
  assert.match(h.message.textContent,/Anmeldung ist abgelaufen/);assert.equal(h.B.__finishingSignOut,false);
});

test('the separate demo logout does not restart an active demo session',async()=>{
  const h=logoutHarness({demo:true});await h.B.signOutSafely();h.runTimer(0);
  assert.deepEqual(h.navigations,[]);assert.deepEqual(h.dialogs,['login']);
});

test('successful global signout also returns to the animated root',async()=>{
  const scopes=[];const h=logoutHarness({signOut:async options=>{scopes.push(options.scope);return {}}});
  assert.equal(await h.B.signOutAllSessionsSafely(),true);assert.deepEqual(scopes,['global']);
  assert.equal(h.navigations.length,1);assert.equal(h.navigations[0].cleared,2);
});

test('failed global session revocation keeps the current session and does not redirect',async()=>{
  const h=logoutHarness({signOut:async()=>({error:new Error('test failure')})});
  assert.equal(await h.B.signOutAllSessionsSafely(),false);
  assert.deepEqual(h.navigations,[]);assert.deepEqual(h.storageCleared,[]);assert.equal(h.B.ready,true);
});

function entryHarness() {
  const timers = new Map(), nodes = new Map(), events = new Map();
  const frames = []; let changed; let timerId = 0;
  const element = (id) => ({id,isConnected:true,style:{},hidden:false,textContent:'',
    classList:{values:new Set(),add(value){this.values.add(value)},contains(value){return this.values.has(value)},toggle(value,on){on?this.values.add(value):this.values.delete(value)}},
    addEventListener(){},remove(){this.isConnected=false;nodes.delete(id)}});
  const root = element('sfEntryOverlay'); nodes.set(root.id,root);
  for (const id of ['sfEntryStatus','sfEntryBar','sfEntryCounter','sfEntryWarning','sfEntrySkip','sfEntryLoginSlot']) nodes.set(id,element(id));
  root.querySelector = selector => nodes.get(selector.slice(1));
  nodes.get('sfEntryLoginSlot').appendChild = el => {el.parentElement=nodes.get('sfEntryLoginSlot')};
  const backend = {client:{},ready:false};
  runInNewContext(boot,{
    document:{readyState:'loading',documentElement:{},body:{},getElementById:id=>nodes.get(id),addEventListener:(name,fn)=>events.set(name,fn)},
    window:{SFBackend:backend,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener(){},matchMedia:()=>({matches:true})},
    getComputedStyle:el=>({display:el.style.display||'block',visibility:'visible'}),
    performance:{now:()=>1,mark(){},getEntriesByType:()=>[]},
    location:{search:''},URL,URLSearchParams,
    setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId},clearTimeout:id=>timers.delete(id),
    MutationObserver:class {constructor(fn){changed=fn}observe(){}disconnect(){}},
    requestAnimationFrame:fn=>{frames.push(fn);return frames.length},fetch:()=>new Promise(()=>{})
  });
  const change = () => {changed();while(frames.length)frames.shift()()};
  const add = (id) => {const el=element(id);nodes.set(id,el);change();return el};
  return {root,nodes,timers,backend,add,change,events};
}

test('restored session exposes MFA without a login form and clears startup timeout', () => {
  const h=entryHarness();
  assert.ok([...h.timers.values()].some(timer=>timer.ms===20000));
  h.add('sfMfaModal');
  assert.ok(h.root.classList.contains('sf-entry-mfa-ready'));
  assert.equal(h.root.inert,true);
  assert.equal(h.nodes.get('sfEntryStatus').textContent,'Sicherheitscode erforderlich');
  assert.equal(h.nodes.get('sfEntryWarning').hidden,true);
  assert.equal(h.nodes.get('sfEntrySkip').hidden,true);
  assert.ok(![...h.timers.values()].some(timer=>timer.ms===20000));
  assert.equal(h.root.isConnected,true);
  const entryZ=Number(css.match(/#sfEntryOverlay\.sf-entry-mfa-ready\{z-index:(\d+)/)[1]);
  const mfa=read('assets/supabase-mfa-v1.js');
  assert.ok(entryZ<Number(mfa.match(/\.sf-mfa-backdrop\{[^}]*z-index:(\d+)/)[1]));
});

test('MFA retains priority over an existing login and releases entry after app is ready', () => {
  const h=entryHarness();h.add('sfAuthBackdrop');h.add('sfMfaModal');
  h.backend.ready=true;h.add('appShell');
  assert.ok(!h.root.classList.contains('sf-entry-out'));
  h.nodes.get('sfMfaModal').remove();h.change();
  assert.equal(h.root.inert,false);
  assert.ok(h.root.classList.contains('sf-entry-out'));
});

test('cancelled MFA can return to the original login form', () => {
  const h=entryHarness();h.add('sfMfaModal');
  h.nodes.get('sfMfaModal').remove();const auth=h.add('sfAuthBackdrop');
  assert.equal(h.root.inert,false);
  assert.ok(!h.root.classList.contains('sf-entry-mfa-ready'));
  assert.ok(h.root.classList.contains('sf-entry-login-ready'));
  assert.equal(auth.parentElement,h.nodes.get('sfEntryLoginSlot'));
});

test('entry overlay is created before the protected application shell', () => {
  assert.ok(page.indexOf('id="sfEntryOverlay"') < page.indexOf('id="appShell"'));
  assert.ok(page.includes('assets/sf-entry-v2.css'));
  assert.ok(page.includes('assets/sf-entry-v2.js'));
  assert.ok(page.includes('assets/schichtfunk-logo-v2-entry.svg'));
  assert.match(page, /class="sf-login-only"/);
  assert.match(page, /id="sfEntryLoginSlot"/);
});
test('real vector mark exposes independently animated identity groups', () => {
  for (const id of ['calendar','clock','radio-waves','wordmark','tagline']) {
    assert.ok(logo.includes('id="' + id + '"'), 'missing logo component: ' + id);
  }
  assert.ok(!logo.includes('<image '));
  assert.match(css, /prefers-reduced-motion:reduce/);
});
test('startup reports measured stage milestones without pre-auth data requests', () => {
  assert.doesNotThrow(() => new Script(boot));
  for (const marker of ['DOMContentLoaded','SFEntryMetrics','MutationObserver','sfAuthBackdrop','sfEmployeePortal','appShell','sf-entry-out']) {
    assert.ok(boot.includes(marker), marker);
  }
  assert.ok(!boot.includes('setTimeout(dismiss,'));
  assert.ok(!boot.includes('setTimeout(dismiss,'));
  assert.match(boot, /entryToReadyMs/);
});

test('the protected login is relocated inside the entry instead of replacing it', () => {
  assert.match(boot, /slot\.appendChild\(auth\)/);
  assert.match(boot, /function morphToLogin\(auth\)/);
  assert.match(boot, /sf-entry-login-ready/);
  assert.match(css, /#sfEntryOverlay #sfAuthBackdrop\.sf-auth-backdrop/);
  assert.match(css, /#sfEntryOverlay\.sf-entry-login-ready \.sf-entry-login-slot/);
  assert.ok(!boot.includes("document.createElement('input')"));
});
test('entry is removed only after a ready manager or employee view', () => {
  assert.match(boot, /if \(managerReady \|\| employeeReady\)/);
  assert.match(boot, /if \(isVisible\(auth\) && !!window\.SFBackend\?\.client\) morphToLogin\(auth\)/);
  assert.match(boot, /root\.classList\.add\('sf-entry-out'\)/);
  assert.match(boot, /syncAuthLoading\(\)/);
});

test('wordmark stays above the login card after the animation', () => {
  assert.match(css, /margin-bottom:-18px/);
  assert.match(css, /margin-bottom:-8px/);
  assert.doesNotMatch(css, /margin-bottom:-74px/);
  assert.doesNotMatch(css, /margin-bottom:-48px/);
});

test('entry preserves the production page-ready and role-gated loader', () => {
  const loader = read('assets/conflict-plausibility-v1.js');
  assert.match(loader, /s\.async=false/);
  assert.match(loader, /window\.SFPageReady\.then\(init\)/);
  assert.match(loader, /if\(B\.role!=='EMPLOYEE'\)await loadManager\(\)/);
  assert.match(loader, /const result=await baseBoot\.apply\(this,arguments\)/);
  assert.match(page, /rel="preconnect" href="https:\/\/zbvloohfjleadjnqhbbh\.supabase\.co"/);
});
