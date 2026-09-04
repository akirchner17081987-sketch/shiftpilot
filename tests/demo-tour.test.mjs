import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync(new URL('../demo.html',import.meta.url),'utf8');
const tour=fs.readFileSync(new URL('../assets/demo-tour-v1.js',import.meta.url),'utf8');

test('demo loads the guided tour only inside the protected sandbox',()=>{
  assert.match(page,/demo-tour-v1\.js/);
  assert.match(tour,/sf_demo_session_v1/);
  assert.match(tour,/!==\s*'active'/);
});

test('tour covers six core demo stations',()=>{
  assert.match(tour,/Willkommen bei SchichtFunk/);
  assert.match(tour,/Alles Wichtige auf einen Blick/);
  assert.match(tour,/view:'overview',selector:'#view-overview #overviewStats'/);
  assert.match(tour,/Dienstplan und Besetzung/);
  assert.match(tour,/Auf Ausfälle sofort reagieren/);
  assert.match(tour,/Zeiten prüfen und freigeben/);
  assert.match(tour,/DATEV-LODAS vorbereiten/);
  assert.match(tour,/view:'time',selector:'#sfDatevPanel'/);
  assert.match(tour,/steps:steps\.length/);
});

test('completed tour stays dismissed when an active demo is reloaded',()=>{
  assert.match(page,/clearDemoState\(true\)/);
  assert.match(page,/preserveTour\|\|k!=='sf_demo_tour_seen_v1'/);
  assert.match(tour,/sessionStorage\.setItem\(SEEN_KEY,'complete'\)/);
});

test('tour provides progress, navigation, skip and restart through help',()=>{
  assert.match(tour,/sf-demo-tour-bar/);
  assert.match(tour,/Tour überspringen/);
  assert.match(tour,/Zurück/);
  assert.match(tour,/Tour abschließen/);
  assert.match(tour,/sfDemoTourHelpBtn/);
  assert.match(tour,/Geführte Demo-Tour starten/);
});

test('tour dialog and highlighted targets are accessible and responsive',()=>{
  assert.match(tour,/role','dialog'/);
  assert.match(tour,/aria-modal','true'/);
  assert.match(tour,/aria-labelledby','sfDemoTourTitle'/);
  assert.match(tour,/scrollIntoView/);
  assert.match(tour,/@media\(max-width:680px\)/);
  assert.match(tour,/visualViewport/);
  assert.match(tour,/max-height:calc\(100dvh - 28px\)/);
  assert.match(tour,/setProperty\('top',`\$\{top\}px`,'important'\)/);
});
