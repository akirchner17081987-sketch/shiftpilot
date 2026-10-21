const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {repair}=require('../assets/auto-plan-repair-core-v1.js');
const seed=[{id:'first',date:'2027-01-01',type:'A',employeeId:'flex'}],vacancy={date:'2027-01-02',type:'B'};
function setup(extra={}){return{preview:seed,open:rows=>rows.some(a=>a.type==='B')?[]:[vacancy],candidates:(slot,rows)=>['flex','single'].filter(id=>(id==='flex'||slot.type==='A')&&!rows.some(a=>a.employeeId===id)).map(employeeId=>({employeeId})),make:(slot,c)=>({...slot,...c,id:'new-'+slot.type}),movable:()=>true,validate:rows=>new Set(rows.map(a=>a.employeeId)).size===rows.length,...extra};}
test('augmenting a vacancy backfills a flexible employee’s previous duty without mutating the source',()=>{
 const before=JSON.stringify(seed),r=repair(setup());assert.equal(r.closed,1);assert.equal(r.swaps,1);assert.equal(r.preview.find(a=>a.type==='A').employeeId,'single');assert.equal(r.preview.find(a=>a.type==='B').employeeId,'flex');assert.equal(JSON.stringify(seed),before);
});
test('protected preview duties cannot be displaced and failed full-plan checks retain the original plan',()=>{
 for(const extra of [{movable:()=>false},{validate:()=>false}]){const r=repair(setup(extra));assert.deepEqual(r.preview,seed);assert.equal(r.closed,0);}
});
test('bounded searches and expired budgets stop safely with unchanged coverage',()=>{
 for(const extra of [{maxChecks:0},{maxTrials:0},{maxMilliseconds:0},{maxMoves:0}]){const r=repair(setup(extra));assert.deepEqual(r.preview,seed);assert.equal(r.limited,true);}
});
test('direct safe fills are preferred; rejected alternatives do not leak into the result',()=>{
 const r=repair(setup({preview:[],candidates:()=>[{employeeId:'bad'},{employeeId:'good'}],validate:rows=>rows.every(a=>a.employeeId==='good')}));assert.equal(r.closed,1);assert.equal(r.swaps,0);assert.equal(r.preview[0].employeeId,'good');
});
function harness(){
 const fields=new Map(),el=id=>{if(!fields.has(id))fields.set(id,{value:'',checked:true,hidden:false,disabled:false,innerHTML:''});return fields.get(id)};
 const c={Date,Intl,Map,Set,console,document:{getElementById:el},SFBackend:{companyId:'one'},SFAutoPlanWorkspace:{render(){},explain(){return "blocked"}},SFCompliance:{policy:{monthlyPlanningMaxHours:220}},SFAutoPlanRepairCore:require('../assets/auto-plan-repair-core-v1.js'),employees:[{id:'flex',status:'active',employment:'Teilzeit',monthlyHours:8,weeklyHours:40,shifts:['A','B']},{id:'single',status:'active',employment:'Teilzeit',monthlyHours:8,weeklyHours:40,shifts:['A']}],assignments:[],TYPES:[{id:'A',start:'06:00',end:'14:00'},{id:'B',start:'18:00',end:'02:00'}],absences:[],absent:()=>false,plannedAssignmentHours:()=>8,employeeMonthlyTarget:e=>e.monthlyHours,iso:d=>d.toISOString().slice(0,10),addDays:(d,n)=>{d=new Date(+d);d.setDate(d.getDate()+n);return d},showSaveToast(){},renderCalendar(){},saveAll(){c.writes=(c.writes||0)+1}};c.window=c;c.typeById=t=>c.TYPES.find(x=>x.id===t);c.plannedMonthlyHoursForEmployee=(id,date,sim=[])=>[...c.assignments,...sim].filter(a=>a.employeeId===id&&a.date.startsWith(date.slice(0,7))).length*8;c.getSoll=(d,t)=>Number(d==='2027-01-01'&&t==='A'||d==='2027-01-02'&&t==='B');
 el('autoPlanPeriod').value='month';el('autoPlanMonth').value='2027-01';el('autoFairDistribution').checked=false;
 vm.createContext(c);const index=fs.readFileSync('index.html','utf8'),start=index.indexOf('let autoPlanPreview=[];');vm.runInContext(index.slice(start,index.indexOf('\nfunction renderOverviewStats()',start)),c);
 for(const name of ['employee-rhythm-v1.js','supabase-auto-plan-guard-v1.js','auto-plan-assurance-v1.js'])vm.runInContext(fs.readFileSync('assets/'+name,'utf8'),c);
 return{c,el,run:s=>vm.runInContext(s,c)};
}
test('normal planning repairs a real cross-day qualification/hour trap and audits the full proposal without writes',()=>{
 const{c,run}=harness();c.generateAutoPlanPreview();const result=JSON.parse(run('JSON.stringify(autoPlanPreview)'));
 assert.deepEqual(result.map(a=>[a.date,a.type,a.employeeId]),[['2027-01-01','A','single'],['2027-01-02','B','flex']]);assert.equal(run('autoPlanUnresolved.length'),0);assert.equal(c.assignments.length,0);assert.equal(c.writes,undefined);
 const a=c.SFAutoPlanAssurance.audit();assert.equal(a.blocked,false);assert.equal(a.checked,2);assert.equal(a.repair.swaps,1);assert.equal(a.open.length,0);
});
test('final checks invalidate changed contracts, periods and missing validators and block saving',async()=>{
 const{c,run}=harness();c.generateAutoPlanPreview();assert.equal(c.SFAutoPlanAssurance.audit().blocked,false);
 c.employees[0].contractEnd='2026-12-31';assert.equal(c.SFAutoPlanAssurance.audit().blocked,true);await c.applyAutoPlanPreview();assert.equal(c.writes,undefined);delete c.employees[0].contractEnd;
 c.SFAutoPlanGuard=null;assert.equal(c.SFAutoPlanAssurance.audit().unknown.length,1);assert.equal(c.SFAutoPlanAssurance.audit().blocked,true);
 assert.equal(run('autoPlanPreview.length'),2);assert.equal(c.assignments.length,0);
});
test('repair never changes fixed explicit rhythms, database-backed rows or another company’s statistics',()=>{
 const{c,run}=harness();c.generateAutoPlanPreview();assert.equal(c.SFAutoPlanAssurance.audit().repair.closed,1);c.SFBackend.companyId='two';assert.equal(c.SFAutoPlanAssurance.audit().repair,null);
 const original=[{id:'saved',_dbId:'database',employeeId:'flex',date:'2027-01-01',type:'A',start:'06:00',end:'14:00'}];assert.equal(c.SFAutoPlanAssurance.repair([],original).length,1);assert.equal(original[0].employeeId,'flex');
});

test('candidate selection automatically excludes deleted staff and dates outside employment',()=>{
 const{c}=harness();c.employees[0].startDate='2027-02-01';c.employees[1].contractEnd='2026-12-31';assert.equal(c.autoEligibleEmployees('A','2027-01-01').length,0);delete c.employees[1].contractEnd;c.employees[1].deletedAt='2026-12-01';assert.equal(c.autoEligibleEmployees('A','2027-01-01').length,0);
});
