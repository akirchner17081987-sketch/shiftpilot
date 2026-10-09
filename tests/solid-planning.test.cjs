const test=require('node:test'),assert=require('node:assert/strict'),s=require('../assets/solid-planning-core-v1.js'),core=require('../assets/month-optimizer-core-v1.js');
const p={enabled:true,timezone:'Europe/Berlin',maxConsecutiveShifts:4,minFreeStartDays:2,minBlockRestHours:48,preferredNightBlockLength:3,minFreeWeekendsPerMonth:1,rollingWeekTargetHours:40,shortBlockRecoveryPersonnelNos:['2001','26','2048'],shortBlockMaximum:2,conditionalStaffing:[{shift:'OT1',sourceShift:'O3',sourceDayOffset:-1,coverageStart:'06:00',coverageEnd:'08:00',minimum:3,fallbackCount:1},{shift:'OT3',sourceShift:'O1',sourceDayOffset:0,coverageStart:'18:00',coverageEnd:'20:00',minimum:3,fallbackCount:1}]};
const e={id:'a',personnelNo:'1006',target:180,monthLimit:190,calendarLimit:190,maxMonthlyShifts:18,weeklyLimit:40,maxConsecutive:4};
const a=(date,type='O1',employeeId='a')=>({date,type,employeeId,start:type==='O3'?'22:00':type==='OT2'?'08:00':'18:00',end:type==='O3'?'08:00':type==='OT2'?'18:00':'04:00',resource:date+'|'+type});
test('3 work / 1 free / 4 work and five consecutive duties are rejected',()=>{assert.ok(s.errors(e,[1,2,3,5,6,7,8].map(n=>a('2027-01-'+String(n).padStart(2,'0'))),p).length);assert.ok(s.errors(e,[1,2,3,4,5].map(n=>a('2027-01-0'+n)),p).length)});
test('48 actual hours and two free start days apply across month and spring DST',()=>{assert.equal(s.errors(e,[a('2027-01-31'),a('2027-02-03')],p).length,0);assert.ok(s.errors(e,[a('2027-03-26','O3'),{...a('2027-03-29'),start:'06:00',end:'16:00'}],p).length);assert.equal((s.interval('2027-03-27','22:00','08:00',p.timezone).end-s.interval('2027-03-27','22:00','08:00',p.timezone).start)/3600000,9)});
test('short OT recovery exception does not permit one free day after a long OT block',()=>{const ot={...e,personnelNo:'2001'};assert.equal(s.errors(ot,[1,3,4].map(n=>a('2027-01-0'+n,'OT2')),p).length,0);assert.ok(s.errors(ot,[1,2,3,5].map(n=>a('2027-01-0'+n,'OT2')),p).length)});
test('conditional staffing uses distinct employees covering the full window',()=>{const rows=['a','b','c'].map(id=>a('2027-01-04','O3',id));assert.equal(s.required('2027-01-05','OT1',rows,p),0);assert.equal(s.required('2027-01-05','OT1',[rows[0],rows[1],rows[1]],p),1);assert.equal(s.required('2027-01-05','OT1',[...rows.slice(0,2),{...rows[2],end:'07:00'}],p),1);assert.equal(s.required('2027-01-04','OT3',['a','b','c'].map(id=>a('2027-01-04','O1',id)),p),0)});
test('a Friday overnight duty makes the Saturday/Sunday weekend worked',()=>{const rows=['2027-01-01','2027-01-08','2027-01-15','2027-01-22','2027-01-29'].map(d=>a(d));assert.equal(s.metrics([e],rows,p,['2027-01']).missingFreeWeekends,1);assert.equal(s.metrics([e],rows.slice(1),p,['2027-01']).missingFreeWeekends,0)});
test('optimizer retains a valid whole-block seed and prioritizes critical coverage',async()=>{const rows=['2027-01-01','2027-01-02','2027-01-03'].map(d=>a(d)),g={id:'seed',employee:e,options:[rows]};const r=await core.optimize({month:'2027-01',employees:[e],groups:[g],base:[],capacities:rows.map(a=>[a.resource,1]),seedBlocks:[{id:'seed',rows}],criticalResources:[rows[1].resource],respectHours:true,solidRules:p},{iterations:2});assert.equal(r.preview.length,3);assert.equal(r.quality.critical,0);assert.equal(r.quality.open,0);assert.equal(s.errors(e,r.preview,p).length,0)});
module.exports={rules:p};

test('critical minimum stays two when the configured OT2 demand is three',async()=>{
 const rules={...p,confirmedRulesVersion:2},employees=['a','b','c'].map(id=>({...e,id,personnelNo:id})),dates=Array.from({length:31},(_,i)=>'2027-01-'+String(i+1).padStart(2,'0')).filter(d=>s.weekday(d)<=5);
 const groups=employees.flatMap(employee=>dates.map(date=>({id:employee.id+'|'+date,employee,options:[[a(date,'OT2',employee.id)]]}))),capacities=dates.map(date=>[date+'|OT2',3]);
 const r=await core.optimize({month:'2027-01',employees,groups,base:[],capacities,criticalCapacities:dates.map(date=>[date+'|OT2',2]),solidRules:rules},{iterations:1});
 assert.equal(r.quality.critical,0);assert.ok(r.quality.open>0,'additional third duties remain visible as unmet demand');
 for(const date of dates)assert.ok(r.preview.filter(a=>a.date===date).length>=2);
 for(const employee of employees){assert.equal(s.errors(employee,r.preview,rules).length,0);assert.ok(r.preview.filter(a=>a.employeeId===employee.id).length<=18)}
});

test('critical-first search escapes a noncritical four-day seed',async()=>{
 const rules={...p,confirmedRulesVersion:2,conditionalStaffing:[]},employees=['a','b','c'].map(id=>({...e,id,personnelNo:id})),dates=[4,5,6,7,8].map(n=>'2027-01-0'+n);
 const groups=employees.flatMap(employee=>dates.map(date=>({id:employee.id+'|'+date,employee,options:[[a(date,'OT2',employee.id)]]})));
 const old=dates.slice(0,4).map(date=>({...a(date,'OT2','a'),type:'TRAINING',resource:date+'|TRAINING'}));groups[0].options.unshift(old);
 const r=await core.optimize({month:'2027-01',employees,groups,base:[],capacities:[...dates.map(d=>[d+'|OT2',2]),...old.map(a=>[a.resource,1])],criticalCapacities:dates.map(d=>[d+'|OT2',2]),seedBlocks:[{id:groups[0].id,rows:old}],solidRules:rules},{iterations:2});
 assert.equal(r.quality.critical,0);assert.equal(r.preview.filter(a=>a.type==='OT2').length,10);
 for(const employee of employees)assert.equal(s.errors(employee,r.preview,rules).length,0);
});

test('critical period search carries rest across months and resets personal monthly caps',async()=>{
 const rules={...p,confirmedRulesVersion:2},employees=['a','b','c'].map(id=>({...e,id,personnelNo:id})),dates=[];
 for(let date='2027-01-01';date<'2027-03-01';date=s.plus(date,1))if(s.weekday(date)<=5)dates.push(date);
 const groups=employees.flatMap(employee=>dates.map(date=>({id:employee.id+'|'+date,employee,options:[[a(date,'OT2',employee.id)]]}))),capacities=dates.map(date=>[date+'|OT2',2]);
 const r=await core.optimize({month:'2027-01',employees,groups,base:[],capacities,criticalCapacities:capacities,solidRules:rules,criticalPeriod:true,criticalOnly:true});
 assert.equal(r.quality.critical,0);assert.equal(r.preview.length,dates.length*2);
 for(const employee of employees){assert.equal(s.errors(employee,r.preview,rules).length,0);for(const month of ['2027-01','2027-02'])assert.ok(r.preview.filter(a=>a.employeeId===employee.id&&a.date.startsWith(month)).length<=18)}
});

test('missing O1/O3 coverage gives OT fallback priority over a third OT2',async()=>{
 const date='2027-01-04',ot={...a(date,'OT2'),type:'OT1',start:'06:00',end:'16:00',resource:date+'|OT1'},extra=a(date,'OT2'),g={id:'a|'+date,employee:e,options:[[extra],[ot]]};
 const r=await core.optimize({month:'2027-01',employees:[e],groups:[g],base:[],capacities:[[extra.resource,1],[ot.resource,1]],criticalCapacities:[[extra.resource,0]],solidRules:{...p,confirmedRulesVersion:2}},{iterations:1});
 assert.equal(r.preview.length,1);assert.equal(r.preview[0].type,'OT1');assert.equal(r.quality.critical,0);
});

test('manual time validation retains invalid-input handling with solid rules enabled',()=>{const vm=require('node:vm'),fs=require('node:fs'),c={window:{SFSolidPlanningCore:s},store:{get:()=>{},set:()=>{}},typeById:()=>null,assignments:[]};vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/../assets/compliance-core-v2.js','utf8'),c);c.window.SFCompliance.policy={solidPlanningRules:p};for(const args of [['bad','18:00','04:00'],['2027-01-01','','04:00'],['2027-01-01','18:00','18:00']])assert.equal(c.window.SFCompliance.interval(...args),null);});

