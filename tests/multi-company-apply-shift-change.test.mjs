import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const read=name=>readFileSync(new URL('../drafts/multi-company-roles/'+name,import.meta.url),'utf8');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [u,v,a,b,c,ea,eb,ec,ca,cb,cc,manager]=Array.from({length:12},(_,i)=>id(i+1));

test('direct shift-change application checks the active identity of the request company',async t=>{
 const db=new PGlite();
 const actor=async user=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated')};
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function private.sf_has_time_only_login() returns boolean language sql stable as $$select false$$;
   create table public.companies(id uuid primary key,name text);
   create table public.employees(id uuid primary key,company_id uuid,auth_user_id uuid,status text,access_status text,deleted_at timestamptz);
   create table public.company_members(company_id uuid,user_id uuid,status text,role text,extra_permissions text[]);
   create table public.shift_assignments(id uuid primary key);
   create table public.shift_change_requests(id uuid primary key,company_id uuid,employee_id uuid,status text,compliance_status text,requires_employee_approval boolean,requires_works_council boolean);
   grant usage on schema public,private,auth to authenticated;
   grant select, update on public.shift_change_requests to authenticated;
   grant select on public.company_members to authenticated;
   insert into public.companies values('${a}','A'),('${b}','B'),('${c}','Foreign');
   insert into public.employees values('${ea}','${a}','${u}','active','ACTIVE',null),('${eb}','${b}','${u}','active','ACTIVE',null),('${ec}','${c}','${v}','active','ACTIVE',null);
   insert into public.company_members values('${a}','${manager}','ACTIVE','ADMIN','{}');
   insert into public.shift_change_requests values('${ca}','${a}','${ea}','PENDING_EMPLOYEE','GREEN',true,false),('${cb}','${b}','${eb}','PENDING_EMPLOYEE','GREEN',true,false),('${cc}','${c}','${ec}','PENDING_EMPLOYEE','GREEN',true,false);`);
  await db.exec(read('company-options-candidate.sql'));await db.exec(read('apply-shift-change-company-candidate.sql'));
  const apply=request=>db.query('select public.apply_shift_change($1)',[request]);
  await actor(u);
  await t.test('own profiles in both companies pass identity and reach business validation',async()=>{
   for(const request of [ca,cb])await assert.rejects(apply(request),/not READY_TO_APPLY/);
  });
  await t.test('foreign or disabled profile is denied before business validation',async()=>{
   await assert.rejects(apply(cc),/Not authorized/);
   await db.exec('reset role');await db.exec(`update public.employees set access_status='DISABLED' where id='${eb}'`);await actor(u);
   await assert.rejects(apply(cb),/Not authorized/);await assert.rejects(apply(ca),/not READY_TO_APPLY/);
  });
  await t.test('company administrator retains its existing management path',async()=>{
   await actor(manager);await assert.rejects(apply(ca),/not READY_TO_APPLY/);await assert.rejects(apply(cb),/Not authorized/);
  });
 }finally{await db.close()}
});
