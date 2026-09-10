// SchichtFunk – Mobile/PWA-Optimierung für das Mitarbeiterportal V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__employeeMobilePwaV1)return;B.__employeeMobilePwaV1=true;

  let installPrompt=null;
  let lastActive='';
  const demo=()=>sessionStorage.getItem('sf_demo_session_v1')==='active';
  const isEmployee=()=>B.role==='EMPLOYEE';
  const isStandalone=()=>window.matchMedia?.('(display-mode: standalone)').matches===true||window.navigator.standalone===true;
  const isIos=()=>/iphone|ipad|ipod/i.test(navigator.userAgent||'');

  function css(){
    if(document.getElementById('sfEmployeeMobilePwaCss'))return;
    const s=document.createElement('style');s.id='sfEmployeeMobilePwaCss';s.textContent=`
      #sfEmployeePortal .sf-emp-mobile-dock,#sfEmployeePortal .sf-emp-more-backdrop,#sfEmployeePortal .sf-pwa-install-card{display:none}
      @media(max-width:820px){
        #sfEmployeePortal{--sf-employee-head:68px!important;overscroll-behavior:none;background:#07111d}
        #sfEmployeePortal .sf-employee-side{display:none!important}
        #sfEmployeePortal .sf-portal-top{left:0!important;right:0!important;top:0!important;height:var(--sf-employee-head)!important;padding:0 12px!important;gap:7px!important;position:absolute!important;z-index:100!important}
        #sfEmployeePortal .sf-portal-logo{width:min(176px,45vw)!important;height:52px!important;min-width:0!important}
        #sfEmployeePortal .sf-company-context{margin-left:4px!important;padding-left:8px!important;border-left:0!important}
        #sfEmployeePortal .sf-company-context span{display:none!important}
        #sfEmployeePortal .sf-portal-top .ghost{min-width:44px!important;min-height:44px!important;padding:0 10px!important}
        #sfEmployeePortal .sf-portal-main{left:0!important;right:0!important;top:var(--sf-employee-head)!important;bottom:calc(68px + env(safe-area-inset-bottom))!important;padding:16px 13px 28px!important;overflow-y:auto!important;overflow-x:hidden!important;-webkit-overflow-scrolling:touch;overscroll-behavior-y:contain;scrollbar-gutter:auto!important}
        #sfEmployeePortal .sf-portal-welcome{display:block!important;margin:0 0 12px!important}
        #sfEmployeePortal:not([data-sf-portal-active="dashboard"]) .sf-portal-welcome{display:none!important}
        #sfEmployeePortal .sf-portal-welcome h1{font-size:23px!important;line-height:1.15!important;margin:3px 0 5px!important}
        #sfEmployeePortal .sf-portal-welcome p{font-size:11px!important;line-height:1.45!important}
        #sfEmployeePortal .sf-portal-stats{display:flex!important;grid-template-columns:none!important;gap:10px!important;margin:12px -13px 16px!important;padding:0 13px 3px!important;overflow-x:auto!important;scroll-snap-type:x proximity;scrollbar-width:none}
        #sfEmployeePortal:not([data-sf-portal-active="dashboard"]) .sf-portal-stats{display:none!important}
        #sfEmployeePortal .sf-portal-stats::-webkit-scrollbar{display:none}
        #sfEmployeePortal .sf-portal-stat{flex:0 0 min(72vw,210px)!important;min-width:min(72vw,210px)!important;min-height:82px!important;padding:14px!important;scroll-snap-align:start;border-radius:14px!important}
        #sfEmployeePortal .sf-portal-stat strong{font-size:21px!important}
        #sfEmployeePortal .sf-employee-dashboard h2{font-size:16px!important}
        #sfEmployeePortal .sf-employee-dashboard>p{font-size:10.5px!important;line-height:1.45!important;margin-bottom:12px!important}
        #sfEmployeePortal .sf-employee-tiles{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}
        #sfEmployeePortal .sf-employee-tile{min-height:112px!important;padding:14px!important;border-radius:13px!important;touch-action:manipulation}
        #sfEmployeePortal .sf-employee-tile-icon{width:34px!important;height:34px!important}
        #sfEmployeePortal .sf-employee-tile b{font-size:12px!important;margin-top:11px!important;line-height:1.25}
        #sfEmployeePortal .sf-employee-tile small{font-size:9px!important;line-height:1.35!important}
        #sfEmployeePortal .sf-portal-card{padding:16px!important;border-radius:14px!important}
        #sfEmployeePortal .sf-employee-view-head{margin-bottom:13px!important;padding-bottom:12px!important}
        #sfEmployeePortal .sf-employee-view-head h1{font-size:22px!important;margin:4px 0!important}
        #sfEmployeePortal .sf-employee-view-head p{font-size:10.5px!important;line-height:1.45!important}
        #sfEmployeePortal :where(button,[role="button"],a[href],input:not([type="checkbox"]):not([type="radio"]),select,textarea){min-height:44px}
        #sfEmployeePortal :where(input[type="text"],input[type="email"],input[type="password"],input[type="tel"],input[type="number"],input[type="date"],input[type="time"],select,textarea){font-size:16px!important;max-width:100%}
        #sfEmployeePortal :where(table,.table,.sf-table){max-width:100%}
        #sfEmployeePortal :where(.sf-portal-card,.sf-employee-dashboard){min-width:0!important;max-width:100%!important}
        #sfEmployeePortal .sf-emp-mobile-dock{position:absolute;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));left:0;right:0;bottom:0;z-index:300;height:calc(68px + env(safe-area-inset-bottom));padding:5px 5px env(safe-area-inset-bottom);background:rgba(7,17,29,.97);border-top:1px solid #244057;box-shadow:0 -14px 36px #020811aa;backdrop-filter:blur(16px)}
        #sfEmployeePortal .sf-emp-dock-btn{appearance:none;border:0;background:transparent;color:#7f99ae;border-radius:11px;min-width:0!important;min-height:54px!important;padding:4px 2px!important;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font:inherit;cursor:pointer;touch-action:manipulation}
        #sfEmployeePortal .sf-emp-dock-btn i{font-style:normal;font-size:19px;line-height:1}
        #sfEmployeePortal .sf-emp-dock-btn span{font-size:9px;font-weight:850;white-space:nowrap}
        #sfEmployeePortal .sf-emp-dock-btn.active{color:#77ead2;background:#10322e}
        #sfEmployeePortal .sf-emp-dock-btn.qr{position:relative;color:#ecfffb;background:linear-gradient(180deg,#188470,#105d50);border:1px solid #39ab91;box-shadow:0 7px 18px #041b1655}
        #sfEmployeePortal .sf-emp-dock-btn.qr i{font-size:21px}
        #sfEmployeePortal .sf-emp-more-backdrop{position:absolute;display:none;inset:0;z-index:450;background:#02070db8;backdrop-filter:blur(5px);align-items:flex-end}
        #sfEmployeePortal .sf-emp-more-backdrop.open{display:flex}
        #sfEmployeePortal .sf-emp-more-sheet{width:100%;max-height:min(72dvh,590px);overflow:auto;padding:12px 13px calc(82px + env(safe-area-inset-bottom));border-radius:20px 20px 0 0;border-top:1px solid #31536a;background:linear-gradient(180deg,#102131,#081522);box-shadow:0 -22px 60px #000a}
        #sfEmployeePortal .sf-emp-more-handle{width:42px;height:4px;border-radius:99px;background:#496176;margin:0 auto 11px}
        #sfEmployeePortal .sf-emp-more-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
        #sfEmployeePortal .sf-emp-more-head b{font-size:16px}.sf-emp-more-head small{display:block;color:#8199ad;font-size:10px;margin-top:2px}
        #sfEmployeePortal .sf-emp-more-close{width:44px!important;min-width:44px!important;height:44px;border:1px solid #315067;border-radius:11px;background:#0b1b29;color:#dcebf6;font-size:18px}
        #sfEmployeePortal .sf-emp-more-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
        #sfEmployeePortal .sf-emp-more-item{min-height:64px!important;border:1px solid #27445a;border-radius:12px;background:#0c1c2b;color:#dceaf5;padding:10px!important;text-align:left;display:flex;align-items:center;gap:9px;font:inherit}
        #sfEmployeePortal .sf-emp-more-item i{width:34px;height:34px;border-radius:9px;background:#12362f;color:#68e4ca;display:grid;place-items:center;font-style:normal;font-size:16px;flex:0 0 auto}
        #sfEmployeePortal .sf-emp-more-item b{font-size:10.5px;line-height:1.25}
        #sfEmployeePortal .sf-pwa-install-card{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px;padding:12px 13px;border:1px solid #31536b;border-radius:13px;background:linear-gradient(145deg,#10283a,#0b1b29);color:#dcebf6}
        #sfEmployeePortal .sf-pwa-install-card[hidden]{display:none!important}
        #sfEmployeePortal .sf-pwa-install-copy{min-width:0}.sf-pwa-install-copy b{display:block;font-size:11.5px}.sf-pwa-install-copy small{display:block;color:#91a7ba;font-size:9.5px;line-height:1.4;margin-top:3px}
        #sfEmployeePortal .sf-pwa-install-btn{flex:0 0 auto;min-height:44px!important;border:1px solid #37a98f;border-radius:10px;background:#135f51;color:#effffb;padding:8px 11px;font-weight:900;font-size:10px}
        #sfEmployeePortal .sf-pwa-ios-help{display:none;margin-top:7px;color:#9db3c5;font-size:9.5px;line-height:1.45}
        #sfEmployeePortal .sf-pwa-install-card.ios-help-open .sf-pwa-ios-help{display:block}
      }
      @media(max-width:380px){
        #sfEmployeePortal .sf-portal-logo{width:min(145px,42vw)!important}
        #sfEmployeePortal .sf-employee-tiles{grid-template-columns:1fr!important}
        #sfEmployeePortal .sf-emp-dock-btn span{font-size:8px}
        #sfEmployeePortal .sf-emp-more-grid{grid-template-columns:1fr}
      }
      @media(display-mode:standalone){#sfEmployeePortal .sf-pwa-install-card{display:none!important}}
    `;document.head.appendChild(s);
  }

  function ensureDock(portal){
    let dock=portal.querySelector('#sfEmployeeMobileDock');
    if(dock)return dock;
    dock=document.createElement('nav');dock.id='sfEmployeeMobileDock';dock.className='sf-emp-mobile-dock';dock.setAttribute('aria-label','Schnellnavigation Mitarbeiterportal');
    dock.innerHTML=`
      <button type="button" class="sf-emp-dock-btn" data-sf-employee-view="dashboard" aria-label="Heute"><i>⌂</i><span>Heute</span></button>
      <button type="button" class="sf-emp-dock-btn" data-sf-employee-view="shifts" aria-label="Meine Schichten"><i>▣</i><span>Schichten</span></button>
      <button type="button" class="sf-emp-dock-btn qr" data-sf-qr-scan aria-label="QR-Code scannen"><i>▦</i><span>QR-Scan</span></button>
      <button type="button" class="sf-emp-dock-btn" data-sf-employee-view="time" aria-label="Arbeitszeit"><i>◷</i><span>Arbeitszeit</span></button>
      <button type="button" class="sf-emp-dock-btn" data-sf-mobile-more aria-label="Weitere Bereiche"><i>•••</i><span>Mehr</span></button>`;
    portal.appendChild(dock);return dock;
  }

  function ensureMore(portal){
    let back=portal.querySelector('#sfEmployeeMobileMore');if(back)return back;
    back=document.createElement('div');back.id='sfEmployeeMobileMore';back.className='sf-emp-more-backdrop';back.setAttribute('aria-hidden','true');
    back.innerHTML=`<section class="sf-emp-more-sheet" role="dialog" aria-modal="true" aria-labelledby="sfEmpMoreTitle"><div class="sf-emp-more-handle"></div><div class="sf-emp-more-head"><div><b id="sfEmpMoreTitle">Weitere Bereiche</b><small>Alles Weitere im Mitarbeiterportal</small></div><button type="button" class="sf-emp-more-close" aria-label="Menü schließen">×</button></div><div class="sf-emp-more-grid">
      <button type="button" class="sf-emp-more-item" data-sf-employee-view="disruptions"><i>⚡</i><b>Ersatzanfragen</b></button>
      <button type="button" class="sf-emp-more-item" data-sf-employee-view="marketplace"><i>↺</i><b>Schicht-Marktplatz</b></button>
      <button type="button" class="sf-emp-more-item" data-sf-employee-view="changes"><i>◇</i><b>Schichtänderungen</b></button>
      <button type="button" class="sf-emp-more-item" data-sf-employee-view="swaps"><i>⇄</i><b>Schichttausch</b></button>
      <button type="button" class="sf-emp-more-item" data-sf-employee-view="absences"><i>☼</i><b>Abwesenheiten</b></button>
      <button type="button" class="sf-emp-more-item" data-sf-employee-view="account"><i>∑</i><b>Stundenkonto</b></button>
      <button type="button" class="sf-emp-more-item" data-sf-employee-view="wage"><i>€</i><b>Lohnvorschau</b></button>
      <button type="button" class="sf-emp-more-item" data-sf-employee-view="profile"><i>♙</i><b>Mein Profil</b></button>
    </div></section>`;
    portal.appendChild(back);
    const close=()=>{back.classList.remove('open');back.setAttribute('aria-hidden','true')};
    back.querySelector('.sf-emp-more-close').onclick=close;
    back.addEventListener('click',e=>{if(e.target===back||e.target.closest('[data-sf-employee-view]'))close()});
    back.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
    return back;
  }

  function openMore(portal){
    const back=ensureMore(portal);back.classList.add('open');back.setAttribute('aria-hidden','false');requestAnimationFrame(()=>back.querySelector('.sf-emp-more-close')?.focus());
  }

  function installMode(){
    if(isStandalone()||demo())return '';
    if(installPrompt)return 'prompt';
    if(isIos())return 'ios';
    return '';
  }

  function ensureInstall(portal){
    const dash=portal.querySelector('.sf-employee-dashboard');if(!dash)return;
    let card=dash.querySelector('#sfEmployeePwaInstall');
    if(!card){card=document.createElement('section');card.id='sfEmployeePwaInstall';card.className='sf-pwa-install-card';card.hidden=true;dash.insertBefore(card,dash.firstChild)}
    const mode=installMode();
    if(!mode){card.hidden=true;card.dataset.sfInstallMode='';return}
    card.hidden=false;
    if(card.dataset.sfInstallMode===mode)return;
    card.dataset.sfInstallMode=mode;
    if(mode==='prompt'){
      card.classList.remove('ios-help-open');
      card.innerHTML='<div class="sf-pwa-install-copy"><b>SchichtFunk wie eine App nutzen</b><small>Auf dem Startbildschirm installieren und schneller ins Mitarbeiterportal starten.</small></div><button type="button" class="sf-pwa-install-btn" data-sf-pwa-install>Installieren</button>';
    }else{
      card.innerHTML='<div class="sf-pwa-install-copy"><b>SchichtFunk zum Home-Bildschirm</b><small>Auf iPhone/iPad kannst du SchichtFunk wie eine App öffnen.</small><div class="sf-pwa-ios-help">In Safari unten auf <b>Teilen</b> tippen und anschließend <b>„Zum Home-Bildschirm“</b> wählen.</div></div><button type="button" class="sf-pwa-install-btn" data-sf-pwa-ios>Anleitung</button>';
    }
  }

  function updateActive(portal){
    const active=portal.dataset.sfPortalActive||'dashboard';
    if(active===lastActive&&portal.querySelector('#sfEmployeeMobileDock'))return;
    lastActive=active;
    portal.querySelectorAll('#sfEmployeeMobileDock [data-sf-employee-view]').forEach(b=>b.classList.toggle('active',b.dataset.sfEmployeeView===active));
    const moreSet=new Set(['disruptions','marketplace','changes','swaps','absences','account','wage','profile']);
    portal.querySelector('#sfEmployeeMobileDock [data-sf-mobile-more]')?.classList.toggle('active',moreSet.has(active));
  }

  function mount(){
    if(!isEmployee())return false;
    const portal=document.getElementById('sfEmployeePortal');if(!portal)return false;css();
    portal.classList.add('sf-employee-mobile-pwa');ensureDock(portal);ensureMore(portal);ensureInstall(portal);updateActive(portal);return true;
  }

  async function registerServiceWorker(){
    if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
    try{await navigator.serviceWorker.register('/schichtfunk-sw.js',{scope:'/'});}catch(e){console.debug('[SchichtFunk PWA]',e?.message||e)}
  }

  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;mount()});
  window.addEventListener('appinstalled',()=>{installPrompt=null;document.querySelector('#sfEmployeePwaInstall')?.setAttribute('hidden','')});
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change',()=>mount());

  document.addEventListener('click',async e=>{
    const more=e.target.closest?.('[data-sf-mobile-more]');if(more){const portal=document.getElementById('sfEmployeePortal');if(portal){e.preventDefault();openMore(portal)}return}
    const install=e.target.closest?.('[data-sf-pwa-install]');if(install&&installPrompt){e.preventDefault();const prompt=installPrompt;installPrompt=null;try{await prompt.prompt();await prompt.userChoice}catch{}mount();return}
    const ios=e.target.closest?.('[data-sf-pwa-ios]');if(ios){e.preventDefault();e.target.closest('.sf-pwa-install-card')?.classList.toggle('ios-help-open');return}
  },true);

  const observer=new MutationObserver(records=>{
    if(!isEmployee())return;
    const portal=document.getElementById('sfEmployeePortal');if(!portal)return;
    const activeChanged=records.some(r=>r.type==='attributes'&&r.target===portal&&r.attributeName==='data-sf-portal-active');
    mount();if(activeChanged)updateActive(portal);
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-sf-portal-active']});

  registerServiceWorker();
  setTimeout(mount,500);setTimeout(mount,1500);setInterval(()=>{if(isEmployee())mount()},5000);
})();
