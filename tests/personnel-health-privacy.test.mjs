import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const C='10000000-0000-4000-8000-000000000001', OTHER='10000000-0000-4000-8000-000000000002';
const OWNER='20000000-0000-4000-8000-000000000001',PLANNER='20000000-0000-4000-8000-000000000002',EMPLOYEE='20000000-0000-4000-8000-000000000003',DISABLED='20000000-0000-4000-8000-000000000004',ADMIN='20000000-0000-4000-8000-000000000005';
const E='30000000-0000-4000-8000-000000000001', E2='30000000-0000-4000-8000-000000000002',Q='40000000-0000-4000-8000-000000000001',D='50000000-0000-4000-8000-000000000001', A='60000000-0000-4000-8000-000000000001';
const db=new PGlite();
async function session(user,aal='aal1',extra={}){
 await db.exec('reset role');
 await db.query(`select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)`,[user,JSON.stringify({sub:user,role:'authenticated',aal,...extra})]);
 await db.exec('set role authenticated');
}
async function scalar(sql){return (await db.query(sql)).rows[0].v}
async function denied(sql,pattern=/MFA_REQUIRED|berechtigt|OWNER\/ADMIN|freigegeben/){await assert.rejects(db.query(sql),pattern)}
test('SQL privacy and MFA checks execute against isolated PostgreSQL',async t=>{
 try{
  await db.exec(read('tests/sql/access-profiles-bootstrap.sql').replace('create extension pgcrypto with schema extensions;',''));
  await db.exec(read('tests/sql/personnel-health-bootstrap.sql'));
  for(const p of ['20260830030705_schichtfunk_personnel_file_v1.sql','20260830032328_personnel_file_expiry_details_v2.sql','20260830040713_personnel_deadline_dashboard.sql','20260914053039_mfa_sensitive_action_guard_v1.sql'])await db.exec(read('supabase/migrations/'+p));
  // Run the actual existing pre-request guard; local PostgreSQL has no authenticator role.
  await db.exec('create role authenticator;');
  await db.exec(read('supabase/migrations/20260914053105_staged_privileged_aal2_gate_v1.sql'));
  await db.exec(`insert into public.companies(id,name,timezone) values('${C}','Synthetic company','Europe/Berlin'),('${OTHER}','Other synthetic company','Europe/Berlin');
   insert into public.company_members(company_id,user_id,role,status) values('${C}','${OWNER}','OWNER','ACTIVE'),('${C}','${ADMIN}','ADMIN','ACTIVE'),('${C}','${PLANNER}','PLANNER','ACTIVE'),('${C}','${DISABLED}','ADMIN','SUSPENDED');
   insert into public.employees(id,company_id,auth_user_id,status,access_status,first_name,last_name) values('${E}','${C}','${EMPLOYEE}','active','ACTIVE','Test','Person'),('${E2}','${OTHER}',null,'active','ACTIVE','Other','Test');
   insert into public.employee_personnel_qualifications(id,company_id,employee_id,title) values('${Q}','${C}','${E}','Synthetic credential');
   insert into public.employee_personnel_documents(id,company_id,employee_id,title,file_name,storage_path) values('${D}','${C}','${E}','Synthetic document','test.pdf','${C}/${E}/test.pdf');
   insert into storage.objects(bucket_id,name) values('personnel-documents','${C}/${E}/test.pdf');
   insert into public.absences(id,company_id,employee_id,start_date,end_date,absence_type,status,note,time_note,review_note) values('${A}','${C}','${E}','2026-10-01','2026-10-02','Krank','Erfasst','Synthetic diagnosis','Sensitive time note','Sensitive review');
   insert into public.absences(company_id,employee_id,start_date,end_date,absence_type,status,note,request_source) values('${C}','${E}','2026-10-03','2026-10-04','Kind Krank','Beantragt','Synthetic pending diagnosis','EMPLOYEE'),('${OTHER}','${E2}','2026-10-01','2026-10-02','Krank','Erfasst','Other company diagnosis','EMPLOYEE');
   insert into public.notifications(company_id,user_id,kind,entity_id,message,metadata) values('${C}','${PLANNER}','ABSENCE_REQUESTED','${A}','Krank with synthetic diagnosis','{"type":"Krank","reviewNote":"Sensitive review"}');
   insert into public.time_month_closures(company_id,month_start,status,report_snapshot) values('${C}','2026-09-01','CLOSED','{"report":{"details":[{"employee_id":"${E}","absence_types":"Krank"}]},"accounts":{"rows":[{"employee_id":"${E}","absence_types":"Kind Krank"}]}}');`);
  await db.exec(read('supabase/migrations/20261011214719_personnel_mfa_health_privacy.sql'));
  await db.exec("CREATE OR REPLACE FUNCTION public.manager_review_absence_request(p_absence_id uuid, p_decision text, p_review_note text DEFAULT ''::text)\n RETURNS text\n LANGUAGE sql\n SET search_path TO 'public', 'private', 'pg_temp'\nAS $function$\n  select private.manager_review_absence_request_impl(p_absence_id,p_decision,p_review_note)\n$function$\n;\nrevoke all on function public.manager_review_absence_request(uuid,text,text) from public,anon;\ngrant execute on function public.manager_review_absence_request(uuid,text,text) to authenticated;");
  await db.exec("create trigger notify_absence_insert after insert on public.absences for each row execute function private.sf_notify_absence_inserted();create trigger notify_absence_decision after update on public.absences for each row execute function private.sf_notify_absence_decided();");
  const calls={
   manager_personnel_file_bundle:`select public.manager_personnel_file_bundle('${E}')`,
   manager_update_personnel_details:`select public.manager_update_personnel_details('${E}','','','','',null,'','','Private note')`,
   manager_save_personnel_qualification:`select public.manager_save_personnel_qualification('${E}',null,'Training','Credential','','',null,null,'')`,
   manager_delete_personnel_qualification:`select public.manager_delete_personnel_qualification('${Q}')`,
   manager_register_personnel_document:`select public.manager_register_personnel_document('${E}','Document','Test document','test2.pdf','${C}/${E}/test2.pdf','application/pdf',1,null,null,'')`,
   manager_delete_personnel_document:`select public.manager_delete_personnel_document('${D}')`,
   manager_add_personnel_note:`select public.manager_add_personnel_note('${E}','ALLGEMEIN','Test','Sensitive synthetic note')`,
   manager_personnel_deadline_dashboard:`select public.manager_personnel_deadline_dashboard('${C}')`
  };
  await t.test('all eight personnel RPCs reject AAL1 at the API gate AND their shared server guard',async()=>{
   await session(OWNER);
   for(const [name,sql] of Object.entries(calls)){
    await db.query(`select set_config('request.path',$1,false)`,['/rpc/'+name]);
    await denied('select gateway.sf_enforce_staged_aal2()');
    await denied(sql);
   }
  });
  await t.test('planner AAL2 and forged user_metadata cannot grant personnel privileges',async()=>{
   await session(PLANNER,'aal2',{user_metadata:{role:'OWNER',access_role:'ADMIN',aal:'aal2'}});
   for(const sql of Object.values(calls))await denied(sql);
   assert.equal(await scalar(`select private.sf_can_read_personnel('${C}') v`),false);
  });
  await t.test('both authorized personnel roles work after MFA, including writes',async()=>{
   for(const user of [OWNER,ADMIN]){await session(user,'aal2');const r=await db.query(calls.manager_personnel_file_bundle);assert.ok(r.rows[0]);await db.query(calls.manager_update_personnel_details);await db.query(calls.manager_add_personnel_note)}
  });
  await t.test('Storage independently denies AAL1, planner, foreign tenant and malformed paths',async()=>{
   for(const [user,aal,n] of [[OWNER,'aal1',0],[PLANNER,'aal2',0],[OWNER,'aal2',1]]){await session(user,aal);assert.equal(await scalar('select count(*)::int v from storage.objects'),n)}
   assert.equal(await scalar(`select private.can_access_personnel_storage('${OTHER}/${E2}/test.pdf') v`),false);
   assert.equal(await scalar("select private.can_access_personnel_storage('bad/path/file') v"),false);
  });
  await t.test('planner RPC returns confirmed availability without medical labels or notes',async()=>{
   await session(PLANNER,'aal2');const rows=await scalar(`select public.manager_absence_overview('${C}') v`);
   assert.equal(rows.length,1);assert.equal(rows[0].absence_type,'Abwesend');assert.equal(rows[0].status,'Genehmigt');assert.equal(rows[0].note,'');assert.equal(rows[0].time_note,'');assert.equal(rows[0].review_note,'');assert.doesNotMatch(JSON.stringify(rows),/Krank|diagnosis|Sensitive/);
   assert.equal(await scalar('select count(*)::int v from public.absences'),0);
   await denied(`select public.manager_absence_overview('${OTHER}')`);
  });
  await t.test('raw medical rows and writes are inaccessible to planners and personnel without MFA',async()=>{
   for(const [user,aal] of [[OWNER,'aal1'],[PLANNER,'aal2']]){await session(user,aal);assert.equal(await scalar('select count(*)::int v from public.absences'),0);await db.exec(`update public.absences set note='tampered' where id='${A}';delete from public.absences where id='${A}';`);await denied(`insert into public.absences(company_id,employee_id) values('${C}','${E}')`,/row-level security/)}
   await session(OWNER,'aal2');assert.equal(await scalar(`select note v from public.absences where id='${A}'`),'Synthetic diagnosis');
   assert.equal(await scalar(`select jsonb_array_length(public.manager_absence_overview('${C}')) v`),2);
  });
  await t.test('availability conflicts still block direct planner assignment checks',async()=>{
   await session(PLANNER,'aal2');await denied(`select public.assert_standard_shift_rules('${C}','${E}','2026-10-01T08:00Z','2026-10-01T16:00Z')`,/approved absence/);
   await db.query(`select public.assert_standard_shift_rules('${C}','${E}','2026-10-06T08:00Z','2026-10-06T16:00Z')`);
   await denied(`select private.sf_approved_absence_overlaps('${OTHER}','${E2}','2026-10-01T08:00Z','2026-10-01T16:00Z','Europe/Berlin')`);
  });
  await t.test('review RPC rejects a planner and requires MFA for HR',async()=>{
   await db.exec('reset role');const pending=await scalar(`select id v from public.absences where company_id='${C}' and status='Beantragt'`);
   await session(PLANNER,'aal2');await denied(`select public.manager_review_absence_request('${pending}','APPROVE','')`,/Berechtigung/);
   await session(OWNER,'aal1');await denied(`select public.manager_review_absence_request('${pending}','APPROVE','')`);
   await session(OWNER,'aal2');assert.equal(await scalar(`select public.manager_review_absence_request('${pending}','REJECT','') v`),'Abgelehnt');
  });
  await t.test('employee sees their own medical rows, but no other company or personnel data',async()=>{
   await session(EMPLOYEE);assert.equal(await scalar('select count(*)::int v from public.absences'),2);await denied(calls.manager_personnel_file_bundle);await denied(`select public.manager_absence_overview('${C}')`);
   await db.exec('reset role');await db.exec(`update public.employees set access_status='SUSPENDED' where id='${E}'`);await session(EMPLOYEE);assert.equal(await scalar('select count(*)::int v from public.absences'),0);
   await db.exec('reset role');await db.exec(`update public.employees set access_status='ACTIVE' where id='${E}'`);
  });
  await t.test('suspended HR membership cannot use AAL2 to read personnel or absence data',async()=>{
   await session(DISABLED,'aal2');assert.equal(await scalar('select count(*)::int v from public.absences'),0);await denied(calls.manager_personnel_file_bundle);await denied(`select public.manager_absence_overview('${C}')`);
  });
  await t.test('archived medical reports are sanitized; direct snapshots and audit rows require MFA',async()=>{
   await session(PLANNER,'aal2');assert.equal(await scalar('select count(*)::int v from public.time_month_closures'),0);
   for(const fn of ['manager_time_report_bundle','manager_monthly_time_accounts']){const value=await scalar(`select public.${fn}('${C}','2026-09-01') v`);assert.doesNotMatch(JSON.stringify(value),/Krank/);assert.match(JSON.stringify(value),/Abwesend/)}
   await session(OWNER,'aal1');assert.equal(await scalar('select count(*)::int v from public.audit_events'),0);
   await session(OWNER,'aal2');const value=await scalar(`select public.manager_time_report_bundle('${C}','2026-09-01') v`);assert.match(JSON.stringify(value),/Krank/);assert.ok(await scalar('select count(*)::int v from public.audit_events')>0);
  });
  await t.test('nested workspace absences are redacted without changing planning intervals or totals',async()=>{
   await session(PLANNER,'aal2');const payload={total:7,absences:[{type:'Krank',status:'Erfasst',from:'2026-10-01',note:'Diagnosis',time_note:'Diagnosis',review_note:'Diagnosis'}]};
   const r=await db.query(`select private.sf_absence_payload_for_role($1,$2::jsonb) v`,[C,JSON.stringify(payload)]);assert.deepEqual(r.rows[0].v,{total:7,absences:[{type:'Abwesend',status:'Genehmigt',from:'2026-10-01'}]});
  });
  await t.test('all eight authorized personnel RPCs remain functional after MFA',async()=>{
   await session(OWNER,'aal2');for(const sql of Object.values(calls))await db.query(sql);
  });
  await t.test('new medical requests and decisions emit neutral notification previews',async()=>{
   await session(EMPLOYEE);await db.query(`select private.employee_submit_absence_request_impl('Krank','2026-11-02','2026-11-03','Synthetic diagnosis')`);
   await db.exec('reset role');const pending=await scalar(`select id v from public.absences where start_date='2026-11-02' and company_id='${C}'`);
   await session(OWNER,'aal2');await db.query(`select public.manager_review_absence_request('${pending}','REJECT','Synthetic diagnosis')`);
   await db.exec('reset role');const previews=(await db.query(`select title,message,metadata from public.notifications where entity_id='${pending}'`)).rows;
   assert.ok(previews.length>=3);assert.doesNotMatch(JSON.stringify(previews),/Krank|diagnosis/);
  });
  await t.test('persisted manager notification previews lose medical type and free text',async()=>{
   await db.exec('reset role');const s=await scalar('select to_jsonb(n) v from public.notifications n limit 1');assert.doesNotMatch(JSON.stringify(s),/Krank|diagnosis|Sensitive/);assert.equal(s.is_read,false);
   assert.equal(await scalar('select count(*)::int v from private.sf_mfa_protected_rpcs where rollout_stage=3 and enabled'),8);
   assert.equal(await scalar('select count(*)::int v from private.sf_mfa_protected_rpcs where rollout_stage<>3 and enabled'),0);
  });
 }finally{await db.close()}
});
