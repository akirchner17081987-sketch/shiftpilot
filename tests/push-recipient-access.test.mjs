import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const migration=read('supabase/migrations/20261018100412_push_active_recipient_guard.sql');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [C,D,U,E]=[1,2,3,4].map(id);
test('subscription, test send and delivery use the same active company identity',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.company_members(company_id uuid,user_id uuid,status text);
 create table public.employees(id uuid,company_id uuid,auth_user_id uuid,status text,access_status text,deleted_at timestamptz);
 create table private.push_config(id boolean,enabled boolean,vapid_public_key text);
 insert into private.push_config values(true,true,'public-test-key');
 insert into employees values('${E}','${C}','${U}','active','ACTIVE',null);
 create function public.register_push_subscription(p_company_id uuid,p_endpoint text,p_p256dh text,p_auth text,p_user_agent text default null) returns uuid language plpgsql security definer set search_path='' as $$\nbegin\n return auth.uid();end$$;
 create function public.send_push_test(p_company_id uuid) returns uuid language plpgsql security definer set search_path='' as $$\nbegin\n return auth.uid();end$$;
 grant usage on schema public,auth to authenticated;grant execute on function public.register_push_subscription(uuid,text,text,text,text),public.send_push_test(uuid) to authenticated;`);
 await db.exec(migration);
 const actor=async()=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[U]);await db.exec('set role authenticated')};
 const allowed=async()=>{await actor();assert.equal((await db.query('select public.get_push_public_key() key')).rows[0].key,'public-test-key');assert.equal((await db.query('select public.send_push_test($1) id',[C])).rows[0].id,U);assert.equal((await db.query("select public.register_push_subscription($1,'https://example.invalid','x','y') id",[C])).rows[0].id,U)};
 const denied=async()=>{await actor();await assert.rejects(db.query('select public.get_push_public_key()'),/ACTIVE_MEMBERSHIP_REQUIRED/);await assert.rejects(db.query('select public.send_push_test($1)',[C]),/ACTIVE_MEMBERSHIP_REQUIRED/);await assert.rejects(db.query("select public.register_push_subscription($1,'https://example.invalid','x','y')",[C]),/ACTIVE_MEMBERSHIP_REQUIRED/)};
 await allowed();await assert.rejects(db.query('select public.send_push_test($1)',[D]),/ACTIVE_MEMBERSHIP_REQUIRED/);
 await assert.rejects(db.query('select public.server_push_recipient_active($1,$2)',[C,U]),/permission denied/);
 for(const change of ["access_status='DISABLED'","access_status='ACTIVE',status='inactive'","status='active',deleted_at=now()"]){await db.exec('reset role');await db.exec(`update employees set ${change}`);await denied()}
 await db.exec('reset role');await db.exec(`update employees set deleted_at=null;insert into company_members values('${C}','${U}','DISABLED')`);await denied();
 await db.exec('reset role');await db.exec("update company_members set status='ACTIVE'");await allowed();
 await db.exec('reset role');await db.exec('set role service_role');assert.equal((await db.query('select public.server_push_recipient_active($1,$2) active',[C,U])).rows[0].active,true);assert.equal((await db.query('select public.server_push_recipient_active($1,$2) active',[D,U])).rows[0].active,false);
 await db.exec('reset role');await db.exec('set role anon');await assert.rejects(db.query('select public.server_push_recipient_active($1,$2)',[C,U]),/permission denied/);
 }finally{await db.close()}
});
