import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const integration=fs.readFileSync(new URL('../assets/o1s-integration-v1.js',import.meta.url),'utf8');
const navigation=fs.readFileSync(new URL('../assets/navigation-compat-v1.js',import.meta.url),'utf8');

test('O1S integration is loaded by the main application',()=>{
  assert.match(navigation,/o1s-integration-v1\.js/);
});

test('O1S is registered with the intended default time',()=>{
  assert.match(integration,/id:'O1S'/);
  assert.match(integration,/start:'18:00'/);
  assert.match(integration,/end:'04:00'/);
  assert.match(integration,/TYPES\.splice/);
});

test('O1S participates in staffing and settings without inventing a production requirement',()=>{
  assert.match(integration,/globalSoll\.O1S==null\)globalSoll\.O1S=0/);
  assert.match(integration,/globalSoll\.O1S=1/); // presentation demo only
});

test('O1S can be assigned as an employee qualification and preferred shift',()=>{
  assert.match(integration,/data-qual value=\\?"O1S/);
  assert.match(integration,/data-preferred value=\\?"O1S/);
  assert.match(integration,/e\.shifts=.*O1S/);
});

test('O1S appears in demo planning, time tracking and marketplace',()=>{
  assert.match(integration,/demo-market-01/);
  assert.match(integration,/demo-time-03/);
  assert.match(integration,/a\.type='O1S'/);
  assert.match(integration,/shift_code:'O1S'/);
});
