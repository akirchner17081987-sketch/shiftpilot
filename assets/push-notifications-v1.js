// SchichtFunk – echte Browser/PWA Push-Benachrichtigungen V2
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__pushNotificationsV2)return;B.__pushNotificationsV2=true;

  let busy=false,lastSync='',rendering=false,renderQueued=false;
  const demo=()=>sessionStorage.getItem('sf_demo_session_v1')==='active';
  const supported=()=>window.isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const setHtml=(node,html)=>{if(node&&node.innerHTML!==html)node.innerHTML=html};
  const keyBytes=s=>{const pad='='.repeat((4-s.length%4)%4),raw=atob((s+pad).replace(/-/g,'+').replace(/_/g,'/')),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out};

  function css(){if(document.getElementById('sfPushNotificationsCss'))return;const s=document.createElement('style');s.id='sfPushNotificationsCss';s.textContent=`
    .sf-push-card{margin:0 0 14px;padding:14px;border:1px solid #285067;border-radius:14px;background:linear-gradient(145deg,#0e2534,#0a1a28);color:#deedf7;display:flex;align-items:center;gap:12px}.sf-push-icon{width:42px;height:42px;border-radius:12px;background:#123a34;color:#74ead2;display:grid;place-items:center;font-size:19px;flex:0 0 auto}.sf-push-copy{min-width:0;flex:1}.sf-push-copy b{display:block;font-size:12px}.sf-push-copy small{display:block;margin-top:4px;color:#8fa7ba;font-size:9.5px;line-height:1.45}.sf-push-actions{display:flex;align-items:center;gap:7px;flex:0 0 auto}.sf-push-action{min-height:44px;border:1px solid #37a98f;border-radius:10px;background:#135f51;color:#effffb;padding:8px 12px;font-weight:900;font-size:10px;white-space:nowrap}.sf-push-action.test{background:#0d3140;border-color:#2a7588;color:#bdeef2}.sf-push-action.off{border-color:#385166;background:#0b1926;color:#a9bdcd}.sf-push-panel{padding:10px 14px;border-bottom:1px solid #20364a;background:#0b1a27;display:flex;align-items:center;gap:10px}.sf-push-panel .sf-push-icon{width:34px;height:34px;border-radius:9px;font-size:15px}.sf-push-panel .sf-push-copy b{font-size:10.5px}.sf-push-panel .sf-push-copy small{font-size:9px}.sf-push-panel .sf-push-action{min-height:38px;padding:6px 9px;font-size:9px}.sf-push-toast{position:fixed;z-index:35000;left:50%;bottom:88px;transform:translateX(-50%);max-width:min(420px,calc(100vw - 28px));padding:10px 13px;border:1px solid #2d7768;border-radius:11px;background:#0d2b26;color:#dffaf4;box-shadow:0 18px 50px #0008;font-size:10.5px;font-weight:750;text-align:center;pointer-events:none}
    @media(max-width:620px){.sf-push-card{align-items:flex-start;flex-wrap:wrap}.sf-push-card .sf-push-copy{flex:1 1 calc(100% - 56px)}.sf-push-card .sf-push-actions,.sf-push-card>.sf-push-action{width:100%}.sf-push-card .sf-push-actions .sf-push-action{flex:1}.sf-push-panel{flex-wrap:wrap}.sf-push-panel .sf-push-copy{flex:1}.sf-push-panel .sf-push-actions,.sf-push-panel>.sf-push-action{width:100%}.sf-push-panel .sf-push-actions .sf-push-action{flex:1}}
  `;document.head.appendChild(s)}

  function toast(text){document.querySelector('.sf-push-toast')?.remove();const t=document.createElement('div');t.className='sf-push-toast';t.textContent=text;document.body.appendChild(t);setTimeout(()=>t.remove(),4200)}
  function timeout(ms,label='TIMEOUT'){return new Promise((_,reject)=>setTimeout(()=>reject(new Error(label)),ms))}
  async function currentRegistration(){if(!('serviceWorker' in navigator))return null;try{return await navigator.serviceWorker.getRegistration()}catch{return null}}
  async function subscription(){if(!supported())return null;const reg=await currentRegistration();if(!reg)return null;try{return await reg.pushManager.getSubscription()}catch{return null}}
  async function ensureRegistration(){
    if(!supported())throw new Error('PUSH_NOT_SUPPORTED');
    let reg=await currentRegistration();
    if(!reg)reg=await navigator.serviceWorker.register('/schichtfunk-sw.js',{scope:'/',updateViaCache:'none'});
    try{await Promise.race([reg.update(),timeout(5000,'SERVICE_WORKER_UPDATE_TIMEOUT')])}catch(e){console.debug('[SchichtFunk Push] Service-Worker-Update',e?.message||e)}
    const candidate=reg.installing||reg.waiting;
    if(candidate&&candidate.state!=='activated'){
      try{await Promise.race([new Promise(resolve=>{const done=()=>{if(candidate.state==='activated'||candidate.state==='redundant'){candidate.removeEventListener('statechange',done);resolve()}};candidate.addEventListener('statechange',done);done()}),timeout(8000,'SERVICE_WORKER_ACTIVATION_TIMEOUT')])}catch(e){console.debug('[SchichtFunk Push] Service-Worker-Aktivierung',e?.message||e)}
    }
    if(reg.active)return reg;
    return await Promise.race([navigator.serviceWorker.ready,timeout(8000,'SERVICE_WORKER_READY_TIMEOUT')]);
  }

  function state(sub){
    if(demo())return['demo','Push in der Demo deaktiviert','Produktive Geräte werden in der Demo nicht registriert.'];
    if(!supported())return['unsupported','Push nicht verfügbar','Installiere die PWA bzw. nutze einen Browser mit Web-Push-Unterstützung.'];
    if(Notification.permission==='denied')return['denied','Push im Browser blockiert','Bitte Benachrichtigungen in den Website-/App-Einstellungen wieder erlauben.'];
    if(sub&&Notification.permission==='granted')return['active','Push ist aktiv','Schichtangebote, Änderungen und wichtige Meldungen können auch außerhalb von SchichtFunk erscheinen.'];
    return['ready','Push-Mitteilungen aktivieren','Erhalte wichtige SchichtFunk-Meldungen direkt auf diesem Gerät.'];
  }

  function paint(sub){
    css();
    const [mode,title,text]=state(sub);
    const action=mode==='active'?'<span class="sf-push-actions"><button type="button" class="sf-push-action test" data-sf-push-test>Test senden</button><button type="button" class="sf-push-action off" data-sf-push-disable>Deaktivieren</button></span>':mode==='ready'?'<button type="button" class="sf-push-action" data-sf-push-enable>Push aktivieren</button>':'';
    const html=`<span class="sf-push-icon">🔔</span><span class="sf-push-copy"><b>${esc(title)}</b><small>${esc(text)}</small></span>${action}`;
    const portal=document.getElementById('sfEmployeePortal'),dash=portal?.querySelector('.sf-employee-dashboard');
    if(dash){let card=dash.querySelector('#sfEmployeePushCard');if(!card){card=document.createElement('section');card.id='sfEmployeePushCard';card.className='sf-push-card';const install=dash.querySelector('#sfEmployeePwaInstall');if(install)install.after(card);else dash.prepend(card)}setHtml(card,html)}
    const panel=document.getElementById('sfNotifyPanel');if(panel){let row=panel.querySelector('#sfPushPanelRow');if(!row){row=document.createElement('div');row.id='sfPushPanelRow';row.className='sf-push-panel';panel.querySelector('.sf-notify-head')?.after(row)}setHtml(row,html)}
  }

  async function render(){
    if(rendering)return;
    rendering=true;
    try{
      // getRegistration/getSubscription blockiert nicht auf serviceWorker.ready.
      // Daher nur EINEN stabilen Zustand zeichnen und kein Ready/Active-Pingpong erzeugen.
      const sub=await subscription();
      paint(sub);
    }catch(e){
      console.debug('[SchichtFunk Push] Render',e?.message||e);
      paint(null);
    }finally{rendering=false}
  }

  function scheduleRender(){
    if(renderQueued)return;
    renderQueued=true;
    requestAnimationFrame(()=>{renderQueued=false;render()});
  }

  async function registerServer(sub){if(!B.client||!B.user?.id||!B.companyId)return false;const j=sub.toJSON(),keys=j.keys||{};if(!j.endpoint||!keys.p256dh||!keys.auth)return false;const {error}=await B.client.rpc('register_push_subscription',{p_company_id:B.companyId,p_endpoint:j.endpoint,p_p256dh:keys.p256dh,p_auth:keys.auth,p_user_agent:navigator.userAgent||null});if(error)throw error;lastSync=`${B.user.id}|${j.endpoint}`;return true}

  async function enable(){if(busy||demo()||!supported())return;busy=true;try{
    let permission=Notification.permission;if(permission!=='granted')permission=await Notification.requestPermission();if(permission!=='granted'){scheduleRender();return}
    if(!B.client||!B.user?.id||!B.companyId)throw new Error('PUSH_SESSION_NOT_READY');
    const {data:key,error:keyError}=await B.client.rpc('get_push_public_key');if(keyError||!key)throw keyError||new Error('Push-Schlüssel nicht verfügbar');
    const reg=await ensureRegistration();let sub=await reg.pushManager.getSubscription();if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(key)});await registerServer(sub);toast('Push-Mitteilungen sind auf diesem Gerät aktiviert.');scheduleRender();
  }catch(e){console.warn('[SchichtFunk Push] Aktivierung fehlgeschlagen',e);alert('Push-Mitteilungen konnten auf diesem Gerät nicht aktiviert werden. Bitte Browser-/App-Berechtigungen prüfen.')}finally{busy=false}}

  async function disable(){if(busy||!supported())return;busy=true;try{const sub=await subscription();if(sub){const endpoint=sub.endpoint;if(B.client&&B.user?.id)await B.client.rpc('unregister_push_subscription',{p_endpoint:endpoint});await sub.unsubscribe()}lastSync='';toast('Push-Mitteilungen wurden auf diesem Gerät deaktiviert.');scheduleRender()}catch(e){console.warn('[SchichtFunk Push] Deaktivierung fehlgeschlagen',e)}finally{busy=false}}

  async function sendTest(){if(busy||demo()||!B.client||!B.companyId)return;busy=true;try{await sync();const {error}=await B.client.rpc('send_push_test',{p_company_id:B.companyId});if(error)throw error;toast('Test-Push wurde gesendet. Er sollte gleich als Geräte-Mitteilung erscheinen.')}catch(e){console.warn('[SchichtFunk Push] Test fehlgeschlagen',e);const msg=String(e?.message||'');alert(msg.includes('PUSH_TEST_RATE_LIMIT')?'Bitte etwa 30 Sekunden bis zum nächsten Test warten.':'Test-Push konnte nicht gesendet werden.')}finally{busy=false}}

  async function sync(){if(demo()||!supported()||Notification.permission!=='granted'||!B.client||!B.user?.id||!B.companyId)return;const sub=await subscription();if(!sub)return;const sig=`${B.user.id}|${sub.endpoint}`;if(sig===lastSync)return;try{await registerServer(sub)}catch(e){console.debug('[SchichtFunk Push] Sync',e?.message||e)}}

  function routePending(){let target=sessionStorage.getItem('sf_pending_push_view')||'';try{const u=new URL(location.href),q=u.searchParams.get('sf_push_view');if(q){target=q;sessionStorage.setItem('sf_pending_push_view',q);u.searchParams.delete('sf_push_view');history.replaceState(null,'',u.pathname+(u.search?u.search:'')+u.hash)}}catch{}if(!target||!B.role)return false;
    if(B.role==='EMPLOYEE'){
      const map={'employee-shifts':'shifts','employee-changes':'changes','employee-absences':'absences','employee-times':'time','employee-swaps':'swaps','employee-disruptions':'disruptions','employee-marketplace':'marketplace'};const view=map[target]||target.replace(/^employee-/,'');
      try{B.openEmployeePortal?.();setTimeout(()=>B.employeePortalNavigate?.(view),120);sessionStorage.removeItem('sf_pending_push_view');return true}catch{return false}
    }
    if(target==='disruptions'){window.SFDisruptionAutopilot?.open?.();sessionStorage.removeItem('sf_pending_push_view');return true}
    if(['absence','schedule','time','employees','overview','auto','reports','settings'].includes(target)){window.showView?.(target);sessionStorage.removeItem('sf_pending_push_view');return true}
    return false;
  }

  document.addEventListener('click',e=>{
    if(e.target.closest?.('[data-sf-push-enable]')){e.preventDefault();enable()}
    else if(e.target.closest?.('[data-sf-push-disable]')){e.preventDefault();disable()}
    else if(e.target.closest?.('[data-sf-push-test]')){e.preventDefault();sendTest()}
  },true);

  // Nur auf das erstmalige Erscheinen der relevanten Portalcontainer reagieren.
  // Änderungen innerhalb der Push-Karte selbst dürfen KEIN erneutes Rendern auslösen.
  const observer=new MutationObserver(records=>{
    let relevant=false;
    for(const record of records){
      for(const node of record.addedNodes){
        if(node.nodeType!==1)continue;
        if(node.id==='sfEmployeePortal'||node.id==='sfNotifyPanel'||node.matches?.('.sf-employee-dashboard')||node.querySelector?.('#sfEmployeePortal,#sfNotifyPanel,.sf-employee-dashboard')){relevant=true;break}
      }
      if(relevant)break;
    }
    if(relevant)scheduleRender();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});

  window.addEventListener('focus',()=>{sync();scheduleRender();routePending()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){sync();scheduleRender();routePending()}});
  B.pushNotifications={enable,disable,sendTest,sync,status:async()=>state(await subscription())};
  [120,500,1500,3500].forEach(ms=>setTimeout(()=>{scheduleRender();sync();routePending()},ms));
  setInterval(()=>routePending(),1500);setInterval(()=>sync(),60000);
})();
