import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const read=n=>readFileSync(new URL('../drafts/multi-company-roles/'+n,import.meta.url),'utf8');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [user,other,a,b,c,ea,eb,ec,sa,sb,sc]=Array.from({length:11},(_,i)=>id(i+1));

test('scoped swap functions work with the fail-closed legacy identity',async t=>{
 const db=new PGlite();
 const actor=async u=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[u]);await db.exec('set role authenticated')};
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function private.sf_has_time_only_login() returns boolean language sql stable as $$select false$$;
   create table public.companies(id uuid primary key,name text);
   create table public.employees(id uuid primary key,company_id uuid,auth_user_id uuid,status text,access_status text,deleted_at timestamptz,role text,first_name text,last_name text);
   create table public.company_members(company_id uuid,user_id uuid,status text,role text,extra_permissions text[]);
   create table public.shift_assignments(id uuid primary key,company_id uuid,employee_id uuid,status text,published_at timestamptz,starts_at timestamptz,ends_at timestamptz,shift_code text);
   create table public.shift_swap_requests(id uuid primary key,company_id uuid,assignment_id uuid,original_employee_id uuid,target_employee_id uuid,status text,reason text,colleague_comment text,manager_comment text,requested_at timestamptz);
   create function private.sf_swap_candidate_reason(uuid,uuid) returns text language sql as $$select null::text$$;
   create function private.sf_require_active_employee_access() returns void language plpgsql as $$begin if private.sf_employee_id() is null then raise exception 'Kein aktiver Mitarbeiterzugang';end if;end$$;
   grant usage on schema public,private,auth to authenticated;
   insert into companies values('${a}','A'),('${b}','B'),('${c}','Foreign');
   insert into employees values('${ea}','${a}','${user}','active','ACTIVE',null,'MA','QA','A'),('${eb}','${b}','${user}','active','ACTIVE',null,'MA','QA','B'),('${ec}','${c}','${other}','active','ACTIVE',null,'MA','QA','C');
   insert into shift_assignments values('${sa}','${a}','${ea}','PUBLISHED',now(),now()+interval '1 day',now()+interval '2 day','A'),('${sb}','${b}','${eb}','PUBLISHED',now(),now()+interval '1 day',now()+interval '2 day','B'),('${sc}','${c}','${ec}','PUBLISHED',now(),now()+interval '1 day',now()+interval '2 day','C');`);
  for(const f of ['company-options-candidate.sql','employee-company-identity-candidate.sql','legacy-employee-identity-fail-closed-candidate.sql','company-swap-list-candidate.sql'])await db.exec(read(f));
  await actor(user);
  await t.test('both own companies allow scoped swap lists and candidate lookup',async()=>{
   for(const [company,shift] of [[a,sa],[b,sb]]){
    assert.deepEqual((await db.query('select * from public.employee_list_shift_swaps_for_company($1)',[company])).rows,[]);
    assert.deepEqual((await db.query('select * from public.employee_list_shift_marketplace_for_company($1)',[company])).rows,[]);
    assert.deepEqual((await db.query('select * from private.employee_list_shift_swap_candidates_impl($1)',[shift])).rows,[]);
   }
  });
  await t.test('foreign and disabled profiles are denied, legacy ambiguous list fails closed',async()=>{
   await assert.rejects(db.query('select * from public.employee_list_shift_swaps_for_company($1)',[c]),/Mitarbeiterzugang/);
   await assert.rejects(db.query('select * from private.employee_list_shift_swaps_impl()'),/Unternehmen auswählen/);
   await db.exec('reset role');await db.exec(`update employees set access_status='DISABLED' where id='${eb}'`);await actor(user);
   await assert.rejects(db.query('select * from public.employee_list_shift_swaps_for_company($1)',[b]),/Mitarbeiterzugang/);
   await assert.rejects(db.query('select * from private.employee_list_shift_swap_candidates_impl($1)',[sb]),/Mitarbeiterzugang/);
   assert.deepEqual((await db.query('select * from public.employee_list_shift_swaps_for_company($1)',[a])).rows,[]);
  });
 }finally{await db.close()}
});
