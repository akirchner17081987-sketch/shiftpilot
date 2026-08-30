// SchichtFunk – Personalakte/Fristen-Dashboard Button-Reihenfolge Fix V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__personnelDeadlineButtonOrderFixV1)return;B.__personnelDeadlineButtonOrderFixV1=true;
  const ADMIN=new Set(['OWNER','ADMIN']);

  function fix(){
    if(!ADMIN.has(B.role))return;
    const bar=document.getElementById('sfPersonnelLaunch');
    if(!bar)return;
    const personnel=document.getElementById('sfPersonnelOpen');
    const dashboard=document.getElementById('sfDeadlineDashboardOpen');
    if(personnel&&dashboard){
      // Das ältere Personalakten-Modul nutzt bar.querySelector('button').
      // Deshalb muss der echte Personalakten-Button immer der erste Button bleiben.
      if(bar.firstElementChild!==personnel)bar.insertBefore(personnel,bar.firstElementChild);
      dashboard.textContent='⏱ Fristen-Dashboard';
      dashboard.title='Fristen-Dashboard über alle Mitarbeiter öffnen';
    }
  }

  document.addEventListener('click',e=>{
    if(e.target?.closest?.('[data-view="employees"],#nav-employees,.nav-item'))setTimeout(fix,120);
  },true);
  setInterval(fix,700);
  setTimeout(fix,500);
  setTimeout(fix,1500);
})();