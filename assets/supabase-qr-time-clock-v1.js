// SchichtFunk – QR-Zeiterfassung V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__qrTimeClockV1)return;B.__qrTimeClockV1=true;

  const MANAGER=new Set(['OWNER','ADMIN','DISPATCHER','PLANNER']);
  const QR_LIB='https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js';
  let stations=[];
  let stationBusy=false;
  let employeeScanBusy=false;
  let employeeScanHandled=false;
  let qrLibPromise=null;

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tz=()=>B.companyTimeZone||'Europe/Berlin';
  const fmtDateTime=v=>v?new Intl.DateTimeFormat('de-DE',{timeZone:tz(),weekday:'short',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(v)).replace('24:','00:'):'–';
  const fmtTime=v=>v?new Intl.DateTimeFormat('de-DE',{timeZone:tz(),hour:'2-digit',minute:'2-digit'}).format(new Date(v)).replace('24:','00:'):'–';

  function css(){
    if(document.getElementById('sfQrClockCss'))return;
    const s=document.createElement('style');s.id='sfQrClockCss';s.textContent=`
      .sf-qr-admin{padding:17px 18px;margin:12px 0 14px;border-color:#295448;background:linear-gradient(145deg,#0e2423,#0b1b27)}
      .sf-qr-admin-head{display:flex;align-items:flex-start;gap:14px;justify-content:space-between;margin-bottom:14px}.sf-qr-admin-head h3{margin:2px 0 4px;font-size:16px}.sf-qr-admin-head p{margin:0;color:#92a9bb;font-size:12px;line-height:1.5}.sf-qr-admin-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:12px;background:#123b35;color:#68e4cb;font-size:20px;flex:0 0 auto}.sf-qr-admin-copy{flex:1}.sf-qr-create{display:flex;gap:8px;min-width:min(430px,44vw)}.sf-qr-create input{min-width:0;flex:1;background:#081624;border:1px solid #315268;color:#eef7ff;border-radius:9px;padding:9px 11px}.sf-qr-create button{white-space:nowrap}
      .sf-qr-list{display:flex;flex-direction:column;gap:8px}.sf-qr-row{display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:12px;align-items:center;padding:12px 13px;border:1px solid #284558;border-radius:10px;background:#0a1825}.sf-qr-row-main{min-width:0}.sf-qr-row-main b{display:block;font-size:13px}.sf-qr-row-main small{display:block;margin-top:4px;color:#8299ad;font-size:10px}.sf-qr-row-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.sf-qr-state{display:inline-flex;align-items:center;gap:5px;margin-left:8px;padding:3px 7px;border-radius:999px;border:1px solid #286b59;background:#103129;color:#83e8ce;font-size:9px;font-weight:900}.sf-qr-state.off{border-color:#654831;background:#291d16;color:#eeb988}.sf-qr-setup{padding:12px;border:1px dashed #625126;border-radius:9px;background:#282115;color:#ffd18b;font-size:11px;line-height:1.5}.sf-qr-empty{padding:13px;border:1px dashed #2c485e;border-radius:9px;color:#8299ad;text-align:center;font-size:11px}
      .sf-qr-modal-back{position:fixed;inset:0;z-index:42000;background:rgba(2,7,13,.9);backdrop-filter:blur(8px);display:grid;place-items:center;padding:16px}.sf-qr-modal{width:min(600px,96vw);max-height:94vh;overflow:auto;background:linear-gradient(180deg,#101f2d,#081522);border:1px solid #315069;border-radius:18px;box-shadow:0 30px 100px rgba(0,0,0,.64)}.sf-qr-modal-head{padding:20px 22px 15px;border-bottom:1px solid #20384b}.sf-qr-modal-head h2{margin:4px 0 5px}.sf-qr-modal-head p{margin:0;color:#8da4b8;font-size:11px;line-height:1.5}.sf-qr-modal-body{padding:20px 22px}.sf-qr-modal-foot{padding:14px 22px;border-top:1px solid #20384b;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}.sf-qr-modal-foot button{min-width:110px}.sf-qr-canvas-wrap{display:grid;place-items:center;padding:18px;background:#fff;border-radius:14px;max-width:356px;margin:0 auto 15px}.sf-qr-canvas-wrap canvas{max-width:100%;height:auto!important}.sf-qr-url{padding:10px 11px;border:1px solid #29465c;border-radius:9px;background:#081624;color:#9db1c2;font-size:10px;word-break:break-all;line-height:1.5}.sf-qr-note{margin-top:12px;padding:10px 11px;border:1px solid #6d552b;border-radius:9px;background:#2b2215;color:#ffd18c;font-size:10px;line-height:1.55}
      .sf-qr-employee{text-align:center}.sf-qr-clock-icon{width:74px;height:74px;margin:0 auto 15px;border-radius:23px;display:grid;place-items:center;background:#123d35;color:#71ead0;font-size:34px}.sf-qr-clock-icon.out{background:#342716;color:#ffd08a}.sf-qr-clock-station{color:#7f98ad;font-size:10px;text-transform:uppercase;letter-spacing:.12em;font-weight:900}.sf-qr-clock-title{font-size:25px;margin:6px 0 5px}.sf-qr-clock-shift{margin:15px auto 0;padding:13px;border:1px solid #29485d;border-radius:11px;background:#0a1927;max-width:430px}.sf-qr-clock-shift b{display:block;font-size:15px}.sf-qr-clock-shift small{display:block;margin-top:5px;color:#8ba1b5;font-size:11px}.sf-qr-server{margin-top:12px;color:#7991a5;font-size:10px}.sf-qr-success{color:#83ead0;font-weight:900}.sf-qr-error{padding:11px;border:1px solid #713845;border-radius:9px;background:#311923;color:#ffa4b2;font-size:11px;line-height:1.5}
      @media(max-width:850px){.sf-qr-admin-head{flex-wrap:wrap}.sf-qr-create{width:100%;min-width:0}.sf-qr-row{grid-template-columns:1fr}.sf-qr-row-actions{justify-content:flex-start}}
      @media(max-width:560px){.sf-qr-create{flex-direction:column}.sf-qr-create button{width:100%}.sf-qr-modal-foot{justify-content:stretch}.sf-qr-modal-foot button{flex:1}.sf-qr-row-actions button{flex:1}}
    `;document.head.appendChild(s);
  }

  function friendlyRpcError(error){
    const raw=String(error?.message||error||'');
    if(/could not find the function|schema cache|PGRST202|does not exist/i.test(raw))return 'Die QR-Zeiterfassung ist in der Datenbank noch nicht aktiviert.';
    return raw||'Die QR-Zeiterfassung konnte nicht geladen werden.';
  }

  function scanUrl(token){
    const u=new URL(location.origin+location.pathname);
    u.searchParams.set('sfqr',token);
    u.hash='app';
    return u.toString();
  }

  function scanToken(){
    try{return new URL(location.href).searchParams.get('sfqr')||''}catch{return''}
  }

  function clearScanToken(){
    try{const u=new URL(location.href);u.searchParams.delete('sfqr');history.replaceState(null,'',u.pathname+(u.search?u.search:'')+(u.hash||'#app'))}catch{}
  }

  function modal(title,subtitle,body){
    css();document.getElementById('sfQrClockModal')?.remove();
    const e=document.createElement('div');e.id='sfQrClockModal';e.className='sf-qr-modal-back';e.innerHTML=`<div class="sf-qr-modal" role="dialog" aria-modal="true" aria-labelledby="sfQrClockTitle" tabindex="-1"><div class="sf-qr-modal-head"><div class="eyebrow">QR-ZEITERFASSUNG</div><h2 id="sfQrClockTitle">${esc(title)}</h2><p>${esc(subtitle||'')}</p></div><div class="sf-qr-modal-body">${body||''}</div><div class="sf-qr-modal-foot" id="sfQrClockFoot"></div></div>`;document.body.appendChild(e);
    e.sfClose=B.bindAccessibleModal?.(e,{initialFocus:'button,input'})||(()=>e.remove());
    e.addEventListener('click',x=>{if(x.target===e)e.sfClose()});
    return e;
  }

  async function loadQrLib(){
    if(window.QRCode?.toCanvas)return window.QRCode;
    if(qrLibPromise)return qrLibPromise;
    qrLibPromise=new Promise((resolve,reject)=>{
      const found=document.querySelector('script[data-sf-qr-lib]');
      if(found){found.addEventListener('load',()=>resolve(window.QRCode),{once:true});found.addEventListener('error',reject,{once:true});return}
      const s=document.createElement('script');s.src=QR_LIB;s.async=true;s.crossOrigin='anonymous';s.dataset.sfQrLib='1';s.onload=()=>window.QRCode?.toCanvas?resolve(window.QRCode):reject(new Error('QR-Bibliothek konnte nicht initialisiert werden.'));s.onerror=()=>reject(new Error('QR-Bibliothek konnte nicht geladen werden.'));document.head.appendChild(s);
    }).catch(e=>{qrLibPromise=null;throw e});
    return qrLibPromise;
  }

  async function showQr(station,token){
    const url=scanUrl(token);
    const m=modal(`QR-Code · ${station.name}`,'Diesen Code am Einsatzort aushängen. Mitarbeitende scannen ihn mit der normalen Handy-Kamera.',`<div class="sf-qr-canvas-wrap"><canvas id="sfQrCanvas" width="320" height="320" aria-label="QR-Code für ${esc(station.name)}"></canvas></div><div class="sf-qr-url">${esc(url)}</div><div class="sf-qr-note"><b>Sicherheit:</b> Der QR-Code enthält keine Mitarbeiterdaten. Der Stationsschlüssel wird serverseitig nur gehasht gespeichert. Nach „QR erneuern“ ist der alte Code sofort ungültig.</div>`);
    const foot=m.querySelector('#sfQrClockFoot');foot.innerHTML='<button class="ghost" id="sfQrClose">Schließen</button><button class="ghost" id="sfQrSave">QR als PNG speichern</button><button class="primary" id="sfQrPrint">Drucken</button>';foot.querySelector('#sfQrClose').onclick=m.sfClose;
    try{
      const QR=await loadQrLib(),canvas=m.querySelector('#sfQrCanvas');
      await QR.toCanvas(canvas,url,{width:320,margin:2,errorCorrectionLevel:'M'});
      foot.querySelector('#sfQrSave').onclick=()=>{const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=`schichtfunk-qr-${String(station.name||'station').toLowerCase().replace(/[^a-z0-9äöüß]+/gi,'-').replace(/^-|-$/g,'')||'station'}.png`;a.click()};
      foot.querySelector('#sfQrPrint').onclick=()=>{const data=canvas.toDataURL('image/png'),w=window.open('','_blank','width=620,height=760');if(!w)return;w.document.write(`<!doctype html><html lang="de"><head><title>SchichtFunk QR – ${esc(station.name)}</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:35px;color:#10202d}img{width:360px;max-width:90vw}h1{margin-bottom:4px}p{color:#526675}</style></head><body><h1>SchichtFunk</h1><p>QR-Zeiterfassung · ${esc(station.name)}</p><img src="${data}" alt="QR-Code"><p>Mit der Handy-Kamera scannen und in SchichtFunk anmelden.</p><script>onload=()=>{print();setTimeout(()=>close(),300)}<\/script></body></html>`);w.document.close()};
    }catch(e){m.querySelector('.sf-qr-canvas-wrap').innerHTML=`<div class="sf-qr-error">${esc(e.message||String(e))}</div>`;foot.querySelector('#sfQrSave').disabled=true;foot.querySelector('#sfQrPrint').disabled=true}
  }

  function adminShell(){
    if(!MANAGER.has(B.role))return null;css();const view=document.getElementById('view-time');if(!view)return null;
    let card=document.getElementById('sfQrClockAdmin');
    if(!card){card=document.createElement('section');card.id='sfQrClockAdmin';card.className='card sf-qr-admin';const anchor=document.getElementById('timeStats');view.insertBefore(card,anchor||view.children[1]||null)}
    return card;
  }

  async function loadStations(){
    if(stationBusy||!MANAGER.has(B.role)||!B.client||!B.companyId)return stations;stationBusy=true;
    try{const q=await B.client.rpc('manager_list_time_clock_stations',{p_company_id:B.companyId});if(q.error)throw q.error;stations=q.data||[];return stations}finally{stationBusy=false}
  }

  function renderAdminContent(card,error=''){
    const rows=stations.map(s=>`<div class="sf-qr-row" data-sf-qr-station="${esc(s.id)}"><div class="sf-qr-row-main"><b>${esc(s.name)} <span class="sf-qr-state ${s.active?'':'off'}">${s.active?'● Aktiv':'○ Deaktiviert'}</span></b><small>${s.last_scan_at?`Letzter Scan: ${esc(fmtDateTime(s.last_scan_at))}`:'Noch kein Scan'} · angelegt ${esc(fmtDateTime(s.created_at))}</small></div><div class="sf-qr-row-actions"><button class="ghost" data-sf-qr-show ${s.active?'':'disabled'}>QR anzeigen</button><button class="ghost" data-sf-qr-rotate>QR erneuern</button><button class="ghost" data-sf-qr-toggle>${s.active?'Deaktivieren':'Aktivieren'}</button></div></div>`).join('');
    card.innerHTML=`<div class="sf-qr-admin-head"><div class="sf-qr-admin-icon">▦</div><div class="sf-qr-admin-copy"><div class="eyebrow">QR-STEMPELSTATIONEN</div><h3>Dienstbeginn & Dienstende per QR-Code</h3><p>Ein QR-Code je Standort oder Stempelpunkt. Mitarbeitende scannen mit der Handy-Kamera und bestätigen die Buchung in ihrem geschützten SchichtFunk-Zugang.</p></div><div class="sf-qr-create"><input id="sfQrStationName" maxlength="80" placeholder="z. B. Haupteingang Objekt A"><button class="primary" id="sfQrStationCreate">＋ Station anlegen</button></div></div>${error?`<div class="sf-qr-setup">${esc(error)}</div>`:`<div class="sf-qr-list">${rows||'<div class="sf-qr-empty">Noch keine QR-Stempelstation angelegt.</div>'}</div>`}`;
    const create=card.querySelector('#sfQrStationCreate'),input=card.querySelector('#sfQrStationName');
    if(create){create.onclick=()=>createStation(input?.value||'');input?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();create.click()}})}
    card.querySelectorAll('[data-sf-qr-station]').forEach(row=>{
      const id=row.dataset.sfQrStation,s=stations.find(x=>String(x.id)===String(id));if(!s)return;
      row.querySelector('[data-sf-qr-show]')?.addEventListener('click',()=>rotateStation(s,true));
      row.querySelector('[data-sf-qr-rotate]')?.addEventListener('click',()=>rotateStation(s,false));
      row.querySelector('[data-sf-qr-toggle]')?.addEventListener('click',()=>toggleStation(s));
    });
  }

  async function renderAdmin(){
    const card=adminShell();if(!card)return;
    if(!B.client||!B.companyId){renderAdminContent(card,'Cloud-Verbindung wird noch hergestellt …');return}
    card.innerHTML='<div class="sf-qr-empty">QR-Stempelstationen werden geladen …</div>';
    try{await loadStations();renderAdminContent(card)}catch(e){renderAdminContent(card,friendlyRpcError(e))}
  }

  async function createStation(name){
    name=String(name||'').trim();if(!name){document.getElementById('sfQrStationName')?.focus();return}
    try{B.showLoading?.('QR-Stempelstation wird angelegt …');const q=await B.client.rpc('manager_create_time_clock_station',{p_company_id:B.companyId,p_name:name});if(q.error)throw q.error;await loadStations();renderAdminContent(adminShell());const station={id:q.data.id,name:q.data.name,active:q.data.active};await showQr(station,q.data.token);B.notifications?.refresh?.();if(typeof showSaveToast==='function')showSaveToast('QR-Stempelstation angelegt',`${name} ist einsatzbereit.`)}catch(e){alert(friendlyRpcError(e))}finally{B.hideLoading?.()}
  }

  async function rotateStation(station,showOnly){
    const text=showOnly?'Der Stationsschlüssel wird aus Sicherheitsgründen nicht dauerhaft im Browser gespeichert. Um den QR-Code erneut anzuzeigen, wird ein neuer Schlüssel erzeugt und der bisherige QR-Code ungültig. Fortfahren?':`QR-Code für „${station.name}“ erneuern? Der bisherige Ausdruck wird dadurch sofort ungültig.`;
    if(!confirm(text))return;
    try{B.showLoading?.('QR-Code wird erneuert …');const q=await B.client.rpc('manager_rotate_time_clock_station',{p_station_id:station.id});if(q.error)throw q.error;await loadStations();renderAdminContent(adminShell());await showQr({id:q.data.id,name:q.data.name,active:q.data.active},q.data.token);if(typeof showSaveToast==='function')showSaveToast('QR-Code erneuert',`Der bisherige Code für ${station.name} ist nicht mehr gültig.`)}catch(e){alert(friendlyRpcError(e))}finally{B.hideLoading?.()}
  }

  async function toggleStation(station){
    const next=!station.active;if(!confirm(`${station.name} ${next?'aktivieren':'deaktivieren'}?${next?'':' Der ausgehängte QR-Code kann danach nicht mehr verwendet werden.'}`))return;
    try{B.showLoading?.(next?'Station wird aktiviert …':'Station wird deaktiviert …');const q=await B.client.rpc('manager_set_time_clock_station_active',{p_station_id:station.id,p_active:next});if(q.error)throw q.error;await loadStations();renderAdminContent(adminShell());if(typeof showSaveToast==='function')showSaveToast(next?'Station aktiviert':'Station deaktiviert',station.name)}catch(e){alert(friendlyRpcError(e))}finally{B.hideLoading?.()}
  }

  function employeeStateBody(state){
    const out=state.action==='CLOCK_OUT',none=state.action==='NONE';
    if(none)return `<div class="sf-qr-employee"><div class="sf-qr-clock-icon out">!</div><div class="sf-qr-clock-station">${esc(state.stationName||'Stempelstation')}</div><h3 class="sf-qr-clock-title">Keine passende Schicht</h3><div class="sf-qr-error">${esc(state.message||'Für diesen Zeitpunkt wurde keine passende veröffentlichte Schicht gefunden.')}</div><div class="sf-qr-server">Serverzeit: ${esc(fmtDateTime(state.serverTime))}</div></div>`;
    return `<div class="sf-qr-employee"><div class="sf-qr-clock-icon ${out?'out':''}">${out?'■':'▶'}</div><div class="sf-qr-clock-station">${esc(state.stationName||'Stempelstation')}</div><h3 class="sf-qr-clock-title">${out?'Dienstende erfassen':'Dienstbeginn erfassen'}</h3><p>${out?'Der zweite Scan beendet deine laufende Arbeitszeit.':'Der Zeitstempel wird erst nach deiner Bestätigung serverseitig gesetzt.'}</p><div class="sf-qr-clock-shift"><b>${esc(state.shiftCode||'Schicht')}</b><small>Geplant: ${esc(fmtDateTime(state.plannedStart))} – ${esc(fmtTime(state.plannedEnd))}${out&&state.actualStart?`<br>Beginn erfasst: ${esc(fmtDateTime(state.actualStart))}`:''}</small></div><div class="sf-qr-server">Serverzeit: ${esc(fmtDateTime(state.serverTime))}</div></div>`;
  }

  async function showEmployeeState(token,state){
    const out=state.action==='CLOCK_OUT',none=state.action==='NONE';
    const m=modal(out?'Dienstende bestätigen':none?'QR-Zeiterfassung':'Dienstbeginn bestätigen',state.stationName||'SchichtFunk Stempelstation',employeeStateBody(state));
    const foot=m.querySelector('#sfQrClockFoot');foot.innerHTML=`<button class="ghost" id="sfQrCancel">Schließen</button>${none?'':`<button class="primary" id="sfQrCommit">${out?'■ Dienstende buchen':'▶ Dienstbeginn buchen'}</button>`}`;
    foot.querySelector('#sfQrCancel').onclick=()=>{clearScanToken();m.sfClose()};
    const commit=foot.querySelector('#sfQrCommit');if(!commit)return;
    commit.onclick=async()=>{
      if(employeeScanBusy)return;employeeScanBusy=true;commit.disabled=true;
      try{B.showLoading?.(out?'Dienstende wird gebucht …':'Dienstbeginn wird gebucht …');const q=await B.client.rpc('employee_qr_clock',{p_token:token});if(q.error)throw q.error;const r=q.data||{};clearScanToken();m.querySelector('.sf-qr-modal-body').innerHTML=`<div class="sf-qr-employee"><div class="sf-qr-clock-icon ${r.event==='CLOCK_OUT'?'out':''}">✓</div><div class="sf-qr-clock-station">${esc(r.stationName||state.stationName||'Stempelstation')}</div><h3 class="sf-qr-clock-title sf-qr-success">${r.duplicate?'Bereits gebucht':r.event==='CLOCK_OUT'?'Dienstende erfasst':'Dienstbeginn erfasst'}</h3><p>${esc(r.message||'Die Buchung wurde gespeichert.')}</p><div class="sf-qr-clock-shift"><b>${esc(r.shiftCode||state.shiftCode||'Schicht')}</b><small>Zeitstempel: ${esc(fmtDateTime(r.occurredAt))}</small></div></div>`;foot.innerHTML='<button class="primary" id="sfQrDone">Fertig</button>';foot.querySelector('#sfQrDone').onclick=m.sfClose;await B.timeTracking?.refreshEmployee?.();B.notifications?.refresh?.();if(typeof showSaveToast==='function')showSaveToast(r.event==='CLOCK_OUT'?'Dienstende erfasst':'Dienstbeginn erfasst',fmtDateTime(r.occurredAt))}catch(e){m.querySelector('.sf-qr-modal-body').insertAdjacentHTML('beforeend',`<div class="sf-qr-error" style="margin-top:12px">${esc(friendlyRpcError(e))}</div>`);commit.disabled=false}finally{B.hideLoading?.();employeeScanBusy=false}
    };
  }

  async function attemptEmployeeScan(){
    const token=scanToken();if(!token||employeeScanHandled)return;
    if(!B.client||!B.ready||!B.role)return;
    employeeScanHandled=true;
    if(B.role!=='EMPLOYEE'){
      const m=modal('Mitarbeiterzugang erforderlich','Dieser QR-Code ist für die persönliche Zeiterfassung vorgesehen.','<div class="sf-qr-error">Bitte mit einem Mitarbeiterkonto anmelden. Verwaltungszugänge können keine persönliche QR-Buchung ausführen.</div>');m.querySelector('#sfQrClockFoot').innerHTML='<button class="primary" id="sfQrWrongRole">Schließen</button>';m.querySelector('#sfQrWrongRole').onclick=()=>{clearScanToken();m.sfClose()};return;
    }
    try{B.showLoading?.('QR-Stempelstation wird geprüft …');const q=await B.client.rpc('employee_qr_clock_state',{p_token:token});if(q.error)throw q.error;await showEmployeeState(token,q.data||{})}catch(e){const m=modal('QR-Code konnte nicht geprüft werden','SchichtFunk QR-Zeiterfassung',`<div class="sf-qr-error">${esc(friendlyRpcError(e))}</div>`);m.querySelector('#sfQrClockFoot').innerHTML='<button class="primary" id="sfQrErrorClose">Schließen</button>';m.querySelector('#sfQrErrorClose').onclick=()=>{clearScanToken();m.sfClose()}}finally{B.hideLoading?.()}
  }

  const baseRender=window.renderTimeTracking;
  if(typeof baseRender==='function'&&!baseRender.__sfQrWrapped){const wrapped=async function(){const r=await baseRender.apply(this,arguments);await renderAdmin();return r};wrapped.__sfQrWrapped=true;window.renderTimeTracking=wrapped}
  document.addEventListener('click',e=>{if(e.target.closest('[data-view="time"]'))setTimeout(renderAdmin,120)},true);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){setTimeout(attemptEmployeeScan,80);if(document.getElementById('view-time')?.classList.contains('active'))setTimeout(renderAdmin,100)}});

  B.qrTimeClock={renderAdmin,attemptEmployeeScan};
  let attempts=0;const timer=setInterval(()=>{attempts++;attemptEmployeeScan();if((employeeScanHandled&&!scanToken())||attempts>120)clearInterval(timer)},250);
  setTimeout(()=>{if(document.getElementById('view-time')?.classList.contains('active'))renderAdmin()},1000);
})();
