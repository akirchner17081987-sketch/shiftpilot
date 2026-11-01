const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const E=require('../assets/block-exchange-core-v1.js'),B=require('../assets/background-auto-plan-core-v1.js'),A=require('../assets/autonomous-planning-core-v1.js'),S=require('../assets/solid-planning-core-v1.js');
const R=require('../assets/solid-planning-resume-v1.js');
const loadHighs=require('highs'),runtime=loadHighs({print(){},printErr(){}});
const policy={enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',monthlyHoursOnly:true,monthlyMaxHours:200,maxConsecutiveShifts:4,maxConsecutiveNightShifts:4,minFreeCalendarDays:2,minNightRecoveryCalendarDays:2,minBlockRestHours:48,maxCalendarWeekHours:55,threeNightBlockRecoveryFullCalendarDays:1};
const times={O1:['16:00','01:00'],O3:['22:00','07:00'],OT:['07:00','16:00'],TL:['21:00','06:00']};
test('fixed-variable elimination preserves constraint bounds, warm starts and full checkpoint indices',()=>{
 const model={numCols:3,numRows:2,sense:1,colCost:[2,3,4],colLower:[0,0,0],colUpper:[1,1,1],integrality:[1,1,1],rowLower:[1,0],rowUpper:[1,2],matrix:{format:'csc',numCols:3,numRows:2,starts:[0,1,3,4],indices:[0,0,1,1],values:[1,1,2,1]}},before=JSON.stringify(model),r=E.compactModel(model,[1,0,0],[1,1,0],[1,0,0]);
 assert.equal(r.model.numCols,1);assert.deepEqual(r.model.rowLower,[0,0]);assert.deepEqual(r.model.rowUpper,[0,2]);assert.deepEqual(r.warm,[0]);
 assert.deepEqual(r.expand([1]),[1,1,0]);assert.deepEqual(r.expand([]),[]);assert.equal(JSON.stringify(model),before);
 const clamped=E.compactModel(model,[0,0,0],[0,1,0],[1,0,0]);assert.deepEqual(clamped.expand([1]),[0,1,0]);
});
test('a checked intermediate replacement may explore worse preferences without replacing the best proposal',()=>{
 const f=small({cap:18});f.input.adaptiveSearch=true;f.input.employees[0].target=9;
 f.input.groups[0].options=[f.input.groups[0].options[0].slice(0,2)];f.input.criticalCapacities=f.input.capacities;
 const cp=E.start(f.input,f.preview),before=JSON.stringify(cp.best);cp.pass=1;
 const full=Array(16).fill(0);for(const i of [0,7,8,9,10])full[i]=1;full[13]=full[14]=9;
 const fake={createModel(model){assert.equal(model.numCols,14);return{options:{set(){}},setSolution(){},run(){},info:{get:()=>2},getSolution:()=>({colValue:full.filter((_,i)=>i!==5&&i!==6)}),dispose(){}};}};
 E.context(f.input,cp).step(fake);
 assert.equal(cp.lastTrial.checked,true);assert.equal(cp.lastTrial.objectiveImproved,false);
 assert.deepEqual(cp.working,[0]);assert.equal(JSON.stringify(cp.best),before);
 assert.deepEqual(E.context(f.input,JSON.parse(JSON.stringify(cp))).result().preview.map(B.rowKey).sort(),f.preview.map(B.rowKey).sort());
});
test('adaptive repair can move one gap along a replacement chain while the total shortage stays bounded',()=>{
 const f=small();f.input.adaptiveSearch=true;f.input.groups[0].options.push(f.input.groups[0].options[0].slice(0,2));
 f.input.criticalCapacities=f.input.capacities;
 const cp=E.start(f.input,f.preview),c=E.context(f.input,cp),m=c.model,x=Array(m.numCols).fill(0);
 x[1]=1;x[8]=1;x[9]=1;x[10]=1;x[11]=1;
 const feasible=vector=>{
  if(vector.some((v,i)=>v<m.colLower[i]-1e-6||v>m.colUpper[i]+1e-6))return false;
  const rows=Array(m.numRows).fill(0);for(let i=0;i<m.numCols;i++)for(let k=m.matrix.starts[i];k<m.matrix.starts[i+1];k++)rows[m.matrix.indices[k]]+=vector[i]*m.matrix.values[k];
  return rows.every((v,i)=>v>=m.rowLower[i]-1e-6&&v<=m.rowUpper[i]+1e-6);
 };
 assert.equal(feasible(x),true,'the same single vacancy can move from day 5 to day 6');
 const worse=x.slice();worse[4]=1;worse[5]=1;assert.equal(feasible(worse),false,'two vacancies cannot replace the better incumbent');
 const proposed=f.input.groups[0].options[1];assert.deepEqual(S.errors(f.input.employees[0],proposed,policy),[]);
});
function small({cap=27,wish=false,protectedDuty=false}={}){
 const employees=['a','b','c'].map((id,i)=>({id,target:i?9:27,monthLimit:i?9:cap,calendarLimit:i?9:cap,maxMonthlyShifts:100,weeklyLimit:55,maxWeeklyHours:55,weeklyHours:40,maxConsecutive:4,employment:'Vollzeit',shifts:['TL'],role:'Sicherheitsmitarbeiter'}));
 if(protectedDuty)employees.push({...employees[0],id:'protected',target:9});
 const row=(id,n)=>({employeeId:id,date:'2027-01-0'+n,type:'TL',start:'21:00',end:'06:00',resource:'2027-01-0'+n+'|TL'}),groups=[{id:'a|4',employee:employees[0],fullWorkRest:true,options:[[row('a',4),row('a',5),row('a',6)]]},{id:'b|4',employee:employees[1],options:[[row('b',4)]]},{id:'c|6',employee:employees[2],options:[[row('c',6)]]}];
 return{input:{month:'2027-01',employees,groups,base:protectedDuty?[{...row('protected',1),status:'PUBLISHED',_dbStatus:'PUBLISHED'}]:[],capacities:[4,5,6].map(n=>['2027-01-0'+n+'|TL',1]),criticalCapacities:[],solidRules:policy,maxShiftHours:9,minRestHours:11,wishes:wish?[{employee_id:'a',kind:'OFF',status:'PROMISED',starts_at:'2027-01-05T00:00:00Z',ends_at:'2027-01-06T23:00:00Z'}]:[]},preview:[{...row('b',4),blockId:'b|4'},{...row('c',6),blockId:'c|6'}]};
}
async function optimize(input,preview,{seconds=.2,maxPasses=12}={}){const highs=await runtime,before=JSON.stringify(input);let cp=E.start(input,preview);cp.maxPasses=maxPasses;let result;while(cp.status==='searching'){const c=E.context(input,cp);c.step(highs,seconds);result=c.result();cp=JSON.parse(JSON.stringify(cp));}result=E.context(input,cp).result();assert.equal(JSON.stringify(input),before);return{result,cp};}
test('automatic whole-block exchange restores every displaced duty and survives JSON checkpoints',async()=>{const f=small({protectedDuty:true}),{result,cp}=await optimize(f.input,f.preview);assert.equal(result.quality.open,0);assert.equal(result.preview.length,3);assert.ok(result.preview.every(a=>a.employeeId==='a'));assert.equal(cp.improvements,1);assert.equal(f.input.base[0]._dbStatus,'PUBLISHED');for(const e of f.input.employees)assert.deepEqual(S.errors(e,[...f.input.base,...result.preview],policy),[]);});
test('reserved duty repeated in the preview is counted once while repairing other blocks',async()=>{
 const f=small({protectedDuty:true});f.preview.push({...f.input.base[0]});
 const {result,cp}=await optimize(f.input,f.preview);
 assert.equal(cp.initialOpen,1);assert.equal(result.quality.open,0);
 assert.equal(result.preview.filter(a=>a.employeeId==='protected').length,1);
 assert.equal(result.preview.filter(a=>a.employeeId==='a').length,3);
});
test('personal hour ceilings, confirmed wishes and indivisible required blocks remain binding',async()=>{for(const options of [{cap:18},{wish:true}]){const f=small(options),{result}=await optimize(f.input,f.preview);assert.equal(result.quality.open,1);assert.equal(result.preview.filter(a=>a.employeeId==='a').length,0);assert.equal(result.preview.length,2);}});
test('published previous-month nights remain immutable and their January hours count toward the calendar cap',async()=>{const f=small();f.input.base=[29,30,31].map(n=>({employeeId:'a',date:'2026-12-'+n,type:'TL',start:'21:00',end:'06:00',resource:'2026-12-'+n+'|TL',status:'PUBLISHED',_dbStatus:'PUBLISHED'}));const saved=JSON.stringify(f.input.base),blocked=await optimize(f.input,f.preview);assert.equal(blocked.result.quality.open,1);f.input.employees[0].calendarLimit=36;const {result}=await optimize(f.input,f.preview);assert.equal(result.quality.open,0);assert.equal(JSON.stringify(f.input.base),saved);assert.deepEqual(S.errors(f.input.employees[0],[...f.input.base,...result.preview],policy),[]);});
test('non-integral or invalid solver output never replaces the checked incumbent',()=>{const f=small(),cp=E.start(f.input,f.preview),before=JSON.stringify(cp.best),c=E.context(f.input,cp),fake={createModel(model){return{options:{set(){}},setSolution(){},run(){},info:{get:()=>2},getSolution:()=>({colValue:model.colCost.map(()=>.75)}),dispose(){}};}};c.step(fake);assert.equal(JSON.stringify(cp.best),before);assert.equal(c.result().quality.open,1);});
test('adaptive repair reassigns a complete blocked chain and keeps published duties fixed',async()=>{
 const f=small({protectedDuty:true});f.input.adaptiveSearch=true;
 const {result,cp}=await optimize(f.input,f.preview);
 assert.equal(result.quality.open,0);assert.equal(result.quality.blockExchange.adaptive,true);
 assert.ok(cp.improvements>0);assert.equal(f.input.base[0]._dbStatus,'PUBLISHED');
 assert.ok(result.preview.every(a=>a.employeeId==='a'));
});
test('regional repair may move a priority employee to close a shared position',async()=>{
 const f=small();f.input.adaptiveSearch=true;f.input.solidRules={...policy,regionalDayStaffing:{target:3,weekdayCodes:['TL'],specialCodes:[],statesBySite:{}},orderedMonthlyShiftEmployees:[{employeeId:'a',code:'TL'}]};
 const cp=E.start(f.input,f.preview);assert.equal(cp.status,'searching');assert.ok(!cp.excluded.includes('a'));
 const {result}=await optimize(f.input,f.preview);assert.equal(result.quality.open,0);assert.equal(result.preview.length,3);assert.ok(result.preview.every(a=>a.employeeId==='a'));
});
test('regional repair prefers the earlier ordered employee when coverage is equal',async()=>{
 const f=small();f.input.adaptiveSearch=true;f.input.employees=f.input.employees.slice(0,2).map(e=>({...e,target:9,monthLimit:9,calendarLimit:9}));
 const row=id=>({employeeId:id,date:'2027-01-04',type:'TL',start:'21:00',end:'06:00',resource:'2027-01-04|TL'});
 f.input.groups=f.input.employees.map(e=>({id:e.id,employee:e,options:[[row(e.id)]]}));f.input.capacities=[['2027-01-04|TL',1]];
 f.input.solidRules={...policy,regionalDayStaffing:{target:1,weekdayCodes:['TL'],specialCodes:[],statesBySite:{}},orderedMonthlyShiftEmployees:[{employeeId:'a',code:'TL'},{employeeId:'b',code:'TL'}]};
 const {result}=await optimize(f.input,[row('b')],{maxPasses:6});assert.equal(result.quality.open,0);assert.equal(result.preview[0].employeeId,'a');
});
test('approved fragments joined by the allocator remain movable even when the capped options omit their combined block',()=>{
 const f=small();f.input.adaptiveSearch=true;const a=f.input.groups[0];a.fullWorkRest=false;
 a.options.push([a.options[0][0]],[a.options[0][1]]);
 const preview=[...a.options[0].slice(0,2),f.preview[1]],before=JSON.stringify(f.input),cp=E.start(f.input,preview);
 assert.equal(cp.status,'searching');assert.ok(!cp.excluded.includes('a'));
 assert.equal(JSON.stringify(f.input),before);
 assert.deepEqual(E.context(f.input,JSON.parse(JSON.stringify(cp))).result().preview.map(B.rowKey).sort(),preview.map(B.rowKey).sort());
});
test('adaptive stagnation releases the whole crew and malformed numeric solver results cannot replace the incumbent',()=>{
 const f=small();f.input.adaptiveSearch=true;const cp=E.start(f.input,f.preview);cp.pass=31;cp.lastImprovement=0;
 const before=JSON.stringify(cp.best);let unlocked=false;
 const fake={createModel(model){unlocked=model.colLower.slice(0,3).every(v=>v===0)&&model.colUpper.slice(0,3).every(v=>v===1);return{options:{set(){}},setSolution(){},run(){},info:{get:()=>2},getSolution:()=>({colValue:model.colCost.map(()=>NaN)}),dispose(){}};}};
 E.context(f.input,cp).step(fake);assert.equal(unlocked,true);assert.equal(cp.globalPasses,1);
 assert.equal(JSON.stringify(cp.best),before);assert.equal(cp.lastTrial.integral,false);
});
test('unsupported dynamic coverage keeps the original proposal and does not silently relax rules',()=>{const f=small();f.input.solidRules={...policy,conditionalStaffing:[{shift:'OT',sourceShift:'O3'}]};const cp=E.start(f.input,f.preview),r=E.context(f.input,cp).result();assert.equal(cp.status,'unsupported');assert.deepEqual(r.preview.map(B.rowKey),f.preview.map(B.rowKey));});
test('conservatively fixed employees stay excluded after checkpoint reconstruction',async()=>{const f=small();f.preview.push({...f.preview[0],employeeId:'a',date:'2027-01-10',resource:'2027-01-10|TL'});f.input.capacities.push(['2027-01-10|TL',1]);const cp=JSON.parse(JSON.stringify(E.start(f.input,f.preview)));assert.ok(cp.excluded.includes('a'));const c=E.context(f.input,cp);c.step(await runtime);const r=c.result();assert.deepEqual(r.preview.filter(a=>a.employeeId==='a').map(B.rowKey),f.preview.filter(a=>a.employeeId==='a').map(B.rowKey));assert.equal(r.quality.open,1);});
test('whole-block search explicitly balances staff with identical targets and shift permissions',async()=>{const f=small(),employees=f.input.employees.slice(0,2).map(e=>({...e,target:36,monthLimit:36,calendarLimit:36})),row=(id,n)=>({employeeId:id,date:'2027-01-0'+n,type:'TL',start:'21:00',end:'06:00',resource:'2027-01-0'+n+'|TL'});f.input.employees=employees;f.input.groups=[{id:'a',employee:employees[0],options:[[4,5,6].map(n=>row('a',n)),[4,5].map(n=>row('a',n))]},{id:'b',employee:employees[1],options:[[row('b',7)],[6,7].map(n=>row('b',n))]}];f.input.capacities=[4,5,6,7].map(n=>['2027-01-0'+n+'|TL',1]);const {result}=await optimize(f.input,[...[4,5,6].map(n=>row('a',n)),row('b',7)]);assert.equal(result.quality.open,0);assert.equal(result.quality.peerSpread,0);assert.equal(result.quality.peerExcess,0);assert.equal(result.preview.filter(a=>a.employeeId==='a').length,2);});
test('durable background jobs expose and checkpoint the additional search; runtime failure retains the proposal',async()=>{const f=small(),wire=B.pack(f.input),payload={version:1,months:['2027-01'],minimumInput:wire,monthInputs:[wire],metadata:{},enhancedBlockSearch:true};const cp=B.start(payload);cp.stage='exchange';cp.exchange=E.start(f.input,f.preview);cp.pendingQuality={open:1,critical:0};assert.match(B.progress(payload,cp).label,/gemeinsam/);const run=B.context(payload,cp);run.exchangeStep(await runtime);while(cp.stage==='exchange'){cp.exchange.maxPasses=1;B.context(payload,cp).exchangeStep(await runtime);}assert.equal(cp.stage,'done');assert.equal(B.result(payload,cp).quality[0].open,0);
 const failed=B.start(payload);failed.stage='exchange';failed.exchange=E.start(f.input,f.preview);failed.pendingQuality={open:1,critical:0};B.context(payload,failed).stopExchange('unavailable');assert.equal(failed.stage,'done');assert.equal(B.result(payload,failed).quality[0].open,1);assert.equal(B.result(payload,failed).quality[0].blockExchange.status,'unavailable');
});
test('an improved incomplete round rebuilds the checked incumbent and an expired budget stops further rounds',()=>{
 const f=small(),wire=B.pack(f.input),payload={version:1,months:['2027-01'],minimumInput:wire,monthInputs:[wire],metadata:{},adaptiveSearch:true,enhancedBlockSearch:true};
 const cp=B.start(payload);B.searchBudget(payload,cp);cp.stage='exchange';
 cp.exchange=E.start({...f.input,adaptiveSearch:true},f.preview);cp.exchange.status='limited';cp.exchange.initialOpen=2;cp.pendingQuality={open:1};
 B.context(payload,cp).exchangeStep(null);assert.equal(cp.stage,'exchange');assert.equal(cp.exchangeRounds,1);assert.equal(cp.pendingQuality.open,1);
 const saved=JSON.parse(JSON.stringify(cp));saved.monthDeadlineAt=Date.now()-1;
 B.context(payload,saved).limitExchange();assert.equal(saved.stage,'done');assert.equal(B.result(payload,saved).quality[0].open,1);
 assert.equal(B.result(payload,saved).quality[0].blockExchange.closed,1);
});
test('an incomplete plateau retries a different stable search seed and an explicit time limit still stops it',()=>{
 const f=small(),wire=B.pack(f.input),p={version:1,months:['2027-01'],minimumInput:wire,monthInputs:[wire],metadata:{autonomousRunId:'run-a'},adaptiveSearch:true,enhancedBlockSearch:true},cp=B.start(p);
 assert.equal(cp.adaptiveSeed,B.start(JSON.parse(JSON.stringify(p))).adaptiveSeed);
 assert.notEqual(cp.adaptiveSeed,B.start({...p,metadata:{autonomousRunId:'run-b'}}).adaptiveSeed);
 B.searchBudget(p,cp);cp.stage='exchange';cp.exchange=E.start({...f.input,adaptiveSearch:true,adaptiveSeed:cp.adaptiveSeed},f.preview);cp.exchange.status='limited';
 B.context(p,cp).exchangeStep(null);assert.equal(cp.stage,'exchange');assert.equal(cp.exchangeRounds,1);assert.equal(cp.exchange.seedOffset,cp.adaptiveSeed+104729);
 B.context(p,JSON.parse(JSON.stringify(cp))).limitExchange();
});
test('the worker can request a shorter bonus solver pass without changing planning rules',()=>{
 const f=small(),wire=B.pack(f.input),payload={version:1,months:['2027-01'],minimumInput:wire,monthInputs:[wire],metadata:{},adaptiveSearch:true,enhancedBlockSearch:true},cp=B.start(payload);
 cp.stage='exchange';cp.exchange=E.start({...f.input,adaptiveSearch:true},f.preview);let options;
 const fake={createModel(){return{options:{set(value){options=value;}},setSolution(){},run(){},info:{get:()=>0},dispose(){}};}};
 B.context(payload,cp).exchangeStep(fake,.15);assert.equal(options.time_limit,.15);
 assert.equal(cp.exchange.bestOpen,1);assert.equal(cp.exchange.pass,1);
});
test('a rechecked partial plan starts directly with repair and survives a durable checkpoint',async()=>{
 const f=small(),wire=B.pack(f.input),p={version:1,months:['2027-01'],minimumInput:wire,monthInputs:[wire],metadata:{},adaptiveSearch:true,enhancedBlockSearch:true};let cp=B.start(p);
 assert.equal(B.seedRepair(p,cp,f.preview),true);assert.equal(cp.stage,'exchange');assert.equal(cp.seededRepair,true);
 cp=JSON.parse(JSON.stringify(cp));B.context(p,cp).exchangeStep(await runtime);
 while(cp.stage==='exchange'){cp.exchange.maxPasses=1;B.context(p,cp).exchangeStep(await runtime);}
 assert.equal(B.result(p,cp).quality[0].open,0);assert.equal(B.result(p,cp).preview.length,3);
});
test('normal bounded planning automatically starts and time-limits rule-checked block repairs',async()=>{
 const f=small(),input={...f.input,solidRules:{...f.input.solidRules,exactStaffing:{TL:1}}},wire={...B.pack(input),boundedSearch:true},payload={version:1,months:['2027-01'],minimumInput:wire,monthInputs:[wire],metadata:{},boundedSearch:true,enhancedBlockSearch:true};
 const cp=B.start(payload);cp.solver=R.start({...B.unpack(wire),_checkpointKey:'month:2027-01'},1);cp.solver.phase='done';cp.solver.best=[[1,0],[2,0]];
 B.context(payload,cp).step();assert.equal(cp.stage,'exchange');assert.equal(cp.exchange.maxPasses,40);assert.equal(cp.pendingQuality.open,1);
 for(let pass=0;cp.stage==='exchange'&&pass<40;pass++)B.context(payload,cp).exchangeStep(await runtime);
 assert.equal(cp.stage,'done');assert.equal(B.result(payload,cp).quality[0].open,0);
 const limited=B.start(payload);limited.stage='exchange';limited.exchange=E.start(input,f.preview);limited.pendingQuality={open:1};B.context(payload,limited).limitExchange();assert.equal(limited.stage,'done');assert.equal(B.result(payload,limited).quality[0].open,1);assert.equal(B.result(payload,limited).quality[0].blockExchange.status,'limited');
});
function monthFixture(){
 const fixture=require('./fixtures/block-exchange-month.json'),dates=Array.from({length:31},(_,i)=>'2027-01-'+String(i+1).padStart(2,'0')),priority=fixture.crew.find(e=>e.shifts.length===1&&e.shifts[0]==='O3'),rules={...policy,criticalShifts:[{code:'OT',minimum:3,weekdays:[1,2,3,4,5,6,7]},{code:'TL',minimum:1,weekdays:[1,2,3,4,5,6,7]}],otDailyMinimumStaffing:3,teamLeaderMinimumMonthlyHours:170,teamLeaderMaxConsecutiveNightShifts:4,teamLeaderPreferredNightBlockLength:4,teamLeaderMinNightRecoveryCalendarDays:2,priorityMonthlyEmployees:[{employeeId:priority.id,code:'O3',preferredWeekdays:[1,2,3,4]}]};
 const snapshot={version:1,company:'regression',runId:'regression',fingerprint:'current',timezone:'Europe/Berlin',months:['2027-01'],policy:{standard_max_shift_hours:9,standard_min_rest_hours:11,solid_planning_rules:rules},employees:fixture.crew.map(e=>({id:e.id,employment:e.target>=162?'Vollzeit':'Teilzeit',weeklyHours:40,shifts:e.shifts,role:e.role,qualifications:['__sp:monthlyHours='+e.target,'__sp:maxWeekly=55','__sp:maxConsecutive='+(e.phase===undefined?4:3),'__sp:rhythmMode='+(e.phase===undefined?'off':'required')]})),types:Object.entries(times).map(([id,[start,end]])=>({id,start,end,active:true})),base:[],original:[],movable:[],demand:dates.flatMap(date=>Object.keys(times).map(type=>({date,type,count:{O1:4,O3:4,OT:3,TL:1}[type]}))),rhythms:[],candidates:[],wishes:[],learned:[]};
 for(const [n,date]of dates.entries())for(const e of fixture.crew){const expected=e.phase===undefined?'ALLE':(n+e.phase)%5<3?'OT':'FREI';snapshot.rhythms.push({employeeId:e.id,date,mode:e.phase===undefined?'off':'required',expected,exemptOt:false});if(expected!=='FREI')for(const type of e.shifts)snapshot.candidates.push({employeeId:e.id,date,type});}
 const payload=A.combine([A.build(snapshot)],snapshot),baseline=fixture.crew.flatMap(e=>Array.from(e.plan).flatMap((token,i)=>{const type={'1':'O1','3':'O3','O':'OT','T':'TL'}[token];return type?[{employeeId:e.id,date:dates[i],type,start:times[type][0],end:times[type][1],resource:dates[i]+'|'+type}]:[];}));return{payload,baseline,priority};
}
test('31-day regression closes the twelve remaining duties without changing fixed OT or priority O3',async()=>{
 const {payload,baseline,priority}=monthFixture(),input=B.unpack(payload.monthInputs[0]),baseKeys=new Set(input.base.map(B.rowKey)),preview=baseline.filter(a=>!baseKeys.has(B.rowKey(a)));assert.equal(A.assess(payload,{preview:baseline,quality:[]}).open,12);let cp=E.start(input,preview);const highs=await runtime;
 while(cp.status==='searching'){const c=E.context(input,cp);c.step(highs,.5);cp=JSON.parse(JSON.stringify(cp));}
 const found=E.context(input,cp).result(),output={preview:B.unique([...input.base,...found.preview]),quality:[found.quality]},audit=A.assess(payload,output);assert.equal(audit.errors,0);assert.equal(audit.open,0);assert.equal(output.preview.length,372);assert.equal(found.quality.priorityDeficit,0);assert.ok(found.quality.imbalance<64.8);assert.equal(output.preview.filter(a=>a.employeeId===priority.id).length,20);
 assert.equal(audit.canApply,true);assert.equal(found.quality.teamLeaderDeficit,0);assert.deepEqual(output.preview.filter(a=>a.type==='OT').map(B.rowKey).sort(),baseline.filter(a=>a.type==='OT').map(B.rowKey).sort());for(const date of new Set(baseline.map(a=>a.date))){assert.equal(output.preview.filter(a=>a.date===date&&a.type==='TL').length,1);assert.equal(output.preview.filter(a=>a.date===date&&a.type==='OT').length,3);}
});
test('deployed solver asset is the pinned, licensed single-threaded runtime and engine is lazy-loaded',()=>{const bytes=fs.readFileSync('assets/vendor/highs-1.15.4-f13134e3e335.wasm'),hash=crypto.createHash('sha256').update(bytes).digest('hex'),source=fs.readFileSync('supabase/functions/_shared/block-solver-runtime.ts','utf8');assert.equal(hash,'f13134e3e335e7bad984ff12abeb41e86e0eeeb1752ae8a85322cc6839df8acd');assert.ok(source.includes(hash));assert.match(source,/npm:highs@1\.15\.4/);assert.match(fs.readFileSync('assets/vendor/highs-1.15.4-LICENSE.txt','utf8'),/MIT License/);assert.doesNotMatch(fs.readFileSync('index.html','utf8'),/highs-1\.15\.4/);});
test('verified Wasm starts without a filesystem or a second network request in the server bootstrap',async()=>{const vm=require('node:vm'),sandbox=vm.createContext({console,performance,WebAssembly,module:{exports:{}},exports:{}});vm.runInContext(fs.readFileSync('node_modules/highs/build/highs.js','utf8'),sandbox);const compiled=await WebAssembly.compile(fs.readFileSync('assets/vendor/highs-1.15.4-f13134e3e335.wasm')),highs=await sandbox.module.exports({instantiateWasm(imports,receive){const instance=new WebAssembly.Instance(compiled,imports);receive(instance);return instance.exports;},print(){},printErr(){}});assert.ok(highs.memoryBytes<64*1024*1024);assert.equal(typeof highs.createModel,'function');assert.match(fs.readFileSync('supabase/functions/_shared/block-solver-runtime.ts','utf8'),/instantiateWasm\(/);});
