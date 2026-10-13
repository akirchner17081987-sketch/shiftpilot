const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('server OT targets match night coverage and reject an incomplete fixed weekday crew',async()=>{
 const db=new PGlite();try{
 await db.exec(`create schema private;create role anon;create role authenticated;create role service_role;
 create table public.companies(id uuid,timezone text);create table public.company_compliance_policy(company_id uuid,solid_planning_rules jsonb);
 create table public.shift_templates(company_id uuid,active boolean,coverage_group text,coverage_required int,code text,default_start time,default_end time);
 create table public.shift_assignments(company_id uuid,employee_id uuid,status text,shift_code text,starts_at timestamptz,ends_at timestamptz);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261013225728_fixed_ot_weekday_roster.sql','utf8'));
 const company='11111111-1111-1111-1111-111111111111',crew=['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','cccccccc-cccc-cccc-cccc-cccccccccccc'],rules={enabled:true,otWeekdayRoster:{employeeIds:crew,weekdays:[1,2,3,4,5]},conditionalStaffing:[{shift:'OT1',sourceShift:'O3',sourceDayOffset:-1,coverageStart:'06:00',coverageEnd:'08:00',minimum:3,fallbackCount:1},{shift:'OT3',sourceShift:'O1',sourceDayOffset:0,coverageStart:'18:00',coverageEnd:'20:00',minimum:3,fallbackCount:1}]};
 await db.query('insert into companies values($1,$2)',[company,'Europe/Berlin']);await db.query('insert into company_compliance_policy values($1,$2)',[company,rules]);
 const required=async(date,code)=>(await db.query('select private.sf_solid_conditional_required($1,$2,$3) n',[company,date,code])).rows[0].n;
 assert.equal(await required('2027-01-04','OT2'),1);assert.equal(await required('2027-01-02','OT2'),0);assert.equal(await required('2027-01-04','OT'),null);
 await db.query(`insert into shift_assignments select $1,id,'PUBLISHED',code,(d+start_time) at time zone 'Europe/Berlin',(d+end_time+case when code='O3' or code='O1' then interval '1 day' else interval '0 day' end) at time zone 'Europe/Berlin' from generate_series('2026-12-31'::date,'2027-01-31'::date,'1 day') day cross join (values ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid),('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid),('ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)) e(id) cross join (values('O3','22:00'::time,'08:00'::time),('O1','18:00'::time,'04:00'::time)) t(code,start_time,end_time) cross join lateral(select day::date d) dates`,[company]);
 assert.equal(await required('2027-01-04','OT2'),3);assert.equal(await required('2027-01-04','OT1'),0);assert.equal(await required('2027-01-04','OT3'),0);
 await db.query(`insert into shift_assignments select $1,id,'DRAFT','OT2',(day::date+'08:00'::time) at time zone 'Europe/Berlin',(day::date+'18:00'::time) at time zone 'Europe/Berlin' from generate_series('2027-01-01'::date,'2027-01-31'::date,'1 day') day cross join unnest($2::uuid[]) id where extract(isodow from day)<=5`,[company,crew]);
 await db.query("select private.sf_assert_solid_critical_coverage($1,'2027-01-01')",[company]);
 await db.query("delete from shift_assignments where employee_id=$1 and (starts_at at time zone 'Europe/Berlin')::date='2027-01-07'",[crew[1]]);
 await assert.rejects(db.query("select private.sf_assert_solid_critical_coverage($1,'2027-01-01')",[company]),/OT-Tagdienstgruppe.*unvollständig/);
 }finally{await db.close()}
});

test('final monthly apply guard accepts 210 OT hours with a 220 cap but preserves other employee caps',async()=>{
 const sql=fs.readFileSync('supabase/migrations/20261013230708_ot_roster_month_apply_cap.sql','utf8'),begin=sql.indexOf('  -- The confirmed OT-only limit'),end=sql.indexOf('  PERFORM private.sf_assert_month_planning_limits',begin),guard=sql.slice(begin,end);
 assert.ok(begin>0&&end>begin);assert.match(sql,/IF actor_ IS NULL OR role_ IS NULL/);assert.match(sql,/PERFORM private.sf_assert_month_planning_limits/);
 const db=new PGlite();try{await db.exec(`create schema private;create table public.employees(employment text,shift_permissions text[]);create table public.company_compliance_policy(company_id uuid,solid_planning_rules jsonb);
 insert into company_compliance_policy values('11111111-1111-1111-1111-111111111111','{"otOnlyMonthlyMaxHours":220}');
 create function private.test_apply_cap(e_ public.employees,company_ uuid,target_ numeric,limit_ numeric) returns numeric language plpgsql as $f$ begin ${guard} return limit_;end $f$;`);
 const cap=async(employment,shifts,target=220,limit=190)=>(await db.query('select private.test_apply_cap(row($1,$2)::public.employees,$3,$4,$5) n',[employment,shifts,'11111111-1111-1111-1111-111111111111',target,limit])).rows[0].n;
 assert.equal(Number(await cap('Vollzeit',['OT1','OT2','OT3'])),220);assert.equal(Number(await cap('Vollzeit',['OT2','OT'])),190);assert.equal(Number(await cap('Vollzeit',['O1'])),190);assert.equal(Number(await cap('Teilzeit',['OT2'],144,144)),144);
 }finally{await db.close();}
});
