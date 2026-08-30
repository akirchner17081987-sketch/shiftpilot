// SchichtFunk – Fokus-Fix für Fristen-Dashboard-Suche V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__personnelDeadlineDashboardFocusFixV1)return;B.__personnelDeadlineDashboardFocusFixV1=true;
  document.addEventListener('input',e=>{
    const el=e.target;
    if(!el||el.id!=='sfPfdSearch')return;
    const start=el.selectionStart??el.value.length,end=el.selectionEnd??start;
    requestAnimationFrame(()=>{
      const next=document.getElementById('sfPfdSearch');
      if(!next)return;
      next.focus({preventScroll:true});
      try{next.setSelectionRange(start,end)}catch{}
    });
  },true);
})();