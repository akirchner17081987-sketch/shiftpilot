import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=read('index.html');
const planning=index.slice(index.indexOf('let autoPlanPreview=[];'),index.indexOf('\nfunction renderOverviewStats()',index.indexOf('let autoPlanPreview=[];')));
function harness(){
 const fields=new Map(),id=name=>{if(!fields.has(name))fields.set(name,{value:'',checked:true,disabled:false,hidden:false,textContent:'',innerHTML:'',classList:{toggle(){}}});return fields.get(name)};
 id('autoPlanPeriod').value='date';id('autoPlanDate').value='2026-12-01';id('autoPlanMonth').value='2026-12';id('autoPlanWeekDate').value='2026-11-30';
 const c={window:{SFBackend:{companyId:'a'},SchichtFunkCalendarView:{setMonth(){},setMode(){}}},document:{readyState:'loading',addEventListener(){},getElementById:id,querySelectorAll:()=>[]},Date,Map,setTimeout,console,employees:[{id:'e',first:'Fiktive',last:'Person',status:'active',employment:'Vollzeit',shifts:['FD'],weeklyHours:40}],assignments:[],TYPES:[{id:'FD',name:'Frühdienst',start:'06:00',end:'14:00'}],weekStart:new Date(2026,8,28),iso:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,addDays:(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x},typeById:t=>c.TYPES.find(x=>x.id===t),getSoll:()=>1,assignmentsFor:(d,t)=>c.assignments.filter(a=>a.date===d&&a.type===t),absent:()=>false,plannedAssignmentHours:()=>8,employeeMonthlyTarget:()=>180,plannedMonthlyHoursForEmployee:id=>c.assignments.filter(a=>a.employeeId===id).length*8,showSaveToast(){},saveAll(){c.saved=(c.saved||0)+1},renderCalendar(){}};
 vm.runInNewContext(planning,c);vm.runInNewContext(read('assets/auto-plan-workspace-v1.js'),c);c.window.SFAutoPlanWorkspace.confirmApply=async()=>true;
 return{c,id,api:c.window.SFAutoPlanWorkspace,run:code=>vm.runInNewContext(code,c)};
}
test('before analysis: only one date field is enabled for display, result counts are unknown and no success is claimed',()=>{
 const {c,id}=harness();c.renderAutoPlanning();assert.equal(id('autoPlanWeekField').hidden,true);assert.equal(id('autoPlanMonthField').hidden,true);assert.equal(id('autoPlanDateField').hidden,false);assert.equal(id('autoResults').hidden,true);assert.match(id('autoStats').innerHTML,/Analyse noch nicht gestartet/);assert.doesNotMatch(id('autoAnalysis').innerHTML,/is-good|Keine Auffälligkeiten|vollständig/);
});
test('generated suggestions stay separate from assignments; removing a suggestion makes it visibly open again',()=>{
 const {c,id}=harness();c.generateAutoPlanPreview();assert.equal(c.assignments.length,0);assert.equal(id('autoSuggestionCount').textContent,1);assert.equal(id('autoUnresolvedCount').textContent,0);assert.equal(id('applyAutoPlanBtn').disabled,false);
 c.removeAutoSuggestion(0);assert.equal(id('autoUnresolvedCount').textContent,1);assert.match(id('autoUnresolved').innerHTML,/von dir entfernt/);assert.equal(id('applyAutoPlanBtn').disabled,true);
});
test('no matching shift permission gives an actionable reason and no misleading successful result',()=>{
 const {c,id}=harness();c.employees[0].shifts=[];c.generateAutoPlanPreview();assert.match(id('autoUnresolved').innerHTML,/Freigabe für FD/);assert.match(id('autoAnalysis').innerHTML,/is-warning/);assert.doesNotMatch(id('autoAnalysis').innerHTML,/is-good/);
});
test('required rhythm and time rules are reported distinctly',()=>{
 const {api,c}=harness();c.window.sfRhythmCheck=()=>({mode:'required',allowed:false});assert.match(api.explain({type:'FD',date:'2026-12-01'}),/verbindliche Rhythmus/);c.window.sfRhythmCheck=()=>({mode:'required',allowed:true});c.window.SFAutoPlanGuard={passesTimeRules:()=>false};assert.match(api.explain({type:'FD',date:'2026-12-01'}),/Ruhezeit/);
});
test('weekly limit remains enforced and changing that optional rule resets the preview',()=>{
 const {c,id}=harness();c.employees[0].weeklyHours=4;c.generateAutoPlanPreview();assert.equal(id('autoSuggestionCount').textContent,0);assert.match(id('autoUnresolved').innerHTML,/Wochen- oder Monatsstunden/);id('autoRespectHours').checked=false;c.changeAutoPlanPeriod();assert.equal(id('autoResults').hidden,true);c.generateAutoPlanPreview();assert.equal(id('autoSuggestionCount').textContent,1);
});
test('contractual 40 hours are a distribution target; a separate 50-hour week allows the fifth ten-hour shift',()=>{
 const {c,id}=harness();id('autoPlanDate').value='2026-12-06';c.TYPES[0].start='20:00';c.TYPES[0].end='06:00';c.employees[0].maxWeeklyHours=50;c.plannedAssignmentHours=()=>10;
 c.assignments=['2026-11-30','2026-12-01','2026-12-02','2026-12-03'].map(date=>({date,type:'FD',employeeId:'e',start:'20:00',end:'06:00'}));
 const candidate=c.autoEligibleEmployees('FD','2026-12-06')[0];assert.equal(candidate.h,40);assert.equal(candidate.target,40);assert.equal(candidate.weeklyLimit,50);
 c.employees[0].maxWeeklyHours=40;assert.equal(c.autoEligibleEmployees('FD','2026-12-06').length,0);
});
test('220 monthly hours is the full-time ceiling even with weekly limits off or a higher monthly target',()=>{
 const {c,id}=harness();c.TYPES[0].start='20:00';c.TYPES[0].end='06:00';c.employeeMonthlyTarget=()=>400;id('autoRespectHours').checked=false;
 c.plannedMonthlyHoursForEmployee=()=>210;assert.equal(c.autoEligibleEmployees('FD','2026-12-01').length,1);assert.equal(c.autoEligibleEmployees('FD','2026-12-01')[0].monthLimit,220);
 for(const hours of [210.01,220,230]){c.plannedMonthlyHoursForEmployee=()=>hours;assert.equal(c.autoEligibleEmployees('FD','2026-12-01').length,0)}
});
test('part-time models remain capped at their monthly target even with weekly limits disabled',()=>{
 const {c,id}=harness();c.employees[0].employment='Teilzeit';c.employeeMonthlyTarget=()=>162;c.plannedMonthlyHoursForEmployee=()=>160;assert.equal(c.autoEligibleEmployees('FD','2026-12-01').length,0);
 id('autoRespectHours').checked=false;assert.equal(c.autoEligibleEmployees('FD','2026-12-01').length,0);c.plannedMonthlyHoursForEmployee=()=>154;assert.equal(c.autoEligibleEmployees('FD','2026-12-01').length,1);c.plannedMonthlyHoursForEmployee=()=>162;assert.equal(c.autoEligibleEmployees('FD','2026-12-01').length,0);
});
test('a full-time month preview stops at twenty-two ten-hour shifts and existing voluntary overtime remains untouched',()=>{
 const {c,id,run}=harness();id('autoPlanPeriod').value='month';id('autoRespectHours').checked=false;c.TYPES[0].start='20:00';c.TYPES[0].end='06:00';c.plannedAssignmentHours=()=>10;
 c.plannedMonthlyHoursForEmployee=(employeeId,date,sim=[])=>[...c.assignments,...sim].filter(a=>a.employeeId===employeeId&&a.date.startsWith(date.slice(0,7))).length*10;
 c.generateAutoPlanPreview();assert.equal(run('autoPlanPreview.length'),22);assert.equal(run('autoPlanUnresolved.length'),9);
 c.assignments=Array.from({length:23},(_,i)=>({date:`2026-12-${String(i+1).padStart(2,'0')}`,type:'FD',employeeId:'e',start:'20:00',end:'06:00',note:'Freiwilliger Zusatzdienst'}));const before=JSON.stringify(c.assignments);c.generateAutoPlanPreview();assert.equal(run('autoPlanPreview.length'),0);assert.equal(JSON.stringify(c.assignments),before);
});
test('an additional voluntary booking during confirmation invalidates a preview that would exceed 220 hours',async()=>{
 const {c,id,api}=harness();id('autoRespectHours').checked=false;let monthly=210;c.TYPES[0].start='20:00';c.TYPES[0].end='06:00';c.plannedMonthlyHoursForEmployee=()=>monthly;c.generateAutoPlanPreview();
 api.confirmApply=async()=>{monthly=220;return true};await c.applyAutoPlanPreview();assert.equal(c.assignments.length,0);assert.equal(c.saved,undefined);
});
test('cancel, confirmation and repeat click preserve the draft boundary',async()=>{
 const {c,api,id}=harness();c.generateAutoPlanPreview();api.confirmApply=async()=>false;await c.applyAutoPlanPreview();assert.equal(c.assignments.length,0);assert.equal(c.saved,undefined);
 let confirm;api.confirmApply=()=>new Promise(resolve=>{confirm=resolve});const first=c.applyAutoPlanPreview();await c.applyAutoPlanPreview();assert.equal(c.window.SFBackend.autoPlanApplying,true);confirm(true);await first;assert.equal(c.assignments.length,1);assert.equal(c.assignments[0].publishedAt,undefined);assert.equal(c.saved,1);assert.equal(c.window.SFBackend.autoPlanApplying,false);assert.match(id('autoAnalysis').innerHTML,/als Entwurf übernommen/);await c.applyAutoPlanPreview();assert.equal(c.assignments.length,1);
});
test('changed employee availability or company aborts before any assignment is added',async()=>{
 const {c,api}=harness();c.generateAutoPlanPreview();api.confirmApply=async()=>{c.employees[0].status='inactive';return true};await c.applyAutoPlanPreview();assert.equal(c.assignments.length,0);c.employees[0].status='active';api.confirmApply=async()=>{c.window.SFBackend.companyId='b';return true};await c.applyAutoPlanPreview();assert.equal(c.assignments.length,0);
});
test('period and rule changes invalidate the previous preview',()=>{
 const {c,id}=harness();c.generateAutoPlanPreview();id('autoPlanPeriod').value='month';c.changeAutoPlanPeriod();assert.equal(id('autoSuggestionCount').textContent,0);assert.equal(id('autoResults').hidden,true);assert.equal(id('autoPlanDateField').hidden,true);assert.equal(id('autoPlanMonthField').hidden,false);assert.equal(id('applyAutoPlanBtn').disabled,true);
});
test('publication guard checks suggestion dates, allowing December when the old September week was released',async()=>{
 const guardSource=read('assets/compliance-workflow-v2.js');const tail=guardSource.slice(guardSource.lastIndexOf("  if(typeof window.applyAutoPlanPreview==='function')"));const guard=tail.slice(0,tail.indexOf('})();'));
 const {c}=harness();c.generateAutoPlanPreview();c.window.SFCompliance={isWeekPublished:date=>date.startsWith('2026-09')};c.window.applyAutoPlanPreview=c.applyAutoPlanPreview;vm.runInNewContext('const C=window.SFCompliance;\n'+guard,c);await c.window.applyAutoPlanPreview();assert.equal(c.assignments.length,1);
});
test('already released suggestion dates and publication during confirmation cannot be saved as drafts',async()=>{
 const {c,api,id}=harness();c.generateAutoPlanPreview();let published=true;c.window.SFCompliance={isWeekPublished:()=>published};c.renderAutoPlanning();assert.equal(id('applyAutoPlanBtn').disabled,true);await c.applyAutoPlanPreview();assert.equal(c.assignments.length,0);
 published=false;api.confirmApply=async()=>{published=true;return true};await c.applyAutoPlanPreview();assert.equal(c.assignments.length,0);
});

function optionalHarness(){
 const h=harness(),{c}=h;c.sessionStorage={getItem:()=>null};c.globalSoll={FD:1,QA:1};c.dailySoll={};
 c.employees=[{id:'f',_dbId:'florian-a',first:'Florian',last:'Weiß',status:'active',shifts:['FD','QA'],weeklyHours:40},{id:'b',_dbId:'other-a',first:'Andere',last:'Person',status:'active',shifts:['FD','QA'],weeklyHours:40}];
 vm.runInNewContext(read('assets/shift-models-v1.js'),c);h.M=c.window.SFShiftModels;
 h.M.apply([{code:'FD',name:'Frühdienst',default_start:'06:00',default_end:'14:00',active:true},{code:'QA',name:'QA',default_start:'20:00',default_end:'06:00',active:true,planning_mode:'optional',optional_staffing:1,responsible_only:true,responsible_employee_id:'florian-a'}],'a');
 c.getSoll=(date,type)=>c.dailySoll[date]?.[type]??c.globalSoll[type]??0;
 c.plannedMonthlyHoursForEmployee=(id,date,sim=[])=>[...c.assignments,...sim].filter(x=>x.employeeId===id).length*8;
 c.window.autoEligibleEmployees=c.autoEligibleEmployees;c.window.applyAutoPlanPreview=c.applyAutoPlanPreview;
 vm.runInNewContext(read('assets/supabase-auto-plan-guard-v1.js'),c);c.autoEligibleEmployees=c.window.autoEligibleEmployees;
 return h;
}
test('optional QA reserves Florian when another eligible person covers the required shift',()=>{
 const {c,run}=optionalHarness();c.generateAutoPlanPreview();const preview=run('autoPlanPreview');assert.equal(c.autoOpenSlots().length,1);assert.equal(preview.length,2);assert.equal(preview[0].type,'FD');assert.equal(preview[0].employeeId,'b');assert.equal(preview[1].type,'QA');assert.equal(preview[1].employeeId,'f');assert.equal(preview[1].optional,true);assert.equal(run('autoPlanUnresolved.length'),0);
});
test('mandatory shortage uses Florian and optional QA is informational rather than a gap',()=>{
 const {c,run,id}=optionalHarness();c.employees[1].status='inactive';c.generateAutoPlanPreview();assert.equal(run('autoPlanPreview.length'),1);assert.equal(run('autoPlanPreview[0].employeeId'),'f');assert.equal(run('autoPlanUnresolved.length'),0);assert.equal(run('autoPlanOptionalSkipped.length'),1);assert.equal(id('autoUnresolvedCount').textContent,0);assert.match(id('autoSuggestions').innerHTML,/Keine Pflichtlücke/);assert.doesNotMatch(id('autoAnalysis').innerHTML,/is-warning/);
});
test('daily QA required is scheduled before another mandatory shift; daily off excludes optional QA',()=>{
 const {c,run}=optionalHarness();c.dailySoll['2026-12-01']={QA:1};c.generateAutoPlanPreview();assert.equal(run('autoPlanPreview[0].type'),'QA');assert.equal(run('autoPlanPreview[0].employeeId'),'f');assert.equal(run('autoPlanPreview[0].optional'),false);assert.equal(c.autoOptionalSlots().length,0);assert.equal(run('autoPlanPreview[1].employeeId'),'b');c.dailySoll['2026-12-01'].QA=0;c.generateAutoPlanPreview();assert.equal(run('autoPlanPreview.length'),1);assert.equal(c.autoOptionalSlots().length,0);
});
test('optional-only periods can be analyzed and removed optional suggestions never become mandatory gaps',()=>{
 const {c,run,id}=optionalHarness();c.globalSoll.FD=0;c.renderAutoPlanning();assert.equal(id('generateAutoPlanBtn').disabled,false);c.generateAutoPlanPreview();assert.equal(run('autoPlanPreview.length'),1);c.removeAutoSuggestion(0);assert.equal(run('autoPlanUnresolved.length'),0);assert.equal(run('autoPlanOptionalSkipped.length'),1);assert.equal(id('autoUnresolvedCount').textContent,0);assert.doesNotMatch(id('autoAnalysis').innerHTML,/is-warning/);
});
test('optional staffing respects hours, absence, responsible identity, weekdays and binding rhythm',()=>{
 const {c,run,M}=optionalHarness();c.globalSoll.FD=0;c.employees[0].weeklyHours=8;c.generateAutoPlanPreview();assert.equal(run('autoPlanPreview.length'),0);c.employees[0].weeklyHours=40;c.absent=id=>id==='f';c.generateAutoPlanPreview();assert.equal(run('autoPlanPreview.length'),0);c.absent=()=>false;c.window.sfRhythmCheck=()=>({mode:'required',allowed:false});c.generateAutoPlanPreview();assert.equal(run('autoPlanPreview.length'),0);delete c.window.sfRhythmCheck;M.find('QA').optionalWeekdays=[1];assert.equal(c.autoOptionalSlots().length,0);M.find('QA').optionalWeekdays=[2];assert.equal(c.autoOptionalSlots().length,1);M.find('QA').responsibleEmployeeId=null;c.generateAutoPlanPreview();assert.equal(run('autoPlanPreview.length'),0);
});
test('all mandatory days are planned before optional nights so QA cannot obstruct next-day rest',()=>{
 const {c,run,id}=optionalHarness();id('autoPlanPeriod').value='week';c.employees[1].status='inactive';c.employees[0].weeklyHours=200;c.generateAutoPlanPreview();const preview=Array.from(run('autoPlanPreview'));assert.equal(preview.filter(x=>x.type==='FD').length,7);assert.equal(preview.filter(x=>x.type==='QA').length,0);
});
test('another company with the same legacy employee ID cannot use the previous company responsibility',()=>{
 const {c,M}=optionalHarness();c.window.SFBackend.companyId='b';c.employees[0]._dbId='florian-b';M.apply([{code:'QA',active:true,planning_mode:'optional',optional_staffing:1,responsible_only:true,responsible_employee_id:'florian-b'}],'b');assert.equal(M.allowsEmployee('QA',c.employees[0]),true);assert.equal(M.allowsEmployee('QA',{id:'f',_dbId:'florian-a'}),false);assert.equal(M.requiredSoll('2026-12-01','QA',1),0);
});
test('rule changes invalidate a prepared draft and stale optional responsibility cannot be applied',async()=>{
 const {c,run,M}=optionalHarness();c.generateAutoPlanPreview();M.invalidate();assert.equal(run('autoPlanPreview.length'),0);assert.equal(run('autoPlanAnalyzed'),false);c.generateAutoPlanPreview();M.find('QA').responsibleEmployeeId='other-a';await c.applyAutoPlanPreview();assert.equal(c.assignments.length,0);
});
test('required shifts limited to Monday–Friday create no weekend demand or marketplace gaps',()=>{
 const {c,id,run,M}=optionalHarness();id('autoPlanPeriod').value='week';c.globalSoll.QA=0;M.find('QA').optionalStaffing=0;M.find('FD').optionalWeekdays=[1,2,3,4,5];
 const slots=Array.from(c.autoOpenSlots());assert.equal(slots.length,5);assert.ok(slots.every(x=>(new Date(x.date+'T12:00:00').getDay()||7)<=5));assert.equal(M.requiredSoll('2026-12-05','FD',3),0);assert.equal(M.requiredSoll('2026-12-06','FD',3),0);assert.equal(M.requiredSoll('2026-12-04','FD',3),3);
 c.generateAutoPlanPreview();assert.ok(Array.from(run('autoPlanPreview')).every(x=>!['2026-12-05','2026-12-06'].includes(x.date)));
});
test('a deliberate daily override can create exceptional demand outside regular shift weekdays',()=>{
 const {c,M}=optionalHarness();M.find('FD').optionalWeekdays=[1,2,3,4,5];c.dailySoll['2026-12-05']={FD:2};assert.equal(M.requiredSoll('2026-12-05','FD',3),2);c.dailySoll['2026-12-04']={FD:0};assert.equal(M.requiredSoll('2026-12-04','FD',3),0);
});

function sharedHarness(){
 const h=optionalHarness(),{c,M}=h;
 M.apply(['TL-LE','TL-RE','Teamleiter'].map((code,i)=>({code,name:code,active:i<2,default_start:'20:00',default_end:'06:00',coverage_group:'TL LE/RE',coverage_required:1,sort_order:i})),'a');
 c.globalSoll={'TL-LE':1,'TL-RE':1};c.employees=[{id:'le',first:'TL',last:'Leipzig',status:'active',shifts:['TL-LE'],weeklyHours:40},{id:'re',first:'TL',last:'Recklinghausen',status:'active',shifts:['TL-RE'],weeklyHours:40}];
 c.plannedAssignmentHours=()=>10;return h;
}
test('one shared TL deficit chooses either location and is counted once in the preview',async()=>{
 for(const available of ['le','re']){const {c,run,id}=sharedHarness();c.absent=e=>e!==available;assert.equal(c.autoOpenSlots().length,1);c.generateAutoPlanPreview();assert.equal(run('autoPlanPreview.length'),1);assert.equal(run('autoPlanPreview[0].type'),available==='le'?'TL-LE':'TL-RE');assert.equal(id('autoUnresolvedCount').textContent,0);assert.match(run('autoPlanPreview[0].reason'),/Deckt TL LE\/RE gemeinsam ab/);await c.applyAutoPlanPreview();assert.equal(c.assignments.length,1);assert.equal(c.autoOpenSlots().length,0);}
});
test('LE, RE, two local TLs and legacy TL assignments all cover the shared night without a second mandatory slot',()=>{
 for(const types of [['TL-LE'],['TL-RE'],['TL-LE','TL-RE'],['Teamleiter']]){const {c,M}=sharedHarness();c.assignments=types.map((type,i)=>({date:'2026-12-01',type,employeeId:'tl'+i,start:'20:00',end:'06:00'}));assert.equal(c.autoOpenSlots().length,0);assert.equal(M.requiredSoll('2026-12-01','TL-LE',1)-c.assignmentsFor('2026-12-01','TL-LE').length,0);assert.equal(M.requiredSoll('2026-12-01','TL-RE',1)-c.assignmentsFor('2026-12-01','TL-RE').length,0);assert.equal(M.coverageInfo('2026-12-01','TL-LE').target,1);}
});
test('partial TL nights and another date cannot cover the full shared window',()=>{
 const {c,M}=sharedHarness();c.assignments=[{date:'2026-12-01',type:'TL-RE',employeeId:'re',start:'22:00',end:'06:00'},{date:'2026-12-02',type:'TL-LE',employeeId:'le',start:'20:00',end:'06:00'}];assert.equal(c.autoOpenSlots().length,1);assert.equal(M.coverageInfo('2026-12-01','TL-RE').filled,0);c.assignments[0].start='20:00';c.assignments[0].end='02:00';assert.equal(c.autoOpenSlots().length,1);
});
test('fair shared selection considers both sites and removed RE proposals reopen one shared position',()=>{
 const {c,run,id}=sharedHarness();c.plannedMonthlyHoursForEmployee=e=>e==='le'?100:0;c.generateAutoPlanPreview();assert.equal(run('autoPlanPreview[0].type'),'TL-RE');assert.equal(id('autoUnresolvedCount').textContent,0);c.removeAutoSuggestion(0);assert.equal(id('autoUnresolvedCount').textContent,1);assert.match(id('autoUnresolved').innerHTML,/von dir entfernt/);
});
test('new TL coverage during confirmation prevents a stale shared preview from adding a second TL',async()=>{
 const {c,api}=sharedHarness();c.generateAutoPlanPreview();api.confirmApply=async()=>{c.assignments.push({date:'2026-12-01',type:'TL-RE',employeeId:'re',start:'20:00',end:'06:00'});return true};await c.applyAutoPlanPreview();assert.equal(c.assignments.length,1);assert.equal(c.saved,undefined);
});
test('shared daily targets, regular days and company isolation remain authoritative',()=>{
 const {c,M}=sharedHarness();c.dailySoll['2026-12-01']={'TL-LE':2};assert.equal(c.autoOpenSlots().length,2);c.dailySoll['2026-12-01']={'TL-LE':0};assert.equal(c.autoOpenSlots().length,0);delete c.dailySoll['2026-12-01'];for(const t of c.TYPES)t.optionalWeekdays=[1];assert.equal(c.autoOpenSlots().length,0);c.dailySoll['2026-12-01']={'TL-RE':1};assert.equal(c.autoOpenSlots().length,1);assert.deepEqual(Array.from(c.autoOpenSlots()[0].alternatives),['TL-RE']);c.window.SFBackend.companyId='b';assert.equal(M.coverageInfo('2026-12-01','TL-LE'),null);
});

function fixedHarness(){
 const h=harness(),{c,id}=h;vm.runInNewContext(read('assets/employee-rhythm-v1.js'),c);c.window.SFAutoPlanGuard=undefined;
 c.sfRhythmCheck=c.window.sfRhythmCheck;id('autoPlanPeriod').value='month';c.TYPES=[{id:'O3',name:'O3',start:'22:00',end:'08:00'}];c.plannedAssignmentHours=()=>10;
 c.employeeMonthlyTarget=e=>e.monthlyHours??180;c.plannedMonthlyHoursForEmployee=(employeeId,date,sim=[])=>[...c.assignments,...sim].filter(a=>a.employeeId===employeeId&&a.date.startsWith(date.slice(0,7))).length*10;
 c.employees=[{id:'flex',first:'Flexible',last:'Person',status:'active',employment:'Vollzeit',shifts:['O3'],weeklyHours:40,monthlyHours:180,maxWeeklyHours:40},{id:'115',first:'Feste',last:'O3',status:'active',employment:'Vollzeit',shifts:['O3'],weeklyHours:40,monthlyHours:180,maxWeeklyHours:40,rhythmMode:'required',rhythmStart:'2026-08-31',rhythmPattern:'O3, O3, O3, O3, FREI, FREI, FREI'}];
 return h;
}
test('fixed Monday to Thursday O3 is reserved throughout December before flexible staff and saves 19 shifts / 190 hours',async()=>{
 const {c,run}=fixedHarness();const before=JSON.stringify(c.assignments);c.generateAutoPlanPreview();const preview=Array.from(run('autoPlanPreview')),fixed=preview.filter(a=>a.employeeId==='115');
 assert.equal(fixed.length,19);assert.ok(fixed.every(a=>[1,2,3,4].includes(new Date(a.date+'T12:00:00').getDay())));assert.ok(fixed.every(a=>a.type==='O3'));assert.equal(JSON.stringify(c.assignments),before);
 assert.match(fixed.find(a=>a.date==='2026-12-31').reason,/Feste Schichtvorgabe/);assert.match(fixed[0].reason,/Monats-SOLL 180/);await c.applyAutoPlanPreview();assert.equal(c.assignments.filter(a=>a.employeeId==='115').length,19);assert.equal(c.saved,1);
});
test('fixed reservations honor absence, existing services, monthly maximum and required staffing',()=>{
 const {c,run}=fixedHarness();c.assignments=[{date:'2026-12-01',employeeId:'flex',type:'O3'}];c.absent=(id,date)=>id==='115'&&date==='2026-12-03';const before=JSON.stringify(c.assignments);c.generateAutoPlanPreview();const fixed=Array.from(run('autoPlanPreview')).filter(a=>a.employeeId==='115');assert.ok(!fixed.some(a=>['2026-12-01','2026-12-03'].includes(a.date)));assert.equal(JSON.stringify(c.assignments),before);
 c.employeeMonthlyTarget=()=>144;c.employees[1].employment='Teilzeit';c.assignments=[];c.absent=()=>false;c.generateAutoPlanPreview();assert.equal(Array.from(run('autoPlanPreview')).filter(a=>a.employeeId==='115').length,14);
 c.getSoll=()=>0;c.generateAutoPlanPreview();assert.equal(run('autoPlanPreview.length'),0);
});
test('fair distribution uses 180 / 162 / 144 targets and prefers staff below SOLL over full-time overtime',()=>{
 const {c,id}=harness();id('autoRespectHours').checked=false;c.employeeMonthlyTarget=e=>e.monthlyHours;c.employees=[{id:'full',status:'active',employment:'Vollzeit',shifts:['FD'],weeklyHours:40,monthlyHours:180},{id:'part',status:'active',employment:'Teilzeit',shifts:['FD'],weeklyHours:40,monthlyHours:144}];
 c.plannedMonthlyHoursForEmployee=id=>id==='full'?170:142;assert.deepEqual(Array.from(c.autoEligibleEmployees('FD','2026-12-01')).map(x=>x.e.id),['full']);
 c.plannedMonthlyHoursForEmployee=id=>id==='full'?180:120;assert.equal(c.autoEligibleEmployees('FD','2026-12-01')[0].e.id,'part');
 c.plannedMonthlyHoursForEmployee=id=>id==='full'?90:72;assert.equal(c.autoEligibleEmployees('FD','2026-12-01')[0].e.id,'full');
 c.employees[1].monthlyHours=162;c.plannedMonthlyHoursForEmployee=id=>id==='full'?180:150;assert.equal(c.autoEligibleEmployees('FD','2026-12-01')[0].e.id,'part');
});
test('fixed future shifts reserve rest windows before flexible earlier shifts',()=>{
 const h=fixedHarness(),{c,id,run}=h;id('autoPlanPeriod').value='week';id('autoPlanWeekDate').value='2026-12-01';c.TYPES=[{id:'FD',name:'FD',start:'06:00',end:'14:00'},{id:'ND',name:'ND',start:'22:00',end:'06:00'}];c.employees=[{id:'fixed',status:'active',employment:'Vollzeit',shifts:['FD','ND'],weeklyHours:40,maxWeeklyHours:40,rhythmMode:'required',rhythmStart:'2026-11-30',rhythmPattern:'ALLE, FD, FREI, FREI, FREI, FREI, FREI'}];c.getSoll=(date,type)=>Number(date==='2026-11-30'&&type==='ND'||date==='2026-12-01'&&type==='FD');c.window.autoEligibleEmployees=c.autoEligibleEmployees;vm.runInNewContext(read('assets/supabase-auto-plan-guard-v1.js'),c);c.autoEligibleEmployees=c.window.autoEligibleEmployees;c.generateAutoPlanPreview();assert.deepEqual(Array.from(run('autoPlanPreview')).map(a=>a.date),['2026-12-01']);
});

test('scarce permissions are scheduled before flexible workers can consume their only daily slot',()=>{
 const {c,run}=harness();c.TYPES.push({id:'SD',start:'14:00',end:'22:00'});c.employees=[{id:'flex',status:'active',employment:'Vollzeit',shifts:['FD','SD'],weeklyHours:40},{id:'only',status:'active',employment:'Vollzeit',shifts:['FD'],weeklyHours:40}];
 c.generateAutoPlanPreview();const preview=Array.from(run('autoPlanPreview'));assert.equal(run('autoPlanUnresolved.length'),0);assert.equal(preview.find(a=>a.type==='SD').employeeId,'flex');assert.equal(preview.find(a=>a.type==='FD').employeeId,'only');
});
test('workrest information tracks the block while hours, absences and required free days always win',()=>{
 const {c,id}=harness();vm.runInNewContext(read('assets/employee-rhythm-v1.js'),c);
 const rhythm={rhythmMode:'required',rhythmStart:'2026-12-01',rhythmPattern:'ALLE, ALLE, ALLE, ALLE, FREI, FREI, FREI, ALLE, ALLE, ALLE, FREI, FREI'};
 c.employees=[{...c.employees[0],...rhythm,id:'block',maxWeeklyHours:50},{...c.employees[0],...rhythm,id:'new',maxWeeklyHours:50}];c.assignments=[{employeeId:'block',type:'FD',date:'2026-12-01'}];
 const best=c.autoEligibleEmployees('FD','2026-12-02').find(x=>x.e.id==='block');assert.equal(best.block.sameShift,true);assert.equal(best.block.position,2);assert.equal(best.block.length,4);
 c.employees[0].maxWeeklyHours=8;assert.equal(c.autoEligibleEmployees('FD','2026-12-02')[0].e.id,'new');c.employees[0].maxWeeklyHours=50;c.absent=e=>e==='block';assert.equal(c.autoEligibleEmployees('FD','2026-12-02')[0].e.id,'new');c.absent=()=>false;
 assert.equal(c.autoEligibleEmployees('FD','2026-12-05').length,0);assert.equal(c.autoWorkBlock(c.employees[0],'OT1','2026-12-02',c.assignments),null);
 c.plannedMonthlyHoursForEmployee=e=>e==='block'?180:80;assert.equal(c.autoEligibleEmployees('FD','2026-12-02')[0].e.id,'new');
});
test('complete workrest blocks are reserved together and a missing middle-day demand prevents isolated shifts',()=>{
 const {c,id,run}=harness();vm.runInNewContext(read('assets/employee-rhythm-v1.js'),c);id('autoPlanPeriod').value='month';c.employees[0]={...c.employees[0],maxWeeklyHours:50,rhythmMode:'required',rhythmStart:'2026-12-01',rhythmPattern:'ALLE, ALLE, ALLE, ALLE, FREI, FREI, FREI, ALLE, ALLE, ALLE, FREI, FREI'};
 c.plannedMonthlyHoursForEmployee=(id,date,sim=[])=>[...c.assignments,...sim].filter(a=>a.employeeId===id&&a.date.startsWith(date.slice(0,7))).length*8;
 c.getSoll=date=>Number(date>='2026-12-01'&&date<='2026-12-04');c.generateAutoPlanPreview();assert.equal(run('autoPlanPreview.length'),4);assert.equal(new Set(Array.from(run('autoPlanPreview')).map(x=>x.blockId)).size,1);
 c.removeAutoSuggestion(1);assert.equal(run('autoPlanPreview.length'),0);assert.equal(run('autoPlanUnresolved.length'),4);
 c.getSoll=date=>Number(['2026-12-01','2026-12-03','2026-12-04'].includes(date));c.generateAutoPlanPreview();assert.equal(run('autoPlanPreview.length'),0);assert.equal(run('autoPlanUnresolved.length'),3);
 c.getSoll=date=>Number(date>='2026-12-01'&&date<='2026-12-04');c.employees[0].employment='Teilzeit';c.employeeMonthlyTarget=()=>24;c.generateAutoPlanPreview();assert.equal(run('autoPlanPreview.length'),0);
});
test('O3 cannot go back to O1/O2/TL on the following day, even when twelve hours rest would suffice',()=>{
 const {c}=harness();c.TYPES=['O1','O2','O3','TL-LE','TL-RE'].map(id=>({id,start:id==='O1'?'18:00':id==='O3'?'22:00':'20:00',end:id==='O1'?'04:00':id==='O3'?'08:00':'06:00'}));vm.runInNewContext(read('assets/supabase-auto-plan-guard-v1.js'),c);const guard=c.window.SFAutoPlanGuard;
 c.assignments=[{employeeId:'e',type:'O3',date:'2026-12-01'}];for(const type of ['O1','O2','TL-LE','TL-RE'])assert.equal(guard.passesTimeRules('e',type,'2026-12-02'),false);assert.equal(guard.passesTimeRules('e','O2','2026-12-03'),true);assert.equal(guard.passesTimeRules('e','O3','2026-12-02'),true);
 for(const type of ['O2','TL-LE','TL-RE']){c.assignments=[{employeeId:'e',type,date:'2026-12-01'}];assert.equal(guard.passesTimeRules('e','O3','2026-12-02'),true)}
 c.assignments=[{employeeId:'e',type:'O2',date:'2026-12-02'}];assert.equal(guard.passesTimeRules('e','O3','2026-12-01'),false);
 c.assignments=[{employeeId:'e',type:'O1',date:'2026-12-01'}];for(const type of ['O2','TL-LE','TL-RE'])assert.equal(guard.passesTimeRules('e',type,'2026-12-02'),true);
});
test('the consecutive-shift maximum counts existing days on both sides including month boundaries',()=>{
 const {c}=harness();c.employees[0].qualifications=['__sp:maxConsecutive=4'];vm.runInNewContext(read('assets/supabase-auto-plan-guard-v1.js'),c);
 c.assignments=['2026-11-28','2026-11-29','2026-11-30','2026-12-01'].map(date=>({employeeId:'e',type:'FD',date}));const guard=c.window.SFAutoPlanGuard;
 assert.equal(guard.passesTimeRules('e','FD','2026-12-02'),false);assert.equal(guard.passesTimeRules('e','FD','2026-12-03'),true);
 c.assignments=['2026-12-01','2026-12-03','2026-12-04','2026-12-05'].map(date=>({employeeId:'e',type:'FD',date}));assert.equal(guard.passesTimeRules('e','FD','2026-12-02'),false);
});
