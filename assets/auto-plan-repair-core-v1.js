// Bounded augmenting paths; source and protected rows remain immutable.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SFAutoPlanRepairCore=api})(typeof window!=='undefined'?window:globalThis,function(){
  function repair({preview,open,candidates,make,movable,validate,maxChecks=160,maxMoves=24,maxTrials=2000,maxMilliseconds=900,maxDepth=3}){
    let rows=preview.slice(),checks=0,moves=0,swaps=0,trials=0,limited=false;
    const started=Date.now(),exhausted=()=>{if(trials>=maxTrials||checks>=maxChecks||Date.now()-started>=maxMilliseconds){limited=true;return true;}return false;};
    while(moves<maxMoves){const slots=open(rows);if(!slots.length)break;const originals=new Set(rows);let found=null;
      function fill(slot,current,depth,used,blocks,displaced){
        if(exhausted())return null;trials++;
        for(const c of candidates(slot,current)){
          if(exhausted())return null;
          const trial=[...current,make(slot,c)].map(a=>a.blockId&&blocks.has(a.blockId)?Object.fromEntries(Object.entries(a).filter(([k])=>k!=='blockId')):a);
          checks++;if(validate(trial))return{trial,displaced};
        }
        if(depth<=0)return null;
        for(let i=0;i<current.length;i++){
          if(exhausted())return null;trials++;
          const old=current[i];if(!originals.has(old)||used.has(old)||!movable(old))continue;
          const rest=current.filter((_,n)=>n!==i),nextUsed=new Set([...used,old]),nextBlocks=new Set(blocks);if(old.blockId)nextBlocks.add(old.blockId);
          for(const c of candidates(slot,rest).filter(c=>String(c.employeeId)===String(old.employeeId))){
            const result=fill(old,[...rest,make(slot,c)],depth-1,nextUsed,nextBlocks,displaced+1);if(result)return result;if(limited)return null;
          }
        }
        return null;
      }
      for(const slot of slots){found=fill(slot,rows,maxDepth,new Set(),new Set(),0);if(found||limited)break;}
      if(!found)break;rows=found.trial;moves++;swaps+=found.displaced;
    }
    if(moves>=maxMoves&&open(rows).length)limited=true;
    return{preview:rows,closed:moves,swaps,checks,trials,limited,maxDepth};
  }
  // A maximum matching is an optimistic daily capacity bound, not a full roster.
  // A shortfall proves a bottleneck under the supplied static eligibility rules.
  function diagnose({slots,eligible,searchLimited=false,maxPositions=1000}){
    const groups=new Map();for(const slot of slots){const list=groups.get(slot.date)||[];list.push(slot);groups.set(slot.date,list);}
    const days=[];let inspected=0,limited=false;
    for(const [date,list] of groups){if(inspected+list.length>maxPositions){limited=true;break;}inspected+=list.length;
      const edges=list.map(s=>[...new Set(eligible(s).map(String))]),owner=new Map();
      function assign(i,seen){for(const id of edges[i]){if(seen.has(id))continue;seen.add(id);const previous=owner.get(id);if(previous===undefined||assign(previous,seen)){owner.set(id,i);return true;}}return false;}
      let matched=0;for(let i=0;i<list.length;i++)if(assign(i,new Set()))matched++;
      if(matched<list.length)days.push({date,required:list.length,maximum:matched,shortfall:list.length-matched,kind:'STATIC_CAPACITY_BOUND'});
    }
    return{days,shortfall:days.reduce((n,d)=>n+d.shortfall,0),inspected,limited,searchLimited,classification:days.length?'CAPACITY_BOTTLENECK':limited?'PARTIAL_ANALYSIS':'SEARCH_OR_COMBINED_RULES'};
  }
  return{repair,diagnose};
});
