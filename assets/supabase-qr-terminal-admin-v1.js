// SchichtFunk – QR-Terminal-Verwaltung V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__qrTerminalAdminV1)return;B.__qrTerminalAdminV1=true;

  const MANAGER=new Set(['OWNER','ADMIN','DISPATCHER','PLANNER']);
  const QR_LIB='/assets/vendor/qrcode-1.5.4.min.js';
  let terminals=[];
  let loading=false;
  let qrLibPromise=null;
  let pinSummary=null;
  let desktopAccess=new Map();

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const tz=()=>B.companyTimeZone||'Europe/Berlin';
  const fmt=v=>v?new Intl.DateTimeFormat('de-DE',{timeZone:tz(),day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(v)).replace('24:','00:'):'–';

  function css(){
    if(document.getElementById('sfQrTerminalAdminCss'))return;
    const s=document.createElement('style');s.id='sfQrTerminalAdminCss';s.textContent=`
      .sf-qrt-admin{container-type:inline-size;padding:17px 18px;margin:12px 0 14px;border-color:#295448;background:linear-gradient(145deg,#0e2423,#0b1b27)}
      .sf-qrt-head{display:flex;align-items:flex-start;gap:14px;justify-content:space-between;margin-bottom:14px}.sf-qrt-head h3{margin:2px 0 4px;font-size:16px}.sf-qrt-head p{margin:0;color:#92a9bb;font-size:12px;line-height:1.5}.sf-qrt-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:12px;background:#123b35;color:#68e4cb;font-size:20px;flex:0 0 auto}.sf-qrt-copy{flex:1;min-width:0}.sf-qrt-create{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:7px;min-width:0;width:min(610px,55%)}.sf-qrt-create input{min-width:0;background:#081624;border:1px solid #315268;color:#eef7ff;border-radius:9px;padding:9px 11px}.sf-qrt-create button{white-space:normal;min-width:0;align-self:end;min-height:44px}.sf-qrt-create>*{min-width:0;max-width:100%}
      .sf-qrt-list{display:flex;flex-direction:column;gap:8px}.sf-qrt-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 13px;border:1px solid #284558;border-radius:10px;background:#0a1825}.sf-qrt-main{min-width:0}.sf-qrt-main b{font-size:13px;overflow-wrap:anywhere}.sf-qrt-main small{display:block;margin-top:4px;color:#8299ad;font-size:10px;line-height:1.45}.sf-qrt-state{display:inline-flex;align-items:center;margin-left:7px;padding:3px 7px;border-radius:999px;border:1px solid #286b59;background:#103129;color:#83e8ce;font-size:9px;font-weight:900}.sf-qrt-state.off{border-color:#654831;background:#291d16;color:#eeb988}.sf-qrt-actions{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;width:28rem;align-self:start;min-width:0;max-width:100%}.sf-qrt-actions button{min-width:0;max-width:100%;min-height:44px;padding:9px 10px;white-space:normal;overflow-wrap:anywhere}.sf-qrt-empty{padding:13px;border:1px dashed #2c485e;border-radius:9px;color:#8299ad;text-align:center;font-size:11px}.sf-qrt-note{margin-top:10px;color:#7f96a9;font-size:10px;line-height:1.5}
      .sf-qrt-modal-back{position:fixed;inset:0;z-index:42000;background:rgba(2,7,13,.9);backdrop-filter:blur(8px);display:grid;place-items:center;padding:16px}.sf-qrt-modal{width:min(590px,96vw);max-height:94vh;overflow:auto;background:linear-gradient(180deg,#101f2d,#081522);border:1px solid #315069;border-radius:18px;box-shadow:0 30px 100px rgba(0,0,0,.64)}.sf-qrt-modal-head{padding:20px 22px 15px;border-bottom:1px solid #20384b}.sf-qrt-modal-head h2{margin:4px 0 5px}.sf-qrt-modal-head p{margin:0;color:#8da4b8;font-size:11px;line-height:1.5}.sf-qrt-modal-body{padding:20px 22px}.sf-qrt-modal-foot{padding:14px 22px;border-top:1px solid #20384b;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}.sf-qrt-canvas{display:grid;place-items:center;padding:18px;background:#fff;border-radius:14px;max-width:356px;margin:0 auto 14px}.sf-qrt-canvas canvas{max-width:100%;height:auto!important}.sf-qrt-url{padding:10px;border:1px solid #29465c;border-radius:9px;background:#081624;color:#9db1c2;font-size:10px;word-break:break-all;line-height:1.5}.sf-qrt-warning{margin-top:11px;padding:10px;border:1px solid #6d552b;border-radius:9px;background:#2b2215;color:#ffd18c;font-size:10px;line-height:1.5}
      .sf-qrt-pin-panel{display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:22px;margin:0 0 24px;border:1px solid #3f9d8c;border-left:4px solid #70e3c7;border-radius:16px;background:radial-gradient(ellipse at top left,#194a43 0,transparent 65%),#0b252b;box-shadow:0 10px 30px #0002;color:#eefaf6}
      .sf-qrt-pin-icon{width:52px;height:52px;display:grid;place-items:center;flex:none;border:1px solid #52ad97;border-radius:14px;background:#123e37;color:#9cf3da}.sf-qrt-pin-icon svg{width:28px;height:28px}.sf-qrt-pin-copy{flex:1;min-width:min(240px,100%)}.sf-qrt-pin-kicker{font-size:11px;font-weight:850;letter-spacing:.1em;color:#a8f1dc}.sf-qrt-pin-copy h2{margin:6px 0 8px;font-size:22px;line-height:1.25;color:inherit}.sf-qrt-pin-copy p{margin:0;font-size:14px;line-height:1.55;color:#c3dcd6}.sf-qrt-pin-status{display:block;margin-top:10px;font-size:12px;font-weight:700;color:#b7d7ce}.sf-qrt-pin-action{display:flex;flex-direction:column;align-items:center;gap:8px;max-width:100%}.sf-qrt-pin-panel button.sf-qrt-pin-button{min-height:50px;padding:13px 22px;border:1px solid #a0f5dc;border-radius:11px;background:#83e8cb;color:#082c25;font-size:15px;font-weight:850;line-height:1.35;white-space:normal;cursor:pointer;box-shadow:0 5px 18px #071e2340}.sf-qrt-pin-panel button.sf-qrt-pin-button:hover{background:#b0f6e0;transform:translateY(-1px)}.sf-qrt-pin-panel button.sf-qrt-pin-button:focus-visible{outline:3px solid #fff;outline-offset:4px}.sf-qrt-pin-action small{font-size:11px;color:#b9d3cc}
      html[data-sf-theme="light"] .sf-qrt-pin-panel{background:linear-gradient(125deg,#d1e9e2,#e0ebe9);border-color:#478b78;border-left-color:#176c55;color:#123c31}html[data-sf-theme="light"] .sf-qrt-pin-kicker{color:#266a56}html[data-sf-theme="light"] .sf-qrt-pin-copy p,html[data-sf-theme="light"] .sf-qrt-pin-status,html[data-sf-theme="light"] .sf-qrt-pin-action small{color:#325e50}html[data-sf-theme="light"] .sf-qrt-pin-icon{background:#bfdfd2;border-color:#6d9f8d;color:#18563f}html[data-sf-theme="light"] .sf-qrt-pin-panel button.sf-qrt-pin-button{background:#176c55;border-color:#176c55;color:#fff}html[data-sf-theme="light"] .sf-qrt-pin-panel button.sf-qrt-pin-button:hover{background:#0d5742}html[data-sf-theme="light"] .sf-qrt-pin-panel button.sf-qrt-pin-button:focus-visible{outline-color:#163e31}
      @container(max-width:650px){.sf-qrt-pin-panel{padding:18px;gap:12px}.sf-qrt-pin-copy{flex-basis:calc(100% - 70px);min-width:0}.sf-qrt-pin-copy h2{font-size:20px}.sf-qrt-pin-action{width:100%;align-items:stretch}.sf-qrt-pin-action small{text-align:center}.sf-qrt-pin-panel button.sf-qrt-pin-button{width:100%}}
      @container(max-width:900px){.sf-qrt-head{flex-wrap:wrap}.sf-qrt-create{width:100%;min-width:0}.sf-qrt-row{grid-template-columns:minmax(0,1fr)}.sf-qrt-actions{justify-self:start}}
      @container(max-width:520px){.sf-qrt-create{grid-template-columns:minmax(0,1fr)}.sf-qrt-actions{grid-template-columns:repeat(2,minmax(0,1fr));width:100%}}
      @media(max-width:980px){.sf-qrt-head{flex-wrap:wrap}.sf-qrt-create{width:100%;min-width:0}}
      @media(max-width:650px){.sf-qrt-create{grid-template-columns:1fr}.sf-qrt-row{grid-template-columns:1fr}.sf-qrt-actions{justify-content:flex-start}.sf-qrt-actions button{overflow-wrap:anywhere}.sf-qrt-modal-foot{justify-content:stretch}.sf-qrt-modal-foot button{flex:1}}
    `;document.head.appendChild(s);
  }

  function rpcError(error){
    const raw=String(error?.message||error||'');
    if(/could not find the function|schema cache|PGRST202|does not exist/i.test(raw))return 'Die QR-Zeiterfassung ist in der Datenbank noch nicht aktiviert.';
    return raw||'Die QR-Terminals konnten nicht geladen werden.';
  }

  function shell(){
    if(!MANAGER.has(B.role))return null;css();
    const view=document.getElementById('view-time');if(!view)return null;
    let card=document.getElementById('sfQrTerminalAdmin');
    if(!card){card=document.createElement('section');card.id='sfQrTerminalAdmin';card.className='card sf-qrt-admin';const anchor=document.getElementById('timeStats');view.insertBefore(card,anchor||view.children[1]||null)}
    return card;
  }

  async function loadQrLib(){
    if(window.QRCode?.toCanvas)return window.QRCode;
    if(qrLibPromise)return qrLibPromise;
    qrLibPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');s.src=QR_LIB;s.async=true;s.crossOrigin='anonymous';s.dataset.sfQrTerminalLib='1';s.onload=()=>window.QRCode?.toCanvas?resolve(window.QRCode):reject(new Error('QR-Bibliothek konnte nicht initialisiert werden.'));s.onerror=()=>reject(new Error('QR-Bibliothek konnte nicht geladen werden.'));document.head.appendChild(s);
    }).catch(e=>{qrLibPromise=null;throw e});
    return qrLibPromise;
  }

  function openQrModal(terminal,qrPath){
    css();document.getElementById('sfQrTerminalModal')?.remove();
    const url=new URL(qrPath,location.origin).toString();
    const back=document.createElement('div');back.id='sfQrTerminalModal';back.className='sf-qrt-modal-back';back.innerHTML=`<div class="sf-qrt-modal" role="dialog" aria-modal="true" aria-labelledby="sfQrtTitle" tabindex="-1"><div class="sf-qrt-modal-head"><div class="eyebrow">QR-ZEITERFASSUNG</div><h2 id="sfQrtTitle">${esc(terminal.name)}</h2><p>${esc(terminal.location_note||'QR-Stempelstation')}</p></div><div class="sf-qrt-modal-body"><div class="sf-qrt-canvas"><canvas id="sfQrtCanvas" width="320" height="320"></canvas></div><div class="sf-qrt-url">${esc(url)}</div><div class="sf-qrt-warning"><b>Wichtig:</b> Diesen QR-Code kannst du jederzeit erneut über „QR anzeigen“ öffnen. „QR erneuern“ macht den bisherigen Ausdruck sofort ungültig.${terminal.is_active===false?' Dieses Terminal ist deaktiviert; der Code funktioniert erst nach der Aktivierung.':''}</div></div><div class="sf-qrt-modal-foot"><button class="ghost" id="sfQrtClose">Schließen</button><button class="ghost" id="sfQrtSave">PNG speichern</button><button class="primary" id="sfQrtPrint">Drucken</button></div></div>`;document.body.appendChild(back);
    const close=B.bindAccessibleModal?.(back,{initialFocus:'button'})||(()=>back.remove());back.querySelector('#sfQrtClose').onclick=close;back.addEventListener('click',e=>{if(e.target===back)close()});
    loadQrLib().then(async QR=>{
      const canvas=back.querySelector('#sfQrtCanvas');await QR.toCanvas(canvas,url,{width:320,margin:2,errorCorrectionLevel:'M'});
      back.querySelector('#sfQrtSave').onclick=()=>{const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=`schichtfunk-qr-${String(terminal.name||'terminal').toLowerCase().replace(/[^a-z0-9äöüß]+/gi,'-').replace(/^-|-$/g,'')||'terminal'}.png`;a.click()};
      back.querySelector('#sfQrtPrint').onclick=()=>{const data=canvas.toDataURL('image/png'),w=window.open('','_blank','width=620,height=760');if(!w)return;w.document.write(`<!doctype html><html lang="de"><head><title>SchichtFunk QR – ${esc(terminal.name)}</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:36px;color:#10202d}img{width:360px;max-width:90vw}p{color:#526675}</style></head><body><h1>SchichtFunk</h1><h2>${esc(terminal.name)}</h2><p>${esc(terminal.location_note||'QR-Zeiterfassung')}</p><img src="${data}" alt="QR-Code"><p>Mit der Handy-Kamera scannen und mit Personalnummer und persönlicher PIN anmelden.</p><script>onload=()=>{print();setTimeout(()=>close(),300)}<\/script></body></html>`);w.document.close()};
    }).catch(e=>{back.querySelector('.sf-qrt-canvas').innerHTML=`<div style="color:#8b2637">${esc(e.message||String(e))}</div>`;back.querySelector('#sfQrtSave').disabled=true;back.querySelector('#sfQrtPrint').disabled=true});
  }

  function render(card,error=''){
    const rows=terminals.map(t=>`<div class="sf-qrt-row" data-qrt-id="${esc(t.id)}"><div class="sf-qrt-main"><b>${esc(t.name)} <span class="sf-qrt-state ${t.is_active?'':'off'}">${t.is_active?'● Aktiv':'○ Deaktiviert'}</span></b><label class="sf-qrt-site-control">Unternehmensstandort<select data-qrt-site ${window.SFCompanyProfile?.current()?.can_edit?'':'disabled'}>${window.SFCompanyProfile?.siteOptions(t.site_id)||'<option value="">Kein Standort zugeordnet</option>'}</select><button type="button" class="ghost" data-qrt-site-save ${window.SFCompanyProfile?.current()?.can_edit?'':'hidden disabled'}>Standort speichern</button></label><small>${esc(t.location_note||'Kein Standort-Hinweis')}<br>Zuletzt geändert: ${esc(fmt(t.updated_at))}</small></div><div class="sf-qrt-actions">${['OWNER','ADMIN'].includes(B.role)&&desktopAccess.has(t.id)?`<button class="ghost" data-qrt-desktop>PC-Zugang ${desktopAccess.get(t.id)?'ausschalten':'freigeben'}</button>`:''}<button class="primary" data-qrt-show>QR anzeigen</button><button class="ghost" data-qrt-rotate>QR erneuern</button><button class="ghost" data-qrt-toggle>${t.is_active?'Deaktivieren':'Aktivieren'}</button>${t.is_active?'':'<button class="ghost" data-qrt-delete>Löschen</button>'}</div></div>`).join('');
    const pinPanel=['OWNER','ADMIN'].includes(B.role)&&!B.client?.__sfDemoLocalClientV1?`<section id="sfQrPinAccess" class="sf-qrt-pin-panel" aria-labelledby="sfQrPinAccessTitle"><div class="sf-qrt-pin-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v5c0 5 8 10 8 10s8-5 8-10V6Z"/><path d="m8.5 12 2.3 2.3 4.7-5"/></svg></div><div class="sf-qrt-pin-copy"><div class="sf-qrt-pin-kicker">MITARBEITER-ZUGANG</div><h2 id="sfQrPinAccessTitle">Persönliche QR-PINs verwalten</h2><p>Hier richtest du Mitarbeiter-PINs ein, stellst neue Einrichtungscodes aus und aktivierst die PIN-Pflicht.</p><span id="sfQrPinAccessStatus" class="sf-qrt-pin-status" role="status">Einrichtungsstand und PIN-Pflicht in der Verwaltung prüfen</span></div><div class="sf-qrt-pin-action"><button type="button" id="sfQrPinAdminOpen" class="sf-qrt-pin-button">PIN-Verwaltung öffnen <span aria-hidden="true">→</span></button><small>Für Inhaber und Administratoren · mit MFA</small></div></section>`:'';
    card.innerHTML=pinPanel+`<div class="sf-qrt-head"><div class="sf-qrt-icon">▦</div><div class="sf-qrt-copy"><div class="eyebrow">QR-STEMPELSTATIONEN</div><h3>Beginn, Pausen & Ende am PC oder per QR-Code</h3><p>Der QR-Code identifiziert den Standort. Mitarbeiter melden sich mit Personalnummer und persönlicher PIN an; Beginn, Ende und bis zu zehn Pausen werden ohne Schichtbindung erfasst.</p></div><div class="sf-qrt-create"><input id="sfQrtName" maxlength="120" placeholder="Name, z. B. Objekt A"><input id="sfQrtLocation" maxlength="300" placeholder="Standort, z. B. Haupteingang"><label class="sf-qrt-site-control">Unternehmensstandort<select id="sfQrtSite">${window.SFCompanyProfile?.siteOptions()||'<option value="">Kein Standort zugeordnet</option>'}</select></label><button class="primary" id="sfQrtCreate">＋ Anlegen</button></div></div>${error?`<div class="sf-qrt-empty">${esc(error)}</div>`:`<div class="sf-qrt-list">${rows||'<div class="sf-qrt-empty">Noch kein QR-Terminal angelegt.</div>'}</div><div class="sf-qrt-note"><b>PC-Zugang</b> gibt den Betrieb und Terminalnamen für die Entry Page frei. Dort ist immer eine persönliche PIN erforderlich. <b>QR anzeigen</b> lädt den aktuellen Code aus dem sicheren Serverspeicher. Bei deaktivierten Terminals lässt er sich drucken, wird aber erst nach Aktivierung beim Scannen akzeptiert. <b>QR erneuern</b> macht den bisherigen Ausdruck sofort ungültig.</div>`}`;
    const pinButton=card.querySelector('#sfQrPinAdminOpen');if(pinButton)pinButton.onclick=openPinAdmin;updatePinSummary();
    const create=card.querySelector('#sfQrtCreate');if(create)create.onclick=()=>createTerminal(card.querySelector('#sfQrtName')?.value,card.querySelector('#sfQrtLocation')?.value,card.querySelector('#sfQrtSite')?.value||null);
    card.querySelectorAll('[data-qrt-id]').forEach(row=>{const t=terminals.find(x=>String(x.id)===row.dataset.qrtId);if(!t)return;row.querySelector('[data-qrt-site-save]')?.addEventListener('click',()=>saveTerminalSite(t,row));row.querySelector('[data-qrt-desktop]')?.addEventListener('click',()=>toggleDesktop(t));row.querySelector('[data-qrt-show]')?.addEventListener('click',()=>showTerminalQr(t));row.querySelector('[data-qrt-rotate]')?.addEventListener('click',()=>rotateTerminal(t));row.querySelector('[data-qrt-toggle]')?.addEventListener('click',()=>toggleTerminal(t));row.querySelector('[data-qrt-delete]')?.addEventListener('click',()=>deleteTerminal(t))});
  }

  async function refresh(){
    const card=shell();if(!card)return;
    if(!B.client||!B.companyId){render(card,'Cloud-Verbindung wird noch hergestellt …');return}
    if(loading)return;loading=true;card.innerHTML='<div class="sf-qrt-empty">QR-Terminals werden geladen …</div>';
    const companyId=B.companyId,userId=B.user?.id;
    const valid=()=>companyId===B.companyId&&userId===B.user?.id&&!B.companySwitching;
    try{
      if(!B.client?.__sfDemoLocalClientV1)await window.SFCompanyProfile?.load();
      if(!valid())return;
      const q=await B.client.rpc('manager_list_time_qr_terminals',{p_company_id:companyId});
      if(q.error)throw q.error;if(!valid())return;
      terminals=Array.isArray(q.data)?q.data:[];desktopAccess=new Map();
      if(['OWNER','ADMIN'].includes(B.role)&&!B.client?.__sfDemoLocalClientV1){
        const d=await B.client.rpc('manager_qr_desktop_access',{p_company_id:companyId});
        if(d.error)throw d.error;if(!valid())return;
        desktopAccess=new Map((Array.isArray(d.data)?d.data:[]).map(t=>[t.id,!!t.desktop_enabled]));
      }
      render(card);
    }catch(e){if(valid())render(card,rpcError(e))}finally{loading=false}
  }

  async function toggleDesktop(t){
    const companyId=B.companyId,userId=B.user?.id,enabled=desktopAccess.get(t.id);
    if(!confirm(enabled?'PC-Zugang für „'+t.name+'“ ausschalten? Der QR-Code bleibt nutzbar.':'PC-Zugang für „'+t.name+'“ freigeben? Der Betriebs- und Terminalname erscheint dann auf der öffentlichen Anmeldeseite. Buchungen erfordern immer die persönliche PIN.'))return;
    try{
      await B.requireSensitiveMfa?.();if(companyId!==B.companyId||userId!==B.user?.id||B.companySwitching)return;
      const q=await B.client.rpc('manager_qr_desktop_access',{p_company_id:companyId,p_terminal_id:t.id,p_enabled:!enabled,p_expected_enabled:enabled});
      if(q.error)throw q.error;if(companyId!==B.companyId||userId!==B.user?.id)return;await refresh();
    }catch(e){alert(rpcError(e))}
  }

  async function saveTerminalSite(t,row){
    if(B.companyProfileSaving)return;const companyId=B.companyId,userId=B.user?.id,siteId=row.querySelector('[data-qrt-site]').value||null;if(siteId===(t.site_id||null))return;
    B.companyProfileSaving=true;row.querySelectorAll('button,select').forEach(e=>e.disabled=true);
    try{const q=await B.client.rpc('manager_set_time_qr_terminal_site',{p_company_id:companyId,p_terminal_id:t.id,p_site_id:siteId,p_expected_site_id:t.site_id||null});if(q.error)throw q.error;if(companyId!==B.companyId||userId!==B.user?.id)return;await window.SFCompanyProfile?.load({force:true});await refresh();window.showSaveToast?.('Standort gespeichert',t.name)}catch(e){alert(rpcError(e))}finally{B.companyProfileSaving=false;if(row.isConnected)row.querySelectorAll('button,select').forEach(e=>e.disabled=false)}
  }
  async function createTerminal(name,locationNote,siteId=null){
    name=String(name||'').trim();locationNote=String(locationNote||'').trim();if(!name){document.getElementById('sfQrtName')?.focus();return}
    try{B.showLoading?.('QR-Terminal wird angelegt …');const q=await B.client.rpc(B.client?.__sfDemoLocalClientV1?'manager_create_time_qr_terminal':'manager_create_time_qr_terminal_at_site',{p_company_id:B.companyId,p_name:name,p_location_note:locationNote,...(B.client?.__sfDemoLocalClientV1?{}:{p_site_id:siteId})});if(q.error)throw q.error;await refresh();openQrModal({id:q.data.id,name:q.data.name,location_note:q.data.location_note||locationNote},q.data.qr_path);if(typeof showSaveToast==='function')showSaveToast('QR-Terminal angelegt',name)}catch(e){alert(rpcError(e))}finally{B.hideLoading?.()}
  }

  async function showTerminalQr(t){
    try{
      B.showLoading?.('QR-Code wird sicher geladen …');
      const q=await B.client.rpc('manager_get_time_qr_terminal_qr_path',{p_terminal_id:t.id});
      if(q.error)throw q.error;
      if(!q.data?.qr_path)throw new Error('QR-Code konnte nicht geladen werden.');
      openQrModal({...t,location_note:q.data.location_note||t.location_note},q.data.qr_path);
    }catch(e){
      const msg=rpcError(e);
      if(/nicht wiederherstellbar|Bitte QR erneuern/i.test(msg)){
        if(confirm(`Für „${t.name}“ liegt noch kein wiederherstellbarer QR-Schlüssel im sicheren Speicher. Soll jetzt ein neuer QR-Code erzeugt werden? Der bisherige Ausdruck wird dadurch ungültig.`))await rotateTerminal(t,true);
        return;
      }
      alert(msg);
    }finally{B.hideLoading?.()}
  }

  async function rotateTerminal(t,skipConfirm=false){
    if(!skipConfirm&&!confirm(`Neuen QR-Code für „${t.name}“ erzeugen? Der bisherige Ausdruck wird sofort ungültig.`))return;
    try{B.showLoading?.('QR-Code wird neu erzeugt …');const q=await B.client.rpc('manager_rotate_time_qr_terminal',{p_terminal_id:t.id});if(q.error)throw q.error;await refresh();openQrModal({...t,name:q.data.name||t.name},q.data.qr_path);if(typeof showSaveToast==='function')showSaveToast('Neuer QR-Code erzeugt',t.name)}catch(e){alert(rpcError(e))}finally{B.hideLoading?.()}
  }

  async function toggleTerminal(t){
    const next=!t.is_active;if(!confirm(`${t.name} ${next?'aktivieren':'deaktivieren'}?${next?'':' Der ausgehängte QR-Code ist danach nicht mehr nutzbar.'}`))return;
    try{B.showLoading?.(next?'Terminal wird aktiviert …':'Terminal wird deaktiviert …');const q=await B.client.rpc('manager_set_time_qr_terminal_active',{p_terminal_id:t.id,p_is_active:next});if(q.error)throw q.error;await refresh();if(typeof showSaveToast==='function')showSaveToast(next?'QR-Terminal aktiviert':'QR-Terminal deaktiviert',t.name)}catch(e){alert(rpcError(e))}finally{B.hideLoading?.()}
  }

  async function deleteTerminal(t){
    if(t.is_active)return;
    if(!confirm(`„${t.name}“ dauerhaft löschen? Der QR-Code wird ungültig. Terminals mit Zeitbuchungen können nicht gelöscht werden.`))return;
    try{
      B.showLoading?.('QR-Terminal wird gelöscht …');
      const q=await B.client.rpc('manager_delete_time_qr_terminal',{p_terminal_id:t.id});
      if(q.error)throw q.error;
      await refresh();
      if(typeof showSaveToast==='function')showSaveToast('QR-Terminal gelöscht',t.name);
    }catch(e){alert(rpcError(e))}finally{B.hideLoading?.()}
  }

  function updatePinSummary(){
    const el=document.getElementById('sfQrPinAccessStatus');if(!el)return;
    const current=pinSummary&&pinSummary.companyId===B.companyId&&pinSummary.userId===B.user?.id&&!B.companySwitching;
    el.textContent=current?`Zuletzt geprüft: ${pinSummary.ready} von ${pinSummary.total} PINs eingerichtet · ${pinSummary.required?'PIN-Pflicht aktiv':'Umstellung noch offen'}`:'Einrichtungsstand und PIN-Pflicht in der Verwaltung prüfen';
  }
  async function openPinAdmin(){
    const companyId=B.companyId,userId=B.user?.id;
    if(!['OWNER','ADMIN'].includes(B.role)||!companyId||B.companySwitching)return;
    try{
      await B.requireSensitiveMfa?.();
      if(companyId!==B.companyId||userId!==B.user?.id||B.companySwitching)return;
      const q=await B.client.rpc('manager_qr_pin_admin',{p_company_id:companyId,p_action:'STATUS',p_employee_id:null});
      if(q.error)throw q.error;
      if(companyId!==B.companyId||userId!==B.user?.id||B.companySwitching)return;
      showPinAdmin(q.data,companyId,userId);
    }catch(e){alert(rpcError(e))}
  }
  function showPinAdmin(data,companyId,userId){
    css();document.getElementById('sfQrPinAdminModal')?.remove();
    const rows=Array.isArray(data.employees)?data.employees:[],ready=rows.filter(e=>e.pin_ready).length;
    pinSummary={companyId,userId,ready,total:rows.length,required:!!data.pin_required};updatePinSummary();
    const unique=new Set(rows.map(e=>String(e.personnel_no||'').trim().toLowerCase()));
    const canEnable=rows.length>0&&ready===rows.length&&unique.size===rows.length&&rows.every(e=>String(e.personnel_no||'').trim());
    const back=document.createElement('div');back.id='sfQrPinAdminModal';back.className='sf-qrt-modal-back';
    back.innerHTML=`<div class="sf-qrt-modal" role="dialog" aria-modal="true" aria-labelledby="sfQrPinTitle" tabindex="-1"><div class="sf-qrt-modal-head"><div class="eyebrow">SICHERE QR-ANMELDUNG</div><h2 id="sfQrPinTitle">Persönliche PINs</h2><p>${data.pin_required?'PIN-Pflicht aktiv. Das Eintrittsdatum wird nicht mehr akzeptiert.':'Umstellung läuft. Das Eintrittsdatum bleibt nur für Personen ohne aktivierte PIN verfügbar.'}</p></div><div class="sf-qrt-modal-body"><p>${ready} von ${rows.length} aktiven Mitarbeitenden haben ihre PIN eingerichtet.</p><p style="font-size:12px;color:#9db1c2;line-height:1.5">1. Persönlichen Einrichtungscode erzeugen und vertraulich übergeben.<br>2. Mitarbeitende scannen den Standort-QR-Code und wählen „PIN mit Einrichtungscode einrichten“.<br>3. Sobald alle bereit sind, PIN-Pflicht aktivieren. Neue Mitarbeitende benötigen dann ebenfalls einen Einrichtungscode.</p><div class="sf-qrt-list" style="margin-top:14px">${rows.map(e=>`<div class="sf-qrt-row" data-pin-employee="${esc(e.employee_id)}" style="grid-template-columns:minmax(0,1fr) auto"><div class="sf-qrt-main"><b>${esc(e.name)}</b><small>Personalnummer: ${esc(e.personnel_no||'fehlt')} · ${e.pin_ready?'PIN eingerichtet':e.setup_pending?'Einrichtungscode ausgestellt':e.legacy_allowed?'PIN fehlt · Eintrittsdatum noch aktiv':'PIN fehlt · Einrichtung erforderlich'}</small></div><button type="button" class="ghost" data-pin-code ${e.personnel_no?'':'disabled'}>${e.pin_ready?'PIN zurücksetzen':'Einrichtungscode'}</button></div>`).join('')||'<p>Keine aktiven Mitarbeitenden.</p>'}</div><div id="sfQrPinResult" role="status" aria-live="polite" style="margin-top:12px;overflow-wrap:anywhere"></div></div><div class="sf-qrt-modal-foot"><button class="ghost" id="sfQrPinClose">Schließen</button>${data.pin_required?'':`<button class="primary" id="sfQrPinEnable" ${canEnable?'':'disabled'}>PIN-Pflicht für alle aktivieren</button>`}</div></div>`;
    document.body.appendChild(back);
    const close=B.bindAccessibleModal?.(back,{initialFocus:'#sfQrPinClose'})||(()=>back.remove());
    back.querySelector('#sfQrPinClose').onclick=close;
    back.addEventListener('click',e=>{if(e.target===back)close()});
    const valid=()=>companyId===B.companyId&&userId===B.user?.id&&!B.companySwitching&&back.isConnected;
    const result=back.querySelector('#sfQrPinResult');
    async function perform(action,employeeId=null){
      if(!valid())return;
      back.querySelectorAll('button').forEach(b=>b.disabled=true);result.textContent='Wird gespeichert …';
      try{
        await B.requireSensitiveMfa?.();if(!valid())return;
        const q=await B.client.rpc('manager_qr_pin_admin',{p_company_id:companyId,p_action:action,p_employee_id:employeeId});
        if(q.error)throw q.error;if(!valid())return;
        if(action==='ISSUE_CODE'){
          pinSummary=null;updatePinSummary();
          result.replaceChildren();
          const name=rows.find(e=>e.employee_id===employeeId)?.name||'';
          const title=document.createElement('p');title.textContent='Einmaliger Einrichtungscode für '+name+':';
          const code=document.createElement('strong');code.id='sfQrPinSetupCode';code.textContent=q.data.setup_code;code.style.cssText='display:block;font-size:26px;letter-spacing:.12em;margin:10px 0';
          const note=document.createElement('p');note.textContent='24 Stunden gültig, einmal verwendbar. Jetzt vertraulich übergeben. Beim Schließen verschwindet der Code; er kann später nicht erneut angezeigt werden.';
          result.append(title,code,note);
          const row=back.querySelector(`[data-pin-employee="${employeeId}"]`);if(row)row.querySelector('small').textContent='Neuer Einrichtungscode ausgestellt · PIN-Einrichtung erforderlich';
          const enable=back.querySelector('#sfQrPinEnable');if(enable)enable.dataset.stale='1';
        }else{close();showPinAdmin(q.data,companyId,userId)}
      }catch(e){if(valid())result.textContent=rpcError(e)}
      finally{if(valid())back.querySelectorAll('button').forEach(b=>{b.disabled=b.id==='sfQrPinEnable'?(!canEnable||b.dataset.stale==='1'):b.hasAttribute('data-pin-code')&&!rows.find(e=>e.employee_id===b.closest('[data-pin-employee]')?.dataset.pinEmployee)?.personnel_no})}
    }
    back.querySelectorAll('[data-pin-code]').forEach(button=>button.onclick=()=>{
      const employeeId=button.closest('[data-pin-employee]').dataset.pinEmployee;
      const person=rows.find(e=>e.employee_id===employeeId);
      if(!confirm(`Einrichtungscode für ${person?.name||'diese Person'} erzeugen? Ein bisheriger Code und bestehende QR-Anmeldungen werden ungültig. Eine bestehende PIN wird zurückgesetzt.`))return;
      perform('ISSUE_CODE',employeeId);
    });
    back.querySelector('#sfQrPinEnable')?.addEventListener('click',()=>{
      if(confirm('PIN-Pflicht für alle aktivieren? Ab dann ist keine Anmeldung mit Eintrittsdatum mehr möglich. Auch neue Mitarbeitende benötigen zuerst einen persönlichen Einrichtungscode.'))perform('ENABLE_REQUIRED');
    });
    // Remove a displayed code immediately on company/account change, including hidden tabs.
    const watcher=setInterval(()=>{if(!valid()){clearInterval(watcher);back.remove()}},250);
  }

  const baseRender=window.renderTimeTracking;
  if(typeof baseRender==='function'&&!baseRender.__sfQrtWrapped){const wrapped=async function(){const r=await baseRender.apply(this,arguments);await refresh();return r};wrapped.__sfQrtWrapped=true;window.renderTimeTracking=wrapped}
  document.addEventListener('click',e=>{if(e.target.closest('[data-view="time"]'))setTimeout(refresh,120)},true);
  B.qrTerminalAdmin={refresh};
  setTimeout(()=>{if(document.getElementById('view-time')?.classList.contains('active'))refresh()},1000);
})();

