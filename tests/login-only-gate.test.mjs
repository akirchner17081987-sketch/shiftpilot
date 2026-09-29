import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const auth=fs.readFileSync(new URL('../assets/supabase-auth-v1.js',import.meta.url),'utf8');

test('public root is configured as a login-only surface',()=>{
  assert.match(index,/<html lang="de" class="sf-login-only">/);
  assert.match(index,/html\.sf-login-only #landingPage\{display:none!important\}/);
  assert.match(auth,/B\.loginOnly=true/);
});

test('login-only dialog has no generic registration or cancel path',()=>{
  assert.match(auth,/const reg=!B\.loginOnly&&mode==='register'/);
  assert.match(auth,/B\.loginOnly\?'':'<button id="sfAuthCancel"/);
  assert.match(auth,/B\.loginOnly\?'':`<div class="sf-auth-tabs"/);
});

test('legal pages remain reachable from the protected login screen',()=>{
  assert.match(auth,/href="\/impressum\.html"/);
  assert.match(auth,/href="\/datenschutz\.html"/);
});

test('missing session always opens the login gate and keeps both shells hidden',()=>{
  assert.match(auth,/getElementById\('appShell'\).*display','none'/);
  assert.match(auth,/getElementById\('landingPage'\).*display','none'/);
  assert.match(auth,/B\.authDialog\('login'\)/);
});
