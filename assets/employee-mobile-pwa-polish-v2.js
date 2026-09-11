// SchichtFunk – Mitarbeiterportal Mobile/PWA Feinschliff V2
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__employeeMobilePwaPolishV2)return;
  B.__employeeMobilePwaPolishV2=true;

  const MOBILE=window.matchMedia('(max-width: 820px)');
  const SCROLL_PREFIX='sfEmployeeScrollV2:';
  let sheetOpener=null;
  let pendingView='';
  let keyboardTimer=null;

  const isEmployee=()=>B.role==='EMPLOYEE';
  const isDemo=()=>sessionStorage.getItem('sf_demo_session_v1')==='active';
  const isStandalone=()=>window.matchMedia?.('(display-mode: standalone)').matches===true||navigator.standalone===true;
  const portal=()=>document.getElementById('sfEmployeePortal');
  const main=()=>portal()?.querySelector('.sf-portal-main');
  const activeView=()=>portal()?.dataset.sfPortalActive||'dashboard';

  function css(){
    if(document.getElementById('sfEmployeeMobilePwaPolishV2Css'))return;
    const style=document.createElement('style');
    style.id='sfEmployeeMobilePwaPolishV2Css';
    style.textContent=`
      @media(max-width:820px){
        #sfEmployeePortal{
          --sf-mobile-safe-top:env(safe-area-inset-top,0px);
          --sf-mobile-safe-bottom:env(safe-area-inset-bottom,0px);
          --sf-employee-head:calc(68px + var(--sf-mobile-safe-top))!important;
          width:100%!important;max-width:100%!important;height:100dvh!important;min-height:100dvh!important;
          overflow:hidden!important;touch-action:manipulation;background:#07111d;
        }
        #sfEmployeePortal .sf-portal-top{
          box-sizing:border-box!important;padding-top:var(--sf-mobile-safe-top)!important;
          background:linear-gradient(110deg,rgba(13,29,45,.98),rgba(8,21,34,.98))!important;
          border-bottom-color:#213b50!important;box-shadow:0 9px 28px #02081166!important;
          -webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);
        }
        #sfEmployeePortal .sf-portal-logo{max-width:48vw!important}
        #sfEmployeePortal .sf-portal-main{
          box-sizing:border-box!important;max-width:100vw!important;
          padding-bottom:calc(28px + var(--sf-mobile-safe-bottom))!important;
          scroll-padding-top:12px;scroll-padding-bottom:22px;
          overscroll-behavior-y:contain!important;overscroll-behavior-x:none!important;
        }
        #sfEmployeePortal .sf-portal-main>*{max-width:100%;min-width:0}
        #sfEmployeePortal :where(.sf-portal-card,.sf-employee-dashboard,.sf-portal-stat,.sf-employee-tile,.sf-time-item,.sf-shift-item,.sf-market-row,.sf-swap-item,.sf-change-card,.sf-request-item,.sf-ae3-row,.sf-absence-item){min-width:0!important;max-width:100%!important}
        #sfEmployeePortal :where(.sf-portal-card,.sf-employee-dashboard,.sf-employee-tile,.sf-time-item,.sf-shift-item,.sf-market-row,.sf-swap-item,.sf-change-card,.sf-request-item,.sf-ae3-row,.sf-absence-item) :where(b,strong,small,p,span,em,label){overflow-wrap:anywhere}
        #sfEmployeePortal .sf-portal-card{overflow-x:hidden!important}
        #sfEmployeePortal .sf-mobile-wide-scroll{max-width:100%;overflow-x:auto!important;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch;padding-bottom:3px}
        #sfEmployeePortal .sf-mobile-wide-scroll>table{min-width:620px;max-width:none!important}
        #sfEmployeePortal .sf-emp-mobile-dock{
          box-sizing:border-box;height:calc(68px + var(--sf-mobile-safe-bottom))!important;
          padding-bottom:var(--sf-mobile-safe-bottom)!important;
          background:linear-gradient(180deg,rgba(8,20,33,.98),rgba(5,15,25,.99))!important;
          border-top-color:#28465d!important;box-shadow:0 -13px 34px #020811c7!important;
          transition:transform .18s ease,opacity .18s ease;
        }
        #sfEmployeePortal .sf-emp-dock-btn{position:relative;outline:none!important;transition:background .14s ease,color .14s ease,transform .1s ease}
        #sfEmployeePortal .sf-emp-dock-btn:active{transform:scale(.96)}
        #sfEmployeePortal .sf-emp-dock-btn:focus-visible{box-shadow:inset 0 0 0 2px #54e2c5!important}
        #sfEmployeePortal .sf-emp-dock-btn.active:not(.qr):after{content:'';position:absolute;left:28%;right:28%;bottom:2px;height:3px;border-radius:999px;background:#3bd8bb;box-shadow:0 0 10px #3bd8bb66}
        #sfEmployeePortal .sf-emp-dock-btn.qr{border-color:#36b49a!important;background:linear-gradient(180deg,#178875,#0f6253)!important;box-shadow:0 8px 22px #061d176b,inset 0 1px #74ead055!important}
        #sfEmployeePortal .sf-emp-more-backdrop{overscroll-behavior:none}
        #sfEmployeePortal .sf-emp-more-sheet{box-sizing:border-box;max-height:min(78dvh,640px)!important;padding-bottom:calc(82px + var(--sf-mobile-safe-bottom))!important;overscroll-behavior:contain!important}
        #sfEmployeePortal .sf-emp-more-item{transition:background .14s ease,border-color .14s ease,transform .1s ease}
        #sfEmployeePortal .sf-emp-more-item:active{transform:scale(.985);background:#11283a;border-color:#36705f}
        #sfEmployeePortal .sf-emp-more-item:focus-visible,#sfEmployeePortal .sf-emp-more-close:focus-visible{outline:2px solid #52dfc2!important;outline-offset:2px}
        #sfEmployeePortal.sf-mobile-sheet-open .sf-portal-main{overflow:hidden!important}
        #sfEmployeePortal.sf-mobile-keyboard-open .sf-emp-mobile-dock{transform:translateY(115%);opacity:0;pointer-events:none}
        #sfEmployeePortal.sf-mobile-keyboard-open .sf-portal-main{bottom:0!important;padding-bottom:22px!important}
        #sfEmployeePortal .sf-mobile-network{display:none;align-items:flex-start;gap:9px;margin:0 0 12px;padding:10px 11px;border:1px solid #775a2e;border-radius:11px;background:#2c2116;color:#ffd493;font-size:10px;line-height:1.45}
        #sfEmployeePortal .sf-mobile-network.visible{display:flex}
        #sfEmployeePortal .sf-mobile-network.offline{border-color:#713b46;background:#2c1820;color:#ffabb7}
        #sfEmployeePortal .sf-mobile-network i{width:8px;height:8px;border-radius:50%;margin-top:3px;flex:0 0 auto;background:#e9b95c;box-shadow:0 0 0 4px #e9b95c1c}
        #sfEmployeePortal .sf-mobile-network.offline i{background:#ef7283;box-shadow:0 0 0 4px #ef72831c}
        #sfEmployeePortal.sf-pwa-standalone .sf-portal-top{box-shadow:0 8px 26px #02081155!important}
        #sfEmployeePortal :where(button,[role="button"],a[href]){-webkit-tap-highlight-color:transparent}
      }
      @media(max-width:430px){
        #sfEmployeePortal .sf-portal-top{padding-left:10px!important;padding-right:10px!important}
        #sfEmployeePortal .sf-portal-logo{width:min(158px,43vw)!important}
        #sfEmployeePortal .sf-emp-more-grid{grid-template-columns:1fr!important}
        #sfEmployeePortal .sf-emp-more-item{min-height:58px!important}
      }
      @media(hover:none) and (pointer:coarse){
        #sfEmployeePortal .sf-employee-tile:hover{transform:none!important;box-shadow:none!important}
      }
      @media(prefers-reduced-motion:reduce){
        #sfEmployeePortal *,#sfEmployeePortal *:before,#sfEmployeePortal *:after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
      }
    `;
    document.head.appendChild(style);
  }

  function storeScroll(view,top){
    if(!view||!Number.isFinite(top))return;
    try{sessionStorage.setItem(SCROLL_PREFIX+view,String(Math.max(0,Math.round(top))))}catch{}
  }
  function readScroll(view){
    try{const value=Number(sessionStorage.getItem(SCROLL_PREFIX+view));return Number.isFinite(value)?Math.max(0,value):0}catch{return 0}
  }
  function restoreScroll(view){
    const area=main();if(!area||!MOBILE.matches)return;
    const y=readScroll(view);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{if(portal()?.dataset.sfPortalActive===view)area.scrollTop=y}));
  }

  function ensureNetwork(){
    const p=portal(),area=main();if(!p||!area||!MOBILE.matches)return null;
    let banner=area.querySelector('#sfEmployeeMobileNetwork');
    if(!banner){
      banner=document.createElement('div');banner.id='sfEmployeeMobileNetwork';banner.className='sf-mobile-network';banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');banner.innerHTML='<i aria-hidden="true"></i><span></span>';
      area.prepend(banner);
    }
    return banner;
  }
  function updateNetwork(){
    if(!isEmployee())return;
    const banner=ensureNetwork();if(!banner)return;
    const offline=navigator.onLine===false;
    const pending=!offline&&!B.ready&&!isDemo();
    banner.classList.toggle('visible',offline||pending);
    banner.classList.toggle('offline',offline);
    const copy=banner.querySelector('span');
    if(copy)copy.textContent=offline?'Offline – keine Netzwerkverbindung. Bereits angezeigte Inhalte können sichtbar bleiben; neue Änderungen erst nach Wiederverbindung durchführen.':'Cloud-Verbindung wird hergestellt …';
  }

  function wrapWideContent(){
    if(!MOBILE.matches)return;
    const p=portal();if(!p)return;
    p.querySelectorAll('.sf-portal-card table').forEach(table=>{
      const parent=table.parentElement;if(!parent||parent.classList.contains('sf-mobile-wide-scroll'))return;
      const wrap=document.createElement('div');wrap.className='sf-mobile-wide-scroll';
      parent.insertBefore(wrap,table);wrap.appendChild(table);
    });
  }

  function setBackgroundInert(open){
    const p=portal();if(!p)return;
    p.classList.toggle('sf-mobile-sheet-open',open);
    ['.sf-portal-main','.sf-portal-top','#sfEmployeeMobileDock'].forEach(sel=>{
      const node=p.querySelector(sel);if(node)node.inert=!!open;
    });
  }
  function syncSheet(){
    const p=portal(),sheet=p?.querySelector('#sfEmployeeMobileMore');if(!p||!sheet)return;
    const open=sheet.classList.contains('open');
    setBackgroundInert(open);
    if(!open&&sheetOpener?.isConnected){const target=sheetOpener;sheetOpener=null;requestAnimationFrame(()=>target.focus())}
  }
  function closeSheet(){
    const p=portal(),sheet=p?.querySelector('#sfEmployeeMobileMore');if(!sheet)return;
    sheet.classList.remove('open');sheet.setAttribute('aria-hidden','true');syncSheet();
  }
  function trapSheetFocus(event){
    const sheet=portal()?.querySelector('#sfEmployeeMobileMore.open');if(!sheet||!MOBILE.matches)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeSheet();return}
    if(event.key!=='Tab')return;
    const nodes=[...sheet.querySelectorAll('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter(n=>n.offsetParent!==null);
    if(!nodes.length)return;
    const first=nodes[0],last=nodes[nodes.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }

  function keyboardState(){
    clearTimeout(keyboardTimer);
    keyboardTimer=setTimeout(()=>{
      const p=portal();if(!p||!MOBILE.matches)return;
      const editable=document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]');
      const vv=window.visualViewport;
      const compressed=!!(vv&&window.innerHeight&&vv.height<window.innerHeight*.78);
      p.classList.toggle('sf-mobile-keyboard-open',!!editable&&compressed);
    },70);
  }

  function mount(){
    if(!isEmployee())return false;
    const p=portal();if(!p)return false;
    css();
    p.classList.toggle('sf-pwa-standalone',isStandalone());
    updateNetwork();wrapWideContent();syncSheet();
    if(!p.dataset.sfMobilePolishMounted){
      p.dataset.sfMobilePolishMounted='1';
      restoreScroll(activeView());
    }
    return true;
  }

  document.addEventListener('click',event=>{
    if(!isEmployee()||!MOBILE.matches)return;
    const p=portal();if(!p||!p.contains(event.target))return;
    const area=main();
    const nav=event.target.closest?.('[data-sf-employee-view]');
    if(nav&&area){storeScroll(activeView(),area.scrollTop);pendingView=nav.dataset.sfEmployeeView||'';setTimeout(()=>{if(pendingView){restoreScroll(pendingView);pendingView=''}},0)}
    const more=event.target.closest?.('[data-sf-mobile-more]');if(more)sheetOpener=more;
  },true);
  document.addEventListener('keydown',trapSheetFocus,true);
  document.addEventListener('focusin',keyboardState,true);
  document.addEventListener('focusout',keyboardState,true);
  window.visualViewport?.addEventListener('resize',keyboardState);
  window.addEventListener('online',()=>{updateNetwork();setTimeout(updateNetwork,900)});
  window.addEventListener('offline',updateNetwork);
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change',mount);
  MOBILE.addEventListener?.('change',mount);

  const observer=new MutationObserver(records=>{
    if(!isEmployee())return;
    let needsMount=false,sheetChanged=false,viewChanged=false;
    for(const record of records){
      if(record.type==='attributes'&&record.attributeName==='class'&&record.target.id==='sfEmployeeMobileMore')sheetChanged=true;
      if(record.type==='attributes'&&record.attributeName==='data-sf-portal-active')viewChanged=true;
      if(record.type==='childList')needsMount=true;
    }
    if(sheetChanged)syncSheet();
    if(viewChanged){restoreScroll(activeView());updateNetwork()}
    if(needsMount)requestAnimationFrame(mount);
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-sf-portal-active']});

  css();
  setTimeout(mount,0);setTimeout(mount,600);setTimeout(mount,1600);
  setInterval(()=>{if(isEmployee()){updateNetwork();wrapWideContent()}},4000);
})();
