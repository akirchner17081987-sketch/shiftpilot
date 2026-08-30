// SchichtFunk – robuster Workspace-State bei Browser-Tabwechseln V2
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__workspaceStateV2)return; B.__workspaceStateV2=true;
  const KEY='sf_workspace_state_v2';
  let restoring=false, lastRestore=0;

  const validView=v=>!!v&&!!document.getElementById('view-'+v);
  const activeView=()=>document.querySelector('.view.active[id^="view-"]')?.id?.replace(/^view-/,'')||null;
  const read=()=>{try{return JSON.parse(sessionStorage.getItem(KEY)||'{}')||{}}catch{return {}}};
  const write=s=>{try{sessionStorage.setItem(KEY,JSON.stringify(s))}catch{}};
  const employeeId=()=>{try{return typeof selectedEmployeeId!=='undefined'&&selectedEmployeeId!=null?String(selectedEmployeeId):null}catch{return null}};
  const personnelOpen=()=>!!document.getElementById('sfPersonnelFile');
  const personnelTab=()=>document.querySelector('#sfPfTabs .sf-pf-tab.active[data-pftab]')?.dataset?.pftab||null;

  function snapshot(){
    const old=read();
    const view=activeView()||old.view||B.pendingView||'overview';
    const state={
      view:validView(view)?view:(old.view||'overview'),
      employeeId:employeeId()||old.employeeId||null,
      personnelOpen:personnelOpen(),
      personnelTab:personnelOpen()?(personnelTab()||old.personnelTab||'overview'):null,
      savedAt:Date.now()
    };
    write(state);
    if(state.view)B.pendingView=state.view;
    return state;
  }

  function showView(target){
    if(!validView(target))return false;
    B.pendingView=target;
    const current=activeView();
    if(current===target)return true;
    try{
      if(typeof window.switchView==='function'){window.switchView(target);return true}
      if(typeof window.showView==='function'){window.showView(target);return true}
      const btn=document.querySelector(`[data-view="${CSS.escape(target)}"]`);
      if(btn){btn.click();return true}
      document.querySelectorAll('.view.active').forEach(x=>x.classList.remove('active'));
      document.getElementById('view-'+target)?.classList.add('active');
      return activeView()===target;
    }catch(e){console.warn('Workspace-State: Ansicht konnte nicht wiederhergestellt werden',e);return false}
  }

  function restoreEmployee(state){
    if(state.view!=='employees'||!state.employeeId)return;
    try{
      const current=employeeId();
      if(current===String(state.employeeId))return;
      if(typeof window.selectEmployee==='function')window.selectEmployee(state.employeeId);
    }catch(e){console.warn('Workspace-State: Mitarbeiter konnte nicht wiederhergestellt werden',e)}
  }

  function restorePersonnel(state){
    if(state.view!=='employees'||!state.personnelOpen)return;
    if(document.getElementById('sfPersonnelFile')){
      if(state.personnelTab){const tab=document.querySelector(`#sfPfTabs [data-pftab="${CSS.escape(state.personnelTab)}"]`);if(tab&&!tab.classList.contains('active'))tab.click()}
      return;
    }
    if(!B.personnelFile?.open)return;
    Promise.resolve(B.personnelFile.open()).then(()=>{
      if(state.personnelTab){setTimeout(()=>{const tab=document.querySelector(`#sfPfTabs [data-pftab="${CSS.escape(state.personnelTab)}"]`);if(tab&&!tab.classList.contains('active'))tab.click()},80)}
    }).catch(e=>console.warn('Workspace-State: Personalakte konnte nicht wiederhergestellt werden',e));
  }

  function restore(){
    const now=Date.now();
    if(restoring||now-lastRestore<35)return;
    const state=read();
    if(!state.view||!validView(state.view))return;
    B.pendingView=state.view;
    if(!B.ready)return;
    restoring=true;lastRestore=now;
    try{
      const shell=document.getElementById('appShell');
      const landing=document.getElementById('landingPage');
      const shellHidden=shell&&getComputedStyle(shell).display==='none';
      const landingVisible=landing&&getComputedStyle(landing).display!=='none';
      if((shellHidden||landingVisible)&&typeof B.baseOpenApp==='function')B.baseOpenApp(state.view);
      showView(state.view);
      setTimeout(()=>restoreEmployee(state),60);
      setTimeout(()=>{restoreEmployee(state);restorePersonnel(state)},220);
      setTimeout(()=>restorePersonnel(state),700);
    }finally{setTimeout(()=>{restoring=false},60)}
  }

  // Beim Laden den zuletzt gesicherten View sofort an Supabase/Auth weiterreichen.
  const initial=read();
  if(initial.view)B.pendingView=initial.view;

  document.addEventListener('click',e=>{
    const nav=e.target?.closest?.('[data-view]');
    if(nav?.dataset?.view){const s=read();s.view=nav.dataset.view;s.savedAt=Date.now();write(s);B.pendingView=s.view;setTimeout(snapshot,80);return}
    if(e.target?.closest?.('#sfPersonnelOpen'))setTimeout(snapshot,250);
    if(e.target?.closest?.('#sfPfClose')){const s=read();s.personnelOpen=false;s.personnelTab=null;s.savedAt=Date.now();write(s);setTimeout(snapshot,80)}
    if(e.target?.closest?.('#sfPfTabs [data-pftab]'))setTimeout(snapshot,80);
    // Mitarbeiter-Auswahl nach dem bestehenden Handler sichern.
    if(e.target?.closest?.('[data-employee-id],.employee-item,.employee-row'))setTimeout(snapshot,120);
  },true);

  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden')snapshot();
    else{restore();setTimeout(restore,120);setTimeout(restore,500);setTimeout(restore,1200)}
  });
  window.addEventListener('blur',snapshot);
  window.addEventListener('focus',()=>{restore();setTimeout(restore,180);setTimeout(restore,700)});
  window.addEventListener('pagehide',snapshot);
  window.addEventListener('pageshow',()=>{setTimeout(restore,100);setTimeout(restore,600)});

  // Sicherheitsnetz gegen Token-Refreshes, die die Ansicht kurz auf Übersicht setzen.
  setInterval(()=>{
    if(document.visibilityState!=='visible'||!B.ready)return;
    const state=read();
    if(state.view&&validView(state.view)&&activeView()!==state.view)restore();
  },1200);

  B.workspaceState={snapshot,restore,read};
  setTimeout(snapshot,800);
})();
