// SchichtFunk planning chat: uses the already authorized company data in memory.
(function(){
  'use strict';
  if(window.SFPlanningAssistant)return;
  const Core=window.SFPlanningAssistantCore,roles=['OWNER','ADMIN','PLANNER','DISPATCHER'];
  if(!Core)return;
  let context={},messages=[],scope=null,previousFocus=null,selectedMonth='',hydrationFailed=false,selectedService=null,planningRuns=[],journalError='',requestId=0,applyingProposal=false,refreshingProposal=null;
  const Insights=window.SFPlanningInsights,Workflows=window.SFPlanningWorkflows,Report=window.SFPlanningReport,Goals=window.SFPlanningGoals;
  let protectedAssignmentIds=new Set(),profiles=[],profileError='',changeRequest=null,changeReport=null;
  let observedOwner=null,observedState=null,pendingChange=null,changeDue=0,changeRevision='',lastObserved=0,changeAcknowledged=false;
  let helpContext=null;
  let activeTask=null,lastAnswerCheck=0,submitting=false,goalOrders=[],goalError='',runningGoal=null;
  const withRows=(rows,fn)=>{const original=assignments;try{assignments=rows;return fn()}finally{assignments=original}};
  const signature=()=>JSON.stringify([identity(),window.SFCompliance?.policy,window.SFCompliance?.publications,window.SFPlanningLearning?.signature(),window.SFPlanningTeams?.rules,employees,assignments,absences,TYPES,typeof globalSoll==='undefined'?null:globalSoll,typeof dailySoll==='undefined'?null:dailySoll]);
  const B=()=>window.SFBackend||{};
  const demo=()=>sessionStorage.getItem('sf_demo_session_v1')==='active';
  const authorized=()=>!!(B().ready&&roles.includes(B().role)&&(demo()||B().user?.id&&B().companyId));
  const identity=()=>authorized()?JSON.stringify([demo(),B().user?.id||'demo',B().companyId||'demo',B().role]):null;
  const busy=()=>!!(B().companySwitching||B().bootPromise||B().suppressSync||applyingProposal||refreshingProposal);
  const ownRefresh=()=>!!(refreshingProposal&&refreshingProposal.owner===identity()&&refreshingProposal.request===requestId&&!B().companySwitching&&!B().bootPromise);
  const el=id=>document.getElementById(id);
  function reset(){el('sfDictionaryDialog')?.remove();runningGoal?.controller.abort();runningGoal=null;goalOrders=[];goalError='';requestId++;context={};messages=[];activeTask=null;selectedMonth='';selectedService=null;planningRuns=[];journalError='';profiles=[];profileError='';protectedAssignmentIds=new Set();el('sfAssignmentImpactPreview')?.remove();el('sfAssignmentImpactButton')?.remove();el('sfPlanningChatLog')?.replaceChildren();toggleQuestionGuide(false);setProgress(false);updateService();}
  function close(restore=true){
    const dialog=el('sfPlanningChat'),docked=dialog?.classList.contains('sf-chat-docked');
    if(dialog?.open)dialog.close();showChangeNotice();
    el('sfPlanningAssistantButton')?.setAttribute('aria-expanded','false');
    if(restore&&previousFocus?.isConnected){
      previousFocus.focus({preventScroll:true});
      if(docked)previousFocus.scrollIntoView({block:'nearest'});
    }
  }
  function syncScope(){
    const next=identity(),nextHelp=next?JSON.stringify(Core.companyHelpArticles(window.SFHelpContent?.articles||{},B(),demo())):null;
    if(scope!==next){observedOwner=next;observedState=null;pendingChange=null;changeRequest=null;changeReport=null;changeRevision='';clearChangeNotice();}
    if(scope!==next||helpContext!==nextHelp||(busy()&&!ownRefresh())){close(false);reset();scope=next;helpContext=nextHelp;}
    if(selectedService&&!contextDates().includes(selectedService.date)){selectedService=null;context={};updatePeriod();}
    const button=el('sfPlanningAssistantButton');if(button){button.hidden=!authorized();button.disabled=busy();}
    syncPlacement();bindEditFunction();if(!next)clearChangeNotice();
    markStaleAnswers();
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
  function candidateCheck(type,date,rows,duty){
    if(rows)return withRows(rows,()=>candidateCheck(type,date,undefined,duty));
    // Always use the current, final Auto-Planung implementation, including its guards.
    if(typeof autoEligibleEmployees!=='function'||!window.SFCompliance?.check||!window.SFAutoPlanGuard?.passesTimeRules)throw Error('Die Planungsprüfungen sind noch nicht vollständig geladen. Bitte versuche es gleich erneut.');
    const candidates=autoEligibleEmployees(type,date,[]),accepted=[],assessments=[],rejected=new Map(),allStaff=employees.filter(e=>!e.deletedAt&&e.status==='active'&&(!(e.companyId||e.company_id)||(e.companyId||e.company_id)===B().companyId));
    const reject=(reason)=>rejected.set(reason,(rejected.get(reason)||0)+1);
    for(const e of allStaff){
      const check=window.SFCompliance.check(e,type,date,duty?.start,duty?.end),base=candidates.find(c=>String(c.e.id)===String(e.id));
      // Condense diagnoses without disclosing absence categories or private notes.
      let reason='';
      if(!(e.shifts||[]).includes(type))reason='Schichtfreigabe fehlt';
      else if(check.hard.some(x=>/nicht einplanbar|inaktiv/.test(x)))reason='Profil aktuell nicht einplanbar';
      else if(check.hard.some(x=>/Abwesenheit/.test(x)))reason='Abwesenheit überschneidet sich mit dem Dienst';
      else if(assignments.some(a=>String(a.employeeId)===String(e.id)&&a.date===date))reason='An diesem Tag bereits eingeplant';
      else if(check.hard.some(x=>/Freizeitzusage|zugesagte Freizeit|geschuetzte Freizeit|geschützte Freizeit/i.test(x)))reason='Geschützte Freizeitzusage überschneidet sich mit dem Dienst';
      else if(check.hard.some(x=>/absteigend|Nach O3|Nach TL-LE|Folgetag/i.test(x)))reason='Schichtwechsel am Folgetag nicht zulässig';
      else if(check.hard.some(x=>/Feiertag|Wochenende|Montag.*Freitag/i.test(x)))reason='Schichtmodell ist an diesem Wochentag oder Feiertag nicht zulässig';
      else if(check.hard.some(x=>/Kalenderwoche|Wochen.*(?:grenze|stunden|limit)/i.test(x)))reason='Persönliche Wochenobergrenze würde überschritten';
      else if(check.hard.some(x=>/Monatsgrenze|Monats.*(?:obergrenze|limit)|Schichtanzahl/i.test(x)))reason='Persönliche Monats- oder Schichtobergrenze würde überschritten';
      else if(check.hard.some(x=>/Arbeitsblock|Arbeitsblöck|Nachtblock|Nachtdienste am Stück|Dienste am Stück|freie.*Kalendertage/i.test(x)))reason='Arbeitsblock oder anschließende Erholung passt nicht';
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
  const stateKey=()=> 'sf-assistant-work-v1|'+identity();
  function loadWork(){
    if(!authorized())return {entries:[],progress:{}};
    try{const value=JSON.parse(localStorage.getItem(stateKey())||'{}');return {activeMonth:value.activeMonth,entries:(Array.isArray(value.entries)?value.entries:[]).filter(e=>e&&Array.isArray(e.dates)&&e.dates.length&&Date.now()-e.created<90*86400000).slice(0,20),progress:value.progress&&typeof value.progress==='object'?value.progress:{}};}catch{return {entries:[],progress:{}};}
  }
  function saveWork(value){localStorage.setItem(stateKey(),JSON.stringify(value));}
  function planRevision(){let hash=2166136261;for(const c of signature()){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16);}
  function workSnapshot(){const state=loadWork(),revision=planRevision();return {undoEntries:state.entries,wizardMonth:state.activeMonth,wizardProgress:Object.fromEntries(Object.entries(state.progress).map(([m,p])=>[m,p.revision===revision?p.steps:{}]))};}
  function completeWizard(month,key,done){
    syncScope();if(!authorized()||busy()||!['hours','reserve','release'].includes(key))return;
    try{const state=loadWork(),revision=planRevision(),old=state.progress[month];state.progress[month]={revision,steps:{...(old?.revision===revision?old.steps:{}),[key]:done}};state.progress=Object.fromEntries(Object.entries(state.progress).slice(-12));saveWork(state);submit('Geführte Monatsplanung '+month);}catch(error){window.showSaveToast?.('Fortschritt nicht gespeichert',error.message);}
  }
  function snapshot(){
    const auth=authorized();
    if(!auth)return{authorized:false};
    const loading=busy(),error=hydrationFailed;
    if(loading||error)return{authorized:true,loading,error};
    const belongs=row=>!(row.companyId||row.company_id)||(row.companyId||row.company_id)===B().companyId;
    const dates=contextDates();
    if(selectedService&&!dates.includes(selectedService.date))selectedService=null;
    return{authorized:true,...workSnapshot(),profiles,profileError,changeRequest,today:today(),defaultDates:dates,selectedService,selectedPeriodExplicit:!!selectedMonth,
      companyId:B().companyId,userId:B().user?.id,companyName:B().planningDataRead?.companyId===B().companyId?B().planningDataRead.companyName:undefined,timezone:B().companyTimeZone||'Europe/Berlin',dataRead:B().planningDataRead,pendingChanges:!!(B().syncing||B().syncTimer||B().lastSyncError),
      employees:typeof employees==='undefined'?[]:employees.filter(belongs),
      assignments:typeof assignments==='undefined'?[]:assignments.filter(belongs).filter(a=>a.status!=='CANCELLED'&&a._dbStatus!=='CANCELLED'),
      absences:typeof absences==='undefined'?[]:absences.filter(belongs),
      shifts:typeof TYPES==='undefined'?[]:TYPES.filter(t=>t.active!==false).map(t=>({...t,siteName:t.siteId?(window.SFCompanyProfile?.siteLabel?.(t.siteId)||'Standort hinterlegt; Name nicht geladen'):''})),
      getSoll:(date,type)=>getSoll(date,type),
      requiredSoll:(date,type,raw)=>window.SFShiftModels?.requiredSoll?.(date,type,raw)??raw,
      coverageInfo:(date,type)=>window.SFShiftModels?.coverageInfo?.(date,type),
      optionalTarget:(date,type)=>window.SFShiftModels?.optionalTarget?.(date,type)||0,
      monthTarget:e=>typeof employeeMonthlyTarget==='function'?employeeMonthlyTarget(e):0,
      assignmentHours:a=>typeof plannedAssignmentHours==='function'?plannedAssignmentHours(a):0,
      candidates:candidateCheck,solidRules:window.SFCompliance?.policy?.solidPlanningRules,rulesReady:!!window.SFCompliance?.policy,
      hourLimits:e=>typeof autoHourLimits==='function'?autoHourLimits(e):null,isPublished:date=>!!window.SFCompliance?.isWeekPublished?.(date),
      movable:a=>!!a.id&&!a.rhythmOverride&&!a.fixed&&!a.locked&&!a.protected&&!protectedAssignmentIds.has(a._dbId||B().asgDb?.get(String(a.id))||a.id)&&!a.publishedAt&&(!a._dbStatus||a._dbStatus==='DRAFT')&&a.status!=='PUBLISHED'&&!a._marketApproved&&!/markt|market|freiwill|tausch/i.test(a.note||'')&&!window.SFCompliance?.isWeekPublished?.(a.date)&&!((typeof timeEntries!=='undefined')&&(timeEntries[a.id]?.actualStart||timeEntries[a.id]?.actualEnd))&&window.sfRhythmCheck?.(employees.find(e=>String(e.id)===String(a.employeeId)),a.type,a.date)?.mode!=='required',
      openSlots:(wanted,rows)=>withRows(rows,()=>{const slots=[];for(const date of wanted)for(const t of TYPES.filter(t=>t.active!==false)){const info=window.SFShiftModels?.coverageInfo?.(date,t.id);if(info&&info.representative!==t.id)continue;const raw=getSoll(date,t.id),need=window.SFShiftModels?.requiredSoll?.(date,t.id,raw)??raw,count=rows.filter(a=>a.date===date&&a.type===t.id).length,missing=info?info.missing:Math.max(0,need-count);for(let n=0;n<missing;n++)slots.push({date,type:t.id,...(info?{alternatives:info.alternatives}:{})});}return slots;}),
      publicHelpArticles:window.SFHelpContent?.articles||{},dictionary:!demo()&&B().companyPrivateConfiguration?.companyId===B().companyId?B().companyPrivateConfiguration.data?.planningDictionary||[]:[],planningRuns,journalError,teamRulesReady:window.SFPlanningTeams?.isLoaded?.()??false,helpCategories:window.SFHelpContent?.categories||[],teamRules:window.SFPlanningTeams?.isLoaded?.()?window.SFPlanningTeams.rules:[],helpArticles:Core.companyHelpArticles(window.SFHelpContent?.articles||{},B(),demo())};
  }
  async function loadProfiles(){
    const owner=identity(),company=B().companyId;if(!owner)return;
    try{let data;if(demo())data=JSON.parse(localStorage.getItem('sf-assistant-profiles-demo|'+owner)||'[]');else{const q=await B().client.from('planning_assistant_profiles').select('id,name,config,updated_at').eq('company_id',company).order('name').limit(100);if(q.error)throw q.error;data=q.data;}
      if(identity()!==owner)return;profiles=(Array.isArray(data)?data:[]).filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&Workflows.profileConfig(p.config));profileError='';
    }catch(error){if(identity()===owner){profiles=[];profileError='Profile konnten nicht geladen werden. '+(error.message||'Bitte die Verbindung prüfen.');}}
  }
  const goalLabels={ready:'Bereit',running:'In Bearbeitung',awaiting_approval:'Vorschlag zur Bestätigung',needs_decision:'Entscheidung erforderlich',completed:'Ziel im geprüften Plan erreicht',paused:'Unterbrochen',reviewed:'Mit offenen Punkten geprüft',archived:'Archiviert'};
  const goalStop={goal_reached:'Ziel erreicht',no_improvement:'Keine weitere Verbesserung gefunden',time_limit:'Zeitlimit erreicht',round_limit:'Suchgrenze erreicht',cancelled:'Abgebrochen',data_missing:'Datenprüfung offen',data_changed:'Daten wurden geändert'};
  const goalBusy=row=>row.status==='running'&&Date.parse(row.lease_until)>Date.now();
  function goalFocus(row){const focus=row.config.focus;if(focus==='all')return 'Alle aktiven Mitarbeiter';if(focus==='leaders')return 'Teamleiter';if(focus.startsWith('team:'))return 'Team '+focus.slice(5);const e=employees.find(e=>'person:'+e.id===focus);return e?[e.first,e.last].filter(Boolean).join(' '):'Mitarbeiter derzeit nicht geladen';}
  function goalStore(){if(!Goals)throw Error('Aufträge sind noch nicht vollständig geladen. Bitte Seite neu laden.');return Goals.store({client:B().client,companyId:B().companyId||'demo',userId:B().user?.id||'demo',...(demo()?{demoStorage:localStorage}:{})});}
  function cacheGoal(row){goalOrders=[row,...goalOrders.filter(x=>x.id!==row.id)];for(const m of messages)if(m.answer?.goalResult?.record.id===row.id)m.answer.goalResult.record=row;}
  async function loadGoalOrders(){const owner=identity();if(!owner)return;try{const rows=await goalStore().list();if(identity()===owner){goalOrders=rows;goalError='';}}catch(error){if(identity()===owner){goalOrders=[];goalError='Aufträge konnten nicht geladen werden. '+error.message;}}}
  function rerenderConversation(){const log=el('sfPlanningChatLog');if(!log)return;log.replaceChildren();messages.forEach(m=>renderMessage(m));markStaleAnswers(true);}
  function appendGoalAnswer(answer,question){context=answer.context||{};messages.push({user:true,text:question},{answer,question,previous:{},selection:JSON.stringify(contextDates())});if(messages.length>40)messages=messages.slice(-40);rerenderConversation();updatePeriod();const log=el('sfPlanningChatLog');if(log)log.scrollTop=Math.max(0,log.lastElementChild?.offsetTop||0);}
  async function goalBasis(row){if(demo())return {fingerprint:'demo-'+planRevision(),planningFingerprint:'demo',protectedIds:[]};const q=await B().client.rpc('preview_planning_assistant_order',{p_company_id:B().companyId,p_month:row.config.month+'-01'});if(q.error)throw q.error;if(!q.data?.fingerprint||!q.data?.planningFingerprint)throw Error('Der Planungsstand konnte nicht bestätigt werden.');return q.data;}
  async function createAndRunGoal(value){
    syncScope();if(!authorized()||busy()||submitting)return;const owner=identity(),request=++requestId;setProgress(true);let row;
    try{row=await goalStore().create(value);if(owner!==identity()||request!==requestId)return;cacheGoal(row);}catch(error){if(owner===identity()&&request===requestId)appendGoalAnswer({title:'Auftrag nicht gespeichert',text:error.message,context:{}},'Begleiteten Auftrag starten');}
    finally{if(request===requestId)setProgress(false);}if(row&&owner===identity()&&request===requestId)await runGoal(row);
  }
  async function resumeGoalById(id){syncScope();if(!authorized()||busy()||submitting)return;const owner=identity();setProgress(true);try{await loadGoalOrders();}finally{if(owner===identity())setProgress(false);}if(owner!==identity())return;const row=goalOrders.find(x=>x.id===id);if(!row){window.showSaveToast?.('Auftrag nicht verfügbar',goalError||'Bitte die Auftragsübersicht neu laden.');return;}await runGoal(row);}
  async function runGoal(initial){
    syncScope();if(!authorized()||busy()||submitting||!Goals)return;if(goalBusy(initial)){window.showSaveToast?.('Auftrag vorübergehend reserviert','Für diesen Auftrag besteht noch eine Laufreservierung. Bitte nach Abschluss oder nach Ablauf der Laufzeit fortsetzen.');return;}
    const owner=identity(),request=++requestId,controller=new AbortController(),store=goalStore();let row=initial,result=null,sourceRevision='',basis=null,snapshotState=null,lastSaved=0,claimed=false;
    runningGoal={id:row.id,owner,controller};setProgress(true);const progress=el('sfPlanningChatProgress');if(progress)progress.textContent='Auftrag wird vorbereitet …';
    const cancel=node('button','Planungsauftrag abbrechen','sf-chat-row-action');cancel.type='button';cancel.id='sfGoalCancel';cancel.onclick=()=>{controller.abort();if(progress)progress.textContent='Auftrag wird abgebrochen …';};el('sfPlanningChatForm')?.before(cancel);
    const current=()=>owner===identity()&&request===requestId&&!controller.signal.aborted;
    try{
      row=await store.update(row,{status:'running',run_token:Goals.uuid()});claimed=true;cacheGoal(row);
      if(!current())throw Error('Der Auftrag wurde unterbrochen.');
      if(!demo()){
        if(B().syncing||window.SFMonthOptimizer?.isBusy?.())throw Error('Eine andere Planung oder Speicherung läuft.');
        if(typeof B().sync==='function'){clearTimeout(B().syncTimer);B().syncTimer=null;await B().sync();if(B().lastSyncError)throw B().lastSyncError;}
        if(!current())throw Error('Der Auftrag wurde unterbrochen.');refreshingProposal={owner,request};
        try{if(typeof B().hydrate==='function')await B().hydrate();if(!current())throw Error('Der Auftrag wurde unterbrochen.');basis=await goalBasis(row);}finally{refreshingProposal=null;syncScope();}
      }else basis=await goalBasis(row);
      if(!current())throw Error('Der Auftrag wurde unterbrochen.');
      protectedAssignmentIds=new Set(basis.protectedIds||[]);snapshotState=snapshot();sourceRevision=planRevision();
      if(!demo()&&(!snapshotState.dataRead||snapshotState.dataRead.companyId!==B().companyId||snapshotState.dataRead.userId!==B().user?.id||snapshotState.dataRead.possibleLimit||!Number.isFinite(Date.parse(snapshotState.dataRead.readAt))))throw Error('Der Unternehmensabruf ist nicht vollständig bestätigt. Bitte die Daten erneut laden.');
      const decisions=(Array.isArray(row.state.decisions)?row.state.decisions:[]).filter(d=>d.basis===basis.fingerprint);
      row=await store.update(row,{basis:basis.fingerprint,state:{...row.state,decisions,stopReason:'running'}});cacheGoal(row);
      result=await Goals.run(snapshotState,row.config,{signal:controller.signal,isCurrent:()=>current()&&sourceRevision===planRevision(),yieldControl:()=>new Promise(r=>requestAnimationFrame(()=>r())),onProgress:async p=>{
        if(progress&&current())progress.textContent=p.percent+' % · '+p.label+' · '+p.latest.open+' offene Positionen';
        if(!current()||sourceRevision!==planRevision())return;
        if(Date.now()-lastSaved>1500){row=await store.update(row,{state:Goals.receipt({...p,stopReason:'running'},decisions)});lastSaved=Date.now();cacheGoal(row);}
      }});
      if(owner!==identity())return;
      if(result.stopReason!=='cancelled'&&(!current()||sourceRevision!==planRevision())){result={...result,proposal:null,stopReason:'data_changed'};}
      if(current()&&result.stopReason!=='data_changed'){const final=await goalBasis(row);if(final.fingerprint!==basis.fingerprint)result={...result,proposal:null,stopReason:'data_changed'};}
      if(result.stopReason==='data_changed'||result.stopReason==='cancelled')result.proposal=null;
      const status=Goals.stateStatus(result,decisions,basis.fingerprint);row=await store.update(row,{status,state:Goals.receipt(result,decisions)});cacheGoal(row);
      if(owner!==identity()||request!==requestId)return;
      const answer={title:'Begleiteter Auftrag · '+row.config.month,text:goalStop[result.stopReason]+'. Offene Pflichtpositionen '+result.baseline.open+' → '+result.latest.open+'. Fehlende geplante Sollstunden '+Number(result.baseline.deficit.toFixed(1))+' → '+Number(result.latest.deficit.toFixed(1))+' h.',columns:['Prüfung','Ausgangsplan','Geprüfte Vorschau'],rows:[['Offene Pflichtpositionen',String(result.baseline.open),String(result.latest.open)],['Regelauffälligkeiten',String(result.baseline.issues),String(result.latest.issues)],['Fehlende Sollstunden',Number(result.baseline.deficit.toFixed(1))+' h',Number(result.latest.deficit.toFixed(1))+' h'],['Dienständerungen','0',String(result.latest.changes)]],notes:[...result.notes,'Fortschritt und Entscheidungen wurden für deinen Benutzer im ausgewählten Unternehmen gespeichert. Beim Fortsetzen wird die Vorschau neu berechnet.'],actions:result.stopReason==='data_missing'?[{view:'settings',label:'Planungsregeln prüfen'}]:[],proposal:result.proposal,goalResult:{record:row,result,basis:basis.fingerprint},context:{intent:'goalOrder',dates:result.dates}};
      answer.text+=' '+result.latest.changes+' vorgeschlagene Dienständerungen · '+result.decisions.length+' offene Prüfpunkte.';
      if(answer.proposal){const paired=new Set(answer.proposal.changes.map(c=>c.replaces).filter(Boolean)),person=id=>{const e=snapshotState.employees.find(e=>String(e.id)===String(id));return e?[e.first,e.last].filter(Boolean).join(' '):'Zuordnung prüfen';};answer.columns=['Dienst','Bisher','Geprüfter Vorschlag','Geplante Stunden'];answer.rows=[...answer.proposal.changes.map(c=>[c.assignment.date+' · '+c.assignment.type,c.replaces?person(c.replaces.employeeId):'Offene Position',person(c.assignment.employeeId),String(Core.paidHours(snapshotState,c.assignment))+' h']),...answer.proposal.removed.filter(a=>!paired.has(a)).map(a=>[a.date+' · '+a.type,person(a.employeeId),'Entwurf entfernen','–'])];}
      answer.basis=Core.analysisBasis(snapshotState,result.dates,answer);answer.checkedRevision=sourceRevision;
      if(answer.proposal)Object.assign(answer.proposal,{owner,signature:signature(),created:Date.now(),label:answer.title,fingerprint:basis.planningFingerprint,goalOrderId:row.id,goalBasis:basis.fingerprint});
      appendGoalAnswer(answer,'Begleiteten Auftrag für '+row.config.month+' prüfen');
    }catch(error){
      if(owner===identity()&&claimed){try{row=await store.update(row,{status:'paused',state:{...row.state,stopReason:controller.signal.aborted?'cancelled':'data_changed'}});cacheGoal(row);}catch{goalError='Der letzte Fortschritt konnte nicht bestätigt werden. Bitte die Auftragsübersicht neu laden.';}}
      if(owner===identity()&&request===requestId)appendGoalAnswer({title:'Auftrag angehalten',text:error.message+(goalError?' '+goalError:''),actions:[{question:'Meine Planungsaufträge',label:'Gespeicherte Aufträge öffnen'}],context:{}},'Begleiteten Auftrag fortsetzen');
    }finally{if(runningGoal?.controller===controller)runningGoal=null;if(request===requestId){setProgress(false);if(progress)progress.textContent='Engpässe und Planungsregeln werden geprüft …';}cancel.remove();}
  }
  function goalDeferred(answer){const g=answer.goalResult;return !!g&&(g.record.state.decisions||[]).some(d=>d.key==='proposal'&&d.choice==='deferred'&&d.basis===g.basis);}
  async function acknowledgeGoal(answer,key,choice){
    syncScope();if(!authorized()||busy()||submitting)return;const owner=identity(),g=answer.goalResult,row=goalOrders.find(r=>r.id===g.record.id)||g.record;if(row.basis!==g.basis){window.showSaveToast?.('Auftrag erneut prüfen','Der gespeicherte Stand wurde inzwischen geändert.');return;}
    setProgress(true);try{const basis=await goalBasis(row);if(owner!==identity())return;if(basis.fingerprint!==g.basis||answer.checkedRevision!==planRevision())throw Error('Der Plan wurde geändert. Bitte den Auftrag erneut prüfen.');const decisions=(row.state.decisions||[]).filter(d=>d.basis===g.basis&&d.key!==key);if(choice)decisions.push({key,choice,basis:g.basis});const next=await goalStore().update(row,{state:{...row.state,decisions},status:Goals.stateStatus(g.result,decisions,g.basis)});if(owner===identity()){cacheGoal(next);rerenderConversation();}}
    catch(error){if(owner===identity())window.showSaveToast?.('Entscheidung nicht gespeichert',error.message);}finally{if(owner===identity())setProgress(false);}
  }
  function renderGoalReceipt(answer,host){
    const g=answer.goalResult,record=g.record,box=node('section',undefined,'sf-chat-goal-receipt');box.appendChild(node('h4','Gespeicherter Auftrag'));
    box.appendChild(node('p','Mitarbeiterkreis: '+goalFocus(record)));
    box.appendChild(node('p','Zuletzt: '+goalLabels[record.status]+' · '+(Report?Report.dateTime(record.updated_at,B().companyTimeZone):record.updated_at)));
    const steps=node('details',undefined,'sf-chat-details');steps.appendChild(node('summary',g.result.steps.length+' Suchschritte prüfen'));const list=node('ol');for(const step of g.result.steps)list.appendChild(node('li',({direct:'Direkte Besetzung',coverage:'Engpasslösung',hours:'Stundenverteilung',reserve:'Vertretungsreserve'})[step.strategy]+' · Runde '+step.round+' · '+(step.accepted?'Verbesserung behalten':'Keine bessere Vorschau')+' · offene Positionen '+step.before.open+' → '+step.after.open));steps.appendChild(list);box.appendChild(steps);
    if(record.basis!==g.basis)box.appendChild(node('p','Dieser Bericht gehört zu einem früheren Datenstand des Auftrags. Bitte fortsetzen und neu prüfen.'));
    else {if(g.result.decisions.length)box.appendChild(node('h4','Was noch offen ist'));for(const decision of g.result.decisions){const row=node('section',undefined,'sf-chat-goal-decision'),ack=(record.state.decisions||[]).find(d=>d.key===decision.key&&d.basis===g.basis);row.append(node('h4',decision.label),node('p',decision.text),node('p',ack?'Vermerkt: '+(ack.choice==='reviewed'?'geprüft':'später entscheiden')+'. Der offene Punkt bleibt in der Auswertung sichtbar.':'Noch nicht entschieden.'));
      for(const [label,choice] of ack?[['Entscheidung erneut öffnen',null]]:[['Als geprüft vermerken','reviewed'],['Später entscheiden','deferred']]){const button=node('button',label,'sf-chat-row-action');button.type='button';button.dataset.sfSensitive='';button.onclick=()=>acknowledgeGoal(answer,decision.key,choice);row.appendChild(button);}const inspect=node('button','Details prüfen','sf-chat-row-action');inspect.type='button';inspect.onclick=()=>submit(decision.question);row.appendChild(inspect);box.appendChild(row);
    }}
    if(answer.proposal&&record.basis===g.basis){const deferred=goalDeferred(answer),button=node('button',deferred?'Übernahme wieder zur Prüfung öffnen':'Übernahme zurückstellen','sf-chat-row-action');button.type='button';button.dataset.sfSensitive='';button.onclick=()=>acknowledgeGoal(answer,'proposal',deferred?null:'deferred');box.appendChild(button);}
    box.appendChild(node('p','Ein Prüfvermerk beseitigt keine Besetzungslücke und bestätigt keine tatsächlich geleistete Arbeitszeit.'));
    host.appendChild(box);
  }
  function renderGoalManager(filter,host){
    if(goalError){host.appendChild(node('p',goalError,'sf-chat-profile-error'));return;}
    const list=node('div',undefined,'sf-chat-goal-list'),rows=goalOrders.filter(row=>!filter.month||row.config.month===filter.month);if(!rows.length)list.appendChild(node('p',filter.month?'Kein gespeicherter Auftrag für '+filter.month+'.':'Hier sind noch keine Aufträge gespeichert.'));
    for(const row of rows){const card=node('section',undefined,'sf-chat-goal-card');card.append(node('h4',row.config.month+' · '+(row.config.goal==='coverage'?'Pflichtbesetzung':'Pflichtbesetzung und Stunden')),node('p','Mitarbeiterkreis: '+goalFocus(row)),node('p','Zuletzt: '+goalLabels[row.status]),node('p','Gespeichert: '+(Report?Report.dateTime(row.updated_at,B().companyTimeZone):row.updated_at)));
      if(row.state.latest)card.appendChild(node('p','Letzte Vorschau: '+row.state.latest.open+' offene Positionen · '+Number(row.state.latest.deficit.toFixed(1))+' fehlende Sollstunden.'));
      const run=node('button',goalBusy(row)?'Auftrag ist noch reserviert':'Auftrag fortsetzen','sf-chat-row-action');run.type='button';run.disabled=goalBusy(row);run.onclick=()=>resumeGoalById(row.id);card.appendChild(run);
      if(!goalBusy(row)){for(const [label,remove] of [[row.status==='archived'?'Wieder öffnen':'Archivieren',false],['Auftrag entfernen',true]]){const button=node('button',label,'sf-chat-row-action');button.type='button';button.onclick=async()=>{const owner=identity();if(!authorized()||busy()||submitting)return;if(remove&&!window.confirm('Diesen gespeicherten Auftrag mit seinen Prüfvermerken entfernen?'))return;setProgress(true);try{if(remove)await goalStore().remove(row);else await goalStore().update(row,{status:row.status==='archived'?'ready':'archived'});if(owner===identity())await loadGoalOrders();}catch(e){if(owner===identity())window.showSaveToast?.('Auftrag nicht geändert',e.message);}finally{if(owner===identity())setProgress(false);}if(owner===identity())submit('Meine Planungsaufträge');};card.appendChild(button);}}
      list.appendChild(card);
    }
    host.appendChild(list);const all=node('button','Aufträge neu laden','sf-chat-row-action');all.type='button';all.onclick=()=>submit('Meine Planungsaufträge');host.appendChild(all);const start=node('button','Neuen begleiteten Auftrag starten','sf-chat-row-action');start.type='button';start.onclick=()=>submit('Zielauftrag starten');host.appendChild(start);
  }
  async function persistProfile(id,name,config,remove=false){
    syncScope();if(!authorized()||busy())throw Error('Planungsdaten sind derzeit nicht bereit.');
    const owner=identity(),company=B().companyId,old=profiles.find(p=>p.id===id),clean=Workflows.profileConfig(config);
    if(id&&!old)throw Error('Dieses Profil ist nicht mehr verfügbar. Bitte neu laden.');
    if(!remove&&(!clean||!name.trim()||name.trim().length>80))throw Error('Bitte einen Profilnamen mit höchstens 80 Zeichen und gültige Ziele wählen.');
    if(demo()){
      const next=remove?profiles.filter(p=>p.id!==id):[...profiles.filter(p=>p.id!==id),{id:id||'demo-profile-'+Date.now(),name:name.trim(),config:clean,updated_at:new Date().toISOString()}];if(next.some((p,i)=>next.some((x,j)=>i!==j&&p.name.toLocaleLowerCase('de-DE')===x.name.toLocaleLowerCase('de-DE'))))throw Error('Ein Profil mit diesem Namen ist bereits vorhanden.');localStorage.setItem('sf-assistant-profiles-demo|'+owner,JSON.stringify(next));
    }else{
      let query=B().client.from('planning_assistant_profiles');const payload={name:name.trim(),config:clean};
      if(remove)query=query.delete().eq('id',id).eq('company_id',company).eq('updated_at',old.updated_at);
      else if(id)query=query.update(payload).eq('id',id).eq('company_id',company).eq('updated_at',old.updated_at);
      else query=query.insert({...payload,company_id:company});
      const q=await query.select('id').maybeSingle();if(q.error){if(q.error.code==='23505')throw Error('Ein Planungsprofil mit diesem Namen existiert bereits.');throw q.error;}if(!q.data)throw Error('Dieses Profil wurde inzwischen geändert. Bitte neu laden.');
    }
    if(identity()!==owner)return;await loadProfiles();if(identity()===owner)submit('Planungsprofile verwalten');
  }
  function clearChangeNotice(){el('sfPlanningChangeNotice')?.remove();el('sfPlanningChangeOpen')?.remove();}
  function showChangeNotice(){
    if(!changeReport||changeAcknowledged||!authorized())return;let button=el('sfPlanningChangeOpen');if(!button){button=node('button','Änderungscheck öffnen','ghost sf-planning-change-open');button.id='sfPlanningChangeOpen';button.type='button';button.onclick=()=>{open();submit('Änderungscheck anzeigen');};document.body.appendChild(button);}
    let inline=el('sfPlanningChangeNotice');if(el('sfPlanningChatLog')&&!inline){inline=node('button','Änderungscheck öffnen','sf-chat-row-action');inline.id='sfPlanningChangeNotice';inline.type='button';inline.onclick=()=>submit('Änderungscheck anzeigen');el('sfPlanningChatLog').before(inline);}
    button.hidden=!!el('sfPlanningChat')?.open;button.title=changeReport.text;button.setAttribute('aria-label','Automatische Folgeprüfung: Änderungscheck öffnen');
  }
  function mergeChange(next){
    const old=pendingChange||{dates:[],assignmentIds:[]};pendingChange={dates:[...new Set([...old.dates,...next.dates])].sort().slice(0,62),assignmentIds:[...new Set([...(old.assignmentIds||[]),...(next.assignmentIds||[])])],limited:old.limited||next.limited||old.dates.length+next.dates.length>62};changeDue=Date.now()+1600;
    changeReport=null;changeAcknowledged=false;clearChangeNotice();
  }
  function observePlanningChanges(){
    const owner=identity();if(observedOwner!==owner){observedOwner=owner;observedState=null;pendingChange=null;changeRequest=null;changeReport=null;changeRevision='';clearChangeNotice();}
    if(!Workflows||!owner||busy()||hydrationFailed||B().syncing||B().lastSyncError||window.SFMonthOptimizer?.isBusy?.())return;
    if(Date.now()-lastObserved<1400)return;lastObserved=Date.now();
    const belongs=a=>!(a.companyId||a.company_id)||(a.companyId||a.company_id)===B().companyId;
    const raw={assignments:assignments.filter(belongs).filter(a=>a._dbStatus!=='CANCELLED'&&a.status!=='CANCELLED'),absences:absences.filter(belongs)},next=Workflows.changeState(raw);
    if(!observedState){observedState=next;return;}
    if(changeReport&&changeRevision&&changeRevision!==signature()&&!pendingChange)mergeChange(changeRequest);
    const delta=Workflows.changedDays(observedState,next);observedState=next;if(delta.dates.length)mergeChange(delta);
    if(pendingChange&&Date.now()>=changeDue){const request=pendingChange;pendingChange=null;try{const current=snapshot();if(current.loading||current.error)return;changeReport=Workflows.followup(current,request);changeRequest=request;changeRevision=signature();showChangeNotice();}catch{changeReport={title:'Änderungscheck noch offen',text:'Die automatische Folgeprüfung konnte nicht abgeschlossen werden. Bitte erneut prüfen.'};changeRequest=request;showChangeNotice();}}
  }
  const reportAccess=()=>JSON.stringify([identity(),B().accessRole||'',B().accessPermissions||[]]);
  function ask(question,analysisRequest,conversation=context){
    syncScope();const state={...snapshot(),analysisRequest},answer=Core.answer(question,state,conversation);
    if(answer.reportRequest){
      try{if(!Report)throw Error('Der PDF-Bericht ist noch nicht vollständig geladen. Bitte Seite neu laden.');answer.report=Report.collect(Core,state,answer.context.dates);answer.basis=answer.report.basis;answer.columns=['Kennzahl','Positionen'];answer.rows=answer.report.summary;Object.assign(answer.report,{owner:reportAccess(),revision:signature(),selection:JSON.stringify(contextDates())});}
      catch(error){return {title:'Planungsbericht derzeit nicht verfügbar',text:error.message,context:{}};}
    }
    if(answer.basis||answer.proposal)answer.checkedRevision=planRevision();
    return answer;
  }
  function markStaleAnswers(force=false){
    if(!authorized()||busy()||!el('sfPlanningChat')?.open||!messages.some(m=>m.answer?.checkedRevision))return;
    if(!force&&Date.now()-lastAnswerCheck<1400)return;lastAnswerCheck=Date.now();
    const revision=planRevision(),selection=JSON.stringify(contextDates());
    for(const message of messages){
      if(!message.answer?.checkedRevision||message.stale)continue;
      if(message.answer.checkedRevision!==revision||message.selection!==selection){message.stale=true;const article=message.element;if(article)showStaleAnswer(message,article);}
    }
  }
  function showStaleAnswer(message,article){
    if(article.querySelector('.sf-chat-stale'))return;
    const notice=node('div',undefined,'sf-chat-stale');notice.setAttribute('role','status');notice.appendChild(node('p','Planungsdaten oder Zeitraum wurden geändert. Diese Antwort ist nicht mehr aktuell.'));
    const refresh=node('button','Erneut prüfen','sf-chat-row-action');refresh.type='button';refresh.onclick=()=>{if(message.answer.goalResult){resumeGoalById(message.answer.goalResult.record.id);return;}const question=message.answer.report?'Planungsbericht erstellen':message.answer.replayQuestion||message.question,dates=message.answer.context?.dates||[],period=Core.parsePeriod(Core.normalize(question),{today:today(),defaultDates:dates.length?dates:contextDates()}),range=dates.length&&(!period.explicit||message.answer.report)?(dates.length===1?' am '+dates[0]:' vom '+dates[0]+' bis '+dates.at(-1)):'';submit(question+range+(message.answer.context?.type?' · '+message.answer.context.type:''),message.analysisRequest,{previous:message.previous});};notice.appendChild(refresh);article.querySelector('h3')?.after(notice);
    article.querySelectorAll('[data-sf-sensitive]').forEach(button=>button.disabled=true);
  }
  function renderTaskPlan(plan,host){
    const list=node('ol',undefined,'sf-chat-task-plan');list.setAttribute('aria-label','Erkannte Aufgaben');
    plan.tasks.forEach((task,index)=>{const row=node('li'),button=node('button',(task.done?'Erneut: ':index+1+'. ')+task.label,'sf-chat-row-action');button.type='button';button.onclick=()=>submit(task.question,undefined,{task:{plan,index}});row.append(button,node('span',task.done?'Bearbeitet':'Noch offen'));list.appendChild(row);});host.appendChild(list);
  }
  async function downloadReport(report,button){
    const assertFresh=()=>{if(!authorized()||busy()||report.owner!==reportAccess()||report.revision!==signature()||report.selection!==JSON.stringify(contextDates()))throw Error('Unternehmen, Zeitraum oder Planungsdaten wurden geändert. Bitte einen neuen Planungsbericht erstellen.');};
    button.disabled=true;button.textContent='PDF wird erstellt …';let status=button.parentElement.querySelector('.sf-chat-export-status');if(!status){status=node('p',undefined,'sf-chat-export-status');status.setAttribute('role','status');button.after(status);}status.textContent='PDF wird auf diesem Gerät erstellt.';
    try{await Report.download(report,assertFresh);if(report.owner===reportAccess()){button.textContent='PDF erneut herunterladen';status.textContent='PDF wurde erstellt.';}}
    catch(error){if(report.owner===reportAccess()){window.showSaveToast?.('PDF nicht erstellt',error.message);status.textContent=error.message;status.setAttribute('role','alert');}button.textContent='PDF erneut versuchen';}
    finally{button.disabled=!!button.parentElement?.querySelector('.sf-chat-stale');}
  }
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
      const title=node('h2',proposal.undoId?'Assistentenänderungen zurücknehmen?':'Geprüfte Änderungen als Entwurf übernehmen?');title.id='sfPlanningProposalTitle';dialog.appendChild(title);
      dialog.appendChild(node('p',proposal.undoId?'Rücknahme: '+(proposal.removed||[]).length+' Assistentendienste entfernen und '+proposal.proposed.length+' frühere Entwurfsdienste wiederherstellen. Dadurch können Besetzungslücken erneut entstehen.':proposal.proposed.length+' Zuweisungen werden gespeichert. '+(proposal.removed||proposal.changes.filter(c=>c.replaces)).length+' bestehende Entwurfszuweisungen werden ersetzt.'));
      const actions=node('div',undefined,'sf-chat-actions'),cancel=node('button','Abbrechen'),accept=node('button',proposal.undoId?'Rücknahme jetzt bestätigen':'Jetzt als Entwurf übernehmen');cancel.type=accept.type='button';
      const done=value=>{dialog.close();dialog.remove();resolve(value)};cancel.onclick=()=>done(false);accept.onclick=()=>done(true);dialog.addEventListener('cancel',e=>{e.preventDefault();done(false)});
      actions.append(cancel,accept);dialog.append(actions);document.body.appendChild(dialog);dialog.showModal();cancel.focus();
    });
  }
  async function applyProposal(proposal,button){
    if(!authorized()||busy()||submitting||runningGoal||!proposal||(!proposal.proposed?.length&&!proposal.undoId))return;
    const owner=identity();let committed=false,controls=[],priorSuppression=B().suppressSync;
    try{
      if(proposal.signature!==signature()||proposal.owner!==owner||Date.now()-proposal.created>15*60*1000)throw Error('Diese Vorschau ist nicht mehr aktuell. Bitte neue Verbesserungsvorschläge erstellen.');
      if(!await confirmProposal(proposal))return;
      if(!authorized()||busy()||identity()!==owner||proposal.signature!==signature())throw Error('Die Planungsdaten wurden geändert. Bitte die Vorschau erneuern.');
      if(proposal.goalOrderId&&!demo()){const row=goalOrders.find(r=>r.id===proposal.goalOrderId);if(!row)throw Error('Bitte den gespeicherten Auftrag erneut öffnen.');const basis=await goalBasis(row);if(identity()!==owner||basis.fingerprint!==proposal.goalBasis)throw Error('Der Datenstand des Auftrags wurde geändert. Bitte den Auftrag erneut prüfen.');}
      if(B().syncing||B().lastSyncError||window.SFMonthOptimizer?.isBusy?.())throw Error('Eine andere Planung oder Speicherung läuft. Bitte anschließend erneut prüfen.');
      const changedDates=[...proposal.proposed,...(proposal.removed||proposal.changes.filter(c=>c.replaces).map(c=>c.replaces))].map(a=>a.date);
      if(changedDates.some(d=>window.SFCompliance?.isWeekPublished?.(d)))throw Error('Eine Änderung betrifft eine veröffentlichte Woche. Bitte dort einzeln prüfen.');
      const current=snapshot(),checked=[];
      for(const a of proposal.proposed){const employee=current.employees.find(e=>String(e.id)===String(a.employeeId));if(!employee||!candidateCheck(a.type,a.date,[...proposal.base,...checked],a).candidates.some(c=>String(c.e.id)===String(a.employeeId))||!Insights.capacity(current,employee,[...proposal.base,...checked],a))throw Error('Ein Vorschlag erfüllt die aktuellen Regeln nicht mehr.');checked.push(a);}
      const removed=proposal.removed||proposal.changes.filter(c=>c.replaces).map(c=>c.replaces),affected=new Set([...removed,...proposal.proposed].map(a=>String(a.employeeId)));
      if(removed.some(a=>!current.movable(a)))throw Error('Ein betroffener Entwurf ist inzwischen geschützt. Bitte neu prüfen.');
      const problems=Insights.checkedPlan(current,current.assignments,[...proposal.base,...proposal.proposed],affected,proposal.dates);if(problems.length)throw Error(problems[0]);
      const batch='assistant-'+Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join(''),generated=proposal.proposed.map((a,i)=>({...a,id:batch+'-'+i,note:a.note??(demo()?'':'Monatsoptimierung'),pause:Number(a.pause||0),version:1,_dbStatus:'DRAFT'}));
      const state=loadWork(),entry=proposal.undoId?state.entries.find(e=>e.id===proposal.undoId):{id:batch,created:Date.now(),label:proposal.label||'Assistentenänderung',dates:proposal.dates,monthCount:proposal.monthCount||1,before:removed.map(a=>({...a})),added:generated.map(a=>({id:a.id,date:a.date,type:a.type,stamp:Workflows.stamp(current,a)})),pending:true};
      if(!entry)throw Error('Die gespeicherte Rücknahme ist nicht mehr verfügbar.');
      if(!proposal.undoId){state.entries=[entry,...state.entries].slice(0,20);saveWork(state);}
      applyingProposal=true;controls=[...document.querySelectorAll('#appShell button,#appShell input,#appShell select,#appShell textarea,#sfPlanningChat button,#sfPlanningChat textarea')].map(n=>({n,disabled:n.disabled}));controls.forEach(x=>x.n.disabled=true);
      if(demo()){assignments=[...proposal.base,...generated];saveAll();committed=true;}
      else{
        B().suppressSync=true;clearTimeout(B().syncTimer);B().syncTimer=null;
        const replace=removed.map(a=>a._dbId||B().asgDb?.get(String(a.id)));
        if(replace.some(x=>!x))throw Error('Ein Entwurf besitzt noch keine gespeicherte Kennung. Bitte neu laden.');
        const rows=generated.map((a,i)=>{const t=window.SFSolidPlanningCore.interval(a.date,a.start,a.end,current.solidRules.timezone),id=B().empDb?.get(String(a.employeeId));if(!id)throw Error('Die Mitarbeiterzuordnung ist nicht aktuell.');return {employee_id:id,shift_code:a.type,starts_at:new Date(t.start).toISOString(),ends_at:new Date(t.end).toISOString(),legacy_id:a.id,note:a.note,break_minutes:Number(a.pause||0)}});
        const q=await B().client.rpc('apply_planning_period',{p_company_id:B().companyId,p_first_month:proposal.dates[0].slice(0,7)+'-01',p_month_count:proposal.monthCount||1,p_fingerprint:proposal.fingerprint,p_replace_ids:replace,p_assignments:rows,p_respect_weekly:true});
        if(q.error)throw q.error;committed=true;
        // Record success before hydration; an interrupted refresh must not lose the undo receipt.
        entry.pending=false;const committedState=loadWork();if(proposal.undoId){const old=committedState.entries.find(e=>e.id===proposal.undoId);if(old)old.undone=true;}else committedState.entries=committedState.entries.map(e=>e.id===entry.id?entry:e);saveWork(committedState);
        await B().hydrate();
      }
      if(identity()===owner){const finalState=loadWork();if(proposal.undoId){const old=finalState.entries.find(e=>e.id===proposal.undoId);if(old)old.undone=true;}else{entry.pending=false;entry.added=generated.map(a=>{const live=assignments.find(x=>String(x.id)===a.id)||a;return {id:a.id,date:a.date,type:a.type,stamp:Workflows.stamp({shifts:TYPES},live)};});finalState.entries=finalState.entries.map(e=>e.id===entry.id?entry:e);}saveWork(finalState);}
      window.renderCalendar?.();window.renderAutoPlanning?.();window.showSaveToast?.(proposal.undoId?'Assistentenänderungen zurückgenommen':'Vorschläge als Entwurf gespeichert','Die Änderungen wurden übernommen. Der Dienstplan kann jetzt geprüft werden.');
      if(button)button.disabled=true;
    }catch(error){window.showSaveToast?.(committed?'Gespeichert – Ansicht neu laden':'Vorschläge nicht übernommen',committed?'Die Speicherung war erfolgreich; die Ansicht konnte nicht aktualisiert werden. Bitte neu laden.':error.message||String(error));}
    finally{B().suppressSync=priorSuppression;applyingProposal=false;controls.forEach(x=>x.n.disabled=x.disabled);if(committed&&button)button.disabled=true;}
    if(committed&&proposal.goalOrderId&&identity()===owner){await loadGoalOrders();const row=goalOrders.find(r=>r.id===proposal.goalOrderId);if(row){open();await runGoal(row);}}
  }
  const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
  function openAction(action){
    syncScope();if(!authorized()||busy())return;
    if(action.learning){close();window.SFPlanningLearning?.open();return;}
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
      if(action.section==='rules')document.querySelector('#sfSettingsV2 [data-setting-tab="rules"]')?.click();
      const card=action.section==='rules'?document.querySelector('#view-settings .sf-rule-view'):action.section==='soll'?document.querySelector('#view-settings .sf-set-grid'):el('sfPlanningTeams');
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
  const planningIcon='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-13 5 3 3 5-5"/></svg>';
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
  function toggleQuestionGuide(force){
    const guide=el('sfPlanningQuestionGuide');if(!guide)return;
    const open=force??guide.hidden;guide.hidden=!open;el('sfPlanningChatLog').hidden=open;
    el('sfPlanningChatQuestions')?.setAttribute('aria-expanded',String(open));
    if(open)guide.querySelector('summary')?.focus();
  }
  function setProgress(active){
    submitting=active;
    const progress=el('sfPlanningChatProgress');if(progress)progress.hidden=!active;
    el('sfPlanningChatLog')?.setAttribute('aria-busy',String(active));
  }
  function mountQuestionGuide(){
    const guide=node('section',undefined,'sf-chat-question-guide');guide.id='sfPlanningQuestionGuide';guide.hidden=true;
    guide.setAttribute('aria-label','Fragen und Beispiele');guide.appendChild(node('h3','Welche Fragen kann ich stellen?'));
    guide.appendChild(node('p','Du kannst eigene Fragen zu diesen Themen formulieren. Bei einem Dienst helfen Datum und Schichtart, bei Personen Name oder Personalnummer. Du kannst mehrere Anliegen verbinden und kurz auf Rückfragen antworten. Der Assistent behält dabei den Zeitraum und eindeutig erkannte Personen im Gespräch. Er unterstützt die hier aufgeführten Planungsthemen.'));
    for(const [title,questions] of Core.questionGroups){const group=node('details',undefined,'sf-chat-details');group.appendChild(node('summary',title));const examples=node('div',undefined,'sf-chat-examples');quickButtons(examples,questions);group.appendChild(examples);guide.appendChild(group);}
    const back=node('button','Zurück zum Gespräch','sf-chat-row-action');back.type='button';back.onclick=()=>{toggleQuestionGuide(false);el('sfPlanningChatInput').focus();};guide.appendChild(back);
    el('sfPlanningChatLog').before(guide);
  }
  let formSerial=0;
  function renderAnalysisForm(config,host){
    const s=snapshot();if(!s.authorized||s.loading||s.error)return;
    const form=node('form',undefined,'sf-chat-analysis-form'),prefix='sfAnalysis'+(++formSerial)+'-';form.dataset.kind=config.kind;
    const field=(label,name,type='select',items=[],value='')=>{
      const wrap=node('label',label),input=node(type==='select'?'select':'input');input.name=name;input.id=prefix+name;wrap.htmlFor=input.id;
      if(type==='select'){const empty=node('option','Bitte auswählen');empty.value='';input.appendChild(empty);for(const [id,text] of items){const option=node('option',text);option.value=id;input.appendChild(option);}}else input.type=type;
      input.value=value||'';input.required=true;wrap.appendChild(input);form.appendChild(wrap);return input;
    };
    const people=s.employees.filter(e=>e.status==='active'&&!e.deletedAt).map(e=>[String(e.id),[e.first,e.last].filter(Boolean).join(' ')+(e.personnelNo?' · '+e.personnelNo:'')]);
    let source,target,date,type,start,end,employee,from,to;
    if(['order','multiBalance','goalOrder'].includes(config.kind)){
      if(config.kind==='goalOrder')form.appendChild(node('p','Unternehmen: '+(s.companyName||'aktuell ausgewähltes Unternehmen')+' · Bitte kontrolliere den Monat und das Ziel.'));
      field(config.kind==='goalOrder'?'1. Welchen Monat möchtest du verbessern?':'Startmonat','month','month',[],config.month);
      if(config.kind!=='multiBalance')field(config.kind==='goalOrder'?'2. Was ist dir wichtig?':'Planungsziel','goal','select',[['both','Pflichtbesetzung und Sollstunden verbessern'],['coverage','Pflichtdienste besetzen']],config.goal||'both');
      field(config.kind==='goalOrder'?'3. Für wen soll geprüft werden?':'Mitarbeiterkreis','focus','select',[['all','Alle aktiven Mitarbeiter'],['leaders','Teamleiter'],...['A','B','C','D','E'].map(t=>['team:'+t,'Team '+t]),...people.map(([id,name])=>['person:'+id,name])],config.focus||'all');
      if(config.kind==='multiBalance')field('Anzahl Monate','count','select',[2,3,4,5,6].map(n=>[String(n),n+' Monate']),String(config.count||3));
      if(config.kind==='goalOrder')form.appendChild(node('p','Der Auftrag prüft mehrere Strategien für höchstens zwei Minuten. Fortschritt und Entscheidungen werden für dieses Unternehmen und deinen Benutzer gespeichert.'));
      const button=node('button',config.kind==='goalOrder'?'Prüfung starten':'Vorschau erstellen','sf-chat-row-action');button.type='submit';form.appendChild(button);
      form.onsubmit=event=>{event.preventDefault();if(form.reportValidity()){const value=Object.fromEntries(new FormData(form));if(config.kind==='goalOrder')createAndRunGoal(value);else submit(config.kind==='order'?'Planungsauftrag vorbereiten':'Mehrmonatsausgleich vorbereiten',{kind:config.kind,...value});}};host.appendChild(form);return;
    }
    if(config.kind==='leaveImpact'){
      employee=field('Mitarbeiter','employeeId','select',people,config.employeeId);from=field('Urlaub von','startDate','date',[],config.startDate);to=field('Urlaub bis einschließlich','endDate','date',[],config.endDate);
      from.onchange=()=>{to.min=from.value;if(!to.value)to.value=from.value;};
    }else{
      const wanted=new Set(contextDates()),available=s.assignments.filter(a=>wanted.has(a.date)||String(a.id)===String(config.assignmentId)).sort((a,b)=>a.date.localeCompare(b.date)||a.type.localeCompare(b.type));
      source=field('Ausgangsdienst im gewählten Zeitraum','assignmentId','select',available.map(a=>{const e=s.employees.find(e=>String(e.id)===String(a.employeeId));return[String(a.id),a.date+' · '+a.type+' · '+(e?[e.first,e.last].filter(Boolean).join(' '):'Zuordnung prüfen')];}),config.assignmentId);
      target=field('Zielmitarbeiter','targetEmployeeId','select',people,config.targetEmployeeId);
      const details=node('details',undefined,'sf-chat-details');details.appendChild(node('summary','Datum, Schicht oder Uhrzeit anpassen'));
      date=field('Neues Datum','date','date');type=field('Neue Schicht','type','select',s.shifts.map(t=>[t.id,t.id+(t.name&&t.name!==t.id?' · '+t.name:'')]));start=field('Beginn','start','time');end=field('Ende','end','time');
      for(const input of [date,type,start,end])details.appendChild(input.closest('label'));form.appendChild(details);
      const update=()=>{const a=s.assignments.find(a=>String(a.id)===source.value),t=s.shifts.find(t=>t.id===a?.type);date.value=a?.date||'';type.value=a?.type||'';start.value=a?.start||t?.start||'';end.value=a?.end||t?.end||'';};source.onchange=update;update();
      for(const key of ['date','type','start','end'])if(config[key])({date,type,start,end})[key].value=config[key];
      type.onchange=()=>{const t=s.shifts.find(t=>t.id===type.value);if(t){start.value=t.start;end.value=t.end;}};
      if(!available.length)form.appendChild(node('p','In diesem Zeitraum sind keine Dienste geladen. Wähle oben den passenden Monat.'));
    }
    const button=node('button','Auswirkungen prüfen','sf-chat-row-action');button.type='submit';form.appendChild(button);
    form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;const request={kind:config.kind,...Object.fromEntries(new FormData(form))};submit(config.kind==='leaveImpact'?'Urlaubsfolgen prüfen':'Dienstverschiebung prüfen',request);};host.appendChild(form);
  }
  function renderProfileManager(host){
    const owner=identity(),form=node('form',undefined,'sf-chat-profile-form'),make=(label,name,type,items=[],value='')=>{const wrap=node('label',label),input=node(type==='select'?'select':'input');input.name=name;if(type==='select')for(const [id,text] of items){const option=node('option',text);option.value=id;input.appendChild(option);}else input.type=type;input.value=value;wrap.appendChild(input);form.appendChild(wrap);return input;};
    const choose=make('Gespeichertes Unternehmensprofil','profileId','select',[['','Neues Profil anlegen'],...profiles.map(p=>[p.id,p.name])]),month=make('Startmonat für die Ausführung','month','month',[],contextDates()[0].slice(0,7));month.required=true;
    const run=node('button','Mit Profil vorbereiten');run.type='button';run.disabled=!choose.value;run.onclick=()=>{if(month.reportValidity()&&choose.value)submit('Planungsprofil ausführen',{kind:'profile',profileId:choose.value,month:month.value});};form.appendChild(run);
    const details=node('details',undefined,'sf-chat-details');details.open=!profiles.length;details.appendChild(node('summary','Profil anlegen oder bearbeiten'));
    const name=make('Profilname','name','text',[],'Standardprofil');name.maxLength=80;name.required=true;
    const mode=make('Ablauf','mode','select',[['order','Planungsauftrag'],['multiBalance','Mehrmonatsausgleich'],['variants','Planvarianten vergleichen']],'order'),goal=make('Planungsziel','goal','select',[['both','Pflichtbesetzung und Sollstunden'],['coverage','Pflichtbesetzung']],'both');
    const people=snapshot().employees.filter(e=>e.status==='active'&&!e.deletedAt),focus=make('Mitarbeiterkreis','focus','select',[['all','Alle aktiven Mitarbeiter'],['leaders','Teamleiter'],...['A','B','C','D','E'].map(t=>['team:'+t,'Team '+t]),...people.map(e=>['person:'+e.id,[e.first,e.last].filter(Boolean).join(' ')])],'all'),count=make('Monate beim Mehrmonatsausgleich','count','select',[2,3,4,5,6].map(n=>[String(n),String(n)]),'3');
    for(const input of [name,mode,goal,focus,count])details.appendChild(input.closest('label'));
    const checks=node('fieldset'),legend=node('legend','Zusätzliche Ergebnisprüfungen');checks.appendChild(legend);const checkInputs={};for(const [id,label] of [['rules','Regelübersicht'],['hours','Stundenübersicht'],['reserve','Vertretungsreserve']]){const wrap=node('label',label),input=node('input');input.type='checkbox';input.name='check-'+id;input.checked=id!=='reserve';checkInputs[id]=input;wrap.prepend(input);checks.appendChild(wrap);}details.appendChild(checks);
    const error=node('p',undefined,'sf-chat-profile-error');error.setAttribute('role','status');
    const save=node('button','Profil speichern');save.type='submit';const remove=node('button','Profil löschen');remove.type='button';remove.disabled=true;details.append(save,remove,error);form.appendChild(details);
    const adjust=()=>{if(mode.value!=='order')goal.value='both';goal.disabled=mode.value!=='order';count.disabled=mode.value!=='multiBalance';};mode.onchange=adjust;
    choose.onchange=()=>{const p=profiles.find(p=>p.id===choose.value),c=p?.config||{mode:'order',goal:'both',focus:'all',count:3,checks:['rules','hours']};name.value=p?.name||'Standardprofil';mode.value=c.mode;goal.value=c.goal;focus.value=c.focus;count.value=String(c.count);for(const [key,input] of Object.entries(checkInputs))input.checked=c.checks.includes(key);run.disabled=remove.disabled=!p;details.open=!p;adjust();};adjust();
    const persist=async deleting=>{if(identity()!==owner)return;if(!deleting&&(!name.reportValidity()||!form.reportValidity()))return;save.disabled=remove.disabled=true;try{await persistProfile(choose.value,name.value,{mode:mode.value,goal:goal.value,focus:focus.value,count:Number(count.value),checks:Object.entries(checkInputs).filter(([,input])=>input.checked).map(([key])=>key)},deleting);}catch(e){if(identity()===owner)error.textContent=e.message||String(e);}finally{save.disabled=false;remove.disabled=!choose.value;}};
    form.onsubmit=e=>{e.preventDefault();persist(false);};remove.onclick=()=>{if(choose.value&&confirm('Dieses Planungsprofil löschen? Dienste und verbindliche Regeln bleiben erhalten.'))persist(true);};host.appendChild(form);
  }
  function renderWizard(config,host){
    const list=node('ol',undefined,'sf-chat-wizard');list.setAttribute('aria-label','Planungsschritte');
    for(const step of config.steps){const item=node('li',undefined,step.done?'is-complete':''),label=node('strong',(step.done?'Erledigt: ':'Offen: ')+step.title);item.append(label,node('p',step.text));
      const actions=node('div',undefined,'sf-chat-actions'),open=node('button',step.title+' prüfen');open.type='button';open.onclick=()=>submit(step.question);actions.appendChild(open);
      if(!step.automatic){const toggle=node('button',step.done?'Erneut öffnen':'Als geprüft markieren');toggle.type='button';toggle.onclick=()=>completeWizard(config.month,step.key,!step.done);actions.appendChild(toggle);}item.appendChild(actions);list.appendChild(item);
    }host.appendChild(list);
  }
  function bindEditFunction(){
    const edit=window.editAssignment;
    if(typeof edit==='function'&&!edit.__sfChatService){const wrapped=function(id){const a=snapshot().assignments?.find(a=>String(a.id)===String(id));if(a)setService(a.date,a.type,a.id);const result=edit.apply(this,arguments);bindEditPreview(id);return result;};wrapped.__sfChatService=true;window.editAssignment=wrapped;}
  }
  function bindEditPreview(assignmentId){
    const modal=el('spAssignModal'),foot=modal?.querySelector('.sp-assign-foot');if(!authorized()||!foot||!el('spEditEmp')||el('sfAssignmentImpactButton'))return;
    const button=node('button','Auswirkungen prüfen','ghost');button.type='button';button.id='sfAssignmentImpactButton';foot.appendChild(button);
    const invalidate=()=>{const panel=el('sfAssignmentImpactPreview');if(panel){panel.replaceChildren(node('p','Eingaben geändert – Auswirkungen bitte erneut prüfen.'));}};
    for(const id of ['spEditEmp','spEditType','spEditDate','spEditStart','spEditEnd']){el(id)?.addEventListener('input',invalidate);el(id)?.addEventListener('change',invalidate);}
    button.onclick=()=>{
      syncScope();if(!authorized()||busy())return;
      const request={kind:'changeImpact',assignmentId,targetEmployeeId:el('spEditEmp').value,date:el('spEditDate').value,type:el('spEditType').value,start:el('spEditStart').value,end:el('spEditEnd').value};
      let panel=el('sfAssignmentImpactPreview');if(!panel){panel=node('section',undefined,'sf-chat-editor-preview');panel.id='sfAssignmentImpactPreview';modal.querySelector('.sp-assign-body').appendChild(panel);}panel.replaceChildren();
      try{const answer=ask('Dienstverschiebung prüfen',request);answer.actions=[];renderMessage({answer},panel);}catch(error){panel.appendChild(node('p','Die Auswirkungen konnten nicht vollständig geprüft werden. Bitte die Planungsdaten neu laden.'));}
      panel.scrollIntoView({block:'nearest'});
    };
  }
  function renderMessage(message,target){
    const log=target||el('sfPlanningChatLog');if(!log)return;
    const article=node('article',undefined,'sf-chat-message '+(message.user?'is-user':'is-answer'));
    article.appendChild(node('small',message.user?'Du':'Planungsassistent','sf-chat-author'));
    if(message.user)article.appendChild(node('p',message.text));
    else{
      const a=message.answer;article.appendChild(node('h3',a.title));article.appendChild(node('p',a.text));if(a.interpretation)article.appendChild(node('p',a.interpretation,'sf-chat-basis-warning')); 
      if(a.clarification?.length){const choices=node('div',undefined,'sf-chat-clarification');choices.setAttribute('role','group');choices.setAttribute('aria-label','Rückfrage beantworten');for(const choice of a.clarification){const button=node('button',choice.label);button.type='button';button.onclick=async()=>{const owner=identity(),generation=requestId;button.disabled=true;if(choice.learning)await recordVocabularyChoice(choice.learning);if(identity()===owner&&generation===requestId)await submit(choice.question);button.disabled=false;};choices.appendChild(button);}article.appendChild(choices);}
      if(a.basis){const b=a.basis,details=node('details',undefined,'sf-chat-basis');details.open=!!b.warnings?.length;details.appendChild(node('summary','Prüfgrundlage · '+b.company+' · '+b.from+' bis '+b.to));const fields=node('dl');for(const [label,value] of [['Planstatus',b.planStatus],['Datenumfang',b.scope],['Letzter Abruf',Report?Report.dateTime(b.readAt,b.timezone):b.readAt||'Nicht bestätigt'],['Prüfung erstellt',Report?Report.dateTime(b.checkedAt,b.timezone):b.checkedAt],['Vollständigkeit',b.completeness]]){const row=node('div');row.append(node('dt',label),node('dd',value));fields.appendChild(row);}details.appendChild(fields);for(const warning of b.warnings||[])details.appendChild(node('p',warning,'sf-chat-basis-warning'));article.appendChild(details);}
      if(a.taskPlan)renderTaskPlan(a.taskPlan,article);
      if(a.report){const button=node('button','Planungsbericht als PDF herunterladen','sf-chat-report-button');button.type='button';button.dataset.sfSensitive='';button.onclick=()=>downloadReport(a.report,button);article.appendChild(button);}
      if(a.blockers?.length){const section=node('section',undefined,'sf-chat-blockers'),list=node('ul');section.appendChild(node('h4','Verbleibende Engpässe'));a.blockers.forEach(text=>list.appendChild(node('li',text)));section.appendChild(list);article.appendChild(section);}
      if(a.rows?.length){
        const results=node('div',undefined,'sf-chat-results');results.setAttribute('aria-label',a.title+' – Ergebnisse');
        const count=node('p',undefined,'sf-chat-result-count'),list=node('div',undefined,'sf-chat-result-list');
        const more=node('button',undefined,'sf-chat-more');more.type='button';let shown=0;
        const append=()=>{
          const end=Math.min(shown+12,a.rows.length);
          for(let i=shown;i<end;i++){
            const values=a.rows[i],card=node('section',undefined,'sf-chat-result');card.dataset.sfChatResult='';
            const priority=a.columns[0]==='Priorität';
            if(priority)card.appendChild(node('span',values[0],'sf-chat-priority'+(/Bereits offen|Keine direkte Reserve/.test(values[0])?' is-danger':values[0]==='Wenig Reserve'?' is-warning':'')));
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
        more.onclick=append;append();results.append(count,list,more);if(a.goalResult){const details=node('details',undefined,'sf-chat-details');details.appendChild(node('summary',a.proposal?'Vorgeschlagene Dienständerungen ansehen':'Ergebnis im Detail ansehen'));details.appendChild(results);article.appendChild(details);}else article.appendChild(results);
      }
      if(a.notes?.length){
        const details=node('details',undefined,'sf-chat-details'),list=node('ul');
        details.appendChild(node('summary','Hinweise zur Auswertung'));a.notes.forEach(x=>list.appendChild(node('li',x)));details.appendChild(list);article.appendChild(details);
      }
      if(a.actions?.length){const actions=node('div',undefined,'sf-chat-actions');a.actions.forEach(action=>{const button=node('button',action.label);button.type='button';button.onclick=()=>openAction(action);actions.appendChild(button);});article.appendChild(actions);}
      if(a.form)renderAnalysisForm(a.form,article);
      if(a.goalManager)renderGoalManager(a.goalManager,article);
      if(a.goalResult)renderGoalReceipt(a,article);
      if(a.wizard)renderWizard(a.wizard,article);
      if(a.profileManager)renderProfileManager(article);
      if(a.variants){const actions=node('div',undefined,'sf-chat-actions');for(const variant of a.variants){const button=node('button',variant.label+' prüfen');button.type='button';button.onclick=()=>variant.profileId?submit('Planungsprofil ausführen',{kind:'profile',profileId:variant.profileId,strategy:variant.key,month:variant.month}):submit('Planvariante prüfen',{kind:'variant',strategy:variant.key,month:variant.month,focus:variant.focus?.length===1?'person:'+variant.focus[0]:'all',focusIds:variant.focus});actions.appendChild(button);}article.appendChild(actions);}
      if((a.proposal?.proposed?.length||a.proposal?.undoId)&&a.proposal.owner&&!goalDeferred(a)){const button=node('button',a.proposal.undoId?'Rücknahme bestätigen':'Vorschläge als Entwurf übernehmen','sf-chat-row-action');button.type='button';button.dataset.sfSensitive='';button.onclick=()=>applyProposal(a.proposal,button);article.appendChild(button);}
      if(message.completedTask){const {plan,index}=message.completedTask,following=plan.tasks.findIndex((task,i)=>i>index&&!task.done),nextIndex=following<0?plan.tasks.findIndex(task=>!task.done):following,next=plan.tasks[nextIndex];if(next){const button=node('button','Nächster Schritt: '+next.label,'sf-chat-row-action');button.type='button';button.onclick=()=>submit(next.question,undefined,{task:{plan,index:nextIndex}});article.appendChild(button);}else article.appendChild(node('p','Alle Schritte dieses Auftrags wurden bearbeitet.','sf-chat-task-complete'));}
      if(a.suggestions?.length){const examples=node('div',undefined,'sf-chat-examples');quickButtons(examples,a.suggestions);article.appendChild(examples);}
      article.appendChild(node('small',a.basis?'Prüf- und Abrufzeit siehe Prüfgrundlage.':a.notes?.some(n=>/^Quelle: SchichtFunk Hilfe-Center/.test(n))?'SchichtFunk Hilfe-Center':'Planungsassistent · Unterstützte Abläufe','sf-chat-source'));
    }
    message.element=article;if(message.stale)showStaleAnswer(message,article);log.appendChild(article);
  }
  async function submit(raw,analysisRequest,options={}){
    syncScope();if(!authorized()||busy()||submitting)return;
    const input=el('sfPlanningChatInput'),text=String(raw??input?.value??'').trim().slice(0,1200);if(!text)return;
    let answer;const owner=identity(),request=++requestId,conversation=options.previous||(options.task?{}:context),task=options.task||activeTask;
    if(options.task)activeTask=options.task;
    toggleQuestionGuide(false);setProgress(true);
    el('sfPlanningChatStatus').textContent='Planungsdaten werden geprüft.';
    try{
      if(['report','bottlenecks','forecast','leaveImpact','changeImpact','order','multiBalance','undo','wizard','variants','profiles','followup','goalOrders','goalResume'].includes(Core.intentFor(Core.normalize(text))))await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(owner!==identity()||request!==requestId)return;
      if(Core.intentFor(Core.normalize(text))==='report'||Core.isReportFollowup(text,conversation)||/protokoll|gespeicherte|planungsgruende|besetzung.*verhindert/.test(Core.normalize(text)))await loadRuns();
      if(Core.intentFor(Core.normalize(text))==='profiles')await loadProfiles();
      if(['goalOrders','goalResume'].includes(Core.intentFor(Core.normalize(text))))await loadGoalOrders();
      if(owner!==identity()||request!==requestId)return;
      answer=ask(text,analysisRequest,conversation);
      if(answer.proposal&&(answer.proposal.proposed?.length||answer.proposal.undoId)){
        if(!demo()){
          if(B().syncing||window.SFMonthOptimizer?.isBusy?.())throw Error('Eine Planung oder Speicherung läuft. Bitte danach erneut prüfen.');
          clearTimeout(B().syncTimer);B().syncTimer=null;await B().sync();if(B().lastSyncError)throw B().lastSyncError;
          if(owner!==identity()||request!==requestId)return;
            let q;refreshingProposal={owner,request};
            try{
              await B().hydrate();
              if(owner!==identity()||request!==requestId)return;
              q=await B().client.rpc('preview_planning_period',{p_company_id:B().companyId,p_first_month:answer.proposal.dates[0].slice(0,7)+'-01',p_month_count:answer.proposal.monthCount||1});if(q.error)throw q.error;
            }finally{refreshingProposal=null;syncScope();}
          if(owner!==identity()||request!==requestId)return;
          protectedAssignmentIds=new Set(q.data.protectedIds||[]);
          answer=ask(text,analysisRequest,conversation);if(answer.proposal){const protectedIds=protectedAssignmentIds;if((answer.proposal.removed||answer.proposal.changes.filter(c=>c.replaces).map(c=>c.replaces)).some(a=>protectedIds.has(a._dbId||B().asgDb?.get(String(a.id)))))throw Error('Ein vorgeschlagener Wechsel betrifft einen geschützten Dienst. Bitte im Dienstplan einzeln prüfen.');answer.proposal.fingerprint=q.data.fingerprint;}
        }
        if(answer.proposal)Object.assign(answer.proposal,{owner,signature:signature(),created:Date.now(),label:answer.title});
      }
    }catch(error){answer={title:'Prüfung derzeit nicht möglich',text:error.message||'Bitte lade die Planungsdaten erneut und versuche es noch einmal.',context:{}};}
    finally{if(request===requestId)setProgress(false);}
    if(owner!==identity()||request!==requestId)return;
    if(!authorized()||busy())return;
    if(answer.wizard){try{const state=loadWork();state.activeMonth=answer.wizard.month;saveWork(state);}catch{answer.notes=[...(answer.notes||[]),'Fortschritt konnte in diesem Browser nicht gespeichert werden.'];}}
    if(Core.intentFor(Core.normalize(text))==='followup'){changeAcknowledged=true;clearChangeNotice();}
    const activeMonth=loadWork().activeMonth;if(activeMonth&&!answer.wizard)answer.actions=[...(answer.actions||[]),{question:'Geführte Monatsplanung '+activeMonth,label:'Planung fortsetzen'}];
    let completedTask=null;
    if(answer.taskPlan)activeTask=null;
    else if(task&&!answer.context?.pending&&!answer.clarification&&!answer.form&&(answer.basis||answer.context?.intent==='actualHours')&&(answer.context?.intent===task.plan.tasks[task.index].intent||task.plan.tasks[task.index].intent==='workload'&&answer.context?.intent==='actualHours')){task.plan.tasks[task.index].done=true;completedTask=task;activeTask=null;}
    else if(task&&!answer.context?.pending&&!answer.context?.clarify&&!answer.form)activeTask=null;
    context=answer.context||{};if(input)input.value='';
    messages.push({user:true,text},{answer,question:text,analysisRequest,previous:conversation,selection:JSON.stringify(contextDates()),completedTask});if(messages.length>40)messages=messages.slice(-40);
    el('sfPlanningChatWelcome')?.remove();el('sfPlanningChatLog')?.replaceChildren();messages.forEach(message=>renderMessage(message));
    const log=el('sfPlanningChatLog'),question=log?.querySelector('.is-user:nth-last-child(2)');if(log&&question)log.scrollTop=question.offsetTop;
    el('sfPlanningChatStatus').textContent=answer.title;input?.focus();
    updatePeriod();markStaleAnswers(true);
    if(answer.goalManager?.resume){const matches=goalOrders.filter(row=>row.status!=='archived'&&(!answer.goalManager.month||row.config.month===answer.goalManager.month));if(matches.length===1&&!goalBusy(matches[0]))await runGoal(matches[0]);}
    if(answer.form){const form=log?.lastElementChild?.querySelector('.sf-chat-analysis-form');if(form){log.scrollTop=Math.max(0,form.offsetTop-12);form.querySelector('select,input')?.focus({preventScroll:true});}}
  }
  function updatePeriod(){if(el('sfPlanningChatPeriod'))el('sfPlanningChatPeriod').textContent=Core.periodLabel(context.dates||contextDates());updateService();}
  async function recordVocabularyChoice(choice){
    const owner=identity(),company=B().companyId;if(!authorized()||demo()||!window.SFPlanningVocabulary.learnable(choice.term,snapshot()))return;
    try{const r=await B().client.rpc('record_planning_word_choice',{p_company_id:company,p_term:choice.term,p_target:choice.target});if(r.error)throw r.error;if(identity()!==owner)return;if(r.data?.active){const c=B().companyPrivateConfiguration;if(c?.companyId===company)c.data.planningDictionary=[...(c.data.planningDictionary||[]).filter(x=>x.term!==choice.term),{term:choice.term,target:choice.target}];}}
    catch(e){if(identity()===owner)window.showSaveToast?.('Begriff nicht gespeichert','Die ausgewählte Prüfung kann trotzdem ausgeführt werden.');}
  }
  async function openDictionary(){
    syncScope();if(!authorized()||busy()||demo())return;
    const owner=identity(),company=B().companyId,dialog=node('dialog',undefined,'sf-planning-chat');dialog.id='sfDictionaryDialog';
    const box=node('div',undefined,'sf-chat-log'),title=node('h2','Gemeinsamer Wortschatz'),info=node('p','Bis zu 200 Begriffe für alle Unternehmen. Ein Begriff kann bereits bekannt sein, auch wenn die zugehörige Schicht hier noch nicht eingerichtet ist. Nur die zentrale Pflege darf Einträge ändern.');
    const status=node('p');status.setAttribute('role','status');const closeButton=node('button','Schließen');closeButton.type='button';closeButton.onclick=()=>dialog.remove();box.append(title,info,status,closeButton);dialog.appendChild(box);document.body.appendChild(dialog);dialog.showModal();
    try{const read=await B().client.rpc('company_private_client_configuration',{p_company_id:company});if(read.error)throw read.error;if(owner!==identity())return;let rows=read.data?.planningDictionaryManual||read.data?.planningDictionary||[],editable=read.data?.planningDictionaryEditable===true;let sharedData=read.data||{};
      const sources=node('details',undefined,'sf-chat-details');sources.appendChild(node('summary','Automatisch verfügbare Begriffe aus SchichtFunk'));const catalog=window.SFPlanningVocabulary.corpus({...snapshot(),publicHelpArticles:window.SFHelpContent?.articles||{}});sources.appendChild(node('p',catalog.length+' Funktions-, Hilfe- und Schichtbezeichnungen werden bei Rückfragen berücksichtigt.'));for(const row of catalog.slice(0,20))sources.appendChild(node('p',row.term+' · '+row.source));box.appendChild(sources);
      const learned=node('details',undefined,'sf-chat-details');learned.appendChild(node('summary','Automatisch gewonnene Zuordnungen'));learned.appendChild(node('p','Aktiv ab drei verschiedenen Benutzern aus mindestens zwei Unternehmen oder nach ausdrücklicher Freigabe durch die zentrale Pflege. Widersprüchliche Bedeutungen bleiben gesperrt. Es werden nur geeignete allgemeine Planungsbegriffe gelernt.'));for(const row of read.data?.planningLearnedWords||[]){const card=node('div',undefined,'sf-chat-goal-card');card.appendChild(node('p',row.term+' → '+(window.SFPlanningVocabulary.topics[row.target.slice(6)]||row.target)+' · '+row.confirmations+' Bestätigungen · '+row.companies+' Unternehmen · '+(row.disabled?'Deaktiviert':row.conflict?'Widerspruch':row.approved?'Zentral freigegeben':row.confirmations>=3&&row.companies>=2?'Aktiv':'Kandidat')));if(editable&&!row.approved&&!row.disabled&&!row.conflict){const approve=node('button','Bedeutung stimmt – übernehmen');approve.type='button';approve.onclick=async()=>{approve.disabled=true;try{const r=await B().client.rpc('approve_learned_planning_word',{p_company_id:company,p_term:row.term,p_target:row.target});if(r.error)throw r.error;if(identity()!==owner)return;const fresh=await B().client.rpc('company_private_client_configuration',{p_company_id:company});if(fresh.error)throw fresh.error;if(identity()!==owner)return;B().companyPrivateConfiguration={companyId:company,data:fresh.data};context={};messages=[];welcome();dialog.remove();openDictionary();}catch(e){if(identity()===owner)status.textContent=e.message;}finally{approve.disabled=false;}};card.appendChild(approve);}if(editable){const toggle=node('button',row.disabled?'Wieder zulassen':'Automatische Zuordnung deaktivieren');toggle.type='button';toggle.onclick=async()=>{toggle.disabled=true;try{const r=await B().client.rpc('disable_learned_planning_word',{p_company_id:company,p_term:row.term,p_disabled:!row.disabled});if(r.error)throw r.error;if(identity()!==owner)return;const fresh=await B().client.rpc('company_private_client_configuration',{p_company_id:company});if(fresh.error)throw fresh.error;if(identity()!==owner)return;B().companyPrivateConfiguration={companyId:company,data:fresh.data};context={};messages=[];welcome();dialog.remove();openDictionary();}catch(e){if(identity()===owner)status.textContent=e.message;}finally{toggle.disabled=false;}};card.appendChild(toggle);}learned.appendChild(card);}box.appendChild(learned);
      const list=node('div'),form=node('form',undefined,'sf-chat-analysis-form'),term=node('input'),target=node('select'),save=node('button','Begriff speichern');term.required=true;term.maxLength=40;term.placeholder='Zum Beispiel Nachtrunde';term.setAttribute('aria-label','Eigener Begriff');target.setAttribute('aria-label','Bedeutung');for(const [value,label] of [...Object.entries(window.SFPlanningVocabulary.topics).map(([k,v])=>['topic:'+k,v]),...[...new Set(['O1','O2','O3','OT','OT1','OT2','OT3','TL','TL-LE','TL-RE','FD','SD','ND',...snapshot().shifts.map(t=>t.id)])].map(id=>[id,id+(snapshot().shifts.some(t=>t.id===id)?' · hier eingerichtet':' · hier nicht eingerichtet')])]){const option=node('option',label);option.value=value;target.appendChild(option);}form.append(term,target,save);box.append(list);if(editable)box.appendChild(form);else status.textContent='Gemeinsamer Wortschatz · Lesemodus. Änderungen erfolgen durch die zentrale Pflege.';
      let saving=false,editing=null;
      const persist=async next=>{if(!editable||saving||identity()!==owner)return;saving=true;save.disabled=true;status.textContent='Wörterbuch wird gespeichert …';try{const r=await B().client.rpc('save_planning_dictionary',{p_company_id:company,p_entries:next,p_expected:rows});if(r.error)throw r.error;if(identity()!==owner)return;rows=r.data;B().companyPrivateConfiguration={companyId:company,data:{...sharedData,planningDictionaryManual:rows,planningDictionary:[...rows,...(sharedData.planningDictionary||[]).filter(x=>!(sharedData.planningDictionaryManual||rows).some(m=>m.term===x.term)&&!rows.some(m=>m.term===x.term))]}};context={};messages=[];activeTask=null;welcome();status.textContent='Gespeichert. Der Gesprächskontext wurde für die neuen Begriffe zurückgesetzt.';render();term.value='';editing=null;}catch(e){if(identity()===owner)status.textContent=e.message;}finally{saving=false;save.disabled=false;}};
      const render=()=>{list.replaceChildren();for(const row of rows){const line=node('div',undefined,'sf-chat-goal-card');line.appendChild(node('p',row.term+' → '+(window.SFPlanningVocabulary.topics[row.target.slice(6)]||row.target)));const edit=node('button','Bearbeiten');edit.type='button';edit.onclick=()=>{editing=row.term;term.value=row.term;target.value=row.target;term.focus();};const remove=node('button','Löschen');remove.type='button';remove.onclick=()=>persist(rows.filter(x=>x.term!==row.term));if(editable)line.append(edit,remove);list.appendChild(line);}};
      form.onsubmit=e=>{e.preventDefault();const value=window.SFPlanningVocabulary.normalize(term.value).trim();if(!/^[a-z0-9][a-z0-9 -]{1,39}$/.test(value)){status.textContent='Bitte 2 bis 40 Zeichen verwenden: Buchstaben, Zahlen, Leerzeichen oder Bindestriche.';return;}const reserved=snapshot().shifts.some(t=>Core.normalize(t.id)===value)||['loeschen','speichern','veroeffentlichen','uebernehmen'].includes(value);if(reserved){status.textContent='Diese Schichtkennung oder Aktion kann nicht umbenannt werden.';return;}persist([...rows.filter(x=>x.term!==value&&x.term!==editing),{term:value,target:target.value}]);};render();
    }catch(e){if(owner===identity())status.textContent=e.message;}
  }
  function welcome(){
    const log=el('sfPlanningChatLog');if(!log)return;log.replaceChildren();
    const welcome=node('section',undefined,'sf-chat-welcome');welcome.id='sfPlanningChatWelcome';
    welcome.appendChild(node('h3','Was möchtest du heute planen oder prüfen?'));
    welcome.appendChild(node('p','Schreibe deine Frage unten oder wähle, wobei ich dich unterstützen soll.'));
    const examples=node('div',undefined,'sf-chat-examples sf-chat-start');
    for(const [label,description,question] of [
      ['Plan prüfen','Besetzung, Regeln und Stunden kontrollieren','Monatscheck starten'],
      ['Plan verbessern','Lücken schließen und Stunden verbessern','Zielauftrag starten'],
      ['Ausfall lösen','Einen Ausfall simulieren und Ersatz prüfen','Ausfallsimulation starten'],
      ['Meine Aufträge','Gespeicherte Aufträge ansehen und fortsetzen','Meine Planungsaufträge']
    ]){const button=node('button',undefined,'sf-chat-example sf-chat-primary');button.type='button';button.append(node('strong',label),node('span',description));button.onclick=()=>submit(question);examples.appendChild(button);}
    welcome.appendChild(examples);
    const tools=node('details',undefined,'sf-chat-details');tools.appendChild(node('summary','Weitere Funktionen'));const moreTools=node('div',undefined,'sf-chat-examples');for(const [label,question] of [['Planungsbericht','Planungsbericht erstellen'],['Lernpräferenzen','Lernpräferenzen verwalten'],['Planungsprofile','Planungsprofile verwalten'],['Änderungscheck','Änderungscheck anzeigen'],['Planvarianten','Planvarianten vergleichen'],['Planungsauftrag','Planungsauftrag starten'],['Geführte Planung','Hilf mir, diesen Monat fertigzustellen'],['Mehrmonatsausgleich','Mehrmonatsausgleich starten'],['Rückgängig machen','Nimm die letzte Änderung des Assistenten zurück.'],['Frühwarnung','Frühwarnung starten'],['Urlaubsfolgen','Urlaubsfolgen prüfen'],['Dienständerung prüfen','Dienstverschiebung prüfen'],['Engpass lösen','Engpasslöser starten'],['Belastung prüfen','Belastungscheck starten'],['Stunden verbessern','Verbesserungsvorschläge erstellen'],['Offene Dienste','Welche Dienste sind im gewählten Zeitraum noch offen?'],['Ersatz finden','Welche Mitarbeiter kommen als Ersatz infrage?'],['Planungshilfe','Welche Hilfethemen kennst du?']]){const button=node('button',label,'sf-chat-example');button.type='button';button.onclick=()=>submit(question);moreTools.appendChild(button);}if(!demo()){const dictionary=node('button','Gemeinsamer Wortschatz','sf-chat-example');dictionary.type='button';dictionary.onclick=openDictionary;moreTools.appendChild(dictionary);}tools.appendChild(moreTools);welcome.appendChild(tools);
    const details=node('details',undefined,'sf-chat-details');details.appendChild(node('summary','Weitere Beispielfragen'));
    const additional=node('div',undefined,'sf-chat-examples');quickButtons(additional,[
      'Warum konnte die Auto-Planung diesen Dienst nicht besetzen?',
      'Bei welchen Mitarbeitern fehlt eine Teamzuordnung?',
      'Wie stelle ich den Rhythmus von Team E ein?',
      'Wie viele Stunden sind im gewählten Zeitraum geplant?',
      'Welche Dienste hat Team E im gewählten Zeitraum?',
      'Welche Planungsregeln gelten?',
      'Welche Schichtwechsel sind erlaubt?',
      'Wie werden OT1 OT2 OT3 geplant?',
      'Läuft die Auto-Planung im Hintergrund?',
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
      const questions=node('button','Fragen & Beispiele');questions.type='button';questions.id='sfPlanningChatQuestions';questions.setAttribute('aria-controls','sfPlanningQuestionGuide');questions.setAttribute('aria-expanded','false');questions.onclick=()=>toggleQuestionGuide();el('sfPlanningChatReset').before(questions);mountQuestionGuide();
      const progress=node('p','Engpässe und Planungsregeln werden geprüft …','sf-chat-progress');progress.id='sfPlanningChatProgress';progress.hidden=true;progress.setAttribute('role','status');el('sfPlanningChatForm').before(progress);
      const service=node('div',undefined,'sf-chat-service');service.id='sfPlanningChatService';service.hidden=true;el('sfPlanningChatLog').before(service);
      el('sfPlanningChatClose').onclick=()=>close();
      dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
      dialog.addEventListener('close',()=>{if(!dialog.open)el('sfPlanningAssistantButton')?.setAttribute('aria-expanded','false');});
      document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented&&dialog.open&&!document.querySelector('dialog:modal')){event.preventDefault();close();}});

      el('sfPlanningChatForm').onsubmit=event=>{event.preventDefault();submit();};
      el('sfPlanningChatInput').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();submit();}};
      el('sfPlanningChatReset').onclick=()=>{reset();el('sfPlanningChatMonth').value='';welcome();updatePeriod();el('sfPlanningChatInput').focus();};
      el('sfPlanningChatMonth').onchange=event=>{runningGoal?.controller.abort();requestId++;setProgress(false);activeTask=null;selectedMonth=event.target.value;selectedService=null;context={};updatePeriod();markStaleAnswers(true);event.target.closest('details').open=false;};
      el('sfPlanningChatCurrent').onclick=()=>{runningGoal?.controller.abort();requestId++;setProgress(false);activeTask=null;selectedMonth='';selectedService=null;context={};el('sfPlanningChatMonth').value='';updatePeriod();markStaleAnswers(true);el('sfPlanningChatMonth').closest('details').open=false;};
    }
    if(!messages.length)welcome();else{el('sfPlanningChatLog').replaceChildren();messages.forEach(message=>renderMessage(message));}
    syncPlacement();el('sfPlanningChatMonth').value=selectedMonth;updatePeriod();dialog.show();showChangeNotice();
    if(dialog.classList.contains('sf-chat-docked'))dialog.scrollIntoView({block:'nearest'});
    el('sfPlanningAssistantButton')?.setAttribute('aria-expanded','true');el('sfPlanningChatInput').focus({preventScroll:true});
  }
  function mount(){
    const host=document.body;if(!host)return;
    if(!el('sfPlanningAssistantButton')){const button=node('button',undefined,'sf-chat-launcher');button.innerHTML='<span class="sf-chat-launcher-mark">'+planningIcon+'</span><span class="sf-chat-launcher-copy"><strong>Planungsassistent</strong><small>Dein nächster Schritt zum fertigen Plan</small></span><span class="sf-chat-launcher-chevron" aria-hidden="true">⌃</span>';button.id='sfPlanningAssistantButton';button.type='button';button.setAttribute('aria-label','Planungsassistent');button.setAttribute('aria-controls','sfPlanningChat');button.setAttribute('aria-expanded','false');button.setAttribute('aria-haspopup','dialog');button.onclick=()=>el('sfPlanningChat')?.open?close():open();host.appendChild(button);}
    syncScope();
    bindServiceContext();
    bindEditFunction();
    const generate=window.generateAutoPlanPreview;
    if(typeof generate==='function'&&!generate.__sfJournal){const wrapped=async function(){const result=await generate.apply(this,arguments);if(!window.SFMonthOptimizer?.getResult?.()&&typeof autoPlanAnalyzed!=='undefined'&&autoPlanAnalyzed)document.dispatchEvent(new CustomEvent('sf:planning-analysis-ready',{detail:{dates:autoPlanningDates(),assignments:[...assignments,...autoPlanPreview]}}));return result;};wrapped.__sfJournal=true;window.generateAutoPlanPreview=wrapped;}
    // Clear conversations before hydration, logout or switching the company.
    for(const key of ['hydrate','finishSignOut','switchCompany']){
      const base=B()[key];if(typeof base!=='function'||base.__sfChatGuard)continue;
      const wrapped=key==='hydrate'?async function(){if(!ownRefresh()){close(false);reset();}hydrationFailed=true;const result=await base.apply(this,arguments);hydrationFailed=false;return result;}:function(){close(false);reset();return base.apply(this,arguments);};wrapped.__sfChatGuard=true;B()[key]=wrapped;
    }
  }
  const dictionarySettings=()=>{const host=el('view-settings');let b=el('sfDictionarySettings');if(!authorized()||demo()){b?.remove();return;}if(host&&!b){b=node('button','Gemeinsamen Wortschatz ansehen');b.type='button';b.id='sfDictionarySettings';b.onclick=openDictionary;host.appendChild(b);}};setInterval(dictionarySettings,1000);
  window.SFPlanningAssistant={open,close,ask,reset,snapshot,setService};
  document.addEventListener('click',event=>{
    const target=event.target.closest?.('#view-schedule [data-assignment-id],#view-schedule .assignment');if(!target)return;
    const id=target.dataset.assignmentId||target.dataset.id,a=snapshot().assignments?.find(a=>String(a.id)===String(id));
    if(a)setService(a.date,a.type,a.id);
  },true);
  document.addEventListener('sf:schedule-period-changed',()=>{runningGoal?.controller.abort();requestId++;setProgress(false);activeTask=null;selectedService=null;context={};updatePeriod();markStaleAnswers(true);});
  document.addEventListener('sf:planning-analysis-ready',event=>{saveRun(event.detail).catch(()=>{journalError='Das Planungsprotokoll konnte nicht gespeichert werden.';window.showSaveToast?.('Planungsprotokoll nicht gespeichert',journalError);});});
  let queued=false;new MutationObserver(records=>{if(queued||!records.some(r=>r.type==='childList'||r.target===el('view-auto')))return;queued=true;queueMicrotask(()=>{queued=false;mount();});}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  // Auth state can change without a DOM mutation (for example an expired session).
  setInterval(syncScope,500);
  setInterval(observePlanningChanges,1500);
  document.addEventListener('sf:planning-change',event=>{const detail=event.detail;if(!authorized()||detail?.companyId!==B().companyId)return;observePlanningChanges();if(!Array.isArray(detail.dates))return;mergeChange({dates:detail.dates.filter(Core.validDate),assignmentIds:(detail.assignmentIds||[]).filter(id=>assignments.some(a=>String(a.id)===String(id)))});});
})();

