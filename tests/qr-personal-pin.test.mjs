import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=fs.readdirSync(new URL('../supabase/migrations/',import.meta.url)).find(f=>f.endsWith('_qr_personal_pin_rollout.sql'));
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const C=id(1),D=id(2),E=id(10),E2=id(11),F=id(12),O=id(20),A=id(21),T=id(22),X=id(23),Z=id(24);
const terminal='a'.repeat(64),otherTerminal='b'.repeat(64),foreignTerminal='c'.repeat(64);
let serial=100;
const token=()=> (++serial).toString(16).padStart(64,'0');
test('personal QR PIN rollout is enforced by PostgreSQL with real pgcrypto',async t=>{
 const db=new PGlite({extensions:{pgcrypto}});
 const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0].v;
 const login=(pin='739281',setup=null,qr=terminal,person='FIKTIV',session=token())=>scalar('select public.qr_independent_pin_login($1,$2,$3,$4,$5) v',[qr,person,pin,session,setup]);
 const legacy=(session=token())=>scalar('select public.qr_independent_login($1,$2,$3,$4) v',[terminal,'FIKTIV','2020-01-15',session]);
 const admin=(action='STATUS',employee=null,company=C)=>scalar('select public.manager_qr_pin_admin($1,$2,$3) v',[company,action,employee]);
 const setUser=async(u=O,aal='aal2')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[u||'',JSON.stringify({sub:u,aal})]);await db.exec('set role authenticated');};
 const root=()=>db.exec('reset role');
 try{
  await db.exec(read('tests/sql/qr-live-bootstrap.sql'));
  await db.exec(`create schema private; create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
   grant usage on schema private,auth to authenticated;
   create table public.company_members(company_id uuid,user_id uuid,role text,status text,access_role text,extra_permissions text[] default '{}');
   create table public.audit_events(company_id uuid,event_type text,entity_type text,entity_id uuid,actor_id uuid,actor_role text,metadata jsonb);
   create table private.sf_mfa_protected_rpcs(function_name text primary key,rollout_stage smallint,control_area text,enabled boolean);
   alter table public.employees add column deleted_at timestamptz,add column birth_date date;
   create table public.time_qr_independent_sessions(token_hash bytea primary key,company_id uuid,employee_id uuid,terminal_id uuid,expires_at timestamptz);
   create table public.time_qr_independent_login_limits(key_hash bytea primary key,failed_count integer,reset_at timestamptz);
   create table public.time_qr_independent_shifts(id uuid primary key default gen_random_uuid(),company_id uuid,employee_id uuid,terminal_id uuid,started_at timestamptz,ended_at timestamptz);
   create table public.time_qr_independent_breaks(id uuid primary key default gen_random_uuid(),shift_id uuid,ordinal integer,started_at timestamptz,ended_at timestamptz);
   create table public.time_qr_independent_events(id uuid primary key default gen_random_uuid(),shift_id uuid,action text,punched_at timestamptz,request_id text);
   insert into public.companies(id) values('${C}'),('${D}');
   insert into public.employees(id,company_id,first_name,last_name,personnel_no,start_date) values
    ('${E}','${C}','Fiktiv','One','FIKTIV','2020-01-15'),('${E2}','${C}','Fiktiv','Two','TWO','2020-01-15'),('${F}','${D}','Fiktiv','Foreign','FIKTIV','2020-01-15');
   insert into public.company_members(company_id,user_id,role,status,access_role,extra_permissions) values
    ('${C}','${O}','OWNER','ACTIVE','OWNER','{}'),('${C}','${A}','ADMIN','ACTIVE','ADMIN','{}'),('${C}','${T}','PLANNER','ACTIVE','TEAM_LEAD','{manage_time}'),
    ('${D}','${X}','OWNER','ACTIVE','OWNER','{}'),('${C}','${Z}','ADMIN','DISABLED','ADMIN','{}');
   insert into public.time_qr_terminals(company_id,name,token_hash) values('${C}','Synthetic A',extensions.digest('${terminal}','sha256')),('${C}','Synthetic B',extensions.digest('${otherTerminal}','sha256')),('${D}','Foreign',extensions.digest('${foreignTerminal}','sha256'));
  `);
  const matrix=read('supabase/migrations/20261016133501_access_mfa_action_matrix.sql');
  await db.exec(`create function private.sf_assert_aal2(p_action text) returns void language plpgsql as $$begin if coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then raise exception 'MFA_REQUIRED'; end if;end$$;`);
  await db.exec(matrix.slice(matrix.indexOf('create or replace function private.sf_assert_company_admin_mfa'),matrix.indexOf('create or replace function private.can_manage_company_users')));
  await db.exec(read('supabase/migrations/'+migration));
  // Preserve the old entrypoint's actual production grants (CREATE OR REPLACE retains them).
  await db.exec('revoke all on function public.qr_independent_login(text,text,date,text),public.qr_independent_action(text,text,text,text) from public,anon,authenticated;grant execute on function public.qr_independent_login(text,text,date,text),public.qr_independent_action(text,text,text,text) to service_role;');
  await t.test('only same-company active OWNER/ADMIN with AAL2 can administer PINs',async()=>{
   for(const u of [T,X,Z,null]){await setUser(u);await assert.rejects(admin(),/berechtigt|permission/i);}
   await setUser(O,'aal1');await assert.rejects(admin(),/MFA_REQUIRED/);
   for(const u of [O,A]){await setUser(u);assert.equal((await admin()).employees.length,2);}
   await assert.rejects(admin('ISSUE_CODE',F),/Aktiver/);
   await assert.rejects(admin('ENABLE_REQUIRED'),/alle aktiven/);
  });
  let code,firstSession;
  await t.test('setup code is returned once, stored only as hash and does not require sharing a PIN',async()=>{
   await setUser(O);const issued=await admin('ISSUE_CODE',E);code=issued.setup_code;assert.match(code,/^\d{12}$/);
   const status=await admin();assert.equal(status.employees.find(e=>e.employee_id===E).setup_pending,true);
   assert.ok(!JSON.stringify(status).includes(code));
   await root();const secret=(await db.query('select * from private.qr_pin_credentials')).rows[0];
   assert.equal(secret.pin_hash,null);assert.notEqual(String(secret.setup_hash),code);
   assert.equal((await legacy()).ok,true);
  });
  await t.test('wrong setup code and weak new PIN cannot configure or create a session',async()=>{
   assert.equal((await login('739281','0'.repeat(12))).ok,false);
   assert.equal((await login('111111',code)).ok,false);
   assert.equal((await login('123456',code)).ok,false);
   assert.equal((await login('15012020',code)).ok,false);
   assert.equal((await login('150120',code)).ok,false);
   await db.exec("update public.time_qr_independent_login_limits set reset_at=now()-interval '1 second'");
  });
  await t.test('one-time setup creates salted bcrypt PIN, revokes legacy sessions and blocks date fallback',async()=>{
   firstSession=token();assert.equal((await login('739281',code,terminal,'FIKTIV',firstSession)).ok,true);
   const secret=(await db.query('select * from private.qr_pin_credentials')).rows[0];
   assert.match(secret.pin_hash,/^\$2a\$12\$/);assert.notEqual(secret.pin_hash,'739281');assert.equal(secret.setup_hash,null);assert.equal(secret.legacy_disabled,true);
   assert.equal((await legacy()).ok,false);
   assert.equal(await scalar("select count(*)::int v from public.time_qr_independent_sessions where employee_id=$1 and auth_method='LEGACY'",[E]),0);
   assert.equal((await login('739281',code)).ok,false);
   const audit=await scalar('select jsonb_agg(metadata) v from public.audit_events');assert.ok(!JSON.stringify(audit).includes(code));assert.ok(!JSON.stringify(audit).includes('739281'));
  });
  await t.test('correct PIN works; unknown person and wrong-company setup have generic failure',async()=>{
   assert.equal((await login()).ok,true);
   assert.equal((await login('739281',null,foreignTerminal)).ok,false);
   assert.equal((await login('739281',null,terminal,'MISSING')).ok,false);
   assert.equal((await login('739281',code,terminal,'MISSING')).ok,false);
  });
  await t.test('five failed guesses persist across requests and terminals; cooldown then permits correct PIN',async()=>{
   // Clear the legitimate success before testing a fresh window.
   await login();
   for(let i=0;i<5;i++)assert.equal((await login('382719',null,i%2?otherTerminal:terminal)).ok,false);
   const blocked=await login();assert.equal(blocked.rate_limited,true);assert.ok(blocked.retry_after_seconds>0);
   await db.exec("update public.time_qr_independent_login_limits set reset_at=now()-interval '1 second'");
   assert.equal((await login()).ok,true);
  });
  await t.test('reset revokes current sessions and old PIN without reopening the joining-date route',async()=>{
   await setUser(O);code=(await admin('ISSUE_CODE',E)).setup_code;await root();
   await assert.rejects(scalar('select public.qr_independent_action($1,$2,$3,$4) v',[terminal,firstSession,'STATUS',null]),/abgelaufen/);
   assert.equal((await login()).ok,false);assert.equal((await legacy()).ok,false);
   assert.equal((await login('982741',code)).ok,true);
  });
  await t.test('expired codes are rejected and newly issued codes invalidate earlier codes',async()=>{
   await setUser(O);const a=(await admin('ISSUE_CODE',E2)).setup_code;const b=(await admin('ISSUE_CODE',E2)).setup_code;await root();
   assert.equal((await login('982741',a,terminal,'TWO')).ok,false);
   await db.exec("update private.qr_pin_credentials set setup_expires_at=now()-interval '1 second' where employee_id='"+E2+"'");
   assert.equal((await login('982741',b,terminal,'TWO')).ok,false);
   await setUser(O);code=(await admin('ISSUE_CODE',E2)).setup_code;await root();assert.equal((await login('982741',code,terminal,'TWO')).ok,true);
  });
  await t.test('company activation requires readiness and then rejects legacy sessions; PIN booking remains usable',async()=>{
   await setUser(O);assert.equal((await admin('ENABLE_REQUIRED')).pin_required,true);await root();
   assert.equal((await legacy()).ok,false);
   const session=token();assert.equal((await login('982741',null,terminal,'FIKTIV',session)).ok,true);
   const status=await scalar('select public.qr_independent_action($1,$2,$3,$4) v',[terminal,session,'CLOCK_IN',token()]);assert.equal(status.state,'RUNNING');
   const ended=await scalar('select public.qr_independent_action($1,$2,$3,$4) v',[terminal,session,'CLOCK_OUT',token()]);assert.equal(ended.state,'READY');
   // A later newly added employee cannot fall back to a joining date either.
   await db.exec(`update public.employees set personnel_no='OLD' where id='${E}';insert into public.employees(company_id,personnel_no,start_date) values('${C}','FIKTIV','2020-01-15')`);
   assert.equal((await legacy()).ok,false);
  });
  await t.test('deactivation removes secrets and revokes sessions without reopening date fallback',async()=>{
   await root();await db.exec("update public.employees set access_status='DISABLED' where id='"+E2+"'");
   const row=(await db.query('select * from private.qr_pin_credentials where employee_id=$1',[E2])).rows[0];
   assert.equal(row.pin_hash,null);assert.equal(row.setup_hash,null);assert.equal(row.legacy_disabled,true);
   assert.equal(await scalar('select count(*)::int v from public.time_qr_independent_sessions where employee_id=$1',[E2]),0);
  });
  await t.test('direct reads and service-only login calls are denied to normal clients',async()=>{
   await setUser(O);await assert.rejects(db.query('select * from private.qr_pin_credentials'),/permission denied/);
   await assert.rejects(db.query('select * from private.qr_pin_settings'),/permission denied/);await assert.rejects(login(),/permission denied/);
   await db.exec('reset role;set role anon');await assert.rejects(admin(),/permission denied/);await assert.rejects(login(),/permission denied/);
  });
 }finally{await db.close()}
});
