import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css=fs.readFileSync(new URL('../assets/date-month-controls-v1.css',import.meta.url),'utf8');
const format=fs.readFileSync(new URL('../assets/date-month-format-v1.js',import.meta.url),'utf8');
const navigation=fs.readFileSync(new URL('../assets/navigation-compat-v1.js',import.meta.url),'utf8');

test('all date and month inputs use one centralized style file',()=>{
  assert.match(css,/input\[type="date"\]/);
  assert.match(css,/input\[type="month"\]/);
  assert.match(css,/%2327d6b4/);
  assert.match(navigation,/date-month-controls-v1\.css/);
  assert.doesNotMatch(navigation,/date-month-icon-visibility-v1\.js/);
});

test('month inputs use compact logical German labels',()=>{
  for(const label of ['Jan.','Feb.','Mär.','Apr.','Mai','Jun.','Jul.','Aug.','Sep.','Okt.','Nov.','Dez.']){
    assert.ok(format.includes(`'${label}'`),`missing ${label}`);
  }
  assert.match(format,/formatMonthShort/);
  assert.match(format,/sf-month-shortened/);
});

test('calendar icon area opens native date and month picker',()=>{
  assert.match(format,/PICKER_ICON_HITBOX=40/);
  assert.match(format,/input\.showPicker\(\)/);
  assert.match(format,/pointerdown/);
  assert.match(format,/input\.type==='month'\|\|input\.type==='date'/);
  assert.match(format,/openPicker:openNativePicker/);
});

test('central date month controls are loaded together',()=>{
  assert.match(navigation,/date-month-controls-v1\.css/);
  assert.match(navigation,/date-month-format-v1\.js\?v=20260904-2/);
});
