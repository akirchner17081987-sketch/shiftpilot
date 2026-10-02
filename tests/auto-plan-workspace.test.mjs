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
 const c={window:{SFBackend:{companyId:'a'},SchichtFunkCalendarView:{setMonth(){},setMode(){}}},document:{readyState:'loading',addEventListener(){},getElementById:id,querySelectorAll:()=>[]},Date,Map,setTimeout,console,employees:[{id:'e',first:'Fiktive',last:'Person',status:'active',shifts:['FD'],weeklyHours:40}],assignments:[],TYPES:[{id:'FD',name:'Frühdienst',start:'06:00',end:'14:00'}],weekStart:new Date(2026,8,28),iso:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,addDays:(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x},typeById:t=>c.TYPES.find(x=>x.id===t),getSoll:()=>1,assignmentsFor:(d,t)=>c.assignments.filter(a=>a.date===d&&a.type===t),absent:()=>false,plannedAssignmentHours:()=>8,employeeMonthlyTarget:()=>180,plannedMonthlyHoursForEmployee:id=>c.assignments.filter(a=>a.employeeId===id).length*8,showSaveToast(){},saveAll(){c.saved=(c.saved||0)+1},renderCalendar(){}};
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
test('contract-hour limit remains enforced and changing that optional rule resets the preview',()=>{
 const {c,id}=harness();c.employees[0].weeklyHours=4;c.generateAutoPlanPreview();assert.equal(id('autoSuggestionCount').textContent,0);assert.match(id('autoUnresolved').innerHTML,/Wochen- oder Monatsstunden/);id('autoRespectHours').checked=false;c.changeAutoPlanPeriod();assert.equal(id('autoResults').hidden,true);c.generateAutoPlanPreview();assert.equal(id('autoSuggestionCount').textContent,1);
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
