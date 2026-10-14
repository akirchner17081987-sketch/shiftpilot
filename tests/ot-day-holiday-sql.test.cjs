const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const OT=require('../assets/ot-weekend-holiday-policy.js');
const migration=fs.readFileSync('supabase/migrations/20261014054528_ot_day_holiday_staffing.sql','utf8');
test('national, SN and NRW holiday calendars match SQL; holiday OT crew and market targets are zero and normal crew guards remain active',async()=>{
 const db=new PGlite();try{
 await db.exec(`create schema private;create role anon;create role authenticated;create role service_role;
 create table public.companies(id uuid,timezone text);
 create table public.company_compliance_policy(company_id uuid,solid_planning_rules jsonb);
 create table public.employees(id uuid,company_id uuid,personnel_no text,qualifications text[]);
 create table public.shift_templates(id uuid,company_id uuid,active boolean,coverage_group text,coverage_required int,code text,default_start time,default_end time,strict_weekdays boolean default false,optional_weekdays int[],planning_mode text,allowed_personnel_nos text[],exclusive_employees boolean default false,sort_order int,requires_planning_team boolean default false,strict_times boolean default false);
 create table public.global_staffing_requirements(company_id uuid,shift_code text,required_count int);
 create table public.daily_staffing_overrides(company_id uuid,work_date date,shift_code text,required_count int);
 create table public.shift_assignments(company_id uuid,employee_id uuid,status text,shift_code text,starts_at timestamptz,ends_at timestamptz);
 create function private.sf_ot_day(uuid,date,uuid default null) returns boolean language sql as $$select true$$;`);
 const old=fs.readFileSync('supabase/migrations/20260906164859_version_time_tracking_and_accounts.sql','utf8'),begin=old.indexOf('create or replace function private.sf_easter_sunday('),end=old.indexOf('$$;',begin)+3;
 assert.ok(begin>0&&end>begin);await db.exec(old.slice(begin,end));await db.exec(fs.readFileSync('supabase/migrations/20260911054512_fix_saxony_holidays.sql','utf8'));await db.exec(migration);
 const company='11111111-1111-1111-1111-111111111111',crew=['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','cccccccc-cccc-cccc-cccc-cccccccccccc'];
 const rules={enabled:true,otDayHolidayExclusion:true,otDayHolidayStates:['DE','SN','NW'],otWeekdayRoster:{employeeIds:crew,weekdays:[1,2,3,4,5]},conditionalStaffing:[{shift:'OT1',sourceShift:'O3',sourceDayOffset:-1,coverageStart:'06:00',coverageEnd:'08:00',minimum:3,fallbackCount:1},{shift:'OT3',sourceShift:'O1',sourceDayOffset:0,coverageStart:'18:00',coverageEnd:'20:00',minimum:3,fallbackCount:1}],criticalShifts:[{code:'OT2',minimum:1,weekdays:[1,2,3,4,5]}]};
 await db.query('insert into companies values($1,$2)',[company,'Europe/Berlin']);await db.query('insert into company_compliance_policy values($1,$2)',[company,rules]);
 for(const state of ['DE','SN','NW'])for(let year=2026;year<=2032;year++){const rows=(await db.query('select holiday_date::text d from private.sf_public_holidays($1,$2)',[year,state])).rows;assert.deepEqual(rows.map(r=>r.d).sort(),[...OT.holidays(year,state)].sort(),year+' '+state);}
 for(const date of ['2027-01-01','2027-05-27','2027-11-01','2027-11-17'])for(const code of ['OT1','OT2','OT3'])assert.equal((await db.query('select private.sf_solid_conditional_required($1,$2,$3) n',[company,date,code])).rows[0].n,0);
 assert.equal((await db.query("select private.sf_solid_conditional_required($1,'2027-01-04','OT2') n",[company])).rows[0].n,1);
 await db.query(`insert into shift_templates(id,company_id,active,code,default_start,default_end,optional_weekdays,planning_mode) select gen_random_uuid(),$1,true,code,'08:00','18:00',array[1,2,3,4,5],'required' from unnest(array['OT1','OT2','OT3','OT']) code`,[company]);
 await db.query("insert into daily_staffing_overrides values($1,'2027-01-01','OT2',5)",[company]);
 assert.equal((await db.query("select private.sf_open_market_slot($1,'2027-01-01','OT2') result",[company])).rows[0].result.target,0);
 await db.query('insert into employees values($1,$2,$3,$4)',[crew[0],company,'test',[]]);
 const error=(await db.query("select private.sf_shift_scope_error($1,$2,'OT2','2027-01-01 07:00Z','2027-01-01 17:00Z') error",[company,crew[0]])).rows[0].error;assert.match(error,/Feiertagen/);
 await db.query(`insert into shift_assignments select $1,e.id,'DRAFT',e.code,(day::date+'08:00'::time) at time zone 'Europe/Berlin',(day::date+'18:00'::time) at time zone 'Europe/Berlin' from generate_series('2027-01-01'::date,'2027-01-31'::date,'1 day') day cross join unnest($2::uuid[],array['OT1','OT2','OT3']) e(id,code) where extract(isodow from day)<=5 and not private.sf_ot_day_holiday($1,day::date)`,[company,crew]);
 await db.query("select private.sf_assert_solid_critical_coverage($1,'2027-01-01')",[company]);
 await db.query("delete from shift_assignments where employee_id=$1 and (starts_at at time zone 'Europe/Berlin')::date='2027-01-07'",[crew[1]]);await assert.rejects(db.query("select private.sf_assert_solid_critical_coverage($1,'2027-01-01')",[company]),/unvollständig/);
 const privilege=(await db.query("select has_function_privilege('anon','private.sf_ot_day_holiday(uuid,date)','EXECUTE') allowed,prosecdef from pg_proc where oid='private.sf_ot_day_holiday(uuid,date)'::regprocedure")).rows[0];assert.equal(privilege.allowed,false);assert.equal(privilege.prosecdef,false);
 }finally{await db.close()}
});
