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
      @media(max-width:1050px){.sf-legacy-row{grid-template-columns:1fr 1fr}.sf-legacy-row button{justify-self:start}}
      @media(max-width:680px){.sf-legacy-row{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }

  B.loadLegacyReview=async()=>{
    if(!B.companyId||!B.client)return [];
    const q=await B.client.from('audit_events')
      .select('id,created_at,metadata')
      .eq('company_id',B.companyId)
      .eq('event_type','LEGACY_ASSIGNMENT_IMPORTED_WITH_EXCEPTION')
      .order('created_at',{ascending:false});
    if(q.error)throw q.error;
    const aa=appAssignments(),ee=appEmployees();
    B.legacyReviewItems=(q.data||[]).map(row=>{
      const m=row.metadata||{},a=aa.find(x=>String(x.id)===String(m.legacy_id));
      const e=a?ee.find(x=>String(x.id)===String(a.employeeId)):null;
      return {id:row.id,legacyId:m.legacy_id||null,warning:m.warning||'',shiftCode:m.shift_code||a?.type||'–',startsAt:m.starts_at||null,endsAt:m.ends_at||null,assignment:a||null,employee:e||null};
    });
    B.renderLegacyReview();
    return B.legacyReviewItems;
  };

  B.openLegacyAssignment=(legacyId)=>{
    const item=B.legacyReviewItems.find(x=>String(x.legacyId)===String(legacyId));
    const date=item?.assignment?.date||(item?.startsAt?new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(item.startsAt)):null);
    try{
      if(date&&typeof weekStart!=='undefined'){
        const d=new Date(date+'T00:00:00');
        d.setDate(d.getDate()-((d.getDay()+6)%7));
        weekStart=d;
      }
    }catch{}
    if(typeof switchView==='function')switchView('schedule');
    if(typeof renderCalendar==='function')renderCalendar();
    document.querySelector('.main')?.scrollTo({top:0,behavior:'smooth'});
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
      const quick=page.querySelector('.card.table-card:last-child');
      if(quick)page.insertBefore(card,quick);else page.appendChild(card);
    }
    const items=B.legacyReviewItems||[];
    card.innerHTML=`<div class="table-head" style="align-items:center"><h3>Altbestand prüfen</h3><span class="badge" style="${items.length?'background:#8a5a18':'background:#17654f'}">${items.length}</span><span style="margin-left:auto;color:var(--muted);font-size:11px">Aus PostgreSQL · Audit-Log</span></div>${items.length?`<div style="display:flex;flex-direction:column;gap:8px">${items.map(x=>{const emp=x.employee?`${x.employee.first||''} ${x.employee.last||''}`.trim():'Mitarbeiter nicht zugeordnet';return `<div class="section-box sf-legacy-row"><div><b>${esc(emp)}</b><small style="display:block;color:#caa87a;margin-top:3px">${esc(x.shiftCode)} · ${esc(fmtDate(x.startsAt))}</small></div><div><b>${esc(fmtTime(x.startsAt))} – ${esc(fmtTime(x.endsAt))}</b><small class="sf-legacy-muted">übernommener Altbestand</small></div><div><span class="sf-legacy-reason">⚠ ${esc(reason(x.warning))}</span><small class="sf-legacy-muted">Neue Schichten werden weiterhin durch PostgreSQL blockiert, wenn diese Regel verletzt wird.</small></div><button class="ghost" onclick="SFBackend.openLegacyAssignment('${esc(x.legacyId)}')">Im Dienstplan anzeigen</button></div>`}).join('')}</div>`:'<div class="notice">✓ Keine prüfpflichtigen Alt-Schichten vorhanden.</div>'}`;
  };

  const oldOverview=window.renderOverview;
  if(typeof oldOverview==='function')window.renderOverview=function(){const r=oldOverview.apply(this,arguments);B.renderLegacyReview();return r};
  const baseHydrate=B.hydrate;
  if(typeof baseHydrate==='function')B.hydrate=async function(){const r=await baseHydrate.apply(this,arguments);await B.loadLegacyReview().catch(e=>console.error('Altbestand-Prüfung',e));return r};
})();