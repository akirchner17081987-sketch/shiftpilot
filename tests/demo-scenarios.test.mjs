import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync(new URL('../demo.html',import.meta.url),'utf8');
const scenarios=fs.readFileSync(new URL('../assets/demo-scenarios-v1.js',import.meta.url),'utf8');

test('protected demo loads the prepared scenario selector',()=>{
  assert.match(page,/demo-scenarios-v1\.js/);
  assert.match(scenarios,/sf_demo_session_v1/);
  assert.match(scenarios,/SFDemoScenarios/);
  assert.match(scenarios,/aria-haspopup=\"dialog\"/);
});

test('all five requested scenarios are directly selectable',()=>{
  for(const label of ['Kurzfristiger Ausfall','Unterbesetzung','Urlaubsantrag','Zeitabweichung','Schichttausch'])assert.match(scenarios,new RegExp(label));
  for(const key of ['outage','understaffing','vacation','deviation','swap'])assert.match(scenarios,new RegExp(`${key}:\\{`));
});

test('scenarios open the matching real demo workspaces',()=>{
  assert.match(scenarios,/SFDisruptionAutopilot\?\.open/);
  assert.match(scenarios,/data-view=\"marketplace\"/);
  assert.match(scenarios,/renderAbsenceDashboard/);
  assert.match(scenarios,/renderTimeTracking/);
  assert.match(scenarios,/SchichtFunkCalendarView\?\.setMonth/);
});

test('prepared data can be restored to the demo baseline',()=>{
  assert.match(scenarios,/Ausgangslage wiederherstellen/);
  assert.match(scenarios,/clearPreparedData\(\)/);
  assert.match(scenarios,/sessionStorage\.removeItem\(ACTIVE_KEY\)/);
  assert.match(scenarios,/sf_demo_scenario_baseline_v1/);
});
