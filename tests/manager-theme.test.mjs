import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=fs.readFileSync(new URL('../assets/manager-theme-v1.js',import.meta.url),'utf8');
const style=fs.readFileSync(new URL('../assets/manager-theme-v1.css',import.meta.url),'utf8');

test('manager topbar exposes an accessible appearance toggle in the former legacy action slot',()=>{
  assert.match(index,/id="sfThemeToggle"/);
  assert.match(index,/aria-label="Zum hellen Modus wechseln"/);
  assert.match(index,/manager-theme-v1\.css\?v=20260918-1/);
  assert.match(index,/manager-theme-v1\.js\?v=20260918-1/);
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
