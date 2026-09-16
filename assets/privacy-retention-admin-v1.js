// SchichtFunk – Datenschutz / Aufbewahrungsfristen Admin V1
(function(){
  if(window.__sfPrivacyRetentionAdminV1)return;window.__sfPrivacyRetentionAdminV1=true;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const defaults={contactDays:30,planningYears:3,absenceYears:3,timeEvidenceYears:6,personnelYears:3,auditYears:3,monthSnapshotYears:6,datevAuditYears:6,deletePersonnelDocuments:false,deleteAuthAccount:false};
  let status=null,busy=false,privacyView=false;

  function canManage(){const B=window.SFBackend;return B?.ready&&B?.client&&B?.companyId&&['OWNER','ADMIN'].includes(B.role)}
  async function invoke(body){
    const B=window.SFBackend;
    const {data,error}=await B.client.functions.invoke('privacy-lifecycle',{body:{...body,companyId:B.companyId}});
    if(error){
      const context=error?.context;let payload=null;
      try{payload=context?await context.json():null}catch{}
      throw new Error(payload?.error||error.message||'Datenschutz-Anfrage fehlgeschlagen');
    }
    if(data?.error)throw new Error(data.error);
    return data;
  }
  async function refresh(){if(!canManage())return null;const data=await invoke({action:'retention-status'});status=data.status||null;return status}
  const fmt=v=>v?new Date(v).toLocaleString('de-DE'):'–';
  const ruleName={contactDays:'Kontaktdaten nach Austritt (Tage)',planningYears:'Dienstplanung (Jahre)',absenceYears:'Abwesenheiten (Jahre)',timeEvidenceYears:'Zeit-/Lohnnachweise (Jahre)',personnelYears:'Personalakten-Regelfrist (Jahre)',auditYears:'Audit-Nutzdaten (Jahre)',monthSnapshotYears:'Monatsabschlüsse/Snapshots (Jahre)',datevAuditYears:'DATEV-Export-Audit (Jahre)'};

  function css(){if(document.getElementById('sfPrivacyRetentionCss'))return;const s=document.createElement('style');s.id='sfPrivacyRetentionCss';s.textContent=`
  .sf-privacy-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.sf-privacy-card{border:1px solid #21394f;border-radius:11px;background:#0a1624;padding:14px}.sf-privacy-card.full{grid-column:1/-1}.sf-privacy-card h3{margin:0 0 5px;font-size:14px}.sf-privacy-card p{margin:0 0 12px;color:#8fa5ba;font-size:12px;line-height:1.5}.sf-privacy-status{display:inline-flex;padding:5px 8px;border-radius:999px;font-size:10px;font-weight:900;background:#203149;color:#bfd0e1}.sf-privacy-status.ok{background:#10382f;color:#6de5c3}.sf-privacy-status.wait{background:#3b2917;color:#ffd18c}.sf-privacy-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.sf-privacy-fields label{font-size:11px;color:#9fb3c7}.sf-privacy-fields input[type=number],.sf-privacy-fields input[type=text]{width:100%;min-height:38px;box-sizing:border-box;margin-top:5px;border:1px solid #29445d;border-radius:7px;background:#081522;color:#fff;padding:7px 9px}.sf-privacy-check{display:flex;gap:9px;align-items:flex-start;padding:9px;border:1px solid #20384e;border-radius:8px;background:#0c1927}.sf-privacy-check input{margin-top:2px}.sf-privacy-check small{display:block;color:#849bb1;margin-top:3px}.sf-privacy-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:14px}.sf-privacy-note{border:1px solid #5d4b2c;background:#2a2318;color:#e5c98f;border-radius:9px;padding:10px 12px;font-size:11px;line-height:1.5}.sf-privacy-error{border:1px solid #7c3442;background:#321923;color:#ffb4bf;border-radius:9px;padding:10px 12px;font-size:12px;margin-bottom:10px}.sf-privacy-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.sf-privacy-kpi{border:1px solid #20384e;border-radius:9px;padding:10px;background:#0c1927}.sf-privacy-kpi small{display:block;color:#849bb1}.sf-privacy-kpi b{font-size:18px}.sf-privacy-rules{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 14px}.sf-privacy-rules div{font-size:11px;color:#9db1c5}.sf-privacy-rules b{float:right;color:#e8f3fc}@media(max-width:650px){.sf-privacy-grid,.sf-privacy-fields,.sf-privacy-rules,.sf-privacy-kpis{grid-template-columns:1fr}}
  `;document.head.appendChild(s)}

  function installTab(){
    if(!canManage())return;
    const root=document.getElementById('sfSettingsV2'),nav=root?.querySelector('.sf-set-nav');if(!nav)return;
    if(nav.querySelector('[data-sf-privacy-tab]'))return;
    const b=document.createElement('button');b.type='button';b.dataset.sfPrivacyTab='1';b.innerHTML='<span>⌛</span><span>Datenschutz & Löschung</span>';
    const account=[...nav.querySelectorAll('button')].find(x=>x.dataset.settingTab==='account');nav.insertBefore(b,account||null);
    b.onclick=()=>{privacyView=true;renderPrivacy()};
  }

  async function renderPrivacy(){
    if(!canManage())return;css();installTab();
    const root=document.getElementById('sfSettingsV2'),body=document.getElementById('sfSettingBody');if(!root||!body)return;
    root.querySelectorAll('.sf-set-nav button').forEach(x=>x.classList.toggle('active',!!x.dataset.sfPrivacyTab));
    const head=root.querySelector('.sf-set-head');if(head)head.innerHTML='<div><div class="eyebrow">EINSTELLUNGEN</div><h2>Datenschutz & Löschung</h2><p>Aufbewahrungsfristen, Löschfreigaben und Legal Holds kontrollieren.</p></div><span class="status active">Geschützt</span>';
    body.innerHTML='<div class="sf-set-note">Datenschutzstatus wird geladen …</div>';
    try{await refresh();paint(body)}catch(e){body.innerHTML=`<div class="sf-privacy-error">${esc(e.message)}</div>`}
  }

  function paint(body){
    const profiles=status?.profiles||[],approved=profiles.find(p=>p.status==='APPROVED'),draft=profiles.find(p=>p.status==='DRAFT'),holds=status?.legal_holds||{},queue=status?.queue||{};
    const queueTotal=Object.values(queue).reduce((a,v)=>a+Number(v||0),0);
    body.innerHTML=`<div id="sfPrivacyError"></div><div class="sf-privacy-grid">
      <section class="sf-privacy-card full"><div class="sf-privacy-kpis"><div class="sf-privacy-kpi"><small>Fristprofil</small><b>${approved?'Aktiv':draft?'Entwurf':'Fehlt'}</b></div><div class="sf-privacy-kpi"><small>Offene Löschvorgänge</small><b>${queueTotal}</b></div><div class="sf-privacy-kpi"><small>Aktive Legal Holds</small><b>${Number(holds.active||0)}</b></div></div></section>
      ${approved?approvedCard(approved):draft?draftCard(draft):newProfileCard()}
      <section class="sf-privacy-card full"><h3>Sicherheitsprinzip</h3><p>Ein Fristprofil löst keine sofortige Löschung aus. Beschäftigtendaten werden nur über den geschützten Lifecycle-Prozess verarbeitet. Bei einem einzelnen OWNER gelten zwei AAL2-bestätigte Sitzungen, mindestens 24 Stunden Abkühlfrist und eine erneute unveränderte Prüfung.</p><div class="sf-privacy-note">Auth-Konto- und Personalakten-Storage-Löschung bleiben standardmäßig deaktiviert. Sie sollten erst nach kundenspezifischer Prüfung ausdrücklich eingeschaltet werden.</div></section>
    </div>`;
    bind(body,approved,draft);
  }
  function rulesView(r){return `<div class="sf-privacy-rules">${Object.keys(ruleName).map(k=>`<div>${esc(ruleName[k])}<b>${esc(r?.[k]??'–')}</b></div>`).join('')}<div>Personalakten-Dateien löschen<b>${r?.deletePersonnelDocuments?'Ja':'Nein'}</b></div><div>Auth-Konto löschen<b>${r?.deleteAuthAccount?'Ja':'Nein'}</b></div></div>`}
  function approvedCard(p){return `<section class="sf-privacy-card full"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><h3>Freigegebenes Fristprofil V${Number(p.version)}</h3><span class="sf-privacy-status ok">AKTIV</span></div><p>Freigegeben: ${esc(fmt(p.approved_at))}. Referenz: ${esc(p.approval_reference||'–')}</p>${rulesView(p.rules||{})}</section>`}
  function draftCard(p){const ready=p.confirmation_not_before&&Date.now()>=Date.parse(p.confirmation_not_before),expired=p.confirmation_expires_at&&Date.now()>Date.parse(p.confirmation_expires_at);return `<section class="sf-privacy-card full"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><h3>Fristprofil V${Number(p.version)} wartet auf zweite Bestätigung</h3><span class="sf-privacy-status wait">24H-SCHUTZ</span></div><p>Früheste Bestätigung: <b>${esc(fmt(p.confirmation_not_before))}</b> · Ablauf des Bestätigungsfensters: ${esc(fmt(p.confirmation_expires_at))}</p>${rulesView(p.rules||{})}<div class="sf-privacy-actions"><button class="primary" id="sfPrivacyConfirm" ${(!ready||expired||busy)?'disabled':''}>${expired?'Bestätigungsfenster abgelaufen':ready?'Fristprofil jetzt bestätigen':'Abkühlfrist läuft'}</button></div><div class="sf-privacy-note">Die Bestätigung muss aus einer anderen Auth-Sitzung erfolgen als die Vorbereitung. Das verhindert eine sofortige Ein-Personen-Freigabe.</div></section>`}
  function newProfileCard(){return `<section class="sf-privacy-card full"><h3>Fristprofil vorbereiten</h3><p>Die Werte sind die dokumentierten SchichtFunk-Zielwerte. Vor einem ersten Echtkunden müssen sie anhand des konkreten Verarbeitungszwecks und der Kundenweisung geprüft werden.</p><div class="sf-privacy-fields">${Object.keys(ruleName).map(k=>`<label>${esc(ruleName[k])}<input type="number" data-privacy-rule="${k}" min="${k==='contactDays'?0:k==='timeEvidenceYears'?2:1}" max="${k==='contactDays'?3650:20}" value="${defaults[k]}"></label>`).join('')}</div><div style="display:grid;gap:8px;margin-top:10px"><label class="sf-privacy-check"><input type="checkbox" data-privacy-bool="deletePersonnelDocuments"><span>Personalakten-Dateien nach freigegebener Frist löschen<small>Standardmäßig AUS. Erst nach Storage-/Kundenprüfung aktivieren.</small></span></label><label class="sf-privacy-check"><input type="checkbox" data-privacy-bool="deleteAuthAccount"><span>Supabase-Auth-Konto nach freigegebener Frist löschen<small>Standardmäßig AUS. Nur wenn keine andere zulässige Zuordnung mehr besteht.</small></span></label></div><label style="display:block;margin-top:10px;font-size:11px;color:#9fb3c7">Freigabereferenz<input type="text" id="sfPrivacyReference" value="SchichtFunk Lösch- und Aufbewahrungskonzept Version 1.0 – Betreiberprüfung" style="width:100%;min-height:38px;box-sizing:border-box;margin-top:5px;border:1px solid #29445d;border-radius:7px;background:#081522;color:#fff;padding:7px 9px"></label><div class="sf-privacy-actions"><button class="primary" id="sfPrivacyStage" ${busy?'disabled':''}>Fristprofil vorbereiten</button></div><div class="sf-privacy-note">Dieser Schritt löscht keine Daten. Er startet lediglich die geschützte 24-Stunden-Freigabe für das Fristprofil und verlangt MFA/AAL2.</div></section>`}

  function showError(body,msg){const e=body.querySelector('#sfPrivacyError');if(e)e.innerHTML=`<div class="sf-privacy-error">${esc(msg)}</div>`}
  function bind(body,approved,draft){
    body.querySelector('#sfPrivacyStage')?.addEventListener('click',async()=>{
      if(busy)return;const rules={};body.querySelectorAll('[data-privacy-rule]').forEach(i=>rules[i.dataset.privacyRule]=Number(i.value));body.querySelectorAll('[data-privacy-bool]').forEach(i=>rules[i.dataset.privacyBool]=!!i.checked);
      const approvalReference=body.querySelector('#sfPrivacyReference')?.value.trim()||'';busy=true;try{await invoke({action:'stage-retention-profile',version:Number(status?.next_version||1),rules,approvalReference});await refresh();paint(body);window.showSaveToast?.('Fristprofil vorbereitet','Die 24-Stunden-Schutzfrist wurde gestartet.')}catch(e){showError(body,errorText(e.message))}finally{busy=false}
    });
    body.querySelector('#sfPrivacyConfirm')?.addEventListener('click',async()=>{
      if(busy||!draft)return;busy=true;try{await invoke({action:'confirm-retention-profile',retentionProfileId:draft.id});await refresh();paint(body);window.showSaveToast?.('Fristprofil freigegeben','Das Aufbewahrungsprofil ist jetzt aktiv.')}catch(e){showError(body,errorText(e.message))}finally{busy=false}
    });
  }
  function errorText(code){return ({MFA_REQUIRED:'Für diese Aktion ist eine aktuelle MFA/AAL2-Anmeldung erforderlich.',NEW_AUTH_SESSION_REQUIRED:'Bitte abmelden und in einer neuen Sitzung erneut mit MFA anmelden. Die zweite Bestätigung darf nicht aus derselben Sitzung stammen.',SOLE_OWNER_COOLING_OFF_ACTIVE:'Die 24-Stunden-Schutzfrist ist noch nicht abgelaufen.',SOLE_OWNER_CONFIRMATION_EXPIRED:'Das 7-Tage-Bestätigungsfenster ist abgelaufen. Bitte ein neues Profil vorbereiten.',RETENTION_PROFILE_STAGE_FAILED:'Das Fristprofil konnte nicht vorbereitet werden. Bitte Werte und MFA-Status prüfen.',RETENTION_PROFILE_CONFIRMATION_FAILED:'Das Fristprofil konnte noch nicht bestätigt werden.'})[code]||code}

  const observer=new MutationObserver(()=>{installTab();if(privacyView&&!document.querySelector('[data-sf-privacy-tab].active'))privacyView=false});
  const start=()=>{css();installTab();observer.observe(document.body,{childList:true,subtree:true});document.addEventListener('click',e=>{if(e.target.closest('[data-setting-tab]'))privacyView=false})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
