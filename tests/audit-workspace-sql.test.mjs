import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=fs.readFileSync(new URL('../database/audit-workspace-indexed-enrichment-v1.sql',import.meta.url),'utf8');
assert.equal(sql,fs.readFileSync(new URL('../supabase/migrations/20261018104618_audit_workspace_indexed_enrichment_v1.sql',import.meta.url),'utf8'));
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [C,D,U,E,S,F]=[1,2,3,4,5,6].map(id);
test('audit workspace pages retain complete totals, enrichment and search boundaries',async t=>{
 const db=new PGlite();
 const request=async(options={})=>(await db.query('select public.manager_audit_workspace(p_company_id=>$1,p_from=>$2,p_to=>$3,p_query=>$4,p_before_at=>$5,p_before_id=>$6,p_as_of=>$7,p_limit=>$8) data',[options.company||C,options.from||null,options.to||null,options.query||null,options.before?.created_at||null,options.before?.id||null,options.asOf||null,options.limit||50])).rows[0].data;
 try{
  await db.exec(`create schema private;create schema auth;create role anon;create role authenticated;
   create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('qa.user',true),'')::uuid$$;
   create table company_members(company_id uuid,user_id uuid,status text,role text);insert into company_members values('${C}','${U}','ACTIVE','OWNER');
   create function private.can_manage_company_users(c uuid)returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.company_members where company_id=c and user_id=auth.uid() and role='OWNER' and status='ACTIVE')$$;
   create function private.sf_audit_category(text,text)returns text language sql immutable as $$select 'planning'::text$$;
   create table audit_events(id uuid primary key,company_id uuid,created_at timestamptz,event_type text,entity_type text,entity_id uuid,actor_id uuid,actor_role text,old_values jsonb,new_values jsonb,metadata jsonb);
   create index audit_cursor on audit_events(company_id,created_at desc,id desc);
   create table employees(id uuid primary key,company_id uuid,first_name text,last_name text,personnel_no text);
   create table shift_assignments(id uuid primary key,company_id uuid,employee_id uuid,starts_at timestamptz);
   insert into employees values('${E}','${C}','Anna','Fiktiv','QA-100'),('${F}','${D}','Private','Foreign','HIDDEN');
   insert into shift_assignments values('${S}','${C}','${E}','2026-10-10 04:00Z'),('${F}','${D}','${F}','2026-10-10 04:00Z');
   insert into audit_events select md5(n::text)::uuid,'${C}','2026-10-10 09:00Z','UPDATE_shift_assignments','shift_assignments','${S}',null,'SYSTEM','{}',jsonb_build_object('employee_id','${E}'),jsonb_build_object('order',n,'note',case when n=1 then 'needle older than first page' else 'normal' end) from generate_series(1,1205)n;
   insert into audit_events values('${F}','${C}','2026-10-10 10:00Z','UPDATE_time_entries','time_entry',null,null,'SYSTEM','{}','{"assignment_id":"${F}"}','{}');
   insert into audit_events values('${E}','${C}','2026-10-10 10:01Z','UPDATE_time_entries','time_entry',null,null,'SYSTEM','{}','{"employee_id":"not-a-uuid","assignment_id":"not-a-uuid"}','{}');
   insert into audit_events values('${U}','${D}','2026-10-10 11:00Z','UPDATE_employees','employee','${F}',null,'SYSTEM','{}','{}','{}');
   grant usage on schema private,auth to authenticated;grant select on audit_events,employees,shift_assignments to authenticated;
   alter table audit_events enable row level security;alter table employees enable row level security;alter table shift_assignments enable row level security;
   create policy own_company on audit_events for select to authenticated using(company_id='${C}');create policy own_company on employees for select to authenticated using(company_id='${C}');create policy own_company on shift_assignments for select to authenticated using(company_id='${C}');`);
  await db.exec(sql);await db.query("select set_config('qa.user',$1,false)",[U]);await db.exec('set role authenticated');
  await t.test('month includes complete count and safe enrichment, including malformed and foreign IDs',async()=>{
   const r=await request({from:'2026-09-30T22:00:00Z',to:'2026-10-31T23:00:00Z'});assert.equal(r.total,1207);assert.equal(r.rows.length,50);assert.equal(r.rows[0].subject_name,null);assert.equal(r.rows[1].subject_name,null);assert.equal(r.rows[1].target_assignment_id,null);assert.equal(r.rows[2].subject_name,'Fiktiv, Anna');assert.equal(r.rows[2].target_assignment_id,S);assert.ok(r.actions.length>=2);
  });
  await t.test('1000-row export pages are complete without duplicated tied timestamps',async()=>{
   const first=await request({limit:1000});const second=await request({limit:1000,before:first.rows.at(-1),asOf:first.as_of});assert.equal(second.total,null);assert.equal(second.rows.length,207);assert.equal(new Set([...first.rows,...second.rows].map(x=>x.id)).size,1207);
  });
  await t.test('search still covers old records and current employee names; exact IDs are scoped',async()=>{
   let r=await request({query:'needle older'});assert.equal(r.total,1);assert.equal(r.rows[0].metadata.order,1);r=await request({query:'Fiktiv QA-100'});assert.equal(r.total,1205);r=await request({query:id(3)});assert.equal(r.total,0);await assert.rejects(request({company:D}),/nur für Inhaber/);
  });
 }finally{await db.close()}
});
