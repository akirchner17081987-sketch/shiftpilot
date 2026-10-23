// Monatsoptimierung: ganze Arbeitsblöcke, echte Besetzungsbedarfe und persönliche Stundenziele.
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./individual-month-planner-v1.js'):root.SFIndividualMonthPlanner,typeof module==='object'&&module.exports?require('./solid-planning-core-v1.js'):root.SFSolidPlanningCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.SFMonthOptimizerCore=api})(typeof window!=='undefined'?window:globalThis,function(individual,solid){
  const hour=3600000;
  // Compare both under- and over-allocation relative to the personal target.
  // With equal targets, every accepted transfer reduces the spread in hours.
  const hoursCost=(hours,target)=>target>0?(hours-target)**2/target:0;
  function balancePreview({employees,base=[],preview,target,hours,carry=()=>0,canMove,movable=()=>true,maxChecks=6000,maxMoves=96,maxComparisons=150000}){
    let rows=preview.slice(),checks=0,moves=0,comparisons=0;const people=new Map(employees.map(e=>[String(e.id),e])),totals=new Map(),key=(id,month)=>String(id)+'|'+month;
    for(const a of [...base,...rows]){const k=key(a.employeeId,a.date.slice(0,7));totals.set(k,(totals.get(k)||0)+hours(a));}
    while(moves<maxMoves&&checks<maxChecks&&comparisons<maxComparisons){let chosen=null;
      search:for(let i=0;i<rows.length;i++){const a=rows[i],owner=people.get(String(a.employeeId));if(!owner||!movable(a,owner))continue;const month=a.date.slice(0,7),fromKey=key(owner.id,month),from=totals.get(fromKey)||0,fromTarget=target(owner,month),duration=hours(a);if(!(fromTarget>0&&duration>0))continue;
        for(const e of employees){if(comparisons>=maxComparisons||checks>=maxChecks)break search;comparisons++;if(String(e.id)===String(owner.id))continue;const toKey=key(e.id,month),to=totals.get(toKey)||0,toTarget=target(e,month);if(!(toTarget>0))continue;const gain=hoursCost(from+carry(owner,month),fromTarget)+hoursCost(to+carry(e,month),toTarget)-hoursCost(from-duration+carry(owner,month),fromTarget)-hoursCost(to+duration+carry(e,month),toTarget);if(gain>1e-6&&(!chosen||gain>chosen.gain+1e-6)){
          checks++;const other=rows.filter((_,n)=>n!==i);if(canMove(a,e,other,owner))chosen={i,a,e,fromKey,toKey,from,to,duration,gain};
        }}
      }
      if(!chosen)break;const c=chosen,oldBlock=c.a.blockId;
      rows=rows.map((a,i)=>{if(i===c.i){const next={...a,employeeId:c.e.id,reason:'Stundenausgleich · nach persönlichem Monats-SOLL'};delete next.blockId;return next;}if(oldBlock&&a.blockId===oldBlock){const next={...a};delete next.blockId;return next;}return a;});
      totals.set(c.fromKey,c.from-c.duration);totals.set(c.toKey,c.to+c.duration);moves++;
    }
    return {preview:rows,moves,checks,comparisons,limited:checks>=maxChecks||moves>=maxMoves||comparisons>=maxComparisons};
  }
  const next=date=>{const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+1);return iso(d)};
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const week=date=>{const d=new Date(date+'T12:00:00');d.setDate(d.getDate()-(d.getDay()+6)%7);return iso(d)};
  function transition(a,b,p){
    if(solid?.allowsTransition)return solid.allowsTransition(a,b,p);
    a=String(a).toUpperCase();b=String(b).toUpperCase();
    if(a==='O3'&&['O1','O2','TL','TL-LE','TL-RE','TEAMLEITER'].includes(b))return false;
    if(p?.enabled&&p.preventLeaderToO1&&['TL-LE','TL-RE'].includes(a)&&b==='O1')return false;
    const order={OT:0,O1:1,O2:2,TL:2,'TL-LE':2,'TL-RE':2,TEAMLEITER:2,O3:3};
    return !(p?.enabled&&p.preventDescendingShifts&&order[a]!=null&&order[b]!=null&&order[a]>order[b]);
  }
  function duty(a){const start=new Date(a.date+'T'+a.start.slice(0,5)+':00'),end=new Date(a.date+'T'+a.end.slice(0,5)+':00');if(end<=start)end.setDate(end.getDate()+1);return{...a,startMs:+start,endMs:+end,hours:(end-start)/hour,day:Math.floor(Date.parse(a.date+'T12:00:00Z')/86400000),week:week(a.date)}}
  function solidDuty(a,p){return {...solid.duty(a,p),week:week(a.date)}}
  function prepare(input){
    const dates=new WeakMap(),prepared=a=>{let v=dates.get(a);if(!v){v=input.solidRules?solidDuty(a,input.solidRules):duty(a);dates.set(a,v)}return v;};
    const people=new Map(input.employees.map(e=>[String(e.id),e])),base=input.base.map(prepared),capacity=new Map(input.capacities),groups=input.groups.map(g=>({...g,employee:people.get(String(g.employee.id)),options:g.options.map(o=>{const a=o.map(prepared);a.hours=a.reduce((n,x)=>n+x.hours,0);a.weeks=new Map();for(const x of a)a.weeks.set(x.week,(a.weeks.get(x.week)||0)+x.hours);return a})})),potential=new Map();
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
    if(p.individualConstraints&&e.individual){const first=Math.floor(Date.parse(p.month+'-01T12:00Z')/86400000),next=new Date(p.month+'-01T12:00Z');next.setUTCMonth(next.getUTCMonth()+1);if(!individual.personValid({base:[],start:first,end:Math.floor(+next/86400000)-1,respectHours:p.respectHours},e,[...x.duties,...option]))return false;}
    if(p.solidRules&&!solid.canAdd(e,x.byDay,option,p.solidRules))return false;
    const addedDays=new Set(),addedByDay=new Map(option.map(a=>[a.day,a]));
    const configuredDuration=Number(p.maxShiftHours),maxDuration=Number.isFinite(configuredDuration)&&configuredDuration>0?configuredDuration:10;
    for(const a of option){if((s.remaining.get(a.resource)||0)<1||x.days.has(a.day)||addedDays.has(a.day)||a.hours>maxDuration+.000001)return false;addedDays.add(a.day);
      for(const day of [a.day-1,a.day+1]){const b=x.byDay.get(day)||addedByDay.get(day);if(!b)continue;
        if(a.day+1===b.day&&!transition(a.type,b.type,p.solidRules)||b.day+1===a.day&&!transition(b.type,a.type,p.solidRules))return false;
        if(a.startMs<b.endMs&&a.endMs>b.startMs)return false;
        const rest=a.startMs>=b.endMs?(a.startMs-b.endMs)/hour:(b.startMs-a.endMs)/hour;if(rest<Math.max(11,Number(p.minRestHours)||11)-.000001)return false;
      }
    }
    if(e.maxConsecutive>0)for(const day of addedDays){let count=1;for(const direction of [-1,1])for(let d=day+direction;x.days.has(d)||addedDays.has(d);d+=direction){if(++count>e.maxConsecutive)return false}}
    return true;
  }
  const personCost=(p,h,e)=>hoursCost(h+(Number(p.hourCarry?.[String(e.id)]??e.balanceCarry)||0),e.target);
  function quality(p,s){let deficit=0,squared=0,extra=0,imbalance=0;for(const e of p.people.values()){const h=s.people.get(String(e.id)).hours,d=Math.max(0,e.target-h);deficit+=d;squared+=d*d/Math.max(1,e.target);extra+=Math.max(0,h-e.target);imbalance+=personCost(p,h,e)}return{open:[...s.remaining.values()].reduce((n,x)=>n+x,0),deficit,squared,extra,imbalance:p.fairDistribution===false?0:imbalance,preferencePenalty:p.preferencePenalty?.([...p.base,...s.records.flatMap(r=>r.option)])||0}}
  const better=(a,b)=>!b||a.open<b.open||a.open===b.open&&(a.imbalance<b.imbalance-1e-6||Math.abs(a.imbalance-b.imbalance)<1e-6&&(a.deficit<b.deficit-.000001||Math.abs(a.deficit-b.deficit)<.000001&&(a.squared+a.preferencePenalty)<(b.squared+b.preferencePenalty)-.000001));
  // Only substitute options already approved by the input builder. Base duties,
  // complete-block requirements, permissions and the solver's hard checks stay intact.
  function validIndividual(p,e,all){if(!p.individualConstraints||!e.individual)return true;const next=new Date(p.month+'-01T12:00Z');next.setUTCMonth(next.getUTCMonth()+1);return individual.personValid({base:[],start:Math.floor(Date.parse(p.month+'-01T12:00Z')/86400000),end:Math.floor(+next/86400000)-1,respectHours:p.respectHours},e,all.filter(a=>String(a.employeeId)===String(e.id)));}
  function balanceRecords(p,initial,allowed=(s,r)=>feasible(p,s,r.group,r.option),maxChecks=3000){
    if(p.fairDistribution===false||p.criticalOnly)return initial;
    const signature=o=>o.map(a=>[a.resource,a.type,a.start,a.end].join('|')).sort().join(';'),options=new Map();
    for(const group of p.groups)for(const option of group.options){const k=signature(option),list=options.get(k)||[];list.push({group,option});options.set(k,list);}
    let current=initial,checks=0;
    for(let pass=0;pass<64&&checks<maxChecks;pass++){let changed=false;const before=p.solidRules?solidQuality(p,current):quality(p,current);
      for(const old of current.records){const from=old.group.employee,fromHours=current.people.get(String(from.id)).hours;
        for(const next of options.get(signature(old.option))||[]){if(String(from.id)===String(next.group.employee.id)||current.used.has(next.group.id))continue;const to=next.group.employee,toHours=current.people.get(String(to.id)).hours,d=old.option.hours,gain=personCost(p,fromHours,from)+personCost(p,toHours,to)-personCost(p,fromHours-d,from)-personCost(p,toHours+d,to);if(gain<1e-6)continue;if(++checks>maxChecks)return current;
          const trial=state(p,current.records.filter(r=>r!==old));if(!allowed(trial,next))continue;commit(trial,next,p.month);
          if(p.solidRules&&solid.errors(from,[...p.base,...trial.records.flatMap(r=>r.option)],p.solidRules,old.option.map(a=>a.date)).length)continue;
          if(!validIndividual(p,from,[...p.base,...trial.records.flatMap(r=>r.option)]))continue;
          const after=p.solidRules?solidQuality(p,trial):quality(p,trial);if(!(p.solidRules?solidBetter(after,before):better(after,before)))continue;
          current=trial;changed=true;break;
        }if(changed)break;
      }
      if(!changed){
        // Split a flexible block only into options independently approved by the
        // builder. Required complete work/rest blocks remain indivisible.
        for(const old of current.records){if(old.group.fullWorkRest||old.option.length<2||old.option.length>6)continue;
          const key=a=>[a.resource,a.type,a.start,a.end].join('|'),wanted=new Set(old.option.map(key)),replacements=[];
          for(const group of p.groups)for(const option of group.options)if(option.every(a=>wanted.has(key(a))))replacements.push({group,option});
          function partition(s,left,depth){if(!left.size){const all=[...p.base,...s.records.flatMap(r=>r.option)],from=old.group.employee;if(!validIndividual(p,from,all)||p.solidRules&&solid.errors(from,all,p.solidRules,old.option.map(a=>a.date)).length)return null;const q=p.solidRules?solidQuality(p,s):quality(p,s);return (p.solidRules?solidBetter(q,before):better(q,before))?s:null;}if(depth>6||checks>=maxChecks)return null;
            const first=[...left][0],list=replacements.filter(r=>!s.used.has(r.group.id)&&r.option.some(a=>key(a)===first)&&r.option.every(a=>left.has(key(a)))).sort((a,b)=>s.people.get(String(a.group.employee.id)).hours-s.people.get(String(b.group.employee.id)).hours||a.option.length-b.option.length);
            const perPerson=new Map(),bounded=list.filter(r=>{const id=String(r.group.employee.id),n=perPerson.get(id)||0;perPerson.set(id,n+1);return n<4;});
          for(const r of bounded){if(++checks>maxChecks)return null;if(!allowed(s,r))continue;const next=state(p,s.records);commit(next,r,p.month);const remaining=new Set(left);for(const a of r.option)remaining.delete(key(a));const found=partition(next,remaining,depth+1);if(found)return found;}return null;
          }
          const found=partition(state(p,current.records.filter(r=>r!==old)),wanted,0);if(found){current=found;changed=true;break;}if(checks>=maxChecks)break;
        }
      }
      if(!changed)break;
    }current.searchLimited=!!initial.searchLimited;return current;
  }
  function random(seed){let n=seed||1;return()=>{n=(Math.imul(1664525,n)+1013904223)>>>0;return n/4294967296}}
  // Search combinations of approved whole options, evicting at most three blocks.
  // Unchanged/base duties are never candidates for eviction. The best incumbent
  // survives an exhausted search; a budget limit is not an infeasibility proof.
  function repairRecords(p,initial,allowed=(s,r)=>feasible(p,s,r.group,r.option),{maxChecks=180,maxNodes=900,maxDepth=3}={}){
    if(!initial||p.criticalOnly)return initial;
    const evaluate=s=>p.solidRules?solidQuality(p,s):quality(p,s),isBetter=p.solidRules?solidBetter:better,options=new Map();
    for(const group of p.groups)for(const option of group.options)for(const key of new Set(option.map(a=>a.resource))){const list=options.get(key)||[];list.push({group,option});options.set(key,list);}
    let current=initial,checks=0,nodes=0,improvements=0;
    for(let pass=0;pass<6&&checks<maxChecks&&nodes<maxNodes;pass++){
      const before=evaluate(current),roots=[...current.remaining].filter(([key,n])=>n>0&&!key.endsWith('|OT-DAY')).sort((a,b)=>(options.get(a[0])?.length||0)-(options.get(b[0])?.length||0));let found=null;
      for(const [root] of roots){
        const goal=new Map(current.remaining);goal.set(root,goal.get(root)-1);const original=new Set(current.records);
        function search(s,depth,removed){
          if(++nodes>maxNodes||checks>=maxChecks)return null;
          const unmet=[...goal].filter(([key,n])=>(s.remaining.get(key)||0)>n).sort((a,b)=>(options.get(a[0])?.length||0)-(options.get(b[0])?.length||0));
          if(!unmet.length){
            const all=[...p.base,...s.records.flatMap(r=>r.option)];
            if(p.solidRules)for(const id of new Set([...removed].map(r=>String(r.group.employee.id)))){const e=p.people.get(id);if(solid.errors(e,all,p.solidRules,all.filter(a=>String(a.employeeId)===id).map(a=>a.date)).length)return null;}
            for(const id of new Set([...removed].map(r=>String(r.group.employee.id))))if(!validIndividual(p,p.people.get(id),all))return null;
            return isBetter(evaluate(s),before)?s:null;
          }
          const [key]=unmet[0];
          for(const r of (options.get(key)||[]).slice(0,40)){
            if(checks++>=maxChecks)return null;
            if(!s.used.has(r.group.id)&&allowed(s,r)){const next=state(p,s.records);commit(next,r,p.month);const result=search(next,depth,removed);if(result)return result;}
            if(depth<=0)continue;
            const own=s.records.filter(old=>original.has(old)&&!removed.has(old)&&String(old.group.employee.id)===String(r.group.employee.id)&&!old.option.some(a=>a.resource.endsWith('|OT-DAY'))).sort((a,b)=>Number(b.option.some(x=>r.option.some(y=>x.date===y.date)))-Number(a.option.some(x=>r.option.some(y=>x.date===y.date))));
            for(const old of own.slice(0,10)){if(++nodes>maxNodes||checks++>=maxChecks)return null;const next=state(p,s.records.filter(x=>x!==old));if(next.used.has(r.group.id)||!allowed(next,r))continue;commit(next,r,p.month);const result=search(next,depth-1,new Set([...removed,old]));if(result)return result;}
          }return null;
        }
        found=search(current,maxDepth,new Set());if(found||nodes>=maxNodes||checks>=maxChecks)break;
      }
      if(!found)break;current=found;improvements++;
    }
    current.search={checks,nodes,improvements,limited:checks>=maxChecks||nodes>=maxNodes};current.searchLimited=!!initial.searchLimited||current.search.limited;return current;
  }
  // A whole work/rest block can cover an open day while its other days are
  // occupied by different employees. Exchange the conflicting blocks as a
  // unit, and accept a result only after every displaced mandatory position
  // has been restored and every affected employee passes the hard rules.
  function repairBlockExchanges(p,initial,allowed=(s,r)=>feasible(p,s,r.group,r.option),scope={}){
    if(!p.scopedBlockRecovery||p.criticalOnly||!initial)return initial;
    const byResource=new Map();for(const group of p.groups)for(const option of group.options)for(const key of new Set(option.map(a=>a.resource))){const list=byResource.get(key)||[];list.push({group,option});byResource.set(key,list)}
    let best=initial,checks=0,nodes=0,improvements=0,limited=false;
    const maxChecks=scope.maxChecks??100000,maxNodes=scope.maxNodes??40000,maxRootChecks=5000,maxRootNodes=1800,maxDepth=4,maxVictims=4;
    const score=s=>solidQuality(p,s),betterState=(a,b)=>solidBetter(score(a),score(b));
    function validRemoved(s,removed){const all=[...p.base,...s.records.flatMap(r=>r.option)];for(const id of removed){const e=p.people.get(id);if(!e||!validIndividual(p,e,all)||p.solidRules&&solid.errors(e,all,p.solidRules,all.filter(a=>String(a.employeeId)===id).map(a=>a.date)).length)return false}return true}
    let rootChecks=0,rootNodes=0,rootLimited=false;
    function search(s,goal,depth,removed,seen){nodes++;rootNodes++;if(nodes>maxNodes){limited=true;return null}if(rootNodes>maxRootNodes){rootLimited=true;return null}const missing=[...goal].filter(([key,n])=>(s.remaining.get(key)||0)>n).sort((a,b)=>(byResource.get(a[0])?.length||0)-(byResource.get(b[0])?.length||0));
      if(!missing.length)return validRemoved(s,removed)&&betterState(s,best)?s:null;
      if(depth<=0)return null;
      const [key]=missing[0],choices=byResource.get(key)||[];
      for(const r of choices){checks++;rootChecks++;if(checks>maxChecks){limited=true;return null}if(rootChecks>maxRootChecks){rootLimited=true;return null}if(s.used.has(r.group.id))continue;
        const occupied=[];for(const key of new Set(r.option.map(a=>a.resource))){if((s.remaining.get(key)||0)>0)continue;const owners=s.records.filter(old=>old.option.some(b=>b.resource===key));if(owners.length)occupied.push(owners)}
        const person=String(r.group.employee.id),near=s.records.filter(old=>String(old.group.employee.id)===person&&old.option.some(a=>r.option.some(b=>Math.abs(a.day-b.day)<=8)));
        // Try the direct placement first. Then evict a bounded set of affected
        // blocks, including occupied resources belonging to other employees.
        let victimSets=[[]];for(const owners of occupied){const next=[];for(const victims of victimSets){if(owners.some(old=>victims.includes(old))){next.push(victims);continue}for(const old of owners){if(victims.length<maxVictims)next.push([...victims,old]);if(next.length>=48)break}if(next.length>=48)break}victimSets=next;if(!victimSets.length)break}
        victimSets=[...victimSets,...victimSets.flatMap(victims=>near.filter(old=>!victims.includes(old)&&victims.length<maxVictims).map(old=>[...victims,old]))];
        for(const victims of victimSets){const signature=r.group.id+'|'+r.option.map(a=>a.resource).join(',')+'|'+victims.map(v=>v.group.id).sort().join(',')+'|'+depth;if(seen.has(signature))continue;seen.add(signature);
          const next=state(p,s.records.filter(old=>!victims.includes(old)));if(!allowed(next,r))continue;commit(next,r,p.month);
          const affected=new Set(removed);for(const old of victims)affected.add(String(old.group.employee.id));
          const found=search(next,goal,depth-1,affected,seen);if(found)return found;
          if(rootLimited||checks>=maxChecks||nodes>=maxNodes)return null;
        }
      }return null;
    }
    for(let pass=0;pass<(scope.passes??4);pass++){let found=null;const roots=[...best.remaining].filter(([key,n])=>n>0&&(!scope.roots||scope.roots.includes(key))).sort((a,b)=>(byResource.get(a[0])?.length||0)-(byResource.get(b[0])?.length||0));
      for(const [key]of roots){rootChecks=0;rootNodes=0;rootLimited=false;const goal=new Map(best.remaining);goal.set(key,goal.get(key)-1);found=search(best,goal,maxDepth,new Set(),new Set());if(rootLimited)limited=true;if(found||checks>=maxChecks||nodes>=maxNodes)break}
      if(!found)break;best=found;improvements++;if(score(best).open===0)break;
    }
    best.searchLimited=!!initial.searchLimited||limited;best.blockRecovery={checks,nodes,improvements,limited};return best;
  }
  // A small deterministic beam considers the whole month, independently of the
  // incumbent. Large inputs keep the existing checkpoint search and repair path.
  function globalBeam(p,initial,allowed=(s,r)=>feasible(p,s,r.group,r.option)){
    if(p.criticalOnly||p.people.size>20||p.capacity.size>100||p.groups.length>1400||quality(p,initial).open===0)return initial;
    const by=new Map();for(const group of p.groups)for(const option of group.options)for(const key of new Set(option.map(a=>a.resource))){const list=by.get(key)||[];list.push({group,option});by.set(key,list);}
    if([...p.capacity.keys()].some(k=>k.endsWith('|OT-DAY')))return initial;
    const keys=[...p.capacity.keys()].sort(),past=[],width=16,maxChecks=12000;let beam=[state(p)],checks=0,limited=false;
    for(const key of keys){past.push(key);let layer=beam;
      for(let n=0;n<(p.capacity.get(key)||0);n++){
        const next=[];
        for(const s of layer){next.push(s);if((s.remaining.get(key)||0)<=0)continue;
          const list=(by.get(key)||[]).filter(r=>!s.used.has(r.group.id)).sort((a,b)=>b.option.length-a.option.length||s.people.get(String(a.group.employee.id)).hours-s.people.get(String(b.group.employee.id)).hours);
          const perPerson=new Map(),bounded=list.filter(r=>{const id=String(r.group.employee.id),n=perPerson.get(id)||0;perPerson.set(id,n+1);return n<4;});
          for(const r of bounded){if(++checks>maxChecks){limited=true;break;}if(!allowed(s,r))continue;const t=state(p,s.records);commit(t,r,p.month);next.push(t);}if(limited)break;
        }
        const seen=new Set(),rank=s=>{const q=quality(p,s);return {s,past:past.reduce((n,k)=>n+Math.max(0,s.remaining.get(k)||0),0),critical:[...p.criticalCapacity.keys()].reduce((n,k)=>n+criticalOpen(p,s,k),0),q};};
        layer=next.map(rank).sort((a,b)=>a.past-b.past||a.critical-b.critical||a.q.open-b.q.open||a.q.imbalance-b.q.imbalance).filter(x=>{const k=x.s.records.map(r=>r.group.id+':'+r.option.map(a=>a.date+a.type).join(',')).sort().join(';');if(seen.has(k))return false;seen.add(k);return true;}).slice(0,width).map(x=>x.s);if(limited)break;
      }
      beam=layer;if(limited)break;
    }
    let best=initial,q=p.solidRules?solidQuality(p,best):quality(p,best);for(const s of beam){const v=p.solidRules?solidQuality(p,s):quality(p,s);if((p.solidRules?solidBetter(v,q):better(v,q))){best=s;q=v;}}
    best.searchLimited=limited;return best;
  }
  function refineRecords(p,initial,allowed=(s,r)=>feasible(p,s,r.group,r.option)){let best=globalBeam(p,initial,allowed);for(let i=0;i<3;i++){const previous=quality(p,best).open;best=balanceRecords(p,repairRecords(p,best,allowed),allowed);if(quality(p,best).open===0||i>0&&quality(p,best).open>=previous)break;}return repairBlockExchanges(p,best,allowed);}
  const fairOptionGain=(p,s,r)=>{if(p.fairDistribution===false)return 0;const e=r.group.employee,h=s.people.get(String(e.id)).hours;return personCost(p,h,e)-personCost(p,h+r.option.hours,e);};
  function fill(p,retained,seed,variant){
    const s=state(p,retained),rng=random(seed),bias=new Map(p.groups.map(g=>[g.id,.8+rng()*.4]));
    const weights=[[32,1],[70,.35],[12,2],[45,1.4]][variant%4];
    while(true){let chosen=null,best=-Infinity;
      for(const g of p.groups){if(s.used.has(g.id))continue;const current=s.people.get(String(g.employee.id)),target=Math.max(1,g.employee.target),deficit=Math.max(0,target-current.hours),urgency=deficit/target;
        for(const option of g.options){if(!feasible(p,s,g,option))continue;const hours=option.hours,scarcity=option.reduce((n,a)=>n+1/Math.max(1,p.potential.get(a.resource)?.size||1),0),same=option.every(a=>a.type===option[0].type),permissions=Math.max(1,g.employee.permissions||1);
          const score=(p.preferenceScore?.(g.employee,current.duties,option)||0)+(scarcity*weights[0]+Math.min(deficit,hours)*urgency*weights[1]+option.length*.8+(same?.6:0)+hours*.05/permissions-(hours>deficit?(hours-deficit)*2:0)+fairOptionGain(p,s,{group:g,option})*.5)*bias.get(g.id);
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
    best=refineRecords(p,best);q={...quality(p,best),searchLimited:!!best.searchLimited};
    const rows=[...p.people.values()].map(e=>{const planned=best.people.get(String(e.id)).hours;return{employeeId:e.id,target:e.target,planned,missing:Math.max(0,e.target-planned),extra:Math.max(0,planned-e.target)}});
    return{records:best.records,preview:best.records.flatMap(r=>r.option.map(a=>({...a,blockId:r.group.block?r.group.id:undefined}))),remaining:[...best.remaining],quality:q,rows};
  }

  function solidQuality(p,s){const all=[...p.base,...s.records.flatMap(r=>r.option)],remaining=new Map(s.remaining);for(const [key]of remaining){const [date,code]=key.split('|'),need=(p.required||((d,c,r)=>solid.required(d,c,r,p.solidRules)))(date,code,all);if(need!==null){const base=p.base.filter(a=>a.date===date&&a.type===code).length,used=all.filter(a=>a.date===date&&a.type===code).length;remaining.set(key,Math.max(0,need-used))}}
    const q=quality(p,s),critical=[...p.criticalCapacity.keys()].reduce((n,k)=>n+criticalOpen(p,s,k),0),metrics=solid.metrics([...p.people.values()],all,p.solidRules,[p.month]);return {...q,teamLeaderDeficit:teamLeaderDeficit(p,s),open:[...remaining.values()].reduce((n,v)=>n+Math.max(0,v),0),critical,metrics,penalty:solid.penalty(metrics)+q.squared*.15+q.preferencePenalty};}
  const criticalOpen=(p,s,key)=>key.endsWith('|OT-DAY')&&solid.otRoster(p.solidRules)?.allowDaysOff?solid.rosterMissing(key.slice(0,10),[...p.base,...s.records.flatMap(r=>r.option)],p.solidRules):Math.max(0,(p.criticalCapacity.get(key)||0)-((p.capacity.get(key)||0)-(s.remaining.get(key)||0)));
  // Search scarce minimum staffing before optional/general work can bind these people.
  // Components with disjoint employee pools can be planned independently.
  async function criticalSeed(p,byResource,allowed,yieldStep){
    const pending=[...p.criticalCapacity].filter(([key,n])=>n>0&&!key.endsWith('|OT-DAY')).map(([key])=>key),components=[];
    for(const key of pending){const ids=p.potential.get(key)||new Set(),matches=components.filter(c=>[...ids].some(id=>c.ids.has(id)));let c=matches.shift();if(!c){c={keys:[],ids:new Set()};components.push(c)}for(const other of matches){c.keys.push(...other.keys);for(const id of other.ids)c.ids.add(id);components.splice(components.indexOf(other),1)}c.keys.push(key);for(const id of ids)c.ids.add(id)}
    const selected=[];
    for(const component of components){
      let beam=[{s:state(p),missing:0}];const keys=component.keys.sort();
      for(const key of keys){const candidates=[],seen=new Set();for(const r of byResource.get(key)||[]){if(r.option.length!==1&&!r.group.fullWorkRest)continue;const a=r.option[0],id=String(a.employeeId)+'|'+a.start+'|'+a.end;if(seen.has(id))continue;seen.add(id);candidates.push(r)}
        if(p.preferenceScore)candidates.sort((a,b)=>p.preferenceScore(b.group.employee,[],b.option)-p.preferenceScore(a.group.employee,[],a.option));
        const nextStates=[];for(const b of beam){const need=criticalOpen(p,b.s,key);
          function choose(s,at,left){if(!left||at===candidates.length){nextStates.push({s,missing:b.missing+left});return}
            for(let i=at;i<candidates.length;i++){const r=candidates[i];if(s.used.has(r.group.id)||!allowed(s,r))continue;const n=state(p,s.records);commit(n,r,p.month);choose(n,i+1,left-1)}
            nextStates.push({s,missing:b.missing+left});
          }choose(b.s,0,need);
        }
        const date=key.split('|')[0],day=Math.floor(Date.parse(date+'T12:00:00Z')/86400000),unique=new Map();
        for(const b of nextStates){const signature=[...component.ids].sort().map(id=>{const x=b.s.people.get(id),m=x.months.get(date.slice(0,7))||{hours:0,count:0};return id+':'+m.hours+':'+m.count+':'+x.duties.filter(a=>a.day>=day-8&&a.day<=day).map(a=>a.date+a.type).sort().join(',')}).join(';');const previous=unique.get(signature);if(!previous||b.missing<previous.missing)unique.set(signature,b)}
        beam=[...unique.values()].sort((a,b)=>a.missing-b.missing||teamLeaderBlockPenalty(p,a.s.records)-teamLeaderBlockPenalty(p,b.s.records)||(p.preferencePenalty?.([...p.base,...a.s.records.flatMap(r=>r.option)])||0)-(p.preferencePenalty?.([...p.base,...b.s.records.flatMap(r=>r.option)])||0)||a.s.records.length-b.s.records.length).slice(0,p.criticalBeamWidth||96);
        await yieldStep();
      }
      selected.push(...beam[0].s.records);
      if(p.solidRules.teamLeaderMinimumMonthlyHours!=null&&components.length===1)selected.variants=beam.slice(0,12).map(b=>b.s.records);
    }
    return selected;
  }
  function employeeShiftHours(e,p){const cache=p._employeeShiftHours||(p._employeeShiftHours=new Map()),key=String(e.id);if(!cache.has(key)){const hours=(p.groups||[]).filter(g=>String(g.employee.id)===key).flatMap(g=>g.options.flatMap(o=>o.map(a=>{const minute=t=>Number(t.slice(0,2))*60+Number(t.slice(3,5));return ((minute(a.end)-minute(a.start)+1440)%1440)/60}))).filter(h=>h>0);cache.set(key,hours.length?Math.min(...hours):10)}return cache.get(key)}
  function employeeShiftTarget(e,p){const h=employeeShiftHours(e,p);return Math.floor(Number(e.target||e.monthlyHours||0)/h)*h}
  function teamLeaderTarget(e,p){return e.role==='Teamleiter'&&p.solidRules?.teamLeaderMinimumMonthlyHours!=null?Math.max(0,Math.min(Number(p.solidRules.teamLeaderMinimumMonthlyHours),employeeShiftTarget(e,p))):0;}
  function teamLeaderDeficit(p,s){return [...p.people.values()].reduce((n,e)=>n+Math.max(0,teamLeaderTarget(e,p)-s.people.get(String(e.id)).hours),0);}
  function teamLeaderBlockPenalty(p,records){
    if(p.solidRules.teamLeaderPreferredNightBlockLength==null)return 0;
    const cache=p._teamLeaderBlockPenaltyCache||(p._teamLeaderBlockPenaltyCache=new WeakMap());if(cache.has(records))return cache.get(records);
    let shortfall=0;const dates=new Set([...p.capacity.keys()].map(k=>k.slice(0,10)));
    for(const e of p.people.values()){if(e.role!=='Teamleiter')continue;const preferred=Number(solid.employeeRules(e,p.solidRules).preferredNightBlockLength)||4,rows=[...p.base,...records.flatMap(r=>r.option)].filter(a=>String(a.employeeId)===String(e.id)&&a.start>='18:00'&&dates.has(a.date)).sort((a,b)=>a.date.localeCompare(b.date));let run=0,last=null;
      for(const a of rows){if(last&&solid.plus(last,1)!==a.date){shortfall+=Math.max(0,preferred-run);run=0;}run++;last=a.date;}if(run)shortfall+=Math.max(0,preferred-run);
    }cache.set(records,shortfall*10);return shortfall*10;
  }
  function teamLeaderOptionScore(p,s,r){const e=r.group.employee,x=s.people.get(String(e.id));if(!teamLeaderTarget(e,p))return 0;const minimum=Math.max(0,teamLeaderTarget(e,p)-x.hours),target=Math.max(0,e.target-x.hours),preferred=Number(solid.employeeRules(e,p.solidRules).preferredNightBlockLength)||4;return Math.min(minimum,r.option.hours)*5+Math.min(target,r.option.hours)*.5+(r.option.length===preferred&&r.option.every(a=>a.start>='18:00')?12:0);}
  // Compare staggered weekly leader blocks as complete alternatives. One leader
  // covers the required management position; colleagues use qualified O duties.
  function teamLeaderWeekSeed(p,byResource,allowed,offset=0){
    const leaders=[...p.people.values()].filter(e=>teamLeaderTarget(e,p)>0).sort((a,b)=>a.target-b.target||String(a.id).localeCompare(String(b.id))),s=state(p);
    if(!leaders.length||p.criticalPeriod)return [];
    const phase=new Map(leaders.map((e,i)=>[String(e.id),(i+offset)%7])),dates=[...new Set([...p.capacity.keys()].map(k=>k.slice(0,10)))].sort();
    const working=(e,date)=>(solid.weekday(date)-1-phase.get(String(e.id))+7)%7<Number(solid.employeeRules(e,p.solidRules).preferredNightBlockLength||4);
    const candidates=key=>(byResource.get(key)||[]).filter(r=>r.option.length===1&&teamLeaderTarget(r.group.employee,p)>0&&s.people.get(String(r.group.employee.id)).hours+r.option.hours<=employeeShiftTarget(r.group.employee,p)+1e-6&&!s.used.has(r.group.id)&&allowed(s,r));
    for(const date of dates){
      for(const key of [...p.criticalCapacity.keys()].filter(k=>k.startsWith(date+'|')&&!k.endsWith('|OT-DAY'))){while(criticalOpen(p,s,key)>0){const list=candidates(key).sort((a,b)=>Number(working(b.group.employee,date))-Number(working(a.group.employee,date))||teamLeaderOptionScore(p,s,b)-teamLeaderOptionScore(p,s,a));if(!list.length)break;commit(s,list[0],p.month);}}
      for(const e of leaders){if(!working(e,date)||s.people.get(String(e.id)).days.has(Math.floor(Date.parse(date+'T12:00:00Z')/86400000)))continue;const list=[...byResource.entries()].filter(([key])=>key.startsWith(date+'|')&&!p.criticalCapacity.has(key)).flatMap(([key])=>candidates(key)).filter(r=>String(r.group.employee.id)===String(e.id)&&r.option[0].start>='18:00').sort((a,b)=>['O2','O1','O3'].indexOf(a.option[0].type)-['O2','O1','O3'].indexOf(b.option[0].type));if(list.length)commit(s,list[0],p.month);}
    }return s.records;
  }
  const solidBetter=(a,b)=>!b||a.critical<b.critical||a.critical===b.critical&&(a.open<b.open||a.open===b.open&&((a.teamLeaderDeficit||0)<(b.teamLeaderDeficit||0)-1e-6||Math.abs((a.teamLeaderDeficit||0)-(b.teamLeaderDeficit||0))<1e-6&&((a.imbalance??a.squared)<(b.imbalance??b.squared)-1e-6||Math.abs((a.imbalance??a.squared)-(b.imbalance??b.squared))<1e-6&&(a.penalty<b.penalty-1e-6||Math.abs(a.penalty-b.penalty)<1e-6&&a.deficit<b.deficit))));
  // Assign the entire three-person day together. Greedy individual picks can leave
  // only an OT3 -> OT1 transition (10 hours rest) for the last available employee.
  function rosterChoice(p,s,candidates,allowed){
    let daysOff=new Map();
    if(solid.otRoster(p.solidRules)?.allowDaysOff){
      const coverage=s.records.flatMap(r=>r.option).filter(a=>!solid.otCodes.includes(a.type)),signature=coverage.map(a=>[a.employeeId,a.date,a.type,a.start,a.end].join('|')).sort().join(';');
      if(p._rosterOffSignature!==signature){
        const choices=new Map();for(const e of p.people.values())choices.set(String(e.id),new Map());
        for(const g of p.groups)for(const o of g.options)if(o.length===1&&solid.otCodes.includes(o[0].type)){const a=o[0],own=choices.get(String(g.employee.id));if(!own.has(a.date))own.set(a.date,[]);own.get(a.date).push(a)}
        p._rosterOff=solid.rosterDaysOff([...p.people.values()],choices,[...new Set([...p.capacity.keys()].map(k=>k.slice(0,10)))],[...p.base,...coverage],p.solidRules);p._rosterOffSignature=signature;
      }
      daysOff=p._rosterOff;
    }
    const rows=candidates.filter(r=>r.option.length===1&&!daysOff.get(String(r.group.employee.id))?.has(r.option[0].date)),best={records:[],score:-Infinity};
    function search(current,at,selected,score){
      if(selected.length>best.records.length||selected.length===best.records.length&&score>best.score){best.records=selected;best.score=score;}
      for(let i=at;i<rows.length;i++){const r=rows[i];if(current.used.has(r.group.id)||!allowed(current,r))continue;const own=current.people.get(String(r.group.employee.id)),a=r.option[0],same=own.duties.filter(b=>b.type===a.type).length,last=own.duties.filter(b=>b.date<a.date).sort((a,b)=>a.date.localeCompare(b.date)).at(-1),next=state(p,current.records);commit(next,r,p.month);search(next,i+1,[...selected,r],score-same-(last&&last.start!==a.start?2:0)+(solid.otRoster(p.solidRules)?.allowDaysOff&&(p.solidRules.conditionalStaffing||[]).some(rule=>rule.shift===a.type)?100:0));}
    }
    search(s,0,[],0);return best.records[0]||null;
  }
  async function optimizeSolid(input,{iterations=12,yieldStep=()=>Promise.resolve(),progress=()=>{}}={}){
    if(input.solidRules.teamLeaderMinimumMonthlyHours!=null&&!input.criticalOnly)iterations=Math.max(iterations,24);
    const p=prepare(input),rng=random(20270101),byResource=new Map();for(const g of p.groups)for(const option of g.options)for(const key of new Set(option.map(a=>a.resource))){const list=byResource.get(key)||[];list.push({group:g,option});byResource.set(key,list)}
    let best=null,q=null;const seed=[];for(const bundle of input.seedBlocks||[]){const g=p.groups.find(g=>g.id===bundle.id);if(g){const option=g.options.find(o=>o.length===bundle.rows.length&&o.every((a,i)=>a.type===bundle.rows[i].type));if(option)seed.push({group:g,option})}}
    function allowed(s,r){if(!feasible(p,s,r.group,r.option))return false;const all=[...p.base,...s.records.flatMap(x=>x.option),...r.option];for(const a of r.option){const need=(p.required||((d,c,r)=>solid.required(d,c,r,p.solidRules)))(a.date,a.type,all);if(need!==null&&all.filter(b=>b.date===a.date&&b.type===a.type).length>need)return false}for(const rule of p.solidRules.conditionalStaffing||[])for(const a of r.option.filter(a=>a.type===rule.sourceShift)){const date=solid.plus(a.date,-rule.sourceDayOffset),count=all.filter(b=>b.date===date&&b.type===rule.shift).length;if(count>(p.required||((d,c,r)=>solid.required(d,c,r,p.solidRules)))(date,rule.shift,all))return false}return true}
    function seeded(records){const s=state(p);for(const r of records)if(!r.option.some(a=>a.resource.endsWith('|OT-DAY'))&&allowed(s,r))commit(s,r,p.month);return s}
    const minimumSeed=await criticalSeed(p,byResource,allowed,yieldStep);
    if(input.criticalOnly){const s=seeded(minimumSeed);return{preview:s.records.flatMap(r=>r.option.map(a=>({...a,blockId:r.group.id}))),quality:solidQuality(p,s),records:s.records,remaining:[...s.remaining]};}
    for(let i=0;i<iterations;i++){const alternative=minimumSeed.variants?.[Math.floor(i/2)%minimumSeed.variants.length]||minimumSeed;let s=seeded(p.solidRules.teamLeaderMinimumMonthlyHours!=null&&i<7?teamLeaderWeekSeed(p,byResource,allowed,i):minimumSeed.variants&&i%2===0?alternative:i===0?minimumSeed:i===1?seed:i%4===0?minimumSeed:best.records.filter(r=>r.option.some(a=>(p.criticalCapacity.has(a.resource)&&!a.resource.endsWith('|OT-DAY')))||rng()>.12+(i%3)*.08));
      // Establish O1/O3 coverage before allocating their conditional OT fallback.
      // Additional OT2 above its confirmed minimum comes after those fallback duties.
      const priority=key=>{if(key.endsWith('|OT-DAY'))return 3;if(criticalOpen(p,s,key)>0)return 0;const code=key.split('|')[1],rules=p.solidRules.conditionalStaffing||[];if(rules.some(r=>r.sourceShift===code))return 1;if(rules.some(r=>r.shift===code))return 3;return p.criticalCapacity.has(key)?4:2};
      const order=[...p.capacity.keys()].sort((a,b)=>priority(a)-priority(b)||Number(a.endsWith('|OT-DAY'))-Number(b.endsWith('|OT-DAY'))||(a.endsWith('|OT-DAY')?0:(p.potential.get(a)?.size||0)-(p.potential.get(b)?.size||0))||(a.localeCompare(b))).flatMap(key=>key.endsWith('|OT-DAY')?Array(Math.max(0,p.capacity.get(key)||0)).fill(key):[key]);
      let changed=true;while(changed){changed=false;for(const resource of order){if((s.remaining.get(resource)||0)<1)continue;let chosen=resource.endsWith('|OT-DAY')?rosterChoice(p,s,byResource.get(resource)||[],allowed):null,score=-Infinity;for(const r of resource.endsWith('|OT-DAY')?[]:byResource.get(resource)||[]){if(s.used.has(r.group.id)||!allowed(s,r))continue;const x=s.people.get(String(r.group.employee.id)),deficit=Math.max(0,r.group.employee.target-x.hours),same=r.option.every(a=>a.start===r.option[0].start),v=fairOptionGain(p,s,r)*.5+teamLeaderOptionScore(p,s,r)+(p.preferenceScore?.(r.group.employee,x.duties,r.option)||0)+r.option.reduce((n,a)=>n+(criticalOpen(p,s,a.resource)>0?100:1),0)*10+Math.min(deficit,r.option.hours)*.15+(same?2:0)-(r.option.length===4&&r.option[0].start>='18:00'&&solid.employeeRules(r.group.employee,p.solidRules).preferredNightBlockLength!==4?4:0)-(r.option.length===1?4:0)+rng()*3;if(v>score){chosen=r;score=v}}
        if(chosen){commit(s,chosen,p.month);changed=true}}
      }
      const v=solidQuality(p,s);if(solidBetter(v,q)){best=s;q=v}progress({iteration:i+1,iterations,...q});await yieldStep();
    }
    best=refineRecords(p,best,allowed);q={...solidQuality(p,best),searchLimited:!!best.searchLimited};
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
  return{optimize,prepare,feasible,state,quality,duty,week,hoursCost,balancePreview,checkpointPrimitives:{fairOptionGain,balanceRecords,repairRecords,repairBlockExchanges,globalBeam,refineRecords,rosterChoice,commit,solidQuality,solidBetter,criticalOpen,teamLeaderBlockPenalty,teamLeaderOptionScore,teamLeaderTarget,teamLeaderWeekSeed}};
});

