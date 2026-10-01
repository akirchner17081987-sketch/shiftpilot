// SchichtFunk planning chat: uses the already authorized company data in memory.
(function(){
  'use strict';
  if(window.SFPlanningAssistant)return;
  const Core=window.SFPlanningAssistantCore,roles=['OWNER','ADMIN','PLANNER','DISPATCHER'];
  if(!Core)return;
  let context={},messages=[],scope=null,previousFocus=null,selectedMonth='',hydrationFailed=false;
  const B=()=>window.SFBackend||{};
  const demo=()=>sessionStorage.getItem('sf_demo_session_v1')==='active';
  const authorized=()=>!!(B().ready&&roles.includes(B().role)&&(demo()||B().user?.id&&B().companyId));
  const identity=()=>authorized()?JSON.stringify([demo(),B().user?.id||'demo',B().companyId||'demo',B().role]):null;
  const busy=()=>!!(B().companySwitching||B().bootPromise||B().suppressSync);
  const el=id=>document.getElementById(id);
  function reset(){context={};messages=[];selectedMonth='';el('sfPlanningChatLog')?.replaceChildren();}
  function close(restore=true){const dialog=el('sfPlanningChat');if(dialog?.open)dialog.close();el('sfPlanningAssistantButton')?.setAttribute('aria-expanded','false');if(restore&&previousFocus?.isConnected)previousFocus.focus({preventScroll:true});}
  function syncScope(){
    const next=identity();if(scope!==next||busy()){close(false);reset();scope=next;}
    const button=el('sfPlanningAssistantButton');if(button){button.hidden=!authorized();button.disabled=busy();}
  }
  function contextDates(){
    if(selectedMonth)return Core.parsePeriod(selectedMonth,{today:today(),defaultDates:[today()]}).dates;
    if(el('view-auto')?.classList.contains('active')&&typeof autoPlanningDates==='function')return autoPlanningDates();
    const p=window.SchichtFunkCalendarView?.getPeriod?.();
    if(p?.start&&p?.end){const result=[];for(let d=new Date(p.start+'T12:00:00Z');d.toISOString().slice(0,10)<=p.end&&result.length<62;d.setUTCDate(d.getUTCDate()+1))result.push(d.toISOString().slice(0,10));return result;}
    return typeof currentWeekDates==='function'?currentWeekDates().map(iso):[today()];
  }
  function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:B().companyTimeZone||'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
  function candidateCheck(type,date){
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
      if(reason)reject(reason);else accepted.push(base);
    }
    // Preserve the app's ranking, rather than the employee list order.
    accepted.sort((a,b)=>candidates.indexOf(a)-candidates.indexOf(b));
    return{candidates:accepted,assessments,reasons:[...rejected].map(([label,count])=>({label,count}))};
  }
  function snapshot(){
    const auth=authorized();
    if(!auth)return{authorized:false};
    const loading=busy(),error=hydrationFailed;
    if(loading||error)return{authorized:true,loading,error};
    const belongs=row=>!(row.companyId||row.company_id)||(row.companyId||row.company_id)===B().companyId;
    return{authorized:true,today:today(),defaultDates:contextDates(),
      employees:typeof employees==='undefined'?[]:employees.filter(belongs),
      assignments:typeof assignments==='undefined'?[]:assignments.filter(belongs),
      absences:typeof absences==='undefined'?[]:absences.filter(belongs),
      shifts:typeof TYPES==='undefined'?[]:TYPES.filter(t=>t.active!==false),
      getSoll:(date,type)=>getSoll(date,type),
      monthTarget:e=>typeof employeeMonthlyTarget==='function'?employeeMonthlyTarget(e):0,
      candidates:candidateCheck,teamRulesReady:window.SFPlanningTeams?.isLoaded?.()??false,helpCategories:window.SFHelpContent?.categories||[],teamRules:window.SFPlanningTeams?.isLoaded?.()?window.SFPlanningTeams.rules:[],helpArticles:window.SFHelpContent?.articles||{}};
  }
  function ask(question){syncScope();return Core.answer(question,snapshot(),context);}
  const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
  function openAction(action){
    syncScope();if(!authorized()||busy())return;
    close();
    if(action.help){el('sfHelpButton')?.click();if(action.query){const search=el('sfHelpSearch');if(search){search.value=action.query;search.dispatchEvent(new Event('input',{bubbles:true}));}}return;}
    if(action.view==='schedule'&&action.date){
      if(action.month)window.SchichtFunkCalendarView?.setMonth?.(action.date.slice(0,7));
      else{if(typeof autoMonday==='function')weekStart=autoMonday(action.date);window.SchichtFunkCalendarView?.setMode?.('week');}
    }
    window.showView?.(action.view);
    if(action.view==='settings')setTimeout(()=>el('sfPlanningTeams')?.scrollIntoView({block:'start'}),50);
  }
  function quickButtons(host,questions){for(const q of questions){const button=node('button',q,'sf-chat-example');button.type='button';button.onclick=()=>submit(q);host.appendChild(button);}}
  function renderMessage(message){
    const log=el('sfPlanningChatLog');if(!log)return;
    const article=node('article',undefined,'sf-chat-message '+(message.user?'is-user':'is-answer'));
    article.appendChild(node('small',message.user?'DU':'SCHICHTFUNK PLANUNGSASSISTENT','sf-chat-author'));
    if(message.user)article.appendChild(node('p',message.text));
    else{
      const a=message.answer;article.appendChild(node('h3',a.title));article.appendChild(node('p',a.text));
      if(a.rows?.length){
        const wrap=node('div',undefined,'sf-chat-table-scroll');wrap.tabIndex=0;wrap.setAttribute('aria-label',a.title+' – Tabelle');
        const table=node('table'),caption=node('caption',`${a.rows.length} Einträge`);table.appendChild(caption);
        const head=node('thead'),tr=node('tr');a.columns.forEach(c=>{const th=node('th',c);th.scope='col';tr.appendChild(th)});head.appendChild(tr);table.appendChild(head);
        const body=node('tbody');table.appendChild(body);let shown=0;
        const more=node('button',undefined,'sf-chat-more');more.type='button';
        const append=()=>{const end=Math.min(shown+12,a.rows.length);for(let i=shown;i<end;i++){const row=node('tr');a.rows[i].forEach(value=>row.appendChild(node('td',value)));body.appendChild(row);}shown=end;caption.textContent=`${shown} von ${a.rows.length} Einträgen`;more.hidden=shown>=a.rows.length;more.textContent=`Weitere Einträge anzeigen (${a.rows.length-shown})`;};
        more.onclick=append;append();wrap.appendChild(table);article.appendChild(wrap);article.appendChild(more);
      }
      if(a.notes?.length){const list=node('ul');a.notes.forEach(x=>list.appendChild(node('li',x)));article.appendChild(list);}
      if(a.actions?.length){const actions=node('div',undefined,'sf-chat-actions');a.actions.forEach(action=>{const button=node('button',action.label);button.type='button';button.onclick=()=>openAction(action);actions.appendChild(button);});article.appendChild(actions);}
      if(a.suggestions?.length){const examples=node('div',undefined,'sf-chat-examples');quickButtons(examples,a.suggestions);article.appendChild(examples);}
      article.appendChild(node('small',`Geprüft um ${new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})} · Aktuell geladene Planungsdaten`,'sf-chat-source'));
    }
    log.appendChild(article);
  }
  function submit(raw){
    syncScope();if(!authorized()||busy())return;
    const input=el('sfPlanningChatInput'),text=String(raw??input?.value??'').trim().slice(0,1200);if(!text)return;
    let answer;
    try{answer=ask(text);}catch(error){answer={title:'Prüfung derzeit nicht möglich',text:error.message||'Bitte lade die Planungsdaten erneut und versuche es noch einmal.',context:{}};}
    if(!authorized()||busy())return;
    context=answer.context||{};if(input)input.value='';
    messages.push({user:true,text},{answer});if(messages.length>40)messages=messages.slice(-40);
    el('sfPlanningChatWelcome')?.remove();el('sfPlanningChatLog')?.replaceChildren();messages.forEach(renderMessage);
    const log=el('sfPlanningChatLog');if(log)log.scrollTop=log.scrollHeight;
    el('sfPlanningChatStatus').textContent=answer.title;input?.focus();
    updatePeriod();
  }
  function updatePeriod(){if(el('sfPlanningChatPeriod'))el('sfPlanningChatPeriod').textContent=Core.periodLabel(context.dates||contextDates());}
  function welcome(){
    const log=el('sfPlanningChatLog');if(!log)return;log.replaceChildren();
    const welcome=node('section',undefined,'sf-chat-welcome');welcome.id='sfPlanningChatWelcome';
    welcome.appendChild(node('div','PLANUNG EINFACH ERKLÄRT','sf-chat-kicker'));
    welcome.appendChild(node('h3','Wobei brauchst du Unterstützung?'));
    welcome.appendChild(node('p','Frage nach offenen Diensten, Ersatzbesetzung oder Planungseinstellungen. Nenne bei einzelnen Diensten bitte Tag und Schicht.'));
    const examples=node('div',undefined,'sf-chat-examples');quickButtons(examples,['Welche Dienste sind im Dezember noch offen?','Warum konnte die Auto-Planung diesen Dienst nicht besetzen?','Welche Mitarbeiter kommen als Ersatz infrage?','Bei welchen Mitarbeitern fehlt eine Teamzuordnung?','Wie stelle ich den Rhythmus von Team E ein?','Wie viele Stunden sind im Dezember geplant?','Welche Dienste hat Team E im Dezember?','Welche Hilfethemen kennst du?']);welcome.appendChild(examples);log.appendChild(welcome);
  }
  function open(){
    syncScope();if(!authorized()||busy())return;
    if(el('sfPlanningChat')?.open)return;
    previousFocus=document.activeElement;
    let dialog=el('sfPlanningChat');if(!dialog){
      dialog=node('dialog',undefined,'sf-planning-chat');dialog.id='sfPlanningChat';dialog.setAttribute('aria-labelledby','sfPlanningChatTitle');
      dialog.innerHTML='<div class="sf-chat-frame"><header class="sf-chat-header"><div class="sf-chat-mark" aria-hidden="true">✦</div><div><small>SCHICHTFUNK</small><h2 id="sfPlanningChatTitle">Planungsassistent</h2></div><button type="button" id="sfPlanningChatClose" aria-label="Planungsassistent schließen">×</button></header><div class="sf-chat-context"><span>Zeitraum: <b id="sfPlanningChatPeriod"></b></span><button type="button" id="sfPlanningChatReset">Neuer Chat</button></div><div class="sf-chat-month"><label for="sfPlanningChatMonth">Anderen Monat prüfen</label><input type="month" id="sfPlanningChatMonth"><button type="button" id="sfPlanningChatCurrent">Aktueller Plan</button></div><div id="sfPlanningChatLog" class="sf-chat-log" role="log" aria-label="Fragen und Antworten"></div><div id="sfPlanningChatStatus" class="sf-chat-sr" role="status" aria-live="polite"></div><form id="sfPlanningChatForm" class="sf-chat-form"><label for="sfPlanningChatInput">Deine Frage zur Planung</label><div class="sf-chat-compose"><textarea id="sfPlanningChatInput" rows="2" maxlength="1200" placeholder="Zum Beispiel: Wer kann am 01.12.2026 den FD übernehmen?" required></textarea><button type="submit" aria-label="Frage senden">Senden <span aria-hidden="true">↗</span></button></div><small>Antworten aus Planungsregeln und geladenen Daten. Änderungen führst du im jeweiligen Bereich aus.</small></form></div>';
      document.body.appendChild(dialog);
      el('sfPlanningChatClose').onclick=()=>close();
      dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
      dialog.addEventListener('close',()=>{if(!dialog.open)el('sfPlanningAssistantButton')?.setAttribute('aria-expanded','false');});
      document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented&&dialog.open&&!document.querySelector('dialog:modal')){event.preventDefault();close();}});

      el('sfPlanningChatForm').onsubmit=event=>{event.preventDefault();submit();};
      el('sfPlanningChatInput').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();submit();}};
      el('sfPlanningChatReset').onclick=()=>{reset();el('sfPlanningChatMonth').value='';welcome();updatePeriod();el('sfPlanningChatInput').focus();};
      el('sfPlanningChatMonth').onchange=event=>{selectedMonth=event.target.value;context={};updatePeriod();};
      el('sfPlanningChatCurrent').onclick=()=>{selectedMonth='';context={};el('sfPlanningChatMonth').value='';updatePeriod();};
    }
    if(!messages.length)welcome();else{el('sfPlanningChatLog').replaceChildren();messages.forEach(renderMessage);}
    el('sfPlanningChatMonth').value=selectedMonth;updatePeriod();dialog.show();el('sfPlanningAssistantButton')?.setAttribute('aria-expanded','true');el('sfPlanningChatInput').focus({preventScroll:true});
  }
  function mount(){
    const host=document.body;if(!host)return;
    if(!el('sfPlanningAssistantButton')){const button=node('button','✦ Planungsassistent','ghost sf-chat-launcher');button.id='sfPlanningAssistantButton';button.type='button';button.title='Fragen zur Planung stellen';button.setAttribute('aria-controls','sfPlanningChat');button.setAttribute('aria-expanded','false');button.setAttribute('aria-haspopup','dialog');button.onclick=()=>el('sfPlanningChat')?.open?close():open();host.appendChild(button);}
    syncScope();
    // Clear conversations before hydration, logout or switching the company.
    for(const key of ['hydrate','finishSignOut','switchCompany']){
      const base=B()[key];if(typeof base!=='function'||base.__sfChatGuard)continue;
      const wrapped=key==='hydrate'?async function(){close(false);reset();hydrationFailed=true;const result=await base.apply(this,arguments);hydrationFailed=false;return result;}:function(){close(false);reset();return base.apply(this,arguments);};wrapped.__sfChatGuard=true;B()[key]=wrapped;
    }
  }
  window.SFPlanningAssistant={open,close,ask,reset,snapshot};
  let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;mount();});}).observe(document.body,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  // Auth state can change without a DOM mutation (for example an expired session).
  setInterval(syncScope,500);
})();
