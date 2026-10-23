/* Public PWA lifecycle. No account data, automatic reloads or offline writes. */
(function(){
  'use strict';
  if(window.SFPwaRuntime)return;
  const offlinePage=document.body.hasAttribute('data-sf-offline-page');
  function offlineCopy(){
    const copy=document.getElementById('sfOfflineMessage');
    if(copy)copy.textContent=navigator.onLine===false?'Du bist offline. Bitte stelle eine Internetverbindung her.':'Eine Netzwerkverbindung ist vorhanden. Tippe auf „Erneut versuchen“, um SchichtFunk zu öffnen.';
  }
  if(offlinePage){
    document.getElementById('sfOfflineRetry')?.addEventListener('click',()=>{
      if(/^\/offline(?:\.html)?\/?$/.test(location.pathname))location.replace('/');else location.reload();
    });
    window.addEventListener('online',offlineCopy);window.addEventListener('offline',offlineCopy);offlineCopy();
    window.SFPwaRuntime={offlinePage:true};return;
  }
  const current=document.querySelector('meta[name="sf-release"]')?.content||'';
  let registration=null,busy=false,available=false,failed=false,restored=false,restoreTimer=null,lastWorkerCheck=0;
  const banner=document.createElement('section');banner.id='sfPwaStatus';banner.hidden=true;
  banner.setAttribute('aria-label','Verbindung und Updates');
  const copy=document.createElement('span');copy.setAttribute('role','status');copy.setAttribute('aria-live','polite');
  const action=document.createElement('button');action.type='button';banner.append(copy,action);document.body.appendChild(banner);
  function paint(){
    const offline=navigator.onLine===false;
    const mode=offline?'offline':failed?'unreachable':available?'update':restored?'online':'';
    banner.hidden=!mode;banner.dataset.mode=mode;
    const text=mode==='offline'?'Offline. Neue Änderungen und Zeitbuchungen benötigen eine Verbindung.':mode==='unreachable'?'SchichtFunk ist derzeit nicht erreichbar. Bitte prüfe die Verbindung.':mode==='update'?'Neue Version verfügbar. Bitte speichere offene Änderungen vor dem Neuladen.':mode==='online'?'Verbindung zu SchichtFunk wiederhergestellt.':'';
    if(copy.textContent!==text)copy.textContent=text;
    action.hidden=mode==='online'||!mode;action.textContent=mode==='update'?'Neu laden':'Erneut prüfen';action.disabled=busy;
  }
  async function check(){
    if(busy||document.hidden||navigator.onLine===false){paint();return}
    busy=true;paint();const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch('/pwa-release.json',{cache:'no-store',credentials:'omit',signal:controller.signal});
      if(!response.ok)throw new Error('release unavailable');
      const release=await response.json();if(!/^[a-f0-9]{20}$/.test(release.version||''))throw new Error('invalid release');
      available=!!current&&release.version!==current;
      if(failed){restored=true;clearTimeout(restoreTimer);restoreTimer=setTimeout(()=>{restored=false;paint()},5000)}
      failed=false;
      if(registration&&Date.now()-lastWorkerCheck>60000){lastWorkerCheck=Date.now();void registration.update().catch(()=>{});}
    }catch{failed=true}
    finally{clearTimeout(timer);busy=false;paint()}
  }
  action.addEventListener('click',()=>{if(available&&!failed&&navigator.onLine!==false)location.reload();else void check()});
  window.addEventListener('offline',paint);
  window.addEventListener('online',()=>{failed=true;paint();void check()});
  window.addEventListener('focus',()=>{void check()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check()});
  window.SFPwaRuntime={check};
  if(window.isSecureContext&&'serviceWorker' in navigator){
    navigator.serviceWorker.register('/schichtfunk-sw.js',{scope:'/',updateViaCache:'none'}).then(reg=>{registration=reg;}).catch(()=>{});
  }
  // A visible app checks for releases infrequently; hidden apps do no polling work.
  setInterval(()=>{if(!document.hidden)void check()},300000);
  paint();void check();
})();
