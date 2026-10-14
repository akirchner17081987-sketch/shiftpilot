import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const migration = 'supabase/migrations/20261014025029_employee_erasure_catalog_lookup.sql';

test('catalog lookup preserves the full erasure plan and existing deletion safeguards', async () => {
 const db = new PGlite();
 try {
  await db.exec(read('tests/sql/employee-erasure-bootstrap.sql'));
  for (const name of [
   '20261006163421_owner_employee_full_erasure.sql',
   '20261006163940_employee_erasure_snapshot_performance.sql',
   '20261006164346_employee_erasure_bulk_json_performance.sql',
   '20261006164615_employee_erasure_fast_preview.sql',
   '20261006165313_employee_erasure_audit_ownership_and_freshness.sql',
   '20261006172757_employee_erasure_auth_audit_json_compatibility.sql'
  ]) await db.exec(read('supabase/migrations/' + name));

  const integration = read('tests/sql/employee-erasure-integration.sql');
  const split = integration.indexOf("update public.employees set status='inactive'");
  assert.ok(split > 0);
  await db.exec(integration.slice(0, split));
  const plan = async () => (await db.query(`select private.sf_employee_erasure_plan(
   '20000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001') as plan`)).rows[0].plan;
  const before = await plan();
  await db.exec(read(migration));
  assert.deepEqual(await plan(), before, 'IDs, counts, row hashes and freshness fingerprint must remain identical');
  const reference = (await db.query("select pg_get_functiondef('private.sf_erasure_scrub(jsonb,text[],text[])'::regprocedure) as definition")).rows[0].definition.replaceAll('private.sf_erasure_scrub(', 'private.sf_erasure_scrub_reference(');
  await db.exec(reference);
  await db.exec(read('supabase/migrations/20261014030500_employee_erasure_all_steps_performance.sql'));
  await db.exec(read('supabase/migrations/20261014031150_employee_erasure_scan_performance.sql'));
  await db.exec(read('supabase/migrations/20261014031758_employee_erasure_large_planning_payloads.sql'));
  await db.exec(read('supabase/migrations/20261014032905_employee_erasure_reuse_guard_tokens.sql'));
  await db.exec(read('supabase/migrations/20261014034730_employee_erasure_resumable_database_batches.sql'));
  assert.deepEqual(await plan(), before, 'prepared lookup must preserve the preview fingerprint');
  const refs = ['30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'legacy_126', '126'];
  const names = ['Fixture Employee', 'Müller (Test)', 'Literal.%_\\\\Name'];
  const samples = [null, true, 123, '', 'unrelated', refs[0], refs[0].toUpperCase(), 'prefix'+refs[0]+'suffix',
   'prefix Fixture Employee suffix', 'MÜLLER (TEST)', names[2], 'legacy_126',
   {employee_id:refs[0], note:'Private'}, {employee_id:'colleague', employee_name:names[0]},
   {assignment_id:refs[1], employee_name:names[0]}, {[refs[0]]:'Private',keep:'unrelated'},
   {rows:[{employee_id:refs[0]},{employee_id:'colleague',employee_name:names[0]}]},
   [null, 'unrelated', refs[0], names[1], {note:refs[1]}], 'prefix126suffix', 'prefix 126 suffix', {id:'126'}, {'126':'value'}, {note:'deed 126 note'}, 126, ['126']];
  for (const sample of samples) {
   const q = (await db.query('select private.sf_erasure_scrub($1,$2,$3) as actual, private.sf_erasure_scrub_reference($1,$2,$3) as expected', [JSON.stringify(sample), refs, names])).rows[0];
   assert.deepEqual(q.actual,q.expected,JSON.stringify(sample));
  }
  // Hundreds of historical references and thousands of unrelated audit payloads.
  const manyRefs = Array.from({length:550},(_,i)=>`90000000-0000-0000-0000-${String(i).padStart(12,'0')}`);
  const matched = (await db.query(`with tokens as materialized (select private.sf_erasure_uuid_map($1) ids,private.sf_erasure_other_ids($1) other)
   select count(*)::int as n from generate_series(1,10000) i,tokens
   where private.sf_erasure_matches(jsonb_build_object('employee_id','unrelated','note',case when i%100=0 then $2 else 'Unrelated history' end)::text,ids,other)`,[manyRefs,manyRefs[123]])).rows[0].n;
  assert.equal(matched,100);
  const overlap = (await db.query("select private.sf_erasure_matches('aaaaaaaa-aaaa-aaaa-aaaa-0000bbbbbbbb-1111-2222-3333-444444444444',private.sf_erasure_uuid_map(array['bbbbbbbb-1111-2222-3333-444444444444']),array[]::text[]) as matched")).rows[0].matched;
  assert.equal(overlap,true,'overlapping UUID substrings must remain detectable');
  const unrelated = (await db.query("select private.sf_erasure_scrub('{\"employee_id\":\"30000000-0000-0000-0000-000000000002\",\"note\":\"colleague\"}'::jsonb,array['30000000-0000-0000-0000-000000000001'],array[]::text[]) as actual")).rows[0].actual;
  assert.equal(unrelated.employee_id,'30000000-0000-0000-0000-000000000002','same UUID prefix never authorizes erasure');
  const largePayload = Array.from({length:10000},(_,i)=>({employee_id:`80000000-0000-0000-0000-${String(i).padStart(12,'0')}`,key:`80000000-0000-0000-0000-${String(i).padStart(12,'0')}-2027-01-01`,note:'Unrelated archived auto-planning data'}));
  const largeMatch = (await db.query('select private.sf_erasure_matches($1,private.sf_erasure_uuid_map($2),array[]::text[]) as matched',[JSON.stringify(largePayload),manyRefs])).rows[0].matched;
  assert.equal(largeMatch,false);

  // A dropped company_id is not a tenant scope; check every registered relation.
  await db.exec('alter table private.push_dispatches add column company_id uuid; alter table private.push_dispatches drop column company_id;');
  assert.deepEqual(await plan(), before, 'dropped columns must not affect relation lookup');
  const rows = (await db.query(`select r.schema_name, r.table_name,
   exists(select 1 from information_schema.columns c where c.table_schema=r.schema_name and c.table_name=r.table_name and c.column_name='company_id') as old_lookup,
   exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=pg_catalog.to_regclass(pg_catalog.format('%I.%I',r.schema_name,r.table_name)) and a.attname='company_id' and a.attnum>0 and not a.attisdropped) as new_lookup
   from private.sf_erasure_relations(null,'{}','{}','{}','{}','{}','{}','{}') r`)).rows;
  assert.ok(rows.length > 30);
  for (const row of rows) assert.equal(row.new_lookup, row.old_lookup, row.schema_name + '.' + row.table_name);
  await db.exec(integration.slice(split));
 } finally {
  await db.close();
 }
});
