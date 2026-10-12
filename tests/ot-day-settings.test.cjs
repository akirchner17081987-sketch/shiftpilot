const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../assets/solid-planning-core-v1.js');
const p={enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',maxConsecutiveShifts:4,maxCalendarWeekHours:40,otOnlyMonthlyMaxHours:220,otOnlyMaxConsecutiveShifts:5,otOnlyMaxCalendarWeekHours:50,otOnlyMinFreeCalendarDays:2,otOnlyMinBlockRestHours:48};
const e={id:'fixture',employment:'Vollzeit',monthlyHours:180,weeklyHours:40,shifts:['OT1','OT2','OT3']};
const rows=[4,5,6,7,8].map(d=>({employeeId:e.id,date:`2027-01-0${d}`,type:'OT1',start:'06:00',end:'16:00'}));
test('OT-only full-time employees can work five 10h duties with independent limits',()=>{
 assert.deepEqual(core.errors(e,rows,p),[]);
 const l=core.limits(e,[{id:'OT1',start:'06:00',end:'16:00'}],p);
 assert.equal(l.weeklyLimit,50);assert.equal(l.monthLimit,220);assert.equal(l.maxMonthlyShifts,22);
 assert.deepEqual(core.errors({...e,weeklyLimit:l.weeklyLimit},rows,p),[]);
 assert.equal(core.errors(e,[...rows,{...rows[0],date:'2027-01-09'}],p).length,2);
});
test('ordinary OT, mixed permissions, explicit employee limits and other policies retain restrictions',()=>{
 for(const shifts of [['OT'],['OT1','OT'],['O1']])assert.ok(core.errors({...e,shifts},rows,p).length);
 assert.equal(core.weeklyLimit({...e,qualifications:['__sp:maxWeekly=40']},p),40);
 assert.equal(core.weeklyLimit({...e,employment:'Teilzeit'},p),40);
 assert.ok(core.errors(e,rows,{enabled:true,confirmedRulesVersion:2}).length);
 assert.equal(p.maxConsecutiveShifts,4);assert.equal(p.maxCalendarWeekHours,40);
});
test('OT-specific recovery settings apply without weakening the fixed 11h rest check',()=>{
 const gap=[rows[0],{...rows[0],date:'2027-01-06'}];
 assert.ok(core.errors(e,gap,p).length);
 assert.deepEqual(core.errors(e,gap,{...p,otOnlyMinFreeCalendarDays:1,otOnlyMinBlockRestHours:24}),[]);
 const short=[{...rows[0],type:'OT3',start:'10:00',end:'20:00'},rows[1]];
 assert.ok(core.errors(e,short,p).some(x=>/11 Stunden/.test(x.message)));
});
