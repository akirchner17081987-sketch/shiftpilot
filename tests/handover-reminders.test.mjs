import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=fs.readFileSync(new URL('../database/shift-handover-reminders-v1.sql',import.meta.url),'utf8');
assert.equal(sql,fs.readFileSync(new URL('../supabase/migrations/20261018102003_shift_handover_reminders_v1.sql',import.meta.url),'utf8'));
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [C,D,A,B,O,X,V,T,F,E1,E2,EX,EV,ET,S,H,I,J]=Array.from({length:19},(_,n)=>id(n+1));
const t0=new Date().toISOString();
test('automatic handover reminders respect ownership, lifecycle and delivery state',async t=>{
 const db=new PGlite();const q=(s,p)=>(db.query(s,p));const run=async(minutes=0)=>(await q("select private.sf_run_handover_reminders($1::timestamptz+make_interval(mins=>$2)) n",[t0,minutes])).rows[0].n;
 const notifications=async()=> (await q('select * from notifications order by kind,user_id')).rows;
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema private;create schema cron;
 create table auth.users(id uuid primary key);create table companies(id uuid primary key);
 create table employees(id uuid primary key,company_id uuid,auth_user_id uuid,status text default 'active',access_status text default 'ACTIVE',deleted_at timestamptz);
 create table company_members(company_id uuid,user_id uuid,role text,status text,extra_permissions text[] default '{}');
 create table shift_templates(company_id uuid,code text,site_id uuid);
 create table shift_assignments(company_id uuid,employee_id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz,status text,published_at timestamptz);
 create table shift_handovers(id uuid primary key,company_id uuid,state text default 'WORKING',target_id uuid,sent_at timestamptz,received_at timestamptz,site_id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz);
 create table shift_handover_items(id uuid primary key,company_id uuid,board_id uuid,critical boolean,due_at timestamptz,status text,responsible_employee_id uuid);
 create table private.employee_erasure_jobs(company_id uuid,status text);
 create table notifications(id uuid primary key default gen_random_uuid(),company_id uuid,user_id uuid,employee_id uuid,kind text,title text,message text,link_view text,entity_type text,entity_id uuid,metadata jsonb,is_read boolean default false,read_at timestamptz,created_at timestamptz default now(),unique(user_id,kind,entity_id));
 create table provider_queue(notification_id uuid);
 create function public.qa_enqueue() returns trigger language plpgsql as $$begin insert into public.provider_queue values(new.id);return new;end$$;
 create trigger qa_enqueue after insert on notifications for each row execute function qa_enqueue();
 create trigger qa_refresh after update of created_at on notifications for each row when(new.created_at is distinct from old.created_at) execute function qa_enqueue();
 create function private.sf_put_notification(c uuid,u uuid,e uuid,k text,t text,m text,v text,et text,ei uuid,md jsonb) returns void language sql as $$insert into public.notifications(company_id,user_id,employee_id,kind,title,message,link_view,entity_type,entity_id,metadata)values(c,u,e,k,t,m,v,et,ei,md) on conflict(user_id,kind,entity_id)do update set metadata=excluded.metadata,is_read=false,read_at=null,created_at=now()$$;
 create function private.sf_push_recipient_active(c uuid,u uuid) returns boolean language sql as $$select not exists(select 1 from public.company_members where company_id=c and user_id=u and status<>'ACTIVE') and(exists(select 1 from public.company_members where company_id=c and user_id=u and status='ACTIVE')or exists(select 1 from public.employees where company_id=c and auth_user_id=u and status='active' and access_status='ACTIVE' and deleted_at is null))$$;
 create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
 insert into companies values('${C}'),('${D}');insert into auth.users select unnest(array['${A}','${B}','${O}','${X}','${V}','${T}','${F}']::uuid[]);
 insert into company_members(company_id,user_id,role,status,extra_permissions)values('${C}','${O}','OWNER','ACTIVE','{}'),('${C}','${X}','PLANNER','DISABLED','{}'),('${C}','${V}','VIEWER','ACTIVE','{read_only}'),('${C}','${T}','TIME_TRACKING','ACTIVE','{manage_time}'),('${D}','${F}','OWNER','ACTIVE','{}');
 insert into employees(id,company_id,auth_user_id)values('${E1}','${C}','${A}'),('${E2}','${C}','${B}'),('${EX}','${C}','${X}'),('${EV}','${C}','${V}'),('${ET}','${C}','${T}');
 insert into shift_templates values('${C}','FD',null);`);
 await q("insert into shift_handovers(id,company_id,state,target_id,sent_at,shift_code,starts_at,ends_at) values($1,$2,'SENT',$3,$4::timestamptz-interval '40 minutes','FD',$4::timestamptz-interval '8 hours',$4::timestamptz-interval '30 minutes'),($3,$2,'WORKING',null,null,'FD',$4::timestamptz-interval '30 minutes',$4::timestamptz+interval '8 hours')",[S,C,H,t0]);
 await q("insert into shift_assignments select $1,e.id,'FD',$2::timestamptz-interval '30 minutes',$2::timestamptz+interval '8 hours','PUBLISHED',$2::timestamptz from employees e",[C,t0]);
 await q("insert into shift_handover_items values($1,$2,$3,true,$4::timestamptz-interval '1 minute','OPEN',$5),($6,$2,$3,false,$4::timestamptz-interval '1 minute','OPEN',null)",[I,C,H,t0,E1,J]);
 await db.exec(sql);
 await t.test('no reminder before the target grace period or future deadline',async()=>{assert.equal(await run(-40),0);assert.equal(await run(-16),0)});
 await t.test('first run reaches the assigned crew/owner without foreign, disabled, viewer or time-only users',async()=>{
  assert.equal(await run(),5);const rows=await notifications();assert.deepEqual(rows.filter(x=>x.kind==='HANDOVER_PENDING').map(x=>x.user_id).sort(),[A,B,O].sort());assert.deepEqual(rows.filter(x=>x.kind==='HANDOVER_CRITICAL_OVERDUE').map(x=>x.user_id).sort(),[A,O].sort());assert.ok(rows.every(x=>x.company_id===C&&x.message.indexOf('Fiktiver Geheimtext')<0));assert.equal(rows.find(x=>x.user_id===O).link_view,'handover');assert.equal(rows.find(x=>x.user_id===A).link_view,'employee-handover');
  const n=rows.find(x=>x.kind==='HANDOVER_CRITICAL_OVERDUE');assert.equal((await q('select public.server_handover_reminder_active($1) active',[n.id])).rows[0].active,true);
 });
 await t.test('overlapping runs and deleted notifications cannot bypass one-hour interval or three-message cap',async()=>{
  assert.equal(await run(),0);assert.equal(await run(59),0);await q("delete from notifications where user_id=$1 and kind='HANDOVER_PENDING'",[B]);assert.equal(await run(59),0);assert.equal(await run(60),5);assert.equal(await run(120),5);assert.equal(await run(180),0);assert.equal((await q('select count(*)::int n from provider_queue')).rows[0].n,15);
 });
 await t.test('unassigned tasks reach crew; managers are deduplicated and crew stops after shift end',async()=>{
  await db.exec('begin');try{
   const extra=id(99);await q('insert into employees(id,company_id,auth_user_id)values($1,$2,$3)',[extra,C,O]);await q("insert into shift_assignments select company_id,$1,shift_code,starts_at,ends_at,status,published_at from shift_assignments limit 1",[extra]);
   let rows=(await q('select * from private.sf_handover_reminder_candidates($1,$2)',[C,t0])).rows;assert.equal(rows.filter(x=>x.kind==='HANDOVER_PENDING'&&x.user_id===O).length,1);
   await q('update shift_handover_items set responsible_employee_id=null where id=$1',[I]);rows=(await q('select * from private.sf_handover_reminder_candidates($1,$2)',[C,t0])).rows;assert.deepEqual(rows.filter(x=>x.kind==='HANDOVER_CRITICAL_OVERDUE').map(x=>x.user_id).sort(),[A,B,O].sort());
   rows=(await q("select * from private.sf_handover_reminder_candidates($1,$2::timestamptz+interval '9 hours')",[C,t0])).rows;assert.ok(rows.every(x=>x.user_id===O));
   await q("update shift_handover_items set status='CARRIED' where id=$1",[I]);assert.equal((await q("select count(*)::int n from private.sf_handover_reminder_candidates($1,$2) where kind='HANDOVER_CRITICAL_OVERDUE'",[C,t0])).rows[0].n,0);
  }finally{await db.exec('rollback')}
 });
 await t.test('deduplication cycles are independent of session timezone',async()=>{
  const before=(await q('select cycle from private.sf_handover_reminder_candidates($1,$2) order by kind,user_id',[C,t0])).rows;await db.exec("set timezone='Europe/Berlin'");assert.deepEqual((await q('select cycle from private.sf_handover_reminder_candidates($1,$2) order by kind,user_id',[C,t0])).rows,before);await db.exec("set timezone='UTC'");
 });
 await t.test('completion and receipt resolve notifications without another provider request',async()=>{
  await q("update shift_handover_items set status='DONE' where id=$1",[I]);await q('update shift_handovers set received_at=now() where id=$1',[S]);assert.equal(await run(181),0);assert.ok((await notifications()).every(x=>x.is_read&&x.metadata.resolved));assert.equal((await q('select count(*)::int n from provider_queue')).rows[0].n,15);for(const n of await notifications())assert.equal((await q('select public.server_handover_reminder_active($1) active',[n.id])).rows[0].active,false);
 });
 await t.test('reopening starts a new episode; an edited deadline has a distinct cycle',async()=>{
  await q("update shift_handover_items set status='OPEN' where id=$1",[I]);assert.equal(await run(182),2);await q("update shift_handover_items set due_at=due_at+interval '10 seconds' where id=$1",[I]);assert.equal(await run(183),2);assert.equal((await q('select max(sent_count) n from private.handover_reminder_log where entity_id=$1',[I])).rows[0].n,1);
 });
 await t.test('source is checked again before delivery, even before the next worker run',async()=>{
  const n=(await notifications()).find(x=>x.kind==='HANDOVER_CRITICAL_OVERDUE');await q("update shift_handover_items set status='DONE' where id=$1",[I]);assert.equal((await q('select public.server_handover_reminder_active($1) active',[n.id])).rows[0].active,false);await q("update shift_handover_items set status='OPEN' where id=$1",[I]);await q("update employees set access_status='DISABLED' where id=$1",[E1]);assert.equal((await q('select public.server_handover_reminder_active($1) active',[n.id])).rows[0].active,false);await q("update employees set access_status='ACTIVE' where id=$1",[E1]);
 });
 await t.test('cancelled publications, future deadlines and erasure jobs suppress reminders',async()=>{
  await q("update shift_assignments set status='DRAFT'");assert.equal(await run(250),0);await q("update shift_assignments set status='PUBLISHED'");await q("update shift_handover_items set due_at=$1::timestamptz+interval '1 day'",[t0]);assert.equal(await run(250),0);await q("update shift_handover_items set due_at=$1::timestamptz-interval '1 minute'",[t0]);await q("insert into private.employee_erasure_jobs values($1,'EXTERNAL')",[C]);assert.equal(await run(250),0);
 });
 await t.test('normal users cannot execute workers/service gate or inspect the log',async()=>{
  await db.exec('set role authenticated');await assert.rejects(q('select * from private.handover_reminder_log'),/permission denied/);await assert.rejects(q('select private.sf_run_handover_reminders()'),/permission denied/);await assert.rejects(q('select public.server_handover_reminder_active($1)',[I]),/permission denied/);await db.exec('reset role');
 });
 }finally{await db.close()}
});
