const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');const read=p=>fs.readFileSync(new URL('../'+p,'file://'+__filename),'utf8');
function harness(){const fields=new Map(),el=id=>{if(!fields.has(id))fields.set(id,{value:'',checked:true,disabled:false,hidden:false,textContent:'',innerHTML:'',dataset:{},classList:{toggle(){}}});return fields.get(id)};el('autoPlanPeriod').value='month';el('autoPlanMonth').value='2027-01';el('autoPlanMonthCount').value='6';const calls=[],c={console,Date,Map,Set,Intl,setTimeout:f=>{f();return 0},clearTimeout(){},document:{readyState:'loading',getElementById:el,querySelectorAll:()=>[],addEventListener(){}},employees:['a','b'].map(id=>({id,personnelNo:id,status:'active',shifts:['O1'],first:id,last:id,employment:'Teilzeit',monthlyHours:20,weeklyHours:40})),assignments:[],absences:[],timeEntries:{},TYPES:[{id:'O1',start:'18:00',end:'04:00'}],globalSoll:{O1:1},dailySoll:{},weekStart:new Date('2027-01-04T12:00:00Z'),iso:d=>d.toISOString().slice(0,10),addDays:(d,n)=>new Date(+d+n*86400000),absent:()=>false,employeeMonthlyTarget:e=>e.monthlyHours,showSaveToast:(title,copy)=>c.toast={title,copy},renderCalendar(){},saveAll(){}};c.window=c;c.typeById=id=>c.TYPES.find(t=>t.id===id);c.getSoll=d=>Number(+d.slice(-2)<=2);c.assignmentsFor=(d,t)=>c.assignments.filter(a=>a.date===d&&a.type===t);c.plannedAssignmentHours=()=>10;c.plannedMonthlyHoursForEmployee=(id,d,sim=[])=>[...c.assignments,...sim].filter(a=>a.employeeId===id&&a.date.startsWith(d.slice(0,7))).length*10;c.SFBackend={companyId:'co',ready:true,empDb:new Map([['a','db-a'],['b','db-b']]),asgDb:new Map(),sync:async()=>{},hydrate:async()=>{},client:{rpc:async(name,args)=>{calls.push({name,args});return{data:name==='preview_planning_period'?{fingerprint:'snapshot',protectedIds:[]}: {created:12}}}}};c.SFCompliance={isWeekPublished:()=>false,policy:{monthlyPlanningMaxHours:190,monthlyPlanningMaxShifts:18,solidPlanningRules:{enabled:true,timezone:'Europe/Berlin',maxConsecutiveShifts:4,minFreeStartDays:2,minBlockRestHours:48,criticalCoverageGroups:[],criticalShifts:[]}}};vm.createContext(c);const index=read('index.html'),start=index.indexOf('let autoPlanPreview=[];');vm.runInContext(index.slice(start,index.indexOf('\nfunction renderOverviewStats()',start)),c);for(const file of ['solid-planning-core-v1.js','auto-plan-workspace-v1.js','individual-month-planner-v1.js','month-optimizer-core-v1.js','month-optimizer-v1.js','supabase-auto-plan-guard-v1.js'])vm.runInContext(read('assets/'+file),c);c.SFAutoPlanWorkspace.confirmApply=async()=>true;return{c,el,calls,run:s=>vm.runInContext(s,c)}}
test('six-month preview preserves assignments and commits through one atomic period RPC',async()=>{const{c,calls,run,el}=harness();assert.equal(c.autoPlanningDates().length,181);await c.SFMonthOptimizer.optimize();assert.ok(c.SFMonthOptimizer.getResult(),c.toast?.copy);assert.equal(c.assignments.length,0);assert.equal(run('autoPlanPreview.length'),12);assert.equal(calls[0].name,'preview_planning_period');assert.equal(calls[0].args.p_month_count,6);assert.match(el('autoMonthHours').innerHTML,/190 h|190|Monatsgrenzen/);await c.applyAutoPlanPreview();assert.equal(calls[1].name,'apply_planning_period');assert.equal(calls[1].args.p_month_count,6);assert.equal(calls[1].args.p_respect_weekly,true);assert.equal(calls[1].args.p_assignments.length,12);assert.equal(calls[1].args.p_assignments[0].starts_at,'2027-01-01T17:00:00.000Z')});
test('changed employee data rejects period commit before any assignment RPC',async()=>{const{c,calls}=harness();await c.SFMonthOptimizer.optimize();c.employees[0].status='inactive';await c.applyAutoPlanPreview();assert.equal(calls.length,1);assert.equal(c.assignments.length,0);assert.match(c.toast.copy,/Daten haben sich geändert/)});
test('other-company policy disables month-count expansion',()=>{const{c}=harness();c.SFCompliance.policy.solidPlanningRules={};assert.equal(c.autoPlanningDates().length,31)});

test('continuous horizon includes seven months and is capped at twelve',()=>{
 const{c,el}=harness();el('autoPlanMonth').value='2026-12';el('autoPlanMonthCount').value='7';assert.equal(c.autoPlanningDates().length,212);assert.equal(c.autoPlanningDates().at(-1),'2027-06-30');
 el('autoPlanMonthCount').value='13';assert.equal(c.autoPlanningDates().at(-1),'2027-11-30');
});

test('period seed cannot retain a duty outside exclusive employee scope',async()=>{
 const{c,run}=harness();c.SFShiftModels={allowsEmployee:(type,e)=>e.id==='a',coverageGroup:()=>null};
 c.assignments=[{id:'legacy-seed',_dbStatus:'DRAFT',employeeId:'b',date:'2027-01-01',type:'O1',start:'18:00',end:'04:00'}];
 await c.SFMonthOptimizer.optimize();assert.ok(c.SFMonthOptimizer.getResult(),c.toast?.copy);
 assert.equal(run("autoPlanPreview.some(a=>a.employeeId==='b')"),false);
 assert.equal(c.assignments[0].employeeId,'b','preview must preserve persisted draft until apply');
});

test('an unfilled third OT2 does not prevent applying the confirmed minimum of two',async()=>{
 const{c,el,calls}=harness();el('autoPlanMonthCount').value='1';
 c.employees.forEach(e=>e.shifts=['OT2']);c.TYPES=[{id:'OT2',start:'08:00',end:'18:00'}];c.globalSoll={OT2:3};c.getSoll=d=>d==='2027-01-01'?3:0;
 c.SFCompliance.policy.solidPlanningRules.criticalShifts=[{code:'OT2',minimum:2,weekdays:[5]}];
 // Only the first Friday has planning demand and employees; later Friday minima still block.
 await c.SFMonthOptimizer.optimize();assert.equal(c.SFMonthOptimizer.getResult().criticalOpen,8);
 c.SFCompliance.policy.solidPlanningRules.criticalShifts=[{code:'OT2',minimum:2,weekdays:[5]}];
 c.assignments=['2027-01-08','2027-01-15','2027-01-22','2027-01-29'].flatMap(date=>['x','y'].map(employeeId=>({id:date+employeeId,employeeId,date,type:'OT2',start:'08:00',end:'18:00',_dbStatus:'PUBLISHED'})));
 await c.SFMonthOptimizer.optimize();assert.equal(c.SFMonthOptimizer.getResult().criticalOpen,0);
 await c.applyAutoPlanPreview();assert.equal(calls.at(-1).name,'apply_planning_period');assert.equal(calls.at(-1).args.p_assignments.length,2);
});

test('movable next-month drafts do not block a valid cross-month replacement',async()=>{
 const{c,el,run}=harness();el('autoPlanMonthCount').value='2';c.document.querySelector=()=>null;
 c.getSoll=d=>['2027-01-31','2027-02-01','2027-02-02'].includes(d)?1:0;
 c.SFCompliance.policy.solidPlanningRules.confirmedRulesVersion=2;
 c.assignments=['a','b'].flatMap(employeeId=>[1,2,3,4].map(n=>({id:employeeId+n,employeeId,date:'2027-02-0'+n,type:'O1',start:'18:00',end:'04:00',_dbStatus:'DRAFT'})));
 await c.SFMonthOptimizer.optimize();assert.ok(c.SFMonthOptimizer.getResult(),c.toast?.copy);
 assert.equal(run("autoPlanPreview.filter(a=>a.date==='2027-01-31').length"),1);
 assert.equal(c.assignments.length,8,'preview does not mutate the current draft');
 const preview=run('autoPlanPreview');for(const employee of c.employees)assert.equal(c.SFSolidPlanningCore.errors(employee,preview,c.SFCompliance.policy.solidPlanningRules).length,0);
});

