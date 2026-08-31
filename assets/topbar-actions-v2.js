// ShiftPilot – kompakte Topbar-Aktionen und explizite Abmeldung
(function(){
  if(window.__topbarActionsV2)return;window.__topbarActionsV2=true;
  const B=window.SFBackend=window.SFBackend||{};
  let statusCheckedAt=Date.now();
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
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
      .sp-logout-backdrop{position:fixed;inset:0;z-index:24000;display:grid;place-items:center;padding:18px;background:rgba(2,8,14,.78);backdrop-filter:blur(8px)}
      .sp-logout-dialog{width:min(440px,calc(100vw - 28px));overflow:hidden;border:1px solid #29465d;border-radius:16px;background:linear-gradient(180deg,#102033,#0a1624);box-shadow:0 28px 90px rgba(0,0,0,.62);color:#e9f3fb}
      .sp-logout-head{display:grid;grid-template-columns:46px 1fr auto;gap:13px;align-items:start;padding:20px 21px 16px;border-bottom:1px solid #21384d}
      .sp-logout-icon{width:44px;height:44px;display:grid;place-items:center;border:1px solid #6b3442;border-radius:12px;background:#2a1821;color:#ff9cab;font-size:21px}
      .sp-logout-copy small{display:block;color:#5de0c3;font-size:10px;font-weight:900;letter-spacing:.1em}.sp-logout-copy h2{margin:5px 0 4px;font-size:20px}.sp-logout-copy p{margin:0;color:#91a8bd;font-size:12px;line-height:1.45}
      .sp-logout-close{width:34px;height:34px;padding:0;border:1px solid #294159;border-radius:8px;background:#0c1928;color:#8fa6bc;font-size:17px}.sp-logout-close:hover{background:#16283a;color:#fff}
      .sp-logout-body{padding:17px 21px}.sp-logout-account{display:flex;align-items:center;gap:10px;padding:11px 12px;border:1px solid #284057;border-radius:10px;background:#0a1725}.sp-logout-account i{width:30px;height:30px;display:grid;place-items:center;border-radius:50%;background:#17344a;color:#62dfc5;font-style:normal}.sp-logout-account small{display:block;color:#7f97ad;font-size:10px}.sp-logout-account b{display:block;margin-top:2px;font-size:12px;word-break:break-all}
      .sp-logout-note{margin-top:12px;padding:10px 12px;border:1px solid #235548;border-radius:9px;background:#0e2924;color:#9fe8d4;font-size:11px;line-height:1.45}
      .sp-logout-actions{display:flex;justify-content:flex-end;gap:9px;padding:15px 21px 19px;border-top:1px solid #21384d}.sp-logout-actions button{min-height:40px;border-radius:9px;padding:0 14px;font-weight:800}.sp-logout-cancel{border:1px solid #30485f;background:#101e2e;color:#c5d4e2}.sp-logout-cancel:hover{background:#192b3d}.sp-logout-confirm{border:1px solid #8a3d4f;background:#7a2d40;color:#fff}.sp-logout-confirm:hover{background:#96394d}
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
  function confirmLogout(){
    document.getElementById('spLogoutBackdrop')?.remove();
    return new Promise(resolve=>{const back=document.createElement('div');back.id='spLogoutBackdrop';back.className='sp-logout-backdrop';back.innerHTML=`<section class="sp-logout-dialog" role="dialog" aria-modal="true" aria-labelledby="spLogoutTitle"><header class="sp-logout-head"><div class="sp-logout-icon">↪</div><div class="sp-logout-copy"><small>SICHER ABMELDEN</small><h2 id="spLogoutTitle">ShiftPilot verlassen?</h2><p>Deine aktuelle Cloud-Sitzung wird auf diesem Gerät beendet.</p></div><button class="sp-logout-close" type="button" aria-label="Dialog schließen">✕</button></header><div class="sp-logout-body"><div class="sp-logout-account"><i>●</i><span><small>Angemeldetes Cloud-Konto</small><b>${esc(B.user?.email||'ShiftPilot Cloud')}</b></span></div><div class="sp-logout-note">✓ Bereits synchronisierte Daten bleiben sicher in der ShiftPilot Cloud gespeichert.</div></div><footer class="sp-logout-actions"><button class="sp-logout-cancel" type="button">Abbrechen</button><button class="sp-logout-confirm" type="button">↪ Jetzt abmelden</button></footer></section>`;document.body.appendChild(back);const done=value=>{document.removeEventListener('keydown',key);back.remove();resolve(value)},key=e=>{if(e.key==='Escape')done(false)};document.addEventListener('keydown',key);back.onclick=e=>{if(e.target===back)done(false)};back.querySelector('.sp-logout-close').onclick=()=>done(false);back.querySelector('.sp-logout-cancel').onclick=()=>done(false);back.querySelector('.sp-logout-confirm').onclick=()=>done(true);setTimeout(()=>back.querySelector('.sp-logout-cancel')?.focus(),0)})
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
    if(!btn){btn=document.createElement('button');btn.id='spTopbarLogout';btn.type='button';btn.className='ghost sp-topbar-logout';btn.innerHTML='<i>↪</i><span>Abmelden</span>';btn.title='Sicher abmelden';btn.setAttribute('aria-label','Abmelden');host.appendChild(btn);btn.onclick=async()=>{if(btn.disabled||!B.ready||!B.client)return;if(!await confirmLogout())return;btn.disabled=true;btn.innerHTML='<i>◌</i><span>Wird abgemeldet …</span>';try{B.showLoading?.('Sichere Abmeldung läuft …');const {error}=await B.client.auth.signOut();if(error)throw error}catch(e){B.hideLoading?.();btn.disabled=false;btn.innerHTML='<i>↪</i><span>Abmelden</span>';alert('Abmelden fehlgeschlagen: '+(e?.message||String(e)))}}}
    btn.style.display=B.ready?'inline-flex':'none';
  }
  const update=B.updateState;
  if(typeof update==='function')B.updateState=function(){const r=update.apply(this,arguments);statusCheckedAt=Date.now();ensure();return r};
  const observer=new MutationObserver(()=>ensure());observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensure);else ensure();
  setTimeout(ensure,300);setTimeout(ensure,1400);setInterval(ensure,30000);
  B.confirmLogout=confirmLogout;
})();
