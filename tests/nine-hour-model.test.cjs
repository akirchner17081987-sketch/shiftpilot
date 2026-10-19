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
