import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script, runInNewContext} from 'node:vm';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const page = read('index.html');
const logo = read('assets/schichtfunk-logo-v2-entry.svg');
const boot = read('assets/sf-entry-v2.js');
const css = read('assets/sf-entry-v2.css');

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

test('authentication bootstrap precedes feature modules and preserves access control', () => {
  const loader = read('assets/conflict-plausibility-v1.js');
  assert.match(loader, /const LOAD_WINDOW=10/);
  assert.match(loader, /s\.async=false/);
  assert.match(loader, /loadSelected\(bootstrapFiles\)\.then\(start\)/);
  assert.match(loader, /await ensureDeferred\(\)/);
  assert.match(loader, /if\(B\.role!==\'EMPLOYEE\'\)await loadManager\(\)/);
  assert.match(loader, /requestIdleCallback\(preload/);
  const moduleList = loader.split('const files=[')[1].split('];')[0];
  const names = [...moduleList.matchAll(/'assets\/[^']+\.js'/g)].map(x => x[0].slice(1,-1));
  const indices = [0,6,7,8,12,14,15,16,25,26,27,28];
  const expected = ['supabase-auth-errors-v1.js','supabase-auth-v1.js','supabase-password-reset-v1.js','supabase-auth-redirect-v1.js','supabase-data-v1.js','supabase-mfa-v1.js','supabase-employee-access-v1.js'];
  for (const file of expected) {
    assert.ok(indices.map(i=>names[i]).some(name=>name.endsWith('/'+file)), file);
  }
  assert.ok(!indices.includes(names.indexOf('assets/time-only-access-v1.js')), 'time-only wrapper must preserve deferred dependency order');
  assert.ok(loader.indexOf('await ensureDeferred()') < loader.indexOf('const result=await baseBoot.apply(this,arguments)'), 'never hydrate before required modules load');
  assert.match(page, /rel="preconnect" href="https:\/\/zbvloohfjleadjnqhbbh\.supabase\.co"/);
});

