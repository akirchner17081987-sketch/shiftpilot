// SchichtFunk – deliberate personnel removal with a company-scoped preview.
(function(){
  if(window.SFEmployeeRemoval)return;
  const B=window.SFBackend=window.SFBackend||{},D=window.SFEmployeeRemoval={busy:false};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const demo=()=>sessionStorage.getItem('sf_demo_session_v1')==='active';
  D.canManage=()=>demo()||!!(B.ready&&B.client&&B.companyId&&['OWNER','ADMIN','PLANNER','DISPATCHER'].includes(B.role));
  D.validConfirmation=(snapshot,name,acknowledged)=>acknowledged===true&&String(name||'').trim()===snapshot.employee_name;
  async function flush(){if(B.syncing||B.bootPromise||B.companySwitching||B.shiftModelSaving)throw Error('Daten werden noch gespeichert oder geladen. Bitte versuche es gleich erneut.');if(B.syncTimer){clearTimeout(B.syncTimer);B.syncTimer=null;await B.sync();if(B.lastSyncError)throw B.lastSyncError;}}
  D.preview=async employee=>{
    if(!D.canManage())throw Error('Für dieses Unternehmen fehlen aktive Verwaltungsrechte.');
    const companyId=B.companyId;
    if(demo())return{companyId,localId:employee.id,employee_name:`${employee.first} ${employee.last}`.trim(),personnel_no:employee.personnelNo,company_name:'Demo-Unternehmen',cancel_shifts:assignments.filter(a=>a.employeeId===employee.id).length,delete_absences:absences.filter(a=>a.employeeId===employee.id).length,retained_shifts:0,retained_absences:0,demo:true};
    await flush();const employeeId=employee._dbId||B.empDb?.get(String(employee.id));if(!employeeId)throw Error('Bitte den Mitarbeiter zuerst speichern.');
    const q=await B.client.rpc('manager_employee_removal_preview',{p_company_id:companyId,p_employee_id:employeeId});if(q.error)throw q.error;
    if(B.companyId!==companyId)throw Error('Das Unternehmen wurde inzwischen gewechselt. Bitte öffne die Löschübersicht erneut.');
    return{...q.data,companyId,localId:employee.id};
  };
  D.commit=async(snapshot,name,acknowledged)=>{
    if(!D.canManage())throw Error('Für dieses Unternehmen fehlen aktive Verwaltungsrechte.');
    if(D.busy)throw Error('Die Löschung wird bereits ausgeführt.');
    if(B.companyId!==snapshot.companyId)throw Error('Das Unternehmen wurde inzwischen gewechselt. Bitte öffne die Löschübersicht erneut.');
    if(!D.validConfirmation(snapshot,name,acknowledged))throw Error('Bitte den vollständigen Namen eingeben und die Löschfolgen bestätigen.');
    D.busy=true;const previousBusy=B.employeeRemovalBusy;B.employeeRemovalBusy=true;let committed=false;
    try{
      if(snapshot.demo){
        const ids=assignments.filter(a=>a.employeeId===snapshot.localId).map(a=>a.id);employees=employees.filter(e=>e.id!==snapshot.localId);assignments=assignments.filter(a=>a.employeeId!==snapshot.localId);absences=absences.filter(a=>a.employeeId!==snapshot.localId);
        if(typeof timeEntries!=='undefined')ids.forEach(id=>delete timeEntries[id]);selectedEmployeeId=null;if(typeof selectedPlanEmployeeId!=='undefined'&&selectedPlanEmployeeId===snapshot.localId)selectedPlanEmployeeId=null;saveAll();
        for(const fn of ['renderEmployees','renderPlanEmployeePool','renderCalendar','renderAbsenceDashboard','renderOverview','updateStats'])window[fn]?.();return{removed:true};
      }
      await flush();const q=await B.client.rpc('manager_remove_employee',{p_company_id:snapshot.companyId,p_employee_id:snapshot.employee_id,p_confirmation:String(name).trim(),p_acknowledged:acknowledged,p_fingerprint:snapshot.fingerprint});if(q.error)throw q.error;
      committed=true;selectedEmployeeId=null;if(typeof selectedPlanEmployeeId!=='undefined'&&selectedPlanEmployeeId===snapshot.localId)selectedPlanEmployeeId=null;
      await B.hydrate();return q.data;
    }catch(error){if(committed)throw Error('Der Mitarbeiter wurde gelöscht. Bitte lade die Seite neu, um die aktualisierten Daten zu sehen.');throw error;}
    finally{D.busy=false;B.employeeRemovalBusy=previousBusy;}
  };
  function css(){if(document.getElementById('sfEmployeeRemovalCss'))return;const s=document.createElement('style');s.id='sfEmployeeRemovalCss';s.textContent=`
    .sf-remove-shade{position:fixed;inset:0;z-index:45000;display:grid;place-items:center;padding:18px;background:rgba(0,0,0,.6)}
    .sf-remove-dialog{box-sizing:border-box;width:min(580px,100%);max-height:90dvh;overflow:auto;padding:22px;border:1px solid var(--line,#29435d);border-radius:16px;background:var(--panel,#0d1928);color:var(--text,#edf6ff);box-shadow:0 24px 90px rgba(0,0,0,.45)}
    .sf-remove-dialog h2{font-size:21px;margin:0 0 10px}.sf-remove-dialog p{font-size:13px;line-height:1.5;color:var(--muted,#9bb0c6)}.sf-remove-company{font-size:12px;color:var(--muted);margin-bottom:12px}
    .sf-remove-counts{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0}.sf-remove-counts>div{border:1px solid var(--line);border-radius:9px;padding:12px}.sf-remove-counts b{display:block;font-size:22px;margin-bottom:4px}.sf-remove-counts span{font-size:12px;color:var(--muted)}
    .sf-remove-warning{border-left:3px solid #d06b32;padding:9px 12px;background:var(--bg);font-size:13px;line-height:1.5}.sf-remove-name{display:block;margin-top:18px;font-size:13px}.sf-remove-name input{display:block;box-sizing:border-box;width:100%;min-height:44px;margin-top:7px;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--text)}
    .sf-remove-ack{display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.5;margin-top:14px}.sf-remove-ack input{width:20px;height:20px;flex:none;margin:0;accent-color:#c55656}.sf-remove-error{color:#ef7484;font-size:13px;margin-top:14px;line-height:1.5}.sf-remove-footer{display:flex;justify-content:flex-end;gap:9px;margin-top:20px;flex-wrap:wrap}.sf-remove-footer button{min-height:44px}.sf-remove-footer button:disabled{opacity:.45;cursor:not-allowed}
    @media(max-width:540px){.sf-remove-dialog{padding:16px}.sf-remove-footer button{flex:1}.sf-remove-dialog h2{font-size:20px}}
  `;document.head.appendChild(s);}
  D.open=async employee=>{
    if(!D.canManage()||employee.deletedAt){window.showSaveToast?.('Löschen nicht möglich','Für dieses Unternehmen fehlen aktive Verwaltungsrechte.');return;}
    if(document.getElementById('sfEmployeeRemovalDialog'))return;css();const focus=document.activeElement,shade=document.createElement('div');shade.id='sfEmployeeRemovalDialog';shade.className='sf-remove-shade';B.employeeRemovalBusy=true;
    shade.innerHTML='<section class="sf-remove-dialog" role="dialog" aria-modal="true" aria-labelledby="sfRemoveEmployeeTitle"><h2 id="sfRemoveEmployeeTitle">Mitarbeiter löschen</h2><p role="status">Betroffene Dienste und Abwesenheiten werden geprüft …</p><div class="sf-remove-error" role="alert"></div><div class="sf-remove-footer"><button type="button" class="ghost" data-cancel>Abbrechen</button></div></section>';document.body.appendChild(shade);
    const close=()=>{if(D.busy)return;shade.remove();B.employeeRemovalBusy=false;if(focus?.isConnected)focus.focus();else document.getElementById('spEmpSearch')?.focus();};
    shade.querySelector('[data-cancel]').onclick=close;shade.querySelector('button').focus();shade.onclick=e=>{if(e.target===shade)close();};
    shade.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const all=[...shade.querySelectorAll('input:not(:disabled),button:not(:disabled)')],first=all[0],last=all.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
    try{
      const snapshot=await D.preview(employee);if(!shade.isConnected)return;
      shade.querySelector('section').innerHTML=`<h2 id="sfRemoveEmployeeTitle">Mitarbeiter löschen</h2><div class="sf-remove-company">${esc(snapshot.company_name)} · Personalnummer ${esc(snapshot.personnel_no||'–')}</div><p><strong>${esc(snapshot.employee_name)}</strong> wird aus der Mitarbeiterverwaltung entfernt und kann anschließend nicht mehr eingeplant werden. Der Mitarbeiterzugang wird gesperrt.</p>
        <div class="sf-remove-counts"><div><b>${Number(snapshot.cancel_shifts||0)}</b><span>${snapshot.demo?'Dienste werden entfernt':'künftige Dienste werden storniert'}</span></div><div><b>${Number(snapshot.delete_absences||0)}</b><span>künftige Abwesenheiten werden entfernt</span></div></div>
        <div class="sf-remove-warning">${snapshot.demo?'Die Löschung betrifft nur diese Demo-Sitzung.':`Vorhandene Zeit- und Abrechnungsdaten sowie abgeschlossene Monate bleiben erhalten. Für die Historie bleiben ${Number(snapshot.retained_shifts||0)} Dienste und ${Number(snapshot.retained_absences||0)} Abwesenheiten archiviert.`}</div>
        <label class="sf-remove-name">Zur Bestätigung den vollständigen Namen eingeben:<br><strong>${esc(snapshot.employee_name)}</strong><input id="sfRemoveEmployeeName" autocomplete="off" spellcheck="false" aria-label="Vollständiger Name zur Löschbestätigung"></label>
        <label class="sf-remove-ack"><input id="sfRemoveEmployeeAck" type="checkbox"><span>Ich habe die Löschfolgen geprüft und möchte diesen Mitarbeiter einschließlich der angezeigten künftigen Einplanungen und Abwesenheiten entfernen.</span></label>
        <div class="sf-remove-error" role="alert"></div><div class="sf-remove-footer"><button type="button" class="ghost" data-cancel>Abbrechen</button><button type="button" class="danger" id="sfConfirmEmployeeRemoval" disabled>Mitarbeiter jetzt löschen</button></div>`;
      const name=shade.querySelector('#sfRemoveEmployeeName'),ack=shade.querySelector('#sfRemoveEmployeeAck'),button=shade.querySelector('#sfConfirmEmployeeRemoval'),error=shade.querySelector('[role=alert]');
      const update=()=>button.disabled=D.busy||!D.validConfirmation(snapshot,name.value,ack.checked);name.oninput=update;ack.onchange=update;shade.querySelector('[data-cancel]').onclick=close;name.focus();
      button.onclick=async()=>{
        if(!D.validConfirmation(snapshot,name.value,ack.checked)||D.busy)return;
        shade.querySelectorAll('input,button').forEach(x=>x.disabled=true);error.textContent='';button.textContent='Wird gelöscht …';
        try{await D.commit(snapshot,name.value,ack.checked);close();window.showSaveToast?.('Mitarbeiter gelöscht','Die Mitarbeiterverwaltung und die künftige Planung wurden aktualisiert.');}
        catch(err){error.textContent=err.message||'Der Mitarbeiter konnte nicht gelöscht werden.';shade.querySelectorAll('input,button').forEach(x=>x.disabled=false);button.textContent='Mitarbeiter jetzt löschen';update();}
      };
    }catch(err){if(!shade.isConnected)return;shade.querySelector('[role=status]').textContent='Die Löschübersicht konnte nicht geladen werden.';shade.querySelector('[role=alert]').textContent=err.message||String(err);}
  };
})();
