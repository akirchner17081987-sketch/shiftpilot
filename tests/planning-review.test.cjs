const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(new URL('../'+p,'file://'+__filename),'utf8');
const source=read('assets/auto-plan-workspace-v1.js').split('// Read-only diagnostics and comparisons.')[1];
function harness(){
 const fields=new Map(),listeners={},el=id=>{if(!fields.has(id))fields.set(id,{checked:true,innerHTML:'',querySelector:()=>null});return fields.get(id)};
 const c={console,Date,Intl,Map,Set,document:{readyState:'loading',getElementById:el,querySelectorAll:()=>[],addEventListener:(name,fn)=>listeners[name]=fn},employees:[{id:'a',personnelNo:'115',first:'Test',last:'Person',status:'active',shifts:['O1','SD'],employment:'Vollzeit',monthlyHours:180,weeklyHours:55}],assignments:[],absences:[],TYPES:[{id:'O1',start:'18:00',end:'04:00'},{id:'SD',start:'08:00',end:'18:00'}],autoPlanPreview:[],autoPlanApplied:0,SFBackend:{companyId:'one'}};
 c.window=c;c.typeById=id=>c.TYPES.find(t=>t.id===id);c.employeeMonthlyTarget=e=>e.monthlyHours;
 c.plannedAssignmentHours=a=>{const t=c.typeById(a.type),iv=c.SFSolidPlanningCore.interval(a.date,a.start||t.start,a.end||t.end);return(iv.end-iv.start)/3600000};
 c.autoPlanningDates=()=>['2027-01-04','2027-01-05'];c.autoOpenSlots=()=>[{date:'2027-01-05',type:'O1'}];c.absent=()=>false;
 c.autoHourLimits=()=>({monthLimit:200,maxMonthlyShifts:Infinity,weeklyLimit:55});c.autoPlannedHours=()=>0;
 c.SFCompliance={policy:{solidPlanningRules:{enabled:true,confirmedRulesVersion:2,monthlyHoursOnly:true,monthlyMaxHours:200,maxCalendarWeekHours:55,timezone:'Europe/Berlin'}},check:()=>({hard:[]})};
 vm.createContext(c);vm.runInContext(read('assets/ot-weekend-holiday-policy.js'),c);vm.runInContext(read('assets/solid-planning-core-v1.js'),c);vm.runInContext('// Read-only diagnostics and comparisons.'+source,c);
 return{c,api:c.SFPlanningReview,e:c.employees[0],el,listeners,slot:{date:'2027-01-05',type:'SD'}};
}
const duty=(employeeId='a',date='2027-01-04',type='SD',extra={})=>({employeeId,date,type,...extra});
const plain=x=>JSON.parse(JSON.stringify(x));
test('comparison ignores regenerated IDs, row order, notes, cancelled and outside-period duties',()=>{
 const{c,api}=harness(),before=api.snapshot([duty('a'),duty('a','2027-01-05','O1')],c.autoPlanningDates(),2);
 const after=[duty('b','2026-12-01'),duty('a','2027-01-05','O1',{id:'new'}),duty('a','2027-01-04','SD',{id:'new2',note:'edited'}),duty('b','2027-01-04','SD',{_dbStatus:'CANCELLED'})];
 const result=api.compare(before,after,c.autoPlanningDates(),2);assert.equal(result.unchanged,2);assert.equal(result.changes.length,0);assert.equal(result.missingAfter,160);
});
test('comparison preserves duplicate counts and reports exact person, shift and time changes',()=>{
 const{c,api}=harness(),before=api.snapshot([duty(),duty(),duty('a','2027-01-05','O1')],c.autoPlanningDates(),3);
 const result=api.compare(before,[duty(),duty('b'),duty('a','2027-01-05','O1',{start:'19:00',end:'04:00'})],c.autoPlanningDates(),1);
 assert.equal(result.unchanged,1);assert.equal(result.removed,2);assert.equal(result.added,2);assert.equal(result.openBefore,3);assert.equal(result.openAfter,1);assert.equal(result.missingBefore,150);assert.equal(result.missingAfter,161);
});
test('background snapshot round trip retains baseline without storing employee contact details',()=>{
 const{c,api}=harness();c.employees[0].email='private@example.test';const before=plain(api.snapshot([duty()],c.autoPlanningDates(),1));
 assert.equal(api.compare(before,[duty()],c.autoPlanningDates(),0).unchanged,1);assert.doesNotMatch(JSON.stringify(before),/private@|Test|Person/);
 c.SFBackend.companyId='two';assert.equal(api.compare(before,[],c.autoPlanningDates(),0),null);c.SFBackend.companyId='one';assert.equal(api.compare(before,[],['2027-02-01'],0),null);assert.equal(api.compare(undefined,[],c.autoPlanningDates(),0),null);
});
test('diagnostics name missing permission, employment, absence, existing duty and personal rhythm',()=>{
 const{c,api,e,slot}=harness();e.shifts=['O1'];e.startDate='2027-02-01';c.absent=()=>true;c.assignments=[duty('a','2027-01-05')];c.sfRhythmCheck=()=>({mode:'required',allowed:false,reason:'115: Mo–Do O3'});
 const found=api.evaluate(e,slot);assert.equal(found.status,'blocked');assert.match(found.reasons.join(' '),/Freigabe.*Beschäftigungszeitraum.*Abwesenheit.*bereits.*115: Mo–Do O3/);
});
test('strict automatic month cap remains enforced when manual planner check returns only soft warnings',()=>{
 const{c,api,e,slot}=harness();c.SFCompliance.check=()=>({hard:[],soft:['Planer überschreitet Grenze']});
 c.assignments=Array.from({length:20},(_,i)=>duty('a','2027-01-'+String(i+8).padStart(2,'0')));
 const original=c.assignments,rows=JSON.stringify(original),found=api.evaluate(e,slot);
 assert.equal(found.status,'blocked');assert.match(found.reasons.join(' '),/Monatsobergrenze 200 h/);assert.equal(c.assignments,original);assert.equal(JSON.stringify(original),rows);
});
test('calendar week and overnight carryovers use real planning core',()=>{
 const{c,api,e}=harness();c.assignments=[4,6,7,8,9].map(n=>duty('a','2027-01-0'+n));
 const found=api.evaluate(e,{date:'2027-01-05',type:'SD'});assert.equal(found.status,'blocked');assert.match(found.reasons.join(' '),/55 Stunden pro Kalenderwoche/);
 const checked=[];c.assignments=[];c.SFCompliance.monthPlanningCheck=(e,date)=>{checked.push(date);return date.startsWith('2027-02')?['Monatsübertrag überschreitet Februargrenze']:[]};
 const overnight=api.evaluate(e,{date:'2027-01-31',type:'O1'});assert.deepEqual(checked,['2027-01-01','2027-02-01']);assert.match(overnight.reasons.join(' '),/Februargrenze/);
});
test('a compatible alternative is reported as an individual check, not proven assignability',()=>{
 const{c,api,e}=harness();e.shifts=['SD'];const found=api.evaluate(e,{date:'2027-01-05',type:'O1',alternatives:['O1','SD']});
 assert.equal(found.status,'review');assert.deepEqual(plain(found.possible),['SD']);assert.match(api.slotMarkup({date:'2027-01-05',type:'SD'}),/<details/);
});
test('unexpected validator failures restore assignments and report incomplete rather than usable',()=>{
 const{c,api,e,slot}=harness(),original=c.assignments;c.SFCompliance.check=()=>{throw Error('fixture')};
 const found=api.evaluate(e,slot);assert.equal(found.status,'unknown');assert.match(found.reasons.join(' '),/unvollständig/);assert.equal(c.assignments,original);
});
test('diagnostics re-evaluate changed previews and separate fixed OT crew positions',()=>{
 const{c,api,e,slot}=harness();assert.equal(api.evaluate(e,slot).status,'review');c.autoPlanPreview=[duty('a','2027-01-05')];assert.match(api.evaluate(e,slot).reasons.join(' '),/bereits/);
 c.autoPlanPreview=[];const found=api.evaluate(e,{...slot,coverageGroup:'OT-DAY'});assert.match(found.reasons.join(' '),/fest hinterlegten OT-Tagdienstgruppe/);
});
test('comparison clears correctly between applied, old background and repeated proposals; escapes names',()=>{
 const{c,api,el}=harness();c.employees[0].first='<img src=x onerror=alert(1)>';const reviewBefore=api.snapshot([duty()],c.autoPlanningDates(),1),result={base:[],reviewBefore};
 c.autoPlanPreview=[duty('a','2027-01-05')];api.render(result);const html=el('autoPlanComparison').innerHTML;assert.match(html,/Was verändert/);assert.doesNotMatch(html,/<img/);
 api.render(null);assert.equal(el('autoPlanComparison').innerHTML,'');api.render(result);assert.equal(el('autoPlanComparison').innerHTML,html);
 api.render({base:[]});assert.match(el('autoPlanComparison').innerHTML,/Ausgangsstand/);api.render(result);assert.equal(el('autoPlanComparison').innerHTML,html);
 c.autoPlanApplied=1;api.render(result);assert.equal(el('autoPlanComparison').hidden,true);
});

test('rhythm summary refreshes when an exception changes without changing the assignment',()=>{
 const{c,api,el}=harness();vm.runInContext(read('assets/planning-context-v1.js'),c);const original=duty(),result={base:[original],reviewBefore:api.snapshot([original],c.autoPlanningDates(),1)};
 api.render(result);assert.doesNotMatch(el('autoPlanComparison').innerHTML,/bestätigte Rhythmusausnahmen/);
 original.rhythmOverride={reason:'Confirmed extra duty'};api.render(result);assert.match(el('autoPlanComparison').innerHTML,/1 bestätigte Rhythmusausnahmen/);assert.match(el('autoPlanComparison').innerHTML,/Confirmed extra duty/);
 original.rhythmOverride.reason='Updated reason';api.render(result);assert.match(el('autoPlanComparison').innerHTML,/Updated reason/);assert.doesNotMatch(el('autoPlanComparison').innerHTML,/Confirmed extra duty/);
});
