import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const core=createRequire(import.meta.url)('../assets/month-optimizer-core-v1.js');
const person=(id,target=16)=>({id,target,monthLimit:target,weeklyLimit:40,maxConsecutive:6,permissions:1});
const duty=(employeeId,date,type='FD')=>({employeeId,date,type,start:type==='O3'?'22:00':type==='TL-LE'?'20:00':'06:00',end:type==='O3'?'08:00':type==='TL-LE'?'06:00':'14:00',resource:date+'|'+type});
test('month packing fills real capacities and allocates hours to both personal targets',async()=>{
 const dates=['2026-12-01','2026-12-02','2026-12-03','2026-12-04'],employees=[person('a'),person('b')],groups=employees.flatMap(e=>dates.map(d=>({id:e.id+'|'+d,employee:e,options:[[duty(e.id,d)]]})));
 const result=await core.optimize({month:'2026-12',employees,groups,base:[],respectHours:true,capacities:dates.map(d=>[d+'|FD',1])},{iterations:12});
 assert.equal(result.quality.open,0);assert.deepEqual(result.rows.map(r=>r.planned),[16,16]);assert.equal(new Set(result.preview.map(a=>a.resource)).size,4);
});
test('only complete blocks can be selected and smaller part-time ceilings cannot produce fragments',async()=>{
 const e=person('a',24),dates=['2026-12-01','2026-12-02','2026-12-03','2026-12-04'],group={id:'block',employee:e,block:true,options:[dates.map(d=>duty(e.id,d))]};
 const result=await core.optimize({month:'2026-12',employees:[e],groups:[group],base:[],respectHours:true,capacities:dates.map(d=>[d+'|FD',1])},{iterations:4});
 assert.equal(result.preview.length,0);assert.equal(result.quality.open,4);assert.equal(result.rows[0].missing,24);
});
test('protected O3 at the month boundary blocks next-day TL while preserving the base duty',async()=>{
 const e=person('a',180),base=[duty('a','2026-11-30','O3')],g={id:'next',employee:e,options:[[duty('a','2026-12-01','TL-LE')]]};
 const before=JSON.stringify(base),r=await core.optimize({month:'2026-12',employees:[e],groups:[g],base,respectHours:true,capacities:[['2026-12-01|TL-LE',1]]},{iterations:4});assert.equal(r.preview.length,0);assert.equal(JSON.stringify(base),before);
});
test('week maximum counts boundary duties and remains optional while the month limit stays mandatory',async()=>{
 const e={...person('a',8),weeklyLimit:8},g={id:'day',employee:e,options:[[duty('a','2026-12-01')]]},input={month:'2026-12',employees:[e],groups:[g],base:[duty('a','2026-11-30')],capacities:[['2026-12-01|FD',1]],respectHours:true};
 assert.equal((await core.optimize(input,{iterations:4})).preview.length,0);assert.equal((await core.optimize({...input,respectHours:false},{iterations:4})).preview.length,1);
 assert.equal((await core.optimize({...input,respectHours:false,base:[duty('a','2026-12-02')]},{iterations:4})).preview.length,0);
});
function harness(){
 const index=read('index.html'),planning=index.slice(index.indexOf('let autoPlanPreview=[];'),index.indexOf('\nfunction renderOverviewStats()',index.indexOf('let autoPlanPreview=[];'))),fields=new Map();
 const id=n=>{if(!fields.has(n))fields.set(n,{value:'',checked:true,disabled:false,hidden:false,textContent:'',innerHTML:'',classList:{toggle(){}}});return fields.get(n)};id('autoPlanPeriod').value='month';id('autoPlanMonth').value='2026-12';
 const c={console,Date,Map,Set,setTimeout:f=>{f();return 0},clearTimeout(){},document:{readyState:'loading',getElementById:id,querySelectorAll:()=>[],addEventListener(){}},SFBackend:{companyId:'a'},employees:[{id:'a',first:'Anna',last:'A',status:'active',employment:'Teilzeit',monthlyHours:16,weeklyHours:40,shifts:['FD']},{id:'b',first:'Berta',last:'B',status:'active',employment:'Teilzeit',monthlyHours:16,weeklyHours:40,shifts:['FD']}],assignments:['01','02','03','04'].map(d=>({id:d,...duty('a','2026-12-'+d)})),absences:[],timeEntries:{},TYPES:[{id:'FD',start:'06:00',end:'14:00'}],globalSoll:{FD:1},dailySoll:{},weekStart:new Date('2026-11-30T12:00:00'),iso:d=>d.toISOString().slice(0,10),addDays:(d,n)=>new Date(+d+n*86400000),typeById:t=>c.TYPES.find(x=>x.id===t),getSoll:(d,t)=>t==='FD'&&d<='2026-12-04'?1:0,assignmentsFor:(d,t)=>c.assignments.filter(a=>a.date===d&&a.type===t),absent:()=>false,plannedAssignmentHours:()=>8,employeeMonthlyTarget:e=>e.monthlyHours,plannedMonthlyHoursForEmployee:(e,d,sim=[])=>[...c.assignments,...sim].filter(a=>a.employeeId===e&&a.date.startsWith(d.slice(0,7))).length*8,showSaveToast:(title,copy)=>c.toast={title,copy},saveAll:()=>c.saves=(c.saves||0)+1,renderCalendar(){}};
 c.window=c;vm.createContext(c);vm.runInContext(planning,c);for(const p of ['assets/auto-plan-workspace-v1.js','assets/individual-month-planner-v1.js','assets/month-optimizer-core-v1.js','assets/month-optimizer-v1.js','assets/supabase-auto-plan-guard-v1.js'])vm.runInContext(read(p),c);c.SFAutoPlanWorkspace.confirmApply=async()=>true;return{c,id,run:s=>vm.runInContext(s,c)};
}
test('replacement preview improves unfair existing drafts without touching them until confirmation',async()=>{
 const {c,id,run}=harness(),before=JSON.stringify(c.assignments);await c.SFMonthOptimizer.optimize();assert.ok(c.SFMonthOptimizer.getResult());assert.equal(JSON.stringify(c.assignments),before);assert.equal(run('autoPlanPreview.length'),4);assert.match(id('autoMonthHours').innerHTML,/SOLL|Bisher|Vorschlag/);
 c.SFAutoPlanWorkspace.confirmApply=async()=>false;await c.applyAutoPlanPreview();assert.equal(JSON.stringify(c.assignments),before);assert.equal(c.saves,undefined);
 c.SFAutoPlanWorkspace.confirmApply=async()=>true;await c.applyAutoPlanPreview();assert.equal(c.assignments.length,4);assert.equal(c.assignments.filter(a=>a.employeeId==='a').length,2);assert.equal(c.assignments.filter(a=>a.employeeId==='b').length,2);assert.equal(c.saves,1);
});
test('employee changes after optimization reject the whole replacement and retain the original drafts',async()=>{
 const {c}=harness();await c.SFMonthOptimizer.optimize();const before=JSON.stringify(c.assignments);c.employees[1].status='inactive';await c.applyAutoPlanPreview();assert.equal(JSON.stringify(c.assignments),before);assert.equal(c.saves,undefined);assert.match(c.toast.copy,/Daten haben sich geändert/);
});
test('confirmed January optimization selects January even when the prior calendar shows another month',async()=>{
 const {c,id}=harness();id('autoPlanMonth').value='2027-01';c.assignments=[];c.getSoll=d=>Number(d>='2027-01-01'&&d<='2027-01-04');
 let selectedMonth='2026-12';c.SchichtFunkCalendarView={setMonth:m=>{selectedMonth=m}};
 await c.SFMonthOptimizer.optimize();assert.ok(c.SFMonthOptimizer.getResult());
 c.SFAutoPlanWorkspace.confirmApply=async()=>false;await c.applyAutoPlanPreview();assert.equal(selectedMonth,'2026-12');
 c.SFAutoPlanWorkspace.confirmApply=async()=>true;await c.applyAutoPlanPreview();assert.equal(selectedMonth,'2027-01');assert.equal(c.assignments.length,4);
});
test('published months cannot start optimization',async()=>{
 const {c}=harness();c.SFCompliance={isWeekPublished:()=>true};const before=JSON.stringify(c.assignments);await c.SFMonthOptimizer.optimize();assert.equal(c.SFMonthOptimizer.getResult(),null);assert.equal(JSON.stringify(c.assignments),before);assert.match(c.toast.copy,/veröffentlicht/);
});
test('a full-time label with a 162-hour target uses the target ceiling instead of 220',()=>{
 const {c}=harness();c.employees[0].employment='Vollzeit';c.employees[0].monthlyHours=162;assert.equal(c.autoHourLimits(c.employees[0]).monthLimit,162);
});

test('a block cannot conceal an invalid internal O3 to TL transition',async()=>{
 const e=person('a',180),option=[duty('a','2026-12-01','O3'),duty('a','2026-12-02','TL-LE')];
 const r=await core.optimize({month:'2026-12',employees:[e],groups:[{id:'bad',employee:e,block:true,options:[option]}],base:[],respectHours:true,capacities:option.map(a=>[a.resource,1])},{iterations:4});assert.equal(r.preview.length,0);
});

test('individual mode ignores retired permissions and retains team, fixed-rhythm and day-only employees',()=>{
 const {c,id}=harness();c.TYPES=['FD','FD-WE','SD','ND'].map(id=>({id,start:id==='ND'?'22:00':id==='SD'?'14:00':'06:00',end:id==='ND'?'06:00':id==='SD'?'22:00':'14:00'}));
 const base={first:'Test',last:'Person',status:'active',employment:'Vollzeit',monthlyHours:180,weeklyHours:40,shifts:['SD','ND','FD-WE']};
 c.employees=[{...base,id:'flex',shifts:['O1','SD','ND','FD-WE']},{...base,id:'team',planningTeam:'A'},{...base,id:'required',rhythmMode:'required'},{...base,id:'day',shifts:['FD']},{...base,id:'part',monthlyHours:162}];c.assignments=[];
 id('autoIndividualBlocks').checked=true;let input=c.SFMonthOptimizer.buildInput([]);
 assert.deepEqual(Array.from(input.employees,e=>e.individual),[true,false,false,false,true]);assert.equal(input.employees[0].monthLimit,184);assert.equal(input.employees[4].monthLimit,160);
 id('autoIndividualBlocks').checked=false;input=c.SFMonthOptimizer.buildInput([]);assert.equal(input.employees.some(e=>e.individual),false);
});
