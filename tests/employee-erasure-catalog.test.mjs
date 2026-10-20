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
  const previousScrub = (await db.query("select pg_get_functiondef('private.sf_erasure_scrub_prepared(jsonb,text[],text[],jsonb,text[])'::regprocedure) definition")).rows[0].definition;
  await db.exec(previousScrub.replaceAll('private.sf_erasure_scrub_prepared(', 'private.sf_erasure_scrub_before('));
  // A newer shared planning table: large maps and multiple resumable row windows.
  await db.exec(`create table private.background_auto_plan_jobs(id uuid primary key default gen_random_uuid(),company_id uuid not null,payload jsonb,checkpoint jsonb);
   insert into private.background_auto_plan_jobs(company_id,payload,checkpoint)
   select '20000000-0000-0000-0000-000000000001',
    jsonb_build_object('rows',jsonb_build_array(jsonb_build_object('employee_id','30000000-0000-0000-0000-000000000001','name','Fixture Employee'),jsonb_build_object('employee_id','30000000-0000-0000-0000-000000000002','name','Fixture Colleague'))),
    jsonb_build_object('note','Fixture Employee') from generate_series(1,205);`);
  await db.exec(read('supabase/migrations/20261020052856_employee_erasure_bounded_shared_scans.sql'));
  await db.exec(read('supabase/migrations/20261020053042_employee_erasure_guard_fast_path.sql'));
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
  const wide = Object.fromEntries(Array.from({length:4000},(_,i)=>['key-'+i,i%500===0?{employee_id:refs[0]}:{note:'Unrelated planning state',index:i}]));
  const benchmark = async name => {
   const start=performance.now();
   const result=(await db.query(`select private.${name}($1,$2,$3,private.sf_erasure_uuid_map($2),private.sf_erasure_other_ids($2)) value`,[JSON.stringify(wide),refs,names])).rows[0].value;
   return {ms:Math.round(performance.now()-start),result};
  };
  const oldWide=await benchmark('sf_erasure_scrub_before'),newWide=await benchmark('sf_erasure_scrub_prepared');
  assert.deepEqual(newWide.result,oldWide.result,'large object aggregation must preserve exact cleanup semantics');
  console.log(`Wide planning object (4000 keys): previous ${oldWide.ms}ms, optimized ${newWide.ms}ms`);
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
  const cleanedPlanning=(await db.query("select count(*)::int n,bool_and(jsonb_array_length(payload->'rows')=1 and payload#>>'{rows,0,name}'='Fixture Colleague' and checkpoint='{}'::jsonb) clean from private.background_auto_plan_jobs")).rows[0];
  assert.equal(cleanedPlanning.n,205,'shared planning jobs must be preserved');
  assert.equal(cleanedPlanning.clean,true,'all row windows and both JSON columns must be cleaned');

  // Independent verification must still find a residual reference beyond its first
  // audit window. A processing checkpoint cannot conceal that remaining record.
  const company='20000000-0000-0000-0000-000000000001',actor='10000000-0000-0000-0000-000000000001';
  const jobId='50000000-0000-0000-0000-000000000099',lateId='30000000-0000-0000-0000-000000000099';
  await db.query(`insert into public.audit_events(company_id,event_type,entity_type,metadata)
   select $1,'FIXTURE','fixture',jsonb_build_object('note','Unrelated historical event') from generate_series(1,2200)`,[company]);
  await db.query(`insert into public.audit_events(id,company_id,event_type,entity_type,entity_id,metadata)
   values('ffffffff-ffff-ffff-ffff-ffffffffffff',$1,'FIXTURE','fixture',$2,'{}')`,[company,lateId]);
  const verifyPlan={references:[lateId],names:['Late Fixture'],employee_ids:[lateId],relations:[],storage_paths:[],delete_auth:false};
  await db.query(`insert into private.employee_erasure_jobs(id,company_id,employee_id,requested_by,employee_name,plan,status)
   values($1,$2,$3,$4,'Late Fixture',$5,'DATABASE_DONE')`,[jobId,company,lateId,actor,verifyPlan]);
  await assert.rejects(db.query(`insert into private.background_auto_plan_jobs(company_id,payload) values($1,'{"note":"Late Fixture"}')`,[company]),/Änderungen.*gesperrt/,'name-only reintroduction is frozen throughout final verification');
  await db.query(`insert into private.background_auto_plan_jobs(company_id,payload) values($1,'{"note":"Unrelated update"}')`,[company]);
  let pendingSeen=false,failedAsExpected=false;
  for(let attempt=0;attempt<100;attempt++){
   try {
    const response=(await db.query('select public.server_finish_employee_erasure($1,$2) result',[jobId,actor])).rows[0].result;
    assert.equal(response.verified,undefined,'no success until every independent verification window passes');
    assert.equal(response.pending,true);pendingSeen=true;
   } catch(error) {
    if(!/verbleibende Protokolldaten/.test(error.message))throw error;
    failedAsExpected=true;break;
   }
  }
  assert(pendingSeen&&failedAsExpected,'late residual record must fail verification after a committed pending window');
  assert.equal((await db.query('select count(*)::int n from private.employee_erasure_jobs where id=$1',[jobId])).rows[0].n,1,'failed final check preserves the resumable job');
 } finally {
  await db.close();
 }
});
