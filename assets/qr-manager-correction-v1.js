// Corrections are authorized and validated by the database, including month locks.
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.qrCorrection)return;
  const roles=new Set(['OWNER','ADMIN','DISPATCHER','PLANNER','TIME_TRACKING']);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const parts=(value,zone)=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  const input=(value,zone)=>{if(!value)return '';const p=parts(value,zone);return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`};
  function instant(value,zone,original){
    if(!value)return null;
    // Preserve seconds, fractional precision and the original DST offset if unchanged.
    if(original&&input(original,zone)===value+(value.length===16?':00':''))return original;
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value))throw new Error('Bitte Datum und Uhrzeit vollständig angeben.');
    const [y,m,d,h,mi,s=0]=value.match(/\d+/g).map(Number),wanted=Date.UTC(y,m-1,d,h,mi,s);
    let point=wanted;
    for(let i=0;i<4;i++){const p=parts(point,zone);point+=wanted-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second)}
    const candidates=[point-3600000,point,point+3600000].filter(v=>input(v,zone)===value+(value.length===16?':00':''));
    if(candidates.length!==1)throw new Error(candidates.length?'Diese Uhrzeit ist wegen der Zeitumstellung doppeldeutig. Bitte eine eindeutige Uhrzeit wählen.':'Diese Uhrzeit existiert wegen der Zeitumstellung nicht oder das Datum ist ungültig.');
    return new Date(candidates[0]).toISOString();
  }
  async function rpc(name,args){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{const result=await B.client.rpc(name,args).abortSignal(controller.signal);if(result.error)throw result.error;return typeof result.data==='string'?JSON.parse(result.data):result.data}
    finally{clearTimeout(timer)}
  }
  function styles(){
    if(document.getElementById('sfQrCorrectionStyle'))return;
    const s=document.createElement('style');s.id='sfQrCorrectionStyle';s.textContent=`
      .sf-qrc-back{position:fixed;inset:0;z-index:38000;background:#02070ddd;display:grid;place-items:center;padding:16px}
      .sf-qrc-dialog{width:min(720px,100%);max-height:92dvh;display:flex;flex-direction:column;min-width:0;background:var(--bg2,#112334);color:var(--text,#eef7ff);border:1px solid var(--line,#294559);border-radius:18px;box-shadow:0 24px 80px #0006;font-size:16px}
      .sf-qrc-head,.sf-qrc-foot{padding:18px 22px;flex:none}.sf-qrc-head{border-bottom:1px solid var(--line)}.sf-qrc-head h2{margin:0 0 6px;font-size:22px}.sf-qrc-head p{margin:0;overflow-wrap:anywhere;color:var(--muted)}
      .sf-qrc-body{padding:18px 22px;overflow:auto;min-height:0}.sf-qrc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.sf-qrc-dialog label{display:grid;gap:7px;margin:12px 0;font-size:14px}.sf-qrc-dialog input,.sf-qrc-dialog textarea{width:100%;min-width:0;padding:12px;border:1px solid var(--line);border-radius:9px;background:var(--bg,#091724);color:inherit;font:inherit;color-scheme:dark}.sf-qrc-dialog textarea{min-height:90px;resize:vertical}html[data-sf-theme="light"] .sf-qrc-dialog input{color-scheme:light}
      .sf-qrc-dialog p,.sf-qrc-dialog small,.sf-qrc-dialog li{font-size:14px;line-height:1.55}.sf-qrc-dialog small{display:block;color:var(--muted)}.sf-qrc-pause{padding:12px 0;border-bottom:1px solid var(--line)}.sf-qrc-pause h3{font-size:16px;margin:0}.sf-qrc-history li{margin:12px 0;overflow-wrap:anywhere}.sf-qrc-history{padding-left:20px}
      .sf-qrc-message:empty{display:none}.sf-qrc-message{margin-top:14px;padding:12px;border:1px solid var(--danger,#ffb0bd);border-radius:9px;font-size:14px;line-height:1.5;overflow-wrap:anywhere}
      .sf-qrc-foot{display:flex;justify-content:flex-end;gap:12px;flex-wrap:wrap;border-top:1px solid var(--line)}.sf-qrc-dialog button{min-height:44px;padding:10px 14px;border:1px solid var(--line);border-radius:9px;background:var(--bg,#091724);color:inherit;font:inherit;cursor:pointer}.sf-qrc-dialog .sf-qrc-save{border-color:var(--teal,#72e1c5);background:var(--teal,#72e1c5);color:#08251f;font-weight:700}.sf-qrc-dialog button:disabled{opacity:.55}.sf-qrc-dialog :focus-visible{outline:3px solid var(--teal,#72e1c5);outline-offset:3px}
      @media(max-width:520px){.sf-qrc-grid{grid-template-columns:1fr;gap:0}.sf-qrc-head,.sf-qrc-body,.sf-qrc-foot{padding:16px}.sf-qrc-foot button{flex:1}}
    `;document.head.appendChild(s);
  }
  async function open(id){
    if(!roles.has(B.role)||!B.client||!B.companyId)return;
    styles();document.getElementById('sfQrCorrection')?.sfClose?.();
    const company=B.companyId,m=document.createElement('div');m.id='sfQrCorrection';m.className='sf-qrc-back';
    m.innerHTML='<div class="sf-qrc-dialog" role="dialog" aria-modal="true" aria-labelledby="sfQrCorrectionTitle" tabindex="-1"><div class="sf-qrc-head"><h2 id="sfQrCorrectionTitle">QR-Buchung korrigieren</h2><p id="sfQrCorrectionPerson">Buchung wird geladen …</p></div><div class="sf-qrc-body"><form id="sfQrCorrectionForm"><div id="sfQrCorrectionFields"></div><div id="sfQrCorrectionMessage" class="sf-qrc-message" role="alert" aria-live="assertive"></div></form></div><div class="sf-qrc-foot"><button type="button" id="sfQrCorrectionClose">Schließen</button><button type="submit" form="sfQrCorrectionForm" class="sf-qrc-save" id="sfQrCorrectionSave" disabled>Korrektur speichern</button></div></div>';
    document.body.appendChild(m);let saving=false,record=null;
    const close=B.bindAccessibleModal?.(m,{initialFocus:'#sfQrCorrectionClose'})||(()=>m.remove());m.sfClose=()=>{if(!saving)close()};m.querySelector('#sfQrCorrectionClose').onclick=m.sfClose;
    const error=text=>m.querySelector('#sfQrCorrectionMessage').textContent=text;
    const active=()=>m.isConnected&&company===B.companyId&&roles.has(B.role);
    function paint(data){
      record=data;const zone=data.timezone||'Europe/Berlin';
      m.querySelector('#sfQrCorrectionPerson').textContent=`${data.employee_name} · ${data.terminal_name||'QR-Terminal'} · ${zone}`;
      m.querySelector('#sfQrCorrectionFields').innerHTML=`<p>Trage die tatsächlichen Zeiten ein. Eine offene Pause endet spätestens mit dem eingetragenen Dienstende. Pausen bleiben vollständig bezahlt.</p><div class="sf-qrc-grid"><label>Tatsächlicher Beginn *<input id="sfQrCorrectionStart" type="datetime-local" step="1" required value="${esc(input(data.started_at,zone))}"></label><label>Tatsächliches Ende *<input id="sfQrCorrectionEnd" type="datetime-local" step="1" required value="${esc(input(data.ended_at,zone))}"></label></div>${(data.breaks||[]).map(p=>`<section class="sf-qrc-pause"><h3>Pause ${Number(p.number)}</h3><div class="sf-qrc-grid"><label>Beginn *<input data-pause-start="${Number(p.number)}" type="datetime-local" step="1" required value="${esc(input(p.started_at,zone))}"></label><label>Ende${p.ended_at?' *':''}<input data-pause-end="${Number(p.number)}" type="datetime-local" step="1" ${p.ended_at?'required':''} value="${esc(input(p.ended_at,zone))}"></label></div>${p.ended_at?'':'<small>Ohne Eingabe wird die offene Pause zum tatsächlichen Dienstende geschlossen.</small>'}</section>`).join('')}<label>Begründung der Korrektur *<textarea id="sfQrCorrectionReason" minlength="3" maxlength="1000" required placeholder="Zum Beispiel: Abmeldung vergessen; tatsächliches Dienstende nach Rücksprache bestätigt."></textarea></label><small>Änderungen werden mit Bearbeiter, Zeitpunkt, Begründung und bisherigen Zeiten protokolliert. Abgeschlossene Zeitmonate müssen zuerst durch Inhaber oder Administratoren wieder geöffnet werden.</small><details><summary>Änderungsprotokoll (${(data.history||[]).length})</summary><ol class="sf-qrc-history">${(data.history||[]).map(h=>`<li><b>${esc(new Intl.DateTimeFormat('de-DE',{timeZone:zone,dateStyle:'medium',timeStyle:'short'}).format(new Date(h.created_at)))}</b> · ${esc(h.actor_name||h.actor_role)}<br>${esc(h.reason)}<br>Beginn: ${esc(input(h.old_values?.started_at,zone))} → ${esc(input(h.new_values?.started_at,zone))}<br>Ende: ${esc(input(h.old_values?.ended_at,zone)||'Offen')} → ${esc(input(h.new_values?.ended_at,zone))}${h.new_values?.breaks?.map(p=>{const old=h.old_values?.breaks?.find(x=>x.number===p.number);return `<br>Pause ${Number(p.number)}: ${esc(input(old?.started_at,zone))}–${esc(input(old?.ended_at,zone)||'Offen')} → ${esc(input(p.started_at,zone))}–${esc(input(p.ended_at,zone))}`}).join('')||''}</li>`).join('')||'<li>Noch keine Verwaltungskorrektur.</li>'}</ol></details>`;
      m.querySelector('#sfQrCorrectionSave').disabled=false;
    }
    try{const data=await rpc('manager_qr_independent_detail',{p_company_id:company,p_shift_id:id});if(active())paint(data)}catch(e){if(active())error(e?.message||'Buchung konnte nicht geladen werden. Bitte erneut öffnen.')}
    m.querySelector('#sfQrCorrectionForm').onsubmit=async e=>{
      e.preventDefault();if(saving||!record||!active())return;
      let draft;const zone=record.timezone||'Europe/Berlin';
      try{
        const start=instant(m.querySelector('#sfQrCorrectionStart').value,zone,record.started_at),end=instant(m.querySelector('#sfQrCorrectionEnd').value,zone,record.ended_at),reason=m.querySelector('#sfQrCorrectionReason').value.trim();
        if(!start||!end||Date.parse(end)<=Date.parse(start))throw new Error('Das tatsächliche Ende muss nach dem Beginn liegen.');
        if(reason.length<3)throw new Error('Bitte eine Begründung mit mindestens drei Zeichen angeben.');
        const pauses=(record.breaks||[]).map(p=>({number:p.number,started_at:instant(m.querySelector(`[data-pause-start="${p.number}"]`).value,zone,p.started_at),ended_at:instant(m.querySelector(`[data-pause-end="${p.number}"]`).value,zone,p.ended_at)}));
        draft={p_company_id:company,p_shift_id:id,p_started_at:start,p_ended_at:end,p_breaks:pauses,p_reason:reason,p_expected_revision:record.revision};
      }catch(e){error(e.message);return}
      saving=true;error('Korrektur wird gespeichert …');m.querySelectorAll('input,textarea,button').forEach(x=>x.disabled=true);
      let saved=false;
      try{await rpc('manager_correct_qr_independent_shift',draft);saved=true}
      catch(e){
        // Read back an uncertain save; never blindly repeat a correction.
        try{const latest=await rpc('manager_qr_independent_detail',{p_company_id:company,p_shift_id:id});saved=latest.history?.some(h=>h.metadata?.expectedRevision===draft.p_expected_revision&&h.reason===draft.p_reason&&Date.parse(h.new_values?.started_at)===Date.parse(draft.p_started_at)&&Date.parse(h.new_values?.ended_at)===Date.parse(draft.p_ended_at));if(!saved)error(e?.message||'Korrektur konnte nicht bestätigt werden. Bitte die Buchung erneut öffnen und den Status prüfen.')}
        catch{error('Verbindung unterbrochen. Die Korrektur könnte bereits gespeichert sein. Bitte die Buchung erneut öffnen und das Änderungsprotokoll prüfen.')}
      }
      finally{saving=false;if(active())m.querySelectorAll('input,textarea,button').forEach(x=>x.disabled=false)}
      if(saved&&active()){close();await window.renderTimeTracking?.();await B.qrIndependentReport?.refresh?.();await B.timeAccounts?.refreshManager?.();B.notifications?.refresh?.();window.showSaveToast?.('QR-Buchung korrigiert','Die zentrale Zeiterfassung wurde aktualisiert. Pausen bleiben bezahlt.')}
    };
  }
  B.qrCorrection={open};
})();
