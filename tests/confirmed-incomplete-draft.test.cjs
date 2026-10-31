const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync('supabase/migrations/20261031022345_confirmed_incomplete_draft.sql','utf8');
const company='11111111-1111-1111-1111-111111111111',other='22222222-2222-2222-2222-222222222222',actor='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
test('an explicit planner confirmation permits draft shortages without lowering SOLL or waiving other guards',async()=>{
 const db=new PGlite();try{
 await db.exec(`create schema private;create schema auth;create role authenticated;create role anon;grant usage on schema private,auth to authenticated;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
 create function private.sf_assert_aal2(text) returns void language plpgsql as $$begin if current_setting('test.mfa',true)<>'yes' then raise exception '2FA erforderlich';end if;end$$;
 create table company_members(company_id uuid,user_id uuid,status text,role text);
 create table companies(id uuid primary key,timezone text);
 create table company_compliance_policy(company_id uuid primary key,solid_planning_rules jsonb);
 create table shift_templates(company_id uuid,code text,active boolean,coverage_group text,coverage_required int,default_start time,default_end time);
 create table shift_assignments(company_id uuid,employee_id uuid,status text,shift_code text,starts_at timestamptz,ends_at timestamptz);
 create table audit_events(company_id uuid,event_type text,entity_type text,entity_id uuid,actor_id uuid,actor_role text,metadata jsonb);
 create function private.sf_ot_day_holiday(uuid,date) returns boolean language sql as $$select false$$;
 create function private.sf_staffing_exception(uuid,date,text) returns int language sql as $$select null::int$$;
 create function private.sf_solid_conditional_required(uuid,date,text) returns int language sql as $$select 3$$;
 create function private.sf_ot_weekend_minimum(uuid,date) returns int language sql as $$select case when extract(isodow from $2)>5 then 3 else 0 end$$;
 create function private.sf_apply_planning_period(uuid,date,int,text,uuid[],jsonb,boolean) returns jsonb language plpgsql as $$begin
  if $4<>'current' then raise exception 'Veralteter Prüfstand';end if;
  if $6 @> '[{"invalid":true}]' then raise exception 'Ruhezeit verletzt';end if;
  perform private.sf_assert_solid_critical_coverage($1,$2);return '{"created":2}'::jsonb;end$$;
 create function private.sf_apply_month_optimization(uuid,date,text,uuid[],jsonb,boolean) returns jsonb language sql as $$select private.sf_apply_planning_period($1,$2,1,$3,$4,$5,$6)$$;
 create function public.apply_individual_month_optimization(uuid,date,text,uuid[],jsonb,boolean,uuid[]) returns jsonb language sql as $$select private.sf_apply_month_optimization($1,$2,$3,$4,$5,$6)$$;
 set test.mfa='yes';set test.actor='${actor}';`);
 await db.exec(migration);
 await db.query("insert into company_members values($1,$2,'ACTIVE','PLANNER')",[company,actor]);await db.query("insert into companies values($1,'Europe/Berlin')",[company]);
 const policy={enabled:true,exactStaffing:{OT:3},criticalShifts:[{code:'OT',minimum:3,exact:true,weekdays:[6,7]}]};
 await db.query('insert into company_compliance_policy values($1,$2)',[company,policy]);await db.query("insert into shift_templates values($1,'OT',true,null,0,'08:00','18:00')",[company]);
 await db.query(`insert into shift_assignments select $1,md5(i::text)::uuid,'DRAFT','OT',(d::date+'08:00'::time) at time zone 'Europe/Berlin',(d::date+'18:00'::time) at time zone 'Europe/Berlin' from generate_series('2027-01-01'::date,'2027-01-31'::date,'1 day') d cross join generate_series(1,3) i where extract(isodow from d)>5 and (d::date<>'2027-01-02' or i<=2)`,[company]);
 const normal=()=>db.query("select private.sf_apply_planning_period($1,'2027-01-01',1,'current','{}','[]',true)",[company]);
 const apply=(phrase='OFFEN ÜBERNEHMEN',c=company,fp='current',rows='[]')=>db.query("select public.apply_confirmed_incomplete_draft($1,'2027-01-01',1,$2,'{}',$3,$4,1) r",[c,fp,rows,phrase]);
 await assert.rejects(normal(),/unvollständig|fehlen/);await assert.rejects(apply('JA'),/ausdrücklich/);await assert.rejects(apply('OFFEN ÜBERNEHMEN',other),/Planungsrechte/);
 const r=(await apply()).rows[0].r;assert.equal(r.created,2);assert.equal(r.incompleteDraftConfirmed,true);
 assert.deepEqual((await db.query('select solid_planning_rules r from company_compliance_policy')).rows[0].r,policy);
 assert.equal((await db.query('select count(*) n from shift_assignments where status=\'PUBLISHED\'')).rows[0].n,0);
 assert.equal((await db.query('select metadata from audit_events')).rows[0].metadata.acknowledgedOpenPositions,1);
 await assert.rejects(normal(),/unvollständig|fehlen/,'the approval is not retained by a later ordinary request');
 await assert.rejects(apply('OFFEN ÜBERNEHMEN',company,'old'),/Veralteter/);await assert.rejects(apply('OFFEN ÜBERNEHMEN',company,'current','[{"invalid":true}]'),/Ruhezeit/);
 await db.exec("set test.mfa='no'");await assert.rejects(apply(),/2FA/);await db.exec("set test.mfa='yes';update company_members set role='EMPLOYEE'");await assert.rejects(apply(),/Planungsrechte/);await db.exec("update company_members set role='PLANNER'");
 await db.query("insert into shift_assignments select $1,gen_random_uuid(),'DRAFT','OT','2027-01-02 07:00Z','2027-01-02 17:00Z' from generate_series(1,2)",[company]);
 await assert.rejects(apply(),/Mindestens|überschritten/,'overstaffing and exact upper bounds are not waived');
 assert.equal((await db.query('select count(*) n from audit_events')).rows[0].n,1,'failed attempts do not record successful acceptance');
 await db.exec('set role anon');await assert.rejects(apply(),/permission denied/);
 }finally{await db.close();}
});
