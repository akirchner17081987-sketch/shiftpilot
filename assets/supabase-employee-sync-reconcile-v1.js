// SchichtFunk – Mitarbeiter-Sync: Personalnummern sicher mit bestehenden Cloud-Datensätzen abgleichen V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__employeeSyncReconcileV1)return;B.__employeeSyncReconcileV1=true;
  const baseSync=B.sync;
  if(typeof baseSync!=='function')return;
  const norm=v=>String(v??'').trim().toLocaleUpperCase('de-DE');

  B.sync=async function(){
    if(!B.client||!B.companyId||typeof B.client.from!=='function')return baseSync.apply(this,arguments);

    let existing=[];
    try{
      const q=await B.client.from('employees').select('id,legacy_id,personnel_no').eq('company_id',B.companyId);
      if(q.error)throw q.error;
      existing=q.data||[];
    }catch(e){
      console.warn('Mitarbeiter-Sync-Abgleich konnte nicht vorbereitet werden',e);
      return baseSync.apply(this,arguments);
    }

    const byId=new Map(existing.map(x=>[String(x.id),x]));
    const byLegacy=new Map(existing.filter(x=>x.legacy_id!=null).map(x=>[String(x.legacy_id),x]));
    const byPersonnel=new Map();
    existing.forEach(x=>{const k=norm(x.personnel_no);if(k&&!byPersonnel.has(k))byPersonnel.set(k,x)});
    const alias=new Map();

    try{
      if(typeof employees!=='undefined'&&Array.isArray(employees)){
        employees.forEach(e=>{
          const localId=String(e?.id??'');if(!localId)return;
          let hit=(e?._dbId&&byId.get(String(e._dbId)))||byLegacy.get(localId)||null;
          if(!hit){const p=norm(e?.personnelNo);if(p)hit=byPersonnel.get(p)||null}
          if(!hit)return;
          alias.set(localId,String(hit.legacy_id??hit.id));
          e._dbId=hit.id;
          B.empDb?.set?.(localId,hit.id);
          B.empLocal?.set?.(hit.id,localId);
        });
      }
    }catch(e){console.warn('Mitarbeiter-Sync-Abgleich konnte lokale Zuordnungen nicht aktualisieren',e)}

    const realFrom=B.client.from;
    B.client.from=function(table){
      const builder=realFrom.call(B.client,table);
      if(table!=='employees'||!builder||typeof builder.upsert!=='function')return builder;
      const realUpsert=builder.upsert.bind(builder);
      builder.upsert=function(rows,opts){
        if(!Array.isArray(rows)||!rows.length)return realUpsert(rows,opts);
        const fixed=rows.map(r=>{
          const local=String(r?.legacy_id??'');
          const target=alias.get(local);
          return target&&target!==local?{...r,legacy_id:target}:r;
        });
        return realUpsert(fixed,opts);
      };
      return builder;
    };

    try{return await baseSync.apply(this,arguments)}
    finally{B.client.from=realFrom}
  };
})();
