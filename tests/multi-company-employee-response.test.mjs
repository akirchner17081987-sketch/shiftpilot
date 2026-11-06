import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const read=name=>readFileSync(new URL('../drafts/multi-company-roles/'+name,import.meta.url),'utf8');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [user,other,a,b,c,ea,eb,ec,swapA,swapB,swapC,changeA,changeB,changeC]=Array.from({length:14},(_,i)=>id(i+1));

test('employee responses use the company of the locked request',async t=>{
 const db=new PGlite();
 const actor=async value=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[value]);await db.exec('set role authenticated')};
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function private.sf_has_time_only_login() returns boolean language sql stable as $$select false$$;
   create table public.companies(id uuid primary key,name text);
   create table public.employees(id uuid primary key,company_id uuid,auth_user_id uuid,status text,access_status text,deleted_at timestamptz);
   create table public.company_members(company_id uuid,user_id uuid,status text,role text,extra_permissions text[]);
   create table public.shift_swap_requests(id uuid primary key,company_id uuid,original_employee_id uuid,status text,updated_at timestamptz);
   create table public.shift_change_requests(id uuid primary key,company_id uuid,employee_id uuid,requires_employee_approval boolean,status text,requires_works_council boolean,rejected_at timestamptz);
   create table public.shift_change_approvals(company_id uuid,change_request_id uuid,approval_type text,required boolean,status text,decided_by uuid,decided_at timestamptz,comment text,unique(change_request_id,approval_type));
   create table public.audit_events(company_id uuid,event_type text,entity_type text,entity_id uuid,actor_id uuid,actor_role text,old_values jsonb,new_values jsonb,metadata jsonb);
   create function public.apply_shift_change(p_id uuid) returns uuid language sql as $$select p_id$$;
   grant usage on schema public,private,auth to authenticated;
   insert into public.companies values('${a}','A'),('${b}','B'),('${c}','Foreign');
   insert into public.employees values('${ea}','${a}','${user}','active','ACTIVE',null),('${eb}','${b}','${user}','active','ACTIVE',null),('${ec}','${c}','${other}','active','ACTIVE',null);
   insert into public.shift_swap_requests values('${swapA}','${a}','${ea}','MARKET_OPEN',now()),('${swapB}','${b}','${eb}','MARKET_OPEN',now()),('${swapC}','${c}','${ec}','MARKET_OPEN',now());
   insert into public.shift_change_requests values('${changeA}','${a}','${ea}',true,'PENDING_EMPLOYEE',false,null),('${changeB}','${b}','${eb}',true,'PENDING_EMPLOYEE',false,null),('${changeC}','${c}','${ec}',true,'PENDING_EMPLOYEE',false,null);`);
  for(const file of ['company-options-candidate.sql','employee-company-identity-candidate.sql','legacy-employee-response-company-candidate.sql'])await db.exec(read(file));
  await actor(user);
  await t.test('foreign and disabled company requests are denied',async()=>{
   await assert.rejects(db.query('select private.employee_cancel_shift_swap_impl($1)',[swapC]),/Mitarbeiterzugang|berechtigt/);
   await assert.rejects(db.query("select * from public.employee_respond_to_shift_change($1,'REJECTED','')",[changeC]),/Mitarbeiterzugang|belong/);
   await db.exec('reset role');await db.exec(`update public.employees set access_status='DISABLED' where id='${eb}'`);await actor(user);
   await assert.rejects(db.query('select private.employee_cancel_shift_swap_impl($1)',[swapB]),/Mitarbeiterzugang|berechtigt/);
   await assert.rejects(db.query("select * from public.employee_respond_to_shift_change($1,'REJECTED','')",[changeB]),/Mitarbeiterzugang|belong/);
   await db.exec('reset role');await db.exec(`update public.employees set access_status='ACTIVE' where id='${eb}'`);await actor(user);
  });
  await t.test('own requests in both companies succeed with the correct audit company',async()=>{
   for(const request of [swapA,swapB])assert.equal((await db.query('select private.employee_cancel_shift_swap_impl($1) as status',[request])).rows[0].status,'CANCELLED');
   for(const request of [changeA,changeB])assert.equal((await db.query("select * from public.employee_respond_to_shift_change($1,'REJECTED','')",[request])).rows[0].status,'REJECTED');
   await db.exec('reset role');const events=(await db.query('select company_id,event_type from public.audit_events order by company_id,event_type')).rows;
   assert.equal(events.length,4);assert.deepEqual(events.map(x=>x.company_id),[a,a,b,b]);
  });
  await t.test('approval preserves automatic application and works-council wait',async()=>{
   const direct=id(15),pending=id(16);
   await db.exec(`insert into public.shift_change_requests values('${direct}','${a}','${ea}',true,'PENDING_EMPLOYEE',false,null),('${pending}','${b}','${eb}',true,'PENDING_EMPLOYEE',true,null)`);
   await actor(user);
   const applied=(await db.query("select * from public.employee_respond_to_shift_change($1,'APPROVED','')",[direct])).rows[0];
   assert.equal(applied.status,'APPLIED');assert.equal(applied.applied,true);assert.equal(applied.assignment_id,direct);
   const waiting=(await db.query("select * from public.employee_respond_to_shift_change($1,'APPROVED','')",[pending])).rows[0];
   assert.equal(waiting.status,'PENDING_WORKS_COUNCIL');assert.equal(waiting.applied,false);
  });
 }finally{await db.close()}
});
