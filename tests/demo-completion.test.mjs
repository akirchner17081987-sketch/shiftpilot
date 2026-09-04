import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const demo=fs.readFileSync(new URL('../assets/demo-mode-v1.js',import.meta.url),'utf8');
const completion=fs.readFileSync(new URL('../demo-abschluss.html',import.meta.url),'utf8');

test('voluntary demo exit opens the dedicated completion page',()=>{
  assert.match(demo,/function exitDemo\(\)\{finishDemo\('\/demo-abschluss','manual'\)\}/);
  assert.match(demo,/function expireDemo\(reason\)\{if\(reason==='manual'\)return exitDemo\(\)/);
});

test('completion page offers all four requested next steps',()=>{
  for(const label of ['Gespräch vereinbaren','Persönliche Vorführung','Eigenen Testzugang','Feedback geben'])assert.match(completion,new RegExp(label));
  for(const key of ['conversation','presentation','trial','feedback'])assert.match(completion,new RegExp(`data-next="${key}"`));
});

test('completion page keeps composed messages private and reusable',()=>{
  assert.match(completion,/navigator\.clipboard\.writeText/);
  assert.match(completion,/navigator\.share/);
  assert.match(completion,/wird von dieser Seite nicht übertragen/);
  assert.match(completion,/href="\/\#contact"/);
  assert.match(completion,/href="\/demo"/);
});

test('completion page is accessible and excluded from indexing',()=>{
  assert.match(completion,/name="robots" content="noindex,nofollow"/);
  assert.match(completion,/role="group" aria-label="Nächsten Schritt auswählen"/);
  assert.match(completion,/aria-live="polite"/);
  assert.match(completion,/role="status"/);
});
