import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const management=fs.readFileSync(new URL('../assets/employee-management-v2.js',import.meta.url),'utf8');
const rhythm=fs.readFileSync(new URL('../assets/employee-rhythm-v1.js',import.meta.url),'utf8');

test('employee form provides a clear seven-day fixed-shift rule',()=>{
  assert.match(management,/Feste Schichtregel/);
  assert.match(management,/WEEKDAYS=\['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'\]/);
  assert.match(management,/data-rhythm-day/);
  assert.match(management,/Verbindlich einhalten/);
  assert.match(management,/Bei der Planung bevorzugen/);
});

test('fixed week requires a Monday and stores all seven choices',()=>{
  assert.match(management,/startDay!==1/);
  assert.match(management,/muss an einem Montag beginnen/);
  assert.match(management,/document\.querySelectorAll\('\[data-rhythm-day\]'\)/);
  assert.match(management,/legacyUnedited/);
  assert.match(management,/data-original-pattern/);
});

test('qualification form offers an exclusive-shift shortcut',()=>{
  assert.match(management,/id="spExclusiveShift"/);
  assert.match(management,/Ausschließlich eine Schicht/);
  assert.match(management,/field\.checked=field\.value===exclusive\.value/);
  assert.match(management,/Schichtfreigaben passen nicht zur Wochenregel/);
});

test('required rhythms continue to enforce shift and free-day rules',()=>{
  assert.match(rhythm,/expected==='ALLE'/);
  assert.match(rhythm,/expected==='FREI'/);
  assert.match(management,/rhythm\?\.mode==='required'&&!rhythm\.allowed/);
  assert.match(management,/Abweichung von fester Schichtregel/);
});
