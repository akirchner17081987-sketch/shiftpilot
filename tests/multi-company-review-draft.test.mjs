import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {PGlite} from '@electric-sql/pglite';

const path=new URL('../scripts/build-multi-company-review-draft.mjs',import.meta.url).pathname;
const sql=execFileSync(process.execPath,[path],{encoding:'utf8',maxBuffer:8*1024*1024});

test('review draft contains the reviewed index and one invitation definition without test fixtures',()=>{
 assert.match(sql,/^-- REVIEW DRAFT ONLY/);
 assert.match(sql,/-- employee-identity-index-candidate\.sql/);
 assert.equal(sql.split('CREATE OR REPLACE FUNCTION private.claim_multi_company_invite(p_token text)').length-1,1);
 assert.ok(!sql.includes('sf-rehearsal-owner@example.invalid'));
 assert.ok(!sql.includes('SAVEPOINT sf_case_'));
 assert.match(sql,/\nROLLBACK;\n$/);
});

test('the review draft fails closed before any candidate statement',async()=>{
 const boundary=sql.indexOf('\n-- company-options-candidate.sql\n');
 assert.ok(boundary>0);
 const db=new PGlite();
 try{
  await assert.rejects(db.exec(sql.slice(0,boundary)),/intentionally blocked/);
  await db.exec('ROLLBACK');
  assert.equal((await db.query("select to_regclass('public.employees') is null as absent")).rows[0].absent,true);
 }finally{await db.close();}
});
