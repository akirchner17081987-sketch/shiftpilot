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
