const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
async function setup(){
 const {Window}=await import('happy-dom'),w=new Window({url:'https://fixture.test'});
 w.document.body.innerHTML='<div id="autoStaircase"><table class="sf-auto-stair-table"><tbody><tr data-auto-employee="one"><th>Anna</th><td></td><td></td></tr><tr data-auto-employee="two"><th>Berta</th><td></td><td></td></tr></tbody><tbody class="sf-auto-staffing"><tr data-staffing-shift="T"><th>T</th><td class="is-short">0/1</td><td class="is-short">0/1</td></tr></tbody></table></div><div id="autoSuggestions"></div><input id="autoRespectHours" type="checkbox">';
 Object.assign(w,{autoPlanPreview:[],assignments:[],autoPlanAnalyzed:true,autoPlanApplied:false,autoPlanApplying:false,
  employees:[{id:'one',first:'Anna',last:'Ahorn',status:'active',shifts:['T','S']},{id:'two',first:'Berta',last:'Bach',status:'active',shifts:['T','X']}],
  TYPES:[{id:'T',start:'06:00',end:'14:00'},{id:'S',start:'14:00',end:'22:00'},{id:'X',start:'22:00',end:'06:00'},{id:'OLD',active:false,start:'06:00',end:'14:00'}],
  SFBackend:{companyId:'company-one'},SFCompliance:{policy:{solidPlanningRules:{}},check:()=>({hard:[],soft:[]}),isWeekPublished:()=>false},
  autoPlanningDates:()=>['2027-01-04','2027-01-05'],autoHourLimits:()=>({monthLimit:100,maxMonthlyShifts:20}),autoPlannedHours:()=>0,
  iso:d=>d.toISOString().slice(0,10),addDays:(d,n)=>new Date(+d+n*86400000),plannedAssignmentHours:()=>8,getSoll:()=>1,absent:()=>false,renderAutoPlanning:()=>w.SFAutoPlanWorkspace.render(),
  SFAutoPlanWorkspace:{render(){},confirmApply:()=>Promise.resolve(true)},showSaveToast:(...v)=>{w.notice=v;}
 });
 w.typeById=id=>w.TYPES.find(t=>t.id===id);w.editAssignment=(id,options)=>{w.openedSaved={id,options};};
 w.eval(fs.readFileSync('assets/auto-plan-preview-editor-v1.js','utf8'));w.SFAutoPlanPreviewEditor.decorate();
 const $=s=>w.document.querySelector(s),change=(s,value)=>{$(s).value=value;$(s).dispatchEvent(new w.Event('change'));},submit=()=>$('#sfPreviewEditForm').dispatchEvent(new w.Event('submit',{cancelable:true}));
 return {w,$,change,submit,close:()=>w.happyDOM.abort()};
}
test('employee row fixes employee and date, offers only their shifts and never substitutes another person',async()=>{
 const {w,$,change,submit,close}=await setup();try{
 $('[data-auto-employee="one"] td button').click();assert.match($('.sf-auto-row-context').textContent,/Anna/);assert.doesNotMatch($('.sf-auto-preview-dialog').textContent,/Berta/);
 assert.equal($('#sfPreviewEmployee').type,'hidden');assert.equal($('#sfPreviewFrom').type,'hidden');assert.equal($('#sfPreviewTo').type,'hidden');
 assert.deepEqual([...$('#sfPreviewShift').options].map(o=>o.value),['T','S']);assert.equal(w.document.activeElement.id,'sfPreviewShift');
 change('#sfPreviewShift','S');$('#sfPreviewEmployee').value='two';$('#sfPreviewFrom').value='2027-01-05';$('#sfPreviewTo').value='2027-01-05';submit();
 assert.equal(!!$('.sf-auto-preview-dialog'),false,$('#sfPreviewEditError')?.textContent);assert.deepEqual(JSON.parse(JSON.stringify(w.autoPlanPreview.map(a=>[a.employeeId,a.date,a.type]))),[['one','2027-01-04','S']]);assert.equal(w.assignments.length,0);
 // Editing an occupied preview cell keeps the same employee and replaces only that duty.
 $('[data-auto-employee="one"] td button').click();change('#sfPreviewShift','T');change('#sfPreviewStart','07:00');change('#sfPreviewEnd','15:00');submit();assert.equal(w.autoPlanPreview[0].start,'07:00');assert.equal(w.autoPlanPreview[0].end,'15:00');assert.equal(w.autoPlanPreview.length,1);assert.equal(w.autoPlanPreview[0].employeeId,'one');assert.equal(w.autoPlanPreview[0].type,'T');
 }finally{await close();}
});
test('blocked row stays on that person; no permissions, saved duties and tenant switches cannot choose a replacement',async()=>{
 const {w,$,change,submit,close}=await setup();try{
 w.absent=id=>id==='one';$('[data-auto-employee="one"] td button').click();assert.match($('#sfPreviewEditError').textContent,/abwesend/);assert.equal($('[type="submit"]').disabled,true);assert.equal($('#sfPreviewEmployee').value,'one');assert.equal(!!$('select#sfPreviewEmployee'),false);$('[data-cancel]').click();assert.equal(w.autoPlanPreview.length,0);
 w.absent=()=>false;w.employees[0].shifts=[];$('[data-auto-employee="one"] td button').click();assert.match($('#sfPreviewEditError').textContent,/keine aktive Schicht/);assert.equal($('[type="submit"]').disabled,true);$('[data-cancel]').click();
 w.employees[0].shifts=['T'];w.assignments.push({id:'saved',employeeId:'one',type:'T',date:'2027-01-04'});$('[data-auto-employee="one"] td button').click();assert.equal(!!$('.sf-auto-preview-dialog'),false,$('#sfPreviewEditError')?.textContent);assert.equal(w.openedSaved.id,'saved');assert.equal(w.openedSaved.options.fixedEmployee,true);assert.equal(w.openedSaved.options.fixedDate,true);w.assignments=[];
 $('[data-auto-employee="one"] td button').click();w.SFBackend.companyId='company-two';submit();assert.match($('#sfPreviewEditError').textContent,/Planungsdaten wurden geändert/);assert.equal(w.autoPlanPreview.length,0);
 }finally{await close();}
});
test('generic and vacancy dialogs retain employee selection; other companies get the same fixed row behavior',async()=>{
 const {w,$,submit,close}=await setup();try{
 $('[data-add]').click();assert.equal($('#sfPreviewEmployee').tagName,'SELECT');assert.equal($('#sfPreviewFrom').type,'date');assert.ok([...$('#sfPreviewEmployee').options].some(o=>o.value==='two'));$('[data-cancel]').click();
 $('.sf-auto-staffing-add').click();assert.equal($('#sfPreviewEmployee').tagName,'SELECT');assert.ok($('#sfPreviewSearch'));$('[data-cancel]').click();
 w.SFBackend.companyId='company-two';$('[data-auto-employee="two"] td:nth-of-type(2) button').click();assert.equal($('#sfPreviewEmployee').type,'hidden');assert.match($('.sf-auto-row-context').textContent,/Berta/);submit();assert.equal(w.autoPlanPreview[0].employeeId,'two');assert.equal(w.autoPlanPreview[0].date,'2027-01-05');
 }finally{await close();}
});

function nativeWorkflow(w){
 Object.assign(w.SFCompliance,{esc:v=>String(v??''),uid:()=>String(Math.random()),fmt:d=>d,audit(){},refresh(){},toast(){},isPublished:a=>!!a?.publishedAt,openChangeDrawer:p=>{w.publishedRequest=p;}});
 w.confirm=()=>true;
 w.eval(fs.readFileSync('assets/compliance-workflow-v2.js','utf8'));
}
test('saved drafts open within preview and after apply; native edits keep row identity, times, pause and note',async()=>{
 const {w,$,close}=await setup();try{
 nativeWorkflow(w);w.assignments=[{id:'saved',employeeId:'one',type:'T',date:'2027-01-04',start:'06:00',end:'14:00',pause:20,note:'Existing note',version:1}];w.autoPlanApplied=1;w.SFAutoPlanPreviewEditor.decorate();
 $('[data-auto-employee="one"] td button').click();assert.equal($('#spEditEmp').options.length,1);assert.equal($('#spEditEmp').disabled,true);assert.equal($('#spEditDate').readOnly,true);assert.equal($('#spEditNote').value,'Existing note');
 assert.deepEqual([...$('#spEditType').options].map(o=>o.value),['T','S']);$('#spEditType').value='S';$('#spEditType').onchange();$('#spEditStart').value='15:00';$('#spEditEnd').value='23:00';$('#spEditPause').value='30';$('#spEditNote').value='Corrected';$('#spEditEmp').value='two';$('#spEditDate').value='2027-01-05';$('#spSaveAssign').click();
 assert.deepEqual(JSON.parse(JSON.stringify(w.assignments.map(a=>[a.id,a.employeeId,a.date,a.type,a.start,a.end,a.pause,a.note]))),[['saved','one','2027-01-04','S','15:00','23:00',30,'Corrected']]);assert.equal(w.autoPlanPreview.length,0);assert.equal(!!$('#spAssignModal'),false);
 $('[data-auto-employee="one"] td button').click();$('#spDeleteAssign').click();assert.equal(w.assignments.length,0);assert.equal(!!$('#spAssignModal'),false);
 }finally{await close();}
});
test('saved published shifts retain approval workflow and stale saved editors cannot write across tenant or version changes',async()=>{
 const {w,$,close}=await setup();try{
 nativeWorkflow(w);w.assignments=[{id:'saved',employeeId:'one',type:'T',date:'2027-01-04',start:'06:00',end:'14:00',publishedAt:'2026-12-01T00:00Z',version:1}];w.autoPlanApplied=1;w.SFAutoPlanPreviewEditor.decorate();
 $('[data-auto-employee="one"] td button').click();$('#spEditStart').value='07:00';$('#spSaveAssign').click();assert.equal(w.publishedRequest.action,'UPDATE');assert.equal(w.publishedRequest.assignment.id,'saved');assert.equal(w.assignments[0].start,'06:00');
 delete w.assignments[0].publishedAt;$('[data-auto-employee="one"] td button').click();w.assignments[0].version++;$('#spEditStart').value='08:00';$('#spSaveAssign').click();assert.equal(w.assignments[0].start,'06:00');$('#spAssignModal').remove();
 $('[data-auto-employee="one"] td button').click();w.SFBackend.companyId='other';$('#spSaveAssign').click();assert.equal(w.assignments[0].start,'06:00');$('#spDeleteAssign').click();assert.equal(w.assignments.length,1);
 }finally{await close();}
});
test('saved duty edits never destroy pending proposals, and an optimized snapshot requires recalculation',async()=>{
 const {w,$,close}=await setup();try{
 nativeWorkflow(w);w.assignments=[{id:'saved',employeeId:'one',type:'T',date:'2027-01-04',start:'06:00',end:'14:00'}];w.autoPlanPreview=[{id:'proposal',employeeId:'two',type:'T',date:'2027-01-05',start:'06:00',end:'14:00'}];
 const result={base:[{...w.assignments[0]}],company:w.SFBackend.companyId};w.SFMonthOptimizer={getResult:()=>result,isBusy:()=>false,savedAssignmentChanged(id){result.needsReplan=true;result.base=w.assignments.filter(a=>a.id===id).map(a=>({...a}));}};
 w.SFAutoPlanPreviewEditor.decorate();$('[data-auto-employee="one"] td button').click();$('#spEditStart').value='07:00';$('#spSaveAssign').click();assert.equal(w.autoPlanPreview.length,1);assert.equal(w.autoPlanPreview[0].id,'proposal');assert.equal(result.needsReplan,true);assert.equal(result.base[0].start,'07:00');assert.match(w.SFAutoPlanPreviewEditor.reviewIssues()[0],/neu berechnen/);assert.equal(await w.SFAutoPlanWorkspace.confirmApply(),false);
 }finally{await close();}
});

test('manual preview duty wins over rhythm-free, preserves the exception through undo and still blocks other conflicts',async()=>{
 const {w,$,submit,close}=await setup();try{
 Object.assign(w.SFBackend,{ready:true,role:'PLANNER',planningPolicyCompanyId:'company-one'});w.SFPlanningRuleSettings={context:()=>w.SFBackend.planningPolicyCompanyId===w.SFBackend.companyId?{}:null};
 w.sfRhythmCheck=()=>({mode:'required',allowed:false,expected:'FREI',reason:'Rhythmus erwartet einen freien Tag'});
 w.SFCompliance.check=(e,t,d,s,end,ignore,options={})=>({hard:options.manualRhythm?[]:['Verbindliche Schichtregel: Rhythmus erwartet einen freien Tag'],soft:[]});
 w.eval(fs.readFileSync('assets/manual-rhythm-exceptions-v1.js','utf8'));
 $('[data-auto-employee="one"] td button').click();assert.equal($('[type=submit]').disabled,false);assert.match($('#sfPreviewRhythmNote').textContent,/bewusst/);submit();
 assert.equal(!!$('.sf-auto-preview-dialog'),false,$('#sfPreviewEditError')?.textContent);const a=w.autoPlanPreview[0];assert.equal(w.SFManualRhythm.isPreviewOverride(a),true);assert.equal(w.SFAutoPlanPreviewEditor.check(w.autoPlanPreview,[a]).length,0);assert.equal(w.SFAutoPlanPreviewEditor.reviewIssues().length,0);
 assert.match(w.SFAutoPlanPreviewEditor.check([{...a,rhythmOverride:null}],[{...a,rhythmOverride:null}]).join(' '),/Rhythmus/);assert.equal(w.sfRhythmCheck().allowed,false);
 w.absent=()=>true;assert.match(w.SFAutoPlanPreviewEditor.check(w.autoPlanPreview,[a]).join(' '),/abwesend/);w.absent=()=>false;w.SFAutoPlanPreviewEditor.undo();assert.equal(w.autoPlanPreview.length,0);
 w.SFCompliance.policy.solidPlanningRules.manualRhythmExceptions=false;$('[data-auto-employee="one"] td button').click();assert.equal($('[type=submit]').disabled,false);submit();assert.equal(w.autoPlanPreview.length,1);
 }finally{await close();}
});

test('ordinary preview application retains manually confirmed rhythm metadata and rejects an unconfirmed automatic row',async()=>{
 const {w,$,submit,close}=await setup();try{
 Object.assign(w.SFBackend,{ready:true,role:'PLANNER'});w.SFPlanningRuleSettings={context:()=>({})};w.sfRhythmCheck=()=>({mode:'required',allowed:false,expected:'FREI',reason:'Rhythmus erwartet einen freien Tag'});
 w.SFCompliance.check=(e,t,d,s,end,ignore,options={})=>({hard:options.manualRhythm?[]:['Rhythmus erwartet einen freien Tag'],soft:[]});w.eval(fs.readFileSync('assets/manual-rhythm-exceptions-v1.js','utf8'));
 $('[data-auto-employee="one"] td button').click();submit();const original=w.autoPlanPreview[0];
 const source=fs.readFileSync('index.html','utf8');w.eval(source.slice(source.indexOf('async function applyAutoPlanPreview(){'),source.indexOf('function runAutoPlan(){',source.indexOf('async function applyAutoPlanPreview(){')))+';window.applyAutoPlanPreview=applyAutoPlanPreview;');
 w.autoEligibleEmployees=()=>[];w.saveAll=()=>{};w.renderCalendar=()=>{};w.autoMonday=()=>new Date('2027-01-04T12:00Z');w.SFBackend.sync=async()=>{};
 w.autoPlanPreview=[{...original,rhythmOverride:null}];await w.applyAutoPlanPreview();assert.equal(w.assignments.length,0);assert.match(w.notice.join(' '),/nicht mehr verfügbar/);
 w.autoPlanPreview=[original];await w.applyAutoPlanPreview();assert.equal(w.assignments.length,1,w.notice.join(' '));assert.equal(w.assignments[0].rhythmOverride.reason,original.rhythmOverride.reason);assert.equal(w.assignments[0].rhythmOverride.previewKey,undefined);assert.equal(w.autoPlanPreview.length,0);
 }finally{await close();}
});

test('shorter rhythm blocks are valid in every company while exceeding the maximum still blocks',async()=>{
 const {w,close}=await setup();try{
 w.eval(fs.readFileSync('assets/solid-planning-core-v1.js','utf8'));
 w.autoPlanningDates=()=>['2027-01-04','2027-01-05','2027-01-06','2027-01-07','2027-01-08'];
 w.SFCompliance.policy.solidPlanningRules={enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',maxConsecutiveShifts:4,maxConsecutiveNightShifts:4,maxCalendarWeekHours:100,minBlockRestHours:0,minFreeCalendarDays:0};
 const rule={mode:'required',pattern:['ALLE','ALLE','ALLE','ALLE','FREI']};w.SFRhythm={config:()=>rule,check:()=>({expected:'ALLE',index:0})};
 const duty=(date,i)=>({id:'short-'+i,employeeId:'one',type:'T',date,start:'06:00',end:'14:00'});
 for(const company of ['company-one','company-two'])for(const count of [1,2,3,4]){
  w.SFBackend.companyId=company;w.autoPlanPreview=w.autoPlanningDates().slice(0,count).map(duty);w.SFAutoPlanPreviewEditor.decorate();
  assert.equal(w.SFAutoPlanPreviewEditor.reviewIssues().length,0,company+' / '+count+' duties');assert.equal(await w.SFAutoPlanWorkspace.confirmApply(),true);
 }
 w.autoPlanPreview=w.autoPlanningDates().map(duty);assert.match(w.SFAutoPlanPreviewEditor.check(w.autoPlanPreview,[w.autoPlanPreview.at(-1)]).join(' '),/4 Dienste|vier Dienste|4 aufeinanderfolgende/);
 }finally{await close();}
});

test('manual five-day option survives review and draft application, preserves automatic limits and remains tenant-bound',async()=>{
 const {w,$,submit,close}=await setup();try{
 const dates=['2027-01-04','2027-01-05','2027-01-06','2027-01-07','2027-01-08'];w.autoPlanningDates=()=>dates;
 Object.assign(w.SFBackend,{ready:true,role:'PLANNER'});w.SFPlanningRuleSettings={context:()=>({})};
 Object.assign(w.employees[0],{employment:'Vollzeit',weeklyHours:40,monthlyHours:180});
 w.eval(fs.readFileSync('assets/solid-planning-core-v1.js','utf8'));w.eval(fs.readFileSync('assets/manual-rhythm-exceptions-v1.js','utf8'));
 w.SFCompliance.policy.solidPlanningRules={enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',maxConsecutiveShifts:4,maxConsecutiveNightShifts:3};
 w.SFAutoPlanPreviewEditor.open({employeeId:'one',rowEmployee:true,dates});assert.match($('#sfPreviewEditError').textContent,/vier Dienste/);assert.equal($('[type=submit]').disabled,true);
 $('#sfPreviewFiveDays').checked=true;$('#sfPreviewFiveDays').dispatchEvent(new w.Event('change'));assert.equal($('[type=submit]').disabled,false,$('#sfPreviewEditError').textContent);submit();
 assert.equal(w.autoPlanPreview.length,5);assert.equal(w.assignments.length,0);const confirmed=w.autoPlanPreview.map(a=>({...a}));assert.ok(confirmed.every(a=>w.SFManualRhythm.isPreviewOverride(a)));
 assert.equal(w.SFAutoPlanPreviewEditor.reviewIssues().length,0);assert.equal(w.SFAutoPlanPreviewEditor.check(confirmed,confirmed).length,0);
 const automatic=confirmed.map(a=>({...a,rhythmOverride:null}));assert.match(w.SFAutoPlanPreviewEditor.check(automatic,automatic).join(' '),/vier Dienste/);
 w.absent=()=>true;assert.match(w.SFAutoPlanPreviewEditor.check(confirmed,confirmed).join(' '),/abwesend/);w.absent=()=>false;
 w.SFBackend.companyId='other';assert.match(w.SFAutoPlanPreviewEditor.check(confirmed,confirmed).join(' '),/erneut bestätigt/);w.SFBackend.companyId='company-one';
 w.SFAutoPlanPreviewEditor.undo();assert.equal(w.autoPlanPreview.length,0);w.autoPlanPreview=confirmed.map((a,i)=>({...a,rhythmOverride:i===4?a.rhythmOverride:null}));
 const source=fs.readFileSync('index.html','utf8');w.eval(source.slice(source.indexOf('async function applyAutoPlanPreview(){'),source.indexOf('function runAutoPlan(){',source.indexOf('async function applyAutoPlanPreview(){')))+';window.applyAutoPlanPreview=applyAutoPlanPreview;');
 w.autoEligibleEmployees=()=>[];w.saveAll=()=>{};w.renderCalendar=()=>{};w.autoMonday=()=>new Date('2027-01-04T12:00Z');w.SFBackend.sync=async()=>{};
 w.eval(fs.readFileSync('assets/supabase-auto-plan-guard-v1.js','utf8'));await w.applyAutoPlanPreview();assert.equal(w.assignments.length,5,w.notice.join(' '));assert.equal(w.assignments[4].rhythmOverride.workBlockDays,5);assert.equal(w.assignments[4].rhythmOverride.blockStart,dates[0]);assert.equal(w.assignments[4].rhythmOverride.previewKey,undefined);assert.ok(w.assignments.slice(0,4).every(a=>!a.rhythmOverride),'a manually added fifth day confirms the block without changing its first four duties');
 }finally{await close();}
});

test('real compliance checks honor only the exact manual five-day duty and preserve rest, weekly limits and sixth-day rejection',async()=>{
 const {w,close}=await setup();try{
 Object.assign(w.SFBackend,{ready:true,role:'PLANNER'});w.SFPlanningRuleSettings={context:()=>({})};w.absences=[];w.sfRhythmCheck=()=>({allowed:true});w.store={get:(k,f)=>f,set(){}};
 for(const f of ['assets/solid-planning-core-v1.js','assets/compliance-core-v2.js','assets/manual-rhythm-exceptions-v1.js'])w.eval(fs.readFileSync(f,'utf8'));
 const e=w.employees[0];Object.assign(e,{employment:'Vollzeit',weeklyHours:40,monthlyHours:180});w.assignmentsFor=()=>[];
 const p=w.SFCompliance.policy.solidPlanningRules={enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin'};
 const rows=[4,5,6,7,8].map(n=>({id:String(n),employeeId:e.id,type:'T',date:'2027-01-0'+n,start:'06:00',end:'14:00'})),a=rows.at(-1);a.rhythmOverride=w.SFManualRhythm.previewBlockOverride(a,rows);w.assignments=rows.slice(0,4);
 assert.deepEqual([...w.SFCompliance.check(e,a.type,a.date,a.start,a.end,null,{manualBlockOverride:a.rhythmOverride}).hard],[]);
 assert.match(w.SFCompliance.check(e,a.type,a.date,a.start,a.end).hard.join(' '),/vier Dienste/);
 const six=[...rows,{...a,date:'2027-01-09',id:'six',rhythmOverride:null}];assert.match(w.SFSolidPlanningCore.errors(e,six,p).map(x=>x.message).join(' '),/vier Dienste/);
 p.maxCalendarWeekHours=32;assert.match(w.SFCompliance.check(e,a.type,a.date,a.start,a.end,null,{manualBlockOverride:a.rhythmOverride}).hard.join(' '),/32 Stunden/);p.maxCalendarWeekHours=40;
 rows[3].start='18:00';rows[3].end='23:00';assert.match(w.SFCompliance.check(e,a.type,a.date,a.start,a.end,null,{manualBlockOverride:a.rhythmOverride}).hard.join(' '),/Ruhezeit/);
 }finally{await close();}
});
