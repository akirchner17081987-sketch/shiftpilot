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

  document.addEventListener('DOMContentLoaded',()=>{
    document.querySelectorAll('[data-view]').forEach(btn=>{
      const target=normalize(btn.dataset.view);
      if(!document.getElementById('view-'+target))console.warn('[SchichtFunk Navigation] Zielansicht fehlt:',btn.dataset.view,btn);
    });
  });

  function loadIntegration(src,marker){
    if(document.querySelector(`script[${marker}]`))return;
    const script=document.createElement('script');script.src=src;script.async=false;script.setAttribute(marker,'1');document.head.appendChild(script);
  }

  function loadStyle(href,marker){
    if(document.querySelector(`link[${marker}]`))return;
    const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.setAttribute(marker,'1');document.head.appendChild(link);
  }

  // Öffentliche Startseite: geschützter Demo-Einstieg getrennt von der Produktiv-Anmeldung.
  loadIntegration('/assets/landing-demo-cta-v1.js?v=20260904-3','data-sf-landing-demo-cta');

  // Zentrale Style-Quelle für ALLE Datums- und Monatsfelder.
  loadStyle('/assets/date-month-controls-v1.css?v=20260904-1','data-sf-date-month-controls');
  loadIntegration('/assets/date-month-format-v1.js?v=20260904-1','data-sf-date-month-format');

  loadIntegration('/assets/o1s-integration-v1.js?v=20260904-1','data-sf-o1s-integration');
  loadIntegration('/assets/qa-integration-v1.js?v=20260904-1','data-sf-qa-integration');
  loadIntegration('/assets/calendar-view-switch-v1.js?v=20260904-1','data-sf-calendar-view');
  loadIntegration('/assets/publish-dialog-design-v1.js?v=20260904-1','data-sf-publish-dialog-design');
  loadIntegration('/assets/demo-reset-v1.js?v=20260904-1','data-sf-demo-reset');
  loadIntegration('/assets/demo-august-2026-v1.js?v=20260904-1','data-sf-demo-august-2026');
})();
