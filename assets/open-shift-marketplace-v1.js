// Planner-confirmed publication of actual, unassigned demand.
(function(){
  const B=window.SFBackend=window.SFBackend||{},managers=new Set(['OWNER','ADMIN','PLANNER','DISPATCHER']);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let publishing=false,preparing=false;
  function groups(slots){
    const map=new Map();for(const s of slots){const regional=s.coverageGroup==='REGIONAL-DAY',types=regional?s.alternatives||[s.type]:[s.type];for(const type of types){const key=s.date+'|'+type;if(!map.has(key))map.set(key,{date:s.date,type,...(s.coverageLabel?{coverageLabel:s.coverageLabel}:{}),...(regional?{sharedKey:s.date+'|REGIONAL-DAY'}:{}),count:0});map.get(key).count++;}}
    return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.type.localeCompare(b.type));
  }
  function positionCount(options){const shared=new Map();let total=0;for(const x of options){if(!x.sharedKey){total+=x.count;continue}shared.set(x.sharedKey,Math.max(shared.get(x.sharedKey)||0,x.count));}return total+[...shared.values()].reduce((n,x)=>n+x,0);}
  const publishBasis=()=>JSON.stringify([typeof assignments==='undefined'?null:assignments,typeof absences==='undefined'?null:absences,typeof globalSoll==='undefined'?null:globalSoll,typeof dailySoll==='undefined'?null:dailySoll,typeof TYPES==='undefined'?null:TYPES,window.SFCompliance?.policy]);
  const identity=()=>JSON.stringify([B.ready,B.companyId,B.user?.id||'',B.role]);
  function currentDates(){
    if(document.querySelector?.('#view-schedule.active')){
      const p=window.SchichtFunkCalendarView?.getPeriod?.();
      if(p?.start&&p?.end){const days=[];for(let d=new Date(p.start+'T12:00:00Z');d.toISOString().slice(0,10)<=p.end&&days.length<366;d.setUTCDate(d.getUTCDate()+1))days.push(d.toISOString().slice(0,10));return days;}
      if(typeof currentWeekDates==='function')return currentWeekDates().map(iso);
    }
    return typeof autoPlanningDates==='function'?autoPlanningDates():null;
  }
  function startTime(date,t){
    const core=window.SFSolidPlanningCore;
    return core?.instant?core.instant(date,t.start,B.companyTimeZone||'Europe/Berlin'):new Date(date+'T'+t.start).getTime();
  }
  function activeOffers(rows,timezone='Europe/Berlin',now=Date.now()){
    const date=new Intl.DateTimeFormat('sv-SE',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}),map=new Map();
    for(const o of rows||[]){
      if(o.kind!=='OPEN_POSITION'||o.is_claim||o.status!=='MARKET_OPEN'||!(Number(o.remaining_count)>0)||!Number.isFinite(Number(o.remaining_count))||!Number.isFinite(Date.parse(o.starts_at))||Date.parse(o.starts_at)<=now)continue;
      const day=date.format(new Date(o.starts_at)),key=day+'|'+o.shift_code;
      const count=Math.floor(Number(o.remaining_count));
      // The server keeps one active offer per date/model. Defensive deduplication never doubles its count.
      if(!map.has(key)||count>map.get(key).count)map.set(key,{date:day,type:String(o.shift_code),count});
    }
    return [...map.values()];
  }
  function localRemaining(slot){
    if(typeof typeById!=='function'||!typeById(slot.type))return 0;
    const info=window.SFShiftModels?.coverageInfo?.(slot.date,slot.type);if(info)return Math.max(0,info.missing);
    if(typeof getSoll!=='function'||typeof assignments==='undefined')return slot.count;
    const raw=getSoll(slot.date,slot.type),target=window.SFShiftModels?.requiredSoll?.(slot.date,slot.type,raw)??raw;
    return Math.max(0,Number(target)-new Set(assignments.filter(a=>a.date===slot.date&&a.type===slot.type&&a.status!=='CANCELLED'&&a._dbStatus!=='CANCELLED').map(a=>String(a.employeeId))).size);
  }
  function decorateSchedule(){
    const allowed=B.ready&&managers.has(B.role)&&B.companyId&&!B.companySwitching&&!window.__sfDemoCloudAdapterV2;
    const state=allowed?window.SFShiftMarketplace?.getOpenOfferState?.():null;
    const valid=state&&!state.error&&Date.now()-state.readAt<65000;
    const offers=valid?activeOffers(state.offers,B.companyTimeZone||'Europe/Berlin').map(o=>({...o,count:Math.min(o.count,localRemaining(o))})).filter(o=>o.count>0):[];
    const marked=new Set();
    const badge=(host,list,withType=false)=>{
      if(!list.length)return;marked.add(host);host.classList.add('sf-in-shift-market');
      const text='Im Schichtmarkt · '+list.map(o=>(withType?o.type+': ':'')+o.count+(o.count===1?' Platz':' Plätze')).join(' · ');
      let mark=host.querySelector(':scope > .sf-shift-market-badge');if(!mark){mark=document.createElement('span');mark.className='sf-shift-market-badge';host.appendChild(mark);}
      if(mark.textContent!==text)mark.textContent=text;mark.title='Noch unbesetzt. Meldungen im Schichtmarkt benötigen die Freigabe des Planers.';
    };
    document.querySelectorAll('#view-schedule .sf-week-shift[data-date][data-type],#view-schedule .pill[data-date][data-type]').forEach(host=>badge(host,offers.filter(o=>o.date===host.dataset.date&&o.type===host.dataset.type)));
    document.querySelectorAll('#view-schedule [data-month-date]').forEach(host=>badge(host,offers.filter(o=>o.date===host.dataset.monthDate),true));
    const dates=typeof autoPlanningDates==='function'?autoPlanningDates():[];
    document.querySelectorAll('.sf-auto-staffing tr[data-staffing-shift]').forEach(row=>row.querySelectorAll('td').forEach((cell,i)=>badge(cell,offers.filter(o=>o.date===dates[i]&&o.type===row.dataset.staffingShift))));
    document.querySelectorAll('.sf-in-shift-market').forEach(host=>{if(!marked.has(host)){host.classList.remove('sf-in-shift-market');host.querySelector(':scope > .sf-shift-market-badge')?.remove();}});
    const view=document.querySelector('#view-schedule.active');let entry=document.getElementById('sfMarketScheduleEntry');
    if(!allowed||!view){entry?.remove();return;}
    if(!entry){entry=document.createElement('section');entry.id='sfMarketScheduleEntry';entry.className='sf-open-market-entry';entry.setAttribute('aria-label','Offene Dienste im Schichtmarkt');entry.innerHTML='<div><b>Offene Dienste gesammelt anbieten</b><p data-market-period></p><small data-market-state></small></div><button type="button" class="primary" data-market-all>Alle offenen Dienste in den Schichtmarkt</button>';view.prepend(entry);entry.querySelector('button').onclick=()=>openPublishDialog({all:true,dates:currentDates()});}
    const period=currentDates()||[],label=period.length?period[0]+' bis '+period.at(-1)+' · Nur künftig beginnende Dienste':'Sichtbarer Planungszeitraum';
    if(entry.querySelector('[data-market-period]').textContent!==label)entry.querySelector('[data-market-period]').textContent=label;
    const regional=window.SFCompliance?.policy?.solidPlanningRules?.regionalDayStaffing,regionalCodes=regional?[...(regional.weekdayCodes||[]),...(regional.specialCodes||[])]:[];
    const count=positionCount(offers.filter(o=>period.includes(o.date)).map(o=>regionalCodes.includes(o.type)?{...o,sharedKey:o.date+'|REGIONAL-DAY'}:o)),status=state?.error?'Schichtmarktstatus konnte nicht geladen werden.':valid?count+' offene Plätze dieses Zeitraums sind aktuell im Schichtmarkt.':'Schichtmarktstatus wird aktualisiert …';
    if(entry.querySelector('[data-market-state]').textContent!==status)entry.querySelector('[data-market-state]').textContent=status;
    entry.querySelector('button').disabled=publishing||preparing||!!(typeof autoPlanPreview!=='undefined'&&autoPlanPreview.length);
  }
  function renderPublishEntry(state){
    const host=document.getElementById('autoAnalysis');if(!host)return;
    document.getElementById('sfOpenMarketEntry')?.remove();
    if(!managers.has(B.role)||!state.analyzed||window.__sfDemoCloudAdapterV2)return;
    const box=document.createElement('div');box.id='sfOpenMarketEntry';box.className='sf-auto-status sf-open-market-entry';
    const blocked=state.count>0,amount=state.remaining.length;
    box.innerHTML=`<div><b>Offene Plätze im Schicht-Marktplatz anbieten</b><p>${blocked?'Übernimm zuerst die gewünschten Vorschläge als Entwurf oder entferne sie. Anschließend kannst du den tatsächlichen Restbedarf veröffentlichen.':amount?`${amount} Plätze sind noch offen. Du kannst alle offenen Dienste gesammelt einstellen oder einzeln auswählen. Jede Übernahme benötigt deine Freigabe.`:'Für diesen Zeitraum sind keine Plätze mehr offen.'}</p></div><button type="button" class="primary" id="sfPublishOpenShifts" ${blocked||!amount||publishing?'disabled':''}>Offene Plätze auswählen</button>`;
    const all=document.createElement('button');all.type='button';all.id='sfPublishAllOpenShifts';all.className='primary';all.textContent='Alle offenen Dienste in den Schichtmarkt';all.disabled=blocked||!amount||publishing||preparing;all.onclick=()=>openPublishDialog({all:true});box.querySelector('button').before(all);
    host.appendChild(box);box.querySelector('#sfPublishOpenShifts').onclick=()=>openPublishDialog();
  }
  async function rpc(name,args){const q=await B.client.rpc(name,args);if(q.error)throw q.error;return q.data;}
  async function openPublishDialog(config={}){
    if(publishing||preparing||document.getElementById('sfOpenMarketPublish'))return;
    const company=B.companyId,owner=identity(),dates=config.dates||currentDates(),period=JSON.stringify(currentDates()),allMode=config.all===true;
    try{
      if(!B.ready||!managers.has(B.role)||!B.companyId||!B.client)throw Error('Die Planungsdaten sind noch nicht bereit.');
      if(typeof autoPlanPreview!=='undefined'&&autoPlanPreview.length)throw Error('Bitte die Vorplanung zuerst als Entwurf übernehmen oder entfernen.');
      preparing=true;
      if(B.syncing||B.autoPlanApplying||B.companySwitching||B.teamRhythmSaving||B.shiftModelSaving){throw Error('Planungsdaten werden gerade gespeichert. Bitte versuche es gleich erneut.');}
      clearTimeout(B.syncTimer);B.syncTimer=null;await B.sync?.();if(B.lastSyncError)throw B.lastSyncError;
      await B.hydrate?.();if(identity()!==owner||period!==JSON.stringify(currentDates()))throw Error('Unternehmen oder Zeitraum wurden geändert. Bitte erneut starten.');
      const options=groups(autoOpenSlots(dates||undefined)).filter(s=>{const t=typeById(s.type);return t&&startTime(s.date,t)>Date.now();});
      if(!options.length){window.showSaveToast?.('Keine offenen Plätze','Der gewählte Zeitraum ist bereits besetzt.');return;}
      const basis=publishBasis();
      const back=document.createElement('div');back.id='sfOpenMarketPublish';back.className='sf-auto-confirm-back';
      back.innerHTML=`<section class="sf-auto-confirm sf-open-market-confirm" role="dialog" aria-modal="true" aria-labelledby="sfOpenMarketTitle"><header><div class="eyebrow">AUTO-PLANUNG · SCHICHT-MARKTPLATZ</div><h2 id="sfOpenMarketTitle">Offene Plätze veröffentlichen</h2><p>Die ausgewählten Dienste werden für Mitarbeiter sichtbar. Eine Meldung ist zunächst eine Anfrage; erst deine Freigabe trägt den Mitarbeiter verbindlich ein.</p></header><main><label class="sf-open-market-all"><input type="checkbox" data-select-all checked> Alle offenen Dienste auswählen</label><div class="sf-open-market-options">${options.map((s,i)=>{const t=typeById(s.type);return `<label class="sf-open-market-option"><input type="checkbox" data-slot="${i}" checked><span><b>${esc(new Date(s.date+'T12:00:00').toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'}))} · ${esc(s.sharedKey?s.type:(s.coverageLabel||t.name||s.type))}</b><small>${esc(t.start)}–${esc(t.end)} Uhr · ${s.count} ${s.count===1?'Platz':'Plätze'} offen</small></span><input type="number" data-count="${i}" value="${s.count}" min="1" max="${s.count}" aria-label="Anzahl Plätze für ${esc(s.type)} am ${esc(s.date)}"></label>`;}).join('')}</div><label for="sfOpenMarketPublishNote">Hinweis für Mitarbeiter (optional)</label><textarea id="sfOpenMarketPublishNote" maxlength="1000" placeholder="Zum Beispiel: Unterstützung für den Dezemberplan"></textarea><p data-publish-summary aria-live="polite"></p><p data-publish-error role="alert"></p></main><footer><button type="button" class="ghost" data-cancel>Abbrechen</button><button type="button" class="primary" data-publish>Im Marktplatz veröffentlichen</button></footer></section>`;
      if(allMode){
        const count=positionCount(options),main=back.querySelector('main');
        back.querySelector('h2').textContent='Alle offenen Dienste in den Schichtmarkt?';
        main.innerHTML=`<p><b>${count} offene Plätze in ${options.length} Diensten</b> · ${esc(options[0].date)} bis ${esc(options.at(-1).date)}</p><p>Alle künftig beginnenden, noch unbesetzten Plätze dieses Zeitraums werden gesammelt angeboten. Bestehende Angebote werden aktualisiert und nicht doppelt angelegt. Der Dienstplan bleibt unverändert.</p>${options.some(s=>s.sharedKey)?'<p>Die Tagesdienstvarianten teilen sich dieselben offenen Plätze.</p>':''}<details><summary>Dienste ansehen</summary><ul>${options.map(s=>`<li>${esc(s.date)} · ${esc(s.sharedKey?s.type:(s.coverageLabel||s.type))} · ${s.count} Plätze</li>`).join('')}</ul></details><label for="sfOpenMarketPublishNote">Hinweis für Mitarbeiter (optional)</label><textarea id="sfOpenMarketPublishNote" maxlength="1000"></textarea><p data-publish-summary aria-live="polite"></p><p data-publish-error role="alert"></p>`;
        back.querySelector('[data-publish]').textContent='Alle offenen Dienste einstellen';
      }
      const x=document.createElement('button');x.type='button';x.className='sf-open-market-close';x.dataset.close='';x.textContent='×';x.setAttribute('aria-label','Schichtmarktfenster schließen');back.querySelector('header').appendChild(x);
      document.body.appendChild(back);
      const submit=back.querySelector('[data-publish]'),cancel=back.querySelector('[data-cancel]'),all=back.querySelector('[data-select-all]');
      let saving=false;
      back.addEventListener('keydown',e=>{if(saving&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();}},true);
      const closeAccessible=B.bindAccessibleModal?.(back,{initialFocus:'[data-cancel]'})||(()=>back.remove());
      const close=()=>{if(!saving)closeAccessible();};cancel.onclick=x.onclick=close;
      const selected=()=>allMode?options:[...back.querySelectorAll('[data-slot]:checked')].map(x=>{const i=Number(x.dataset.slot),slot=options[i],input=back.querySelector('[data-count="'+i+'"]');return {...slot,count:Math.max(1,Math.min(slot.count,Math.floor(Number(input.value)||1)))}});
      function update(){const checked=selected(),count=positionCount(checked);if(all){all.checked=checked.length===options.length;all.indeterminate=checked.length>0&&checked.length<options.length;}submit.disabled=saving||!count;back.querySelector('[data-publish-summary]').textContent=`${count} ${count===1?'Platz':'Plätze'} in ${checked.length} ${checked.length===1?'Dienst':'Diensten'} ausgewählt`+(checked.some(x=>x.sharedKey)?' · Tagesdienstvarianten teilen sich dieselben Plätze.':'');}
      if(all)all.onchange=()=>{back.querySelectorAll('[data-slot]').forEach(x=>x.checked=all.checked);update();};back.querySelectorAll('[data-slot]').forEach(x=>x.onchange=update);back.querySelectorAll('[data-count]').forEach(x=>x.oninput=update);update();
      submit.onclick=async()=>{
        if(saving||!selected().length)return;
        const slots=selected();let committed=false;saving=true;publishing=true;B.openMarketPublishing=true;
        back.querySelectorAll('button,input,textarea').forEach(x=>x.disabled=true);submit.textContent='Wird veröffentlicht …';
        try{
          if(identity()!==owner||period!==JSON.stringify(currentDates()))throw Error('Unternehmen oder Zeitraum wurden geändert. Bitte erneut starten.');
          if(publishBasis()!==basis)throw Error('Der Dienstplan oder Bedarf wurde geändert. Bitte das Fenster schließen und erneut starten.');
          if(typeof autoPlanPreview!=='undefined'&&autoPlanPreview.length)throw Error('Bitte die Vorplanung zuerst übernehmen oder entfernen.');
          const result=await rpc('manager_publish_open_shifts',{p_company_id:company,p_slots:slots,p_note:back.querySelector('textarea').value.trim()});
          committed=true;saving=false;closeAccessible();window.showSaveToast?.('Offene Plätze veröffentlicht',slots.some(x=>x.sharedKey)?'Tagesdienstvarianten teilen sich den gemeinsamen Bedarf.':`${result.published_positions} Plätze stehen im Schicht-Marktplatz zur Verfügung.`);
          await window.SFShiftMarketplace?.refreshManager?.();window.renderAutoPlanning?.();decorateSchedule();
        }catch(e){if(committed){window.showSaveToast?.('Angebote gespeichert','Die Marktplatzanzeige konnte nicht aktualisiert werden. Bitte neu laden.');return;}back.querySelector('[data-publish-error]').textContent=e.message||String(e);saving=false;back.querySelectorAll('button,input,textarea').forEach(x=>x.disabled=false);submit.textContent=allMode?'Alle offenen Dienste einstellen':'Im Marktplatz veröffentlichen';update();}
        finally{publishing=false;B.openMarketPublishing=false;window.renderAutoPlanning?.();}
      };
    }catch(e){window.showSaveToast?.('Veröffentlichung nicht möglich',e.message||String(e));}
    finally{preparing=false;}
  }
  window.SFOpenShiftMarket={groups,positionCount,activeOffers,renderPublishEntry,openPublishDialog,decorateSchedule};
  if(document.addEventListener){
    document.addEventListener('sf:open-market-updated',decorateSchedule);
    if(typeof MutationObserver==='function'){let pending=false;new MutationObserver(()=>{if(pending)return;pending=true;setTimeout(()=>{pending=false;decorateSchedule();},60);}).observe(document.body,{childList:true,subtree:true});}
    if(typeof setInterval==='function')setInterval(decorateSchedule,1000);
    window.addEventListener?.('focus',()=>{if(B.ready&&managers.has(B.role)&&document.querySelector('#view-schedule.active,#view-auto.active'))window.SFShiftMarketplace?.refreshManager?.();});
  }
})();

