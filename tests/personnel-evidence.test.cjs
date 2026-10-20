const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const read=p=>fs.readFileSync(p,'utf8');
const C='10000000-0000-4000-8000-000000000001',OTHER='10000000-0000-4000-8000-000000000002',OWNER='20000000-0000-4000-8000-000000000001',STAFF='20000000-0000-4000-8000-000000000002',FOREIGN='20000000-0000-4000-8000-000000000003',PLANNER='20000000-0000-4000-8000-000000000004',TIME='20000000-0000-4000-8000-000000000005',E='30000000-0000-4000-8000-000000000001',E2='30000000-0000-4000-8000-000000000002',Q='40000000-0000-4000-8000-000000000001';
const db=new PGlite();
async function session(user,aal='aal1'){await db.exec('reset role');await db.query(`select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)`,[user,JSON.stringify({sub:user,aal,role:'authenticated',user_metadata:{role:'OWNER'}})]);await db.exec('set role authenticated')}
async function call(mode,action,payload={},company=C){return (await db.query('select public.personnel_evidence($1,$2,$3,$4::jsonb) v',[company,mode,action,JSON.stringify(payload)])).rows[0].v}
const own=(action,p={})=>call('employee',action,{employee_id:E,...p});
async function stored(path,size=120,mime='application/pdf'){await db.exec('reset role');await db.query("insert into storage.objects(bucket_id,name,metadata) values('personnel-documents',$1,$2::jsonb)",[path,JSON.stringify({size,mimetype:mime})])}
test('credential workflow runs against PostgreSQL with real RPCs and Storage policies',async t=>{
 try{
  await db.exec(read('tests/sql/access-profiles-bootstrap.sql').replace('create extension pgcrypto with schema extensions;',''));
  await db.exec(read('tests/sql/personnel-health-bootstrap.sql'));
  await db.exec('alter table storage.objects add metadata jsonb;');
  await db.exec(read('supabase/migrations/20260830030705_schichtfunk_personnel_file_v1.sql'));
  await db.exec(`alter table public.employee_personnel_qualifications add conversation_visible boolean default false;
   create function private.sf_request_aal() returns text language sql stable as $$select coalesce(auth.jwt()->>'aal','aal1')$$;
   create function private.sf_guard_employee_erasure_pending() returns trigger language plpgsql as $$begin if current_setting('test.erasure',true)='locked' then raise exception 'Löschung läuft';end if; if tg_op='DELETE' then return old;else return new;end if;end$$;
   create or replace function private.sf_has_time_only_login() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.company_members where user_id=auth.uid() and role='TIME_TRACKING') and not exists(select 1 from public.company_members where user_id=auth.uid() and role<>'TIME_TRACKING' and status='ACTIVE')$$;
   create or replace function private.personnel_admin_role(p_company_id uuid) returns text language plpgsql stable security definer set search_path='' as $$declare r text;begin select role into r from public.company_members where company_id=p_company_id and user_id=auth.uid() and status='ACTIVE' and role in ('OWNER','ADMIN');if r is not null and private.sf_request_aal()<>'aal2' then raise exception 'MFA_REQUIRED';end if;return r;end$$;
   create or replace function private.can_access_personnel_storage(p_name text) returns boolean language sql stable security definer set search_path='' as $$select private.sf_request_aal()='aal2' and exists(select 1 from public.company_members cm where cm.company_id::text=split_part(p_name,'/',1) and cm.user_id=auth.uid() and cm.role in ('OWNER','ADMIN') and cm.status='ACTIVE')$$;
   insert into public.companies(id,name) values('${C}','Synthetic company'),('${OTHER}','Other');
   insert into public.company_members(company_id,user_id,role,status) values('${C}','${OWNER}','OWNER','ACTIVE'),('${C}','${PLANNER}','PLANNER','ACTIVE'),('${C}','${TIME}','TIME_TRACKING','ACTIVE');
   insert into public.employees(id,company_id,auth_user_id,status,access_status,first_name,last_name) values('${E}','${C}','${STAFF}','active','ACTIVE','Test','Person'),('${E2}','${OTHER}','${FOREIGN}','active','ACTIVE','Other','Person');
   insert into public.employee_personnel_qualifications(id,company_id,employee_id,title,conversation_visible) values('${Q}','${C}','${E}','First aid',true);`);
  await db.exec(read('database/personnel-evidence-service.sql'));
  let req,upload;
  await t.test('migration mirror is exact and public wrapper is an invoker',async()=>{
   assert.equal(read('database/personnel-evidence-service.sql'),read('supabase/migrations/20261020042753_personnel_evidence_service.sql'));
   assert.equal((await db.query("select prosecdef from pg_proc where oid='public.personnel_evidence(uuid,text,text,jsonb)'::regprocedure")).rows[0].prosecdef,false);
  });
  await t.test('AAL1, planner, anonymous, wrong mode and foreign tenant cannot create',async()=>{
   for(const [who,aal] of [[OWNER,'aal1'],[PLANNER,'aal2'],[STAFF,'aal2']]){await session(who,aal);await assert.rejects(call('manager','create',{employee_id:E,title:'First aid'}),/MFA_REQUIRED|Personalverwaltung/)}
   await session(OWNER,'aal2');await assert.rejects(call('manager','create',{employee_id:E2,title:'First aid'}),/Mitarbeiterzugang/);await assert.rejects(call('oops','list'),/berechtigt/);
   await db.exec('reset role;set role anon;');await assert.rejects(call('employee','list'),/permission denied/);
  });
  await t.test('request notifies the employee without putting document details into notifications',async()=>{
   await session(OWNER,'aal2');req=await call('manager','create',{employee_id:E,title:'First aid renewal',instructions:'Please renew',qualification_id:Q,operation_id:'50000000-0000-4000-8000-000000000001'});
   assert.equal((await call('manager','create',{employee_id:E,title:'First aid renewal',operation_id:req.id})).id,req.id);
   await session(STAFF);const list=await own('list');assert.equal(list.requests.length,1);assert.equal(list.requests[0].status,'requested');
   await db.exec('reset role');const notifications=(await db.query('select * from public.notifications')).rows;assert.equal(notifications.length,1);assert.equal(notifications[0].user_id,STAFF);assert.doesNotMatch(JSON.stringify(notifications),/First aid renewal|Please renew/);
  });
  await t.test('own access rejects different employee, company, suspended access and time-only accounts',async()=>{
   await session(FOREIGN);await assert.rejects(own('list'),/Mitarbeiterzugang/);
   await session(STAFF);await assert.rejects(call('employee','list',{employee_id:E},OTHER),/Mitarbeiterzugang/);await assert.rejects(own('list',{employee_id:E2}),/Mitarbeiterzugang/);
   await db.exec(`reset role;update public.employees set access_status='SUSPENDED' where id='${E}';`);await session(STAFF);await assert.rejects(own('list'),/Mitarbeiterzugang/);
   await db.exec(`reset role;update public.employees set access_status='ACTIVE' where id='${E}';insert into public.company_members values('${C}','${STAFF}','PLANNER','SUSPENDED',now());`);await session(STAFF);await assert.rejects(own('list'),/Mitarbeiterzugang/);
   await db.exec(`reset role;delete from public.company_members where user_id='${STAFF}';update public.employees set auth_user_id='${TIME}' where id='${E}';`);await session(TIME);await assert.rejects(own('list'),/berechtigt/);
   await db.exec(`reset role;update public.employees set auth_user_id='${STAFF}' where id='${E}';`);
  });
  await t.test('server reserves a single immutable path; types and sizes are constrained',async()=>{
   await session(STAFF);for(const p of [{mime_type:'text/html',file_size:1},{mime_type:'application/pdf',file_size:10485761}])await assert.rejects(own('reserve',{request_id:req.id,revision:1,file_name:'bad',...p}),/check constraint/);
   upload=await own('reserve',{request_id:req.id,revision:1,file_name:'renewal.pdf',mime_type:'application/pdf',file_size:120});
   assert.equal((await own('reserve',{request_id:req.id,revision:1,file_name:'renewal.pdf',mime_type:'application/pdf',file_size:120})).id,upload.id);
   await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('personnel-documents','arbitrary/path')"),/row-level security/);
   await db.query("insert into storage.objects(bucket_id,name,metadata) values('personnel-documents',$1,'{\"size\":120,\"mimetype\":\"application/pdf\"}')",[upload.path]);
   assert.equal((await db.query('select count(*) n from storage.objects')).rows[0].n,1);
   assert.equal((await db.query('delete from storage.objects returning name')).rows.length,0);
   assert.equal((await db.query("update storage.objects set name='tampered' returning name")).rows.length,0);
   await session(FOREIGN);assert.equal((await db.query('select count(*) n from storage.objects')).rows[0].n,0);
   await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('personnel-documents',$1)",[upload.path]),/row-level security/);
  });
  await t.test('submit validates server Storage metadata and never creates personnel documents early',async()=>{
   await db.exec("reset role;update storage.objects set metadata='{}';");await session(STAFF);await assert.rejects(own('submit',{request_id:req.id,revision:1,submission_id:upload.id}),/Datei fehlt/);
   await db.exec('reset role');await db.query("update storage.objects set metadata='{\"size\":120,\"mimetype\":\"application/pdf\"}'");await session(STAFF);
   await own('submit',{request_id:req.id,revision:1,submission_id:upload.id});assert.equal((await own('list')).requests[0].status,'in_review');
   await db.exec('reset role');assert.equal((await db.query('select count(*) n from public.employee_personnel_documents')).rows[0].n,0);
   await session(STAFF);await assert.rejects(own('review',{request_id:req.id,revision:2,submission_id:upload.id,note:'Approve this',decision:'approved'}),/berechtigt/);
  });
  await t.test('MFA review requests changes and employee sees the exact feedback',async()=>{
   await session(OWNER,'aal2');await assert.rejects(call('manager','review',{request_id:req.id,revision:1,submission_id:upload.id,note:'Unreadable',decision:'changes_requested'}),/inzwischen geändert/);
   await call('manager','review',{request_id:req.id,revision:2,submission_id:upload.id,note:'Please upload a readable scan.',decision:'changes_requested'});
   await session(STAFF);const r=(await own('list')).requests[0];assert.equal(r.status,'changes_requested');assert.match(r.submissions[0].review_note,/readable/);assert.equal(r.revision,3);
  });
  await t.test('new version preserves the old file and approval is atomic and exactly once',async()=>{
   await session(STAFF);upload=await own('reserve',{request_id:req.id,revision:3,file_name:'clear.pdf',mime_type:'application/pdf',file_size:120});await stored(upload.path);await session(STAFF);await own('submit',{request_id:req.id,revision:3,submission_id:upload.id});
   const review={request_id:req.id,revision:4,submission_id:upload.id,note:'Reviewed and accepted',decision:'approved',title:'First aid renewed',issued_on:'2026-10-20',expires_on:'2028-10-20',issuer:'Synthetic issuer',save_qualification:true,confirmed:true};
   await session(OWNER,'aal2');await assert.rejects(call('manager','review',{...review,confirmed:false}),/ausdrücklich bestätigen/);
   await call('manager','review',review);await assert.rejects(call('manager','review',review),/inzwischen geändert/);
   await db.exec('reset role');const docs=(await db.query('select * from public.employee_personnel_documents')).rows;assert.equal(docs.length,1);assert.equal(docs[0].storage_path,upload.path);
   const q=(await db.query('select * from public.employee_personnel_qualifications')).rows[0];assert.equal(q.title,'First aid renewed');assert.equal(q.conversation_visible,false);
   assert.equal((await db.query('select count(*) n from storage.objects')).rows[0].n,2);
   await session(OWNER,'aal2');assert.equal((await db.query("update storage.objects set name='newname' returning name")).rows.length,0);
   await session(STAFF);assert.equal((await own('list')).requests[0].submissions.length,2);assert.equal((await own('list')).requests[0].status,'approved');
   await assert.rejects(db.query('select * from public.employee_personnel_documents'),/permission denied/);
   await assert.rejects(db.query('select * from private.personnel_evidence_requests'),/permission denied/);
  });
  await t.test('cancellation stops uploads; paginated list retains all records',async()=>{
   await session(OWNER,'aal2');const r=await call('manager','create',{employee_id:E,title:'Extra credential'});await call('manager','cancel',{request_id:r.id,revision:1,note:'No longer required'});
   await session(STAFF);await assert.rejects(own('reserve',{request_id:r.id,revision:2,file_name:'x.pdf',mime_type:'application/pdf',file_size:10}),/nicht eingereicht/);
   assert.equal((await own('list',{offset:1})).requests.length,1);assert.equal((await own('list',{offset:1})).total,2);
  });
  await t.test('erasure freeze is attached and employee deletion cascades request and submission rows',async()=>{
   await db.exec("reset role;select set_config('test.erasure','locked',false)");await session(OWNER,'aal2');await assert.rejects(call('manager','create',{employee_id:E,title:'Blocked'}),/Löschung läuft/);
   await db.exec("reset role;select set_config('test.erasure','',false)");await db.query('delete from public.employees where id=$1',[E]);
   for(const table of ['personnel_evidence_requests','personnel_evidence_submissions'])assert.equal((await db.query('select count(*) n from private.'+table)).rows[0].n,0);
  });
 }finally{await db.close()}
});
