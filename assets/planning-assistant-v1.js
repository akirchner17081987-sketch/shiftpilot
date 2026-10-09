// SchichtFunk planning chat: uses the already authorized company data in memory.
(function(){
  'use strict';
  if(window.SFPlanningAssistant)return;
  const Core=window.SFPlanningAssistantCore,roles=['OWNER','ADMIN','PLANNER','DISPATCHER'];
  if(!Core)return;
  let context={},messages=[],scope=null,previousFocus=null,selectedMonth='',hydrationFailed=false,selectedService=null,planningRuns=[],journalError='',requestId=0,applyingProposal=false,refreshingProposal=null;
  const Insights=window.SFPlanningInsights;
  const withRows=(rows,fn)=>{const original=assignments;try{assignments=rows;return fn()}finally{assignments=original}};
  const signature=()=>JSON.stringify([identity(),window.SFCompliance?.policy,employees,assignments,absences,TYPES,typeof globalSoll==='undefined'?null:globalSoll,typeof dailySoll==='undefined'?null:dailySoll]);
  const B=()=>window.SFBackend||{};
  const demo=()=>sessionStorage.getItem('sf_demo_session_v1')==='active';
  const authorized=()=>!!(B().ready&&roles.includes(B().role)&&(demo()||B().user?.id&&B().companyId));
  const identity=()=>authorized()?JSON.stringify([demo(),B().user?.id||'demo',B().companyId||'demo',B().role]):null;
  const busy=()=>!!(B().companySwitching||B().bootPromise||B().suppressSync||applyingProposal||refreshingProposal);
  const ownRefresh=()=>!!(refreshingProposal&&refreshingProposal.owner===identity()&&refreshingProposal.request===requestId&&!B().companySwitching&&!B().bootPromise);
  const el=id=>document.getElementById(id);
  function reset(){requestId++;context={};messages=[];selectedMonth='';selectedService=null;planningRuns=[];journalError='';el('sfPlanningChatLog')?.replaceChildren();updateService();}
  function close(restore=true){
    const dialog=el('sfPlanningChat'),docked=dialog?.classList.contains('sf-chat-docked');
    if(dialog?.open)dialog.close();
    el('sfPlanningAssistantButton')?.setAttribute('aria-expanded','false');
    if(restore&&previousFocus?.isConnected){
      previousFocus.focus({preventScroll:true});
      if(docked)previousFocus.scrollIntoView({block:'nearest'});
    }
  }
  function syncScope(){
    const next=identity();if(scope!==next||(busy()&&!ownRefresh())){close(false);reset();scope=next;}
    if(selectedService&&!contextDates().includes(selectedService.date)){selectedService=null;context={};updatePeriod();}
    const button=el('sfPlanningAssistantButton');if(button){button.hidden=!authorized();button.disabled=busy();}
    syncPlacement();
    document.querySelectorAll?.('.sf-chat-service-open').forEach(button=>{button.hidden=!authorized();button.disabled=busy();});
  }
  function syncPlacement(){
    const view=el('view-auto'),start=view?.querySelector('.sf-auto-start');
    const docked=!!(authorized()&&view?.classList.contains('active')&&start);
    let dock=el('sfAutoPlanningAssistantDock');
    if(docked&&!dock){
      dock=node('div',undefined,'sf-auto-assistant-dock');dock.id='sfAutoPlanningAssistantDock';
      start.after(dock);
    }
    if(dock&&dock.hidden===docked)dock.hidden=!docked;
    for(const target of [el('sfPlanningAssistantButton'),el('sfPlanningChat')]){
      if(!target)continue;
      if(target.classList.contains('sf-chat-docked')!==docked)target.classList.toggle('sf-chat-docked',docked);
      const host=docked?dock:document.body;
      if(target.parentNode!==host)host.appendChild(target);
    }
  }
  function contextDates(){
    if(selectedMonth)return Core.parsePeriod(selectedMonth,{today:today(),defaultDates:[today()]}).dates;
    if(el('view-auto')?.classList.contains('active')&&typeof autoPlanningDates==='function')return autoPlanningDates();
    const p=window.SchichtFunkCalendarView?.getPeriod?.();
    if(p?.start&&p?.end){const result=[];for(let d=new Date(p.start+'T12:00:00Z');d.toISOString().slice(0,10)<=p.end&&result.length<62;d.setUTCDate(d.getUTCDate()+1))result.push(d.toISOString().slice(0,10));return result;}
    return typeof currentWeekDates==='function'?currentWeekDates().map(iso):[today()];
  }
  function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:B().companyTimeZone||'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
  function candidateCheck(type,date,rows){
    if(rows)return withRows(rows,()=>candidateCheck(type,date));
    // Always use the current, final Auto-Planung implementation, including its guards.
    if(typeof autoEligibleEmployees!=='function'||!window.SFCompliance?.check||!window.SFAutoPlanGuard?.passesTimeRules)throw Error('Die Planungsprüfungen sind noch nicht vollständig geladen. Bitte versuche es gleich erneut.');
    const candidates=autoEligibleEmployees(type,date,[]),accepted=[],assessments=[],rejected=new Map(),allStaff=employees.filter(e=>!e.deletedAt&&e.status==='active'&&(!(e.companyId||e.company_id)||(e.companyId||e.company_id)===B().companyId));
    const reject=(reason)=>rejected.set(reason,(rejected.get(reason)||0)+1);
    for(const e of allStaff){
      const check=window.SFCompliance.check(e,type,date),base=candidates.find(c=>String(c.e.id)===String(e.id));
      // Condense diagnoses without disclosing absence categories or private notes.
      let reason='';
      if(!(e.shifts||[]).includes(type))reason='Schichtfreigabe fehlt';
      else if(check.hard.some(x=>/nicht einplanbar|inaktiv/.test(x)))reason='Profil aktuell nicht einplanbar';
      else if(check.hard.some(x=>/Abwesenheit/.test(x)))reason='Abwesenheit überschneidet sich mit dem Dienst';
      else if(assignments.some(a=>String(a.employeeId)===String(e.id)&&a.date===date))reason='An diesem Tag bereits eingeplant';
      else if(check.hard.some(x=>/Schichtregel/.test(x)))reason='Verbindlicher Rhythmus passt nicht';
      else if(check.hard.some(x=>/Teamleiter/.test(x)))reason='Erforderliche Leitungsrolle fehlt';
      else if(check.hard.some(x=>/überschneidung|Ruhezeit|Schichtdauer|unterschiedlich/.test(x)))reason='Schichtzeit, Ruhezeit oder Überschneidung';
      else if(check.hard.length)reason='Eine verbindliche Planungsregel verhindert die Besetzung';
      else if(!base){
        if(!window.SFAutoPlanGuard.passesTimeRules(e.id,type,date,[]))reason='Schichtzeit, Ruhezeit oder Überschneidung';
        else if(el('autoRespectHours')?.checked!==false&&check.soft.some(x=>/Wochen-SOLL|Monats-SOLL/.test(x)))reason='Wochen- oder Monatsstunden reichen nicht aus';
        else reason='Weitere aktuelle Auto-Planungsregel verhindert die Besetzung';
      }
      assessments.push({employeeId:e.id,eligible:!reason,reason:reason||'Dieser Mitarbeiter erfüllt aktuell die Auto-Planungsregeln für den Dienst.'});
      if(reason)reject(reason);else{
        const rhythm=window.sfRhythmCheck?.(e,type,date),fit=['Freigabe '+type,'Keine harten Ausschlussgründe'];
        if(Core.team(e))fit.push('Team '+Core.team(e));
        if(rhythm?.allowed&&rhythm.mode==='required')fit.push('Verbindlicher Rhythmus passt');
        if(Number.isFinite(check.rest?.hours)&&check.rest.assignment)fit.push('Kürzeste angrenzende Ruhezeit: '+Number(check.rest.hours).toLocaleString('de-DE',{maximumFractionDigits:1})+' Std.');
        accepted.push({...base,fit});
      }
    }
    // Preserve the app's ranking, rather than the employee list order.
    accepted.sort((a,b)=>candidates.findIndex(c=>String(c.e.id)===String(a.e.id))-candidates.findIndex(c=>String(c.e.id)===String(b.e.id)));
    return{candidates:accepted,assessments,reasons:[...rejected].map(([label,count])=>({label,count}))};
  }
  function snapshot(){
    const auth=authorized();
    if(!auth)return{authorized:false};
    const loading=busy(),error=hydrationFailed;
    if(loading||error)return{authorized:true,loading,error};
    const belongs=row=>!(row.companyId||row.company_id)||(row.companyId||row.company_id)===B().companyId;
    const dates=contextDates();
    if(selectedService&&!dates.includes(selectedService.date))selectedService=null;
    return{authorized:true,today:today(),defaultDates:dates,selectedService,
      employees:typeof employees==='undefined'?[]:employees.filter(belongs),
      assignments:typeof assignments==='undefined'?[]:assignments.filter(belongs).filter(a=>a.status!=='CANCELLED'&&a._dbStatus!=='CANCELLED'),
      absences:typeof absences==='undefined'?[]:absences.filter(belongs),
      shifts:typeof TYPES==='undefined'?[]:TYPES.filter(t=>t.active!==false),
      getSoll:(date,type)=>getSoll(date,type),
      monthTarget:e=>typeof employeeMonthlyTarget==='function'?employeeMonthlyTarget(e):0,
      assignmentHours:a=>typeof plannedAssignmentHours==='function'?plannedAssignmentHours(a):0,
      candidates:candidateCheck,solidRules:window.SFCompliance?.policy?.solidPlanningRules,rulesReady:!!window.SFCompliance?.policy,
      hourLimits:e=>typeof autoHourLimits==='function'?autoHourLimits(e):null,isPublished:date=>!!window.SFCompliance?.isWeekPublished?.(date),
      movable:a=>!!a.id&&!a.publishedAt&&(!a._dbStatus||a._dbStatus==='DRAFT')&&a.status!=='PUBLISHED'&&!a._marketApproved&&!/markt|market|freiwill|tausch/i.test(a.note||'')&&!window.SFCompliance?.isWeekPublished?.(a.date)&&!((typeof timeEntries!=='undefined')&&(timeEntries[a.id]?.actualStart||timeEntries[a.id]?.actualEnd))&&window.sfRhythmCheck?.(employees.find(e=>String(e.id)===String(a.employeeId)),a.type,a.date)?.mode!=='required',
      openSlots:(wanted,rows)=>withRows(rows,()=>{const slots=[];for(const date of wanted)for(const t of TYPES.filter(t=>t.active!==false)){const info=window.SFShiftModels?.coverageInfo?.(date,t.id);if(info&&info.representative!==t.id)continue;const raw=getSoll(date,t.id),need=window.SFShiftModels?.requiredSoll?.(date,t.id,raw)??raw,count=rows.filter(a=>a.date===date&&a.type===t.id).length,missing=info?info.missing:Math.max(0,need-count);for(let n=0;n<missing;n++)slots.push({date,type:t.id,...(info?{alternatives:info.alternatives}:{})});}return slots;}),
      planningRuns,journalError,teamRulesReady:window.SFPlanningTeams?.isLoaded?.()??false,helpCategories:window.SFHelpContent?.categories||[],teamRules:window.SFPlanningTeams?.isLoaded?.()?window.SFPlanningTeams.rules:[],helpArticles:window.SFHelpContent?.articles||{}};
  }
  function ask(question){syncScope();return Core.answer(question,snapshot(),context);}
  async function loadRuns(){
    const owner=identity();if(!owner)return;
    if(demo())return;
    try{const saved=JSON.parse(localStorage.getItem('sf-planning-runs-v1|'+owner)||'[]');planningRuns=Array.isArray(saved)?saved.filter(r=>r.company_id===B().companyId&&r.actor_id===B().user?.id&&Date.now()-Date.parse(r.created_at)<90*86400000).slice(0,20):[];journalError='';}
    catch(error){planningRuns=[];journalError='Die im Browser gespeicherten Planungsprotokolle konnten nicht gelesen werden.';}
  }
  async function saveRun(detail){
    const owner=identity(),company=B().companyId;
    if(!authorized()||busy()||!Insights||!detail?.dates?.length)return;
    const current=snapshot(),rows=detail.assignments||current.assignments,unique=new Map();
    for(const slot of Insights.slots(current,detail.dates,rows)){const k=slot.date+'|'+slot.type;if(!unique.has(k))unique.set(k,slot);}
    const entries=[];for(const slot of [...unique.values()].slice(0,200)){
      const checked=candidateCheck(slot.type,slot.date,rows);entries.push({date:slot.date,type:slot.type,reasons:checked.reasons,candidates:checked.candidates.length});
    }
    const analysis={source:'Enddiagnose des Planungslaufs',open:Insights.slots(current,detail.dates,rows).length,truncated:unique.size>200,entries,confirmedRulesVersion:current.solidRules?.confirmedRulesVersion||0};
    const run={company_id:company,actor_id:B().user?.id,first_month:detail.dates[0].slice(0,7)+'-01',last_date:detail.dates.at(-1),created_at:new Date().toISOString(),analysis};
    if(identity()!==owner)return;
    if(demo()){planningRuns.unshift({...run,created_at:new Date().toISOString()});planningRuns=planningRuns.slice(0,20);return;}
    await loadRuns();if(identity()!==owner)return;
    try{planningRuns=[run,...planningRuns].slice(0,20);localStorage.setItem('sf-planning-runs-v1|'+owner,JSON.stringify(planningRuns));journalError='';}
    catch(error){journalError='Der Planungslauf ist vorbereitet, aber sein Diagnoseprotokoll konnte im Browser nicht gespeichert werden.';window.showSaveToast?.('Planungsprotokoll nicht gespeichert',journalError);}
  }
  function confirmProposal(proposal){
    return new Promise(resolve=>{
      const dialog=node('dialog',undefined,'sf-planning-proposal-confirm');dialog.setAttribute('aria-labelledby','sfPlanningProposalTitle');
      const title=node('h2','Geprüfte Änderungen als Entwurf übernehmen?');title.id='sfPlanningProposalTitle';dialog.appendChild(title);
      dialog.appendChild(node('p',proposal.changes.length+' Zuweisungen werden gespeichert. '+proposal.changes.filter(c=>c.replaces).length+' bestehende Entwurfszuweisungen werden ersetzt.'));
      const actions=node('div',undefined,'sf-chat-actions'),cancel=node('button','Abbrechen'),accept=node('button','Jetzt als Entwurf übernehmen');cancel.type=accept.type='button';
      const done=value=>{dialog.close();dialog.remove();resolve(value)};cancel.onclick=()=>done(false);accept.onclick=()=>done(true);dialog.addEventListener('cancel',e=>{e.preventDefault();done(false)});
      actions.append(cancel,accept);dialog.append(actions);document.body.appendChild(dialog);dialog.showModal();cancel.focus();
    });
  }
  async function applyProposal(proposal,button){
    if(!authorized()||busy()||!proposal?.proposed?.length)return;
    const owner=identity();let committed=false,controls=[],priorSuppression=B().suppressSync;
    try{
      if(proposal.signature!==signature()||proposal.owner!==owner||Date.now()-proposal.created>15*60*1000)throw Error('Diese Vorschau ist nicht mehr aktuell. Bitte neue Verbesserungsvorschläge erstellen.');
      if(!await confirmProposal(proposal))return;
      if(!authorized()||busy()||identity()!==owner||proposal.signature!==signature())throw Error('Die Planungsdaten wurden geändert. Bitte die Vorschau erneuern.');
      if(B().syncing||B().lastSyncError||window.SFMonthOptimizer?.isBusy?.())throw Error('Eine andere Planung oder Speicherung läuft. Bitte anschließend erneut prüfen.');
      if(proposal.dates.some(d=>window.SFCompliance?.isWeekPublished?.(d)))throw Error('Der Monat enthält veröffentlichte Wochen. Bitte Änderungen dort einzeln prüfen.');
      const current=snapshot(),checked=[];
      for(const a of proposal.proposed){const employee=current.employees.find(e=>String(e.id)===String(a.employeeId));if(!employee||!candidateCheck(a.type,a.date,[...proposal.base,...checked]).candidates.some(c=>String(c.e.id)===String(a.employeeId))||!Insights.capacity(current,employee,[...proposal.base,...checked],a))throw Error('Ein Vorschlag erfüllt die aktuellen Regeln nicht mehr.');checked.push(a);}
      applyingProposal=true;controls=[...document.querySelectorAll('#appShell button,#appShell input,#appShell select,#appShell textarea,#sfPlanningChat button,#sfPlanningChat textarea')].map(n=>({n,disabled:n.disabled}));controls.forEach(x=>x.n.disabled=true);
      if(demo()){assignments=[...proposal.base,...proposal.proposed.map((a,i)=>({...a,id:'assistant-'+Date.now()+'-'+i}))];saveAll();committed=true;}
      else{
        B().suppressSync=true;clearTimeout(B().syncTimer);B().syncTimer=null;
        const replace=proposal.changes.filter(c=>c.replaces).map(c=>c.replaces._dbId||B().asgDb?.get(String(c.replaces.id)));
        if(replace.some(x=>!x))throw Error('Ein Entwurf besitzt noch keine gespeicherte Kennung. Bitte neu laden.');
        const rows=proposal.proposed.map((a,i)=>{const t=window.SFSolidPlanningCore.interval(a.date,a.start,a.end,current.solidRules.timezone),id=B().empDb?.get(String(a.employeeId));if(!id)throw Error('Die Mitarbeiterzuordnung ist nicht aktuell.');return {employee_id:id,shift_code:a.type,starts_at:new Date(t.start).toISOString(),ends_at:new Date(t.end).toISOString(),legacy_id:'assistant-'+Date.now()+'-'+i}});
        const q=await B().client.rpc('apply_planning_period',{p_company_id:B().companyId,p_first_month:proposal.dates[0].slice(0,7)+'-01',p_month_count:1,p_fingerprint:proposal.fingerprint,p_replace_ids:replace,p_assignments:rows,p_respect_weekly:true});
        if(q.error)throw q.error;committed=true;await B().hydrate();
      }
      window.renderCalendar?.();window.renderAutoPlanning?.();window.showSaveToast?.('Vorschläge als Entwurf gespeichert','Die Änderungen wurden übernommen. Der Dienstplan kann jetzt geprüft werden.');
      if(button)button.disabled=true;
    }catch(error){window.showSaveToast?.(committed?'Gespeichert – Ansicht neu laden':'Vorschläge nicht übernommen',committed?'Die Speicherung war erfolgreich; die Ansicht konnte nicht aktualisiert werden. Bitte neu laden.':error.message||String(error));}
    finally{B().suppressSync=priorSuppression;applyingProposal=false;controls.forEach(x=>x.n.disabled=x.disabled);if(committed&&button)button.disabled=true;}
  }
  const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
  function openAction(action){
    syncScope();if(!authorized()||busy())return;
    if(action.question){submit(action.question);return;}
    if(!action.help&&!['schedule','employees','settings','auto','reports','absence'].includes(action.view))return;
    if(action.employeeId&&!snapshot().employees.some(e=>!e.deletedAt&&String(e.id)===String(action.employeeId)))return;
    close();
    if(action.help){el('sfHelpButton')?.click();if(action.query){const search=el('sfHelpSearch');if(search){search.value=action.query;search.dispatchEvent(new Event('input',{bubbles:true}));}}return;}
    if(action.view==='schedule'&&action.date){
      if(action.month)window.SchichtFunkCalendarView?.setMonth?.(action.date.slice(0,7));
      else{if(typeof autoMonday==='function')weekStart=autoMonday(action.date);window.SchichtFunkCalendarView?.setMode?.('week');}
    }
    window.showView?.(action.view);
    if(action.view==='employees'){
      if(action.employeeId){
        if(el('spEmployeeList')){
          for(const id of ['spEmpSearch','empSearch'])if(el(id))el(id).value='';
          for(const id of ['spEmpTeam','spEmpStatus','spEmpAvailability'])if(el(id))el(id).value='all';
          el('spEmpQualFilters')?.querySelector('[data-q=""]')?.click();window.renderEmployees?.();
          [...document.querySelectorAll('#spEmployeeList [data-id]')].find(n=>n.dataset.id===String(action.employeeId))?.click();
        }else window.selectEmployee?.(action.employeeId);
        focusTarget(el('spEmployeeProfile')||el('formTitle'));
      }
      else if(action.employeeFilter){const filter=el('spEmpTeam');if(filter&&[...filter.options].some(x=>x.value===action.employeeFilter)){filter.value=action.employeeFilter;filter.dispatchEvent(new Event('change',{bubbles:true}));focusTarget(filter);}}
    }
    if(action.view==='schedule'&&action.date&&action.type){
      setService(action.date,action.type,action.assignmentId);
      const target=[...document.querySelectorAll('#view-schedule [data-date][data-type],#view-schedule [data-date][data-shift-row]')].find(n=>n.dataset.date===action.date&&(n.dataset.type||n.dataset.shiftRow)===action.type);
      focusTarget(target||el('calendarGrid'));
    }
    if(action.view==='settings')setTimeout(()=>{
      const card=action.section==='soll'?document.querySelector('#view-settings .sf-set-grid'):el('sfPlanningTeams');
      const button=action.team&&[...document.querySelectorAll('#sfPlanningTeams [data-edit-team]')].find(n=>n.dataset.editTeam===action.team);
      if(button&&!button.disabled)button.click();focusTarget(button||card);
    },50);
  }
  function focusTarget(target){
    if(!target)return;document.querySelectorAll('.sf-assistant-target').forEach(n=>n.classList.remove('sf-assistant-target'));
    target.classList.add('sf-assistant-target');target.scrollIntoView({block:'center',behavior:'smooth'});
    if(!target.hasAttribute('tabindex')&&!target.matches('button,input,select,textarea'))target.tabIndex=-1;
    target.focus({preventScroll:true});setTimeout(()=>target.classList.remove('sf-assistant-target'),4000);
  }
  function setService(date,type,assignmentId){
    syncScope();if(!authorized()||busy()||!Core.validDate(date)||!snapshot().shifts.some(t=>t.id===type))return false;
    if(assignmentId&&!snapshot().assignments.some(a=>String(a.id)===String(assignmentId)&&a.date===date&&a.type===type))return false;
    requestId++;selectedMonth='';context={};selectedService={date,type,assignmentId};updateService();return true;
  }
  function updateService(){
    const strip=el('sfPlanningChatService');if(!strip)return;
    strip.hidden=!selectedService;strip.replaceChildren();
    if(selectedService){strip.appendChild(node('span','Ausgewählter Dienst: '+selectedService.type+' · '+Core.periodLabel([selectedService.date])));const clear=node('button','Auswahl lösen');clear.type='button';clear.onclick=()=>{selectedService=null;context={};updateService();};strip.appendChild(clear);}
  }
  const chatIcon='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-3 3V11.5A7.5 7.5 0 0 1 9.5 4h3a7.5 7.5 0 0 1 7.5 7.5Z"/><path d="M7 10h8M7 14h5"/></svg>';
  function bindServiceContext(){
    document.querySelectorAll('#view-schedule .sf-week-shift[data-date][data-type],#view-schedule .pill.drop-target[data-date][data-type]').forEach(host=>{
      if(host.querySelector('.sf-chat-service-open')||host.matches('button')||host.closest('button'))return;
      const button=node('button',undefined,'sf-chat-service-open');button.type='button';button.innerHTML=chatIcon;button.title='Diesen Dienst im Assistenten prüfen';
      button.setAttribute('aria-label',host.dataset.type+' am '+host.dataset.date+' im Assistenten prüfen');
      button.onclick=event=>{event.preventDefault();event.stopPropagation();if(setService(host.dataset.date,host.dataset.type)){open();submit('Wer kann diesen Dienst übernehmen?');}};
      button.hidden=!authorized();(host.querySelector('.sf-week-shift-head')||host).appendChild(button);
    });
    document.querySelectorAll('.sf-chat-service-open').forEach(b=>{b.hidden=!authorized();b.disabled=busy();});
  }
  function quickButtons(host,questions){for(const q of questions){const button=node('button',q,'sf-chat-example');button.type='button';button.onclick=()=>submit(q);host.appendChild(button);}}
  function renderMessage(message){
    const log=el('sfPlanningChatLog');if(!log)return;
    const article=node('article',undefined,'sf-chat-message '+(message.user?'is-user':'is-answer'));
    article.appendChild(node('small',message.user?'Du':'Planungsassistent','sf-chat-author'));
    if(message.user)article.appendChild(node('p',message.text));
    else{
      const a=message.answer;article.appendChild(node('h3',a.title));article.appendChild(node('p',a.text));
      if(a.rows?.length){
        const results=node('div',undefined,'sf-chat-results');results.setAttribute('aria-label',a.title+' – Ergebnisse');
        const count=node('p',undefined,'sf-chat-result-count'),list=node('div',undefined,'sf-chat-result-list');
        const more=node('button',undefined,'sf-chat-more');more.type='button';let shown=0;
        const append=()=>{
          const end=Math.min(shown+12,a.rows.length);
          for(let i=shown;i<end;i++){
            const values=a.rows[i],card=node('section',undefined,'sf-chat-result');card.dataset.sfChatResult='';
            const priority=a.columns[0]==='Priorität';
            if(priority)card.appendChild(node('span',values[0],'sf-chat-priority'));
            else card.appendChild(node('small',a.columns[0],'sf-chat-result-label'));
            card.appendChild(node('h4',values[priority?1:0]));
            const fields=node('dl');
            for(let j=priority?2:1;j<values.length;j++){
              const field=node('div',undefined,'sf-chat-field');field.appendChild(node('dt',a.columns[j]));field.appendChild(node('dd',values[j]));fields.appendChild(field);
            }
            card.appendChild(fields);
            const action=a.rowActions?.[i];
            if(action){const button=node('button',action.label,'sf-chat-row-action');button.type='button';button.onclick=()=>openAction(action);card.appendChild(button);}
            list.appendChild(card);
          }
          shown=end;count.textContent=`${shown} von ${a.rows.length} Einträgen`;more.hidden=shown>=a.rows.length;more.textContent=`Weitere Einträge anzeigen (${a.rows.length-shown})`;
        };
        more.onclick=append;append();results.append(count,list,more);article.appendChild(results);
      }
      if(a.notes?.length){
        const details=node('details',undefined,'sf-chat-details'),list=node('ul');
        details.appendChild(node('summary','Hinweise zur Auswertung'));a.notes.forEach(x=>list.appendChild(node('li',x)));details.appendChild(list);article.appendChild(details);
      }
      if(a.actions?.length){const actions=node('div',undefined,'sf-chat-actions');a.actions.forEach(action=>{const button=node('button',action.label);button.type='button';button.onclick=()=>openAction(action);actions.appendChild(button);});article.appendChild(actions);}
      if(a.proposal?.proposed?.length&&a.proposal.owner){const button=node('button','Vorschläge als Entwurf übernehmen','sf-chat-row-action');button.type='button';button.onclick=()=>applyProposal(a.proposal,button);article.appendChild(button);}
      if(a.suggestions?.length){const examples=node('div',undefined,'sf-chat-examples');quickButtons(examples,a.suggestions);article.appendChild(examples);}
      article.appendChild(node('small',`Geprüft um ${new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})} · Aktuell geladene Planungsdaten`,'sf-chat-source'));
    }
    log.appendChild(article);
  }
  async function submit(raw){
    syncScope();if(!authorized()||busy())return;
    const input=el('sfPlanningChatInput'),text=String(raw??input?.value??'').trim().slice(0,1200);if(!text)return;
    let answer;const owner=identity(),request=++requestId;
    el('sfPlanningChatStatus').textContent='Planungsdaten werden geprüft.';
    try{
      if(/protokoll|gespeicherte|planungsgruende|besetzung.*verhindert/.test(Core.normalize(text)))await loadRuns();
      if(owner!==identity()||request!==requestId)return;
      answer=ask(text);
      if(answer.proposal?.proposed?.length){
        if(!demo()){
          if(B().syncing||window.SFMonthOptimizer?.isBusy?.())throw Error('Eine Planung oder Speicherung läuft. Bitte danach erneut prüfen.');
          clearTimeout(B().syncTimer);B().syncTimer=null;await B().sync();if(B().lastSyncError)throw B().lastSyncError;
          if(owner!==identity()||request!==requestId)return;
            let q;refreshingProposal={owner,request};
            try{
              await B().hydrate();
              if(owner!==identity()||request!==requestId)return;
              q=await B().client.rpc('preview_planning_period',{p_company_id:B().companyId,p_first_month:answer.proposal.dates[0].slice(0,7)+'-01',p_month_count:1});if(q.error)throw q.error;
            }finally{refreshingProposal=null;syncScope();}
          if(owner!==identity()||request!==requestId)return;
          answer=ask(text);if(answer.proposal){const protectedIds=new Set(q.data.protectedIds||[]);if(answer.proposal.changes.some(c=>c.replaces&&protectedIds.has(c.replaces._dbId||B().asgDb?.get(String(c.replaces.id)))))throw Error('Ein vorgeschlagener Wechsel betrifft einen geschützten Dienst. Bitte im Dienstplan einzeln prüfen.');answer.proposal.fingerprint=q.data.fingerprint;}
        }
        if(answer.proposal)Object.assign(answer.proposal,{owner,signature:signature(),created:Date.now()});
      }
    }catch(error){answer={title:'Prüfung derzeit nicht möglich',text:error.message||'Bitte lade die Planungsdaten erneut und versuche es noch einmal.',context:{}};}
    if(owner!==identity()||request!==requestId)return;
    if(!authorized()||busy())return;
    context=answer.context||{};if(input)input.value='';
    messages.push({user:true,text},{answer});if(messages.length>40)messages=messages.slice(-40);
    el('sfPlanningChatWelcome')?.remove();el('sfPlanningChatLog')?.replaceChildren();messages.forEach(renderMessage);
    const log=el('sfPlanningChatLog'),question=log?.querySelector('.is-user:nth-last-child(2)');if(log&&question)log.scrollTop=question.offsetTop;
    el('sfPlanningChatStatus').textContent=answer.title;input?.focus();
    updatePeriod();
  }
  function updatePeriod(){if(el('sfPlanningChatPeriod'))el('sfPlanningChatPeriod').textContent=Core.periodLabel(context.dates||contextDates());updateService();}
  function welcome(){
    const log=el('sfPlanningChatLog');if(!log)return;log.replaceChildren();
    const welcome=node('section',undefined,'sf-chat-welcome');welcome.id='sfPlanningChatWelcome';
    welcome.appendChild(node('h3','Was möchtest du prüfen?'));
    welcome.appendChild(node('p','Stelle deine Frage oder wähle einen Einstieg.'));
    const examples=node('div',undefined,'sf-chat-examples sf-chat-start');
    for(const [label,question] of [
      ['Monat prüfen','Monatscheck starten'],
      ['Belastung prüfen','Belastungscheck starten'],
      ['Stunden verbessern','Verbesserungsvorschläge erstellen'],
      ['Ausfall durchspielen','Ausfallsimulation starten'],
      ['Offene Dienste','Welche Dienste sind im gewählten Zeitraum noch offen?'],
      ['Ersatz finden','Welche Mitarbeiter kommen als Ersatz infrage?'],
      ['Planungshilfe','Welche Hilfethemen kennst du?']
    ]){const button=node('button',label,'sf-chat-example');button.type='button';button.onclick=()=>submit(question);examples.appendChild(button);}
    welcome.appendChild(examples);
    const details=node('details',undefined,'sf-chat-details');details.appendChild(node('summary','Weitere Beispielfragen'));
    const additional=node('div',undefined,'sf-chat-examples');quickButtons(additional,[
      'Warum konnte die Auto-Planung diesen Dienst nicht besetzen?',
      'Bei welchen Mitarbeitern fehlt eine Teamzuordnung?',
      'Wie stelle ich den Rhythmus von Team E ein?',
      'Wie viele Stunden sind im gewählten Zeitraum geplant?',
      'Welche Dienste hat Team E im gewählten Zeitraum?',
      'Gespeicherte Planungsgründe anzeigen'
    ]);details.appendChild(additional);welcome.appendChild(details);log.appendChild(welcome);
  }
  function open(){
    syncScope();if(!authorized()||busy())return;
    if(el('sfPlanningChat')?.open)return;
    previousFocus=document.activeElement;
    let dialog=el('sfPlanningChat');if(!dialog){
      dialog=node('dialog',undefined,'sf-planning-chat');dialog.id='sfPlanningChat';dialog.setAttribute('aria-labelledby','sfPlanningChatTitle');
      dialog.innerHTML='<div class="sf-chat-frame"><header class="sf-chat-header"><div class="sf-chat-mark" aria-hidden="true">'+chatIcon+'</div><div><small>SCHICHTFUNK</small><h2 id="sfPlanningChatTitle">Planungsassistent</h2></div><button type="button" id="sfPlanningChatClose" aria-label="Planungsassistent schließen">×</button></header><div class="sf-chat-context"><details class="sf-chat-period"><summary><span>Zeitraum</span><b id="sfPlanningChatPeriod"></b></summary><div class="sf-chat-month"><label for="sfPlanningChatMonth">Monat auswählen</label><input type="month" id="sfPlanningChatMonth"><button type="button" id="sfPlanningChatCurrent">Aktueller Plan</button></div></details><button type="button" id="sfPlanningChatReset">Neuer Chat</button></div><div id="sfPlanningChatLog" class="sf-chat-log" role="log" aria-label="Fragen und Antworten"></div><div id="sfPlanningChatStatus" class="sf-chat-sr" role="status" aria-live="polite"></div><form id="sfPlanningChatForm" class="sf-chat-form"><label for="sfPlanningChatInput">Deine Frage</label><div class="sf-chat-compose"><textarea id="sfPlanningChatInput" rows="2" maxlength="1200" placeholder="Wie kann ich dir bei der Planung helfen?" required></textarea><button type="submit" aria-label="Frage senden"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 7-7 7 7M12 5v14"/></svg></button></div><small>Aktuell geladene Daten · Speichern erst nach Bestätigung</small></form></div>';
      document.body.appendChild(dialog);
      const service=node('div',undefined,'sf-chat-service');service.id='sfPlanningChatService';service.hidden=true;el('sfPlanningChatLog').before(service);
      el('sfPlanningChatClose').onclick=()=>close();
      dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
      dialog.addEventListener('close',()=>{if(!dialog.open)el('sfPlanningAssistantButton')?.setAttribute('aria-expanded','false');});
      document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented&&dialog.open&&!document.querySelector('dialog:modal')){event.preventDefault();close();}});

      el('sfPlanningChatForm').onsubmit=event=>{event.preventDefault();submit();};
      el('sfPlanningChatInput').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();submit();}};
      el('sfPlanningChatReset').onclick=()=>{reset();el('sfPlanningChatMonth').value='';welcome();updatePeriod();el('sfPlanningChatInput').focus();};
      el('sfPlanningChatMonth').onchange=event=>{requestId++;selectedMonth=event.target.value;selectedService=null;context={};updatePeriod();event.target.closest('details').open=false;};
      el('sfPlanningChatCurrent').onclick=()=>{requestId++;selectedMonth='';selectedService=null;context={};el('sfPlanningChatMonth').value='';updatePeriod();el('sfPlanningChatMonth').closest('details').open=false;};
    }
    if(!messages.length)welcome();else{el('sfPlanningChatLog').replaceChildren();messages.forEach(renderMessage);}
    syncPlacement();el('sfPlanningChatMonth').value=selectedMonth;updatePeriod();dialog.show();
    if(dialog.classList.contains('sf-chat-docked'))dialog.scrollIntoView({block:'nearest'});
    el('sfPlanningAssistantButton')?.setAttribute('aria-expanded','true');el('sfPlanningChatInput').focus({preventScroll:true});
  }
  function mount(){
    const host=document.body;if(!host)return;
    if(!el('sfPlanningAssistantButton')){const button=node('button',undefined,'ghost sf-chat-launcher');button.innerHTML=chatIcon+'<span>Planungsassistent</span>';button.id='sfPlanningAssistantButton';button.type='button';button.title='Fragen zur Planung stellen';button.setAttribute('aria-controls','sfPlanningChat');button.setAttribute('aria-expanded','false');button.setAttribute('aria-haspopup','dialog');button.onclick=()=>el('sfPlanningChat')?.open?close():open();host.appendChild(button);}
    syncScope();
    bindServiceContext();
    const edit=window.editAssignment;
    if(typeof edit==='function'&&!edit.__sfChatService){const wrapped=function(id){const a=snapshot().assignments?.find(a=>String(a.id)===String(id));if(a)setService(a.date,a.type,a.id);return edit.apply(this,arguments);};wrapped.__sfChatService=true;window.editAssignment=wrapped;}
    const generate=window.generateAutoPlanPreview;
    if(typeof generate==='function'&&!generate.__sfJournal){const wrapped=async function(){const result=await generate.apply(this,arguments);if(!window.SFMonthOptimizer?.getResult?.()&&typeof autoPlanAnalyzed!=='undefined'&&autoPlanAnalyzed)document.dispatchEvent(new CustomEvent('sf:planning-analysis-ready',{detail:{dates:autoPlanningDates(),assignments:[...assignments,...autoPlanPreview]}}));return result;};wrapped.__sfJournal=true;window.generateAutoPlanPreview=wrapped;}
    // Clear conversations before hydration, logout or switching the company.
    for(const key of ['hydrate','finishSignOut','switchCompany']){
      const base=B()[key];if(typeof base!=='function'||base.__sfChatGuard)continue;
      const wrapped=key==='hydrate'?async function(){if(!ownRefresh()){close(false);reset();}hydrationFailed=true;const result=await base.apply(this,arguments);hydrationFailed=false;return result;}:function(){close(false);reset();return base.apply(this,arguments);};wrapped.__sfChatGuard=true;B()[key]=wrapped;
    }
  }
  window.SFPlanningAssistant={open,close,ask,reset,snapshot,setService};
  document.addEventListener('click',event=>{
    const target=event.target.closest?.('#view-schedule [data-assignment-id],#view-schedule .assignment');if(!target)return;
    const id=target.dataset.assignmentId||target.dataset.id,a=snapshot().assignments?.find(a=>String(a.id)===String(id));
    if(a)setService(a.date,a.type,a.id);
  },true);
  document.addEventListener('sf:schedule-period-changed',()=>{requestId++;selectedService=null;context={};updatePeriod();});
  document.addEventListener('sf:planning-analysis-ready',event=>{saveRun(event.detail).catch(()=>{journalError='Das Planungsprotokoll konnte nicht gespeichert werden.';window.showSaveToast?.('Planungsprotokoll nicht gespeichert',journalError);});});
  let queued=false;new MutationObserver(records=>{if(queued||!records.some(r=>r.type==='childList'||r.target===el('view-auto')))return;queued=true;queueMicrotask(()=>{queued=false;mount();});}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  // Auth state can change without a DOM mutation (for example an expired session).
  setInterval(syncScope,500);
})();

