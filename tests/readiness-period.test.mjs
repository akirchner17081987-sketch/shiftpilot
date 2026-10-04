import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../assets/readiness-traffic-light-v1.js',import.meta.url),'utf8');
function fixture(){
  const events={},button={},panel={querySelector:()=>button},page={classList:{contains:()=>true},querySelector:()=>null};
  const document={getElementById:id=>id==='view-schedule'?page:id==='sfReadinessPanel'?panel:id==='sfReadinessCss'?{}:null,addEventListener:(name,fn)=>events[name]=fn};
  const c=vm.createContext({document,console,Intl,Date,Map,Set,setInterval:()=>1,clearInterval(){},setTimeout,window:null});c.window=c;
  c.SFBackend={role:'PLANNER',companyId:'company-a'};
  c.period={mode:'month',start:'2027-01-01',end:'2027-01-31'};
  c.SchichtFunkCalendarView={getPeriod:()=>c.period};
  c.TYPES=[{id:'FD'}];c.getSoll=()=>1;c.employees=[{id:1,_dbId:'emp-1',first:'Test',last:'Person',status:'active',shifts:['FD']}];
  c.assignments=['2026-12-28','2026-12-31','2027-01-01','2027-01-31','2027-02-01'].map((date,i)=>({id:i,_dbId:'db-'+i,date,type:'FD',employeeId:1,start:'06:00',end:'14:00',_dbStatus:'PUBLISHED'}));
  c.iso=d=>d.toISOString().slice(0,10);c.currentWeekDates=()=>Array.from({length:7},(_,i)=>new Date(Date.UTC(2026,11,28+i,12)));
  vm.runInContext(source,c);return{c,events,panel};
}
test('January checks every selected day and excludes adjacent December/February assignments',()=>{
  const {c}=fixture(),m=c.SFReadiness.evaluate();
  assert.equal(m.periodLabel,'Januar 2027');assert.equal(m.rows.length,31);assert.equal(m.green,2);assert.equal(m.red,29);
  assert.ok(m.rows.every(r=>r.date.startsWith('2027-01')));assert.equal(m.rows.find(r=>r.date==='2027-01-31').actual,1);
});
test('navigation evaluates the new month and leap-year February exactly',()=>{
  const {c}=fixture();c.period={mode:'month',start:'2028-02-01',end:'2028-02-29'};
  assert.equal(c.SFReadiness.evaluate().rows.length,29);
  c.period={mode:'month',start:'2027-02-01',end:'2027-02-28'};const m=c.SFReadiness.evaluate();assert.equal(m.rows.length,28);assert.equal(m.green,1);assert.equal(m.periodLabel,'Februar 2027');
});
test('week view and legacy fallback keep their seven-day range',()=>{
  const {c}=fixture();c.period={mode:'week',start:'2026-12-28',end:'2027-01-03'};
  assert.equal(c.SFReadiness.evaluate().rows.length,7);assert.equal(c.SFReadiness.evaluate().green,3);
  delete c.SchichtFunkCalendarView;assert.equal(c.SFReadiness.evaluate().rows.length,7);
});
test('compliance still has adjacent-month assignments for boundary rest checks',()=>{
  const {c}=fixture();c.SFCompliance.check=(_employee,_type,date)=>({hard:date==='2027-01-01'&&c.assignments.some(a=>a.date==='2026-12-31')?['Ruhezeit am Monatsübergang']:[],soft:[]});
  assert.ok(c.SFReadiness.evaluate().rows.find(r=>r.date==='2027-01-01').findings.some(f=>f.text.includes('Ruhezeit am Monatsübergang')));
});
function backend(c,pending=[]){
  const calls=[];c.SFBackend.client={from(table){const call={table},q={select(){return q},eq(_field,company){call.company=company;return q},in(_field,ids){call.ids=[...ids];calls.push(call);return pending.length?pending.shift():Promise.resolve({data:[]})}};return q}};return calls;
}
test('confirmation queries and the rendered panel use the full selected month',async()=>{
  const {c,panel,events}=fixture(),calls=backend(c);await events['sf:schedule-period-changed']();
  assert.equal(calls.length,2);assert.deepEqual(calls[0].ids,['db-2','db-3']);assert.equal(calls[0].company,'company-a');assert.match(panel.innerHTML,/Januar 2027/);assert.doesNotMatch(panel.innerHTML,/28\.12\./);
});
test('late replies cannot overwrite a newer month or company',async()=>{
  const {c,panel}=fixture();let resolveOld;
  const old=new Promise(resolve=>resolveOld=resolve);backend(c,[old,old]);
  const first=c.SFReadiness.refresh();c.period={mode:'month',start:'2027-02-01',end:'2027-02-28'};c.SFBackend.companyId='company-b';await c.SFReadiness.refresh();
  resolveOld({data:[{id:'db-4',last_change_request_id:'old-change'}]});await first;
  c.SFCompliance.requests=[{id:'old-change',action:'UPDATE',status:'APPLIED'}];assert.equal(c.SFReadiness.confirmationReason(c.assignments[4]),'');assert.match(panel.innerHTML,/Februar 2027/);
});
test('large monthly confirmation sets load in bounded batches',async()=>{
  const {c}=fixture();c.assignments=Array.from({length:401},(_,i)=>({_dbId:'db-'+i,date:'2027-01-31',type:'FD',employeeId:1}));
  const calls=backend(c);await c.SFReadiness.refresh();assert.equal(calls.length,6);assert.deepEqual(calls.filter(x=>x.table==='shift_assignment_confirmations').map(x=>x.ids.length),[200,200,1]);
});
test('real calendar month controls refresh the readiness panel across the year boundary',async()=>{
  const {c,panel,events}=fixture(),els=new Map();backend(c);
  const element=()=>({style:{},classList:{toggle(){},remove(){},contains:()=>false},querySelectorAll:()=>[],querySelector:()=>null,parentNode:{insertBefore(){}}});
  for(const id of ['sfMonthView','sfMonthViewCss','prevWeek','nextWeek','todayBtn','weekLabel','calendarGrid','sollList'])els.set(id,element());
  const original=c.document.getElementById;c.document.getElementById=id=>els.get(id)||original(id);
  c.document.querySelector=()=>null;c.document.querySelectorAll=()=>[];c.document.dispatchEvent=e=>events[e.type]?.();
  c.Event=class{constructor(type){this.type=type}};c.sessionStorage={getItem:()=>null,setItem(){}};
  c.weekStart=new Date(2026,11,28);c.absences=[];c.renderCalendar=()=>{};delete c.SchichtFunkCalendarView;
  vm.runInContext(fs.readFileSync(new URL('../assets/schedule-month-view-v1.js',import.meta.url),'utf8'),c);
  c.SchichtFunkCalendarView.setMonth('2027-01');assert.equal(els.get('weekLabel').textContent,'Januar 2027');assert.match(panel.innerHTML,/Januar 2027/);assert.equal(c.SFReadiness.evaluate().rows.length,31);
  els.get('prevWeek').onclick();assert.match(panel.innerHTML,/Dezember 2026/);assert.ok(c.SFReadiness.evaluate().rows.every(r=>r.date.startsWith('2026-12')));
  els.get('nextWeek').onclick();assert.match(panel.innerHTML,/Januar 2027/);
  await c.SFReadiness.refresh();
});
