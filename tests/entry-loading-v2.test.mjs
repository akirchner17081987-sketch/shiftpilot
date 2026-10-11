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
});
test('real vector mark exposes independently animated identity groups', () => {
  for (const id of ['calendar','clock','radio-waves','wordmark','tagline']) {
    assert.ok(logo.includes('id="' + id + '"'), 'missing logo component: ' + id);
  }
  assert.doesNotMatch(logo, /<image\\b/i);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
test('startup reports measured stage milestones without pre-auth data requests', () => {
  assert.doesNotThrow(() => new Script(boot));
  for (const marker of ['DOMContentLoaded','SFEntryMetrics','MutationObserver','sfAuthBackdrop','sfEmployeePortal','appShell','sf-entry-out']) {
    assert.ok(boot.includes(marker), marker);
  }
  assert.doesNotMatch(boot, /\\.from\\(['"][^'"]+['"]\\)/);
  assert.doesNotMatch(boot, /setTimeout\\(dismiss\\s*,/);
  assert.match(boot, /entryToReadyMs/);
});
