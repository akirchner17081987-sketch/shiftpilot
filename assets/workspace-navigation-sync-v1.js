// SchichtFunk – Schnellnavigation mit Workspace-State synchronisieren V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__workspaceNavigationSyncV1)return;B.__workspaceNavigationSyncV1=true;
  const KEY='sf_workspace_state_v2';

  function persist(view){
    if(!view||!document.getElementById('view-'+view))return;
    try{
      const old=JSON.parse(sessionStorage.getItem(KEY)||'{}')||{};
      old.view=view;
      old.savedAt=Date.now();
      sessionStorage.setItem(KEY,JSON.stringify(old));
    }catch{}
    B.pendingView=view;
  }

  document.addEventListener('click',e=>{
    const el=e.target?.closest?.('button,a,[role="button"]');
    if(!el)return;

    // Normale Navigation wird bereits vom Workspace-State behandelt.
    if(el.dataset?.view){persist(el.dataset.view);return}

    // Inline-Schnellaktionen wie „Dienstplan öffnen“ im Planungs-Dashboard.
    const inline=el.getAttribute?.('onclick')||'';
    const m=inline.match(/switchView\(\s*['\"]([^'\"]+)['\"]\s*\)/);
    if(m?.[1]){persist(m[1]);return}

    // Explizite bekannte Schnellaktionen ohne data-view/inline Navigation.
    if(el.id==='autoPlanBtn')persist('auto');
  },true);

  B.persistWorkspaceView=persist;
})();
