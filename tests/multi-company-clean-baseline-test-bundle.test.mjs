import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const script=new URL('../scripts/build-multi-company-clean-baseline-test.mjs',import.meta.url).pathname;
const manifest=JSON.parse(readFileSync(new URL('../drafts/multi-company-roles/clean-baseline-test-manifest.json',import.meta.url),'utf8'));
const output=execFileSync(process.execPath,[script],{encoding:'utf8'});

test('clean-baseline rehearsal combines index and isolated fixtures inside one rollback',()=>{
 assert.match(output,/^-- TEST ONLY:/);
 assert.match(output,/\nROLLBACK;\n$/);
 assert.equal((output.match(/^BEGIN;$/gm)||[]).length,1);
 assert.equal((output.match(/^ROLLBACK;$/gm)||[]).length,1);
 const idx=output.indexOf(`-- ${manifest.index.path}`);
 assert.ok(idx>output.indexOf('-- disruption-offers-company-candidate.sql'));
 let last=idx;
 for(const [i,item] of manifest.tests.entries()){
  const pos=output.indexOf(`-- ${item.path}`,last+1);
  assert.ok(pos>last,`missing or out of order: ${item.path}`);
  assert.ok(output.includes(`SAVEPOINT sf_case_${i};`));
  assert.ok(output.includes(`ROLLBACK TO SAVEPOINT sf_case_${i};`));
  last=pos;
 }
});

test('rehearsal gate rejects missing opt-in and an already altered index baseline',async()=>{
 const gate=output.match(/DO \$gate\$[\s\S]*?END \$gate\$;/)?.[0];
 assert.ok(gate);
 const db=new PGlite();
 try{
  await db.exec('create table public.employees(company_id uuid,auth_user_id uuid); create unique index employees_auth_user_id_uidx on public.employees(auth_user_id);');
  await assert.rejects(db.exec(gate),/opt-in missing/);
  await db.exec("select set_config('sf.isolated_rehearsal','yes',false)");
  await db.exec(gate);
  await db.exec('create unique index employees_company_auth_user_id_uidx on public.employees(company_id,auth_user_id)');
  await assert.rejects(db.exec(gate),/original index baseline absent/);
 }finally{await db.close();}
});
