const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../assets/planning-assistant-core-v1.js'),Insights=require('../assets/planning-assistant-insights-v1.js');
function fixture(){
 const employees=['a','b','c'].map((id,i)=>({id,first:['Anna','Ben','Clara'][i],last:'Fiktiv',personnelNo:String(119+i),status:'active',shifts:['FD','ND'],employment:'Teilzeit',monthlyHours:32,weeklyHours:40}));
 const s={authorized:true,today:'2027-01-01',defaultDates:Core.parsePeriod('2027-01',{today:'2027-01-01'}).dates,employees,shifts:[{id:'FD',name:'Frühdienst',start:'06:00',end:'14:00'},{id:'ND',name:'Nachtdienst',start:'22:00',end:'06:00'}],assignments:[{id:'a1',date:'2027-01-05',type:'FD',start:'06:00',end:'14:00',employeeId:'a',_dbStatus:'DRAFT'}],absences:[],solidRules:{enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin'},rulesReady:true,monthTarget:e=>e.monthlyHours,getSoll:(date,type)=>date==='2027-01-05'&&type==='FD'?1:0,isPublished:()=>false,movable:()=>true};
 s.candidates=(type,date,rows=s.assignments,duty)=>{
  const ready=e=>e.shifts.includes(type)&&!rows.some(a=>a.date===date&&a.employeeId===e.id)&&!s.absences.some(a=>a.status==='Genehmigt'&&a.employeeId===e.id&&a.startDate<=date&&a.endDate>=date)&&!(s.customBlocked&&e.id==='b'&&duty?.end==='21:00');
  return{candidates:employees.filter(ready).map(e=>({e})),assessments:employees.map(e=>({employeeId:e.id,reason:ready(e)?'':'Abwesenheit oder fehlende Freigabe',eligible:ready(e)})),reasons:[]};};return s;
}
function ask(s,kind,request){return Core.answer(kind==='leaveImpact'?'Urlaubsfolgen prüfen':'Dienstverschiebung prüfen',{...s,analysisRequest:{kind,...request}});}
test('forecast distinguishes zero, one and multiple independent replacements and never mutates a plan',()=>{
 const s=fixture(),before=JSON.stringify(s);s.employees[1].shifts=[];s.employees[2].shifts=[];let r=Insights.forecast(s,s.defaultDates);assert.equal(r.rows[0][0],'Keine direkte Reserve');
 s.employees[1].shifts=['FD'];r=Insights.forecast(s,s.defaultDates);assert.equal(r.rows[0][0],'Wenig Reserve');assert.match(r.rows[0][2],/Ben/);
 s.employees[2].shifts=['FD'];r=Insights.forecast(s,s.defaultDates);assert.equal(r.rows.length,0);assert.equal(r.proposal,undefined);assert.equal(s.assignments.length,1);
});
test('shared overstaffing covers a single outage; existing vacancies remain a separate warning',()=>{
 const s=fixture();s.assignments.push({...s.assignments[0],id:'b1',employeeId:'b'});s.employees[2].shifts=[];
 assert.equal(Insights.forecast(s,s.defaultDates).rows.length,0);
 s.getSoll=(d,t)=>d==='2027-01-05'&&t==='FD'?3:0;const r=Insights.forecast(s,s.defaultDates);assert.equal(r.rows[0][0],'Bereits offen');assert.ok(r.rows.some(x=>x[0]==='Wenig Reserve'||x[0]==='Keine direkte Reserve'));
});
test('forecast defaults to the next 28 days, accepts explicit periods and states partial limits',()=>{
 const s=fixture();let r=Core.answer('Frühwarnung starten',s);assert.equal(r.context.dates[0],'2027-01-01');assert.equal(r.context.dates.at(-1),'2027-01-28');
 r=Core.answer('Welche Dienste sind in den nächsten 14 Tagen besonders anfällig?',s);assert.equal(r.context.dates.length,14);
 s.assignments=Array.from({length:170},(_,i)=>({...s.assignments[0],id:String(i)}));r=Insights.forecast(s,s.defaultDates);assert.ok(r.notes.some(n=>n.includes('Teilanalyse')));
});
test('leave impact assigns replacements jointly and keeps existing approved leave unavailable',()=>{
 const s=fixture();s.employees.forEach(e=>e.monthlyHours=e.id==='a'?24:8);s.assignments.push({...s.assignments[0],id:'a2',date:'2027-01-09'});s.getSoll=(d,t)=>['2027-01-05','2027-01-09'].includes(d)&&t==='FD'?1:0;
 s.absences=[{employeeId:'b',startDate:'2027-01-05',endDate:'2027-01-05',status:'Genehmigt'}];const before=JSON.stringify(s),r=ask(s,'leaveImpact',{employeeId:'a',startDate:'2027-01-05',endDate:'2027-01-09'});
 assert.match(r.text,/2 betroffene Dienste/);assert.match(r.text,/2 direkte Vertretungen/);assert.match(r.rows[0][1],/Clara/);assert.match(r.rows[1][1],/Ben/);assert.equal(r.proposal,null);assert.equal(JSON.stringify(s),before);
});
test('leave impact accounts for night carryover and preserves actual custom duty times',()=>{
 const s=fixture();s.assignments=[{id:'n1',employeeId:'a',type:'ND',date:'2027-01-04',start:'22:00',end:'06:00'}];s.getSoll=(d,t)=>d==='2027-01-04'&&t==='ND'?1:0;
 let r=ask(s,'leaveImpact',{employeeId:'a',startDate:'2027-01-05',endDate:'2027-01-05'});assert.match(r.text,/1 betroffene Dienste/);assert.equal(r.rows[0][0],'2027-01-04 · ND');
 s.assignments=[{id:'custom',employeeId:'a',type:'FD',date:'2027-01-05',start:'13:00',end:'21:00'}];s.getSoll=(d,t)=>d==='2027-01-05'&&t==='FD'?1:0;s.customBlocked=true;s.employees[2].shifts=[];
 r=ask(s,'leaveImpact',{employeeId:'a',startDate:'2027-01-05',endDate:'2027-01-05'});assert.match(r.text,/0 direkte Vertretungen/);
});
test('leave impact separates pre-existing gaps, protected services and no-service decisions',()=>{
 const s=fixture();s.getSoll=(d,t)=>d==='2027-01-05'&&t==='FD'?2:0;s.movable=()=>false;
 let r=ask(s,'leaveImpact',{employeeId:'a',startDate:'2027-01-05',endDate:'2027-01-05'});assert.match(r.text,/1 zusätzliche Pflichtpositionen/);assert.ok(r.blockers.some(x=>x.includes('geschützt')));assert.equal(s.assignments.length,1);
 r=ask(s,'leaveImpact',{employeeId:'a',startDate:'2027-01-10',endDate:'2027-01-10'});assert.match(r.text,/0 betroffene Dienste/);assert.ok(r.notes.some(x=>x.includes('keine automatische Genehmigung')));
});
test('German and numeric vacation ranges resolve explicitly; invalid and ambiguous inputs request a form',()=>{
 const s=fixture();let r=Core.answer('Welche Folgen hätte der Urlaub von Mitarbeiter 119 vom 10. bis 17. November 2027?',s);assert.equal(r.context.dates.length,8);assert.equal(r.context.dates[0],'2027-11-10');
 r=Core.answer('Urlaubsfolgen Mitarbeiter 119 vom 05.01.2027 bis 09.01.2027',s);assert.equal(r.context.dates.length,5);
 r=Core.answer('Urlaubsfolgen prüfen',s);assert.equal(r.form.kind,'leaveImpact');
 for(const dates of [['2027-02-30','2027-03-01'],['2027-01-10','2027-01-05'],['2027-01-01','2027-04-01']])assert.equal(ask(s,'leaveImpact',{employeeId:'a',startDate:dates[0],endDate:dates[1]}).form.kind,'leaveImpact');
});
test('a transfer explains both monthly balances without saving or changing source data',()=>{
 const s=fixture(),before=JSON.stringify(s),r=ask(s,'changeImpact',{assignmentId:'a1',targetEmployeeId:'b'});
 assert.equal(r.title,'Dienständerung – Vorschau');assert.equal(r.blockers.length,0);assert.match(r.rows.find(x=>x[0].includes('Anna'))[1],/8 → 0/);assert.match(r.rows.find(x=>x[0].includes('Ben'))[1],/0 → 8/);assert.equal(r.proposal,null);assert.equal(JSON.stringify(s),before);
});
test('change preview catches downstream recovery, new vacancies, custom-time conflicts and protected duties',()=>{
 const s=fixture();s.assignments.push({id:'night',employeeId:'b',date:'2027-01-04',type:'ND',start:'22:00',end:'06:00'});let r=ask(s,'changeImpact',{assignmentId:'a1',targetEmployeeId:'b'});assert.ok(r.blockers.length);
 s.assignments=s.assignments.slice(0,1);r=ask(s,'changeImpact',{assignmentId:'a1',targetEmployeeId:'b',date:'2027-01-09'});assert.ok(r.blockers.some(x=>x.includes('zusätzliche offene')));
 s.customBlocked=true;r=ask(s,'changeImpact',{assignmentId:'a1',targetEmployeeId:'b',start:'13:00',end:'21:00'});assert.ok(r.blockers.some(x=>x.includes('Abwesenheit')));
 s.customBlocked=false;s.movable=()=>false;r=ask(s,'changeImpact',{assignmentId:'a1',targetEmployeeId:'b'});assert.ok(r.blockers.some(x=>x.includes('geschützt')));
});
test('natural transfer questions and selected services are resolved, unknown IDs never expose other data',()=>{
 const s=fixture();let r=Core.answer('Was passiert wenn ich den FD am 05.01.2027 von Mitarbeiter 119 auf Mitarbeiter 120 verschiebe?',s);assert.equal(r.title,'Dienständerung – Vorschau');
 s.selectedService={date:'2027-01-05',type:'FD',assignmentId:'a1'};r=Core.answer('Dienstverschiebung prüfen',s);assert.equal(r.form.assignmentId,'a1');
 r=ask(s,'changeImpact',{assignmentId:'unknown-tenant',targetEmployeeId:'b'});assert.equal(r.form.kind,'changeImpact');assert.equal(r.rows.length,0);
 r=ask(s,'changeImpact',{assignmentId:'a1',targetEmployeeId:'b',start:'29:00'});assert.ok(r.form);
});
test('missing policy and access guards fail closed for all new analyses',()=>{
 const s=fixture();s.solidRules=null;assert.match(Core.answer('Frühwarnung starten',s).title,/noch nicht bereit/);
 s.authorized=false;Object.defineProperty(s,'employees',{get(){throw Error('must not read')}});for(const q of ['Frühwarnung starten','Urlaubsfolgen prüfen','Dienstverschiebung prüfen'])assert.match(Core.answer(q,s).title,/Anmeldung/);
});
