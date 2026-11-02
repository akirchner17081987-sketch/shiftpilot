// SchichtFunk – geführte Demo-Tour V1
(function(){
  if(window.__sfDemoTourV1)return;
  if(sessionStorage.getItem('sf_demo_session_v1')!=='active')return;
  window.__sfDemoTourV1=true;

  const SEEN_KEY='sf_demo_tour_seen_v1';
  const steps=[
    {title:'Willkommen bei SchichtFunk',eyebrow:'DEMO-TOUR',body:'Entdecken Sie SchichtFunk mit einem fiktiven Unternehmen und fünf Mitarbeitenden. Die Tour führt durch die wichtigsten Bereiche. Sie können sie jederzeit beenden und über „Tour“ erneut starten.',view:'overview',selector:'#sfTodayWorkspace'},
    {title:'Heute im Blick',eyebrow:'TAGESÜBERSICHT',body:'Hier sehen Sie Handlungsbedarf, Besetzung und Anwesenheit. Über Standort und Filter grenzen Sie die Übersicht ein; Hinweise führen zum jeweiligen Arbeitsbereich.',view:'overview',selector:'#sfTodayWorkspace'},
    {title:'Dienstplan bearbeiten',eyebrow:'DIENSTPLAN',body:'Wechseln Sie zwischen Woche und Monat sowie Stundenplan, Besetzung und Zeitachse. Im Manager-Modus können Sie fiktive Dienste planen und offene Positionen prüfen.',view:'schedule',selector:'#view-schedule .cal-toolbar'},
    {title:'Planungsvorschlag erstellen',eyebrow:'AUTO-PLANUNG',body:'Wählen Sie einen Zeitraum und erstellen Sie einen Vorschlag aus den Demo-Daten. Prüfen Sie Besetzung und offene Dienste, bevor Sie passende Vorschläge als Entwurf übernehmen.',view:'auto',selector:'#view-auto .page-head'},
    {title:'Schichten anbieten und übernehmen',eyebrow:'SCHICHTMARKTPLATZ',body:'Im Marktplatz sehen Sie vorbereitete Schichtangebote und können Beispielvorgänge ausprobieren. Das gesammelte Anbieten unbesetzter Dienste ist in dieser Demo noch nicht verfügbar.',view:'marketplace',selector:'#view-marketplace'},
    {title:'Abwesenheiten verwalten',eyebrow:'PERSONAL',body:'Prüfen Sie fiktive Abwesenheiten und Anträge. Genehmigte Abwesenheiten fließen in die Planung ein und können dort Konflikte sichtbar machen.',view:'absence',selector:'#view-absence .page-head'},
    {title:'Arbeitszeiten prüfen',eyebrow:'ZEITERFASSUNG',body:'Vergleichen Sie geplante und erfasste Arbeitszeiten, prüfen Sie Abweichungen und bearbeiten Sie die vorbereiteten Beispieldaten.',view:'time',selector:'#view-time .page-head'},
    {title:'Auswertungen ansehen',eyebrow:'AUSWERTUNG',body:'Auswertungen fassen die fiktiven Planungs- und Arbeitszeitdaten zusammen. Wählen Sie den gewünschten Bereich und Zeitraum, um die Kennzahlen zu erkunden.',view:'reports',selector:'#sfReportsWorkspace'},
    {title:'DATEV-Beispiel prüfen',eyebrow:'ABRECHNUNG',body:'Für DATEV-LODAS steht der abgeschlossene fiktive Referenzmonat August 2026 zur Verfügung. Öffnen Sie die Abrechnung und beginnen Sie mit der Vorprüfung.',view:'billing',selector:'#sfDatevPanel'},
    {title:'Mitarbeiterperspektive erleben',eyebrow:'MITARBEITERPORTAL',body:'Wechseln Sie in das Portal einer fiktiven Mitarbeiterin. Dort können Sie ihre Dienste, Abwesenheiten und verfügbare Beispielvorgänge aus Mitarbeitersicht erkunden.',perspective:'employee',selector:'#sfEmployeePortal .sf-portal-main'},
    {title:'Demo selbst ausprobieren',eyebrow:'DEMO-STEUERUNG',body:'Mit der Demo-Steuerung wechseln Sie die Perspektive, öffnen Szenarien oder setzen die Sitzung auf die Ausgangsdaten zurück. Beim Zurücksetzen gehen Änderungen dieser Demo-Sitzung verloren.',selector:'#sfDemoControlDock'}
  ];
  let index=0;
  let active=false;
  let target=null;
  let renderTimer=0;
  let revision=0;

  function css(){
    if(document.getElementById('sfDemoTourCss'))return;
    const style=document.createElement('style');style.id='sfDemoTourCss';style.textContent=`
      .sf-demo-tour-layer{position:fixed;inset:0;z-index:78000;background:rgba(2,8,14,.68);pointer-events:none;backdrop-filter:blur(2px)}
      .sf-demo-tour-target:not(#sfDemoControlDock){position:relative!important}.sf-demo-tour-target{z-index:78001!important;outline:3px solid #39e2bf!important;outline-offset:5px!important;border-radius:10px;box-shadow:0 0 0 7px rgba(57,226,191,.16),0 20px 55px rgba(0,0,0,.38)!important}
      .sf-demo-tour-card{position:fixed!important;z-index:78002;width:min(410px,calc(100vw - 28px));max-height:calc(100dvh - 28px);overflow:auto;border:1px solid #37617a;border-radius:17px;background:linear-gradient(155deg,#102536,#081520);color:#edf7ff;padding:22px;box-shadow:0 28px 90px rgba(0,0,0,.58);font-family:Inter,system-ui,sans-serif;transform:none!important;margin:0!important}
      .sf-demo-tour-top{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.sf-demo-tour-eyebrow{color:#58e4c8;font-size:10px;font-weight:900;letter-spacing:.14em}.sf-demo-tour-card h2{margin:5px 0 9px;font-size:22px;line-height:1.15;letter-spacing:-.02em}.sf-demo-tour-card p{margin:0;color:#a8bdcf;font-size:13px;line-height:1.58}
      .sf-demo-tour-close{flex:none;width:34px;height:34px;border:1px solid #315069;border-radius:9px;background:#0b1b29;color:#a9bfd0;font:700 15px Inter,system-ui,sans-serif;pointer-events:auto;cursor:pointer}.sf-demo-tour-progress{display:grid;grid-template-columns:1fr auto;align-items:center;gap:13px;margin:19px 0 17px}.sf-demo-tour-track{height:5px;overflow:hidden;border-radius:999px;background:#1d3547}.sf-demo-tour-bar{height:100%;border-radius:inherit;background:linear-gradient(90deg,#28d8b8,#2998ef);transition:width .25s}.sf-demo-tour-count{color:#8fa9bd;font-size:11px;font-weight:800}
      .sf-demo-tour-actions{display:flex;align-items:center;gap:8px;pointer-events:auto}.sf-demo-tour-actions button{min-height:39px;border-radius:9px;padding:8px 13px;font:800 12px Inter,system-ui,sans-serif;cursor:pointer}.sf-demo-tour-skip{margin-right:auto;border:0;background:transparent;color:#91a9bc}.sf-demo-tour-back{border:1px solid #355169;background:#0a1926;color:#bfd0dd}.sf-demo-tour-next{border:0;background:linear-gradient(135deg,#23d5bd,#298cf0);color:#fff}.sf-demo-tour-back:disabled{opacity:.4;cursor:default}
      #sfDemoTourRestartBtn{flex:0 0 auto;min-height:44px;padding:0 12px;border:1px solid #2f7667;border-radius:9px;background:#10342f;color:#8debd5;font:800 11px Inter,system-ui,sans-serif;white-space:nowrap;cursor:pointer}
      @media(max-width:680px){.sf-demo-tour-card{left:14px!important;right:14px!important;bottom:14px!important;top:auto!important;width:auto}.sf-demo-tour-target{outline-offset:2px!important}.sf-demo-tour-actions{flex-wrap:wrap}.sf-demo-tour-skip{width:100%;order:3;text-align:center}}
    `;document.head.appendChild(style);
  }

  function cleanTarget(){if(target){target.classList.remove('sf-demo-tour-target');target=null}}
  function remove(){revision++;clearTimeout(renderTimer);cleanTarget();document.getElementById('sfDemoTourLayer')?.remove();document.getElementById('sfDemoTourCard')?.remove();active=false}
  function announce(state){document.dispatchEvent(new CustomEvent('sf:demo-tour',{detail:{state}}))}
  function finish(){sessionStorage.setItem(SEEN_KEY,'complete');announce('completed');remove()}
  function skip(){sessionStorage.setItem(SEEN_KEY,'skipped');announce('skipped');remove()}

  async function goToView(step){
    const perspective=step.perspective||(step.view?'manager':null);
    if(perspective&&window.SFDemoPerspective?.current?.()!==perspective)window.SFDemoPerspective?.set?.(perspective);
    if(perspective==='employee'){window.SFBackend?.employeePortalNavigate?.('dashboard');return}
    if(!step.view)return;
    try{await window.SFBackend?.ensureManagerViewModules?.(step.view);if(typeof window.switchView==='function')window.switchView(step.view);else window.showView?.(step.view)}catch(err){console.error('Demo-Tour: Ansicht konnte nicht geladen werden',err)}
    document.querySelector('#appShell .main')?.scrollTo?.({top:0,behavior:'instant'});
    window.scrollTo({top:0,behavior:'instant'});
  }

  function locate(selector){
    const exact=document.querySelector(selector);
    if(exact&&exact.getClientRects().length)return exact;
    return document.querySelector('.view.active .page-head')||document.querySelector('.view.active')||document.getElementById('appShell');
  }

  function position(card,element){
    if(innerWidth<=680||!element){card.style.cssText='';return}
    const viewport=window.visualViewport;
    const viewLeft=viewport?.offsetLeft||0,viewTop=viewport?.offsetTop||0;
    const viewWidth=viewport?.width||innerWidth,viewHeight=viewport?.height||innerHeight;
    const rect=element.getBoundingClientRect(),gap=18,width=Math.min(410,viewWidth-28),height=Math.min(card.offsetHeight||300,viewHeight-28);
    let left=rect.right+gap;
    if(left+width>viewLeft+viewWidth-14)left=Math.max(viewLeft+14,rect.left-width-gap);
    if(rect.width>viewWidth*.68)left=Math.max(viewLeft+14,Math.min(viewLeft+viewWidth-width-14,rect.left+(rect.width-width)/2));
    let top=Math.max(viewTop+14,Math.min(viewTop+viewHeight-height-14,rect.top));
    if(rect.width>viewWidth*.68&&rect.bottom+height+gap<viewTop+viewHeight)top=rect.bottom+gap;
    card.style.setProperty('left',`${left}px`,'important');card.style.setProperty('top',`${top}px`,'important');card.style.setProperty('right','auto','important');card.style.setProperty('bottom','auto','important');
  }

  async function draw(){
    if(!active)return;
    const current=++revision,step=steps[index];cleanTarget();clearTimeout(renderTimer);
    await goToView(step);if(!active||current!==revision)return;
    renderTimer=setTimeout(()=>{
      if(!active||current!==revision)return;
      target=locate(step.selector);target?.classList.add('sf-demo-tour-target');target?.scrollIntoView?.({block:'center',behavior:'instant'});
      let layer=document.getElementById('sfDemoTourLayer');
      if(!layer){layer=document.createElement('div');layer.id='sfDemoTourLayer';layer.className='sf-demo-tour-layer';document.body.appendChild(layer)}
      let card=document.getElementById('sfDemoTourCard');
      if(!card){card=document.createElement('section');card.id='sfDemoTourCard';card.className='sf-demo-tour-card';card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.setAttribute('aria-labelledby','sfDemoTourTitle');document.body.appendChild(card)}
      card.innerHTML=`<div class="sf-demo-tour-top"><div><div class="sf-demo-tour-eyebrow">${step.eyebrow}</div><h2 id="sfDemoTourTitle">${step.title}</h2></div><button type="button" class="sf-demo-tour-close" aria-label="Tour schließen">✕</button></div><p>${step.body}</p><div class="sf-demo-tour-progress"><div class="sf-demo-tour-track"><div class="sf-demo-tour-bar" style="width:${((index+1)/steps.length)*100}%"></div></div><span class="sf-demo-tour-count">${index+1} / ${steps.length}</span></div><div class="sf-demo-tour-actions"><button type="button" class="sf-demo-tour-skip">Tour überspringen</button><button type="button" class="sf-demo-tour-back" ${index===0?'disabled':''}>Zurück</button><button type="button" class="sf-demo-tour-next">${index===steps.length-1?'Tour abschließen':'Weiter'}</button></div>`;
      card.querySelector('.sf-demo-tour-close').onclick=skip;card.querySelector('.sf-demo-tour-skip').onclick=skip;
      card.querySelector('.sf-demo-tour-back').onclick=()=>{if(index>0){index--;draw()}};
      card.querySelector('.sf-demo-tour-next').onclick=()=>{if(index===steps.length-1)finish();else{index++;draw()}};
      setTimeout(()=>{position(card,target);card.querySelector('.sf-demo-tour-next')?.focus()},80);
    },step.selector==='#sfDatevPanel'?800:240);
  }

  function start(startAt=0){css();remove();index=Math.max(0,Math.min(steps.length-1,Number(startAt)||0));active=true;announce('started');draw()}

  function ensureTourButton(){
    const controls=document.querySelector('#sfDemoControlDock .sf-demo-dock-controls');
    if(!controls||document.getElementById('sfDemoTourRestartBtn'))return;
    const button=document.createElement('button');button.id='sfDemoTourRestartBtn';button.type='button';button.textContent='Tour';button.setAttribute('aria-label','Demo-Tour starten');button.onclick=()=>start();controls.prepend(button);
  }

  document.addEventListener('keydown',event=>{if(active&&event.key==='Escape')skip()});
  addEventListener('resize',()=>{const card=document.getElementById('sfDemoTourCard');if(card)position(card,target)});
  const observer=new MutationObserver(ensureTourButton);
  function boot(){css();ensureTourButton();observer.observe(document.body,{childList:true,subtree:true});if(!sessionStorage.getItem(SEEN_KEY)){const begin=()=>{if(!sessionStorage.getItem(SEEN_KEY)&&!active)start()};if(window.__sfDemoReadyV1)setTimeout(begin,300);else document.addEventListener('sf:demo-ready',begin,{once:true})}}
  window.SFDemoTour={start,skip,isActive:()=>active,steps:steps.length};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
