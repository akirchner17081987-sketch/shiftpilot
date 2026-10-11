/* SchichtFunk Entry 2.0 – staged, truthful boot feedback, no auth/data prefetch. */
(function () {
  'use strict';
  const root = document.getElementById('sfEntryOverlay');
  if (!root) return;
  const label = root.querySelector('#sfEntryStatus');
  const progress = root.querySelector('#sfEntryBar');
  const counter = root.querySelector('#sfEntryCounter');
  const warning = root.querySelector('#sfEntryWarning');
  const skip = root.querySelector('#sfEntrySkip');
  const image = root.querySelector('#sfEntryLogoImage');
  const startedAt = performance.now();
  const times = { startedAt, brand: null, document: null, resources: null, ready: null };
  const done = {brand:false, document:false, resources:false, ready:false};
  let dismissed = false;
  let observer = null;
  let readyTarget = null;
  let raf = 0;

  function mark(stage) {
    if (done[stage]) return;
    done[stage] = true;
    times[stage] = Math.round(performance.now() - startedAt);
    const count = Object.values(done).filter(Boolean).length;
    progress.style.width = Math.round((count / 4) * 100) + '%';
    counter.textContent = count + ' / 4';
    if (stage === 'brand') label.textContent = 'Logo 2.0 geladen';
    if (stage === 'document') label.textContent = 'Anwendung wird vorbereitet';
    if (stage === 'resources') label.textContent = 'Anmeldung wird initialisiert';
    if (stage === 'ready') label.textContent = 'SchichtFunk ist bereit';
    try { performance.mark('sf-entry-' + stage); } catch (_) {}
  }

  function measure() {
    const nav = performance.getEntriesByType('navigation')[0];
    const assets = performance.getEntriesByType('resource');
    const scripts = assets.filter(entry => /\\.js(?:[?#]|$)/.test(entry.name));
    const styles = assets.filter(entry => /\\.css(?:[?#]|$)/.test(entry.name));
    const result = Object.freeze({
      startedAt: Math.round(startedAt),
      entryToReadyMs: times.ready,
      entryToBrandMs: times.brand,
      entryToDocumentMs: times.document,
      entryToResourcesMs: times.resources,
      domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      windowLoadMs: nav && nav.loadEventEnd ? Math.round(nav.loadEventEnd) : null,
      observedJsRequests: scripts.length,
      observedCssRequests: styles.length,
      // Resource bytes are not reliable for cached or cross-origin assets.
      transferableBytesKnown: scripts.filter(x => x.transferSize > 0).reduce((sum, x) => sum + x.transferSize, 0)
    });
    window.SFEntryMetrics = result;
    if (new URLSearchParams(location.search).has('sfPerf')) console.table(result);
  }

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    mark('ready');
    measure();
    if (observer) observer.disconnect();
    window.removeEventListener('load', onLoad);
    root.classList.add('sf-entry-out');
    setTimeout(() => root.remove(), 500);
  }

  function isVisible(el) {
    return !!el && el.isConnected && getComputedStyle(el).display !== 'none' &&
      getComputedStyle(el).visibility !== 'hidden';
  }

  function checkReady() {
    if (dismissed) return;
    const auth = document.getElementById('sfAuthBackdrop');
    const manager = document.getElementById('appShell');
    const employee = document.getElementById('sfEmployeePortal');
    const loginReady = isVisible(auth) && !!window.SFBackend?.client;
    const managerReady = isVisible(manager) && !!window.SFBackend?.ready;
    const employeeReady = isVisible(employee) && !!window.SFBackend?.ready;
    if (!loginReady && !managerReady && !employeeReady) return;
    readyTarget = loginReady ? 'login' : employeeReady ? 'employee' : 'manager';
    // Real application readiness ends the entry. Never delay access to the login.
    dismiss();
  }

  function onLoad() { mark('resources'); checkReady(); }
  window.addEventListener('load', onLoad, {once:true});
  if (document.readyState === 'complete') onLoad();
  if (document.readyState !== 'loading') mark('document');
  else document.addEventListener('DOMContentLoaded', () => { mark('document'); checkReady(); }, {once:true});

  image?.addEventListener('load', () => mark('brand'), {once:true});
  if (image?.complete && image.naturalWidth) mark('brand');
  image?.addEventListener('error', () => {
    mark('brand');
    warning.textContent = 'Das Logo konnte nicht vollständig geladen werden. Die Anmeldung wird trotzdem vorbereitet.';
    warning.hidden = false;
  }, {once:true});

  // Inline the exact saved SVG so calendar, clock, waves, wordmark can animate separately.
  fetch('assets/schichtfunk-logo-v2-entry.svg', {cache:'force-cache'})
    .then(response => { if (!response.ok) throw new Error('Brand asset failed'); return response.text(); })
    .then(source => {
      if (dismissed) return;
      const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
      if (doc.querySelector('parsererror')) throw new Error('Invalid logo SVG');
      const svg = doc.documentElement;
      if (svg.localName !== 'svg' || !svg.querySelector('#calendar') || !svg.querySelector('#clock')) throw new Error('Missing logo groups');
      const wrapper = document.createElement('div');
      wrapper.className = 'sf-entry-logo';
      wrapper.id = 'sfEntryLogoAnimated';
      wrapper.setAttribute('role','img');
      wrapper.setAttribute('aria-label','SchichtFunk 2.0 – Klar geplant. Stark besetzt.');
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      wrapper.appendChild(document.importNode(svg, true));
      image?.replaceWith(wrapper);
      mark('brand');
    }).catch(() => { if (image?.complete) mark('brand'); });

  observer = new MutationObserver(() => {
    if (raf || dismissed) return;
    raf = requestAnimationFrame(() => { raf = 0; checkReady(); });
  });
  observer.observe(document.documentElement, {childList:true,subtree:true,attributes:true,attributeFilter:['style','class']});
  skip?.addEventListener('click', () => {
    root.classList.add('sf-entry-skip-animation');
    if (done.ready || readyTarget) dismiss();
    else {
      label.textContent = 'Anmeldung wird vorbereitet';
      skip.textContent = 'Bitte kurz warten …';
      skip.disabled = true;
    }
  });
  const slowTimer = setTimeout(() => {
    if (dismissed) return;
    warning.hidden = false;
    warning.textContent = 'Der Start dauert ungewöhnlich lange. Bitte prüfe die Verbindung. Du kannst die Seite erneut laden.';
    skip.disabled = false;
    skip.textContent = 'Seite neu laden';
    skip.onclick = () => location.reload();
  }, 20000);
  const oldDismiss = dismiss;
  // Keep the timeout from retaining the overlay after readiness.
  root.addEventListener('transitionend', () => { if (dismissed) clearTimeout(slowTimer); }, {once:true});
  checkReady();
})();
