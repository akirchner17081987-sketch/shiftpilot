// SchichtFunk – aktive Ansicht bei Browser-Tabwechsel beibehalten
(function(){
  const KEY='sf_active_view_v1';
  const aliases={
    plan:'schedule',dienstplan:'schedule',mitarbeiter:'employees',staff:'employees',
    zeiterfassung:'time',abrechnung:'billing',abwesenheiten:'absence',autoplanung:'auto','auto-planning':'auto',
    auswertungen:'reports',einstellungen:'settings',dashboard:'overview',uebersicht:'overview','übersicht':'overview'
  };

  const normalize=name=>{
    const key=String(name||'').trim();
    return aliases[key.toLowerCase()]||key;
  };

  const activeView=()=>{
    const el=document.querySelector('.view.active[id^="view-"]');
    return el?.id?.replace(/^view-/,'')||null;
  };

  const isValid=target=>!!target&&!!document.getElementById('view-'+target);
  const activeSession=()=>!!window.SFBackend?.ready&&!window.SFBackend.__startupActive&&!window.SFBackend.__explicitSignOut&&!window.SFBackend.__finishingSignOut&&window.SFBackend.role!=='EMPLOYEE';
  const demo=()=>{try{return sessionStorage.getItem('sf_demo_session_v1')==='active'}catch{return false}};

  function startAtOverview(){
    if(demo())return;
    const target=new URLSearchParams(window.location.search).get('bereich')==='zeitkonto'?'time':'overview';
    try{
      sessionStorage.setItem(KEY,target);
      const workspace=JSON.parse(sessionStorage.getItem('sf_workspace_state_v2')||'{}')||{};
      workspace.view=target;workspace.personnelOpen=false;workspace.personnelTab=null;workspace.savedAt=Date.now();
      sessionStorage.setItem('sf_workspace_state_v2',JSON.stringify(workspace));
    }catch{}
    if(window.SFBackend)window.SFBackend.pendingView=target;
  }

  function remember(name){
    const target=normalize(name);
    if(!isValid(target))return target;
    if(!activeSession())return target;
    try{
      sessionStorage.setItem(KEY,target);
      const workspace=JSON.parse(sessionStorage.getItem('sf_workspace_state_v2')||'{}')||{};
      workspace.view=target;workspace.savedAt=Date.now();
      sessionStorage.setItem('sf_workspace_state_v2',JSON.stringify(workspace));
    }catch{}
    const B=window.SFBackend;
    if(B)B.pendingView=target;
    return target;
  }

  function stored(){
    try{
      const direct=sessionStorage.getItem(KEY);
      const workspace=JSON.parse(sessionStorage.getItem('sf_workspace_state_v2')||'{}')||{};
      return normalize(direct||workspace.view||'');
    }catch{return ''}
  }

  // Jede Navigation sofort merken. Der Capture-Handler läuft vor den bestehenden Klick-Handlern.
  document.addEventListener('click',e=>{
    const btn=e.target?.closest?.('[data-view]');
    if(btn?.dataset?.view)remember(btn.dataset.view);
  },true);

  // Auch programmgesteuerte Navigation erfassen.
  if(typeof window.switchView==='function'&&!window.switchView.__sfViewState){
    const original=window.switchView;
    const wrapped=function(name){remember(name);return original.apply(this,arguments)};
    wrapped.__sfViewState=true;
    window.switchView=wrapped;
  }

  if(typeof window.showView==='function'&&!window.showView.__sfViewState){
    const original=window.showView;
    const wrapped=function(name){remember(name);return original.apply(this,arguments)};
    wrapped.__sfViewState=true;
    window.showView=wrapped;
  }

  function snapshot(){
    const current=activeView();
    if(current)remember(current);
  }

  function restore(){
    const target=stored();
    const B=window.SFBackend;
    if(!isValid(target)||!activeSession())return;
    if(activeView()===target){B.pendingView=target;return}
    B.pendingView=target;
    if(typeof window.switchView==='function')window.switchView(target);
    else if(typeof window.showView==='function')window.showView(target);
  }

  // Beim Verlassen wird die aktuell sichtbare Seite gesichert. Beim Zurückkehren
  // wird sie nach möglichen Supabase SIGNED_IN/Token-Refresh-Ereignissen wiederhergestellt.
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden')snapshot();
    else{
      restore();
      setTimeout(restore,120);
      setTimeout(restore,650);
    }
  });
  window.addEventListener('blur',snapshot);
  window.addEventListener('focus',()=>{restore();setTimeout(restore,250)});
  window.addEventListener('pagehide',snapshot);
  window.addEventListener('pageshow',()=>setTimeout(restore,100));

  // A new document/login starts on Today; focus and token refresh within this
  // document continue to restore the user's current workspace.
  const initial=stored();
  if(!window.SFBackend?.ready&&!demo())startAtOverview();
  else if(isValid(initial)&&window.SFBackend)window.SFBackend.pendingView=initial;
  const auth=window.SFBackend?.authDialog;
  if(typeof auth==='function')window.SFBackend.authDialog=function(){
    if(!window.SFBackend.ready)startAtOverview();
    return auth.apply(this,arguments);
  };
})();
