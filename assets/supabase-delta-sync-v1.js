// SchichtFunk – Delta-Synchronisierung für Dienstplan V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  const baseline=new Map();
  const timeBaseline=new Map(),absenceBaseline=new Map();
  const timeFp=t=>JSON.stringify({actualStart:t?.actualStart||'',actualEnd:t?.actualEnd||'',breakMin:Number(t?.breakMin||0),status:t?.status||'open'});
  const absenceFp=a=>JSON.stringify({employeeId:String(a?.employeeId??''),startDate:a?.startDate||a?.date||'',endDate:a?.endDate||a?.date||a?.startDate||'',type:a?.type||'Sonstiges',status:a?.status||((a?.type==='Krank')?'Erfasst':'Genehmigt'),fullDay:a?.fullDay!==false,startTime:a?.fullDay===false?(a?.startTime||null):null,endTime:a?.fullDay===false?(a?.endTime||null):null,timeNote:a?.timeNote||'',note:a?.note||''});

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
    timeBaseline.clear();absenceBaseline.clear();
    if(typeof timeEntries!=='undefined')for(const [id,t] of Object.entries(timeEntries||{})){const dbId=B.asgDb?.get(String(id));if(dbId)timeBaseline.set(dbId,timeFp(t));}
    if(typeof absences!=='undefined')for(const a of absences||[]){if(a._dbId||B.absDb?.has(String(a.id)))absenceBaseline.set(String(a.id),absenceFp(a));}
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
  const basePersistAbsences=B.persistAbsences;
  if(typeof basePersistAbsences==='function'){
    B.persistAbsences=async function(rows){
      const delta=(rows||[]).filter(a=>absenceBaseline.get(String(a.id))!==absenceFp(a));
      if(!delta.length)return;
      const snapshots=delta.map(a=>[String(a.id),absenceFp(a)]);
      await basePersistAbsences.call(this,delta);
      for(const [id,value] of snapshots)absenceBaseline.set(id,value);
    };
  }
  if(typeof baseSync==='function'){
    B.sync=async function(){
      if(!B.client||typeof B.client.from!=='function')return baseSync.apply(this,arguments);
      const realFrom=B.client.from;
      B.client.from=function(table){
        const builder=realFrom.call(B.client,table);
        if(table==='time_entries'&&builder&&typeof builder.upsert==='function'){
          const realUpsert=builder.upsert.bind(builder);
          builder.upsert=function(row,opts){
            const localId=typeof assignments==='undefined'?null:assignments.find(a=>B.asgDb?.get(String(a.id))===row?.assignment_id)?.id;
            const local=typeof timeEntries==='undefined'?null:timeEntries?.[localId];
            if(!local)return realUpsert(row,opts);
            const snapshot=timeFp(local);
            if(timeBaseline.get(row.assignment_id)===snapshot)return Promise.resolve({data:null,error:null,status:200,statusText:'OK'});
            return Promise.resolve(realUpsert(row,opts)).then(result=>{if(!result?.error)timeBaseline.set(row.assignment_id,snapshot);return result;});
          };
          return builder;
        }
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
