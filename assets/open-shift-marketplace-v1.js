// Planner-confirmed publication of actual, unassigned demand.
(function(){
  const B=window.SFBackend=window.SFBackend||{},managers=new Set(['OWNER','ADMIN','PLANNER','DISPATCHER']);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let publishing=false;
  function groups(slots){
    const map=new Map();for(const s of slots){const key=s.date+'|'+s.type;if(!map.has(key))map.set(key,{date:s.date,type:s.type,count:0});map.get(key).count++;}
    return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.type.localeCompare(b.type));
  }
  function renderPublishEntry(state){
    const host=document.getElementById('autoAnalysis');if(!host)return;
    document.getElementById('sfOpenMarketEntry')?.remove();
    if(!managers.has(B.role)||!state.analyzed||window.__sfDemoCloudAdapterV2)return;
    const box=document.createElement('div');box.id='sfOpenMarketEntry';box.className='sf-auto-status sf-open-market-entry';
    const blocked=state.count>0,amount=state.remaining.length;
    box.innerHTML=`<div><b>Offene Plätze im Schicht-Marktplatz anbieten</b><p>${blocked?'Übernimm zuerst die gewünschten Vorschläge als Entwurf oder entferne sie. Anschließend kannst du den tatsächlichen Restbedarf veröffentlichen.':amount?`${amount} Plätze sind noch offen. Wähle die Dienste aus und bestätige die Veröffentlichung. Jede Übernahme benötigt deine Freigabe.`:'Für diesen Zeitraum sind keine Plätze mehr offen.'}</p></div><button type="button" class="primary" id="sfPublishOpenShifts" ${blocked||!amount||publishing?'disabled':''}>Offene Plätze auswählen</button>`;
    host.appendChild(box);box.querySelector('button').onclick=openPublishDialog;
  }
  async function rpc(name,args){const q=await B.client.rpc(name,args);if(q.error)throw q.error;return q.data;}
  async function openPublishDialog(){
    if(publishing)return;
    if(!B.ready||!managers.has(B.role)||!B.companyId||!B.client)throw Error('Die Planungsdaten sind noch nicht bereit.');
    if(autoPlanPreview.length)return;
    const company=B.companyId;
    try{
      if(B.syncing||B.autoPlanApplying||B.companySwitching||B.teamRhythmSaving||B.shiftModelSaving){throw Error('Planungsdaten werden gerade gespeichert. Bitte versuche es gleich erneut.');}
      clearTimeout(B.syncTimer);B.syncTimer=null;await B.sync?.();if(B.lastSyncError)throw B.lastSyncError;
      await B.hydrate?.();if(B.companyId!==company)throw Error('Das Unternehmen wurde gewechselt. Bitte erneut auswählen.');
      const options=groups(autoOpenSlots()).filter(s=>{const t=typeById(s.type);return t&&new Date(s.date+'T'+t.start)>new Date();});
      if(!options.length){window.showSaveToast?.('Keine offenen Plätze','Der gewählte Zeitraum ist bereits besetzt.');return;}
      const back=document.createElement('div');back.id='sfOpenMarketPublish';back.className='sf-auto-confirm-back';
      back.innerHTML=`<section class="sf-auto-confirm sf-open-market-confirm" role="dialog" aria-modal="true" aria-labelledby="sfOpenMarketTitle"><header><div class="eyebrow">AUTO-PLANUNG · SCHICHT-MARKTPLATZ</div><h2 id="sfOpenMarketTitle">Offene Plätze veröffentlichen</h2><p>Die ausgewählten Dienste werden für Mitarbeiter sichtbar. Eine Meldung ist zunächst eine Anfrage; erst deine Freigabe trägt den Mitarbeiter verbindlich ein.</p></header><main><label class="sf-open-market-all"><input type="checkbox" data-select-all checked> Alle offenen Dienste auswählen</label><div class="sf-open-market-options">${options.map((s,i)=>{const t=typeById(s.type);return `<label class="sf-open-market-option"><input type="checkbox" data-slot="${i}" checked><span><b>${esc(new Date(s.date+'T12:00:00').toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'}))} · ${esc(t.name||s.type)}</b><small>${esc(t.start)}–${esc(t.end)} Uhr · ${s.count} ${s.count===1?'Platz':'Plätze'} offen</small></span><input type="number" data-count="${i}" value="${s.count}" min="1" max="${s.count}" aria-label="Anzahl Plätze für ${esc(s.type)} am ${esc(s.date)}"></label>`;}).join('')}</div><label for="sfOpenMarketPublishNote">Hinweis für Mitarbeiter (optional)</label><textarea id="sfOpenMarketPublishNote" maxlength="1000" placeholder="Zum Beispiel: Unterstützung für den Dezemberplan"></textarea><p data-publish-summary aria-live="polite"></p><p data-publish-error role="alert"></p></main><footer><button type="button" class="ghost" data-cancel>Abbrechen</button><button type="button" class="primary" data-publish>Im Marktplatz veröffentlichen</button></footer></section>`;
      document.body.appendChild(back);
      const submit=back.querySelector('[data-publish]'),cancel=back.querySelector('[data-cancel]'),all=back.querySelector('[data-select-all]');
      let saving=false;
      back.addEventListener('keydown',e=>{if(saving&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();}},true);
      const closeAccessible=B.bindAccessibleModal?.(back,{initialFocus:'[data-cancel]'})||(()=>back.remove());
      const close=()=>{if(!saving)closeAccessible();};cancel.onclick=close;back.onclick=e=>{if(e.target===back)close();};
      const selected=()=>[...back.querySelectorAll('[data-slot]:checked')].map(x=>{const i=Number(x.dataset.slot),slot=options[i],input=back.querySelector('[data-count="'+i+'"]');return {...slot,count:Math.max(1,Math.min(slot.count,Math.floor(Number(input.value)||1)))}});
      function update(){const checked=selected(),count=checked.reduce((n,x)=>n+x.count,0);all.checked=checked.length===options.length;all.indeterminate=checked.length>0&&checked.length<options.length;submit.disabled=saving||!count;back.querySelector('[data-publish-summary]').textContent=`${count} ${count===1?'Platz':'Plätze'} in ${checked.length} ${checked.length===1?'Dienst':'Diensten'} ausgewählt`;}
      all.onchange=()=>{back.querySelectorAll('[data-slot]').forEach(x=>x.checked=all.checked);update();};back.querySelectorAll('[data-slot]').forEach(x=>x.onchange=update);back.querySelectorAll('[data-count]').forEach(x=>x.oninput=update);update();
      submit.onclick=async()=>{
        if(saving||!selected().length)return;
        const slots=selected();saving=true;publishing=true;B.openMarketPublishing=true;
        back.querySelectorAll('button,input,textarea').forEach(x=>x.disabled=true);submit.textContent='Wird veröffentlicht …';
        try{
          if(B.companyId!==company)throw Error('Das Unternehmen wurde gewechselt. Bitte erneut auswählen.');
          const result=await rpc('manager_publish_open_shifts',{p_company_id:company,p_slots:slots,p_note:back.querySelector('textarea').value.trim()});
          saving=false;closeAccessible();window.showSaveToast?.('Offene Plätze veröffentlicht',`${result.published_positions} Plätze stehen im Schicht-Marktplatz zur Verfügung.`);
          window.SFShiftMarketplace?.refreshManager?.();window.renderAutoPlanning?.();
        }catch(e){back.querySelector('[data-publish-error]').textContent=e.message||String(e);saving=false;back.querySelectorAll('button,input,textarea').forEach(x=>x.disabled=false);submit.textContent='Im Marktplatz veröffentlichen';update();}
        finally{publishing=false;B.openMarketPublishing=false;window.renderAutoPlanning?.();}
      };
    }catch(e){window.showSaveToast?.('Veröffentlichung nicht möglich',e.message||String(e));}
  }
  window.SFOpenShiftMarket={groups,renderPublishEntry,openPublishDialog};
})();

