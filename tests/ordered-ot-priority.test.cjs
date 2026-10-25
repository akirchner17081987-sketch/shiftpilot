const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../assets/month-optimizer-core-v1.js'),S=require('../assets/solid-planning-core-v1.js'),R=require('../assets/solid-planning-resume-v1.js');

function month(){
 const dates=Array.from({length:31},(_,i)=>S.plus('2027-01-01',i)),ids=['A','B','C','D','E'];
 const employees=ids.map(id=>({id,_dbId:id,personnelNo:id,employment:'Vollzeit',weeklyHours:45,weeklyLimit:55,monthlyHours:180,target:180,monthLimit:200,calendarLimit:200,maxMonthlyShifts:Infinity,maxConsecutive:4,shifts:['OT']}));
 const solidRules={enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',monthlyHoursOnly:true,maxCalendarWeekHours:55,maxConsecutiveShifts:4,minFreeCalendarDays:2,minBlockRestHours:48,otDailyMinimumStaffing:3,criticalShifts:[{code:'OT',minimum:3,weekdays:[1,2,3,4,5,6,7]}],orderedMonthlyShiftEmployees:ids.map(id=>({employeeId:id,personnelNo:id,code:'OT'}))};
 const groups=employees.flatMap(e=>dates.map(date=>({id:e.id+'|'+date,employee:e,options:Array.from({length:4},(_,i)=>dates.filter(d=>d>=date&&d<=S.plus(date,i)).map(d=>({employeeId:e.id,date:d,type:'OT',start:'07:00',end:'16:00',resource:d+'|OT'})))})));
 return {month:'2027-01',employees,base:[],groups,capacities:dates.map(d=>[d+'|OT',3]),criticalCapacities:dates.map(d=>[d+'|OT',3]),solidRules,respectHours:true,fairDistribution:true,maxShiftHours:9,minRestHours:11};
}
function verify(input,preview){
 assert.equal(preview.length,93);
 assert.deepEqual(input.employees.map(e=>preview.filter(a=>a.employeeId===e.id).length*9),[180,180,180,180,117]);
 for(let d='2027-01-01';d<='2027-01-31';d=S.plus(d,1))assert.equal(preview.filter(a=>a.date===d&&a.type==='OT').length,3);
 for(const e of input.employees)assert.deepEqual(S.errors(e,preview,input.solidRules),[]);
}
test('ordered OT contracts fill the four primary targets before the fifth employee and retain exact daily staffing',async()=>{
 const input=month(),p=M.prepare(input),C=M.checkpointPrimitives;
 const minimum=[{group:p.groups.find(g=>g.employee.id==='E'&&g.id.endsWith('2027-01-01')),option:p.groups.find(g=>g.employee.id==='E'&&g.id.endsWith('2027-01-01')).options[0]}];
 const seed=C.priorityAllocationSeed(p,minimum,(s,r)=>M.feasible(p,s,r.group,r.option));
 verify(input,seed.flatMap(r=>r.option));
 const result=await M.optimize(input,{iterations:1});verify(input,result.preview);
 assert.deepEqual(result.quality.orderedDeficits,[0,0,0,0,63]);
});
test('resumable optimizer preserves OT priority across serialized checkpoints',()=>{
 const input=month(),cp=R.start(input,1);let steps=0;
 while(cp.phase!=='done'){R.context(input,cp).step();assert.ok(++steps<10000,'checkpoint search terminates');}
 verify(input,R.context(input,cp).result().preview);
});
