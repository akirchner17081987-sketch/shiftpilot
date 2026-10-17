const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite'),solid=require('../assets/solid-planning-core-v1.js');
const migration=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_fulltime_180_target_200_auto_manual_override.sql'));
const sql=fs.readFileSync('supabase/migrations/'+migration,'utf8');
const policy={enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',monthlyHoursOnly:true,monthlyMaxHours:200,plannerMonthlyOverride:true,fullTimeMonthlyTarget:180,otOnlyMonthlyMaxHours:200};
const person={id:'a',status:'active',employment:'Vollzeit',monthlyHours:180,weeklyHours:40,shifts:['FD']};
const templates=[{id:'FD',start:'06:00',end:'14:00'},{id:'O1',start:'18:00',end:'04:00'},{id:'OT2',start:'08:00',end:'18:00'}];
function rows(n,hours=8){return Array.from({length:n},(_,i)=>{const date='2027-01-'+String(i+1).padStart(2,'0');return{employeeId:'a',date,type:'FD',start:'06:00',end:hours===8?'14:00':'16:00',starts_at:date+'T05:00:00Z',ends_at:date+(hours===8?'T13:00:00Z':'T15:00:00Z')};});}
test('new policy uses only hours for all full-time templates, retains lower contracts and legacy companies',()=>{
 for(const shift of ['FD','O1','OT2']){const l=solid.limits({...person,shifts:[shift]},templates,policy);assert.equal(l.monthLimit,200);assert.equal(l.calendarLimit,200);assert.equal(l.maxMonthlyShifts,Infinity);}
 assert.equal(solid.limits({...person,monthlyHours:162},templates,policy).monthLimit,162);
 assert.equal(solid.limits({...person,employment:'Teilzeit',monthlyHours:144},templates,policy).monthLimit,144);
 const fixed={...policy,fixedWeeklyRoster:{employeeIds:['a'],monthlyMaxHours:190,maxMonthlyShifts:19}};assert.equal(solid.limits(person,templates,fixed).monthLimit,200);
 assert.equal(solid.limits(person,templates,{enabled:true,confirmedRulesVersion:2}).monthLimit,184);
 assert.match(solid.summary(policy,templates),/Monats-SOLL 180 h; automatische Obergrenze 200 h/);assert.doesNotMatch(solid.summary(policy,templates),/18 automatische|23 automatische|184 h/);
});
function ui(){const ctx={window:{SFBackend:{role:'PLANNER'},SFSolidPlanningCore:{...solid,errors:()=>[]}},store:{get:()=>{},set:()=>{}},TYPES:templates,assignments:[],absences:[],employees:[person],typeById:id=>templates.find(t=>t.id===id),employeeMonthlyTarget:e=>e.monthlyHours,getSoll:()=>0,assignmentsFor:()=>[]};vm.createContext(ctx);vm.runInContext(fs.readFileSync('assets/compliance-core-v2.js','utf8'),ctx);ctx.window.SFCompliance.policy={solidPlanningRules:policy};return ctx;}
test('automatic checks allow 25 eight-hour or 20 ten-hour duties and reject the next duty and month carryover',()=>{
 const ctx=ui(),C=ctx.window.SFCompliance;
 for(const [n,h] of [[25,8],[20,10]]){assert.equal(C.monthPlanningCheck(person,'2027-01-01',rows(n,h)).length,0);assert.ok(C.monthPlanningCheck(person,'2027-01-01',rows(n+1,h)).length);}
 const carry={employeeId:'a',date:'2026-12-31',type:'O1',start:'22:00',end:'08:00'};assert.ok(C.monthPlanningCheck(person,'2027-01-01',[carry,...rows(25)]).length);
});
test('manual planner receives monthly warning, employee and lower individual limit remain blocked',()=>{
 const ctx=ui(),C=ctx.window.SFCompliance;C.nearestRest=()=>({hours:Infinity});ctx.assignments.push(...rows(25));
 const result=C.check(person,'FD','2027-01-27');assert.equal(result.hard.length,0);assert.ok(result.soft.some(s=>/Individuelle Überschreitung/.test(s)));
 ctx.window.SFBackend.role='EMPLOYEE';assert.ok(C.check(person,'FD','2027-01-27').hard.some(s=>/Monats/.test(s)));
 ctx.window.SFBackend.role='PLANNER';assert.ok(C.check({...person,monthlyHours:162},'FD','2027-01-27').hard.some(s=>/Monats/.test(s)));
});
test('Postgres applies scoped settings and enforces automatic limits while allowing only active company planners to override manually',async()=>{
 const db=new PGlite();const company='11111111-1111-1111-1111-111111111111',other='22222222-2222-2222-2222-222222222222',employee='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',low='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',ot='cccccccc-cccc-cccc-cccc-cccccccccccc',actor='dddddddd-dddd-dddd-dddd-dddddddddddd';
 try{
 await db.exec(`create schema private;create schema auth;create role anon;create role authenticated;create role service_role;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
 create function private.sf_month_meta(q text[],k text) returns text language sql immutable as $$select substr(x,length('__sp:'||k||'=')+1) from unnest(q) x where x like '__sp:'||k||'=%' limit 1$$;
 create table companies(id uuid primary key,name text,timezone text);
 create table company_compliance_policy(company_id uuid primary key,solid_planning_rules jsonb,monthly_planning_max_hours numeric,monthly_planning_max_shifts int,updated_at timestamptz);
 create table employees(id uuid primary key,company_id uuid,employment text,qualifications text[],weekly_hours numeric,shift_permissions text[],role text,personnel_no text);
 create table company_members(company_id uuid,user_id uuid,status text,role text);
 create table shift_templates(company_id uuid,code text,active boolean,default_start time,default_end time);
 create table shift_assignments(id uuid,company_id uuid,employee_id uuid,status text,starts_at timestamptz,ends_at timestamptz,legacy_id text);
 create table open_shift_market_claims(assignment_id uuid,company_id uuid,employee_id uuid,status text);`);
 await db.query('insert into companies values($1,$2,$3),($4,$5,$3)',[company,'Secontec Services','Europe/Berlin',other,'Secontec Services - 8h']);
 const old={enabled:true,confirmedRulesVersion:2,monthlyMaxHours:190,eightHourAutoMaxHours:184,eightHourMaxShifts:23,tenHourMaxShifts:18,otOnlyMonthlyMaxHours:200,fixedWeeklyRoster:{employeeIds:[employee],monthlyMaxHours:190,maxMonthlyShifts:19}};
 await db.query('insert into company_compliance_policy values($1,$2,190,18,now()),($3,$2,190,23,now())',[company,old,other]);
 for(const [id,target,shifts] of [[employee,180,['FD']],[low,162,['FD']],[ot,220,['OT2']]])await db.query("insert into employees values($1,$2,'Vollzeit',$3,40,$4,'Mitarbeiter',($1::uuid)::text)",[id,company,['__sp:monthlyHours='+target],shifts]);
 await db.query("insert into company_members values($1,$2,'ACTIVE','PLANNER')",[company,actor]);
 await db.query("insert into shift_templates values($1,'FD',true,'06:00','14:00'),($1,'OT2',true,'08:00','18:00')",[company]);
 await db.exec(sql);
 let r=await db.query('select monthly_planning_max_hours,monthly_planning_max_shifts,solid_planning_rules from company_compliance_policy where company_id=$1',[company]);assert.equal(Number(r.rows[0].monthly_planning_max_hours),200);assert.equal(r.rows[0].monthly_planning_max_shifts,null);assert.equal(r.rows[0].solid_planning_rules.eightHourMaxShifts,undefined);
 r=await db.query("select id,private.sf_month_meta(qualifications,'monthlyHours') target from employees");const targets=Object.fromEntries(r.rows.map(x=>[x.id,x.target]));assert.equal(targets[employee],'180');assert.equal(targets[ot],'180');assert.equal(targets[low],'162');
 r=await db.query('select monthly_planning_max_hours from company_compliance_policy where company_id=$1',[other]);assert.equal(Number(r.rows[0].monthly_planning_max_hours),190);
 for(const [n,h] of [[25,8],[20,10]]){r=await db.query("select private.sf_confirmed_month_error($1,'2027-01-01','Europe/Berlin',true,180,$2,false,$3) error",[rows(n,h),h===8,policy]);assert.equal(r.rows[0].error,null);r=await db.query("select private.sf_confirmed_month_error($1,'2027-01-01','Europe/Berlin',true,180,$2,false,$3) error",[rows(n+1,h),h===8,policy]);assert.match(r.rows[0].error,/200 Stunden/);}
 const fixed=fs.readFileSync('supabase/migrations/20261014071747_employee_fixed_monday_thursday_o3.sql','utf8');await db.exec(fixed.slice(0,fixed.indexOf('CREATE OR REPLACE FUNCTION private.sf_month_rhythm')));
 await db.exec(fixed.slice(fixed.indexOf('CREATE OR REPLACE FUNCTION private.sf_employee_planning_rules'),fixed.indexOf('-- Personal fixed weekly rules')));
 const otSql=fs.readFileSync('supabase/migrations/20261012013020_ot_monthly_limit_override.sql','utf8');await db.exec(otSql.slice(0,otSql.indexOf('CREATE OR REPLACE FUNCTION private.sf_assert_month_planning_limits')));
 await db.exec('create trigger monthly before insert or update on shift_assignments for each row execute function private.sf_guard_month_planning_limits();create constraint trigger confirmed_month after insert or update on shift_assignments deferrable initially deferred for each row execute function private.sf_guard_confirmed_month_count()');
 await db.query("select set_config('test.actor',$1,false)",[actor]);
 await db.exec("update company_members set role='ADMIN'");
 const expected=(await db.query('select solid_planning_rules from company_compliance_policy where company_id=$1',[company])).rows[0].solid_planning_rules;
 const saved=await db.query("select manager_save_planning_rules($1,$2,$3,'test') data",[company,{teamLeaderMinimumMonthlyHours:170,teamLeaderPreferredNightBlockLength:4,teamLeaderMaxConsecutiveNightShifts:4},expected]);assert.equal(saved.rows[0].data.solid_planning_rules.teamLeaderMinimumMonthlyHours,170);
 await db.exec("update company_members set role='PLANNER'");
 for(const row of rows(26))await db.query("insert into shift_assignments(id,company_id,employee_id,status,starts_at,ends_at) values(gen_random_uuid(),$1,$2,'DRAFT',$3,$4)",[company,employee,row.starts_at,row.ends_at]);
 r=await db.query('select count(*)::int n from shift_assignments');assert.equal(r.rows[0].n,26);
 await assert.rejects(db.query("select private.sf_assert_month_planning_limits($1,$2,'2027-01-01')",[company,employee]),/200 Stunden/);
 await db.query("select set_config('test.actor','',false)");
 await assert.rejects(db.query("insert into shift_assignments(id,company_id,employee_id,status,starts_at,ends_at) values(gen_random_uuid(),$1,$2,'DRAFT','2027-01-27T05:00Z','2027-01-27T13:00Z')",[company,employee]),/200 Stunden/);
 await db.query("select set_config('test.actor',$1,false)",[actor]);
 await db.exec("update company_members set status='INACTIVE'");
 await assert.rejects(db.query("insert into shift_assignments(id,company_id,employee_id,status,starts_at,ends_at) values(gen_random_uuid(),$1,$2,'DRAFT','2027-01-27T05:00Z','2027-01-27T13:00Z')",[company,employee]),/200 Stunden/);
 }finally{await db.close();}
});
