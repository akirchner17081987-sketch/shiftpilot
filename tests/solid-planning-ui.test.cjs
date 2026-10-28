const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');const read=p=>fs.readFileSync(new URL('../'+p,'file://'+__filename),'utf8');
function weekendFixture(count=4){
 const h=harness(),{c,el}=h;el('autoPlanMonthCount').value='1';c.document.querySelector=()=>null;
 c.employees=Array.from({length:count},(_,n)=>({id:'ot-'+n,personnelNo:String(n),status:'active',shifts:['OT'],first:'Test',last:String(n),employment:'Vollzeit',monthlyHours:180,weeklyHours:40}));
 c.SFBackend.empDb=new Map(c.employees.map(e=>[e.id,'db-'+e.id]));c.TYPES=[{id:'OT',start:'08:00',end:'18:00'}];c.globalSoll={OT:3};
 c.getSoll=date=>c.SFSolidPlanningCore.weekday(date)>5?3:0;
 Object.assign(c.SFCompliance.policy.solidPlanningRules,{confirmedRulesVersion:2,maxCalendarWeekHours:55,criticalShifts:[{code:'OT',minimum:3,weekdays:[6,7]}]});
 return h;
}
test('January weekend OT reserves three different employees every Saturday and Sunday',async()=>{
 const {c,run,el}=weekendFixture();await c.SFMonthOptimizer.optimize();const result=c.SFMonthOptimizer.getResult();assert.ok(result,c.toast?.copy);assert.equal(result.criticalOpen,0);
 const preview=run('autoPlanPreview');assert.equal(preview.length,30);
 for(const date of c.autoPlanningDates().filter(d=>c.SFSolidPlanningCore.weekday(d)>5))assert.equal(new Set(preview.filter(a=>a.date===date&&a.type==='OT').map(a=>a.employeeId)).size,3,date);
 assert.match(el('autoRuleText').innerHTML,/OT · Wochenenden/);assert.match(el('autoRuleText').innerHTML,/Mindestens 3 OT-Mitarbeiter/);
 for(const e of c.employees)assert.deepEqual(Array.from(c.SFSolidPlanningCore.errors(e,preview,c.SFCompliance.policy.solidPlanningRules)),[]);
});
test('weekend OT shortage blocks UI and programmatic apply without issuing a commit',async()=>{
 const {c,calls,el}=weekendFixture(2);await c.SFMonthOptimizer.optimize();assert.ok(c.SFMonthOptimizer.getResult().criticalOpen>=10);
 assert.equal(el('applyAutoPlanBtn').disabled,true);await c.applyAutoPlanPreview();assert.equal(calls.filter(x=>x.name==='apply_planning_period').length,0);assert.match(c.toast.copy,/Pflichtpositionen/);
});
test('background payload includes normal weekend OT as critical and preserves the minimum after checkpoints',async()=>{
 const {c,run}=weekendFixture();let payload;c.SFBackgroundAutoPlanCore=require('../assets/background-auto-plan-core-v1.js');
 c.SFBackgroundPlanning={available:()=>true,render(){},start:async value=>{payload=JSON.parse(JSON.stringify(value));throw Error('capture weekend fixture')}};
 c.console={...console,error(){}};await c.SFMonthOptimizer.optimize();assert.ok(payload);
 assert.equal(payload.minimumInput.criticalCapacities.filter(([key,n])=>key.endsWith('|OT')&&n===3).length,10);
 const C=c.SFBackgroundAutoPlanCore;let cp=C.start(payload),steps=0;
 while(cp.stage!=='done'){const runner=C.context(payload,cp);for(let n=0;n<500&&cp.stage!=='done';n++)if(!runner.step())break;cp=JSON.parse(JSON.stringify(cp));assert.ok(++steps<100);}
 const preview=C.result(payload,cp).preview;
 for(const date of c.autoPlanningDates().filter(d=>c.SFSolidPlanningCore.weekday(d)>5))assert.equal(new Set(preview.filter(a=>a.date===date&&a.type==='OT').map(a=>a.employeeId)).size,3,date);
 assert.equal(run('assignments.length'),0);
});
function harness(){const fields=new Map(),el=id=>{if(!fields.has(id))fields.set(id,{value:'',checked:true,disabled:false,hidden:false,textContent:'',innerHTML:'',dataset:{},classList:{toggle(){}}});return fields.get(id)};el('autoPlanPeriod').value='month';el('autoPlanMonth').value='2027-01';el('autoPlanMonthCount').value='6';const calls=[],c={console,Date,Map,Set,Intl,setTimeout:(f,ms)=>ms>=30000?setTimeout(f,ms):(f(),0),clearTimeout,document:{readyState:'loading',getElementById:el,querySelectorAll:()=>[],addEventListener(){}},employees:['a','b'].map(id=>({id,personnelNo:id,status:'active',shifts:['O1'],first:id,last:id,employment:'Teilzeit',monthlyHours:20,weeklyHours:40})),assignments:[],absences:[],timeEntries:{},TYPES:[{id:'O1',start:'18:00',end:'04:00'}],globalSoll:{O1:1},dailySoll:{},weekStart:new Date('2027-01-04T12:00:00Z'),iso:d=>d.toISOString().slice(0,10),addDays:(d,n)=>new Date(+d+n*86400000),absent:()=>false,employeeMonthlyTarget:e=>e.monthlyHours,showSaveToast:(title,copy)=>c.toast={title,copy},renderCalendar(){},saveAll(){}};c.window=c;c.typeById=id=>c.TYPES.find(t=>t.id===id);c.getSoll=d=>Number(+d.slice(-2)<=2);c.assignmentsFor=(d,t)=>c.assignments.filter(a=>a.date===d&&a.type===t);c.plannedAssignmentHours=()=>10;c.plannedMonthlyHoursForEmployee=(id,d,sim=[])=>[...c.assignments,...sim].filter(a=>a.employeeId===id&&a.date.startsWith(d.slice(0,7))).length*10;c.SFBackend={companyId:'co',ready:true,empDb:new Map([['a','db-a'],['b','db-b']]),asgDb:new Map(),sync:async()=>{},hydrate:async()=>{},client:{rpc:async(name,args)=>{calls.push({name,args});return{data:name==='preview_planning_period'?{fingerprint:'snapshot',protectedIds:[]}: {created:12}}}}};c.SFCompliance={isWeekPublished:()=>false,policy:{monthlyPlanningMaxHours:190,monthlyPlanningMaxShifts:18,solidPlanningRules:{enabled:true,timezone:'Europe/Berlin',maxConsecutiveShifts:4,minFreeStartDays:2,minBlockRestHours:48,criticalCoverageGroups:[],criticalShifts:[]}}};vm.createContext(c);const index=read('index.html'),start=index.indexOf('let autoPlanPreview=[];');vm.runInContext(index.slice(start,index.indexOf('\nfunction renderOverviewStats()',start)),c);for(const file of ['solid-planning-core-v1.js','auto-plan-workspace-v1.js','individual-month-planner-v1.js','month-optimizer-core-v1.js','month-optimizer-v1.js','supabase-auto-plan-guard-v1.js'])vm.runInContext(read('assets/'+file),c);c.SFAutoPlanWorkspace.confirmApply=async()=>true;return{c,el,calls,run:s=>vm.runInContext(s,c)}}
test('six-month preview preserves assignments and commits through one atomic period RPC',async()=>{const{c,calls,run,el}=harness();assert.equal(c.autoPlanningDates().length,181);await c.SFMonthOptimizer.optimize();assert.ok(c.SFMonthOptimizer.getResult(),c.toast?.copy);assert.equal(c.assignments.length,0);assert.equal(run('autoPlanPreview.length'),12);assert.equal(calls[0].name,'preview_planning_period');assert.equal(calls[0].args.p_month_count,6);assert.match(el('autoMonthHours').innerHTML,/Prüfergebnis:|Gesamtobjekt/);assert.doesNotMatch(el('autoMonthHours').innerHTML,/Verbindlich:|automatische Dienste pro Monat/);await c.applyAutoPlanPreview();assert.equal(calls[1].name,'apply_planning_period');assert.equal(calls[1].args.p_month_count,6);assert.equal(calls[1].args.p_respect_weekly,true);assert.equal(calls[1].args.p_assignments.length,12);assert.equal(calls[1].args.p_assignments[0].starts_at,'2027-01-01T17:00:00.000Z')});
test('changed employee data rejects period commit before any assignment RPC',async()=>{const{c,calls}=harness();await c.SFMonthOptimizer.optimize();c.employees[0].status='inactive';await c.applyAutoPlanPreview();assert.equal(calls.length,1);assert.equal(c.assignments.length,0);assert.match(c.toast.copy,/Daten haben sich geändert/)});
test('period planning retains its original comparison baseline before replacing movable drafts',async()=>{
 const{c,el,run}=harness();el('autoPlanMonthCount').value='1';c.assignments=[{id:'existing',employeeId:'a',date:'2027-01-01',type:'O1',start:'18:00',end:'04:00',_dbStatus:'DRAFT'}];
 await c.SFMonthOptimizer.optimize();const result=c.SFMonthOptimizer.getResult();assert.ok(result,c.toast?.copy);assert.equal(result.reviewBefore.rows.length,1);assert.equal(result.reviewBefore.rows[0].employeeId,'a');assert.equal(result.reviewBefore.openCount,1);assert.match(el('autoPlanComparison').innerHTML,/Was verändert der Vorschlag/);assert.match(el('autoMonthHours').innerHTML,/Warum fehlen Stunden/);
 const before=JSON.stringify(result.reviewBefore);run('autoPlanPreview.pop()');c.SFMonthOptimizer.refreshPreview();assert.equal(JSON.stringify(result.reviewBefore),before);assert.equal(c.assignments[0].id,'existing');
});
test('background planning persists and restores the comparison baseline with the saved proposal',async()=>{
 const{c,el,run}=harness();el('autoPlanMonthCount').value='1';await c.SFMonthOptimizer.optimize();const preview=JSON.parse(JSON.stringify(run('autoPlanPreview')));let payload;
 c.SFBackgroundAutoPlanCore=require('../assets/background-auto-plan-core-v1.js');c.SFBackgroundPlanning={available:()=>true,render(){},start:async value=>{payload=JSON.parse(JSON.stringify(value));throw Error('stop fixture after payload capture')}};
 await c.SFMonthOptimizer.optimize();assert.equal(payload.metadata.reviewBefore.version,1);assert.equal(payload.metadata.reviewBefore.dates.length,31);
 const job={id:'saved-job',company_id:'co',first_month:'2027-01-01',month_count:1,result:{preview,metadata:payload.metadata}};
 await c.SFMonthOptimizer.restoreBackground(job);assert.ok(c.SFMonthOptimizer.getResult(),c.toast?.copy);assert.deepEqual(c.SFMonthOptimizer.getResult().reviewBefore,payload.metadata.reviewBefore);assert.match(el('autoPlanComparison').innerHTML,/Was verändert/);
 delete job.result.metadata.reviewBefore;await c.SFMonthOptimizer.restoreBackground(job);assert.match(el('autoPlanComparison').innerHTML,/Was verändert/);assert.equal(c.SFMonthOptimizer.getResult().reviewBefore.openCount,2);
 await c.SFMonthOptimizer.restoreBackground(job,false,{canApply:false,open:2,errors:1,spread:10});assert.match(el('autoMonthHours').innerHTML,/Manuelle Entscheidung erforderlich/);assert.match(el('autoMonthHours').innerHTML,/2 Pflichtpositionen offen · 1 Regelkonflikte/);assert.equal(el('applyAutoPlanBtn').disabled,true);
});
test('directly opened autonomous jobs always use the server review status and fail closed',async()=>{
 const {c,el,run,calls}=harness();el('autoPlanMonthCount').value='1';await c.SFMonthOptimizer.optimize();const preview=JSON.parse(JSON.stringify(run('autoPlanPreview')));let payload;
 c.SFBackgroundAutoPlanCore=require('../assets/background-auto-plan-core-v1.js');c.SFBackgroundPlanning={available:()=>true,render(){},start:async value=>{payload=JSON.parse(JSON.stringify(value));throw Error('capture fixture')}};
 await c.SFMonthOptimizer.optimize();payload.metadata.autonomousRunId='autonomous-run';const job={id:'autonomous-job',company_id:'co',first_month:'2027-01-01',month_count:1,result:{preview,metadata:payload.metadata}};
 const original=c.SFBackend.client.rpc;let serverRun={id:'autonomous-run',background_job_id:'autonomous-job',status:'REVIEW',current_data:true,summary:{canApply:false,open:2,errors:0,spread:10}};
 c.SFBackend.client.rpc=async(name,args)=>name==='autonomous_planning_control'?{data:{runs:serverRun?[serverRun]:[]}}:original(name,args);
 await c.SFMonthOptimizer.restoreBackground(job);assert.equal(el('applyAutoPlanBtn').disabled,true);assert.match(el('autoMonthHours').innerHTML,/2 Pflichtpositionen offen/);const count=calls.filter(x=>x.name==='apply_planning_period').length;await c.SFMonthOptimizer.apply();assert.equal(calls.filter(x=>x.name==='apply_planning_period').length,count);
 serverRun=null;await c.SFMonthOptimizer.restoreBackground(job);assert.equal(el('applyAutoPlanBtn').disabled,true);assert.match(el('autoMonthHours').innerHTML,/Prüfstand ist nicht verfügbar/);
 serverRun={id:'autonomous-run',background_job_id:'autonomous-job',status:'ASSESSING',current_data:true,summary:null};await c.SFMonthOptimizer.restoreBackground(job);assert.equal(el('applyAutoPlanBtn').disabled,true);assert.match(el('autoMonthHours').innerHTML,/Prüfstand ist nicht verfügbar/);
 serverRun={id:'autonomous-run',background_job_id:'autonomous-job',status:'READY',current_data:true,summary:{canApply:true,open:0,errors:0,spread:0}};await c.SFMonthOptimizer.restoreBackground(job);assert.equal(c.SFMonthOptimizer.getResult().autonomousAssurance.canApply,true);
 serverRun.current_data=false;await c.SFMonthOptimizer.restoreBackground(job);assert.equal(el('applyAutoPlanBtn').disabled,true);
});
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


test('fixed OT crew is prepared as three shared daily positions and reaches 210 hours each in January',async()=>{
 const {c,el,run}=harness();el('autoPlanMonthCount').value='1';c.document.querySelector=()=>null;c.getSoll=()=>0;
 c.employees=['a','b','c'].map(id=>({id,_dbId:'db-'+id,personnelNo:id,status:'active',shifts:['OT1','OT2','OT3'],first:id,last:id,employment:'Vollzeit',monthlyHours:220,weeklyHours:50,maxWeeklyHours:50,maxConsecutiveShifts:5}));
 c.TYPES=[{id:'OT1',start:'06:00',end:'16:00'},{id:'OT2',start:'08:00',end:'18:00'},{id:'OT3',start:'10:00',end:'20:00'}];
 const rules=c.SFCompliance.policy.solidPlanningRules;Object.assign(rules,{confirmedRulesVersion:2,otOnlyMonthlyMaxHours:220,otOnlyMaxCalendarWeekHours:50,otOnlyMaxConsecutiveShifts:5,otOnlyMinFreeCalendarDays:2,otOnlyMinBlockRestHours:48,otWeekdayRoster:{employeeIds:['db-a','db-b','db-c'],weekdays:[1,2,3,4,5]},conditionalStaffing:[{shift:'OT1',sourceShift:'O3',sourceDayOffset:-1,coverageStart:'06:00',coverageEnd:'08:00',minimum:3,fallbackCount:1},{shift:'OT3',sourceShift:'O1',sourceDayOffset:0,coverageStart:'18:00',coverageEnd:'20:00',minimum:3,fallbackCount:1}]});
 for(const date of c.autoPlanningDates().filter(d=>c.SFSolidPlanningCore.weekday(d)<=5))for(let n=0;n<3;n++){c.assignments.push({id:date+'o3'+n,employeeId:'night'+n,date:c.SFSolidPlanningCore.plus(date,-1),type:'O3',start:'22:00',end:'08:00',_dbStatus:'PUBLISHED',publishedAt:'2026-10-01'});c.assignments.push({id:date+'o1'+n,employeeId:'early'+n,date,type:'O1',start:'18:00',end:'04:00',_dbStatus:'PUBLISHED',publishedAt:'2026-10-01'});}
 await c.SFMonthOptimizer.optimize();assert.ok(c.SFMonthOptimizer.getResult(),c.toast?.copy);const preview=run('autoPlanPreview');for(const e of c.employees)assert.equal(preview.filter(a=>a.employeeId===e.id).length,21);assert.ok(preview.every(a=>a.type==='OT2'));assert.equal(c.SFMonthOptimizer.getResult().criticalOpen,0);assert.equal(preview.length,63);
});

function recoveryFixture(){
 const h=harness(),{c,el}=h;el('autoPlanMonthCount').value='1';c.document.querySelector=()=>null;
 c.employees=[{id:'a',_dbId:'db-a',personnelNo:'2037',first:'Test',last:'Person',status:'active',shifts:['O2','O3'],employment:'Vollzeit',monthlyHours:180,weeklyHours:40,maxWeeklyHours:55,maxConsecutiveShifts:4,rhythmMode:'required',rhythmStart:'2027-01-21',rhythmPattern:'ALLE,ALLE,ALLE,ALLE,FREI,FREI,FREI,ALLE,ALLE,ALLE,FREI,FREI'}];
 c.TYPES=[{id:'O2',start:'20:00',end:'06:00'},{id:'O3',start:'22:00',end:'08:00'}];c.globalSoll={O2:1,O3:0};
 c.getSoll=(d,t)=>Number(t==='O2'&&d>='2027-01-28'&&d<='2027-01-30');
 Object.assign(c.SFCompliance.policy.solidPlanningRules,{confirmedRulesVersion:2,maxConsecutiveNightShifts:4,minFreeCalendarDays:2,minNightRecoveryCalendarDays:2,threeNightBlockRecoveryFullCalendarDays:1,maxCalendarWeekHours:55,monthlyMaxHours:190,tenHourMaxShifts:18});
 c.assignments=[...['21','22','23','24'].map(n=>({date:'2027-01-'+n,type:'O3'})),{date:'2027-02-02',type:'O2'},{date:'2027-02-03',type:'O3'},{date:'2027-02-04',type:'O3'}].map((a,i)=>({...a,id:'base-'+i,employeeId:'a',start:c.typeById(a.type).start,end:c.typeById(a.type).end,_dbStatus:'PUBLISHED',publishedAt:'2026-10-01'}));
 vm.runInContext(read('assets/employee-rhythm-v1.js'),c);
 return h;
}
test('200-hour OT preview staggers days off and allows confirming the two-person minimum',async()=>{
 const {c,el,run,calls}=harness();el('autoPlanMonth').value='2028-03';el('autoPlanMonthCount').value='1';c.document.querySelector=()=>null;c.getSoll=()=>0;
 c.employees=['a','b','c'].map(id=>({id,_dbId:'db-'+id,first:id,last:id,status:'active',shifts:['OT1','OT2','OT3'],employment:'Vollzeit',monthlyHours:220,weeklyHours:40,maxWeeklyHours:55,maxConsecutiveShifts:5}));
 c.TYPES=[{id:'OT1',start:'06:00',end:'16:00'},{id:'OT2',start:'08:00',end:'18:00'},{id:'OT3',start:'10:00',end:'20:00'}];
 Object.assign(c.SFCompliance.policy.solidPlanningRules,{confirmedRulesVersion:2,otOnlyMonthlyMaxHours:200,otOnlyMaxCalendarWeekHours:55,otOnlyMaxConsecutiveShifts:5,otOnlyMinFreeCalendarDays:2,otOnlyMinBlockRestHours:48,otWeekdayRoster:{employeeIds:['db-a','db-b','db-c'],weekdays:[1,2,3,4,5],allowDaysOff:true,minimumDailyStaff:2},conditionalStaffing:[{shift:'OT1',sourceShift:'O3',sourceDayOffset:-1,coverageStart:'06:00',coverageEnd:'08:00',minimum:3,fallbackCount:1},{shift:'OT3',sourceShift:'O1',sourceDayOffset:0,coverageStart:'18:00',coverageEnd:'20:00',minimum:3,fallbackCount:1}]});
 for(const date of c.autoPlanningDates().filter(d=>c.SFSolidPlanningCore.weekday(d)<=5))for(let n=0;n<3;n++){c.assignments.push({id:date+'night'+n,employeeId:'night'+n,date:c.SFSolidPlanningCore.plus(date,-1),type:'O3',start:'22:00',end:'08:00',_dbStatus:'PUBLISHED',publishedAt:'2026-10-01'});c.assignments.push({id:date+'early'+n,employeeId:'early'+n,date,type:'O1',start:'18:00',end:'04:00',_dbStatus:'PUBLISHED',publishedAt:'2026-10-01'});}
 await c.SFMonthOptimizer.optimize();assert.ok(c.SFMonthOptimizer.getResult(),c.toast?.copy);const preview=run('autoPlanPreview');
 for(const e of c.employees)assert.equal(preview.filter(a=>a.employeeId===e.id).length,20);
 assert.equal(c.SFMonthOptimizer.getResult().criticalOpen,0);assert.equal(run('autoPlanUnresolved.length'),9);
 assert.equal(el('autoUnresolvedCount').textContent,0,'allowed OT days off are not displayed as mandatory gaps');assert.match(el('autoStats').innerHTML,/Pflichtpositionen besetzt/);assert.match(el('autoMonthHours').innerHTML,/0 Pflichtpositionen offen/);
 await c.applyAutoPlanPreview();assert.equal(calls.at(-1).name,'apply_planning_period');assert.equal(calls.at(-1).args.p_assignments.length,60);
});
test('candidate collection retains the complete three-night block despite the last night failing alone',async()=>{
 const {c,run,el}=recoveryFixture(),before=JSON.stringify(c.assignments);
 assert.equal(c.SFAutoPlanGuard.passesTimeRules('a','O2','2027-01-30'),false);
 const input=c.SFMonthOptimizer.solidBuild(c.assignments,'2027-01',[]),group=input.groups.find(g=>g.id==='a|2027-01-28');
 assert.ok(group?.options.some(o=>o.length===3&&o.every(a=>a.type==='O2')));
 assert.equal(c.SFAutoPlanGuard.passesTimeRules('a','O2','2027-01-30'),false,'candidate mode never leaks into final/manual checks');
 await c.SFMonthOptimizer.optimize();assert.ok(c.SFMonthOptimizer.getResult(),c.toast?.copy);
 assert.deepEqual(Array.from(run('autoPlanPreview'),a=>a.date),['2027-01-28','2027-01-29','2027-01-30']);
 assert.equal(JSON.stringify(c.assignments),before);
 assert.match(el('autoMonthHours').innerHTML,/vollständigen Arbeitsblock/);
 const B=require('../assets/background-auto-plan-core-v1.js'),packed=B.pack(input),payload={version:1,months:['2027-01'],minimumInput:{...packed,groups:[],reserved:[],criticalCapacities:[]},monthInputs:[packed],metadata:{}};
 let cp=B.start(payload);for(let i=0;i<5000&&cp.stage!=='done';i++){const runner=B.context(payload,cp);for(let n=0;n<20&&cp.stage!=='done';n++)if(!runner.step())break;cp=JSON.parse(JSON.stringify(cp));}
 assert.equal(cp.stage,'done');const planned=B.result(payload,cp).preview;assert.equal(planned.length,3);
 assert.equal(c.SFSolidPlanningCore.errors(c.employees[0],[...c.assignments,...planned],c.SFCompliance.policy.solidPlanningRules,planned.map(a=>a.date)).length,0);
});
test('deferring candidate recovery never permits a complete block with insufficient rest',()=>{
 const {c}=recoveryFixture();c.assignments.find(a=>a.date==='2027-02-02').date='2027-02-01';
 const input=c.SFMonthOptimizer.solidBuild(c.assignments,'2027-01',[]);assert.equal(input.groups.some(g=>g.options.length),false);
});
test('candidate mode keeps immediate rest checks and restores normal recovery checks after an exception',()=>{
 const {c}=recoveryFixture();
 assert.throws(()=>c.SFAutoPlanGuard.withBlockCandidates(()=>{throw Error('test failure')}),/test failure/);
 assert.equal(c.SFAutoPlanGuard.passesTimeRules('a','O2','2027-01-30'),false);
 c.assignments.push({id:'near',employeeId:'a',date:'2027-01-27',type:'O3',start:'22:00',end:'08:00'});
 assert.equal(c.SFAutoPlanGuard.withBlockCandidates(()=>c.SFAutoPlanGuard.passesTimeRules('a','O2','2027-01-28')),false,'O3 to earlier night remains blocked');
 assert.equal(c.SFAutoPlanGuard.withBlockCandidates(()=>c.SFAutoPlanGuard.passesTimeRules('a','O2','2027-01-27')),false,'overlap remains blocked');
});

test('apply reports pending save separately from a failed refresh and prevents duplicate RPCs',async()=>{
 const {c,calls}=harness();await c.SFMonthOptimizer.optimize();const phases=[],finished=[];let save,refresh;
 c.SFAutoPlanWorkspace.startApply=()=>({phase:n=>phases.push(n),update(){},paint:async()=>{},finish:x=>finished.push(x)});
 const oldRpc=c.SFBackend.client.rpc;c.SFBackend.client.rpc=async(name,args)=>{if(name==='apply_planning_period'){calls.push({name,args});return new Promise(resolve=>save=resolve)}return oldRpc(name,args)};
 c.SFBackend.hydrate=()=>new Promise((resolve,reject)=>refresh=reject);
 const pending=c.applyAutoPlanPreview();while(!save)await new Promise(r=>setTimeout(r,1));
 assert.equal(c.SFBackend.autoPlanApplying,true);assert.equal(phases.at(-1),1);assert.equal(finished.length,0);await c.applyAutoPlanPreview();assert.equal(calls.filter(x=>x.name==='apply_planning_period').length,1);
 save({data:{},error:null});while(!refresh)await new Promise(r=>setTimeout(r,1));assert.equal(phases.at(-1),2);assert.equal(finished.length,0);
 refresh(Error('Test: Ansicht nicht erreichbar'));await pending;assert.equal(finished[0].saved,true);assert.match(finished[0].copy,/gespeichert.*Ansicht/);assert.equal(c.SFBackend.autoPlanApplying,undefined);assert.equal(c.SFMonthOptimizer.getResult(),null);
});
test('a rejected apply retains the proposal and presents the server error without success',async()=>{
 const {c}=harness();await c.SFMonthOptimizer.optimize();let outcome;
 c.SFAutoPlanWorkspace.startApply=()=>({phase(){},update(){},paint:async()=>{},finish:x=>outcome=x});c.SFBackend.client.rpc=async()=>({error:{message:'Test: Entwurf nicht gespeichert'}});
 await c.applyAutoPlanPreview();assert.equal(outcome.saved,false);assert.match(outcome.error,/nicht gespeichert/);assert.ok(c.SFMonthOptimizer.getResult());assert.equal(c.SFMonthOptimizer.isBusy(),false);
});
test('data changed during yielding validation is rejected before saving',async()=>{
 const {c,calls}=harness();await c.SFMonthOptimizer.optimize();let paints=0,outcome;
 c.SFAutoPlanWorkspace.startApply=()=>({phase(){},update(){},paint:async()=>{if(++paints===2)c.employees[0].last='Extern geändert'},finish:x=>outcome=x});
 await c.applyAutoPlanPreview();assert.equal(calls.filter(x=>x.name==='apply_planning_period').length,0);assert.match(outcome.error,/Daten haben sich geändert/);
});
test('a change during the last paint before saving cannot bypass the final data check',async()=>{
 const {c,calls}=harness();await c.SFMonthOptimizer.optimize();let stage=0,outcome;
 c.SFAutoPlanWorkspace.startApply=()=>({phase:n=>stage=n,update(){},paint:async()=>{if(stage===1)c.employees[0].last='Zwischenzeitlich geändert'},finish:x=>outcome=x});
 await c.applyAutoPlanPreview();assert.equal(calls.filter(x=>x.name==='apply_planning_period').length,0);assert.match(outcome.error,/Daten haben sich geändert/);
});

test('hours results omit the retired weekend goal but retain the actual hours and other deviations',async()=>{
 const {c,el}=harness();Object.assign(c.SFCompliance.policy.solidPlanningRules,{weekendPlanningByRhythm:true,minFreeWeekendsPerMonth:1});await c.SFMonthOptimizer.optimize();
 assert.ok(c.SFMonthOptimizer.getResult(),c.toast?.copy);assert.doesNotMatch(el('autoMonthHours').innerHTML,/fehlende freie Wochenenden/);assert.match(el('autoMonthHours').innerHTML,/Prüfergebnis:|Gesamtobjekt/);
});

test('fixed options show status text while valid legacy controls return after a company policy change',()=>{
 const {c,el,run}=harness();Object.assign(c.SFCompliance.policy.solidPlanningRules,{confirmedRulesVersion:2});c.document.querySelector=()=>null;
 run('renderAutoPlanning()');assert.equal(el('autoRespectHours').hidden,true);assert.equal(el('autoRespectHours').checked,true);assert.equal(el('autoRespectHours').disabled,true);assert.equal(el('autoHoursStatus').textContent,'Verbindlich aktiv');
 assert.equal(el('autoIndividualBlocks').hidden,true);assert.equal(el('autoBlocksStatus').textContent,'Automatisch durch Planungsregeln gesteuert');assert.equal(el('autoBlocksTitle').textContent,'Arbeitsblöcke und Erholung');assert.match(el('autoIndividualBlocksHint').textContent,/hinterlegten Regeln dieses Unternehmens/);assert.doesNotMatch(el('autoIndividualBlocksHint').textContent,/nicht verfügbar|SD und ND/);assert.equal(el('optimizeAutoMonthBtn').hidden,true);
 c.SFCompliance.policy.solidPlanningRules={};run('renderAutoPlanning()');assert.equal(el('autoRespectHours').hidden,false);assert.equal(el('autoRespectHours').disabled,false);assert.equal(el('autoHoursStatus').hidden,true);
 assert.equal(el('autoBlocksStatus').textContent,'Für dieses Schichtmodell nicht verfügbar');assert.equal(el('autoBlocksOption').hidden,true);assert.equal(el('optimizeAutoMonthBtn').hidden,false);
 c.TYPES=[{id:'SD',start:'14:00',end:'22:00'},{id:'ND',start:'22:00',end:'06:00'}];c.plannedAssignmentHours=()=>8;run('renderAutoPlanning()');
 assert.equal(el('autoBlocksOption').hidden,false);assert.equal(el('autoIndividualBlocks').hidden,false);assert.equal(el('autoIndividualBlocks').disabled,false);assert.equal(el('autoBlocksStatus').hidden,true);assert.equal(el('autoBlocksTitle').textContent,'Individuelle Blockplanung im Monat');
 c.employees.forEach(e=>e.shifts=['SD','ND']);run('renderAutoPlanning()');assert.equal(el('optimizeAutoMonthBtn').hidden,true,'individual primary action already optimizes');
 el('autoIndividualBlocks').checked=false;run('renderAutoPlanning()');assert.equal(el('optimizeAutoMonthBtn').hidden,false,'legacy fill-only mode retains the distinct draft optimizer');
 assert.equal(c.assignments.length,0);
});
