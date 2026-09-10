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

  function bindGlobalSearchKeyboard(){
    const search=document.getElementById('globalSearch');
    if(!search||search.dataset.sfKeyboardNav==='1')return;
    search.dataset.sfKeyboardNav='1';
    search.addEventListener('keydown',event=>{
      if(event.key!=='ArrowDown')return;
      const first=document.querySelector('#spEmployeeList .sp-emp-row');
      if(!first)return;
      event.preventDefault();
      setTimeout(()=>document.querySelector('#spEmployeeList .sp-emp-row')?.focus(),0);
    });
  }

  document.addEventListener('DOMContentLoaded',()=>{
    document.querySelectorAll('[data-view]').forEach(btn=>{
      const target=normalize(btn.dataset.view);
      if(!document.getElementById('view-'+target))console.warn('[SchichtFunk Navigation] Zielansicht fehlt:',btn.dataset.view,btn);
    });
    bindGlobalSearchKeyboard();
  });
  setTimeout(bindGlobalSearchKeyboard,0);
  setTimeout(bindGlobalSearchKeyboard,500);

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
  loadIntegration('/assets/date-month-format-v1.js?v=20260904-2','data-sf-date-month-format');

  loadIntegration('/assets/o1s-integration-v1.js?v=20260904-1','data-sf-o1s-integration');
  loadIntegration('/assets/qa-integration-v1.js?v=20260904-1','data-sf-qa-integration');
  loadIntegration('/assets/calendar-view-switch-v1.js?v=20260904-1','data-sf-calendar-view');
  loadIntegration('/assets/publish-dialog-design-v1.js?v=20260904-1','data-sf-publish-dialog-design');
  loadIntegration('/assets/demo-reset-v1.js?v=20260906-absences1','data-sf-demo-reset');
  loadIntegration('/assets/demo-august-2026-v1.js?v=20260907-startgate2','data-sf-demo-august-2026');
  loadIntegration('/assets/demo-datev-snapshot-fix-v1.js?v=20260904-2','data-sf-demo-datev-snapshot-fix');

  // Zentrale Planer-Startansicht mit laufender Cloud-Aktualisierung der QR-Check-ins.
  loadIntegration('/assets/today-dashboard-v1.js?v=20260910-2','data-sf-today-dashboard');

  // Demo bleibt auch mit den QR-Verwaltungsmodulen vollständig lokal und fail-closed.
  loadIntegration('/assets/demo-qr-local-bridge-v1.js?v=20260908-2','data-sf-demo-qr-local-bridge');

  // Mitarbeiter sehen die QR-Zeiterfassung als festen Block auf ihrer Übersicht.
  loadIntegration('/assets/employee-qr-status-v1.js?v=20260910-2','data-sf-employee-qr-status');

  // Integrierter Kamera-Scanner auf Übersicht und im Bereich Arbeitszeit.
  loadIntegration('/assets/employee-qr-scanner-v1.js?v=20260910-1','data-sf-employee-qr-scanner');

  // Mobile/PWA: Bottom-Navigation, Installationshilfe und sicherer App-Shell-Service-Worker.
  loadIntegration('/assets/employee-mobile-pwa-v1.js?v=20260910-1','data-sf-employee-mobile-pwa');

  // Echte Browser-/PWA-Push-Mitteilungen auf Basis der bestehenden Benachrichtigungszentrale.
  loadIntegration('/assets/push-notifications-v1.js?v=20260910-2','data-sf-push-notifications');

  // QR-Zeiterfassung: Objekt-Terminals mit allgemeinem Betrieb oder optionalem Pilotmodus.
  loadIntegration('/assets/supabase-qr-terminal-admin-v1.js?v=20260908-1','data-sf-qr-terminal-admin');
  loadIntegration('/assets/supabase-qr-terminal-role-guard-v1.js?v=20260908-1','data-sf-qr-terminal-role-guard');
  loadIntegration('/assets/supabase-qr-pilot-guard-v1.js?v=20260910-1','data-sf-qr-pilot-guard');
})();
