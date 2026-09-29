import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=fs.readFileSync(new URL('../assets/manager-theme-v1.js',import.meta.url),'utf8');
const style=fs.readFileSync(new URL('../assets/manager-theme-v1.css',import.meta.url),'utf8');

test('manager topbar exposes an accessible appearance toggle in the former legacy action slot',()=>{
  assert.match(index,/id="sfThemeToggle"/);
  assert.match(index,/aria-label="Zum hellen Modus wechseln"/);
  assert.match(index,/manager-theme-v1\.css\?v=20260929-2/);
  assert.match(index,/manager-theme-v1\.js\?v=20260929-1/);
  assert.doesNotMatch(index,/<button class="iconbtn">♧<\/button>/);
});

test('manager theme is persistent and defaults safely to dark',()=>{
  assert.match(script,/schichtfunk-manager-theme/);
  assert.match(script,/localStorage\.setItem/);
  assert.match(script,/root\.dataset\.sfTheme==='light'\?'dark':'light'/);
  assert.match(index,/localStorage\.getItem\('schichtfunk-manager-theme'\)/);
});

test('theme toggle communicates its action and state',()=>{
  assert.match(script,/Zum dunklen Modus wechseln/);
  assert.match(script,/Zum hellen Modus wechseln/);
  assert.match(script,/aria-pressed/);
  assert.match(script,/light\?'☾':'☀'/);
});

test('light appearance is scoped to the manager portal and remains mobile-accessible',()=>{
  assert.match(style,/html\[data-sf-theme="light"\] #appShell \.app/);
  assert.match(style,/@media\(max-width:560px\)\{#sfThemeToggle\{display:inline-flex!important;width:44px;min-width:44px;height:44px\}\}/);
  assert.doesNotMatch(style,/html\[data-sf-theme="light"\] #sfEmployeePortal/);
});

test('light appearance uses layered grey surfaces with strong contrast',()=>{
  assert.match(style,/light appearance v2/);
  assert.match(style,/--bg:#e3e9ee/);
  assert.match(style,/--panel:#f5f7f8/);
  assert.match(style,/--text:#17232e/);
  assert.match(style,/\.day-col\.today \.day-body\{background:#dff1ed!important\}/);
  assert.match(style,/#view-employees :is\(\.sp-emp-list-card,\.sp-emp-profile\)/);
  assert.match(style,/#view-employees \.sp-emp-row\.selected/);
  assert.match(script,/value==='light'\?'#dce5ea':'#08111f'/);
});
