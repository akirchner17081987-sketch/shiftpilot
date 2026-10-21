// Bounded augmenting paths: close a vacancy directly or backfill one displaced duty.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SFAutoPlanRepairCore=api})(typeof window!=='undefined'?window:globalThis,function(){
  function repair({preview,open,candidates,make,movable,validate,maxChecks=96,maxMoves=24,maxTrials=1200,maxMilliseconds=600}){
    let rows=preview.slice(),checks=0,moves=0,swaps=0,trials=0,limited=false;
    const started=Date.now(),exhausted=()=>{if(trials>=maxTrials||Date.now()-started>=maxMilliseconds){limited=true;return true;}return false;};
    const accept=trial=>{if(checks>=maxChecks){limited=true;return false;}checks++;return validate(trial);};
    search:while(moves<maxMoves){const slots=open(rows);if(!slots.length)break;let found=null;
      for(const slot of slots){
        if(exhausted())break search;trials++;
        for(const c of candidates(slot,rows)){const trial=[...rows,make(slot,c)];if(accept(trial)){found={trial,swap:false};break;}if(limited)break search;}
        if(found)break;
        for(let i=0;i<rows.length;i++){
          if(exhausted())break search;trials++;
          const old=rows[i];if(!movable(old))continue;const rest=rows.filter((_,n)=>n!==i);
          for(const c of candidates(slot,rest).filter(c=>String(c.employeeId)===String(old.employeeId))){
            const added=make(slot,c),first=[...rest,added];
            for(const replacement of candidates(old,first).filter(c=>String(c.employeeId)!==String(old.employeeId))){
              if(exhausted())break search;trials++;
              const backfill=make(old,replacement),trial=[...first,backfill].map(a=>old.blockId&&a.blockId===old.blockId?Object.fromEntries(Object.entries(a).filter(([k])=>k!=='blockId')):a);
              if(accept(trial)){found={trial,swap:true};break;}if(limited)break search;
            }if(found)break;
          }if(found)break;
        }if(found)break;
      }
      if(!found)break;rows=found.trial;moves++;if(found.swap)swaps++;
    }
    if(moves>=maxMoves&&open(rows).length)limited=true;
    return{preview:rows,closed:moves,swaps,checks,trials,limited};
  }
  return{repair};
});
