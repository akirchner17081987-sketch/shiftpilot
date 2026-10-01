import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
function harness(){
  const c={window:{SFBackend:{}},sessionStorage:{getItem:()=>null,setItem(){}},document:{readyState:'loading',getElementById:()=>null,querySelector:()=>null,addEventListener(){},dispatchEvent(){}},setTimeout(){},Event,Date,weekStart:new Date(2026,8,28),renderCalendar(){},assignments:[],employees:[],absences:[],TYPES:[{id:'FD'}],globalSoll:{FD:1}};
  c.window.SFCompliance={iso:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,weekKey:d=>d,fmt:d=>d};
  const calendar=read('assets/schedule-month-view-v1.js').split('  const base=window.renderCalendar;')[0]+'})();';
  vm.runInNewContext(calendar,c);
  const publisher=read('assets/supabase-publish-v1.js').split('  const baseRender=window.renderCalendar;')[0]+'window.periodTest={period,periodDates,preflight};})();';
  vm.runInNewContext(publisher,c);
  return c;
}
test('December selection replaces the stale September publication period and excludes boundary dates',()=>{
  const c=harness();c.window.SchichtFunkCalendarView.setMonth('2026-12');
  const p=c.window.periodTest.period();assert.deepEqual(JSON.parse(JSON.stringify(p)),{mode:'month',start:'2026-12-01',end:'2026-12-31'});
  const dates=c.window.periodTest.periodDates(p);assert.equal(dates.length,31);assert.equal(dates[0],'2026-12-01');assert.equal(dates.at(-1),'2026-12-31');
  c.assignments=['2026-09-28','2026-11-30','2026-12-01','2026-12-31','2027-01-01'].map((date,i)=>({id:i,date,type:'FD',employeeId:1,start:'06:00',end:'14:00'}));
  c.employees=[{id:1,first:'Test',last:'Person'}];const summary=c.window.periodTest.preflight(p);assert.equal(summary.assignments,2);assert.equal(summary.draftCount,2);assert.equal(summary.open,29);assert.ok(summary.issues.every(i=>i.text.includes('2026-12-')));
});
test('returning to week view keeps the selected month week and invalid months do not change it',()=>{
  const c=harness(),api=c.window.SchichtFunkCalendarView;api.setMonth('2026-12');api.setMode('week');assert.equal(api.getPeriod().start,'2026-11-30');assert.equal(api.getPeriod().end,'2026-12-06');assert.equal(api.setMonth('2026-13'),false);assert.equal(api.getPeriod().start,'2026-11-30');
  api.setMonth('2028-02');assert.equal(c.window.periodTest.periodDates(api.getPeriod()).length,29);
});
test('accepting auto planning synchronizes the actual calendar month, cancellation leaves it unchanged',()=>{
  const c=harness();let accepted=false;c.confirm=()=>accepted;c.autoPlanPreview=[{date:'2026-12-01',employeeId:1,type:'FD'}];c.autoPlanningDates=()=>['2026-12-01','2026-12-31'];c.document.getElementById=id=>id==='autoPlanPeriod'?{value:'month'}:null;c.saveAll=()=>{};c.renderAutoPlanning=()=>{};c.showSaveToast=()=>{};
  const index=read('index.html'),fn=index.slice(index.indexOf('function applyAutoPlanPreview(){'),index.indexOf('\nfunction runAutoPlan()',index.indexOf('function applyAutoPlanPreview(){')));vm.runInNewContext(fn,c);
  c.applyAutoPlanPreview();assert.equal(c.window.SchichtFunkCalendarView.getMode(),'week');assert.equal(c.assignments.length,0);
  accepted=true;c.applyAutoPlanPreview();assert.equal(c.window.SchichtFunkCalendarView.getPeriod().start,'2026-12-01');assert.equal(c.assignments.length,1);
});
