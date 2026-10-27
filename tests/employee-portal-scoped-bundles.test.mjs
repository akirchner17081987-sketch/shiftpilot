import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=fs.readFileSync(new URL('../database/employee-portal-scoped-bundles.sql',import.meta.url),'utf8');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [company,other,user,employee,colleague,board,otherBoard]=[1,2,3,4,5,6,7].map(id);
test('dual-role portal reads remain personal and reject foreign, blocked and time-only identities',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon; create role authenticated; create schema private; create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function private.sf_has_time_only_login() returns boolean language sql as $$select coalesce(current_setting('test.time_only',true),'')='yes'$$;
 create function private.sf_is_manager(uuid,boolean) returns boolean language sql as $$select true$$;
 create function private.sf_can_manage_time(uuid) returns boolean language sql as $$select true$$;
 create table companies(id uuid,timezone text);
 create table company_members(company_id uuid,user_id uuid,status text,role text);
 create table employees(id uuid,company_id uuid,auth_user_id uuid,first_name text,last_name text,legacy_id text,shift_permissions text[],weekly_hours numeric,status text,access_status text,deleted_at timestamptz);
 create table shift_templates(company_id uuid,code text,name text,default_start time,default_end time,sort_order int,active boolean,site_id uuid);
 create table company_locations(id uuid,company_id uuid,name text);
 create table shift_assignments(id uuid,company_id uuid,employee_id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz,status text,published_at timestamptz);
 create table planning_wishes(id uuid,company_id uuid,employee_id uuid,start_date date,end_date date,starts_at timestamptz,ends_at timestamptz,created_at timestamptz);
 create table planning_wish_events(id uuid,wish_id uuid,action text,from_status text,to_status text,reason text,created_at timestamptz);
 create table shift_handovers(id uuid,company_id uuid,site_id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz,target_id uuid,sent_at timestamptz,received_at timestamptz,revision bigint);
 create table shift_handover_items(id uuid,board_id uuid,critical boolean,due_at timestamptz,created_at timestamptz);
 create table shift_handover_reports(id uuid,board_id uuid,version int);
 create table shift_handover_events(id uuid,board_id uuid,action text,detail jsonb,created_at timestamptz);
 insert into companies values('${company}','Europe/Berlin'),('${other}','Europe/Berlin');
 insert into employees values('${employee}','${company}','${user}','Own','Person','119','{FD}',40,'active','ACTIVE',null),('${colleague}','${company}',null,'Other','Person','120','{FD}',40,'active','ACTIVE',null);
 insert into company_members values('${company}','${user}','ACTIVE','PLANNER');
 insert into shift_templates values('${company}','FD','Früh','06:00','14:00',1,true,null);
 insert into shift_assignments values('${id(10)}','${company}','${employee}','FD','2026-11-02 06:00Z','2026-11-02 14:00Z','PUBLISHED',now()),('${id(11)}','${company}','${colleague}','FD','2026-11-03 06:00Z','2026-11-03 14:00Z','PUBLISHED',now());
 insert into shift_handovers values('${board}','${company}',null,'FD','2026-11-02 06:00Z','2026-11-02 14:00Z',null,null,null,1),('${otherBoard}','${company}',null,'FD','2026-11-03 06:00Z','2026-11-03 14:00Z',null,null,null,1);
 insert into planning_wishes values('${id(12)}','${company}','${employee}','2026-11-04','2026-11-04','2026-11-04 00:00Z','2026-11-05 00:00Z',now()),('${id(13)}','${company}','${colleague}','2026-11-04','2026-11-04','2026-11-04 00:00Z','2026-11-05 00:00Z',now());`);
 await db.exec(fs.readFileSync(new URL('../database/shift-handover-employee-access-v1.sql',import.meta.url),'utf8'));
 await db.exec(sql);await db.exec('grant usage on schema private,auth to authenticated,anon');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');
 const wishes=async(c=company)=>(await db.query('select public.employee_planning_wish_bundle($1,$2) data',[c,'2026-11-01'])).rows[0].data;
 const handover=async(c=company)=>(await db.query('select public.employee_shift_handover_bundle($1,$2,$3) data',[c,'2026-11-01','2026-11-05'])).rows[0].data;
 const w=await wishes();assert.equal(w.manager,false);assert.equal(w.employee_id,employee);assert.deepEqual(w.employees.map(e=>e.id),[employee]);assert.deepEqual(w.wishes.map(e=>e.employee_id),[employee]);assert.deepEqual(w.duties.map(e=>e.employeeId),[employee]);
 const h=await handover();assert.equal(h.manager,false);assert.equal(h.can_report,false);assert.deepEqual(h.boards.map(b=>b.id),[board]);assert.deepEqual(h.employees.map(e=>e.id),[employee]);assert.deepEqual(h.shifts.map(s=>s.assignment_id),[id(10)]);assert.deepEqual(h.boards[0].reports,[]);
 for(const call of [()=>wishes(other),()=>handover(other)])await assert.rejects(call,/Berechtigung|Übergaberechte/);
 await db.exec('reset role');await db.exec("update company_members set status='BLOCKED';set role authenticated");for(const call of [wishes,handover])await assert.rejects(()=>call(),/Berechtigung|Übergaberechte/);
 await db.exec("reset role;update company_members set status='ACTIVE';update employees set access_status='BLOCKED';set role authenticated");for(const call of [wishes,handover])await assert.rejects(()=>call(),/Berechtigung|Übergaberechte/);
 await db.exec("reset role;update employees set access_status='ACTIVE';select set_config('test.time_only','yes',false);set role authenticated");for(const call of [wishes,handover])await assert.rejects(()=>call(),/Zugang|Übergaberechte/);
 await db.exec("reset role;select set_config('test.time_only','',false);select set_config('request.jwt.claim.sub','',false);set role authenticated");for(const call of [wishes,handover])await assert.rejects(()=>call(),/Zugang|Übergaberechte/);
 await db.exec('reset role;set role anon');await assert.rejects(()=>wishes(),/permission denied/);await assert.rejects(()=>handover(),/permission denied/);
 }finally{await db.close()}
});

test('cards arriving in separate observer callbacks before one frame all leave the hidden source',async()=>{
 const {Window}=await import('happy-dom');const w=new Window({url:'https://example.test'}),frames=[],timers=[];
 try{
 w.requestAnimationFrame=fn=>(frames.push(fn),frames.length);w.setTimeout=fn=>(timers.push(fn),timers.length);
 w.SFBackend={ready:true,employeePortalData:{},openEmployeePortal(){}};
 w.document.body.innerHTML='<section id="sfEmployeePortal"><div class="sf-portal-main"><div class="sf-portal-grid"><div style="display:grid"></div></div></div></section>';
 w.eval(fs.readFileSync(new URL('../assets/employee-portal-workspace-v2.js',import.meta.url),'utf8'));timers.shift()();
 const grid=w.document.querySelector('.sf-portal-grid'),source=w.document.querySelector('.sf-portal-layout-source');
 const add=(id,section)=>{const el=w.document.createElement('section');el.id=id;el.className='sf-portal-card';el.dataset.sfPortalSection=section;source.append(el);return el};
 const first=add('first','profile');await new Promise(resolve=>setTimeout(resolve,10));
 const time=add('sfEmployeeTimeCard','time');await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(frames.length,1);frames.shift()();assert.equal(first.parentElement,grid);assert.equal(time.parentElement,grid);
 }finally{await w.happyDOM.abort();w.close()}
});
