import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=fs.readdirSync(new URL('../supabase/migrations/',import.meta.url)).find(f=>f.endsWith('_access_mfa_action_matrix.sql'));
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const C=id(1),C2=id(2),O=id(10),A=id(11),T=id(12),R=id(13),N=id(14),F=id(15),D=id(16),Z=id(17),E=id(20),S=id(30),Q=id(40);
const stamp='2026-10-01T06:00:00Z',end='2026-10-01T14:00:00Z';
const save=(note='Korrektur nach Rücksprache',confirm=false,start=stamp)=>`select public.manager_save_time_entry('${S}','${start}','${end}',0,'${note}',${confirm})`;
test('access and MFA matrix is enforced in PostgreSQL, including direct table paths',async t=>{
 const db=new PGlite(),scalar=async sql=>(await db.query(sql)).rows[0].v;
 const session=async(u,aal='aal2')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[u||'',JSON.stringify({sub:u,role:'authenticated',aal})]);await db.exec('set role authenticated');};
 const deny=sql=>assert.rejects(db.query(sql),/berechtigt|Berechtigung|MFA_REQUIRED|Zusatzrecht|permission denied|policy|begründen|Inhaber/i);
 try{
  await db.exec(read('tests/sql/access-profiles-bootstrap.sql').replace('create extension pgcrypto with schema extensions;',''));
  await db.exec(read('tests/sql/personnel-health-bootstrap.sql'));
  await db.exec(`create role authenticator;
   create table public.time_qr_terminals(id uuid primary key,company_id uuid,is_active boolean,pilot_mode boolean,pilot_employee_id uuid,token_hash bytea,vault_secret_id uuid,name text,location_note text,site_id uuid,rotated_at timestamptz,disabled_at timestamptz,created_by uuid,updated_by uuid,updated_at timestamptz);
   create table public.datev_lodas_settings(company_id uuid primary key);
   create table public.datev_lodas_rules(company_id uuid,id uuid);
   create table public.time_qr_breaks(id uuid,company_id uuid);
   alter table public.company_member_invites enable row level security;
   grant select,insert,update,delete on public.company_member_invites to authenticated;
   alter table public.employee_access_invites enable row level security;
   create policy fixture_invites on public.employee_access_invites for all to authenticated using(true) with check(true);
   grant select,insert,update,delete on public.employee_access_invites to authenticated;
   grant select,insert,update,delete on public.time_entries to authenticated;
   create function public.publish_schedule_period(p_company_id uuid,p_start_date date,p_end_date date) returns integer language sql as $$select 1$$;
   create function public.reset_company_schedule(p_company_id uuid,p_month date,p_confirm text) returns jsonb language sql as $$select '{}'::jsonb$$;
   create function public.manager_update_time_account_settings(p_company_id uuid,p_account_start_date date,p_credited_absence_types text[]) returns jsonb language sql as $$select '{}'::jsonb$$;
   create function public.manager_close_time_month(p_company_id uuid,p_month date,p_note text) returns jsonb language sql as $$select '{}'::jsonb$$;
   create function public.manager_reopen_time_month(p_company_id uuid,p_month date,p_note text) returns jsonb language sql as $$select '{}'::jsonb$$;`);
  for(const f of ['20261009220109_four_primary_access_roles.sql','20261009223333_access_profile_private_rpc_wrappers.sql','20260914053039_mfa_sensitive_action_guard_v1.sql','20260914053105_staged_privileged_aal2_gate_v1.sql'])await db.exec(read('supabase/migrations/'+f));
  // Match production helper argument names; the older fixture uses a shortened alias.
  await db.exec('drop function private.can_manage_company_users(uuid);');
  await db.exec(`create function private.can_manage_company_users(p_company_id uuid) returns boolean language sql as $$select false$$;
   create policy fixture_company_invites on public.company_member_invites for all to authenticated using(private.can_manage_company_users(company_id)) with check(private.can_manage_company_users(company_id));
   create function private.sf_personnel_conversation_employee_ids(p_company_id uuid) returns uuid[] language sql as $$select '{}'::uuid[]$$;
   create function private.sf_personnel_leadership_identity(uuid,uuid,text,text) returns boolean language sql as $$select false$$;
   create table public.company_locations(id uuid,company_id uuid,is_active boolean);
   -- Report payload redaction is covered by the personnel privacy suite.
   create function private.sf_absence_payload_for_role(p_company_id uuid,value_ jsonb) returns jsonb language sql as $$select value_$$;
   insert into public.time_month_closures(company_id,month_start,status,revision,report_snapshot) values('${C}','2026-10-01','CLOSED',1,'{"employees":[],"details":[]}');
   insert into auth.users(id,email) values('${O}','owner@example.invalid'),('${A}','admin@example.invalid'),('${T}','editor@example.invalid'),('${R}','reviewer@example.invalid'),('${N}','no-rights@example.invalid'),('${F}','foreign@example.invalid'),('${D}','disabled@example.invalid'),('${Z}','time-only@example.invalid');
   insert into public.companies(id,name) values('${C}','Synthetic A'),('${C2}','Synthetic B');
   insert into public.company_members(company_id,user_id,role,status,access_role,extra_permissions) values
   ('${C}','${O}','OWNER','ACTIVE','OWNER','{}'),('${C}','${A}','ADMIN','ACTIVE','ADMIN','{}'),
   ('${C}','${T}','PLANNER','ACTIVE','TEAM_LEAD','{manage_time}'),('${C}','${R}','PLANNER','ACTIVE','TEAM_LEAD','{confirm_time}'),
   ('${C}','${N}','PLANNER','ACTIVE','TEAM_LEAD','{}'),('${C2}','${F}','OWNER','ACTIVE','OWNER','{}'),
   ('${C}','${D}','ADMIN','DISABLED','ADMIN','{}'),('${C}','${Z}','TIME_TRACKING','ACTIVE','EMPLOYEE','{manage_time,confirm_time}');
   insert into public.employees(id,company_id,first_name,last_name,status,access_status) values('${E}','${C}','Synthetic','Staff','active','ACTIVE');
   insert into public.shift_assignments(id,company_id,employee_id,shift_code,starts_at,ends_at,status) values('${S}','${C}','${E}','O1','${stamp}','${end}','DRAFT');
   insert into public.time_qr_terminals(id,company_id) values('${Q}','${C}');`);
  await db.exec(read('supabase/migrations/'+migration));
  await t.test('owner and administrator need MFA for user-management helper; foreign and disabled accounts fail',async()=>{
   for(const u of [O,A]){await session(u,'aal1');await deny(`select private.can_manage_company_users('${C}')`);await session(u);assert.equal(await scalar(`select private.can_manage_company_users('${C}') v`),true);}
   for(const u of [T,R,N,F,D]){await session(u);assert.equal(await scalar(`select private.can_manage_company_users('${C}') v`),false);}
  });
  await t.test('direct portal invitations require admin and MFA, despite a permissive legacy policy',async()=>{
   const insert=`insert into public.employee_access_invites(company_id,employee_id,email,token_hash) values('${C}','${E}','invite@example.invalid','${'a'.repeat(64)}')`;
   await session(T);await deny(insert);await session(O,'aal1');await deny(insert);await session(O);await db.query(insert);
  });
  await t.test('administrator invitations cannot be deleted through a direct table bypass',async()=>{
   await session(O);await db.query(`insert into public.company_member_invites(id,company_id,email,role,status,token_hash,created_by) values('${id(60)}','${C}','protected-admin@example.invalid','ADMIN','INVITED','${'b'.repeat(64)}','${O}')`);
   await session(A);await db.query(`delete from public.company_member_invites where id='${id(60)}'`);
   assert.equal(await scalar(`select count(*)::int v from public.company_member_invites where id='${id(60)}'`),1);
   await session(O);await db.query(`delete from public.company_member_invites where id='${id(60)}'`);
   assert.equal(await scalar(`select count(*)::int v from public.company_member_invites where id='${id(60)}'`),0);
  });
  await t.test('manual time entry and correction require MFA and the assigned edit right',async()=>{
   for(const u of [O,T,Z]){await session(u,'aal1');await deny(save());}
   for(const u of [R,N,F,D]){await session(u);await deny(save());}
   await session(T);await db.query(save());
   await deny(save('',false,'2026-10-01T07:00:00Z'));
   await db.query(save('Beginn nach Rücksprache berichtigt',false,'2026-10-01T07:00:00Z'));
   await db.exec('reset role');const events=(await db.query("select actor_id,old_values,new_values,metadata from public.audit_events where event_type='TIME_ENTRY_SAVED' order by created_at")).rows;
   assert.equal(events.length,2);assert.equal(events[1].actor_id,T);assert.ok(events[1].old_values);assert.equal(events[1].metadata.reason,'Beginn nach Rücksprache berichtigt');
  });
  await t.test('edit-only users cannot confirm; review-only users can confirm with MFA',async()=>{
   await session(T);await deny(save('Geprüft',true));
   await session(R,'aal1');await deny(`select public.manager_review_time_entry('${S}','CONFIRM','Geprüft')`);
   await session(R);await db.query(`select public.manager_review_time_entry('${S}','CONFIRM','Geprüft')`);
  });
  await t.test('direct time table writes also require MFA and a correction reason',async()=>{
   await session(O,'aal1');await deny(`update public.time_entries set actual_start='2026-10-01T08:00:00Z' where assignment_id='${S}'`);
   await session(O);await deny(`update public.time_entries set actual_start='2026-10-01T08:00:00Z',manager_note='' where assignment_id='${S}'`);
  });
  await t.test('sensitive report authorization rejects ordinary, foreign and disabled users and records admin MFA access',async()=>{
   const action=`select private.sf_authorize_sensitive_report('${C}','2026-10-01',null,'test_export')`;
   for(const u of [T,R,N,F,D,Z]){await session(u);await deny(`select public.manager_time_report_bundle('${C}','2026-10-01',null)`);}
   await session(O,'aal1');await deny(`select public.manager_time_report_bundle('${C}','2026-10-01',null)`);
   await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[O,JSON.stringify({sub:O,role:'authenticated',aal:'aal2'})]);await db.query(action);
   assert.equal(await scalar("select count(*)::int v from public.audit_events where event_type='SENSITIVE_REPORT_AUTHORIZED'"),1);
  });
  await t.test('authorized owner and administrator can retrieve a real report snapshot and generate an audit event',async()=>{
   for(const u of [O,A]){await session(u);const report=await scalar(`select public.manager_time_report_bundle('${C}','2026-10-01',null) v`);assert.deepEqual(report,{employees:[],details:[]});}
   await db.exec('reset role');assert.equal(await scalar("select count(*)::int v from public.audit_events where event_type='SENSITIVE_REPORT_AUTHORIZED'"),3);
  });
  await t.test('DATEV export guard denies non-admin and AAL1 and preserves validated owner exports',async()=>{
   const action=`select public.manager_log_datev_lodas_export('${C}','2026-10-01',1,'${'a'.repeat(64)}')`;
   for(const u of [T,F,D,Z]){await session(u);await deny(action);}
   await session(O,'aal1');await deny(action);await session(O);await db.query(action);
  });
  await t.test('QR admin routes require admin MFA, including existing-token recovery and location routes',async()=>{
   const calls=[`select public.manager_create_time_qr_terminal('${C}','Test','')`,`select public.manager_rotate_time_qr_terminal('${Q}')`,`select public.manager_get_time_qr_terminal_qr_path('${Q}')`,`select public.manager_delete_time_qr_terminal('${Q}')`];
   for(const u of [T,F,D]){await session(u);for(const sql of calls)await deny(sql);}
   await session(O,'aal1');for(const sql of calls)await deny(sql);
  });
  await t.test('ordinary employee submissions are not made subject to administrative MFA',async()=>{
   await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id(99),JSON.stringify({sub:id(99),role:'authenticated',aal:'aal1'})]);
   await db.query(`update public.time_entries set employee_note='Eigene Rückmeldung' where assignment_id='${S}'`);
  });
 }finally{await db.close();}
});
