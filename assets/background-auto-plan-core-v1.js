// The worker and browser share the same immutable input format and planning rules.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./solid-planning-resume-v1.js'),require('./solid-planning-core-v1.js'));else root.SFBackgroundAutoPlanCore=factory(root.SFSolidPlanningResume,root.SFSolidPlanningCore)})(typeof window==='undefined'?globalThis:window,function(R,S){
 'use strict';
 const version=1;
 const rowKey=a=>[a.employeeId,a.date,a.type,a.start,a.end].join('|');
 const unique=rows=>[...new Map(rows.map(a=>[rowKey(a),a])).values()];
 const employeeKeys=['role','_dbId','id','personnelNo','employment','monthlyHours','weeklyHours','maxWeeklyHours','shifts','target','monthLimit','calendarLimit','maxMonthlyShifts','weeklyLimit','maxConsecutive','permissions'];
 const rowKeys=['id','_dbId','_dbStatus','status','publishedAt','employeeId','date','type','start','end','resource','coverageGroup','coverageLabel','optional','_marketApproved'];
 const pick=(obj,keys)=>Object.fromEntries(keys.filter(k=>obj[k]!==undefined).map(k=>[k,obj[k]]));
 function pack(input){
  const employees=input.employees.map(e=>({...pick(e,employeeKeys),qualifications:(e.qualifications||[]).filter(q=>/^__sp:(monthlyHours|maxWeekly|maxConsecutive)=/.test(q))}));
  const candidates=[],index=new Map(),reference=a=>{const key=rowKey(a);if(!index.has(key)){index.set(key,candidates.length);candidates.push(pick(a,rowKeys));}return index.get(key);};
  const groups=input.groups.map(g=>({id:g.id,employeeId:g.employee.id,block:!!g.block,options:g.options.map(o=>o.map(reference))}));
  return {version,month:input.month,employees,candidates,base:input.base.map(a=>pick(a,rowKeys)),preferenceBase:(input.preferenceBase||input.base).map(a=>pick(a,rowKeys)),reserved:(input.reserved||[]).map(a=>pick(a,rowKeys)),groups,capacities:input.capacities,criticalCapacities:input.criticalCapacities||[],seedBlocks:(input.seedBlocks||[]).map(b=>({id:b.id,rows:b.rows.map(a=>pick(a,rowKeys))})),wishes:input.wishes||[],respectHours:true,solidRules:input.solidRules,criticalPeriod:!!input.criticalPeriod,criticalOnly:!!input.criticalOnly};
 }
 function unpack(input){const people=new Map(input.employees.map(e=>[String(e.id),e]));return {...input,groups:input.groups.map(g=>({...g,employee:people.get(String(g.employeeId)),options:g.options.map(o=>o.map(i=>input.candidates[i]))}))};}
 function withServerWishes(payload,wishes){
  if(wishes==null)return payload; // Older stored jobs already contain their confirmed wishes.
  if(!Array.isArray(wishes))throw Error('Ungültige gespeicherte Wunschplanung.');
  return {...payload,minimumInput:{...payload.minimumInput,wishes},monthInputs:payload.monthInputs.map(input=>({...input,wishes}))};
 }
 function compactPayload(payload){
  const compact=input=>{const first=input.month.slice(0,7)+'-01',from=new Date(Date.UTC(+first.slice(0,4),+first.slice(5,7)-4,1)).toISOString().slice(0,10),zone=input.solidRules.timezone||'Europe/Berlin',begin=S.instant(from,'00:00',zone),end=S.instant(first,'00:00',zone);
   const preferenceBase=(input.preferenceBase||input.base).filter(a=>{if(!(a.status==='PUBLISHED'||a._dbStatus==='PUBLISHED')||!(a.publishedAt||a.published_at))return false;const d=S.duty(a,input.solidRules);return d.startMs<end&&d.endMs>begin;});
   return {...input,base:R.planningBase(input),preferenceBase};};
  return {...payload,minimumInput:compact(payload.minimumInput),monthInputs:payload.monthInputs.map(compact)};
 }
 function check(payload){
  if(payload?.version!==version||!Array.isArray(payload.months)||payload.months.length<1||payload.months.length>12||!Array.isArray(payload.monthInputs)||payload.monthInputs.length!==payload.months.length)throw Error('Ungültiger Planungsauftrag.');
  if(!payload.minimumInput?.solidRules?.enabled)throw Error('Die Hintergrundplanung benötigt die aktiven Planungsregeln.');
  for(const [i,month] of payload.months.entries()){if(!/^\d{4}-\d{2}$/.test(month)||month!==S.plus(new Date(Date.UTC(+payload.months[0].slice(0,4),+payload.months[0].slice(5,7)-1+i,1)).toISOString().slice(0,10),0).slice(0,7)||payload.monthInputs[i].month!==month)throw Error('Die Planungsmonate passen nicht zusammen.');}
  for(const input of [payload.minimumInput,...payload.monthInputs]){if(!Array.isArray(input.employees)||input.employees.length>300||!Array.isArray(input.groups)||input.groups.length>12000||!Array.isArray(input.candidates)||input.candidates.length>40000||!Array.isArray(input.capacities)||input.capacities.length>12000)throw Error('Der Planungsauftrag ist zu groß. Bitte einen kürzeren Zeitraum wählen.');const ids=new Set(input.employees.map(e=>String(e.id)));if(input.groups.some(g=>!ids.has(String(g.employeeId))||!Array.isArray(g.options)||g.options.length>128||g.options.some(o=>!Array.isArray(o)||o.length>6||o.some(i=>!Number.isInteger(i)||i<0||i>=input.candidates.length))))throw Error('Ungültige Mitarbeiter oder Schichtoptionen.');}
  return true;
 }
 function start(payload){check(payload);return {version,stage:'minimum',monthIndex:0,solver:null,minimum:[],proposed:[],quality:[],steps:0};}
 function materialize(payload,cp){
  if(cp.stage==='minimum'){
   const input=unpack(payload.minimumInput),critical=new Set(input.criticalCapacities.map(([key])=>key));
   input.groups=input.groups.map(g=>({...g,options:g.options.filter(o=>o.length===1&&critical.has(o[0].resource))})).filter(g=>g.options.length);
   return {...input,criticalOnly:true,_checkpointKey:'minimum'};
  }
  const source=unpack(payload.monthInputs[cp.monthIndex]),month=payload.months[cp.monthIndex],minimum=cp.minimum.filter(a=>a.date.slice(0,7)>=month),baseKeys=new Set(source.base.map(rowKey)),extra=unique([...cp.proposed,...minimum]).filter(a=>!baseKeys.has(rowKey(a))),capacities=new Map(source.capacities);
  for(const a of extra.filter(a=>a.date.startsWith(month)))capacities.set(a.resource,Math.max(0,(capacities.get(a.resource)||0)-1));
  const base=unique([...source.base,...extra]),criticalCapacities=source.criticalCapacities.map(([key,n])=>[key,Math.max(0,n-extra.filter(a=>a.resource===key).length)]);
  return {...source,base,capacities:[...capacities],criticalCapacities,_checkpointKey:'month:'+month};
 }
 function context(payload,cp){
  if(cp.version!==version)throw Error('Der gespeicherte Auftrag verwendet eine andere Version. Bitte neu starten.');
  if(cp.stage==='done')return {step:()=>false,progress:()=>progress(payload,cp),result:()=>result(payload,cp)};
  const input=materialize(payload,cp);cp.solver=cp.solver||R.start(input,12);let runner=R.context(input,cp.solver);
  function step(){
   if(cp.stage==='done')return false;
   runner.step();cp.steps++;
   if(cp.solver.phase==='done'){
    const found=runner.result();
    if(cp.stage==='minimum'){cp.minimum=unique([...(payload.minimumInput.reserved||[]),...found.preview]);cp.stage='month';}
    else{const month=payload.months[cp.monthIndex];cp.proposed=unique([...cp.proposed,...cp.minimum.filter(a=>a.date.startsWith(month)),...(payload.monthInputs[cp.monthIndex].reserved||[]),...found.preview]);cp.quality.push(found.quality);if(++cp.monthIndex===payload.months.length){cp.stage='done';cp.solver=null;return true;}}
    cp.solver=null;return false; // Rebuild only at the next invocation, with the new immutable stage input.
   }return true;
  }
  return {step,progress:()=>progress(payload,cp),result:()=>result(payload,cp)};
 }
 function progress(payload,cp){
  if(cp.stage==='done')return {percent:100,label:'Planung abgeschlossen',detail:'Die Vorschläge sind zur Prüfung bereit.'};
  if(cp.stage==='minimum'){const total=cp.solver?.components?.reduce((n,c)=>n+c.keys.length,0)||1,done=cp.solver?.components?.slice(0,cp.solver.component).reduce((n,c)=>n+c.keys.length,0)+(cp.solver?.key||0);return {percent:Math.min(15,Math.floor((done||0)/total*15)),label:'Pflichtbesetzung verteilen',detail:'OT2 und Leitung · '+(done||0)+'/'+total+' Pflichtpositionen geprüft'};}
  const fraction=(cp.solver?.iteration||0)/12;
  return {percent:Math.min(99,15+Math.floor((cp.monthIndex+fraction)/payload.months.length*84)),label:'Monat '+(cp.monthIndex+1)+' von '+payload.months.length+' planen',detail:payload.months[cp.monthIndex]+' · '+(cp.solver?.iteration||0)+'/12 Verteilungen geprüft'+(cp.solver?.phase==='fill'?' · '+cp.solver.cursor+'/'+cp.solver.order.length+' Schichtpositionen':'' )};
 }
 function result(payload,cp){if(cp.stage!=='done')throw Error('Der Auftrag ist noch nicht abgeschlossen.');return {version,preview:cp.proposed,quality:cp.quality,months:payload.months,metadata:payload.metadata};}
 return {version,pack,unpack,withServerWishes,compactPayload,check,start,context,progress,result,unique,rowKey};
});
