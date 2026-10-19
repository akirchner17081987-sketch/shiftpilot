const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const core=require('../assets/solid-planning-core-v1.js');
const migration=fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_ot_weekend_minimum_staffing.sql')),'utf8');
test('weekend minimum belongs to normal OT and the configured company policy',()=>{
 const p={enabled:true,criticalShifts:[{code:'OT',minimum:3,weekdays:[6,7]},{code:'OT2',minimum:2,weekdays:[1,2,3,4,5]}]};
 assert.equal(core.otWeekendMinimum(p),3);assert.equal(core.otWeekendMinimum({...p,enabled:false}),0);assert.equal(core.otWeekendMinimum({enabled:true}),0);
 assert.equal(core.otWeekendMinimum({...p,criticalShifts:[...p.criticalShifts,{code:'OT',minimum:5,weekdays:[6,7]}]}),5);
 assert.match(core.summary({...p,confirmedRulesVersion:2}),/Samstag und Sonntag: mindestens 3 unterschiedliche Mitarbeiter/);
});
test('SQL weekend minimum overrides low targets, preserves higher demand and rejects incomplete or partial OT coverage',async()=>{
 const db=new PGlite(),primary='11111111-1111-1111-1111-111111111111',other='22222222-2222-2222-2222-222222222222',people=['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','cccccccc-cccc-cccc-cccc-cccccccccccc'];
 try{
 await db.exec(`create schema private;create role anon;create role authenticated;create role service_role;
 create table companies(id uuid primary key,name text,timezone text);
 create table company_compliance_policy(company_id uuid primary key,solid_planning_rules jsonb,updated_at timestamptz);
 create table shift_templates(id uuid,company_id uuid,active boolean,coverage_group text,coverage_required int,code text,default_start time,default_end time,strict_weekdays boolean,optional_weekdays int[],planning_mode text,sort_order int);
 create table global_staffing_requirements(company_id uuid,shift_code text,required_count int,unique(company_id,shift_code));
 create table daily_staffing_overrides(company_id uuid,work_date date,shift_code text,required_count int);
 create table shift_assignments(company_id uuid,employee_id uuid,status text,shift_code text,starts_at timestamptz,ends_at timestamptz);
 create function private.sf_ot_day_holiday(uuid,date) returns boolean language sql as $$select false$$;
 create function private.sf_ot_day(uuid,date) returns boolean language sql as $$select extract(isodow from $2)>5 or $2='2027-01-01'$$;`);
 const baseline={enabled:true,criticalShifts:[],conditionalStaffing:[],otHolidayStatesBySite:{Leipzig:'SN',Recklinghausen:'NW'}};
 for(const [id,name] of [[primary,'Secontec Services'],[other,'Secontec Services - 8h']]){
  await db.query('insert into companies values($1,$2,$3)',[id,name,'Europe/Berlin']);await db.query('insert into company_compliance_policy values($1,$2,now())',[id,baseline]);
  await db.query("insert into shift_templates values(gen_random_uuid(),$1,true,null,0,'OT','08:00','18:00',false,array[6,7],'required',1)",[id]);
  await db.query("insert into global_staffing_requirements values($1,'OT',1)",[id]);
 }
 await db.exec(migration);await db.exec(migration);
 assert.equal((await db.query('select private.sf_ot_weekend_minimum($1,$2) n',[primary,'2027-01-02'])).rows[0].n,3);
 assert.equal((await db.query('select private.sf_ot_weekend_minimum($1,$2) n',[primary,'2027-01-03'])).rows[0].n,3);
 assert.equal((await db.query('select private.sf_ot_weekend_minimum($1,$2) n',[primary,'2027-12-25'])).rows[0].n,3,'weekend public holidays retain the weekend minimum');
 assert.equal((await db.query('select private.sf_ot_weekend_minimum($1,$2) n',[primary,'2027-01-04'])).rows[0].n,0);
 assert.equal((await db.query('select private.sf_ot_weekend_minimum($1,$2) n',[other,'2027-01-02'])).rows[0].n,0);
 assert.deepEqual((await db.query('select solid_planning_rules r from company_compliance_policy where company_id=$1',[other])).rows[0].r,baseline);
 assert.equal((await db.query('select jsonb_array_length(solid_planning_rules->\'criticalShifts\') n from company_compliance_policy where company_id=$1',[primary])).rows[0].n,1,'migration is idempotent');
 await db.query("insert into daily_staffing_overrides values($1,'2027-01-02','OT',0)",[primary]);
 const market=async()=> (await db.query("select private.sf_open_market_slot($1,'2027-01-02','OT') r",[primary])).rows[0].r;
 assert.equal((await market()).target,3);
 assert.equal((await db.query("select private.sf_solid_conditional_required($1,'2027-01-02','OT') n",[primary])).rows[0].n,3);
 await db.query("update daily_staffing_overrides set required_count=5");assert.equal((await market()).target,5);
 assert.equal((await db.query("select private.sf_solid_conditional_required($1,'2027-01-02','OT') n",[primary])).rows[0].n,5);
 await db.query("update daily_staffing_overrides set required_count=0");
 await db.query(`insert into shift_assignments select $1,e,'DRAFT','OT',(d::date+'08:00'::time) at time zone 'Europe/Berlin',(d::date+'18:00'::time) at time zone 'Europe/Berlin' from generate_series('2027-01-01'::date,'2027-01-31'::date,'1 day') d cross join unnest($2::uuid[]) e where extract(isodow from d) in(6,7)`,[primary,people]);
 const validate=()=>db.query("select private.sf_assert_solid_critical_coverage($1,'2027-01-01')",[primary]);
 await validate();assert.equal((await market()).missing,0);
 await db.query("update shift_assignments set status='CANCELLED' where employee_id=$1 and (starts_at at time zone 'Europe/Berlin')::date='2027-01-02'",[people[2]]);
 await assert.rejects(validate(),/OT-Wochenendbesetzung.*2 von mindestens 3/);
 await db.query("insert into shift_assignments select * from shift_assignments where employee_id=$1 and (starts_at at time zone 'Europe/Berlin')::date='2027-01-02'",[people[0]]);
 await assert.rejects(validate(),/2 von mindestens 3/,'duplicate rows never replace a third employee');
 await db.query("update shift_assignments set status='DRAFT',shift_code='OT2' where employee_id=$1 and (starts_at at time zone 'Europe/Berlin')::date='2027-01-02'",[people[2]]);
 await assert.rejects(validate(),/2 von mindestens 3/,'OT2 is separate from normal OT');
 await db.query("update shift_assignments set shift_code='OT',ends_at=ends_at-interval '1 hour' where employee_id=$1 and (starts_at at time zone 'Europe/Berlin')::date='2027-01-02'",[people[2]]);
 await assert.rejects(validate(),/2 von mindestens 3/,'a partial OT duty does not cover the entire required service');
 await db.query("update shift_assignments set ends_at=ends_at+interval '1 hour' where employee_id=$1 and (starts_at at time zone 'Europe/Berlin')::date='2027-01-02'",[people[2]]);await validate();
 const permissions=(await db.query("select has_function_privilege('anon','private.sf_ot_weekend_minimum(uuid,date)','EXECUTE') anon_allowed,prosecdef from pg_proc where oid='private.sf_ot_weekend_minimum(uuid,date)'::regprocedure")).rows[0];assert.equal(permissions.anon_allowed,false);assert.equal(permissions.prosecdef,false);
 }finally{await db.close()}
});
