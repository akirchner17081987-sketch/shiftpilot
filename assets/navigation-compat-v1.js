// SchichtFunk – Navigation Compatibility V1
(function(){
  const aliases={
    plan:'schedule',
    dienstplan:'schedule',
    mitarbeiter:'employees',
    staff:'employees',
    zeiterfassung:'time',
    abwesenheiten:'absence',
    autoplanung:'auto',
    'auto-planning':'auto',
    auswertungen:'reports',
    einstellungen:'settings',
    dashboard:'overview',
    uebersicht:'overview',
    übersicht:'overview'
  };

  function normalize(name){
    const key=String(name||'').trim();
    return aliases[key.toLowerCase()]||key;
  }

  window.showView=function(name){
    const target=normalize(name);
    if(typeof window.switchView==='function'){
      window.switchView(target);
      return true;
    }
    const view=document.getElementById('view-'+target);
    if(!view) return false;
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    view.classList.add('active');
    document.querySelectorAll('#nav button[data-view],.side-bottom button[data-view]').forEach(b=>{
      b.classList.toggle('active',b.dataset.view===target);
    });
    return true;
  };

  // Sanity check: every sidebar navigation target must have a matching view.
  document.addEventListener('DOMContentLoaded',()=>{
    document.querySelectorAll('[data-view]').forEach(btn=>{
      const target=normalize(btn.dataset.view);
      if(!document.getElementById('view-'+target)){
        console.warn('[SchichtFunk Navigation] Zielansicht fehlt:',btn.dataset.view,btn);
      }
    });
  });

  // O1S is a first-class SchichtFunk shift type. Load its compatibility/integration
  // layer before the remaining workspace modules finish initialising.
  if(!document.querySelector('script[data-sf-o1s-integration]')){
    const script=document.createElement('script');
    script.src='/assets/o1s-integration-v1.js?v=20260904-1';
    script.async=false;
    script.dataset.sfO1sIntegration='1';
    document.head.appendChild(script);
  }
})();
