import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=fs.readFileSync(new URL('../database/internal-messages-v1.sql',import.meta.url),'utf8');
const migrationDir=new URL('../supabase/migrations/',import.meta.url);
const migrationFile=fs.readdirSync(migrationDir).find(p=>p.endsWith('_internal_messages_v1.sql'));
assert.equal(fs.readFileSync(new URL(migrationFile,migrationDir),'utf8'),sql,'migration and reviewed SQL must match');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [C,D,OWNER,ADMIN,LEAD,ALICE,BOB,FOREIGN,TERMINAL,VIEWER]=[1,2,3,4,5,6,7,8,9,10].map(id);
test('personal messages isolate tenants and conversations, including privileged accounts',async t=>{
 const db=new PGlite();
 const actor=async user=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);await db.exec('set role authenticated')};
 const root=async()=>db.exec('reset role');
 const query=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const send=async(to,body,key=id(100),company=C)=>(await query('select public.messages_send($1,$2,$3,$4) id',[company,to,body,key]))[0].id;
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',deleted_at timestamptz,banned_until timestamptz);
 create table companies(id uuid primary key);
 create table company_members(company_id uuid,user_id uuid,role text,status text,access_role text,primary key(company_id,user_id));
 create table employees(id uuid primary key,company_id uuid,auth_user_id uuid,first_name text,last_name text,status text,access_status text,deleted_at timestamptz);
 grant usage on schema public,auth,private to authenticated;grant usage on schema public to anon;
 insert into companies values('${C}'),('${D}');
 insert into auth.users(id,email) values ${[OWNER,ADMIN,LEAD,ALICE,BOB,FOREIGN,TERMINAL,VIEWER].map((u,i)=>`('${u}','synthetic${i}@example.invalid')`).join(',')};
 insert into company_members values('${C}','${OWNER}','OWNER','ACTIVE','OWNER'),('${C}','${ADMIN}','ADMIN','ACTIVE','ADMIN'),('${C}','${LEAD}','PLANNER','ACTIVE','TEAM_LEAD'),('${D}','${FOREIGN}','OWNER','ACTIVE','OWNER'),('${C}','${TERMINAL}','TIME_TRACKING','ACTIVE','EMPLOYEE'),('${C}','${VIEWER}','VIEWER','ACTIVE','TEAM_LEAD');
 insert into employees values('${id(20)}','${C}','${ALICE}','Alice','Beispiel','active','ACTIVE',null),('${id(21)}','${C}','${BOB}','Bob','Test','active','ACTIVE',null),('${id(22)}','${C}','${LEAD}','Lea','Leitung','active','ACTIVE',null);`);
 await db.exec(sql);
 let message;
 await t.test('directory contains personal roles and employees, excludes self, foreign tenant and shared terminal',async()=>{
  await actor(ALICE);const people=await query('select * from public.messages_contacts($1)',[C]);
  assert.deepEqual(new Set(people.map(x=>x.user_id)),new Set([OWNER,ADMIN,LEAD,BOB,VIEWER]));
  assert.equal(people.find(x=>x.user_id===LEAD).display_name,'Leitung, Lea');
  assert.deepEqual(Object.keys(people[0]),['user_id','display_name','access_role']);
  await assert.rejects(query('select * from public.messages_contacts($1)',[D]),/MESSAGE_ACCESS_DENIED/);
  await actor(TERMINAL);await assert.rejects(send(ALICE,'terminal'),/MESSAGE_ACCESS_DENIED/);
 });
 await t.test('sending, retries and unread are per recipient, no management override',async()=>{
  await actor(ALICE);message=await send(BOB,'Hallo Bob');assert.equal(await send(BOB,' Hallo Bob '),message);
  await assert.rejects(send(BOB,'Changed same key'),/MESSAGE_RETRY_MISMATCH/);
  await assert.rejects(send(OWNER,'Hallo Bob'),/MESSAGE_RETRY_MISMATCH/);
  assert.equal((await query('select * from direct_messages')).length,1);
  await actor(BOB);assert.equal((await query('select public.messages_unread($1) n',[C]))[0].n,1);
  const inbox=(await query('select public.messages_inbox($1) value',[C]))[0].value;assert.equal(inbox.unread,1);assert.equal(inbox.conversations[0].peer_id,ALICE);
  assert.equal((await query('select * from public.messages_thread($1,$2)',[C,ALICE])).length,1);
  for(const user of [OWNER,ADMIN,LEAD,VIEWER]){await actor(user);assert.equal((await query('select * from direct_messages')).length,0);assert.equal((await query('select * from public.messages_thread($1,$2)',[C,ALICE])).length,0)}
 });
 await t.test('cannot forge sender, read status, edits, deletion, foreign recipient or self-message',async()=>{
  await actor(ALICE);
  await assert.rejects(send(FOREIGN,'wrong tenant',id(101)),/MESSAGE_RECIPIENT_UNAVAILABLE/);
  await assert.rejects(send(ALICE,'self',id(102)),/MESSAGE_INVALID_RECIPIENT/);
  await assert.rejects(send(BOB,' \n\t ',id(103)),/MESSAGE_INVALID_BODY/);
  await assert.rejects(send(BOB,'a'.repeat(2001),id(104)),/MESSAGE_INVALID_BODY/);
  await assert.rejects(db.query('insert into direct_messages(company_id,sender_id,recipient_id,body,client_message_id) values($1,$2,$3,$4,$5)',[C,BOB,ALICE,'forged',id(105)]),/permission denied/);
  await assert.rejects(db.query('update direct_messages set body=$1 where id=$2',['edit',message]),/permission denied/);
  await assert.rejects(db.query('delete from direct_messages where id=$1',[message]),/permission denied/);
  assert.equal((await query('select public.messages_mark_read($1,$2) n',[C,[message]]))[0].n,0);
  await actor(ADMIN);assert.equal((await query('select public.messages_mark_read($1,$2) n',[C,[message]]))[0].n,0);
  await actor(BOB);assert.equal((await query('select public.messages_mark_read($1,$2) n',[C,[message]]))[0].n,1);
  assert.equal((await query('select public.messages_unread($1) n',[C]))[0].n,0);
  await assert.rejects(query('select public.messages_mark_read($1,$2)',[C,Array(51).fill(message)]),/MESSAGE_INVALID_PAGE/);
 });
 await t.test('all personal roles can contact each other without employee records',async()=>{
  for(const [i,user] of [OWNER,ADMIN,LEAD,VIEWER].entries()){await actor(user);await send(ALICE,'Persönliche Nachricht '+i,id(200+i))}
  await actor(ALICE);const inbox=(await query('select public.messages_inbox($1) value',[C]))[0].value;assert.equal(inbox.unread,4);assert.equal(inbox.conversations.length,5);
 });
 await t.test('disabled, deleted, inactive and banned accounts lose access immediately',async()=>{
  for(const change of ["access_status='DISABLED'","access_status='ACTIVE',status='inactive'","status='active',deleted_at=now()"]){
   await root();await db.exec(`update employees set ${change} where auth_user_id='${BOB}'`);
   await actor(BOB);assert.equal((await query('select * from direct_messages')).length,0);await assert.rejects(send(ALICE,'disabled',id(300)),/MESSAGE_ACCESS_DENIED/);
   await actor(ALICE);await assert.rejects(send(BOB,'disabled recipient',id(301)),/MESSAGE_RECIPIENT_UNAVAILABLE/);
  }
  await root();await db.exec(`update employees set deleted_at=null where auth_user_id='${BOB}';insert into company_members values('${C}','${BOB}','PLANNER','DISABLED','TEAM_LEAD')`);
  await actor(BOB);await assert.rejects(query('select public.messages_unread($1)',[C]),/MESSAGE_ACCESS_DENIED/);
  await root();await db.exec(`delete from company_members where user_id='${BOB}';update auth.users set banned_until=now()+interval '1 day' where id='${BOB}'`);
  await actor(ALICE);await assert.rejects(send(BOB,'banned recipient',id(302)),/MESSAGE_RECIPIENT_UNAVAILABLE/);
  await root();await db.exec(`update auth.users set banned_until=null where id='${BOB}'`);
  await actor(BOB);assert.equal((await query('select * from direct_messages')).length,1);
 });
 await t.test('pagination is stable even with equal timestamps; only supplied received IDs are marked read',async()=>{
  await root();for(let i=0;i<105;i++)await db.query('insert into direct_messages(id,company_id,sender_id,recipient_id,body,client_message_id,created_at) values($1,$2,$3,$4,$5,$6,$7)',[id(1000+i),C,ALICE,BOB,'Seite '+i,id(2000+i),'2026-01-01T10:00:00Z']);
  await actor(BOB);const all=[];let before=null,beforeId=null;
  do{const page=await query('select * from public.messages_thread($1,$2,$3,$4)',[C,ALICE,before,beforeId]);all.push(...page);if(page.length<50)break;before=page.at(-1).created_at;beforeId=page.at(-1).id}while(all.length<200);
  assert.equal(all.length,106);assert.equal(new Set(all.map(x=>x.id)).size,106);
  const viewed=all.slice(0,50).map(x=>x.id);assert.equal((await query('select public.messages_mark_read($1,$2) n',[C,viewed]))[0].n,49);
  assert.equal((await query('select public.messages_unread($1) n',[C]))[0].n,56);
 });
 await t.test('cross-company context stays separate for a person with two memberships',async()=>{
  await root();await db.exec(`insert into company_members values('${D}','${ALICE}','PLANNER','ACTIVE','TEAM_LEAD'),('${D}','${BOB}','PLANNER','ACTIVE','TEAM_LEAD')`);
  await actor(ALICE);await send(BOB,'Andere Firma',id(400),D);assert.equal((await query('select * from public.messages_thread($1,$2)',[D,BOB])).length,1);
  await actor(BOB);assert.equal((await query('select public.messages_unread($1) n',[D]))[0].n,1);
  await actor(FOREIGN);assert.equal((await query('select * from direct_messages')).length,0);
 });
 await t.test('sender abuse limit allows idempotent retries, and anon cannot access wrappers or table',async()=>{
  await actor(OWNER);for(let i=0;i<29;i++)await send(BOB,'Rate '+i,id(500+i));
  await assert.rejects(send(BOB,'Too many',id(600)),/MESSAGE_RATE_LIMIT/);
  assert.ok(await send(BOB,'Rate 0',id(500)));
  await root();await db.exec('set role anon');await assert.rejects(query('select * from direct_messages'),/permission denied/);await assert.rejects(query('select public.messages_inbox($1)',[C]),/permission denied/);
  await actor(null);await assert.rejects(query('select public.messages_inbox($1)',[C]),/MESSAGE_ACCESS_DENIED/);
 });
 }finally{await db.close()}
});
