// SchichtFunk – QR-Terminal-Verwaltung V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__qrTerminalAdminV1)return;B.__qrTerminalAdminV1=true;

  const MANAGER=new Set(['OWNER','ADMIN','DISPATCHER','PLANNER']);
  const QR_LIB='https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js';
  let terminals=[];
  let loading=false;
  let qrLibPromise=null;

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tz=()=>B.companyTimeZone||'Europe/Berlin';
  const fmt=v=>v?new Intl.DateTimeFormat('de-DE',{timeZone:tz(),day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(v)).replace('24:','00:'):'–';

  function css(){
    if(document.getElementById('sfQrTerminalAdminCss'))return;
    const s=document.createElement('style');s.id='sfQrTerminalAdminCss';s.textContent=`
      .sf-qrt-admin{padding:17px 18px;margin:12px 0 14px;border-color:#295448;background:linear-gradient(145deg,#0e2423,#0b1b27)}
      .sf-qrt-head{display:flex;align-items:flex-start;gap:14px;justify-content:space-between;margin-bottom:14px}.sf-qrt-head h3{margin:2px 0 4px;font-size:16px}.sf-qrt-head p{margin:0;color:#92a9bb;font-size:12px;line-height:1.5}.sf-qrt-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:12px;background:#123b35;color:#68e4cb;font-size:20px;flex:0 0 auto}.sf-qrt-copy{flex:1}.sf-qrt-create{display:grid;grid-template-columns:minmax(140px,1fr) minmax(150px,1fr) auto;gap:7px;min-width:min(610px,55vw)}.sf-qrt-create input{min-width:0;background:#081624;border:1px solid #315268;color:#eef7ff;border-radius:9px;padding:9px 11px}.sf-qrt-create button{white-space:nowrap}
      .sf-qrt-list{display:flex;flex-direction:column;gap:8px}.sf-qrt-row{display:grid;grid-template-columns:minmax(190px,1fr) auto;gap:12px;align-items:center;padding:12px 13px;border:1px solid #284558;border-radius:10px;background:#0a1825}.sf-qrt-main b{font-size:13px}.sf-qrt-main small{display:block;margin-top:4px;color:#8299ad;font-size:10px;line-height:1.45}.sf-qrt-state{display:inline-flex;align-items:center;margin-left:7px;padding:3px 7px;border-radius:999px;border:1px solid #286b59;background:#103129;color:#83e8ce;font-size:9px;font-weight:900}.sf-qrt-state.off{border-color:#654831;background:#291d16;color:#eeb988}.sf-qrt-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.sf-qrt-empty{padding:13px;border:1px dashed #2c485e;border-radius:9px;color:#8299ad;text-align:center;font-size:11px}.sf-qrt-note{margin-top:10px;color:#7f96a9;font-size:10px;line-height:1.5}
      .sf-qrt-modal-back{position:fixed;inset:0;z-index:42000;background:rgba(2,7,13,.9);backdrop-filter:blur(8px);display:grid;place-items:center;padding:16px}.sf-qrt-modal{width:min(590px,96vw);max-height:94vh;overflow:auto;background:linear-gradient(180deg,#101f2d,#081522);border:1px solid #315069;border-radius:18px;box-shadow:0 30px 100px rgba(0,0,0,.64)}.sf-qrt-modal-head{padding:20px 22px 15px;border-bottom:1px solid #20384b}.sf-qrt-modal-head h2{margin:4px 0 5px}.sf-qrt-modal-head p{margin:0;color:#8da4b8;font-size:11px;line-height:1.5}.sf-qrt-modal-body{padding:20px 22px}.sf-qrt-modal-foot{padding:14px 22px;border-top:1px solid #20384b;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}.sf-qrt-canvas{display:grid;place-items:center;padding:18px;background:#fff;border-radius:14px;max-width:356px;margin:0 auto 14px}.sf-qrt-canvas canvas{max-width:100%;height:auto!important}.sf-qrt-url{padding:10px;border:1px solid #29465c;border-radius:9px;background:#081624;color:#9db1c2;font-size:10px;word-break:break-all;line-height:1.5}.sf-qrt-warning{margin-top:11px;padding:10px;border:1px solid #6d552b;border-radius:9px;background:#2b2215;color:#ffd18c;font-size:10px;line-height:1.5}
      @media(max-width:980px){.sf-qrt-head{flex-wrap:wrap}.sf-qrt-create{width:100%;min-width:0}}
      @media(max-width:650px){.sf-qrt-create{grid-template-columns:1fr}.sf-qrt-row{grid-template-columns:1fr}.sf-qrt-actions{justify-content:flex-start}.sf-qrt-actions button{flex:1}.sf-qrt-modal-foot{justify-content:stretch}.sf-qrt-modal-foot button{flex:1}}
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
    const back=document.createElement('div');back.id='sfQrTerminalModal';back.className='sf-qrt-modal-back';back.innerHTML=`<div class="sf-qrt-modal" role="dialog" aria-modal="true" aria-labelledby="sfQrtTitle" tabindex="-1"><div class="sf-qrt-modal-head"><div class="eyebrow">QR-ZEITERFASSUNG</div><h2 id="sfQrtTitle">${esc(terminal.name)}</h2><p>${esc(terminal.location_note||'QR-Stempelstation')}</p></div><div class="sf-qrt-modal-body"><div class="sf-qrt-canvas"><canvas id="sfQrtCanvas" width="320" height="320"></canvas></div><div class="sf-qrt-url">${esc(url)}</div><div class="sf-qrt-warning"><b>Wichtig:</b> Diesen QR-Code jetzt speichern oder drucken. SchichtFunk speichert den geheimen Terminalschlüssel nicht im Klartext. Ein neu erzeugter QR-Code macht den bisherigen Ausdruck sofort ungültig.</div></div><div class="sf-qrt-modal-foot"><button class="ghost" id="sfQrtClose">Schließen</button><button class="ghost" id="sfQrtSave">PNG speichern</button><button class="primary" id="sfQrtPrint">Drucken</button></div></div>`;document.body.appendChild(back);
    const close=B.bindAccessibleModal?.(back,{initialFocus:'button'})||(()=>back.remove());back.querySelector('#sfQrtClose').onclick=close;back.addEventListener('click',e=>{if(e.target===back)close()});
    loadQrLib().then(async QR=>{
      const canvas=back.querySelector('#sfQrtCanvas');await QR.toCanvas(canvas,url,{width:320,margin:2,errorCorrectionLevel:'M'});
      back.querySelector('#sfQrtSave').onclick=()=>{const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=`schichtfunk-qr-${String(terminal.name||'terminal').toLowerCase().replace(/[^a-z0-9äöüß]+/gi,'-').replace(/^-|-$/g,'')||'terminal'}.png`;a.click()};
      back.querySelector('#sfQrtPrint').onclick=()=>{const data=canvas.toDataURL('image/png'),w=window.open('','_blank','width=620,height=760');if(!w)return;w.document.write(`<!doctype html><html lang="de"><head><title>SchichtFunk QR – ${esc(terminal.name)}</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:36px;color:#10202d}img{width:360px;max-width:90vw}p{color:#526675}</style></head><body><h1>SchichtFunk</h1><h2>${esc(terminal.name)}</h2><p>${esc(terminal.location_note||'QR-Zeiterfassung')}</p><img src="${data}" alt="QR-Code"><p>Mit der Handy-Kamera scannen und mit dem persönlichen Mitarbeiterkonto anmelden.</p><script>onload=()=>{print();setTimeout(()=>close(),300)}<\/script></body></html>`);w.document.close()};
    }).catch(e=>{back.querySelector('.sf-qrt-canvas').innerHTML=`<div style="color:#8b2637">${esc(e.message||String(e))}</div>`;back.querySelector('#sfQrtSave').disabled=true;back.querySelector('#sfQrtPrint').disabled=true});
  }

  function render(card,error=''){
    const rows=terminals.map(t=>`<div class="sf-qrt-row" data-qrt-id="${esc(t.id)}"><div class="sf-qrt-main"><b>${esc(t.name)} <span class="sf-qrt-state ${t.is_active?'':'off'}">${t.is_active?'● Aktiv':'○ Deaktiviert'}</span></b><small>${esc(t.location_note||'Kein Standort-Hinweis')} · Startfenster ${Number(t.start_window_minutes||0)} Min. · Endfenster ${Number(t.end_window_minutes||0)} Min.<br>Zuletzt geändert: ${esc(fmt(t.updated_at))}</small></div><div class="sf-qrt-actions"><button class="ghost" data-qrt-rotate>QR neu erzeugen</button><button class="ghost" data-qrt-toggle>${t.is_active?'Deaktivieren':'Aktivieren'}</button></div></div>`).join('');
    card.innerHTML=`<div class="sf-qrt-head"><div class="sf-qrt-icon">▦</div><div class="sf-qrt-copy"><div class="eyebrow">QR-STEMPELSTATIONEN</div><h3>Dienstbeginn & Dienstende per QR-Code</h3><p>Der QR-Code identifiziert nur den Standort. Mitarbeiteridentität und Buchungszeit kommen aus dem persönlichen SchichtFunk-Konto und der Serverzeit.</p></div><div class="sf-qrt-create"><input id="sfQrtName" maxlength="120" placeholder="Name, z. B. Objekt A"><input id="sfQrtLocation" maxlength="300" placeholder="Standort, z. B. Haupteingang"><button class="primary" id="sfQrtCreate">＋ Anlegen</button></div></div>${error?`<div class="sf-qrt-empty">${esc(error)}</div>`:`<div class="sf-qrt-list">${rows||'<div class="sf-qrt-empty">Noch kein QR-Terminal angelegt.</div>'}</div><div class="sf-qrt-note">Ein bestehender QR-Code kann aus Sicherheitsgründen nicht erneut aus der Datenbank gelesen werden. Falls der Ausdruck verloren geht, einfach „QR neu erzeugen“ verwenden.</div>`}`;
    const create=card.querySelector('#sfQrtCreate');if(create)create.onclick=()=>createTerminal(card.querySelector('#sfQrtName')?.value,card.querySelector('#sfQrtLocation')?.value);
    card.querySelectorAll('[data-qrt-id]').forEach(row=>{const t=terminals.find(x=>String(x.id)===row.dataset.qrtId);if(!t)return;row.querySelector('[data-qrt-rotate]')?.addEventListener('click',()=>rotateTerminal(t));row.querySelector('[data-qrt-toggle]')?.addEventListener('click',()=>toggleTerminal(t))});
  }

  async function refresh(){
    const card=shell();if(!card)return;
    if(!B.client||!B.companyId){render(card,'Cloud-Verbindung wird noch hergestellt …');return}
    if(loading)return;loading=true;card.innerHTML='<div class="sf-qrt-empty">QR-Terminals werden geladen …</div>';
    try{const q=await B.client.rpc('manager_list_time_qr_terminals',{p_company_id:B.companyId});if(q.error)throw q.error;terminals=Array.isArray(q.data)?q.data:[];render(card)}catch(e){render(card,rpcError(e))}finally{loading=false}
  }

  async function createTerminal(name,locationNote){
    name=String(name||'').trim();locationNote=String(locationNote||'').trim();if(!name){document.getElementById('sfQrtName')?.focus();return}
    try{B.showLoading?.('QR-Terminal wird angelegt …');const q=await B.client.rpc('manager_create_time_qr_terminal',{p_company_id:B.companyId,p_name:name,p_location_note:locationNote});if(q.error)throw q.error;await refresh();openQrModal({name:q.data.name,location_note:q.data.location_note||locationNote},q.data.qr_path);if(typeof showSaveToast==='function')showSaveToast('QR-Terminal angelegt',name)}catch(e){alert(rpcError(e))}finally{B.hideLoading?.()}
  }

  async function rotateTerminal(t){
    if(!confirm(`Neuen QR-Code für „${t.name}“ erzeugen? Der bisherige Ausdruck wird sofort ungültig.`))return;
    try{B.showLoading?.('QR-Code wird neu erzeugt …');const q=await B.client.rpc('manager_rotate_time_qr_terminal',{p_terminal_id:t.id});if(q.error)throw q.error;await refresh();openQrModal({...t,name:q.data.name||t.name},q.data.qr_path);if(typeof showSaveToast==='function')showSaveToast('Neuer QR-Code erzeugt',t.name)}catch(e){alert(rpcError(e))}finally{B.hideLoading?.()}
  }

  async function toggleTerminal(t){
    const next=!t.is_active;if(!confirm(`${t.name} ${next?'aktivieren':'deaktivieren'}?${next?'':' Der ausgehängte QR-Code ist danach nicht mehr nutzbar.'}`))return;
    try{B.showLoading?.(next?'Terminal wird aktiviert …':'Terminal wird deaktiviert …');const q=await B.client.rpc('manager_set_time_qr_terminal_active',{p_terminal_id:t.id,p_is_active:next});if(q.error)throw q.error;await refresh();if(typeof showSaveToast==='function')showSaveToast(next?'QR-Terminal aktiviert':'QR-Terminal deaktiviert',t.name)}catch(e){alert(rpcError(e))}finally{B.hideLoading?.()}
  }

  const baseRender=window.renderTimeTracking;
  if(typeof baseRender==='function'&&!baseRender.__sfQrtWrapped){const wrapped=async function(){const r=await baseRender.apply(this,arguments);await refresh();return r};wrapped.__sfQrtWrapped=true;window.renderTimeTracking=wrapped}
  document.addEventListener('click',e=>{if(e.target.closest('[data-view="time"]'))setTimeout(refresh,120)},true);
  B.qrTerminalAdmin={refresh};
  setTimeout(()=>{if(document.getElementById('view-time')?.classList.contains('active'))refresh()},1000);
})();
