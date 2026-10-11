// SchichtFunk – verständlicher Ablauf für die bestehende Auto-Planung.
(function(){
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const el=id=>document.getElementById(id);
  const text=(id,value)=>{const node=el(id);if(node&&node.textContent!==String(value))node.textContent=value};
  const dateFormatter=new Intl.DateTimeFormat('de-DE',{weekday:'long',day:'2-digit',month:'2-digit'}),weekdayFormatter=new Intl.DateTimeFormat('de-DE',{weekday:'short'}),monthFormatter=new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}),dateLabels=new Map();
  const dateLabel=date=>{if(!dateLabels.has(date))dateLabels.set(date,dateFormatter.format(new Date(date+'T12:00:00')));return dateLabels.get(date)};
  const written=new WeakMap();
  const html=(node,value)=>{if(!node||written.get(node)===value)return;node.innerHTML=value;written.set(node,value)};
  let suggestionKey='',suggestionHost=null,stairMonth='',unresolvedPage=0,unresolvedKey='';
  const shiftLabel=code=>{const t=typeById(code);return t?.name&&t.name!==code?`${code} · ${t.name}`:code};
  function remainingSlots(slots,preview){
    const keyOf=x=>x.date+'|'+(x.coverageGroup||x.type);
    const counts=new Map();preview.forEach(x=>{const key=keyOf(x);counts.set(key,(counts.get(key)||0)+1)});
    const known=new Map();autoPlanUnresolved.forEach(x=>{const key=keyOf(x);if(!known.has(key))known.set(key,x.reason)});
    return slots.filter(x=>{const key=keyOf(x),n=counts.get(key)||0;if(n){counts.set(key,n-1);return false}return true}).map(x=>({...x,reason:known.get(keyOf(x))||'Für diese Position liegt kein Vorschlag vor. Bitte prüfe die Besetzung im Dienstplan.'}));
  }
  function explain(slot,simulated=[]){
    const {type,date}=slot;
    if(slot.coverageGroup){const alternatives=slot.alternatives||[type];return `Gemeinsame Leitung ${slot.coverageLabel}: kein verfügbarer TL unter den aktuellen Regeln. `+alternatives.map(code=>`${code}: ${explain({type:code,date},simulated)}`).join(' ')}
    let pool=employees.filter(e=>e.status==='active');
    if(!pool.length)return'Keine aktiven Mitarbeiter vorhanden. Prüfe die Mitarbeiterprofile.';
    pool=pool.filter(e=>(e.shifts||[]).includes(type));
    if(!pool.length)return`Kein aktiver Mitarbeiter hat eine Freigabe für ${type}. Prüfe die Schichtfreigaben.`;
    pool=pool.filter(e=>window.SFShiftModels?.allowsEmployee?.(type,e,date)!==false);
    if(!pool.length)return'Für diese Schicht fehlt ein aktiver zuständiger Mitarbeiter mit Schichtfreigabe.';
    pool=pool.filter(e=>!absent(e.id,date));
    if(!pool.length)return'Alle passenden Mitarbeiter sind an diesem Tag abwesend.';
    const all=[...assignments,...simulated];pool=pool.filter(e=>!all.some(a=>String(a.employeeId)===String(e.id)&&a.date===date));
    if(!pool.length)return'Die passenden Mitarbeiter sind an diesem Tag bereits eingeplant.';
    pool=pool.filter(e=>{const r=window.sfRhythmCheck?.(e,type,date);return !r||r.mode!=='required'||r.allowed});
    if(!pool.length)return'Der verbindliche Rhythmus der verfügbaren Mitarbeiter passt an diesem Tag nicht zu dieser Schicht.';
    const timePool=pool.filter(e=>!window.SFAutoPlanGuard||window.SFAutoPlanGuard.passesTimeRules(e.id,type,date,simulated));
    if(!timePool.length)return'Schichtwechsel, Schichtdauer, Ruhezeit, Überschneidung oder das Maximum an Diensten in Folge verhindern die Besetzung. Prüfe die Schichtzeiten und benachbarte Dienste.';
    const cap=Number(window.SFCompliance?.policy?.monthlyPlanningMaxHours)||220,count=Number(window.SFCompliance?.policy?.monthlyPlanningMaxShifts);return `Für die übrigen passenden Mitarbeiter reichen die freien Wochen- oder Monatsstunden nicht aus. Vollzeit: maximal ${cap} Monatsstunden${count?`, höchstens ${count} Schichten pro Monat`:''}; Ziel bleiben die persönlichen Monatsstunden. Bei Teilzeit bleibt das individuelle Monats-SOLL die feste Obergrenze.`;
  }
  function renderSuggestions(){
    const host=el('autoSuggestions');if(!host)return;
    const signature=JSON.stringify([window.SFBackend?.companyId,autoPlanPreview,employees.map(e=>[e.id,e.first,e.last]),TYPES.map(t=>[t.id,t.name])]);
    if(signature===suggestionKey&&host===suggestionHost)return;
    suggestionKey=signature;suggestionHost=host;
    const people=new Map(employees.map(e=>[String(e.id),e])),groups=new Map();autoPlanPreview.forEach((x,i)=>{if(!groups.has(x.date))groups.set(x.date,[]);groups.get(x.date).push({...x,index:i})});
    const previous=[...(host.querySelectorAll?.('details[data-auto-day]')||[])],openDates=new Set(previous.filter(x=>x.open).map(x=>x.dataset.autoDay)),sameDays=previous.some(x=>groups.has(x.dataset.autoDay));
    const body=list=>list.map(x=>{const e=people.get(String(x.employeeId));return `<div class="sf-auto-suggestion-row"><div class="sf-auto-shift"><b>${esc(shiftLabel(x.type))}</b><small>${esc(x.start)}–${esc(x.end)} Uhr</small></div><div class="sf-auto-person"><b>${esc(e?e.first+' '+e.last:'Mitarbeiter')}</b><small>${esc(x.reason)}</small></div><button type="button" class="ghost" onclick="removeAutoSuggestion(${x.index})" title="${x.blockId?'Gesamten Arbeitsblock entfernen':'Einzelnen Vorschlag entfernen'}" aria-label="Vorschlag für ${esc(e?e.first+' '+e.last:'Mitarbeiter')} am ${esc(x.date)} entfernen">Entfernen</button></div>`}).join('');
    html(host,groups.size?[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([date,list],n)=>{const open=sameDays?openDates.has(date):n===0;return `<details class="sf-auto-day" data-auto-day="${esc(date)}" ${open?'open':''}><summary><b>${esc(dateLabel(date))}</b><span>${list.length} Besetzung${list.length===1?'':'en'}</span></summary><div class="sf-auto-day-list" data-loaded="${open?'1':'0'}">${open?body(list):''}</div></details>`}).join(''):'<div class="sf-auto-empty"><b>Keine Besetzung vorgeschlagen</b><p>Die offenen Positionen und ihre Gründe findest du unter „Noch zu besetzen“.</p></div>');
    (host.querySelectorAll?.('details[data-auto-day]')||[]).forEach(node=>{node.sfAutoFill=()=>{const target=node.querySelector('.sf-auto-day-list');if(target&&target.dataset.loaded!=='1'){html(target,body(groups.get(node.dataset.autoDay)||[]));target.dataset.loaded='1'}};node.ontoggle=()=>{if(node.open)node.sfAutoFill()}});
  }
  const hoursLabel=value=>Number(value.toFixed(2)).toLocaleString('de-DE',{maximumFractionDigits:2})+' h';
  function draftHours(dates,people,all){
    const selected=new Set(dates),monthly=el('autoPlanPeriod')?.value==='month',months=new Set(dates.map(d=>d.slice(0,7))).size,totals=new Map();
    for(const a of all){if(!selected.has(a.date))continue;const key=String(a.employeeId),row=totals.get(key)||{duties:0,planned:0};row.duties++;row.planned+=plannedAssignmentHours(a);totals.set(key,row)}
    return people.map(e=>{const {duties,planned}=totals.get(String(e.id))||{duties:0,planned:0},target=monthly?employeeMonthlyTarget(e)*months:(Number(e.weeklyHours)||0)*dates.length/7;return {e,duties,planned,target,difference:planned-target}});
  }
  function renderStaircase(dates=autoPlanningDates()){
    const host=el('autoStaircase');if(!host)return;
    const all=[...assignments,...autoPlanPreview],months=[...new Set(dates.map(d=>d.slice(0,7)))];
    if(!months.includes(stairMonth))stairMonth=months[0];
    const shown=months.length>1?dates.filter(d=>d.startsWith(stairMonth)):dates,days=new Map(),phases=new Map();
    for(const a of all){const key=String(a.employeeId)+'|'+a.date;if(!days.has(key))days.set(key,a)}
    const phase=e=>{if(!phases.has(e.id)){const r=window.SFRhythm?.check(e,'O1',dates[0]),rule=window.SFRhythm?.config(e);phases.set(e.id,rule&&!rule.team&&rule.pattern.includes('ALLE')&&Number.isInteger(r?.index)?(rule.pattern.length-r.index)%rule.pattern.length:999)}return phases.get(e.id)};
    const ordered=window.SFScheduleEmployeeDisplay?.orderEnabled?.()??window.SFScheduleEmployeeDisplay?.enabled();
    const people=employees.filter(e=>e.status==='active'&&!e.deletedAt).sort((a,b)=>ordered?window.SFScheduleEmployeeDisplay.compare(a,b):phase(a)-phase(b)||String(a.personnelNo||a.last).localeCompare(String(b.personnelNo||b.last),'de',{numeric:true}));
    const rows=draftHours(dates,people,all),monthly=el('autoPlanPeriod')?.value==='month',planned=rows.reduce((n,r)=>n+r.planned,0),target=rows.reduce((n,r)=>n+r.target,0),duties=rows.reduce((n,r)=>n+r.duties,0),staffed=rows.filter(r=>r.duties).length;
    const scope=monthly&&months.length===1?'Monats':'Zeitraum',head=shown.map(d=>`<th scope="col" title="${esc(dateLabel(d))}">${Number(d.slice(-2))}<small>${esc(weekdayFormatter.format(new Date(d+'T12:00:00')))}</small></th>`).join('');
    html(host,`<div class="sf-auto-draft-summary" aria-label="Entwurf zusammengefasst"><span><b>${staffed} / ${people.length}</b> Mitarbeiter eingeplant</span><span><b>${duties}</b> ${duties===1?'Dienst':'Dienste'}</span><span><b>${hoursLabel(planned)}</b> Plan-IST</span><span><b>${hoursLabel(target)}</b> ${scope}-SOLL</span></div><p class="sf-auto-draft-note">Plan-IST = geplante Stunden einschließlich dieses Vorschlags. Differenz = Plan-IST minus ${scope}-SOLL; keine erfassten Arbeitszeiten.</p>${months.length>1?`<div class="sf-auto-preview-nav"><label>Monat in der Planvorschau <select aria-label="Monat in der Planvorschau" onchange="SFAutoPlanWorkspace.stairMonth(this.value)">${months.map(m=>`<option value="${esc(m)}" ${m===stairMonth?'selected':''}>${esc(monthFormatter.format(new Date(m+'-01T12:00:00')))}</option>`).join('')}</select></label><p>Die Gesamtwerte gelten für den vollständigen Planungszeitraum. Die Tabelle zeigt den ausgewählten Monat.</p></div>`:''}<div class="sf-auto-stair-scroll" tabindex="0" aria-label="Treppenmuster horizontal scrollen"><table class="sf-auto-stair-table"><caption>${esc(autoPeriodLabel(shown))} · Schichtcode: besetzt · –: Rhythmusfrei · ○: Arbeitstag ohne Dienst · Abw.: abwesend</caption><thead><tr><th scope="col">Mitarbeiter</th>${head}</tr></thead><tbody>${rows.map(({e,duties,planned,target,difference})=>`<tr><th scope="row" style="${window.SFScheduleEmployeeDisplay?.style(e)||''}"><span class="sf-auto-draft-person">${esc(e.personnelNo||'')} · ${esc(e.first+' '+e.last)}</span><span class="sf-auto-draft-metrics"><span>${duties} ${duties===1?'Dienst':'Dienste'}</span><span>Plan-IST <b>${hoursLabel(planned)}</b></span><span>SOLL <b>${hoursLabel(target)}</b></span><span class="sf-auto-draft-balance ${difference<-.005?'is-short':difference>.005?'is-extra':'is-balanced'}" title="Plan-IST minus SOLL">Differenz <b>${difference>.005?'+':''}${hoursLabel(difference)}</b></span></span></th>${shown.map(d=>{const a=days.get(String(e.id)+'|'+d),r=window.SFRhythm?.check(e,'O1',d),away=absent(e.id,d),free=r?.mode==='required'&&r.expected==='FREI',work=r?.mode==='required'&&r.expected==='ALLE',value=a?a.type:away?'Abw.':free?'–':work?'○':'·',state=a?'assigned':away?'absent':free?'free':work?'work':'empty',title=a?`${a.type} · ${a.start||typeById(a.type)?.start}–${a.end||typeById(a.type)?.end}`:away?'Abwesend':free?'Verbindlicher freier Tag':work?'Arbeitstag ohne Dienst: Besetzung nach Bedarf und Stundenlimits':'Kein Dienst vorgesehen';return`<td class="is-${state}" title="${esc(d+' · '+e.first+' '+e.last+' · '+title)}">${esc(value)}</td>`}).join('')}</tr>`).join('')}</tbody></table></div>`);
  }
  function renderUnresolved(remaining){
    const grouped=new Map();remaining.forEach(x=>{const key=x.date+'|'+x.type+'|'+x.reason;if(!grouped.has(key))grouped.set(key,{...x,count:0});grouped.get(key).count++});
    const list=[...grouped.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.type.localeCompare(b.type)),key=JSON.stringify([window.SFBackend?.companyId,list]);
    if(key!==unresolvedKey){unresolvedKey=key;unresolvedPage=0}
    const size=60,pages=Math.ceil(list.length/size);unresolvedPage=Math.max(0,Math.min(unresolvedPage,pages-1));
    html(el('autoUnresolved'),list.length?`${pages>1?`<div class="sf-auto-preview-nav" aria-label="Offene Positionen durchblättern"><span>Seite ${unresolvedPage+1} von ${pages} · ${list.length} Schichtgruppen</span><button type="button" class="ghost" onclick="SFAutoPlanWorkspace.unresolvedPage(-1)" ${unresolvedPage===0?'disabled':''}>Zurück</button><button type="button" class="ghost" onclick="SFAutoPlanWorkspace.unresolvedPage(1)" ${unresolvedPage===pages-1?'disabled':''}>Weiter</button></div>`:''}${list.slice(unresolvedPage*size,(unresolvedPage+1)*size).map(x=>`<div class="sf-auto-unresolved-row"><div><b>${esc(dateLabel(x.date))} · ${esc(x.coverageLabel||shiftLabel(x.type))}</b><span class="sf-auto-needed">${x.count} Position${x.count===1?'':'en'} offen</span><p>${esc(x.reason)}</p></div><button type="button" class="ghost" data-auto-date="${esc(x.date)}" onclick="SFAutoPlanWorkspace.openSchedule(this.dataset.autoDate)">Im Dienstplan prüfen</button></div>`).join('')}`:'<div class="sf-auto-empty is-good"><b>Alle offenen Positionen haben einen Vorschlag.</b><p>Prüfe die Besetzungen und übernimm sie anschließend als Entwurf.</p></div>');
  }
  function render(){
    if(!el('view-auto')||window.SFAutoPlanProgress?.isBusy())return;
    const dates=syncAutoPeriodControls(),counts=autoAssignmentCounts(),slots=autoOpenSlots(dates,counts),remaining=remainingSlots(slots,autoPlanPreview),analyzed=autoPlanAnalyzed,applied=autoPlanApplied||0,label=autoPeriodLabel(dates),count=autoPlanPreview.length,published=autoPlanPreview.some(x=>window.SFCompliance?.isWeekPublished?.(x.date));
    const available=employees.filter(e=>e.status==='active'&&!dates.every(d=>absent(e.id,d))).length;
    text('autoPeriodDates',dates.length===1?'1 Planungstag':`${new Date(dates[0]+'T12:00:00').toLocaleDateString('de-DE')} bis ${new Date(dates.at(-1)+'T12:00:00').toLocaleDateString('de-DE')} · ${dates.length} Tage`);
    text('autoStartTitle',label);text('autoStartHint',slots.length?`${slots.length} offene Position${slots.length===1?'':'en'} im gewählten Zeitraum. Bestehende Besetzungen bleiben erhalten.`:'Keine offenen Positionen im gewählten Zeitraum.');
    const optionalSlots=typeof autoOptionalSlots==='function'?autoOptionalSlots(dates,counts):[];
    if(optionalSlots.length)text('autoStartHint',`${slots.length} offene Pflichtpositionen · ${optionalSlots.length} optionale Besetzungen. Pflichtdienste haben Vorrang.`);
    el('generateAutoPlanBtn').disabled=(!slots.length&&!optionalSlots.length)||autoPlanApplying;
    el('generateAutoPlanBtn').textContent=analyzed?'↻ Vorschläge neu erstellen':'✦ Vorschläge erstellen';
    const stats=[['Offene Positionen',slots.length,'im gewählten Zeitraum'],['Vorschläge',analyzed?count:'–',analyzed?'zur Prüfung bereit':'Analyse noch nicht gestartet'],['Noch zu besetzen',analyzed?remaining.length:'–',analyzed?'nach diesen Vorschlägen':'wird bei der Analyse geprüft'],['Verfügbare Profile',available,'aktive Mitarbeiter ohne durchgehende Abwesenheit']];
    html(el('autoStats'),stats.map(([title,value,note])=>`<div class="stat"><small>${esc(title)}</small><strong>${esc(value)}</strong><em>${esc(note)}</em></div>`).join(''));
    let title,copy,tone='';
    if(applied){title=`${applied} Besetzung${applied===1?'':'en'} als Entwurf übernommen`;copy=remaining.length?`${remaining.length} Positionen sind noch offen. Prüfe sie im Dienstplan oder erstelle weitere Vorschläge.`:'Der Zeitraum ist vollständig besetzt. Prüfe den Dienstplan und veröffentliche ihn, wenn alles passt.';tone='is-good'}
    else if(!slots.length){title=analyzed&&count?`${count} optionale Besetzung${count===1?'':'en'} vorgeschlagen`:optionalSlots.length?'Optionale Besetzung möglich':'Keine offenen Positionen';copy=analyzed?'Alle Pflichtpositionen sind abgedeckt. Nicht vorgeschlagene optionale Schichten dürfen frei bleiben.':'Für diesen Zeitraum ist keine zusätzliche Pflichtbesetzung erforderlich. Optionale Schichten werden bei freien Kapazitäten vorgeschlagen.';tone='is-good'}
    else if(!analyzed){title='Bereit für deinen Planungsvorschlag';copy='Starte „Vorschläge erstellen“. Anschließend siehst du passende Besetzungen und die Gründe für offene Positionen.'}
    else if(count){title=`${count} Besetzung${count===1?'':'en'} vorgeschlagen`;copy=remaining.length?`${remaining.length} Positionen benötigen noch deine Prüfung. Die Vorschläge kannst du einzeln entfernen oder als Entwurf übernehmen.`:'Für alle offenen Positionen gibt es einen Vorschlag. Prüfe die Mitarbeiterzuordnung und übernimm die Besetzungen als Entwurf.';tone=remaining.length?'is-warning':'is-good'}
    else{title='Für die offenen Positionen wurde kein passender Mitarbeiter gefunden';copy='Unter „Noch zu besetzen“ siehst du die Gründe. Prüfe dort die Profile, den Rhythmus oder bereits geplante Dienste.';tone='is-warning'}
    html(el('autoAnalysis'),`<div class="sf-auto-status ${tone}"><b>${esc(title)}</b><p>${esc(copy)}</p></div>`);
    text('autoReviewHint',analyzed?`${label} · Ergebnis der aktuellen Planung`:'Die Zahlen für Vorschläge und verbleibende Positionen erscheinen nach der Analyse.');
    el('autoResults').hidden=!analyzed||!!applied;
    if(analyzed)renderStaircase(dates);
    text('autoSuggestionCount',count);text('autoUnresolvedCount',remaining.length);
    if(analyzed&&!applied){renderSuggestions();renderUnresolved(remaining);const skipped=typeof autoPlanOptionalSkipped==='undefined'?[]:autoPlanOptionalSkipped;let optional=el('autoOptionalSkipped');if(!optional&&el('autoSuggestions')?.after&&document.createElement){optional=document.createElement('div');optional.id='autoOptionalSkipped';el('autoSuggestions').after(optional)}if(optional)html(optional,skipped.length?`<details class="sf-auto-day"><summary><b>Optional frei geblieben (${skipped.length})</b></summary>${skipped.map(x=>`<div class="sf-auto-unresolved-row"><div><b>${esc(dateLabel(x.date))} · ${esc(shiftLabel(x.type))} · Optional</b><p>${esc(x.reason)} Keine Pflichtlücke.</p></div></div>`).join('')}</details>`:'');if(!count&&remaining.length)el('autoUnresolvedPanel').open=true}
    el('applyAutoPlanBtn').disabled=!count||autoPlanApplying||published;el('applyAutoPlanBtn').textContent=count?`${count} Vorschlag${count===1?'':'e'} als Entwurf übernehmen`:'Vorschläge als Entwurf übernehmen';
    el('clearAutoPlanBtn').disabled=(!count&&!autoPlanUnresolved.length&&!(typeof autoPlanOptionalSkipped!=='undefined'&&autoPlanOptionalSkipped.length))||autoPlanApplying;
    text('autoApplyHint',published?'Ein Vorschlag betrifft eine bereits veröffentlichte Woche. Bitte prüfe solche Änderungen einzeln im Dienstplan.':applied?'Dein Entwurf ist im Dienstplan. Dort prüfst und veröffentlichst du die Schichten für deine Mitarbeiter.':'Übernommene Vorschläge werden als Entwurf gespeichert. Im Dienstplan gibst du sie anschließend für die Mitarbeiter frei.');
    document.querySelectorAll('[data-auto-step]').forEach(node=>{const step=Number(node.dataset.autoStep),current=applied?4:analyzed?3:1;node.classList.toggle('is-current',step===current);if(step===current)node.setAttribute('aria-current','step');else node.removeAttribute('aria-current')});
    window.SFOpenShiftMarket?.renderPublishEntry?.({analyzed,applied,count,remaining});
  }
  function openSchedule(date){
    if(date){weekStart=autoMonday(date);window.SchichtFunkCalendarView?.setMode?.('week')}
    else{const dates=autoPlanningDates();if(el('autoPlanPeriod')?.value==='month')window.SchichtFunkCalendarView?.setMonth?.(dates[0].slice(0,7));else{weekStart=autoMonday(dates[0]);window.SchichtFunkCalendarView?.setMode?.('week')}}
    if(window.showView)window.showView('schedule');else switchView('schedule');
  }
  function confirmApply(count){
    const monthly=window.SFMonthOptimizer?.getResult?.(),focused=document.activeElement,locked=[...document.querySelectorAll('#view-auto button,#view-auto input,#view-auto select')].map(node=>({node,disabled:node.disabled}));locked.forEach(x=>x.node.disabled=true);
    return new Promise(resolve=>{
      const back=document.createElement('div');back.className='sf-auto-confirm-back';back.innerHTML=`<section class="sf-auto-confirm" role="dialog" aria-modal="true" aria-labelledby="sfAutoConfirmTitle"><div class="eyebrow">SCHICHTFUNK · AUTO-PLANUNG</div><h2 id="sfAutoConfirmTitle">${monthly?'Monatsentwürfe durch die optimierte Verteilung ersetzen?':'Vorschläge in den Dienstplan übernehmen?'}</h2><p><b>${count} Besetzung${count===1?'':'en'}</b> für <b>${esc(autoPeriodLabel())}</b>.</p>${monthly?`<p><b>${monthly.movable.length} bisherige flexible Entwürfe</b> werden ersetzt. Feste und geschützte Dienste bleiben erhalten.</p>`:''}<div class="sf-auto-status"><b>Als Entwurf speichern</b><p>Du kannst die Schichten anschließend im Dienstplan prüfen. Die Mitarbeiter sehen sie erst nach deiner Veröffentlichung.</p></div><footer><button type="button" class="ghost" data-cancel>Abbrechen</button><button type="button" class="primary" data-accept>Als Entwurf übernehmen</button></footer></section>`;
      document.body.appendChild(back);const cancel=back.querySelector('[data-cancel]'),accept=back.querySelector('[data-accept]');
      const done=value=>{document.removeEventListener('keydown',key);back.remove();locked.forEach(x=>x.node.disabled=x.disabled);if(focused?.isConnected)focused.focus();resolve(value)};
      const key=e=>{if(e.key==='Escape'){e.preventDefault();done(false)}else if(e.key==='Tab'){if(e.shiftKey&&document.activeElement===cancel){e.preventDefault();accept.focus()}else if(!e.shiftKey&&document.activeElement===accept){e.preventDefault();cancel.focus()}}};
      cancel.onclick=()=>done(false);accept.onclick=()=>done(true);back.onclick=e=>{if(e.target===back)done(false)};document.addEventListener('keydown',key);cancel.focus();
    });
  }
  window.SFAutoPlanWorkspace={render,explain,remainingSlots,openSchedule,confirmApply,stairMonth:value=>{stairMonth=value;renderAutoPlanning()},unresolvedPage:delta=>{unresolvedPage+=delta;renderAutoPlanning()},expandDays:open=>document.querySelectorAll('#autoSuggestions details').forEach(x=>{if(open)x.sfAutoFill?.();x.open=open})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
})();
