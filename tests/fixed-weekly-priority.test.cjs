const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const S=require('../assets/solid-planning-core-v1.js'),{PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync('supabase/migrations/20261014071747_employee_fixed_monday_thursday_o3.sql','utf8');
const company='00000000-0000-0000-0000-000000000001',employee='00000000-0000-0000-0000-000000000002';
const fixed={employeeIds:[employee],weekdays:[1,2,3,4],code:'O3',monthlyMaxHours:190,maxMonthlyShifts:19};
const policy={enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',fixedWeeklyRoster:fixed,maxConsecutiveNightShifts:4,minNightRecoveryCalendarDays:2,maxCalendarWeekHours:55};
test('fixed weekly priority overrides a stale generic cycle, team and OT exemption across holidays and years',()=>{
 const context={window:{SFSolidPlanningCore:S,SFCompliance:{policy:{solidPlanningRules:policy}}}};vm.runInNewContext(fs.readFileSync('assets/employee-rhythm-v1.js','utf8'),context);
 const e={id:'local',_dbId:employee,rhythmMode:'off',rhythmStart:'2026-10-07',rhythmPattern:'ALLE,FREI',planningTeam:'A',rhythmExemptOt:true};
 for(let date='2026-10-01';date<='2027-12-31';date=S.plus(date,1)){
  const work=S.weekday(date)<=4;
  assert.equal(context.window.SFRhythm.check(e,'O3',date).allowed,work,date);
  for(const code of ['O1','O2','SD','OT1','OT2','OT3'])assert.equal(context.window.SFRhythm.check(e,code,date).allowed,false,date+code);
 }
 const limits=S.limits({...e,employment:'Vollzeit',monthlyHours:180,shifts:['O3']},[{id:'O3',start:'22:00',end:'08:00'}],policy);
 assert.equal(limits.maxMonthlyShifts,19);assert.equal(limits.calendarLimit,190);
 const normal=S.limits({id:'another',employment:'Vollzeit',monthlyHours:180,shifts:['O3']},[{id:'O3',start:'22:00',end:'08:00'}],policy);
 assert.equal(normal.maxMonthlyShifts,18);assert.equal(normal.calendarLimit,190);
});
test('database pins the same weekly priority and rejects wrong days/codes; 19 December duties are allowed only for the bound employee',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA private;
 CREATE TABLE companies(id uuid,name text,timezone text);
 CREATE TABLE employees(id uuid,company_id uuid,personnel_no text,qualifications text[],shift_permissions text[],employment text,weekly_hours numeric,role text,status text,deleted_at timestamptz);
 CREATE TABLE company_compliance_policy(company_id uuid,solid_planning_rules jsonb,monthly_planning_max_hours numeric,monthly_planning_max_shifts int);
 CREATE TABLE company_planning_teams(company_id uuid,team_code text,pattern text[],start_date date,start_offset int);
 CREATE TABLE shift_templates(id uuid,company_id uuid,active boolean,code text,default_start time,default_end time,exclusive_employees boolean,allowed_personnel_nos text[],sort_order int,requires_planning_team boolean,rhythm_alias text,strict_weekdays boolean,optional_weekdays int[],strict_times boolean);
 CREATE TABLE shift_assignments(id uuid,company_id uuid,employee_id uuid,status text,starts_at timestamptz,ends_at timestamptz);
 CREATE TABLE open_shift_market_claims(assignment_id uuid,employee_id uuid,company_id uuid,status text);
 CREATE FUNCTION private.sf_month_meta(q text[],k text) RETURNS text LANGUAGE sql AS $$ SELECT split_part(v,'=',2) FROM unnest(q) v WHERE v LIKE '__sp:'||k||'=%' LIMIT 1 $$;
 CREATE FUNCTION private.sf_ot_day_holiday(uuid,date) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
 CREATE FUNCTION private.sf_ot_day(uuid,date,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;`);
 await db.query("INSERT INTO companies VALUES ($1,'Secontec Services','Europe/Berlin')",[company]);
 await db.query("INSERT INTO employees VALUES ($1,$2,'115',ARRAY['__sp:monthlyHours=180'],ARRAY['O3'],'Vollzeit',40,'Sicherheitsmitarbeiter','active',NULL)",[employee,company]);
 await db.query("INSERT INTO company_compliance_policy VALUES ($1,$2,190,18)",[company,JSON.stringify({...policy,fixedWeeklyRoster:undefined})]);
 const monthly=fs.readFileSync('supabase/migrations/20261012021422_company_planning_rule_settings.sql','utf8');
 await db.exec(monthly.slice(monthly.indexOf('CREATE OR REPLACE FUNCTION private.sf_confirmed_month_error'),monthly.indexOf('CREATE OR REPLACE FUNCTION private.sf_assert_month_planning_limits')));
 await db.exec(migration);
 // Stale metadata must not be able to replace the authoritative company exception.
 await db.query("UPDATE employees SET qualifications=ARRAY['__sp:rhythmMode=off','__sp:rhythmExemptOt=true','__sp:monthlyHours=180']");
 for(const [date,expected] of [['2026-12-24','O3'],['2026-12-25','FREI'],['2027-01-04','O3']]){
  const r=await db.query("SELECT private.sf_month_rhythm(e,$2::date) AS rhythm FROM employees e WHERE id=$1",[employee,date]);
  assert.equal(r.rows[0].rhythm.expected,expected);assert.equal(r.rows[0].rhythm.exemptOt,false);
 }
 await db.query("INSERT INTO shift_templates(id,company_id,active,code,default_start,default_end) VALUES (gen_random_uuid(),$1,true,'O3','22:00','08:00')",[company]);
 const scope=async(code,date)=>(await db.query("SELECT private.sf_shift_scope_error($1,$2,$3,($4::date+time '22:00') AT TIME ZONE 'Europe/Berlin',($4::date+1+time '08:00') AT TIME ZONE 'Europe/Berlin') AS error",[company,employee,code,date])).rows[0].error;
 assert.equal(await scope('O3','2026-12-24'),null);
 assert.match(await scope('SD','2026-12-24'),/ausschließlich O3/);
 assert.match(await scope('OT1','2026-12-25'),/frei/);
 await db.query("INSERT INTO shift_assignments SELECT gen_random_uuid(),$1,$2,'DRAFT',(d::date+time '22:00') AT TIME ZONE 'Europe/Berlin',(d::date+1+time '08:00') AT TIME ZONE 'Europe/Berlin' FROM generate_series('2026-12-01'::date,'2026-12-31'::date,interval '1 day') d WHERE extract(isodow FROM d)<=4",[company,employee]);
 await db.query("SELECT private.sf_assert_month_planning_limits($1,$2,'2026-12-01')",[company,employee]);
 await db.query("UPDATE company_compliance_policy SET solid_planning_rules=solid_planning_rules-'fixedWeeklyRoster'");
 await assert.rejects(db.query("SELECT private.sf_assert_month_planning_limits($1,$2,'2026-12-01')",[company,employee]),/Maximal 18/);
 }finally{await db.close()}
});
