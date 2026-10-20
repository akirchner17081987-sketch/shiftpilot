// SchichtFunk planning chat: uses the already authorized company data in memory.
(function(){
  'use strict';
  if(window.SFPlanningAssistant)return;
  const Core=window.SFPlanningAssistantCore,roles=['OWNER','ADMIN','PLANNER','DISPATCHER'];
  if(!Core)return;
  let context={},messages=[],scope=null,previousFocus=null,selectedMonth='',hydrationFailed=false,selectedService=null,planningRuns=[],journalError='',requestId=0,applyingProposal=false,refreshingProposal=null;
  const Insights=window.SFPlanningInsights,Workflows=window.SFPlanningWorkflows;
  let protectedAssignmentIds=new Set(),profiles=[],profileError='',changeRequest=null,changeReport=null;
  let observedOwner=null,observedState=null,pendingChange=null,changeDue=0,changeRevision='',lastObserved=0,changeAcknowledged=false;
  const withRows=(rows,fn)=>{const original=assignments;try{assignments=rows;return fn()}finally{assignments=original}};
  const signature=()=>JSON.stringify([identity(),window.SFCompliance?.policy,window.SFCompliance?.publications,window.SFPlanningTeams?.rules,employees,assignments,absences,TYPES,typeof globalSoll==='undefined'?null:globalSoll,typeof dailySoll==='undefined'?null:dailySoll]);
  const B=()=>window.SFBackend||{};
  const demo=()=>sessionStorage.getItem('sf_demo_session_v1')==='active';
  const authorized=()=>!!(B().ready&&roles.includes(B().role)&&(demo()||B().user?.id&&B().companyId));
  const identity=()=>authorized()?JSON.stringify([demo(),B().user?.id||'demo',B().companyId||'demo',B().role]):null;
  const busy=()=>!!(B().companySwitching||B().bootPromise||B().suppressSync||applyingProposal||refreshingProposal);
  const ownRefresh=()=>!!(refreshingProposal&&refreshingProposal.owner===identity()&&refreshingProposal.request===requestId&&!B().companySwitching&&!B().bootPromise);
  const el=id=>document.getElementById(id);
  function reset(){requestId++;context={};messages=[];selectedMonth='';selectedService=null;planningRuns=[];journalError='';profiles=[];profileError='';protectedAssignmentIds=new Set();el('sfAssignmentImpactPreview')?.remove();el('sfAssignmentImpactButton')?.remove();el('sfPlanningChatLog')?.replaceChildren();toggleQuestionGuide(false);setProgress(false);updateService();}
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
    const next=identity();if(scope!==next){observedOwner=next;observedState=null;pendingChange=null;changeRequest=null;changeReport=null;changeRevision='';clearChangeNotice();}
    if(scope!==next||(busy()&&!ownRefresh())){close(false);reset();scope=next;}
    if(selectedService&&!contextDates().includes(selectedService.date)){selectedService=null;context={};updatePeriod();}
    const button=el('sfPlanningAssistantButton');if(button){button.hidden=!authorized();button.disabled=busy();}
    syncPlacement();bindEditFunction();if(!next)clearChangeNotice();
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
      const orbitActions=target.id==='sfPlanningAssistantButton'?document.querySelector('#appShell.sf-orbit .top-actions'):null;
      const host=docked?dock:orbitActions||document.body;
      if(target.parentNode!==host){if(host===orbitActions)host.insertBefore(target,host.querySelector('.side-bottom'));else host.appendChild(target);}
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
      employees:typeof employees==='undefined'?[]:employees.filter(belongs),
      assignments:typeof assignments==='undefined'?[]:assignments.filter(belongs).filter(a=>a.status!=='CANCELLED'&&a._dbStatus!=='CANCELLED'),
      absences:typeof absences==='undefined'?[]:absences.filter(belongs),
      shifts:typeof TYPES==='undefined'?[]:TYPES.filter(t=>t.active!==false),
      getSoll:(date,type)=>getSoll(date,type),
      requiredSoll:(date,type,raw)=>window.SFShiftModels?.requiredSoll?.(date,type,raw)??raw,
      coverageInfo:(date,type)=>window.SFShiftModels?.coverageInfo?.(date,type),
      optionalTarget:(date,type)=>window.SFShiftModels?.optionalTarget?.(date,type)||0,
      monthTarget:e=>typeof employeeMonthlyTarget==='function'?employeeMonthlyTarget(e):0,
      assignmentHours:a=>typeof plannedAssignmentHours==='function'?plannedAssignmentHours(a):0,
      candidates:candidateCheck,solidRules:window.SFCompliance?.policy?.solidPlanningRules,rulesReady:!!window.SFCompliance?.policy,
      hourLimits:e=>typeof autoHourLimits==='function'?autoHourLimits(e):null,isPublished:date=>!!window.SFCompliance?.isWeekPublished?.(date),
      movable:a=>!!a.id&&!a.fixed&&!a.locked&&!a.protected&&!protectedAssignmentIds.has(a._dbId||B().asgDb?.get(String(a.id))||a.id)&&!a.publishedAt&&(!a._dbStatus||a._dbStatus==='DRAFT')&&a.status!=='PUBLISHED'&&!a._marketApproved&&!/markt|market|freiwill|tausch/i.test(a.note||'')&&!window.SFCompliance?.isWeekPublished?.(a.date)&&!((typeof timeEntries!=='undefined')&&(timeEntries[a.id]?.actualStart||timeEntries[a.id]?.actualEnd))&&window.sfRhythmCheck?.(employees.find(e=>String(e.id)===String(a.employeeId)),a.type,a.date)?.mode!=='required',
      openSlots:(wanted,rows)=>withRows(rows,()=>{const slots=[];for(const date of wanted)for(const t of TYPES.filter(t=>t.active!==false)){const info=window.SFShiftModels?.coverageInfo?.(date,t.id);if(info&&info.representative!==t.id)continue;const raw=getSoll(date,t.id),need=window.SFShiftModels?.requiredSoll?.(date,t.id,raw)??raw,count=rows.filter(a=>a.date===date&&a.type===t.id).length,missing=info?info.missing:Math.max(0,need-count);for(let n=0;n<missing;n++)slots.push({date,type:t.id,...(info?{alternatives:info.alternatives}:{})});}return slots;}),
      planningRuns,journalError,teamRulesReady:window.SFPlanningTeams?.isLoaded?.()??false,helpCategories:window.SFHelpContent?.categories||[],teamRules:window.SFPlanningTeams?.isLoaded?.()?window.SFPlanningTeams.rules:[],helpArticles:window.SFHelpContent?.articles||{}};
  }
  async function loadProfiles(){
    const owner=identity(),company=B().companyId;if(!owner)return;
    try{let data;if(demo())data=JSON.parse(localStorage.getItem('sf-assistant-profiles-demo|'+owner)||'[]');else{const q=await B().client.from('planning_assistant_profiles').select('id,name,config,updated_at').eq('company_id',company).order('name').limit(100);if(q.error)throw q.error;data=q.data;}
      if(identity()!==owner)return;profiles=(Array.isArray(data)?data:[]).filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&Workflows.profileConfig(p.config));profileError='';
    }catch(error){if(identity()===owner){profiles=[];profileError='Profile konnten nicht geladen werden. '+(error.message||'Bitte die Verbindung prüfen.');}}
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
    if(!owner||busy()||hydrationFailed||B().syncing||B().lastSyncError||window.SFMonthOptimizer?.isBusy?.())return;
    if(Date.now()-lastObserved<1400)return;lastObserved=Date.now();
    const belongs=a=>!(a.companyId||a.company_id)||(a.companyId||a.company_id)===B().companyId;
    const raw={assignments:assignments.filter(belongs).filter(a=>a._dbStatus!=='CANCELLED'&&a.status!=='CANCELLED'),absences:absences.filter(belongs)},next=Workflows.changeState(raw);
    if(!observedState){observedState=next;return;}
    if(changeReport&&changeRevision&&changeRevision!==signature()&&!pendingChange)mergeChange(changeRequest);
    const delta=Workflows.changedDays(observedState,next);observedState=next;if(delta.dates.length)mergeChange(delta);
    if(pendingChange&&Date.now()>=changeDue){const request=pendingChange;pendingChange=null;try{const current=snapshot();if(current.loading||current.error)return;changeReport=Workflows.followup(current,request);changeRequest=request;changeRevision=signature();showChangeNotice();}catch{changeReport={title:'Änderungscheck noch offen',text:'Die automatische Folgeprüfung konnte nicht abgeschlossen werden. Bitte erneut prüfen.'};changeRequest=request;showChangeNotice();}}
  }
  function ask(question,analysisRequest){syncScope();return Core.answer(question,{...snapshot(),analysisRequest},context);}
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
    if(!authorized()||busy()||!proposal||(!proposal.proposed?.length&&!proposal.undoId))return;
    const owner=identity();let committed=false,controls=[],priorSuppression=B().suppressSync;
    try{
      if(proposal.signature!==signature()||proposal.owner!==owner||Date.now()-proposal.created>15*60*1000)throw Error('Diese Vorschau ist nicht mehr aktuell. Bitte neue Verbesserungsvorschläge erstellen.');
      if(!await confirmProposal(proposal))return;
      if(!authorized()||busy()||identity()!==owner||proposal.signature!==signature())throw Error('Die Planungsdaten wurden geändert. Bitte die Vorschau erneuern.');
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
    const progress=el('sfPlanningChatProgress');if(progress)progress.hidden=!active;
    el('sfPlanningChatLog')?.setAttribute('aria-busy',String(active));
  }
  function mountQuestionGuide(){
    const guide=node('section',undefined,'sf-chat-question-guide');guide.id='sfPlanningQuestionGuide';guide.hidden=true;
    guide.setAttribute('aria-label','Fragen und Beispiele');guide.appendChild(node('h3','Welche Fragen kann ich stellen?'));
    guide.appendChild(node('p','Du kannst eigene Fragen zu diesen Themen formulieren. Bei einem Dienst helfen Datum und Schichtart, bei Personen Name oder Personalnummer. Der Assistent erkennt unterstützte Themen; er ist kein allgemeiner KI-Chat.'));
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
    if(['order','multiBalance'].includes(config.kind)){
      field('Startmonat','month','month',[],config.month);
      field('Mitarbeiterkreis','focus','select',[['all','Alle aktiven Mitarbeiter'],['leaders','Teamleiter'],...['A','B','C','D','E'].map(t=>['team:'+t,'Team '+t]),...people.map(([id,name])=>['person:'+id,name])],config.focus||'all');
      if(config.kind==='order')field('Planungsziel','goal','select',[['both','Pflichtbesetzung und Sollstunden verbessern'],['coverage','Pflichtdienste besetzen']],config.goal||'both');
      else field('Anzahl Monate','count','select',[2,3,4,5,6].map(n=>[String(n),n+' Monate']),String(config.count||3));
      const button=node('button','Vorschau erstellen','sf-chat-row-action');button.type='submit';form.appendChild(button);
      form.onsubmit=event=>{event.preventDefault();if(form.reportValidity())submit(config.kind==='order'?'Planungsauftrag vorbereiten':'Mehrmonatsausgleich vorbereiten',{kind:config.kind,...Object.fromEntries(new FormData(form))});};host.appendChild(form);return;
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
      const a=message.answer;article.appendChild(node('h3',a.title));article.appendChild(node('p',a.text));
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
        more.onclick=append;append();results.append(count,list,more);article.appendChild(results);
      }
      if(a.notes?.length){
        const details=node('details',undefined,'sf-chat-details'),list=node('ul');
        details.appendChild(node('summary','Hinweise zur Auswertung'));a.notes.forEach(x=>list.appendChild(node('li',x)));details.appendChild(list);article.appendChild(details);
      }
      if(a.actions?.length){const actions=node('div',undefined,'sf-chat-actions');a.actions.forEach(action=>{const button=node('button',action.label);button.type='button';button.onclick=()=>openAction(action);actions.appendChild(button);});article.appendChild(actions);}
      if(a.form)renderAnalysisForm(a.form,article);
      if(a.wizard)renderWizard(a.wizard,article);
      if(a.profileManager)renderProfileManager(article);
      if(a.variants){const actions=node('div',undefined,'sf-chat-actions');for(const variant of a.variants){const button=node('button',variant.label+' prüfen');button.type='button';button.onclick=()=>variant.profileId?submit('Planungsprofil ausführen',{kind:'profile',profileId:variant.profileId,strategy:variant.key,month:variant.month}):submit('Planvariante prüfen',{kind:'variant',strategy:variant.key,month:variant.month,focus:variant.focus?.length===1?'person:'+variant.focus[0]:'all',focusIds:variant.focus});actions.appendChild(button);}article.appendChild(actions);}
      if((a.proposal?.proposed?.length||a.proposal?.undoId)&&a.proposal.owner){const button=node('button',a.proposal.undoId?'Rücknahme bestätigen':'Vorschläge als Entwurf übernehmen','sf-chat-row-action');button.type='button';button.onclick=()=>applyProposal(a.proposal,button);article.appendChild(button);}
      if(a.suggestions?.length){const examples=node('div',undefined,'sf-chat-examples');quickButtons(examples,a.suggestions);article.appendChild(examples);}
      article.appendChild(node('small',`Geprüft um ${new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})} · Aktuell geladene Planungsdaten`,'sf-chat-source'));
    }
    log.appendChild(article);
  }
  async function submit(raw,analysisRequest){
    syncScope();if(!authorized()||busy())return;
    const input=el('sfPlanningChatInput'),text=String(raw??input?.value??'').trim().slice(0,1200);if(!text)return;
    let answer;const owner=identity(),request=++requestId;
    toggleQuestionGuide(false);setProgress(true);
    el('sfPlanningChatStatus').textContent='Planungsdaten werden geprüft.';
    try{
      if(['bottlenecks','forecast','leaveImpact','changeImpact','order','multiBalance','undo','wizard','variants','profiles','followup'].includes(Core.intentFor(Core.normalize(text))))await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(owner!==identity()||request!==requestId)return;
      if(/protokoll|gespeicherte|planungsgruende|besetzung.*verhindert/.test(Core.normalize(text)))await loadRuns();
      if(Core.intentFor(Core.normalize(text))==='profiles')await loadProfiles();
      if(owner!==identity()||request!==requestId)return;
      answer=ask(text,analysisRequest);
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
          answer=ask(text,analysisRequest);if(answer.proposal){const protectedIds=protectedAssignmentIds;if((answer.proposal.removed||answer.proposal.changes.filter(c=>c.replaces).map(c=>c.replaces)).some(a=>protectedIds.has(a._dbId||B().asgDb?.get(String(a.id)))))throw Error('Ein vorgeschlagener Wechsel betrifft einen geschützten Dienst. Bitte im Dienstplan einzeln prüfen.');answer.proposal.fingerprint=q.data.fingerprint;}
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
    context=answer.context||{};if(input)input.value='';
    messages.push({user:true,text},{answer});if(messages.length>40)messages=messages.slice(-40);
    el('sfPlanningChatWelcome')?.remove();el('sfPlanningChatLog')?.replaceChildren();messages.forEach(message=>renderMessage(message));
    const log=el('sfPlanningChatLog'),question=log?.querySelector('.is-user:nth-last-child(2)');if(log&&question)log.scrollTop=question.offsetTop;
    el('sfPlanningChatStatus').textContent=answer.title;input?.focus();
    updatePeriod();
    if(answer.form){const form=log?.lastElementChild?.querySelector('.sf-chat-analysis-form');if(form){log.scrollTop=Math.max(0,form.offsetTop-12);form.querySelector('select,input')?.focus({preventScroll:true});}}
  }
  function updatePeriod(){if(el('sfPlanningChatPeriod'))el('sfPlanningChatPeriod').textContent=Core.periodLabel(context.dates||contextDates());updateService();}
  function welcome(){
    const log=el('sfPlanningChatLog');if(!log)return;log.replaceChildren();
    const welcome=node('section',undefined,'sf-chat-welcome');welcome.id='sfPlanningChatWelcome';
    welcome.appendChild(node('h3','Was möchtest du prüfen?'));
    welcome.appendChild(node('p','Stelle deine Frage oder wähle einen Einstieg. Alle unterstützten Themen findest du jederzeit unter „Fragen & Beispiele“.'));
    const examples=node('div',undefined,'sf-chat-examples sf-chat-start');
    for(const [label,question] of [
      ['Planungsprofile','Planungsprofile verwalten'],
      ['Änderungscheck','Änderungscheck anzeigen'],
      ['Planvarianten','Planvarianten vergleichen'],
      ['Planungsauftrag','Planungsauftrag starten'],
      ['Geführte Planung','Hilf mir, diesen Monat fertigzustellen'],
      ['Mehrmonatsausgleich','Mehrmonatsausgleich starten'],
      ['Rückgängig machen','Nimm die letzte Änderung des Assistenten zurück.'],
      ['Frühwarnung','Frühwarnung starten'],
      ['Urlaubsfolgen','Urlaubsfolgen prüfen'],
      ['Dienständerung prüfen','Dienstverschiebung prüfen'],
      ['Engpass lösen','Engpasslöser starten'],
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
      el('sfPlanningChatMonth').onchange=event=>{requestId++;selectedMonth=event.target.value;selectedService=null;context={};updatePeriod();event.target.closest('details').open=false;};
      el('sfPlanningChatCurrent').onclick=()=>{requestId++;selectedMonth='';selectedService=null;context={};el('sfPlanningChatMonth').value='';updatePeriod();el('sfPlanningChatMonth').closest('details').open=false;};
    }
    if(!messages.length)welcome();else{el('sfPlanningChatLog').replaceChildren();messages.forEach(message=>renderMessage(message));}
    syncPlacement();el('sfPlanningChatMonth').value=selectedMonth;updatePeriod();dialog.show();showChangeNotice();
    if(dialog.classList.contains('sf-chat-docked'))dialog.scrollIntoView({block:'nearest'});
    el('sfPlanningAssistantButton')?.setAttribute('aria-expanded','true');el('sfPlanningChatInput').focus({preventScroll:true});
  }
  function mount(){
    const host=document.body;if(!host)return;
    if(!el('sfPlanningAssistantButton')){const button=node('button',undefined,'ghost sf-chat-launcher');button.innerHTML=chatIcon+'<span>Planungsassistent</span>';button.id='sfPlanningAssistantButton';button.type='button';button.title='Fragen zur Planung stellen';button.setAttribute('aria-label','Planungsassistent');button.setAttribute('aria-controls','sfPlanningChat');button.setAttribute('aria-expanded','false');button.setAttribute('aria-haspopup','dialog');button.onclick=()=>el('sfPlanningChat')?.open?close():open();host.appendChild(button);}
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
  setInterval(observePlanningChanges,1500);
  document.addEventListener('sf:planning-change',event=>{const detail=event.detail;if(!authorized()||detail?.companyId!==B().companyId)return;observePlanningChanges();if(!Array.isArray(detail.dates))return;mergeChange({dates:detail.dates.filter(Core.validDate),assignmentIds:(detail.assignmentIds||[]).filter(id=>assignments.some(a=>String(a.id)===String(id)))});});
})();

