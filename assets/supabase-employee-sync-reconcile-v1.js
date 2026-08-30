// SchichtFunk – Mitarbeiter-Sync: bestehende Cloud-Mitarbeiter sicher abgleichen + fehlende legacy_id selbst heilen V2
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__employeeSyncReconcileV2)return;B.__employeeSyncReconcileV2=true;
  const baseSync=B.sync;
  if(typeof baseSync!=='function')return;
  const norm=v=>String(v??'').trim().toLocaleUpperCase('de-DE');

  async function loadExisting(){
    const q=await B.client.from('employees').select('id,legacy_id,personnel_no').eq('company_id',B.companyId);
    if(q.error)throw q.error;
    return q.data||[];
  }

  async function healMissingLegacy(existing){
    for(const row of existing){
      if(row.legacy_id!=null&&String(row.legacy_id).trim()!=='')continue;
      const legacy=String(row.id);
      const q=await B.client.from('employees')
        .update({legacy_id:legacy})
        .eq('company_id',B.companyId)
        .eq('id',row.id)
        .select('id,legacy_id,personnel_no')
        .maybeSingle();
      if(q.error)throw q.error;
      row.legacy_id=q.data?.legacy_id||legacy;
    }
  }

  B.sync=async function(){
    if(!B.client||!B.companyId||typeof B.client.from!=='function')return baseSync.apply(this,arguments);

    let existing=[];
    try{
      existing=await loadExisting();
      await healMissingLegacy(existing);
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
          const targetLegacy=String(hit.legacy_id||hit.id);
          alias.set(localId,targetLegacy);
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
        // Falls zwei lokale Referenzen denselben Cloud-Mitarbeiter meinen,
        // darf derselbe Konfliktschlüssel nicht doppelt in einem Upsert-Batch stehen.
        const deduped=[],pos=new Map();
        fixed.forEach(r=>{
          const key=String(r?.company_id??'')+'|'+String(r?.legacy_id??'');
          if(pos.has(key))deduped[pos.get(key)]=r;
          else{pos.set(key,deduped.length);deduped.push(r)}
        });
        return realUpsert(deduped,opts);
      };
      return builder;
    };

    try{return await baseSync.apply(this,arguments)}
    finally{B.client.from=realFrom}
  };
})();
