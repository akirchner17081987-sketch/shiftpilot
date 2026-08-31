// ShiftPilot – kompakte Topbar-Aktionen und explizite Abmeldung
(function(){
  if(window.__topbarActionsV2)return;window.__topbarActionsV2=true;
  const B=window.SFBackend=window.SFBackend||{};
  let statusCheckedAt=Date.now();
  function css(){
    if(document.getElementById('spTopbarActionsV2Css'))return;
    const s=document.createElement('style');s.id='spTopbarActionsV2Css';s.textContent=`
      .topbar .top-actions{gap:8px;padding-left:10px;min-width:0}
      .topbar .top-actions>button,.topbar .top-actions>.sf-notify-wrap button{height:40px;box-sizing:border-box;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap}
      .topbar .top-actions>.iconbtn{width:40px;padding:0;font-size:15px}
      .topbar .top-actions>.sp-legacy-action{display:none!important}
      .topbar #sfCloudState{height:40px;padding:0 12px!important;border-radius:10px!important;letter-spacing:.01em}
      .topbar #sfCloudState.sp-cloud-passive{cursor:help;pointer-events:auto;position:relative;overflow:visible;box-shadow:inset 0 0 0 1px rgba(83,224,188,.04)}
      .topbar #sfCloudState.sp-cloud-passive:hover{background:#0d2b25!important;color:#74e8ca!important}
      .topbar #sfCloudState.sp-cloud-passive:after{content:attr(data-info);position:absolute;z-index:1000;right:0;top:calc(100% + 10px);width:260px;padding:12px 14px;border:1px solid #29475d;border-radius:10px;background:linear-gradient(180deg,#102237,#0b1827);color:#dceaf7;font-size:11px;font-weight:500;line-height:1.55;letter-spacing:0;text-align:left;white-space:pre-line;box-shadow:0 16px 42px rgba(0,0,0,.42);opacity:0;visibility:hidden;transform:translateY(-4px);transition:opacity .14s ease,transform .14s ease,visibility .14s;pointer-events:none}
      .topbar #sfCloudState.sp-cloud-passive:hover:after,.topbar #sfCloudState.sp-cloud-passive:focus-visible:after{opacity:1;visibility:visible;transform:translateY(0)}
      .topbar #sfCloudState.sp-cloud-passive:focus-visible{outline:2px solid rgba(83,224,188,.65);outline-offset:2px}
      .topbar #newTemplateBtn{height:40px;padding:0 15px;margin-left:3px;box-shadow:0 5px 16px rgba(39,215,184,.12)}
      .sp-topbar-logout{height:40px!important;padding:0 13px!important;gap:7px;border:1px solid #55313d!important;background:#1d1722!important;color:#ff9aaa!important;font-size:12px;font-weight:800}
      .sp-topbar-logout:hover{border-color:#874151!important;background:#301923!important;color:#ffc1c9!important}
      .sp-topbar-logout:disabled{opacity:.58;cursor:wait}
      .sp-topbar-logout i{font-style:normal;font-size:15px;line-height:1}
      @media(max-width:850px){
        .topbar .top-actions{gap:5px;padding-left:4px}
        .topbar #sfCloudState{width:40px;padding:0!important;font-size:0!important}
        .topbar #sfCloudState:before{content:'●';font-size:12px}
        .topbar #newTemplateBtn{width:40px;padding:0;font-size:0}
        .topbar #newTemplateBtn:after{content:'＋';font-size:17px}
        .sp-topbar-logout{width:40px;padding:0!important}.sp-topbar-logout span{display:none}
      }
    `;document.head.appendChild(s);
  }
  function ensure(){
    css();const host=document.querySelector('.topbar .top-actions');if(!host)return;
    const legacy=[...host.children].filter(x=>x.matches?.('.iconbtn'));
    if(legacy[0]){legacy[0].setAttribute('aria-label','Hilfe');legacy[0].title='Hilfe'}
    if(legacy[1]){legacy[1].classList.add('sp-legacy-action');legacy[1].setAttribute('aria-hidden','true');legacy[1].tabIndex=-1}
    const cloud=document.getElementById('sfCloudState');
    if(cloud&&B.ready){if(cloud.textContent!=='✓ Cloud verbunden')cloud.textContent='✓ Cloud verbunden';const mins=Math.max(0,Math.floor((Date.now()-statusCheckedAt)/60000)),checked=mins<1?'gerade eben':mins===1?'vor 1 Minute':`vor ${mins} Minuten`;cloud.dataset.info=`CLOUD VERBUNDEN\nAutomatische Synchronisierung aktiv\nAngemeldet als: ${B.user?.email||'Cloud-Konto'}\nStatus geprüft: ${checked}`;cloud.classList.add('sp-cloud-passive');cloud.setAttribute('role','status');cloud.setAttribute('aria-label','Cloud verbunden und synchronisiert. Weitere Informationen beim Darüberfahren.');cloud.title='';cloud.tabIndex=0;cloud.onclick=e=>{e.preventDefault();e.stopPropagation()}}
    else if(cloud){cloud.classList.remove('sp-cloud-passive');cloud.removeAttribute('role');cloud.title='Mit der ShiftPilot Cloud anmelden';cloud.tabIndex=0}
    let btn=document.getElementById('spTopbarLogout');
    if(!btn){btn=document.createElement('button');btn.id='spTopbarLogout';btn.type='button';btn.className='ghost sp-topbar-logout';btn.innerHTML='<i>↪</i><span>Abmelden</span>';btn.title='Sicher abmelden';btn.setAttribute('aria-label','Abmelden');host.appendChild(btn);btn.onclick=async()=>{if(btn.disabled||!B.ready||!B.client)return;if(!confirm(`ShiftPilot Cloud\n${B.user?.email||''}\n\nJetzt sicher abmelden?`))return;btn.disabled=true;btn.innerHTML='<i>◌</i><span>Wird abgemeldet …</span>';try{B.showLoading?.('Sichere Abmeldung läuft …');const {error}=await B.client.auth.signOut();if(error)throw error}catch(e){B.hideLoading?.();btn.disabled=false;btn.innerHTML='<i>↪</i><span>Abmelden</span>';alert('Abmelden fehlgeschlagen: '+(e?.message||String(e)))}}}
    btn.style.display=B.ready?'inline-flex':'none';
  }
  const update=B.updateState;
  if(typeof update==='function')B.updateState=function(){const r=update.apply(this,arguments);statusCheckedAt=Date.now();ensure();return r};
  const observer=new MutationObserver(()=>ensure());observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensure);else ensure();
  setTimeout(ensure,300);setTimeout(ensure,1400);setInterval(ensure,30000);
})();
