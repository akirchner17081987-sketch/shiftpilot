// SchichtFunk – robuste Browser/PWA Push-Benachrichtigungen V3
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__pushNotificationsV3)return;B.__pushNotificationsV3=true;

  let busy=false,lastSync='',rendering=false,renderAgain=false,renderTimer=0,notice=null;
  const demo=()=>sessionStorage.getItem('sf_demo_session_v1')==='active';
  const isIos=()=>/iphone|ipad|ipod/i.test(navigator.userAgent||'');
  const standalone=()=>window.matchMedia?.('(display-mode: standalone)').matches===true||window.navigator.standalone===true;
  const supported=()=>window.isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const setHtml=(node,html)=>{if(node&&node.innerHTML!==html)node.innerHTML=html};
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const timeout=(ms,label='TIMEOUT')=>new Promise((_,reject)=>setTimeout(()=>reject(new Error(label)),ms));
  const keyBytes=value=>{
    const key=String(value||'').trim();
    if(!/^[A-Za-z0-9_-]{80,120}$/.test(key))throw new Error('PUSH_PUBLIC_KEY_INVALID');
    let raw;
    try{const pad='='.repeat((4-key.length%4)%4);raw=atob((key+pad).replace(/-/g,'+').replace(/_/g,'/'))}catch{throw new Error('PUSH_PUBLIC_KEY_INVALID')}
    const out=Uint8Array.from(raw,c=>c.charCodeAt(0));
    if(out.length!==65||out[0]!==4)throw new Error('PUSH_PUBLIC_KEY_INVALID');
    return out;
  };

  function compatibility(){
    if(!window.isSecureContext)return['insecure','Push benötigt eine sichere HTTPS-Verbindung.'];
    if(isIos()&&!standalone())return['ios-install','Auf iPhone/iPad funktioniert Push nur in der zum Home-Bildschirm hinzugefügten SchichtFunk-App (iOS/iPadOS 16.4 oder neuer).'];
    if(!('serviceWorker' in navigator))return['no-worker','Dieser Browser unterstützt keine Service Worker. Bitte einen aktuellen Browser verwenden.'];
    if(!('PushManager' in window)||!('Notification' in window))return['unsupported','Web-Push wird auf diesem Gerät oder in diesem Browser nicht unterstützt.'];
    return['ok',''];
  }

  function errorMessage(error,action='aktiviert'){
    const code=String(error?.message||error?.code||error?.name||error||'');
    const name=String(error?.name||'');
    if(code.includes('PUSH_PERMISSION_DISMISSED'))return'Es wurde keine Auswahl getroffen. Bitte erneut tippen und „Erlauben“ wählen.';
    if(code.includes('PUSH_PERMISSION_DENIED')||name==='NotAllowedError')return'Benachrichtigungen sind blockiert. Bitte in den Website-/App-Einstellungen für SchichtFunk erlauben.';
    if(code.includes('PUSH_SESSION_NOT_READY')||code.includes('AUTH_REQUIRED')||code.includes('JWT'))return'Die Anmeldung ist noch nicht vollständig bereit oder abgelaufen. Bitte SchichtFunk kurz neu öffnen und erneut versuchen.';
    if(code.includes('ACTIVE_MEMBERSHIP_REQUIRED'))return'Dieses Konto ist keinem aktiven Unternehmen zugeordnet. Bitte die Einsatzleitung kontaktieren.';
    if(code.includes('PUSH_NOT_CONFIGURED')||code.includes('Push-Schlüssel nicht verfügbar')||code.includes('PUSH_PUBLIC_KEY_INVALID'))return'Der Push-Dienst ist serverseitig noch nicht vollständig eingerichtet. Bitte den Support kontaktieren.';
    if(code.includes('SERVICE_WORKER'))return'Die SchichtFunk-App konnte im Hintergrund nicht gestartet werden. Bitte App vollständig schließen, neu öffnen und erneut versuchen.';
    if(code.includes('PUSH_SERVER_VERIFY_FAILED'))return'Das Geräteabo wurde im Browser erstellt, konnte aber nicht in SchichtFunk gespeichert werden.';
    if(code.includes('INVALID_ENDPOINT')||code.includes('INVALID_P256DH')||code.includes('INVALID_AUTH_KEY')||code.includes('PUSH_SUBSCRIPTION_INVALID'))return'Das Geräteabo war ungültig. Bitte die App neu installieren und erneut versuchen.';
    if(code.includes('Failed to register')||name==='SecurityError')return'Die Hintergrundfunktion wurde vom Browser blockiert. Bitte Website-Daten/Berechtigungen für SchichtFunk prüfen.';
    if(name==='AbortError'||name==='NetworkError'||code.toLowerCase().includes('network')||code.toLowerCase().includes('fetch'))return'Der Push-Dienst ist gerade nicht erreichbar. Bitte Internetverbindung prüfen und erneut versuchen.';
    return`Push-Mitteilungen konnten nicht ${action} werden. Bitte erneut versuchen oder die App neu öffnen.`;
  }

  function css(){if(document.getElementById('sfPushNotificationsCss'))return;const s=document.createElement('style');s.id='sfPushNotificationsCss';s.textContent=`
    .sf-push-card{margin:0 0 14px;padding:14px;border:1px solid #285067;border-radius:14px;background:linear-gradient(145deg,#0e2534,#0a1a28);color:#deedf7;display:flex;align-items:center;gap:12px}.sf-push-card[data-mode="error"]{border-color:#a95050}.sf-push-card[data-mode="working"]{border-color:#7b6e38}.sf-push-icon{width:42px;height:42px;border-radius:12px;background:#123a34;color:#74ead2;display:grid;place-items:center;font-size:19px;flex:0 0 auto}.sf-push-copy{min-width:0;flex:1}.sf-push-copy b{display:block;font-size:12px}.sf-push-copy small{display:block;margin-top:4px;color:#a9bdcd;font-size:10px;line-height:1.45}.sf-push-actions{display:flex;align-items:center;gap:7px;flex:0 0 auto}.sf-push-action{min-height:44px;border:1px solid #37a98f;border-radius:10px;background:#135f51;color:#effffb;padding:8px 12px;font-weight:900;font-size:10px;white-space:nowrap;touch-action:manipulation}.sf-push-action[disabled]{opacity:.65;cursor:wait}.sf-push-action.test{background:#0d3140;border-color:#2a7588;color:#bdeef2}.sf-push-action.off{border-color:#385166;background:#0b1926;color:#a9bdcd}.sf-push-panel{padding:10px 14px;border-bottom:1px solid #20364a;background:#0b1a27;display:flex;align-items:center;gap:10px}.sf-push-panel[data-mode="error"]{border-bottom-color:#7d3d45}.sf-push-panel .sf-push-icon{width:34px;height:34px;border-radius:9px;font-size:15px}.sf-push-panel .sf-push-copy b{font-size:10.5px}.sf-push-panel .sf-push-copy small{font-size:9px}.sf-push-panel .sf-push-action{min-height:38px;padding:6px 9px;font-size:9px}.sf-push-toast{position:fixed;z-index:35000;left:50%;bottom:88px;transform:translateX(-50%);max-width:min(420px,calc(100vw - 28px));padding:10px 13px;border:1px solid #2d7768;border-radius:11px;background:#0d2b26;color:#dffaf4;box-shadow:0 18px 50px #0008;font-size:10.5px;font-weight:750;text-align:center;pointer-events:none}
    @media(max-width:620px){.sf-push-card{align-items:flex-start;flex-wrap:wrap}.sf-push-card .sf-push-copy{flex:1 1 calc(100% - 56px)}.sf-push-card .sf-push-actions,.sf-push-card>.sf-push-action{width:100%}.sf-push-card .sf-push-actions .sf-push-action{flex:1}.sf-push-panel{flex-wrap:wrap}.sf-push-panel .sf-push-copy{flex:1}.sf-push-panel .sf-push-actions,.sf-push-panel>.sf-push-action{width:100%}.sf-push-panel .sf-push-actions .sf-push-action{flex:1}}
  `;document.head.appendChild(s)}

  function toast(text){document.querySelector('.sf-push-toast')?.remove();const t=document.createElement('div');t.className='sf-push-toast';t.setAttribute('role','status');t.setAttribute('aria-live','polite');t.textContent=text;document.body.appendChild(t);setTimeout(()=>t.remove(),5000)}
  async function currentRegistration(){if(!('serviceWorker' in navigator))return null;try{return await navigator.serviceWorker.getRegistration('/')}catch{return null}}
  async function subscription(){if(!supported())return null;const reg=await currentRegistration();if(!reg)return null;try{return await reg.pushManager.getSubscription()}catch{return null}}
  async function waitForBackend(){
    for(let i=0;i<70;i++){
      if(B.client&&B.user?.id&&B.companyId)return true;
      if(B.client&&!B.user?.id&&typeof B.recoverSession==='function'){
        try{const session=await B.recoverSession();if(session&&typeof B.boot==='function')await B.boot(session)}catch(error){console.debug('[SchichtFunk Push] Session-Recovery',error?.message||error)}
      }
      await delay(100);
    }
    throw new Error('PUSH_SESSION_NOT_READY');
  }
  async function ensureRegistration(){
    if(!supported())throw new Error('PUSH_NOT_SUPPORTED');
    let reg;
    try{reg=await Promise.race([navigator.serviceWorker.register('/schichtfunk-sw.js',{scope:'/',updateViaCache:'none'}),timeout(10000,'SERVICE_WORKER_REGISTER_TIMEOUT')])}catch(error){if(String(error?.message||'').includes('SERVICE_WORKER'))throw error;const wrapped=new Error(`SERVICE_WORKER_REGISTER_FAILED: ${error?.message||error}`);wrapped.cause=error;throw wrapped}
    try{await Promise.race([reg.update(),timeout(5000,'SERVICE_WORKER_UPDATE_TIMEOUT')])}catch(error){console.debug('[SchichtFunk Push] Service-Worker-Update',error?.message||error)}
    if(reg.active)return reg;
    const ready=await Promise.race([navigator.serviceWorker.ready,timeout(12000,'SERVICE_WORKER_READY_TIMEOUT')]);
    if(!ready?.active)throw new Error('SERVICE_WORKER_NOT_ACTIVE');
    return ready;
  }
  function baseState(sub){
    if(demo())return['demo','Push in der Demo deaktiviert','Produktive Geräte werden in der Demo nicht registriert.'];
    const [mode,reason]=compatibility();
    if(mode==='ios-install')return[mode,'SchichtFunk zuerst installieren',reason];
    if(mode!=='ok')return[mode,'Push nicht verfügbar',reason];
    if(Notification.permission==='denied')return['denied','Push im Browser blockiert','Bitte Benachrichtigungen in den Website-/App-Einstellungen wieder erlauben.'];
    if(sub&&Notification.permission==='granted')return['active','Push ist aktiv','Schichtangebote, Änderungen und wichtige Meldungen können auch außerhalb von SchichtFunk erscheinen.'];
    if(Notification.permission==='granted')return['ready','Berechtigung erteilt – Gerät registrieren','iOS erlaubt Mitteilungen bereits. Dieses Gerät muss noch bei SchichtFunk registriert werden.'];
    return['ready','Push-Mitteilungen aktivieren','Erhalte wichtige SchichtFunk-Meldungen direkt auf diesem Gerät.'];
  }

  function paint(sub,override=notice){
    css();const [mode,title,text]=override||baseState(sub);
    const action=mode==='active'?'<span class="sf-push-actions"><button type="button" class="sf-push-action test" data-sf-push-test>Test senden</button><button type="button" class="sf-push-action off" data-sf-push-disable>Deaktivieren</button></span>':mode==='ready'||mode==='error'?'<button type="button" class="sf-push-action" data-sf-push-enable>'+(mode==='error'?'Erneut versuchen':Notification.permission==='granted'?'Gerät registrieren':'Push aktivieren')+'</button>':mode==='working'?'<button type="button" class="sf-push-action" disabled aria-busy="true">Wird aktiviert …</button>':'';
    const html=`<span class="sf-push-icon" aria-hidden="true">🔔</span><span class="sf-push-copy"><b>${esc(title)}</b><small>${esc(text)}</small></span>${action}`;
    const portal=document.getElementById('sfEmployeePortal'),dash=portal?.querySelector('.sf-employee-dashboard');
    if(dash){let card=dash.querySelector('#sfEmployeePushCard');if(!card){card=document.createElement('section');card.id='sfEmployeePushCard';card.className='sf-push-card';card.setAttribute('aria-live','polite');const install=dash.querySelector('#sfEmployeePwaInstall');if(install)install.after(card);else dash.prepend(card)}card.dataset.mode=mode;setHtml(card,html)}
    const panel=document.getElementById('sfNotifyPanel');if(panel){let row=panel.querySelector('#sfPushPanelRow');if(!row){row=document.createElement('div');row.id='sfPushPanelRow';row.className='sf-push-panel';row.setAttribute('aria-live','polite');panel.querySelector('.sf-notify-head')?.after(row)}row.dataset.mode=mode;setHtml(row,html)}
  }

  async function render(){if(rendering){renderAgain=true;return}rendering=true;try{if(!document.getElementById('sfEmployeePushCard')&&!document.getElementById('sfPushPanelRow'))paint(null);const sub=await subscription();paint(sub)}finally{rendering=false;if(renderAgain){renderAgain=false;scheduleRender(0)}}}
  function scheduleRender(ms=30){clearTimeout(renderTimer);renderTimer=setTimeout(render,ms)}

  async function registerServer(sub){
    await waitForBackend();const json=sub?.toJSON?.(),keys=json?.keys||{};
    if(!json?.endpoint||!keys.p256dh||!keys.auth)throw new Error('PUSH_SUBSCRIPTION_INVALID');
    const {error}=await B.client.rpc('register_push_subscription',{p_company_id:B.companyId,p_endpoint:json.endpoint,p_p256dh:keys.p256dh,p_auth:keys.auth,p_user_agent:navigator.userAgent||null});
    if(error)throw error;
    const {data:verify,error:verifyError}=await B.client.from('push_subscriptions').select('id,enabled').eq('endpoint',json.endpoint).eq('user_id',B.user.id).maybeSingle();
    if(verifyError)throw verifyError;
    if(!verify?.id||verify.enabled!==true)throw new Error('PUSH_SERVER_VERIFY_FAILED');
    lastSync=`${B.user.id}|${json.endpoint}`;return true;
  }

  async function diagnostics(){
    const reg=await currentRegistration();
    const sub=reg?await reg.pushManager.getSubscription().catch(()=>null):null;
    return {
      secureContext:window.isSecureContext,
      ios:isIos(),
      standalone:standalone(),
      serviceWorkerSupported:'serviceWorker' in navigator,
      serviceWorkerRegistered:!!reg,
      serviceWorkerActive:!!reg?.active,
      pushManager:'PushManager' in window,
      notificationApi:'Notification' in window,
      permission:'Notification' in window?Notification.permission:'unavailable',
      browserSubscription:!!sub,
      backendClient:!!B.client,
      backendUser:!!B.user?.id,
      backendCompany:!!B.companyId
    };
  }

  async function enable(){
    if(busy)return;
    const [mode,reason]=compatibility();
    if(demo()){notice=['error','Push ist in der Demo deaktiviert','Bitte mit einem normalen Mitarbeiterkonto anmelden.'];paint(null);return}
    if(mode!=='ok'){notice=['error',mode==='ios-install'?'SchichtFunk zuerst installieren':'Push nicht verfügbar',reason];paint(null);return}
    busy=true;notice=['working','Push wird eingerichtet','Berechtigung, Hintergrunddienst und Geräteabo werden geprüft.'];paint(null);
    try{
      let permission=Notification.permission;
      if(permission!=='granted')permission=await Notification.requestPermission();
      if(permission==='denied')throw new Error('PUSH_PERMISSION_DENIED');
      if(permission!=='granted')throw new Error('PUSH_PERMISSION_DISMISSED');
      await waitForBackend();
      const {data:key,error:keyError}=await B.client.rpc('get_push_public_key');
      if(keyError||!key)throw keyError||new Error('Push-Schlüssel nicht verfügbar');
      const applicationServerKey=keyBytes(key);
      const reg=await ensureRegistration();
      let sub=await reg.pushManager.getSubscription();
      if(!sub)sub=await Promise.race([reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey}),timeout(15000,'PUSH_SUBSCRIBE_TIMEOUT')]);
      await registerServer(sub);
      notice=null;toast('Push-Mitteilungen sind aktiviert und dieses Gerät ist bei SchichtFunk registriert.');await render();
    }catch(error){
      console.warn('[SchichtFunk Push] Aktivierung fehlgeschlagen',error);
      console.warn('[SchichtFunk Push] Diagnose',await diagnostics().catch(()=>null));
      notice=['error','Push konnte nicht aktiviert werden',errorMessage(error)];paint(null)
    }finally{busy=false}
  }

  async function disable(){if(busy||!supported())return;busy=true;try{const sub=await subscription();if(sub){const endpoint=sub.endpoint;if(B.client&&B.user?.id){const {error}=await B.client.rpc('unregister_push_subscription',{p_endpoint:endpoint});if(error)throw error}await sub.unsubscribe()}lastSync='';notice=null;toast('Push-Mitteilungen wurden auf diesem Gerät deaktiviert.');await render()}catch(error){console.warn('[SchichtFunk Push] Deaktivierung fehlgeschlagen',error);notice=['error','Push konnte nicht deaktiviert werden',errorMessage(error,'deaktiviert')];paint(null)}finally{busy=false}}

  async function sendTest(){if(busy||demo())return;busy=true;try{await waitForBackend();await sync(true);const {error}=await B.client.rpc('send_push_test',{p_company_id:B.companyId});if(error)throw error;toast('Test-Push wurde gesendet. Er sollte gleich als Geräte-Mitteilung erscheinen.')}catch(error){console.warn('[SchichtFunk Push] Test fehlgeschlagen',error);const message=String(error?.message||'').includes('PUSH_TEST_RATE_LIMIT')?'Bitte etwa 30 Sekunden bis zum nächsten Test warten.':errorMessage(error,'getestet');notice=['error','Test-Push fehlgeschlagen',message];paint(await subscription())}finally{busy=false}}

  async function sync(force=false){if(demo()||!supported()||Notification.permission!=='granted'||!B.client||!B.user?.id||!B.companyId)return false;const sub=await subscription();if(!sub)return false;const sig=`${B.user.id}|${sub.endpoint}`;if(!force&&sig===lastSync)return true;try{return await registerServer(sub)}catch(error){console.debug('[SchichtFunk Push] Sync',error?.message||error);if(force)throw error;return false}}

  function routePending(){let target=sessionStorage.getItem('sf_pending_push_view')||'';try{const u=new URL(location.href),q=u.searchParams.get('sf_push_view');if(q){target=q;sessionStorage.setItem('sf_pending_push_view',q);u.searchParams.delete('sf_push_view');history.replaceState(null,'',u.pathname+(u.search?u.search:'')+u.hash)}}catch{}if(!target||!B.role)return false;
    if(B.role==='EMPLOYEE'){const map={'employee-shifts':'shifts','employee-changes':'changes','employee-absences':'absences','employee-times':'time','employee-swaps':'swaps','employee-disruptions':'disruptions','employee-marketplace':'marketplace'};const view=map[target]||target.replace(/^employee-/,'');try{B.openEmployeePortal?.();setTimeout(()=>B.employeePortalNavigate?.(view),120);sessionStorage.removeItem('sf_pending_push_view');return true}catch{return false}}
    if(target==='disruptions'){window.SFDisruptionAutopilot?.open?.();sessionStorage.removeItem('sf_pending_push_view');return true}
    if(['absence','schedule','time','employees','overview','auto','reports','settings'].includes(target)){window.showView?.(target);sessionStorage.removeItem('sf_pending_push_view');return true}return false;
  }

  document.addEventListener('click',event=>{const source=event.target?.closest?event.target:event.target?.parentElement;const target=source?.closest?.('[data-sf-push-enable],[data-sf-push-disable],[data-sf-push-test]');if(!target)return;event.preventDefault();event.stopPropagation();if(target.matches('[data-sf-push-enable]'))void enable();else if(target.matches('[data-sf-push-disable]'))void disable();else void sendTest()},true);
  const observer=new MutationObserver(records=>{const relevant=records.some(record=>[...record.addedNodes].some(node=>node.nodeType===1&&(node.id==='sfEmployeePortal'||node.id==='sfNotifyPanel'||node.matches?.('.sf-employee-dashboard')||node.querySelector?.('#sfEmployeePortal,#sfNotifyPanel,.sf-employee-dashboard'))));if(relevant)scheduleRender()});observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('focus',()=>{void sync();scheduleRender();routePending()});document.addEventListener('visibilitychange',()=>{if(!document.hidden){void sync();scheduleRender();routePending()}});
  B.pushNotifications={enable,disable,sendTest,sync,diagnostics,status:async()=>baseState(await subscription()),compatibility};
  [120,500,1500,3500].forEach(ms=>setTimeout(()=>{scheduleRender();void sync();routePending()},ms));setInterval(()=>routePending(),1500);setInterval(()=>void sync(),60000);
})();