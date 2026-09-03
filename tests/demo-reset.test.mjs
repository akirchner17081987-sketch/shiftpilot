import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const reset=fs.readFileSync(new URL('../assets/demo-reset-v1.js',import.meta.url),'utf8');
const navigation=fs.readFileSync(new URL('../assets/navigation-compat-v1.js',import.meta.url),'utf8');

test('demo reset module is loaded by the app',()=>{
  assert.match(navigation,/demo-reset-v1\.js/);
});

test('demo reset is available only in an active demo session',()=>{
  assert.match(reset,/sf_demo_session_v1/);
  assert.match(reset,/!==\s*'active'/);
});

test('reset removes isolated demo state but preserves demo session and auth backup',()=>{
  assert.match(reset,/sf_demo_data_/);
  assert.match(reset,/sf_demo_marketplace_v1/);
  assert.match(reset,/sf_demo_time_tracking_v2/);
  assert.match(reset,/sf_demo_datev_v2/);
  assert.match(reset,/keepSession/);
  assert.match(reset,/keepBackup/);
  assert.match(reset,/sessionStorage\.setItem\('sf_demo_session_v1'/);
  assert.match(reset,/sessionStorage\.setItem\('sf_demo_auth_backup_v1'/);
});

test('reset uses an in-app confirmation dialog and reloads current demo',()=>{
  assert.match(reset,/sf-demo-reset-modal/);
  assert.match(reset,/Demo auf Standard zurücksetzen\?/);
  assert.match(reset,/Demo jetzt zurücksetzen/);
  assert.match(reset,/location\.reload\(\)/);
});
