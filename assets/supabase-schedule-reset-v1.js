// SchichtFunk – confirmed reset of the visibly selected planning month.
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  const C=window.SFCompliance=window.SFCompliance||{};
  if(B.__scheduleResetV1)return;B.__scheduleResetV1=true;
  const ALLOWED=new Set(['OWNER','ADMIN']);
  let busy=false,preparing=false;

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function css(){
    if(document.getElementById('sfScheduleResetCss'))return;
    const s=document.createElement('style');s.id='sfScheduleResetCss';s.textContent=`
      .sf-plan-reset-btn{border:1px solid #753443!important;background:#2b1820!important;color:#ff9cab!important;border-radius:8px!important;padding:8px 10px!important;font-weight:800!important;white-space:nowrap}.sf-plan-reset-btn:hover{background:#3b1d27!important;border-color:#a34355!important;color:#ffc0ca!important}
      .sf-reset-backdrop{position:fixed;inset:0;z-index:31000;background:rgba(2,7,13,.88);backdrop-filter:blur(9px);display:grid;place-items:center;padding:18px}.sf-reset-card{width:min(570px,96vw);background:linear-gradient(180deg,#101b29,#09131e);border:1px solid #633240;border-radius:18px;box-shadow:0 32px 100px rgba(0,0,0,.62);overflow:hidden}.sf-reset-head{padding:20px 22px 15px;border-bottom:1px solid #36222b;display:flex;gap:14px;align-items:flex-start}.sf-reset-icon{width:42px;height:42px;border-radius:11px;background:#351922;border:1px solid #723345;color:#ff8fa2;display:grid;place-items:center;font-size:20px;flex:0 0 auto}.sf-reset-head h2{margin:2px 0 5px;font-size:21px}.sf-reset-head p{margin:0;color:#96a9bb;font-size:11px;line-height:1.5}.sf-reset-body{padding:18px 22px}.sf-reset-warning{border:1px solid #663442;background:#2d1921;color:#ffc2cc;border-radius:10px;padding:11px 12px;font-size:11px;line-height:1.5;margin-bottom:13px}.sf-reset-counts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:15px}.sf-reset-count{border:1px solid #263c50;background:#0b1825;border-radius:9px;padding:10px}.sf-reset-count small{display:block;color:#8298ab;font-size:9px}.sf-reset-count strong{display:block;margin-top:4px;font-size:17px}.sf-reset-field{display:flex;flex-direction:column;gap:6px}.sf-reset-field label{font-size:10px;font-weight:800;color:#a8bac9}.sf-reset-field input{background:#081521;border:1px solid #4f3440;color:#f5f8fb;border-radius:9px;padding:11px 12px;outline:none}.sf-reset-field input:focus{border-color:#a64558;box-shadow:0 0 0 2px rgba(198,73,94,.12)}.sf-reset-hint{color:#7f94a7;font-size:9px;margin-top:6px;line-height:1.45}.sf-reset-msg{display:none;margin-top:11px;border:1px solid #713342;background:#321821;color:#ffacb8;border-radius:9px;padding:9px 10px;font-size:10px}.sf-reset-msg.show{display:block}.sf-reset-foot{display:flex;justify-content:flex-end;gap:8px;padding:14px 22px;border-top:1px solid #36222b}.sf-reset-danger{border:1px solid #b8465a;background:#b8465a;color:#fff;border-radius:8px;padding:9px 12px;font-weight:900}.sf-reset-danger:disabled{opacity:.38;cursor:not-allowed}.sf-reset-close{border:1px solid #2a3e53;background:#0d1a27;color:#b3c2d1;border-radius:8px;padding:9px 12px}@media(max-width:620px){.sf-reset-counts{grid-template-columns:1fr}.sf-reset-foot{flex-direction:column-reverse}.sf-reset-foot button{width:100%}}
      .sf-plan-reset-btn{min-height:44px;font-size:12px!important}.sf-plan-reset-btn:disabled{opacity:.5;cursor:not-allowed}.sf-reset-card{max-height:90vh;overflow:auto;color:#edf5fc}.sf-reset-head p,.sf-reset-warning{font-size:13px}.sf-reset-count small,.sf-reset-field label,.sf-reset-hint{font-size:12px;line-height:1.5}.sf-reset-count strong{font-size:20px}.sf-reset-foot button,.sf-reset-field input{min-height:44px;font-size:13px}.sf-reset-msg{font-size:13px}
      html[data-sf-theme="light"] .sf-reset-card{background:#f8fafc;border-color:#c9d3df;color:#172434}html[data-sf-theme="light"] .sf-reset-head,html[data-sf-theme="light"] .sf-reset-foot{border-color:#d7dfe8}html[data-sf-theme="light"] .sf-reset-head p,html[data-sf-theme="light"] .sf-reset-hint,html[data-sf-theme="light"] .sf-reset-count small,html[data-sf-theme="light"] .sf-reset-field label{color:#485c72}html[data-sf-theme="light"] .sf-reset-count{background:#eef2f6;border-color:#cbd5e1}html[data-sf-theme="light"] .sf-reset-warning,html[data-sf-theme="light"] .sf-reset-msg{background:#fff1f2;border-color:#edb6bf;color:#7e2439}html[data-sf-theme="light"] .sf-reset-field input{background:#fff;border-color:#adbdcf;color:#172434}html[data-sf-theme="light"] .sf-reset-close{background:#e8eef5;border-color:#bac8d7;color:#23364c}
    `;document.head.appendChild(s);
  }

  function toolbar(){return document.querySelector('#view-schedule .cal-toolbar')}
  function selectedMonth(){
    const period=window.SchichtFunkCalendarView?.getPeriod?.();
    return period?.mode==='month'&&/^\d{4}-(0[1-9]|1[0-2])-01$/.test(period.start||'')?period.start.slice(0,7):null;
  }
  const monthLabel=month=>new Date(month+'-01T12:00:00').toLocaleDateString('de-DE',{month:'long',year:'numeric'});
  const saving=()=>B.syncing||B.autoPlanApplying||B.openMarketPublishing||B.schedulePublishing||B.companySwitching||B.teamRhythmSaving||B.shiftModelSaving||B.employeeRemovalBusy;
  function syncButton(){
    const btn=document.getElementById('sfDeleteScheduleMonthBtn');if(!btn)return;
    const month=selectedMonth();btn.disabled=busy||preparing||!month;
    const title=month?`Dienstplan für ${monthLabel(month)} löschen`:'Zuerst die Monatsansicht und den gewünschten Monat auswählen';
    if(btn.title!==title)btn.title=title;
  }

  function install(){
    if(!ALLOWED.has(B.role))return;
    const bar=toolbar();if(!bar)return;
    if(bar.querySelector('#sfDeleteScheduleMonthBtn')){syncButton();return;}
    bar.querySelector('#sfDeleteWholeScheduleBtn')?.remove();
    css();
    const btn=document.createElement('button');btn.type='button';btn.id='sfDeleteScheduleMonthBtn';btn.className='sf-plan-reset-btn';btn.textContent='🗑 Monat löschen';btn.onclick=open;
    bar.appendChild(btn);
    syncButton();
  }

  async function rpc(name,args){
    const {data,error}=await B.client.rpc(name,args);
    if(error)throw error;
    return typeof data==='string'?JSON.parse(data):data;
  }

  async function open(){
    if(busy||preparing||!B.ready||!B.client||!B.companyId||!ALLOWED.has(B.role))return;
    const month=selectedMonth(),company=B.companyId;
    if(!month){C.toast?.('Monat auswählen','Wechsle zuerst zur Monatsansicht und wähle den gewünschten Monat.');return;}
    if(window.__sfDemoCloudAdapterV2){C.toast?.('Demo-Modus','Nutze „Demo zurücksetzen“, um die Beispieldaten wiederherzustellen.');return;}
    css();document.getElementById('sfScheduleResetBackdrop')?.remove();
    let c;
    preparing=true;syncButton();
    try{
      if(saving())throw Error('Planungsdaten werden gerade gespeichert. Bitte versuche es gleich erneut.');
      B.showLoading?.('Ausgewählter Monat wird geprüft …');
      clearTimeout(B.syncTimer);B.syncTimer=null;await B.sync?.();if(B.lastSyncError)throw B.lastSyncError;
      c=await rpc('preview_schedule_month_reset',{p_company_id:company,p_month:month+'-01'});
      if(B.companyId!==company||selectedMonth()!==month)throw Error('Die Auswahl wurde geändert. Bitte den Monat erneut prüfen.');
    }catch(e){C.toast?.('Monat konnte nicht geprüft werden',e?.message||String(e));return}finally{B.hideLoading?.();preparing=false;syncButton();}
    const label=monthLabel(month),word='LÖSCHEN '+month;
    const blocked=c.closed?'Dieser Monat ist abgeschlossen. Eine Löschung ist gesperrt.':c.recordedTimeEntries||c.qrAssignments?'Dieser Monat enthält erfasste Arbeitszeiten oder QR-Nachweise. Diese werden nicht durch eine Dienstplanlöschung entfernt.':!c.canDelete||(!c.total&&!c.marketOffers)?'Dieser Monat enthält keine Schichten oder Marktplatzangebote.':'';
    const m=document.createElement('div');m.id='sfScheduleResetBackdrop';m.className='sf-reset-backdrop';
    m.innerHTML=`<div class="sf-reset-card" role="dialog" aria-modal="true" aria-labelledby="sfResetTitle"><div class="sf-reset-head"><div class="sf-reset-icon">!</div><div><div class="eyebrow">DIENSTPLAN · AUSGEWÄHLTER MONAT</div><h2 id="sfResetTitle">${esc(label)} löschen?</h2><p>${esc(c.monthStart)} bis ${esc(c.monthEnd)} · ${esc(B.companyName||'Ausgewähltes Unternehmen')}</p></div></div><div class="sf-reset-body"><div class="sf-reset-warning">${blocked?`<b>${esc(blocked)}</b>`:`<b>Die Schichten dieses Monats werden unwiderruflich entfernt.</b><br>Andere Monate, Mitarbeiter, Abwesenheiten und SOLL-Vorgaben bleiben erhalten. Marktplatzangebote für ${esc(label)} werden zurückgezogen. Audit- und Änderungsnachweise bleiben erhalten.`}</div><div class="sf-reset-counts"><div class="sf-reset-count"><small>SCHICHTEN IM MONAT</small><strong>${Number(c.total)||0}</strong></div><div class="sf-reset-count"><small>ENTWÜRFE</small><strong>${Number(c.draft)||0}</strong></div><div class="sf-reset-count"><small>VERÖFFENTLICHT</small><strong>${Number(c.published)||0}</strong></div></div>${blocked?'':`<div class="sf-reset-field"><label for="sfResetConfirm">Zur Bestätigung exakt ${esc(word)} eingeben</label><input id="sfResetConfirm" autocomplete="off" spellcheck="false" placeholder="${esc(word)}"></div><div class="sf-reset-hint">Die Löschung betrifft Schichten mit Beginn im ausgewählten Monat. Eine Nachtschicht am Monatsende gehört zu ihrem Starttag.</div>`}<div id="sfResetMsg" class="sf-reset-msg" role="alert"></div></div><div class="sf-reset-foot"><button type="button" class="sf-reset-close" id="sfResetCancel">Abbrechen</button><button type="button" class="sf-reset-danger" id="sfResetSubmit" disabled>${esc(label)} löschen</button></div></div>`;
    document.body.appendChild(m);
    const input=m.querySelector('#sfResetConfirm'),submit=m.querySelector('#sfResetSubmit'),msg=m.querySelector('#sfResetMsg');
    m.addEventListener('keydown',e=>{if(busy&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();}},true);
    const closeAccessible=B.bindAccessibleModal?.(m,{initialFocus:'#sfResetCancel'})||(()=>m.remove());
    const close=()=>{if(!busy)closeAccessible()};
    input?.addEventListener('input',()=>submit.disabled=!!blocked||input.value.trim()!==word);
    m.querySelector('#sfResetCancel').onclick=close;m.addEventListener('click',e=>{if(e.target===m)close()});
    if(!B.bindAccessibleModal)m.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
    submit.onclick=async()=>{
      if(blocked||input?.value.trim()!==word||busy)return;
      busy=true;B.scheduleResetting=true;syncButton();m.querySelectorAll('button,input').forEach(el=>el.disabled=true);submit.textContent='Wird gelöscht …';
      try{
        if(B.companyId!==company||selectedMonth()!==month)throw Error('Die Auswahl wurde geändert. Bitte den Monat erneut prüfen.');
        if(saving())throw Error('Planungsdaten werden gerade gespeichert. Bitte versuche es gleich erneut.');
        B.showLoading?.(`${label} wird gelöscht …`);
        clearTimeout(B.syncTimer);B.syncTimer=null;await B.sync?.();if(B.lastSyncError)throw B.lastSyncError;
        const data=await rpc('reset_company_schedule_month',{p_company_id:company,p_month:month+'-01',p_confirmation:word});
        // Do not allow an unsuccessful refresh to sync deleted drafts back into the cloud.
        if(typeof assignments!=='undefined')assignments=assignments.filter(a=>!String(a.date||'').startsWith(month+'-'));
        if(typeof autoPlanPreview!=='undefined')autoPlanPreview=[];
        if(typeof autoPlanAnalyzed!=='undefined')autoPlanAnalyzed=false;
        if(typeof autoPlanApplied!=='undefined')autoPlanApplied=0;
        await B.hydrate();
        closeAccessible();
        C.updateScheduleControls?.();
        if(typeof renderCalendar==='function')renderCalendar();
        if(typeof renderPlanEmployeePool==='function')renderPlanEmployeePool();
        if(typeof renderOverview==='function')renderOverview();
        if(typeof updateStats==='function')updateStats();
        window.renderAutoPlanning?.();window.SFShiftMarketplace?.refreshManager?.();
        const r=Array.isArray(data)?data[0]:data;
        const n=Number(r?.deletedAssignments||0);
        const message=`${n} Schichten aus ${label} wurden entfernt.`;
        if(typeof showSaveToast==='function')showSaveToast('Monat gelöscht',message);
        else C.toast?.('Monat gelöscht',message);
      }catch(e){console.error('Monatslöschung fehlgeschlagen',e);msg.textContent=e?.message||String(e);msg.classList.add('show');m.querySelectorAll('button,input').forEach(el=>el.disabled=false);submit.disabled=input?.value.trim()!==word;submit.textContent=label+' löschen'}finally{B.hideLoading?.();busy=false;B.scheduleResetting=false;syncButton()}
    };
    m.querySelector('#sfResetCancel').focus();
  }

  B.openScheduleMonthReset=open;
  // Compatibility entry points now also require a visibly selected month.
  B.openFullScheduleReset=open;
  B.scheduleMonthReset={selectedMonth,open};
  document.addEventListener('sf:schedule-period-changed',syncButton);
  const mo=new MutationObserver(install);mo.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(install,0);setTimeout(install,500);setTimeout(install,1500);
})();
