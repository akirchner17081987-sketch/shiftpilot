// SchichtFunk – independent company shift models and planning controls.
(function(){
  if(window.SFShiftModels)return;
  const B=window.SFBackend=window.SFBackend||{};
  const M=window.SFShiftModels={companyId:null,models:[],busy:false};
  const palette={blue:'Blau',amber:'Orange',pink:'Pink',teal:'Türkis',cyan:'Cyan',violet:'Violett',magenta:'Magenta',olive:'Oliv',gray:'Grau'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const demo=()=>sessionStorage.getItem('sf_demo_session_v1')==='active';
  M.isCompanyLoaded=()=>!demo()&&!!B.companyId&&M.companyId===B.companyId;
  M.canManage=()=>M.isCompanyLoaded()&&B.ready&&['OWNER','ADMIN','PLANNER','DISPATCHER'].includes(B.role);
  M.find=code=>M.isCompanyLoaded()?(TYPES.find(x=>x.id===code)||M.models.find(x=>x.id===code)):null;
  M.activeCodes=()=>typeof TYPES==='undefined'?[]:TYPES.map(x=>x.id);
  M.knownCodes=()=>M.isCompanyLoaded()?M.models.map(x=>x.id):M.activeCodes();
  M.apply=(rows,companyId)=>{
    if(demo())return;
    M.companyId=companyId;
    M.models=(rows||[]).map(x=>({id:x.code,name:x.name||x.code,start:x.default_start?.slice(0,5)||'06:00',end:x.default_end?.slice(0,5)||'14:00',cls:palette[x.css_class]?x.css_class:'teal',active:x.active!==false,_dbId:x.id,sortOrder:x.sort_order||0}));
    if(typeof TYPES!=='undefined')TYPES.splice(0,TYPES.length,...M.models.filter(x=>x.active).map(x=>({...x})));
    if(typeof selectedType!=='undefined'&&!M.activeCodes().includes(selectedType))selectedType=M.activeCodes()[0]||null;
  };
  M.validate=model=>{
    if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,19}$/.test(model.code||''))throw Error('Das Kürzel benötigt 1–20 Buchstaben oder Zahlen; Bindestrich und Unterstrich sind möglich.');
    if(!model.name?.trim()||model.name.trim().length>80||/[<>]/.test(model.name))throw Error('Bitte einen Namen mit 1–80 Zeichen ohne spitze Klammern eingeben.');
    if(!/^\d{2}:\d{2}$/.test(model.start)||!/^\d{2}:\d{2}$/.test(model.end)||[model.start,model.end].some(t=>Number(t.slice(0,2))>23||Number(t.slice(3))>59)||model.start===model.end)throw Error('Bitte unterschiedliche, gültige Anfangs- und Endzeiten eingeben.');
    if(!Number.isInteger(model.soll)||model.soll<0||model.soll>99)throw Error('Die SOLL-Stärke muss eine ganze Zahl zwischen 0 und 99 sein.');
    if(!palette[model.color])throw Error('Bitte eine gültige Farbe auswählen.');
    return{code:model.code,name:model.name.trim(),start:model.start,end:model.end,soll:model.soll,color:model.color};
  };
  async function reload(companyId){
    const [models,gs,ds]=await Promise.all([
      B.client.from('shift_templates').select('*').eq('company_id',companyId).order('sort_order'),
      B.client.from('global_staffing_requirements').select('*').eq('company_id',companyId),
      B.client.from('daily_staffing_overrides').select('*').eq('company_id',companyId)
    ]);
    for(const q of [models,gs,ds])if(q.error)throw q.error;
    if(B.companyId!==companyId)throw Error('Das Unternehmen wurde inzwischen gewechselt. Bitte lade die Seite neu.');
    M.apply(models.data,companyId);
    globalSoll={};for(const x of gs.data||[])if(M.find(x.shift_code)?.active)globalSoll[x.shift_code]=Number(x.required_count);
    dailySoll={};for(const x of ds.data||[])if(M.find(x.shift_code)?.active)(dailySoll[x.work_date]||(dailySoll[x.work_date]={}))[x.shift_code]=Number(x.required_count);
    for(const fn of ['renderLibrary','renderCalendar','renderPlanEmployeePool','renderEmployees','renderOverview'])window[fn]?.();
    window.SFSettingsV2?.refreshPlanning();
    if(document.getElementById('tplMgr'))window.tplStandardList?.();
  }
  M.perform=async(action,model)=>{
    if(!M.canManage())throw Error('Für dieses Unternehmen fehlen aktive Planungsrechte.');
    if(M.busy||B.companySwitching||B.syncing||B.bootPromise)throw Error('Daten werden noch gespeichert oder geladen. Bitte versuche es gleich erneut.');
    const payload=action==='REMOVE'?{code:model.code}:M.validate(model),companyId=B.companyId;
    M.busy=true;B.shiftModelSaving=true;let committed=false;
    try{
      if(B.syncTimer){clearTimeout(B.syncTimer);B.syncTimer=null;await B.sync();if(B.lastSyncError)throw B.lastSyncError;}
      const q=await B.client.rpc('manager_manage_shift_model',{p_company_id:companyId,p_action:action,p_model:payload});
      if(q.error)throw q.error;
      committed=true;await reload(companyId);return q.data;
    }catch(error){if(committed)throw Error('Das Schichtmodell wurde gespeichert. Bitte lade die Seite neu, um die aktuelle Liste zu sehen.');throw error;}
    finally{M.busy=false;B.shiftModelSaving=false;if(committed)window.SFSettingsV2?.refreshPlanning();}
  };
  function styles(){
    if(document.getElementById('sfShiftModelsCss'))return;
    const s=document.createElement('style');s.id='sfShiftModelsCss';s.textContent=`
      .sf-model-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;flex-wrap:wrap}.sf-model-toolbar small{color:var(--muted);font-size:12px}
      .sf-model-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.sf-model-actions button,.sf-model-toolbar button,.sf-model-removed button{min-height:44px;font-size:12px}
      .sf-set-shift{grid-template-columns:minmax(155px,1fr) minmax(95px,145px) minmax(95px,145px) minmax(65px,100px);align-items:center}.sf-set-shift input{min-height:44px}
      .sf-model-removed{margin-top:16px;color:var(--muted);font-size:12px}.sf-model-removed summary{cursor:pointer;padding:10px 0}.sf-model-removed-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--line)}
      .sf-model-shade{position:fixed;inset:0;z-index:45000;display:grid;place-items:center;padding:18px;background:rgba(0,0,0,.55)}
      .sf-model-dialog{width:min(540px,100%);max-height:90dvh;overflow:auto;box-sizing:border-box;padding:22px;border:1px solid var(--line,#29455e);border-radius:16px;background:var(--panel,#0d1928);color:var(--text,#edf6ff);box-shadow:0 24px 90px rgba(0,0,0,.45)}
      .sf-model-dialog h2{margin:0 0 8px;font-size:21px}.sf-model-dialog p{color:var(--muted);line-height:1.5;font-size:13px}.sf-model-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}.sf-model-fields label{font-size:12px}.sf-model-fields label span{display:block;margin-bottom:6px}.sf-model-fields input,.sf-model-fields select{box-sizing:border-box;width:100%;min-height:44px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--text);padding:9px}
      .sf-model-error{color:#ef7484;font-size:13px;line-height:1.5;margin-top:12px}.sf-model-footer{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:18px}.sf-model-footer button{min-height:44px}
      @media(max-width:650px){.sf-set-shift{grid-template-columns:1fr 1fr}.sf-set-shift>div:first-child{grid-column:1/-1}}
      @media(max-width:540px){.sf-model-dialog{padding:16px}.sf-model-fields{grid-template-columns:1fr}.sf-model-footer button{flex:1}}
    `;document.head.appendChild(s);
  }
  function dialog(title,body){
    document.getElementById('sfShiftModelDialog')?.remove();styles();const focus=document.activeElement;
    const shade=document.createElement('div');shade.id='sfShiftModelDialog';shade.className='sf-model-shade';
    shade.innerHTML=`<section class="sf-model-dialog" role="dialog" aria-modal="true" aria-labelledby="sfShiftModelTitle"><h2 id="sfShiftModelTitle">${esc(title)}</h2>${body}</section>`;
    document.body.appendChild(shade);let saving=false;
    const close=()=>{if(saving)return;shade.remove();if(focus?.isConnected)focus.focus();else document.getElementById('sfAddShiftModel')?.focus();};
    shade.addEventListener('click',e=>{if(e.target===shade)close();});
    shade.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();close();}
      if(e.key==='Tab'){const all=[...shade.querySelectorAll('input:not(:disabled),select:not(:disabled),button:not(:disabled)')],first=all[0],last=all.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
    });
    shade.querySelector('[data-cancel]').onclick=close;
    shade.querySelector('input:not(:disabled),button')?.focus();
    return{shade,close,setSaving(value){saving=value;shade.querySelectorAll('button,input,select').forEach(e=>{if(e.id!=='sfModelCode'||!e.dataset.fixed)e.disabled=value;});}};
  }
  M.openEditor=code=>{
    if(!M.canManage()||M.busy)return;
    const existing=code?M.find(code):null,action=!existing?'CREATE':existing.active?'UPDATE':'RESTORE';
    const d=dialog(existing?(existing.active?'Schichtmodell bearbeiten':'Schichtmodell wiederherstellen'):'Schichtmodell hinzufügen',`
      <p>Das Modell gilt nur für das aktuell ausgewählte Unternehmen. Zeiten über Mitternacht sind möglich.</p>
      <form id="sfModelForm"><div class="sf-model-fields">
        <label><span>Kürzel</span><input id="sfModelCode" maxlength="20" required placeholder="z. B. F8" value="${esc(existing?.id||'')}" ${existing?'disabled data-fixed="true"':''}></label>
        <label><span>Name</span><input id="sfModelName" maxlength="80" required placeholder="z. B. Frühdienst 8 Stunden" value="${esc(existing?.name||'')}"></label>
        <label><span>Beginn</span><input id="sfModelStart" type="time" required value="${esc(existing?.start||'06:00')}"></label>
        <label><span>Ende</span><input id="sfModelEnd" type="time" required value="${esc(existing?.end||'14:00')}"></label>
        <label><span>SOLL-Stärke</span><input id="sfModelSoll" type="number" min="0" max="99" step="1" required value="${Number(existing&&globalSoll[existing.id]||0)}"></label>
        <label><span>Farbe</span><select id="sfModelColor">${Object.entries(palette).map(([id,label])=>`<option value="${id}" ${id===(existing?.cls||'teal')?'selected':''}>${label}</option>`).join('')}</select></label>
      </div><div class="sf-model-error" role="alert"></div><div class="sf-model-footer"><button type="button" class="ghost" data-cancel>Abbrechen</button><button type="submit" class="primary">${action==='CREATE'?'Schichtmodell hinzufügen':action==='RESTORE'?'Wiederherstellen':'Änderungen speichern'}</button></div></form>`);
    const val=id=>d.shade.querySelector('#'+id).value;
    d.shade.querySelector('form').onsubmit=async e=>{
      e.preventDefault();d.setSaving(true);const error=d.shade.querySelector('[role=alert]');error.textContent='';
      try{
        await M.perform(action,{code:existing?.id||val('sfModelCode').trim().toUpperCase(),name:val('sfModelName'),start:val('sfModelStart'),end:val('sfModelEnd'),soll:Number(val('sfModelSoll')),color:val('sfModelColor')});
        d.setSaving(false);d.close();window.showSaveToast?.('Schichtmodell gespeichert','Das Modell ist im aktuellen Unternehmen verfügbar.');
      }catch(err){d.setSaving(false);error.textContent=err.message||'Das Modell konnte nicht gespeichert werden.';}
    };
  };
  M.remove=code=>{
    const model=M.find(code);if(!model||!M.canManage()||M.busy)return;
    const d=dialog('Schichtmodell löschen',`<p>„${esc(model.name)}“ (${esc(code)}) aus diesem Unternehmen entfernen?</p><p>Bereits verwendete Modelle werden archiviert. Vorhandene Dienste und Zeiteinträge bleiben erhalten. Neue Einplanungen mit diesem Modell sind anschließend nicht mehr möglich.</p><div class="sf-model-error" role="alert"></div><div class="sf-model-footer"><button type="button" class="ghost" data-cancel>Abbrechen</button><button type="button" class="danger" data-remove>Schichtmodell löschen</button></div>`);
    d.shade.querySelector('[data-remove]').onclick=async()=>{
      d.setSaving(true);
      try{const result=await M.perform('REMOVE',{code});d.setSaving(false);d.close();window.showSaveToast?.('Schichtmodell entfernt',result?.archived?'Bestehende Dienste bleiben erhalten. Das Modell kann später wiederhergestellt werden.':'Das unbenutzte Schichtmodell wurde gelöscht.');}
      catch(err){d.setSaving(false);d.shade.querySelector('[role=alert]').textContent=err.message||'Das Modell konnte nicht entfernt werden.';}
    };
  };
  M.enhance=host=>{
    if(demo())return;
    const list=host?.querySelector('.sf-set-shifts');if(!list)return;styles();
    const toolbar=document.createElement('div');toolbar.className='sf-model-toolbar';
    toolbar.innerHTML=`<small>${M.canManage()?'Modelle für dieses Unternehmen verwalten.':'Schichtmodelle werden mit einem aktiven Planungszugang verwaltet.'}</small>${M.canManage()?'<button type="button" class="primary" id="sfAddShiftModel">＋ Schichtmodell hinzufügen</button>':''}`;
    list.before(toolbar);toolbar.querySelector('button')?.addEventListener('click',()=>M.openEditor());
    if(!TYPES.length)list.innerHTML='<p class="sf-set-note">Noch keine aktiven Schichtmodelle vorhanden.</p>';
    if(M.canManage())for(const row of list.querySelectorAll('.sf-set-shift')){
      const code=row.querySelector('[data-sf-start]')?.dataset.sfStart;if(!code)continue;
      const actions=document.createElement('div');actions.className='sf-model-actions';
      actions.innerHTML=`<button type="button" class="ghost" aria-label="${esc(code)} bearbeiten">Bearbeiten</button><button type="button" class="danger" aria-label="${esc(code)} löschen">Löschen</button>`;
      actions.children[0].onclick=()=>M.openEditor(code);actions.children[1].onclick=()=>M.remove(code);row.firstElementChild.appendChild(actions);
    }
    const removed=M.isCompanyLoaded()?M.models.filter(x=>!x.active):[];
    if(removed.length){
      const details=document.createElement('details');details.className='sf-model-removed';
      details.innerHTML=`<summary>Entfernte Schichtmodelle (${removed.length})</summary><p>Diese Modelle bleiben für bestehende Dienste erhalten.</p>${removed.map(x=>`<div class="sf-model-removed-row"><span><b>${esc(x.id)}</b> · ${esc(x.name)}</span>${M.canManage()?`<button type="button" class="ghost" data-restore="${esc(x.id)}">Wiederherstellen</button>`:''}</div>`).join('')}`;
      details.querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>M.openEditor(b.dataset.restore));list.after(details);
    }
    host.querySelectorAll('#sfSaveShiftSettings,#sfSaveDailySoll,#sfResetDailySoll,[data-sf-start],[data-sf-end],[data-sf-soll],[data-sf-day]').forEach(el=>el.disabled=!M.canManage()||M.busy);
  };
  const update=B.updateState;B.updateState=function(){const r=update?.apply(this,arguments);if(B.ready)window.SFSettingsV2?.refreshPlanning();return r;};
})();
