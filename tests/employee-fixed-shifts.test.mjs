import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

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

test('configurable day cycle repeats across week boundaries and handles dates before its start',()=>{
  const context={window:{}};
  vm.runInNewContext(rhythm,context);
  const employee={rhythmMode:'required',rhythmStart:'2026-09-29',rhythmPattern:[...Array(4).fill('ALLE'),...Array(3).fill('FREI'),...Array(3).fill('ALLE'),...Array(2).fill('FREI')].join(', ')};
  const check=(date)=>context.window.SFRhythm.check(employee,'O1',date);
  assert.equal(check('2026-09-29').allowed,true);
  assert.equal(check('2026-10-03').allowed,false);
  assert.equal(check('2026-10-06').allowed,true);
  assert.equal(check('2026-10-09').allowed,false);
  assert.equal(check('2026-10-11').allowed,true);
  assert.equal(check('2026-09-28').allowed,false);
});

test('employee form offers editable working and free blocks with a separate cycle start',()=>{
  assert.match(management,/id="spRhythmKind"/);
  assert.match(management,/Tagesrhythmus \(Arbeiten \/ Frei\)/);
  assert.match(management,/id="spCycleAdd"/);
  assert.match(management,/id="spCyclePreset"/);
  assert.match(management,/cycleGrid\.innerHTML=cycleBlocks\(\[\]\)\.map\(cycleRow\)/);
  assert.match(management,/rhythmKind=/);
  assert.match(management,/kind==='week'&&!legacyUnedited&&startDay!==1/);
});

test('4/3/3/2 repeats twice while only explicitly exempt OT1/2/3 bypass free days',()=>{
  const context={window:{}};vm.runInNewContext(rhythm,context);
  const pattern=['ALLE','ALLE','ALLE','ALLE','FREI','FREI','FREI','ALLE','ALLE','ALLE','FREI','FREI'];
  const e={rhythmMode:'required',rhythmStart:'2026-12-01',rhythmPattern:pattern.join(', '),qualifications:['__sp:rhythmExemptOt=true']};
  for(let day=0;day<24;day++){
    const date=`2026-12-${String(day+1).padStart(2,'0')}`,work=pattern[day%12]==='ALLE';
    for(const code of ['O1','O2','O3','OT','QA','TL-LE','TL-RE'])assert.equal(context.window.SFRhythm.check(e,code,date).allowed,work,`${code} ${date}`);
    for(const code of ['OT1','OT2','OT3'])assert.equal(context.window.SFRhythm.check(e,code,date).allowed,true);
  }
  assert.equal(context.window.SFRhythm.check({...e,rhythmExemptOt:false},'OT2','2026-12-07').allowed,false);
  assert.equal(context.window.SFRhythm.check({...e,qualifications:[]},'OT2','2026-12-07').allowed,false);
  context.window.SFPlanningTeams={get:()=>({start:'2026-12-01',pattern:['FREI'],offset:0})};
  assert.equal(context.window.SFRhythm.check({...e,planningTeam:'A'},'OT2','2026-12-07').allowed,false);
});
