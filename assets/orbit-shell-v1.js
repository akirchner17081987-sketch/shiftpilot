/* Orbit presentation layer. Original navigation buttons remain the authority. */
(function () {
  'use strict';
  if (window.SFOrbit) return;
  const KEY = 'sf_orbit_motion_v1';
  const GROUPS = [
    { id: 'planning', label: 'Planung', icon: 'calendar', items: [['schedule', 'Dienstplan'], ['auto', 'Auto-Planung'], ['wishes', 'Wunschplanung'], ['disruptions', 'Störfallautopilot']] },
    { id: 'personal', label: 'Personal', icon: 'people', items: [['staffing', 'Personalsimulator'], ['handover', 'Schichtübergabe'], ['marketplace', 'Schicht-Marktplatz'], ['employees', 'Mitarbeiter'], ['absence', 'Abwesenheit'], ['time', 'Zeiterfassung']] },
    { id: 'analysis', label: 'Auswertung & Kontrolle', icon: 'chart', items: [['reports', 'Auswertung'], ['audit', 'Audit-Logs']] },
    { id: 'settings', label: 'Einstellungen', icon: 'settings', items: [['settings', 'Einstellungen']] }
  ];
  const LABELS = Object.fromEntries(GROUPS.flatMap(group => group.items));
  LABELS.overview = 'Übersicht';
  const paths = {
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2m2-16a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 4v2"/>',
    chart: '<path d="M4 3v18h17M8 16v-5m5 5V7m5 9V4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="m9 3-1 3-3 1-2 3 2 2-1 3 2 3 3-1 2 2h3l1-3 3-1 2-3-2-2 1-3-2-3-3 1-2-2Z"/>',
    arrow: '<path d="m9 5 7 7-7 7"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    home: '<path d="m3 10 9-7 9 7v10H3Zm6 10v-7h6v7"/>'
  };
  function icon(name) {
    const wrapper = document.createElement('span');
    wrapper.className = 'sf-orbit-icon';
    wrapper.setAttribute('aria-hidden', 'true');
    wrapper.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + paths[name] + '</svg>';
    return wrapper;
  }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let motion = 'full';
  try { const value = localStorage.getItem(KEY); if (['full', 'subtle', 'off'].includes(value)) motion = value; } catch (_) {}
  let shell, dock, popup, entries, title, frame, live, settingsSelection, openGroup = null, queue = false, animations = [], ornaments = [], context = '';
  const buttons = new Map();
  const effectiveMotion = () => reducedMotion.matches ? 'off' : motion;
  const backend = () => window.SFBackend || {};
  const source = view => shell?.querySelector('.sidebar [data-view="' + view + '"]') || shell?.querySelector('.side-bottom [data-view="' + view + '"]');
  const visibleSource = button => !!button && !button.hidden && button.getAttribute('aria-hidden') !== 'true' && button.style.display !== 'none';
  const allowed = button => visibleSource(button) && !button.disabled && button.getAttribute('aria-disabled') !== 'true';
  const availableItems = group => group.items.filter(([view]) => visibleSource(source(view)));
  const activeView = () => shell?.querySelector('.main .view.active')?.id.replace(/^view-/, '') || '';
  const ready = () => !!backend().ready && backend().role !== 'EMPLOYEE' && !backend().companySwitching;

  function stopMotion() {
    animations.forEach(animation => animation.cancel()); animations = [];
    ornaments.forEach(element => element.remove()); ornaments = [];
  }
  function animate(element, frames, options) {
    if (typeof element.animate === 'function') animations.push(element.animate(frames, options));
  }
  function close(returnFocus = false) {
    const previous = openGroup;
    stopMotion(); openGroup = null;
    document.body.classList.remove('sf-orbit-menu-open');
    popup.classList.remove('is-open'); popup.inert = true;
    popup.setAttribute('aria-hidden', 'true');
    buttons.forEach(button => { if (button.hasAttribute('aria-expanded')) button.setAttribute('aria-expanded', 'false'); });
    if (returnFocus && previous) buttons.get(previous)?.focus({ preventScroll: true });
  }
  function positionPopup() {
    if (!openGroup) return;
    const trigger = buttons.get(openGroup), anchor = trigger.getBoundingClientRect();
    const width = Math.min(296, window.innerWidth - 24);
    const left = Math.max(12, Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - width - 12));
    popup.style.width = width + 'px'; popup.style.left = left + 'px';
    popup.style.bottom = Math.max(12, window.innerHeight - anchor.top + 10) + 'px';
    popup.style.setProperty('--orbit-pointer', Math.max(18, Math.min(anchor.left + anchor.width / 2 - left, width - 18)) + 'px');
    popup.style.maxHeight = Math.max(80, anchor.top - 22) + 'px';
  }
  function playOpening(group) {
    stopMotion();
    const mode = effectiveMotion();
    if (mode === 'off') return;
    if (mode === 'subtle') {
      animate(frame, [{ opacity: .5, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 320, easing: 'ease-out' });
      return;
    }
    /* Only the decorative frame moves: button hit areas remain immediately usable. */
    animate(frame, [
      { opacity: .1, transform: 'perspective(750px) translateY(24px) rotateX(32deg) scale(.85)', filter: 'blur(8px) brightness(1.6)' },
      { opacity: .9, transform: 'perspective(750px) translateY(-2px) rotateX(-3deg) scale(1.015)', filter: 'blur(0) brightness(1.2)', offset: .68 },
      { opacity: 1, transform: 'perspective(750px) translateY(0) rotateX(0) scale(1)', filter: 'blur(0) brightness(1)' }
    ], { duration: 1000, easing: 'cubic-bezier(.2,.8,.2,1)' });
    animate(buttons.get(group), [{ boxShadow: '0 0 0 0 transparent' }, { boxShadow: '0 0 0 4px var(--orbit-glow),0 0 22px var(--orbit-glow)', offset: .3 }, { boxShadow: '0 0 0 10px transparent' }], { duration: 950, easing: 'ease-out' });
    const shimmer = document.createElement('span'); shimmer.className = 'sf-orbit-shimmer'; shimmer.setAttribute('aria-hidden', 'true'); popup.append(shimmer); ornaments.push(shimmer);
    animate(shimmer, [{ opacity: 0, transform: 'scaleY(.1)' }, { opacity: .4, transform: 'scaleY(1)', offset: .35 }, { opacity: 0, transform: 'scaleY(1)' }], { duration: 1000, easing: 'ease-out' });
    for (let index = 0; index < 4; index++) {
      const spark = document.createElement('span'); spark.className = 'sf-orbit-spark'; spark.setAttribute('aria-hidden', 'true'); spark.style.left = (16 + index * 22) + '%'; popup.append(spark); ornaments.push(spark);
      animate(spark, [{ opacity: 0, transform: 'translateY(0) scale(.4)' }, { opacity: .85, transform: 'translateY(-18px) scale(1)', offset: .35 }, { opacity: 0, transform: 'translateY(-65px) scale(.3)' }], { duration: 950, delay: index * 45, easing: 'ease-out' });
    }
    entries.querySelectorAll('.sf-orbit-entry-label').forEach((label, index) => animate(label, [{ opacity: .72, filter: 'brightness(1.5)' }, { opacity: 1, filter: 'brightness(1)' }], { duration: 470, delay: index * 50, fill: 'backwards', easing: 'ease-out' }));
  }
  function activate(view) {
    const button = source(view);
    if (!ready() || !allowed(button)) { refresh(); return; }
    close(true);
    /* Click through existing hooks, loaders, workspace persistence and access checks. */
    button.click(); scheduleRefresh();
  }
  function renderEntries(group) {
    const current = activeView();
    title.textContent = group.label;
    entries.replaceChildren();
    availableItems(group).forEach(([view, label]) => {
      const original = source(view), button = document.createElement('button');
      button.type = 'button'; button.className = 'sf-orbit-entry'; button.dataset.orbitTarget = view;
      button.disabled = !ready() || !allowed(original);
      if (button.disabled) button.title = original.title || 'Für diesen Zugang nicht verfügbar';
      if (view === current) button.setAttribute('aria-current', 'page');
      const text = document.createElement('span'); text.className = 'sf-orbit-entry-label'; text.textContent = label;
      button.append(icon(group.icon), text);
      const badge = original.querySelector('.badge');
      if (badge && badge.style.display !== 'none' && !badge.hidden && Number(badge.textContent) > 0) {
        const count = document.createElement('span'); count.className = 'sf-orbit-badge'; count.textContent = badge.textContent; button.append(count);
      }
      button.append(icon('arrow')); button.addEventListener('click', () => activate(view)); entries.append(button);
    });
  }
  function reveal(group) {
    if (openGroup === group.id) { close(); return; }
    if (!ready() || !availableItems(group).some(([view]) => allowed(source(view)))) return;
    stopMotion(); renderEntries(group);
    openGroup = group.id; popup.inert = false; popup.removeAttribute('aria-hidden');
    document.body.classList.add('sf-orbit-menu-open');
    buttons.forEach((button, id) => { if (button.hasAttribute('aria-expanded')) button.setAttribute('aria-expanded', String(id === group.id)); });
    positionPopup(); popup.classList.add('is-open'); playOpening(group.id);
  }
  function applyMotion() {
    stopMotion();
    if (shell) shell.dataset.orbitMotion = effectiveMotion();
    document.querySelectorAll('select[data-orbit-motion]').forEach(select => { if (select.value !== motion) select.value = motion; });
  }
  function setMotion(value) {
    if (!['full', 'subtle', 'off'].includes(value)) return;
    motion = value; try { localStorage.setItem(KEY, value); } catch (_) {}
    applyMotion();
    window.dispatchEvent(new CustomEvent('schichtfunk:orbitmotionchange', { detail: { motion: value, effective: effectiveMotion() } }));
  }
  function refresh() {
    if (!shell) return;
    const B = backend(), nextContext = [B.user?.id || '', B.companyId || '', B.role || '', !!B.ready, !!B.companySwitching].join('|');
    if (nextContext !== context) { context = nextContext; close(); }
    const active = activeView();
    document.body.classList.toggle('sf-orbit-manager', ready() && shell.style.display !== 'none');
    GROUPS.forEach(group => {
      const button = buttons.get(group.id), isCurrent = group.items.some(([view]) => view === active);
      const enabled = ready() && availableItems(group).some(([view]) => allowed(source(view)));
      if (button.disabled !== !enabled) button.disabled = !enabled;
      button.classList.toggle('is-current', isCurrent);
      if (isCurrent) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
      const detail = button.querySelector('small');
      const label = isCurrent && group.id !== 'settings' ? LABELS[active] : '';
      if (detail.textContent !== label) detail.textContent = label;
      detail.hidden = !label;
    });
    const home = shell.querySelector('#sfOrbitHome');
    home.disabled = !ready() || !allowed(source('overview'));
    const label = LABELS[active] || '';
    if (live.textContent !== label) live.textContent = label;
    applySelectValues();
    const selected = active === 'settings' ? shell.querySelector('#sfSettingsV2 .sf-set-nav button.active') : null;
    if (selected && selected !== settingsSelection) {
      settingsSelection = selected;
      const nav = selected.parentElement, rail = nav.getBoundingClientRect(), item = selected.getBoundingClientRect();
      // Scroll only the local rail; do not move the page or interrupt manual browsing.
      if (item.right > rail.right - 8) nav.scrollLeft += item.right - rail.right + 8;
      else if (item.left < rail.left + 8) nav.scrollLeft -= rail.left + 8 - item.left;
    }
    if (!selected) settingsSelection = null;
    if (openGroup) {
      const group = GROUPS.find(item => item.id === openGroup);
      const signature = availableItems(group).map(([view]) => [view, allowed(source(view)), source(view)?.querySelector('.badge')?.textContent || '', source(view)?.querySelector('.badge')?.style.display || ''].join(':')).join('|') + active;
      if (entries.dataset.signature !== signature) { renderEntries(group); entries.dataset.signature = signature; positionPopup(); }
      if (buttons.get(openGroup).disabled) close();
    }
  }
  function applySelectValues() { document.querySelectorAll('select[data-orbit-motion]').forEach(select => { if (select.value !== motion) select.value = motion; }); }
  function scheduleRefresh() { if (queue) return; queue = true; requestAnimationFrame(() => { queue = false; refresh(); }); }
  function init() {
    shell = document.getElementById('appShell');
    const topbar = shell?.querySelector('.topbar'), sidebar = shell?.querySelector('.sidebar');
    if (!shell || !topbar || !sidebar) return;
    const home = document.createElement('button'); home.id = 'sfOrbitHome'; home.className = 'sf-orbit-brand'; home.type = 'button'; home.setAttribute('aria-label', 'SchichtFunk – Übersicht öffnen');
    const logo = document.createElement('img'); logo.src = 'assets/schichtfunk-logo.svg'; logo.alt = 'SchichtFunk'; logo.draggable = false; home.append(logo); home.addEventListener('click', () => activate('overview')); topbar.prepend(home);
    const company = sidebar.querySelector('.company-card'); if (company) topbar.insertBefore(company, topbar.querySelector('.search'));
    /* Keep the original user/settings container so account and role integrations still find it. */
    const account = sidebar.querySelector('.side-bottom');
    if (account) {
      const legal = account.querySelector('.sf-legal-links');
      if (legal) { legal.classList.add('sf-orbit-legal'); shell.querySelector('.main')?.append(legal); }
      topbar.querySelector('.top-actions')?.append(account);
    }
    dock = document.createElement('nav'); dock.id = 'sfOrbitDock'; dock.className = 'sf-orbit-dock'; dock.setAttribute('aria-label', 'SchichtFunk Hauptnavigation');
    GROUPS.forEach(group => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'sf-orbit-category'; button.dataset.orbitCategory = group.id;
      const label = document.createElement('span'); label.className = 'sf-orbit-category-copy'; const name = document.createElement('span'); name.textContent = group.label; const detail = document.createElement('small'); detail.hidden = true; label.append(name, detail); button.append(icon(group.icon), label);
      if (group.id !== 'settings') { button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', 'sfOrbitPopup'); button.append(icon('arrow')); button.addEventListener('click', () => reveal(group)); }
      else button.addEventListener('click', () => activate('settings'));
      buttons.set(group.id, button); dock.append(button);
    });
    popup = document.createElement('section'); popup.id = 'sfOrbitPopup'; popup.className = 'sf-orbit-popup'; popup.setAttribute('aria-labelledby', 'sfOrbitPopupTitle'); popup.setAttribute('aria-hidden', 'true'); popup.inert = true;
    frame = document.createElement('span'); frame.className = 'sf-orbit-motion-frame'; frame.setAttribute('aria-hidden', 'true');
    const head = document.createElement('header'); head.className = 'sf-orbit-popup-head'; title = document.createElement('h2'); title.id = 'sfOrbitPopupTitle';
    const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.setAttribute('aria-label', 'Auswahlmenü schließen'); dismiss.append(icon('close')); dismiss.addEventListener('click', () => close(true)); head.append(title, dismiss);
    entries = document.createElement('div'); entries.className = 'sf-orbit-entries'; popup.append(frame, head, entries);
    live = document.createElement('span'); live.id = 'sfOrbitCurrent'; live.className = 'sf-orbit-current-label'; live.setAttribute('aria-live', 'polite'); topbar.append(live);
    shell.append(popup, dock); shell.classList.add('sf-orbit'); applyMotion(); refresh();
    document.addEventListener('click', event => { if (openGroup && !dock.contains(event.target) && !popup.contains(event.target)) close(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && openGroup) { event.preventDefault(); close(true); } });
    document.addEventListener('change', event => { if (event.target.matches('select[data-orbit-motion]')) setMotion(event.target.value); });
    window.addEventListener('resize', positionPopup); window.visualViewport?.addEventListener('resize', positionPopup);
    window.addEventListener('resize', () => { settingsSelection = null; scheduleRefresh(); });
    reducedMotion.addEventListener?.('change', applyMotion);
    document.addEventListener('visibilitychange', () => { if (document.hidden) close(); else scheduleRefresh(); });
    new MutationObserver(scheduleRefresh).observe(sidebar, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'aria-disabled', 'aria-hidden', 'class', 'style'] });
    if (account) new MutationObserver(scheduleRefresh).observe(account, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-disabled', 'class', 'style'] });
    new MutationObserver(scheduleRefresh).observe(shell.querySelector('.main'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    new MutationObserver(scheduleRefresh).observe(shell, { attributes: true, attributeFilter: ['style', 'aria-busy'] });
    window.addEventListener('schichtfunk:themechange', () => { stopMotion(); });
  }
  window.SFOrbit = { setMotion, motion: () => motion, effectiveMotion, refresh: scheduleRefresh, close };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
