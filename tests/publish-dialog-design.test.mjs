import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dialog=fs.readFileSync(new URL('../assets/publish-dialog-design-v1.js',import.meta.url),'utf8');
const navigation=fs.readFileSync(new URL('../assets/navigation-compat-v1.js',import.meta.url),'utf8');

test('publish dialog design integration is loaded by the app',()=>{
  assert.match(navigation,/publish-dialog-design-v1\.js/);
});

test('publish confirmation uses SchichtFunk modal copy and actions',()=>{
  assert.match(dialog,/Dienstplan veröffentlichen\?/);
  assert.match(dialog,/Jetzt veröffentlichen/);
  assert.match(dialog,/Abbrechen/);
  assert.match(dialog,/Compliance-Prüfung/);
});

test('demo/local publication does not call native browser confirm',()=>{
  assert.doesNotMatch(dialog,/\bconfirm\s*\(/);
  assert.match(dialog,/PLAN_PUBLISHED/);
});

test('cloud publication path remains delegated to existing backend publisher',()=>{
  assert.match(dialog,/B\.ready&&B\.client/);
  assert.match(dialog,/return cloudPublish\(\)/);
});
