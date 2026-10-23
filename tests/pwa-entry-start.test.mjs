import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Window } from 'happy-dom';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const index = read('index.html');
const overlay = index.slice(index.indexOf('<div id="sfEntryOverlay"'), index.indexOf('<section id="landingPage">'));
const source = read('assets/sf-entry-access-v1.js');
function launch(path, {displayMode = false, ios = false} = {}) {
  const dom = new Window();
  dom.document.body.innerHTML = overlay;
  const location = new URL(path, 'https://schichtfunk.de');
  const history = {state: null, replaceState(state, _, path) { location.href = new URL(path, location).href; }};
  const window = {navigator: {standalone: ios}, matchMedia: query => ({matches: query === '(display-mode: standalone)' ? displayMode : true})};
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
