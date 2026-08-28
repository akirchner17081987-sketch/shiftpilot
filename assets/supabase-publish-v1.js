// SchichtFunk – atomare Wochenveröffentlichung über Supabase/PostgreSQL
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  const C=window.SFCompliance=window.SFCompliance||{};
  const fallback=typeof C.publishCurrentWeek==='function'?C.publishCurrentWeek.bind(C):null;
  let publishing=false;

  function currentWeekKey(){
    try{
      if(typeof weekStart!=='undefined'&&weekStart){
        const d=weekStart instanceof Date?weekStart:new Date(weekStart);
        return C.weekKey(C.iso(d));
      }
    }catch{}
    const d=new Date();
    return C.weekKey(C.iso(d));
  }

  C.publishCurrentWeek=async function(){
    if(publishing)return;
    if(!B.ready||!B.client){
      if(fallback)return fallback();
      return;
    }

    const key=currentWeekKey();
    if(C.publications?.[key]?.publishedAt){
      C.toast?.('Dienstplan bereits veröffentlicht',new Date(C.publications[key].publishedAt).toLocaleString('de-DE'));
      return;
    }

    if(!confirm('Dienstplan für die aktuelle Woche veröffentlichen?\n\nAb diesem Zeitpunkt laufen spätere Änderungen über die Compliance-Prüfung und werden protokolliert.'))return;

    publishing=true;
    try{
      B.showLoading?.('Dienstplan wird veröffentlicht …');
      const {data,error}=await B.client.rpc('publish_schedule_week',{p_week_start:key});
      if(error)throw error;
      const result=Array.isArray(data)?data[0]:data;

      // Erst NACH erfolgreicher Server-Transaktion den Browserzustand neu laden.
      // Dadurch gibt es keinen halbfertigen lokalen Veröffentlichungsstatus und
      // keinen Bulk-Upsert des gesamten Dienstplans mehr.
      await B.hydrate();
      C.updateScheduleControls?.();
      const count=Number(result?.assignment_count||0);
      C.toast?.('Dienstplan veröffentlicht',`${count} Schichten wurden sicher in PostgreSQL veröffentlicht.`);
    }catch(e){
      console.error('SchichtFunk Veröffentlichung',e);
      C.toast?.('Veröffentlichung fehlgeschlagen',e?.message||String(e));
    }finally{
      B.hideLoading?.();
      publishing=false;
    }
  };

  window.spPublishCurrentWeek=C.publishCurrentWeek;
})();
