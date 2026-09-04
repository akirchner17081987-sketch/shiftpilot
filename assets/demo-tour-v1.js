// SchichtFunk – geführte Demo-Tour V1
(function(){
  if(window.__sfDemoTourV1)return;
  if(sessionStorage.getItem('sf_demo_session_v1')!=='active')return;
  window.__sfDemoTourV1=true;

  const SEEN_KEY='sf_demo_tour_seen_v1';
  const steps=[
    {title:'Willkommen bei SchichtFunk',eyebrow:'DEMO-TOUR',body:'In sechs kurzen Stationen lernen Sie die wichtigsten Abläufe der Demo kennen. Sie können die Tour jederzeit überspringen und später über „Hilfe“ erneut starten.',selector:'#appShell'},
    {title:'Alles Wichtige auf einen Blick',eyebrow:'ÜBERSICHT',body:'Das Dashboard zeigt Besetzung, offene Positionen, Warnungen, Abwesenheiten und Auslastung. So erkennen Verantwortliche sofort, wo Handlungsbedarf besteht.',view:'overview',selector:'#view-overview .overviewStats'},
    {title:'Dienstplan und Besetzung',eyebrow:'PLANUNG',body:'Im Dienstplan sehen Sie Schichten, SOLL-/IST-Besetzung und verfügbare Mitarbeitende. Der vorbereitete Referenzmonat ist August 2026.',view:'schedule',selector:'#view-schedule .page-head'},
    {title:'Auf Ausfälle sofort reagieren',eyebrow:'STÖRFALL-AUTOPILOT',body:'Der Störfall-Autopilot priorisiert bei kurzfristigen Ausfällen passende Ersatzkräfte und dokumentiert den Ablauf nachvollziehbar.',view:'disruptions',selector:'#view-disruptions .page-head'},
    {title:'Zeiten prüfen und freigeben',eyebrow:'ZEITERFASSUNG',body:'Planzeiten und erfasste Arbeitszeiten werden gegenübergestellt. Abweichungen können geprüft, korrigiert und für die Abrechnung vorbereitet werden.',view:'time',selector:'#view-time .page-head'},
    {title:'DATEV-LODAS vorbereiten',eyebrow:'ABRECHNUNG',body:'In der Zeiterfassung wählen Sie für DATEV-LODAS August 2026 und nutzen zuerst die Vorprüfung. Erst ein korrekter Monatsstand wird für den Export an die Lohnbuchhaltung freigegeben.',view:'time',selector:'#sfDatevPanel'}
  ];
  let index=0;
  let active=false;
  let target=null;
  let renderTimer=0;

  function css(){
    if(document.getElementById('sfDemoTourCss'))return;
    const style=document.createElement('style');style.id='sfDemoTourCss';style.textContent=`
      .sf-demo-tour-layer{position:fixed;inset:0;z-index:78000;background:rgba(2,8,14,.68);pointer-events:none;backdrop-filter:blur(2px)}
      .sf-demo-tour-target{position:relative!important;z-index:78001!important;outline:3px solid #39e2bf!important;outline-offset:5px!important;border-radius:10px;box-shadow:0 0 0 7px rgba(57,226,191,.16),0 20px 55px rgba(0,0,0,.38)!important}
      .sf-demo-tour-card{position:fixed;z-index:78002;width:min(410px,calc(100vw - 28px));border:1px solid #37617a;border-radius:17px;background:linear-gradient(155deg,#102536,#081520);color:#edf7ff;padding:22px;box-shadow:0 28px 90px rgba(0,0,0,.58);font-family:Inter,system-ui,sans-serif}
      .sf-demo-tour-top{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.sf-demo-tour-eyebrow{color:#58e4c8;font-size:10px;font-weight:900;letter-spacing:.14em}.sf-demo-tour-card h2{margin:5px 0 9px;font-size:22px;line-height:1.15;letter-spacing:-.02em}.sf-demo-tour-card p{margin:0;color:#a8bdcf;font-size:13px;line-height:1.58}
      .sf-demo-tour-close{flex:none;width:34px;height:34px;border:1px solid #315069;border-radius:9px;background:#0b1b29;color:#a9bfd0;font:700 15px Inter,system-ui,sans-serif;pointer-events:auto;cursor:pointer}.sf-demo-tour-progress{display:grid;grid-template-columns:1fr auto;align-items:center;gap:13px;margin:19px 0 17px}.sf-demo-tour-track{height:5px;overflow:hidden;border-radius:999px;background:#1d3547}.sf-demo-tour-bar{height:100%;border-radius:inherit;background:linear-gradient(90deg,#28d8b8,#2998ef);transition:width .25s}.sf-demo-tour-count{color:#8fa9bd;font-size:11px;font-weight:800}
      .sf-demo-tour-actions{display:flex;align-items:center;gap:8px;pointer-events:auto}.sf-demo-tour-actions button{min-height:39px;border-radius:9px;padding:8px 13px;font:800 12px Inter,system-ui,sans-serif;cursor:pointer}.sf-demo-tour-skip{margin-right:auto;border:0;background:transparent;color:#91a9bc}.sf-demo-tour-back{border:1px solid #355169;background:#0a1926;color:#bfd0dd}.sf-demo-tour-next{border:0;background:linear-gradient(135deg,#23d5bd,#298cf0);color:#fff}.sf-demo-tour-back:disabled{opacity:.4;cursor:default}
      #sfDemoTourHelpBtn{border-color:#2f7667!important;color:#8debd5!important}
      @media(max-width:680px){.sf-demo-tour-card{left:14px!important;right:14px!important;bottom:14px!important;top:auto!important;width:auto}.sf-demo-tour-target{outline-offset:2px!important}.sf-demo-tour-actions{flex-wrap:wrap}.sf-demo-tour-skip{width:100%;order:3;text-align:center}}
    `;document.head.appendChild(style);
  }

  function cleanTarget(){if(target){target.classList.remove('sf-demo-tour-target');target=null}}
  function remove(){clearTimeout(renderTimer);cleanTarget();document.getElementById('sfDemoTourLayer')?.remove();document.getElementById('sfDemoTourCard')?.remove();active=false}
  function finish(){sessionStorage.setItem(SEEN_KEY,'complete');remove()}
  function skip(){sessionStorage.setItem(SEEN_KEY,'skipped');remove()}

  function goToView(view){
    if(!view)return;
    try{if(typeof window.switchView==='function')window.switchView(view);else window.showView?.(view)}catch{}
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
    const rect=element.getBoundingClientRect(),gap=18,width=Math.min(410,innerWidth-28),height=card.offsetHeight||300;
    let left=rect.right+gap;
    if(left+width>innerWidth-14)left=Math.max(14,rect.left-width-gap);
    if(rect.width>innerWidth*.68)left=Math.max(14,Math.min(innerWidth-width-14,rect.left+(rect.width-width)/2));
    let top=Math.max(14,Math.min(innerHeight-height-14,rect.top));
    if(rect.width>innerWidth*.68&&rect.bottom+height+gap<innerHeight)top=rect.bottom+gap;
    card.style.left=`${left}px`;card.style.top=`${top}px`;card.style.right='auto';card.style.bottom='auto';
  }

  function draw(){
    if(!active)return;
    const step=steps[index];goToView(step.view);cleanTarget();
    clearTimeout(renderTimer);renderTimer=setTimeout(()=>{
      if(!active)return;
      target=locate(step.selector);target?.classList.add('sf-demo-tour-target');target?.scrollIntoView?.({block:'center',behavior:'smooth'});
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

  function start(startAt=0){css();remove();index=Math.max(0,Math.min(steps.length-1,Number(startAt)||0));active=true;draw()}

  function ensureHelp(){
    const buttons=[...document.querySelectorAll('#appShell .top-actions button,.topbar button')];
    const help=buttons.find(button=>button.getAttribute('aria-label')==='Hilfe'||button.textContent.trim()==='Hilfe');
    if(!help)return;
    help.id='sfDemoTourHelpBtn';help.title='Geführte Demo-Tour starten';help.setAttribute('aria-label','Geführte Demo-Tour starten');
  }

  document.addEventListener('click',event=>{if(event.target.closest('#sfDemoTourHelpBtn')){event.preventDefault();event.stopImmediatePropagation();start()}},true);
  document.addEventListener('keydown',event=>{if(active&&event.key==='Escape')skip()});
  addEventListener('resize',()=>{const card=document.getElementById('sfDemoTourCard');if(card)position(card,target)});
  const observer=new MutationObserver(ensureHelp);
  function boot(){css();ensureHelp();observer.observe(document.body,{childList:true,subtree:true});if(!sessionStorage.getItem(SEEN_KEY))setTimeout(()=>start(),1400)}
  window.SFDemoTour={start,skip,isActive:()=>active,steps:steps.length};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
