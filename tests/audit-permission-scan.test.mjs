import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=fs.readFileSync(new URL('../database/audit-permission-scan-v1.sql',import.meta.url),'utf8');
assert.equal(sql,fs.readFileSync(new URL('../supabase/migrations/20261018104144_audit_permission_scan_v1.sql',import.meta.url),'utf8'));
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [C,D,O,A,T,V,Z,F]=[1,2,3,4,5,6,7,8].map(id);
test('audit MFA scope is evaluated per company without weakening row access',async t=>{
 const db=new PGlite();
 const actor=async(user,aal='aal2')=>{await db.exec('reset role');await db.query("select set_config('qa.user',$1,false),set_config('qa.aal',$2,false)",[user,aal]);await db.exec('set role authenticated')};
 const count=async(c)=>(await db.query('select count(*)::int n from audit_events where company_id=$1',[c])).rows[0].n;
 try{
  await db.exec(`create role anon;create role authenticated;create schema private;create schema auth;
   create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('qa.user',true),'')::uuid$$;
   create table company_members(company_id uuid,user_id uuid,status text,role text);
   create table audit_events(id uuid default gen_random_uuid(),company_id uuid,created_at timestamptz default now());
   create sequence private.qa_gate_calls;
   create function private.sf_can_read_personnel(c uuid)returns boolean language plpgsql stable security definer set search_path='' as $$begin perform nextval('private.qa_gate_calls');return auth.uid() is not null and current_setting('qa.aal',true)='aal2' and exists(select 1 from public.company_members where company_id=c and user_id=auth.uid() and status='ACTIVE' and role in('OWNER','ADMIN'));end$$;
   grant usage on schema public,private,auth to authenticated;grant select on company_members,audit_events to authenticated;
   alter table audit_events enable row level security;alter table company_members enable row level security;
   create policy own_membership on company_members for select to authenticated using(user_id=(select auth.uid()));
   create policy admin_read on audit_events for select to authenticated using(company_id in(select company_id from company_members where user_id=(select auth.uid()) and status='ACTIVE' and role in('OWNER','ADMIN')));
   create policy audit_personnel_mfa on audit_events as restrictive for select to authenticated using(private.sf_can_read_personnel(company_id));
   insert into company_members values('${C}','${O}','ACTIVE','OWNER'),('${C}','${A}','ACTIVE','ADMIN'),('${C}','${T}','ACTIVE','PLANNER'),('${C}','${V}','ACTIVE','VIEWER'),('${C}','${Z}','DISABLED','ADMIN'),('${D}','${F}','ACTIVE','OWNER');
   insert into audit_events(company_id)select '${C}' from generate_series(1,12000);insert into audit_events(company_id)select '${D}' from generate_series(1,3000);`);
  await actor(O);assert.equal(await count(C),12000);await db.exec('reset role');const oldCalls=Number((await db.query('select last_value from private.qa_gate_calls')).rows[0].last_value);assert.ok(oldCalls>=12000);
  await db.exec(sql);await db.exec("select setval('private.qa_gate_calls',1,false)");
  await actor(O);assert.equal(await count(C),12000);assert.equal(await count(D),0);await db.exec('reset role');const calls=Number((await db.query('select last_value from private.qa_gate_calls')).rows[0].last_value);assert.ok(calls<=4,`MFA gate repeated ${calls} times`);
  await t.test('owner and admin retain AAL2 access; AAL1 cannot read personal audit snapshots',async()=>{
   for(const user of [O,A]){await actor(user);assert.equal(await count(C),12000);await actor(user,'aal1');assert.equal(await count(C),0)}
  });
  await t.test('team leader, viewer, disabled member, foreign owner and anonymous cannot read another company',async()=>{
   for(const user of [T,V,Z,F,'']){await actor(user);assert.equal(await count(C),0)}await db.exec('reset role');await db.exec('set role anon');await assert.rejects(db.query('select * from audit_events'),/permission denied/);
  });
 }finally{await db.close()}
});
