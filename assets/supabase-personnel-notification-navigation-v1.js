// SchichtFunk – direkte Navigation aus Personalakten-Fristerinnerungen V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__personnelNotificationNavigationV1)return;
  B.__personnelNotificationNavigationV1=true;

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const isPersonnelKind=k=>/^PERSONNEL_(QUALIFICATION|DOCUMENT)_EXPIRY_/.test(String(k||''));

  function localEmployeeId(dbId){
    try{
      if(B.empLocal?.get?.(dbId))return String(B.empLocal.get(dbId));
      if(typeof employees!=='undefined'){
        const e=employees.find(x=>String(x._dbId||B.empDb?.get?.(String(x.id))||'')===String(dbId));
        if(e)return String(e.id);
      }
    }catch{}
    return null;
  }

  function saveWorkspace(localId,tab){
    try{
      sessionStorage.setItem('sf_workspace_state_v2',JSON.stringify({
        view:'employees',
        employeeId:String(localId),
        personnelOpen:true,
        personnelTab:tab,
        savedAt:Date.now()
      }));
      sessionStorage.setItem('sf_active_view_v1','employees');
    }catch{}
    B.pendingView='employees';
  }

  function showEmployees(){
    const current=document.querySelector('.view.active[id^="view-"]')?.id;
    if(current==='view-employees')return;
    try{
      if(typeof window.switchView==='function')window.switchView('employees');
      else if(typeof window.showView==='function')window.showView('employees');
      else document.querySelector('[data-view="employees"]')?.click();
    }catch{}
  }

  async function selectEmployeeAndOpen(localId,tab){
    showEmployees();
    await sleep(80);
    try{
      if(typeof window.selectEmployee==='function')window.selectEmployee(localId);
      else if(typeof selectEmployee==='function')selectEmployee(localId);
    }catch(e){console.warn('Fristerinnerung: Mitarbeiter konnte nicht gewählt werden',e)}

    saveWorkspace(localId,tab);

    // Mitarbeiteransicht und Personalakten-Button können nach dem View-Wechsel verzögert gerendert werden.
    for(let i=0;i<18;i++){
      if(document.getElementById('sfPersonnelOpen')||B.personnelFile?.open)break;
      await sleep(80);
    }

    try{
      if(!document.getElementById('sfPersonnelFile')){
        if(B.personnelFile?.open)await B.personnelFile.open();
        else document.getElementById('sfPersonnelOpen')?.click();
      }
    }catch(e){console.warn('Fristerinnerung: Personalakte konnte nicht geöffnet werden',e)}

    for(let i=0;i<24;i++){
      const modal=document.getElementById('sfPersonnelFile');
      if(modal){
        const target=modal.querySelector(`#sfPfTabs [data-pftab="${tab}"]`);
        if(target){if(!target.classList.contains('active'))target.click();return}
      }
      await sleep(80);
    }
  }

  async function drillDown(notificationId){
    if(!B.client||!notificationId)return;
    try{
      const q=await B.client.from('notifications')
        .select('kind,metadata')
        .eq('id',notificationId)
        .maybeSingle();
      if(q.error)throw q.error;
      const r=q.data;
      if(!r||!isPersonnelKind(r.kind))return;
      const md=r.metadata||{};
      const dbId=md.employeeId;
      const tab=md.personnelTab||(String(r.kind).includes('_DOCUMENT_')?'documents':'qualifications');
      if(!dbId)return;
      const localId=localEmployeeId(dbId);
      if(!localId){console.warn('Fristerinnerung: Mitarbeiter-Zuordnung nicht gefunden',dbId);return}
      // Die Standard-Navigation der Benachrichtigungszentrale darf zuerst auf "Mitarbeiter" wechseln.
      await sleep(120);
      await selectEmployeeAndOpen(localId,tab);
    }catch(e){console.warn('Direkte Personalakten-Navigation fehlgeschlagen',e)}
  }

  document.addEventListener('click',e=>{
    const item=e.target?.closest?.('#sfNotifyPanel .sf-notify-item[data-id]');
    if(!item)return;
    // Standardverhalten (gelesen markieren + Panel schließen) bleibt vollständig erhalten.
    drillDown(item.dataset.id);
  },true);
})();
