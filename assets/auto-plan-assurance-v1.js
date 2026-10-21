// Automatic improvement and an independent, current-data check of every proposed duty.
(function(){
  const el=id=>document.getElementById(id),same=(a,b)=>String(a)===String(b),active=a=>a.status!=='CANCELLED'&&a._dbStatus!=='CANCELLED';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const withBase=(base,fn)=>{const original=assignments;try{assignments=base;return fn();}finally{assignments=original;}};
  let cached=null,repairStats=null;
  function rowErrors(a,other){
    const e=employees.find(e=>same(e.id,a.employeeId)),t=typeById(a.type),reasons=[];
    if(!e||e.status!=='active'||e.deletedAt)return['Mitarbeiterprofil ist nicht aktiv.'];
    if(!t||t.active===false)return['Schichtmodell ist nicht aktiv.'];
    if(e.startDate&&a.date<e.startDate||e.contractEnd&&a.date>e.contractEnd)reasons.push('Außerhalb des Beschäftigungszeitraums.');
    const start=a.start||t.start,end=a.end||t.end;
    if(start!==t.start||end!==t.end||a.rhythmOverride){
      if(!window.SFAutoPlanPreviewEditor?.check)reasons.push('Die Prüfung der individuellen Dienstzeiten ist nicht verfügbar.');
      else reasons.push(...window.SFAutoPlanPreviewEditor.check([...other,a],[a]));
    }else{
      if(!autoEligibleEmployees(a.type,a.date,other).some(c=>same(c.e.id,e.id)))reasons.push('Freigabe, Verfügbarkeit, Rhythmus, Ruhezeit oder Stundenlimit verletzt.');
      const checked=window.SFPlanningReview?.evaluate(e,{...a,alternatives:[a.type]},{rows:[...assignments,...other],policy:window.SFCompliance?.policy});
      if(checked?.status==='blocked')reasons.push(...checked.reasons);
      if(checked?.status==='unknown')reasons.push('Die Regelprüfung dieses Dienstes ist unvollständig.');
    }
    return reasons.map(r=>typeof r==='string'?r:r.message||'Dienstregel verletzt.');
  }
  function repair(base,preview){
    repairStats=null;
    // Individual and confirmed block solvers retain their stricter approved options.
    if(!window.SFAutoPlanRepairCore||window.SFCompliance?.policy?.solidPlanningRules?.enabled)return preview;
    return withBase(base,()=>{
      const r=window.SFAutoPlanRepairCore.repair({preview,
        open:rows=>withBase([...base,...rows],()=>autoOpenSlots()),
        candidates:(slot,rows)=>autoSlotCandidates(slot,rows).filter(c=>!c.e.deletedAt&&(!c.e.startDate||slot.date>=c.e.startDate)&&(!c.e.contractEnd||slot.date<=c.e.contractEnd)).map(c=>({employeeId:c.e.id,type:c.type})),
        movable:a=>{const e=employees.find(e=>same(e.id,a.employeeId)),rhythm=e&&window.sfRhythmCheck?.(e,a.type,a.date);return !a.rhythmOverride&&!a._dbId&&!a.publishedAt&&!a._marketApproved&&!a.optional&&!(rhythm?.mode==='required'&&rhythm.expected&&!['ALLE','FREI'].includes(rhythm.expected));},
        make:(slot,c)=>{const t=typeById(c.type);return{id:'repair-'+Date.now()+'-'+Math.random(),employeeId:c.employeeId,date:slot.date,day:autoDayLabel(slot.date),type:c.type,start:t.start,end:t.end,coverageGroup:slot.coverageGroup,coverageLabel:slot.coverageLabel,reason:'Automatische Nachbesserung · Pflichtlücke geschlossen'};},
        validate:rows=>rows.every((a,i)=>!rowErrors(a,rows.filter((_,j)=>i!==j)).length)
      });
      repairStats={company:window.SFBackend?.companyId,ids:r.preview.map(a=>a.id).sort().join('|'),closed:r.closed,swaps:r.swaps,limited:r.limited};return r.preview;
    });
  }
  function audit(){
    const prepared=window.SFMonthOptimizer?.getResult?.(),base=(prepared?.base||assignments).filter(active),preview=autoPlanPreview,dates=autoPlanningDates(),policy=window.SFCompliance?.policy;
    const key=JSON.stringify([window.SFBackend?.companyId,!!window.SFBackend?.ready,base,preview,dates,employees,TYPES,policy,typeof absences==='undefined'?[]:absences,typeof globalSoll==='undefined'?{}:globalSoll,typeof dailySoll==='undefined'?{}:dailySoll,el('autoRespectHours')?.checked,window.SFWishPlanning?.signature?.(),window.SFShiftModels?.models,!!window.SFAutoPlanGuard,!!window.sfRhythmCheck,!!window.SFCompliance?.check,!!window.SFAutoPlanPreviewEditor?.check,!!prepared?.needsReplan]);
    if(cached?.key===key)return cached;
    const errors=[],unknown=[],selected=new Set(dates);
    if(!window.SFAutoPlanGuard?.passesTimeRules||!window.sfRhythmCheck||window.SFBackend?.ready&&!window.SFCompliance?.check)unknown.push('Zeit-, Rhythmus- oder Regelprüfung ist noch nicht geladen. Bitte die Seite neu laden.');
    if(prepared?.needsReplan)unknown.push('Gespeicherte Dienste haben sich geändert. Bitte den Vorschlag neu berechnen.');
    let open=[];
    try{withBase(base,()=>{
      preview.forEach((a,i)=>{const reasons=[];if(!selected.has(a.date))reasons.push('Dienst liegt außerhalb des gewählten Zeitraums.');reasons.push(...rowErrors(a,preview.filter((_,j)=>i!==j)));if(reasons.length)errors.push({date:a.date,type:a.type,employeeId:a.employeeId,reasons});});
      open=withBase([...base,...preview],()=>autoOpenSlots());
    });}catch{unknown.push('Die Abschlussprüfung konnte nicht vollständig ausgeführt werden. Bitte neu planen.');}
    const hourGroups=new Map(),months=[...new Set(dates.map(d=>d.slice(0,7)))];
    for(const month of months)for(const e of employees.filter(e=>e.status==='active'&&!e.deletedAt)){const target=employeeMonthlyTarget(e);if(!(target>0))continue;const h=[...base,...preview].filter(a=>same(a.employeeId,e.id)&&a.date.startsWith(month)).reduce((n,a)=>n+plannedAssignmentHours(a),0),k=month+'|'+target,list=hourGroups.get(k)||[];list.push(h);hourGroups.set(k,list);}
    const spread=Math.max(0,...[...hourGroups.values()].filter(h=>h.length>1).map(h=>Math.max(...h)-Math.min(...h))),stats=!prepared&&repairStats?.company===window.SFBackend?.companyId&&repairStats.ids===preview.map(a=>a.id).sort().join('|')?repairStats:null;
    let diagnosis=null;
    if(open.length&&window.SFAutoPlanRepairCore?.diagnose&&!unknown.length)diagnosis=withBase(base,()=>window.SFAutoPlanRepairCore.diagnose({slots:open,searchLimited:!!stats?.limited,eligible:slot=>employees.filter(e=>e.status==='active'&&!e.deletedAt&&(!e.startDate||slot.date>=e.startDate)&&(!e.contractEnd||slot.date<=e.contractEnd)&&!base.some(a=>same(a.employeeId,e.id)&&a.date===slot.date)&&!absent(e.id,slot.date)&&(slot.alternatives||[slot.type]).some(type=>(e.shifts||[]).includes(type)&&window.SFShiftModels?.allowsEmployee?.(type,e,slot.date)!==false&&(()=>{const r=window.sfRhythmCheck?.(e,type,slot.date);return r?.mode!=='required'||r.allowed})())).map(e=>e.id)}));
    return cached={key,errors,unknown,open,spread,diagnosis,checked:preview.length,blocked:!!(errors.length||unknown.length||prepared?.needsReplan),repair:stats};
  }
  function render(){
    const host=el('autoPlanAssurance');if(!host)return;
    host.hidden=!autoPlanAnalyzed||!!autoPlanApplied||!autoPlanPreview.length;if(host.hidden)return;
    const a=audit(),blocked=a.blocked,tone=blocked?'is-warning':a.open.length?'is-warning':'is-good';
    host.innerHTML=`<div class="sf-auto-status ${tone}"><b>${blocked?'Abschlussprüfung: Vorschlag noch nicht freigegeben':a.open.length?'Automatisch geprüft · offene Ausnahmen':'Vorschlag automatisch geprüft'}</b><p>${a.checked} vorgeschlagene Dienste gegen den vollständigen Vorschlag geprüft · ${a.errors.length} Regelkonflikte · ${a.open.length} Pflichtpositionen offen.</p>${a.repair?.closed?`<p>Automatisch nachgebessert: ${a.repair.closed} Pflichtlücken geschlossen${a.repair.swaps?' · '+a.repair.swaps+' Umbesetzungen mit Ersatzbesetzung':''}.</p>`:''}<p>Größter Stundenabstand bei gleichem Monats-SOLL: ${a.spread.toLocaleString('de-DE',{maximumFractionDigits:1})} h. Abweichungen können durch Dienstlängen, Freigaben und feste Vorgaben entstehen.</p>${a.unknown.map(r=>`<p>${esc(r)}</p>`).join('')}${a.errors.length?`<details><summary>Regelkonflikte ansehen (${a.errors.length})</summary><ul>${a.errors.slice(0,30).map(r=>`<li>${esc(r.date+' · '+r.type+' · '+(employees.find(e=>same(e.id,r.employeeId))?.personnelNo||r.employeeId))}: ${esc(r.reasons.join(' · '))}</li>`).join('')}</ul></details>`:''}${a.diagnosis?.shortfall?`<p><b>Nachgewiesener Kandidatenengpass:</b> Selbst wenn die sonstige flexible Vorplanung umverteilt wird, fehlen für ${a.diagnosis.shortfall} der untersuchten offenen Positionen passende Mitarbeiter unter den aktuellen Freigaben, Abwesenheiten und Rhythmen.</p>`:a.open.length?'<p>Die untersuchten Freigaben und Verfügbarkeiten belegen keinen reinen Kandidatenmangel. Weitere Kombinationen oder gemeinsame Stunden- und Erholungsregeln können entscheidend sein. Eine offene Position ist kein Nachweis der Unlösbarkeit.</p>':''}${a.open.length?'<p>Nur die offenen Ausnahmen benötigen eine Entscheidung. Gründe und passende Mitarbeiter stehen unter „Noch zu besetzen“.</p>':''}${a.repair?.limited?'<p>Das Budget für zusätzliche Umbesetzungen ist erreicht. Verbleibende Lücken sind kein Nachweis, dass keine Lösung existiert.</p>':''}<p>Vor dem Speichern wird erneut mit dem aktuellen Datenstand geprüft. Die Veröffentlichung erfolgt gesondert.</p></div>`;
    if(blocked&&el('applyAutoPlanBtn'))el('applyAutoPlanBtn').disabled=true;
  }
  const workspace=window.SFAutoPlanWorkspace;
  if(workspace){const original=workspace.render;workspace.render=function(){const value=original.apply(this,arguments);if(!window.SFAutoPlanProgress?.isBusy())render();return value;};}
  const apply=window.applyAutoPlanPreview;if(apply)window.applyAutoPlanPreview=function(){if(autoPlanPreview.length&&audit().blocked){showSaveToast('Vorschlag noch nicht freigegeben','Die Abschlussprüfung meldet Regelkonflikte oder eine unvollständige Prüfung. Bitte die angezeigten Ausnahmen beheben.');render();return;}return apply.apply(this,arguments);};
  window.SFAutoPlanAssurance={repair,audit,render};
})();
