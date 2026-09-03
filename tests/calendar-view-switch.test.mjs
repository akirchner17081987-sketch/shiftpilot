import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const calendar=fs.readFileSync(new URL('../assets/calendar-view-switch-v1.js',import.meta.url),'utf8');
const navigation=fs.readFileSync(new URL('../assets/navigation-compat-v1.js',import.meta.url),'utf8');

test('calendar week/month integration is loaded by main app',()=>{
  assert.match(navigation,/calendar-view-switch-v1\.js/);
});

test('calendar integration compiles as JavaScript',()=>{
  assert.doesNotThrow(()=>new Function(calendar));
});

test('week and month buttons are wired to real modes',()=>{
  assert.match(calendar,/data\.calendarMode='week'/);
  assert.match(calendar,/data\.calendarMode='month'/);
  assert.match(calendar,/setMode\('week'\)/);
  assert.match(calendar,/setMode\('month'\)/);
});

test('month view renders assignments, staffing and navigation',()=>{
  assert.match(calendar,/function renderMonth\(/);
  assert.match(calendar,/sf-month-grid/);
  assert.match(calendar,/SOLL \$\{so\} · IST \$\{is\}/);
  assert.match(calendar,/addMonths/);
  assert.match(calendar,/assignEmployeeByDrop/);
});
