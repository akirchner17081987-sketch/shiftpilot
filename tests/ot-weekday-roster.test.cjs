const {test}=require('node:test'),assert=require('node:assert/strict');
const S=require('../assets/solid-planning-core-v1.js'),C=require('../assets/month-optimizer-core-v1.js'),R=require('../assets/solid-planning-resume-v1.js'),B=require('../assets/background-auto-plan-core-v1.js');
function fixture({start=1,covered=true,absent=false,lower=false}={}){
 const employees=['a','b','c'].map(id=>({id,_dbId:'db-'+id,status:'active',employment:'Vollzeit',monthlyHours:220,weeklyHours:50,maxWeeklyHours:lower&&id==='b'?40:50,shifts:['OT1','OT2','OT3'],target:220,monthLimit:220,calendarLimit:220,maxMonthlyShifts:22,maxConsecutive:5}));
 const solidRules={enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',otOnlyMonthlyMaxHours:220,otOnlyMaxCalendarWeekHours:50,otOnlyMaxConsecutiveShifts:5,otOnlyMinFreeCalendarDays:2,otOnlyMinBlockRestHours:48,maxCalendarWeekHours:40,maxConsecutiveShifts:4,minFreeCalendarDays:2,minBlockRestHours:48,minNightRecoveryCalendarDays:3,otWeekdayRoster:{employeeIds:employees.map(e=>e._dbId),weekdays:[1,2,3,4,5]},conditionalStaffing:[{shift:'OT1',sourceShift:'O3',sourceDayOffset:-1,coverageStart:'06:00',coverageEnd:'08:00',minimum:3,fallbackCount:1},{shift:'OT3',sourceShift:'O1',sourceDayOffset:0,coverageStart:'18:00',coverageEnd:'20:00',minimum:3,fallbackCount:1}]};
 const dates=Array.from({length:32-start},(_,n)=>'2027-01-'+String(n+start).padStart(2,'0')).filter(d=>S.weekday(d)<=5),base=[];
 if(covered)for(const date of dates)for(let n=0;n<3;n++){base.push({employeeId:'night'+n,date:S.plus(date,-1),type:'O3',start:'22:00',end:'08:00'});base.push({employeeId:'early'+n,date,type:'O1',start:'18:00',end:'04:00'});}
 const capacities=dates.map(d=>[d+'|OT-DAY',3]),groups=employees.flatMap(employee=>dates.filter(d=>!(absent&&employee.id==='b'&&d==='2027-01-07')).map(date=>({id:employee.id+'|'+date,employee,options:S.otCodes.map(type=>[{employeeId:employee.id,date,type,start:{OT1:'06:00',OT2:'08:00',OT3:'10:00'}[type],end:{OT1:'16:00',OT2:'18:00',OT3:'20:00'}[type],resource:date+'|OT-DAY'}])})));
 return {month:'2027-01',employees,base,capacities,criticalCapacities:capacities,groups,solidRules,respectHours:true};
}
async function run(input){return C.optimize(input,{iterations:3});}
function assertFull(input,r,count){for(const e of input.employees){const own=r.preview.filter(a=>a.employeeId===e.id);assert.equal(own.length,count);assert.equal(own.reduce((n,a)=>n+S.duty(a,input.solidRules).hours,0),count*10);assert.deepEqual(S.errors(e,[...input.base,...r.preview],input.solidRules),[]);}assert.equal(r.quality.critical,0);}
test('full January gives all three 21 weekday duties and 210 hours when O1/O3 cover the windows',async()=>{const input=fixture(),r=await run(input);assertFull(input,r,21);assert.ok(r.preview.every(a=>a.type==='OT2'));});
test('January from the fourth gives all three 20 duties and 200 hours',async()=>{const input=fixture({start:4}),r=await run(input);assertFull(input,r,20);});
test('without night coverage each weekday has exactly one OT1, OT2 and OT3',async()=>{const input=fixture({covered:false}),r=await run(input);assertFull(input,r,21);for(const [key]of input.capacities)assert.deepEqual(r.preview.filter(a=>a.date===key.slice(0,10)).map(a=>a.type).sort(),['OT1','OT2','OT3']);});
test('absences and lower personal weekly limits remain binding and visible as critical gaps',async()=>{for(const options of [{absent:true},{lower:true}]){const input=fixture(options),r=await run(input);assert.ok(r.quality.critical>0);if(options.absent)assert.equal(r.preview.some(a=>a.employeeId==='b'&&a.date==='2027-01-07'),false);for(const e of input.employees)assert.deepEqual(S.errors(e,r.preview,input.solidRules),[]);}});
test('checkpointed background solver uses the same roster, full January hours, and private DB identities',async()=>{const input=fixture(),wire=B.pack(input);assert.equal(wire.employees[0]._dbId,'db-a');let cp=R.start(B.unpack(wire),3);for(let n=0;n<10000&&cp.phase!=='done';n++){const runner=R.context(B.unpack(wire),cp);runner.step();cp=JSON.parse(JSON.stringify(cp));}assert.equal(cp.phase,'done');const r=R.context(B.unpack(wire),cp).result();assertFull(input,r,21);assert.ok(r.preview.every(a=>a.type==='OT2'));});
test('roster applies only to the configured company and employees; OT weekend stays separate',()=>{const input=fixture();assert.equal(S.rosterEmployee({_dbId:'db-a',id:'legacy'},input.solidRules),true);assert.equal(S.rosterEmployee({id:'other'},input.solidRules),false);assert.equal(S.required('2027-01-02','OT2',[],input.solidRules),0);assert.equal(S.required('2027-01-04','OT',[],input.solidRules),null);assert.equal(S.required('2027-01-04','OT2',[],{enabled:true}),null);});

test('holiday exclusion removes January 1 from ordinary and checkpointed fixed OT crew planning',async()=>{
 const input=fixture();input.solidRules={...input.solidRules,otDayHolidayExclusion:true,otDayHolidayStates:['DE','SN','NW']};input.capacities=input.capacities.filter(([key])=>!S.otDayHoliday(key.slice(0,10),input.solidRules));input.criticalCapacities=input.capacities;input.groups=input.groups.filter(g=>!S.otDayHoliday(g.options[0][0].date,input.solidRules));
 const result=await run(input);assertFull(input,result,20);assert.equal(result.preview.some(a=>a.date==='2027-01-01'),false);
 const wire=B.pack(input),unpacked=B.unpack(wire);let cp=R.start(unpacked,3);for(let n=0;n<10000&&cp.phase!=='done';n++){const runner=R.context(unpacked,cp);runner.step();cp=JSON.parse(JSON.stringify(cp));}assert.equal(cp.phase,'done');assertFull(input,R.context(unpacked,cp).result(),20);
 for(const date of ['2027-01-01','2027-05-27','2027-11-01','2027-11-17']){assert.equal(S.rosterDay(date,input.solidRules),false);for(const code of S.otCodes)assert.equal(S.required(date,code,[],input.solidRules),0);}assert.equal(S.rosterDay('2027-01-04',input.solidRules),true);
});

function cappedFixture(month,covered=true){
 const input=fixture({covered}),rules={...input.solidRules,otOnlyMonthlyMaxHours:200,otDayHolidayExclusion:true,otDayHolidayStates:['DE','SN','NW'],otWeekdayRoster:{...input.solidRules.otWeekdayRoster,allowDaysOff:true,minimumDailyStaff:2}};
 const begin=month+'-01',dates=Array.from({length:31},(_,i)=>S.plus(begin,i)).filter(d=>d.startsWith(month)&&S.rosterDay(d,rules));
 input.month=month;input.solidRules=rules;input.base=[];
 if(covered)for(const date of dates)for(let n=0;n<3;n++){input.base.push({employeeId:'night'+n,date:S.plus(date,-1),type:'O3',start:'22:00',end:'08:00'});input.base.push({employeeId:'early'+n,date,type:'O1',start:'18:00',end:'04:00'});}
 const types=S.otCodes.map(id=>({id,start:{OT1:'06:00',OT2:'08:00',OT3:'10:00'}[id],end:{OT1:'16:00',OT2:'18:00',OT3:'20:00'}[id]}));
 input.employees=input.employees.map(e=>({...e,...S.limits(e,types,rules)}));
 const choices=new Map(input.employees.map(e=>[e.id,new Map(dates.map(date=>[date,types.map(t=>({employeeId:e.id,date,type:t.id,start:t.start,end:t.end,resource:date+'|OT-DAY'}))]))]));
 const off=S.rosterDaysOff(input.employees,choices,dates,input.base,rules);
 input.groups=input.employees.flatMap(employee=>dates.map(date=>({id:employee.id+'|'+date,employee,options:choices.get(employee.id).get(date).map(a=>[a])})));
 input.capacities=dates.map(d=>[d+'|OT-DAY',3]);input.criticalCapacities=dates.map(d=>[d+'|OT-DAY',2]);return {input,dates,off};
}
test('200-hour cap staggers extra days off in months with twenty, twenty-one and twenty-three workdays',async()=>{
 for(const [month,count]of [['2027-01',20],['2028-02',21],['2028-03',23]]){
  const {input,dates,off}=cappedFixture(month);assert.equal(dates.length,count);const result=await run(input);assertFull(input,result,20);
  for(const e of input.employees){assert.equal(off.get(e.id)?.size||0,count-20);const hours=result.preview.filter(a=>a.employeeId===e.id).reduce((n,a)=>n+S.duty(a,input.solidRules).hours,0);assert.equal(hours,200);}
  for(const date of dates)assert.ok(result.preview.filter(a=>a.date===date).length>=2,'minimum crew retained on '+date);
  assert.equal(result.quality.open,(count-20)*3,'third preferred staff positions stay visible');
  const packed=B.pack(input),unpacked=B.unpack(packed);let cp=R.start(unpacked,3);
  for(let n=0;n<10000&&cp.phase!=='done';n++){const runner=R.context(unpacked,cp);for(let step=0;step<20&&cp.phase!=='done';step++)runner.step();cp=JSON.parse(JSON.stringify(cp));}
  assert.equal(cp.phase,'done');assertFull(input,R.context(unpacked,cp).result(),20);
 }
});
test('hours cap never waives required OT coverage when no night staffing permits a day off',async()=>{
 const {input,off}=cappedFixture('2028-02',false),result=await run(input);assert.equal(off.size,0);assert.ok(result.quality.critical>0);
 for(const e of input.employees)assert.ok(result.preview.filter(a=>a.employeeId===e.id).length<=20);
 const wire=B.pack(input),unpacked=B.unpack(wire);let cp=R.start(unpacked,3);
 for(let n=0;n<10000&&cp.phase!=='done';n++){const runner=R.context(unpacked,cp);runner.step();cp=JSON.parse(JSON.stringify(cp));}
 assert.equal(cp.phase,'done');assert.ok(R.context(unpacked,cp).result().quality.critical>0);
});
