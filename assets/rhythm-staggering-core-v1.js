// Search rhythm phases against the same complete-block solver used by planning.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SFRhythmStaggeringCore=api})(typeof window!=='undefined'?window:globalThis,function(){
  const plus=(date,n)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
  const better=(a,b)=>a.open<b.open||a.open===b.open&&(a.deficit<b.deficit-1e-6||Math.abs(a.deficit-b.deficit)<1e-6&&a.squared<b.squared-1e-6);
  async function search(people,evaluate,{progress=()=>{},check=()=>{},maxEvaluations=300}={}){
    const candidates=people.filter(e=>Number.isInteger(e.length)&&e.length>1&&e.length<=365),cache=new Map();let evaluations=0;
    const run=async phases=>{check();const key=phases.join(',');if(cache.has(key))return cache.get(key);if(evaluations>=maxEvaluations)return null;const value=await evaluate(Object.fromEntries(candidates.map((e,i)=>[e.id,plus(e.start,-phases[i])])));check();evaluations++;const item={phases:[...phases],quality:{open:value.open,deficit:value.deficit||0,squared:value.squared||0}};cache.set(key,item);progress(evaluations);return item;};
    const baseline=await run(candidates.map(()=>0));let best=baseline;
    // Compare opposite staircases before local search can settle in synchronized phases.
    for(const direction of [1,-1]){const phases=candidates.map((e,i)=>(direction*Math.floor(i*e.length/Math.max(1,candidates.length))+e.length)%e.length),trial=await run(phases);if(trial&&better(trial.quality,best.quality))best=trial;}
    for(let pass=0;pass<2&&evaluations<maxEvaluations;pass++){let improved=false;
      // Scarce permissions are considered first; the solver still scores actual coverage.
      const order=candidates.map((e,i)=>i).sort((a,b)=>(candidates[a].permissions||1)-(candidates[b].permissions||1)||a-b);
      for(const i of order){let local=best;for(let phase=0;phase<candidates[i].length&&evaluations<maxEvaluations;phase++){const phases=[...best.phases];phases[i]=phase;const trial=await run(phases);if(trial&&better(trial.quality,local.quality))local=trial;}if(local!==best){best=local;improved=true;}}
      if(!improved)break;
    }
    return{baseline:baseline.quality,quality:best.quality,evaluations,improved:better(best.quality,baseline.quality),changes:candidates.flatMap((e,i)=>best.phases[i]?[{id:e.id,oldStart:e.start,start:plus(e.start,-best.phases[i]),phase:best.phases[i]}]:[])};
  }
  return{search,plus,better};
});
