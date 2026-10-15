/* Orbit presentation layer. Original navigation buttons remain the authority. */
(function () {
  'use strict';
  if (window.SFOrbit) return;
  const KEY = 'sf_orbit_motion_v1';
  const GROUPS = [
    { id: 'overview', label: 'Tagesübersicht', icon: 'home', direct: true, items: [['overview', 'Tagesübersicht']] },
    { id: 'planning', label: 'Planung', icon: 'calendar', items: [['schedule', 'Dienstplan'], ['auto', 'Auto-Planung'], ['wishes', 'Wunschplanung'], ['disruptions', 'Störfallautopilot']] },
    { id: 'personal', label: 'Personal', icon: 'people', items: [['staffing', 'Personalsimulator'], ['handover', 'Schichtübergabe'], ['marketplace', 'Schicht-Marktplatz'], ['employees', 'Mitarbeiter'], ['absence', 'Abwesenheit'], ['time', 'Zeiterfassung']] },
    { id: 'analysis', label: 'Auswertung & Kontrolle', icon: 'chart', items: [['reports', 'Auswertung'], ['audit', 'Audit-Logs']] },
    { id: 'settings', label: 'Einstellungen', icon: 'settings', direct: true, items: [['settings', 'Einstellungen']] }
  ];
  const LABELS = Object.fromEntries(GROUPS.flatMap(group => group.items));
  LABELS.overview = 'Tagesübersicht';
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
  const overviewExpanded = new Map();
  let overviewContext = '';
  let globe = null;
  let siteOrbit = null;
  let statusSelection = 'coverage';
  function selectStatus(key) {
    if (!['present', 'coverage', 'actions'].includes(key)) return;
    statusSelection = key;
    syncStatusHub();
  }
  function syncStatusHub() {
    const root = shell?.querySelector('#sfTodayWorkspace'), hero = root?.querySelector('.sf-orbit-hero');
    if (!hero) return;
    const r = window.SFToday?.getResult?.(), detail = hero.querySelector('.sf-orbit-status-detail');
    const title = hero.querySelector('.sf-orbit-status-title'), description = hero.querySelector('.sf-orbit-status-description'), action = hero.querySelector('[data-orbit-status-open]');
    detail.hidden = !r;
    if (!r) {
      if (title.textContent) title.textContent = '';
      if (description.textContent) description.textContent = '';
      action.disabled = true;
      const control = root.querySelector('#sfTodaySite');
      if (control) {
        control.disabled = true;
        if (control.options.length !== 1 || control.options[0].textContent !== 'Standortdaten nicht verfügbar') control.replaceChildren(new Option('Standortdaten nicht verfügbar', ''));
      }
      return;
    }
    const control = root.querySelector('#sfTodaySite'), shift = root.querySelector('#sfTodayShift');
    if (control) control.disabled = false;
    const scope = control?.selectedOptions[0]?.textContent || 'Alle Standorte';
    const summary = r.summary, values = {
      present: [summary.present == null ? 'Anwesenheit derzeit unbekannt' : summary.present + ' Personen jetzt im Dienst', summary.paused == null ? 'Aktuelle Anwesenheitsdaten sind nicht verfügbar.' : summary.paused + ' davon in Pause · laufende Buchungen einschließlich freier QR-Dienste.', 'Anwesenheit ansehen'],
      coverage: [summary.open + ' offene Planpositionen', 'Veröffentlichte Besetzung gegen Pflichtbedarf · gemeinsame Besetzungen werden standortübergreifend berücksichtigt.', 'Offene Positionen prüfen'],
      actions: [summary.actions + ' Hinweise mit Handlungsbedarf', summary.companyActions ? summary.companyActions + ' davon unternehmensweit · gemeinsame Besetzung separat gekennzeichnet.' : 'Hinweise für die gewählte Standortauswahl · dringende zuerst.', 'Hinweise ansehen']
    };
    const value = values[statusSelection];
    hero.dataset.orbitStatus = statusSelection;
    hero.querySelectorAll('.sf-orbit-overview-metrics [data-td-kpi]').forEach(button => {
      const selected = button.dataset.tdKpi === statusSelection;
      if (button.getAttribute('aria-pressed') !== String(selected)) button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-controls', 'sfOrbitStatusDetail');
    });
    const text = value[0] + ' · ' + scope;
    if (title.textContent !== text) title.textContent = text;
    const note = value[1] + (shift?.value ? ' Schichtfilter: ' + shift.selectedOptions[0].textContent + '.' : '');
    if (description.textContent !== note) description.textContent = note;
    if (action.textContent !== value[2]) action.textContent = value[2];
    action.disabled = statusSelection === 'present' && !r.reliable;
  }
  function createSiteOrbit(art) {
    const host = document.createElement('div'); host.className = 'sf-orbit-sites'; host.setAttribute('role', 'group'); host.setAttribute('aria-label', 'Standorte · Tagesstatus');
    const pins = document.createElement('div'); pins.className = 'sf-orbit-site-pins';
    const info = document.createElement('div'); info.className = 'sf-orbit-site-info'; info.id = 'sfOrbitSiteInfo'; info.hidden = true; info.setAttribute('role', 'tooltip');
    const caption = document.createElement('div'); caption.className = 'sf-orbit-site-caption';
    const label = document.createElement('span'); label.textContent = 'Standorte';
    const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'sf-orbit-site-reset'; reset.setAttribute('aria-label', 'Standortfilter zurücksetzen');
    const previous = document.createElement('button'), next = document.createElement('button'), range = document.createElement('span');
    previous.type = next.type = 'button'; previous.textContent = '‹'; next.textContent = '›'; previous.setAttribute('aria-label', 'Vorherige Standorte'); next.setAttribute('aria-label', 'Weitere Standorte');
    range.className = 'sf-orbit-site-range';
    caption.append(label, reset, previous, range, next); host.append(pins, info, caption); art.append(host);
    let page = 0, signature = '', selected = '', data = null, hovered = '';
    const buttons = new Map();
    function hideInfo() { info.hidden = true; hovered = ''; buttons.forEach(b => b.removeAttribute('aria-describedby')); }
    function showInfo(id) {
      const current = window.SFToday?.getSiteOverview?.(), site = current?.sites.find(s => s.id === id);
      if (!site) { hideInfo(); return; }
      hovered = id; info.replaceChildren();
      const name = document.createElement('strong'); name.textContent = site.name;
      const status = document.createElement('span'); status.className = 'sf-orbit-site-status'; status.dataset.status = site.status; status.textContent = site.label;
      const values = document.createElement('dl');
      for (const [text, value] of [['Jetzt anwesend', site.present ?? '–'], ['Offene Planpositionen', site.open], ['Hinweise', site.actions]]) {
        const term = document.createElement('dt'), number = document.createElement('dd'); term.textContent = text; number.textContent = String(value); values.append(term, number);
      }
      const stamp = document.createElement('small');
      stamp.textContent = 'Datenstand ' + new Intl.DateTimeFormat('de-DE', { timeZone: current.timezone, hour: '2-digit', minute: '2-digit' }).format(new Date(current.asOf)) + ' Uhr' + (!current.fresh ? ' · veraltet' : '') + (current.shift ? ' · ' + current.shift : ' · alle Schichten');
      info.append(name, status, values, stamp); info.hidden = false;
      // Keep the location card beside its trigger and above the fixed navigation.
      const trigger = buttons.get(id)?.getBoundingClientRect();
      if (trigger) {
        info.style.position = 'fixed'; info.style.transform = 'none';
        const size = info.getBoundingClientRect(), gap = 12, lower = (dock?.getBoundingClientRect().top || window.innerHeight) - gap;
        const upper = Math.max(gap, shell?.querySelector('.topbar')?.getBoundingClientRect().bottom || 0);
        const clamp = (value, min, max) => Math.max(min, Math.min(value, Math.max(min, max)));
        let left, top;
        if (trigger.left - size.width - gap >= gap) {
          left = trigger.left - size.width - gap; top = clamp(trigger.top, upper, lower - size.height);
        } else if (trigger.right + size.width + 2 * gap <= window.innerWidth) {
          left = trigger.right + gap; top = clamp(trigger.top, upper, lower - size.height);
        } else {
          left = clamp(trigger.left + trigger.width / 2 - size.width / 2, gap, window.innerWidth - size.width - gap);
          top = trigger.bottom + gap + size.height <= lower ? trigger.bottom + gap : trigger.top - size.height - gap;
          top = clamp(top, upper, lower - size.height);
        }
        info.style.left = left + 'px'; info.style.top = top + 'px';
      }
      buttons.forEach((b, key) => { if (key === id) b.setAttribute('aria-describedby', info.id); else b.removeAttribute('aria-describedby'); });
    }
    function select(id) {
      const current = window.SFToday?.getSiteOverview?.(), control = document.getElementById('sfTodaySite');
      if (!current || !control || id && !current.sites.some(s => s.id === id)) { sync(); return; }
      control.value = id; control.dispatchEvent(new Event('change', { bubbles: true }));
    }
    reset.addEventListener('click', () => { hideInfo(); select(''); });
    previous.addEventListener('click', () => { page = Math.max(0, page - 1); signature = ''; hideInfo(); sync(); });
    next.addEventListener('click', () => { page++; signature = ''; hideInfo(); sync(); });
    host.addEventListener('keydown', event => { if (event.key === 'Escape') { hideInfo(); event.stopPropagation(); } });
    function sync() {
      const current = window.SFToday?.getSiteOverview?.();
      if (!current) {
        if (signature === 'unavailable') return;
        data = null; signature = 'unavailable'; pins.replaceChildren(); buttons.clear(); hideInfo();
        reset.textContent = 'Standortdaten fehlen'; reset.disabled = true;
        previous.hidden = next.hidden = range.hidden = true; return;
      }
      const nextSignature = JSON.stringify(current);
      if (signature === nextSignature) return;
      data = current; signature = nextSignature;
      if (selected !== data.selected) { const index = data.sites.findIndex(s => s.id === data.selected); if (index >= 0) page = Math.floor(index / 6); selected = data.selected; }
      page = Math.min(page, Math.max(0, Math.ceil(data.sites.length / 6) - 1));
      const shown = data.sites.slice(page * 6, page * 6 + 6), keep = new Set(shown.map(s => s.id));
      buttons.forEach((button, id) => { if (!keep.has(id)) { button.remove(); buttons.delete(id); } });
      shown.forEach((site, index) => {
        let button = buttons.get(site.id);
        if (!button) {
          button = document.createElement('button'); button.type = 'button'; button.className = 'sf-orbit-site-pin'; button.dataset.orbitSite = site.id;
          const dot = document.createElement('span'); dot.className = 'sf-orbit-site-light'; dot.setAttribute('aria-hidden', 'true'); button.append(dot);
          button.addEventListener('pointerenter', () => showInfo(site.id)); button.addEventListener('focus', () => showInfo(site.id));
          button.addEventListener('pointerleave', () => { if (document.activeElement !== button) hideInfo(); });
          button.addEventListener('blur', () => hideInfo()); button.addEventListener('click', () => { select(site.id); showInfo(site.id); });
          buttons.set(site.id, button); pins.append(button);
        }
        const angle = (-135 + index * 360 / Math.max(2, shown.length)) * Math.PI / 180;
        button.style.left = (50 + Math.cos(angle) * 42) + '%'; button.style.top = (50 + Math.sin(angle) * 42) + '%';
        button.dataset.status = site.status; button.firstElementChild.textContent = String(page * 6 + index + 1);
        button.setAttribute('aria-label', site.name + ' · ' + site.label + ' · Tagesübersicht filtern'); button.setAttribute('aria-pressed', String(site.id === data.selected));
      });
      const active = data.sites.find(s => s.id === data.selected);
      reset.textContent = active ? active.name : data.selected === 'unassigned' ? 'Ohne Zuordnung' : data.sites.length ? 'Alle Standorte' : 'Keine Standorte';
      reset.title = data.selected ? 'Standortfilter zurücksetzen' : 'Lichtpunkt auswählen'; reset.disabled = !data.selected;
      previous.hidden = next.hidden = range.hidden = data.sites.length <= 6; previous.disabled = page === 0; next.disabled = (page + 1) * 6 >= data.sites.length;
      range.textContent = (page * 6 + 1) + '–' + Math.min((page + 1) * 6, data.sites.length) + ' / ' + data.sites.length;
      if (hovered && keep.has(hovered)) showInfo(hovered); else hideInfo();
    }
    return { sync, dismissOutside(target) { if (!host.contains(target)) hideInfo(); }, reset() { page = 0; selected = ''; signature = ''; hideInfo(); } };
  }
  function createGlobe(art) {
    globe?.dispose();
    const canvas = document.createElement('canvas'); canvas.className = 'sf-orbit-globe'; canvas.setAttribute('aria-hidden', 'true');
    art.prepend(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // Original, deliberately simplified continent silhouettes for a decorative globe.
    // Coordinates are longitude/latitude, independent of company or employee data.
    const continents = [
      [[-168,71],[-145,70],[-130,58],[-124,49],[-123,39],[-115,30],[-105,23],[-97,17],[-89,16],[-83,9],[-77,8],[-86,22],[-81,25],[-80,32],[-70,45],[-59,49],[-65,58],[-81,63],[-94,71],[-111,73],[-133,69]],
      [[-81,12],[-70,11],[-61,7],[-51,4],[-35,-6],[-39,-17],[-46,-24],[-53,-34],[-66,-55],[-73,-49],[-75,-30],[-70,-18],[-81,-5]],
      [[-53,60],[-43,60],[-23,72],[-20,81],[-42,84],[-61,77]],
      [[-17,36],[-5,36],[10,37],[24,32],[33,31],[36,22],[44,12],[51,11],[43,0],[40,-12],[32,-27],[18,-35],[11,-28],[8,-8],[-1,5],[-15,11],[-17,23]],
      [[-10,36],[-9,43],[-1,46],[-5,50],[7,54],[5,59],[11,71],[25,71],[31,61],[43,68],[61,69],[80,73],[109,77],[140,72],[178,66],[174,52],[151,59],[140,48],[130,42],[124,32],[120,23],[108,19],[105,9],[100,1],[96,7],[92,22],[81,8],[74,18],[66,24],[58,25],[51,30],[43,12],[35,17],[34,30],[27,41],[24,37],[19,40],[16,46],[9,44],[4,43]],
      [[-8,50],[-6,58],[0,59],[2,52]], [[-11,51],[-8,55],[-6,54],[-6,51]],
      [[47,-13],[50,-17],[48,-25],[44,-25],[43,-17]],
      [[113,-22],[115,-34],[130,-35],[138,-38],[151,-33],[154,-24],[146,-16],[135,-12],[126,-15],[122,-18]],
      [[130,31],[135,34],[141,41],[145,44],[143,37],[138,34]],
      [[95,5],[104,-2],[106,-6],[101,-4]], [[106,-6],[115,-8],[114,-9],[106,-8]],
      [[119,0],[125,2],[127,-4],[120,-5]], [[131,-3],[141,-3],[151,-7],[145,-10],[136,-8]],
      [[166,-34],[179,-38],[173,-47],[167,-46],[172,-40]]
    ];
    function onLand(x, y) {
      return continents.some(polygon => {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
          const a = polygon[i], b = polygon[j];
          if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
        }
        return inside;
      });
    }
    const rad = Math.PI / 180, points = [];
    for (let lat = -57; lat <= 82; lat += 2.3) {
      const step = 2.3 / Math.max(.24, Math.cos(lat * rad));
      for (let lon = -180; lon < 180; lon += step) {
        if (!onLand(lon, lat)) continue;
        const seed = (Math.sin(lon * 12.9898 + lat * 78.233) * 43758.5453) % 1;
        points.push({ lon: lon * rad, sin: Math.sin(lat * rad), cos: Math.cos(lat * rad), phase: Math.abs(seed) * Math.PI * 2, lit: Math.abs(seed) > .76 });
      }
    }
    let raf = 0, previous = 0, elapsed = 0, angle = -14 * rad, inView = true, disposed = false, light = false;
    const tilt = 18 * rad, sinTilt = Math.sin(tilt), cosTilt = Math.cos(tilt);
    function project(lon, sin, cos) {
      const delta = lon - angle, z = cos * Math.cos(delta);
      return { x: 210 + 151 * cos * Math.sin(delta), y: 210 - 151 * (sin * cosTilt - z * sinTilt), z: sin * sinTilt + z * cosTilt };
    }
    function draw() {
      ctx.clearRect(0, 0, 420, 420);
      const atmosphere = ctx.createRadialGradient(210, 210, 142, 210, 210, 177);
      atmosphere.addColorStop(0, 'transparent'); atmosphere.addColorStop(.28, light ? '#6254cb26' : '#39dfff26'); atmosphere.addColorStop(1, 'transparent');
      ctx.fillStyle = atmosphere; ctx.fillRect(0, 0, 420, 420);
      const ocean = ctx.createRadialGradient(165, 145, 12, 235, 225, 176);
      ocean.addColorStop(0, light ? '#253b70' : '#124960'); ocean.addColorStop(.65, light ? '#102244' : '#082b40'); ocean.addColorStop(1, '#020b1a');
      ctx.fillStyle = ocean; ctx.beginPath(); ctx.arc(210, 210, 151, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.clip();
      // Project latitude and longitude guides onto the same sphere as the lights.
      ctx.strokeStyle = light ? '#8e96e918' : '#5bcae21a'; ctx.lineWidth = .65;
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath(); let connected = false;
        for (let lon = -180; lon <= 180; lon += 3) {
          const p = project(lon * rad, Math.sin(lat * rad), Math.cos(lat * rad));
          if (p.z <= 0) { connected = false; continue; }
          if (connected) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); connected = true;
        }
        ctx.stroke();
      }
      for (let lon = -180; lon < 180; lon += 30) {
        ctx.beginPath(); let connected = false;
        for (let lat = -90; lat <= 90; lat += 3) {
          const p = project(lon * rad, Math.sin(lat * rad), Math.cos(lat * rad));
          if (p.z <= 0) { connected = false; continue; }
          if (connected) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); connected = true;
        }
        ctx.stroke();
      }
      for (const point of points) {
        const p = project(point.lon, point.sin, point.cos); if (p.z <= .015) continue;
        const pulse = .55 + .45 * Math.sin(elapsed / 1700 + point.phase);
        const alpha = Math.min(1, p.z * 3) * (point.lit ? .45 + .55 * pulse : .42);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = point.lit ? '#c8f7ff' : light ? '#899adc' : '#38bfd4';
        ctx.beginPath(); ctx.arc(p.x, p.y, point.lit ? 1.15 : .82, 0, Math.PI * 2); ctx.fill();
        if (point.lit) {
          ctx.globalAlpha = alpha * .2; ctx.fillStyle = light ? '#c7c0ff' : '#67e8ff';
          ctx.beginPath(); ctx.arc(p.x, p.y, 3.6, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      const shade = ctx.createLinearGradient(65, 110, 365, 300);
      shade.addColorStop(0, 'transparent'); shade.addColorStop(.6, '#01061308'); shade.addColorStop(1, '#010613ad');
      ctx.fillStyle = shade; ctx.fillRect(0, 0, 420, 420); ctx.restore();
      ctx.strokeStyle = light ? '#a4a6ed99' : '#6ae5f38c'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(210, 210, 151, 0, Math.PI * 2); ctx.stroke();
    }
    function running() { return !disposed && art.isConnected && inView && !document.hidden && ready() && activeView() === 'overview' && effectiveMotion() !== 'off'; }
    function tick(time) {
      raf = 0; if (!running()) { previous = 0; return; }
      const interval = effectiveMotion() === 'subtle' ? 80 : 40;
      if (!previous) previous = time;
      if (time - previous >= interval) {
        const delta = Math.min(time - previous, 100); previous = time; elapsed += delta;
        if (effectiveMotion() === 'full') angle += delta * Math.PI * 2 / 160000;
        draw();
      }
      raf = requestAnimationFrame(tick);
    }
    function sync() {
      if (disposed) return;
      light = document.documentElement.dataset.sfTheme === 'light';
      const size = Math.max(1, Math.round(art.getBoundingClientRect().width * Math.min(window.devicePixelRatio || 1, 2)));
      if (canvas.width !== size) { canvas.width = size; canvas.height = size; ctx.setTransform(size / 420, 0, 0, size / 420, 0, 0); }
      draw();
      if (running()) { if (!raf) { previous = 0; raf = requestAnimationFrame(tick); } }
      else { cancelAnimationFrame(raf); raf = 0; previous = 0; }
    }
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null; resize?.observe(art);
    const intersection = typeof IntersectionObserver === 'function' ? new IntersectionObserver(items => { inView = items[0].isIntersecting; sync(); }) : null; intersection?.observe(art);
    return { sync, dispose() { disposed = true; cancelAnimationFrame(raf); resize?.disconnect(); intersection?.disconnect(); } };
  }
  function rememberOverview() {
    shell?.querySelectorAll('#view-overview details[data-orbit-detail]').forEach(detail => overviewExpanded.set(detail.dataset.orbitDetail, detail.open));
  }
  function overviewDetail(element, key, label) {
    if (!element) return null;
    if (element.parentElement.matches('details[data-orbit-detail]')) return element.parentElement;
    const existing = element.closest('#view-overview')?.querySelector('details[data-orbit-detail="' + key + '"]');
    if (existing) { existing.append(element); return existing; }
    const detail = document.createElement('details'); detail.className = 'sf-orbit-overview-details'; detail.dataset.orbitDetail = key;
    const summary = document.createElement('summary'); summary.textContent = label;
    detail.open = !!overviewExpanded.get(key); element.before(detail); detail.append(summary, element);
    const companyContext = overviewContext;
    detail.addEventListener('toggle', () => { if (detail.isConnected && companyContext === overviewContext) overviewExpanded.set(key, detail.open); });
    return detail;
  }
  function refreshOverview() {
    const root = shell?.querySelector('#sfTodayWorkspace');
    if (!root) return;
    const B = backend(), next = [B.companyId || '', B.user?.id || '', B.role || ''].join('|');
    if (next !== overviewContext) { overviewContext = next; overviewExpanded.clear(); siteOrbit?.reset(); statusSelection = 'coverage'; }
    root.dataset.orbitOverviewActive = String(activeView() === 'overview' && !document.hidden && ready());
    let hero = root.querySelector('.sf-orbit-hero');
    if (!hero) {
      const head = root.querySelector('.sf-td-head'); if (!head) return;
      hero = document.createElement('section'); hero.className = 'sf-orbit-hero'; hero.setAttribute('aria-label', 'SchichtFunk Tagesübersicht');
      head.before(hero); head.classList.add('sf-orbit-hero-copy'); hero.append(head);
      const art = document.createElement('div'); art.className = 'sf-orbit-emblem';
      art.innerHTML = '<svg viewBox="0 0 420 420" fill="none"><defs><linearGradient id="sfOrbitArc" x1="0" y1="0" x2="420" y2="420" gradientUnits="userSpaceOnUse"><stop stop-color="currentColor" stop-opacity=".08"/><stop offset=".45" stop-color="currentColor"/><stop offset="1" stop-color="currentColor" stop-opacity=".1"/></linearGradient></defs><circle cx="210" cy="210" r="190" stroke="currentColor" opacity=".1" stroke-dasharray="1 10"/><g class="sf-orbit-orbit-track"><ellipse cx="210" cy="210" rx="192" ry="166" transform="rotate(-32 210 210)" stroke="url(#sfOrbitArc)" stroke-width="1"/><circle cx="48" cy="311" r="3" fill="currentColor"/><circle cx="371" cy="109" r="2" fill="currentColor"/></g></svg>';
      const metrics = document.createElement('div'); metrics.className = 'sf-orbit-overview-metrics'; metrics.setAttribute('aria-label', 'Zentrale Tageskennzahlen');
      const content = document.createElement('div'); content.className = 'sf-orbit-hero-content'; content.append(head, metrics);
      const scope = document.createElement('div'); scope.className = 'sf-orbit-status-scope';
      const hub = document.createElement('div'); hub.className = 'sf-orbit-status-hub'; hub.append(art, metrics);
      const floor = document.createElement('div'); floor.className = 'sf-orbit-status-floor'; floor.setAttribute('aria-hidden', 'true'); hub.append(floor);
      const detail = document.createElement('div'); detail.id = 'sfOrbitStatusDetail'; detail.className = 'sf-orbit-status-detail'; detail.hidden = true;
      const copy = document.createElement('div'); copy.setAttribute('aria-live', 'polite');
      const heading = document.createElement('h2'); heading.className = 'sf-orbit-status-title';
      const description = document.createElement('p'); description.className = 'sf-orbit-status-description'; copy.append(heading, description);
      const action = document.createElement('button'); action.type = 'button'; action.dataset.orbitStatusOpen = '';
      action.addEventListener('click', () => window.SFToday?.openMetric?.(statusSelection)); detail.append(copy, action);
      hero.append(content, scope, hub, detail);
      globe = createGlobe(art);
      art.querySelector('svg').setAttribute('aria-hidden', 'true');
      siteOrbit = createSiteOrbit(art);
    }
    const siteLabel = root.querySelector('#sfTodaySite')?.closest('label'), scope = hero.querySelector('.sf-orbit-status-scope');
    if (siteLabel && siteLabel.parentElement !== scope) scope.append(siteLabel);
    globe?.sync();
    siteOrbit?.sync();
    const metrics = hero.querySelector('.sf-orbit-overview-metrics');
    if (!window.SFToday?.getResult?.()) { if (metrics.childElementCount) metrics.replaceChildren(); syncStatusHub(); return; }
    const view = root.closest('#view-overview');
    const legacy = view.querySelector('#sfLegacyReviewCard'), legacyCount = legacy?.querySelector('.badge')?.textContent.trim() || '0';
    const legacyDetail = overviewDetail(legacy, 'legacy', 'Altbestand prüfen · ' + legacyCount);
    if (legacyDetail) {
      const text = 'Altbestand prüfen · ' + legacyCount;
      if (legacyDetail.firstElementChild.textContent !== text) legacyDetail.firstElementChild.textContent = text;
      if (Number(legacyCount) > 0) legacyDetail.open = true;
    }
    const market = view.querySelector('#sfMarketManager');
    const marketDetail = overviewDetail(market, 'market', 'Schicht-Marktplatz');
    if (marketDetail) {
      const text = 'Schicht-Marktplatz · ' + (market?.querySelector('.sf-market-count')?.textContent.trim() || 'Übersicht');
      if (marketDetail.firstElementChild.textContent !== text) marketDetail.firstElementChild.textContent = text;
    }
    const handover = view.querySelector('#sfHandoverToday');
    const handoverDetail = overviewDetail(handover, 'handover', 'Schichtübergabe');
    if (handoverDetail && Number(handover?.querySelector('p')?.textContent.match(/(\d+) kritisch/)?.[1]) > 0) handoverDetail.open = true;
    const filters = overviewDetail(root.querySelector('.sf-td-filters'), 'filters', 'Standort & Schicht');
    if (filters) {
      const site = root.querySelector('#sfTodaySite'), shift = root.querySelector('#sfTodayShift');
      const text = 'Filter · ' + (site?.selectedOptions[0]?.textContent || 'Alle Standorte') + ' · ' + (shift?.value ? shift.selectedOptions[0]?.textContent : 'Alle Schichten');
      if (filters.firstElementChild.textContent !== text) filters.firstElementChild.textContent = text;
    }
    const kpis = root.querySelector('.sf-td-kpis');
    if (kpis && !kpis.dataset.orbitPrepared) {
      metrics.replaceChildren(...['present', 'coverage', 'actions'].map(key => kpis.querySelector('[data-td-kpi="' + key + '"]')).filter(Boolean));
      kpis.dataset.orbitPrepared = 'true'; const figures = overviewDetail(kpis, 'figures', 'Weitere Tageszahlen');
      root.querySelector('.sf-td-layout')?.after(figures);
    }
    const aside = root.querySelector('.sf-td-aside'), actions = root.querySelector('#sfTodayActions');
    if (aside && actions?.parentElement !== aside) aside.prepend(actions);
    overviewDetail(root.querySelector('#sfTodayTransitions'), 'transitions', 'Schichtwechsel · nächste 2 Stunden');
    const coverage = overviewDetail(root.querySelector('#sfTodayCoverage'), 'coverage', 'Besetzung je Schicht');
    overviewDetail(root.querySelector('.sf-td-shortcuts')?.closest('.sf-td-panel'), 'shortcuts', 'Weitere Aktionen');
    syncStatusHub();
  }

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
    const trigger = buttons.get(openGroup), anchor = trigger.getBoundingClientRect(), dockBounds = dock.getBoundingClientRect();
    const width = Math.min(296, window.innerWidth - 24);
    const left = Math.max(12, Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - width - 12));
    popup.style.width = width + 'px'; popup.style.left = left + 'px';
    popup.style.bottom = Math.max(12, window.innerHeight - dockBounds.top + 10) + 'px';
    popup.style.setProperty('--orbit-pointer', Math.max(18, Math.min(anchor.left + anchor.width / 2 - left, width - 18)) + 'px');
    popup.style.maxHeight = Math.max(80, dockBounds.top - 22) + 'px';
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
    button.click();
    if (activeView() === view) {
      // Mobile guardrails make body a separate scroll container, alongside main.
      [shell, shell.querySelector('.main'), document.body, document.documentElement].forEach(element => element?.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
    scheduleRefresh();
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
    globe?.sync();
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
    refreshOverview();
    document.body.classList.toggle('sf-orbit-manager', ready() && shell.style.display !== 'none');
    GROUPS.forEach(group => {
      const button = buttons.get(group.id), isCurrent = group.items.some(([view]) => view === active);
      const enabled = ready() && availableItems(group).some(([view]) => allowed(source(view)));
      if (button.disabled !== !enabled) button.disabled = !enabled;
      button.classList.toggle('is-current', isCurrent);
      if (isCurrent) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
      const detail = button.querySelector('small');
      const label = isCurrent && !group.direct ? LABELS[active] : '';
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
      if (!group.direct) { button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', 'sfOrbitPopup'); button.append(icon('arrow')); button.addEventListener('click', () => reveal(group)); }
      else button.addEventListener('click', () => activate(group.items[0][0]));
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
    document.addEventListener('pointerdown', event => siteOrbit?.dismissOutside(event.target));
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && openGroup) { event.preventDefault(); close(true); } });
    document.addEventListener('change', event => { if (event.target.matches('select[data-orbit-motion]')) setMotion(event.target.value); });
    window.addEventListener('resize', positionPopup); window.visualViewport?.addEventListener('resize', positionPopup);
    window.addEventListener('resize', () => { settingsSelection = null; scheduleRefresh(); });
    reducedMotion.addEventListener?.('change', applyMotion);
    document.addEventListener('visibilitychange', () => { globe?.sync(); if (document.hidden) close(); else scheduleRefresh(); });
    new MutationObserver(scheduleRefresh).observe(sidebar, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'aria-disabled', 'aria-hidden', 'class', 'style'] });
    if (account) new MutationObserver(scheduleRefresh).observe(account, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-disabled', 'class', 'style'] });
    new MutationObserver(scheduleRefresh).observe(shell.querySelector('.main'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    new MutationObserver(scheduleRefresh).observe(shell, { attributes: true, attributeFilter: ['style', 'aria-busy'] });
    window.addEventListener('schichtfunk:themechange', () => { stopMotion(); globe?.sync(); });
  }
  window.SFOrbit = { setMotion, motion: () => motion, effectiveMotion, refresh: scheduleRefresh, refreshOverview, rememberOverview, selectStatus, close };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
