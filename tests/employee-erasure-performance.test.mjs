import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const read = name => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
const uuid = i => {
 const h = createHash('sha256').update(String(i)).digest('hex');
 return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
};

test('compiled search preserves candidate matches, overlapping UUIDs and old checkpoint maps', async t => {
 const db = new PGlite();
 try {
  await db.exec('create schema private;');
  await db.exec(read('20261014031758_employee_erasure_large_planning_payloads.sql'));
  const latest = read('20261014034730_employee_erasure_resumable_database_batches.sql');
  await db.exec(latest.slice(latest.indexOf('-- Word tokens embedded')));
  const baseline = (await db.query("select pg_get_functiondef('private.sf_erasure_matches(text,jsonb,text[])'::regprocedure) as definition")).rows[0].definition;
  await db.exec(baseline.replace('private.sf_erasure_matches(', 'private.sf_erasure_matches_baseline('));
  const refs = Array.from({length:294}, (_,i) => uuid(i));
  const oldMap = (await db.query('select private.sf_erasure_uuid_map($1) as refs', [refs])).rows[0].refs;
  await db.exec(read('20261026000704_employee_erasure_compiled_candidates.sql'));
  const samples = [null, '', 'unrelated', ...refs, ...refs.map(x => x.toUpperCase()),
   ...refs.map(x => 'prefix'+x+'suffix'), ...refs.map(x => x.slice(0,28)+'ffffffff'),
   ...refs.map(x => x.slice(0,28)+'invalid!'),
   ...Array.from({length:500}, (_,i) => uuid(i+10000)),
   'aaaaaaaa-aaaa-aaaa-aaaa-0000bbbbbbbb-1111-2222-3333-444444444444',
   'Fixture Employee', 'prefix126suffix', 'prefix 126 suffix', 'Literal.%_\\Name'];
  const allRefs = [...refs, 'bbbbbbbb-1111-2222-3333-444444444444'];
  const tokens = ['Fixture Employee','126','Literal.%_\\Name'];
  const differences = (await db.query(`with m as materialized (select private.sf_erasure_uuid_map($1) refs)
   select count(*)::int n from unnest($2::text[]) s,m
   where private.sf_erasure_matches(s,refs,$3) is distinct from
    private.sf_erasure_matches_baseline(s,refs - '_candidate_pattern',$3)`, [allRefs, samples, tokens])).rows[0].n;
  assert.equal(differences, 0, 'all candidate decisions must match the previous implementation');
  const legacy = (await db.query(`select private.sf_erasure_matches($1,$2,'{}') actual,
   private.sf_erasure_matches_baseline($1,$2,'{}') expected`, [refs[10], oldMap])).rows[0];
  assert.deepEqual(legacy, {actual:true,expected:true});
  for (const n of [0,512,513]) {
   const map = (await db.query('select private.sf_erasure_uuid_map($1) refs', [Array.from({length:n},(_,i)=>uuid(i))])).rows[0].refs;
   assert.equal('_candidate_pattern' in map, n>0 && n<=512);
   if(n) assert.equal((await db.query("select private.sf_erasure_matches($1,$2,'{}') matched", [uuid(n-1),map])).rows[0].matched,true);
  }
  // Large unrelated planning histories previously materialized every UUID match.
  const payload = JSON.stringify(Array.from({length:10000},(_,i)=>({employeeId:uuid(i+10000),assignmentId:uuid(i+20000),note:'Unrelated archived planning data'})));
  const map = (await db.query('select private.sf_erasure_uuid_map($1) refs', [refs])).rows[0].refs;
  const run = async name => {
   const start = performance.now();
   const matched = (await db.query(`select private.${name}($1,$2,'{}') matched`, [payload,map])).rows[0].matched;
   assert.equal(matched,false);
   return performance.now()-start;
  };
  await run('sf_erasure_matches');
  const before = await run('sf_erasure_matches_baseline');
  const after = await run('sf_erasure_matches');
  t.diagnostic(`2 MB planning history: baseline ${before.toFixed(1)} ms, compiled ${after.toFixed(1)} ms (${(before/after).toFixed(1)}x)`);
 } finally { await db.close(); }
});
