import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Window } from 'happy-dom';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const index = read('index.html');
const overlay = index.slice(index.indexOf('<div id="sfEntryOverlay"'), index.indexOf('<section id="landingPage">'));
const source = read('assets/sf-entry-access-v1.js');
function launch(path, {displayMode = false, ios = false, rememberedArea = null, storageBlocked = false} = {}) {
  const dom = new Window();
  dom.document.body.innerHTML = overlay;
  const location = new URL(path, 'https://schichtfunk.de');
  const history = {state: null, replaceState(state, _, path) { location.href = new URL(path, location).href; }};
  const storage = new Map(rememberedArea ? [['sf_entry_area', rememberedArea]] : []);
  const localStorage = {getItem: key => { if (storageBlocked) throw Error('blocked'); return storage.get(key) || null; }, setItem: (key, value) => { if (storageBlocked) throw Error('blocked'); storage.set(key, value); }};
  const window = {localStorage, navigator: {standalone: ios}, matchMedia: query => ({matches: query === '(display-mode: standalone)' ? displayMode : true})};
  vm.runInNewContext(source, {window, document: dom.document, location, history, URL, URLSearchParams});
  window.SFEntryAccess.mount(null);
  return {document: dom.document, location, window};
}

test('new installations and the open shortcut start at the area chooser with the same app identity', () => {
  const manifest = JSON.parse(read('site.webmanifest'));
  assert.equal(manifest.id, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.shortcuts[0].url, '/');
});

for (const mode of [{displayMode: true}, {ios: true}]) {
  test(`old PWA launch opens the three areas and clears the legacy management hash: ${JSON.stringify(mode)}`, () => {
    const {document, location, window} = launch('/?source=homescreen#app', mode);
    assert.equal(window.SFEntryAccess.isChoosing(), true);
    assert.equal(document.getElementById('sfEntryChoice').hidden, false);
    assert.equal(document.getElementById('sfEntryLoginSlot').hidden, true);
    assert.equal(document.querySelectorAll('[data-entry-area]').length, 3);
    assert.equal(location.hash, '');
    assert.equal(location.search, '?source=homescreen');
  });
  for (const area of ['verwaltung', 'mitarbeiter', 'zeit', 'zeitkonto']) {
    test(`explicit ${area} link stays usable in PWA: ${JSON.stringify(mode)}`, () => {
      const {window, document, location} = launch('/?bereich=' + area + '#app', mode);
      assert.equal(window.SFEntryAccess.isChoosing(), false);
      assert.equal(document.getElementById('sfEntryTime').hidden, area !== 'zeit');
      assert.equal(location.search, '?bereich=' + area);
    });
  }
}
test('ordinary browser management link keeps its existing destination', () => {
  assert.equal(launch('/#app').window.SFEntryAccess.isChoosing(), false);
});
test('root starts at the area chooser in the browser', () => {
  assert.equal(launch('/').window.SFEntryAccess.isChoosing(), true);
});
test('PWA startup preserves password recovery and invitation parameters', () => {
  const path = '/?reset=1&invite=example#access_token=example&type=recovery';
  const {location} = launch(path, {ios: true});
  assert.equal(location.pathname + location.search + location.hash, path);
});

for (const mode of [{ios:true}, {displayMode:true}, {}]) {
  for (const view of ['employee-shifts','employee-handover','employee-dashboard']) test(`personal push resolves employee workspace before auth: ${view} ${JSON.stringify(mode)}`, () => {
    const {location,window} = launch('/?sf_push_view='+view+'&sf_push_notification=example#app', {...mode,rememberedArea:'verwaltung'});
    assert.equal(location.searchParams.get('bereich'),'mitarbeiter');
    assert.equal(location.searchParams.get('sf_push_view'),view);
    assert.equal(location.searchParams.get('sf_push_notification'),'example');
    assert.equal(window.SFEntryAccess.isChoosing(),false);
  });
  for (const area of ['mitarbeiter','verwaltung','zeitkonto']) test(`generic test push follows selected ${area}: ${JSON.stringify(mode)}`, () => {
    const {location}=launch('/?sf_push_view=overview#app',{...mode,rememberedArea:area});
    assert.equal(location.searchParams.get('bereich'),area);
  });
}
test('remembered employee area never bypasses ordinary PWA area selection', () => {
  for (const path of ['/','/#app']) assert.equal(launch(path,{ios:true,rememberedArea:'mitarbeiter'}).window.SFEntryAccess.isChoosing(),true);
});
test('explicit management link takes precedence over stored employee preference', () => {
  assert.equal(launch('/?bereich=verwaltung&sf_push_view=overview#app',{rememberedArea:'mitarbeiter'}).location.searchParams.get('bereich'),'verwaltung');
});
test('storage failure does not prevent personal push routing', () => {
  assert.equal(launch('/?sf_push_view=employee-shifts#app',{ios:true,storageBlocked:true}).location.searchParams.get('bereich'),'mitarbeiter');
});
test('an unrelated management push does not reuse an employee preference', () => {
  assert.equal(launch('/?sf_push_view=reports#app',{rememberedArea:'mitarbeiter'}).location.searchParams.get('bereich'),'verwaltung');
});
