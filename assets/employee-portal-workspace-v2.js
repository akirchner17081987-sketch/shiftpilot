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
  let active='dashboard',queued=false,arranging=false;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function css(){
    if(document.getElementById('sfEmployeePortalWorkspaceV2'))return;
    const s=document.createElement('style');s.id='sfEmployeePortalWorkspaceV2';s.textContent=`
      #sfEmployeePortal{--sf-employee-nav:286px;--sf-employee-head:88px;overflow:hidden;background:#07111d}
      #sfEmployeePortal .sf-portal-top{position:absolute;z-index:8;left:var(--sf-employee-nav);right:0;top:0;height:var(--sf-employee-head);padding:0 30px;border-bottom:1px solid #21384f;background:linear-gradient(110deg,#0d1d2d,#0a1725);box-shadow:0 8px 28px #02081155}
      #sfEmployeePortal .sf-portal-logo{width:48px;height:48px;border-radius:14px;background:linear-gradient(145deg,#2dd7b7,#159a83);color:#03251f;display:grid;place-items:center;font-size:15px;font-weight:1000;letter-spacing:.04em;box-shadow:0 8px 24px #28d7b53b}
      #sfEmployeePortal .sf-portal-brand b{display:block;font-size:17px;letter-spacing:.01em;color:#f4f9ff}
      #sfEmployeePortal .sf-portal-brand small{display:block;margin-top:3px;color:#8ea5ba;font-size:11px}
      #sfEmployeePortal .sf-company-context{display:flex;align-items:center;gap:9px;margin-left:18px;padding-left:18px;border-left:1px solid #274057;color:#9cb2c6;font-size:11px}
      #sfEmployeePortal .sf-company-context i{width:8px;height:8px;border-radius:50%;background:#2bd6b4;box-shadow:0 0 0 5px #2bd6b41a}
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
      #sfEmployeePortal .sf-employee-nav-group>span{display:block;padding:0 10px 7px;color:#617b91;font-size:9px;font-weight:900;letter-spacing:.15em}
      #sfEmployeePortal .sf-employee-nav-btn{width:100%;border:0;background:transparent;color:#9fb4c7;border-radius:11px;padding:10px 11px;display:grid;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;gap:9px;text-align:left;cursor:pointer;transition:.16s ease}
      #sfEmployeePortal .sf-employee-nav-btn:hover{background:#102438;color:#e8f2fb}
      #sfEmployeePortal .sf-employee-nav-btn.active{background:#12312f;color:#eafffa;box-shadow:inset 3px 0 #2bd6b4}
      #sfEmployeePortal .sf-employee-nav-icon{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:#10273a;color:#8db0c9;font-weight:900}
      #sfEmployeePortal .sf-employee-nav-btn.active .sf-employee-nav-icon{background:#1b5148;color:#6ee9d0}
      #sfEmployeePortal .sf-employee-nav-copy b,#sfEmployeePortal .sf-employee-nav-copy small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #sfEmployeePortal .sf-employee-nav-copy b{font-size:11px}.sf-employee-nav-copy small{margin-top:2px;font-size:8.5px;color:#688398}
      #sfEmployeePortal .sf-employee-nav-count{min-width:21px;height:21px;padding:0 6px;border-radius:999px;display:grid;place-items:center;background:#162b3e;color:#88a3b8;font-size:9px;font-weight:900}
      #sfEmployeePortal .sf-employee-side-foot{padding:14px 16px;border-top:1px solid #20364b;color:#6f879b;font-size:9px;line-height:1.5}
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
      @media(max-width:1100px){#sfEmployeePortal{--sf-employee-nav:246px}#sfEmployeePortal .sf-employee-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:820px){
        #sfEmployeePortal{--sf-employee-head:76px;overflow:hidden}
        #sfEmployeePortal .sf-portal-top{position:absolute;left:0;right:0;height:var(--sf-employee-head);padding:0 14px}
        #sfEmployeePortal .sf-company-context{display:none}#sfEmployeePortal .sf-portal-logo{width:42px;height:42px}
        #sfEmployeePortal .sf-employee-side{position:absolute;left:0;right:0;top:var(--sf-employee-head);bottom:auto;width:100%;height:62px;border-left:0;border-bottom:1px solid #22394f;box-shadow:0 12px 26px #02081166}
        #sfEmployeePortal .sf-employee-side-head,#sfEmployeePortal .sf-employee-side-foot,#sfEmployeePortal .sf-employee-nav-group>span{display:none}
        #sfEmployeePortal .sf-employee-nav-scroll{display:flex;gap:7px;padding:9px 10px;overflow:auto}
        #sfEmployeePortal .sf-employee-nav-group{display:contents}.sf-employee-nav-btn{min-width:max-content!important;width:auto!important;display:flex!important;padding:8px 10px!important}
        #sfEmployeePortal .sf-employee-nav-copy small,#sfEmployeePortal .sf-employee-nav-count{display:none!important}
        #sfEmployeePortal .sf-portal-main{position:absolute;left:0;right:0;top:calc(var(--sf-employee-head) + 62px);bottom:0;padding:22px 14px 34px;overflow:auto}
        #sfEmployeePortal .sf-portal-welcome{display:block}#sfEmployeePortal .sf-portal-welcome h1{font-size:25px}
        #sfEmployeePortal .sf-portal-stats{grid-template-columns:1fr 1fr}.sf-employee-tiles{grid-template-columns:1fr 1fr!important}
      }
      @media(max-width:560px){#sfEmployeePortal .sf-portal-brand b{font-size:14px}#sfEmployeePortal .sf-portal-brand small{font-size:9px}#sfEmployeePortal .sf-portal-top .ghost{padding:0 10px}.sf-portal-stats{grid-template-columns:1fr!important}.sf-employee-tiles{grid-template-columns:1fr!important}}
    `;document.head.appendChild(s)
  }
  function initials(value){return String(value||'U').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'U'}
  function flatNav(){return NAV.flatMap(g=>g.items)}
  function navHtml(){return NAV.map(g=>`<div class="sf-employee-nav-group"><span>${g.group}</span>${g.items.map(([id,icon,label,desc])=>`<button type="button" class="sf-employee-nav-btn" data-sf-employee-view="${id}"><i class="sf-employee-nav-icon">${icon}</i><span class="sf-employee-nav-copy"><b>${label}</b><small>${desc}</small></span><em class="sf-employee-nav-count" data-count-for="${id}">0</em></button>`).join('')}</div>`).join('')}
  function tileHtml(){return flatNav().filter(x=>x[0]!=='dashboard').map(([id,icon,label,desc])=>`<button type="button" class="sf-employee-tile" data-sf-employee-view="${id}"><span class="sf-employee-tile-top"><i class="sf-employee-tile-icon">${icon}</i><em class="sf-employee-nav-count" data-count-for="${id}">0</em></span><b>${label}</b><small>${desc}</small></button>`).join('')}
  function sectionInfo(id){const x=flatNav().find(x=>x[0]===id);return x||['dashboard','⌂','Übersicht','Alles Wichtige auf einen Blick']}
  function countFor(portal,id){const card=portal.querySelector(`.sf-portal-card[data-sf-portal-section="${id}"]`);if(!card)return 0;const selectors={disruptions:'.sf-disruption-offer',marketplace:'.sf-market-row',shifts:'.sf-shift-item',changes:'.sf-request-item',swaps:'.sf-swap-item',time:'.sf-time-item',absences:'.sf-absence-item'};return selectors[id]?card.querySelectorAll(selectors[id]).length:card.querySelector('.sf-empty,.sf-market-empty,.sf-time-empty,.sf-ta-empty')?0:1}
  function updateCounts(portal){flatNav().forEach(([id])=>{const n=id==='dashboard'?'':String(countFor(portal,id));portal.querySelectorAll(`[data-count-for="${id}"]`).forEach(x=>{if(x.textContent!==n)x.textContent=n})})}
  function renderState(portal){
    const [,icon,label,desc]=sectionInfo(active);portal.dataset.sfPortalActive=active;
    portal.querySelectorAll('[data-sf-employee-view]').forEach(b=>b.classList.toggle('active',b.dataset.sfEmployeeView===active));
    const head=portal.querySelector('.sf-employee-view-head');if(head)head.innerHTML=`<div class="eyebrow">MITARBEITERPORTAL · ${icon}</div><h1>${label}</h1><p>${desc}</p>`;
    const missing=active!=='dashboard'&&!portal.querySelector(`.sf-portal-card[data-sf-portal-section="${active}"]`);portal.classList.toggle('sf-employee-view-missing',missing);
    const main=portal.querySelector('.sf-portal-main');if(main)main.scrollTop=0;updateCounts(portal)
  }
  function navigate(id){const portal=document.getElementById('sfEmployeePortal');if(!portal)return;active=flatNav().some(x=>x[0]===id)?id:'dashboard';try{sessionStorage.setItem('sfEmployeePortalView',active)}catch{}renderState(portal)}
  function arrange(){
    if(arranging)return false;const portal=document.getElementById('sfEmployeePortal');if(!portal)return false;arranging=true;css();
    try{
      const d=B.employeePortalData||{},company=d.company?.name||'Mein Unternehmen',employee=[d.employee?.first_name,d.employee?.last_name].filter(Boolean).join(' ')||'Mitarbeiter';
      const logo=portal.querySelector('.sf-portal-logo');if(logo)logo.textContent=initials(company);
      const brand=portal.querySelector('.sf-portal-brand');if(brand)brand.innerHTML=`<b>${esc(company)}</b><small>Mitarbeiterportal · persönlicher Bereich</small>`;
      const top=portal.querySelector('.sf-portal-top');if(top&&!top.querySelector('.sf-company-context')){const context=document.createElement('div');context.className='sf-company-context';context.innerHTML='<i></i><span>Sicher mit dem Unternehmen verbunden</span>';top.querySelector('.spacer')?.before(context)}
      if(!portal.querySelector('.sf-employee-side')){const side=document.createElement('aside');side.className='sf-employee-side';side.innerHTML=`<div class="sf-employee-side-head"><span class="sf-employee-avatar">${initials(employee)}</span><div><b>${esc(employee)}</b><small>${esc(company)}</small></div></div><nav class="sf-employee-nav-scroll" aria-label="Mitarbeiterportal Bereiche">${navHtml()}</nav><div class="sf-employee-side-foot">Persönlicher und geschützter Arbeitsbereich<br>Nur deine eigenen Daten werden angezeigt.</div>`;portal.appendChild(side)}
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
  const observer=new MutationObserver(()=>{if(queued||arranging||!document.getElementById('sfEmployeePortal'))return;queued=true;requestAnimationFrame(()=>{queued=false;arrange()})});observer.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(arrange,0);setTimeout(arrange,700)
})();
