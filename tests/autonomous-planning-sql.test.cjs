const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const {cid,other,uid,eid,bootstrap,files}=require('./fixtures/autonomous-db.cjs');
test('partial repair references remain company/fingerprint scoped and never gain direct API privileges',async()=>{
 const db=new PGlite(),company='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222',id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;
   create table private.autonomous_planning_runs(id uuid primary key,company_id uuid,background_job_id uuid,first_month date,month_count int,status text,summary jsonb,created_at timestamptz default now());
   create table private.background_auto_plan_jobs(id uuid primary key,company_id uuid,status text,fingerprint text,result jsonb);
   create function private.sf_autonomy_snapshot_before_continuity(company_ uuid,first_ date,count_ int,run_ uuid,history_ int) returns jsonb language plpgsql as $$begin
    if current_setting('test.company',true) is distinct from company_::text then raise exception 'Planungsrechte fehlen' using errcode='42501';end if;
    return jsonb_build_object('company',company_,'fingerprint','current');end$$;
   create function private.sf_autonomy_best(company_ uuid,first_ date,count_ int,fp_ text) returns uuid language sql as $$
    select r.id from private.autonomous_planning_runs r join private.background_auto_plan_jobs j on j.id=r.background_job_id and j.company_id=r.company_id
    where r.company_id=company_ and r.first_month=first_ and r.month_count=count_ and r.status='READY' and j.status='SUCCEEDED' and (fp_ is null or j.fingerprint=fp_) order by r.created_at desc limit 1$$;`);
  const migration=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_reuse_checked_partial_planning_proposals.sql'));
  await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
  await db.query("select set_config('test.company',$1,false)",[company]);
  const add=async(n,{owner=company,fp='current',open=5,errors=0,status='REVIEW',rows=[]}={})=>{
   await db.query("insert into private.background_auto_plan_jobs values($1,$2,'SUCCEEDED',$3,$4)",[id(n),owner,fp,{preview:[{employeeId:'candidate',date:'2027-01-01'}]}]);
   await db.query("insert into private.autonomous_planning_runs(id,company_id,background_job_id,first_month,month_count,status,summary) values($1,$2,$1,'2027-01-01',1,$3,$4)",[id(n),owner,status,{open,errors,hours:{rows}}]);
  };
  await add(1,{fp:'stale',open:0,status:'READY'});await add(2,{open:35});await add(3,{open:5});await add(4,{owner:foreign,open:1});await add(5,{open:1,errors:1});
  const snapshot=async(owner=company)=>(await db.query("select private.sf_autonomy_snapshot($1,'2027-01-01',1,$2,3) v",[owner,id(99)])).rows[0].v;
  assert.equal((await snapshot()).reference.runId,id(3));
  await assert.rejects(()=>snapshot(foreign),/Planungsrechte/);
  await add(7,{open:2,errors:1,rows:[{missing:9,tolerance:8,approvedDeviation:false}]});assert.equal((await snapshot()).reference.runId,id(7));
  await add(6,{open:0,status:'READY'});assert.equal((await snapshot()).reference.runId,id(6));
  for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,'private.sf_autonomy_snapshot(uuid,date,integer,uuid,integer)','EXECUTE') allowed",[role])).rows[0].allowed,false);
 }finally{await db.close();}
});
test('autonomous controls, authoritative snapshot, worker leases and atomic DRAFT application stay company scoped',async()=>{const db=new PGlite();try{await db.exec(bootstrap);for(const file of files)await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 const rpc=async(action,config=null,run=null,company=cid)=> (await db.query("select public.autonomous_planning_control($1,$2,$3::jsonb,$4,'2027-01-01') v",[company,action,JSON.stringify(config),run])).rows[0].v;
 let state=await rpc('GET');assert.equal(state.config.enabled,false);assert.equal(state.can_edit,true);await assert.rejects(()=>rpc('GET',null,null,other),/Planungsrechte/);
 const cfg={enabled:true,mode:'DRAFT',run_day:20,run_time:'06:00',lead_months:1,month_count:1,on_changes:true,history_months:3,revision:0};state=await rpc('SAVE',cfg);assert.equal(state.config.revision,1);await assert.rejects(()=>rpc('SAVE',cfg),/inzwischen geändert/);
 await db.query("update public.employees set weekly_hours=39 where id=$1",[eid]);let dirty=(await db.query('select dirty_first::text from private.autonomous_planning_settings')).rows[0];assert.ok(String(dirty.dirty_first).startsWith(new Date(Date.now()+32*86400000).toISOString().slice(0,4)));assert.ok(!String(dirty.dirty_first).startsWith('2000'));
 state=await rpc('RUN');let run=state.runs[0];assert.equal(run.status,'QUEUED');assert.equal(run.token,undefined);let stored=(await db.query('select * from private.autonomous_planning_runs where id=$1',[run.id])).rows[0];assert.equal(stored.context.candidates.length,31);assert.deepEqual(stored.context.employees[0].qualifications,['__sp:monthlyHours=180']);assert.equal(stored.context.employees[0].first_name,undefined);
 const claim=async token=>(await db.query('select private.sf_autonomy_claim($1,$2) v',[run.id,token])).rows[0].v;
 await assert.rejects(()=>claim('dddddddd-dddd-4ddd-8ddd-dddddddddddd'),/Workerzugang/);let lease=await claim(stored.token);assert.equal(lease.phase,'PREPARING');assert.equal(await claim(stored.token),null);
 const p={months:['2027-01'],metadata:{company:cid,autonomousRunId:run.id,fingerprint:'snapshot',movable:[]}};
 const finish=async(part,payload,summary,error=null)=>(await db.query('select private.sf_autonomy_finish($1,$2,$3,$4,$5,$6,$7,$8) v',[run.id,stored.token,lease.lease,lease.revision,part,payload,summary,error])).rows[0].v;
 await db.query("update private.autonomous_planning_runs set context=jsonb_set(context,'{employees}',(select jsonb_agg(jsonb_build_object('id','part-'||i)) from generate_series(1,9) i)) where id=$1",[run.id]);
 const chunk={preparation:true,month:'2027-01',offset:8,part:{metadata:{company:cid,fingerprint:'snapshot'}}};assert.equal(await finish(chunk,null,null),true);lease=await claim(stored.token);assert.equal(lease.snapshot.preparation.offset,8);assert.equal(lease.parts.length,0);
 assert.equal(await finish(null,p,null),true);assert.equal(await finish(null,p,null),false);
 stored=(await db.query('select * from private.autonomous_planning_runs where id=$1',[run.id])).rows[0];assert.equal(stored.status,'CALCULATING');
 const result={preview:[{employeeId:'local',date:'2027-01-04',type:'TAG',start:'08:00',end:'16:00'}]};await db.query("update private.background_auto_plan_jobs set status='SUCCEEDED',result=$2 where id=$1",[stored.background_job_id,result]);assert.equal((await db.query('select status from private.autonomous_planning_runs where id=$1',[run.id])).rows[0].status,'ASSESS_QUEUED','worker completion immediately queues its audit');lease=await claim(stored.token);const ok={checked:1,canApply:true,open:0,critical:0,errors:0,spread:0};await finish(null,null,ok);
 assert.equal((await db.query('select count(*) n from private.saved_plans')).rows[0].n,0,'manual test run always remains a preview');assert.equal((await rpc('GET')).runs[0].status,'READY');
 // Re-run the same finalization as an opted-in scheduled run; a hard guard must roll back every saved row.
 await db.query("update private.autonomous_planning_runs set source='MONTHLY',status='ASSESS_QUEUED' where id=$1",[run.id]);lease=await claim(stored.token);await db.query("select set_config('test.reject','yes',false)");await finish(null,null,ok);assert.equal((await db.query('select count(*) n from private.saved_plans')).rows[0].n,0);assert.match((await rpc('GET')).runs[0].error,/Hard guard/);
 await db.query("select set_config('test.reject','no',false)");await db.query("select set_config('test.fingerprint','stale',false)");await db.query("update private.autonomous_planning_runs set status='ASSESS_QUEUED' where id=$1",[run.id]);lease=await claim(stored.token);await finish(null,null,ok);assert.match((await rpc('GET')).runs[0].error,/Datenstand geändert/);assert.equal((await db.query('select count(*) n from private.saved_plans')).rows[0].n,0);
 await db.query("select set_config('test.fingerprint','snapshot',false)");await db.query('update private.autonomous_planning_settings set revision=revision+1');await db.query("update private.autonomous_planning_runs set status='ASSESS_QUEUED' where id=$1",[run.id]);lease=await claim(stored.token);await finish(null,null,ok);assert.equal((await rpc('GET')).runs[0].status,'READY');assert.equal((await db.query('select count(*) n from private.saved_plans')).rows[0].n,0,'a changed configuration prevents automatic application');
 await db.query("update public.company_members set status='INACTIVE' where user_id=$1",[uid]);await db.query("update private.autonomous_planning_runs set status='ASSESS_QUEUED' where id=$1",[run.id]);assert.equal(await claim(stored.token),null);assert.equal((await db.query('select status from private.autonomous_planning_runs where id=$1',[run.id])).rows[0].status,'CANCELLED');await db.query("update public.company_members set status='ACTIVE' where user_id=$1",[uid]);
 await db.query("update private.autonomous_planning_runs set status='ASSESS_QUEUED',settings_revision=(select revision from private.autonomous_planning_settings where company_id=$2) where id=$1",[run.id,cid]);lease=await claim(stored.token);await finish(null,null,ok);assert.equal((await rpc('GET')).runs[0].status,'APPLIED');assert.equal((await db.query('select count(*) n from private.saved_plans')).rows[0].n,1);assert.equal(await finish(null,null,ok),false);
 await assert.rejects(()=>rpc('CANCEL',null,run.id),/nicht gelöscht/);
 for(const table of ['autonomous_planning_settings','autonomous_planning_runs'])assert.equal((await db.query("select has_table_privilege('authenticated',$1,'SELECT') allowed",['private.'+table])).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege('authenticated','public.claim_autonomous_planning(uuid,uuid)','EXECUTE') allowed")).rows[0].allowed,false);
 await db.query("update public.company_members set role='PLANNER' where user_id=$1",[uid]);await assert.rejects(()=>rpc('SAVE',{...cfg,revision:1}),/Inhaber/);await db.query("update public.company_members set status='INACTIVE' where user_id=$1",[uid]);await assert.rejects(()=>rpc('GET'),/Planungsrechte/);
 }finally{await db.close();}});
test('server OT demand matches weekday holidays and invalidates pre-fix proposals only in affected periods',async()=>{
 const db=new PGlite();try{
  await db.exec(bootstrap);
  await db.exec(`create function private.sf_month_optimization_snapshot(company_ uuid,month_ date) returns jsonb language plpgsql as $$begin perform private.sf_background_plan_authorize(company_);return jsonb_build_object('month',month_,'protectedIds','[]'::jsonb);end$$;
   create or replace function private.sf_ot_day(uuid,date,uuid) returns boolean language sql as $$select extract(isodow from $2)>5 or $2='2027-01-01'::date$$;
   create or replace function private.sf_ot_day_holiday(uuid,date) returns boolean language sql as $$select $2='2027-01-01'::date$$;`);
  const migration=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_align_ot_holiday_planning_demand.sql'));await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
  await db.query(`insert into public.shift_templates(id,company_id,code,default_start,default_end,active,sort_order,planning_mode,responsible_only,optional_weekdays) values(gen_random_uuid(),$1,'OT','08:00','18:00',true,2,'required',false,array[6,7])`,[cid]);
  await db.query(`insert into public.global_staffing_requirements values($1,'OT',3)`,[cid]);
  const fingerprint=async month=>(await db.query('select private.sf_preview_planning_period($1,$2,1)->>\'fingerprint\' value',[cid,month])).rows[0].value;
  const janBefore=await fingerprint('2027-01-01'),febBefore=await fingerprint('2027-02-01');
  await db.query(`update public.company_compliance_policy set solid_planning_rules='{"otHolidayStatesBySite":{"Leipzig":"SN"}}' where company_id=$1`,[cid]);
  assert.notEqual(await fingerprint('2027-01-01'),janBefore,'pre-fix proposal cannot pass the period fingerprint');assert.equal(await fingerprint('2027-02-01'),febBefore,'unaffected period retains its fingerprint');
  const snapshot=async company=>(await db.query(`select private.sf_autonomy_snapshot_before_continuity($1,'2027-01-01',1,null,0) value`,[company||cid])).rows[0].value;
  let snap=await snapshot(),need=date=>snap.demand.find(d=>d.type==='OT'&&d.date===date).count;
  assert.equal(need('2027-01-01'),3);assert.equal(need('2027-01-02'),3);assert.equal(need('2027-01-04'),0);assert.equal(snap.fingerprint,await fingerprint('2027-01-01'));
  await db.query(`insert into public.daily_staffing_overrides values($1,'2027-01-01','OT',5)`,[cid]);snap=await snapshot();assert.equal(need('2027-01-01'),5);
  await db.query(`update public.daily_staffing_overrides set required_count=0 where company_id=$1`,[cid]);snap=await snapshot();assert.equal(need('2027-01-01'),0,'explicit holiday override remains authoritative');
  await assert.rejects(()=>snapshot(other),/Planungsrechte/);
 }finally{await db.close();}
});
