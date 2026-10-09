const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Insights=require('../assets/planning-assistant-insights-v1.js'),Core=require('../assets/planning-assistant-core-v1.js');
function fixture(){
 const employees=[{id:'a',first:'Anna',last:'Alt',personnelNo:'119',status:'active',shifts:['FD','ND'],employment:'Vollzeit',monthlyHours:180,weeklyHours:40},{id:'b',first:'Bernd',last:'Beispiel',personnelNo:'120',status:'active',shifts:['FD','ND'],employment:'Teilzeit',monthlyHours:144,weeklyHours:40}];
 const s={authorized:true,today:'2027-01-01',defaultDates:Core.parsePeriod('2027-01',{today:'2027-01-01'}).dates,employees,shifts:[{id:'FD',start:'06:00',end:'14:00'},{id:'ND',start:'22:00',end:'06:00'}],assignments:[],absences:[],solidRules:{enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin'},rulesReady:true,monthTarget:e=>e.monthlyHours,getSoll:(date,type)=>date==='2027-01-05'&&type==='FD'?1:0,candidates:()=>({candidates:employees.map(e=>({e})),reasons:[]}),isPublished:()=>false};return s;
}
test('monthly boundaries, night recovery and cancellation are handled by the shared policy',()=>{
 const s=fixture();s.assignments=Array.from({length:5},(_,i)=>({id:String(i),date:i===0?'2026-12-31':'2027-01-0'+i,type:'FD',employeeId:'a'}));
 const before=JSON.stringify(s),r=Core.answer('Wo ist die Belastung im Januar zu hoch?',s);assert.equal(r.context.intent,'loadCheck');assert.ok(r.rows.some(x=>/vier Dienste/.test(x[3])));assert.equal(JSON.stringify(s),before);
 s.assignments=[{date:'2026-12-31',type:'ND',employeeId:'a'},{date:'2027-01-03',type:'FD',employeeId:'a'},{date:'2027-01-02',type:'FD',employeeId:'b',_dbStatus:'CANCELLED'}];
 const report=Insights.audit(s,s.defaultDates);assert.ok(report.issues.some(x=>/drei vollständig freie/.test(x.message)));assert.ok(!report.issues.some(x=>x.employee.id==='b'));
});
test('a fourth consecutive night and weekly excess are visible, missing rules fail closed',()=>{
 const s=fixture();s.assignments=Array.from({length:4},(_,i)=>({date:'2027-01-0'+(i+4),type:'ND',employeeId:'a'}));assert.ok(Insights.audit(s,s.defaultDates).issues.some(x=>/drei Nachtdienste/.test(x.message)));
 s.solidRules=null;assert.equal(Insights.improvements(s,s.defaultDates).proposal,undefined);assert.match(Insights.workload(s,s.defaultDates).text,/unvollständig/);
});
test('hour improvements respect a lower contract ceiling, avoid paid break deductions and never mutate data',()=>{
 const s=fixture();s.employees[0].monthlyHours=8;s.employees[0].employment='Teilzeit';s.employees[1].monthlyHours=8;s.employees[1].employment='Teilzeit';
 s.getSoll=(d,t)=>['2027-01-05','2027-01-06','2027-01-07'].includes(d)&&t==='FD'?1:0;
 const before=JSON.stringify(s),r=Core.answer('Wie bekommen wir die Kollegen näher an ihr Soll?',s);assert.equal(r.proposal.proposed.length,2);assert.equal(r.proposal.proposed.filter(a=>a.employeeId==='a').length,1);assert.equal(r.rows[0][2],'0 → 8 h');assert.equal(JSON.stringify(s),before);assert.match(r.text,/3 → 1/);
});
test('published days, failed eligibility and the fourth night remain unavailable',()=>{
 const s=fixture();s.isPublished=()=>true;assert.equal(Insights.improvements(s,s.defaultDates).proposal.proposed.length,0);
 s.isPublished=()=>false;s.candidates=()=>({candidates:[],reasons:[{label:'Schichtfreigabe fehlt',count:2}]});assert.equal(Insights.improvements(s,s.defaultDates).proposal.proposed.length,0);
 s.candidates=()=>({candidates:[{e:s.employees[0]}]});s.getSoll=(d,t)=>d==='2027-01-07'&&t==='ND'?1:0;s.assignments=['04','05','06'].map(d=>({date:'2027-01-'+d,type:'ND',employeeId:'a'}));assert.equal(Insights.improvements(s,s.defaultDates).proposal.proposed.length,0);
});
test('calendar month caps include the previous overnight shift',()=>{
 const s=fixture(),e=s.employees[0];e.employment='Teilzeit';e.monthlyHours=12;s.assignments=[{date:'2026-12-31',type:'ND',employeeId:'a'},{date:'2027-01-05',type:'FD',employeeId:'a'}];
 const issues=Insights.audit(s,s.defaultDates).issues;assert.ok(issues.some(x=>/Nachtübertrag/.test(x.message)));
});
test('outage asks for a named employee and date, preserves both across follow-up and stays a simulation',()=>{
 const s=fixture();s.assignments=[{id:'existing',date:'2027-01-05',type:'FD',employeeId:'a'}];
 const before=JSON.stringify(s),first=Core.answer('Was passiert wenn Mitarbeiter 119 ausfällt?',s);assert.equal(first.context.pending,true);assert.equal(first.context.employeeId,'a');
 const r=Core.answer('Am 05.01.2027',s,first.context);assert.equal(r.context.intent,'outage');assert.equal(r.rows[0][0],'Beispiel, Bernd');assert.equal(r.proposal,null);assert.equal(JSON.stringify(s),before);
 const none=Core.answer('Ausfallsimulation starten',s);assert.equal(none.context.pending,true);
});
test('stored reasons retain the original run timestamp and distinguish retrieval errors and no evidence',()=>{
 const s=fixture();let r=Core.answer('Gespeicherte Planungsgründe anzeigen',s);assert.match(r.text,/nicht nachträglich erfunden/);
 s.planningRuns=[{first_month:'2027-01-01',last_date:'2027-01-31',created_at:'2026-10-09T18:00:00Z',analysis:{open:1,entries:[{date:'2027-01-05',type:'FD',reasons:[{label:'Schichtfreigabe fehlt',count:2}]}]}}];r=Core.answer('Planungsprotokoll Januar 2027',s);assert.match(r.rows[0][2],/2 × Schichtfreigabe fehlt/);assert.match(r.notes.join(' '),/keine vollständige/);
 s.journalError='Verbindung fehlt';assert.equal(Core.answer('Planungsprotokoll',s).text,'Verbindung fehlt');
});
test('monthly check exposes shared-policy issues and an actionable improvement entry',()=>{
 const s=fixture();s.assignments=Array.from({length:5},(_,i)=>({date:'2027-01-0'+(i+1),type:'FD',employeeId:'a'}));const r=Core.answer('Monatscheck starten',s);assert.ok(r.rows.some(x=>x[1]==='Belastung: Alt, Anna'));assert.ok(r.rowActions.some(x=>x.question?.includes('Verbesserungsvorschläge')));
});
test('authenticated tenant scope precedes the expanded analysis',()=>{
 const s=fixture();s.authorized=false;Object.defineProperty(s,'employees',{get(){throw Error('must not read')}});assert.match(Core.answer('Verbesserungsvorschläge erstellen',s).title,/Anmeldung/);
});
test('integration guards confirmation, backend fingerprints, protected shifts and scoped browser journals',()=>{
 const ui=fs.readFileSync(require.resolve('../assets/planning-assistant-v1.js'),'utf8');
 assert.match(ui,/await confirmProposal/);assert.match(ui,/proposal\.signature!==signature/);assert.match(ui,/p_fingerprint:proposal\.fingerprint/);assert.match(ui,/protectedIds\.has/);assert.match(ui,/p_respect_weekly:true/);assert.match(ui,/sf-planning-runs-v1\|/);assert.match(ui,/r\.company_id===B\(\)\.companyId&&r\.actor_id===B\(\)\.user/);
});
