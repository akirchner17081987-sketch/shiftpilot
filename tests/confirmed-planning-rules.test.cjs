const test=require('node:test'),assert=require('node:assert/strict'),s=require('../assets/solid-planning-core-v1.js');
const p={enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',shortBlockRecoveryPersonnelNos:['2001'],shortBlockMaximum:2};
const e={id:'a',personnelNo:'2001',employment:'Vollzeit',weeklyHours:40,monthlyHours:180};
const a=(date,type='FD',start='06:00',end='14:00')=>({date,type,start,end,employeeId:'a'});
test('four-night rule permits sleep day plus two full free days and rejects an earlier restart or fifth night',()=>{
 const rules={...p,maxCalendarWeekHours:55,maxConsecutiveNightShifts:4,minNightRecoveryCalendarDays:2},person={...e,weeklyHours:55,maxWeeklyHours:55};
 const nights=[7,8,9,10].map(d=>a('2027-01-'+String(d).padStart(2,'0'),'O3','22:00','08:00'));
 assert.deepEqual(s.errors(person,[...nights,a('2027-01-14','O3','22:00','08:00')],rules),[]);
 assert.ok(s.errors(person,[...nights,a('2027-01-13','O3','22:00','08:00')],rules).some(x=>/freie Kalendertage/.test(x.message)));
 assert.ok(s.errors(person,[...nights,a('2027-01-11','O3','22:00','08:00')],rules).some(x=>/vier Dienste|4 Nachtdienste/.test(x.message)));
 const boundary=['2027-01-28','2027-01-29','2027-01-30','2027-01-31'].map(d=>a(d,'O3','22:00','08:00'));
 assert.deepEqual(s.errors(person,[...boundary,a('2027-02-04','O3','22:00','08:00')],rules),[]);
 assert.ok(s.errors(person,[...boundary,a('2027-02-03','O3','22:00','08:00')],rules).length);
});
test('OT-only monthly extension is scoped and preserves weekly and recovery rules',()=>{
 const rules={...p,otOnlyMonthlyMaxHours:220},types=[{id:'OT2',start:'08:00',end:'18:00'},{id:'O1',start:'18:00',end:'04:00'}],ot={...e,shifts:['OT2']};
 assert.equal(s.limits(ot,types,rules).monthLimit,220);
 assert.equal(s.limits(ot,types,rules).calendarLimit,220);
 assert.equal(s.limits(ot,types,rules).maxMonthlyShifts,22);
 assert.equal(s.limits(ot,types,rules).weeklyLimit,40);
 assert.equal(s.limits({...ot,shifts:['OT2','O1']},types,rules).monthLimit,190);
 assert.equal(s.limits({...ot,shifts:['OT']},types,rules).monthLimit,190);
 assert.equal(s.limits({...ot,shifts:['OT2','OT']},types,rules).monthLimit,190);
 assert.equal(s.limits({...ot,employment:'Teilzeit',monthlyHours:144},types,rules).monthLimit,144);
 assert.equal(s.limits(ot,types,{...rules,otOnlyMonthlyMaxHours:221}).monthLimit,190);
 assert.equal(s.limits(ot,types,p).monthLimit,190);
 assert.ok(s.errors(ot,[4,5,6,7,8].map(n=>a('2027-01-0'+n,'OT2','08:00','18:00')),rules).length);
});
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

test('confirmed manual five-day window permits day and night blocks, retained shorter blocks and no sixth day',()=>{
 const B=require('../assets/background-auto-plan-core-v1.js');
 for(const type of ['FD','ND']){
  const rows=[4,5,6,7,8].map(n=>a('2027-01-0'+n,type,type==='ND'?'22:00':'06:00',type==='ND'?'06:00':'14:00'));
  assert.ok(s.errors(e,rows,p).length,'ordinary automatic rows keep the existing maximum');
  for(const row of rows)row.rhythmOverride={reason:'Manuell bestätigt',workBlockDays:5,blockStart:rows[0].date,blockEnd:rows[4].date,previewKey:JSON.stringify(['company',row.employeeId,row.type,row.date,row.start,row.end])};
  assert.deepEqual(s.errors(e,rows,p),[]);assert.deepEqual(s.errors(e,rows.slice(0,4),p),[],'removing a confirmed duty remains possible');
  assert.ok(s.errors(e,[...rows,a('2027-01-09',type,type==='ND'?'22:00':'06:00',type==='ND'?'06:00':'14:00')],p).length);
  const packed=B.pack({employees:[e],base:rows,groups:[],capacities:[],solidRules:p});assert.deepEqual(packed.base.map(a=>a.rhythmOverride),rows.map(a=>a.rhythmOverride),'background planning preserves confirmed existing blocks');
  const stale=rows.map(a=>({...a,start:'20:00',end:'04:00'}));assert.ok(s.errors(e,stale,p).some(x=>/vier Dienste/.test(x.message)),'copied confirmation cannot move duty times');
 }
});
