// SchichtFunk – verständlicher Ablauf für die bestehende Auto-Planung.
(function(){
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const el=id=>document.getElementById(id);
  const text=(id,value)=>{if(el(id))el(id).textContent=value};
  const dateLabel=date=>new Date(date+'T12:00:00').toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'2-digit'});
  const shiftLabel=code=>{const t=typeById(code);return t?.name&&t.name!==code?`${code} · ${t.name}`:code};
  function remainingSlots(slots,preview){
    const counts=new Map();preview.forEach(x=>{const key=x.date+'|'+x.type;counts.set(key,(counts.get(key)||0)+1)});
    const known=new Map();autoPlanUnresolved.forEach(x=>{const key=x.date+'|'+x.type;if(!known.has(key))known.set(key,x.reason)});
    return slots.filter(x=>{const key=x.date+'|'+x.type,n=counts.get(key)||0;if(n){counts.set(key,n-1);return false}return true}).map(x=>({...x,reason:known.get(x.date+'|'+x.type)||'Für diese Position liegt kein Vorschlag vor. Bitte prüfe die Besetzung im Dienstplan.'}));
  }
  function explain(slot,simulated=[]){
    const {type,date}=slot;
    let pool=employees.filter(e=>e.status==='active');
    if(!pool.length)return'Keine aktiven Mitarbeiter vorhanden. Prüfe die Mitarbeiterprofile.';
    pool=pool.filter(e=>(e.shifts||[]).includes(type));
    if(!pool.length)return`Kein aktiver Mitarbeiter hat eine Freigabe für ${type}. Prüfe die Schichtfreigaben.`;
    pool=pool.filter(e=>window.SFShiftModels?.allowsEmployee?.(type,e)!==false);
    if(!pool.length)return'Für diese Schicht fehlt ein aktiver zuständiger Mitarbeiter mit Schichtfreigabe.';
    pool=pool.filter(e=>!absent(e.id,date));
    if(!pool.length)return'Alle passenden Mitarbeiter sind an diesem Tag abwesend.';
    const all=[...assignments,...simulated];pool=pool.filter(e=>!all.some(a=>String(a.employeeId)===String(e.id)&&a.date===date));
    if(!pool.length)return'Die passenden Mitarbeiter sind an diesem Tag bereits eingeplant.';
    pool=pool.filter(e=>{const r=window.sfRhythmCheck?.(e,type,date);return !r||r.mode!=='required'||r.allowed});
    if(!pool.length)return'Der verbindliche Rhythmus der verfügbaren Mitarbeiter passt an diesem Tag nicht zu dieser Schicht.';
    const timePool=pool.filter(e=>!window.SFAutoPlanGuard||window.SFAutoPlanGuard.passesTimeRules(e.id,type,date,simulated));
    if(!timePool.length)return'Schichtdauer, Ruhezeit oder Überschneidung verhindern die Besetzung. Prüfe die Schichtzeiten und benachbarte Dienste.';
    if(el('autoRespectHours')?.checked!==false)return'Für die übrigen passenden Mitarbeiter reichen die freien Wochen- oder Monatsstunden nicht aus. Prüfe Vertragsstunden und Auslastung.';
    return'Unter den aktuellen Regeln ist kein passender Mitarbeiter verfügbar. Prüfe Profile und vorhandene Schichten.';
  }
  function renderSuggestions(){
    const groups=new Map();autoPlanPreview.forEach((x,i)=>{if(!groups.has(x.date))groups.set(x.date,[]);groups.get(x.date).push({...x,index:i})});
    const previous=[...(el('autoSuggestions').querySelectorAll?.('details[data-auto-day]')||[])],openDates=new Set(previous.filter(x=>x.open).map(x=>x.dataset.autoDay)),sameDays=previous.some(x=>groups.has(x.dataset.autoDay));
    el('autoSuggestions').innerHTML=groups.size?[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([date,list],n)=>`<details class="sf-auto-day" data-auto-day="${esc(date)}" ${(sameDays?openDates.has(date):n===0)?'open':''}><summary><b>${esc(dateLabel(date))}</b><span>${list.length} Besetzung${list.length===1?'':'en'}</span></summary><div class="sf-auto-day-list">${list.map(x=>{const e=employees.find(e=>String(e.id)===String(x.employeeId));return `<div class="sf-auto-suggestion-row"><div class="sf-auto-shift"><b>${esc(shiftLabel(x.type))}</b><small>${esc(x.start)}–${esc(x.end)} Uhr</small></div><div class="sf-auto-person"><b>${esc(e?e.first+' '+e.last:'Mitarbeiter')}</b><small>${esc(x.reason)}</small></div><button type="button" class="ghost" onclick="removeAutoSuggestion(${x.index})" aria-label="Vorschlag für ${esc(e?e.first+' '+e.last:'Mitarbeiter')} am ${esc(date)} entfernen">Entfernen</button></div>`}).join('')}</div></details>`).join(''):'<div class="sf-auto-empty"><b>Keine Besetzung vorgeschlagen</b><p>Die offenen Positionen und ihre Gründe findest du unter „Noch zu besetzen“.</p></div>';
  }
  function renderUnresolved(remaining){
    const grouped=new Map();remaining.forEach(x=>{const key=x.date+'|'+x.type+'|'+x.reason;if(!grouped.has(key))grouped.set(key,{...x,count:0});grouped.get(key).count++});
    el('autoUnresolved').innerHTML=grouped.size?[...grouped.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.type.localeCompare(b.type)).map(x=>`<div class="sf-auto-unresolved-row"><div><b>${esc(dateLabel(x.date))} · ${esc(shiftLabel(x.type))}</b><span class="sf-auto-needed">${x.count} Position${x.count===1?'':'en'} offen</span><p>${esc(x.reason)}</p></div><button type="button" class="ghost" data-auto-date="${esc(x.date)}" onclick="SFAutoPlanWorkspace.openSchedule(this.dataset.autoDate)">Im Dienstplan prüfen</button></div>`).join(''):'<div class="sf-auto-empty is-good"><b>Alle offenen Positionen haben einen Vorschlag.</b><p>Prüfe die Besetzungen und übernimm sie anschließend als Entwurf.</p></div>';
  }
  function render(){
    if(!el('view-auto'))return;
    const dates=syncAutoPeriodControls(),slots=autoOpenSlots(),remaining=remainingSlots(slots,autoPlanPreview),analyzed=autoPlanAnalyzed,applied=autoPlanApplied||0,label=autoPeriodLabel(dates),count=autoPlanPreview.length,published=autoPlanPreview.some(x=>window.SFCompliance?.isWeekPublished?.(x.date));
    const available=employees.filter(e=>e.status==='active'&&!dates.every(d=>absent(e.id,d))).length;
    text('autoPeriodDates',dates.length===1?'1 Planungstag':`${new Date(dates[0]+'T12:00:00').toLocaleDateString('de-DE')} bis ${new Date(dates.at(-1)+'T12:00:00').toLocaleDateString('de-DE')} · ${dates.length} Tage`);
    text('autoStartTitle',label);text('autoStartHint',slots.length?`${slots.length} offene Position${slots.length===1?'':'en'} im gewählten Zeitraum. Bestehende Besetzungen bleiben erhalten.`:'Keine offenen Positionen im gewählten Zeitraum.');
    const optionalSlots=typeof autoOptionalSlots==='function'?autoOptionalSlots():[];
    if(optionalSlots.length)text('autoStartHint',`${slots.length} offene Pflichtpositionen · ${optionalSlots.length} optionale Besetzungen. Pflichtdienste haben Vorrang.`);
    el('generateAutoPlanBtn').disabled=(!slots.length&&!optionalSlots.length)||autoPlanApplying;
    el('generateAutoPlanBtn').textContent=analyzed?'↻ Vorschläge neu erstellen':'✦ Vorschläge erstellen';
    const stats=[['Offene Positionen',slots.length,'im gewählten Zeitraum'],['Vorschläge',analyzed?count:'–',analyzed?'zur Prüfung bereit':'Analyse noch nicht gestartet'],['Noch zu besetzen',analyzed?remaining.length:'–',analyzed?'nach diesen Vorschlägen':'wird bei der Analyse geprüft'],['Verfügbare Profile',available,'aktive Mitarbeiter ohne durchgehende Abwesenheit']];
    el('autoStats').innerHTML=stats.map(([title,value,note])=>`<div class="stat"><small>${esc(title)}</small><strong>${esc(value)}</strong><em>${esc(note)}</em></div>`).join('');
    let title,copy,tone='';
    if(applied){title=`${applied} Besetzung${applied===1?'':'en'} als Entwurf übernommen`;copy=remaining.length?`${remaining.length} Positionen sind noch offen. Prüfe sie im Dienstplan oder erstelle weitere Vorschläge.`:'Der Zeitraum ist vollständig besetzt. Prüfe den Dienstplan und veröffentliche ihn, wenn alles passt.';tone='is-good'}
    else if(!slots.length){title=analyzed&&count?`${count} optionale Besetzung${count===1?'':'en'} vorgeschlagen`:optionalSlots.length?'Optionale Besetzung möglich':'Keine offenen Positionen';copy=analyzed?'Alle Pflichtpositionen sind abgedeckt. Nicht vorgeschlagene optionale Schichten dürfen frei bleiben.':'Für diesen Zeitraum ist keine zusätzliche Pflichtbesetzung erforderlich. Optionale Schichten werden bei freien Kapazitäten vorgeschlagen.';tone='is-good'}
    else if(!analyzed){title='Bereit für deinen Planungsvorschlag';copy='Starte „Vorschläge erstellen“. Anschließend siehst du passende Besetzungen und die Gründe für offene Positionen.'}
    else if(count){title=`${count} Besetzung${count===1?'':'en'} vorgeschlagen`;copy=remaining.length?`${remaining.length} Positionen benötigen noch deine Prüfung. Die Vorschläge kannst du einzeln entfernen oder als Entwurf übernehmen.`:'Für alle offenen Positionen gibt es einen Vorschlag. Prüfe die Mitarbeiterzuordnung und übernimm die Besetzungen als Entwurf.';tone=remaining.length?'is-warning':'is-good'}
    else{title='Für die offenen Positionen wurde kein passender Mitarbeiter gefunden';copy='Unter „Noch zu besetzen“ siehst du die Gründe. Prüfe dort die Profile, den Rhythmus oder bereits geplante Dienste.';tone='is-warning'}
    el('autoAnalysis').innerHTML=`<div class="sf-auto-status ${tone}"><b>${esc(title)}</b><p>${esc(copy)}</p></div>`;
    text('autoReviewHint',analyzed?`${label} · Ergebnis der aktuellen Planung`:'Die Zahlen für Vorschläge und verbleibende Positionen erscheinen nach der Analyse.');
    el('autoResults').hidden=!analyzed||!!applied;
    text('autoSuggestionCount',count);text('autoUnresolvedCount',remaining.length);
    if(analyzed&&!applied){renderSuggestions();renderUnresolved(remaining);const skipped=typeof autoPlanOptionalSkipped==='undefined'?[]:autoPlanOptionalSkipped;if(skipped.length)el('autoSuggestions').innerHTML+=`<details class="sf-auto-day"><summary><b>Optional frei geblieben (${skipped.length})</b></summary>${skipped.map(x=>`<div class="sf-auto-unresolved-row"><div><b>${esc(dateLabel(x.date))} · ${esc(shiftLabel(x.type))} · Optional</b><p>${esc(x.reason)} Keine Pflichtlücke.</p></div></div>`).join('')}</details>`;if(!count&&remaining.length)el('autoUnresolvedPanel').open=true}
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
    const focused=document.activeElement,locked=[...document.querySelectorAll('#view-auto button,#view-auto input,#view-auto select')].map(node=>({node,disabled:node.disabled}));locked.forEach(x=>x.node.disabled=true);
    return new Promise(resolve=>{
      const back=document.createElement('div');back.className='sf-auto-confirm-back';back.innerHTML=`<section class="sf-auto-confirm" role="dialog" aria-modal="true" aria-labelledby="sfAutoConfirmTitle"><div class="eyebrow">SCHICHTFUNK · AUTO-PLANUNG</div><h2 id="sfAutoConfirmTitle">Vorschläge in den Dienstplan übernehmen?</h2><p><b>${count} Besetzung${count===1?'':'en'}</b> für <b>${esc(autoPeriodLabel())}</b>.</p><div class="sf-auto-status"><b>Als Entwurf speichern</b><p>Du kannst die Schichten anschließend im Dienstplan prüfen. Die Mitarbeiter sehen sie erst nach deiner Veröffentlichung.</p></div><footer><button type="button" class="ghost" data-cancel>Abbrechen</button><button type="button" class="primary" data-accept>Als Entwurf übernehmen</button></footer></section>`;
      document.body.appendChild(back);const cancel=back.querySelector('[data-cancel]'),accept=back.querySelector('[data-accept]');
      const done=value=>{document.removeEventListener('keydown',key);back.remove();locked.forEach(x=>x.node.disabled=x.disabled);if(focused?.isConnected)focused.focus();resolve(value)};
      const key=e=>{if(e.key==='Escape'){e.preventDefault();done(false)}else if(e.key==='Tab'){if(e.shiftKey&&document.activeElement===cancel){e.preventDefault();accept.focus()}else if(!e.shiftKey&&document.activeElement===accept){e.preventDefault();cancel.focus()}}};
      cancel.onclick=()=>done(false);accept.onclick=()=>done(true);back.onclick=e=>{if(e.target===back)done(false)};document.addEventListener('keydown',key);cancel.focus();
    });
  }
  window.SFAutoPlanWorkspace={render,explain,remainingSlots,openSchedule,confirmApply,expandDays:open=>document.querySelectorAll('#autoSuggestions details').forEach(x=>x.open=open)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
})();

