// SchichtFunk – QR-Betriebsfreigabe V3 (Allgemein + Pilot)
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__qrOperationGuardV3)return;B.__qrOperationGuardV3=true;

  const ADMIN=new Set(['OWNER','ADMIN']);
  const MANAGER=new Set(['OWNER','ADMIN','DISPATCHER','PLANNER']);
  let terminals=[];
  let candidates=[];
  let loading=false;
  let scheduled=false;

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const same=(a,b)=>String(a||'')===String(b||'');
  const selectedIds=t=>Array.isArray(t?.pilot_employee_ids)?t.pilot_employee_ids.map(String):(t?.pilot_employee_id?[String(t.pilot_employee_id)]:[]);
  const isPilot=t=>t?.pilot_mode!==false;

  function css(){
    if(document.getElementById('sfQrPilotGuardCss'))return;
    const s=document.createElement('style');s.id='sfQrPilotGuardCss';s.textContent=`
      .sf-qr-pilot-banner{margin:0 0 11px;padding:10px 12px;border:1px solid #286a5a;border-radius:10px;background:#102d27;color:#a8ead9;font-size:10px;line-height:1.5}.sf-qr-pilot-banner b{color:#83e8ce}
      .sf-qrt-pilot{margin-top:9px;padding:10px;border:1px solid #29465b;border-radius:9px;background:#091725}.sf-qrt-pilot-head{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:7px}.sf-qrt-pilot-head b{font-size:10px;color:#cfe2ef}.sf-qrt-pilot-badge{display:inline-flex;align-items:center;padding:3px 7px;border-radius:999px;border:1px solid #286a5a;background:#102d27;color:#82e5ce;font-size:9px;font-weight:900}.sf-qrt-pilot-badge.pilot{border-color:#72582b;background:#2a2115;color:#ffd28f}.sf-qrt-pilot small{display:block;color:#8ca3b6;font-size:9px;line-height:1.5}.sf-qrt-pilot label{display:block;color:#9eb3c4;font-size:9px;font-weight:850}.sf-qrt-pilot select{width:min(520px,100%);margin-top:5px;background:#081624;border:1px solid #315268;color:#eef7ff;border-radius:8px;padding:7px 9px;font-size:10px}.sf-qrt-pilot select[multiple]{min-height:92px}.sf-qrt-pilot select:disabled{opacity:.62}.sf-qrt-pilot-warning{margin-top:7px;color:#ffc47a!important}.sf-qrt-pilot-note{margin-top:6px!important;color:#88a0b4!important}.sf-qrt-pilot-selected{margin-top:7px;display:flex;gap:5px;flex-wrap:wrap}.sf-qrt-pilot-chip{padding:3px 7px;border-radius:999px;background:#102d27;border:1px solid #286a5a;color:#82e5ce;font-size:9px;font-weight:800}.sf-qrt-mode-grid{display:grid;grid-template-columns:minmax(170px,260px) 1fr;gap:9px;align-items:start}.sf-qrt-mode-help{padding:8px 9px;border:1px solid #244257;border-radius:8px;background:#0b1a28;color:#8fa7ba;font-size:9px;line-height:1.5}
      @media(max-width:650px){.sf-qrt-mode-grid{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }

  function rpcUnavailable(error){return /could not find the function|schema cache|PGRST202|does not exist/i.test(String(error?.message||error||''))}

  function renderBanner(card){
    card.querySelector('#sfQrPilotBanner')?.remove();
    const banner=document.createElement('div');banner.id='sfQrPilotBanner';banner.className='sf-qr-pilot-banner';
    banner.innerHTML='<b>QR-Zeiterfassung betriebsbereit:</b> Jedes Objekt kann ein eigenes QR-Terminal erhalten. Im allgemeinen Betrieb dürfen aktive Mitarbeiter des Unternehmens mit persönlichem SchichtFunk-Login und passender veröffentlichter Schicht stempeln. Für kontrollierte Tests bleibt der Pilotmodus verfügbar.';
    const head=card.querySelector('.sf-qrt-head');if(head)head.insertAdjacentElement('afterend',banner);else card.prepend(banner);
  }

  function candidateLabel(c){const no=String(c.personnel_no||'').trim();return `${c.display_name||'Mitarbeiter'}${no?` · Pers.-Nr. ${no}`:''}`}
  function namesFor(t){if(Array.isArray(t?.pilot_employee_names)&&t.pilot_employee_names.length)return t.pilot_employee_names;const ids=selectedIds(t);return ids.map(id=>candidates.find(c=>same(c.id,id))?.display_name).filter(Boolean)}

  function decorateRow(row,t){
    row.querySelector('.sf-qrt-pilot')?.remove();
    const main=row.querySelector('.sf-qrt-main');if(!main)return;
    const box=document.createElement('div');box.className='sf-qrt-pilot';
    const pilot=isPilot(t),ids=selectedIds(t),names=namesFor(t),admin=ADMIN.has(B.role),active=!!t.is_active;
    const modeName=pilot?'Pilotbetrieb':'Allgemeiner Betrieb';
    const modeControl=admin
      ?`<label>Betriebsart<select data-qrt-mode data-terminal-id="${esc(t.id)}" ${active?'disabled':''}><option value="general" ${pilot?'':'selected'}>Allgemeiner Betrieb</option><option value="pilot" ${pilot?'selected':''}>Pilotbetrieb</option></select></label>`
      :`<div><small>Betriebsart</small><b style="font-size:11px">${modeName}</b></div>`;
    const modeHelp=pilot
      ?'Nur ausdrücklich ausgewählte Pilot-Mitarbeiter können an diesem Terminal buchen.'
      :'Alle aktiven Mitarbeiter dieses Unternehmens mit persönlichem Login und passender veröffentlichter Schicht können buchen.';

    let pilotControl='';
    if(pilot){
      if(admin){
        const opts=candidates.map(c=>`<option value="${esc(c.id)}" ${ids.some(id=>same(id,c.id))?'selected':''}>${esc(candidateLabel(c))}</option>`).join('');
        pilotControl=`<label style="margin-top:9px">Pilot-Mitarbeiter <span style="font-weight:500;color:#8097aa">(Mehrfachauswahl)</span><select multiple data-qrt-pilot-select data-terminal-id="${esc(t.id)}" ${active||!candidates.length?'disabled':''}>${opts}</select></label>`;
      }else pilotControl=`<small style="margin-top:8px">${ids.length?`${ids.length} Pilot-Mitarbeiter freigegeben.`:'Noch keine Pilot-Mitarbeiter freigegeben.'}</small>`;
    }
    const chips=pilot&&names.length?`<div class="sf-qrt-pilot-selected">${names.map(n=>`<span class="sf-qrt-pilot-chip">${esc(n)}</span>`).join('')}</div>`:'';
    box.innerHTML=`<div class="sf-qrt-pilot-head"><b>Betriebsfreigabe</b><span class="sf-qrt-pilot-badge ${pilot?'pilot':''}">${pilot?'PILOT':'ALLGEMEIN'}</span></div><div class="sf-qrt-mode-grid">${modeControl}<div class="sf-qrt-mode-help">${modeHelp}${active?'<br><b>Zum Ändern der Betriebsart Terminal zuerst deaktivieren.</b>':''}</div></div>${pilotControl}${chips}${pilot&&!candidates.length?'<small class="sf-qrt-pilot-warning">Kein Pilot-Mitarbeiter verfügbar: Status „aktiv“ und verknüpfter Login sind erforderlich.</small>':''}`;
    main.appendChild(box);

    box.querySelector('[data-qrt-mode]')?.addEventListener('change',async e=>{
      const nextPilot=e.target.value==='pilot';e.target.disabled=true;
      try{
        const q=await B.client.rpc('manager_set_time_qr_terminal_mode',{p_terminal_id:t.id,p_pilot_mode:nextPilot});
        if(q.error)throw q.error;
        if(typeof showSaveToast==='function')showSaveToast('QR-Betriebsart gespeichert',nextPilot?'Pilotbetrieb':'Allgemeiner Betrieb');
        await B.qrTerminalAdmin?.refresh?.();schedule(true);
      }catch(err){alert(String(err?.message||err||'Betriebsart konnte nicht geändert werden.'));schedule(true)}
    });

    box.querySelector('[data-qrt-pilot-select]')?.addEventListener('change',async e=>{
      const employeeIds=[...e.target.selectedOptions].map(o=>o.value).filter(Boolean);e.target.disabled=true;
      try{
        const q=await B.client.rpc('manager_set_time_qr_terminal_pilot_employees',{p_terminal_id:t.id,p_employee_ids:employeeIds});
        if(q.error)throw q.error;
        if(typeof showSaveToast==='function')showSaveToast('Pilotfreigabe gespeichert',employeeIds.length?`${employeeIds.length} Mitarbeiter freigegeben`:'Freigabe entfernt');
        await B.qrTerminalAdmin?.refresh?.();schedule(true);
      }catch(err){alert(String(err?.message||err||'Pilotfreigabe konnte nicht gespeichert werden.'));schedule(true)}
    });
  }

  function decorate(){
    const card=document.getElementById('sfQrTerminalAdmin');if(!card||!MANAGER.has(B.role))return;css();renderBanner(card);
    card.querySelectorAll('.sf-qrt-row[data-qrt-id]').forEach(row=>{const t=terminals.find(x=>same(x.id,row.dataset.qrtId));if(t)decorateRow(row,t)});
  }

  async function refresh(){
    const card=document.getElementById('sfQrTerminalAdmin');if(!card||!MANAGER.has(B.role)||!B.client||!B.companyId||loading)return;loading=true;
    try{
      const [tq,cq]=await Promise.all([
        B.client.rpc('manager_list_time_qr_terminals',{p_company_id:B.companyId}),
        B.client.rpc('manager_list_time_qr_pilot_candidates',{p_company_id:B.companyId})
      ]);
      if(tq.error)throw tq.error;if(cq.error)throw cq.error;
      terminals=Array.isArray(tq.data)?tq.data:[];candidates=Array.isArray(cq.data)?cq.data:[];decorate();
    }catch(err){if(!rpcUnavailable(err))console.warn('[SchichtFunk QR Betrieb]',err)}finally{loading=false}
  }

  function schedule(force=false){if(scheduled&&!force)return;scheduled=true;setTimeout(()=>{scheduled=false;refresh()},force?20:90)}

  // Nur Pilot-Terminals brauchen vor Aktivierung mindestens eine explizite Freigabe.
  document.addEventListener('click',e=>{
    const button=e.target.closest?.('#sfQrTerminalAdmin [data-qrt-toggle]');if(!button||!ADMIN.has(B.role))return;
    const row=button.closest('.sf-qrt-row[data-qrt-id]'),t=terminals.find(x=>same(x.id,row?.dataset.qrtId));
    if(!t||t.is_active||!isPilot(t))return;
    if(selectedIds(t).length<1){e.preventDefault();e.stopImmediatePropagation();alert(candidates.length?'Bitte zuerst mindestens einen Pilot-Mitarbeiter auswählen. Alternativ die Betriebsart auf „Allgemeiner Betrieb“ stellen.':'Pilotbetrieb kann noch nicht aktiviert werden: Zuerst einen aktiven Mitarbeiter mit SchichtFunk-Login einrichten.');}
  },true);

  const observer=new MutationObserver(records=>{const relevant=records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('#sfQrTerminalAdmin,.sf-qrt-row')||n.querySelector?.('#sfQrTerminalAdmin,.sf-qrt-row'))));if(relevant)schedule()});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-view="time"],[data-time-mode="qr"]'))schedule(true)},true);

  B.qrPilotGuard={refresh:()=>refresh()};
  B.qrOperationGuard={refresh:()=>refresh()};
  setTimeout(()=>schedule(true),1200);
})();
