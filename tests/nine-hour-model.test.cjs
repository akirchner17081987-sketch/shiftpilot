const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const S=require('../assets/solid-planning-core-v1.js'),M=require('../assets/month-optimizer-core-v1.js'),{PGlite}=require('@electric-sql/pglite');
const rules={enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',monthlyMaxHours:200,otOnlyMonthlyMaxHours:200,otWeekdayRoster:{employeeIds:['a','b','c'],weekdays:[1,2,3,4,5],allowDaysOff:true,minimumDailyStaff:2}};
const types=S.otCodes.map(id=>({id,start:{OT1:'06:00',OT2:'08:00',OT3:'10:00'}[id],end:{OT1:'15:00',OT2:'17:00',OT3:'19:00'}[id]}));
const person=id=>({id,employment:'Vollzeit',monthlyHours:180,weeklyHours:45,shifts:S.otCodes,monthLimit:200,calendarLimit:200,maxMonthlyShifts:Infinity});
test('9h OT cap permits 22 duties, reserves only one day off in a 23-weekday month, and reports model duration',()=>{
 const people=['a','b','c'].map(person),dates=Array.from({length:31},(_,n)=>S.plus('2028-03-01',n)).filter(d=>d.startsWith('2028-03')&&S.weekday(d)<=5);
 assert.equal(dates.length,23);assert.equal(S.limits(people[0],types,rules).maxMonthlyShifts,22);
 const choices=new Map(people.map(e=>[e.id,new Map(dates.map(date=>[date,[{employeeId:e.id,date,type:'OT2',start:'08:00',end:'17:00'}]]))]));
 const off=S.rosterDaysOff(people,choices,dates,[],rules);for(const e of people)assert.equal(off.get(e.id)?.size,1);
 assert.match(S.summary(rules,types),/9 h je Dienst/);assert.doesNotMatch(S.summary(rules,types),/10 h je Dienst/);
 const old=types.map(t=>({...t,end:{OT1:'16:00',OT2:'18:00',OT3:'20:00'}[t.id]}));assert.equal(S.limits(people[0],old,rules).maxMonthlyShifts,20);assert.match(S.summary(rules,old),/10 h je Dienst/);
});
test('9h leadership target retains an exact 162h individual contract',()=>{
 const employee={...person('lead'),role:'Teamleiter',target:162,monthlyHours:162,shifts:['TL-LE']};
 const p=M.prepare({month:'2027-01',employees:[employee],base:[],capacities:[],groups:[{id:'g',employee,options:[[{employeeId:'lead',date:'2027-01-04',type:'TL-LE',start:'20:00',end:'05:00',resource:'x'}]]}],solidRules:{...rules,teamLeaderMinimumMonthlyHours:170}});
 assert.equal(M.checkpointPrimitives.teamLeaderTarget(employee,p),162);
});
test('recommended 9h operating windows cover every minute of a normal day and preserve both conditional windows',()=>{
 const rows=[{type:'O1',start:'17:00',end:'02:00'},{type:'O2',start:'20:00',end:'05:00'},{type:'O3',start:'23:00',end:'08:00'},{type:'OT',start:'08:00',end:'17:00'}];
 const parse=t=>+t.slice(0,2)*60 + +t.slice(3);for(let minute=0;minute<1440;minute++)assert.ok(rows.some(t=>{const a=parse(t.start),b=parse(t.end);return a<b?minute>=a&&minute<b:minute>=a||minute<b}));
 const p={...rules,conditionalStaffing:[{shift:'OT1',sourceShift:'O3',sourceDayOffset:-1,coverageStart:'06:00',coverageEnd:'08:00',minimum:3,fallbackCount:1},{shift:'OT3',sourceShift:'O1',sourceDayOffset:0,coverageStart:'17:00',coverageEnd:'19:00',minimum:3,fallbackCount:1}]};
 const crew=Array.from({length:3},(_,i)=>({employeeId:String(i),date:'2027-01-03',type:'O3',start:'23:00',end:'08:00'}));assert.equal(S.required('2027-01-04','OT1',crew,p),0);
 assert.equal(S.required('2027-01-04','OT3',crew.map(a=>({...a,date:'2027-01-04',type:'O1',start:'17:00',end:'02:00'})),p),0);
});
test('Postgres accepts 198h of 9h OT, rejects 207h, and retains the 10h limit and month carryover',async()=>{
 const db=new PGlite();try{
  await db.exec('create schema private;create role anon;create role authenticated;create role service_role;');
  await db.exec(fs.readFileSync('supabase/migrations/20261019234827_shift_duration_ot_month_limit.sql','utf8'));
  const duties=(n,h)=>Array.from({length:n},(_,i)=>{const date='2027-01-'+String(i+1).padStart(2,'0');return{starts_at:date+'T07:00:00Z',ends_at:date+'T'+String(7+h).padStart(2,'0')+':00:00Z'}});
  const check=async rows=>(await db.query("select private.sf_ot_only_month_error($1,'2027-01-01','Europe/Berlin',200,false) error",[rows])).rows[0].error;
  assert.equal(await check(duties(22,9)),null);assert.match(await check(duties(23,9)),/22|200 Stunden/);
  assert.equal(await check(duties(20,10)),null);assert.match(await check(duties(21,10)),/20|200 Stunden/);
  assert.match(await check([{starts_at:'2026-12-31T07:00:00Z',ends_at:'2027-01-01T16:00:00Z'},...duties(22,9)]),/Monatsübertrag/);
 }finally{await db.close()}
});

function priorityFixture(target=36){
 const dates=Array.from({length:31},(_,n)=>S.plus('2027-01-01',n)),priority={id:'priority',_dbId:'priority-db',personnelNo:'115',employment:'Vollzeit',weeklyHours:55,monthlyHours:target,target,monthLimit:200,calendarLimit:200,maxMonthlyShifts:Infinity,maxConsecutive:4,shifts:['O3']},other={...priority,id:'other',_dbId:'other-db',personnelNo:'other',target:180};
 const policy={enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',monthlyHoursOnly:true,maxCalendarWeekHours:55,maxConsecutiveShifts:4,maxConsecutiveNightShifts:4,minFreeCalendarDays:2,minNightRecoveryCalendarDays:2,minBlockRestHours:48,threeNightBlockRecoveryFullCalendarDays:1,priorityMonthlyEmployees:[{employeeId:'priority-db',personnelNo:'115',code:'O3',preferredWeekdays:[1,2,3,4]}]};
 const groups=[priority,other].flatMap(employee=>dates.map(date=>({id:employee.id+'|'+date,employee,options:Array.from({length:4},(_,n)=>dates.filter(d=>d>=date&&d<=S.plus(date,n)).map(date=>({employeeId:employee.id,date,type:'O3',start:'22:00',end:'07:00',resource:date+'|O3'})))})));
 return{month:'2027-01',employees:[priority,other],base:[],groups,capacities:dates.map(date=>[date+'|O3',1]),criticalCapacities:[],solidRules:policy,respectHours:true};
}
test('115 priority reaches personal SOLL first, prefers Monday-Thursday, and survives balancing and serialized checkpoints',async()=>{
 const input=priorityFixture(),found=await M.optimize(input,{iterations:2}),own=found.preview.filter(a=>a.employeeId==='priority');assert.equal(own.length,4);assert.ok(own.every(a=>[1,2,3,4].includes(S.weekday(a.date))));assert.equal(found.quality.priorityDeficit,0);assert.deepEqual(S.errors(input.employees[0],found.preview,input.solidRules),[]);
 const B=require('../assets/background-auto-plan-core-v1.js'),wire=B.pack(input),payload={version:1,months:['2027-01'],minimumInput:{...wire,groups:[],criticalOnly:true},monthInputs:[wire],metadata:{}};let cp=B.start(payload),rounds=0;while(cp.stage!=='done'){const runner=B.context(payload,cp);for(let n=0;n<60;n++)if(!runner.step())break;cp=JSON.parse(JSON.stringify(cp));assert.ok(++rounds<500)}const result=B.result(payload,cp),saved=result.preview.filter(a=>a.employeeId==='priority');assert.equal(saved.length,4);assert.ok(saved.every(a=>[1,2,3,4].includes(S.weekday(a.date))));
});
test('115 monthly priority fills additional allowed days toward 180h and preserves night recovery',()=>{
 const input=priorityFixture(180),p=M.prepare(input),C=M.checkpointPrimitives,records=C.monthlyPrioritySeed(p,[],(s,r)=>M.feasible(p,s,r.group,r.option)),own=records.flatMap(r=>r.option);assert.equal(own.length,20,'January priority reaches 180h when feasible');assert.ok(own.some(a=>S.weekday(a.date)>4),'Monday-Thursday is a preference, not a hard ban on other days');assert.deepEqual(S.errors(input.employees[0],own,input.solidRules),[]);assert.equal(own.reduce((n,a)=>n+a.hours,0),180);
});

test('9h policy migration enforces three full OT duties and one leader every day while preserving other companies',async()=>{
 const db=new PGlite(),company='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',employee='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';try{
 await db.exec(`create schema private;create table companies(id uuid primary key,name text,timezone text);create table company_compliance_policy(company_id uuid primary key,solid_planning_rules jsonb,updated_at timestamptz);
 create table employees(id uuid primary key,company_id uuid,personnel_no text,status text,deleted_at timestamptz,shift_permissions text[]);
 create table shift_templates(id uuid default gen_random_uuid(),company_id uuid,code text,active boolean,planning_mode text,optional_weekdays int[],coverage_group text,coverage_required int,default_start time,default_end time,updated_at timestamptz);
 create table global_staffing_requirements(company_id uuid,shift_code text,required_count int,updated_at timestamptz,unique(company_id,shift_code));create table daily_staffing_overrides(company_id uuid,work_date date,shift_code text,required_count int);
 create table shift_assignments(company_id uuid,employee_id uuid,status text,shift_code text,starts_at timestamptz,ends_at timestamptz);
 create function private.sf_ot_day_holiday(uuid,date) returns boolean language sql as $$select $2='2027-01-01'::date$$;`);
 const baseline={enabled:true,otDailyMinimumStaffing:2,criticalShifts:[{code:'OT',minimum:3,weekdays:[6,7]}],preserved:7};await db.query('insert into companies values($1,\'Secontec Services - 9h\',\'Europe/Berlin\'),($2,\'Secontec Services\',\'Europe/Berlin\')',[company,other]);await db.query('insert into company_compliance_policy values($1,$3,now()),($2,$3,now())',[company,other,baseline]);await db.query("insert into employees values($1,$2,'115','active',null,array['O3'])",[employee,company]);
 for(const code of ['OT','TL'])await db.query("insert into shift_templates(company_id,code,active,planning_mode,optional_weekdays,default_start,default_end) values($1,$2,true,'required',array[6,7],$3,$4)",[company,code,code==='OT'?'07:00':'21:00',code==='OT'?'16:00':'06:00']);
 const migration=fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_nine_hour_daily_ot_leadership_priority.sql')),'utf8');await db.exec(migration);await db.exec(migration);
 const updated=(await db.query('select solid_planning_rules p from company_compliance_policy where company_id=$1',[company])).rows[0].p;assert.equal(updated.otDailyMinimumStaffing,3);assert.equal(updated.preserved,7);assert.equal(updated.priorityMonthlyEmployees.length,1);assert.equal(updated.priorityMonthlyEmployees[0].employeeId,employee);assert.deepEqual(updated.criticalShifts,[{code:'OT',minimum:3,weekdays:[1,2,3,4,5,6,7]},{code:'TL',minimum:1,weekdays:[1,2,3,4,5,6,7]}]);assert.deepEqual((await db.query('select solid_planning_rules p from company_compliance_policy where company_id=$1',[other])).rows[0].p,baseline);
 await db.query("insert into daily_staffing_overrides values($1,'2027-01-04','OT',0)",[company]);assert.equal((await db.query("select private.sf_solid_conditional_required($1,'2027-01-04','OT') n",[company])).rows[0].n,3);assert.equal((await db.query("select private.sf_ot_weekend_minimum($1,'2027-01-04') n",[company])).rows[0].n,3);
 await db.query("insert into shift_assignments select $1,e,'DRAFT','OT',(d::date+time '07:00') at time zone 'Europe/Berlin',(d::date+time '16:00') at time zone 'Europe/Berlin' from generate_series('2027-01-01'::date,'2027-01-31'::date,interval '1 day') d cross join unnest(array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc']::uuid[]) e",[company]);
 const validate=()=>db.query("select private.sf_assert_solid_critical_coverage($1,'2027-01-01')",[company]);await assert.rejects(validate(),/TL/);
 await db.query("insert into shift_assignments select $1,'dddddddd-dddd-4ddd-8ddd-dddddddddddd','DRAFT','TL',(d::date+time '21:00') at time zone 'Europe/Berlin',((d::date+1)+time '06:00') at time zone 'Europe/Berlin' from generate_series('2027-01-01'::date,'2027-01-31'::date,interval '1 day') d",[company]);await validate();
 await db.query("update shift_assignments set starts_at=starts_at+interval '1 minute' where shift_code='OT' and employee_id=$1 and (starts_at at time zone 'Europe/Berlin')::date='2027-01-04'",[employee]);await assert.rejects(validate(),/OT-Pflichtbesetzung/);
 }finally{await db.close()}
});
