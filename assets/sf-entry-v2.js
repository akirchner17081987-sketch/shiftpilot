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
  const slot = root.querySelector('#sfEntryLoginSlot');
  const startedAt = performance.now();
  const times = { startedAt, brand: null, document: null, resources: null, ready: null };
  const done = {brand:false, document:false, resources:false, ready:false};
  let dismissed = false;
  let observer = null;
  let readyTarget = null;
  let morphed = false;
  let activeAuth = null;
  let metricsWritten = false;
  let raf = 0;
  let welcoming = false;
  let welcomeTimer = 0;
  const welcome = root.querySelector('#sfEntryWelcome');
  const welcomeTitle = root.querySelector('#sfEntryWelcomeTitle');

  function mark(stage) {
    if (done[stage]) return;
    done[stage] = true;
    times[stage] = Math.round(performance.now() - startedAt);
    const count = Object.values(done).filter(Boolean).length;
    progress.style.width = Math.round((count / 4) * 100) + '%';
    counter.textContent = count + ' / 4';
    if (stage === 'brand') label.textContent = 'Ansicht geladen';
    if (stage === 'document') label.textContent = 'Anwendung wird vorbereitet';
    if (stage === 'resources') label.textContent = 'Anmeldung wird initialisiert';
    if (stage === 'ready') label.textContent = 'SchichtFunk ist bereit';
    try { performance.mark('sf-entry-' + stage); } catch (_) {}
  }

  function measure() {
    const nav = performance.getEntriesByType('navigation')[0];
    const assets = performance.getEntriesByType('resource');
    const scripts = assets.filter(entry => new URL(entry.name).pathname.endsWith(".js"));
    const styles = assets.filter(entry => new URL(entry.name).pathname.endsWith(".css"));
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
    if (!done.ready) mark('ready');
    if (!metricsWritten) { measure(); metricsWritten = true; }
    clearTimeout(slowTimer);
    clearTimeout(welcomeTimer);
    observer?.disconnect();
    window.removeEventListener('load', onLoad);
    root.classList.add('sf-entry-out');
    const exitMs = root.classList.contains('sf-entry-success') &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1250 : 500;
    setTimeout(() => root.remove(), exitMs);
  }

  function isVisible(el) {
    return !!el && el.isConnected && getComputedStyle(el).display !== 'none' &&
      getComputedStyle(el).visibility !== 'hidden';
  }

  function cancelWelcome() {
    if (!welcoming) return;
    clearTimeout(welcomeTimer);
    welcoming = false;
    root.classList.toggle('sf-entry-success', false);
    if (welcome) welcome.hidden = true;
  }

  function welcomeToWorkspace() {
    if (welcoming || dismissed) return;
    // Restored sessions open directly; the cinematic transition follows a real login.
    if (!morphed || !welcome || document.hidden ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
        root.classList.contains('sf-entry-skip-animation')) { dismiss(); return; }
    welcoming = true;
    clearTimeout(slowTimer);
    const name = window.SFBackend?.user?.user_metadata?.full_name;
    if (welcomeTitle) welcomeTitle.textContent = typeof name === 'string' && name.trim()
      ? 'Willkommen, ' + name.trim().split(/\s+/)[0].slice(0,60) + '.'
      : 'Willkommen bei SchichtFunk.';
    const visual = root.querySelector('.sf-entry-visual');
    if (visual) {
      const a = root.getBoundingClientRect(), b = visual.getBoundingClientRect();
      root.style.setProperty('--sf-entry-success-shift', (a.x + a.width / 2 - b.x - b.width / 2) + 'px');
    }
    root.scrollTop = 0;
    welcome.hidden = false;
    root.inert = true;
    root.classList.add('sf-entry-success');
    welcomeTimer = setTimeout(() => {
      // Re-check the protected workspace before revealing it, even if the tab was suspended.
      welcoming = false;
      const B = window.SFBackend;
      const valid = (isVisible(document.getElementById('appShell')) && (B?.ready || B?.shellReady)) ||
        (isVisible(document.getElementById('sfEmployeePortal')) && B?.ready);
      if (valid && !isVisible(document.getElementById('sfMfaModal'))) dismiss();
      else { welcoming = true; cancelWelcome(); checkReady(); }
    }, 4200);
  }

  function syncAuthLoading() {
    if (!morphed) return;
    const loading = !!document.getElementById('sfCloudLoading');
    if (root.classList.contains('sf-entry-authenticating') !== loading) {
      root.classList.toggle('sf-entry-authenticating', loading);
    }
  }

  function morphToLogin(auth) {
    if (!slot || dismissed || !auth) return;
    if (activeAuth !== auth) {
      // Move the real Supabase form; never create a duplicate form or listeners.
      slot.appendChild(auth);
      activeAuth = auth;
    }
    if (!morphed) {
      morphed = true;
      readyTarget = 'login';
      mark('ready');
      if (!metricsWritten) { measure(); metricsWritten = true; }
      clearTimeout(slowTimer);
      root.classList.add('sf-entry-login-ready');
      skip.disabled = true;
      skip.hidden = true;
      setTimeout(() => {
        if (window.SFEntryAccess?.isChoosing()) return;
        const email = document.getElementById('sfEmail');
        if (email && email.isConnected && (document.activeElement === document.body || document.activeElement === skip)) {
          email.focus({preventScroll:true});
        }
      }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 660);
    }
    window.SFEntryAccess?.mount(auth);
    syncAuthLoading();
  }

  function checkReady() {
    if (dismissed) return;
    // A restored AAL1 session can require MFA before a login form or app exists.
    // Let the real security dialog stay above the decorative entry surface.
    const mfaReady = isVisible(document.getElementById('sfMfaModal'));
    const auxiliaryReady = isVisible(document.getElementById('sfPasswordResetBackdrop')) ||
      isVisible(document.getElementById('sfEmployeeRegister'));
    root.classList.toggle('sf-entry-mfa-ready', mfaReady);
    root.classList.toggle('sf-entry-dialog-ready', auxiliaryReady);
    root.inert = mfaReady || auxiliaryReady || welcoming;
    if (mfaReady) {
      cancelWelcome();
      readyTarget = 'mfa';
      mark('ready');
      label.textContent = 'Sicherheitscode erforderlich';
      clearTimeout(slowTimer);
      warning.hidden = true;
      skip.hidden = true;
      return;
    }
    if (auxiliaryReady) { cancelWelcome(); root.inert = true; clearTimeout(slowTimer); return; }
    const auth = document.getElementById('sfAuthBackdrop');
    const manager = document.getElementById('appShell');
    const employee = document.getElementById('sfEmployeePortal');
    const managerReady = isVisible(manager) && (!!window.SFBackend?.ready || !!window.SFBackend?.shellReady);
    const employeeReady = isVisible(employee) && !!window.SFBackend?.ready;
    if (managerReady || employeeReady) {
      readyTarget = employeeReady ? 'employee' : 'manager';
      welcomeToWorkspace();
      return;
    }
    cancelWelcome();
    root.inert = false;
    // The branded entry now *becomes* the login; background stays continuous.
    if (isVisible(auth) && !!window.SFBackend?.client) morphToLogin(auth);
    else syncAuthLoading();
  }

  function onLoad() { mark('resources'); checkReady(); }
  window.addEventListener('load', onLoad, {once:true});
  if (document.readyState === 'complete') onLoad();
  if (document.readyState !== 'loading') mark('document');
  else document.addEventListener('DOMContentLoaded', () => { mark('document'); checkReady(); }, {once:true});

  // The minimal entry is already in the document; no decorative logo request is needed.
  mark('brand');

  observer = new MutationObserver(() => {
    if (raf || dismissed) return;
    raf = requestAnimationFrame(() => { raf = 0; checkReady(); });
  });
  observer.observe(document.documentElement, {childList:true,subtree:true,attributes:true,attributeFilter:['style','class']});
  skip?.addEventListener('click', () => {
    root.classList.add('sf-entry-skip-animation');
    // Skip only the decorative intro, never bypass protected auth readiness.
    if (activeAuth) morphToLogin(activeAuth);
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
  // An unchanged startup still warns after 20 seconds. Readiness clears the timer.
  checkReady();
})();

