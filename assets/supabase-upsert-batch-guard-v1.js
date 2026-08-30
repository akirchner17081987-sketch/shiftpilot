// SchichtFunk – generischer Schutz gegen doppelte ON CONFLICT-Ziele in Batch-Upserts V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__upsertBatchGuardV1)return;B.__upsertBatchGuardV1=true;
  const baseSync=B.sync;
  if(typeof baseSync!=='function')return;

  function dedupeByConflict(rows,opts){
    if(!Array.isArray(rows)||rows.length<2)return rows;
    const raw=opts?.onConflict;
    if(typeof raw!=='string'||!raw.trim())return rows;
    const keys=raw.split(',').map(x=>x.trim()).filter(Boolean);
    if(!keys.length)return rows;
    const out=[],pos=new Map();
    rows.forEach(r=>{
      const key=keys.map(k=>String(r?.[k]??'')).join('\u001f');
      if(pos.has(key))out[pos.get(key)]=r;
      else{pos.set(key,out.length);out.push(r)}
    });
    return out;
  }

  B.sync=async function(){
    if(!B.client||typeof B.client.from!=='function')return baseSync.apply(this,arguments);
    const realFrom=B.client.from;
    B.client.from=function(table){
      const builder=realFrom.call(B.client,table);
      if(!builder||typeof builder.upsert!=='function')return builder;
      const realUpsert=builder.upsert.bind(builder);
      builder.upsert=function(rows,opts){
        const safe=dedupeByConflict(rows,opts);
        if(Array.isArray(rows)&&Array.isArray(safe)&&safe.length!==rows.length){
          console.warn('SchichtFunk Sync: doppelte Upsert-Konfliktschlüssel entfernt',table,rows.length-safe.length,opts?.onConflict||'');
        }
        return realUpsert(safe,opts);
      };
      return builder;
    };
    try{return await baseSync.apply(this,arguments)}
    finally{B.client.from=realFrom}
  };
})();
