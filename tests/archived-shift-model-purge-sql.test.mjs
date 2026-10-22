import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const migration=fs.readFileSync(new URL('../supabase/migrations/20261022142029_archived_shift_model_purge.sql',import.meta.url),'utf8');

test('archived model purge is company scoped and preserves linked history',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user_id',true),'')::uuid$$;
   create table company_members(company_id uuid,user_id uuid,status text,role text);
   create table shift_templates(id uuid primary key default gen_random_uuid(),company_id uuid,code text,active boolean);
   create table shift_assignments(company_id uuid,shift_code text);
   create table shift_change_requests(company_id uuid,old_snapshot jsonb,proposed_snapshot jsonb);
   create table employees(company_id uuid,shift_permissions text[],qualifications text[]);
   create table datev_lodas_rules(company_id uuid,source_key text);`);
  await db.exec(migration);
  const co='11111111-1111-1111-1111-111111111111',other='22222222-2222-2222-2222-222222222222',user='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  await db.query("select set_config('test.user_id',$1,false)",[user]);
  await db.query("insert into company_members values($1,$2,'ACTIVE','OWNER')",[co,user]);
  await db.query("insert into shift_templates(company_id,code,active) values($1,'USED',false),($1,'FREE',false),($1,'LIVE',true),($2,'FOREIGN',false)",[co,other]);
  await db.query("insert into shift_assignments values($1,'USED')",[co]);
  const call=async(c,code,action)=>(await db.query('select manager_archived_shift_model($1,$2,$3) result',[c,code,action])).rows[0].result;
  assert.equal((await call(co,'USED','CHECK')).assignments,1);
  await assert.rejects(call(co,'USED','PURGE'),/noch mit Diensten/);
  assert.equal((await db.query("select count(*)::int n from shift_templates where code='USED'")).rows[0].n,1);
  await assert.rejects(call(co,'LIVE','PURGE'),/Nur bereits entfernte/);
  await assert.rejects(call(co,'FOREIGN','PURGE'),/nicht gefunden/);
  await assert.rejects(call(other,'FOREIGN','PURGE'),/Planungsrechte/);
  assert.equal((await call(co,'FREE','PURGE')).deleted,true);
  assert.equal((await db.query("select count(*)::int n from shift_templates where code='FREE'")).rows[0].n,0);
 }finally{await db.close()}
});
