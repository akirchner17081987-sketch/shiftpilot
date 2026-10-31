const test=require('node:test'),assert=require('node:assert/strict'),Core=require('../assets/planning-assistant-core-v1.js'),Solid=require('../assets/solid-planning-core-v1.js');
function fixture(){
 const e={id:'a',first:'Anna',last:'Plan',status:'active',shifts:['FD'],monthlyHours:180};
 const s={authorized:true,today:'2026-12-02',defaultDates:['2026-12-01','2026-12-02','2026-12-03','2026-12-07'],employees:[e],shifts:[{id:'FD',start:'06:00',end:'14:00'}],assignments:[{id:'old',employeeId:'a',date:'2026-12-01',type:'FD',start:'06:00',end:'14:00'}],getSoll:()=>2,monthTarget:()=>180,candidates:()=>({candidates:[{e,fit:['Freigabe FD','Ruhezeit eingehalten']}],reasons:[]}),isPublished:()=>false};
 return s;
}
test('central overview ranks today and near dates first and keeps overdue holes visible without writes',()=>{
 const s=fixture(),before=JSON.stringify(s),r=Core.answer('Offene Stellen Übersicht vom 01.12.2026 bis 07.12.2026',s);
 assert.equal(r.context.intent,'vacancies');assert.match(r.text,/13 offene Positionen/);assert.deepEqual(r.rows.map(x=>x[0]),['Heute','Nächste 3 Tage','Nächste 3 Tage','Nächste 3 Tage','Später','Später','Vergangen']);assert.equal(r.rowActions[0].question,'Ersatz für FD am 2026-12-02');assert.equal(r.rowSecondaryActions[0].date,'2026-12-02');assert.ok(r.basis);assert.equal(JSON.stringify(s),before);
});
test('shared coverage appears once, daily zero targets remove holes and optional coverage is excluded',()=>{
 const s=fixture();s.shifts=[{id:'TL-LE'},{id:'TL-RE'},{id:'QA'}];s.getSoll=()=>0;s.coverageInfo=(date,type)=>type.startsWith('TL')?{representative:'TL-LE',members:[{id:'TL-LE'},{id:'TL-RE'}],label:'TL LE/RE',target:date==='2026-12-02'?2:0,filled:1}:null;
 const r=Core.vacancyOverview(s,s.defaultDates);assert.equal(r.rows.length,1);assert.deepEqual(r.rows[0].slice(2),['TL LE/RE','2','1','1']);assert.equal(r.rowActions[0].question,'Ersatz für TL-LE am 2026-12-02');
 s.coverageInfo=()=>null;assert.equal(Core.vacancyOverview(s,s.defaultDates).rows.length,0);
});
test('candidate impact projects actual hours and coverage without changing SOLL or duties',()=>{
 const s=fixture(),before=JSON.stringify(s),r=Core.candidateImpact(s,'2026-12-02','FD','a',s.defaultDates);
 assert.equal(r.openBefore,7);assert.equal(r.openAfter,6);assert.equal(r.staffingBefore,0);assert.equal(r.staffingAfter,1);assert.equal(r.target,2);assert.equal(r.monthBefore,8);assert.equal(r.monthAfter,16);assert.equal(r.monthTarget,180);assert.equal(r.added,8);assert.equal(JSON.stringify(s),before);
});
test('impact evaluates conditional demand against the proposed plan through the shared coverage callback',()=>{
 const s=fixture();s.coverageRows=(dates,rows)=>[{missing:rows.length>1?4:2}];const r=Core.candidateImpact(s,'2026-12-02','FD','a',s.defaultDates);assert.equal(r.openBefore,2);assert.equal(r.openAfter,4);
});
test('shared alternative predicts a single reduced vacancy and uses the real shift duration',()=>{
 const s=fixture();s.shifts=[{id:'TL-LE',start:'18:00',end:'04:00'},{id:'TL-RE',start:'20:00',end:'06:00'}];s.coverageInfo=()=>({representative:'TL-LE',members:s.shifts,target:3,filled:1});s.coverageRows=(dates,rows)=>[{missing:3-rows.length}];const r=Core.candidateImpact(s,'2026-12-02','TL-RE','a',['2026-12-02']);assert.equal(r.target,3);assert.equal(r.staffingBefore,1);assert.equal(r.openBefore-r.openAfter,1);assert.equal(r.added,10);
});
test('changed eligibility, filled demand, unavailable person and unauthorized state fail before any mutation',()=>{
 const s=fixture();s.candidates=()=>({candidates:[],reasons:[]});assert.throws(()=>Core.candidateImpact(s,'2026-12-02','FD','a'),/Planungsregeln/);s.getSoll=()=>0;assert.throws(()=>Core.candidateImpact(s,'2026-12-02','FD','a'),/vollständig besetzt/);s.employees=[];assert.throws(()=>Core.candidateImpact(s,'2026-12-02','FD','a'),/nicht mehr verfügbar/);s.authorized=false;assert.throws(()=>Core.candidateImpact(s,'2026-12-02','FD','a'),/nicht bereit/);assert.equal(Core.answer('Offene Stellen Übersicht',s).rows.length,0);
});
test('published periods allow impact inspection but are marked for the normal published-plan flow',()=>{
 const s=fixture();s.isPublished=()=>true;assert.equal(Core.candidateImpact(s,'2026-12-02','FD','a').published,true);
});
test('DST-aware existing application hours remain authoritative in impact previews',()=>{
 const s=fixture();s.shifts=[{id:'FD',start:'22:00',end:'06:00'}];s.assignments=[];s.assignmentHours=a=>{const iv=Solid.interval(a.date,a.start,a.end,'Europe/Berlin');return(iv.end-iv.start)/3600000;};
 assert.equal(Core.candidateImpact(s,'2026-10-24','FD','a').added,9);assert.equal(Core.candidateImpact(s,'2026-03-28','FD','a').added,7);
});
