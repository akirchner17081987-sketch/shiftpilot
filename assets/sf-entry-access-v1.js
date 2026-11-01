/* Selection is navigation only; existing roles, MFA and QR PIN checks remain authoritative. */
(function () {
  'use strict';
  const allowed = new Set(['mitarbeiter','verwaltung','zeit','zeitkonto','demo']);
  // Carry only a known area across public legal pages; never copy an auth URL.
  function legalNavigation(area) {
    const query=allowed.has(area)?'?bereich='+encodeURIComponent(area):'';
    document.querySelectorAll('a[href]').forEach(link=>{
      const raw=link.getAttribute('href');if(!raw||!/^\/(?:impressum|datenschutz)(?:\.html)?(?:[?#]|$)/.test(raw))return;
      const url=new URL(raw,location.origin);if(url.origin!==location.origin)return;
      link.setAttribute('href',url.pathname+query+url.hash);
    });
    document.querySelectorAll('[data-sf-entry-return]').forEach(link=>link.setAttribute('href','/'+query));
  }
  legalNavigation(new URLSearchParams(location.search).get('bereich'));
  const root = document.getElementById('sfEntryOverlay');
  const choice = document.getElementById('sfEntryChoice');
  const selected = document.getElementById('sfEntrySelected');
  const slot = document.getElementById('sfEntryLoginSlot');
  const time = document.getElementById('sfEntryTime');
  const back = document.getElementById('sfEntryBack');
  if (!root || !choice || !selected || !slot || !time || !back) return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const names = {mitarbeiter:'Mitarbeiterportal', verwaltung:'Verwaltung', zeitkonto:'Zeiterfassung', demo:'Demo-Zugang'};
  const params = new URLSearchParams(location.search);
  const pushView = params.get('sf_push_view');
  let rememberedArea = null;
  try { rememberedArea = window.localStorage.getItem('sf_entry_area'); } catch (_) { /* Storage may be unavailable. */ }
  // Resolve the workspace before session restoration chooses a membership role.
  // Employee links are explicit; generic test pushes follow this device's selection.
  const pushArea = pushView?.startsWith('employee-') ? 'mitarbeiter'
    : pushView === 'overview' && ['mitarbeiter','verwaltung','zeitkonto'].includes(rememberedArea) ? rememberedArea
    : pushView ? 'verwaltung' : null;
  // Older installations retain /#app as their launch URL. In the installed
  // app that legacy default must open the chooser; explicit area links still work.
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const legacyPwaStart = standalone && location.hash === '#app' && !allowed.has(params.get('bereich')) && !pushArea;
  let area = allowed.has(params.get('bereich')) ? params.get('bereich') : pushArea || (location.hash === '#app' && !legacyPwaStart ? 'verwaltung' : null);
  if (legacyPwaStart || pushArea) setAddress();
  rememberArea();
  function rememberArea() {
    if (!allowed.has(area) || area === 'demo') return;
    try { window.localStorage.setItem('sf_entry_area', area); } catch (_) { /* Navigation works without storage. */ }
  }
  let ready = false, switching = false, lastSelection = null, scannerPromise = null, demoExpiryShown = false, selectionVersion = 0;
  root.classList.add('sf-entry-access-enabled');

  function setAddress() {
    const url = new URL(location.href);
    if (area) url.searchParams.set('bereich', area);
    else { url.searchParams.delete('bereich'); if (url.hash === '#app') url.hash = ''; }
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }
  function labelAuth(auth) {
    if (!auth) return;
    const dialog = auth.querySelector('[role="dialog"]');
    if (dialog?.getAttribute('aria-modal') !== 'false') dialog?.setAttribute('aria-modal', 'false');
    if (auth.querySelector('#sfPassword') && names[area]) {
      const title = auth.querySelector('#sfAuthTitle');
      if (title && title.textContent !== names[area]) title.textContent = names[area];
    }
    const user=auth.querySelector('#sfEmail'),label=auth.querySelector('label[for="sfEmail"]');
    if(user){user.type=area==='demo'?'text':'email';user.autocomplete=area==='demo'?'username':'email';user.inputMode=area==='demo'?'text':'email';}
    if(label)label.textContent=area==='demo'?'Benutzer':'E-Mail';
    if(area==='demo'&&!demoExpiryShown){
      const reason=params.get('demo_expired'),message=auth.querySelector('#sfAuthMsg');
      if(message&&['idle','maximum'].includes(reason)){message.textContent=reason==='idle'?'Die Demo wurde nach 30 Minuten Inaktivität beendet. Bitte melden Sie sich erneut an.':'Die maximale Demo-Sitzungsdauer ist abgelaufen. Bitte melden Sie sich erneut an.';message.className='sf-auth-msg bad';demoExpiryShown=true;}
    }
    if (area === 'zeitkonto' && window.SFBackend) window.SFBackend.pendingView = 'time';
  }
  function render() {
    root.classList.toggle('sf-entry-demo-active', area === 'demo');
    choice.hidden = !ready || area !== null;
    selected.hidden = !ready || area === null;
    time.hidden = area !== 'zeit';
    slot.hidden = area === null || area === 'zeit';
    labelAuth(document.getElementById('sfAuthBackdrop'));
    legalNavigation(area);
  }
  function mount(auth) {
    if (!root.isConnected) return;
    ready = true;render();
    if (area && area !== 'zeit') window.SFEntryDive?.prepare();
    if (area === null && auth?.contains(document.activeElement)) choice.querySelector('button')?.focus({preventScroll:true});
  }
  async function animate(node, frames, options) {
    if (!node?.animate || motion.matches || root.classList.contains('sf-entry-skip-animation')) return;
    const animation = node.animate(frames, options);
    try { await animation.finished; } catch (_) { /* A navigation may cancel an animation. */ }
    animation.cancel();
  }
  async function select(next, button) {
    if (switching || !ready || !root.isConnected || root.inert) return;
    switching = true;selectionVersion++;
    const outgoing = area === null ? choice : selected;
    try {
      if (button?.matches('[data-entry-area]')) {
        lastSelection = button;
        root.querySelector('.sf-entry-choices').classList.add('sf-entry-launching');button.classList.add('sf-entry-picked');
        await animate(button,[{borderColor:'#467b80',background:'#0b2129'},{borderColor:'#79efdc',background:'#103137',boxShadow:'0 0 30px #33cbb532'}],{duration:300,easing:'ease-out'});
      }
      await animate(outgoing,[{opacity:1,transform:'translateX(0) scale(1)',filter:'blur(0px)'},{opacity:0,transform:'translateX(-14px) scale(.985)',filter:'blur(3px)'}],{duration:260,easing:'ease-in'});
      if (!root.isConnected || root.inert) return;
      area = next;
      rememberArea();
      if (window.SFBackend) window.SFBackend.pendingView = next === 'zeitkonto' ? 'time' : 'overview';
      const password = document.getElementById('sfPassword');if (password) password.value = '';
      if(password)password.type='password';
      for(const id of ['sfEmail','sfPassword'])document.getElementById(id)?.removeAttribute('aria-invalid');
      const visibility=document.getElementById('sfPasswordVisibility');if(visibility){visibility.textContent='Anzeigen';visibility.setAttribute('aria-label','Passwort anzeigen');visibility.setAttribute('aria-pressed','false');}
      const message = document.getElementById('sfAuthMsg');if (message) { message.textContent = '';message.className = 'sf-auth-msg'; }
      render();setAddress();
      if (next && next !== 'zeit') window.SFEntryDive?.prepare();
      const incoming = area === null ? choice : selected;
      const sweep = root.querySelector('.sf-entry-light-sweep');
      await Promise.all([
        animate(sweep,[{opacity:0,transform:'translateY('+incoming.offsetTop+'px)',offset:0},{opacity:.7,offset:.14},{opacity:.45,offset:.78},{opacity:0,transform:'translateY('+(incoming.offsetTop+incoming.offsetHeight)+'px)',offset:1}],{duration:720,easing:'cubic-bezier(.25,.6,.3,1)'}),
        animate(incoming,[{opacity:0,clipPath:'inset(0 0 100% 0 round 14px)',transform:'translateY(8px)'},{opacity:1,clipPath:'inset(0 0 0% 0 round 14px)',transform:'translateY(0)'}],{duration:720,easing:'cubic-bezier(.25,.6,.3,1)'})
      ]);
      if (root.isConnected && !root.inert) (area === null ? lastSelection || choice.querySelector('button') : back)?.focus({preventScroll:true});
    } finally {
      switching = false;root.querySelector('.sf-entry-choices').classList.remove('sf-entry-launching');lastSelection?.classList.remove('sf-entry-picked');
    }
  }
  root.querySelectorAll('[data-entry-area]').forEach(button => button.addEventListener('click', () => select(button.dataset.entryArea, button)));
  back.addEventListener('click', () => select(null));
  document.getElementById('sfEntryTimeAccount').addEventListener('click', () => select('zeitkonto'));
  document.getElementById('sfEntryScan').addEventListener('click', async event => {
    const button = event.currentTarget, status = document.getElementById('sfEntryScanStatus');
    button.disabled = true;status.textContent = 'Scanner wird vorbereitet …';
    try {
      if (!window.SFEntryQrScanner) {
        if (!scannerPromise) scannerPromise = new Promise((resolve,reject) => {
          const script = document.createElement('script');script.src = 'assets/employee-qr-scanner-v1.js?v=20261017-entry1';
          script.onload = () => window.SFEntryQrScanner ? resolve() : reject(new Error('Scanner ist nicht verfügbar.'));
          script.onerror = () => { script.remove();reject(new Error('Scanner konnte nicht geladen werden.')); };
          document.head.appendChild(script);
        }).catch(error => { scannerPromise = null;throw error; });
        await scannerPromise;
      }
      if (!root.isConnected || area !== 'zeit') return;
      status.textContent = '';window.SFEntryQrScanner.open(button);
    } catch (_) { status.textContent = 'Scanner konnte nicht geladen werden. Bitte öffnen Sie den Standort-Code mit der Smartphone-Kamera.'; }
    finally { button.disabled = false; }
  });
  async function submitDemo(username,password){
    const requestedVersion=selectionVersion;
    const user=document.getElementById('sfEmail'),secret=document.getElementById('sfPassword'),message=document.getElementById('sfAuthMsg'),button=document.getElementById('sfAuthSubmit');
    const say=text=>{message.textContent=text;message.className='sf-auth-msg bad';};
    if(!username){user.setAttribute('aria-invalid','true');say('Bitte Ihren Demo-Benutzer eingeben.');user.focus();return}
    if(!password){secret.setAttribute('aria-invalid','true');say('Bitte Ihr Passwort eingeben.');secret.focus();return}
    if(!window.SFDemoAPI){say('Der Demo-Zugang ist nicht verfügbar. Bitte laden Sie die Seite erneut.');return}
    button.disabled=true;
    try{
      const response=await window.SFDemoAPI.fetchAuth({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
      const result=await response.json().catch(()=>({}));
      if(area!=='demo'||!root.isConnected||requestedVersion!==selectionVersion)return;
      if(result.failureToken)window.SFDemoAPI.setFailureToken(result.failureToken);
      if(response.status===429){const minutes=Math.max(1,Math.ceil(Number(result.retryAfter||60)/60));say(`Zu viele Versuche. Bitte in ${minutes} Minute${minutes===1?'':'n'} erneut versuchen.`);return}
      if(!response.ok||!result.accessToken){say(response.status===503?'Der Demo-Zugang wird gerade eingerichtet. Bitte später erneut versuchen.':'Benutzer oder Passwort ist nicht korrekt.');return}
      window.SFDemoAPI.setAccessToken(result.accessToken);window.SFDemoAPI.clearFailureToken();secret.value='';
      window.location.assign('/demo');
    }catch(_){say('Der Demo-Zugang konnte nicht gestartet werden. Bitte versuchen Sie es erneut.')}
    finally{button.disabled=false}
  }
  window.SFEntryAccess = {mount, isChoosing:() => root.isConnected && area === null, isDemo:() => root.isConnected && area === 'demo', submitDemo};
  const existing = slot.querySelector('#sfAuthBackdrop');if (existing) mount(existing);
})();
