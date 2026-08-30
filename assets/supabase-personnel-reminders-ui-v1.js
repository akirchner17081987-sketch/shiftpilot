// SchichtFunk – Personalakte Erinnerungsstatus V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__personnelReminderUiV1)return; B.__personnelReminderUiV1=true;
  const ADMIN=new Set(['OWNER','ADMIN']);

  function css(){
    if(document.getElementById('sfPersonnelReminderUiCss'))return;
    const s=document.createElement('style');
    s.id='sfPersonnelReminderUiCss';
    s.textContent=`
      .sf-prm-banner{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 12px;padding:10px 12px;border:1px solid #2b6256;background:linear-gradient(90deg,#0d2924,#0c202b);border-radius:10px;color:#cdeee5}
      .sf-prm-icon{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:#123a32;color:#79e5c8;font-size:14px;flex:0 0 auto}
      .sf-prm-copy{min-width:190px;flex:1}.sf-prm-copy b{display:block;font-size:10px}.sf-prm-copy span{display:block;margin-top:2px;color:#83a99f;font-size:8px}
      .sf-prm-chips{display:flex;gap:4px;flex-wrap:wrap}.sf-prm-chip{padding:3px 6px;border:1px solid #315d53;background:#102c27;border-radius:999px;color:#94dbc8;font-size:8px;font-weight:850}
      @media(max-width:620px){.sf-prm-banner{align-items:flex-start}.sf-prm-chips{width:100%}}
    `;
    document.head.appendChild(s);
  }

  function ensure(){
    if(!ADMIN.has(B.role))return;
    const modal=document.getElementById('sfPersonnelFile');
    const body=document.getElementById('sfPfBody');
    if(!modal||!body)return;
    const active=modal.querySelector('#sfPfTabs .sf-pf-tab.active[data-pftab]')?.dataset?.pftab;
    const relevant=active==='qualifications'||active==='documents';
    const old=body.querySelector('.sf-prm-banner');
    if(!relevant){old?.remove();return}
    if(old)return;
    css();
    const box=document.createElement('div');
    box.className='sf-prm-banner';
    box.innerHTML='<span class="sf-prm-icon">🔔</span><span class="sf-prm-copy"><b>Automatische Erinnerungen aktiv</b><span>Tägliche serverseitige Prüfung · Meldungen nur für OWNER/ADMIN · je Friststufe nur einmal</span></span><span class="sf-prm-chips"><span class="sf-prm-chip">90 Tage</span><span class="sf-prm-chip">60</span><span class="sf-prm-chip">30</span><span class="sf-prm-chip">14</span><span class="sf-prm-chip">7</span><span class="sf-prm-chip">1</span><span class="sf-prm-chip">Ablauf</span></span>';
    body.insertBefore(box,body.firstChild);
  }

  document.addEventListener('click',e=>{
    if(e.target.closest('#sfPersonnelOpen'))setTimeout(ensure,180);
    if(e.target.closest('#sfPfTabs [data-pftab]'))setTimeout(ensure,90);
  },true);
  setInterval(()=>{if(document.getElementById('sfPersonnelFile'))ensure()},1600);
  setTimeout(ensure,800);
})();
