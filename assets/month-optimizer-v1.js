// Prüfung und bestätigte Übernahme einer optimierten Monatsverteilung.
(function(){
  const B=window.SFBackend=window.SFBackend||{},el=id=>document.getElementById(id),core=window.SFMonthOptimizerCore;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let result=null,busy=false;
  const individualRequested=()=>el('autoPlanPeriod')?.value==='month'&&employees.some(individualMode);
  const withBase=(base,fn)=>{const original=assignments;try{assignments=base;return fn()}finally{assignments=original}};
  const signature=()=>JSON.stringify({company:B.companyId,employees,assignments,absences,TYPES,globalSoll,dailySoll,respectHours:el('autoRespectHours')?.checked,individualBlocks:eightHourRoster()&&el('autoIndividualBlocks')?.checked,period:el('autoPlanPeriod')?.value,month:el('autoPlanMonth')?.value});
  const key=s=>s.date+'|'+(s.coverageGroup||s.type);
  const fixed=a=>{const e=employees.find(e=>String(e.id)===String(a.employeeId)),r=e&&window.sfRhythmCheck?.(e,a.type,a.date);return r?.mode==='required'&&r.expected&&!['ALLE','FREI'].includes(r.expected)};
  const entry=(slot,candidate)=>{const t=typeById(candidate.type);return{date:slot.date,type:candidate.type,employeeId:candidate.e.id,start:t.start,end:t.end,resource:key(slot),coverageGroup:slot.coverageGroup,coverageLabel:slot.coverageLabel,optional:!!slot.optional}};
  const eightHourRoster=()=>['SD','ND'].every(code=>{const t=typeById(code);return t&&plannedAssignmentHours({date:'2027-01-01',type:code,start:t.start,end:t.end})===8})&&(!typeById('FD-WE')||plannedAssignmentHours({date:'2027-01-01',type:'FD-WE',start:typeById('FD-WE').start,end:typeById('FD-WE').end})===8);
  function individualMode(e){const rule=window.SFRhythm?.config(e),team=e.planningTeam??(e.qualifications||[]).find(q=>String(q).startsWith('__sp:planningTeam='))?.slice(18);return el('autoIndividualBlocks')?.checked&&eightHourRoster()&&!team&&(rule?.mode||e.rhythmMode||(e.qualifications||[]).find(q=>String(q).startsWith('__sp:rhythmMode='))?.split('=')[1]||'off')==='off'&&!(e.shifts||[]).includes('FD')&&(e.shifts||[]).filter(t=>typeById(t)).every(t=>['SD','ND','FD-WE'].includes(t))&&(e.shifts||[]).some(t=>['SD','ND','FD-WE'].includes(t))}
  function validateIndividual(prepared,preview){if(!prepared.individualInput)return;const ids=new Set(prepared.individualInput.employees.map(e=>String(e.id)));if(!window.SFIndividualMonthPlanner.validate(prepared.individualInput,preview.filter(a=>ids.has(String(a.employeeId)))))throw Error('Die individuelle Verteilung verletzt eine Arbeitsblock-, Nachtblock- oder Stundenregel. Bitte erneut optimieren.')}
  function buildInput(base){return withBase(base,()=>{
    const dates=autoPlanningDates(),slots=autoOpenSlots(),capacities=new Map(),reserved=[];
    for(const s of slots)capacities.set(key(s),(capacities.get(key(s))||0)+1);
    for(const slot of slots){if(!capacities.get(key(slot)))continue;const c=autoSlotCandidates(slot,reserved).find(c=>c.fixed);if(c){reserved.push(entry(slot,c));capacities.set(key(slot),capacities.get(key(slot))-1)}}
    const byDate=new Map();for(const s of slots)if(capacities.get(key(s))>0){const row=byDate.get(s.date)||new Map();for(const type of s.alternatives||[s.type])row.set(type,{...s,type,resource:key(s)});byDate.set(s.date,row)}
    const groups=[];
    for(const e of employees.filter(e=>e.status==='active'&&!e.deletedAt)){
      const seen=new Set();for(const date of dates)for(const {type}of byDate.get(date)?.values()||[]){
        if(!(e.shifts||[]).includes(type))continue;const block=autoWorkBlock(e,type,date,[...base,...reserved]),start=block?iso(addDays(new Date(date+'T12:00:00'),1-block.position)):date,id=String(e.id)+'|'+start+'|'+(block?'block':'day');if(seen.has(id))continue;seen.add(id);
        const days=block?Array.from({length:block.length},(_,i)=>iso(addDays(new Date(start+'T12:00:00'),i))).filter(d=>dates.includes(d)&&!absent(e.id,d)&&![...base,...reserved].some(a=>String(a.employeeId)===String(e.id)&&a.date===d)):[date];if(!days.length)continue;
        const options=[],known=new Set();
        function search(i,bundle,only){if(options.length>=128)return;if(i===days.length){const k=bundle.map(a=>a.type).join('|');if(!known.has(k)){known.add(k);options.push(bundle)}return}
          const day=days[i],choices=[...(byDate.get(day)?.values()||[])].filter(v=>(e.shifts||[]).includes(v.type)&&(!only||v.type===only)&&(block?!['OT1','OT2','OT3'].includes(v.type):!autoWorkBlock(e,v.type,day,[])));
          choices.sort((a,b)=>Number(b.type===bundle.at(-1)?.type)-Number(a.type===bundle.at(-1)?.type));
          for(const slot of choices){if(e.startDate&&day<e.startDate||e.contractEnd&&day>e.contractEnd)continue;const candidate=autoEligibleEmployees(slot.type,day,[...reserved,...bundle]).find(x=>String(x.e.id)===String(e.id));if(candidate)search(i+1,[...bundle,entry(slot,{...candidate,type:slot.type})],only)}
        }
        for(const t of byDate.get(days[0])?.keys()||[])search(0,[],t);search(0,[]);
        if(options.length)groups.push({id,employee:e,block:!!block,options});
      }
    }
    const people=employees.filter(e=>e.status==='active'&&!e.deletedAt).map(e=>{const limit=autoHourLimits(e),stored=e.qualifications?.find(q=>String(q).startsWith('__sp:maxConsecutive=')),target=employeeMonthlyTarget(e),individual=!!individualMode(e),nearTarget=/^Vollzeit(?:\s+180)?$/i.test(String(e.employment||'').trim())&&target>=180?Math.floor((target+4)/8)*8:Math.floor(target/8)*8;return{...e,target,individual,monthLimit:individual?Math.min(limit.monthLimit,nearTarget):limit.monthLimit,weeklyLimit:limit.weeklyLimit,maxConsecutive:Number(e.maxConsecutiveShifts??stored?.split('=')[1])||0,permissions:(e.shifts||[]).filter(t=>getSoll(dates[0],t)>0).length}});
    return{month:dates[0].slice(0,7),employees:people,groups,base:[...base,...reserved],reserved,capacities:[...capacities],slots,respectHours:el('autoRespectHours')?.checked!==false};
  })}
  function completeOptional(base,proposed,individualIds=new Set()){return withBase(base,()=>{
    const pending=withBase([...base,...proposed],()=>[...autoOpenSlots(),...autoOptionalSlots()]);
    while(true){let best=null;
      for(const slot of pending.filter(s=>s.optional))for(const candidate of autoSlotCandidates(slot,proposed).filter(c=>!individualIds.has(String(c.e.id)))){
        const bundle=autoBlockBundle(slot,candidate,pending,proposed);if(!bundle?.length)continue;
        const hours=bundle.reduce((n,x)=>n+plannedAssignmentHours(entry(x.slot,x.candidate)),0),target=employeeMonthlyTarget(candidate.e),planned=plannedMonthlyHoursForEmployee(candidate.e.id,slot.date,proposed);
        if(planned+hours>target+.000001)continue;
        const score=bundle.filter(x=>!x.slot.optional).length*1000+hours*(target-planned)/Math.max(1,target);
        if(!best||score>best.score)best={bundle,score};
      }
      if(!best)break;
      for(const x of best.bundle){proposed.push({...entry(x.slot,x.candidate),blockId:x.blockId});pending.splice(pending.indexOf(x.slot),1)}
    }
    return pending.filter(s=>s.optional).map(s=>({...s,reason:'Optionaler Bedarf bleibt frei, wenn kein vollständiger Arbeitsblock bis zum persönlichen Monatsziel möglich ist.'}));
  })}
  function rows(){if(!result)return[];return employees.filter(e=>e.status==='active'&&!e.deletedAt).map(e=>{const planned=[...result.base,...autoPlanPreview].filter(a=>String(a.employeeId)===String(e.id)&&a.date.startsWith(result.month)).reduce((n,a)=>n+plannedAssignmentHours(a),0);return{e,target:employeeMonthlyTarget(e),before:result.beforeHours.get(String(e.id))||0,planned,missing:Math.max(0,employeeMonthlyTarget(e)-planned)}}).sort((a,b)=>window.SFScheduleEmployeeDisplay?.compare(a.e,b.e)||String(a.e.last).localeCompare(String(b.e.last),'de'))}
  function renderHours(){let host=el('autoMonthHours');if(!host&&el('autoAnalysis')){host=document.createElement('div');host.id='autoMonthHours';el('autoAnalysis').after(host)}if(!host)return;if(!result){host.innerHTML='';return}
    const data=rows(),missing=data.reduce((n,r)=>n+r.missing,0),planned=data.reduce((n,r)=>n+r.planned,0),target=data.reduce((n,r)=>n+r.target,0);
    const duties=[...result.base,...autoPlanPreview].filter(a=>a.date.startsWith(result.month)).length,open=autoPlanUnresolved.length;
    const demandGap=Math.max(0,target-result.demandHours),wholeTenHour=TYPES.filter(t=>getSoll(result.month+'-01',t.id)>0).every(t=>plannedAssignmentHours({date:result.month+'-01',type:t.id,start:t.start,end:t.end})===10);
    host.innerHTML=`<section class="sf-auto-hours"><h3>Monatsstunden prüfen</h3><p>Gesamtobjekt: <b>${planned.toLocaleString('de-DE')} h IST / ${result.demandHours.toLocaleString('de-DE')} h SOLL</b> · <b>${duties} / ${duties+open} Dienste</b> · <b>${open} Dienste / ${Math.max(0,result.demandHours-planned).toLocaleString('de-DE')} h offen</b>.</p>${result.individualIds.length?'<p>Individuelle Planung: 2–5 Dienste je Arbeitsblock, 2–4 Nächte, 1 freier Starttag vor und 3 freie Starttage nach Nachtblöcken sowie Vorwärtswechsel. Wochenend-Frühdienste werden nach Stundenanteil verteilt. 180 Stunden werden mit 176 oder 184 Stunden angenähert; Teilzeit bleibt unter dem persönlichen SOLL.</p>':''}<p>Monatsziele: <b>${target.toLocaleString('de-DE')} h</b> · Pflichtbedarf: <b>${result.demandHours.toLocaleString('de-DE')} h</b> · Geplante Dienste: <b>${planned.toLocaleString('de-DE')} h</b> · Noch bis zum persönlichen SOLL: <b>${missing.toLocaleString('de-DE')} h</b>.</p><p>${missing?'Nicht erreichte Stundenziele bleiben sichtbar. Zusätzlicher tatsächlicher Bedarf, passende Freigaben oder ein abgestimmter Rhythmusversatz können erforderlich sein.':'Alle persönlichen Monatsziele sind erreicht.'} Grundlage sind die hinterlegten Besetzungsbedarfe und persönlichen Stundenziele.</p>${demandGap?`<p>Die Monatsziele liegen <b>${demandGap.toLocaleString('de-DE')} h über dem Pflichtbedarf</b>. Prüfe den tatsächlich benötigten optionalen oder zusätzlichen Bedarf, bevor du weitere Dienste einplanst.</p>`:''}${wholeTenHour&&data.some(r=>r.target%10!==0)?'<p>Mit ausschließlich 10-Stunden-Diensten lassen sich 162 oder 144 Stunden nicht exakt erreichen. Fehlende Reststunden benötigen tatsächlich benötigte kürzere Einsätze oder andere hinterlegte Zeitgutschriften.</p>':''}<div class="sf-auto-hours-scroll"><table><thead><tr><th>Mitarbeiter</th><th>SOLL</th><th>Bisher</th><th>Vorschlag</th><th>Fehlen</th></tr></thead><tbody>${data.map(r=>`<tr><th style="${window.SFScheduleEmployeeDisplay?.style(r.e)||''}">${esc(r.e.personnelNo||'')} · ${esc(r.e.first+' '+r.e.last)}</th><td>${r.target} h</td><td>${r.before} h</td><td>${r.planned} h</td><td class="${r.missing?'is-short':'is-good'}">${r.missing} h</td></tr>`).join('')}</tbody></table></div><p>Feste und geschützte Dienste bleiben erhalten. Die übrigen Monatsentwürfe werden erst nach deiner Bestätigung durch diese Verteilung ersetzt.</p></section>`;
  }
  const baseRender=window.SFAutoPlanWorkspace?.render;
  if(baseRender)window.SFAutoPlanWorkspace.render=function(){const r=result?withBase(result.base,()=>baseRender()):baseRender();const option=el('autoIndividualBlocks');if(option){if(option.dataset?.company!==B.companyId+'|'+eightHourRoster()){option.checked=eightHourRoster();if(option.dataset)option.dataset.company=B.companyId+'|'+eightHourRoster()}option.disabled=busy||autoPlanApplying||!eightHourRoster();const hint=el('autoIndividualBlocksHint');if(hint){if(!hint.dataset?.description&&hint.dataset)hint.dataset.description=hint.textContent;hint.textContent=!eightHourRoster()?'Für die individuelle Blockplanung werden aktive 8-Stunden-Schichten SD und ND benötigt; FD-WE muss ebenfalls 8 Stunden dauern.':(el('autoPlanPeriod')?.value!=='month'?'Aktivieren wechselt zur monatlichen Planung. ':'')+(hint.dataset?.description||'Für flexible Mitarbeiter ohne Team und festen Rhythmus.');}}const button=el('optimizeAutoMonthBtn');if(button){button.hidden=el('autoPlanPeriod')?.value!=='month';button.disabled=busy||autoPlanApplying}if(individualRequested()){el('generateAutoPlanBtn').textContent=result?'↻ Individuellen Monat neu planen':'✦ Individuellen Monat planen';el('generateAutoPlanBtn').disabled=busy||autoPlanApplying}if(result){el('generateAutoPlanBtn').disabled=busy;el('applyAutoPlanBtn').textContent='Optimierten Monat als Entwurf übernehmen';el('autoStartHint').textContent='Monatsoptimierung: flexible Entwürfe neu verteilen und persönliche Stundenziele prüfen.';el('autoApplyHint').textContent='Die bestätigte Übernahme ersetzt nur die in dieser Vorschau freigegebenen Monatsentwürfe. Geschützte Dienste bleiben erhalten.'}if(busy)document.querySelectorAll('#view-auto button,#view-auto input,#view-auto select').forEach(n=>n.disabled=true);renderHours();return r};
  for(const name of ['changeAutoPlanPeriod','clearAutoPlanPreview','generateAutoPlanPreview']){const old=window[name];if(old)window[name]=function(){if(busy)return;if(name==='generateAutoPlanPreview'&&individualRequested())return optimize();result=null;return old.apply(this,arguments)}}
  function changeIndividualBlocks(){
    if(busy||autoPlanApplying)return;
    if(el('autoIndividualBlocks')?.checked&&eightHourRoster()&&el('autoPlanPeriod')?.value!=='month')el('autoPlanPeriod').value='month';
    window.changeAutoPlanPeriod();
  }
  async function optimize(){
    if(busy||autoPlanApplying||el('autoPlanPeriod')?.value!=='month')return;
    const company=B.companyId,dates=autoPlanningDates(),month=dates[0].slice(0,7);busy=true;result=null;autoPlanPreview=[];autoPlanAnalyzed=false;
    const controls=[...document.querySelectorAll('#view-auto button,#view-auto input,#view-auto select')].map(node=>({node,disabled:node.disabled}));controls.forEach(x=>x.node.disabled=true);
    try{
      if(dates.some(d=>window.SFCompliance?.isWeekPublished?.(d)))throw Error('Der Monat enthält veröffentlichte Wochen. Bitte prüfe Änderungen dort einzeln im Dienstplan.');
      let snapshot={fingerprint:null,protectedIds:[]};
      if(B.ready&&B.client){if(B.syncing)throw Error('Eine Speicherung läuft noch. Bitte starte die Monatsoptimierung anschließend erneut.');clearTimeout(B.syncTimer);B.syncTimer=null;await B.sync();if(B.lastSyncError)throw B.lastSyncError;await B.hydrate();const q=await B.client.rpc('preview_month_optimization',{p_company_id:company,p_month:month+'-01'});if(q.error)throw q.error;snapshot=q.data}
      if(B.companyId!==company)throw Error('Das Unternehmen wurde gewechselt.');
      const original=assignments.slice(),localSignature=signature(),protectedIds=new Set(snapshot.protectedIds||[]),movable=original.filter(a=>a.date.startsWith(month)&&!a.publishedAt&&(!a._dbStatus||a._dbStatus==='DRAFT')&&!fixed(a)&&!protectedIds.has(a._dbId||B.asgDb?.get(String(a.id)))&&!/markt|market|freiwill|tausch/i.test(a.note||'')&&!(typeof timeEntries!=='undefined'&&timeEntries[a.id]?.actualStart)&&!(typeof timeEntries!=='undefined'&&timeEntries[a.id]?.actualEnd)),moving=new Set(movable.map(a=>a.id)),base=original.filter(a=>!moving.has(a.id)),beforeOpen=autoOpenSlots().length;
      el('autoAnalysis').innerHTML='<div class="sf-auto-status"><b>Monat wird optimiert …</b><p>Ganze Arbeitsblöcke und persönliche Stundenziele werden geprüft.</p></div>';
      await new Promise(resolve=>setTimeout(resolve,0));const input=buildInput(base);
      input.seed=movable.map(a=>({...a,start:a.start||typeById(a.type)?.start,end:a.end||typeById(a.type)?.end,resource:a.date+'|'+(a.coverageGroup||a.type)}));
      const found=await core.optimize(input,{iterations:128,yieldStep:()=>new Promise(resolve=>setTimeout(resolve,0)),progress:p=>{el('autoAnalysis').innerHTML=`<div class="sf-auto-status"><b>Monatsverteilung wird geprüft: ${p.iteration}/${p.iterations}</b><p>Beste geprüfte Verteilung: ${p.open} offene Pflichtpositionen.</p></div>`}});
      if(signature()!==localSignature||B.companyId!==company)throw Error('Die Planungsdaten wurden während der Optimierung geändert. Bitte erneut starten.');
      if(found.quality.open>beforeOpen)throw Error('Die geprüfte Neuverteilung würde mehr Pflichtlücken erzeugen. Der bestehende Dienstplan bleibt erhalten.');
      const proposed=[...input.reserved,...found.preview],allBase=input.base.filter(a=>!input.reserved.includes(a));
      const individualIds=new Set(input.employees.filter(e=>e.individual).map(e=>String(e.id))),optionalSkipped=completeOptional(allBase,proposed,individualIds);
      withBase(allBase,()=>window.SFShiftModels?.normalizeMorningOt?.(proposed,allBase));
      withBase(allBase,()=>{const checked=[];for(const a of proposed){if(!autoEligibleEmployees(a.type,a.date,checked).some(c=>String(c.e.id)===String(a.employeeId)))throw Error('Ein Vorschlag verletzt eine Planungsregel. Der Dienstplan wurde nicht geändert.');checked.push(a)}});
      const unresolved=withBase([...allBase,...proposed],()=>autoOpenSlots().map(slot=>({...slot,reason:'In der geprüften Monatsverteilung bleibt diese Pflichtposition offen. Ganze Arbeitsblöcke, Freigaben und persönliche Stundenlimits begrenzen die verfügbaren Besetzungen.'})));
      result={month,company,base:allBase,movable,individualInput:found.individualInput,individualIds:[...individualIds],localSignature,fingerprint:snapshot.fingerprint,beforeHours:new Map(employees.map(e=>[String(e.id),original.filter(a=>String(a.employeeId)===String(e.id)&&a.date.startsWith(month)).reduce((n,a)=>n+plannedAssignmentHours(a),0)])),demandHours:withBase([],()=>autoOpenSlots().reduce((n,s)=>{const t=typeById(s.type);return n+plannedAssignmentHours({date:s.date,type:s.type,start:t.start,end:t.end})},0))};
      validateIndividual(result,proposed);
      autoPlanPreview=proposed.map((a,i)=>({...a,id:'month-preview-'+i,day:new Date(a.date+'T12:00:00').toLocaleDateString('de-DE',{weekday:'short'}),reason:a.blockId?'Monatsoptimierung · zusammenhängender Arbeitsblock · nach persönlichem Monats-SOLL':'Monatsoptimierung · feste Vorgabe oder zulässiger Einzeldienst'})).sort((a,b)=>a.date.localeCompare(b.date));autoPlanUnresolved=unresolved;autoPlanOptionalSkipped=optionalSkipped;autoPlanAnalyzed=true;autoPlanApplied=0;
      showSaveToast('Monatsoptimierung vorbereitet',`${autoPlanUnresolved.length} Pflichtpositionen verbleiben. Prüfe die Monatsstunden und bestätige die Neuverteilung.`);
    }catch(e){result=null;autoPlanPreview=[];autoPlanUnresolved=[];autoPlanAnalyzed=false;showSaveToast('Monatsoptimierung nicht übernommen',e.message||String(e))}
    finally{busy=false;controls.forEach(x=>x.node.disabled=x.disabled);renderAutoPlanning()}
  }
  async function apply(){
    if(!result||busy||autoPlanApplying||!autoPlanPreview.length)return;const prepared=result,preview=autoPlanPreview.map(a=>({...a}));busy=true;let appControls=[],previousSuppression=B.suppressSync,committed=false;
    try{
      const accepted=await window.SFAutoPlanWorkspace.confirmApply(preview.length);if(!accepted)return;
      if(result!==prepared||signature()!==prepared.localSignature||B.companyId!==prepared.company||JSON.stringify(preview)!==JSON.stringify(autoPlanPreview))throw Error('Die Daten haben sich geändert. Bitte den Monat erneut optimieren.');
      if(autoPlanningDates().some(d=>window.SFCompliance?.isWeekPublished?.(d)))throw Error('Der Monat wurde inzwischen veröffentlicht.');
      withBase(prepared.base,()=>{const checked=[];for(const a of preview){if(!autoEligibleEmployees(a.type,a.date,checked).some(c=>String(c.e.id)===String(a.employeeId)))throw Error('Die Vorschläge sind nicht mehr gültig. Bitte erneut optimieren.');checked.push(a)}});
      validateIndividual(prepared,preview);
      if(B.ready&&B.client){appControls=[...document.querySelectorAll('#appShell button,#appShell input,#appShell select,#appShell textarea')].map(node=>({node,disabled:node.disabled}));appControls.forEach(x=>x.node.disabled=true);B.suppressSync=true;clearTimeout(B.syncTimer);B.syncTimer=null;if(B.syncing)throw Error('Eine Speicherung läuft noch. Bitte anschließend erneut bestätigen.');
        const q=await B.client.rpc(prepared.individualIds.length?'apply_individual_month_optimization':'apply_month_optimization',{p_company_id:prepared.company,p_month:prepared.month+'-01',p_fingerprint:prepared.fingerprint,p_replace_ids:prepared.movable.map(a=>a._dbId||B.asgDb.get(String(a.id))),p_assignments:preview.map(a=>({employee_id:B.empDb.get(String(a.employeeId)),shift_code:a.type,starts_at:new Date(a.date+'T'+a.start.slice(0,5)+':00').toISOString(),ends_at:(()=>{const s=new Date(a.date+'T'+a.start.slice(0,5)+':00'),e=new Date(a.date+'T'+a.end.slice(0,5)+':00');if(e<=s)e.setDate(e.getDate()+1);return e.toISOString()})(),legacy_id:'month-'+Date.now()+'-'+Math.random()})),p_respect_weekly:el('autoRespectHours')?.checked!==false,...(prepared.individualIds.length?{p_individual_employee_ids:prepared.individualIds.map(id=>B.empDb.get(String(id)))}:{})});if(q.error)throw q.error;committed=true;await B.hydrate();
      }else{assignments=[...prepared.base,...preview.map(a=>({...a,id:'month-'+Date.now()+'-'+Math.random()}))];saveAll()}
      window.SchichtFunkCalendarView?.setMonth?.(prepared.month);
      result=null;autoPlanApplied=preview.length;autoPlanPreview=[];autoPlanUnresolved=[];autoPlanAnalyzed=true;renderCalendar();showSaveToast('Monat als Entwurf optimiert','Die bestätigte Monatsverteilung wurde gespeichert. Prüfe verbleibende Lücken und Stunden im Dienstplan.');
    }catch(e){if(committed){result=null;autoPlanPreview=[];autoPlanUnresolved=[];autoPlanAnalyzed=false;showSaveToast('Monat gespeichert – Ansicht neu laden','Die Monatsverteilung wurde gespeichert. Die aktualisierte Ansicht konnte nicht geladen werden. Bitte lade die Seite neu.')}else showSaveToast('Monat nicht ersetzt',e.message||String(e))}
    finally{B.suppressSync=previousSuppression;appControls.forEach(x=>x.node.disabled=x.disabled);busy=false;renderAutoPlanning()}
  }
  const originalApply=window.applyAutoPlanPreview;if(originalApply)window.applyAutoPlanPreview=function(){return result?apply():originalApply.apply(this,arguments)};
  window.SFMonthOptimizer={optimize,apply,buildInput,changeIndividualBlocks,getResult:()=>result,isBusy:()=>busy};
})();
