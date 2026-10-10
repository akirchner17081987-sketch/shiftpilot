const test=require('node:test'),assert=require('node:assert/strict'),C=require('../assets/wish-planning-core-v1.js'),S=require('../assets/solid-planning-core-v1.js'),O=require('../assets/month-optimizer-core-v1.js');
const zone='Europe/Berlin',w=(status='PROMISED')=>({id:'wish',employee_id:'a',kind:'OFF',status,start_date:'2027-02-01',end_date:'2027-02-01',starts_at:'2027-01-31T23:00:00Z',ends_at:'2027-02-01T23:00:00Z',priority:'NORMAL'}),d=(date,start,end,id='a',type='FD')=>({date,start,end,employeeId:id,type});
test('a protected calendar day also rejects the previous night but allows exact boundaries',()=>{
 assert.ok(C.conflict([w()],'a',d('2027-01-31','22:00','06:00'),zone));
 assert.ok(C.conflict([w('RELEASE_REQUESTED')],'a',d('2027-02-01','22:00','06:00'),zone));
 assert.equal(C.conflict([w()],'a',d('2027-01-31','14:00','00:00'),zone),null);
 assert.equal(C.conflict([w()],'a',d('2027-02-02','00:00','08:00'),zone),null);
 assert.equal(C.conflict([w()],'b',d('2027-02-01','06:00','14:00','b'),zone),null);
});
test('open, rejected and voluntarily released wishes are not hard promises',()=>{for(const status of ['PENDING','REJECTED','RELEASED','WITHDRAWN'])assert.equal(C.conflict([w(status)],'a',d('2027-02-01','06:00','14:00'),zone),null)});
test('night and weekend figures split midnight, month boundaries and actual DST duration',()=>{
 let x=C.workload([d('2027-01-29','22:00','06:00')],'2027-01-01','2027-01-31',zone);assert.equal(x.hours,8);assert.equal(x.night,8);assert.equal(x.weekend,6);assert.equal(x.weekendRate,75);
 x=C.workload([d('2027-01-31','22:00','06:00')],'2027-02-01','2027-02-28',zone);assert.equal(x.hours,6);assert.equal(x.weekend,0);
 assert.equal(C.workload([d('2027-03-27','22:00','06:00')],'2027-03-01','2027-03-31',zone).night,7);
 assert.equal(C.workload([d('2027-10-30','22:00','06:00')],'2027-10-01','2027-10-31',zone).night,9);
 assert.equal(C.workload([],'2027-01-01','2027-01-31',zone).nightRate,null);
});
test('decision rate uses the latest decision for each day, excluding pending or withdrawn wishes',()=>{
 const wishes=[{...w('REJECTED'),id:'old',decided_at:'2026-12-01T00:00:00Z'},{...w('RELEASED'),id:'new',decided_at:'2026-12-02T00:00:00Z'}, {...w('PENDING'),end_date:'2027-02-02'},{...w('WITHDRAWN'),decided_at:'2027-01-01T00:00:00Z'}];
 assert.deepEqual(C.decisions(wishes,'2027-02-01','2027-02-28'),{approved:1,rejected:0,total:1,rate:100});
});
test('important wishes have an explicit double weight; preferring a shift grants no protection',()=>{
 const off=w('PENDING'),a=[d('2027-02-01','06:00','14:00')];assert.equal(C.preferenceEffect([off],'a',a,zone).score,-10);assert.equal(C.preferenceEffect([{...off,priority:'IMPORTANT'}],'a',a,zone).score,-20);
 const shift={...off,kind:'SHIFT',status:'ACCEPTED',shift_code:'FD'};assert.equal(C.preferenceEffect([shift],'a',a,zone).score,8);assert.equal(C.preferenceEffect([shift],'a',[d('2027-02-01','14:00','22:00','a','SD')],zone).score,-8);assert.equal(C.conflict([shift],'a',a[0],zone),null);
});
test('optimizer preserves coverage and chooses the employee without a conflicting open wish',async()=>{
 const people=['a','b'].map(id=>({id,target:8,monthLimit:8,weeklyLimit:40,maxConsecutive:4,shifts:['FD']}));const option=e=>[d('2027-02-01','06:00','14:00',e.id)].map(a=>({...a,resource:a.date+'|FD'}));
 const input={month:'2027-02',employees:people,base:[],capacities:[['2027-02-01|FD',1]],respectHours:true,groups:people.map(e=>({id:e.id,employee:e,options:[option(e)]})),...C.optimizer([w('PENDING')],people,[],'2027-02',zone)};
 const found=await O.optimize(input,{iterations:4});assert.equal(found.quality.open,0);assert.equal(found.preview[0].employeeId,'b');
 const promised=await O.optimize({...input,...C.optimizer([w()],people,[],'2027-02',zone)},{iterations:2});assert.equal(promised.preview[0].employeeId,'b');
});
test('historical workload compares only matching shift permissions and normalizes by planned hours',()=>{
 const people=[{id:'a',shifts:['ND']},{id:'b',shifts:['ND']},{id:'c',shifts:['FD']}],base=[d('2027-01-05','22:00','06:00','a','ND'),d('2027-01-05','14:00','22:00','b','ND')],p=C.optimizer([],people,base,'2027-02',zone);
 const option=[d('2027-02-02','22:00','06:00','a','ND')];assert.ok(p.preferenceScore(people[0],[],option)<p.preferenceScore(people[1],[],option));assert.equal(p.preferenceScore(people[2],[],option),0);
});
test('reports remain alphabetical by last name and use only supplied employee records',()=>{
 const data={employees:[{id:'a',first:'Max',last:'Zorn'},{id:'b',first:'Ida',last:'Adler'}],duties:[],wishes:[],fairness_from:'2027-01-01',fairness_to:'2027-01-31',timezone:zone};assert.deepEqual(C.report(data).map(x=>x.last),['Adler','Zorn']);assert.equal(C.report({...data,employees:[data.employees[0]]}).length,1);
});
