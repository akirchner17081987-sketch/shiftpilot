/* Selection is navigation only; existing roles, MFA and QR PIN checks remain authoritative. */
(function () {
  'use strict';
  const root = document.getElementById('sfEntryOverlay');
  const choice = document.getElementById('sfEntryChoice');
  const selected = document.getElementById('sfEntrySelected');
  const slot = document.getElementById('sfEntryLoginSlot');
  const time = document.getElementById('sfEntryTime');
  const back = document.getElementById('sfEntryBack');
  if (!root || !choice || !selected || !slot || !time || !back) return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const names = {mitarbeiter:'Mitarbeiterportal', verwaltung:'Verwaltung', zeitkonto:'Zeiterfassung'};
  const allowed = new Set(['mitarbeiter','verwaltung','zeit','zeitkonto']);
  const params = new URLSearchParams(location.search);
  let area = allowed.has(params.get('bereich')) ? params.get('bereich') : location.hash === '#app' ? 'verwaltung' : null;
  let ready = false, switching = false, lastSelection = null, scannerPromise = null;
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
    if (area === 'zeitkonto' && window.SFBackend) window.SFBackend.pendingView = 'time';
  }
  function render() {
    choice.hidden = !ready || area !== null;
    selected.hidden = !ready || area === null;
    time.hidden = area !== 'zeit';
    slot.hidden = area === null || area === 'zeit';
    labelAuth(document.getElementById('sfAuthBackdrop'));
  }
  function mount(auth) {
    if (!root.isConnected) return;
    ready = true;render();
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
    switching = true;
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
      if (window.SFBackend) window.SFBackend.pendingView = next === 'zeitkonto' ? 'time' : 'overview';
      const password = document.getElementById('sfPassword');if (password) password.value = '';
      const message = document.getElementById('sfAuthMsg');if (message) { message.textContent = '';message.className = 'sf-auth-msg'; }
      render();setAddress();
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
  window.SFEntryAccess = {mount, isChoosing:() => root.isConnected && area === null};
  const existing = slot.querySelector('#sfAuthBackdrop');if (existing) mount(existing);
})();
