const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../assets/autonomous-planning-core-v1.js');
const B=require('../assets/background-auto-plan-core-v1.js');
const P=require('../assets/ot-regional-staffing-core-v1.js');
const S=require('../assets/solid-planning-core-v1.js');

test('monthly autonomous simulation shares three positions across regional shift types',()=>{
 for(const model of [
  {week:['OT1','OT2','OT3'],special:['OT'],start:['06:00','08:00','10:00','08:00'],end:['16:00','18:00','20:00','18:00']},
  {week:['FD'],special:['FD-WE'],start:['06:00','06:00'],end:['14:00','14:00']},
  {week:['OT'],special:['OT-WE'],start:['07:00','07:00'],end:['16:00','16:00']}
 ]){
  const month='2027-05',dates=Array.from({length:31},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));
  const config={target:3,statesBySite:{Leipzig:'SN',Recklinghausen:'NW'},weekdayCodes:model.week,specialCodes:model.special};
  const types=[...model.week,...model.special].map((id,i)=>({id,start:model.start[i],end:model.end[i],active:true}));
  const people=Array.from({length:16},(_,i)=>({id:'p'+i,employment:'Vollzeit',weeklyHours:55,shifts:i<8?model.week:model.special,
    qualifications:['__sp:team='+(i%2?'Recklinghausen':'Leipzig'),'__sp:monthlyHours=180','__sp:maxWeekly=55','__sp:maxConsecutive=4']}));
  const candidates=dates.flatMap(date=>people.flatMap(e=>e.shifts.filter(code=>P.allowed(date,e.qualifications[0].split('=')[1],code,config)).map(type=>({date,employeeId:e.id,type}))));
  const rules={enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',maxCalendarWeekHours:55,maxConsecutiveShifts:4,minFreeCalendarDays:2,minBlockRestHours:48,maxConsecutiveNightShifts:4,minNightRecoveryCalendarDays:2,monthlyMaxHours:200,monthlyHoursOnly:true,regionalDayStaffing:config};
  const s={version:1,company:'synthetic',runId:'regional-test',fingerprint:'snapshot',timezone:'Europe/Berlin',months:[month],policy:{standard_max_shift_hours:10,monthly_planning_max_hours:200,solid_planning_rules:rules},employees:people,types,base:[],original:[],movable:[],demand:dates.flatMap(date=>types.map(t=>({date,type:t.id,count:3}))),candidates,rhythms:[],unavailableDays:[],wishes:[],learned:[]};
  const p=A.build(s);p.monthInputs[0].searchIterations=1;p.minimumInput.searchIterations=1;
  let cp=B.start(p),steps=0;while(cp.stage!=='done'){const runner=B.context(p,cp);for(let i=0;i<20&&cp.stage!=='done';i++)if(!runner.step())break;cp=JSON.parse(JSON.stringify(cp));assert.ok(++steps<5000);}
  const out=B.result(p,cp);
  for(const date of dates){const rows=out.preview.filter(a=>a.date===date);assert.equal(rows.length,3,model.week[0]+' '+date);for(const a of rows){const e=people.find(e=>e.id===a.employeeId);assert.ok(P.allowed(date,e.qualifications[0].split('=')[1],a.type,config));}}
  for(const e of p.monthInputs[0].employees)assert.deepEqual(S.errors(e,out.preview,rules),[]);
 }
});
