const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{},Intl,Date};vm.runInNewContext(fs.readFileSync(__dirname+'/../assets/employee-shifts-month-v1.js','utf8'),context);const api=context.window.SFEmployeeMonthView;
const shift=(id,start,end,more={})=>({id,starts_at:start,ends_at:end,status:'PUBLISHED',published_at:'2026-10-01T00:00:00Z',break_minutes:0,...more});
test('monthly view includes more than 20 published shifts and past shifts, without mutating data',()=>{
 const shifts=Array.from({length:25},(_,i)=>shift(String(i),`2026-12-${String(i+1).padStart(2,'0')}T06:00:00+01:00`,`2026-12-${String(i+1).padStart(2,'0')}T14:00:00+01:00`));const before=JSON.stringify(shifts),m=api.model({shifts,company:{timezone:'Europe/Berlin'}},'2026-12',new Date('2027-01-01'));
 assert.equal(m.shifts.length,25);assert.equal(m.hours,200);assert.equal(m.workDays,25);assert.equal(m.next,undefined);assert.equal(JSON.stringify(shifts),before);
});
test('company timezone decides the month; overnight shift belongs to its starting day',()=>{
 const data={company:{timezone:'Europe/Berlin'},shifts:[shift('midnight','2026-11-30T23:30:00Z','2026-12-01T07:30:00Z'),shift('night','2026-12-31T22:00:00+01:00','2027-01-01T06:00:00+01:00')]};
 const m=api.model(data,'2026-12');assert.equal(m.shifts.length,2);assert.equal(m.byDay.get('2026-12-31')[0].id,'night');assert.equal(api.model(data,'2027-01').shifts.length,0);assert.equal(m.hours,16);
});
test('drafts, cancelled records, unpublished shifts and invalid intervals never enter employee totals',()=>{
 const s=shift('ok','2026-12-01T06:00:00+01:00','2026-12-01T14:00:00+01:00');
 const m=api.model({shifts:[s,{...s,id:'draft',status:'DRAFT'},{...s,id:'cancel',status:'CANCELLED'},{...s,id:'private',published_at:null},{...s,id:'bad',ends_at:s.starts_at}]},'2026-12');assert.equal(m.shifts.length,1);assert.equal(m.hours,8);
});
test('actual duration across DST and explicit pauses are calculated without an automatic pause deduction',()=>{
 assert.equal(api.hours(shift('fall','2026-10-24T22:00:00+02:00','2026-10-25T06:00:00+01:00')),9);
 assert.equal(api.hours(shift('spring','2026-03-28T22:00:00+01:00','2026-03-29T06:00:00+02:00')),7);
 assert.equal(api.hours(shift('pause','2026-12-01T06:00:00+01:00','2026-12-01T14:00:00+01:00',{break_minutes:30})),7.5);
});
test('calendar begins on Monday, covers leap day and month navigation crosses the year',()=>{
 const m=api.model({shifts:[]},'2028-02');assert.equal(new Date(m.cells[0].key+'T12:00:00Z').getUTCDay(),1);assert.equal(m.cells.filter(x=>x.inMonth).length,29);assert(m.cells.some(x=>x.key==='2028-02-29'));
 assert.equal(api.moveMonth('2026-12',1),'2027-01');assert.equal(api.moveMonth('2027-01',-1),'2026-12');assert.equal(api.validMonth('2026-13'),false);
});
test('German labels, accessible names and symbols survive source serialization',()=>{
 const source=fs.readFileSync(__dirname+'/../assets/employee-shifts-month-v1.js','utf8');
 assert.equal(source.includes('\ufffd'),false,'Source must not contain replacement characters');
 const card={dataset:{},innerHTML:'',querySelector:selector=>selector==='.sf-my-month-toolbar'?null:{},querySelectorAll:()=>[]};
 const portal={querySelector:()=>card};
 const document={documentElement:{},getElementById:()=>portal,querySelectorAll:()=>[]};
 const window={SFBackend:{user:{id:'encoding-test'},employeePortalData:{company:{id:'company',timezone:'Europe/Berlin'},employee:{id:'employee'},shifts:[],templates:[]}},matchMedia:()=>({matches:false})};
 vm.runInNewContext(source,{window,document,Intl,Date,sessionStorage:{getItem:()=>null,setItem:()=>{}},MutationObserver:class{observe(){}}});
 for(const label of ['PERS\u00d6NLICHER DIENSTPLAN','Monat ausw\u00e4hlen','N\u00e4chster Monat','N\u00e4chster Dienst im Monat','Fr\u00fch / Tag','Sp\u00e4t','AUSGEW\u00c4HLTER TAG','W\u00e4hle einen belegten Tag','ausschlie\u00dflich deine ver\u00f6ffentlichten Dienste'])assert.ok(card.innerHTML.includes(label),label);
 assert.equal(card.innerHTML.includes('\ufffd'),false);
 assert.ok(card.innerHTML.includes('\u25cf Freigegebene Planung'));
 assert.ok(card.innerHTML.includes('\u2039</button>'));
});
