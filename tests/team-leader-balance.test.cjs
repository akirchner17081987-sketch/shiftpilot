const test=require('node:test'),assert=require('node:assert/strict'),loadHighs=require('highs');
const T=require('../assets/team-leader-balance-core-v1.js'),S=require('../assets/solid-planning-core-v1.js');
const runtime=loadHighs({print(){},printErr(){}});
const hours={OT:['07:00','16:00'],O1:['16:00','01:00'],TL:['21:00','06:00'],O3:['22:00','07:00']};
const row=(employeeId,date,type)=>({employeeId,date,type,start:hours[type][0],end:hours[type][1],resource:date+'|'+type});
function fixture(){
 const dates=['2027-01-01','2027-01-06','2027-01-11','2027-01-16'];
 const employees=['a','b','c','d'].map(id=>({id,personnelNo:id,role:'Teamleiter',shifts:['O1','O3','TL'],target:36,monthLimit:180,weeklyLimit:55})).concat([{id:'ot',personnelNo:'2001',shifts:['OT'],target:36,monthLimit:180,weeklyLimit:55},{id:'fixed',personnelNo:'115',shifts:['O3'],target:36,monthLimit:180,weeklyLimit:55}]);
 const preview=dates.flatMap(date=>[row('a',date,'TL'),row('b',date,'O1'),row('c',date,'O3'),row('d',date,'O3'),row('ot',date,'OT'),row('fixed',date,'O3')]);
 const candidates=dates.flatMap(date=>employees.flatMap(e=>e.shifts.map(type=>row(e.id,date,type))));
 const input={month:'2027-01',employees,candidates,base:[],reserved:[],wishes:[],minRestHours:11,solidRules:{enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',preventDescendingShifts:true,teamLeaderShiftBalance:{enabled:true},maxConsecutiveShifts:4,minFreeCalendarDays:2,maxCalendarWeekHours:55}};
 return{input,preview,dates};
}
test('balances TL duties across eligible leaders without moving anyone, changing staffing or assigning OT/O3 specialists elsewhere',async()=>{
 const f=fixture(),before=JSON.stringify(f.preview),r=T.balance(f.input,f.preview,await runtime,1);
 assert.equal(r.status,'balanced');assert.deepEqual(Object.values(r.counts).sort(),[1,1,1,1]);assert.equal(JSON.stringify(f.preview),before);
 for(const date of f.dates){const count=type=>r.preview.filter(a=>a.date===date&&a.type===type).length;assert.deepEqual([count('TL'),count('O1'),count('O3'),count('OT')],[1,1,3,1]);}
 for(const e of f.input.employees){assert.deepEqual(S.errors(e,r.preview,f.input.solidRules),[]);assert.ok(r.preview.filter(a=>a.employeeId===e.id).every(a=>e.shifts.includes(a.type)));}
 assert.deepEqual(r.preview.map(a=>[a.employeeId,a.date]),f.preview.map(a=>[a.employeeId,a.date]));
});
test('keeps fixed duties and approved shift wishes when balancing',async()=>{
 const f=fixture(),locked=f.preview.find(a=>a.date===f.dates[0]&&a.employeeId==='a');f.input.base=[locked];
 f.input.wishes=[{employee_id:'a',kind:'SHIFT',status:'ACCEPTED',start_date:f.dates[1],end_date:f.dates[1],shift_code:'TL'}];
 const r=T.balance(f.input,f.preview,await runtime,1);
 assert.equal(r.preview.find(a=>a.employeeId==='a'&&a.date===f.dates[0]).type,'TL');
 assert.equal(r.preview.find(a=>a.employeeId==='a'&&a.date===f.dates[1]).type,'TL');
 assert.equal(r.preview.filter(a=>a.type==='TL').length,4);
});
test('requires an explicit company rule',async()=>{const f=fixture();delete f.input.solidRules.teamLeaderShiftBalance;const r=T.balance(f.input,f.preview,await runtime);assert.equal(r.status,'disabled');assert.equal(r.preview,f.preview);});
