import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync(new URL('../demo.html',import.meta.url),'utf8');
const session=fs.readFileSync(new URL('../assets/demo-session-v1.js',import.meta.url),'utf8');
const mode=fs.readFileSync(new URL('../assets/demo-mode-v1.js',import.meta.url),'utf8');

test('demo loads the automatic session controller',()=>{
  assert.match(page,/demo-session-v1\.js/);
});

test('inactivity timeout is 30 minutes with a five-minute warning',()=>{
  assert.match(session,/DEFAULT_IDLE_MS=30\*60\*1000/);
  assert.match(session,/DEFAULT_WARNING_MS=5\*60\*1000/);
  assert.match(session,/sf_demo_last_activity_v1/);
  assert.match(session,/pointerdown/);
  assert.match(session,/keydown/);
  assert.match(session,/visibilitychange/);
});

test('warning is accessible and offers continue or end',()=>{
  assert.match(session,/role','alertdialog'/);
  assert.match(session,/aria-modal','true'/);
  assert.match(session,/Sitzung fortsetzen/);
  assert.match(session,/Demo jetzt beenden/);
  assert.match(session,/sfDemoSessionCountdown/);
});

test('expired sessions use the secure demo logout path',()=>{
  assert.match(session,/window\.sfExpireDemo/);
  assert.match(mode,/function expireDemo/);
  assert.match(mode,/method:'DELETE'/);
  assert.match(page,/30 Minuten Inaktivität automatisch beendet/);
  assert.match(page,/maximale Sitzungsdauer ist abgelaufen/);
});

test('demo surface remains hidden until all presentation data is ready',()=>{
  assert.match(page,/sf-demo-booting/);
  assert.match(page,/id="sfDemoBootGate"/);
  assert.match(page,/Die Oberfläche erscheint, sobald alle Bereiche bereit sind/);
  assert.match(mode,/function coreDataReady\(\)/);
  assert.match(mode,/function controlsReady\(\)/);
  assert.match(mode,/querySelectorAll\('\[data-demo-perspective\]'\)\.length>=2/);
  assert.match(mode,/sf_demo_data_august_standard_v1/);
  assert.match(mode,/B\.client=window\.SFDemoDataClient\.create\(\)/);
  assert.match(mode,/window\.__sfDemoReadyV1=true/);
  assert.match(mode,/sf:demo-ready/);
});

test('incomplete demo preparation fails closed with a retry option',()=>{
  assert.match(page,/class="sf-demo-boot-retry"/);
  assert.match(mode,/READY_TIMEOUT_MS=12000/);
  assert.match(mode,/function failGate\(\)/);
  assert.match(mode,/nicht vollständig vorbereitet werden/);
});
