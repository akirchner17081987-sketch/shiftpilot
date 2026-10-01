import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Core=require('../assets/planning-assistant-core-v1.js');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('monthly check prioritizes shortages and exempts intentional FD-only staff without a team',()=>{
 const s=fixture(),before=JSON.stringify(s);s.teamRulesReady=true;
 const r=Core.answer('Was fehlt noch für Dezember?',s);assert.equal(r.context.intent,'planningCheck');assert.equal(r.context.dates.length,31);assert.match(r.title,/Dezember 2026/);
 assert.equal(r.rows[0][1],'Offene Dienste');assert.match(r.rows[0][2],/185 Positionen/);
 assert.ok(r.rows.some(row=>row[1]==='FD ohne Planungsteam'));assert.ok(!r.rows.some(row=>row[1]==='Teamzuordnung prüfen'));
 assert.ok(r.rowActions.some(a=>a.team==='A'));delete s.teamRulesReady;assert.equal(JSON.stringify(s),before);
});
test('monthly check warns about demand, permissions, malformed team rules and unassessable targets',()=>{
 const s=fixture();s.getSoll=()=>0;s.monthTarget=()=>0;s.employees[1].shifts=['OLD'];s.teamRules=[{team:'A',start:'invalid',pattern:['FD'],offset:8}];
 const r=Core.answer('Planungscheck Dezember',s);assert.ok(r.rows.some(row=>row[1]==='SOLL-Bedarf'));assert.ok(r.rows.some(row=>row[1]==='Schichtfreigaben'));assert.ok(r.rows.some(row=>row[1]==='Stundenvorgaben'));assert.ok(r.rows.some(row=>row[1]==='Team A'));
 s.teamRulesReady=false;assert.ok(Core.answer('Monatscheck',s).rows.some(row=>row[1]==='Teamregeln'));
});
test('monthly check identifies wrong existing permissions and planned target deviations separately',()=>{
 const s=fixture();s.employees[1].shifts=['SD'];s.monthTarget=()=>4;s.assignments.push({id:'bad',date:'2026-12-02',type:'FD',employeeId:'e2'});
 const r=Core.answer('Monatscheck Dezember',s);assert.ok(r.rows.some(row=>row[1]==='Bestehende Zuweisungen'));assert.ok(r.rows.some(row=>row[1]==='Geplantes Monats-SOLL'));assert.match(r.notes.join(' '),/nicht auf bestätigte/);
});
test('selected service supplies context and explicit date or shift overrides it',()=>{
 const s=fixture();s.defaultDates=Core.parsePeriod('dezember',s).dates;s.selectedService={date:'2026-12-03',type:'ND'};
 const r=Core.answer('Wer kann diesen Dienst übernehmen?',s);assert.deepEqual(r.context.dates,['2026-12-03']);assert.equal(r.context.type,'ND');assert.equal(r.context.pending,false);
 const d=Core.answer('Warum konnte die Auto-Planung diesen Dienst nicht besetzen?',s);assert.equal(d.rows.length,1);assert.equal(d.context.type,'ND');
 const explicit=Core.answer('Ersatz für FD am 04.12.2026',s);assert.equal(explicit.context.type,'FD');assert.deepEqual(explicit.context.dates,['2026-12-04']);
 s.selectedService={date:'2026-02-30',type:'UNKNOWN'};assert.equal(Core.answer('Wer kann diesen Dienst übernehmen?',s).context.pending,true);
});
test('replacement explains eight paid hours, projected limits and saved following duty without changing data',()=>{
 const s=fixture();s.assignments.push({date:'2026-12-04',type:'ND',employeeId:'e2'});s.candidates=()=>({candidates:[{e:s.employees[1],h:38,target:40,monthHours:175,monthTarget:180,fit:['Freigabe FD','Verbindlicher Rhythmus passt']}],reasons:[]});
 const before=JSON.stringify(s),r=Core.answer('Ersatz FD am 03.12.2026',s);assert.match(r.text,/8 Std/);assert.equal(r.rows[0][2],'46 / 40 Std.');assert.match(r.rows[0][3],/183 \/ 180/);assert.match(r.rows[0][1],/über Wochen-SOLL und über Monats-SOLL/);assert.match(r.rows[0][4],/4\.12\.2026.*ND/);assert.equal(r.rowActions[0].employeeId,'e2');assert.equal(JSON.stringify(s),before);
});
test('result links retain the real employee, day, shift and assignment and fallback offers usable topics',()=>{
 const s=fixture();const roster=Core.answer('Welche Dienste hat Anna Plan im Dezember?',s);assert.equal(roster.rowActions[0].assignmentId,'a1');assert.equal(roster.rowActions[0].type,'FD');
 const open=Core.answer('Offene Dienste im Dezember',s);assert.equal(open.rowActions.length,open.rows.length);assert.equal(open.rowActions[0].date,'2026-12-01');
 const hours=Core.answer('Geplante Stunden prüfen',s);assert.equal(hours.rowActions[0].employeeId,'e1');
 const fallback=Core.answer('Die Planung spinnt',s);assert.ok(fallback.suggestions.includes('Monatscheck starten'));assert.equal(Core.answer(fallback.suggestions[0],s).context.intent,'planningCheck');
});
function fixture(){
 const employees=[{id:'e1',first:'Anna',last:'Plan',status:'active',planningTeam:'A',shifts:['FD','SD','ND'],weeklyHours:40},{id:'e2',first:'Ben',last:'Frei',status:'active',shifts:['FD'],weeklyHours:40},{id:'e3',first:'Alt',last:'Profil',status:'inactive',shifts:['FD']},{id:'e4',first:'Deleted',last:'Person',status:'active',deletedAt:'2026-01-01',shifts:['FD']}];
 return{authorized:true,today:'2026-10-01',defaultDates:['2026-12-01'],employees,assignments:[{id:'a1',date:'2026-12-01',type:'FD',employeeId:'e1',start:'06:00',end:'14:00'}],absences:[],shifts:[{id:'FD',name:'Frühdienst',start:'06:00',end:'14:00'},{id:'SD',name:'Spätdienst',start:'14:00',end:'22:00'},{id:'ND',name:'Nachtdienst',start:'22:00',end:'06:00'}],getSoll:()=>2,monthTarget:()=>173.92,candidates:()=>({candidates:[],reasons:[{label:'Verbindlicher Rhythmus passt nicht',count:2}]}),teamRules:[]};
}
test('December coverage counts required positions without subtracting overstaffing elsewhere',()=>{
 const s=fixture();s.assignments.push(...Array.from({length:4},(_,i)=>({id:'extra'+i,date:'2026-12-01',type:'SD',employeeId:'x'+i})));
 const r=Core.answer('Welche Dienste sind im Dezember noch offen?',s);assert.match(r.title,/Dezember 2026/);assert.match(r.text,/183 offene Positionen/);assert.match(r.text,/Zusätzlich 2/);assert.equal(r.rows.length,92);
});

test('employee services can be filtered by team and retain employee scope in follow-up',()=>{
 const s=fixture();s.employees[0].planningTeam='E';
 const a=Core.answer('Welche Dienste hat Team E im Dezember?',s);assert.equal(a.rows.length,1);assert.equal(a.rows[0][1],'Anna Plan');assert.equal(a.rows[0][4],'Entwurf');
 const b=Core.answer('Welche Dienste hat Anna Plan im Dezember?',s),c=Core.answer('Und im Januar 2027?',s,b.context);assert.equal(c.rows.length,0);assert.deepEqual(c.context.employeeIds,['e1']);
});
test('ambiguous employee names ask for clarification and accept the full name',()=>{
 const s=fixture();s.employees.push({id:'e5',first:'Anna',last:'Zwei',status:'active',shifts:['FD']});
 const a=Core.answer('Wie viele Stunden hat Anna im Dezember?',s);assert.equal(a.context.pending,true);assert.match(a.text,/Mehrere/);
 const b=Core.answer('Anna Zwei',s,a.context);assert.equal(b.rows.length,1);assert.equal(b.rows[0][0],'Anna Zwei');
 assert.match(Core.answer('Stunden für Niemand im Dezember',s).title,/nicht gefunden/);
});
test('planned hour deviations compare only complete months and do not assert paid overtime',()=>{
 const s=fixture();s.monthTarget=e=>e.id==='e1'?4:20;
 const r=Core.answer('Welche Mitarbeiter haben im Dezember zu viele Stunden?',s);assert.equal(r.rows.length,1);assert.equal(r.rows[0][0],'Anna Plan');assert.equal(r.rows[0][3],'+4 Std.');assert.match(r.text,/kein bestätigtes/);
 assert.match(Core.answer('Welche Mitarbeiter haben heute zu viele Stunden?',s).text,/vollständigen Kalendermonat/);
 const t=Core.answer('Wer liegt im Dezember unter dem Monats-SOLL?',s);assert.equal(t.rows.length,1);assert.equal(t.rows[0][0],'Ben Frei');
});
test('overstaffing lists only shifts above demand and never offsets shortages',()=>{
 const s=fixture();s.assignments.push(...Array.from({length:3},(_,i)=>({date:'2026-12-02',type:'SD',employeeId:'x'+i})));
 const r=Core.answer('Welche Dienste sind im Dezember überbesetzt?',s);assert.equal(r.rows.length,1);assert.equal(r.rows[0][4],'1');assert.equal(r.columns[4],'Über SOLL');
});
test('missing shift permissions use active shift types and ignore deleted or inactive staff',()=>{
 const s=fixture();s.employees[1].shifts=['OLD'];
 const all=Core.answer('Welche Mitarbeiter haben keine Schichtfreigabe?',s);assert.equal(all.rows.length,1);assert.equal(all.rows[0][0],'Ben Frei');
 const fd=Core.answer('Bei wem fehlt die Schichtfreigabe für FD?',s);assert.equal(fd.rows.length,1);
});
test('team day preview uses the stored offset and distinguishes rhythm from real assignments',()=>{
 const s=fixture();s.teamRulesReady=true;s.teamRules=[{team:'E',start:'2026-12-01',pattern:['FD','SD','FREI'],offset:1}];
 const r=Core.answer('Welche Schicht hat Team E am 01.12.2026?',s);assert.equal(r.rows[0][1],'SD');assert.match(r.text,/keine Zusage/);
 const before=Core.answer('Welche Schicht hat Team E am 30.11.2026?',s);assert.match(before.rows[0][1],/Beginnt/);
 s.teamRulesReady=false;assert.equal(Core.answer('Welche Schicht hat Team E heute?',s).rows.length,0);
});
test('personal assignment diagnosis uses sanitized actual candidate assessment',()=>{
 const s=fixture();s.candidates=()=>({candidates:[],reasons:[],assessments:[{employeeId:'e1',eligible:false,reason:'Verbindlicher Rhythmus passt nicht'}]});
 const r=Core.answer('Warum kann Anna Plan am 01.12.2026 den FD nicht übernehmen?',s);assert.match(r.text,/Rhythmus/);assert.equal(r.context.intent,'employeeDiagnosis');
});
test('procedural questions select the correct knowledge topic instead of planning exports',()=>{
 const scope={window:{}};vm.runInNewContext(read('assets/help-center-content-v3.js'),scope);
 const s=fixture();s.helpArticles=scope.window.SFHelpContent.articles;s.helpCategories=scope.window.SFHelpContent.categories;
 const datev=Core.answer('Wie exportiere ich DATEV?',s);assert.match(datev.title,/DATEV-LODAS/);assert.equal(datev.actions[0].help,true);
 assert.match(Core.answer('Wo finde ich meinen QR-Code?',s).text,/QR anzeigen/);
 assert.match(Core.answer('Warum kann ich mich nicht anmelden?',s).text,/Passwort/);
 assert.match(Core.answer('Wie stelle ich den Rhythmus von Team E ein?',s).text,/Einstellungen/);
 const catalog=Core.answer('Welche Hilfethemen kennst du?',s);assert.equal(catalog.rows.length,13);
 assert.match(Core.answer('Wie viele Pausen kann ich beim QR Scan machen?',s).text,/zehn/);
});

test('explicit date and month inputs reject invalid days and handle leap years',()=>{
 const s=fixture();assert.match(Core.answer('Offene Dienste am 31.02.2026',s).text,/ungültig/);assert.match(Core.answer('Offene Dienste am 2026-02-30',s).text,/ungültig/);assert.equal(Core.parsePeriod('februar 2028',s).dates.length,29);assert.equal(Core.parsePeriod('2026-12',s).dates.length,31);assert.equal(Core.parsePeriod('1. dezember 2026',s).dates[0],'2026-12-01');
});
test('relative months use current date and cross year boundaries',()=>{const s={...fixture(),today:'2026-12-31'};assert.equal(Core.parsePeriod('naechsten monat',s).dates[0],'2027-01-01');assert.equal(Core.parsePeriod('morgen',s).dates[0],'2027-01-01');});
test('replacement asks for missing date and shift, then accepts follow-up',()=>{
 const s=fixture();s.defaultDates=Core.parsePeriod('dezember 2026',s).dates;
 const ask=Core.answer('Welche Mitarbeiter kommen als Ersatz infrage?',s);assert.equal(ask.context.pending,true);assert.match(ask.text,/konkreten Tag und die Schichtart/);
 const r=Core.answer('Am 02.12.2026 im Frühdienst',s,ask.context);assert.equal(r.context.intent,'replacement');assert.equal(r.context.type,'FD');assert.equal(r.context.dates[0],'2026-12-02');assert.match(r.text,/kein Mitarbeiter/);
});
test('natural text asking who can take over is not treated as a write command',()=>{const r=Core.answer('Wer kann am 01.12.2026 den FD übernehmen?',fixture());assert.equal(r.context.intent,'replacement');});
test('no team includes only active nondeleted staff and explains intentional unassigned employees',()=>{const r=Core.answer('Bei welchen Mitarbeitern fehlt eine Teamzuordnung?',fixture());assert.equal(r.rows.length,1);assert.equal(r.rows[0][0],'Ben Frei');assert.match(r.text,/beabsichtigt/);});
test('team help gives the actual central settings location',()=>{const r=Core.answer('Wie stelle ich den Rhythmus von Team E ein?',fixture());assert.match(r.title,/Team E/);assert.match(r.text,/Einstellungen/);assert.equal(r.actions[0].view,'settings');});
test('diagnostic describes current evidence instead of claiming to know historical auto-plan decisions',()=>{const r=Core.answer('Warum konnte die Auto-Planung den ND am 01.12.2026 nicht besetzen?',fixture());assert.match(r.text,/früheren Auto-Planung/);assert.match(r.rows[0][3],/Rhythmus/);});
test('follow-up month retains the previous topic but an unrelated question starts a new topic',()=>{const s=fixture(),a=Core.answer('Welche Dienste sind im Dezember offen?',s),b=Core.answer('Und im Januar 2027?',s,a.context);assert.match(b.title,/Januar 2027/);const c=Core.answer('Wie stelle ich den Rhythmus von Team E ein?',s,b.context);assert.equal(c.context.intent,'rhythmHelp');});
test('work hours include the full eight-hour overnight shift without break deduction',()=>{const s=fixture();s.assignments.push({date:'2026-12-02',type:'ND',employeeId:'e1',pause:30});const r=Core.answer('Wie viele Stunden sind im Dezember für Anna Plan geplant?',s);assert.equal(r.rows.length,1);assert.equal(r.rows[0][1],'16 Std.');});
test('zero staffing requirement is not presented as a completed plan',()=>{const s=fixture();s.getSoll=()=>0;assert.match(Core.answer('Prüfe die Besetzung im Dezember',s).text,/kein SOLL-Bedarf/);});
test('unknown questions are explicit and never fabricate data',()=>{const r=Core.answer('Wie ist das Wetter?',fixture());assert.match(r.text,/noch keine zuverlässige/);assert.equal(r.rows.length,0);});
test('additional product questions reuse the current help-center articles',()=>{const s=fixture();s.helpArticles={settings:[['Wie ändere ich Schichtzeiten?','Öffne die Einstellungen und bearbeite das Schichtmodell.']]};const r=Core.answer('Wie ändere ich Schichtzeiten?',s);assert.match(r.text,/Schichtmodell/);assert.equal(r.actions[0].help,true);});
test('requests to mutate do not change source data',()=>{const s=fixture(),before=JSON.stringify(s);const r=Core.answer('Bitte lösche alle Dienste',s);assert.equal(r.context.intent,'write');assert.equal(JSON.stringify(s),before);});
test('unauthorized, loading and failed contexts do not touch personnel data',()=>{for(const partial of [{authorized:false},{authorized:true,loading:true},{authorized:true,error:true}]){const s={...partial};Object.defineProperty(s,'employees',{get(){throw Error('Personnel data must not be read');}});assert.equal(Core.answer('Wer hat kein Team?',s).rows.length,0);}});
test('integration uses final app candidate ranking and filters missing rhythm, absence, hours and role',()=>{
 const fields={autoRespectHours:{checked:true}},employees=[{id:'good',first:'Geeignet',status:'active',shifts:['FD']},{id:'absent',status:'active',shifts:['FD']},{id:'rhythm',status:'active',shifts:['FD']},{id:'hours',status:'active',shifts:['FD']},{id:'noPermission',status:'active',shifts:['ND']}];
 const findings={absent:{hard:['Abwesenheit (Krank) überschneidet sich mit der Schicht.'],soft:[]},rhythm:{hard:['Verbindliche Schichtregel: Frei.'],soft:[]},hours:{hard:[],soft:['Wochen-SOLL würde steigen.']}};
 const ctx={window:{SFPlanningAssistantCore:Core,SFBackend:{ready:true,role:'PLANNER',user:{id:'u'},companyId:'co'},SFCompliance:{check:e=>findings[e.id]||{hard:[],soft:[]}},SFAutoPlanGuard:{passesTimeRules:()=>true}},sessionStorage:{getItem:()=>null},document:{readyState:'loading',body:{},addEventListener(){},getElementById:id=>fields[id]||null,querySelector:()=>null},MutationObserver:class{observe(){}},setInterval(){},queueMicrotask(){},employees,assignments:[],absences:[],TYPES:[{id:'FD',start:'06:00',end:'14:00'}],currentWeekDates:()=>[new Date('2026-12-01T12:00:00')],iso:()=> '2026-12-01',getSoll:()=>2,employeeMonthlyTarget:()=>160,autoEligibleEmployees:()=>[{e:employees[0],h:8,target:40,monthHours:8,monthTarget:160},{e:employees[1],h:0,target:40}]};
 vm.runInNewContext(read('assets/planning-assistant-v1.js'),ctx);
 const r=ctx.window.SFPlanningAssistant.ask('Wer kann am 01.12.2026 den FD übernehmen?');assert.equal(r.rows.length,1);assert.equal(r.rows[0][0],'Geeignet');
 ctx.window.SFBackend.role='EMPLOYEE';assert.equal(ctx.window.SFPlanningAssistant.ask('Wer kann einspringen?').rows.length,0);
 ctx.window.SFBackend.role='TIME_TRACKING';assert.match(ctx.window.SFPlanningAssistant.ask('Wer hat kein Team?').title,/Anmeldung/);
});

test('knowledge distinguishes actual time exports and employee scope resets when another team is requested',()=>{
 const scope={window:{}};vm.runInNewContext(read('assets/help-center-content-v3.js'),scope);
 const s=fixture();s.helpArticles=scope.window.SFHelpContent.articles;s.employees[1].planningTeam='E';
 assert.match(Core.answer('Wie exportiere ich Monatsberichte?',s).text,/Zeiterfassung/);
 assert.match(Core.answer('Was zeigt das Stundenkonto?',s).title,/Stundenkonto/);
 const first=Core.answer('Welche Dienste hat Anna Plan im Dezember?',s),next=Core.answer('Und Team E?',s,first.context);
 assert.equal(next.rows.length,0);assert.equal(next.context.employeeIds,undefined);assert.equal(next.context.team,'E');
});
