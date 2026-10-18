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
test('desktop PIN transport and QR share the real PostgreSQL booking engine',async t=>{
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
  await db.exec(`alter table public.companies add column name text;
   update public.companies set name=case when id='${C}' then 'Synthetic company A' else 'Synthetic company B' end;
   alter table public.time_qr_terminals add column vault_secret_id uuid,add column pilot_mode boolean not null default false,add column updated_at timestamptz,add column updated_by uuid;
   create schema vault;create table vault.decrypted_secrets(id uuid primary key,decrypted_secret text);
   insert into vault.decrypted_secrets values('${id(40)}','${terminal}'),('${id(41)}','${otherTerminal}'),('${id(42)}','${foreignTerminal}');
   update public.time_qr_terminals set vault_secret_id=case when name='Synthetic A' then '${id(40)}'::uuid when name='Synthetic B' then '${id(41)}'::uuid else '${id(42)}'::uuid end;
   create function private.sf_company_profile_can_write(p_company_id uuid) returns boolean language sql security definer set search_path='' as $$
    select auth.uid() is not null and exists(select 1 from public.company_members where company_id=p_company_id and user_id=auth.uid() and status='ACTIVE' and role in ('OWNER','ADMIN') and not 'read_only'=any(extra_permissions))$$;
  `);
  const desktopMigration=fs.readdirSync(new URL('../supabase/migrations/',import.meta.url)).find(f=>f.endsWith('_qr_desktop_entry_access.sql'));
  await db.exec(read('supabase/migrations/'+desktopMigration));
  const transition=fs.readdirSync(new URL('../supabase/migrations/',import.meta.url)).find(f=>f.endsWith('_qr_desktop_legacy_transition.sql'));
  await db.exec(read('supabase/migrations/'+transition));
  // Preserve the old entrypoint's actual production grants (CREATE OR REPLACE retains them).
  await db.exec('revoke all on function public.qr_independent_login(text,text,date,text),public.qr_independent_action(text,text,text,text) from public,anon,authenticated;grant execute on function public.qr_independent_login(text,text,date,text),public.qr_independent_action(text,text,text,text) to service_role;');

  const terminalId=await scalar("select id v from public.time_qr_terminals where name='Synthetic A'");
  const otherId=await scalar("select id v from public.time_qr_terminals where name='Synthetic B'");
  const foreignId=await scalar("select id v from public.time_qr_terminals where name='Foreign'");
  const desktopLegacy=(session=token(),person='FIKTIV',date='2020-01-15',terminal=terminalId)=>scalar('select public.qr_desktop_legacy_login($1,$2,$3,$4) v',[terminal,person,date,session]);
  const directory=()=>scalar('select public.qr_desktop_terminals() v');
  const desktop=(action='LOGIN',session=token(),args={})=>scalar('select public.qr_desktop_request($1,$2,$3,$4,$5,$6,$7) v',
   [args.terminal||terminalId,action,args.person||'FIKTIV',Object.hasOwn(args,'pin')?args.pin:'739281',session,args.code||null,args.request||null]);
  const access=(company=C,terminal=null,enabled=null,expected=null)=>scalar('select public.manager_qr_desktop_access($1,$2,$3,$4) v',[company,terminal,enabled,expected]);
  await t.test('terminal directory is opt-in and only service role can call desktop RPCs',async()=>{
   assert.deepEqual((await directory()).terminals,[]);
   await assert.rejects(desktop(),/PC-Zugang nicht/);
   for(const role of ['anon','authenticated']){
    await db.exec('reset role;set role '+role);await assert.rejects(directory(),/permission denied/);await assert.rejects(desktop(),/permission denied/);await assert.rejects(desktopLegacy(),/permission denied/);
   }
   await root();await db.exec('set role service_role');assert.deepEqual((await directory()).terminals,[]);await root();
  });
  await t.test('opt-in is restricted to same-company admin, MFA, active regular terminal and expected state',async()=>{
   for(const user of [T,X,Z,null]){await setUser(user);await assert.rejects(access(),/berechtigt/)}
   await setUser(O,'aal1');await assert.rejects(access(C,terminalId,true,false),/MFA_REQUIRED/);
   await setUser(O);await assert.rejects(access(C,foreignId,true,false),/nicht gefunden/);
   assert.equal((await access(C,terminalId,true,false)).find(t=>t.id===terminalId).desktop_enabled,true);
   await assert.rejects(access(C,terminalId,false,false),/zwischenzeitlich/);
   await root();await db.query('update public.time_qr_terminals set pilot_mode=true where id=$1',[otherId]);await setUser(O);
   await assert.rejects(access(C,otherId,true,false),/reguläre/);
   await root();const list=await directory();assert.equal(list.terminals.length,1);
   assert.deepEqual(Object.keys(list.terminals[0]).sort(),['company_name','id','terminal_name']);
   assert.ok(!JSON.stringify(list).includes(terminal));
  });
  await t.test('desktop date transition books the same shift as QR, with no automatic punch on login',async()=>{
   await db.exec('begin');
   try{
    const session=token();assert.equal((await desktopLegacy(session,'TWO','2020-01-16')).ok,false);
    assert.equal((await desktopLegacy(session,'TWO')).ok,true);
    assert.equal((await desktop('STATUS',session)).state,'READY');
    assert.equal(await scalar('select count(*)::int v from public.time_qr_independent_shifts'),0);
    assert.equal((await desktop('CLOCK_IN',session,{request:token()})).state,'RUNNING');
    const phone=token();assert.equal((await scalar('select public.qr_independent_login($1,$2,$3,$4) v',[terminal,'TWO','2020-01-15',phone])).ok,true);
    assert.equal((await scalar('select public.qr_independent_action($1,$2,$3,$4) v',[terminal,phone,'STATUS',null])).state,'RUNNING');
    assert.equal((await desktop('CLOCK_OUT',session,{request:token()})).state,'READY');
   }finally{await db.exec('rollback')}
  });
  let code,pcSession,phoneSession;
  await t.test('PC accepts legacy sessions only before personal PIN setup; PIN route never falls back',async()=>{
   const legacySession=token();assert.equal((await legacy(legacySession)).ok,true);
   assert.equal((await desktop('STATUS',legacySession)).state,'READY');
   await assert.rejects(desktop('LOGIN',token(),{pin:null}),/persönlicher PIN/);
   await setUser(O);code=(await admin('ISSUE_CODE',E)).setup_code;await root();
   assert.equal((await desktop('SET_PIN',token(),{code})).ok,true);
   assert.equal((await desktopLegacy()).ok,false);await assert.rejects(desktop('STATUS',legacySession),/abgelaufen/);
   pcSession=token();assert.equal((await desktop('LOGIN',pcSession)).ok,true);
   assert.equal((await desktop('STATUS',pcSession)).state,'READY');
   assert.equal(await scalar('select count(*)::int v from public.time_qr_independent_shifts'),0);
  });
  await t.test('PIN failures share QR company/personnel rate limit and cannot cross companies',async()=>{
   for(let i=0;i<5;i++)assert.equal((await (i%2?login('382719'):desktop('LOGIN',token(),{pin:'382719'}))).ok,false);
   assert.equal((await desktop()).rate_limited,true);assert.equal((await login()).rate_limited,true);
   await db.exec("update public.time_qr_independent_login_limits set reset_at=now()-interval '1 second'");
   assert.equal((await desktop()).ok,true);
   await db.query('update public.time_qr_terminals set desktop_enabled=true where id=$1',[foreignId]);
   assert.equal((await desktop('LOGIN',token(),{terminal:foreignId})).ok,false);
  });
  await t.test('PC and phone continue one real shift with independent sessions and idempotent punches',async()=>{
   phoneSession=token();assert.equal((await login('739281',null,terminal,'FIKTIV',phoneSession)).ok,true);
   const request=token();const started=await desktop('CLOCK_IN',pcSession,{request});assert.equal(started.state,'RUNNING');
   const replay=await desktop('CLOCK_IN',pcSession,{request});assert.equal(replay.replayed,true);
   const phone=(action)=>scalar('select public.qr_independent_action($1,$2,$3,$4) v',[terminal,phoneSession,action,token()]);
   const pause=await phone('BREAK_START');assert.equal(pause.state,'BREAK');
   assert.equal((await desktop('STATUS',pcSession)).state,'BREAK');
   assert.equal((await desktop('BREAK_END',pcSession,{request:token()})).state,'RUNNING');
   assert.equal((await phone('CLOCK_OUT')).state,'READY');
   assert.equal((await desktop('STATUS',pcSession)).state,'READY');
   assert.equal(await scalar('select count(*)::int v from public.time_qr_independent_shifts'),1);
   assert.equal(await scalar('select count(*)::int v from public.time_qr_independent_events'),4);
   await assert.rejects(desktop('STATUS',pcSession,{terminal:foreignId}),/abgelaufen/);
  });
  await t.test('company PIN enforcement and PIN reset never reopen the desktop date route',async()=>{
   await db.exec('begin');
   try{
    const old=token();assert.equal((await desktopLegacy(old,'TWO')).ok,true);
    await db.query('insert into private.qr_pin_settings(company_id,pin_required) values($1,true) on conflict(company_id) do update set pin_required=true',[C]);
    assert.equal((await desktopLegacy(token(),'TWO')).ok,false);
    await assert.rejects(desktop('STATUS',old),/abgelaufen/);
   }finally{await db.exec('rollback')}
   await db.exec('begin');
   try{
    await setUser(O);await admin('ISSUE_CODE',E);await root();
    assert.equal((await desktopLegacy()).ok,false);assert.equal((await desktop()).ok,false);
   }finally{await db.exec('rollback')}
  });
  await t.test('disabling PC access blocks existing PC sessions but keeps QR working; corrupt vault fails closed',async()=>{
   await setUser(O);await access(C,terminalId,false,true);await root();
   await assert.rejects(desktop('STATUS',pcSession),/PC-Zugang nicht/);
   assert.equal((await scalar('select public.qr_independent_action($1,$2,$3,$4) v',[terminal,phoneSession,'STATUS',null])).ok,true);
   await setUser(O);await access(C,terminalId,true,false);await root();
   await db.query('update vault.decrypted_secrets set decrypted_secret=$1 where id=$2',['d'.repeat(64),id(40)]);
   await assert.rejects(desktop(),/derzeit nicht/);
   const audit=JSON.stringify((await db.query('select metadata from public.audit_events')).rows);
   assert.ok(!audit.includes(code));assert.ok(!audit.includes(terminal));assert.ok(!audit.includes('739281'));
  });
 }finally{await db.close()}
});
