const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../assets/month-optimizer-core-v1.js'),S=require('../assets/solid-planning-core-v1.js');

test('indexed leader block ranking matches the complete roster scan for every branch',()=>{
  const dates=Array.from({length:7},(_,i)=>'2030-02-'+String(i+1).padStart(2,'0'));
  const employees=[{id:'leader-a',role:'Teamleiter'},{id:'leader-b',role:'Teamleiter'},{id:'other',role:'Mitarbeiter'}].map(e=>({...e,target:180,monthLimit:200,shifts:['N']}));
  const row=(id,date)=>({employeeId:id,date,type:'N',start:'21:00',end:'06:00',resource:date+'|N'});
  const groups=[
    {id:'a-first',employee:employees[0],options:[[row('leader-a',dates[0]),row('leader-a',dates[1])]]},
    {id:'a-third',employee:employees[0],options:[[row('leader-a',dates[2])]]},
    {id:'a-fifth',employee:employees[0],options:[[row('leader-a',dates[4])]]},
    {id:'b-first',employee:employees[1],options:[[row('leader-b',dates[0])]]},
    {id:'b-second',employee:employees[1],options:[[row('leader-b',dates[1]),row('leader-b',dates[2])]]},
    {id:'other',employee:employees[2],options:[[row('other',dates[3])]]}
  ];
  const p=M.prepare({month:'2030-02',employees,base:[row('leader-a','2030-01-31'),row('leader-b',dates[5]),row('other',dates[0])],groups,capacities:dates.map(date=>[date+'|N',1]),solidRules:{enabled:true,timezone:'Europe/Berlin',teamLeaderPreferredNightBlockLength:4}});
  function reference(records){let shortfall=0,active=new Set([...p.capacity.keys()].map(k=>k.slice(0,10)));for(const e of p.people.values()){if(e.role!=='Teamleiter')continue;const preferred=Number(S.employeeRules(e,p.solidRules).preferredNightBlockLength)||4,rows=[...p.base,...records.flatMap(r=>r.option)].filter(a=>String(a.employeeId)===String(e.id)&&a.start>='18:00'&&active.has(a.date)).sort((a,b)=>a.date.localeCompare(b.date));let run=0,last=null;for(const a of rows){if(last&&S.plus(last,1)!==a.date){shortfall+=Math.max(0,preferred-run);run=0;}run++;last=a.date;}if(run)shortfall+=Math.max(0,preferred-run);}return shortfall*10;}
  for(let mask=0;mask<1<<p.groups.length;mask++){const records=p.groups.flatMap((group,i)=>mask&(1<<i)?[{group,option:group.options[0]}]:[]);assert.equal(M.checkpointPrimitives.teamLeaderBlockPenalty(p,records),reference(records),'branch '+mask);}
});
