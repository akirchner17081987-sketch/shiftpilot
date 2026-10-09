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
    M.models=(rows||[]).map(x=>({id:x.code,name:x.name||x.code,start:x.default_start?.slice(0,5)||'06:00',end:x.default_end?.slice(0,5)||'14:00',cls:palette[x.css_class]?x.css_class:'teal',active:x.active!==false,_dbId:x.id,sortOrder:x.sort_order||0,planningMode:x.planning_mode||'required',optionalStaffing:Number(x.optional_staffing)||0,responsibleEmployeeId:x.responsible_employee_id||null,responsibleOnly:x.responsible_only===true,optionalWeekdays:x.optional_weekdays||[1,2,3,4,5,6,7],coverageGroup:x.coverage_group||null,coverageRequired:Number(x.coverage_required)||0,morningOtMinimum:Number(x.morning_ot_switch_min)||0,allowedPersonnelNos:x.allowed_personnel_nos||null,exclusiveEmployees:x.exclusive_employees===true,requiresPlanningTeam:x.requires_planning_team===true,strictWeekdays:x.strict_weekdays===true,strictTimes:x.strict_times===true,rhythmAlias:x.rhythm_alias||null}));
    if(typeof TYPES!=='undefined')TYPES.splice(0,TYPES.length,...M.models.filter(x=>x.active).map(x=>({...x})));
    if(typeof selectedType!=='undefined'&&!M.activeCodes().includes(selectedType))selectedType=M.activeCodes()[0]||null;
  };
  const staff=()=>typeof employees==='undefined'?[]:employees;
  M.planningRestriction=(code,employee,date,start,end)=>{
    if(!M.isCompanyLoaded()||!employee)return null;
    const entry=employee.startDate||employee.start_date,finish=employee.contractEnd||employee.contract_end;
    if(date&&entry&&date<entry)return 'Der Dienst liegt vor dem Eintrittsdatum.';
    if(date&&finish&&date>finish)return 'Der Dienst liegt nach dem Vertragsende.';
    const t=M.find(code),no=String(employee.personnelNo??employee.personnel_no??''),exclusive=M.models.find(x=>x.active&&x.exclusiveEmployees&&x.allowedPersonnelNos?.map(String).includes(no));
    if(exclusive&&exclusive.id!==code)return `Personalnummer ${no} ist ausschließlich für ${exclusive.id} freigegeben.`;
    if(!t)return null;
    if(code==='OT'&&date&&window.SFOtPolicy?.configured()&&!window.SFOtPolicy.applies(date,employee))return 'OT ist nur am Wochenende oder an einem Feiertag am Einsatzort zulässig.';
    if(t.allowedPersonnelNos&&!t.allowedPersonnelNos.map(String).includes(no))return `${code} ist nur für Personalnummern ${t.allowedPersonnelNos.join(', ')} freigegeben.`;
    const team=employee.planningTeam??String((employee.qualifications||[]).find(x=>String(x).startsWith('__sp:planningTeam='))||'').slice(18);
    if(t.requiresPlanningTeam&&!['A','B','C','D','E'].includes(team))return `${code} ist ausschließlich für Mitarbeiter in Teams A–E freigegeben.`;
    if(t.strictWeekdays&&date&&!t.optionalWeekdays.includes(new Date(date+'T12:00:00').getDay()||7))return `${code} ist an diesem Wochentag nicht zulässig.`;
    if(t.strictTimes&&((start&&start!==t.start)||(end&&end!==t.end)))return `${code} gilt ausschließlich von ${t.start} bis ${t.end} Uhr.`;
    return null;
  };
  M.allowsEmployee=(code,employee,date)=>{const t=M.find(code);return !M.planningRestriction(code,employee,date)&&(!t?.responsibleOnly||!!t.responsibleEmployeeId&&String(employee?._dbId||employee?.id)===String(t.responsibleEmployeeId))};
  M.teamRhythmCode=token=>M.isCompanyLoaded()?(M.models.find(t=>t.active&&t.requiresPlanningTeam&&t.rhythmAlias===token)?.id||token):token;
  M.coverageGroup=code=>{const t=M.find(code);if(!t?.coverageGroup)return null;const members=M.models.map(x=>M.find(x.id)).filter(x=>x.coverageGroup===t.coverageGroup),active=members.filter(x=>x.active).sort((a,b)=>a.sortOrder-b.sortOrder||a.id.localeCompare(b.id));return {key:t.coverageGroup,label:t.coverageGroup,members,active,representative:active[0]?.id,required:t.coverageRequired,start:t.start,end:t.end}};
  M.coverageTarget=(date,code)=>{const g=M.coverageGroup(code);if(!g)return null;const values=g.active.map(t=>typeof dailySoll==='undefined'?null:dailySoll[date]?.[t.id]).filter(x=>x!=null);return values.length?Math.max(...values.map(Number)):g.active.some(t=>t.optionalWeekdays.includes(new Date(date+'T12:00:00').getDay()||7))?g.required:0};
  const minutes=value=>{const [h,m]=value.split(':').map(Number);return h*60+m};
  M.coverageInfo=(date,code,simulated=[])=>{
    const g=M.coverageGroup(code);if(!g)return null;
    const start=minutes(g.start),end=minutes(g.end)+(g.end<=g.start?1440:0),all=[...(typeof assignments==='undefined'?[]:assignments),...simulated];
    const covered=all.filter(a=>{const t=g.members.find(t=>t.id===a.type);if(!t||a.date!==date||a.status==='CANCELLED')return false;const s=minutes(a.start||t.start),e=minutes(a.end||t.end)+(minutes(a.end||t.end)<=s?1440:0);return s<=start&&e>=end});
    const filled=new Set(covered.map(a=>String(a.employeeId))).size,target=M.coverageTarget(date,code);
    return {...g,target,filled,missing:Math.max(0,target-filled),coveredCodes:[...new Set(covered.map(a=>a.type))],alternatives:g.active.filter(t=>t.optionalWeekdays.includes(new Date(date+'T12:00:00').getDay()||7)||(typeof dailySoll!=='undefined'&&dailySoll[date]?.[t.id]!=null)).map(t=>t.id)};
  };
  // Allocate only the shared deficit to one row. Existing local bookings remain visible.
  M.morningOtSwitch=(date,all=typeof assignments==='undefined'?[]:assignments)=>{
    const minimum=M.find('OT2')?.morningOtMinimum;if(!minimum||typeof dailySoll!=='undefined'&&(dailySoll[date]?.OT1!=null||dailySoll[date]?.OT2!=null))return false;
    const previous=new Date(date+'T12:00:00');previous.setDate(previous.getDate()-1);const day=`${previous.getFullYear()}-${String(previous.getMonth()+1).padStart(2,'0')}-${String(previous.getDate()).padStart(2,'0')}`;
    const start=new Date(date+'T06:00:00'),end=new Date(date+'T08:00:00'),seen=new Set();
    for(const a of all){if(a.type!=='O3'||a.date!==day||a.status==='CANCELLED')continue;const t=M.find(a.type),s=new Date(a.date+'T'+(a.start||t?.start||'22:00')+':00'),e=new Date(a.date+'T'+(a.end||t?.end||'08:00')+':00');if(e<=s)e.setDate(e.getDate()+1);if(s<=start&&e>=end)seen.add(String(a.employeeId))}
    return seen.size>=minimum;
  };
  M.rawRequired=(date,code,fallback)=>{const override=typeof dailySoll==='undefined'?null:dailySoll[date]?.[code],t=M.find(code);if(code==='OT'&&window.SFOtPolicy?.configured()){if(!window.SFOtPolicy.applies(date))return 0;return override!=null?Number(override):t?.planningMode==='optional'?0:Number(fallback)||0;}if(t?.strictWeekdays&&!t.optionalWeekdays.includes(new Date(date+'T12:00:00').getDay()||7))return 0;return override!=null?Number(override):t&&(t.planningMode==='optional'||!t.optionalWeekdays.includes(new Date(date+'T12:00:00').getDay()||7))?0:fallback};
  M.requiredSoll=(date,code,fallback)=>{const rules=window.SFCompliance?.policy?.solidPlanningRules;if(rules?.enabled&&window.SFSolidPlanningCore){const rule=(rules.conditionalStaffing||[]).find(r=>r.shift===code),rows=rule?(typeof assignments==='undefined'?[]:assignments).filter(a=>a.type===rule.sourceShift&&a.date===window.SFSolidPlanningCore.plus(date,rule.sourceDayOffset)).map(a=>({...a,start:a.start||M.find(a.type)?.start,end:a.end||M.find(a.type)?.end})):[],need=window.SFSolidPlanningCore.required(date,code,rows,rules);if(need!==null)return need;}const g=M.coverageInfo(date,code);if(g){const own=typeof assignments==='undefined'?0:assignments.filter(a=>a.date===date&&a.type===code&&a.status!=='CANCELLED').length;return own+(g.representative===code?g.missing:0)}
    const raw=M.rawRequired(date,code,fallback);
    if(['OT1','OT2'].includes(code)&&M.morningOtSwitch(date)){
      const own=typeof assignments==='undefined'?0:assignments.filter(a=>a.date===date&&a.type==='OT1'&&a.status!=='CANCELLED').length;
      if(code==='OT1')return Math.min(raw,own);
      return raw+Math.max(0,M.rawRequired(date,'OT1',typeof globalSoll==='undefined'?0:globalSoll.OT1||0)-own);
    }return raw;
  };
  M.normalizeMorningOt=(proposed,base=typeof assignments==='undefined'?[]:assignments)=>{
    for(const a of proposed){if(a.type!=='OT1'&&!a._morningOt1)continue;const type=M.morningOtSwitch(a.date,[...base,...proposed])?'OT2':'OT1';if(a.type===type)continue;
      const employee=staff().find(e=>String(e.id)===String(a.employeeId)),t=M.find(type);if(!t||!(employee?.shifts||[]).includes(type))throw Error('Der OT-Wechsel benötigt die passende Schichtfreigabe. Bitte prüfe den Mitarbeiter.');
      if(window.SFAutoPlanGuard?.passesTimeRules?.(a.employeeId,type,a.date,proposed.filter(x=>x!==a))===false)throw Error('Der OT-Wechsel verletzt eine Ruhezeit. Bitte erstelle die Vorschau erneut.');
      a._morningOt1=true;a.type=type;a.start=t.start;a.end=t.end;a.reason='OT1/OT2-Regel: mindestens drei O3 bis 08:00 Uhr → 2× OT2; sonst OT1 und OT2.';
    }return proposed;
  };

  M.optionalTarget=(date,code)=>{const t=M.find(code);if(!t?.active||t.planningMode!=='optional'||(typeof dailySoll!=='undefined'&&dailySoll[date]?.[code]!=null))return 0;return t.optionalWeekdays.includes(new Date(date+'T12:00:00').getDay()||7)?t.optionalStaffing:0};
  M.reservePenalty=(employee,date,type)=>M.models.some(t=>t.active&&t.id!==type&&t.responsibleOnly&&String(t.responsibleEmployeeId)===String(employee._dbId||employee.id)&&M.optionalTarget(date,t.id)>0)?1:0;
  M.invalidate=()=>{if(typeof autoPlanPreview!=='undefined'){autoPlanPreview=[];autoPlanUnresolved=[];autoPlanOptionalSkipped=[];autoPlanAnalyzed=false;autoPlanApplied=0;}window.renderAutoPlanning?.()};
  M.validate=model=>{
    if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,19}$/.test(model.code||''))throw Error('Das Kürzel benötigt 1–20 Buchstaben oder Zahlen; Bindestrich und Unterstrich sind möglich.');
    if(!model.name?.trim()||model.name.trim().length>80||/[<>]/.test(model.name))throw Error('Bitte einen Namen mit 1–80 Zeichen ohne spitze Klammern eingeben.');
    if(!/^\d{2}:\d{2}$/.test(model.start)||!/^\d{2}:\d{2}$/.test(model.end)||[model.start,model.end].some(t=>Number(t.slice(0,2))>23||Number(t.slice(3))>59)||model.start===model.end)throw Error('Bitte unterschiedliche, gültige Anfangs- und Endzeiten eingeben.');
    if(!Number.isInteger(model.soll)||model.soll<0||model.soll>99)throw Error('Die SOLL-Stärke muss eine ganze Zahl zwischen 0 und 99 sein.');
    if(!palette[model.color])throw Error('Bitte eine gültige Farbe auswählen.');
    const current=M.find(model.code),planningMode=model.planning_mode??current?.planningMode??'required',optionalStaffing=model.optional_staffing??current?.optionalStaffing??0,responsible=model.responsible_employee_id===undefined?(current?.responsibleEmployeeId||null):model.responsible_employee_id,only=model.responsible_only??current?.responsibleOnly??false,days=model.optional_weekdays??current?.optionalWeekdays??[1,2,3,4,5,6,7];
    if(current?.coverageGroup&&(model.start!==current.start||model.end!==current.end||planningMode!=='required'))throw Error('Die gemeinsame Leitung benötigt identische Zeiten und Pflichtbesetzung für alle verbundenen TL-Modelle.');
    if(!['required','optional'].includes(planningMode)||!Number.isInteger(optionalStaffing)||optionalStaffing<0||optionalStaffing>99||(planningMode==='optional'&&optionalStaffing<1))throw Error('Bitte eine gültige Planungsart und optionale Wunschbesetzung angeben.');
    if(only&&(!responsible||(planningMode==='optional'&&optionalStaffing>1)))throw Error('Bei exklusiver Zuständigkeit ist ein Mitarbeiter und höchstens eine optionale Besetzung erforderlich.');
    if(responsible&&!staff().some(e=>String(e._dbId||e.id)===String(responsible)&&e.status==='active'))throw Error('Bitte einen aktiven Mitarbeiter dieses Unternehmens auswählen.');
    if(!Array.isArray(days)||!days.length||new Set(days).size!==days.length||days.some(d=>!Number.isInteger(d)||d<1||d>7))throw Error('Bitte gültige Wochentage auswählen.');
    return{code:model.code,name:model.name.trim(),start:model.start,end:model.end,soll:planningMode==='optional'?0:model.soll,color:model.color,planning_mode:planningMode,optional_staffing:optionalStaffing,responsible_employee_id:responsible,responsible_only:!!only,optional_weekdays:days};
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
    M.invalidate();window.SFSettingsV2?.refreshPlanning();
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
      .sf-model-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:6px;flex-wrap:wrap;margin-top:2px;padding-top:10px;border-top:1px solid var(--line)}.sf-model-actions button,.sf-model-toolbar button,.sf-model-removed button{min-height:40px;font-size:12px}
      .sf-set-shifts{grid-template-columns:repeat(auto-fit,minmax(min(100%,285px),1fr));gap:12px}.sf-set-shift{grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(60px,.65fr);align-items:end;padding:14px;gap:10px;border-radius:12px}.sf-set-shift>div:first-child{grid-column:1/-1;min-width:0}.sf-set-shift>div:first-child b{font-size:16px}.sf-set-shift>div:first-child small{overflow-wrap:anywhere}.sf-set-shift label{min-width:0}.sf-set-shift input{min-width:0;min-height:40px}
      .sf-model-removed{margin-top:16px;color:var(--muted);font-size:12px}.sf-model-removed summary{cursor:pointer;padding:10px 0}.sf-model-removed-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--line)}
      .sf-model-shade{position:fixed;inset:0;z-index:45000;display:grid;place-items:center;padding:18px;background:rgba(0,0,0,.55)}
      .sf-model-dialog{width:min(540px,100%);max-height:90dvh;overflow:auto;box-sizing:border-box;padding:22px;border:1px solid var(--line,#29455e);border-radius:16px;background:var(--panel,#0d1928);color:var(--text,#edf6ff);box-shadow:0 24px 90px rgba(0,0,0,.45)}
      .sf-model-dialog h2{margin:0 0 8px;font-size:21px}.sf-model-dialog p{color:var(--muted);line-height:1.5;font-size:13px}.sf-model-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}.sf-model-fields label{font-size:12px}.sf-model-fields label span{display:block;margin-bottom:6px}.sf-model-fields input,.sf-model-fields select{box-sizing:border-box;width:100%;min-height:44px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--text);padding:9px}
      .sf-model-error{color:#ef7484;font-size:13px;line-height:1.5;margin-top:12px}.sf-model-footer{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:18px}.sf-model-footer button{min-height:44px}
      @media(max-width:650px){.sf-set-shifts{grid-template-columns:1fr}}
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
        <label><span>Beginn</span><input id="sfModelStart" type="time" ${existing?.coverageGroup?'readonly':''} required value="${esc(existing?.start||'06:00')}"></label>
        <label><span>Ende</span><input id="sfModelEnd" type="time" ${existing?.coverageGroup?'readonly':''} required value="${esc(existing?.end||'14:00')}"></label>
        <label><span>SOLL-Stärke</span><input id="sfModelSoll" type="number" min="0" max="99" step="1" required value="${Number(existing&&globalSoll[existing.id]||0)}"></label>
        <label><span>Farbe</span><select id="sfModelColor" aria-label="Farbe">${Object.entries(palette).map(([id,label])=>`<option value="${id}" ${id===(existing?.cls||'teal')?'selected':''}>${label}</option>`).join('')}</select></label>
        <label><span>Planungsart</span><select id="sfModelMode" aria-label="Planungsart"><option value="required">Pflichtbesetzung</option><option value="optional" ${existing?.planningMode==='optional'?'selected':''}>Optional · nach Pflichtdiensten</option></select></label>
        <label><span>Optionale Wunschbesetzung</span><input id="sfModelOptional" type="number" min="1" max="99" value="${existing?.optionalStaffing||1}"></label>
        <label><span>Zuständiger Mitarbeiter</span><select id="sfModelResponsible" aria-label="Zuständiger Mitarbeiter"><option value="">Keine feste Zuständigkeit</option>${staff().filter(e=>e.status==='active').map(e=>`<option value="${esc(e._dbId||e.id)}" ${String(existing?.responsibleEmployeeId)===String(e._dbId||e.id)?'selected':''}>${esc(e.first+' '+e.last)}</option>`).join('')}</select></label>
        <label><span>Zuweisung</span><select id="sfModelOnly" aria-label="Zuweisung"><option value="false">Alle mit Schichtfreigabe</option><option value="true" ${existing?.responsibleOnly?'selected':''}>Nur zuständiger Mitarbeiter</option></select></label>
        <fieldset style="grid-column:1/-1;border:1px solid var(--line);border-radius:8px;padding:10px"><legend>Reguläre Einsatztage</legend><div style="display:flex;gap:12px;flex-wrap:wrap">${['Mo','Di','Mi','Do','Fr','Sa','So'].map((day,i)=>`<label style="display:flex;align-items:center;gap:4px"><input type="checkbox" data-sf-optional-day value="${i+1}" ${(existing?.optionalWeekdays||[1,2,3,4,5,6,7]).includes(i+1)?'checked':''} style="width:18px;min-height:18px">${day}</label>`).join('')}</div></fieldset>
        <p id="sfModelRuleHelp" style="grid-column:1/-1;margin:0">${existing?.coverageGroup?`Gemeinsame Mindestbesetzung ${esc(existing.coverageGroup)}: ${existing.coverageRequired} TL insgesamt. Ein TL deckt beide Standorte ab; ein zweiter TL ist möglich. Gemeinsame Tageswerte stehen unter „Abweichende SOLL-Stärken“. `:''}Die Standardbesetzung gilt an den ausgewählten Einsatztagen. An anderen Tagen entsteht kein regulärer Bedarf. Tageswerte ermöglichen einzelne Ausnahmen. Pflichtdienste haben Vorrang; optionale Schichten dürfen frei bleiben. Freigaben, Rhythmus, Stunden und Ruhezeiten gelten weiterhin.</p>
      </div><div class="sf-model-error" role="alert"></div><div class="sf-model-footer"><button type="button" class="ghost" data-cancel>Abbrechen</button><button type="submit" class="primary">${action==='CREATE'?'Schichtmodell hinzufügen':action==='RESTORE'?'Wiederherstellen':'Änderungen speichern'}</button></div></form>`);
    const val=id=>d.shade.querySelector('#'+id).value;
    d.shade.querySelector('form').onsubmit=async e=>{
      e.preventDefault();d.setSaving(true);const error=d.shade.querySelector('[role=alert]');error.textContent='';
      try{
        await M.perform(action,{code:existing?.id||val('sfModelCode').trim().toUpperCase(),name:val('sfModelName'),start:val('sfModelStart'),end:val('sfModelEnd'),soll:Number(val('sfModelSoll')),color:val('sfModelColor'),planning_mode:val('sfModelMode'),optional_staffing:val('sfModelMode')==='optional'?Number(val('sfModelOptional')):0,responsible_employee_id:val('sfModelResponsible')||null,responsible_only:val('sfModelOnly')==='true',optional_weekdays:[...d.shade.querySelectorAll('[data-sf-optional-day]:checked')].map(el=>Number(el.value))});
        d.setSaving(false);d.close();window.showSaveToast?.('Schichtmodell gespeichert','Das Modell ist im aktuellen Unternehmen verfügbar.');
      }catch(err){d.setSaving(false);syncMode();error.textContent=err.message||'Das Modell konnte nicht gespeichert werden.';}
    };
    const mode=d.shade.querySelector('#sfModelMode'),syncMode=()=>{const optional=mode.value==='optional',shared=!!existing?.coverageGroup;mode.disabled=shared;d.shade.querySelector('#sfModelSoll').disabled=optional||shared;if(shared)d.shade.querySelector('#sfModelSoll').value=existing.coverageRequired;if(optional)d.shade.querySelector('#sfModelSoll').value='0';d.shade.querySelector('#sfModelOptional').disabled=!optional;};mode.onchange=syncMode;syncMode();
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
      actions.children[0].onclick=()=>M.openEditor(code);actions.children[1].onclick=()=>M.remove(code);row.appendChild(actions);
    }
    const removed=M.isCompanyLoaded()?M.models.filter(x=>!x.active):[];
    if(removed.length){
      const details=document.createElement('details');details.className='sf-model-removed';
      details.innerHTML=`<summary>Entfernte Schichtmodelle (${removed.length})</summary><p>Diese Modelle bleiben für bestehende Dienste erhalten.</p>${removed.map(x=>`<div class="sf-model-removed-row"><span><b>${esc(x.id)}</b> · ${esc(x.name)}</span>${M.canManage()?`<button type="button" class="ghost" data-restore="${esc(x.id)}">Wiederherstellen</button>`:''}</div>`).join('')}`;
      details.querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>M.openEditor(b.dataset.restore));list.after(details);
    }
    host.querySelectorAll('#sfSaveShiftSettings,#sfSaveDailySoll,#sfResetDailySoll,[data-sf-start],[data-sf-end],[data-sf-soll],[data-sf-day]').forEach(el=>el.disabled=!M.canManage()||M.busy);
    for(const row of list.querySelectorAll('.sf-set-shift')){const code=row.querySelector('[data-sf-start]')?.dataset.sfStart,t=M.find(code);if(!t)continue;const e=staff().find(e=>String(e._dbId||e.id)===String(t.responsibleEmployeeId));if(t.planningMode==='optional'){const input=row.querySelector('[data-sf-soll]');input.value='0';input.disabled=true;}if(['OT1','OT2'].includes(t.id)&&M.find('OT2')?.morningOtMinimum){const note=document.createElement('small');note.textContent='Ab 3 O3 am vorherigen Abend bis 08:00 Uhr: statt OT1 + OT2 werden 2× OT2 geplant.';row.firstElementChild.appendChild(note);}if(t.planningMode==='optional'||t.responsibleOnly){const note=document.createElement('small');note.textContent=(t.planningMode==='optional'?`Optional · Wunsch ${t.optionalStaffing}`:'Pflichtbesetzung')+(t.responsibleOnly?` · Nur ${e?e.first+' '+e.last:'Zuständiger fehlt'}`:'');row.firstElementChild.appendChild(note);}}
    for(const row of list.querySelectorAll('.sf-set-shift')){const t=M.find(row.querySelector('[data-sf-start]')?.dataset.sfStart);if(t&&t.optionalWeekdays.length<7){const note=document.createElement('small');note.textContent=t.optionalWeekdays.join(',')==='1,2,3,4,5'?'Einsatztage: Mo–Fr':'Einsatztage: '+t.optionalWeekdays.map(d=>['Mo','Di','Mi','Do','Fr','Sa','So'][d-1]).join(', ');row.firstElementChild.appendChild(note);}}
    for(const row of list.querySelectorAll('.sf-set-shift')){const t=M.find(row.querySelector('[data-sf-start]')?.dataset.sfStart);if(t?.coverageGroup){const note=document.createElement('small');note.textContent=`Gemeinsame Leitung ${t.coverageGroup} · SOLL ${t.coverageRequired} insgesamt · zweiter TL möglich`;row.firstElementChild.appendChild(note);for(const input of row.querySelectorAll('[data-sf-start],[data-sf-end],[data-sf-soll]'))input.disabled=true;row.querySelector('[data-sf-soll]').value=t.coverageRequired;}}
  };
  const update=B.updateState;B.updateState=function(){const r=update?.apply(this,arguments);if(B.ready)window.SFSettingsV2?.refreshPlanning();return r;};
})();
