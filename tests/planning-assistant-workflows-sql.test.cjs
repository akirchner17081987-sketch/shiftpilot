const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync('supabase/migrations/20261020015805_planning_assistant_reversible_period.sql','utf8'),company='00000000-0000-0000-0000-000000000001',actor='00000000-0000-0000-0000-000000000002',duty='00000000-0000-0000-0000-000000000003';
test('atomic reversal retains tenant, role, fingerprint, protection and coverage guards',async()=>{
 const db=new PGlite();try{
 await db.exec(`create schema private;create schema auth;create table public.employees(id uuid);create table public.shift_templates(id uuid);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
 create table public.company_members(company_id uuid,user_id uuid,role text,status text);create table public.companies(id uuid,timezone text);create table public.shift_assignments(id uuid,company_id uuid,status text,version int,starts_at timestamptz);create table public.audit_events(company_id uuid,event_type text,entity_type text,actor_id uuid,actor_role text,metadata jsonb);
 create function private.sf_preview_planning_period(uuid,date,int) returns jsonb language sql as $$select jsonb_build_object('fingerprint','current','protectedIds',coalesce(nullif(current_setting('test.protected',true),''),'[]')::jsonb)$$;
 create function private.sf_assert_solid_critical_coverage(uuid,date) returns void language plpgsql as $$begin if current_setting('test.block_coverage',true)='yes' then raise exception 'Pflichtleitung fehlt';end if;end$$;
 insert into public.company_members values('${company}','${actor}','PLANNER','ACTIVE');insert into public.companies values('${company}','Europe/Berlin');insert into public.shift_assignments values('${duty}','${company}','DRAFT',1,'2027-01-05T06:00Z');set test.actor='${actor}';`);
 await db.exec(migration);
 // The period function delegates restoration validation to the existing monthly engine.
 await db.exec(`create or replace function private.sf_apply_month_optimization(company_ uuid,month_ date,fingerprint_ text,replace_ uuid[],rows_ jsonb,respect_weekly_ boolean) returns jsonb language sql as $$select jsonb_build_object('created',jsonb_array_length($5))$$;create function private.sf_month_optimization_snapshot(uuid,date) returns jsonb language sql as $$select '{"fingerprint":"month"}'::jsonb$$;`);
 const call=(fp='current',rows=[],id=company)=>db.query('select private.sf_apply_planning_period($1,$2::date,1,$3,$4::uuid[],$5::jsonb,true) as result',[id,'2027-01-01',fp,[duty],JSON.stringify(rows)]);
 await assert.rejects(call('stale'),/geändert/);assert.equal((await db.query('select status from shift_assignments')).rows[0].status,'DRAFT');
 await db.exec(`set test.protected='["${duty}"]'`);await assert.rejects(call(),/geschützt/);await db.exec("set test.protected='[]';set test.block_coverage='yes'");await assert.rejects(call(),/Pflichtleitung/);assert.equal((await db.query('select status from shift_assignments')).rows[0].status,'DRAFT');
 await db.exec("set test.block_coverage='no'");await assert.rejects(call('current',[],actor),/Planungsrechte/);
 await db.exec("update company_members set role='EMPLOYEE'");await assert.rejects(call(),/Planungsrechte/);await db.exec("update company_members set role='PLANNER'");
 const result=await call();assert.equal(result.rows[0].result.replaced,1);assert.equal(result.rows[0].result.created,0);assert.equal((await db.query('select status from shift_assignments')).rows[0].status,'CANCELLED');assert.equal((await db.query('select count(*)::int as n from audit_events')).rows[0].n,1);
 await assert.rejects(db.query('select private.sf_apply_planning_period($1,$2::date,1,$3,array[]::uuid[],$4::jsonb,true)',[company,'2027-01-01','current','[]']),/Ungültige/);
 }finally{await db.close();}
});
