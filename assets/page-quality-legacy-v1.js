(function(){
  const VIEW={overview:'overview',schedule:'schedule',employees:'employees',time:'time',absence:'absence',auto:'auto',reports:'reports',settings:'settings'};
  window.spNavigate=function(name){
    const target=VIEW[name]||name;
    if(typeof switchView==='function')switchView(target);
    const main=document.querySelector('.main');
    if(main)main.scrollTo({top:0,behavior:'instant'});
    window.scrollTo({top:0,behavior:'instant'});
  };

  function emptyState(id,text){
    const el=document.getElementById(id); if(!el)return;
    if(!el.textContent.trim() && !el.children.length)el.innerHTML='<div class="sp-empty">'+text+'</div>';
  }
  function improveOverview(){
    const stats=[...document.querySelectorAll('#view-overview #overviewStats .stat')];
    // Ziele werden vom Dashboard selbst ueber data-db-action verwaltet.
    stats.forEach(card=>{
      if(!card.dataset.dbAction)return;
      card.classList.add('sp-clickable');
    });
    emptyState('overviewIssues','Aktuell besteht kein Handlungsbedarf.');
    emptyState('overviewAbsences','Für den gewählten Zeitraum liegen keine weiteren Abwesenheiten vor.');
    emptyState('overviewWorkload','Noch keine Auslastungsdaten für diesen Zeitraum.');
    emptyState('overviewShiftMix','Noch keine Schichtverteilung für diesen Zeitraum.');
  }

  // Bestehende Renderfunktion erweitern, ohne Fachlogik zu ersetzen.
  if(typeof renderOverview==='function' && !renderOverview.__qualityWrapped){
    const base=renderOverview;
    const wrapped=function(){const r=base.apply(this,arguments);requestAnimationFrame(improveOverview);return r;};
    wrapped.__qualityWrapped=true;window.renderOverview=wrapped;
  }

  function improveControls(){
    document.querySelectorAll('button').forEach(b=>{if(!b.getAttribute('type'))b.setAttribute('type','button');});
    const iconButtons=[...document.querySelectorAll('.iconbtn')];
    iconButtons.forEach(b=>{
      const t=(b.textContent||'').trim();
      if(!b.getAttribute('aria-label')){
        if(t==='?')b.setAttribute('aria-label','Hilfe');
        else if(t==='✕'||t==='×')b.setAttribute('aria-label','Schließen');
        else b.setAttribute('aria-label',b.title||'Aktion');
      }
    });
    // Schnellaktionen robust an die echte View-Navigation binden.
    document.querySelectorAll('#view-overview button').forEach(b=>{
      const t=(b.textContent||'').trim();
      if(t.includes('Dienstplan öffnen'))b.onclick=()=>spNavigate('schedule');
    });
  }

  document.addEventListener('keydown',e=>{
    // Globale Suche mit Strg/Cmd+K fokussieren.
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){
      e.preventDefault();document.getElementById('globalSearch')?.focus();
    }
  });

  document.addEventListener('DOMContentLoaded',()=>{improveControls();setTimeout(improveOverview,0);});
  // Bei SPA-View-Wechseln erneut kleine Qualitätsverbesserungen anwenden.
  document.addEventListener('click',e=>{if(e.target.closest('[data-view]'))setTimeout(()=>{improveControls();if(document.getElementById('view-overview')?.classList.contains('active'))improveOverview();},0);});
})();
