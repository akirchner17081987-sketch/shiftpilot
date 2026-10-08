import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),planner=require('../assets/individual-month-planner-v1.js'),core=require('../assets/month-optimizer-core-v1.js');
const fixture=()=>JSON.parse(fs.readFileSync(new URL('./fixtures/individual-january-2027.json',import.meta.url)));
const assignment=(id,date,type='SD')=>({employeeId:id,date,type,start:type==='ND'?'22:00':type==='SD'?'14:00':'06:00',end:type==='ND'?'06:00':type==='SD'?'22:00':'14:00',resource:date+'|'+type});
function minimal({base=[],monthLimit=40,weeklyLimit=40,respectHours=true}={}){
 const e={id:'test',target:40,monthLimit,weeklyLimit,maxConsecutive:5},dates=Array.from({length:31},(_,i)=>'2027-01-'+String(i+1).padStart(2,'0'));
 return{month:'2027-01',employees:[e],base,respectHours,capacities:dates.flatMap(d=>['SD','ND','FD-WE'].map(t=>[d+'|'+t,1])),groups:dates.map(d=>({employee:e,options:['SD','ND','FD-WE'].map(t=>[assignment(e.id,d,t)])}))};
}
test('individual January search keeps hard recovery rules and exposes remaining shortages',async()=>{
 const input=fixture();delete input.seed;const before=JSON.stringify(input),result=await core.optimize(input,{iterations:128});
 assert.equal(JSON.stringify(input),before,'optimizer must not mutate the source plan');
 assert.equal(planner.validate(result.individualInput,result.preview),true);
 assert.ok(result.preview.length>=340,'retain substantial coverage under hard recovery rules');assert.equal(result.quality.open,input.capacities.reduce((n,[,v])=>n+v,0)-result.preview.length);assert.equal(result.quality.morningOpen,0);
 for(const r of result.rows){const e=input.employees.find(e=>String(e.id)===String(r.employeeId));assert.ok(r.planned<=e.monthLimit,`${r.employeeId}: monthly cap exceeded`);}assert.ok(result.quality.deficit>0,'unfilled personal goals must remain visible');
 const morningMissing=result.rows.reduce((n,r)=>n+Math.max(0,2-result.preview.filter(a=>String(a.employeeId)===String(r.employeeId)&&a.type==='FD-WE').length),0);assert.equal(result.quality.morningMissing,morningMissing,'distribution gaps must be reported');
 const resources=new Map();for(const a of result.preview)resources.set(a.resource,(resources.get(a.resource)||0)+1);
 for(const [key,n] of input.capacities){const actual=resources.get(key)||0;assert.ok(actual<=n);if(key.endsWith('|FD-WE'))assert.equal(actual,n);else assert.ok(actual>=3,'avoid severe understaffing');}
 for(const e of input.employees){const own=[...input.base,...result.preview].filter(a=>a.employeeId===e.id).sort((a,b)=>a.date.localeCompare(b.date));let blocks=[],nights=[];
  for(const a of own){const d=Number(a.date.slice(-2))+(a.date.startsWith('2026-12')?-31:0);if(blocks.length&&blocks.at(-1).at(-1).d+1===d)blocks.at(-1).push({d,...a});else blocks.push([{d,...a}]);if(a.type==='ND'){if(nights.length&&nights.at(-1).at(-1).d+1===d)nights.at(-1).push({d,...a});else nights.push([{d,...a}]);}}
  for(const b of blocks.filter(b=>b.some(a=>a.date.startsWith(input.month)))){assert.ok(b.length<=5);assert.ok(b.length>=2||b[0].date==='2027-01-31');}
  for(const b of nights.filter(b=>b.some(a=>a.date.startsWith(input.month))))assert.ok(b.length>=2&&b.length<=4);
  const mornings=own.filter(a=>a.date.startsWith(input.month)&&a.type==='FD-WE').length;assert.ok(mornings>=0&&mornings<=10);
 }
});
test('an old seed violating night recovery is rejected and rebuilt without mutating drafts',async()=>{
 const input=fixture(),before=JSON.stringify(input.seed);assert.equal(planner.validate(input,input.seed),false);
 const r=await planner.optimize(input,{iterations:2,beamWidth:80});assert.equal(JSON.stringify(input.seed),before);assert.equal(planner.validate(input,r.preview),true);assert.ok(r.preview.length>0);
});
test('a valid existing seed remains available under the new rules',async()=>{
 const input=minimal();input.seed=[assignment('test','2027-01-04','ND'),assignment('test','2027-01-05','ND')];const before=JSON.stringify(input.seed);
 const r=await planner.optimize(input,{iterations:2,beamWidth:80});assert.equal(JSON.stringify(input.seed),before);assert.equal(planner.validate(input,r.preview),true);assert.ok(r.preview.length>=input.seed.length);
});
test('night pairs and forward rotation are required even when weekly hour enforcement is off',()=>{
 const input=minimal({respectHours:false});
 assert.equal(planner.validate(input,[assignment('test','2027-01-04','ND')]),false);
 assert.equal(planner.validate(input,[assignment('test','2027-01-04','ND'),assignment('test','2027-01-05','ND')]),true);
 assert.equal(planner.validate(input,[assignment('test','2027-01-04','SD'),assignment('test','2027-01-05','FD-WE')]),false);
 assert.equal(planner.validate(input,[assignment('test','2027-01-04'),assignment('test','2027-01-05'),assignment('test','2027-01-06','ND'),assignment('test','2027-01-07','ND')]),false);
 assert.equal(planner.validate(input,[assignment('test','2027-01-04'),assignment('test','2027-01-05'),assignment('test','2027-01-07','ND'),assignment('test','2027-01-08','ND')]),true);
});
test('one free start day before nights and three after them are mandatory across month boundaries',()=>{
 const nights=[assignment('test','2027-01-04','ND'),assignment('test','2027-01-05','ND')];
 assert.equal(planner.validate(minimal(),[...nights,assignment('test','2027-01-07'),assignment('test','2027-01-08')]),false);
 assert.equal(planner.validate(minimal(),[...nights,assignment('test','2027-01-09'),assignment('test','2027-01-10')]),true);
 const previous=[assignment('test','2026-12-30','ND'),assignment('test','2026-12-31','ND')];
 assert.equal(planner.validate(minimal({base:previous}),[assignment('test','2027-01-02'),assignment('test','2027-01-03')]),false);
 assert.equal(planner.validate(minimal({base:previous}),[assignment('test','2027-01-04'),assignment('test','2027-01-05')]),true);
 const end=[assignment('test','2027-01-29','ND'),assignment('test','2027-01-30','ND')];
 assert.equal(planner.validate(minimal({base:[assignment('test','2027-02-02')]}),end),false);
 assert.equal(planner.validate(minimal({base:[assignment('test','2027-02-03')]}),end),true);
});
test('actual December hours, previous night blocks and following February nights count at month boundaries',()=>{
 const input=minimal({base:[assignment('test','2026-12-31','ND')]}),preview=[assignment('test','2027-01-01','ND')];
 assert.equal(planner.validate(input,preview),true);
 assert.equal(planner.validate(minimal(),[assignment('test','2027-01-31','ND')]),false);
 assert.equal(planner.validate(minimal({base:[assignment('test','2027-02-01','ND')]}),[assignment('test','2027-01-31','ND')]),true);
 assert.equal(planner.validate(minimal({base:[assignment('test','2026-12-31')],weeklyLimit:16}),[assignment('test','2027-01-01'),assignment('test','2027-01-02')]),false);
 assert.equal(planner.validate(minimal(),[assignment('test','2027-01-31')]),true);
});
test('a month ceiling, capacity, absence permissions and protected assignments remain mandatory',()=>{
 const pair=[assignment('test','2027-01-04'),assignment('test','2027-01-05')];assert.equal(planner.validate(minimal({monthLimit:8,respectHours:false}),pair),false);
 const missing=minimal();missing.groups=missing.groups.filter(g=>g.options[0][0].date!=='2027-01-05');assert.equal(planner.validate(missing,pair),false);
 const input=minimal({base:[assignment('test','2027-01-04')]});assert.equal(planner.validate(input,pair),false);
 const noCapacity=minimal();noCapacity.capacities=[['2027-01-04|SD',0],['2027-01-05|SD',1]];assert.equal(planner.validate(noCapacity,pair),false);
 assert.equal(planner.validate(minimal(),[...pair,{...pair[0],employeeId:'another-tenant'}]),false);
});
test('a malformed edited preview cannot inject foreign dates, shift codes or an invalid candidate',()=>{
 const input=minimal(),pair=[assignment('test','2027-01-04'),assignment('test','2027-01-05')];
 for(const changed of [null,{...pair[0],date:'2027-02-04'},{...pair[0],type:'FD'},{...pair[0],start:'bad'}])assert.equal(planner.validate(input,[changed,pair[1]]),false);
});
test('individual apply wraps the established guards and validation in one invoker transaction',()=>{
 const sql=fs.readFileSync(new URL('../supabase/migrations/20261004121341_individual_month_block_validation.sql',import.meta.url),'utf8');
 const body=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.apply_individual_month_optimization'));
 assert.match(body,/SECURITY INVOKER SET search_path=''/);assert.ok(body.indexOf('private.sf_apply_month_optimization(')<body.indexOf('private.sf_validate_individual_month('));
 assert.doesNotMatch(body,/\bCOMMIT\b|EXCEPTION WHEN|SECURITY DEFINER/);assert.match(sql,/FROM PUBLIC,anon/);assert.match(sql,/count\(\*\)<2 OR count\(\*\)>4/);assert.match(sql,/count\(\*\)>maximum_/);assert.match(sql,/Monatsgrenzen zählen mit/);
});
test('protected coverage counts toward the daily staffing floor rather than demanding four extra duties',()=>{
 const input=minimal({base:[assignment('protected-a','2027-01-04'),assignment('protected-b','2027-01-04')]});input.capacities=[['2027-01-04|SD',4]];
 const p=planner.prepare(input),q=planner.score(p,new Map([['test',[planner.duty(assignment('test','2027-01-04'))]]]));assert.equal(q.thin,1,'two protected and one proposed require one more for a floor of four');
});
