const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{PGlite}=require('@electric-sql/pglite');
const S=require('../assets/solid-planning-core-v1.js'),C=require('../assets/month-optimizer-core-v1.js'),B=require('../assets/background-auto-plan-core-v1.js');
const pattern='ALLE, ALLE, ALLE, ALLE, FREI, FREI, FREI, ALLE, ALLE, ALLE, FREI, FREI';
const policy={enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',maxConsecutiveShifts:4,maxConsecutiveNightShifts:4,minFreeCalendarDays:2,minNightRecoveryCalendarDays:2,minBlockRestHours:48,maxCalendarWeekHours:55,threeNightBlockRecoveryFullCalendarDays:1};
const employee={id:'e',role:'Teamleiter',employment:'Vollzeit',shifts:['TL-LE'],monthlyHours:180,weeklyHours:55,maxWeeklyHours:55,target:180,monthLimit:190,calendarLimit:190,maxMonthlyShifts:18,maxConsecutive:4,rhythmMode:'required',rhythmKind:'cycle',rhythmStart:'2027-01-01',rhythmPattern:pattern};
const dates=Array.from({length:12},(_,i)=>S.plus('2027-01-01',i)),choices=new Map(dates.map(date=>[date,[{employeeId:'e',date,type:'TL-LE',start:'20:00',end:'06:00',resource:date+'|Leitung'}]]));
function fixture(){const groups=dates.flatMap(date=>{const fixed=S.workRestOptions(employee,date,choices,dates);return fixed.options.length?[{id:'e|'+date,employee,block:true,fullWorkRest:true,options:fixed.options}]:[]});const capacities=groups.flatMap(g=>g.options[0].map(a=>[a.resource,1]));return {month:'2027-01',employees:[employee],base:[],groups,capacities,criticalCapacities:capacities,solidRules:policy,respectHours:true};}
test('binding 4/3/3/2 creates whole four- and three-day options, clips month boundaries and accounts for approved absence',()=>{
 const input=fixture();assert.deepEqual(input.groups.map(g=>g.options[0].length),[4,3]);assert.equal(S.workRestOptions(employee,'2027-01-02',choices,dates).options.length,0);
 assert.equal(S.workRestOptions(employee,'2027-01-01',choices,dates,[],date=>date==='2027-01-02').options[0].length,3);
 const missing=new Map(choices);missing.set('2027-01-02',[]);assert.equal(S.workRestOptions(employee,'2027-01-01',missing,dates).options.length,0);
 const next=Array.from({length:4},(_,i)=>S.plus('2027-01-13',i));const clippedChoices=new Map(next.map(date=>[date,[{...choices.get(dates[0])[0],date}]]));assert.equal(S.workRestOptions(employee,'2027-01-14',clippedChoices,next.slice(1)).options[0].length,3);
});
test('short recovery applies only after exactly three nights; four nights need sleep day plus two full days and 48h stays binding',()=>{
 const rows=fixture().groups.flatMap(g=>g.options[0]),next={...rows[0],date:'2027-01-13'};assert.deepEqual(S.errors(employee,[...rows,next],policy),[]);
 assert.ok(S.errors(employee,[...rows,{...next,date:'2027-01-12'}],policy).length);assert.ok(S.errors(employee,[...rows,{...next,date:'2027-01-13',type:'OT',start:'05:00',end:'15:00'}],policy).some(e=>/48 Stunden/.test(e.message)));
 assert.ok(S.errors(employee,[...rows.slice(0,4),{...next,date:'2027-01-07'}],policy).length);assert.deepEqual(S.errors(employee,[...rows.slice(0,4),{...next,date:'2027-01-08'}],policy),[]);
});
test('ordinary and serialized background solvers retain complete blocks during critical seeding',async()=>{
 const input=fixture(),result=await C.optimize(input,{iterations:2});assert.equal(result.preview.length,7);assert.equal(result.quality.critical,0);
 const packed=B.pack(input);assert.ok(packed.groups.every(g=>g.fullWorkRest));const payload={version:1,months:['2027-01'],minimumInput:packed,monthInputs:[packed],metadata:{}};let checkpoint=B.start(payload);
 for(let n=0;n<5000&&checkpoint.stage!=='done';n++){const runner=B.context(payload,checkpoint);runner.step();checkpoint=JSON.parse(JSON.stringify(checkpoint));}assert.equal(checkpoint.stage,'done');const restored=B.context(payload,checkpoint).result();assert.equal(restored.preview.length,7);assert.deepEqual(S.errors(employee,restored.preview,policy),[]);
});
test('SQL migration binds only active non-OT employees, preserves other companies and validates the matching recovery',async()=>{
 const db=new PGlite();try{await db.exec(`create schema private;create table companies(id uuid,name text);create table company_compliance_policy(company_id uuid,solid_planning_rules jsonb);create table employees(id uuid,company_id uuid,personnel_no text,role text,status text,deleted_at timestamptz,shift_permissions text[],qualifications text[]);
 insert into companies values('11111111-1111-1111-1111-111111111111','Secontec Services'),('22222222-2222-2222-2222-222222222222','Other');
 insert into company_compliance_policy select id,'{"enabled":true,"confirmedRulesVersion":2,"maxConsecutiveNightShifts":4,"minNightRecoveryCalendarDays":2,"minFreeCalendarDays":2,"minBlockRestHours":48,"maxCalendarWeekHours":55,"otOnlyMonthlyMaxHours":220}'::jsonb from companies;
 insert into employees values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','109','Sicherheitsmitarbeiter','active',null,array['O3'],array['__sp:monthlyHours=180','__sp:team=Leipzig','__sp:rhythmMode=off']),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-1111-1111-1111-111111111111','2001','Sicherheitsmitarbeiter','active',null,array['OT1','OT2','OT3'],array['__sp:rhythmMode=off']);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261014070005_fixed_4332_work_rest_cycle.sql','utf8'));
 const profiles=(await db.query('select personnel_no,qualifications from employees order by personnel_no')).rows;assert.ok(profiles[0].qualifications.includes('__sp:rhythmMode=required'));assert.ok(profiles[0].qualifications.includes('__sp:rhythmPattern='+pattern));assert.deepEqual(profiles[1].qualifications,['__sp:rhythmMode=off']);
 const rules=(await db.query("select p.solid_planning_rules p from company_compliance_policy p join companies c on c.id=p.company_id where c.name='Secontec Services'")).rows[0].p;
 assert.equal(rules.otOnlyMonthlyMaxHours,220);assert.equal((await db.query("select solid_planning_rules->>'threeNightBlockRecoveryFullCalendarDays' v from company_compliance_policy where company_id='22222222-2222-2222-2222-222222222222'")).rows[0].v,null);
 const rows=fixture().groups.flatMap(g=>g.options[0]).concat({...fixture().groups[0].options[0][0],date:'2027-01-13'}).map(a=>({shift_code:a.type,starts_at:new Date(S.instant(a.date,a.start)).toISOString(),ends_at:new Date(S.instant(S.plus(a.date,1),a.end)).toISOString()}));
 assert.deepEqual((await db.query("select private.sf_confirmed_rule_errors($1,'Europe/Berlin',$2,null,55) errors",[rows,rules])).rows[0].errors,[]);
 rows.at(-1).starts_at='2027-01-12T19:00Z';rows.at(-1).ends_at='2027-01-13T05:00Z';assert.ok((await db.query("select private.sf_confirmed_rule_errors($1,'Europe/Berlin',$2,null,55) errors",[rows,rules])).rows[0].errors.length);
 }finally{await db.close()}
});
