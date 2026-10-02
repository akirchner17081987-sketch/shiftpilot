// SchichtFunk – Abwesenheiten: eigene Anträge, Status und Rückmeldungen
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__absenceEmployeeV3)return;B.__absenceEmployeeV3=true;
  const TYPES=['Urlaub','Sonderurlaub','Krank','Kind Krank','Home-Office'];
  const ICONS={'Urlaub':'☼','Sonderurlaub':'◇','Krank':'✚','Kind Krank':'♡','Home-Office':'⌂'};
  const EFFECTIVE=new Set(['Genehmigt','Erfasst']);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tz=()=>B.companyTimeZone||B.employeePortalData?.company?.timezone||'Europe/Berlin';
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:tz(),year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const fmt=v=>{if(!v)return'–';const value=String(v).slice(0,10);return validDate(value)?new Intl.DateTimeFormat('de-DE',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value+'T12:00:00Z')):'–'};
  const fmtStamp=v=>v&&Number.isFinite(Date.parse(v))?new Intl.DateTimeFormat('de-DE',{timeZone:tz(),day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(v)):'–';
  const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
  const days=(from,to)=>validDate(from)&&validDate(to)&&to>=from?Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000)+1:0;
  const state=s=>s==='Beantragt'?['In Prüfung','pending']:s==='Genehmigt'?['Genehmigt','good']:s==='Erfasst'?['Erfasst','good']:s==='Abgelehnt'?['Abgelehnt','bad']:[s||'–',''];
  const identity=()=>`${B.user?.id||''}|${B.companyId||''}|${B.employeeDbId||B.employeePortalData?.employee?.id||''}`;
  const ownRows=()=>{const id=B.employeeDbId||B.employeePortalData?.employee?.id;return (B.employeePortalData?.absences||[]).filter(a=>(!a.employee_id||String(a.employee_id)===String(id))&&(!a.company_id||String(a.company_id)===String(B.companyId)))};
  let scope='',signature='',loadSequence=0,loading=false,loadError='',notice='',pendingSubmission='';
  const view={filter:'all',type:'all',limit:10};
  function css(){if(document.getElementById('sfAbsEmpV3Css'))return;const link=document.createElement('link');link.id='sfAbsEmpV3Css';link.rel='stylesheet';link.href='assets/employee-absences-workspace-v1.css?v=20261002-absence-clicks2';document.head.appendChild(link)}
  function section(){
    const p=document.getElementById('sfEmployeePortal');if(!p)return null;
    let sec=p.querySelector('[data-sf-portal-section="absences"]')||[...p.querySelectorAll('.sf-portal-card')].find(x=>x.querySelector('h3')?.textContent.trim()==='Abwesenheiten');
    if(!sec){const host=p.querySelector('.sf-portal-column-left')||p.querySelector('.sf-portal-grid');if(!host)return null;sec=document.createElement('section');sec.className='sf-portal-card';host.appendChild(sec)}
    sec.id='sfEmployeeAbsenceCard';sec.dataset.sfPortalSection='absences';return sec;
  }
  function rowHtml(a){
    const [label,cl]=state(a.status),duration=days(a.start_date,a.end_date||a.start_date),partial=a.full_day===false,range=fmt(a.start_date)+(a.end_date&&a.end_date!==a.start_date?' – '+fmt(a.end_date):'');
    return `<article class="sf-ae3-row" data-absence-id="${esc(a.id)}"><div class="sf-ae3-top"><span class="sf-ae3-icon" aria-hidden="true">${ICONS[a.absence_type]||'▣'}</span><div class="sf-ae3-main"><b>${esc(a.absence_type||'Abwesenheit')}</b><span>${esc(range)}</span></div><span class="sf-ae3-state ${cl}">${esc(label)}</span></div><div class="sf-ae3-meta"><span>${partial?'Teil des Tages'+(a.start_time&&a.end_time?' · '+esc(String(a.start_time).slice(0,5))+'–'+esc(String(a.end_time).slice(0,5)):''):`${duration} ${duration===1?'Kalendertag':'Kalendertage'} · ganztägig`}</span><span>${a.requested_at?'Beantragt am '+esc(fmtStamp(a.requested_at)):a.created_at?'Erfasst am '+esc(fmtStamp(a.created_at)):''}</span></div>${a.note?`<details class="sf-ae3-note"><summary>Dein Kommentar</summary><p>${esc(a.note)}</p></details>`:''}${a.review_note?`<div class="sf-ae3-feedback ${cl}"><b>Rückmeldung des Planers</b><p>${esc(a.review_note)}</p>${a.reviewed_at?`<small>Bearbeitet am ${esc(fmtStamp(a.reviewed_at))}</small>`:''}</div>`:''}<div class="sf-ae3-row-foot">${a.status==='Beantragt'?'◷ Dein Antrag wartet auf die Entscheidung eines Planers.':EFFECTIVE.has(a.status)?'✓ Vom Planer bestätigt.':a.status==='Abgelehnt'?'Der Antrag wurde abgelehnt. Bei Bedarf kannst du einen neuen Zeitraum beantragen.':'Eintrag aus deiner Abwesenheitsübersicht.'}</div></article>`;
  }
  // Keep unchanged control groups in place: replacing a pressed button cancels
  // the browser's mouseup/click sequence during a background refresh.
  function updateCard(sec,html){
    const template=document.createElement('template');template.innerHTML=html;
    let cursor=sec.firstChild;
    const sameGroup=(a,b)=>a.nodeType===b.nodeType&&a.nodeName===b.nodeName&&a.className===b.className;
    for(const next of [...template.content.childNodes]){
      let match=cursor;
      while(match&&!sameGroup(match,next))match=match.nextSibling;
      if(!match){sec.insertBefore(next,cursor);continue}
      while(cursor!==match){const unused=cursor;cursor=cursor.nextSibling;unused.remove()}
      if(match.outerHTML===next.outerHTML&&match.textContent===next.textContent){cursor=match.nextSibling;continue}
      cursor=match.nextSibling;match.replaceWith(next);
    }
    while(cursor){const unused=cursor;cursor=cursor.nextSibling;unused.remove()}
  }
  function render(force=false,focusSelector=''){
    if(B.role!=='EMPLOYEE'||!B.employeePortalData)return false;
    const current=identity();if(scope!==current){scope=current;signature='';loadError='';notice='';loading=false;loadSequence++;Object.assign(view,{filter:'all',type:'all',limit:10})}
    const sec=section();if(!sec)return false;css();
    const rows=ownRows().slice().sort((a,b)=>String(b.requested_at||b.created_at||b.start_date).localeCompare(String(a.requested_at||a.created_at||a.start_date))),date=today();
    const key=JSON.stringify([current,rows,view,loading,loadError,notice]);if(!force&&signature===key&&sec.querySelector('[data-sf-absence-request="1"]'))return true;signature=key;
    const requestOpener=sec.contains(document.activeElement)&&document.activeElement.matches?.('[data-sf-absence-request="1"]')?document.activeElement:null;
    const pending=rows.filter(a=>a.status==='Beantragt'),confirmed=rows.filter(a=>EFFECTIVE.has(a.status)),upcoming=confirmed.filter(a=>String(a.end_date||a.start_date)>=date).sort((a,b)=>String(a.start_date).localeCompare(String(b.start_date))),rejected=rows.filter(a=>a.status==='Abgelehnt');
    const counts={all:rows.length,pending:pending.length,confirmed:confirmed.length,rejected:rejected.length};
    const filtered=rows.filter(a=>(view.type==='all'||a.absence_type===view.type)&&(view.filter==='all'||view.filter==='pending'&&a.status==='Beantragt'||view.filter==='confirmed'&&EFFECTIVE.has(a.status)||view.filter==='rejected'&&a.status==='Abgelehnt')),shown=filtered.slice(0,view.limit);
    const types=[...new Set([...TYPES,...rows.map(a=>a.absence_type).filter(Boolean)])];sec.dataset.sfAbsenceV3='1';sec.dataset.sfAbsenceCount=String(rows.length);document.querySelectorAll('#sfEmployeePortal [data-count-for="absences"]').forEach(node=>{if(node.textContent!==String(rows.length))node.textContent=String(rows.length)});
    const stat=(key,label,count,detail,accent='')=>`<div class="sf-ae3-stat ${accent}"><small>${label}</small><strong data-absence-count="${key}">${count}</strong><span>${detail}</span></div>`;
    updateCard(sec,`<header class="sf-ae3-head"><div><div class="sf-ae3-eyebrow">DEINE ANTRÄGE IM BLICK</div><h3>Abwesenheiten</h3><p>Abwesenheit beantragen, Status verfolgen und Rückmeldungen sehen.</p></div><button type="button" class="sf-ae3-add" data-sf-absence-request="1">＋ Antrag stellen</button></header>${notice?`<div class="sf-ae3-success" role="status" aria-live="polite">${esc(notice)}</div>`:''}${loadError?`<div class="sf-ae3-load-error" role="alert">${esc(loadError)} <button type="button" data-absence-refresh>Erneut laden</button></div>`:''}<div class="sf-ae3-stats">${stat('pending','In Prüfung',pending.length,'Warten auf den Planer',pending.length?'attention':'')}${stat('upcoming','Bevorstehend / aktuell',upcoming.length,'Bereits bestätigt','approved')}${stat('confirmed','Bestätigt',confirmed.length,'Genehmigt oder erfasst')}${stat('all','Alle Einträge',rows.length,'Deine gesamte Übersicht')}</div><div class="sf-ae3-start"><div><h4>Was möchtest du beantragen?</h4><p>Kategorie wählen und Zeitraum eintragen. Ein Kommentar ist optional.</p></div><div class="sf-ae3-categories">${TYPES.map(type=>`<button type="button" data-sf-absence-request="1" data-absence-category="${esc(type)}"><span aria-hidden="true">${ICONS[type]}</span><b>${esc(type)}</b><span aria-hidden="true">↗</span></button>`).join('')}</div></div>${upcoming.length?`<div class="sf-ae3-next"><span class="sf-ae3-next-icon" aria-hidden="true">✓</span><div><small>${upcoming[0].start_date<=date?'Aktuell bestätigt':'Nächste bestätigte Abwesenheit'}</small><b>${esc(upcoming[0].absence_type)} · ${esc(fmt(upcoming[0].start_date))}${upcoming[0].end_date!==upcoming[0].start_date?' – '+esc(fmt(upcoming[0].end_date)):''}</b></div></div>`:''}<div class="sf-ae3-list-head"><h4>Deine Anträge & Abwesenheiten</h4><button type="button" class="sf-ae3-refresh" data-absence-refresh ${loading?'disabled':''}>↻ ${loading?'Lädt …':'Aktualisieren'}</button></div><div class="sf-ae3-toolbar"><div class="sf-ae3-filters" aria-label="Abwesenheiten nach Status filtern">${[['all','Alle'],['pending','In Prüfung'],['confirmed','Bestätigt'],['rejected','Abgelehnt']].map(([key,label])=>`<button type="button" data-absence-filter="${key}" aria-pressed="${view.filter===key}">${label}<span>${counts[key]}</span></button>`).join('')}</div><label class="sf-ae3-type-filter"><span>Kategorie</span><select id="sfEmployeeAbsenceFilter"><option value="all">Alle Kategorien</option>${types.map(type=>`<option value="${esc(type)}" ${view.type===type?'selected':''}>${esc(type)}</option>`).join('')}</select></label></div><p class="sf-ae3-results" role="status" aria-live="polite">${filtered.length} ${filtered.length===1?'Eintrag':'Einträge'}${view.type==='all'?'':' · '+esc(view.type)}</p><div class="sf-ae3-list">${shown.length?shown.map(rowHtml).join(''):`<div class="sf-empty sf-ae3-empty"><b>${rows.length?'Keine Einträge für diesen Filter':'Deine Abwesenheitsübersicht ist noch leer'}</b><p>${rows.length?'Wähle einen anderen Status oder eine andere Kategorie.':'Stelle deinen ersten Antrag. Nach dem Senden findest du hier den Status und die Rückmeldung des Planers.'}</p>${rows.length?'<button type="button" data-absence-reset>Alle Einträge anzeigen</button>':'<button type="button" data-sf-absence-request="1">Ersten Antrag stellen</button>'}</div>`}</div>${shown.length<filtered.length?`<div class="sf-ae3-more"><span>${shown.length} von ${filtered.length} Einträgen</span><button type="button" data-absence-more>Weitere Einträge anzeigen</button></div>`:''}<footer class="sf-ae3-help"><b>So läuft dein Antrag</b><div class="sf-ae3-steps"><span><i>1</i> Kategorie & Zeitraum wählen</span><span><i>2</i> Zur Prüfung senden</span><span><i>3</i> Entscheidung hier ansehen</span></div><p>Neue Anträge stehen zunächst „In Prüfung“. Erst die Bestätigung durch einen Planer macht sie planungswirksam. Kalendertage enthalten Wochenenden und sind keine Berechnung deines Urlaubsanspruchs.</p></footer>`);
    sec.querySelectorAll('[data-absence-filter]').forEach(btn=>btn.onclick=()=>{view.filter=btn.dataset.absenceFilter;view.limit=10;render(true,`[data-absence-filter="${view.filter}"]`)});
    sec.querySelector('#sfEmployeeAbsenceFilter').onchange=e=>{view.type=e.target.value;view.limit=10;render(true,'#sfEmployeeAbsenceFilter')};
    const reset=sec.querySelector('[data-absence-reset]');if(reset)reset.onclick=()=>{Object.assign(view,{filter:'all',type:'all',limit:10});render(true,'[data-absence-filter="all"]')};
    const more=sec.querySelector('[data-absence-more]');if(more)more.onclick=()=>{view.limit+=10;render(true,'[data-absence-more]')};
    sec.querySelectorAll('[data-absence-refresh]').forEach(btn=>btn.onclick=()=>refresh(true));
    const restoreRequestFocus=requestOpener&&!requestOpener.isConnected;
    if(focusSelector)sec.querySelector(focusSelector)?.focus({preventScroll:true});else if(restoreRequestFocus)requestAnimationFrame(()=>{if(!document.getElementById('sfAbsenceEmployeeV3Modal'))sec.querySelector('[data-sf-absence-request="1"]')?.focus({preventScroll:true})});
    return true;
  }
  async function refresh(returnFocus=false){
    if(B.role!=='EMPLOYEE'||!B.client||!B.employeePortalData)return false;render();
    const current=identity(),request=++loadSequence,employee=B.employeeDbId||B.employeePortalData.employee?.id,company=B.companyId;
    if(!employee||!company)return false;loading=true;render(true);
    try{
      let q;if(B.client.__sfDemoLocalClientV1){await B.hydrateEmployee();q={data:ownRows()}}else q=await B.client.from('absences').select('id,company_id,employee_id,absence_type,start_date,end_date,status,full_day,start_time,end_time,note,requested_at,created_at,reviewed_at,review_note,request_source').eq('employee_id',employee).eq('company_id',company).order('requested_at',{ascending:false});
      if(current!==identity()||request!==loadSequence||B.role!=='EMPLOYEE')return false;if(q.error)throw q.error;
      B.employeePortalData={...B.employeePortalData,absences:(q.data||[]).filter(a=>String(a.employee_id)===String(employee)&&(!a.company_id||String(a.company_id)===String(company)))};loadError='';return true;
    }catch(e){if(current!==identity()||request!==loadSequence||B.role!=='EMPLOYEE')return false;loadError='Deine Übersicht konnte nicht aktualisiert werden. Der zuletzt geladene Stand bleibt sichtbar.';console.warn('Eigene Abwesenheiten konnten nicht geladen werden',e);return false}
    finally{if(current===identity()&&request===loadSequence&&B.role==='EMPLOYEE'){loading=false;render(true,returnFocus?'[data-absence-refresh]':'')}}
  }
  function open(opener,type='Urlaub'){
    if(B.role!=='EMPLOYEE')return;css();if(!TYPES.includes(type))type='Urlaub';
    document.getElementById('sfAbsenceWorkflowModal')?.remove();document.getElementById('sfAbsenceEmployeeV3Modal')?.remove();
    const date=today(),current=identity(),m=document.createElement('div');m.id='sfAbsenceEmployeeV3Modal';m.className='sf-ae3-modal';
    m.innerHTML=`<div class="sf-ae3-card" role="dialog" aria-modal="true" aria-labelledby="sfAe3Title" tabindex="-1"><header class="sf-ae3-mh"><div><div class="sf-ae3-eyebrow">NEUER ABWESENHEITSANTRAG</div><h2 id="sfAe3Title">Abwesenheit beantragen</h2><p>Dein Antrag geht zur Prüfung an einen Planer.</p></div><button type="button" class="sf-ae3-x" aria-label="Dialog schließen">✕</button></header><form id="sfAe3Form" novalidate><div class="sf-ae3-body"><div class="sf-ae3-field"><label>Kategorie</label><select id="sfAe3Type">${TYPES.map(x=>`<option value="${esc(x)}" ${type===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div><div class="sf-ae3-grid"><div class="sf-ae3-field"><label>Startdatum</label><input id="sfAe3From" type="date" value="${date}"></div><div class="sf-ae3-field"><label>Enddatum</label><input id="sfAe3To" type="date" value="${date}"></div></div><div class="sf-ae3-duration" id="sfAe3Duration" role="status" aria-live="polite"></div><details class="sf-ae3-advanced"><summary>Zeitfenster ergänzen (optional)</summary><div class="sf-ae3-field"><label>Umfang</label><select id="sfAe3Full"><option value="1">Ganztägig</option><option value="0">Teil des Tages</option></select></div><div id="sfAe3Times" class="sf-ae3-grid" hidden><div class="sf-ae3-field"><label>Beginn</label><input id="sfAe3Start" type="time"></div><div class="sf-ae3-field"><label>Ende</label><input id="sfAe3End" type="time"></div></div></details><div class="sf-ae3-field"><label>Kommentar (optional)</label><textarea id="sfAe3Note" rows="3" maxlength="2000" placeholder="Möchtest du dem Planer noch etwas mitteilen?"></textarea><small>Bis zu 2.000 Zeichen. Der Kommentar ist kein Pflichtfeld.</small></div><div class="sf-ae3-form-help" id="sfAe3Help">Mit * gekennzeichnete Felder sind Pflichtfelder. Nach dem Senden steht dein Antrag „In Prüfung“. Die Entscheidung und eine mögliche Rückmeldung erscheinen in deiner Übersicht.</div><div class="sf-ae3-msg" id="sfAe3Msg" role="alert" aria-live="assertive"></div></div><footer class="sf-ae3-foot"><button type="button" id="sfAe3Cancel">Abbrechen</button><button type="submit" id="sfAe3Submit">Zur Prüfung senden <span aria-hidden="true">↗</span></button></footer></form></div>`;
    document.body.appendChild(m);
    [['sfAe3Type',true],['sfAe3From',true],['sfAe3To',true],['sfAe3Full',true],['sfAe3Start',false],['sfAe3End',false],['sfAe3Note',false]].forEach(([id,required])=>{const field=m.querySelector('#'+id),label=field.previousElementSibling;label.htmlFor=id;if(required){label.insertAdjacentHTML('beforeend',' <span aria-hidden="true">*</span>');field.required=true}field.setAttribute('aria-required',String(required));field.setAttribute('aria-describedby','sfAe3Help')});
    const close=B.bindAccessibleModal?.(m,{initialFocus:'#sfAe3Type',returnFocus:opener,returnFocusSelector:'[data-sf-absence-request="1"]'})||(()=>m.remove()),msg=m.querySelector('#sfAe3Msg');
    m.querySelector('#sfAe3Form').addEventListener('input',()=>msg.classList.remove('show'));
    m.querySelector('.sf-ae3-x').onclick=close;m.querySelector('#sfAe3Cancel').onclick=close;m.addEventListener('click',e=>{if(e.target===m)close()});
    m.querySelector('#sfAe3Full').onchange=e=>{const partial=e.target.value==='0';m.querySelector('#sfAe3Times').hidden=!partial;['#sfAe3Start','#sfAe3End'].forEach(sel=>{const field=m.querySelector(sel);field.required=partial;field.setAttribute('aria-required',String(partial))})};
    const updateDuration=()=>{const from=m.querySelector('#sfAe3From').value,to=m.querySelector('#sfAe3To').value,n=days(from,to);m.querySelector('#sfAe3Duration').textContent=n?`${n} ${n===1?'Kalendertag':'Kalendertage'} · Start- und Enddatum eingeschlossen`:'Bitte einen gültigen Zeitraum wählen.'};m.querySelector('#sfAe3From').addEventListener('input',updateDuration);m.querySelector('#sfAe3To').addEventListener('input',updateDuration);updateDuration();
    m.querySelector('#sfAe3Form').onsubmit=async event=>{
      event.preventDefault();const btn=m.querySelector('#sfAe3Submit');if(btn.disabled)return;
      const type=m.querySelector('#sfAe3Type').value,from=m.querySelector('#sfAe3From').value,to=m.querySelector('#sfAe3To').value,full=m.querySelector('#sfAe3Full').value==='1',st=m.querySelector('#sfAe3Start').value,en=m.querySelector('#sfAe3End').value,note=m.querySelector('#sfAe3Note').value.trim();
      const fail=(text,field)=>{msg.textContent=text;msg.classList.add('show');if(field)m.querySelector(field)?.focus()};
      if(B.role!=='EMPLOYEE'||current!==identity())return fail('Dein Zugang hat sich geändert. Bitte öffne den Antrag erneut.');
      if(!B.client||pendingSubmission===current)return fail('Ein Antrag wird bereits gesendet. Bitte kurz warten.');
      if(!TYPES.includes(type))return fail('Bitte eine gültige Kategorie wählen.','#sfAe3Type');
      if(!validDate(from)||!validDate(to)||to<from)return fail('Bitte Start- und Enddatum angeben. Das Enddatum darf nicht vor dem Startdatum liegen.','#sfAe3To');
      if(days(from,to)>367)return fail('Bitte einen Zeitraum von höchstens 367 Kalendertagen wählen.','#sfAe3To');
      if(!full&&(!st||!en))return fail('Bitte Beginn und Ende des Zeitfensters angeben.','#sfAe3Start');
      if(note.length>2000)return fail('Der Kommentar darf höchstens 2.000 Zeichen enthalten.','#sfAe3Note');
      try{
        pendingSubmission=current;btn.disabled=true;btn.textContent='Wird gesendet …';
        const {data,error}=await B.client.rpc('employee_submit_absence_request',{p_absence_type:type,p_start_date:from,p_end_date:to,p_note:note,p_full_day:full,p_start_time:full?null:st,p_end_time:full?null:en,p_time_note:''});
        if(error)throw error;
        close();if(current!==identity()||B.role!=='EMPLOYEE')return;
        if(typeof data==='string'&&!ownRows().some(a=>a.id===data))B.employeePortalData={...B.employeePortalData,absences:[...(B.employeePortalData.absences||[]),{id:data,company_id:B.companyId,employee_id:B.employeeDbId||B.employeePortalData.employee?.id,absence_type:type,start_date:from,end_date:to,note,status:'Beantragt',full_day:full,start_time:full?null:st,end_time:full?null:en,request_source:'EMPLOYEE',requested_at:new Date().toISOString()}]};
        Object.assign(view,{filter:'pending',type:'all',limit:10});notice='Dein Antrag wurde eingereicht und wartet auf die Prüfung durch einen Planer.';render(true);B.employeePortalNavigate?.('absences');await refresh();B.notifications?.refresh?.();if(typeof showSaveToast==='function')showSaveToast('Antrag eingereicht','Ein Planer prüft deinen Abwesenheitsantrag.');
      }catch(e){btn.disabled=false;btn.innerHTML='Zur Prüfung senden <span aria-hidden="true">↗</span>';fail(e?.message||String(e))}
      finally{if(pendingSubmission===current)pendingSubmission=''}
    };
  }
  B.openEmployeeAbsenceRequestV3=open;B.openEmployeeAbsenceRequest=open;B.renderEmployeeAbsencesV3=()=>render();B.refreshEmployeeAbsences=refresh;
  // Vor dokumentweiten Portal-Handlern ausführen, auch nach Portal-Neuaufbau.
  // Nur eigene Antragsaktionen übernehmen; alle anderen Klicks unverändert weitergeben.
  window.addEventListener('click',e=>{
    const target=e.target instanceof Element?e.target:e.target?.parentElement;
    const btn=target?.closest('[data-sf-absence-request="1"],#sfEmployeeAbsenceAdd,#sfEmployeeAbsenceAddV2');
    if(!btn||!btn.closest('#sfEmployeePortal')||btn.disabled||B.role!=='EMPLOYEE')return;
    e.preventDefault();e.stopPropagation();
    if(btn.dataset.absenceCategory)open(btn,btn.dataset.absenceCategory);else open(btn);
  },true);
  const old=B.openEmployeePortal;if(typeof old==='function')B.openEmployeePortal=function(){const r=old.apply(this,arguments);setTimeout(()=>render(),0);setTimeout(()=>render(),120);return r};
  let queued=false;const mo=new MutationObserver(()=>{if(queued||B.role!=='EMPLOYEE')return;queued=true;setTimeout(()=>{queued=false;render()},80)});mo.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&B.role==='EMPLOYEE'&&document.getElementById('sfEmployeePortal')?.dataset.sfPortalActive==='absences')refresh()});
  setTimeout(()=>render(true),0);setTimeout(()=>render(),300);
})();
