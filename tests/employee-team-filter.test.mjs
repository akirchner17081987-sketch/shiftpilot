import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const management=fs.readFileSync(new URL('../assets/employee-management-v2.js',import.meta.url),'utf8');

test('employee overview offers a dynamic team and location filter',()=>{
  assert.match(management,/id="spEmpTeam"/);
  assert.match(management,/Alle Teams \/ Standorte/);
  assert.match(management,/Ohne Zuordnung/);
  assert.match(management,/syncTeamFilter\(root\)/);
});

test('team filter combines with the existing employee filters',()=>{
  assert.match(management,/teamMatches/);
  assert.match(management,/employeeTeam===team/);
  assert.match(management,/\(av==='all'\|\|availability\(e\)\.key===av\)/);
  assert.match(management,/\(!qual\|\|qualifications\(e\)\.includes\(qual\)\)/);
});
