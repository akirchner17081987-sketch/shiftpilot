const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../assets/planning-assistant-core-v1.js'),Insights=require('../assets/planning-assistant-insights-v1.js');
const vm=require('node:vm'),fs=require('node:fs'),help={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../assets/help-center-content-v3.js'),'utf8'),help);
function fixture(){
 const employees=[{id:'a',first:'Anna',last:'Leitung',personnelNo:'119',role:'Teamleiter',status:'active',shifts:['FD','ND'],employment:'Teilzeit',monthlyHours:8,weeklyHours:40},{id:'b',first:'Ben',last:'Plan',personnelNo:'120',status:'active',shifts:['FD'],employment:'Teilzeit',monthlyHours:8,weeklyHours:40}];
 const s={helpArticles:help.window.SFHelpContent.articles,helpCategories:help.window.SFHelpContent.categories,authorized:true,today:'2027-01-01',defaultDates:Core.parsePeriod('2027-01',{today:'2027-01-01'}).dates,employees,shifts:[{id:'FD',start:'06:00',end:'14:00'},{id:'ND',start:'22:00',end:'06:00'}],assignments:[{id:'draft-a',date:'2027-01-05',type:'FD',employeeId:'a',_dbStatus:'DRAFT'}],absences:[],solidRules:{enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin'},rulesReady:true,monthTarget:e=>e.monthlyHours,getSoll:(date)=>date==='2027-01-05'?1:0,isPublished:()=>false,movable:()=>true};
 s.candidates=(type,date,rows=s.assignments)=>({candidates:employees.filter(e=>e.shifts.includes(type)&&!rows.some(a=>a.date===date&&a.employeeId===e.id)).map(e=>({e})),reasons:[{label:'Schichtfreigabe fehlt',count:1}]});return s;
}
test('repair frees a qualified person, preserves coverage and returns one jointly applicable draft',()=>{
 const s=fixture(),before=JSON.stringify(s),r=Core.answer('Engpasslöser Januar 2027',s);
 assert.equal(r.context.intent,'bottlenecks');assert.match(r.text,/1 → 0/);assert.equal(r.proposal.proposed.length,2);
 const plan=[...r.proposal.base,...r.proposal.proposed];assert.equal(plan.find(a=>a.type==='ND').employeeId,'a');assert.equal(plan.find(a=>a.type==='FD').employeeId,'b');
 assert.equal(Insights.slots(s,s.defaultDates,plan).length,0);assert.equal(Insights.audit({...s,assignments:plan},s.defaultDates).issues.length,0);
 assert.equal(r.proposal.changes.filter(c=>c.replaces).length,1);assert.equal(JSON.stringify(s),before);
});
test('fixed drafts, published dates, unavailable replacements and caps cannot be relaxed',()=>{
 for(const block of [s=>s.movable=()=>false,s=>s.isPublished=()=>true,s=>s.employees[1].shifts=[],s=>s.employees[1].monthlyHours=4]){
  const s=fixture();block(s);const before=JSON.stringify(s),r=Insights.bottlenecks(s,s.defaultDates);
  assert.equal(r.proposal,null);assert.match(r.text,/1 → 1/);assert.equal(JSON.stringify(s),before);
 }
});
test('final plan rechecks remaining donor duties and rejects a new candidate conflict',()=>{
 const s=fixture(),base=s.candidates;s.assignments.push({id:'fixed',date:'2027-01-09',type:'FD',employeeId:'a'});s.employees[0].monthlyHours=24;
 s.candidates=(type,date,rows=s.assignments)=>date==='2027-01-09'&&rows.some(a=>a.type==='ND'&&a.employeeId==='a')?{candidates:[],reasons:[]}:base(type,date,rows);
 s.movable=a=>a.id!=='fixed';const r=Insights.bottlenecks(s,s.defaultDates);assert.equal(r.proposal,null);
});
test('focused hours redistribution helps a teamleader without increasing total deficit',()=>{
 const s=fixture();s.assignments[0].employeeId='b';s.employees[1].monthlyHours=0;s.getSoll=(d,t)=>d==='2027-01-05'&&t==='FD'?1:0;
 const r=Core.answer('Wie bekommen wir die Teamleiter auf ihre Sollstunden?',s);
 assert.match(r.text,/Fokus: Leitung, Anna/);assert.equal(r.proposal.proposed[0].employeeId,'a');assert.match(r.text,/8 → 0 h/);
});
test('missing rules or times prevent an actionable proposal; role guard precedes data access',()=>{
 const s=fixture();s.solidRules=null;assert.equal(Insights.bottlenecks(s,s.defaultDates).proposal,undefined);
 s.solidRules={enabled:true};s.shifts[0].start='';assert.equal(Insights.bottlenecks(s,s.defaultDates).proposal,undefined);
 s.authorized=false;Object.defineProperty(s,'employees',{get(){throw Error('no access')}});assert.match(Core.answer('Engpasslöser starten',s).title,/Anmeldung/);
});
test('unresolved gaps have safe actionable diagnostics and no claim of impossibility',()=>{
 const s=fixture();s.movable=()=>false;const r=Insights.bottlenecks(s,s.defaultDates);
 assert.ok(r.blockers.some(x=>x.includes('Schichtfreigabe fehlt')&&x.includes('Zusätzliche verfügbare Person')));
 assert.ok(r.notes.some(x=>x.includes('Kein Nachweis')));assert.equal(r.proposal,null);
});
test('coverage alternatives are treated as one shared requirement',()=>{
 const s=fixture();s.assignments=[];s.openSlots=(dates,rows)=>dates.includes('2027-01-05')&&!rows.some(a=>a.date==='2027-01-05')?[{date:'2027-01-05',type:'ND',alternatives:['FD','ND']}]:[];
 const r=Insights.bottlenecks(s,s.defaultDates);assert.equal(r.proposal.proposed.length,1);assert.equal(Insights.slots(s,s.defaultDates,r.proposal.proposed).length,0);
});
test('question catalog is available after an unrelated topic and all buttons resolve to supported topics',()=>{
 const s=fixture(),r=Core.answer('Welche Fragen kann ich stellen?',s,{intent:'replacement',pending:true});assert.equal(r.title,'Welche Fragen kann ich stellen?');assert.match(r.text,/frei formulieren/);
 for(const [,questions] of Core.questionGroups)for(const q of questions){const a=Core.answer(q,s);assert.notEqual(a.title,'Welches Thema meinst du?',q);}
 for(const q of ['Was muss sich ändern damit der Plan aufgeht?','Wie bekommen wir alle auf ihre Sollstunden und besetzen alle Pflichtdienste?'])assert.equal(Core.answer(q,s).context.intent,'bottlenecks');
});
test('search limit is explicit and candidate work remains bounded',()=>{
 const s=fixture();s.assignments=[];s.employees=[];s.getSoll=()=>10;let count=0;s.candidates=()=>{count++;return{candidates:[],reasons:[]}};
 const r=Insights.bottlenecks(s,s.defaultDates);assert.ok(r.notes.some(x=>x.includes('Suchgrenze')));assert.ok(count<=240);assert.equal(r.proposal,null);
});
