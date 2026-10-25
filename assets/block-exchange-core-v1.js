// Durable whole-month neighbourhood search over already approved work blocks.
// The solver may explore alternatives; only independently checked improvements
// replace the incumbent. Published/base duties never become decision variables.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./month-optimizer-core-v1.js'),require('./solid-planning-core-v1.js'),require('./wish-planning-core-v1.js'));else root.SFBlockExchangeCore=factory(root.SFMonthOptimizerCore,root.SFSolidPlanningCore,root.SFWishCore)})(typeof window==='undefined'?globalThis:window,function(M,S,W){
'use strict';
const C=M.checkpointPrimitives,H=3600000,D=86400000,key=a=>[a.employeeId,a.date,a.type,a.start,a.end].join('|'),signature=rows=>rows.map(key).sort().join(';'),day=date=>Math.floor(Date.parse(date+'T12:00:00Z')/D),gcd=(a,b)=>b?gcd(b,a%b):a;
const copyRows=rows=>rows.map(a=>Object.fromEntries(['id','_dbId','employeeId','date','type','start','end','resource','blockId','rhythmOverride'].filter(k=>a[k]!==undefined).map(k=>[k,a[k]])));
function prepared(input,fixed=[]){
 const wishes=W.optimizer(input.wishes||[],input.employees,input.preferenceBase||input.base,input.month,input.timezone||input.solidRules.timezone,input.learned||[],input.historyMonths??3,input.solidRules),capacity=new Map(input.capacities),critical=new Map(input.criticalCapacities||[]);
 // A reserved duty can be present in both input.base and the visible preview.
 // Keep it in the returned preview, but count it only once in capacity and
 // employee checks when the repair search freezes that employee.
 const baseKeys=new Set(input.base.map(key)),additional=fixed.filter(a=>!baseKeys.has(key(a)));
 for(const a of additional){capacity.set(a.resource,(capacity.get(a.resource)||0)-1);if(critical.has(a.resource))critical.set(a.resource,Math.max(0,critical.get(a.resource)-1));}
 return M.prepare({...input,...wishes,base:[...input.base,...additional],capacities:[...capacity],criticalCapacities:[...critical]});
}
function excludedPeople(p){const ids=new Set();for(const e of p.people.values())if(C.priorityRule(e,p)||!p.groups.some(g=>String(g.employee.id)===String(e.id)))ids.add(String(e.id));return ids;}
function columns(p,excluded){const out=[],seen=new Set(),base=M.state(p);p.groups.forEach((group,gi)=>{if(excluded.has(String(group.employee.id)))return;group.options.forEach((option,oi)=>{const rows=option.slice().sort((a,b)=>a.date.localeCompare(b.date)),sig=signature(rows);if(seen.has(sig)||!rows.length||rows.some((a,i)=>(p.capacity.get(a.resource)||0)<1||!a.date.startsWith(p.month)||i&&(a.date!==S.plus(rows[i-1].date,1)||a.startMs<rows[i-1].endMs+Math.max(11,Number(p.minRestHours)||11)*H-1))||p.accept&&!p.accept(group.employee,[],option)||base.people.get(String(group.employee.id)).duties.length&&!M.feasible(p,base,group,option))return;seen.add(sig);out.push({group,option,rows,ref:[gi,oi],sig});});});return out;}
function recoveryEnd(rows,e,p,minStart){
 const rules=S.employeeRules(e,p.solidRules),own=new Map(p.base.filter(a=>String(a.employeeId)===String(e.id)).map(a=>[a.date,a]));for(const a of rows)own.set(a.date,a);
 const block=rows.slice();while(own.has(S.plus(block[0].date,-1)))block.unshift(own.get(S.plus(block[0].date,-1)));while(own.has(S.plus(block.at(-1).date,1)))block.push(own.get(S.plus(block.at(-1).date,1)));
 const end=block.at(-1),nightSuffix=block.slice().reverse().findIndex(a=>!S.night(a)),nights=nightSuffix<0?block.length:nightSuffix,short=block.length===3&&block.every(S.night)&&rules.threeNightBlockRecoveryFullCalendarDays!=null,free=short?Math.min(rules.minFreeCalendarDays??2,Number(rules.threeNightBlockRecoveryFullCalendarDays)):rules.minFreeCalendarDays??2,nightFree=nights?(nights===3&&rules.threeNightBlockRecoveryFullCalendarDays!=null?Math.min(rules.minNightRecoveryCalendarDays??2,Number(rules.threeNightBlockRecoveryFullCalendarDays)):rules.minNightRecoveryCalendarDays??2):0;
 let until=day(S.localDate(end.endMs-1,rules))+Math.max(free,nightFree);const rest=end.endMs+Math.max(11,Number(rules.minBlockRestHours)||48)*H,after=d=>new Date(d*D).toISOString().slice(0,10);
 while(S.instant(after(until+1),String(Math.floor(minStart/60)).padStart(2,'0')+':'+String(minStart%60).padStart(2,'0'),rules.timezone)<rest-1)until++;return until;
}
function canonical(rows){const groups=new Map();for(const a of rows){const id=String(a.employeeId),list=groups.get(id)||[];list.push(a);groups.set(id,list);}const blocks=[];for(const list of groups.values()){let block;for(const a of list.sort((a,b)=>a.date.localeCompare(b.date))){if(!block||a.date!==S.plus(block.at(-1).date,1)){block=[];blocks.push(block);}block.push(a);}}return blocks;}
function peerPairs(p){const buckets=new Map(),pairs=[];for(const e of p.people.values()){const k=JSON.stringify([e.target,[...new Set(e.shifts||[])].sort()]),list=buckets.get(k)||[];list.push(String(e.id));buckets.set(k,list);}for(const list of buckets.values())for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++)pairs.push([list[i],list[j]]);return pairs;}
function peerQuality(p,s){const limit=Math.max(0,...p.base.map(a=>a.hours||0),...s.records.flatMap(r=>r.option.map(a=>a.hours))),gaps=peerPairs(p).map(([a,b])=>Math.abs(s.people.get(a).hours-s.people.get(b).hours));return{peerSpread:Math.max(0,...gaps),peerExcess:gaps.reduce((n,g)=>n+Math.max(0,g-limit),0)};}
function better(a,b){for(const k of ['leaderOpen','critical','priorityDeficit','open','peerExcess','teamLeaderDeficit','imbalance','priorityPenalty','penalty','deficit']){const x=Number(a[k])||0,y=Number(b[k])||0;if(x<y-1e-6)return true;if(x>y+1e-6)return false;}return false;}
function start(input,preview){
 const cp={version:1,pass:0,best:[],working:[],fixed:[],original:copyRows(preview),lastImprovement:0,initialOpen:0,improvements:0,maxPasses:128,status:'searching'};
 if(!S.confirmed(input.solidRules)||(input.solidRules.conditionalStaffing||[]).length||input.capacities.some(([k])=>k.endsWith('|OT-DAY'))||input.groups.reduce((n,g)=>n+g.options.length,0)>12000||input.capacities.length>200){cp.status='unsupported';return cp;}
 const p=prepared(input),excluded=excludedPeople(p);
 let cols=columns(p,excluded),by=new Map(cols.map((c,i)=>[c.sig,i]));
 for(const block of canonical(preview.filter(a=>!excluded.has(String(a.employeeId)))))if(!by.has(signature(block)))excluded.add(String(block[0].employeeId));
 // Fixed duties can join two proposed fragments into one block. If the
 // conservative interval model cannot represent that incumbent, keep that
 // employee fixed instead of discarding their already valid schedule.
 for(const e of p.people.values())if(!excluded.has(String(e.id))){const blocks=canonical(preview.filter(a=>String(a.employeeId)===String(e.id))).map(b=>cols[by.get(signature(b))]).filter(Boolean),minStart=Math.min(...blocks.flatMap(c=>c.rows.map(a=>Number(a.start.slice(0,2))*60+Number(a.start.slice(3,5)))));for(let i=1;i<blocks.length;i++)if(blocks[i].rows[0].day<=recoveryEnd(blocks[i-1].rows,e,p,minStart))excluded.add(String(e.id));}
 cp.excluded=[...excluded].sort();cp.fixed=copyRows(preview.filter(a=>excluded.has(String(a.employeeId))));
 const q=prepared(input,cp.fixed);cols=columns(q,excluded);by=new Map(cols.map((c,i)=>[c.sig,i]));
 for(const block of canonical(preview.filter(a=>!excluded.has(String(a.employeeId))))){const index=by.get(signature(block));if(index===undefined){cp.status='unsupported';return cp;}cp.best.push(index);}
 cp.working=cp.best.slice();cp.initialOpen=C.solidQuality(q,M.state(q,cp.best.map(i=>cols[i]))).open;
 if(!cols.length||cols.length>10000||new Set(cols.map(c=>String(c.group.employee.id))).size>24)cp.status='unsupported';
 return cp;
}
function context(input,cp){
 if(cp.version!==1)throw Error('Unbekannter Blocktausch-Zwischenstand.');
 if(cp.status==='unsupported')return{step:()=>false,result:()=>({preview:cp.original,quality:null})};
 const p=prepared(input,cp.fixed),excluded=new Set(cp.excluded||excludedPeople(p)),cols=columns(p,excluded),state=indices=>M.state(p,indices.map(i=>cols[i])),score=indices=>{const s=state(indices);return{...C.solidQuality(p,s),...peerQuality(p,s)};};
 const initial=()=>({preview:cp.fixed.concat(cp.best.flatMap(i=>cols[i].option.map(a=>({...a,blockId:cols[i].group.id})))),quality:{...score(cp.best),searchLimited:cp.status!=='optimal',blockExchange:{passes:cp.pass,improvements:cp.improvements,closed:Math.max(0,cp.initialOpen-score(cp.best).open),status:cp.status}}});
 if(cp.status!=='searching')return{result:initial,step:()=>false};
 const crew=[...p.people.values()].filter(e=>cols.some(c=>String(c.group.employee.id)===String(e.id))),N=cols.length,monthStart=S.instant(p.month+'-01','00:00',p.solidRules.timezone),next=new Date(p.month+'-01T12:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);const monthEnd=S.instant(next.toISOString().slice(0,10),'00:00',p.solidRules.timezone);
 const baseState=M.state(p),minutes=cols.flatMap(c=>c.option.map(a=>Math.round(a.hours*60))),quantum=minutes.reduce((n,h)=>gcd(n,h),0)/60;
 if(!(quantum>0)||crew.reduce((n,e)=>n+Math.floor(e.monthLimit/quantum),0)>6000){cp.status='unsupported';return{result:initial,step:()=>false};}
 const cost=[],lo=[],hi=[],integer=[],starts=[0],indices=[],values=[],rowLo=[],rowHi=[],entries=[];
 const variable=(c,upper=1)=>{const i=cost.length;cost.push(c);lo.push(0);hi.push(upper);integer.push(1);entries.push([]);return i;};
 const constraint=(terms,lower=-1e30,upper=1e30)=>{const r=rowLo.length;rowLo.push(lower);rowHi.push(upper);for(const [i,v]of terms)if(v)entries[i].push([r,v]);return r;};
 cols.forEach(()=>variable(0.01));
 const resources=[...p.capacity].filter(([,n])=>n>0).sort(([a],[b])=>a.localeCompare(b)),slacks=[];
 const bestState=state(cp.best);
 for(const [resource,need]of resources){const critical=p.criticalCapacity.get(resource)||0,slack=variable(1e6,need),criticalIndex=critical?variable(resource.endsWith('|TL')?1e10:1e9,C.criticalOpen(p,bestState,resource)):null;slacks.push({resource,index:slack,need,criticalIndex});const terms=cols.flatMap((c,i)=>{const n=c.option.filter(a=>a.resource===resource).length;return n?[[i,n]]:[];});constraint([...terms,[slack,1]],need,need);if(critical)constraint([...terms,[criticalIndex,1]],critical,1e30);}
 const levels=[],peerSlacks=[];
 for(const e of crew){
  const own=cols.flatMap((c,i)=>String(c.group.employee.id)===String(e.id)?[i]:[]),base=baseState.people.get(String(e.id)),rules=S.employeeRules(e,p.solidRules),first=Math.min(...own.map(i=>cols[i].rows[0].day)),last=Math.max(...own.map(i=>cols[i].rows.at(-1).day))+10,minStart=Math.min(...own.flatMap(i=>cols[i].rows.map(a=>Number(a.start.slice(0,2))*60+Number(a.start.slice(3,5)))));
  const intervals=new Map(own.map(i=>[i,[cols[i].rows[0].day,recoveryEnd(cols[i].rows,e,p,minStart)]]));
  for(let d=first;d<=last;d++)constraint(own.filter(i=>intervals.get(i)[0]<=d&&intervals.get(i)[1]>=d).map(i=>[i,1]),0,1);
  const countLimit=Math.max(0,Math.floor((e.monthLimit-base.hours+1e-6)/quantum)),level=[];
  for(let k=1;k<=countLimit;k++){const before=base.hours+(k-1)*quantum,after=before+quantum,leaderTarget=C.teamLeaderTarget(e,p),leader=Math.max(0,leaderTarget-before)-Math.max(0,leaderTarget-after);level.push(variable(M.hoursCost(after,e.target)-M.hoursCost(before,e.target)-leader*100));}
  levels.push({id:String(e.id),indices:level,baseHours:base.hours});constraint(own.map(i=>[i,cols[i].option.hours/quantum]).concat(level.map(i=>[i,-1])),0,0);
  if(Number.isFinite(e.maxMonthlyShifts))constraint(own.map(i=>[i,cols[i].option.length]),0,Math.max(0,e.maxMonthlyShifts-base.monthDuties));
  if(Number.isFinite(e.calendarLimit)){const baseHours=base.duties.reduce((n,a)=>n+Math.max(0,Math.min(a.endMs,monthEnd)-Math.max(a.startMs,monthStart))/H,0);constraint(own.map(i=>[i,cols[i].option.reduce((n,a)=>n+Math.max(0,Math.min(a.endMs,monthEnd)-Math.max(a.startMs,monthStart))/H,0)]),0,Math.max(0,e.calendarLimit-baseHours));}
  const weeks=new Set(own.flatMap(i=>cols[i].rows.flatMap(a=>[S.weekKey(a.date),S.weekKey(S.localDate(a.endMs-1,rules))])));
  for(const week of weeks){const begin=S.instant(week,'00:00',rules.timezone),end=S.instant(S.plus(week,7),'00:00',rules.timezone),clip=a=>Math.max(0,Math.min(a.endMs,end)-Math.max(a.startMs,begin))/H,used=base.duties.reduce((n,a)=>n+clip(a),0);constraint(own.map(i=>[i,cols[i].option.reduce((n,a)=>n+clip(a),0)]),0,Math.max(0,S.weeklyLimit(e,rules)-used));}
 }
 const shiftLimit=Math.max(0,...p.base.map(a=>a.hours||0),...cols.flatMap(c=>c.rows.map(a=>a.hours)));
 for(const [a,b]of peerPairs(p)){const delta=baseState.people.get(a).hours-baseState.people.get(b).hours,z=variable(1000,Math.ceil(Math.max(p.people.get(a).monthLimit,p.people.get(b).monthLimit))+1),terms=cols.flatMap((c,i)=>{const id=String(c.group.employee.id);return id===a?[[i,c.option.hours]]:id===b?[[i,-c.option.hours]]:[];});peerSlacks.push({a,b,index:z});constraint([...terms,[z,-1]],-1e30,shiftLimit-delta);constraint([...terms.map(([i,v])=>[i,-v]),[z,-1]],-1e30,shiftLimit+delta);}
 for(const terms of entries){for(const [r,v]of terms){indices.push(r);values.push(v);}starts.push(indices.length);}
 const model={numCols:cost.length,numRows:rowLo.length,sense:1,colCost:cost,colLower:lo,colUpper:hi,rowLower:rowLo,rowUpper:rowHi,integrality:integer,matrix:{format:'csc',numCols:cost.length,numRows:rowLo.length,starts,indices,values}};
 function vector(selected){const x=cost.map(()=>0);selected.forEach(i=>x[i]=1);const s=state(selected);for(const a of slacks){x[a.index]=Math.max(0,s.remaining.get(a.resource)||0);if(a.criticalIndex!==null)x[a.criticalIndex]=C.criticalOpen(p,s,a.resource);}for(const a of levels){const units=Math.round((s.people.get(a.id).hours-a.baseHours)/quantum);for(let n=0;n<a.indices.length;n++)x[a.indices[n]]=Number(n<units);}for(const a of peerSlacks)x[a.index]=Math.ceil(Math.max(0,Math.abs(s.people.get(a.a).hours-s.people.get(a.b).hours)-shiftLimit)-1e-6);return x;}
 function valid(selected){
  if(selected.some(i=>!Number.isInteger(i)||i<0||i>=N)||new Set(selected).size!==selected.length)return false;
  const records=selected.map(i=>cols[i]),all=[...p.base,...records.flatMap(r=>r.option)];
  for(const e of p.people.values())if(S.errors(e,all,p.solidRules,all.filter(a=>String(a.employeeId)===String(e.id)).map(a=>a.date)).length)return false;
  // As in the independent server audit: full-block recovery is checked above;
  // incremental checks repeat caps, candidates, configured rest and permissions.
  const audit={...p,solidRules:{...p.solidRules,enabled:false},respectHours:!S.confirmed(p.solidRules)},s=M.state({...audit,solidRules:p.solidRules});
  for(const r of records){if(!M.feasible(audit,s,r.group,r.option))return false;C.commit(s,r,p.month);}
  return [...s.remaining.values()].every(n=>n>=0);
 }
 function step(highs,seconds=.5){
  if(cp.status!=='searching')return false;
  let seed=7919*cp.pass+71;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},pool=crew.slice();for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  const workingState=state(cp.working),workingQuality=C.solidQuality(p,workingState);
  // Once coverage is complete, reserve a place in the neighbourhood for an
  // under-target leader and a qualified replacement instead of relying on luck.
  if(workingQuality.open===0&&peerQuality(p,workingState).peerExcess>1e-6&&cp.pass%2===0){const worst=peerPairs(p).sort(([a,b],[c,d])=>Math.abs(workingState.people.get(c).hours-workingState.people.get(d).hours)-Math.abs(workingState.people.get(a).hours-workingState.people.get(b).hours))[0];if(worst)for(const id of worst.slice().reverse()){const at=pool.findIndex(e=>String(e.id)===id);if(at>=0)pool.unshift(...pool.splice(at,1));}}
  else if(workingQuality.open===0&&workingQuality.teamLeaderDeficit>1e-6&&cp.pass%2===0){
   const leaders=pool.filter(e=>C.teamLeaderTarget(e,p)>0),under=leaders.slice().sort((a,b)=>(C.teamLeaderTarget(b,p)-workingState.people.get(String(b.id)).hours)-(C.teamLeaderTarget(a,p)-workingState.people.get(String(a.id)).hours))[0],other=leaders.find(e=>e!==under);
   const preferred=[under,other].filter(Boolean);for(let i=preferred.length-1;i>=0;i--){const at=pool.indexOf(preferred[i]);pool.splice(at,1);pool.unshift(preferred[i]);}
  }
  const chosen=new Set(pool.slice(0,Math.min(pool.length,4+cp.pass%5)).map(e=>String(e.id))),x=vector(cp.working),lower=lo.slice(),upper=hi.slice();
  for(let i=0;i<N;i++)if(!chosen.has(String(cols[i].group.employee.id)))lower[i]=upper[i]=x[i];for(const a of levels)if(!chosen.has(a.id))for(const i of a.indices)lower[i]=upper[i]=x[i];
  let solver;try{solver=highs.createModel({...model,colLower:lower,colUpper:upper});solver.options.set({output_flag:false,presolve:'on',time_limit:Math.max(.05,Math.min(.5,seconds)),mip_rel_gap:0,random_seed:cp.pass});solver.setSolution({colValue:x});solver.run();
   if(solver.info.get('primal_solution_status')===2){const y=Array.from(solver.getSolution().colValue),selected=y.slice(0,N).flatMap((v,i)=>v>.5?[i]:[]),obj=v=>v.reduce((n,x,i)=>n+x*cost[i],0);
    if(y.every((v,i)=>!integer[i]||Math.abs(v-Math.round(v))<1e-5)&&obj(y)<=obj(x)+1e-5&&valid(selected)){cp.working=selected;const q=score(selected),before=score(cp.best);if(better(q,before)){cp.best=selected.slice();cp.lastImprovement=cp.pass;cp.improvements++;}}
   }
  }finally{solver?.dispose();}
  cp.pass++;const best=score(cp.best),allTargets=best.priorityDeficit===0&&best.teamLeaderDeficit<1e-6&&best.peerExcess<1e-6;if(cp.pass>=cp.maxPasses||best.open===0&&best.critical===0&&cp.pass-cp.lastImprovement>=(allTargets?12:48))cp.status=cp.pass>=cp.maxPasses?'limited':'complete';return true;
 }
 return{step,result:initial,model,columns:cols.length};
}
return{start,context};
});
