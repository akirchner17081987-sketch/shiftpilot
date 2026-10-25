const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'..'),migration=fs.readFileSync(path.join(root,'supabase/migrations/20261013032457_background_plan_start_payload_efficiency.sql'),'utf8'),timingMigration=fs.readFileSync(path.join(root,'supabase/migrations/20261025004711_background_plan_timing.sql'),'utf8');
const cid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',uid='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',eid='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const bootstrap=`create schema private;create schema auth;create role anon;create role authenticated;create role service_role;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.company_members(company_id uuid,user_id uuid,status text,role text);
create table public.employees(id uuid,company_id uuid,legacy_id text,deleted_at timestamptz,status text);
create table public.company_compliance_policy(company_id uuid,solid_planning_rules jsonb);
create table public.planning_wishes(id uuid,company_id uuid,employee_id uuid,comment text,status text);
create table private.background_auto_plan_jobs(id uuid primary key default gen_random_uuid(),company_id uuid,created_by uuid,request_id uuid,first_month date,month_count int,status text default 'QUEUED',payload jsonb,checkpoint jsonb,result jsonb,fingerprint text,progress int default 0,label text default '',detail text default '',invocation_count int default 0,retry_count int default 0,revision int default 0,worker_token uuid default gen_random_uuid(),lease_token uuid,lease_until timestamptz,dispatched_at timestamptz,next_run_at timestamptz default now(),last_error text,created_at timestamptz default now(),updated_at timestamptz default now(),completed_at timestamptz);
alter table private.background_auto_plan_jobs enable row level security;revoke all on private.background_auto_plan_jobs from public,anon,authenticated;
create function private.sf_background_plan_authorize(company_ uuid) returns void language plpgsql security definer set search_path='' as $$begin if auth.uid() is null or not exists(select 1 from public.company_members where company_id=company_ and user_id=auth.uid() and status='ACTIVE' and role in('OWNER','ADMIN','PLANNER','DISPATCHER')) then raise exception 'Für dieses Unternehmen fehlen aktive Planungsrechte.';end if;end$$;
create function private.sf_background_plan_status(job_ private.background_auto_plan_jobs) returns jsonb language sql as $$select jsonb_build_object('id',(job_).id,'status',(job_).status)$$;
create function private.sf_dispatch_background_plans(job_ uuid) returns int language sql as $$select 1$$;
create function private.sf_preview_planning_period(company_ uuid,first_ date,months_ int) returns jsonb language sql as $$select '{"fingerprint":"snapshot"}'::jsonb$$;
create function public.start_background_auto_plan(p_company_id uuid,p_request_id uuid,p_payload jsonb) returns jsonb language sql security invoker as $$select '{}'::jsonb$$;
create function public.preview_planning_period(uuid,date,int) returns jsonb language sql as $$select '{}'::jsonb$$;
create function public.claim_background_auto_plan(uuid,uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
create function public.save_background_auto_plan_step(uuid,uuid,int,jsonb,jsonb,jsonb,text) returns boolean language sql as $$select true$$;
insert into public.company_members values('${cid}','${uid}','ACTIVE','OWNER');
insert into public.employees values('${eid}','${cid}','local-employee',null,'active');
insert into public.company_compliance_policy values('${cid}','{"enabled":true}');
insert into public.planning_wishes values(gen_random_uuid(),'${cid}','${eid}','Sensitive comment must not enter planning payload','PROMISED');
select set_config('request.jwt.claim.sub','${uid}',false);`;
function payload(){const input={solidRules:{enabled:true},employees:[{id:'local-employee'}],groups:[],candidates:[],wishes:[]};return{version:1,months:['2027-01'],minimumInput:input,monthInputs:[input],metadata:{company:cid,fingerprint:'snapshot'}};}
test('start keeps the solver graph immutable, stores server wishes separately and enforces tenant/rule/employee guards',async()=>{
 const db=new PGlite();try{await db.exec(bootstrap);await db.exec(migration);await db.exec(timingMigration);const original=payload(),start=p=>db.query('select private.sf_start_background_auto_plan($1,gen_random_uuid(),$2::jsonb) as job',[cid,JSON.stringify(p)]);const r=await start(original);const id=r.rows[0].job.id;
 const stored=(await db.query('select payload,server_wishes,worker_token from private.background_auto_plan_jobs where id=$1',[id])).rows[0];assert.deepEqual(stored.payload,original);assert.equal(stored.server_wishes[0].comment,undefined);assert.equal(stored.server_wishes[0].employee_id,'local-employee');
 await db.query("update private.background_auto_plan_jobs set dispatched_at=now()-interval '2 seconds' where id=$1",[id]);
 const claimed=(await db.query('select private.sf_claim_background_auto_plan($1,$2) as job',[id,stored.worker_token])).rows[0].job;assert.deepEqual(claimed.server_wishes,stored.server_wishes);assert.deepEqual(claimed.payload,original);assert.ok(Date.parse(claimed.previous_update_at)>0);assert.ok(Date.parse(claimed.dispatched_at)>0);
 await assert.rejects(()=>db.query('select private.sf_claim_background_auto_plan($1,gen_random_uuid())',[id]),/Ungültiger Workerzugang/);
 await db.query("update private.background_auto_plan_jobs set status='CANCELLED' where id=$1",[id]);
 const wrong=payload();wrong.monthInputs[0]={...wrong.monthInputs[0],employees:[{id:'foreign-employee'}]};await assert.rejects(()=>start(wrong),/Mitarbeiter gehört/);
 const changed=payload();changed.monthInputs[0]={...changed.monthInputs[0],solidRules:{enabled:false}};await assert.rejects(()=>start(changed),/Planungsregeln/);
 await db.query("select set_config('request.jwt.claim.sub','',false)");await assert.rejects(()=>start(payload()),/Planungsrechte/);
 const funcs=await db.query("select proname,proconfig from pg_proc where proname in ('start_background_auto_plan','preview_planning_period','claim_background_auto_plan','save_background_auto_plan_step')");assert.equal(funcs.rows.length,4);for(const f of funcs.rows)assert.ok(f.proconfig.includes('statement_timeout=60s'));
 assert.equal((await db.query("select has_table_privilege('authenticated','private.background_auto_plan_jobs','SELECT') as allowed")).rows[0].allowed,false);
 }finally{await db.close()}
});
