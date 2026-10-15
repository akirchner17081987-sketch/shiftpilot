const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{PGlite}=require('@electric-sql/pglite');
const S=require('../assets/solid-planning-core-v1.js'),C=require('../assets/month-optimizer-core-v1.js'),R=require('../assets/solid-planning-resume-v1.js'),B=require('../assets/background-auto-plan-core-v1.js');
const rules={enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',preventLeaderToO1:true,maxCalendarWeekHours:55,maxConsecutiveShifts:4,maxConsecutiveNightShifts:4,minFreeCalendarDays:2,minNightRecoveryCalendarDays:2,minBlockRestHours:48};
const e={id:'e',role:'Teamleiter',target:180,monthlyHours:180,monthLimit:190,calendarLimit:190,maxMonthlyShifts:18,weeklyLimit:55,maxWeeklyHours:55,maxConsecutive:4};
const row=(date,type)=>({employeeId:'e',date,type,start:type==='O1'?'18:00':type==='O3'?'22:00':'20:00',end:type==='O1'?'04:00':type==='O3'?'08:00':'06:00',resource:date+'|'+type});
test('both leader locations reject next-day O1 across months while forward and same-time changes remain allowed',()=>{
 for(const leader of ['TL-LE','TL-RE']){
  const bad=[row('2027-01-31',leader),row('2027-02-01','O1')];
  for(const affected of [['2027-01-31'],['2027-02-01']])assert.ok(S.errors(e,bad,rules,affected).some(x=>/Nach TL-LE oder TL-RE/.test(x.message)));
  for(const next of ['O2','O3','TL-LE','TL-RE'])assert.deepEqual(S.errors(e,[bad[0],row('2027-02-01',next)],rules),[]);
  assert.deepEqual(S.errors(e,[row('2027-01-31','O1'),row('2027-02-01',leader)],rules),[]);
  assert.deepEqual(S.errors(e,[bad[0],row('2027-02-04','O1')],rules),[]);
  assert.deepEqual(S.errors(e,bad,{...rules,preventLeaderToO1:false}),[],'other company policies retain their existing behavior');
 }
 assert.equal(S.allowsTransition('O3','TL-LE',rules),false);
});
test('manual and candidate guards catch adding either side of the forbidden pair and report its actual reason',()=>{
 const c={window:null,Date,assignments:[row('2027-01-31','TL-RE')],employees:[e],typeById:type=>row('2027-02-01',type),SFCompliance:{policy:{solidPlanningRules:rules}},SFSolidPlanningCore:S};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync('assets/supabase-auto-plan-guard-v1.js','utf8'),c);
 assert.equal(c.SFAutoPlanGuard.passesTimeRules('e','O1','2027-02-01'),false);
 assert.equal(c.SFAutoPlanGuard.withBlockCandidates(()=>c.SFAutoPlanGuard.passesTimeRules('e','O1','2027-02-01')),false);
 assert.match(c.SFAutoPlanGuard.transitionConflict('e','O1','2027-02-01'),/Nach TL-LE oder TL-RE/);
 c.assignments=[row('2027-02-01','O1')];assert.equal(c.SFAutoPlanGuard.passesShiftTransitions('e','TL-LE','2027-01-31'),false);
 c.assignments=[row('2027-02-01','TL-RE')];assert.equal(c.SFAutoPlanGuard.passesTimeRules('e','O1','2027-01-31'),true);
});
test('ordinary and checkpointed planners choose the forward complete block instead of TL followed by O1',async()=>{
 const bad=[row('2027-01-04','TL-LE'),row('2027-01-05','O1')],good=[row('2027-01-04','O1'),row('2027-01-05','TL-LE')];
 const input={month:'2027-01',employees:[e],groups:[{id:'block',employee:e,block:true,fullWorkRest:true,options:[bad,good]}],base:[],capacities:[...bad,...good].map(a=>[a.resource,1]),solidRules:rules};
 const ordinary=await C.optimize(input,{iterations:2});assert.deepEqual(ordinary.preview.map(a=>a.type),['O1','TL-LE']);
 const packed=B.pack(input),unpacked=B.unpack(packed);let cp=R.start(unpacked,2);
 for(let n=0;n<1000&&cp.phase!=='done';n++){R.context(unpacked,cp).step();cp=JSON.parse(JSON.stringify(cp));}
 assert.equal(cp.phase,'done');assert.deepEqual(R.context(unpacked,cp).result().preview.map(a=>a.type),['O1','TL-LE']);
});
test('database migration scopes the rule and rejects both affected sides while preserving the reverse change',async()=>{
 const db=new PGlite();try{
  await db.exec(`create schema private;create table companies(id uuid,name text);create table company_compliance_policy(company_id uuid,solid_planning_rules jsonb,updated_at timestamptz);create table shift_templates(company_id uuid,active boolean,code text);
  insert into companies values('11111111-1111-1111-1111-111111111111','Secontec Services'),('22222222-2222-2222-2222-222222222222','Other');`);
  await db.query('insert into company_compliance_policy select id,$1,now() from companies',[{...rules,preventLeaderToO1:false,otOnlyMonthlyMaxHours:200}]);
  await db.exec("insert into shift_templates select id,true,code from companies cross join unnest(array['O1','TL-LE','TL-RE']) code");
  await db.exec(fs.readFileSync('supabase/migrations/20261015134637_prevent_leader_to_o1_next_day.sql','utf8'));
  const policies=(await db.query('select c.name,p.solid_planning_rules p from companies c join company_compliance_policy p on p.company_id=c.id order by c.name')).rows;
  assert.equal(policies[0].p.preventLeaderToO1,false);assert.equal(policies[1].p.preventLeaderToO1,true);assert.equal(policies[1].p.otOnlyMonthlyMaxHours,200);
  const sqlRows=rows=>rows.map(a=>{const d=S.duty(a,rules);return {shift_code:a.type,starts_at:new Date(d.startMs).toISOString(),ends_at:new Date(d.endMs).toISOString()}});
  const errors=async(rows,affected,p=policies[1].p)=>(await db.query("select private.sf_confirmed_rule_errors($1,'Europe/Berlin',$2,$3::date[],55) errors",[sqlRows(rows),p,affected])).rows[0].errors;
  for(const leader of ['TL-LE','TL-RE']){
   const bad=[row('2027-01-31',leader),row('2027-02-01','O1')];
   for(const affected of [['2027-01-31'],['2027-02-01']])assert.ok((await errors(bad,affected)).some(x=>/Nach TL-LE oder TL-RE/.test(x)));
   assert.deepEqual(await errors([row('2027-01-31','O1'),row('2027-02-01',leader)],null),[]);
   assert.deepEqual(await errors(bad,null,policies[0].p),[]);
  }
 }finally{await db.close()}
});
