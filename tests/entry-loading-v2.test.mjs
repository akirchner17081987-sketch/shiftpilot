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
