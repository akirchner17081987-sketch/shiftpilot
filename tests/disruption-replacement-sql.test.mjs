import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
const read=p=>fs.readFileSync(p,'utf8');const migration=()=>read('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_disruption_replacement_workflow.sql')));
function fn(s,name){const start=s.search(new RegExp('create(?: or replace)? function '+name.replaceAll('.','\\.')+'\\(', 'i')),rest=s.slice(start),m=rest.match(/\bas\s+(\$[A-Za-z_]*\$)/i),body=m.index+m[0].length,end=rest.indexOf(m[1],body);assert.ok(start>=0,name);return rest.slice(0,end+m[1].length).replace(/^create function/i,'create or replace function')+';';}
const company='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222',actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',original='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',target='cccccccc-cccc-4ccc-8ccc-cccccccccccc',portal='dddddddd-dddd-4ddd-8ddd-dddddddddddd',portalUser='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
async function setup(){const db=new PGlite();try{await db.exec(read('tests/sql/access-profiles-bootstrap.sql').replace('create extension pgcrypto with schema extensions;',''));await db.exec(read('tests/sql/manual-rhythm-bootstrap.sql'));
 await db.exec(`alter table company_members add access_role text default 'OWNER',add extra_permissions text[] default '{}';alter table company_compliance_policy add works_council_enabled boolean default false;alter table absences add start_time time,add end_time time;alter table shift_assignments add rhythm_override jsonb;alter table shift_change_requests add primary key(id),add reason_code text,add reason_text text,add predictable text,add notice_minutes int,add requested_by uuid,add requested_at timestamptz default now(),add created_at timestamptz default now();alter table shift_change_approvals add id uuid default gen_random_uuid(),add company_id uuid,add required boolean,add decided_by uuid,add decided_at timestamptz,add comment text;
 create table notifications(id uuid default gen_random_uuid(),company_id uuid,user_id uuid,employee_id uuid,kind text,title text,message text,link_view text,entity_type text,entity_id uuid,metadata jsonb,is_read boolean default false,read_at timestamptz,created_at timestamptz default now());
 create function private.sf_require_active_employee_access() returns void language plpgsql as $$begin if not exists(select 1 from public.employees where auth_user_id=auth.uid() and status='active' and access_status='ACTIVE') then raise exception 'Inactive employee';end if;end $$;
 create function private.sf_has_time_only_login() returns boolean language sql as $$select false$$;`);
 await db.exec(fn(read('supabase/migrations/20261003152036_month_optimization_atomic_drafts.sql'),'private.sf_month_meta'));
 await db.exec(fn(read('supabase/migrations/20261014071747_employee_fixed_monday_thursday_o3.sql'),'private.sf_fixed_weekly_roster'));
 await db.exec(read('supabase/migrations/20260831162926_disruption_autopilot_v1.sql'));
 await db.exec(fn(read('tests/sql/manual-rhythm-existing-functions.sql'),'private.sf_shift_scope_error'));
 await db.exec(read('tests/sql/disruption-existing-functions.sql')); 
 // Same permission predicate as publication, without auth profile/MFA unrelated to this workflow.
 await db.exec(`create function private.sf_has_access_permission(c uuid,p text) returns boolean language sql stable as $$select exists(select 1 from public.company_members where company_id=c and user_id=auth.uid() and status='ACTIVE' and (access_role in('OWNER','ADMIN') or not('read_only'=any(extra_permissions)) and p=any(extra_permissions)))$$;
 create trigger published_guard before update on shift_assignments for each row execute function protect_published_assignment();
 create trigger standard_guard before insert or update on shift_assignments for each row execute function enforce_assignment_standard_rules();
 create trigger rhythm_guard before insert or update on shift_assignments for each row execute function private.sf_normalize_manual_rhythm_override();
 create trigger scope_guard before insert or update on shift_assignments for each row execute function enforce_shift_employee_scope();`);
 await db.exec(migration());
 await db.exec(read('supabase/migrations/20261027051422_fix_disruption_list_employee_alias.sql'));
 await db.exec(read('supabase/migrations/20261028184359_disruption_offer_privacy.sql'));
 await db.query('insert into auth.users(id) values($1),($2)',[actor,portalUser]);await db.query("insert into companies(id,name,timezone) values($1,'Own','Europe/Berlin'),($2,'Other','Europe/Berlin')",[company,foreign]);
 await db.query(`insert into company_members(company_id,user_id,role,status) values($1,$2,'OWNER','ACTIVE')`,[company,actor]);await db.query(`insert into company_compliance_policy(company_id,solid_planning_rules,standard_min_rest_hours,standard_max_shift_hours) values($1,'{}',11,10)`,[company]);
 for(const [id,name,user] of [[original,'Original',null],[target,'Offline',null],[portal,'Portal',portalUser]])await db.query(`insert into employees(id,company_id,first_name,last_name,status,role,shift_permissions,auth_user_id,access_status,qualifications) values($1,$2,$3,'Test','active','Mitarbeiter',array['T'],$4,'ACTIVE','{}')`,[id,company,name,user]);
 await db.query(`insert into shift_templates(id,company_id,code,active,default_start,default_end,strict_times) values(gen_random_uuid(),$1,'T',true,'06:00','14:00',false)`,[company]);
 await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[actor]);return db;}catch(e){await db.close();throw e;}}
async function source(db,{start='2027-02-01T05:00Z',end='2027-02-01T13:00Z',...patch}={}){return (await db.query(`insert into shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,break_minutes,note,status,published_at,version) values($1,$2,'T',$3,$4,0,'Original note','PUBLISHED',now(),1) returning *`,[company,original,start,end])).rows[0];}
const commit=(db,id,patch={})=>db.query(`select manager_disruption_replacement($1,$2,$3) result`,[company,id,{action:'COMMIT',version:1,token:crypto.randomUUID(),mode:'WHOLE',employee_id:target,reason:'Ausfall vertreten',consent:'Telefonisch zugesagt',agreed:true,...patch}]).then(r=>r.rows[0].result);
const one=(db,sql,args=[])=>db.query(sql,args).then(r=>r.rows[0]);
test('direct offline replacement, idempotent retry and tenant/read-only/consent/stale protections',async()=>{const db=await setup();try{
 const a=await source(db);await db.exec('set role authenticated');const preview=await one(db,`select manager_disruption_replacement($1,$2,'{"action":"PREVIEW"}') p`,[company,a.id]);assert.equal(preview.p.candidates.find(c=>c.employee_id===target).portal,false);assert.equal(preview.p.candidates.find(c=>c.employee_id===target).block,null);
 await assert.rejects(db.query(`select manager_disruption_replacement($1,$2,'{}')`,[foreign,a.id]),/Keine Planungsberechtigung/);
 await assert.rejects(commit(db,a.id,{agreed:false}),/ausdrücklich bestätigen/);await assert.rejects(commit(db,a.id,{version:0}),/inzwischen geändert/);
 await assert.rejects(db.query('select * from private.disruption_replacements'),/permission denied/);
 const token=crypto.randomUUID(),r=await commit(db,a.id,{token});assert.equal(r.status,'APPLIED');assert.equal((await one(db,'select employee_id from shift_assignments where id=$1',[a.id])).employee_id,target);assert.equal((await commit(db,a.id,{token})).change_id,r.change_id);
 await db.exec('reset role');await db.exec("update company_members set extra_permissions=array['read_only']");await db.exec('set role authenticated');await assert.rejects(commit(db,a.id),/Keine Planungsberechtigung/);
 }finally{await db.close();}});
test('partial handover preserves source ID, employee and actual attendance and atomically creates remaining duty',async()=>{const db=await setup();try{
 const a=await source(db);await db.query(`insert into time_entries(assignment_id,company_id,actual_start,actual_end) values($1,$2,'2027-02-01T05:00Z','2027-02-01T08:00Z')`,[a.id,company]);
 await assert.rejects(commit(db,a.id),/Zeitbuchungen/);await assert.rejects(commit(db,a.id,{mode:'PARTIAL',from_local:'2027-02-01T08:00'}),/gebuchten Ende/);
 const r=await commit(db,a.id,{mode:'PARTIAL',from_local:'2027-02-01T09:00'});assert.equal(r.status,'APPLIED');
 const src=await one(db,'select employee_id,ends_at from shift_assignments where id=$1',[a.id]);assert.equal(src.employee_id,original);assert.equal(src.ends_at.toISOString(),'2027-02-01T08:00:00.000Z');
 const child=await one(db,'select * from shift_assignments where employee_id=$1',[target]);assert.equal(child.starts_at.toISOString(),'2027-02-01T08:00:00.000Z');assert.equal(child.ends_at.toISOString(),'2027-02-01T13:00:00.000Z');assert.equal((await one(db,'select actual_end from time_entries where assignment_id=$1',[a.id])).actual_end.toISOString(),'2027-02-01T08:00:00.000Z');assert.equal((await one(db,'select count(*)::int n from time_entries')).n,1);
 }finally{await db.close();}});
test('running no-show can be recorded and remaining replacement leaves original cancelled and a truthful uncovered interval',async()=>{const db=await setup();try{
 const a=await source(db,{start:new Date(Date.now()-3600000).toISOString(),end:new Date(Date.now()+7200000).toISOString()});const incident=await one(db,`select manager_create_disruption($1,$2,'NO_SHOW','No show') id`,[company,a.id]);assert.ok(incident.id);
 await assert.rejects(commit(db,a.id),/laufenden Diensten/);const r=await commit(db,a.id,{mode:'REMAINING'});assert.equal(r.status,'APPLIED');assert.equal((await one(db,'select status from shift_assignments where id=$1',[a.id])).status,'CANCELLED');const child=await one(db,'select starts_at from shift_assignments where employee_id=$1',[target]);assert.ok(child.starts_at>a.starts_at);
 }finally{await db.close();}});
test('council approval freezes compound spec, rejects unilateral status writes and rolls back both halves on target failure',async()=>{const db=await setup();try{
 await db.exec('update company_compliance_policy set works_council_enabled=true');const a=await source(db);const r=await commit(db,a.id,{mode:'PARTIAL',from_local:'2027-02-01T09:00'});assert.equal(r.status,'PENDING_WORKS_COUNCIL');assert.equal((await one(db,'select ends_at from shift_assignments where id=$1',[a.id])).ends_at.toISOString(),'2027-02-01T13:00:00.000Z');
 await assert.rejects(db.query(`update shift_change_requests set requires_works_council=false where id=$1`,[r.change_id]),/neu geprüft/);await assert.rejects(db.query(`update shift_change_requests set status='APPLIED' where id=$1`,[r.change_id]),/nicht erneut angewendet/);
 await db.query(`update shift_change_approvals set status='APPROVED' where change_request_id=$1 and approval_type='WORKS_COUNCIL'`,[r.change_id]);await db.query(`update shift_change_requests set status='READY_TO_APPLY' where id=$1`,[r.change_id]);
 await assert.rejects(db.query(`update shift_change_requests set status='APPLIED' where id=$1`,[r.change_id]),/ursprüngliche Dienst/);
 // Make only the child fail after the original UPDATE would otherwise succeed.
 await db.exec(`create function private.test_child_fail() returns trigger language plpgsql as $$begin if new.employee_id='${target}' then raise exception 'Child failed';end if;return new;end $$;create trigger zz_child before insert on shift_assignments for each row execute function private.test_child_fail();`);
 await assert.rejects(db.query('select apply_shift_change($1)',[r.change_id]),/Child failed/);assert.equal((await one(db,'select ends_at from shift_assignments where id=$1',[a.id])).ends_at.toISOString(),'2027-02-01T13:00:00.000Z');assert.equal((await one(db,'select status from shift_change_requests where id=$1',[r.change_id])).status,'READY_TO_APPLY');await db.exec('drop trigger zz_child on shift_assignments');
 await db.query('select apply_shift_change($1)',[r.change_id]);assert.equal((await one(db,'select status from disruption_incidents where id=$1',[r.incident_id])).status,'RESOLVED');
 }finally{await db.close();}});
test('automatic offers never retry answered candidates; only explicit retry can reopen one and notification is refreshed',async()=>{const db=await setup();try{
 const a=await source(db),i=await one(db,`select manager_create_disruption($1,$2,'OTHER','') id`,[company,a.id]);assert.equal((await one(db,'select manager_send_disruption_offers($1,$2) n',[i.id,[portal]])).n,1);
 await db.query(`update disruption_offers set status='DECLINED' where incident_id=$1`,[i.id]);assert.equal((await one(db,'select manager_send_disruption_offers($1,$2) n',[i.id,[portal]])).n,0);assert.equal((await one(db,'select status from disruption_offers where incident_id=$1',[i.id])).status,'DECLINED');
 await assert.rejects(db.query('select manager_retry_disruption_offer($1,$2,false)',[i.id,portal]),/ausdrücklich/);assert.equal((await one(db,'select manager_retry_disruption_offer($1,$2,true) n',[i.id,portal])).n,1);assert.equal((await one(db,'select status from disruption_offers where incident_id=$1',[i.id])).status,'OFFERED');assert.equal((await one(db,"select count(*)::int n from notifications where title='Erneute Ersatzanfrage'")).n,2,'existing notification is refreshed, not left read');
 }finally{await db.close();}});
test('pending handover cannot shorten its source in a standalone write; cancellation invalidates its approval request',async()=>{const db=await setup();try{
 await db.exec('update company_compliance_policy set works_council_enabled=true');const a=await source(db),r=await commit(db,a.id,{mode:'PARTIAL',from_local:'2027-02-01T09:00'});await db.query(`update shift_change_requests set status='READY_TO_APPLY' where id=$1`,[r.change_id]);
 await assert.rejects(db.query(`update shift_assignments set ends_at='2027-02-01T08:00Z',version=version+1,last_change_request_id=$2 where id=$1`,[a.id,r.change_id]),/vollständig und gemeinsam/);assert.equal((await one(db,'select version from shift_assignments where id=$1',[a.id])).version,1);
 await db.query(`select manager_cancel_disruption($1,'Nicht mehr erforderlich')`,[r.incident_id]);assert.equal((await one(db,'select status from shift_change_requests where id=$1',[r.change_id])).status,'CANCELLED');await assert.rejects(db.query('select apply_shift_change($1)',[r.change_id]),/READY_TO_APPLY/);
 }finally{await db.close();}});
test('offline rhythm exception needs explicit consent and does not bypass overlap or strict model times',async()=>{const db=await setup();try{
 await db.query(`update employees set qualifications=array['__sp:rhythmMode=required','__sp:rhythmStart=2027-02-01','__sp:rhythmPattern=FREI,ALLE'] where id=$1`,[target]);const a=await source(db);await assert.rejects(commit(db,a.id),/Rhythmus/);const r=await commit(db,a.id,{rhythm_override:true});assert.equal(r.status,'APPLIED');assert.equal((await one(db,'select rhythm_override from shift_assignments where id=$1',[a.id])).rhythm_override.expected,'FREI');
 const b=await source(db,{start:'2027-02-03T05:00Z',end:'2027-02-03T13:00Z'});await db.exec('update shift_templates set strict_times=true');await assert.rejects(commit(db,b.id,{mode:'PARTIAL',from_local:'2027-02-03T09:00',rhythm_override:true}),/festgelegten Schichtzeiten/);
 }finally{await db.close();}});
test('digital acceptance honors required council approval and keeps the plan unchanged until manager completion',async()=>{const db=await setup();try{
 const a=await source(db),i=await one(db,`select manager_create_disruption($1,$2,'OTHER','') id`,[company,a.id]);await db.query('select manager_send_disruption_offers($1,$2)',[i.id,[portal]]);const offer=await one(db,'select id from disruption_offers where incident_id=$1',[i.id]);await db.exec('update company_compliance_policy set works_council_enabled=true');await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[portalUser]);const result=await one(db,`select * from employee_respond_disruption_offer($1,'ACCEPT','Zugesagt')`,[offer.id]);assert.equal(result.status,'ACCEPTED_PENDING');assert.equal((await one(db,'select employee_id from shift_assignments where id=$1',[a.id])).employee_id,original);assert.equal((await one(db,'select status from disruption_incidents where id=$1',[i.id])).status,'OPEN');
 }finally{await db.close();}});

test('LIST resolves the employee join without a record collision and still enforces company permissions',async()=>{const db=await setup();try{
 await db.exec('set role authenticated');
 const empty=await one(db,`select manager_disruption_replacement($1,null,'{"action":"LIST"}') result`,[company]);assert.deepEqual(empty.result,[]);
 await assert.rejects(db.query(`select manager_disruption_replacement($1,null,'{"action":"LIST"}')`,[foreign]),/Keine Planungsberechtigung/);
 await db.exec('reset role');const a=await source(db);await commit(db,a.id);await db.exec('set role authenticated');
 const list=await one(db,`select manager_disruption_replacement($1,null,'{"action":"LIST"}') result`,[company]);assert.equal(list.result.length,1);assert.equal(list.result[0].replacement_employee,'Offline Test');
}finally{await db.close();}});


test('simulated sickness: before/after privacy, unchanged offer, isolated access and successful acceptance',async(t)=>{const db=await setup();try{
 const secret='SIMULATION: Vertrauliche Krankheitsnotiz',a=await source(db);
 const i=await one(db,`select manager_create_disruption($1,$2,'SICKNESS',$3) id`,[company,a.id,secret]);
 await db.query('select manager_send_disruption_offers($1,$2)',[i.id,[portal]]);
 // Reproduce the production implementation before the correction on this isolated database.
 await db.exec(fn(read('supabase/migrations/20260929214843_time_role_employee_boundaries.sql'),'private.employee_list_disruption_offers_impl'));
 await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[portalUser]);await db.exec('set role authenticated');
 const before=(await db.query('select * from employee_list_disruption_offers()')).rows;
 assert.equal(before.length,1);assert.equal(before[0].incident_type,'SICKNESS');assert.equal(before[0].note,secret);
 await db.exec('reset role');await db.exec(read('supabase/migrations/20261028184359_disruption_offer_privacy.sql'));await db.exec('set role authenticated');
 const after=(await db.query('select * from employee_list_disruption_offers()')).rows;
 assert.equal(after.length,1);assert.equal(after[0].incident_type,'OTHER');assert.equal(after[0].note,'');
 for(const key of ['offer_id','offer_status','incident_id','shift_code','starts_at','ends_at','expires_at','employee_comment'])assert.deepEqual(after[0][key],before[0][key],key);
 assert.ok(!JSON.stringify(after).includes(secret));
 // Unrelated active employee has no offer and cannot answer this one.
 await db.exec('reset role');await db.query('update employees set auth_user_id=$1 where id=$2',[actor,target]);
 await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[actor]);await db.exec('set role authenticated');
 assert.deepEqual((await db.query('select * from employee_list_disruption_offers()')).rows,[]);
 await assert.rejects(db.query(`select * from employee_respond_disruption_offer($1,'ACCEPT','Simulation')`,[after[0].offer_id]),/gehört nicht/);
 await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[portalUser]);
 const accepted=await one(db,`select * from employee_respond_disruption_offer($1,'ACCEPT','Simulation zugesagt')`,[after[0].offer_id]);assert.equal(accepted.status,'ACCEPTED');
 await db.exec('reset role');
 assert.equal((await one(db,'select employee_id from shift_assignments where id=$1',[a.id])).employee_id,portal);
 assert.equal((await one(db,'select status from disruption_incidents where id=$1',[i.id])).status,'RESOLVED');
 assert.equal((await one(db,'select incident_type,note from disruption_incidents where id=$1',[i.id])).note,secret,'manager documentation remains intact');
 const notices=(await db.query('select title,message from notifications')).rows;assert.ok(notices.length>0);assert.ok(!JSON.stringify(notices).includes(secret));
 t.diagnostic('Simulation: vorher SICKNESS + vertrauliche Notiz; nachher OTHER + leere Notiz; Angebot unverändert; fremde Person gesperrt; Zusage übernimmt Dienst und löst Störfall.');
 }finally{await db.close();}});
