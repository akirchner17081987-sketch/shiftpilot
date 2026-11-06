import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const read=name=>readFileSync(new URL('../drafts/multi-company-roles/'+name,import.meta.url),'utf8');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [user,other,a,b,c,ea,eb,ec,sa,sb,sc]=[1,2,3,4,5,6,7,8,9,10,11].map(id);
const manager=id(13);

test('combined identity, policy and index candidates isolate populated companies',async t=>{
 const db=new PGlite();
 const actor=async value=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[value]);await db.exec('set role authenticated')};
 const visible=async table=>(await db.query(`select id::text as id from public.${table} order by id`)).rows.map(x=>x.id);
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;
   create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   create table public.companies(id uuid primary key,name text);
   create table public.employees(id uuid primary key,company_id uuid,auth_user_id uuid,status text,access_status text,deleted_at timestamptz);
   create table public.company_members(company_id uuid,user_id uuid,status text,role text,extra_permissions text[]);
   create table public.shift_assignments(id uuid primary key,company_id uuid,employee_id uuid);
   create table public.time_entries(id uuid primary key,company_id uuid,assignment_id uuid);
   create table public.time_month_closures(company_id uuid,month_start date,status text,report_snapshot jsonb);
   create unique index employees_auth_user_id_uidx on public.employees(auth_user_id) where auth_user_id is not null;
   create function private.sf_has_time_only_login() returns boolean language sql stable as $$select false$$;
   create function private.sf_is_manager(uuid,boolean) returns boolean language sql stable as $$select false$$;
   create function private.sf_can_manage_time(p_company uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.company_members m where m.company_id=p_company and m.user_id=auth.uid() and m.status='ACTIVE' and m.role='ADMIN')$$;
   create function private.sf_paid_work_seconds(p_employee uuid,p_from date,p_to date) returns integer language sql stable as $$select case when p_employee='${ea}' then 3600 when p_employee='${eb}' then 7200 else 9000 end$$;
   create function private.sf_employee_id() returns uuid language sql stable security definer set search_path='' as $$select e.id from public.employees e where e.auth_user_id=auth.uid() and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null order by e.id limit 1$$;
   grant usage on schema public,private,auth to authenticated;
   grant select on public.employees,public.shift_assignments,public.time_entries to authenticated;
   insert into public.companies values('${a}','A'),('${b}','B'),('${c}','Foreign');
   insert into public.employees values('${ea}','${a}','${user}','active','ACTIVE',null),('${ec}','${c}','${other}','active','ACTIVE',null);
   insert into public.shift_assignments values('${sa}','${a}','${ea}'),('${sb}','${b}','${eb}'),('${sc}','${c}','${ec}');
   insert into public.time_entries values('${sa}','${a}','${sa}'),('${sb}','${b}','${sb}'),('${sc}','${c}','${sc}');
   alter table public.employees enable row level security;alter table public.shift_assignments enable row level security;alter table public.time_entries enable row level security;
   create policy legacy on public.employees for select to authenticated using(true);
   create policy legacy on public.shift_assignments for select to authenticated using(true);
   create policy legacy on public.time_entries for select to authenticated using(true);
   create policy sf_employee_active_read on public.employees as restrictive for select to authenticated using(id=private.sf_employee_id());
   create policy sf_assignment_active_read on public.shift_assignments as restrictive for select to authenticated using(employee_id=private.sf_employee_id());
   create policy sf_time_capability_read on public.time_entries as restrictive for select to authenticated using(exists(select 1 from public.shift_assignments x where x.id=time_entries.assignment_id and x.employee_id=private.sf_employee_id()));`);
  await actor(user);assert.deepEqual(await visible('employees'),[ea]);assert.deepEqual(await visible('shift_assignments'),[sa]);
  await db.exec('reset role');
  await assert.rejects(db.exec(`insert into public.employees values('${eb}','${b}','${user}','active','ACTIVE',null)`),/unique/i);
  for(const file of ['company-options-candidate.sql','legacy-employee-identity-fail-closed-candidate.sql','confirmed-work-minutes-company-candidate.sql','company-rls-restrictive-candidate.sql','employee-identity-index-candidate.sql']) await db.exec(read(file));
  await db.exec(`insert into public.employees values('${eb}','${b}','${user}','active','ACTIVE',null)`);
  await t.test('one account sees its own populated records in both companies, never foreign records',async()=>{
   await actor(user);assert.deepEqual(await visible('employees'),[ea,eb]);assert.deepEqual(await visible('shift_assignments'),[sa,sb]);assert.deepEqual(await visible('time_entries'),[sa,sb]);
   assert.equal((await db.query('select private.sf_employee_id() as id')).rows[0].id,null);
  });
  await t.test('confirmed-work calculation uses the matching company profile and denies foreign employees',async()=>{
   assert.equal((await db.query("select private.sf_confirmed_work_minutes($1,'2026-11-01','2026-11-30') as minutes",[ea])).rows[0].minutes,60);
   assert.equal((await db.query("select private.sf_confirmed_work_minutes($1,'2026-11-01','2026-11-30') as minutes",[eb])).rows[0].minutes,120);
   await assert.rejects(db.query("select private.sf_confirmed_work_minutes($1,'2026-11-01','2026-11-30')",[ec]),/Nicht berechtigt/);
  });
  await t.test('index rejects two profiles for the same user within the same company',async()=>{
   await db.exec('reset role');await assert.rejects(db.exec(`insert into public.employees values('${id(12)}','${a}','${user}','active','ACTIVE',null)`),/unique/i);
  });
  await t.test('authorized time manager keeps access only in their own company',async()=>{
   await db.exec('reset role');await db.exec(`insert into public.company_members values('${a}','${manager}','ACTIVE','ADMIN','{}')`);await actor(manager);
   assert.equal((await db.query("select private.sf_confirmed_work_minutes($1,'2026-11-01','2026-11-30') as minutes",[ea])).rows[0].minutes,60);
   await assert.rejects(db.query("select private.sf_confirmed_work_minutes($1,'2026-11-01','2026-11-30')",[eb]),/Nicht berechtigt/);
   await db.exec('reset role');
  });
  await t.test('disabled company profile loses only its own records',async()=>{
   await db.exec(`update public.employees set access_status='DISABLED' where id='${eb}'`);await actor(user);
   assert.deepEqual(await visible('employees'),[ea]);assert.deepEqual(await visible('shift_assignments'),[sa]);assert.deepEqual(await visible('time_entries'),[sa]);
   assert.equal((await db.query('select private.sf_employee_id() as id')).rows[0].id,ea);
   await assert.rejects(db.query("select private.sf_confirmed_work_minutes($1,'2026-11-01','2026-11-30')",[eb]),/Nicht berechtigt/);
  });
  await t.test('read-only company membership excludes the linked employee profile',async()=>{
   await db.exec('reset role');await db.exec(`update public.employees set access_status='ACTIVE' where id='${eb}';insert into public.company_members values('${b}','${user}','ACTIVE','VIEWER','{read_only}')`);
   await actor(user);assert.deepEqual(await visible('employees'),[ea]);assert.deepEqual(await visible('shift_assignments'),[sa]);
  });
 }finally{await db.close()}
});
