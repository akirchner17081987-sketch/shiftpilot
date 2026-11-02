// SchichtFunk – geführte Demo-Tour V1
(function(){
  if(window.__sfDemoTourV1)return;
  if(sessionStorage.getItem('sf_demo_session_v1')!=='active')return;
  window.__sfDemoTourV1=true;

  const SEEN_KEY='sf_demo_tour_seen_v1';
  const steps=[
    {title:'Willkommen bei SchichtFunk',eyebrow:'DEMO-TOUR',body:'Entdecken Sie SchichtFunk mit einem fiktiven Unternehmen und fünf Mitarbeitenden. Die Tour führt durch die wichtigsten Bereiche. Sie können sie jederzeit beenden und über „Tour“ erneut starten.',view:'overview',selector:'#sfTodayWorkspace .sf-td-head'},
    {title:'Heute im Blick',eyebrow:'TAGESÜBERSICHT',body:'Hier sehen Sie Handlungsbedarf, Besetzung und Anwesenheit. Über Standort und Filter grenzen Sie die Übersicht ein; Hinweise führen zum jeweiligen Arbeitsbereich.',view:'overview',selector:'#sfTodayActions .sf-td-section-head'},
    {title:'Dienstplan bearbeiten',eyebrow:'DIENSTPLAN',body:'Wechseln Sie zwischen Woche und Monat sowie Stundenplan, Besetzung und Zeitachse. Im Manager-Modus können Sie fiktive Dienste planen und offene Positionen prüfen.',view:'schedule',selector:'#view-schedule .cal-toolbar'},
    {title:'Planungsvorschlag erstellen',eyebrow:'AUTO-PLANUNG',body:'Wählen Sie einen Zeitraum und erstellen Sie einen Vorschlag aus den Demo-Daten. Prüfen Sie Besetzung und offene Dienste, bevor Sie passende Vorschläge als Entwurf übernehmen.',view:'auto',selector:'#view-auto .page-head'},
    {title:'Schichten anbieten und übernehmen',eyebrow:'SCHICHTMARKTPLATZ',body:'Im Marktplatz sehen Sie vorbereitete Schichtangebote und können Beispielvorgänge ausprobieren. Das gesammelte Anbieten unbesetzter Dienste ist in dieser Demo noch nicht verfügbar.',view:'marketplace',selector:'#sfMarketTabs'},
    {title:'Abwesenheiten verwalten',eyebrow:'PERSONAL',body:'Prüfen Sie fiktive Abwesenheiten und Anträge. Genehmigte Abwesenheiten fließen in die Planung ein und können dort Konflikte sichtbar machen.',view:'absence',selector:'#view-absence .page-head'},
    {title:'Arbeitszeiten prüfen',eyebrow:'ZEITERFASSUNG',body:'Vergleichen Sie geplante und erfasste Arbeitszeiten, prüfen Sie Abweichungen und bearbeiten Sie die vorbereiteten Beispieldaten.',view:'time',selector:'#view-time .page-head'},
    {title:'Auswertungen ansehen',eyebrow:'AUSWERTUNG',body:'Auswertungen fassen die fiktiven Planungs- und Arbeitszeitdaten zusammen. Wählen Sie den gewünschten Bereich und Zeitraum, um die Kennzahlen zu erkunden.',view:'reports',selector:'#sfReportsWorkspace .sf-rp-head'},
    {title:'DATEV-Beispiel prüfen',eyebrow:'ABRECHNUNG',body:'Für DATEV-LODAS steht der abgeschlossene fiktive Referenzmonat August 2026 zur Verfügung. Öffnen Sie die Abrechnung und beginnen Sie mit der Vorprüfung.',view:'billing',selector:'#sfDatevMonth'},
    {title:'Mitarbeiterperspektive erleben',eyebrow:'MITARBEITERPORTAL',body:'Wechseln Sie in das Portal einer fiktiven Mitarbeiterin. Dort können Sie ihre Dienste, Abwesenheiten und verfügbare Beispielvorgänge aus Mitarbeitersicht erkunden.',perspective:'employee',selector:'#sfEmployeePortal .sf-portal-welcome'},
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
      .sf-demo-tour-marker{position:fixed;z-index:78001;pointer-events:none;border:3px solid #39e2bf;border-radius:10px;box-shadow:0 0 0 4px rgba(57,226,191,.2),0 0 24px rgba(57,226,191,.38)}
      .sf-demo-tour-marker:before{content:attr(data-step);position:absolute;top:-15px;left:-15px;display:grid;place-items:center;width:30px;height:30px;border:2px solid #071923;border-radius:50%;background:#39e2bf;color:#05271f;font:900 13px/1 Inter,system-ui,sans-serif;box-shadow:0 3px 10px #0008}
      .sf-demo-tour-card{position:fixed!important;z-index:78002;width:min(360px,calc(100vw - 28px));max-height:min(70dvh,460px);overflow:auto;border:1px solid #54dac2;border-radius:14px;background:#0b1d2b;color:#f4fbff;padding:18px;box-shadow:0 12px 40px rgba(0,0,0,.5);font-family:Inter,system-ui,sans-serif;transform:none!important;margin:0!important}
      .sf-demo-tour-top{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.sf-demo-tour-eyebrow{color:#58e4c8;font-size:10px;font-weight:900;letter-spacing:.14em}.sf-demo-tour-card h2{margin:5px 0 9px;font-size:22px;line-height:1.15;letter-spacing:-.02em}.sf-demo-tour-card p{margin:0;color:#a8bdcf;font-size:13px;line-height:1.58}
      .sf-demo-tour-close{flex:none;width:34px;height:34px;border:1px solid #315069;border-radius:9px;background:#0b1b29;color:#a9bfd0;font:700 15px Inter,system-ui,sans-serif;pointer-events:auto;cursor:pointer}.sf-demo-tour-progress{display:grid;grid-template-columns:1fr auto;align-items:center;gap:13px;margin:19px 0 17px}.sf-demo-tour-track{height:5px;overflow:hidden;border-radius:999px;background:#1d3547}.sf-demo-tour-bar{height:100%;border-radius:inherit;background:linear-gradient(90deg,#28d8b8,#2998ef);transition:width .25s}.sf-demo-tour-count{color:#8fa9bd;font-size:11px;font-weight:800}
      .sf-demo-tour-actions{display:flex;align-items:center;gap:8px;pointer-events:auto}.sf-demo-tour-actions button{min-height:39px;border-radius:9px;padding:8px 13px;font:800 12px Inter,system-ui,sans-serif;cursor:pointer}.sf-demo-tour-skip{margin-right:auto;border:0;background:transparent;color:#91a9bc}.sf-demo-tour-back{border:1px solid #355169;background:#0a1926;color:#bfd0dd}.sf-demo-tour-next{border:0;background:linear-gradient(135deg,#23d5bd,#298cf0);color:#fff}.sf-demo-tour-back:disabled{opacity:.4;cursor:default}
      #sfDemoTourRestartBtn{flex:0 0 auto;min-height:44px;padding:0 12px;border:1px solid #2f7667;border-radius:9px;background:#10342f;color:#8debd5;font:800 11px Inter,system-ui,sans-serif;white-space:nowrap;cursor:pointer}
      @media(max-width:680px){.sf-demo-tour-card{width:min(340px,calc(100vw - 28px));padding:15px}.sf-demo-tour-card h2{font-size:19px}.sf-demo-tour-actions{flex-wrap:wrap}.sf-demo-tour-skip{width:100%;order:3;text-align:center}}
    `;document.head.appendChild(style);
  }

  function cleanTarget(){if(target){target.classList.remove('sf-demo-tour-target');target=null}}
  function remove(){revision++;clearTimeout(renderTimer);cleanTarget();document.getElementById('sfDemoTourMarker')?.remove();document.getElementById('sfDemoTourCard')?.remove();active=false}
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
    if(!card||!element)return;
    const viewport=window.visualViewport,left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0,width=viewport?.width||innerWidth,height=viewport?.height||innerHeight;
    const r=element.getBoundingClientRect(),gap=16,pad=14,cardWidth=Math.min(card.offsetWidth||360,width-2*pad),cardHeight=Math.min(card.offsetHeight||260,height-2*pad);
    const marker=document.getElementById('sfDemoTourMarker');
    const x1=Math.max(left+2,r.left-4),y1=Math.max(top+2,r.top-4),x2=Math.min(left+width-2,r.right+4),y2=Math.min(top+height-2,r.bottom+4);
    if(marker){marker.hidden=x2<=x1||y2<=y1;if(!marker.hidden){marker.style.left=x1+'px';marker.style.top=y1+'px';marker.style.width=(x2-x1)+'px';marker.style.height=(y2-y1)+'px'}}
    const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
    const right=left+width-pad-cardWidth,bottom=top+height-pad-cardHeight;
    const options=[[r.right+gap,r.top],[r.left-cardWidth-gap,r.top],[r.left,r.bottom+gap],[r.left,r.top-cardHeight-gap]];
    let best=null;
    for(const [x,y] of options){const cx=clamp(x,left+pad,right),cy=clamp(y,top+pad,bottom),overlap=Math.max(0,Math.min(cx+cardWidth,x2)-Math.max(cx,x1))*Math.max(0,Math.min(cy+cardHeight,y2)-Math.max(cy,y1));const displacement=Math.abs(cx-x)+Math.abs(cy-y);const score=overlap*1000+displacement;if(!best||score<best.score)best={x:cx,y:cy,score}}
    card.style.setProperty('left',`${best.x}px`,'important');card.style.setProperty('top',`${best.y}px`,'important');card.style.setProperty('right','auto','important');card.style.setProperty('bottom','auto','important');
    if(marker)marker.dataset.positioned=marker.dataset.step;
  }

  async function draw(){
    if(!active)return;
    const current=++revision,step=steps[index];cleanTarget();clearTimeout(renderTimer);
    await goToView(step);if(!active||current!==revision)return;
    renderTimer=setTimeout(()=>{
      if(!active||current!==revision)return;
      target=locate(step.selector);target?.classList.add('sf-demo-tour-target');target?.scrollIntoView?.({block:'center',behavior:'instant'});
      let marker=document.getElementById('sfDemoTourMarker');
      if(!marker){marker=document.createElement('div');marker.id='sfDemoTourMarker';marker.className='sf-demo-tour-marker';marker.setAttribute('aria-hidden','true');document.body.appendChild(marker)}
      marker.dataset.step=String(index+1);delete marker.dataset.positioned;
      let card=document.getElementById('sfDemoTourCard');
      if(!card){card=document.createElement('section');card.id='sfDemoTourCard';card.className='sf-demo-tour-card';card.setAttribute('role','dialog');card.setAttribute('aria-modal','false');card.setAttribute('aria-labelledby','sfDemoTourTitle');document.body.appendChild(card)}
      card.innerHTML=`<div class="sf-demo-tour-top"><div><div class="sf-demo-tour-eyebrow">${step.eyebrow}</div><h2 id="sfDemoTourTitle">${step.title}</h2></div><button type="button" class="sf-demo-tour-close" aria-label="Tour schließen">✕</button></div><p>${step.body}</p><div class="sf-demo-tour-progress"><div class="sf-demo-tour-track"><div class="sf-demo-tour-bar" style="width:${((index+1)/steps.length)*100}%"></div></div><span class="sf-demo-tour-count">${index+1} / ${steps.length}</span></div><div class="sf-demo-tour-actions"><button type="button" class="sf-demo-tour-skip">Tour überspringen</button><button type="button" class="sf-demo-tour-back" ${index===0?'disabled':''}>Zurück</button><button type="button" class="sf-demo-tour-next">${index===steps.length-1?'Tour abschließen':'Weiter'}</button></div>`;
      card.querySelector('.sf-demo-tour-close').onclick=skip;card.querySelector('.sf-demo-tour-skip').onclick=skip;
      card.querySelector('.sf-demo-tour-back').onclick=()=>{if(index>0){index--;draw()}};
      card.querySelector('.sf-demo-tour-next').onclick=()=>{if(index===steps.length-1)finish();else{index++;draw()}};
      setTimeout(()=>{position(card,target);card.querySelector('.sf-demo-tour-next')?.focus()},80);
    },step.selector==='#sfDatevMonth'?800:240);
  }

  function start(startAt=0){css();remove();index=Math.max(0,Math.min(steps.length-1,Number(startAt)||0));active=true;announce('started');draw()}

  function ensureTourButton(){
    const controls=document.querySelector('#sfDemoControlDock .sf-demo-dock-controls');
    if(!controls||document.getElementById('sfDemoTourRestartBtn'))return;
    const button=document.createElement('button');button.id='sfDemoTourRestartBtn';button.type='button';button.textContent='Tour';button.setAttribute('aria-label','Demo-Tour starten');button.onclick=()=>start();controls.prepend(button);
  }

  document.addEventListener('keydown',event=>{if(active&&event.key==='Escape')skip()});
  let repositionFrame=0;
  const reposition=()=>{if(!active||repositionFrame)return;repositionFrame=requestAnimationFrame(()=>{repositionFrame=0;const card=document.getElementById('sfDemoTourCard');if(card&&target)position(card,target)})};
  addEventListener('resize',reposition);document.addEventListener('scroll',reposition,true);
  const observer=new MutationObserver(ensureTourButton);
  function boot(){css();ensureTourButton();observer.observe(document.body,{childList:true,subtree:true});if(!sessionStorage.getItem(SEEN_KEY)){const begin=()=>{if(!sessionStorage.getItem(SEEN_KEY)&&!active)start()};if(window.__sfDemoReadyV1)setTimeout(begin,300);else document.addEventListener('sf:demo-ready',begin,{once:true})}}
  window.SFDemoTour={start,skip,isActive:()=>active,steps:steps.length};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
