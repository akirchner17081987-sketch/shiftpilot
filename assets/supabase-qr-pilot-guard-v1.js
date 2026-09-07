// SchichtFunk – kontrollierte QR-Pilotfreigabe V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__qrPilotGuardV1)return;B.__qrPilotGuardV1=true;

  const ADMIN=new Set(['OWNER','ADMIN']);
  const MANAGER=new Set(['OWNER','ADMIN','DISPATCHER','PLANNER']);
  let terminals=[];
  let candidates=[];
  let loading=false;
  let scheduled=false;

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const same=(a,b)=>String(a||'')===String(b||'');

  function css(){
    if(document.getElementById('sfQrPilotGuardCss'))return;
    const s=document.createElement('style');s.id='sfQrPilotGuardCss';s.textContent=`
      .sf-qr-pilot-banner{margin:0 0 11px;padding:10px 12px;border:1px solid #72582b;border-radius:10px;background:#2a2115;color:#ffd28f;font-size:10px;line-height:1.5}
      .sf-qr-pilot-banner.good{border-color:#286a5a;background:#102d27;color:#82e5ce}.sf-qr-pilot-banner b{color:inherit}
      .sf-qrt-pilot{margin-top:9px;padding:9px 10px;border:1px solid #29465b;border-radius:9px;background:#091725}.sf-qrt-pilot-head{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:7px}.sf-qrt-pilot-head b{font-size:10px;color:#cfe2ef}.sf-qrt-pilot-badge{display:inline-flex;align-items:center;padding:3px 7px;border-radius:999px;border:1px solid #72582b;background:#2a2115;color:#ffd28f;font-size:9px;font-weight:900}.sf-qrt-pilot-badge.ready{border-color:#286a5a;background:#102d27;color:#82e5ce}.sf-qrt-pilot small{display:block;color:#8ca3b6;font-size:9px;line-height:1.45}.sf-qrt-pilot label{display:block;color:#9eb3c4;font-size:9px;font-weight:850}.sf-qrt-pilot select{width:min(430px,100%);margin-top:5px;min-height:36px;background:#081624;border:1px solid #315268;color:#eef7ff;border-radius:8px;padding:7px 9px;font-size:10px}.sf-qrt-pilot select:disabled{opacity:.62}.sf-qrt-pilot-warning{margin-top:7px;color:#ffc47a!important}.sf-qrt-pilot-note{margin-top:6px!important;color:#88a0b4!important}
    `;document.head.appendChild(s);
  }

  function rpcUnavailable(error){
    return /could not find the function|schema cache|PGRST202|does not exist/i.test(String(error?.message||error||''));
  }

  function renderBanner(card){
    card.querySelector('#sfQrPilotBanner')?.remove();
    const ready=candidates.length>0;
    const banner=document.createElement('div');banner.id='sfQrPilotBanner';banner.className='sf-qr-pilot-banner'+(ready?' good':'');
    banner.innerHTML=ready
      ?'<b>Kontrollierter Pilotbetrieb:</b> Nur der je Terminal ausdrücklich freigegebene Pilot-Mitarbeiter kann stempeln. Neue Terminals bleiben bis zur Freigabe deaktiviert.'
      :'<b>Pilot noch nicht startbereit:</b> Es ist derzeit kein aktiver Mitarbeiter mit verknüpftem SchichtFunk-Login verfügbar. Bitte zuerst einen Mitarbeiterzugang vollständig aktivieren.';
    const head=card.querySelector('.sf-qrt-head');
    if(head)head.insertAdjacentElement('afterend',banner);else card.prepend(banner);
  }

  function candidateLabel(c){
    const no=String(c.personnel_no||'').trim();
    return `${c.display_name||'Mitarbeiter'}${no?` · Pers.-Nr. ${no}`:''}`;
  }

  function decorateRow(row,t){
    if(row.querySelector('.sf-qrt-pilot'))return;
    const main=row.querySelector('.sf-qrt-main');if(!main)return;
    const box=document.createElement('div');box.className='sf-qrt-pilot';
    const selected=candidates.find(c=>same(c.id,t.pilot_employee_id));
    const selectedName=t.pilot_employee_name||selected?.display_name||'';
    const ready=!!t.pilot_employee_id;
    const admin=ADMIN.has(B.role);
    const active=!!t.is_active;

    let control='';
    if(admin){
      const opts=['<option value="">Bitte Pilot-Mitarbeiter wählen …</option>']
        .concat(candidates.map(c=>`<option value="${esc(c.id)}" ${same(c.id,t.pilot_employee_id)?'selected':''}>${esc(candidateLabel(c))}</option>`)).join('');
      control=`<label>Pilot-Mitarbeiter<select data-qrt-pilot-select data-terminal-id="${esc(t.id)}" ${active||!candidates.length?'disabled':''}>${opts}</select></label>`;
    }else{
      control=`<small>${ready?`Freigegeben für: ${esc(selectedName||'Pilot-Mitarbeiter')}`:'Noch kein Pilot-Mitarbeiter freigegeben.'}</small>`;
    }

    box.innerHTML=`<div class="sf-qrt-pilot-head"><b>Pilotfreigabe</b><span class="sf-qrt-pilot-badge ${ready?'ready':''}">${ready?'✓ Mitarbeiter gewählt':'Noch gesperrt'}</span></div>${control}${!candidates.length?'<small class="sf-qrt-pilot-warning">Kein freigabefähiger Mitarbeiter vorhanden: Status „aktiv“ und verknüpfter Login sind erforderlich.</small>':''}${admin&&active?'<small class="sf-qrt-pilot-note">Zum Wechseln des Pilot-Mitarbeiters das Terminal zuerst deaktivieren.</small>':''}`;
    main.appendChild(box);

    const select=box.querySelector('[data-qrt-pilot-select]');
    if(select)select.addEventListener('change',async e=>{
      const employeeId=e.target.value||null;
      e.target.disabled=true;
      try{
        const q=await B.client.rpc('manager_set_time_qr_terminal_pilot_employee',{p_terminal_id:t.id,p_employee_id:employeeId});
        if(q.error)throw q.error;
        if(typeof showSaveToast==='function')showSaveToast('Pilotfreigabe gespeichert',employeeId?'Mitarbeiter freigegeben':'Freigabe entfernt');
        await B.qrTerminalAdmin?.refresh?.();
        schedule(true);
      }catch(err){
        alert(String(err?.message||err||'Pilotfreigabe konnte nicht gespeichert werden.'));
        schedule(true);
      }
    });
  }

  function decorate(){
    const card=document.getElementById('sfQrTerminalAdmin');
    if(!card||!MANAGER.has(B.role))return;
    css();renderBanner(card);
    card.querySelectorAll('.sf-qrt-row[data-qrt-id]').forEach(row=>{
      const t=terminals.find(x=>same(x.id,row.dataset.qrtId));
      if(t)decorateRow(row,t);
    });
  }

  async function refresh(force=false){
    const card=document.getElementById('sfQrTerminalAdmin');
    if(!card||!MANAGER.has(B.role)||!B.client||!B.companyId)return;
    const undecorated=[...card.querySelectorAll('.sf-qrt-row[data-qrt-id]')].some(r=>!r.querySelector('.sf-qrt-pilot'));
    if(!force&&!undecorated&&card.querySelector('#sfQrPilotBanner'))return;
    if(loading)return;loading=true;
    try{
      const [tq,cq]=await Promise.all([
        B.client.rpc('manager_list_time_qr_terminals',{p_company_id:B.companyId}),
        B.client.rpc('manager_list_time_qr_pilot_candidates',{p_company_id:B.companyId})
      ]);
      if(tq.error)throw tq.error;
      if(cq.error)throw cq.error;
      terminals=Array.isArray(tq.data)?tq.data:[];
      candidates=Array.isArray(cq.data)?cq.data:[];
      decorate();
    }catch(err){
      if(!rpcUnavailable(err))console.warn('[SchichtFunk QR Pilot]',err);
    }finally{loading=false}
  }

  function schedule(force=false){
    if(scheduled&&!force)return;scheduled=true;
    setTimeout(()=>{scheduled=false;refresh(force)},force?20:90);
  }

  // UX-Sperre zusätzlich zur serverseitigen Prüfung: Ohne Pilot-Mitarbeiter darf
  // ein deaktiviertes Terminal nicht aktiviert werden.
  document.addEventListener('click',e=>{
    const button=e.target.closest?.('#sfQrTerminalAdmin [data-qrt-toggle]');
    if(!button||!ADMIN.has(B.role))return;
    const row=button.closest('.sf-qrt-row[data-qrt-id]');
    const t=terminals.find(x=>same(x.id,row?.dataset.qrtId));
    if(!t||t.is_active)return;
    if(!t.pilot_employee_id){
      e.preventDefault();e.stopImmediatePropagation();
      alert(candidates.length
        ?'Bitte zuerst einen Pilot-Mitarbeiter auswählen. Erst danach kann das QR-Terminal aktiviert werden.'
        :'Pilot kann noch nicht aktiviert werden: Zuerst einen aktiven Mitarbeiter mit SchichtFunk-Login einrichten.');
    }
  },true);

  const observer=new MutationObserver(records=>{
    const relevant=records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('#sfQrTerminalAdmin,.sf-qrt-row')||n.querySelector?.('#sfQrTerminalAdmin,.sf-qrt-row'))));
    if(relevant)schedule();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-view="time"],[data-time-mode="qr"]'))schedule(true)},true);

  B.qrPilotGuard={refresh:()=>refresh(true)};
  setTimeout(()=>schedule(true),1200);
})();
