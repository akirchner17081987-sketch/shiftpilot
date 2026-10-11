// Monatsoptimierung: ganze Arbeitsblöcke, echte Besetzungsbedarfe und persönliche Stundenziele.
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./individual-month-planner-v1.js'):root.SFIndividualMonthPlanner,typeof module==='object'&&module.exports?require('./solid-planning-core-v1.js'):root.SFSolidPlanningCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.SFMonthOptimizerCore=api})(typeof window!=='undefined'?window:globalThis,function(individual,solid){
  const hour=3600000;
  const next=date=>{const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+1);return iso(d)};
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const week=date=>{const d=new Date(date+'T12:00:00');d.setDate(d.getDate()-(d.getDay()+6)%7);return iso(d)};
  const transition=(a,b)=>!(a==='O3'&&['O1','O2','TL','TL-LE','TL-RE','TEAMLEITER'].includes(String(b).toUpperCase()));
  function duty(a){const start=new Date(a.date+'T'+a.start.slice(0,5)+':00'),end=new Date(a.date+'T'+a.end.slice(0,5)+':00');if(end<=start)end.setDate(end.getDate()+1);return{...a,startMs:+start,endMs:+end,hours:(end-start)/hour,day:Math.floor(Date.parse(a.date+'T12:00:00Z')/86400000),week:week(a.date)}}
  function solidDuty(a,p){return {...solid.duty(a,p),week:week(a.date)}}
  function prepare(input){
    const people=new Map(input.employees.map(e=>[String(e.id),e])),base=input.base.map(a=>input.solidRules?solidDuty(a,input.solidRules):duty(a)),capacity=new Map(input.capacities),groups=input.groups.map(g=>({...g,employee:people.get(String(g.employee.id)),options:g.options.map(o=>{const a=o.map(a=>input.solidRules?solidDuty(a,input.solidRules):duty(a));a.hours=a.reduce((n,x)=>n+x.hours,0);a.weeks=new Map();for(const x of a)a.weeks.set(x.week,(a.weeks.get(x.week)||0)+x.hours);return a})})),potential=new Map();
    for(const g of groups)for(const o of g.options)for(const a of o){if(!potential.has(a.resource))potential.set(a.resource,new Set());potential.get(a.resource).add(String(g.employee.id))}
    const criticalCapacity=new Map(input.criticalCapacities??(input.criticalResources||[]).map(k=>[k,capacity.get(k)||0]));
    return{...input,people,base,capacity,groups,potential,criticalCapacity};
  }
  function state(p,records=[]){
    const s={remaining:new Map(p.capacity),people:new Map(),used:new Set(),records:[],confirmedRules:solid?.confirmed(p.solidRules)};
    for(const e of p.people.values())s.people.set(String(e.id),{hours:0,monthDuties:0,months:new Map(),weeks:new Map(),duties:[],days:new Set(),byDay:new Map()});
    for(const a of p.base)addDuty(s,a,p.month);
    for(const r of records)commit(s,r,p.month);return s;
  }
  function addDuty(s,a,month){const e=s.people.get(String(a.employeeId));if(!e)return;e.duties.push(a);e.days.add(a.day);e.byDay.set(a.day,a);const key=a.date.slice(0,7),m=e.months.get(key)||{hours:0,count:0};m.hours+=a.hours;if(!s.confirmedRules||solid.countsTowardCap(a))m.count++;e.months.set(key,m);if(key===month){e.hours=m.hours;e.monthDuties=m.count;}e.weeks.set(a.week,(e.weeks.get(a.week)||0)+a.hours)}
  function commit(s,r,month){s.used.add(r.group.id);s.records.push(r);for(const a of r.option){s.remaining.set(a.resource,s.remaining.get(a.resource)-1);addDuty(s,a,month)}}
  function feasible(p,s,g,option){
    const e=g.employee,x=s.people.get(String(e.id));if(!x)return false;
    const month=p.criticalPeriod?option[0].date.slice(0,7):p.month,current=p.criticalPeriod?(x.months.get(month)||{hours:0,count:0}):{hours:x.hours,count:x.monthDuties};
    if(current.hours+option.hours>e.monthLimit+.000001||current.count+option.filter(a=>a.date.startsWith(month)).length>(e.maxMonthlyShifts??Infinity))return false;
    if(Number.isFinite(e.calendarLimit)){const start=p.solidRules?solid.instant(month+'-01','00:00',p.solidRules.timezone):+new Date(month+'-01T00:00:00'),end=new Date(month+'-01T12:00:00Z');end.setUTCMonth(end.getUTCMonth()+1);const finish=p.solidRules?solid.instant(end.toISOString().slice(0,10),'00:00',p.solidRules.timezone):+new Date(end.toISOString().slice(0,10)+'T00:00:00');const h=[...x.duties,...option].reduce((n,a)=>n+Math.max(0,Math.min(a.endMs,finish)-Math.max(a.startMs,start))/hour,0);if(h>e.calendarLimit+.000001)return false;}
    if(!solid?.confirmed(p.solidRules)&&p.respectHours&&e.weeklyLimit>0)for(const [w,h]of option.weeks)if((x.weeks.get(w)||0)+h>e.weeklyLimit+.000001)return false;
    if(p.accept&&!p.accept(e,x.duties,option))return false;
    if(p.solidRules&&!solid.canAdd(e,x.byDay,option,p.solidRules))return false;
    const addedDays=new Set(),addedByDay=new Map(option.map(a=>[a.day,a]));
    for(const a of option){if((s.remaining.get(a.resource)||0)<1||x.days.has(a.day)||addedDays.has(a.day)||a.hours>10+.000001)return false;addedDays.add(a.day);
      for(const day of [a.day-1,a.day+1]){const b=x.byDay.get(day)||addedByDay.get(day);if(!b)continue;
        if(a.day+1===b.day&&!transition(a.type,b.type)||b.day+1===a.day&&!transition(b.type,a.type))return false;
        if(a.startMs<b.endMs&&a.endMs>b.startMs)return false;
        const rest=a.startMs>=b.endMs?(a.startMs-b.endMs)/hour:(b.startMs-a.endMs)/hour;if(rest<11-.000001)return false;
      }
    }
    if(e.maxConsecutive>0)for(const day of addedDays){let count=1;for(const direction of [-1,1])for(let d=day+direction;x.days.has(d)||addedDays.has(d);d+=direction){if(++count>e.maxConsecutive)return false}}
    return true;
  }
  function quality(p,s){let deficit=0,squared=0,extra=0;for(const e of p.people.values()){const h=s.people.get(String(e.id)).hours,d=Math.max(0,e.target-h);deficit+=d;squared+=d*d/Math.max(1,e.target);extra+=Math.max(0,h-e.target)}return{open:[...s.remaining.values()].reduce((n,x)=>n+x,0),deficit,squared,extra,preferencePenalty:p.preferencePenalty?.([...p.base,...s.records.flatMap(r=>r.option)])||0}}
  const better=(a,b)=>!b||a.open<b.open||a.open===b.open&&(a.deficit<b.deficit-.000001||Math.abs(a.deficit-b.deficit)<.000001&&(a.squared+a.preferencePenalty)<(b.squared+b.preferencePenalty)-.000001);
  function random(seed){let n=seed||1;return()=>{n=(Math.imul(1664525,n)+1013904223)>>>0;return n/4294967296}}
  function fill(p,retained,seed,variant){
    const s=state(p,retained),rng=random(seed),bias=new Map(p.groups.map(g=>[g.id,.8+rng()*.4]));
    const weights=[[32,1],[70,.35],[12,2],[45,1.4]][variant%4];
    while(true){let chosen=null,best=-Infinity;
      for(const g of p.groups){if(s.used.has(g.id))continue;const current=s.people.get(String(g.employee.id)),target=Math.max(1,g.employee.target),deficit=Math.max(0,target-current.hours),urgency=deficit/target;
        for(const option of g.options){if(!feasible(p,s,g,option))continue;const hours=option.hours,scarcity=option.reduce((n,a)=>n+1/Math.max(1,p.potential.get(a.resource)?.size||1),0),same=option.every(a=>a.type===option[0].type),permissions=Math.max(1,g.employee.permissions||1);
          const score=(p.preferenceScore?.(g.employee,current.duties,option)||0)+(scarcity*weights[0]+Math.min(deficit,hours)*urgency*weights[1]+option.length*.8+(same?.6:0)+hours*.05/permissions-(hours>deficit?(hours-deficit)*2:0))*bias.get(g.id);
          if(score>best){best=score;chosen={group:g,option}}
        }
      }
      if(!chosen)break;commit(s,chosen,p.month);
    }
    return s;
  }
  async function optimizeLegacy(input,{iterations=36,yieldStep=()=>Promise.resolve(),progress=()=>{}}={}){
    const p=prepare(input);let best=null,q=null;const rng=random(20261201);
    for(let i=0;i<iterations;i++){
      let retained=[];
      if(i>=8&&best){const drop=.12+(i%5)*.08;retained=best.records.filter(()=>rng()>drop)}
      const s=fill(p,retained,101+i*7919,i),v=quality(p,s);if(better(v,q)){best=s;q=v}progress({iteration:i+1,iterations,...q});await yieldStep();
    }
    const rows=[...p.people.values()].map(e=>{const planned=best.people.get(String(e.id)).hours;return{employeeId:e.id,target:e.target,planned,missing:Math.max(0,e.target-planned),extra:Math.max(0,planned-e.target)}});
    return{records:best.records,preview:best.records.flatMap(r=>r.option.map(a=>({...a,blockId:r.group.block?r.group.id:undefined}))),remaining:[...best.remaining],quality:q,rows};
  }

  function solidQuality(p,s){const all=[...p.base,...s.records.flatMap(r=>r.option)],remaining=new Map(s.remaining);for(const [key]of remaining){const [date,code]=key.split('|'),need=(p.required||((d,c,r)=>solid.required(d,c,r,p.solidRules)))(date,code,all);if(need!==null){const base=p.base.filter(a=>a.date===date&&a.type===code).length,used=all.filter(a=>a.date===date&&a.type===code).length;remaining.set(key,Math.max(0,need-used))}}
    const q=quality(p,s),critical=[...p.criticalCapacity.keys()].reduce((n,k)=>n+criticalOpen(p,s,k),0),metrics=solid.metrics([...p.people.values()],all,p.solidRules,[p.month]);return {...q,open:[...remaining.values()].reduce((n,v)=>n+Math.max(0,v),0),critical,metrics,penalty:solid.penalty(metrics)+q.squared*.15+q.preferencePenalty};}
  const criticalOpen=(p,s,key)=>Math.max(0,(p.criticalCapacity.get(key)||0)-((p.capacity.get(key)||0)-(s.remaining.get(key)||0)));
  // Search scarce minimum staffing before optional/general work can bind these people.
  // Components with disjoint employee pools can be planned independently.
  async function criticalSeed(p,byResource,allowed,yieldStep){
    const pending=[...p.criticalCapacity].filter(([,n])=>n>0).map(([key])=>key),components=[];
    for(const key of pending){const ids=p.potential.get(key)||new Set(),matches=components.filter(c=>[...ids].some(id=>c.ids.has(id)));let c=matches.shift();if(!c){c={keys:[],ids:new Set()};components.push(c)}for(const other of matches){c.keys.push(...other.keys);for(const id of other.ids)c.ids.add(id);components.splice(components.indexOf(other),1)}c.keys.push(key);for(const id of ids)c.ids.add(id)}
    const selected=[];
    for(const component of components){
      let beam=[{s:state(p),missing:0}];const keys=component.keys.sort();
      for(const key of keys){const candidates=[],seen=new Set();for(const r of byResource.get(key)||[]){if(r.option.length!==1)continue;const a=r.option[0],id=String(a.employeeId)+'|'+a.start+'|'+a.end;if(seen.has(id))continue;seen.add(id);candidates.push(r)}
        if(p.preferenceScore)candidates.sort((a,b)=>p.preferenceScore(b.group.employee,[],b.option)-p.preferenceScore(a.group.employee,[],a.option));
        const nextStates=[];for(const b of beam){const need=criticalOpen(p,b.s,key);
          function choose(s,at,left){if(!left||at===candidates.length){nextStates.push({s,missing:b.missing+left});return}
            for(let i=at;i<candidates.length;i++){const r=candidates[i];if(s.used.has(r.group.id)||!allowed(s,r))continue;const n=state(p,s.records);commit(n,r,p.month);choose(n,i+1,left-1)}
            nextStates.push({s,missing:b.missing+left});
          }choose(b.s,0,need);
        }
        const date=key.split('|')[0],day=Math.floor(Date.parse(date+'T12:00:00Z')/86400000),unique=new Map();
        for(const b of nextStates){const signature=[...component.ids].sort().map(id=>{const x=b.s.people.get(id),m=x.months.get(date.slice(0,7))||{hours:0,count:0};return id+':'+m.hours+':'+m.count+':'+x.duties.filter(a=>a.day>=day-8&&a.day<=day).map(a=>a.date+a.type).sort().join(',')}).join(';');const previous=unique.get(signature);if(!previous||b.missing<previous.missing)unique.set(signature,b)}
        beam=[...unique.values()].sort((a,b)=>a.missing-b.missing||(p.preferencePenalty?.([...p.base,...a.s.records.flatMap(r=>r.option)])||0)-(p.preferencePenalty?.([...p.base,...b.s.records.flatMap(r=>r.option)])||0)||a.s.records.length-b.s.records.length).slice(0,p.criticalBeamWidth||96);
        await yieldStep();
      }
      selected.push(...beam[0].s.records);
    }
    return selected;
  }
  const solidBetter=(a,b)=>!b||a.critical<b.critical||a.critical===b.critical&&(a.open<b.open||a.open===b.open&&(a.penalty<b.penalty-1e-6||Math.abs(a.penalty-b.penalty)<1e-6&&a.deficit<b.deficit));
  async function optimizeSolid(input,{iterations=12,yieldStep=()=>Promise.resolve(),progress=()=>{}}={}){
    const p=prepare(input),rng=random(20270101),byResource=new Map();for(const g of p.groups)for(const option of g.options)for(const key of new Set(option.map(a=>a.resource))){const list=byResource.get(key)||[];list.push({group:g,option});byResource.set(key,list)}
    let best=null,q=null;const seed=[];for(const bundle of input.seedBlocks||[]){const g=p.groups.find(g=>g.id===bundle.id);if(g){const option=g.options.find(o=>o.length===bundle.rows.length&&o.every((a,i)=>a.type===bundle.rows[i].type));if(option)seed.push({group:g,option})}}
    function allowed(s,r){if(!feasible(p,s,r.group,r.option))return false;const all=[...p.base,...s.records.flatMap(x=>x.option),...r.option];for(const a of r.option){const need=(p.required||((d,c,r)=>solid.required(d,c,r,p.solidRules)))(a.date,a.type,all);if(need!==null&&all.filter(b=>b.date===a.date&&b.type===a.type).length>need)return false}for(const rule of p.solidRules.conditionalStaffing||[])for(const a of r.option.filter(a=>a.type===rule.sourceShift)){const date=solid.plus(a.date,-rule.sourceDayOffset),count=all.filter(b=>b.date===date&&b.type===rule.shift).length;if(count>(p.required||((d,c,r)=>solid.required(d,c,r,p.solidRules)))(date,rule.shift,all))return false}return true}
    function seeded(records){const s=state(p);for(const r of records)if(allowed(s,r))commit(s,r,p.month);return s}
    const minimumSeed=await criticalSeed(p,byResource,allowed,yieldStep);
    if(input.criticalOnly){const s=seeded(minimumSeed);return{preview:s.records.flatMap(r=>r.option.map(a=>({...a,blockId:r.group.id}))),quality:solidQuality(p,s),records:s.records,remaining:[...s.remaining]};}
    for(let i=0;i<iterations;i++){let s=seeded(i===0?minimumSeed:i===1?seed:i%4===0?minimumSeed:best.records.filter(r=>r.option.some(a=>p.criticalCapacity.has(a.resource))||rng()>.12+(i%3)*.08));
      // Establish O1/O3 coverage before allocating their conditional OT fallback.
      // Additional OT2 above its confirmed minimum comes after those fallback duties.
      const priority=key=>{if(criticalOpen(p,s,key)>0)return 0;const code=key.split('|')[1],rules=p.solidRules.conditionalStaffing||[];if(rules.some(r=>r.sourceShift===code))return 1;if(rules.some(r=>r.shift===code))return 3;return p.criticalCapacity.has(key)?4:2};
      const order=[...p.capacity.keys()].sort((a,b)=>priority(a)-priority(b)||(p.potential.get(a)?.size||0)-(p.potential.get(b)?.size||0)||(a.localeCompare(b)));
      let changed=true;while(changed){changed=false;for(const resource of order){if((s.remaining.get(resource)||0)<1)continue;let chosen=null,score=-Infinity;for(const r of byResource.get(resource)||[]){if(s.used.has(r.group.id)||!allowed(s,r))continue;const x=s.people.get(String(r.group.employee.id)),deficit=Math.max(0,r.group.employee.target-x.hours),same=r.option.every(a=>a.start===r.option[0].start),v=(p.preferenceScore?.(r.group.employee,x.duties,r.option)||0)+r.option.reduce((n,a)=>n+(criticalOpen(p,s,a.resource)>0?100:1),0)*10+Math.min(deficit,r.option.hours)*.15+(same?2:0)-(r.option.length===4&&r.option[0].start>='18:00'?4:0)-(r.option.length===1?4:0)+rng()*3;if(v>score){chosen=r;score=v}}
        if(chosen){commit(s,chosen,p.month);changed=true}}
      }
      const v=solidQuality(p,s);if(solidBetter(v,q)){best=s;q=v}progress({iteration:i+1,iterations,...q});await yieldStep();
    }
    return{preview:best.records.flatMap(r=>r.option.map(a=>({...a,blockId:r.group.id}))),quality:q,records:best.records,remaining:[...best.remaining]};
  }
  async function optimize(input,options={}){
    const ids=new Set(input.employees.filter(e=>e.individual).map(e=>String(e.id)));
    if(input.solidRules)return optimizeSolid(input,options);
    if(!ids.size)return optimizeLegacy(input,options);
    if(!individual)throw Error('Die individuelle Monatsplanung konnte nicht geladen werden. Bitte die Seite neu laden.');
    const boundIterations=Math.min(16,options.iterations||16),freeIterations=options.iterations||128,total=boundIterations+freeIterations,report=(offset,phase)=>p=>options.progress?.({...p,completed:offset+p.iteration,total,phase});
    const bound=await optimizeLegacy({...input,groups:input.groups.filter(g=>!ids.has(String(g.employee.id)))},{...options,iterations:boundIterations,progress:report(0,'fixed')}),capacity=new Map(input.capacities);
    for(const a of bound.preview)capacity.set(a.resource,capacity.get(a.resource)-1);
    const freeInput={...input,employees:input.employees.filter(e=>ids.has(String(e.id))),groups:input.groups.filter(g=>ids.has(String(g.employee.id))),base:[...input.base,...bound.preview],capacities:[...capacity],seed:(input.seed||[]).filter(a=>ids.has(String(a.employeeId)))};
    const found=await individual.optimize(freeInput,{...options,iterations:freeIterations,beamWidth:240,progress:report(boundIterations,'individual')}),preview=[...bound.preview,...found.preview];
    const all=[...input.base,...preview],used=new Map();for(const a of preview)used.set(a.resource,(used.get(a.resource)||0)+1);
    const open=input.capacities.reduce((n,[key,count])=>n+Math.max(0,count-(used.get(key)||0)),0);
    return{preview,individualInput:freeInput,quality:{...found.quality,open},rows:input.employees.map(e=>{const hours=all.filter(a=>String(a.employeeId)===String(e.id)&&a.date.startsWith(input.month)).reduce((n,a)=>n+duty(a).hours,0);return{employeeId:e.id,target:e.target,planned:hours,missing:Math.max(0,e.target-hours),extra:Math.max(0,hours-e.target)}})};
  }
  return{optimize,prepare,feasible,state,quality,duty,week};
});

