import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
function resetContext(period){
 const B={role:'EMPLOYEE'},context={window:{SFBackend:B,SchichtFunkCalendarView:{getPeriod:()=>period}},document:{addEventListener(){},documentElement:{}},setTimeout(){},MutationObserver:class{observe(){}}};
 vm.runInNewContext(read('assets/supabase-schedule-reset-v1.js'),context);return B;
}
test('reset uses the selected calendar month even when the week anchor is in November',()=>{
 const B=resetContext({mode:'month',start:'2026-12-01',end:'2026-12-31'});assert.equal(B.scheduleMonthReset.selectedMonth(),'2026-12');
});
test('a week spanning two months cannot implicitly choose a month to delete',()=>{
 assert.equal(resetContext({mode:'week',start:'2026-11-30',end:'2026-12-06'}).scheduleMonthReset.selectedMonth(),null);
 assert.equal(resetContext({mode:'month',start:'2026-12-15',end:'2027-01-14'}).scheduleMonthReset.selectedMonth(),null);
});
test('preserved boundary-week publication does not lock the emptied adjacent month',()=>{
 const c={window:{SFBackend:{ready:true}},assignments:[{date:'2026-11-30',publishedAt:'2026-10-01T12:00:00Z',_dbStatus:'PUBLISHED'}],store:{get:(key,fallback)=>key==='planPublications'?{'2026-11-30':{publishedAt:'2026-10-01T12:00:00Z'}}:fallback},Date};
 vm.runInNewContext(read('assets/compliance-core-v2.js'),c);
 assert.equal(c.window.SFCompliance.isWeekPublished('2026-11-30'),true);
 assert.equal(c.window.SFCompliance.isWeekPublished('2026-12-01'),false);
 c.window.SFBackend.ready=false;assert.equal(c.window.SFCompliance.isWeekPublished('2026-12-01'),true,'Offline/demo retains its weekly publication model');
});
