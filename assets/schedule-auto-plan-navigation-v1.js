// SchichtFunk – Dienstplan Auto-Planung Button: reine Navigation V2
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__scheduleAutoPlanNavigationV2)return;B.__scheduleAutoPlanNavigationV2=true;
  const KEY='sf_workspace_state_v2';

  function persistAutoView(){
    try{
      const current=JSON.parse(sessionStorage.getItem(KEY)||'{}')||{};
      current.view='auto';
      current.savedAt=Date.now();
      sessionStorage.setItem(KEY,JSON.stringify(current));
    }catch{}
    B.pendingView='auto';
  }

  function openAuto(){
    persistAutoView();
    try{
      const nav=document.querySelector('[data-view="auto"]');
      if(nav){nav.click()}
      else if(typeof window.switchView==='function')window.switchView('auto');
      else if(typeof switchView==='function')switchView('auto');
    }catch(e){console.warn('Auto-Planung konnte nicht geöffnet werden',e)}
    persistAutoView();
    try{B.workspaceState?.snapshot?.()}catch{}
    try{window.scrollTo({top:0,behavior:'instant'})}catch{}
  }

  function bind(){
    const btn=document.getElementById('autoPlanBtn');
    if(!btn)return;
    btn.dataset.sfAutoNavBound='2';
    btn.onclick=openAuto;
  }

  setTimeout(bind,300);
  setTimeout(bind,1000);
  setInterval(bind,2000);
})();
