/* Personal employee home. The database remains the source of truth for attendance. */
(function(root){
 'use strict';
 const api=root.SFEmployeeHome=root.SFEmployeeHome||{};
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const seconds=v=>Math.max(0,Math.floor(Number(v)||0));
 const duration=v=>{const n=seconds(v);return Math.floor(n/3600)+' Std. '+String(Math.floor(n%3600/60)).padStart(2,'0')+' Min.'};
 function countdown(stamp,now=Date.now()){
  const minutes=Math.max(0,Math.ceil((Date.parse(stamp)-now)/60000));
  if(!minutes)return 'Beginn jetzt';
  const days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60),rest=minutes%60;
  return 'Beginn in '+(days?days+' '+(days===1?'Tag':'Tagen')+(hours?' '+hours+' Std.':''):hours?hours+' Std.'+(rest?' '+rest+' Min.':''):minutes+' Min.');
 }
 api.countdown=countdown;api.duration=duration;
 if(typeof document==='undefined')return;
 const backend=()=>root.SFBackend||{},scope=()=>{const b=backend();return [b.user?.id,b.companyId,b.employeeDbId||b.employeePortalData?.employee?.id,b.role].join('|')};
 let owner='',summary=null,error='',loading=false,sequence=0,received=0,lastAttempt=0,host=null,portal=null,queued=false,lastRender='',visible=false;
 const QUICK=[['shifts','Dienstplan','Alle freigegebenen Schichten'],['time','Arbeitszeit','Buchungen und Zeiten'],['absences','Abwesenheit','Anträge und Rückmeldungen'],['account','Stundenkonto','Dein persönlicher Saldo']];
 function valid(value,b){return value&&value.company_id===b.companyId&&value.employee_id===(b.employeeDbId||b.employeePortalData?.employee?.id)&&Number.isFinite(Date.parse(value.as_of))&&value.timezone&&(!value.next_shift||(value.next_shift.id&&Number.isFinite(Date.parse(value.next_shift.starts_at))&&Date.parse(value.next_shift.ends_at)>Date.parse(value.next_shift.starts_at)))&&value.tasks&&['changes','replacements','feedback'].every(k=>Number.isInteger(value.tasks[k])&&value.tasks[k]>=0)&&(!value.qr||(['RUNNING','BREAK'].includes(value.qr.state)&&Number.isFinite(Date.parse(value.qr.started_at))&&Number.isFinite(Number(value.qr.attendance_seconds))&&Number.isFinite(Number(value.qr.pause_seconds))))}
 function date(stamp,options){try{return new Intl.DateTimeFormat('de-DE',{timeZone:summary?.timezone||'Europe/Berlin',...options}).format(new Date(stamp))}catch{return 'Zeit nicht verfügbar'}}
 const time=stamp=>date(stamp,{hour:'2-digit',minute:'2-digit'});
 function navigate(view,detail=false){const b=backend(),who=scope(),id=summary?.next_shift?.id;b.employeePortalNavigate?.(view);if(detail&&id){let attempt=0;const open=()=>{if(scope()!==who)return;if(root.SFEmployeeMonthView?.openShift)root.SFEmployeeMonthView.openShift(id);else if(++attempt<12)setTimeout(open,150)};open()}}
 function statusMarkup(){
  if(!summary)return '<p class="sf-home-muted">'+(error?'Der Buchungsstatus ist derzeit nicht verfügbar.':'Dein Buchungsstatus wird geladen …')+'</p>';
  const q=summary.qr;
  if(!q)return '<span class="sf-home-status neutral">Keine laufende QR-Buchung</span><p class="sf-home-muted">Dienstbeginn, Pausen und Dienstende buchst du am QR-Terminal deines Einsatzortes.</p><button type="button" class="primary" data-home-scan>QR-Code scannen</button>';
  const old=Date.parse(summary.as_of)-Date.parse(q.started_at)>86400000;
  return '<span class="sf-home-status '+(old?'warning':q.state==='BREAK'?'pause':'running')+'">'+(old?'Offene Buchung prüfen':q.state==='BREAK'?'In Pause':'Im Dienst')+'</span><dl class="sf-home-live"><div><dt>Dienstbeginn</dt><dd>'+esc(date(q.started_at,{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}))+'</dd></div><div><dt>Anwesenheit</dt><dd data-home-attendance></dd></div><div><dt>Pausen gesamt</dt><dd data-home-pause></dd></div><div><dt>Gebuchter Standort</dt><dd>'+esc(q.terminal_name||'Nicht hinterlegt')+'</dd></div></dl>'+(q.location_note?'<p class="sf-home-muted">'+esc(q.location_note)+'</p>':'')+'<p class="sf-home-muted">Pausen werden separat angezeigt und nicht von der Anwesenheit abgezogen.'+(old?' Diese Buchung ist älter als 24 Stunden. Bitte die Leitung kontaktieren.':'')+'</p><button type="button" class="ghost" data-home-view="time">Buchungen ansehen</button>';
 }
 function shiftMarkup(){
  if(!summary)return '<p class="sf-home-muted">'+(error?'Dein nächster Dienst ist derzeit nicht verfügbar.':'Dein nächster Dienst wird geladen …')+'</p>';
  const s=summary.next_shift;
  if(!s)return '<h3>Noch kein weiterer Dienst freigegeben</h3><p class="sf-home-muted">Sobald deine Planung veröffentlicht wird, erscheint deine nächste Schicht hier.</p><button type="button" class="ghost" data-home-view="shifts">Dienstplan öffnen</button>';
  const current=Date.parse(s.starts_at)<=Date.parse(summary.as_of),overnight=date(s.starts_at,{year:'numeric',month:'2-digit',day:'2-digit'})!==date(s.ends_at,{year:'numeric',month:'2-digit',day:'2-digit'});
  return '<span class="sf-home-kicker">'+(current?'DEIN AKTUELL GEPLANTER DIENST':'DEIN NÄCHSTER DIENST')+'</span><div class="sf-home-shift-title"><h3>'+esc(s.name||s.shift_code)+'</h3><span>'+esc(s.shift_code)+'</span></div><p class="sf-home-date">'+esc(date(s.starts_at,{weekday:'long',day:'2-digit',month:'long'}))+'</p><strong class="sf-home-time">'+esc(time(s.starts_at))+' <span>–</span> '+esc(time(s.ends_at))+(overnight?' <small>(+1 Tag)</small>':'')+'</strong><p class="sf-home-location">'+esc(s.site_name||'Standort nicht hinterlegt')+'</p>'+(s.site_address?'<p class="sf-home-muted">'+esc(s.site_address)+'</p>':'')+'<p class="sf-home-countdown" data-home-countdown></p><div class="sf-home-actions"><button type="button" class="primary" data-home-details>Dienstdetails</button><button type="button" class="ghost" data-home-view="swaps">Schichttausch</button></div><p class="sf-home-muted sf-home-plan-note">Freigegebener Dienstplan · Deinen Buchungsstatus siehst du unter „Dein Arbeitsstatus“.</p>';
 }
 function tasksMarkup(){
  if(!summary)return '<p class="sf-home-muted">'+(error?'Deine offenen Aufgaben konnten nicht geladen werden.':'Deine Aufgaben werden geprüft …')+'</p>';
  const t=summary.tasks,items=[['replacements','Ersatzanfragen beantworten','Eine dringende Anfrage wartet auf dich.','disruptions'],['changes','Schichtänderungen prüfen','Deine Antwort wird benötigt.','changes'],['feedback','Neue Rückmeldungen lesen','Rückmeldung zu Abwesenheit oder Profil.','notifications']].filter(([key])=>t[key]>0);
  return items.length?'<div class="sf-home-task-list">'+items.map(([key,label,desc,view])=>'<button type="button" data-home-view="'+view+'"><span class="sf-home-task-count">'+t[key]+'</span><span><b>'+label+'</b><small>'+desc+'</small></span><span aria-hidden="true">›</span></button>').join('')+'</div>':'<div class="sf-home-clear"><span aria-hidden="true">✓</span><div><b>Alles erledigt</b><p>Aktuell wartet keine Antwort oder neue Rückmeldung auf dich.</p></div></div>';
 }
 function render(){
  if(!host?.isConnected)return;
  const signature=JSON.stringify([owner,summary,error]);
  if(signature!==lastRender){lastRender=signature;host.innerHTML='<div class="sf-home-heading"><div><h2>Deine Übersicht</h2></div><button type="button" class="ghost" data-home-refresh '+(loading?'disabled':'')+'>'+(loading?'Wird aktualisiert …':'Aktualisieren')+'</button></div><p class="sf-home-feedback" role="status" aria-live="polite"></p><div class="sf-home-grid"><section class="sf-home-card sf-home-next" aria-label="Nächster freigegebener Dienst">'+shiftMarkup()+'</section><section class="sf-home-card sf-home-status-card" aria-labelledby="sfHomeStatusTitle"><h3 id="sfHomeStatusTitle">Dein Arbeitsstatus</h3>'+statusMarkup()+'</section></div><section class="sf-home-card sf-home-tasks" aria-labelledby="sfHomeTasksTitle"><div class="sf-home-section-head"><h3 id="sfHomeTasksTitle">Für dich zu erledigen</h3><small>Nur offene Antworten und Rückmeldungen</small></div>'+tasksMarkup()+'</section><section class="sf-home-shortcuts" aria-labelledby="sfHomeQuickTitle"><h3 id="sfHomeQuickTitle">Deine Schnellzugriffe</h3><div>'+QUICK.map(([view,label,desc])=>'<button type="button" data-home-view="'+view+'"><b>'+label+'</b><small>'+desc+'</small><span aria-hidden="true">↗</span></button>').join('')+'</div><p class="sf-home-muted">Alle weiteren Bereiche findest du in der Orbit-Navigation.</p></section>';}
  const refreshButton=host.querySelector('[data-home-refresh]');if(refreshButton){refreshButton.disabled=loading;const label=loading?'Wird aktualisiert …':'Aktualisieren';if(refreshButton.textContent!==label)refreshButton.textContent=label}
  tick();
 }
 function stale(){return !!error||navigator.onLine===false||!!summary&&performance.now()-received>90000}
 function tick(){
  if(!host?.isConnected||!visible||document.hidden)return;
  const feedback=host.querySelector('.sf-home-feedback'),isStale=stale();
  const msg=error||(navigator.onLine===false?'Offline · angezeigte Daten sind der letzte bestätigte Stand.':summary?isStale?'Letzter bestätigter Stand: '+time(summary.as_of)+' Uhr. Bitte aktualisieren.':'Stand: '+time(summary.as_of)+' Uhr · Buchungsstatus wird automatisch aktualisiert.':'');
  if(feedback&&feedback.textContent!==msg)feedback.textContent=msg;
  host.classList.toggle('sf-home-stale',isStale);
  const q=summary?.qr,elapsed=summary&&!isStale?Math.max(0,(performance.now()-received)/1000):0;
  if(q){const attendance=duration(Number(q.attendance_seconds)+elapsed),pause=duration(Number(q.pause_seconds)+(q.state==='BREAK'?elapsed:0));[['[data-home-attendance]',attendance],['[data-home-pause]',pause]].forEach(([selector,value])=>{const node=host.querySelector(selector);if(node&&node.textContent!==value)node.textContent=value})}
  const node=host.querySelector('[data-home-countdown]'),s=summary?.next_shift;
  if(node&&s){const now=Date.parse(summary.as_of)+elapsed*1000,text=Date.parse(s.ends_at)<=now?'Geplanter Dienst ist beendet · Übersicht aktualisieren':Date.parse(s.starts_at)<=now?'Laut Dienstplan jetzt vorgesehen':countdown(s.starts_at,now);if(node.textContent!==text)node.textContent=text}
 }
 async function refresh(force=false){
  const b=backend();if(b.role!=='EMPLOYEE'||!b.client||!b.companyId||!portal?.isConnected||!visible||document.hidden)return;
  const next=scope();if(next!==owner){owner=next;summary=null;error='';loading=false;lastAttempt=0;lastRender='';sequence++}
  if(loading||!force&&Date.now()-lastAttempt<60000)return;
  const request=++sequence,who=owner;lastAttempt=Date.now();loading=true;error='';render();
  try{
   const result=b.client.__sfDemoLocalClientV1?demoSummary(b):await b.client.rpc('employee_home_summary',{p_company_id:b.companyId});if(result.error)throw result.error;
   const value=typeof result.data==='string'?JSON.parse(result.data):result.data;
   if(request!==sequence||who!==scope()||b.role!=='EMPLOYEE')return;
   if(!valid(value,b))throw Error('Unvollständige persönliche Übersicht');
   new Intl.DateTimeFormat('de-DE',{timeZone:value.timezone}).format(new Date(value.as_of));summary=value;received=performance.now();
  }catch(e){if(request!==sequence||who!==scope())return;error='Aktualisierung fehlgeschlagen. '+(summary?'Die zuletzt bestätigten Angaben bleiben sichtbar.':'Bitte erneut versuchen.');}
  finally{if(request===sequence&&who===scope()){loading=false;render()}}
 }
 function demoSummary(b){const d=b.employeePortalData||{},all=(d.shifts||[]).filter(s=>s.status==='PUBLISHED'&&s.published_at&&Date.parse(s.ends_at)>Date.now()).sort((a,c)=>Date.parse(a.starts_at)-Date.parse(c.starts_at));return {data:{employee_id:b.employeeDbId||d.employee?.id,company_id:b.companyId,timezone:d.company?.timezone||'Europe/Berlin',as_of:new Date().toISOString(),next_shift:all[0]?{...all[0],name:(d.templates||[]).find(t=>t.code===all[0].shift_code)?.name||all[0].shift_code}:null,qr:null,tasks:{changes:(d.requests||[]).filter(r=>r.requires_employee_approval&&!['APPLIED','REJECTED','CANCELLED','SUPERSEDED','BLOCKED'].includes(r.status)&&!(d.approvals||[]).some(a=>a.change_request_id===r.id&&a.approval_type==='EMPLOYEE'&&a.status!=='PENDING')).length,replacements:0,feedback:0}}}}
 function mount(){
  queued=false;const next=document.getElementById('sfEmployeePortal'),b=backend();
  if(!next||b.role!=='EMPLOYEE'){if(portal){sequence++;host?.replaceChildren();summary=null;owner='';host=null;portal=null;loading=false}return}
  portal=next;const dash=portal.querySelector('.sf-employee-dashboard');if(!dash)return;
  portal.classList.add('sf-personal-home');
  if(!dash.querySelector('#sfEmployeeHome')){host=document.createElement('div');host.id='sfEmployeeHome';dash.prepend(host);lastRender='';host.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.hasAttribute('data-home-refresh'))refresh(true);else if(button.hasAttribute('data-home-details'))navigate('shifts',true);else if(button.hasAttribute('data-home-scan')){const original=portal.querySelector('#sfEmployeeQrStatus [data-sf-qr-scan]')||portal.querySelector('[data-sf-qr-scan]');if(original)original.click();else navigate('time')}else if(button.dataset.homeView==='notifications')b.notifications?.open?.();else if(button.dataset.homeView){navigate(button.dataset.homeView);if(button.dataset.homeView==='changes')setTimeout(()=>portal?.querySelector('[data-change-filter="respond"]')?.click(),80)}})}else host=dash.querySelector('#sfEmployeeHome');
  const nowVisible=(portal.dataset.sfPortalActive||'dashboard')==='dashboard',changed=visible!==nowVisible;visible=nowVisible;
  if(scope()!==owner){sequence++;owner=scope();summary=null;error='';loading=false;lastAttempt=0;lastRender=''}
  render();if(visible)refresh(changed);
 }
 function queue(){if(!queued){queued=true;requestAnimationFrame(mount)}}
 new MutationObserver(records=>{if(records.some(r=>r.type==='attributes'&&r.target.id==='sfEmployeePortal'||[...r.addedNodes].some(n=>n.nodeType===1&&(n.id==='sfEmployeePortal'||n.classList?.contains('sf-employee-dashboard')||n.querySelector?.('.sf-employee-dashboard')))))queue()}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-sf-portal-active']});
 root.addEventListener('online',()=>refresh(true));root.addEventListener('offline',tick);document.addEventListener('visibilitychange',()=>{if(!document.hidden){queue();refresh(true)}});
 setInterval(()=>{if(portal?.isConnected&&visible&&!document.hidden){if(scope()!==owner)mount();else {tick();refresh()}}},1000);
 api.refresh=()=>refresh(true);queue();
})(typeof window==='undefined'?globalThis:window);
