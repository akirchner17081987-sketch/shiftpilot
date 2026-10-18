import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [C,O,U,V,E,F,A,X]=[1,2,3,4,5,6,7,8].map(id);
test('swap candidates remain available under personnel privacy and enforce availability',async t=>{
 const db=new PGlite();
 const q=async(s,args=[])=>(await db.query(s,args)).rows[0]?.v;
 const session=async user=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);};
 const reason=()=>q('select private.sf_swap_candidate_reason($1,$2) v',[A,F]);
 try{
 await db.exec(`create role anon;create role authenticated;create schema private;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.companies(id uuid primary key,timezone text);
 create table public.company_members(company_id uuid,user_id uuid,role text,status text);
 create function private.sf_is_manager(c uuid,v boolean) returns boolean language sql as $$select exists(select 1 from public.company_members where company_id=c and user_id=auth.uid() and status='ACTIVE' and role in ('OWNER','ADMIN','PLANNER','DISPATCHER'))$$;
 create table public.employees(id uuid primary key,company_id uuid,auth_user_id uuid,status text,access_status text,deleted_at timestamptz,shift_permissions text[],first_name text,last_name text,role text);
 create table public.company_compliance_policy(company_id uuid,standard_min_rest_hours numeric,standard_max_shift_hours numeric);
 create table public.shift_assignments(id uuid primary key,company_id uuid,employee_id uuid,status text,published_at timestamptz,starts_at timestamptz,ends_at timestamptz,shift_code text);
 create table public.absences(id uuid primary key default gen_random_uuid(),company_id uuid,employee_id uuid,start_date date,end_date date,status text,full_day boolean default true,start_time time,end_time time);
 grant usage on schema public,private,auth to authenticated;grant execute on function auth.uid() to authenticated;
 insert into public.companies values('${C}','Europe/Berlin');
 insert into public.company_members values('${C}','${O}','OWNER','ACTIVE');
 insert into public.employees values('${E}','${C}','${U}','active','ACTIVE',null,ARRAY['FD'],'Test','A','Mitarbeiter'),('${F}','${C}','${V}','active','ACTIVE',null,ARRAY['FD'],'Test','B','Mitarbeiter');
 insert into public.shift_assignments values('${A}','${C}','${E}','PUBLISHED',now(),'2027-02-01 06:00+01','2027-02-01 14:00+01','FD');`);
 const privacy=read('supabase/migrations/20261011214719_personnel_mfa_health_privacy.sql');
 const begin=privacy.indexOf('create or replace function private.sf_approved_absence_overlaps');
 await db.exec(privacy.slice(begin,privacy.indexOf('CREATE OR REPLACE FUNCTION public.manager_time_report_bundle_live',begin)));
 // Load the real original candidate and public candidate-list RPC, not a mock.
 const original=read('supabase/migrations/20260829224448_schichtfunk_shift_swap_workflow_v1.sql');
 await db.exec(original.slice(original.indexOf('create or replace function private.sf_swap_candidate_reason'),original.indexOf('create or replace function private.employee_create_shift_swap_impl')));
 await session(U);assert.equal(await reason(),'Nicht berechtigt','Reproduces the production regression');
 await db.exec(read('supabase/migrations/20261018075716_shift_swap_candidate_availability.sql'));
 await t.test('requester gets eligible colleague; private helper cannot be called directly',async()=>{
  await session(U);assert.equal(await reason(),null);
  await db.exec('grant execute on function public.employee_list_shift_swap_candidates(uuid),private.employee_list_shift_swap_candidates_impl(uuid) to authenticated;set role authenticated');
  assert.equal((await db.query('select * from public.employee_list_shift_swap_candidates($1)',[A])).rows[0].employee_id,F);
  await assert.rejects(reason(),/permission denied/);await session(U);
  await assert.rejects(db.query('select private.sf_approved_absence_overlaps($1,$2,$3,$4,$5)',[C,F,'2027-02-01T05:00Z','2027-02-01T13:00Z','Europe/Berlin']),/Nicht berechtigt/);
 });
 await t.test('unrelated user, anonymous, disabled and foreign-company candidate are blocked',async()=>{
  await session(X);assert.equal(await reason(),'Nicht berechtigt');await session('');assert.equal(await reason(),'Nicht angemeldet');await session(U);
  await db.exec(`update public.employees set access_status='DISABLED' where id='${F}'`);assert.equal(await reason(),'Mitarbeiter ist nicht aktiv');
  await db.exec(`update public.employees set access_status='ACTIVE',company_id='${X}' where id='${F}'`);assert.equal(await reason(),'Mitarbeiter ist nicht aktiv');await db.exec(`update public.employees set company_id='${C}' where id='${F}'`);
 });
 await t.test('overlap, rest before and after, permissions and policy duration are enforced',async()=>{
  await db.exec(`insert into public.shift_assignments select '${X}',company_id,'${F}',status,published_at,starts_at,ends_at,shift_code from public.shift_assignments where id='${A}'`);assert.match(await reason(),/andere Schicht/);
  await db.exec(`update public.shift_assignments set starts_at='2027-01-31 22:00+01',ends_at='2027-02-01 06:00+01' where id='${X}'`);assert.match(await reason(),/Ruhezeit vor/);
  await db.exec(`update public.shift_assignments set starts_at='2027-02-01 14:00+01',ends_at='2027-02-01 22:00+01' where id='${X}'`);assert.match(await reason(),/Ruhezeit nach/);
  await db.exec(`delete from public.shift_assignments where id='${X}';update public.employees set shift_permissions=ARRAY[]::text[] where id='${F}'`);assert.match(await reason(),/Freigabe/);
  await db.exec(`update public.employees set shift_permissions=ARRAY['FD'] where id='${F}';insert into public.company_compliance_policy values('${C}',11,7)`);assert.match(await reason(),/Höchstdauer/);await db.exec('delete from public.company_compliance_policy');
 });
 await t.test('approved and recorded full/partial overnight absences block without exposing categories; pending and adjacent do not',async()=>{
  await db.exec(`insert into public.absences(company_id,employee_id,start_date,end_date,status) values('${C}','${F}','2027-02-01','2027-02-01','Beantragt')`);assert.equal(await reason(),null);
  await db.exec("update public.absences set status='Genehmigt'");assert.equal(await reason(),'Kollege ist in diesem Zeitraum nicht verfügbar');
  await db.exec("update public.absences set status='Erfasst',full_day=false,start_time='22:00',end_time='07:00',start_date='2027-01-31',end_date='2027-01-31'");assert.match(await reason(),/nicht verfügbar/);
  await db.exec("update public.absences set end_time='06:00'");assert.equal(await reason(),null);
 });
 }finally{await db.close()}
});
