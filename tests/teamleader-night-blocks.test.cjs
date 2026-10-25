const {test}=require('node:test'),assert=require('node:assert/strict');
const S=require('../assets/solid-planning-core-v1.js'),B=require('../assets/background-auto-plan-core-v1.js');
const rules={enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',maxConsecutiveShifts:4,maxConsecutiveNightShifts:3,teamLeaderMaxConsecutiveNightShifts:4,minFreeCalendarDays:2,minNightRecoveryCalendarDays:3,minBlockRestHours:48,maxCalendarWeekHours:40};
const lead={id:'e',role:'Teamleiter',employment:'Vollzeit',weeklyHours:40,monthlyHours:180,shifts:['TL-LE','O1','O3']};
const rows=Array.from({length:4},(_,i)=>({employeeId:'e',date:'2027-01-0'+(i+4),type:'TL-LE',start:'20:00',end:'06:00'}));
test('four leader nights pass, fifth night and four ordinary employee nights remain blocked',()=>{assert.deepEqual(S.errors(lead,rows,rules),[]);assert.ok(S.errors(lead,[...rows,{...rows[0],date:'2027-01-08'}],rules).length);assert.ok(S.errors({...lead,role:'Sicherheitsmitarbeiter'},rows,rules).some(e=>/drei Nachtdienste/.test(e.message)));});
test('three full recovery days, 40 weekly hours and the 162-hour personal cap remain intact',()=>{assert.ok(S.errors(lead,[...rows,{...rows[0],date:'2027-01-11'}],rules).some(e=>/drei vollständig freie/.test(e.message)));assert.deepEqual(S.errors(lead,[...rows,{...rows[0],date:'2027-01-12'}],rules),[]);assert.ok(S.errors({...lead,maxWeeklyHours:30},rows,rules).some(e=>/30 Stunden/.test(e.message)));assert.equal(S.limits({...lead,monthlyHours:162},[{id:'TL-LE',start:'20:00',end:'06:00'}],rules).calendarLimit,162);});
test('background inputs preserve the role needed for the scoped night override',()=>{const packed=B.pack({month:'2027-01',employees:[lead],base:[],groups:[],capacities:[],solidRules:rules});assert.equal(B.unpack(packed).employees[0].role,'Teamleiter');assert.equal(S.employeeRules(B.unpack(packed).employees[0],rules).maxConsecutiveNightShifts,4);});
const fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
test('SQL employee rules use four nights only for leaders and retain ordinary and OT policies',async()=>{const db=new PGlite();try{await db.exec(`create schema private;create table public.employees(id uuid,company_id uuid,role text,employment text,weekly_hours numeric,qualifications text[],shift_permissions text[]);create function private.sf_month_meta(q text[],k text) returns text language sql as $$select null::text$$;`);await db.exec(fs.readFileSync('supabase/migrations/20261014000254_teamleader_four_night_blocks.sql','utf8'));const co='11111111-1111-1111-1111-111111111111',id='22222222-2222-2222-2222-222222222222';await db.query('insert into employees values($1,$2,$3,$4,40,$5,$6)',[id,co,'Teamleiter','Vollzeit',[],['TL-LE']]);const get=async()=>(await db.query('select private.sf_employee_planning_rules($1,$2,$3) p',[co,id,rules])).rows[0].p;assert.equal((await get()).maxConsecutiveNightShifts,4);assert.equal((await get()).minNightRecoveryCalendarDays,3);await db.query("update employees set role='Sicherheitsmitarbeiter'");assert.equal((await get()).maxConsecutiveNightShifts,3);}finally{await db.close();}});

test('55-hour calendar cap admits four day duties plus Sunday, preserves night recovery and rejects excess',()=>{
 const p={...rules,maxCalendarWeekHours:55},e={...lead,maxWeeklyHours:55};
 const days=[4,5,6,7,10].map(d=>({employeeId:'e',date:'2027-01-'+String(d).padStart(2,'0'),type:'OT',start:'08:00',end:'18:00'}));
 assert.deepEqual(S.errors(e,days,p),[]);
 assert.ok(S.errors(e,days,{...p,maxCalendarWeekHours:40}).some(x=>/40 Stunden/.test(x.message)));
 assert.ok(S.errors(e,[...rows,{...rows[0],date:'2027-01-10'}],p).some(x=>/drei vollständig freie/.test(x.message)));
 const six=Array.from({length:6},(_,i)=>({...days[0],date:'2027-01-0'+(i+4)}));
 assert.ok(S.errors(e,six,p).some(x=>/55 Stunden/.test(x.message)));
 assert.equal(S.limits({...e,monthlyHours:162},[{id:'TL-LE',start:'20:00',end:'06:00'}],p).calendarLimit,162);
});

const core=require('../assets/month-optimizer-core-v1.js'),R=require('../assets/solid-planning-resume-v1.js');
const tlRules={...rules,maxCalendarWeekHours:55,teamLeaderMinNightRecoveryCalendarDays:2,teamLeaderPreferredNightBlockLength:4,teamLeaderMinimumMonthlyHours:170};
test('leader two full recovery days allow Monday restart, Sunday stays blocked and ordinary recovery stays three',()=>{
 const e={...lead,maxWeeklyHours:55};assert.deepEqual(S.errors(e,[...rows,{...rows[0],date:'2027-01-11'}],tlRules),[]);
 assert.ok(S.errors(e,[...rows,{...rows[0],date:'2027-01-10'}],tlRules).length);
 assert.equal(S.employeeRules({...e,role:'Sicherheitsmitarbeiter'},tlRules).minNightRecoveryCalendarDays,3);
 assert.equal(S.employeeRules({...e,employment:'Vollzeit',monthlyHours:180,shifts:['OT1','OT2','OT3']},{enabled:true,confirmedRulesVersion:2,otOnlyMonthlyMaxHours:220,otOnlyMaxCalendarWeekHours:50}).maxCalendarWeekHours,50);
 assert.equal(S.metrics([e],rows,tlRules,['2027-01']).nightBlocksOverPreferred,0);
 assert.equal(core.checkpointPrimitives.teamLeaderTarget({...e,target:180},{solidRules:tlRules}),170);
 assert.equal(core.checkpointPrimitives.teamLeaderTarget({...e,target:162},{solidRules:tlRules}),160);
});
test('monthly leader targets improve selection without sacrificing critical coverage',()=>{
 const better=core.checkpointPrimitives.solidBetter,a={critical:0,open:0,penalty:100,deficit:40,teamLeaderDeficit:0},b={critical:0,open:0,penalty:0,deficit:40,teamLeaderDeficit:10};assert.equal(better(a,b),true);assert.equal(better({...a,critical:1},b),false);
 assert.equal(better({...a,leaderOpen:0,critical:13,open:13},{...b,leaderOpen:12,critical:12,open:12}),true);
});
test('new SQL recovery override is role-scoped and preserves ordinary and OT settings',async()=>{
 const db=new PGlite();try{await db.exec(`create schema private;create table public.employees(id uuid,company_id uuid,role text,employment text,weekly_hours numeric,qualifications text[],shift_permissions text[]);create function private.sf_month_meta(q text[],k text) returns text language sql as $$select null::text$$;`);
 const migration=fs.readFileSync('supabase/migrations/20261014010135_teamleader_recovery_and_month_targets.sql','utf8');await db.exec(migration.slice(0,migration.indexOf('CREATE OR REPLACE FUNCTION public.manager_save_planning_rules')));
 const co='11111111-1111-1111-1111-111111111111',id='22222222-2222-2222-2222-222222222222';await db.query('insert into employees values($1,$2,$3,$4,55,$5,$6)',[id,co,'Teamleiter','Vollzeit',[],['TL-LE']]);const get=async()=>(await db.query('select private.sf_employee_planning_rules($1,$2,$3) p',[co,id,tlRules])).rows[0].p;
 assert.equal((await get()).minNightRecoveryCalendarDays,2);assert.equal((await get()).preferredNightBlockLength,4);await db.query("update employees set role='Sicherheitsmitarbeiter'");assert.equal((await get()).minNightRecoveryCalendarDays,3);
 }finally{await db.close();}
});

function targetFixture(){
 const solidRules=tlRules;
const employees=Array.from({length:8},(_,i)=>({id:String(i),role:i<4?'Teamleiter':'Sicherheitsmitarbeiter',target:i===3?162:180,monthlyHours:i===3?162:180,monthLimit:i===3?162:190,calendarLimit:i===3?162:190,maxMonthlyShifts:18,weeklyLimit:55,maxWeeklyHours:55,maxConsecutive:4,permissions:4,shifts:i<4?['TL-LE','O1','O2','O3']:['O1','O2','O3']})),dates=Array.from({length:31},(_,i)=>'2027-01-'+String(i+1).padStart(2,'0'));
const capacities=dates.flatMap(d=>[['TL LE/RE',1],['O1',3],['O2',2],['O3',3]].map(([t,n])=>[d+'|'+t,n]));
const row=(e,date,type)=>({employeeId:e.id,date,type,start:type==='O1'?'18:00':type==='O3'?'22:00':'20:00',end:type==='O1'?'04:00':type==='O3'?'08:00':'06:00',resource:date+'|'+(type==='TL-LE'?'TL LE/RE':type)});
const groups=employees.flatMap(employee=>dates.map(date=>({id:employee.id+'|'+date,employee,options:employee.shifts.flatMap(type=>Array.from({length:4},(_,n)=>Array.from({length:n+1},(_,j)=>row(employee,S.plus(date,j),type))).filter(o=>o.every(a=>a.date.startsWith('2027-01'))))})));
return {month:'2027-01',employees,groups,base:[],capacities,criticalCapacities:dates.map(d=>[d+'|TL LE/RE',1]),solidRules};

}

test('joint staggered blocks reach 170+ hours for three leaders and 160 for the 162-hour profile',async()=>{
 const input=targetFixture(),before=JSON.stringify(input),found=await core.optimize(input,{iterations:24});
 assert.equal(found.quality.critical,0);assert.equal(found.quality.teamLeaderDeficit,0);
 for(const e of input.employees.slice(0,4)){const h=found.preview.filter(a=>a.employeeId===e.id).length*10;assert.ok(h>=(e.target===162?160:170));assert.ok(h<=(e.target===162?162:180));assert.deepEqual(S.errors(e,found.preview,tlRules),[]);}
 assert.equal(JSON.stringify(input),before);
});
test('new leader goals produce the same result after serializable solver restarts',async()=>{
 const input=targetFixture();input.groups=input.groups.filter(g=>g.options.some(o=>o.every(a=>a.date<='2027-01-07'))).map(g=>({...g,options:g.options.filter(o=>o.every(a=>a.date<='2027-01-07'))}));input.capacities=input.capacities.filter(([k])=>k.slice(0,10)<='2027-01-07');input.criticalCapacities=input.criticalCapacities.filter(([k])=>k.slice(0,10)<='2027-01-07');
 const expected=await core.optimize(input,{iterations:24});let cp=R.start(input,24),steps=0;while(cp.phase!=='done'){const runner=R.context(input,cp);for(let i=0;i<10&&cp.phase!=='done';i++)runner.step();cp=JSON.parse(JSON.stringify(cp));assert.ok(++steps<1000);}
 const actual=R.context(input,cp).result();assert.deepEqual(actual.preview,expected.preview);assert.deepEqual(actual.quality,expected.quality);
 const packed=B.pack(input),payload={version:1,months:['2027-01'],minimumInput:{...packed,criticalPeriod:true},monthInputs:[packed],metadata:{company:'fixture'}};let job=B.start(payload);while(job.stage!=='done'){const runner=B.context(payload,job);for(let i=0;i<20&&job.stage!=='done';i++)if(!runner.step())break;job=JSON.parse(JSON.stringify(job));}
 const result=B.result(payload,job);assert.equal(result.quality[0].critical,0);assert.equal(new Set(result.preview.map(a=>a.employeeId+'|'+a.date)).size,result.preview.length);
});
