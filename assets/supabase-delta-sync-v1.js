// SchichtFunk – Delta-Synchronisierung für Dienstplan V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  const baseline=new Map();

  const fp=a=>JSON.stringify({
    employeeId:String(a?.employeeId??''),
    type:String(a?.type??''),
    date:String(a?.date??''),
    start:String(a?.start??''),
    end:String(a?.end??''),
    pause:Number(a?.pause||0),
    note:String(a?.note||''),
    version:Number(a?.version||1),
    publishedAt:a?.publishedAt||null
  });
  const capture=()=>{
    if(typeof assignments==='undefined'||!Array.isArray(assignments))return;
    baseline.clear();
    assignments.forEach(a=>{
      if(a&&a.id!=null&&a._dbId)baseline.set(String(a.id),fp(a));
    });
  };
  const markRows=rows=>{
    if(typeof assignments==='undefined'||!Array.isArray(assignments))return;
    (rows||[]).forEach(r=>{
      const id=String(r.legacy_id??'');
      const a=assignments.find(x=>String(x.id)===id);
      if(a)baseline.set(id,fp(a));
    });
  };
  const dirtyRow=row=>{
    const id=String(row?.legacy_id??'');
    if(!id)return true;
    if(typeof assignments==='undefined'||!Array.isArray(assignments))return true;
    const a=assignments.find(x=>String(x.id)===id);
    if(!a)return true;
    const old=baseline.get(id);
    return !old||old!==fp(a);
  };

  const baseHydrate=B.hydrate;
  if(typeof baseHydrate==='function'){
    B.hydrate=async function(){
      const r=await baseHydrate.apply(this,arguments);
      capture();
      return r;
    };
  }

  const baseSync=B.sync;
  if(typeof baseSync==='function'){
    B.sync=async function(){
      if(!B.client||typeof B.client.from!=='function')return baseSync.apply(this,arguments);
      const realFrom=B.client.from;
      B.client.from=function(table){
        const builder=realFrom.call(B.client,table);
        if(table!=='shift_assignments'||!builder||typeof builder.upsert!=='function')return builder;
        const realUpsert=builder.upsert.bind(builder);
        builder.upsert=function(rows,opts){
          const isDraftBatch=Array.isArray(rows)&&rows.length>0&&rows.every(r=>r&&r.status==='DRAFT'&&r.legacy_id!=null);
          if(!isDraftBatch)return realUpsert(rows,opts);

          const delta=rows.filter(dirtyRow);
          if(!delta.length){
            return {
              select:async()=>({data:[],error:null,status:200,statusText:'OK'})
            };
          }

          const q=realUpsert(delta,opts);
          if(q&&typeof q.select==='function'){
            const realSelect=q.select.bind(q);
            q.select=function(cols){
              const selected=realSelect(cols);
              if(selected&&typeof selected.then==='function'){
                return selected.then(res=>{
                  if(!res?.error)markRows(delta);
                  return res;
                });
              }
              return selected;
            };
          }
          return q;
        };
        return builder;
      };
      try{
        return await baseSync.apply(this,arguments);
      }finally{
        B.client.from=realFrom;
      }
    };
  }

  // Falls das Modul nach einer bereits abgeschlossenen Hydrierung geladen wird.
  capture();
  B.captureAssignmentBaseline=capture;
  B.assignmentIsDirty=a=>!baseline.has(String(a?.id))||baseline.get(String(a?.id))!==fp(a);
})();
