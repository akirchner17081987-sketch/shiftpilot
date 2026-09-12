// SchichtFunk – Mitarbeiterportal als eigener Arbeitsbereich V2
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__employeePortalWorkspaceV2)return;B.__employeePortalWorkspaceV2=true;
  const NAV=[
    {group:'START',items:[['dashboard','⌂','Übersicht','Alles Wichtige auf einen Blick']]},
    {group:'EINSATZ',items:[['disruptions','⚡','Ersatzanfragen','Dringende Schichten beantworten'],['marketplace','↺','Schicht-Marktplatz','Schichten anbieten und übernehmen'],['shifts','▣','Meine Schichten','Persönlichen Dienstplan ansehen']]},
    {group:'ANTRÄGE & ZEIT',items:[['changes','◇','Schichtänderungen','Anfragen und Entscheidungen'],['swaps','⇄','Schichttausch','Tauschvorgänge verfolgen'],['time','◷','Arbeitszeit','Ist-Zeiten erfassen'],['absences','☼','Abwesenheiten','Urlaub und Abwesenheit']]},
    {group:'MEIN KONTO',items:[['account','∑','Stundenkonto','Saldo und Monatswerte'],['wage','€','Lohnvorschau','Persönliche Vorschau'],['profile','♙','Mein Profil','Eigene Stammdaten']]}
  ];
  const META={
    '⚡ Dringende Ersatzanfragen':'disruptions','Schicht-Marktplatz':'marketplace','Meine Schichten':'shifts',
    'Schichtänderungen':'changes','Schichttausch':'swaps','Arbeitszeit':'time','Abwesenheiten':'absences',
    'Stundenkonto':'account','Lohnvorschau':'wage','Mein Profil':'profile'
  };
  const MOBILE_MAIN=new Set(['dashboard','shifts','time']);
  let active='dashboard',queued=false,arranging=false;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const setHtmlIfChanged=(node,html)=>{if(node&&node.innerHTML!==html)node.innerHTML=html};
  B.bindAccessibleModal=function(backdrop,{dialogSelector='[role="dialog"],[role="alertdialog"]',initialFocus,returnFocus,returnFocusSelector}={}){
    const opener=returnFocus||document.activeElement,dialog=backdrop.querySelector(dialogSelector);
    if(!dialog)return()=>backdrop.remove();
    const focusable=()=>[...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter(node=>node.offsetParent!==null);
    const restoreOpener=()=>{const target=opener?.isConnected?opener:(returnFocusSelector?document.querySelector(returnFocusSelector):null);target?.focus({preventScroll:true})};
    const close=()=>{backdrop.remove();requestAnimationFrame(restoreOpener);setTimeout(restoreOpener,80)};
    backdrop.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();close();return}
      if(event.key!=='Tab')return;
      const nodes=focusable();
      if(!nodes.length){event.preventDefault();dialog.focus();return}
      const first=nodes[0],last=nodes[nodes.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    });
    requestAnimationFrame(()=>{const target=initialFocus?dialog.querySelector(initialFocus):focusable()[0];(target||dialog).focus()});
    return close;
  };
  function css(){
    if(document.getElementById('sfEmployeePortalWorkspaceV2'))return;
    const s=document.createElement('style');s.id='sfEmployeePortalWorkspaceV2';s.textContent=`
      #sfEmployeePortal{--sf-employee-nav:286px;--sf-employee-head:88px;overflow:hidden;background:#07111d}
      #sfEmployeePortal .sf-portal-top{position:absolute;z-index:8;left:var(--sf-employee-nav);right:0;top:0;height:var(--sf-employee-head);padding:0 30px;border-bottom:1px solid #21384f;background:linear-gradient(110deg,#0d1d2d,#0a1725);box-shadow:0 8px 28px #02081155}
      #sfEmployeePortal .sf-portal-logo{width:clamp(230px,22vw,300px);height:70px;display:flex;align-items:center;justify-content:flex-start;flex:0 1 auto;min-width:0;border:0;border-radius:0;background:transparent;box-shadow:none;color:inherit;overflow:visible}
      #sfEmployeePortal .sf-portal-logo img{display:block;width:100%;height:100%;object-fit:contain;object-position:left center;filter:drop-shadow(0 7px 18px #00cfd333)}
      #sfEmployeePortal .sf-portal-brand{display:none}
      #sfEmployeePortal .sf-company-context{display:flex;align-items:center;gap:9px;margin-left:18px;padding-left:18px;border-left:1px solid #274057;color:#9cb2c6;font-size:11px}
      #sfEmployeePortal .sf-company-context i{width:8px;height:8px;border-radius:50%;background:#2bd6b4;box-shadow:0 0 0 5px #2bd6b41a}
      #sfEmployeePortal .sf-company-context.pending i{background:#e9bd55;box-shadow:0 0 0 5px #e9bd551a}
      #sfEmployeePortal .sf-company-context.offline{color:#f0a6ad}
      #sfEmployeePortal .sf-company-context.offline i{background:#e86873;box-shadow:0 0 0 5px #e868731f}
      #sfEmployeePortal .sf-portal-top .ghost{border-color:#29445d;background:#0a1928;color:#c8d8e7;min-height:40px;padding:0 15px}
      #sfEmployeePortal .sf-portal-main{position:absolute;left:var(--sf-employee-nav);right:0;top:var(--sf-employee-head);bottom:0;max-width:none;margin:0;padding:30px clamp(22px,3vw,52px) 48px;overflow:auto;scrollbar-gutter:stable}
      #sfEmployeePortal .sf-employee-side{position:absolute;z-index:10;left:0;top:0;bottom:0;width:var(--sf-employee-nav);display:flex;flex-direction:column;background:#0a1725;border-right:1px solid #22394f;box-shadow:16px 0 36px #02081138}
      #sfEmployeePortal .sf-employee-side-head{min-height:88px;padding:17px 18px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #20364b}
      #sfEmployeePortal .sf-employee-avatar{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;background:#123b36;color:#72ead1;font-weight:1000}
      #sfEmployeePortal .sf-employee-side-head b,#sfEmployeePortal .sf-employee-side-head small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #sfEmployeePortal .sf-employee-side-head b{font-size:13px;color:#eef7ff}
      #sfEmployeePortal .sf-employee-side-head small{font-size:10px;color:#8098ad;margin-top:4px}
      #sfEmployeePortal .sf-employee-nav-scroll{padding:14px 12px 22px;overflow:auto;flex:1}
      #sfEmployeePortal .sf-employee-nav-group{margin:0 0 18px}
      #sfEmployeePortal .sf-employee-nav-group>span{display:block;padding:0 10px 7px;color:#7894aa;font-size:9px;font-weight:900;letter-spacing:.15em}
      #sfEmployeePortal .sf-employee-nav-btn{width:100%;border:0;background:transparent;color:#9fb4c7;border-radius:11px;padding:10px 11px;display:grid;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;gap:9px;text-align:left;cursor:pointer;transition:.16s ease}
      #sfEmployeePortal .sf-employee-nav-btn:hover{background:#102438;color:#e8f2fb}
      #sfEmployeePortal .sf-employee-nav-btn.active{background:#12312f;color:#eafffa;box-shadow:inset 3px 0 #2bd6b4}
      #sfEmployeePortal .sf-employee-nav-icon{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:#10273a;color:#8db0c9;font-weight:900}
      #sfEmployeePortal .sf-employee-nav-btn.active .sf-employee-nav-icon{background:#1b5148;color:#6ee9d0}
      #sfEmployeePortal .sf-employee-nav-copy b,#sfEmployeePortal .sf-employee-nav-copy small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #sfEmployeePortal .sf-employee-nav-copy b{font-size:11px}.sf-employee-nav-copy small{margin-top:2px;font-size:8.5px;color:#688398}
      #sfEmployeePortal .sf-employee-nav-btn.active .sf-employee-nav-copy small{color:#a7c8c2}
      #sfEmployeePortal .sf-employee-nav-count{min-width:21px;height:21px;padding:0 6px;border-radius:999px;display:grid;place-items:center;background:#162b3e;color:#88a3b8;font-size:9px;font-weight:900}
      #sfEmployeePortal .sf-employee-side-foot{padding:14px 16px;border-top:1px solid #20364b;color:#6f879b;font-size:9px;line-height:1.5}
      #sfEmployeePortal .sf-employee-more-toggle,#sfEmployeePortal .sf-employee-mobile-more-layer{display:none}
      #sfEmployeePortal .sf-portal-welcome{max-width:none;display:flex;align-items:flex-end;justify-content:space-between;gap:20px}
      #sfEmployeePortal .sf-portal-welcome h1{font-size:30px;margin:5px 0 6px}#sfEmployeePortal .sf-portal-welcome p{font-size:12px}
      #sfEmployeePortal .sf-portal-stats{grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:22px 0}
      #sfEmployeePortal .sf-portal-stat{min-height:96px;padding:18px;border-radius:15px;background:linear-gradient(145deg,#0e2031,#0b1927);box-shadow:0 12px 30px #030a1242}
      #sfEmployeePortal .sf-portal-stat strong{font-size:24px}
      #sfEmployeePortal .sf-employee-view-head{display:none;margin-bottom:20px;padding-bottom:18px;border-bottom:1px solid #1f3549}
      #sfEmployeePortal .sf-employee-view-head .eyebrow{color:#2bd6b4}#sfEmployeePortal .sf-employee-view-head h1{font-size:28px;margin:5px 0 6px}#sfEmployeePortal .sf-employee-view-head p{margin:0;color:#869db1;font-size:11px}
      #sfEmployeePortal .sf-portal-grid{display:block!important;min-width:0}
      #sfEmployeePortal .sf-portal-grid>.sf-portal-layout-source{display:none!important}
      #sfEmployeePortal .sf-portal-grid .sf-portal-column,#sfEmployeePortal .sf-portal-grid .sf-portal-finance-row{display:contents!important}
      #sfEmployeePortal .sf-portal-card{display:none!important;width:100%;min-width:0;height:auto!important;max-height:none!important;overflow:visible!important;padding:22px;border-radius:16px;background:#0d1b2a;box-shadow:0 14px 34px #02091242}
      #sfEmployeePortal[data-sf-portal-active="disruptions"] .sf-portal-card[data-sf-portal-section="disruptions"],
      #sfEmployeePortal[data-sf-portal-active="marketplace"] .sf-portal-card[data-sf-portal-section="marketplace"],
      #sfEmployeePortal[data-sf-portal-active="shifts"] .sf-portal-card[data-sf-portal-section="shifts"],
      #sfEmployeePortal[data-sf-portal-active="changes"] .sf-portal-card[data-sf-portal-section="changes"],
      #sfEmployeePortal[data-sf-portal-active="swaps"] .sf-portal-card[data-sf-portal-section="swaps"],
      #sfEmployeePortal[data-sf-portal-active="time"] .sf-portal-card[data-sf-portal-section="time"],
      #sfEmployeePortal[data-sf-portal-active="absences"] .sf-portal-card[data-sf-portal-section="absences"],
      #sfEmployeePortal[data-sf-portal-active="account"] .sf-portal-card[data-sf-portal-section="account"],
      #sfEmployeePortal[data-sf-portal-active="wage"] .sf-portal-card[data-sf-portal-section="wage"],
      #sfEmployeePortal[data-sf-portal-active="profile"] .sf-portal-card[data-sf-portal-section="profile"]{display:block!important}
      #sfEmployeePortal .sf-employee-dashboard{display:none}
      #sfEmployeePortal[data-sf-portal-active="dashboard"] .sf-employee-dashboard{display:block}
      #sfEmployeePortal:not([data-sf-portal-active="dashboard"]) .sf-portal-welcome,#sfEmployeePortal:not([data-sf-portal-active="dashboard"]) .sf-portal-stats{display:none}
      #sfEmployeePortal:not([data-sf-portal-active="dashboard"]) .sf-employee-view-head{display:block}
      #sfEmployeePortal .sf-employee-dashboard h2{font-size:17px;margin:5px 0 6px}#sfEmployeePortal .sf-employee-dashboard>p{margin:0 0 16px;color:#7f97ab;font-size:11px}
      #sfEmployeePortal .sf-employee-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
      #sfEmployeePortal .sf-employee-tile{min-height:132px;padding:18px;border:1px solid #213b52;border-radius:15px;background:linear-gradient(145deg,#0e2031,#0a1826);color:#dbe9f4;text-align:left;cursor:pointer;display:flex;flex-direction:column;align-items:flex-start;transition:.16s ease}
      #sfEmployeePortal .sf-employee-tile:hover{transform:translateY(-2px);border-color:#2b796c;box-shadow:0 15px 32px #02091255}
      #sfEmployeePortal .sf-employee-tile-top{width:100%;display:flex;align-items:center;justify-content:space-between;margin-bottom:auto}
      #sfEmployeePortal .sf-employee-tile-icon{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:#12382f;color:#62e5ca;font-weight:1000}
      #sfEmployeePortal .sf-employee-tile b{font-size:13px;margin-top:14px}#sfEmployeePortal .sf-employee-tile small{font-size:9px;color:#7991a5;margin-top:5px;line-height:1.45}
      #sfEmployeePortal .sf-employee-view-empty{display:none;padding:36px;text-align:center;color:#7f97aa;border:1px dashed #29445c;border-radius:14px}
      #sfEmployeePortal.sf-employee-view-missing .sf-employee-view-empty{display:block}
      @media(max-width:1100px){#sfEmployeePortal{--sf-employee-nav:246px}#sfEmployeePortal .sf-portal-logo{width:230px}.sf-company-context span{display:none}#sfEmployeePortal .sf-employee-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:820px){
        #sfEmployeePortal{--sf-employee-head:76px;overflow:hidden}
        #sfEmployeePortal .sf-portal-top{position:absolute;left:0;right:0;height:var(--sf-employee-head);padding:0 14px}
        #sfEmployeePortal .sf-portal-logo{width:min(210px,48vw);height:56px}
        #sfEmployeePortal .sf-company-context{display:flex;margin-left:8px;padding-left:10px}
        #sfEmployeePortal .sf-employee-side{position:absolute;left:0;right:0;top:var(--sf-employee-head);bottom:auto;width:100%;height:108px;border-left:0;border-bottom:1px solid #22394f;box-shadow:0 12px 26px #02081166}
        #sfEmployeePortal .sf-employee-side-head{display:flex;min-height:46px;padding:5px 12px;border-bottom:1px solid #20364b}
        #sfEmployeePortal .sf-employee-avatar{width:34px;height:34px;border-radius:10px;font-size:11px}
        #sfEmployeePortal .sf-employee-side-head b{font-size:11px}#sfEmployeePortal .sf-employee-side-head small{font-size:8px;margin-top:2px}
        #sfEmployeePortal .sf-employee-side-foot,#sfEmployeePortal .sf-employee-nav-group>span{display:none}
        #sfEmployeePortal .sf-employee-nav-scroll{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;padding:5px 8px 7px;overflow:visible}
        #sfEmployeePortal .sf-employee-nav-group{display:contents}
        #sfEmployeePortal .sf-employee-nav-scroll>.sf-employee-nav-group>.sf-employee-nav-btn:not([data-sf-mobile-main="true"]){display:none!important}
        #sfEmployeePortal .sf-employee-nav-scroll>.sf-employee-nav-group>.sf-employee-nav-btn,#sfEmployeePortal .sf-employee-more-toggle{min-width:0!important;width:100%!important;min-height:50px!important;display:flex!important;flex-direction:column;justify-content:center;gap:2px;padding:3px!important;text-align:center;scroll-snap-align:none}
        #sfEmployeePortal .sf-employee-nav-scroll .sf-employee-nav-icon,#sfEmployeePortal .sf-employee-more-toggle .sf-employee-nav-icon{width:25px;height:25px;border-radius:7px;font-size:12px}
        #sfEmployeePortal .sf-employee-nav-scroll .sf-employee-nav-copy b,#sfEmployeePortal .sf-employee-more-toggle .sf-employee-nav-copy b{font-size:10px;line-height:1.15;white-space:normal}
        #sfEmployeePortal .sf-employee-nav-copy small,#sfEmployeePortal .sf-employee-nav-count{display:none!important}
        #sfEmployeePortal .sf-employee-more-toggle{border:0;background:transparent;color:#9fb4c7;border-radius:11px;align-items:center;cursor:pointer}
        #sfEmployeePortal .sf-employee-more-toggle.active{background:#12312f;color:#eafffa;box-shadow:inset 0 -3px #2bd6b4}
        #sfEmployeePortal .sf-employee-mobile-more-layer{position:fixed;z-index:30;inset:0;display:block;background:#02081299;padding:12px}
        #sfEmployeePortal .sf-employee-mobile-more-layer[hidden]{display:none!important}
        #sfEmployeePortal .sf-employee-more-backdrop{position:absolute;inset:0;border:0;background:transparent;cursor:default}
        #sfEmployeePortal .sf-employee-more-panel{position:absolute;left:12px;right:12px;bottom:12px;max-height:min(72vh,600px);overflow:auto;padding:16px;border:1px solid #2a465c;border-radius:18px;background:#0b1a28;box-shadow:0 24px 80px #000b;color:#eaf5fd}
        #sfEmployeePortal .sf-employee-more-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
        #sfEmployeePortal .sf-employee-more-head b{font-size:16px}.sf-employee-more-head small{display:block;margin-top:3px;color:#91a8bb;font-size:11px}
        #sfEmployeePortal .sf-employee-more-close{width:44px;height:44px;border:1px solid #2b4960;border-radius:12px;background:#102438;color:#eaf5fd;font-size:20px;cursor:pointer}
        #sfEmployeePortal .sf-employee-more-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        #sfEmployeePortal .sf-employee-more-panel .sf-employee-nav-btn{display:grid!important;grid-template-columns:32px minmax(0,1fr) auto!important;width:100%!important;min-height:58px!important;padding:9px!important;text-align:left!important}
        #sfEmployeePortal .sf-employee-more-panel .sf-employee-nav-copy b{font-size:12px}
        #sfEmployeePortal .sf-employee-more-panel .sf-employee-nav-copy small{display:block!important;font-size:10px}
        #sfEmployeePortal .sf-employee-more-panel .sf-employee-nav-count{display:grid!important}
        #sfEmployeePortal .sf-portal-main{position:absolute;left:0;right:0;top:calc(var(--sf-employee-head) + 108px);bottom:0;padding:22px 14px 34px;overflow:auto}
        #sfEmployeePortal .sf-portal-welcome{display:block}#sfEmployeePortal .sf-portal-welcome h1{font-size:25px}
        #sfEmployeePortal .sf-portal-stats{grid-template-columns:1fr 1fr}.sf-employee-tiles{grid-template-columns:1fr 1fr!important}
      }
      @media(max-width:560px){#sfEmployeePortal .sf-portal-top{gap:7px;padding:0 10px}#sfEmployeePortal .sf-portal-logo{width:min(184px,47vw);height:52px}#sfEmployeePortal .sf-company-context{margin-left:0;padding-left:7px}#sfEmployeePortal .sf-portal-top .ghost{min-height:44px;padding:0 9px;font-size:11px}.sf-portal-stats{grid-template-columns:1fr!important}.sf-employee-tiles{grid-template-columns:1fr!important}#sfEmployeePortal .sf-employee-more-grid{grid-template-columns:1fr}}
    `;document.head.appendChild(s)
  }
  function initials(value){return String(value||'U').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'U'}
  function flatNav(){return NAV.flatMap(g=>g.items)}
  function navButtonHtml([id,icon,label,desc],mobileMain=false){return `<button type="button" class="sf-employee-nav-btn" data-sf-employee-view="${id}"${mobileMain?' data-sf-mobile-main="true"':''}><i class="sf-employee-nav-icon">${icon}</i><span class="sf-employee-nav-copy"><b>${label}</b><small>${desc}</small></span><em class="sf-employee-nav-count" data-count-for="${id}">0</em></button>`}
  function navHtml(){return NAV.map(g=>`<div class="sf-employee-nav-group"><span>${g.group}</span>${g.items.map(item=>navButtonHtml(item,MOBILE_MAIN.has(item[0]))).join('')}</div>`).join('')}
  function mobileMoreHtml(){return flatNav().filter(item=>!MOBILE_MAIN.has(item[0])).map(item=>navButtonHtml(item)).join('')}
  function mobileMoreControls(){return `<button type="button" class="sf-employee-more-toggle" aria-expanded="false" aria-controls="sfEmployeeMorePanel"><i class="sf-employee-nav-icon" aria-hidden="true">•••</i><span class="sf-employee-nav-copy"><b>Mehr</b></span></button><div class="sf-employee-mobile-more-layer" hidden><button type="button" class="sf-employee-more-backdrop" aria-label="Mehr-Menü schließen"></button><section class="sf-employee-more-panel" id="sfEmployeeMorePanel" role="dialog" aria-modal="true" aria-labelledby="sfEmployeeMoreTitle" tabindex="-1"><header class="sf-employee-more-head"><div><b id="sfEmployeeMoreTitle">Weitere Bereiche</b><small>Alle Funktionen des Mitarbeiterportals</small></div><button type="button" class="sf-employee-more-close" aria-label="Mehr-Menü schließen">×</button></header><div class="sf-employee-more-grid">${mobileMoreHtml()}</div></section></div>`}
  function tileHtml(){return flatNav().filter(x=>x[0]!=='dashboard').map(([id,icon,label,desc])=>`<button type="button" class="sf-employee-tile" data-sf-employee-view="${id}"><span class="sf-employee-tile-top"><i class="sf-employee-tile-icon">${icon}</i><em class="sf-employee-nav-count" data-count-for="${id}">0</em></span><b>${label}</b><small>${desc}</small></button>`).join('')}
  function sectionInfo(id){const x=flatNav().find(x=>x[0]===id);return x||['dashboard','⌂','Übersicht','Alles Wichtige auf einen Blick']}
  function updateConnectionState(){const context=document.querySelector('#sfEmployeePortal .sf-company-context');if(!context)return;const online=navigator.onLine!==false,connected=online&&B.ready,text=!online?'Keine Netzwerkverbindung':connected?'Sicher mit dem Unternehmen verbunden':'Cloud-Verbindung wird hergestellt';context.classList.toggle('offline',!online);context.classList.toggle('pending',online&&!connected);context.setAttribute('aria-label',text);context.title=text;const label=context.querySelector('span');if(label&&label.textContent!==text)label.textContent=text}
  function countFor(portal,id){const card=portal.querySelector(`.sf-portal-card[data-sf-portal-section="${id}"]`);if(!card)return 0;const selectors={disruptions:'.sf-disruption-offer',marketplace:'.sf-market-row',shifts:'.sf-shift-item',changes:'.sf-change-card,.sf-request-item',swaps:'.sf-swap-item',time:'.sf-time-item',absences:'.sf-ae3-row,.sf-absence-item'};return selectors[id]?card.querySelectorAll(selectors[id]).length:card.querySelector('.sf-empty,.sf-market-empty,.sf-time-empty,.sf-ta-empty')?0:1}
  function updateCounts(portal){flatNav().forEach(([id])=>{const n=id==='dashboard'?'':String(countFor(portal,id));portal.querySelectorAll(`[data-count-for="${id}"]`).forEach(x=>{if(x.textContent!==n)x.textContent=n})})}
  function renderState(portal){
    const [,icon,label,desc]=sectionInfo(active);portal.dataset.sfPortalActive=active;
    portal.querySelectorAll('[data-sf-employee-view]').forEach(b=>b.classList.toggle('active',b.dataset.sfEmployeeView===active));
    const more=portal.querySelector('.sf-employee-more-toggle');if(more){const selected=!MOBILE_MAIN.has(active);more.classList.toggle('active',selected);more.setAttribute('aria-label',selected?`Mehr, aktueller Bereich: ${label}`:'Weitere Bereiche')}
    const head=portal.querySelector('.sf-employee-view-head');setHtmlIfChanged(head,`<div class="eyebrow">MITARBEITERPORTAL · ${icon}</div><h1>${label}</h1><p>${desc}</p>`);
    const missing=active!=='dashboard'&&!portal.querySelector(`.sf-portal-card[data-sf-portal-section="${active}"]`);portal.classList.toggle('sf-employee-view-missing',missing);
    updateCounts(portal)
  }
  function navigate(id){const portal=document.getElementById('sfEmployeePortal');if(!portal)return;active=flatNav().some(x=>x[0]===id)?id:'dashboard';try{sessionStorage.setItem('sfEmployeePortalView',active)}catch{}renderState(portal);const main=portal.querySelector('.sf-portal-main');if(main)main.scrollTop=0}
  function setMobileMore(portal,open,restoreFocus=true){const layer=portal.querySelector('.sf-employee-mobile-more-layer'),toggle=portal.querySelector('.sf-employee-more-toggle');if(!layer||!toggle)return;layer.hidden=!open;toggle.setAttribute('aria-expanded',String(open));document.body.classList.toggle('sf-employee-more-open',open);if(open)requestAnimationFrame(()=>layer.querySelector('.sf-employee-more-panel .sf-employee-nav-btn')?.focus());else if(restoreFocus)requestAnimationFrame(()=>toggle.focus())}
  function bindMobileMore(portal){if(portal.dataset.sfEmployeeMoreBound)return;portal.dataset.sfEmployeeMoreBound='true';portal.addEventListener('click',event=>{if(event.target.closest('.sf-employee-more-toggle')){setMobileMore(portal,true);return}if(event.target.closest('.sf-employee-more-close,.sf-employee-more-backdrop')){setMobileMore(portal,false);return}if(event.target.closest('.sf-employee-more-panel [data-sf-employee-view]'))setMobileMore(portal,false,false)});portal.addEventListener('keydown',event=>{const layer=portal.querySelector('.sf-employee-mobile-more-layer');if(!layer||layer.hidden)return;if(event.key==='Escape'){event.preventDefault();setMobileMore(portal,false);return}if(event.key!=='Tab')return;const nodes=[...layer.querySelectorAll('button:not([disabled])')].filter(node=>node.offsetParent!==null),first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}})}
  function integrateAddedCards(cards){
    const portal=document.getElementById('sfEmployeePortal'),grid=portal?.querySelector('.sf-portal-grid');if(!portal||!grid)return;
    cards.forEach(card=>{if(!portal.contains(card))return;const title=card.querySelector('h3')?.textContent.trim(),id=card.dataset.sfPortalSection||META[title];if(!id)return;card.dataset.sfPortalSection=id;if(card.parentElement!==grid)grid.appendChild(card)});
    updateCounts(portal);if(active!=='dashboard'&&portal.querySelector(`.sf-portal-card[data-sf-portal-section="${active}"]`))portal.classList.remove('sf-employee-view-missing')
  }
  function arrange(){
    if(arranging)return false;const portal=document.getElementById('sfEmployeePortal');if(!portal)return false;arranging=true;css();
    try{
      const d=B.employeePortalData||{},company=d.company?.name||'Mein Unternehmen',employee=[d.employee?.first_name,d.employee?.last_name].filter(Boolean).join(' ')||'Mitarbeiter';
      const logo=portal.querySelector('.sf-portal-logo');setHtmlIfChanged(logo,'<img src="assets/schichtfunk-company-logo.png" alt="SchichtFunk – Klar geplant. Stark besetzt." width="1500" height="436" decoding="async">');
      const brand=portal.querySelector('.sf-portal-brand');setHtmlIfChanged(brand,`<b>${esc(company)}</b><small>Mitarbeiterportal · persönlicher Bereich</small>`);
      const top=portal.querySelector('.sf-portal-top');if(top&&!top.querySelector('.sf-company-context')){const context=document.createElement('div');context.className='sf-company-context';context.setAttribute('role','status');context.innerHTML='<i></i><span></span>';top.querySelector('.spacer')?.before(context)}updateConnectionState();
      if(!portal.querySelector('.sf-employee-side')){const side=document.createElement('aside');side.className='sf-employee-side';side.innerHTML=`<div class="sf-employee-side-head"><span class="sf-employee-avatar">${initials(employee)}</span><div><b>${esc(employee)}</b><small>${esc(company)}</small></div></div><nav class="sf-employee-nav-scroll" aria-label="Mitarbeiterportal Bereiche">${navHtml()}${mobileMoreControls()}</nav><div class="sf-employee-side-foot">Persönlicher und geschützter Arbeitsbereich<br>Nur deine eigenen Daten werden angezeigt.</div>`;portal.appendChild(side)}
      bindMobileMore(portal);
      const main=portal.querySelector('.sf-portal-main'),grid=portal.querySelector('.sf-portal-grid');if(!main||!grid)return false;
      if(!main.querySelector('.sf-employee-view-head')){const h=document.createElement('header');h.className='sf-employee-view-head';grid.before(h)}
      if(!grid.querySelector('.sf-employee-dashboard')){const dash=document.createElement('section');dash.className='sf-employee-dashboard';dash.innerHTML=`<h2>Meine Bereiche</h2><p>Wähle einen Bereich aus. Es wird immer nur die aktuell benötigte Ansicht geöffnet.</p><div class="sf-employee-tiles">${tileHtml()}</div>`;grid.prepend(dash)}
      if(!grid.querySelector('.sf-employee-view-empty')){const empty=document.createElement('div');empty.className='sf-employee-view-empty';empty.textContent='Dieser Bereich wird gerade geladen. Bitte einen Moment warten.';grid.appendChild(empty)}
      const source=[...grid.children].find(x=>x.matches('div[style*="display:grid"]'));source?.classList.add('sf-portal-layout-source');
      portal.querySelectorAll('.sf-portal-card').forEach(card=>{const title=card.querySelector('h3')?.textContent.trim(),id=card.dataset.sfPortalSection||META[title];if(!id)return;card.dataset.sfPortalSection=id;if(card.parentElement!==grid)grid.appendChild(card)});
      portal.onclick=e=>{const b=e.target.closest('[data-sf-employee-view]');if(b&&portal.contains(b))navigate(b.dataset.sfEmployeeView)};
      renderState(portal);return true
    }finally{arranging=false}
  }
  B.employeePortalNavigate=navigate;
  try{const saved=sessionStorage.getItem('sfEmployeePortalView');if(flatNav().some(x=>x[0]===saved))active=saved}catch{}
  const old=B.openEmployeePortal;if(typeof old==='function')B.openEmployeePortal=function(){const r=old.apply(this,arguments);requestAnimationFrame(arrange);setTimeout(arrange,180);setTimeout(arrange,700);return r};
  const observer=new MutationObserver(records=>{if(arranging||!document.getElementById('sfEmployeePortal'))return;const cards=[];records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType!==1)return;if(node.matches?.('.sf-portal-card'))cards.push(node);node.querySelectorAll?.('.sf-portal-card').forEach(card=>cards.push(card))}));if(!cards.length||queued)return;queued=true;requestAnimationFrame(()=>{queued=false;integrateAddedCards([...new Set(cards)])})});observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('offline',updateConnectionState);window.addEventListener('online',()=>{updateConnectionState();setTimeout(updateConnectionState,1000)});
  setTimeout(arrange,0);setTimeout(arrange,700)
})();
