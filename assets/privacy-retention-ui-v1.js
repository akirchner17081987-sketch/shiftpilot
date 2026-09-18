// SchichtFunk – geschützte Verwaltung des Datenschutz-/Aufbewahrungsprofils
(function(){
  if(window.__sfPrivacyRetentionUiV1)return;window.__sfPrivacyRetentionUiV1=true;
  const DEFAULT_RULES=Object.freeze({
    contactDays:30,planningYears:3,absenceYears:3,timeEvidenceYears:6,personnelYears:3,
    auditYears:3,monthSnapshotYears:6,datevAuditYears:6,
    deletePersonnelDocuments:false,deleteAuthAccount:false
  });
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const deDate=value=>value?new Date(value).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'}):'—';
  const B=()=>window.SFBackend||{};
  const C=()=>window.SFCompliance||{};

  async function invoke(body){
    const backend=B();
    if(!backend.client||!backend.companyId)throw new Error('Cloud-Verbindung ist noch nicht bereit.');
    const {data,error}=await backend.client.functions.invoke('privacy-lifecycle',{body:{...body,companyId:backend.companyId}});
    if(error){
      let detail='';
      try{detail=String((await error.context?.json?.())?.error||'')}catch{}
      const map={
        MFA_REQUIRED:'Bitte den zweiten Faktor bestätigen.',
        RETENTION_PROFILE_STAGE_FAILED:'Das Fristprofil konnte nicht vorbereitet werden.',
        RETENTION_PROFILE_REPLACEMENT_FAILED:'Der veraltete Entwurf konnte nicht sicher ersetzt werden.',
        RETENTION_PROFILE_CONFIRMATION_FAILED:'Die zweite Freigabe konnte noch nicht abgeschlossen werden.',
        SESSION_REQUIRED:'Bitte neu anmelden und den zweiten Faktor erneut bestätigen.'
      };
      throw new Error(map[detail]||detail||error.message||'Datenschutz-Aktion fehlgeschlagen.');
    }
    if(data?.error)throw new Error(String(data.error));
    return data;
  }

  async function aal2(){
    const backend=B();
    if(typeof backend.requireMfaChallenge==='function')await backend.requireMfaChallenge();
    const level=await backend.client?.auth?.mfa?.getAuthenticatorAssuranceLevel?.();
    if(level?.error)throw level.error;
    if(level?.data?.currentLevel!=='aal2')throw new Error('Für diese Freigabe ist eine bestätigte MFA-Sitzung erforderlich.');
  }

  const rulesSummary=rules=>[
    ['Kontakt-/Offboarding-Fenster',`${rules.contactDays} Tage`],
    ['Dienstplanung',`${rules.planningYears} Jahre`],
    ['Abwesenheiten',`${rules.absenceYears} Jahre`],
    ['Zeitnachweise',`${rules.timeEvidenceYears} Jahre`],
    ['Personalstamm',`${rules.personnelYears} Jahre`],
    ['Allgemeines Audit',`${rules.auditYears} Jahre`],
    ['Monats-Snapshots',`${rules.monthSnapshotYears} Jahre`],
    ['DATEV-Audit',`${rules.datevAuditYears} Jahre`],
    ['Auth-Konto automatisch löschen',rules.deleteAuthAccount?'Ja':'Nein'],
    ['Personalakten-Dateien automatisch löschen',rules.deletePersonnelDocuments?'Ja':'Nein']
  ];
  const rulesMatchDefault=rules=>rules&&Object.entries(DEFAULT_RULES).every(([key,value])=>rules[key]===value);

  function css(){
    if(document.getElementById('sfPrivacyRetentionCss'))return;
    const s=document.createElement('style');s.id='sfPrivacyRetentionCss';s.textContent=`
      .sf-privacy-retention{margin-top:14px;border:1px solid #244a43;border-radius:12px;background:#0a1b1b;padding:14px}
      .sf-privacy-retention h3{margin:0 0 5px;font-size:15px}.sf-privacy-retention>p{margin:0 0 12px;color:#9ab8b3;font-size:12px;line-height:1.55}
      .sf-pr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.sf-pr-row{display:flex;justify-content:space-between;gap:12px;padding:8px 9px;border:1px solid #1f3b3a;border-radius:8px;background:#081717;font-size:11px}.sf-pr-row span{color:#8ba7a3}.sf-pr-row b{text-align:right}
      .sf-pr-state{margin:11px 0;padding:10px;border-radius:9px;border:1px solid #315167;background:#0b1b2a;font-size:12px;line-height:1.5}.sf-pr-state.ok{border-color:#276653;background:#0d2a23;color:#9de7d1}.sf-pr-state.wait{border-color:#735d25;background:#2b2512;color:#f4d98a}.sf-pr-state.bad{border-color:#713744;background:#301923;color:#ffb6c0}
      .sf-pr-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:12px}.sf-pr-actions button{min-height:40px}.sf-pr-ref{width:100%;box-sizing:border-box;margin-top:8px;border:1px solid #29445d;border-radius:8px;background:#071522;color:#fff;padding:9px 10px}
      @media(max-width:650px){.sf-pr-grid{grid-template-columns:1fr}.sf-pr-actions{flex-direction:column}.sf-pr-actions button{width:100%}}
    `;document.head.appendChild(s);
  }

  async function render(container){
    if(!container||!['OWNER','ADMIN'].includes(B().role))return;
    css();
    let host=container.querySelector('#sfPrivacyRetention');
    if(!host){host=document.createElement('section');host.id='sfPrivacyRetention';host.className='sf-privacy-retention';container.appendChild(host)}
    host.innerHTML='<h3>Datenschutz & Löschung</h3><p>Fristprofil wird sicher geladen …</p>';
    try{
      const response=await invoke({action:'retention-status'});
      const status=response.status||{};
      const profiles=Array.isArray(status.profiles)?status.profiles:[];
      const approved=profiles.find(p=>p.status==='APPROVED');
      const draft=profiles.find(p=>p.status==='DRAFT');
      const shown=draft?.rules||approved?.rules||DEFAULT_RULES;
      const draftIsCurrent=!draft||rulesMatchDefault(draft.rules);
      const nextVersion=Number(status.next_version||1);
      const now=Date.now();
      const notBefore=draft?.confirmation_not_before?Date.parse(draft.confirmation_not_before):null;
      const canConfirm=!!draft&&draftIsCurrent&&Number.isFinite(notBefore)&&now>=notBefore;
      const state=approved
        ?`<div class="sf-pr-state ok"><b>Aktives Fristprofil V${approved.version}</b><br>Freigegeben: ${esc(deDate(approved.approved_at))}. Der Privacy-Worker darf fällige Regeln anwenden; Legal Holds bleiben vorrangig.</div>`
        :draft&&!draftIsCurrent
          ?`<div class="sf-pr-state bad"><b>Fristprofil V${draft.version} ist fachlich überholt und gesperrt.</b><br>Der Entwurf enthält nicht die freigegebenen V2-Regeln für Arbeitszeit-/DATEV-Daten und darf nicht bestätigt werden. Ersetzen legt revisionssicher eine neue Version mit frischer 24-Stunden-Frist an.</div>`
        :draft
          ?`<div class="sf-pr-state wait"><b>Fristprofil V${draft.version} wartet auf zweite Bestätigung.</b><br>Frühestens: ${esc(deDate(draft.confirmation_not_before))}. Die Bestätigung muss nach neuer Anmeldung in einer anderen MFA-Sitzung erfolgen.</div>`
          :'<div class="sf-pr-state wait"><b>Noch kein Fristprofil freigegeben.</b><br>Der Löschbetrieb arbeitet deshalb fail-closed und führt keine fachliche Langfristredaktion aus.</div>';
      const needsProfileInput=!approved&&(!draft||!draftIsCurrent);
      host.innerHTML=`<h3>Datenschutz & Löschung</h3><p>Technische Schutzregeln sind aktiv. Konkrete Fristen werden erst nach geschützter Betreiberfreigabe wirksam. Vor der Freigabe müssen die Werte vertraglich/rechtlich zum tatsächlichen Einsatz passen.</p>${state}<div class="sf-pr-grid">${rulesSummary(draft&&!draftIsCurrent?DEFAULT_RULES:shown).map(([k,v])=>`<div class="sf-pr-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>${needsProfileInput?`<label style="display:block;margin-top:12px;font-size:11px;color:#9fb3c7">Freigabevermerk<input id="sfPrApprovalRef" class="sf-pr-ref" maxlength="500" value="SchichtFunk Fristprofil V${nextVersion} – Arbeitszeit/DATEV 6 Jahre; ersetzt V${draft?.version||'—'}"></label>`:''}<div id="sfPrMessage"></div><div class="sf-pr-actions"><button class="ghost" id="sfPrReload" type="button">Status neu laden</button>${!approved&&!draft?'<button class="primary" id="sfPrStage" type="button">Fristprofil vorbereiten</button>':''}${draft&&!draftIsCurrent?'<button class="primary" id="sfPrReplace" type="button">Entwurf durch V2 ersetzen</button>':''}${draft&&draftIsCurrent?`<button class="primary" id="sfPrConfirm" type="button" ${canConfirm?'':'disabled'}>${canConfirm?'Zweite Freigabe bestätigen':'Abkühlfrist läuft'}</button>`:''}</div>`;
      host.querySelector('#sfPrReload').onclick=()=>render(container);
      const say=(text,bad=false)=>{const box=host.querySelector('#sfPrMessage');box.className=`sf-pr-state ${bad?'bad':'ok'}`;box.textContent=text};
      const stage=host.querySelector('#sfPrStage');if(stage)stage.onclick=async()=>{stage.disabled=true;try{await aal2();const approvalReference=host.querySelector('#sfPrApprovalRef').value.trim();if(approvalReference.length<10)throw new Error('Bitte einen nachvollziehbaren Freigabevermerk eintragen.');await invoke({action:'stage-retention-profile',version:nextVersion,rules:DEFAULT_RULES,approvalReference});say('Erste MFA-Freigabe gespeichert. Die zweite Bestätigung ist nach 24 Stunden und einer neuen Anmeldung möglich.');setTimeout(()=>render(container),900)}catch(e){say(e?.message||'Vorbereitung fehlgeschlagen.',true);stage.disabled=false}};
      const replace=host.querySelector('#sfPrReplace');if(replace)replace.onclick=async()=>{replace.disabled=true;try{await aal2();const approvalReference=host.querySelector('#sfPrApprovalRef').value.trim();if(approvalReference.length<10)throw new Error('Bitte einen nachvollziehbaren Freigabevermerk eintragen.');await invoke({action:'replace-retention-profile',retentionProfileId:draft.id,version:nextVersion,rules:DEFAULT_RULES,approvalReference});say('Der alte Entwurf wurde widerrufen und V2 mit 6 Jahren vorbereitet. Die zweite Bestätigung ist nach 24 Stunden und einer neuen Anmeldung möglich.');setTimeout(()=>render(container),900)}catch(e){say(e?.message||'Ersetzen fehlgeschlagen.',true);replace.disabled=false}};
      const confirm=host.querySelector('#sfPrConfirm');if(confirm)confirm.onclick=async()=>{confirm.disabled=true;try{await aal2();await invoke({action:'confirm-retention-profile',retentionProfileId:draft.id});say('Fristprofil wurde geschützt freigegeben.');setTimeout(()=>render(container),900)}catch(e){say(`${e?.message||'Bestätigung fehlgeschlagen.'} Falls die Abkühlfrist abgelaufen ist: vollständig abmelden, neu anmelden und erneut MFA bestätigen.`,true);confirm.disabled=false}};
    }catch(e){host.innerHTML=`<h3>Datenschutz & Löschung</h3><div class="sf-pr-state bad">${esc(e?.message||'Datenschutzstatus konnte nicht geladen werden.')}</div><div class="sf-pr-actions"><button class="ghost" id="sfPrRetry" type="button">Erneut versuchen</button></div>`;host.querySelector('#sfPrRetry').onclick=()=>render(container)}
  }

  function install(){
    const compliance=C();
    if(typeof compliance.renderComplianceSettings!=='function'){setTimeout(install,50);return}
    if(compliance.renderComplianceSettings.__privacyRetentionWrapped)return;
    const base=compliance.renderComplianceSettings;
    const wrapped=function(container){const result=base.apply(this,arguments);Promise.resolve(result).finally(()=>render(container));return result};
    wrapped.__privacyRetentionWrapped=true;compliance.renderComplianceSettings=wrapped;
  }
  install();
})();
