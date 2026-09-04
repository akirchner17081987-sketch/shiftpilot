import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync(new URL('../demo.html',import.meta.url),'utf8');
const readability=fs.readFileSync(new URL('../assets/demo-readability-v1.js',import.meta.url),'utf8');

test('protected demo loads presentation readability styles',()=>{
  assert.match(page,/demo-readability-v1\.js/);
  assert.match(readability,/sf_demo_session_v1/);
  assert.match(readability,/html\[data-sf-demo="1"\]/);
});

test('manager workspace uses larger typography and a wider canvas',()=>{
  assert.match(readability,/max-width:1720px/);
  assert.match(readability,/page-head h1\{font-size:32px/);
  assert.match(readability,/sf-db-list-row small\{font-size:11px!important/);
  assert.match(readability,/main table\{font-size:13px/);
});

test('employee portal receives its own presentation typography',()=>{
  assert.match(readability,/sf-portal-welcome h1\{font-size:34px/);
  assert.match(readability,/sf-employee-tile small\{font-size:11px/);
  assert.match(readability,/sf-portal-card h3\{font-size:17px/);
});

test('compact layouts retain dedicated tablet and phone rules',()=>{
  assert.match(readability,/@media\(max-width:820px\)/);
  assert.match(readability,/@media\(max-width:560px\)/);
  assert.match(readability,/padding:17px 12px 76px/);
});
