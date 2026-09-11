import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260911054512_fix_saxony_holidays.sql',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../assets/supabase-time-account-holidays-v1.js',import.meta.url),'utf8');
const loader=fs.readFileSync(new URL('../assets/conflict-plausibility-v1.js',import.meta.url),'utf8');
const page=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('Saxon Buß- und Bettag is based on the Wednesday on or before 22 November',()=>{
  assert.match(migration,/make_date\(p_year,11,22\)-\(\(extract\(dow from make_date\(p_year,11,22\)\)::integer\+4\)%7\)/);
  assert.doesNotMatch(migration,/make_date\(p_year,11,23\)-/);
  assert.match(migration,/'Buß- und Bettag',array\['SN'\]/);
});

test('holiday UI refreshes with the time-account workspace and identifies Saxony',()=>{
  assert.match(ui,/baseAccountRefresh=B\.timeAccounts\?\.refreshManager/);
  assert.match(ui,/\[data-time-mode="account"\]/);
  assert.match(ui,/Sachsen \(DE-SN\) ist verbindlich/);
  assert.match(ui,/Reformationsfest und Buß- und Bettag/);
  assert.match(loader,/supabase-time-account-holidays-v1\.js'\?'20260911-saxony1'/);
  assert.match(page,/conflict-plausibility-v1\.js\?v=20260911-saxony1/);
});
