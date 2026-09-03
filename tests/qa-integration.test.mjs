import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const integration=fs.readFileSync(new URL('../assets/qa-integration-v1.js',import.meta.url),'utf8');
const navigation=fs.readFileSync(new URL('../assets/navigation-compat-v1.js',import.meta.url),'utf8');

test('QA integration is loaded by the main application',()=>{
  assert.match(navigation,/qa-integration-v1\.js/);
});

test('QA is registered with production template time 20:00 to 06:00',()=>{
  assert.match(integration,/id:'QA'/);
  assert.match(integration,/start:'20:00'/);
  assert.match(integration,/end:'06:00'/);
  assert.match(integration,/TYPES\.splice/);
});

test('QA production staffing defaults to zero and demo staffing is visible',()=>{
  assert.match(integration,/globalSoll\.QA==null\)globalSoll\.QA=0/);
  assert.match(integration,/globalSoll\.QA=1/);
});

test('QA participates in employee qualification and preferred-shift controls',()=>{
  assert.match(integration,/data-qual value=\\?"QA/);
  assert.match(integration,/data-preferred value=\\?"QA/);
  assert.match(integration,/e\.shifts=.*QA/);
});

test('QA appears in demo planning, time tracking and marketplace',()=>{
  assert.match(integration,/demo-market-04/);
  assert.match(integration,/demo-time-04/);
  assert.match(integration,/a\.type='QA'/);
  assert.match(integration,/shift_code:'QA'/);
});
