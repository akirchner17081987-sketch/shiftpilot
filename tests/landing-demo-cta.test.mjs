import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const cta=fs.readFileSync(new URL('../assets/landing-demo-cta-v1.js',import.meta.url),'utf8');
const nav=fs.readFileSync(new URL('../assets/navigation-compat-v1.js',import.meta.url),'utf8');
const demo=fs.readFileSync(new URL('../demo.html',import.meta.url),'utf8');

test('public landing page loads the demo CTA integration',()=>{
  assert.match(nav,/landing-demo-cta-v1\.js/);
});

test('demo calls-to-action route only to the isolated demo endpoint',()=>{
  assert.match(cta,/const DEMO_URL='\/demo'/);
  assert.match(cta,/Demo kostenlos testen/);
  assert.match(cta,/Demo jetzt starten/);
  assert.match(cta,/Keine Registrierung/);
  assert.match(cta,/Keine echten Daten/);
  assert.match(cta,/Jederzeit zurücksetzbar/);
});

test('production login stays separate from public demo',()=>{
  assert.match(cta,/login\.textContent='Anmelden'/);
});

test('demo page starts without public credentials',()=>{
  assert.match(demo,/Demo jetzt starten/);
  assert.match(demo,/Keine Registrierung und keine Zugangsdaten erforderlich/);
  assert.doesNotMatch(demo,/demo@schichtfunk\.de/);
  assert.doesNotMatch(demo,/PASSWORD_SHA256/);
  assert.doesNotMatch(demo,/type="password"/);
});

test('one-click demo preserves product auth only as an isolated backup',()=>{
  assert.match(demo,/sf_demo_auth_backup_v1/);
  assert.match(demo,/sf_demo_session_v1','active'/);
  assert.match(demo,/demo-marketplace-v1\.js/);
  assert.match(demo,/demo-mode-v1\.js/);
});
