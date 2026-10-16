import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=read('supabase/migrations/20261016125801_legacy_user_management_fail_closed.sql');
const previous=read('supabase/migrations/20261009220109_four_primary_access_roles.sql')
  .match(/CREATE OR REPLACE FUNCTION public\.manager_update_company_member\([\s\S]*?\$function\$\s*;/)[0];
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const company=id(1),otherCompany=id(2),owner=id(10),admin=id(11),lead=id(12),viewer=id(13),disabled=id(14),foreign=id(15),employee=id(16),target=id(20),otherAdmin=id(21);
test('legacy member RPC enforces company, role, MFA and protected targets in PostgreSQL',async t=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create schema private;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
      create function auth.role() returns text language sql stable as $$select auth.jwt()->>'role'$$;
      grant usage on schema public,auth,private to authenticated,anon;
      create table public.company_members(company_id uuid,user_id uuid,role text,status text,primary key(company_id,user_id));
      insert into public.company_members values
        ('${company}','${owner}','OWNER','ACTIVE'),('${company}','${admin}','ADMIN','ACTIVE'),
        ('${company}','${lead}','PLANNER','ACTIVE'),('${company}','${viewer}','VIEWER','ACTIVE'),
        ('${company}','${disabled}','ADMIN','DISABLED'),('${otherCompany}','${foreign}','OWNER','ACTIVE'),
        ('${company}','${target}','PLANNER','ACTIVE'),('${company}','${otherAdmin}','ADMIN','ACTIVE');`);
    await db.exec(read('supabase/migrations/20260914053039_mfa_sensitive_action_guard_v1.sql'));
    await db.exec(previous+' grant execute on function public.manager_update_company_member(uuid,uuid,text,text) to authenticated;');
    const call=async(actor,{aal='aal2',targetId=target,role='VIEWER',status='DISABLED',companyId=company}={})=>{
      await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:actor,role:'authenticated',aal})]);
      await db.exec('set role authenticated');
      try{return await db.query('select public.manager_update_company_member($1,$2,$3,$4)',[companyId,targetId,role,status]);}
      finally{await db.exec('reset role');}
    };
    const targetState=async()=> (await db.query('select role,status from public.company_members where company_id=$1 and user_id=$2',[company,target])).rows[0];
    await t.test('regression fixture reproduces the previous missing-membership bug',async()=>{
      await call(foreign);
      assert.deepEqual(await targetState(),{role:'VIEWER',status:'DISABLED'});
      await db.query("update public.company_members set role='PLANNER',status='ACTIVE' where company_id=$1 and user_id=$2",[company,target]);
    });
    await db.exec(migration);
    for(const [name,actor] of [['foreign-company owner',foreign],['unlinked employee',employee],['disabled administrator',disabled],['team leader',lead],['viewer',viewer],['missing identity',null]]){
      await t.test(name+' cannot change another membership',async()=>{
        await assert.rejects(()=>call(actor),/Nicht berechtigt/);
        assert.deepEqual(await targetState(),{role:'PLANNER',status:'ACTIVE'});
      });
    }
    await t.test('AAL1 owner is denied without relying on an API gateway',async()=>{
      await assert.rejects(()=>call(owner,{aal:'aal1'}),/MFA_REQUIRED/);
      assert.deepEqual(await targetState(),{role:'PLANNER',status:'ACTIVE'});
    });
    await t.test('missing company is denied',async()=>await assert.rejects(()=>call(owner,{companyId:null}),/Nicht berechtigt/));
    await t.test('owner and self remain protected',async()=>{
      await assert.rejects(()=>call(admin,{targetId:owner}),/Inhaberrolle/);
      await assert.rejects(()=>call(admin,{targetId:admin}),/geschützt/);
    });
    await t.test('administrator cannot alter or create administrator access',async()=>{
      await assert.rejects(()=>call(admin,{targetId:otherAdmin}),/Nur der Inhaber/);
      await assert.rejects(()=>call(admin,{role:'ADMIN'}),/Nur der Inhaber/);
    });
    await t.test('invalid input and unknown target do not alter membership',async()=>{
      await assert.rejects(()=>call(owner,{role:null}),/Ungültige Rolle/);
      await assert.rejects(()=>call(owner,{status:null}),/Ungültige Rolle/);
      await assert.rejects(()=>call(owner,{targetId:id(999)}),/Benutzer nicht gefunden/);
      assert.deepEqual(await targetState(),{role:'PLANNER',status:'ACTIVE'});
    });
    await t.test('authorized AAL2 administrator can change an ordinary member',async()=>{
      await call(admin);
      assert.deepEqual(await targetState(),{role:'VIEWER',status:'DISABLED'});
    });
    await t.test('authorized AAL2 owner can manage administrator access',async()=>{
      await call(owner,{targetId:otherAdmin,role:'PLANNER',status:'DISABLED'});
      assert.deepEqual((await db.query('select role,status from public.company_members where user_id=$1',[otherAdmin])).rows[0],{role:'PLANNER',status:'DISABLED'});
    });
    await t.test('anonymous role has no execution privilege',async()=>{
      assert.equal((await db.query("select has_function_privilege('anon','public.manager_update_company_member(uuid,uuid,text,text)','execute') as allowed")).rows[0].allowed,false);
    });
  }finally{await db.close();}
});
