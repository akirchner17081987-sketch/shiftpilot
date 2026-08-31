// SchichtFunk – PostgreSQL Altbestand-Prüfung V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  B.legacyReviewItems=[];

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const appAssignments=()=>typeof assignments!=='undefined'&&Array.isArray(assignments)?assignments:[];
  const appEmployees=()=>typeof employees!=='undefined'&&Array.isArray(employees)?employees:[];
  const reason=w=>({
    'Standard maximum shift duration exceeded':'Schichtdauer überschreitet die hinterlegte Standard-Maximaldauer',
    'Standard minimum rest period not met before shift':'Standard-Ruhezeit vor dieser Schicht unterschritten',
    'Standard minimum rest period not met after shift':'Standard-Ruhezeit nach dieser Schicht unterschritten',
    'Shift overlaps another assignment':'Überschneidung mit einer anderen Schicht',
    'Invalid shift interval':'Ungültiges Schichtintervall'
  }[w]||w||'Manuelle Prüfung erforderlich');
  const fmtDate=v=>{try{return new Date(v).toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/Berlin'})}catch{return v||'–'}};
  const fmtTime=v=>{try{return new Date(v).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Berlin'})}catch{return '–'}};

  function ensureCss(){
    if(document.getElementById('sfLegacyReviewCss'))return;
    const s=document.createElement('style');s.id='sfLegacyReviewCss';s.textContent=`
      .sf-legacy-row{display:grid;grid-template-columns:minmax(180px,1.25fr) minmax(135px,.8fr) minmax(250px,1.6fr) auto;gap:12px;align-items:center;border-color:#6d4a22!important;background:#241c13!important}
      .sf-legacy-reason{color:#ffc36f;font-weight:800}.sf-legacy-muted{display:block;color:#a99172;margin-top:3px}
      .sf-legacy-target{margin:0 0 12px;border:1px solid #8a5a18;border-radius:10px;background:#241c13;padding:12px 14px;color:#f4d6aa}
      .sf-legacy-target-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.sf-legacy-target b{color:#ffc36f}.sf-legacy-target small{display:block;margin-top:4px;color:#caa87a}
      .sf-legacy-target button{flex:0 0 auto}.sf-legacy-highlight{outline:3px solid #ffc36f!important;outline-offset:2px;animation:sfLegacyPulse 1.2s ease-in-out 2}
      .sf-legacy-actions{display:flex;gap:7px;justify-content:flex-end;align-items:center}.sf-legacy-resolve{border-color:#37695d!important;color:#83e2cb!important}.sf-legacy-all{margin-left:8px}
      .sf-legacy-clear{border-color:#23705d!important;background:#0e2b25!important;color:#83e2cb!important}
      @keyframes sfLegacyPulse{50%{filter:brightness(1.45)}}
      @media(max-width:1050px){.sf-legacy-row{grid-template-columns:1fr 1fr}.sf-legacy-row button{justify-self:start}}
      @media(max-width:680px){.sf-legacy-row{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }

  B.loadLegacyReview=async()=>{
    if(!B.companyId||!B.client)return [];
    const q=await B.client.from('audit_events')
      .select('id,created_at,metadata')
      .eq('company_id',B.companyId)
      .in('event_type',['LEGACY_ASSIGNMENT_IMPORTED_WITH_EXCEPTION','LEGACY_ASSIGNMENT_REVIEW_RESOLVED'])
      .order('created_at',{ascending:false});
    if(q.error)throw q.error;
    const aa=appAssignments(),ee=appEmployees();
    const resolved=new Set((q.data||[]).filter(row=>row.metadata?.source_event_id).map(row=>String(row.metadata.source_event_id)));
    const source=(q.data||[]).filter(row=>!row.metadata?.source_event_id&&!resolved.has(String(row.id)));
    const unique=new Map();source.forEach(row=>{const key=String(row.metadata?.legacy_id||row.id);if(!unique.has(key))unique.set(key,{...row,sourceIds:[row.id]});else unique.get(key).sourceIds.push(row.id)});
    B.legacyReviewItems=[...unique.values()].map(row=>{
      const m=row.metadata||{},a=aa.find(x=>String(x.id)===String(m.legacy_id));
      const e=a?ee.find(x=>String(x.id)===String(a.employeeId)):null;
      return {id:row.id,sourceIds:row.sourceIds,legacyId:m.legacy_id||null,warning:m.warning||'',shiftCode:m.shift_code||a?.type||'–',startsAt:m.starts_at||null,endsAt:m.ends_at||null,assignment:a||null,employee:e||null};
    });
    B.renderLegacyReview();
    return B.legacyReviewItems;
  };

  B.resolveLegacyReview=async(sourceIds)=>{
    const ids=Array.isArray(sourceIds)?sourceIds:[sourceIds];if(!ids.length||!B.client||!B.companyId)return;
    try{
      B.showLoading?.('Altbestand wird abgeschlossen …');
      const q=await B.client.rpc('manager_resolve_legacy_assignment_reviews',{p_company_id:B.companyId,p_source_event_ids:ids,p_note:'In der Altbestandsprüfung fachlich abgeschlossen'});
      if(q.error)throw q.error;
      await B.loadLegacyReview();
      if(typeof showSaveToast==='function')showSaveToast('Altbestand abgeschlossen',`${Number(q.data||0)} Prüfhinweis${Number(q.data||0)===1?' wurde':'e wurden'} revisionssicher erledigt.`);
    }catch(e){console.error('Altbestand abschließen',e);if(typeof showSaveToast==='function')showSaveToast('Abschluss fehlgeschlagen',e?.message||String(e))}finally{B.hideLoading?.()}
  };

  B.resolveAllOrphanedLegacy=()=>B.resolveLegacyReview((B.legacyReviewItems||[]).filter(x=>!x.assignment).flatMap(x=>x.sourceIds||[x.id]));

  B.openLegacyAssignment=(legacyId)=>{
    const item=B.legacyReviewItems.find(x=>String(x.legacyId)===String(legacyId));
    if(!item){if(typeof showSaveToast==='function')showSaveToast('Altbestand nicht gefunden','Der Eintrag wurde inzwischen entfernt oder neu geladen.');return}
    const date=item?.assignment?.date||(item?.startsAt?new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(item.startsAt)):null);
    try{
      if(date&&typeof weekStart!=='undefined'){
        const d=new Date(date+'T00:00:00');
        d.setDate(d.getDate()-((d.getDay()+6)%7));
        weekStart=d;
      }
    }catch{}
    const scheduleNav=document.querySelector('#nav [data-view="schedule"],.side-bottom [data-view="schedule"],[data-view="schedule"]');
    if(scheduleNav)scheduleNav.click();
    else if(typeof window.switchView==='function')window.switchView('schedule');
    B.pendingView='schedule';
    try{
      sessionStorage.setItem('sf_active_view_v1','schedule');
      const saved=JSON.parse(sessionStorage.getItem('sf_workspace_state_v2')||'{}')||{};
      sessionStorage.setItem('sf_workspace_state_v2',JSON.stringify({...saved,view:'schedule',savedAt:Date.now()}));
    }catch{}
    B.workspaceState?.snapshot?.();
    if(typeof renderCalendar==='function')renderCalendar();
    const schedule=document.getElementById('view-schedule');
    schedule?.querySelector('#sfLegacyTarget')?.remove();
    if(schedule){
      const banner=document.createElement('div');banner.id='sfLegacyTarget';banner.className='sf-legacy-target';
      const employee=item.employee?`${item.employee.first||''} ${item.employee.last||''}`.trim():'Mitarbeiter nicht mehr zugeordnet';
      banner.innerHTML=`<div class="sf-legacy-target-head"><div><b>Geöffneter Altbestand: ${esc(item.shiftCode)} · ${esc(fmtDate(item.startsAt))}</b><small>${esc(employee)} · ${esc(fmtTime(item.startsAt))} – ${esc(fmtTime(item.endsAt))} · ${esc(reason(item.warning))}</small>${item.assignment?'':'<small>Diese historische Schicht ist nicht mehr als aktive Zuweisung vorhanden und wird deshalb nur als Prüfhinweis angezeigt.</small>'}</div><button type="button" class="ghost" aria-label="Prüfhinweis schließen">Schließen</button></div>`;
      banner.querySelector('button').onclick=()=>banner.remove();
      const anchor=schedule.querySelector('.cal-toolbar')||schedule.firstElementChild;anchor?.insertAdjacentElement('afterend',banner);
    }
    setTimeout(()=>{
      let focused=false;
      if(item.assignment){
        const target=[...document.querySelectorAll('#calendarGrid .assignment')].find(el=>(el.getAttribute('onclick')||'').includes(`'${item.assignment.id}'`));
        if(target){target.classList.add('sf-legacy-highlight');target.scrollIntoView({block:'center',behavior:'smooth'});focused=true}
      }
      if(!focused)(document.getElementById('sfLegacyTarget')||document.getElementById('view-schedule'))?.scrollIntoView({block:'start',behavior:'smooth'});
    },0);
  };

  B.renderLegacyReview=()=>{
    ensureCss();
    const page=document.getElementById('view-overview');
    if(!page)return;
    let card=document.getElementById('sfLegacyReviewCard');
    if(!card){
      card=document.createElement('div');
      card.id='sfLegacyReviewCard';
      card.className='card table-card';
      card.style.marginTop='14px';
      const directCards=[...page.children].filter(el=>el.classList?.contains('card')&&el.classList?.contains('table-card'));
      const quick=directCards.length?directCards[directCards.length-1]:null;
      if(quick&&quick.parentNode===page)page.insertBefore(card,quick);else page.appendChild(card);
    }
    const items=B.legacyReviewItems||[];
    const orphanIds=items.filter(x=>!x.assignment).flatMap(x=>x.sourceIds||[x.id]);
    card.innerHTML=`<div class="table-head" style="align-items:center"><h3>Altbestand prüfen</h3><span class="badge" style="${items.length?'background:#8a5a18;color:#fff':'background:#17654f;color:#83e2cb'}">${items.length}</span><span style="margin-left:auto;color:var(--muted);font-size:11px">Aus PostgreSQL · Audit-Log</span>${orphanIds.length?'<button type="button" class="ghost sf-legacy-all" data-resolve-all>Verwaiste abschließen</button>':''}</div>${items.length?`<div style="display:flex;flex-direction:column;gap:8px">${items.map(x=>{const emp=x.employee?`${x.employee.first||''} ${x.employee.last||''}`.trim():'Mitarbeiter nicht mehr zugeordnet';return `<div class="section-box sf-legacy-row"><div><b>${esc(emp)}</b><small style="display:block;color:#caa87a;margin-top:3px">${esc(x.shiftCode)} · ${esc(fmtDate(x.startsAt))}</small></div><div><b>${esc(fmtTime(x.startsAt))} – ${esc(fmtTime(x.endsAt))}</b><small class="sf-legacy-muted">${x.assignment?'übernommener Altbestand':'historischer, gelöschter Datensatz'}</small></div><div><span class="sf-legacy-reason">⚠ ${esc(reason(x.warning))}</span><small class="sf-legacy-muted">${x.assignment?'Neue Schichten werden weiterhin durch PostgreSQL blockiert, wenn diese Regel verletzt wird.':'Der ursprüngliche Audit-Nachweis bleibt dauerhaft erhalten.'}</small></div><div class="sf-legacy-actions"><button type="button" class="ghost" data-open-legacy="${esc(x.legacyId)}">Im Dienstplan anzeigen</button><button type="button" class="ghost sf-legacy-resolve" data-resolve-legacy="${esc((x.sourceIds||[x.id]).join(','))}">Als geprüft erledigen</button></div></div>`}).join('')}</div>`:'<div class="notice sf-legacy-clear">✓ Keine prüfpflichtigen Alt-Schichten vorhanden.</div>'}`;
    card.querySelectorAll('[data-open-legacy]').forEach(b=>b.onclick=()=>B.openLegacyAssignment(b.dataset.openLegacy));
    card.querySelectorAll('[data-resolve-legacy]').forEach(b=>b.onclick=()=>B.resolveLegacyReview(b.dataset.resolveLegacy.split(',')));
    card.querySelector('[data-resolve-all]')?.addEventListener('click',B.resolveAllOrphanedLegacy);
  };

  const oldOverview=window.renderOverview;
  if(typeof oldOverview==='function')window.renderOverview=function(){const r=oldOverview.apply(this,arguments);B.renderLegacyReview();return r};
  const baseHydrate=B.hydrate;
  if(typeof baseHydrate==='function')B.hydrate=async function(){const r=await baseHydrate.apply(this,arguments);await B.loadLegacyReview().catch(e=>console.error('Altbestand-Prüfung',e));return r};
})();
