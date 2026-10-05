import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=fs.readFileSync(new URL('../assets/manager-theme-v1.js',import.meta.url),'utf8');
const style=fs.readFileSync(new URL('../assets/manager-theme-v1.css',import.meta.url),'utf8');

test('manager topbar exposes an accessible appearance toggle in the former legacy action slot',()=>{
  assert.match(index,/id="sfThemeToggle"/);
  assert.match(index,/aria-label="Zum hellen Modus wechseln"/);
  assert.match(index,/manager-theme-v1\.css\?v=20261006-1/);
  assert.match(index,/manager-theme-v1\.js\?v=20261006-1/);
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

function luminance(hex){
  const c=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return .2126*c[0]+.7152*c[1]+.0722*c[2];
}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
const palette=Object.fromEntries([...style.matchAll(/(--sf-[\w-]+):(#(?:[0-9a-f]{6}));/g)].map(m=>[m[1],m[2]]));

test('light surfaces are muted and text/status colours meet normal-text contrast',()=>{
  for(const surface of ['--sf-canvas','--sf-frame','--sf-surface','--sf-surface-raised','--sf-surface-inset','--sf-field']){
    assert.ok(palette[surface],surface);
    for(const ink of ['--sf-ink','--sf-ink-muted','--sf-accent']){
      assert.ok(contrast(palette[ink],palette[surface])>=4.5,`${ink} on ${surface}`);
    }
  }
  for(const state of ['good','warn','bad']){
    assert.ok(contrast(palette[`--sf-${state}`],palette[`--sf-${state}-surface`])>=4.5,state);
  }
  assert.ok(luminance(palette['--sf-canvas'])<luminance('#e3e9ee'));
  assert.ok(luminance(palette['--sf-surface-raised'])<luminance('#f5f7f8'));
  assert.match(script,/value==='light'\?'#d5dfe6':'#08111f'/);
});
