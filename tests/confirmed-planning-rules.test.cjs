const test=require('node:test'),assert=require('node:assert/strict'),s=require('../assets/solid-planning-core-v1.js');
const p={enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',shortBlockRecoveryPersonnelNos:['2001'],shortBlockMaximum:2};
const e={id:'a',personnelNo:'2001',employment:'Vollzeit',weeklyHours:40,monthlyHours:180};
const a=(date,type='FD',start='06:00',end='14:00')=>({date,type,start,end,employeeId:'a'});
test('model caps use permitted active templates and preserve lower individual contracts',()=>{
 const types=[{id:'FD',start:'06:00',end:'14:00'},{id:'O1',start:'18:00',end:'04:00'}];
 assert.equal(s.limits({...e,shifts:['FD']},types,p).maxMonthlyShifts,23);
 assert.equal(s.limits({...e,shifts:['FD']},types,p).monthLimit,184);
 assert.equal(s.limits({...e,shifts:['O1']},types,p).maxMonthlyShifts,18);
 assert.equal(s.limits({...e,employment:'Teilzeit',monthlyHours:100,shifts:['FD']},types,p).calendarLimit,100);
 assert.equal(s.countsTowardCap({_marketApproved:true}),false);
});
test('four day duties pass and five are blocked',()=>{assert.equal(s.errors(e,[1,2,3,4].map(n=>a('2027-01-0'+n)),p).length,0);assert.ok(s.errors(e,[1,2,3,4,5].map(n=>a('2027-01-0'+n)),p).some(x=>x.message.includes('vier Dienste')))});
test('two full calendar days replace the former short OT exception',()=>{
 assert.ok(s.errors(e,[a('2027-01-01','OT2','08:00','18:00'),a('2027-01-03','OT2','08:00','18:00')],p).length);
 assert.equal(s.errors(e,[a('2027-01-01'),a('2027-01-04')],p).length,0);
});
test('three night duties pass, four are blocked, and night end date is a working day',()=>{
 const nights=[1,2,3].map(n=>a('2027-01-0'+n,'ND','22:00','06:00'));
 assert.equal(s.errors(e,nights,p).length,0);
 assert.ok(s.errors(e,[...nights,a('2027-01-04','ND','22:00','06:00')],p).some(x=>x.message.includes('drei Nachtdienste')));
 assert.ok(s.errors(e,[...nights,a('2027-01-07')],p).some(x=>x.message.includes('Nachtblock')));
 assert.equal(s.errors(e,[...nights,a('2027-01-08')],p).length,0);
});
test('weekly cap counts the Monday part of a Sunday night and personal limits',()=>{
 const rows=[a('2027-01-03','ND','22:00','06:00'),...['04','05','06','07'].map(d=>a('2027-01-'+d,'FD','06:00','16:00'))];
 assert.ok(s.errors(e,rows,p,['2027-01-07']).some(x=>x.message.includes('Kalenderwoche')));
 assert.ok(s.errors({...e,weeklyHours:20},[a('2027-01-04'),a('2027-01-05'),a('2027-01-06')],p).some(x=>x.message.includes('20 Stunden')));
});
test('night recovery spans month changes and daylight saving uses real hours',()=>{
 assert.ok(s.errors(e,[a('2027-01-31','ND','22:00','06:00'),a('2027-02-04')],p).length);
 assert.equal(s.errors(e,[a('2027-01-31','ND','22:00','06:00'),a('2027-02-05')],p).length,0);
 assert.equal((s.interval('2027-03-27','22:00','08:00',p.timezone).end-s.interval('2027-03-27','22:00','08:00',p.timezone).start)/3600000,9);
});
