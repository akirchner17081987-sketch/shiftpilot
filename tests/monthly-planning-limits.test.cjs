const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../assets/month-optimizer-core-v1.js');
const person={id:'a',target:180,monthLimit:190,maxMonthlyShifts:18,calendarLimit:190,weeklyLimit:40,maxConsecutive:0};
const duty=(date)=>({employeeId:'a',date,type:'OT2',start:'08:00',end:'18:00',resource:date+'|OT2'});
const rows=Array.from({length:18},(_,i)=>duty('2027-01-'+String(i+1).padStart(2,'0')));
test('eighteenth duty fits but nineteenth is rejected independently of hours and weekly option',()=>{
 const extra={...duty('2027-01-21'),end:'09:00'},g={id:'x',employee:person,options:[[extra]]};
 for(const respectHours of [true,false]){const p=core.prepare({month:'2027-01',employees:[{...person,weeklyLimit:400}],base:rows,groups:[g],capacities:[[extra.resource,1]],respectHours});assert.equal(core.feasible(p,core.state(p),p.groups[0],p.groups[0].options[0]),false)}
});
function compliance(){const c={window:{},store:{get:()=>{},set:()=>{}},assignments:[],typeById:()=>null};vm.createContext(c);vm.runInContext(fs.readFileSync(new URL('../assets/compliance-core-v2.js','file://'+__filename),'utf8'),c);return c.window.SFCompliance}
test('month carryover is accepted without counting the preceding night as an extra duty',()=>{
 const C=compliance();C.policy={monthlyPlanningMaxHours:190,monthlyPlanningMaxShifts:18};
 assert.equal(C.monthPlanningCheck({...person,employment:'Vollzeit',monthlyHours:180},'2027-01-01',[{employeeId:'a',date:'2026-12-31',start:'20:00',end:'08:00'},...rows]).length,0);
});
test('personal 144, 160 and 162 hour limits remain stricter than the company ceiling',()=>{
 const C=compliance();C.policy={monthlyPlanningMaxHours:190,monthlyPlanningMaxShifts:18};
 for(const target of [144,160,162])assert.equal(C.monthPlanningCheck({...person,employment:'Vollzeit',monthlyHours:target},'2027-01-01',rows).length,1);
});
test('companies without configured limits retain the existing manual behavior',()=>{
 const C=compliance();C.policy={};assert.equal(C.monthPlanningCheck({...person,employment:'Vollzeit',monthlyHours:180},'2027-01-01',[...rows,duty('2027-01-21')]).length,0);
});
