// SchichtFunk – owner-only, verified deletion including archived employees.
(function(){
 if(window.SFEmployeeErasure)return;
 const B=window.SFBackend=window.SFBackend||{},D=window.SFEmployeeErasure={busy:false};
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 D.canErase=()=>!!(B.ready&&B.client&&B.companyId&&B.role==='OWNER'&&sessionStorage.getItem('sf_demo_session_v1')!=='active');
 D.validConfirmation=(snapshot,name,ack)=>ack===true&&String(name||'').trim()===snapshot.employee_name;
 async function flush(){
  if(B.syncing||B.bootPromise||B.companySwitching||B.employeeStatusSaving||B.shiftModelSaving)throw Error('Daten werden noch gespeichert. Bitte gleich erneut versuchen.');
  if(B.syncTimer){clearTimeout(B.syncTimer);B.syncTimer=null;await B.sync();if(B.lastSyncError)throw B.lastSyncError;}
 }
 D.preview=async employeeId=>{
  if(!D.canErase())throw Error('Nur der Unternehmensinhaber darf Mitarbeiter vollständig löschen.');
  const companyId=B.companyId;await flush();
  const q=await B.client.rpc('owner_employee_erasure_preview',{p_company_id:companyId,p_employee_id:employeeId});if(q.error)throw q.error;
  if(B.companyId!==companyId)throw Error('Das Unternehmen wurde gewechselt. Bitte die Übersicht erneut öffnen.');
  return{...q.data,companyId,operationId:crypto.randomUUID()};
 };
 D.commit=async(snapshot,name,ack)=>{
  if(!D.canErase()||B.companyId!==snapshot.companyId)throw Error('Das Unternehmen oder die Berechtigung hat sich geändert. Bitte erneut öffnen.');
  if(D.busy||!D.validConfirmation(snapshot,name,ack))throw Error('Bitte den vollständigen Namen eingeben und die Löschung bestätigen.');
  D.busy=true;B.employeeRemovalBusy=true;
  try{
   const q=await B.client.functions.invoke('employee-erasure',{body:{companyId:snapshot.companyId,employeeId:snapshot.employee_id,
    operationId:snapshot.operationId,confirmation:name.trim(),acknowledged:true,fingerprint:snapshot.fingerprint}});
   if(q.error){let detail;try{detail=await q.error.context?.json();}catch{}throw Error(detail?.error||q.error.message||'Die Löschung wurde nicht abgeschlossen. Bitte erneut versuchen.');}
   if(q.data?.complete!==true||q.data?.verified!==true)throw Error(q.data?.error||'Die abschließende Löschprüfung ist noch nicht abgeschlossen.');
   B.clearLegacy?.();B.legacy={};B.hasLegacy=false;
   if(typeof selectedEmployeeId!=='undefined')selectedEmployeeId=null;
   if(typeof selectedPlanEmployeeId!=='undefined')selectedPlanEmployeeId=null;
   try{await B.hydrate();}catch{return{...q.data,reloadNeeded:true};}
   try{const channel=new BroadcastChannel('schichtfunk-employee-roster');channel.postMessage({companyId:snapshot.companyId});channel.close();}catch{}
   return q.data;
  }finally{D.busy=false;B.employeeRemovalBusy=false;}
 };
 function css(){
  if(document.getElementById('sfEmployeeErasureCss'))return;
  const style=document.createElement('style');style.id='sfEmployeeErasureCss';style.textContent=`
   .sf-erasure-shade{position:fixed;inset:0;z-index:45100;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.65)}
   .sf-erasure-dialog{box-sizing:border-box;width:min(620px,100%);max-height:92dvh;overflow:auto;background:var(--panel,#101c2b);color:var(--text,#eef5ff);border:1px solid var(--line,#36506b);border-radius:16px;padding:24px;box-shadow:0 24px 80px #0007;font-size:14px;line-height:1.55}
   .sf-erasure-dialog h2{font-size:22px;line-height:1.3;margin:0 0 12px}.sf-erasure-dialog p{margin:10px 0}.sf-erasure-dialog label{display:block;margin-top:14px}.sf-erasure-dialog input[type=text],.sf-erasure-dialog select{box-sizing:border-box;display:block;width:100%;min-height:46px;border-radius:8px;border:1px solid var(--line);background:var(--bg,#081522);color:var(--text);padding:10px;font-size:16px;margin-top:6px}.sf-erasure-dialog select{font-size:14px}
   .sf-erasure-counts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:16px 0}.sf-erasure-counts div{border:1px solid var(--line);border-radius:9px;padding:12px;overflow-wrap:anywhere}.sf-erasure-counts b{display:block;font-size:24px}.sf-erasure-counts span{font-size:14px}
   .sf-erasure-warning{border-left:3px solid #df6565;background:var(--bg);padding:10px 12px}.sf-erasure-ack{display:flex!important;align-items:flex-start;gap:10px}.sf-erasure-ack input{flex:none;width:20px;height:20px;margin:2px 0;accent-color:#c65757}.sf-erasure-error{color:#e77686;white-space:normal;overflow-wrap:anywhere;margin-top:12px}.sf-erasure-footer{display:flex;justify-content:flex-end;gap:9px;flex-wrap:wrap;margin-top:20px}.sf-erasure-footer button{min-height:44px;font-size:14px}.sf-erasure-footer button:disabled{opacity:.45;cursor:not-allowed}.sf-erasure-note{color:var(--muted);font-size:13px;line-height:1.5}.sf-erasure-entry{min-height:40px;font-size:13px}
   @media(max-width:480px){.sf-erasure-dialog{padding:16px}.sf-erasure-footer button{flex:1}.sf-erasure-dialog h2{font-size:20px}}
  `;document.head.appendChild(style);
 }
 D.open=async employee=>{
  if(!D.canErase()){window.showSaveToast?.('Vollständige Löschung','Nur der Unternehmensinhaber kann diese Funktion nutzen.');return;}
  if(document.getElementById('sfEmployeeErasureDialog'))return;
  css();const companyId=B.companyId,previousFocus=document.activeElement,shade=document.createElement('div');
  shade.id='sfEmployeeErasureDialog';shade.className='sf-erasure-shade';B.employeeRemovalBusy=true;
  shade.innerHTML='<section class="sf-erasure-dialog" role="dialog" aria-modal="true" aria-labelledby="sfErasureTitle"><h2 id="sfErasureTitle">Mitarbeiter vollständig löschen</h2><p role="status">Mitarbeiter werden geladen …</p><div class="sf-erasure-error" role="alert"></div><div class="sf-erasure-footer"><button type="button" class="ghost" data-close>Abbrechen</button></div></section>';
  document.body.appendChild(shade);
  const close=()=>{if(D.busy)return;shade.remove();B.employeeRemovalBusy=false;previousFocus?.isConnected&&previousFocus.focus();};
  shade.querySelector('[data-close]').onclick=close;shade.querySelector('button').focus();
  shade.onkeydown=event=>{
   if(event.key==='Escape'){event.preventDefault();close();}
   if(event.key==='Tab'){const controls=[...shade.querySelectorAll('input:not(:disabled),select:not(:disabled),button:not(:disabled)')],first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  };
  try{
   await flush();const q=await B.client.rpc('owner_employee_erasure_list',{p_company_id:companyId});if(q.error)throw q.error;
   if(!shade.isConnected)return;if(B.companyId!==companyId)throw Error('Bitte das Unternehmen erneut auswählen.');
   const records=q.data||[];
   const targetId=employee?._dbId||employee?.employee_id||B.empDb?.get(String(employee?.id))||'';
   shade.querySelector('section').innerHTML=`<h2 id="sfErasureTitle">Mitarbeiter vollständig löschen</h2><p>Die Löschung betrifft das aktuell ausgewählte Unternehmen, einschließlich der gesamten Historie.</p>
    <label>Mitarbeiter auswählen<select id="sfErasureEmployee"><option value="">Bitte auswählen</option>${records.map(row=>`<option value="${esc(row.employee_id)}">${esc(row.employee_name)} · Personalnummer ${esc(row.personnel_no||'–')}${row.pending?' · Löschung fortsetzen':row.removed?' · bereits entfernt':''}</option>`).join('')}</select></label>
    <div id="sfErasurePreview" role="status"></div><div class="sf-erasure-error" role="alert"></div><div class="sf-erasure-footer"><button type="button" class="ghost" data-close>Abbrechen</button></div>`;
   shade.querySelector('[data-close]').onclick=close;
   const select=shade.querySelector('#sfErasureEmployee'),preview=shade.querySelector('#sfErasurePreview'),error=shade.querySelector('[role=alert]');let serial=0;
   const load=async()=>{
    const turn=++serial;error.textContent='';preview.innerHTML='';if(!select.value)return;preview.textContent='Alle verknüpften Daten werden geprüft …';
    try{
     const snapshot=await D.preview(select.value);if(!shade.isConnected||turn!==serial)return;
     const counts=snapshot.counts||{},shifts=Number(counts.shift_assignments||0),times=Number(counts.time_entries||0)+Number(counts.time_qr_independent_shifts||0);
     preview.innerHTML=`<p><strong>${esc(snapshot.employee_name)}</strong> · ${esc(snapshot.company_name)}</p>
      <div class="sf-erasure-counts"><div><b>${shifts}</b><span>Schichten, Entwürfe und veröffentlichte Dienste</span></div><div><b>${times}</b><span>Zeiterfassungs- und QR-Buchungen</span></div><div><b>${Number(counts.absences||0)}</b><span>Abwesenheiten und Anträge</span></div><div><b>${Number(snapshot.documents||0)}</b><span>Dokumentdateien</span></div></div>
      <div class="sf-erasure-warning">Auch Personaldaten, Qualifikationen, Pausen, Stundenkonten, Anfragen, Benachrichtigungen und zugehörige Protokolldaten werden entfernt. Seine Einträge werden aus abgeschlossenen Monatsberichten gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.</div>
      ${snapshot.shared_login?'<p>Ein mit anderen Unternehmen oder Verwaltungsaufgaben geteilter Login bleibt für diese anderen Aufgaben erhalten. Der Mitarbeiterzugang in diesem Unternehmen wird entfernt.</p>':''}
      <p class="sf-erasure-note">Die Funktion löscht aus der laufenden SchichtFunk-Datenbank und dem Dokumentenspeicher. Bereits erstellte Sicherungskopien und heruntergeladene Exporte werden dadurch nicht verändert.</p>
      <label>Vollständigen Namen zur Bestätigung eingeben<input id="sfErasureName" type="text" autocomplete="off" spellcheck="false" placeholder="${esc(snapshot.employee_name)}"></label>
      <label class="sf-erasure-ack"><input id="sfErasureAck" type="checkbox"><span>Ich bestätige die unwiderrufliche Löschung aller angezeigten Mitarbeiterdaten einschließlich Zeitnachweisen und Historie.</span></label>
      <div class="sf-erasure-footer"><button id="sfErasureConfirm" type="button" class="danger" disabled>${snapshot.pending?'Löschung abschließen':'Alle Mitarbeiterdaten endgültig löschen'}</button></div>`;
     const name=shade.querySelector('#sfErasureName'),ack=shade.querySelector('#sfErasureAck'),button=shade.querySelector('#sfErasureConfirm');
     const update=()=>button.disabled=D.busy||!D.validConfirmation(snapshot,name.value,ack.checked);name.oninput=update;ack.onchange=update;
     button.onclick=async()=>{
      if(!D.validConfirmation(snapshot,name.value,ack.checked)||D.busy)return;
      shade.querySelectorAll('input,select,button').forEach(control=>control.disabled=true);error.textContent='';button.textContent='Dateien, Daten und Restbestand werden geprüft …';
      try{const result=await D.commit(snapshot,name.value,ack.checked);close();window.showSaveToast?.('Vollständig gelöscht',result.reloadNeeded?'Die Löschung wurde bestätigt. Bitte die Seite neu laden.':'Alle zugehörigen Daten wurden entfernt und der Restbestand geprüft.');}
      catch(failure){error.textContent=failure.message||String(failure);shade.querySelectorAll('input,select,button').forEach(control=>control.disabled=false);button.textContent='Löschung erneut versuchen';update();}
     };name.focus();
    }catch(failure){if(turn===serial){preview.textContent='Die Löschübersicht konnte nicht geladen werden.';error.textContent=failure.message||String(failure);}}
   };
   select.onchange=load;
   if(records.some(row=>row.employee_id===targetId)){select.value=targetId;await load();}else select.focus();
  }catch(failure){if(shade.isConnected){shade.querySelector('[role=status]').textContent='Die Übersicht konnte nicht geladen werden.';shade.querySelector('[role=alert]').textContent=failure.message||String(failure);}}
 };
 function install(){
  const head=document.querySelector('#spEmployeeV2 .sp-emp-list-card-head');if(!head)return;
  let button=head.querySelector('#sfOpenEmployeeErasure');if(!button){button=document.createElement('button');button.id='sfOpenEmployeeErasure';button.type='button';button.className='ghost sf-erasure-entry';button.textContent='Vollständig löschen';button.onclick=()=>D.open();head.appendChild(button);}
  button.hidden=!D.canErase();
 }
 const observer=new MutationObserver(install);observer.observe(document.body,{childList:true,subtree:true});install();
 try{const channel=new BroadcastChannel('schichtfunk-employee-roster');channel.onmessage=async event=>{if(event.data?.companyId!==B.companyId||D.busy)return;if(B.syncTimer){clearTimeout(B.syncTimer);B.syncTimer=null;}B.clearLegacy?.();B.hasLegacy=false;B.legacy={};await B.hydrate();};}catch{}
})();
