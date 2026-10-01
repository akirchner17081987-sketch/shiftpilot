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
