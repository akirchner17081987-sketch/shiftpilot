const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{PGlite}=require('@electric-sql/pglite');
const S=require('../assets/solid-planning-core-v1.js'),C=require('../assets/month-optimizer-core-v1.js'),R=require('../assets/solid-planning-resume-v1.js'),B=require('../assets/background-auto-plan-core-v1.js');
const rules={enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',preventLeaderToO1:true,preventDescendingShifts:true,maxCalendarWeekHours:55,maxConsecutiveShifts:4,maxConsecutiveNightShifts:4,minFreeCalendarDays:2,minNightRecoveryCalendarDays:2,minBlockRestHours:48};
const person={id:'e',role:'Teamleiter',target:180,monthlyHours:180,monthLimit:190,calendarLimit:190,maxMonthlyShifts:18,weeklyLimit:55,maxWeeklyHours:55,maxConsecutive:4};
const rank={OT:0,O1:1,O2:2,'TL-LE':2,'TL-RE':2,O3:3};
const row=(date,type)=>({employeeId:'e',date,type,start:type==='OT'?'08:00':type==='O1'?'18:00':type==='O3'?'22:00':'20:00',end:type==='OT'?'18:00':type==='O1'?'04:00':type==='O3'?'08:00':'06:00',resource:date+'|'+(type.startsWith('TL-')?'TL LE/RE':type)});
test('all normal OT/O/TL pairs follow the same forward order across a month boundary',()=>{
 for(const a of Object.keys(rank))for(const b of Object.keys(rank)){
  const rows=[row('2027-01-31',a),row('2027-02-01',b)],blocked=rank[a]>rank[b];
  assert.equal(S.allowsTransition(a,b,rules),!blocked,a+' -> '+b);
  for(const changed of [['2027-01-31'],['2027-02-01']])assert.equal(S.errors(person,rows,rules,changed).length>0,blocked,a+' -> '+b+' '+changed);
 }
 assert.equal(S.allowsTransition('O2','O1',{...rules,preventDescendingShifts:false}),true);
 assert.deepEqual(S.errors(person,[row('2027-01-31','O3'),row('2027-02-04','O1')],rules),[],'a rested new block may restart earlier');
 assert.equal(S.allowsTransition('OT3','OT1',rules),true,'separate OT roster retains its own transitions and rest checks');
});
test('manual guards reject adding either side, even during block candidate collection and fallback loading',()=>{
 for(const withCore of [true,false]){
  const c={window:null,Date,assignments:[row('2027-01-31','O2')],employees:[person],typeById:t=>row('2027-02-01',t),SFCompliance:{policy:{solidPlanningRules:rules}},...(withCore?{SFSolidPlanningCore:S}:{})};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync('assets/supabase-auto-plan-guard-v1.js','utf8'),c);
  assert.match(c.SFAutoPlanGuard.transitionConflict('e','O1','2027-02-01'),/Absteigender Schichtwechsel O2 → O1/);
  assert.equal(c.SFAutoPlanGuard.withBlockCandidates(()=>c.SFAutoPlanGuard.passesTimeRules('e','O1','2027-02-01')),false);
  c.assignments=[row('2027-02-01','O1')];assert.equal(c.SFAutoPlanGuard.passesTimeRules('e','O2','2027-01-31'),false);
  c.assignments=[row('2027-01-31','OT')];assert.equal(c.SFAutoPlanGuard.passesTimeRules('e','O1','2027-02-01'),true);
 }
});
test('ordinary and serialized planners reject an O2/O1 block and retain the forward replacement',async()=>{
 const bad=[row('2027-01-04','O2'),row('2027-01-05','O1')],good=[row('2027-01-04','O1'),row('2027-01-05','O2')],input={month:'2027-01',employees:[person],groups:[{id:'b',employee:person,block:true,fullWorkRest:true,options:[bad,good]}],base:[],capacities:[...bad,...good].map(a=>[a.resource,1]),solidRules:rules};
 const result=await C.optimize(input,{iterations:2});assert.deepEqual(result.preview.map(a=>a.type),['O1','O2']);
 const packed=B.pack(input),payload={version:1,months:['2027-01'],minimumInput:{...packed,groups:[],reserved:[],criticalCapacities:[]},monthInputs:[packed],metadata:{}};let cp=B.start(payload);
 while(cp.stage!=='done'){const runner=B.context(payload,cp);while(runner.step()){}cp=JSON.parse(JSON.stringify(cp));}
 assert.deepEqual(B.result(payload,cp).preview.map(a=>a.type),['O1','O2']);
});
test('database matches the transition matrix, both affected sides, and tenant scope',async()=>{
 const db=new PGlite();try{
  await db.exec(`create schema private;create role anon;create role authenticated;create role service_role;create table companies(id uuid,name text);create table company_compliance_policy(company_id uuid,solid_planning_rules jsonb,updated_at timestamptz);create table shift_templates(company_id uuid,active boolean,code text);insert into companies values('11111111-1111-1111-1111-111111111111','Secontec Services'),('22222222-2222-2222-2222-222222222222','Other');`);
  await db.query('insert into company_compliance_policy select id,$1,now() from companies',[{...rules,preventDescendingShifts:false,otOnlyMonthlyMaxHours:200}]);await db.exec("insert into shift_templates select id,true,code from companies cross join unnest(array['O1','O2','O3','TL-LE','TL-RE']) code");await db.exec(fs.readFileSync('supabase/migrations/20261015195558_forward_only_shift_transitions.sql','utf8'));
  const policies=(await db.query('select c.name,p.solid_planning_rules p from companies c join company_compliance_policy p on p.company_id=c.id order by c.name')).rows;assert.equal(policies[0].p.preventDescendingShifts,false);assert.equal(policies[1].p.preventDescendingShifts,true);assert.equal(policies[1].p.otOnlyMonthlyMaxHours,200);
  for(const a of Object.keys(rank))for(const b of Object.keys(rank))for(const changed of [['2027-01-31'],['2027-02-01']]){
   const rows=[row('2027-01-31',a),row('2027-02-01',b)].map(a=>{const x=S.duty(a,rules);return{shift_code:a.type,starts_at:new Date(x.startMs).toISOString(),ends_at:new Date(x.endMs).toISOString()};});
   const errors=(await db.query("select private.sf_confirmed_rule_errors($1,'Europe/Berlin',$2,$3::date[],55) errors",[rows,policies[1].p,changed])).rows[0].errors;assert.equal(errors.length>0,rank[a]>rank[b],a+' -> '+b+' '+changed);
  }
  const unchanged=(await db.query("select private.sf_descending_shift_error('O2','O1',$1) reason",[policies[0].p])).rows[0];assert.equal(unchanged.reason,null);
 }finally{await db.close()}
});
