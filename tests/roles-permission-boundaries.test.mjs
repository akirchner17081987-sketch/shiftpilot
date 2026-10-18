import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration=fs.readFileSync(new URL('../supabase/migrations/20261018094117_roles_permission_boundaries.sql',import.meta.url),'utf8');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [C,D,O,L,T,U,F,E,A]=[1,2,3,4,5,6,7,8,9].map(id);
test('role boundaries survive permissive legacy policies and stored snapshots',async t=>{
 const db=new PGlite();
 const actor=async(user,aal='aal2')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[user||'',JSON.stringify({sub:user,aal})]);await db.exec('set role authenticated');};
 const rows=async(table)=>(await db.query('select count(*)::int n from public.'+table)).rows[0].n;
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table employees(id uuid primary key,company_id uuid,auth_user_id uuid,status text,access_status text,deleted_at timestamptz);
 create table company_members(company_id uuid,user_id uuid,role text,status text,access_role text,extra_permissions text[]);
 create table shift_assignments(id uuid,company_id uuid,employee_id uuid);create table time_entries(assignment_id uuid,company_id uuid);create table time_account_openings(company_id uuid);
 create function private.sf_is_manager(c uuid,admin_only boolean) returns boolean language sql security definer set search_path='' as $$select exists(select 1 from public.company_members where company_id=c and user_id=auth.uid() and status='ACTIVE' and role in ('OWNER','ADMIN','PLANNER'))$$;
 create function private.sf_can_manage_time(c uuid) returns boolean language sql security definer set search_path='' as $$select exists(select 1 from public.company_members where company_id=c and user_id=auth.uid() and status='ACTIVE' and (access_role in ('OWNER','ADMIN') or extra_permissions && array['manage_time','confirm_time']))$$;
 create function private.sf_assert_aal2(action text) returns void language plpgsql as $$begin if current_setting('request.jwt.claims')::jsonb->>'aal'<>'aal2' then raise exception 'MFA_REQUIRED';end if;end$$;
 grant usage on schema public,private,auth to authenticated;
 insert into company_members values('${C}','${O}','OWNER','ACTIVE','OWNER','{}'),('${C}','${L}','PLANNER','ACTIVE','TEAM_LEAD','{}'),('${C}','${T}','PLANNER','ACTIVE','TEAM_LEAD','{confirm_time}'),('${D}','${F}','OWNER','ACTIVE','OWNER','{}');
 insert into employees values('${E}','${C}','${U}','active','ACTIVE',null),('${A}','${C}',null,'active','NONE',null);
 insert into shift_assignments values('${A}','${C}','${E}');insert into time_entries values('${A}','${C}');insert into time_account_openings values('${C}');`);
 for(const table of ['employees','shift_assignments','time_entries','time_account_openings'])await db.exec(`alter table ${table} enable row level security;create policy legacy_select on ${table} for select to authenticated using(true);grant select on ${table} to authenticated`);
 const privateNames=['employee_cancel_shift_swap_impl','employee_claim_shift_marketplace_impl','employee_create_shift_swap_impl','employee_list_disruption_offers_impl','employee_list_shift_marketplace_impl','employee_list_shift_swap_candidates_impl','employee_list_shift_swaps_impl','employee_offer_shift_marketplace_impl','employee_respond_disruption_offer_impl','employee_respond_shift_swap_impl','manager_monthly_time_accounts_impl','manager_set_time_account_opening_impl','manager_set_time_account_target_method_impl','manager_update_time_account_settings_impl','manager_update_time_account_settings_v2_impl'];
 const publicNames=['employee_respond_to_shift_change','manager_monthly_time_accounts','manager_time_month_status','manager_set_time_account_opening','manager_update_time_account_settings','manager_update_time_account_settings_v2'];
 for(const [schema,names] of [['private',privateNames],['public',publicNames]])for(const name of names)await db.exec(`create function ${schema}.${name}(p_company_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$\nbegin\n return '{"legacy_snapshot":true}'::jsonb;\nend $$;grant execute on function ${schema}.${name}(uuid) to authenticated;`);
 await db.exec('revoke all on function private.sf_can_manage_time(uuid) from public,anon,authenticated');
 await db.exec(migration);
 await actor(O);await assert.rejects(rows('time_entries'),/permission denied/);await db.exec('reset role');
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261018094151_roles_time_policy_helper_execute.sql',import.meta.url),'utf8'));

 await t.test('team leader without time rights cannot read raw times, openings or snapshots',async()=>{
  await actor(L);assert.equal(await rows('employees'),2);assert.equal(await rows('time_entries'),0);assert.equal(await rows('time_account_openings'),0);
  await assert.rejects(db.query('select public.manager_monthly_time_accounts($1)',[C]),/Zeitberechtigung/);
  await assert.rejects(db.query('select public.manager_time_month_status($1)',[C]),/Zeitberechtigung/);
 });
 await t.test('time reviewer and owner retain permitted reads; foreign owner does not',async()=>{
  for(const u of [T,O]){await actor(u);assert.equal(await rows('time_entries'),1);assert.equal(await rows('time_account_openings'),1);assert.ok((await db.query('select public.manager_monthly_time_accounts($1) v',[C])).rows[0].v.legacy_snapshot)}
  await actor(F);assert.equal(await rows('employees'),0);assert.equal(await rows('time_entries'),0);await assert.rejects(db.query('select public.manager_monthly_time_accounts($1)',[C]),/Zeitberechtigung/);
 });
 await t.test('active employee reads own data; disabled, deleted and disabled-membership identities fail',async()=>{
  await actor(U);assert.equal(await rows('employees'),1);assert.equal(await rows('time_entries'),1);assert.ok((await db.query('select private.employee_list_shift_marketplace_impl() v')).rows[0].v.legacy_snapshot);
  for(const change of ["access_status='DISABLED'","access_status='ACTIVE',deleted_at=now()"]){await db.exec('reset role');await db.exec(`update employees set ${change} where id='${E}'`);await actor(U);assert.equal(await rows('employees'),0);assert.equal(await rows('time_entries'),0);assert.equal(await rows('shift_assignments'),0);await assert.rejects(db.query('select private.employee_list_shift_marketplace_impl()'),/aktiver Mitarbeiterzugang/)}
  await db.exec('reset role');await db.exec(`update employees set deleted_at=null where id='${E}';insert into company_members values('${C}','${U}','PLANNER','DISABLED','TEAM_LEAD','{}')`);await actor(U);assert.equal(await rows('employees'),0);await assert.rejects(db.query('select public.employee_respond_to_shift_change()'),/aktiver Mitarbeiterzugang/);
 });
 await t.test('all seven financial setters require MFA and every selected function has its guard',async()=>{
  await actor(O,'aal1');await assert.rejects(db.query('select public.manager_set_time_account_opening()'),/MFA_REQUIRED/);await assert.rejects(db.query('select private.manager_set_time_account_target_method_impl()'),/MFA_REQUIRED/);
  await actor(O);assert.ok((await db.query('select public.manager_set_time_account_opening() v')).rows[0].v.legacy_snapshot);
  const funcs=(await db.query("select p.proname,p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname=any($1)",[[...privateNames,...publicNames]])).rows;
  assert.equal(funcs.length,21);for(const f of funcs)assert.match(f.prosrc,/sf_require_active_employee_access|Zeitberechtigung fehlt|sf_assert_aal2/);
 });
 }finally{await db.close()}
});
