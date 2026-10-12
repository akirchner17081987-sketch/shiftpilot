// Serializable planning steps. All candidates and policy belong to one immutable job snapshot.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./month-optimizer-core-v1.js'),require('./solid-planning-core-v1.js'),require('./wish-planning-core-v1.js'));else root.SFSolidPlanningResume=factory(root.SFMonthOptimizerCore,root.SFSolidPlanningCore,root.SFWishCore)})(typeof window==='undefined'?globalThis:window,function(core,S,W){
'use strict';
const C={...core,...core.checkpointPrimitives};
function start(input,iterations=12){return {version:1,inputKey:input._checkpointKey||input.month,phase:'critical',iterations,iteration:0,rng:20270101,component:0,key:0,minimum:[],beam:[{records:[],missing:0}],best:null,quality:null};}
function context(input,cp){
  if(cp.version!==1||(input._checkpointKey||input.month)!==cp.inputKey)throw Error('Checkpoint does not match input snapshot');
  input={...input,...(W?.optimizer?W.optimizer(input.wishes||[],input.employees,input.preferenceBase||input.base,input.month,input.solidRules.timezone):{})};
  const p=C.prepare(input),byResource=new Map(),refMap=new WeakMap();
  p.groups.forEach((group,gi)=>group.options.forEach((option,oi)=>{const r={group,option},ref=[gi,oi];refMap.set(option,ref);for(const key of new Set(option.map(a=>a.resource))){const list=byResource.get(key)||[];list.push(r);byResource.set(key,list)}}));
  const encode=records=>records.map(r=>refMap.get(r.option));
  const decode=records=>records.map(([gi,oi])=>({group:p.groups[gi],option:p.groups[gi].options[oi]}));
  function allowed(s,r){if(!C.feasible(p,s,r.group,r.option))return false;const all=[...p.base,...s.records.flatMap(x=>x.option),...r.option];for(const a of r.option){const need=(p.required||((d,c,r)=>S.required(d,c,r,p.solidRules)))(a.date,a.type,all);if(need!==null&&all.filter(b=>b.date===a.date&&b.type===a.type).length>need)return false}for(const rule of p.solidRules.conditionalStaffing||[])for(const a of r.option.filter(a=>a.type===rule.sourceShift)){const date=S.plus(a.date,-rule.sourceDayOffset),count=all.filter(b=>b.date===date&&b.type===rule.shift).length;if(count>(p.required||((d,c,r)=>S.required(d,c,r,p.solidRules)))(date,rule.shift,all))return false}return true;}
  function seeded(records){const s=C.state(p);for(const r of decode(records))if(allowed(s,r))C.commit(s,r,p.month);return s;}
  const random=()=>{cp.rng=(Math.imul(1664525,cp.rng)+1013904223)>>>0;return cp.rng/4294967296;};
  function components(){const result=[];for(const [key,n]of p.criticalCapacity){if(n<=0)continue;const ids=p.potential.get(key)||new Set(),matches=result.filter(c=>[...ids].some(id=>c.ids.has(id)));let c=matches.shift();if(!c){c={keys:[],ids:new Set()};result.push(c)}for(const other of matches){c.keys.push(...other.keys);for(const id of other.ids)c.ids.add(id);result.splice(result.indexOf(other),1)}c.keys.push(key);for(const id of ids)c.ids.add(id);}return result.map(c=>({keys:c.keys.sort(),ids:[...c.ids].sort()}));}
  if(!cp.components)cp.components=components();
  function step(){
    if(cp.phase==='done')return false;
    if(cp.phase==='critical'){
      const component=cp.components[cp.component];
      if(!component){if(input.criticalOnly){const s=seeded(cp.minimum);cp.best=encode(s.records);cp.quality=C.solidQuality(p,s);cp.phase='done'}else cp.phase='iteration-start';return true;}
      const key=component.keys[cp.key],candidates=[],seen=new Set();
      for(const r of byResource.get(key)||[]){if(r.option.length!==1)continue;const a=r.option[0],id=String(a.employeeId)+'|'+a.start+'|'+a.end;if(seen.has(id))continue;seen.add(id);candidates.push(r)}
      if(p.preferenceScore)candidates.sort((a,b)=>p.preferenceScore(b.group.employee,[],b.option)-p.preferenceScore(a.group.employee,[],a.option));
      const next=[];for(const b of cp.beam){const s=C.state(p,decode(b.records)),need=C.criticalOpen(p,s,key);
        function choose(s,at,left){if(!left||at===candidates.length){next.push({records:encode(s.records),missing:b.missing+left});return}for(let i=at;i<candidates.length;i++){const r=candidates[i];if(s.used.has(r.group.id)||!allowed(s,r))continue;const n=C.state(p,s.records);C.commit(n,r,p.month);choose(n,i+1,left-1)}next.push({records:encode(s.records),missing:b.missing+left});}
        choose(s,0,need);
      }
      const date=key.split('|')[0],day=Math.floor(Date.parse(date+'T12:00:00Z')/86400000),unique=new Map();
      for(const b of next){const s=C.state(p,decode(b.records));const signature=component.ids.map(id=>{const x=s.people.get(id),month=x.months.get(date.slice(0,7))||{hours:0,count:0};return id+':'+month.hours+':'+month.count+':'+x.duties.filter(a=>a.day>=day-8&&a.day<=day).map(a=>a.date+a.type).sort().join(',')}).join(';');const previous=unique.get(signature);if(!previous||b.missing<previous.missing)unique.set(signature,b);}
      cp.beam=[...unique.values()].sort((a,b)=>a.missing-b.missing||(p.preferencePenalty?.([...p.base,...decode(a.records).flatMap(r=>r.option)])||0)-(p.preferencePenalty?.([...p.base,...decode(b.records).flatMap(r=>r.option)])||0)||a.records.length-b.records.length).slice(0,p.criticalBeamWidth||96);
      if(++cp.key===component.keys.length){cp.minimum.push(...cp.beam[0].records);cp.component++;cp.key=0;cp.beam=[{records:[],missing:0}];}return true;
    }
    if(cp.phase==='iteration-start'){
      if(cp.iteration>=cp.iterations){cp.phase='done';return true;}
      const i=cp.iteration,seed=[];for(const bundle of input.seedBlocks||[]){const group=p.groups.find(g=>g.id===bundle.id);if(group){const option=group.options.find(o=>o.length===bundle.rows.length&&o.every((a,n)=>a.type===bundle.rows[n].type));if(option)seed.push({group,option});}}
      const records=i===0?cp.minimum:i===1?encode(seed):i%4===0?cp.minimum:encode(decode(cp.best).filter(r=>r.option.some(a=>p.criticalCapacity.has(a.resource))||random()>.12+(i%3)*.08));
      const s=seeded(records),priority=key=>{if(C.criticalOpen(p,s,key)>0)return 0;const code=key.split('|')[1],rules=p.solidRules.conditionalStaffing||[];if(rules.some(r=>r.sourceShift===code))return 1;if(rules.some(r=>r.shift===code))return 3;return p.criticalCapacity.has(key)?4:2;};
      cp.records=encode(s.records);cp.order=[...p.capacity.keys()].sort((a,b)=>priority(a)-priority(b)||(p.potential.get(a)?.size||0)-(p.potential.get(b)?.size||0)||a.localeCompare(b));cp.cursor=0;cp.changed=false;cp.phase='fill';return true;
    }
    if(cp.phase==='fill'){
      if(cp.cursor===cp.order.length){if(cp.changed){cp.cursor=0;cp.changed=false;}else cp.phase='iteration-end';return true;}
      const resource=cp.order[cp.cursor++],s=C.state(p,decode(cp.records));
      if((s.remaining.get(resource)||0)<1)return true;let chosen=null,score=-Infinity;
      for(const r of byResource.get(resource)||[]){if(s.used.has(r.group.id)||!allowed(s,r))continue;const x=s.people.get(String(r.group.employee.id)),deficit=Math.max(0,r.group.employee.target-x.hours),same=r.option.every(a=>a.start===r.option[0].start),v=(p.preferenceScore?.(r.group.employee,x.duties,r.option)||0)+r.option.reduce((n,a)=>n+(C.criticalOpen(p,s,a.resource)>0?100:1),0)*10+Math.min(deficit,r.option.hours)*.15+(same?2:0)-(r.option.length===4&&r.option[0].start>='18:00'?4:0)-(r.option.length===1?4:0)+random()*3;if(v>score){chosen=r;score=v}}
      if(chosen){C.commit(s,chosen,p.month);cp.records=encode(s.records);cp.changed=true;}return true;
    }
    if(cp.phase==='iteration-end'){const s=C.state(p,decode(cp.records)),v=C.solidQuality(p,s);if(C.solidBetter(v,cp.quality)){cp.best=cp.records.map(ref=>[...ref]);cp.quality=v;}cp.iteration++;cp.phase='iteration-start';return true;}
    throw Error('Unknown checkpoint phase');
  }
  function result(){if(cp.phase!=='done')throw Error('Job not complete');const records=decode(cp.best||[]);return {preview:records.flatMap(r=>r.option.map(a=>({...a,blockId:r.group.id}))),quality:cp.quality,remaining:[...C.state(p,records).remaining]};}
  return{step,result};
}
return{start,context};
});
