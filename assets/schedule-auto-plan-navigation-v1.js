// SchichtFunk – Dienstplan Auto-Planung Button: reine Navigation V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__scheduleAutoPlanNavigationV1)return;B.__scheduleAutoPlanNavigationV1=true;

  function bind(){
    const btn=document.getElementById('autoPlanBtn');
    if(!btn||btn.dataset.sfAutoNavBound==='1')return;
    btn.dataset.sfAutoNavBound='1';
    btn.onclick=()=>{
      try{
        if(typeof window.switchView==='function')window.switchView('auto');
        else if(typeof switchView==='function')switchView('auto');
      }catch(e){console.warn('Auto-Planung konnte nicht geöffnet werden',e)}
      try{window.scrollTo({top:0,behavior:'instant'})}catch{}
    };
  }

  setTimeout(bind,300);
  setTimeout(bind,1000);
  setInterval(bind,2000);
})();
