/* Shared personal inbox for administration and employee portals. */
(function () {
  'use strict';
  const B = window.SFBackend = window.SFBackend || {};
  if (B.messages) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const envelope = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg>';
  const roleNames = {OWNER:'Inhaber',ADMIN:'Administrator',TEAM_LEAD:'Teamleiter',EMPLOYEE:'Mitarbeiter'};
  const date = value => new Date(value).toLocaleString('de-DE', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  let context = '', generation = 0, modal, opener, contacts = [], conversations = [], unread = 0;
  let peer = '', thread = [], hasOlder = false, showContacts = false, search = '', threadVersion = 0, modalVersion = 0;
  let inboxBusy = false, threadBusy = false, olderBusy = false, countBusy = false, sending = false, lastRefresh = 0;
  const drafts = new Map(), retries = new Map();
  function identity() {
    if (!B.ready || !B.user?.id || !B.companyId || B.companySwitching || B.client?.__sfDemoLocalClientV1) return '';
    if (B.role === 'TIME_TRACKING' && !B.employeeDbId) return '';
    return B.user.id + ':' + B.companyId;
  }
  function current(key, epoch) { return identity() === key && context === key && generation === epoch; }
  function close() {
    modalVersion++;threadVersion++;modal?.remove();modal = null;
    inboxBusy = threadBusy = olderBusy = false;
    document.querySelectorAll('.sf-message-launch').forEach(b => b.setAttribute('aria-expanded','false'));
    if (opener?.isConnected) opener.focus({preventScroll:true});
  }
  function reset() {
    generation++;close();contacts = [];conversations = [];thread = [];peer = '';unread = 0;search = '';showContacts = false;
    drafts.clear();retries.clear();inboxBusy = threadBusy = olderBusy = countBusy = sending = false;lastRefresh = 0;
    document.querySelectorAll('.sf-message-launch').forEach(b => b.remove());
  }
  function sync() {
    const next = identity();
    if (next !== context) { reset();context = next; }
    if (!context) return;
    for (const host of document.querySelectorAll('.topbar .top-actions,#sfEmployeePortal .sf-portal-top')) {
      if (host.querySelector('.sf-message-launch')) continue;
      const button = document.createElement('button');button.type = 'button';button.className = 'ghost sf-message-launch';
      button.innerHTML = envelope + '<span class="sf-message-launch-label">Nachrichten</span><span class="sf-message-badge" hidden></span>';
      button.title = 'Nachrichten';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded',String(!!modal));button.setAttribute('aria-controls','sfMessages');
      button.onclick = () => open(button);
      const logout = host.querySelector('#sfEmployeeLogout');logout ? logout.before(button) : host.prepend(button);
    }
    badge();
  }
  function badge() {
    document.querySelectorAll('.sf-message-launch').forEach(button => {
      const count = button.querySelector('.sf-message-badge');count.hidden = unread === 0;count.textContent = unread > 99 ? '99+' : String(unread);
      button.setAttribute('aria-label', 'Nachrichten' + (unread ? `, ${unread} ungelesen` : ''));
    });
  }
  async function rpc(name, args, key = context, epoch = generation) {
    const result = await B.client.rpc(name, {p_company_id:key.split(':')[1],...args});
    if (!current(key,epoch)) throw Object.assign(new Error('STALE'), {stale:true});
    if (result.error) throw result.error;
    return result.data;
  }
  function friendly(error) {
    const text = String(error?.message || error || '');
    if (/MESSAGE_RECIPIENT_UNAVAILABLE/.test(text)) return 'Dieser Zugang ist nicht mehr erreichbar. Bitte wähle eine andere Person.';
    if (/MESSAGE_ACCESS_DENIED|JWT|session/i.test(text)) return 'Der Nachrichtenbereich ist für diesen Zugang gerade nicht verfügbar. Bitte erneut anmelden.';
    if (/MESSAGE_RATE_LIMIT/.test(text)) return 'Bitte warte einen Moment, bevor du weitere Nachrichten sendest.';
    if (/MESSAGE_INVALID_BODY/.test(text)) return 'Bitte gib 1 bis 2.000 Zeichen ein.';
    if (/PGRST202|does not exist|schema cache/i.test(text)) return 'Der Nachrichtenbereich wird vorbereitet und ist noch nicht freigeschaltet.';
    return 'Verbindung fehlgeschlagen. Bitte versuche es erneut.';
  }
  function status(message, bad = false) {
    const node = modal?.querySelector('.sf-msg-status');if (!node) return;
    node.textContent = message;node.classList.toggle('is-error',bad);
  }
  function sendStatus(message, bad = false) {
    const node = modal?.querySelector('.sf-msg-send-status');if (!node) return;
    node.hidden = !message;node.textContent = message;node.classList.toggle('is-error',bad);
  }
  function contact(id) { return contacts.find(c => c.user_id === id); }
  function person(id) { return contact(id)?.display_name || 'Ehemaliger Zugang'; }
  function renderList() {
    if (!modal) return;
    const needle = search.trim().toLocaleLowerCase('de'), all = showContacts || !!needle;
    const ids = all ? contacts.map(c => c.user_id) : conversations.map(c => c.peer_id);
    const items = ids.filter(id => person(id).toLocaleLowerCase('de').includes(needle));
    modal.querySelector('.sf-msg-list-title').textContent = all ? 'Kontakte' : 'Gespräche';
    modal.querySelector('[data-msg-action="contacts"]').textContent = showContacts ? 'Gespräche' : '+ Neue Nachricht';
    const html = items.map(id => {
      const c = contact(id), last = conversations.find(x => x.peer_id === id), count = Number(last?.unread || 0);
      return `<button type="button" class="sf-msg-person ${id === peer ? 'is-active' : ''}" data-msg-peer="${esc(id)}" aria-pressed="${id === peer}"><span class="sf-msg-avatar" aria-hidden="true">${esc(person(id).slice(0,1).toLocaleUpperCase('de'))}</span><span class="sf-msg-person-copy"><b>${esc(person(id))}</b><small>${esc(all ? (roleNames[c?.access_role] || 'Mitarbeiter') : ((last?.sender_id === B.user.id ? 'Du: ' : '') + (last?.body || 'Neue Unterhaltung')).slice(0,85))}</small></span>${count ? `<span class="sf-msg-count" aria-label="${count} ungelesen">${count > 99 ? '99+' : count}</span>` : ''}</button>`;
    }).join('') || `<p class="sf-msg-empty">${needle ? 'Keine Person gefunden.' : all ? 'Keine weiteren aktiven persönlichen Zugänge vorhanden.' : 'Noch keine Gespräche. Wähle „Neue Nachricht“, um jemanden anzuschreiben.'}</p>`;
    const list = modal.querySelector('.sf-msg-people');if (list.innerHTML !== html) list.innerHTML = html;
  }
  function renderThread(scroll = false) {
    if (!modal) return;
    modal.querySelector('.sf-msg-thread-name').textContent = peer ? person(peer) : 'Deine Nachrichten';
    modal.querySelector('.sf-msg-thread-note').textContent = peer ? (roleNames[contact(peer)?.access_role] || 'Zugang nicht mehr aktiv') : 'Wähle eine Person oder beginne ein Gespräch.';
    modal.querySelector('.sf-msg-compose').hidden = !peer || !contact(peer);
    const older = modal.querySelector('[data-msg-action="older"]');older.hidden = !hasOlder || !peer;older.disabled = olderBusy;
    const log = modal.querySelector('.sf-msg-log'), nearEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 100;
    const html = thread.map(m => `<article class="sf-msg-bubble ${m.sender_id === B.user.id ? 'is-own' : ''}" data-msg-id="${esc(m.id)}"><p>${esc(m.body)}</p><time datetime="${esc(m.created_at)}">${m.sender_id === B.user.id ? 'Du · ' : ''}${esc(date(m.created_at))}</time></article>`).join('') || `<p class="sf-msg-empty">${peer ? 'Hier beginnt euer Gespräch.' : 'Direkte Nachrichten innerhalb deines Unternehmens. Nur ihr beide könnt den Inhalt lesen.'}</p>`;
    if (log.innerHTML !== html) { log.innerHTML = html;if (scroll || nearEnd) log.scrollTop = log.scrollHeight; }
    composeState();
  }
  function composeState() {
    if (!modal) return;
    const input = modal.querySelector('textarea'), button = modal.querySelector('[type="submit"]');
    modal.querySelector('.sf-msg-length').textContent = `${input.value.length.toLocaleString('de-DE')} / 2.000`;
    input.disabled = sending;button.disabled = sending || !peer || !input.value.trim() || input.value.length > 2000;
    button.textContent = sending ? 'Wird gesendet …' : 'Senden';
  }
  async function loadInbox() {
    if (!modal || inboxBusy) return;
    const key = context, epoch = generation, version = modalVersion;inboxBusy = true;
    try {
      const [people, inbox] = await Promise.all([rpc('messages_contacts',{},key,epoch),rpc('messages_inbox',{},key,epoch)]);
      if (!modal || version !== modalVersion || !current(key,epoch)) return;
      contacts = people || [];conversations = inbox?.conversations || [];unread = Number(inbox?.unread || 0);badge();renderList();renderThread();
      status('Nur persönliche Nachrichten · automatisch aktualisiert');
    } catch (error) { if (!error.stale && version === modalVersion) status(friendly(error),true); }
    finally { if (current(key,epoch) && version === modalVersion) inboxBusy = false; }
  }
  async function markVisibleRead() {
    if (!modal || document.hidden || !peer || (matchMedia('(max-width: 640px)').matches && modal.dataset.chat !== 'true')) return;
    const key = context, epoch = generation, version = threadVersion, selected = peer;
    const ids = thread.filter(m => m.recipient_id === B.user.id && !m.read_at).slice(-50).map(m => m.id);
    if (!ids.length) return;
    try {
      await rpc('messages_mark_read',{p_message_ids:ids},key,epoch);
      if (!modal || version !== threadVersion || peer !== selected) return;
      thread.forEach(m => { if (ids.includes(m.id)) m.read_at = new Date().toISOString(); });
      await loadInbox();
    } catch (error) { if (!error.stale && version === threadVersion) status('Lesestatus konnte nicht gespeichert werden. Er wird erneut versucht.',true); }
  }
  async function loadThread(older = false) {
    if (!modal || !peer || threadBusy || olderBusy) return;
    const key = context, epoch = generation, version = threadVersion, selected = peer, oldest = thread[0];
    if (older) olderBusy = true;else threadBusy = true;
    renderThread();
    try {
      const rows = await rpc('messages_thread',{p_peer_id:selected,p_before_at:older ? oldest?.created_at : null,p_before_id:older ? oldest?.id : null},key,epoch);
      if (!modal || version !== threadVersion || selected !== peer) return;
      const log = modal.querySelector('.sf-msg-log'), height = log.scrollHeight, top = log.scrollTop;
      const merged = new Map(thread.map(m => [m.id,m]));(rows || []).forEach(m => merged.set(m.id,m));
      thread = [...merged.values()].sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
      if (older || thread.length <= 50) hasOlder = (rows || []).length === 50;
      renderThread(!older && height <= log.clientHeight);
      if (older) log.scrollTop = top + log.scrollHeight - height;
      status('Nur ihr beide könnt den Inhalt lesen.');
      await markVisibleRead();
    } catch (error) { if (!error.stale && version === threadVersion) status(friendly(error),true); }
    finally { if (current(key,epoch) && version === threadVersion) { threadBusy = olderBusy = false;renderThread(); } }
  }
  function selectPeer(id) {
    if (sending) return;
    if (peer) drafts.set(peer,modal.querySelector('textarea').value);
    peer = id;threadVersion++;threadBusy = olderBusy = false;thread = [];hasOlder = false;
    modal.dataset.chat = 'true';modal.querySelector('textarea').value = drafts.get(peer) || '';renderList();renderThread();
    sendStatus('');
    status('Gespräch wird geladen …');
    loadThread();
    const focusTarget = matchMedia('(max-width: 640px)').matches ? '[data-msg-action="back"]' : 'textarea';
    modal.querySelector(focusTarget).focus();
  }
  async function send(event) {
    event.preventDefault();sync();if (!modal || sending || !peer) return;
    const input = modal.querySelector('textarea'), body = input.value.trim();if (!body || input.value.length > 2000) return;
    const key = context, epoch = generation, selected = peer, version = modalVersion;
    let request = retries.get(selected);
    if (!request || request.body !== body) { request = {id:crypto.randomUUID(),body};retries.set(selected,request); }
    sending = true;composeState();sendStatus('Nachricht wird gesendet …');
    try {
      const sentId = await rpc('messages_send',{p_recipient_id:selected,p_body:body,p_client_message_id:request.id},key,epoch);
      if (!current(key,epoch)) return;
      drafts.delete(selected);retries.delete(selected);
      if (!modal || version !== modalVersion || peer !== selected) return;
      input.value = '';sendStatus('Nachricht gesendet.');
      if (!thread.some(m => m.id === sentId)) thread.push({id:sentId,sender_id:B.user.id,recipient_id:selected,body,created_at:new Date().toISOString(),read_at:null});
      renderThread(true);
      await Promise.all([loadInbox(),loadThread()]);
    } catch (error) { if (!error.stale && version === modalVersion) sendStatus('Senden konnte nicht bestätigt werden. ' + friendly(error) + ' Dein Text bleibt erhalten.',true); }
    finally { if (current(key,epoch)) { sending = false;composeState(); } }
  }
  function open(button) {
    sync();if (!context) return;if (modal) { modal.querySelector('[data-msg-action="close"]').focus();return; }
    opener = button || document.activeElement;modalVersion++;peer = '';thread = [];search = '';showContacts = false;hasOlder = false;
    modal = document.createElement('div');modal.id = 'sfMessages';modal.className = 'sf-msg-backdrop';
    modal.innerHTML = `<section class="sf-msg-dialog" role="dialog" aria-modal="true" aria-labelledby="sfMessagesTitle" tabindex="-1"><header class="sf-msg-head"><span class="sf-msg-head-icon">${envelope}</span><div><h2 id="sfMessagesTitle">Nachrichten</h2><p>Direkt miteinander in Verbindung</p></div><button type="button" data-msg-action="close" aria-label="Nachrichten schließen">✕</button></header><div class="sf-msg-body"><aside class="sf-msg-sidebar" aria-label="Gespräche und Kontakte"><div class="sf-msg-list-head"><b class="sf-msg-list-title">Gespräche</b><button type="button" data-msg-action="contacts">+ Neue Nachricht</button></div><label class="sf-msg-search"><span class="sf-msg-sr">Person suchen</span><input type="search" placeholder="Person suchen …" autocomplete="off"></label><div class="sf-msg-people"><p class="sf-msg-empty">Gespräche werden geladen …</p></div></aside><section class="sf-msg-thread" aria-label="Gespräch"><header class="sf-msg-thread-head"><button type="button" data-msg-action="back" aria-label="Zurück zu den Gesprächen">‹</button><div><h3 class="sf-msg-thread-name">Deine Nachrichten</h3><small class="sf-msg-thread-note"></small></div></header><button type="button" class="sf-msg-older" data-msg-action="older" hidden>Ältere Nachrichten laden</button><div class="sf-msg-log" aria-label="Nachrichtenverlauf" tabindex="0"></div><form class="sf-msg-compose" hidden><label for="sfMessageText">Deine Nachricht</label><textarea id="sfMessageText" rows="3" maxlength="2000" placeholder="Nachricht schreiben …"></textarea><p class="sf-msg-send-status" role="status" aria-live="polite" hidden></p><div><small class="sf-msg-length">0 / 2.000</small><button type="submit">Senden</button></div></form></section></div><footer class="sf-msg-status" role="status" aria-live="polite">Nachrichten werden geladen …</footer></section>`;
    document.body.appendChild(modal);renderThread();
    document.querySelectorAll('.sf-message-launch').forEach(b => b.setAttribute('aria-expanded','true'));
    modal.querySelector('[data-msg-action="close"]').onclick = () => { if (peer) drafts.set(peer,modal.querySelector('textarea').value);close(); };
    modal.querySelector('[data-msg-action="contacts"]').onclick = () => { showContacts = !showContacts;renderList();modal.querySelector('[type="search"]').focus(); };
    modal.querySelector('[type="search"]').oninput = event => { search = event.target.value;renderList(); };
    modal.querySelector('.sf-msg-people').onclick = event => { const button = event.target.closest('[data-msg-peer]');if (button) selectPeer(button.dataset.msgPeer); };
    modal.querySelector('[data-msg-action="back"]').onclick = () => { modal.dataset.chat = 'false';modal.querySelector('[type="search"]').focus(); };
    modal.querySelector('[data-msg-action="older"]').onclick = () => loadThread(true);
    modal.querySelector('form').onsubmit = send;
    modal.querySelector('textarea').oninput = () => { drafts.set(peer,modal.querySelector('textarea').value);composeState(); };
    // Stay open on backdrop clicks so a draft cannot be closed accidentally.
    modal.addEventListener('keydown',event => {
      if (event.key === 'Escape') { event.preventDefault();event.stopPropagation();if (peer) drafts.set(peer,modal.querySelector('textarea').value);close();return; }
      if (event.key !== 'Tab') return;
      const nodes = [...modal.querySelectorAll('button:not(:disabled),input,textarea:not(:disabled),[tabindex="0"]')].filter(n => n.offsetParent !== null);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault();last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault();first?.focus(); }
    });
    modal.querySelector('[data-msg-action="close"]').focus();loadInbox();lastRefresh = Date.now();
  }
  async function poll(force = false) {
    sync();if (!context || document.hidden || (!force && Date.now() - lastRefresh < (modal ? 15000 : 30000))) return;
    lastRefresh = Date.now();
    if (modal) { await loadInbox();await loadThread();return; }
    if (countBusy) return;const key = context, epoch = generation;countBusy = true;
    try { unread = Number(await rpc('messages_unread',{},key,epoch) || 0);badge(); }
    catch (error) { if (!error.stale && /MESSAGE_ACCESS_DENIED/.test(String(error.message))) { unread = 0;badge(); } }
    finally { if (current(key,epoch)) countBusy = false; }
  }
  for (const name of ['finishSignOut','switchCompany']) {
    const base = B[name];if (typeof base === 'function') B[name] = function () { reset();context = '';return base.apply(this,arguments); };
  }
  document.addEventListener('visibilitychange',() => { if (!document.hidden) poll(true); });
  window.addEventListener('online',() => poll(true));window.addEventListener('focus',() => poll(true));
  B.messages = {open,refresh:() => poll(true),close};
  setInterval(sync,800);setInterval(poll,5000);sync();
})();
