const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../assets/month-optimizer-core-v1.js');
const people=(targets=[180,180])=>targets.map((target,i)=>({id:String(i),target}));
const rows=(id,n,month='2027-01',hours=12)=>Array.from({length:n},(_,i)=>({id:id+'-'+month+'-'+i,employeeId:id,date:month+'-'+String(i+1).padStart(2,'0'),type:'TS',hours}));
const hoursBy=(all,employees)=>employees.map(e=>all.filter(a=>a.employeeId===e.id).reduce((n,a)=>n+a.hours,0));
test('equal targets converge within a duty even when everybody already exceeds SOLL; snapshots remain immutable',()=>{
 const employees=people(),preview=[...rows('0',18),...rows('1',16)],before=JSON.stringify(preview);
 const r=M.balancePreview({employees,preview,target:e=>e.target,hours:a=>a.hours,canMove:()=>true});
 assert.deepEqual(hoursBy(r.preview,employees),[204,204]);assert.equal(JSON.stringify(preview),before);assert.equal(r.preview.length,preview.length);assert.ok(r.moves>0);
});
test('different targets use proportional load, and fairness is evaluated separately in every month',()=>{
 const employees=people([180,90]),preview=[...rows('0',15),...rows('1',15),...rows('0',15,'2027-02'),...rows('1',0,'2027-02')];
 const r=M.balancePreview({employees,preview,target:e=>e.target,hours:a=>a.hours,canMove:()=>true});
 assert.deepEqual(hoursBy(r.preview.filter(a=>a.date.startsWith('2027-01')),employees),[240,120]);
 assert.deepEqual(hoursBy(r.preview.filter(a=>a.date.startsWith('2027-02')),employees),[120,60]);
});
test('fixed duties count toward load but cannot move; impossible transfers and bounded searches retain coverage',()=>{
 const employees=people(),base=rows('0',15),preview=rows('0',3),before=JSON.stringify(base);
 const blocked=M.balancePreview({employees,base,preview,target:e=>e.target,hours:a=>a.hours,canMove:()=>false,maxChecks:2});assert.deepEqual(blocked.preview,preview);assert.equal(blocked.moves,0);
 const fixed=M.balancePreview({employees,base,preview,target:e=>e.target,hours:a=>a.hours,canMove:()=>true,movable:()=>false});assert.deepEqual(fixed.preview,preview);
 const bounded=M.balancePreview({employees,base,preview,target:e=>e.target,hours:a=>a.hours,canMove:()=>true,maxMoves:1});assert.equal(bounded.moves,1);assert.equal(bounded.preview.length,preview.length);assert.equal(JSON.stringify(base),before);
});
test('the optimizer compares excess hours too and preserves binding option groups and base assignments',async()=>{
 const employees=people().map(e=>({...e,monthLimit:240,weeklyLimit:100,maxConsecutive:31})),base=employees.flatMap(e=>rows(e.id,15).map(a=>({...a,start:'06:00',end:'18:00'}))),dates=['2027-01-16','2027-01-17','2027-01-18','2027-01-19'],groups=employees.flatMap(e=>dates.map(date=>({id:e.id+'|'+date,employee:e,options:[[{employeeId:e.id,date,type:'TS',resource:date+'|TS',start:'06:00',end:'18:00'}]]}))),input={month:'2027-01',employees,base,groups,capacities:dates.map(d=>[d+'|TS',1]),respectHours:true,maxShiftHours:12};
 const before=JSON.stringify(input),result=await M.optimize(input,{iterations:1});assert.equal(result.quality.open,0);assert.deepEqual(result.rows.map(r=>r.planned),[204,204]);assert.equal(JSON.stringify(input),before);
});
test('the January twelve-hour example can be balanced using the actual candidate, rhythm and rest guards',()=>{
 const index=fs.readFileSync('index.html','utf8'),start=index.indexOf('let autoPlanPreview=[];'),source=index.slice(start,index.indexOf('\nfunction renderOverviewStats()',start)),anchors={Tom:'2026-10-19',Uwe:'2026-10-10',Carla:'2026-10-15',Sarah:'2026-10-11'},fields=new Map(),field=id=>{if(!fields.has(id))fields.set(id,{value:'',checked:true});return fields.get(id)};
 const c={Date,Map,Set,console,document:{getElementById:field},SFBackend:{companyId:'test'},SFMonthOptimizerCore:M,SFCompliance:{policy:{standardMaxShiftHours:12,solidPlanningRules:{}}},employees:Object.entries(anchors).map(([id,start])=>({id,status:'active',employment:'Vollzeit',weeklyHours:40,maxWeeklyHours:60,monthlyHours:180,maxConsecutiveShifts:4,shifts:['TS','N'],rhythmMode:'required',rhythmStart:start,rhythmPattern:'ALLE,ALLE,ALLE,ALLE,FREI,FREI,FREI,ALLE,ALLE,ALLE,FREI,FREI'})),TYPES:[{id:'TS',start:'06:00',end:'18:00'},{id:'N',start:'18:00',end:'06:00'}],assignments:[],absent:()=>false,employeeMonthlyTarget:e=>e.monthlyHours,plannedAssignmentHours:()=>12,iso:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,addDays:(d,n)=>{d=new Date(+d);d.setDate(d.getDate()+n);return d}};c.window=c;c.typeById=type=>c.TYPES.find(t=>t.id===type);c.plannedMonthlyHoursForEmployee=(id,date,sim=[])=>[...c.assignments,...sim].filter(a=>a.employeeId===id&&a.date.startsWith(date.slice(0,7))).length*12;
 field('autoPlanPeriod').value='month';field('autoPlanMonth').value='2027-01';vm.createContext(c);vm.runInContext(source,c);for(const file of ['employee-rhythm-v1.js','supabase-auto-plan-guard-v1.js'])vm.runInContext(fs.readFileSync('assets/'+file,'utf8'),c);
 let preview=[];const add=(id,type,days)=>days.forEach(d=>preview.push({id:id+d,date:'2027-01-'+String(d).padStart(2,'0'),employeeId:id,type,start:c.typeById(type).start,end:c.typeById(type).end}));
 add('Sarah','TS',[3,4,5,6,15,16,17,18,27,28,29,30]);add('Tom','TS',[1,2,11,12,13,14,18,19,20,23,24,25,26]);add('Tom','N',[30,31]);add('Uwe','N',[2,3,4,5,14,15,16,17,26,27,28,29]);add('Uwe','TS',[9,10,11,21,22,23]);add('Carla','TS',[2,3,4,7,8,9,10,14,15,16,19,20,21,22,26,27,28]);
 const before=JSON.stringify(preview),balanced=c.balanceAutoPlanHours([],preview),hours=anchors=>balanced.filter(a=>a.employeeId===anchors).length*12;assert.equal(JSON.stringify(preview),before);assert.deepEqual(['Tom','Uwe','Carla','Sarah'].map(hours).sort((a,b)=>a-b),[180,180,192,192]);assert.equal(balanced.length,preview.length);
 for(const a of balanced){assert.equal(c.sfRhythmCheck(c.employees.find(e=>e.id===a.employeeId),a.type,a.date).allowed,true);assert.equal(c.SFAutoPlanGuard.passesTimeRules(a.employeeId,a.type,a.date,balanced.filter(b=>b!==a)),true);}
 field('autoFairDistribution').checked=false;assert.equal(c.balanceAutoPlanHours([],preview),preview);
 field('autoFairDistribution').checked=true;for(const [id,anchor] of [['Frank','2026-10-18'],['Herbert','2026-10-19']])c.employees.push({...c.employees[0],id,rhythmStart:anchor,rhythmMode:id==='Herbert'?'off':'required',maxConsecutiveShifts:id==='Herbert'?6:4});c.getSoll=(date,type)=>date.startsWith('2027-01')?(type==='TS'?2:1):0;c.SFAutoPlanWorkspace={render(){}};c.showSaveToast=()=>{};c.generateAutoPlanPreview();const generated=vm.runInContext('autoPlanPreview',c),loads=c.employees.map(e=>generated.filter(a=>a.employeeId===e.id).length*12);console.log('January generated hours:',loads,'open:',vm.runInContext('autoPlanUnresolved.length',c));assert.equal(c.assignments.length,0);assert.ok(Math.max(...loads)-Math.min(...loads)<=24);for(const a of generated)assert.equal(c.SFAutoPlanGuard.passesTimeRules(a.employeeId,a.type,a.date,generated.filter(b=>b!==a)),true);
});
