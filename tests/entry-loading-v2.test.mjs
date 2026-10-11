import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const page = read('index.html');
const logo = read('assets/schichtfunk-logo-v2-entry.svg');
const boot = read('assets/sf-entry-v2.js');
const css = read('assets/sf-entry-v2.css');

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
