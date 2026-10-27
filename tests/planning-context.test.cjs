const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const fields=new Map(),el=id=>{if(!fields.has(id))fields.set(id,{value:'',disabled:false});return fields.get(id)};
 let view='schedule',period={mode:'month',start:'2027-01-01',end:'2027-01-31'},busy=false,changes=0,wish='2026-11';
 const c={Date,Map,Set,Intl,document:{getElementById:el,querySelector:()=>({id:'view-'+view})},SFBackend:{ready:true,companyId:'own'},assignments:[],TYPES:[{id:'OT'}],getSoll:date=>date==='2027-01-01'?3:0,weekStart:new Date('2026-12-28T12:00:00Z')};c.window=c;
 c.SchichtFunkCalendarView={getPeriod:()=>period,setMonth:month=>period={mode:'month',start:month+'-01'},setMode:mode=>period={...period,mode}};
 c.SFWishPlanning={getMonth:()=>wish,setMonth:month=>wish=month};c.SFMonthOptimizer={isBusy:()=>busy};c.changeAutoPlanPeriod=()=>changes++;c.switchView=name=>view=name;
 vm.runInNewContext(fs.readFileSync('assets/planning-context-v1.js','utf8'),c);
 return{c,el,setView:value=>view=value,setBusy:value=>busy=value,changes:()=>changes,wish:()=>wish,period:()=>period};
}
test('January month survives the December Monday anchor and the complete planning navigation',()=>{
 const h=fixture();h.el('autoPlanPeriod').value='week';h.el('autoPlanMonth').value='2026-10';
 h.c.switchView('auto');assert.equal(h.el('autoPlanPeriod').value,'month');assert.equal(h.el('autoPlanMonth').value,'2027-01');assert.equal(h.changes(),1);
 h.c.switchView('wishes');assert.equal(h.wish(),'2027-01');h.c.SFWishPlanning.setMonth('2027-02');h.c.switchView('schedule');assert.equal(h.period().start,'2027-02-01');
});
test('visiting an in-progress preview never changes the selected period or clears its result',()=>{
 const h=fixture();h.el('autoPlanPeriod').value='month';h.el('autoPlanMonth').value='2027-02';h.setBusy(true);h.c.switchView('auto');assert.equal(h.el('autoPlanMonth').value,'2027-02');assert.equal(h.changes(),0);
});
test('saved zero gaps and three current gaps remain separate and cancelling duties cannot fill demand',()=>{
 const h=fixture();h.c.assignments=[{date:'2027-01-01',type:'OT',status:'CANCELLED'}];
 const r={first_month:'2027-01-01',month_count:1,summary:{open:0}};assert.match(h.c.SFPlanningContext.currentCoverageMarkup(r),/3 Pflichtpositionen offen/);assert.match(h.c.SFPlanningContext.currentCoverageMarkup(r),/weichen ab/);assert.equal(r.summary.open,0);
 h.c.assignments=Array.from({length:3},(_,employeeId)=>({employeeId,date:'2027-01-01',type:'OT'}));assert.doesNotMatch(h.c.SFPlanningContext.currentCoverageMarkup(r),/weichen ab/);
 h.c.SFBackend.companySwitching=true;assert.equal(h.c.SFPlanningContext.currentCoverageMarkup(r),'');
});
test('rhythm summary counts only active assignments in the period and escapes their reasons',()=>{
 const {c}=fixture(),a={employeeId:'one',date:'2027-01-01',rhythmOverride:{reason:'<img onerror=alert(1)>'}},rows=[a,{...a,date:'2027-01-02'},{...a,status:'CANCELLED'}],html=c.SFPlanningContext.rhythmMarkup(rows,['2027-01-01']);
 assert.match(html,/1 bestätigte Rhythmusausnahmen · 1 Mitarbeiter/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);
});
test('month context and rhythm disclosure stay stable during unrelated page updates',async()=>{
 const {Window}=await import('happy-dom'),w=new Window();try{
 w.document.body.innerHTML='<section id="view-schedule" class="view active"><div class="card calendar"></div></section>';
 w.eval(`var weekStart=new Date('2026-12-28T12:00:00');var iso=d=>d.toISOString().slice(0,10);var addDays=(d,n)=>new Date(+d+n*86400000);var assignments=[{employeeId:'a',date:'2027-01-01',type:'OT',rhythmOverride:{reason:"Planer's confirmed exception"}}];`);
 w.SFBackend={ready:true,role:'OWNER'};w.SFCompliance={weekKey:d=>d,publications:{}};w.SchichtFunkCalendarView={getPeriod:()=>({mode:'month',start:'2027-01-01',end:'2027-01-31'})};w.setTimeout=fn=>setTimeout(fn,0);
 w.eval(fs.readFileSync('assets/planning-context-v1.js','utf8'));w.eval(fs.readFileSync('assets/schedule-final-v1.js','utf8'));await new Promise(r=>setTimeout(r,20));
 const context=w.document.getElementById('sfPlanContext');assert.match(context.textContent,/Januar 2027/);assert.doesNotMatch(context.textContent,/Woche ab/);assert.match(context.textContent,/1 bestätigte Rhythmusausnahmen/);
 context.querySelector('details').open=true;w.document.body.appendChild(w.document.createElement('aside'));await new Promise(r=>setTimeout(r,20));assert.equal(context.querySelector('details').open,true);
 }finally{await w.happyDOM.close();}
});
