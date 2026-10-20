import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const sql=fs.readFileSync(new URL('../database/audit-weekly-archives-v1.sql',import.meta.url),'utf8');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [C,D,U,E,F]=[1,2,3,4,5].map(id);
test('signed audit archive: restore originals, scopes, tampering, duplicates, privacy and weekly DST',async t=>{
 const db=new PGlite({extensions:{pgcrypto}});
 const call=async(action,args={},company=C)=>(await db.query('select public.manager_audit_archive($1,$2,$3::jsonb) data',[action,company,JSON.stringify(args)])).rows[0].data;
 const actor=async(user=U,aal='aal2')=>{await db.exec('reset role');await db.query("select set_config('qa.user',$1,false),set_config('qa.aal',$2,false)",[user,aal]);await db.exec('set role authenticated')};
 try{
  await db.exec(`create schema private;create schema auth;create schema extensions;create schema cron;
   create extension pgcrypto with schema extensions;create role anon;create role authenticated;create role service_role;
   create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('qa.user',true),'')::uuid$$;
   create table companies(id uuid primary key,name text);create table auth.users(id uuid primary key);
   create table company_members(company_id uuid,user_id uuid,status text,role text,access_role text);
   create function private.can_manage_company_users(c uuid)returns boolean language sql stable security definer set search_path='' as $$select current_setting('qa.aal',true)='aal2' and exists(select 1 from public.company_members where company_id=c and user_id=auth.uid() and status='ACTIVE' and role in('OWNER','ADMIN') and access_role in('OWNER','ADMIN'))$$;
   create table employees(id uuid primary key,company_id uuid);
   create table audit_events(id uuid primary key default gen_random_uuid(),company_id uuid not null references companies(id),event_type text not null,entity_type text not null,entity_id uuid,actor_id uuid references auth.users(id),actor_role text,old_values jsonb,new_values jsonb,metadata jsonb not null default '{}',created_at timestamptz not null default now());
   create index on audit_events(company_id,created_at,id);
   create function private.enrich()returns trigger language plpgsql as $$begin new.metadata:=new.metadata||'{"transaction_id":"new-transaction","actor_access_role":"ADMIN"}'::jsonb;return new;end$$;
   create trigger sf_audit_context before insert on audit_events for each row execute function private.enrich();
   create function public.prevent_audit_mutation()returns trigger language plpgsql as $$begin raise exception 'immutable audit';end$$;
   create trigger audit_events_no_update before update or delete on audit_events for each row execute function prevent_audit_mutation();
   create table cron.job(jobname text primary key,schedule text,command text);
   create function cron.schedule(text,text,text)returns bigint language plpgsql as $$begin insert into cron.job values($1,$2,$3);return 1;end$$;
   insert into companies values('${C}','Fiktive Firma A'),('${D}','Fiktive Firma B');insert into auth.users values('${U}');
   insert into company_members values('${C}','${U}','ACTIVE','OWNER','OWNER');
   insert into employees values('${E}','${C}');
   insert into audit_events select md5(n::text)::uuid,'${C}','UPDATE_EMPLOYEES','employees','${E}','${U}','OWNER','{}',jsonb_build_object('n',n,'big',9007199254740993::bigint),jsonb_build_object('transaction_id','original-tx'),'2026-10-19 08:00Z' from generate_series(1,601)n;
   grant usage on schema public,auth,private to authenticated;`);
  await db.exec(sql);await actor();
  let info,parts;
  await t.test('export includes all pages and retains integers above JS safe precision as opaque text',async()=>{
   info=await call('create');assert.equal(info.manifest.row_count,601);assert.equal(info.manifest.parts.length,3);
   parts=[];for(const p of info.manifest.parts)parts.push(await call('part',{archive_id:info.manifest.archive_id,part:p.part}));
   assert.match(parts[0].data,/9007199254740993/);assert.equal(parts.reduce((n,p)=>n+JSON.parse(p.data).length,0),601);
   const r=await call('preview',{...info,part:parts[0]});assert.equal(r.duplicates,250);assert.equal(r.new,0);
  });
  await t.test('MFA, tenant, role, direct table and helper permissions are enforced',async()=>{
   await actor(U,'aal1');await assert.rejects(call('list'),/nur für Inhaber/);await actor();await assert.rejects(call('list',{},D),/nur für Inhaber/);
   await assert.rejects(db.query('select * from private.audit_archive_keys'),/permission denied/);
   await assert.rejects(db.query('select private.sf_build_audit_archive($1,null,now(),\'MANUAL\')',[C]),/permission denied/);
   await db.exec('reset role');await db.query("update company_members set access_role='TEAM_LEAD'");await actor();await assert.rejects(call('list'),/nur für Inhaber/);
   await db.exec('reset role');await db.query("update company_members set access_role='OWNER'");await actor('');await assert.rejects(call('list'),/nur für Inhaber/);await actor();
  });
  await t.test('modified rows, signature, company and incomplete packages are rejected before writes',async()=>{
   const p={...parts[0],data:parts[0].data.replace('9007199254740993','9007199254740994')};await assert.rejects(call('preview',{...info,part:p}),/beschädigt/);
   await assert.rejects(call('preview',{...info,signature:'bad',part:parts[0]}),/verändert/);
   await assert.rejects(call('preview',{...info,manifest:{...info.manifest,company_id:D},part:parts[0]}),/verändert/);
   await assert.rejects(call('preview',{...info,part:{part:99,data:'[]'}}),/beschädigt/);
  });
  await t.test('restore only missing original rows and preserve immutable metadata byte-for-byte',async()=>{
   await db.exec('reset role');await db.exec('alter table audit_events disable trigger audit_events_no_update');
   await db.query('delete from audit_events where id in(select (value->>\'id\')::uuid from jsonb_array_elements($1::jsonb))',[parts[0].data]);
   await db.exec('alter table audit_events enable trigger audit_events_no_update');await actor();
   let r=await call('preview',{...info,part:parts[0]});assert.equal(r.new,250);assert.equal(r.duplicates,0);
   r=await call('import',{...info,part:parts[0]});assert.equal(r.inserted,250);
   r=await call('import',{...info,part:parts[0]});assert.equal(r.inserted,0);assert.equal(r.duplicates,250);
   await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from audit_events a join jsonb_array_elements($1::jsonb) x on a.id=(x->>\'id\')::uuid where to_jsonb(a) is distinct from x',[parts[0].data])).rows[0].n,0);
   assert.equal((await db.query('select count(*)::int n from private.audit_archive_restore_context')).rows[0].n,0);await actor();
  });
  await t.test('conflicts cannot overwrite an existing event, even through import',async()=>{
   const r0=JSON.parse(parts[0].data)[0];await db.exec('reset role');await db.exec('alter table audit_events disable trigger audit_events_no_update;alter table audit_events disable trigger sf_audit_archive_redaction');
   await db.query("update audit_events set metadata='{}' where id=$1",[r0.id]);await db.exec('alter table audit_events enable trigger audit_events_no_update;alter table audit_events enable trigger sf_audit_archive_redaction');await actor();
   assert.equal((await call('preview',{...info,part:parts[0]})).conflicts,1);await assert.rejects(call('import',{...info,part:parts[0]}),/widersprüchliche/);
  });
  await t.test('privacy erasure invalidates previous local copies',async()=>{
   await db.exec('reset role');await db.query('delete from employees where id=$1',[E]);await actor();await assert.rejects(call('preview',{...info,part:parts[1]}),/anonymisiert/);
  });
  await t.test('weekly job uses Berlin DST and is idempotent for repeated execution',async()=>{
   await db.exec('reset role');
   const run=async date=>(await db.query('select private.sf_weekly_audit_archives($1::timestamptz) n',[date])).rows[0].n;
   assert.equal(await run('2026-10-26T01:00:00Z'),0);assert.equal(await run('2026-10-26T02:00:00Z'),2);await run('2026-10-26T02:00:00Z');
   let r=(await db.query("select period_from,period_to from private.audit_archives where kind='WEEKLY' and company_id=$1",[C])).rows;assert.equal(r.length,1);assert.equal(r[0].period_from.toISOString(),'2026-10-18T22:00:00.000Z');assert.equal(r[0].period_to.toISOString(),'2026-10-25T23:00:00.000Z');
   assert.equal(await run('2026-03-30T01:00:00Z'),2);assert.equal(await run('2026-03-30T02:00:00Z'),0);
  });
 }finally{await db.close()}
});
