const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../assets/background-auto-plan-core-v1.js'),R=require('../assets/solid-planning-resume-v1.js'),core=require('../assets/month-optimizer-core-v1.js'),S=require('../assets/solid-planning-core-v1.js');
const rules={enabled:true,timezone:'Europe/Berlin',maxConsecutiveShifts:4,minFreeStartDays:2,minBlockRestHours:48,preferredNightBlockLength:3,minFreeWeekendsPerMonth:1,rollingWeekTargetHours:40,conditionalStaffing:[]};
test('Secontec 9h block recovery exchanges occupied TL days and preserves all mandatory positions',()=>{
 const dates=['2027-01-23','2027-01-24','2027-01-25'],employees=['37','a','b','c','d'].map(id=>({id,target:162,monthLimit:162,calendarLimit:162,weeklyLimit:55,maxConsecutive:4,shifts:['TL']})),row=(id,date)=>({employeeId:id,date,type:'TL',start:'21:00',end:'06:00',resource:date+'|TL'});
 const make=(id,days,fullWorkRest=false)=>({id:id+'|'+days[0],employee:employees.find(e=>e.id===id),fullWorkRest,options:[days.map(day=>row(id,day))]});
 const input={month:'2027-01',employees,base:[],groups:[make('37',dates,true),make('a',[dates[0]]),make('b',[dates[2]]),make('c',[dates[0]]),make('d',[dates[2]])],capacities:dates.map(d=>[d+'|TL',1]),criticalCapacities:[],scopedBlockRecovery:true,solidRules:{...rules,confirmedRulesVersion:2,minFreeCalendarDays:2,minNightRecoveryCalendarDays:2,maxConsecutiveNightShifts:4,maxCalendarWeekHours:55,minFreeWeekendsPerMonth:0}};
 const p=core.prepare(input),incumbent=core.state(p,[{group:p.groups[1],option:p.groups[1].options[0]},{group:p.groups[2],option:p.groups[2].options[0]}]);
 const recovered=core.checkpointPrimitives.repairBlockExchanges(p,incumbent);
 assert.equal(core.checkpointPrimitives.solidQuality(p,incumbent).open,1);assert.equal(core.checkpointPrimitives.solidQuality(p,recovered).open,0);
 const planned=recovered.records.flatMap(r=>r.option);assert.deepEqual(planned.filter(a=>a.employeeId==='37').map(a=>a.date),dates);
 for(const e of employees)assert.equal(S.errors(e,planned,input.solidRules).length,0);
 const elsewhere=core.prepare({...input,scopedBlockRecovery:false});assert.equal(core.checkpointPrimitives.repairBlockExchanges(elsewhere,core.state(elsewhere)).records.length,0);
 const packed=C.pack(input);assert.equal(packed.scopedBlockRecovery,true);assert.equal(C.unpack(packed).scopedBlockRecovery,true);
 const forged={version:1,months:['2027-01'],minimumInput:packed,monthInputs:[packed],metadata:{company:'elsewhere'}};assert.throws(()=>C.check(forged),/gehört nicht zu diesem Unternehmen/);
});
function input(month='2027-01'){
 const employees=['a','b','c'].map(id=>({id,first:'private',email:'private@example.test',target:40,monthLimit:40,calendarLimit:40,maxMonthlyShifts:4,weeklyLimit:40,maxConsecutive:4,shifts:['OT2'],personnelNo:id})),dates=[4,5,6,7,8].map(n=>month+'-'+String(n).padStart(2,'0'));
 const row=(e,date)=>({employeeId:e.id,date,type:'OT2',start:'08:00',end:'18:00',resource:date+'|OT2'}),groups=employees.flatMap(employee=>dates.map(date=>({id:employee.id+'|'+date,employee,options:[[row(employee,date)]]})));
 return{month,employees,groups,base:[],reserved:[],capacities:dates.map(d=>[d+'|OT2',2]),criticalCapacities:dates.map(d=>[d+'|OT2',2]),solidRules:rules};
}
function payload(){const i=input();return{version:1,months:[i.month],minimumInput:C.pack({...i,criticalPeriod:true}),monthInputs:[C.pack(i)],metadata:{company:'one',fingerprint:'snapshot',base:[]}};}
function finish(p){let cp=C.start(p),roundTrips=0;while(cp.stage!=='done'){const run=C.context(p,cp);for(let n=0;n<3&&cp.stage!=='done';n++)if(!run.step())break;cp=JSON.parse(JSON.stringify(cp));roundTrips++;assert.ok(roundTrips<2000);}return{result:C.result(p,cp),cp,roundTrips};}
test('compact immutable inputs omit private employee contact data and reconstruct candidate rows',()=>{const i=input(),p=C.pack(i),u=C.unpack(JSON.parse(JSON.stringify(p)));assert.equal(p.employees[0].email,undefined);assert.equal(p.employees[0].first,undefined);assert.deepEqual(u.groups[0].options,i.groups[0].options);assert.equal(u.groups[0].employee,u.employees[0]);assert.equal(p.candidates.length,15);});
test('JSON checkpoints preserve the exact solid solver result and never mutate the source input',async()=>{const i=input(),before=JSON.stringify(i),expected=await core.optimize(i,{iterations:12});let cp=R.start(i,12);while(cp.phase!=='done'){const run=R.context(i,cp);run.step();cp=JSON.parse(JSON.stringify(cp));}const found=R.context(i,cp).result();assert.deepEqual(found.preview,expected.preview);assert.deepEqual(found.quality,expected.quality);assert.equal(JSON.stringify(i),before);});
test('checkpoint planning balances equal targets even after both people exceed their monthly SOLL',async()=>{
 const employees=['a','b'].map(id=>({id,target:16,monthLimit:40,calendarLimit:40,weeklyLimit:40,maxConsecutive:4,shifts:['SD']})),row=(employee,date)=>({employeeId:employee.id,date,type:'SD',start:'14:00',end:'22:00',resource:date+'|SD'}),dates=['2027-01-10','2027-01-11','2027-01-12','2027-01-13'];
 const i={month:'2027-01',employees,base:employees.flatMap(e=>['2027-01-02','2027-01-03'].map(d=>row(e,d))),groups:employees.flatMap(employee=>dates.map(date=>({id:employee.id+'|'+date,employee,options:[[row(employee,date)]]}))),capacities:dates.map(d=>[d+'|SD',1]),solidRules:{...rules,minFreeStartDays:0,minBlockRestHours:0,minFreeWeekendsPerMonth:0}},before=JSON.stringify(i),expected=await core.optimize(i,{iterations:12});
 let cp=R.start(i,12);while(cp.phase!=='done'){R.context(i,cp).step();cp=JSON.parse(JSON.stringify(cp));}const found=R.context(i,cp).result();
 assert.deepEqual(found.preview,expected.preview);assert.equal(found.quality.open,0);for(const e of employees)assert.equal([...i.base,...found.preview].filter(a=>a.employeeId===e.id).length*8,32);assert.equal(JSON.stringify(i),before);
});
test('a background job survives many independent invocations and leaves the roster as a preview',()=>{const p=payload(),before=JSON.stringify(p),{result,roundTrips,cp}=finish(p);assert.ok(roundTrips>4);assert.ok(result.preview.length>0);assert.equal(JSON.stringify(p),before);for(const e of p.monthInputs[0].employees)assert.equal(S.errors(e,result.preview,rules).length,0);assert.equal(C.progress(p,cp).percent,100);assert.equal(result.metadata.fingerprint,'snapshot');});
test('confirmed promises are enforced by a rehydrated solver, not dependent on browser callbacks',()=>{const p=payload(),w={employee_id:'a',kind:'OFF',status:'PROMISED',priority:'NORMAL',start_date:'2027-01-04',end_date:'2027-01-08',starts_at:'2027-01-03T23:00:00Z',ends_at:'2027-01-08T23:00:00Z'};p.minimumInput.wishes=[w];p.monthInputs[0].wishes=[w];const {result}=finish(p);assert.equal(result.preview.filter(a=>a.employeeId==='a').length,0);});
test('two months preserve critical reservations and independently enforce monthly ceilings',()=>{const one=input(),two=input('2027-02'),minimum={...one,criticalPeriod:true,base:[],groups:[...one.groups,...two.groups],capacities:[...one.capacities,...two.capacities],criticalCapacities:[...one.criticalCapacities,...two.criticalCapacities]};const p={version:1,months:[one.month,two.month],minimumInput:C.pack(minimum),monthInputs:[C.pack(one),C.pack(two)],metadata:{company:'one'}};const {result}=finish(p);assert.equal(result.months.length,2);for(const m of result.months)for(const e of one.employees)assert.ok(result.preview.filter(a=>a.employeeId===e.id&&a.date.startsWith(m)).length<=4);assert.equal(new Set(result.preview.map(a=>a.employeeId+'|'+a.date)).size,result.preview.length);});
test('unsupported versions, missing company snapshots and corrupt option references fail closed',()=>{const p=payload();assert.throws(()=>C.start({...p,version:999}),/Ungültiger/);p.monthInputs[0].groups[0].options[0][0]=99999;assert.throws(()=>C.start(p),/Ungültige/);assert.throws(()=>C.context(payload(),{version:999}),/andere Version/);});
test('worker applies server-confirmed wishes without copying or trusting client wish arrays',()=>{
 const p=payload(),before=JSON.stringify(p),w={employee_id:'a',kind:'OFF',status:'PROMISED',priority:'NORMAL',start_date:'2027-01-04',end_date:'2027-01-08',starts_at:'2027-01-03T23:00:00Z',ends_at:'2027-01-08T23:00:00Z'};
 const hydrated=C.withServerWishes(p,[w]);assert.equal(JSON.stringify(p),before);assert.equal(hydrated.minimumInput.candidates,p.minimumInput.candidates);assert.equal(hydrated.monthInputs[0].candidates,p.monthInputs[0].candidates);assert.equal(finish(hydrated).result.preview.filter(a=>a.employeeId==='a').length,0);assert.equal(C.withServerWishes(p,null),p);assert.throws(()=>C.withServerWishes(p,{}),/Ungültige/);
});
test('compact jobs preserve published fairness history, adjacent night recovery and the exact plan',()=>{
 const p=payload(),duty=(id,date,type='OT2',start='08:00',end='18:00',published=false)=>({employeeId:id,date,type,start,end,...(published?{status:'PUBLISHED',publishedAt:'2026-09-01T00:00:00Z'}:{status:'DRAFT'})});
 const base=[duty('a','2026-08-01','O3','22:00','06:00',true),duty('a','2026-09-30','O3','22:00','06:00',true),duty('a','2026-11-06','O3','22:00','06:00',true),duty('b','2026-11-06','OT2','08:00','18:00',true),duty('a','2027-01-02','O3','22:00','06:00'),duty('b','2027-02-01'),duty('a','2027-06-01','O3','22:00','06:00',true)];
 p.minimumInput.base=base;p.minimumInput.preferenceBase=base;p.monthInputs[0].base=base;p.monthInputs[0].preferenceBase=base;p.metadata.base=base;
 const original=JSON.stringify(p),compact=C.compactPayload(p);
 assert.deepEqual(compact.monthInputs[0].base.map(a=>a.date),['2027-01-02','2027-02-01']);assert.deepEqual(compact.monthInputs[0].preferenceBase.map(a=>a.date),['2026-09-30','2026-11-06','2026-11-06']);
 assert.equal(compact.metadata,p.metadata);assert.equal(compact.monthInputs[0].groups,p.monthInputs[0].groups);assert.equal(JSON.stringify(p),original);assert.deepEqual(finish(compact).result,finish(p).result);
});
test('local dates remain correct across zones and daylight-saving transitions after memoization',()=>{
 for(const iso of ['2027-03-27T23:30:00Z','2027-03-28T01:30:00Z','2027-10-31T01:30:00Z'])for(const timezone of ['Europe/Berlin','America/New_York','UTC']){
  const expected=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));assert.equal(S.localDate(Date.parse(iso),{timezone}),expected);assert.equal(S.localDate(Date.parse(iso),{timezone}),expected);
 }
});

test('background input preserves company duration and the worker rejects an outdated or forged limit',()=>{
 const i={...input(),maxShiftHours:12},packed=C.pack(i);assert.equal(packed.maxShiftHours,12);assert.equal(C.unpack(JSON.parse(JSON.stringify(packed))).maxShiftHours,12);
 const p={version:1,months:[i.month],minimumInput:packed,monthInputs:[packed],metadata:{company:'one'}},before=JSON.stringify(p);
 const applied=C.withShiftDurationLimit(p,12);assert.equal(applied.monthInputs[0].maxShiftHours,12);assert.equal(JSON.stringify(p),before);
 assert.throws(()=>C.withShiftDurationLimit(p,10),/Schichtdauer wurde geändert/);assert.throws(()=>C.withShiftDurationLimit(p,0),/Ungültige/);
 assert.equal(C.withShiftDurationLimit(payload(),10).minimumInput.maxShiftHours,10);const legacy=payload();delete legacy.minimumInput.maxShiftHours;delete legacy.monthInputs[0].maxShiftHours;assert.equal(C.withShiftDurationLimit(legacy,9).minimumInput.maxShiftHours,9);
});
