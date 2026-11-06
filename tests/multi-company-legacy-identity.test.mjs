import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const sql=readFileSync(new URL('../drafts/multi-company-roles/legacy-employee-identity-fail-closed-candidate.sql',import.meta.url),'utf8');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [user,other,companyA,companyB,employeeA,employeeB]=[1,2,3,4,5,6].map(id);

test('legacy employee identity rejects ambiguity and retains single-profile behavior',async t=>{
  const db=new PGlite();
  const identity=async()=> (await db.query('select private.sf_employee_id() as id')).rows[0].id;
  try{
    await db.exec(`create schema auth;create schema private;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.employees(id uuid primary key, company_id uuid, auth_user_id uuid, status text, access_status text, deleted_at timestamptz);
      create table public.company_members(company_id uuid,user_id uuid,status text,role text,extra_permissions text[]);
      insert into public.employees values
        ('${employeeA}','${companyA}','${user}','active','ACTIVE',null),
        ('${employeeB}','${companyB}','${other}','active','ACTIVE',null);
      select set_config('request.jwt.claim.sub','${user}',false);`);
    await db.exec(sql);
    await t.test('one active profile resolves to that profile',async()=>assert.equal(await identity(),employeeA));
    await t.test('a second active profile returns no ambiguous identity',async()=>{
      await db.exec(`update public.employees set auth_user_id='${user}' where id='${employeeB}'`);
      assert.equal(await identity(),null);
    });
    await t.test('a disabled or deleted profile is not treated as active',async()=>{
      await db.exec(`update public.employees set access_status='DISABLED' where id='${employeeB}'`);assert.equal(await identity(),employeeA);
      await db.exec(`update public.employees set access_status='ACTIVE',deleted_at=now() where id='${employeeB}'`);assert.equal(await identity(),employeeA);
      await db.exec(`update public.employees set deleted_at=null,status='inactive' where id='${employeeB}'`);assert.equal(await identity(),employeeA);
    });
    await t.test('disabled, read-only and time-only company memberships do not grant a portal identity',async()=>{
      await db.exec(`update public.employees set status='active' where id='${employeeB}'`);
      for(const [status,role,perms] of [['DISABLED','PLANNER','{}'],['ACTIVE','VIEWER','{}'],['ACTIVE','TIME_TRACKING','{}'],['ACTIVE','PLANNER','{read_only}']]){
        await db.exec(`delete from public.company_members;insert into public.company_members values('${companyB}','${user}','${status}','${role}','${perms}')`);
        assert.equal(await identity(),employeeA);
      }
    });
    await t.test('legacy access guard rejects an ambiguous identity',async()=>{
      await db.exec(`delete from public.company_members;
        create function private.sf_require_active_employee_access() returns void language plpgsql stable security definer set search_path='' as $$
          begin if private.sf_employee_id() is null then raise exception 'Kein aktiver Mitarbeiterzugang gefunden' using errcode='42501'; end if; end $$;`);
      await assert.rejects(db.query('select private.sf_require_active_employee_access()'),/Kein aktiver Mitarbeiterzugang/);
      await db.exec(`update public.employees set access_status='DISABLED' where id='${employeeB}'`);
      await db.query('select private.sf_require_active_employee_access()');
    });
    await t.test('no signed-in user resolves no identity',async()=>{
      await db.exec("select set_config('request.jwt.claim.sub','',false)");assert.equal(await identity(),null);
    });
  }finally{await db.close()}
});
