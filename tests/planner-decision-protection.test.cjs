const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const sql=fs.readFileSync('supabase/migrations/20261031054806_planner_decision_protection.sql','utf8'),company='11111111-1111-1111-1111-111111111111',other='22222222-2222-2222-2222-222222222222',actor='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
test('planner locks survive normal writes and snapshots, require current authorized confirmation, and explicitly unlock',async()=>{
 const db=new PGlite();try{
 await db.exec(`create schema private;create schema auth;create role authenticated;create role anon;grant usage on schema public,private,auth to authenticated;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
 create function private.sf_assert_aal2(text) returns void language plpgsql as $$begin if current_setting('test.mfa',true)<>'yes' then raise exception 'MFA_REQUIRED';end if;end$$;
 create table companies(id uuid primary key,timezone text);create table company_members(company_id uuid,user_id uuid,status text,role text,extra_permissions text[] default '{}');
 create table employees(id uuid primary key,company_id uuid);create table company_compliance_policy(company_id uuid);create table absences(company_id uuid,id uuid);
 create table shift_assignments(id uuid primary key,company_id uuid,employee_id uuid,legacy_id text,shift_code text,starts_at timestamptz,ends_at timestamptz,break_minutes int default 0,note text default '',rhythm_override jsonb,status text default 'DRAFT',published_at timestamptz,version int default 1,check(ends_at-starts_at<=interval '10 hours'));
 create table audit_events(company_id uuid,event_type text,entity_type text,entity_id uuid,actor_id uuid,metadata jsonb);
 create table time_month_closures(company_id uuid,month_start date,status text);create table plan_publications(company_id uuid,week_start date,published_at timestamptz);
 create table time_entries(assignment_id uuid,actual_start timestamptz,actual_end timestamptz,status text,confirmed_at timestamptz,submitted_at timestamptz,employee_note text,manager_note text);
 create table time_qr_punches(assignment_id uuid);create table time_qr_breaks(assignment_id uuid);create table open_shift_market_claims(assignment_id uuid);create table shift_swap_requests(assignment_id uuid);create table shift_change_requests(assignment_id uuid);
 create table shift_templates(id uuid,company_id uuid);create table global_staffing_requirements(company_id uuid,shift_code text);create table daily_staffing_overrides(company_id uuid,work_date date,shift_code text);create table planning_wishes(id uuid,company_id uuid,start_date date,end_date date);create table company_planning_teams(company_id uuid,team_code text);
 create function private.sf_erasure_row_allowed(uuid,jsonb) returns boolean language sql as $$select false$$;
 create function private.sf_month_rhythm(employees,date) returns jsonb language sql as $$select '{"mode":"off"}'::jsonb$$;
 insert into companies values('${company}','Europe/Berlin');insert into company_members values('${company}','${actor}','ACTIVE','PLANNER','{}');insert into employees values('${actor}','${company}');
 insert into shift_assignments(id,company_id,employee_id,legacy_id,shift_code,starts_at,ends_at) values('${id}','${company}','${actor}','duty','FD','2027-01-04T05:00Z','2027-01-04T13:00Z');
 set test.actor='${actor}';set test.mfa='yes';`);
 await db.exec(sql);await db.exec('grant select,update,delete on shift_assignments to authenticated');
 const call=(locked,version=1,c=company)=>db.query(`select set_planner_assignment_lock('${c}','${id}',${locked},${version}) as result`);
 const snapshot=async()=> (await db.query(`select private.sf_month_optimization_snapshot('${company}','2027-01-01') as value`)).rows[0].value;
 const first=await snapshot();assert.equal(first.protectedIds.length,0);
 const lock=(await call(true)).rows[0].result;assert.equal(lock.planner_locked,true);assert.equal(lock.version,2);const pinned=await snapshot();assert.ok(pinned.protectedIds.includes(id));assert.notEqual(first.fingerprint,pinned.fingerprint);
 await db.exec('set role authenticated');await assert.rejects(()=>db.exec(`update shift_assignments set planner_locked=false where id='${id}'`),/bestätigte Planeraktion/);await assert.rejects(()=>db.exec(`update shift_assignments set note='change' where id='${id}'`),/fixiert/);await assert.rejects(()=>db.exec(`delete from shift_assignments where id='${id}'`),/fixiert/);await db.exec('reset role');
 await db.exec(`update shift_assignments set note=note where id='${id}'`);await assert.rejects(()=>call(false,1),/geändert/);await assert.rejects(()=>call(false,2,other),/Planungsrechte/);
 await db.exec("set test.mfa='no'");await assert.rejects(()=>call(false,2),/MFA_REQUIRED/);await db.exec("set test.mfa='yes'");
 await db.exec("update company_members set extra_permissions='{read_only}'");await assert.rejects(()=>call(false,2),/Planungsrechte/);await db.exec("update company_members set extra_permissions='{}',role='EMPLOYEE'");await assert.rejects(()=>call(false,2),/Planungsrechte/);await db.exec("update company_members set role='PLANNER'");
 await db.exec('set role anon');await assert.rejects(()=>call(false,2),/permission denied/);await db.exec('reset role');
 await db.exec(`update shift_assignments set status='PUBLISHED',published_at=now() where id='${id}'`);assert.equal((await call(false,2)).rows[0].result.planner_locked,false);
 await db.exec(`update shift_assignments set status='DRAFT',published_at=null where id='${id}'`);await db.exec(`update shift_assignments set note='explicitly unlocked' where id='${id}'`);
 await assert.rejects(()=>db.exec(`update shift_assignments set ends_at=starts_at+interval '12 hours' where id='${id}'`),/check constraint/);
 assert.equal((await snapshot()).protectedIds.length,0);assert.equal((await db.query("select count(*)::int as n from audit_events where event_type like 'PLANNER_ASSIGNMENT_%'")).rows[0].n,2);
 }finally{await db.close();}
});
