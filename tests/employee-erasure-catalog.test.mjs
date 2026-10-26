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
  await db.exec(read('supabase/migrations/20261026000704_employee_erasure_compiled_candidates.sql'));
  await db.exec(read('tests/sql/employee-erasure-live-baseline.sql'));
  await db.exec(`create table private.erasure_test_documents(id uuid primary key,company_id uuid not null,payload jsonb,result jsonb,json_null jsonb not null default 'null');
   insert into private.erasure_test_documents(id,company_id,payload,result) values
    ('91000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','{"rows":[{"employee_id":"30000000-0000-0000-0000-000000000001"},{"employee_id":"30000000-0000-0000-0000-000000000002"}]}','{"note":"Fixture Employee"}'),
    ('91000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','{"note":"Unrelated archived result"}',null),
    ('91000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002','{"note":"Fixture Employee"}','{}');`);
  await db.exec(read('supabase/migrations/20261026002347_employee_erasure_indexed_batches_progress.sql'));
  await db.exec(read('supabase/migrations/20261026005108_employee_erasure_native_reference_terms.sql'));
  assert.equal((await db.query("select ready from private.employee_erasure_index_sources where table_name='erasure_test_documents'")).rows[0].ready,false);
  await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
  for(let i=0;i<20;i++) {
   if((await db.query('select public.server_backfill_employee_erasure_references() result')).rows[0].result.complete)break;
   assert.ok(i<19,'reference backfill must converge');
  }
  assert.equal((await db.query("select ready from private.employee_erasure_index_sources where table_name='erasure_test_documents'")).rows[0].ready,true);
  assert.equal((await db.query("select count(*)::int n from private.employee_erasure_reference_index where source_oid='private.erasure_test_documents'::regclass")).rows[0].n,3);
  await db.exec(`insert into private.erasure_test_documents(id,company_id,payload) values('91000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001','{"note":"reference-insert"}');`);
  assert.equal((await db.query("select terms @> array['reference','insert'] indexed from private.employee_erasure_reference_index where row_id='91000000-0000-0000-0000-000000000004'")).rows[0].indexed,true);
  await db.exec(`update private.erasure_test_documents set payload='{"note":"reference-update"}' where id='91000000-0000-0000-0000-000000000004';`);
  const refreshed=(await db.query("select terms @> array['reference','update'] updated, terms @> array['reference','insert'] stale from private.employee_erasure_reference_index where row_id='91000000-0000-0000-0000-000000000004'")).rows[0];
  assert.deepEqual(refreshed,{updated:true,stale:false});
  await db.exec("delete from private.erasure_test_documents where id='91000000-0000-0000-0000-000000000004'");
  assert.equal((await db.query("select count(*)::int n from private.employee_erasure_reference_index where row_id='91000000-0000-0000-0000-000000000004'")).rows[0].n,0);
  // Missing entries must trigger a complete read, rather than silently skipping data.
  await db.exec("delete from private.employee_erasure_reference_index where row_id='91000000-0000-0000-0000-000000000001'");
  // New JSON fields invalidate the registered column signature and force a scan.
  await db.exec(`alter table private.erasure_test_documents add column extra_payload jsonb;
   update private.erasure_test_documents set extra_payload='{"note":"Fixture Employee"}' where id='91000000-0000-0000-0000-000000000002';`);
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
   const candidate=(await db.query(`with t as materialized(select * from private.sf_erasure_reference_tokens($1)),
    q as materialized(select private.sf_erasure_reference_query($2,$3) value)
    select (value->>'fallback')::boolean or uuid_prefixes && array(select jsonb_array_elements_text(value->'prefixes'))
     or terms && array(select jsonb_array_elements_text(value->'terms')) as candidate from t,q`,[JSON.stringify(sample),refs,names])).rows[0].candidate;
   if(JSON.stringify(q.actual)!==JSON.stringify(sample))assert.equal(candidate,true,'reference index must never omit a required cleanup');
  }
  for(const [value,ids,names] of [
   [{note:'prefix erasure-target suffix'},['erasure-target'],[]],
   ['Foo\nBar',[],['Foo\nBar']],
   ['before\nBar',[],['Bar']],
   ['\\nBar',[],['nBar']],
   ['\u001fBar',[],['Bar']],
   [{'legacy-target':'private'},['legacy-target'],[]],
   [{note:'MÜLLER SCHMITT'},[],['Müller Schmitt']]
  ]) {
   const row=(await db.query(`with t as materialized(select * from private.sf_erasure_reference_tokens($1)),q as materialized(select private.sf_erasure_reference_query($2,$3) value)
    select private.sf_erasure_scrub($1,$2,$3) cleaned,(value->>'fallback')::boolean or uuid_prefixes && array(select jsonb_array_elements_text(value->'prefixes')) or terms && array(select jsonb_array_elements_text(value->'terms')) candidate from t,q`,[JSON.stringify(value),ids,names])).rows[0];
   assert.notDeepEqual(row.cleaned,value);assert.equal(row.candidate,true,'decoded names and punctuated legacy IDs remain indexed candidates');
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
  // Even a corrupted candidate index cannot bypass the independent full check.
  await db.exec(`begin;savepoint index_integrity_test;
   select set_config('request.jwt.claim.role','service_role',true);
   select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
   do $$declare preview_ jsonb; job_ jsonb; result_ jsonb; rejected_ boolean:=false;
   begin
    preview_:=public.owner_employee_erasure_preview('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001');
    job_:=public.server_stage_employee_erasure('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000099','Fixture Employee',true,preview_->>'fingerprint');
    delete from storage.objects;
    update private.employee_erasure_index_sources set json_columns=array['extra_payload','json_null','payload','result'] where table_name='erasure_test_documents';
    update private.employee_erasure_reference_index set uuid_prefixes='{}',terms='{}' where source_oid='private.erasure_test_documents'::regclass;
    insert into private.employee_erasure_reference_index(source_oid,row_id,company_id,uuid_prefixes,terms) values('private.erasure_test_documents'::regclass,'91000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','{}','{}') on conflict do nothing;
    perform public.finish_database_erasure_for_test((job_->>'job_id')::uuid,'10000000-0000-0000-0000-000000000001');
    for i in 1..100 loop
     begin
      result_:=public.server_finish_employee_erasure((job_->>'job_id')::uuid,'10000000-0000-0000-0000-000000000001');
      if result_->>'complete'='true' then raise exception 'ASSERTION: corrupted index bypassed full verification';end if;
     exception when others then
      if sqlerrm like '%verbleibende Daten in erasure_test_documents%' then rejected_:=true;exit;else raise;end if;
     end;
    end loop;
    perform public.assert_erasure(rejected_,'independent verification detects index omissions');
    perform public.assert_erasure((select percentage<100 and completed_at is null from private.employee_erasure_metrics where job_id=(job_->>'job_id')::uuid),'failed verification never reaches 100 percent');
   end $$;
   rollback to savepoint index_integrity_test;commit;`);
  await db.exec(integration.slice(split));
  const documents=(await db.query('select id,payload,result,extra_payload from private.erasure_test_documents order by id')).rows;
  assert.deepEqual(documents[0].payload,{rows:[{employee_id:'30000000-0000-0000-0000-000000000002'}]});
  assert.deepEqual(documents[0].result,{});
  assert.equal((await db.query("select bool_and(json_null is not null and jsonb_typeof(json_null)='null') preserved from private.erasure_test_documents")).rows[0].preserved,true,'JSON null is preserved separately from SQL NULL');
  assert.deepEqual(documents[1].payload,{note:'Unrelated archived result'});
  assert.equal(documents[1].result,null,'SQL nulls remain SQL nulls when another JSON field changes');
  assert.deepEqual(documents[1].extra_payload,{});
  assert.deepEqual(documents[2].payload,{note:'Fixture Employee'},'other company JSON is preserved');
  const metrics=(await db.query('select percentage,phase_ms,to_jsonb(m)::text snapshot from private.employee_erasure_metrics m')).rows;
  assert.ok(metrics.length>=2);
  for(const m of metrics){assert.equal(m.percentage,100);assert.ok(m.phase_ms.VERIFY>=0);assert(!m.snapshot.includes('Fixture Employee'));}
  const privileges=(await db.query(`select has_function_privilege('anon','public.owner_employee_erasure_progress(uuid,uuid)','execute') anonymous,
   has_function_privilege('authenticated','public.server_backfill_employee_erasure_references()','execute') backfill,
   has_function_privilege('authenticated','private.sf_employee_erasure_commit_batch_v2(uuid,uuid)','execute') commit`)).rows[0];
  assert.deepEqual(privileges,{anonymous:false,backfill:false,commit:false});
 } finally {
  await db.close();
 }
});
