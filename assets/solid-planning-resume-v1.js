// Serializable planning steps. All candidates and policy belong to one immutable job snapshot.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./month-optimizer-core-v1.js'),require('./solid-planning-core-v1.js'),require('./wish-planning-core-v1.js'));else root.SFSolidPlanningResume=factory(root.SFMonthOptimizerCore,root.SFSolidPlanningCore,root.SFWishCore)})(typeof window==='undefined'?globalThis:window,function(core,S,W){
'use strict';
const C={...core,...core.checkpointPrimitives};
function planningBase(input){
 const months=[input.month,...input.capacities.map(([key])=>key.slice(0,7))].filter(m=>/^\d{4}-\d{2}$/.test(m)).sort();
 if(!months.length)return input.base;
 const margin=Math.max(8,...input.employees.map(e=>Number(e.maxConsecutive)||0))+1,first=S.plus(months[0]+'-01',-margin),end=new Date(months.at(-1)+'-01T12:00:00Z');end.setUTCMonth(end.getUTCMonth()+1);const last=S.plus(end.toISOString().slice(0,10),margin);
 return input.base.filter(a=>a.date>=first&&a.date<last);
}
function start(input,iterations=12){return {version:1,inputKey:input._checkpointKey||input.month,phase:'critical',iterations,iteration:0,rng:input.searchSeed||20270101,component:0,key:0,minimum:[],beam:[{records:[],missing:0}],best:null,quality:null};}
function context(input,cp){
  if(cp.version!==1||(input._checkpointKey||input.month)!==cp.inputKey)throw Error('Checkpoint does not match input snapshot');
  input={...input,...(W?.optimizer?W.optimizer(input.wishes||[],input.employees,input.preferenceBase||input.base,input.month,input.solidRules.timezone,input.learned||[],input.historyMonths??3,input.solidRules):{})};
  if(input.employees.some(e=>e.balanceCarry)){const cap=Math.max(0,...input.groups.flatMap(g=>g.options.flatMap(o=>o.map(a=>S.duty(a,input.solidRules).hours))))/2;input.hourCarry={...input.hourCarry};for(const e of input.employees)input.hourCarry[String(e.id)]=Math.max(-cap,Math.min(cap,(input.hourCarry[String(e.id)]||0)+(e.balanceCarry||0)));}
  // History remains available to fairness; conflict checks need the planned months
  // and adjacent recovery days, including duties carried across month boundaries.
  input={...input,base:planningBase(input)};
  const p=C.prepare(input),byResource=new Map(),refMap=new WeakMap();let fillState=null;
  p.groups.forEach((group,gi)=>group.options.forEach((option,oi)=>{const r={group,option},ref=[gi,oi];refMap.set(option,ref);for(const key of new Set(option.map(a=>a.resource))){const list=byResource.get(key)||[];list.push(r);byResource.set(key,list)}}));
  const encode=records=>records.map(r=>refMap.get(r.option));
  const decode=records=>records.map(([gi,oi])=>({group:p.groups[gi],option:p.groups[gi].options[oi]}));
  if(cp.best&&cp.quality?.imbalance==null)cp.quality=C.solidQuality(p,C.state(p,decode(cp.best)));
  function allowed(s,r){if(!C.feasible(p,s,r.group,r.option))return false;const all=[...p.base,...s.records.flatMap(x=>x.option),...r.option];for(const a of r.option){const need=(p.required||((d,c,r)=>S.required(d,c,r,p.solidRules)))(a.date,a.type,all);if(need!==null&&all.filter(b=>b.date===a.date&&b.type===a.type).length>need)return false}for(const rule of p.solidRules.conditionalStaffing||[])for(const a of r.option.filter(a=>a.type===rule.sourceShift)){const date=S.plus(a.date,-rule.sourceDayOffset),count=all.filter(b=>b.date===date&&b.type===rule.shift).length;if(count>(p.required||((d,c,r)=>S.required(d,c,r,p.solidRules)))(date,rule.shift,all))return false}return true;}
  function seeded(records){const s=C.state(p);for(const r of decode(records))if(!s.used.has(r.group.id)&&!r.option.some(a=>a.resource.endsWith('|OT-DAY'))&&allowed(s,r))C.commit(s,r,p.month);return s;}
  const random=()=>{cp.rng=(Math.imul(1664525,cp.rng)+1013904223)>>>0;return cp.rng/4294967296;};
  function components(){const result=[];for(const [key,n]of p.criticalCapacity){if(n<=0||key.endsWith('|OT-DAY'))continue;const ids=p.potential.get(key)||new Set(),matches=result.filter(c=>[...ids].some(id=>c.ids.has(id)));let c=matches.shift();if(!c){c={keys:[],ids:new Set()};result.push(c)}for(const other of matches){c.keys.push(...other.keys);for(const id of other.ids)c.ids.add(id);result.splice(result.indexOf(other),1)}c.keys.push(key);for(const id of ids)c.ids.add(id);}return result.map(c=>({keys:c.keys.sort(),ids:[...c.ids].sort()}));}
  if(!cp.components)cp.components=components();
  function step(){
    if(cp.phase==='done')return false;
    if(cp.phase==='critical'){
      const component=cp.components[cp.component];
      if(!component){if(input.criticalOnly){const s=seeded(cp.minimum);cp.best=encode(s.records);cp.quality=C.solidQuality(p,s);cp.phase='done'}else cp.phase='iteration-start';return true;}
      const key=component.keys[cp.key],candidates=[],seen=new Set();
      for(const r of byResource.get(key)||[]){if(r.option.length!==1&&!r.group.fullWorkRest)continue;const a=r.option[0],id=String(a.employeeId)+'|'+a.start+'|'+a.end;if(seen.has(id))continue;seen.add(id);candidates.push(r)}
      if(p.preferenceScore)candidates.sort((a,b)=>p.preferenceScore(b.group.employee,[],b.option)-p.preferenceScore(a.group.employee,[],a.option));
      const work=cp.criticalWork||(cp.criticalWork={index:0,pool:[]}),next=[],date=key.split('|')[0],day=Math.floor(Date.parse(date+'T12:00:00Z')/86400000);
      const fragment=(s,id)=>{const x=s.people.get(id),month=x.months.get(date.slice(0,7))||{hours:0,count:0};return id+':'+month.hours+':'+month.count+':'+x.duties.filter(a=>a.day>=day-8&&a.day<=day).map(a=>a.date+a.type).sort().join(',')};
      const batch=cp.beam.slice(work.index,work.index+2);for(const b of batch){const s=C.state(p,decode(b.records)),need=C.criticalOpen(p,s,key);
        const baseline=component.ids.map(id=>fragment(s,id)),touched=new Set(),signature=()=>component.ids.map((id,i)=>touched.has(id)?fragment(s,id):baseline[i]).join(';');
        function choose(s,at,left){if(!left||at===candidates.length){next.push({records:encode(s.records),missing:b.missing+left,signature:signature()});return}for(let i=at;i<candidates.length;i++){const r=candidates[i];if(s.used.has(r.group.id)||!allowed(s,r))continue;const ids=[...new Set(r.option.map(a=>String(a.employeeId)))],added=ids.filter(id=>!touched.has(id));for(const id of added)touched.add(id);let undo;try{undo=C.commitReversible(p,s,r,p.month);choose(s,i+1,left-1)}finally{undo?.();for(const id of added)touched.delete(id)}}next.push({records:encode(s.records),missing:b.missing+left,signature:signature()});}
        choose(s,0,need);
      }
      const unique=new Map(work.pool.map(b=>[b.signature,b]));
      for(const b of next){const previous=unique.get(b.signature);if(!previous||b.missing<previous.missing)unique.set(b.signature,b);}
      // Sorting compares the same partial plan many times. Persist its scores
      // with the checkpoint so resumed batches do not score it again.
      const leaderPenalty=b=>b.teamLeaderBlockPenalty??=C.teamLeaderBlockPenalty(p,decode(b.records));
      const wishPenalty=b=>b.preferencePenalty??=(p.preferencePenalty?.([...p.base,...decode(b.records).flatMap(r=>r.option)])||0);
      work.pool=[...unique.values()].sort((a,b)=>a.missing-b.missing||leaderPenalty(a)-leaderPenalty(b)||wishPenalty(a)-wishPenalty(b)||a.records.length-b.records.length).slice(0,p.criticalBeamWidth||96);
      work.index+=batch.length;if(work.index<cp.beam.length)return true;
      cp.beam=work.pool.map(({signature,...b})=>b);delete cp.criticalWork;
      if(++cp.key===component.keys.length){if(p.solidRules.teamLeaderMinimumMonthlyHours!=null&&cp.components.length===1)cp.minimumVariants=cp.beam.slice(0,12).map(b=>b.records);cp.minimum.push(...cp.beam[0].records);cp.component++;cp.key=0;cp.beam=[{records:[],missing:0}];}return true;
    }
    if(cp.phase==='iteration-start'){
      if(cp.iteration>=cp.iterations){cp.phase=p.scopedBlockRecovery&&!input.criticalOnly?'refine':'done';return true;}
      const i=cp.iteration,seed=[];for(const bundle of input.seedBlocks||[]){const group=p.groups.find(g=>g.id===bundle.id);if(group){const option=group.options.find(o=>o.length===bundle.rows.length&&o.every((a,n)=>a.type===bundle.rows[n].type));if(option)seed.push({group,option});}}
      const alternative=cp.minimumVariants?.[Math.floor(i/2)%cp.minimumVariants.length]||cp.minimum,records=p.solidRules.teamLeaderMinimumMonthlyHours!=null&&i<7?encode(C.teamLeaderWeekSeed(p,byResource,allowed,i)):cp.minimumVariants&&i%2===0?alternative:i===0?cp.minimum:i===1?encode(seed):i%4===0?cp.minimum:encode(decode(cp.best).filter(r=>r.option.some(a=>(p.criticalCapacity.has(a.resource)&&!a.resource.endsWith('|OT-DAY')))||random()>.12+(i%3)*.08));
      if(!cp.prioritySeed)cp.prioritySeed=encode(C.priorityAllocationSeed(p,decode(cp.minimum),allowed).filter(r=>C.priorityRule(r.group.employee,p)));
      const s=seeded([...cp.prioritySeed,...records]),priority=key=>{if(key.endsWith('|OT-DAY'))return 3;if(C.criticalOpen(p,s,key)>0)return 0;const code=key.split('|')[1],rules=p.solidRules.conditionalStaffing||[];if(rules.some(r=>r.sourceShift===code))return 1;if(rules.some(r=>r.shift===code))return 3;return p.criticalCapacity.has(key)?4:2;};
      cp.records=encode(s.records);fillState=s;cp.order=[...p.capacity.keys()].sort((a,b)=>priority(a)-priority(b)||Number(a.endsWith('|OT-DAY'))-Number(b.endsWith('|OT-DAY'))||(a.endsWith('|OT-DAY')?0:(p.potential.get(a)?.size||0)-(p.potential.get(b)?.size||0))||a.localeCompare(b)).flatMap(key=>key.endsWith('|OT-DAY')?Array(Math.max(0,p.capacity.get(key)||0)).fill(key):[key]);cp.cursor=0;cp.changed=false;cp.phase='fill';return true;
    }
    if(cp.phase==='fill'){
      if(cp.cursor===cp.order.length){if(cp.changed){cp.cursor=0;cp.changed=false;}else cp.phase='iteration-end';return true;}
      const resource=cp.order[cp.cursor++],s=fillState||(fillState=C.state(p,decode(cp.records)));
      if((s.remaining.get(resource)||0)<1)return true;let chosen=resource.endsWith('|OT-DAY')?C.rosterChoice(p,s,byResource.get(resource)||[],allowed):null,score=-Infinity;
      for(const r of resource.endsWith('|OT-DAY')?[]:byResource.get(resource)||[]){if(s.used.has(r.group.id)||!allowed(s,r))continue;const x=s.people.get(String(r.group.employee.id)),deficit=Math.max(0,r.group.employee.target-x.hours),same=r.option.every(a=>a.start===r.option[0].start),otPreferred=Number(p.solidRules.otDailyPreferredBlockLength)||0,otBonus=otPreferred>1&&r.option.length>1&&r.option.every(a=>a.type==='OT')?Math.min(r.option.length,otPreferred)*6:0,v=C.fairOptionGain(p,s,r)*.5+C.teamLeaderOptionScore(p,s,r)+(p.preferenceScore?.(r.group.employee,x.duties,r.option)||0)*(p.planningGoal==='WISHES'?2:p.planningGoal==='HOURS'?.5:1)+r.option.reduce((n,a)=>n+(C.criticalOpen(p,s,a.resource)>0?100:1),0)*10+otBonus+Math.min(deficit,r.option.hours)*.15+(same?2:0)-(r.option.length===4&&r.option[0].start>='18:00'&&S.employeeRules(r.group.employee,p.solidRules).preferredNightBlockLength!==4?4:0)-(r.option.length===1?4:0)+random()*3;if(v>score){chosen=r;score=v}}
      if(chosen){C.commit(s,chosen,p.month);cp.records=encode(s.records);cp.changed=true;}return true;
    }
    if(cp.phase==='iteration-end'){const s=fillState||C.state(p,decode(cp.records)),v=C.solidQuality(p,s);if(C.solidBetter(v,cp.quality)){cp.best=cp.records.map(ref=>[...ref]);cp.quality=v;}fillState=null;cp.iteration++;cp.phase='iteration-start';return true;}
    if(cp.phase==='refine'){
      // Keep the expensive whole-block exchange outside result(), so each
      // recovered gap can be saved before the Edge Function's CPU limit.
      const refined=C.refineRecords({...p,scopedBlockRecovery:false},C.state(p,decode(cp.best||[])),allowed);
      cp.refined=encode(refined.records);cp.refineLimited=!!refined.searchLimited;cp.refinePass=0;cp.refineImproved=false;
      cp.refineRoots=[...refined.remaining].filter(([,n])=>n>0).sort((a,b)=>(byResource.get(a[0])?.length||0)-(byResource.get(b[0])?.length||0)).map(([key])=>key);
      cp.refineCursor=0;cp.phase='block-recovery';return true;
    }
    if(cp.phase==='block-recovery'){
      if(cp.refineCursor>=cp.refineRoots.length){if(!cp.refineImproved||cp.refinePass>=3){cp.phase='done';return true;}
        cp.refinePass++;cp.refineImproved=false;const s=C.state(p,decode(cp.refined));cp.refineRoots=[...s.remaining].filter(([,n])=>n>0).sort((a,b)=>(byResource.get(a[0])?.length||0)-(byResource.get(b[0])?.length||0)).map(([key])=>key);cp.refineCursor=0;return true;}
      const key=cp.refineRoots[cp.refineCursor++],s=C.state(p,decode(cp.refined));s.searchLimited=cp.refineLimited;
      if((s.remaining.get(key)||0)<1)return true;
      // One unavailable employee can make a root impossible. Keep each durable
      // search step below the Edge Function CPU budget and retain the best plan.
      const improved=C.repairBlockExchanges(p,s,allowed,{roots:[key],maxChecks:160,maxNodes:80,passes:1});
      cp.refineLimited=!!improved.searchLimited;if(improved.records.length!==s.records.length||C.solidBetter(C.solidQuality(p,improved),C.solidQuality(p,s))){cp.refined=encode(improved.records);cp.refineImproved=true;}
      return true;
    }
    throw Error('Unknown checkpoint phase');
  }
  function result(){if(cp.phase!=='done')throw Error('Job not complete');const balanced=cp.refined?C.state(p,decode(cp.refined)):C.refineRecords(p,C.state(p,decode(cp.best||[])),allowed),records=balanced.records;cp.best=encode(records);cp.quality={...C.solidQuality(p,balanced),searchLimited:!!(cp.refineLimited||balanced.searchLimited)};return {preview:records.flatMap(r=>r.option.map(a=>({...a,blockId:r.group.id}))),quality:cp.quality,remaining:[...balanced.remaining]};}
  return{step,result};
}
return{start,context,planningBase};
});
