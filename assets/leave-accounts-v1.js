// Verbindliches Urlaubskonto: HR-Stammdaten und bestätigte Anrechnungstage.
(function(){
 'use strict';
 const B=window.SFBackend=window.SFBackend||{};
 if(B.leaveAccounts)return;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=n=>n==null?'–':Number(n).toLocaleString('de-DE',{maximumFractionDigits:2});
 const date=d=>String(d||'').slice(0,10).split('-').reverse().join('.');
 const yearNow=()=>Number(new Intl.DateTimeFormat('en',{timeZone:B.companyTimeZone||'Europe/Berlin',year:'numeric'}).format(new Date()));
 const scope=()=>JSON.stringify([B.user?.id,B.companyId,B.role,B.employeeDbId,B.companySwitching]);
 const manager=()=>B.ready&&!B.companySwitching&&['OWNER','ADMIN'].includes(B.role)&&!!B.client&&!!B.user?.id&&!!B.companyId;
 const employee=()=>B.role==='EMPLOYEE'&&!B.companySwitching&&!!B.client&&!!B.user?.id&&!!B.employeePortalData;
 const staff=()=>{try{return (typeof employees!=='undefined'?employees:window.employees)||[]}catch{return[]}};
 const staffId=e=>String(e._dbId||B.empDb?.get?.(String(e.id))||'');
 const years=(y)=>Array.from({length:21},(_,i)=>yearNow()-10+i).concat(Number(y)).filter((v,i,a)=>a.indexOf(v)===i).sort((a,b)=>b-a);
 const state={employee:{year:null,data:null,loaded:0,seq:0},manager:{year:null,id:'',data:null,loaded:0,seq:0}};
 let owner='',busy=false,writeSequence=0;
 const snapshot=a=>({company_id:a.company_id,employee_id:a.employee_id,type:a.absence_type,from:a.start_date,to:a.end_date,full:a.full_day,start:a.start_time||null,end:a.end_time||null});
 const metric=(label,value,help='')=>`<div class="sf-leave-metric"><span>${label}</span><strong>${value}</strong><small>${help}</small></div>`;
 function summary(data){
  if(!data)return '<p>Urlaubskonto wird geladen …</p>';
  const unknown=data.unconfirmed_approved||0,pendingUnknown=data.unconfirmed_pending||0;
  return `<div class="sf-leave-metrics">${metric('Jahresanspruch',number(data.entitlement),'Urlaubstage')}${metric('Übertrag',number(data.carryover),'Aus dem Vorjahr')}${metric('Genehmigt / erfasst',number(data.approved_days),'Inklusive zukünftiger Urlaube')}${metric('In Prüfung',number(data.pending_days),pendingUnknown?`${pendingUnknown} Antrag/Anträge noch ohne bestätigte Tage`:'Noch nicht vom Resturlaub abgezogen')}${metric('Resturlaub',data.complete?number(data.remaining):'Noch offen',data.complete?'Nach Abzug aller bestätigten Urlaubstage':!data.configured?'Jahresanspruch noch nicht hinterlegt':`${unknown} Urlaub(e) noch zu prüfen`)}</div>${!data.configured?'<p class="sf-leave-notice">Die Personalverwaltung muss Jahresanspruch und Übertrag für dieses Jahr hinterlegen.</p>':''}${unknown?`<p class="sf-leave-notice">Bei ${unknown} bestätigten Urlaub(en) fehlen geprüfte Anrechnungstage. Ein verbindlicher Resturlaub kann erst nach dieser Prüfung angezeigt werden.</p>`:''}${data.complete&&data.remaining<0?'<p class="sf-leave-notice">Die bestätigten Urlaubstage übersteigen den hinterlegten Anspruch. Bitte mit der Personalverwaltung klären.</p>':''}`;
 }
 function createHost(kind){
  if(kind==='employee')return document.querySelector('[data-leave-account-host]');
  const view=document.getElementById('view-absence');if(!view||!manager())return null;
  let host=document.getElementById('sfManagerLeaveAccounts');if(!host){host=document.createElement('section');host.id='sfManagerLeaveAccounts';host.className='sf-leave';const anchor=view.querySelector('.page-head');if(anchor)anchor.after(host);else view.prepend(host)}return host;
 }
 function draw(kind){
  const host=createHost(kind);if(!host)return;const s=state[kind],isManager=kind==='manager';s.year??=yearNow();
  const selectYear=`<label>Urlaubsjahr<select data-leave-year>${years(s.year).map(y=>`<option ${y===s.year?'selected':''}>${y}</option>`).join('')}</select></label>`;
  host.classList.add('sf-leave');
  const people=staff().filter(e=>staffId(e)).slice().sort((a,b)=>String(a.last||a.last_name||'').localeCompare(String(b.last||b.last_name||''),'de'));
  if(isManager&&!people.some(e=>staffId(e)===s.id)){s.id=people.length?staffId(people[0]):'';s.data=null}
  host.innerHTML=`<header class="sf-leave-head"><div><h3>${isManager?'Urlaubskonten':'Dein Urlaubskonto'}</h3><p>Anspruch, bestätigte Urlaubstage und Resturlaub im gewählten Jahr.</p></div><button type="button" data-leave-refresh>Aktualisieren</button></header><div class="sf-leave-toolbar">${isManager?`<label>Mitarbeiter<select data-leave-person aria-label="Mitarbeiter für Urlaubskonto"><option value="">Bitte wählen</option>${people.map(e=>`<option value="${esc(staffId(e))}" ${staffId(e)===s.id?'selected':''}>${esc((e.last||e.last_name||'')+', '+(e.first||e.first_name||''))}${e.personnel_no?' · '+esc(e.personnel_no):''}</option>`).join('')}</select></label>`:''}${selectYear}</div><p data-leave-message role="status" aria-live="polite">${esc(s.error||'')}</p>${s.error?'':summary(s.data)}${isManager&&s.data?managerForms(s.data):''}<p class="sf-leave-explanation">Urlaubstage sind keine Kalendertage: Im Schichtbetrieb bestätigt die Personalverwaltung die anzurechnenden Tage. Anträge in Prüfung werden getrennt angezeigt. Jahresanspruch und Übertrag werden je Jahr gepflegt.</p>`;
  host.querySelector('[data-leave-year]').onchange=e=>{s.year=Number(e.target.value);s.data=null;s.loaded=0;load(kind)};
  const person=host.querySelector('[data-leave-person]');if(person)person.onchange=e=>{s.id=e.target.value;s.data=null;s.loaded=0;load(kind)};
  host.querySelector('[data-leave-refresh]').onclick=()=>load(kind);
  host.querySelector('[data-leave-account-form]')?.addEventListener('submit',e=>saveAccount(e,host,s));
  host.querySelectorAll('[data-leave-charge-form]').forEach(form=>form.addEventListener('submit',e=>saveCharge(e,host,s)));
  host.querySelectorAll('button,input,select').forEach(n=>n.disabled=busy);
 }
 function managerForms(data){
  return `<details class="sf-leave-settings" ${data.configured?'':'open'}><summary>Jahresanspruch und Übertrag bearbeiten</summary><form data-leave-account-form><div class="sf-leave-toolbar"><label>Jahresanspruch (Tage)<input name="entitlement" type="number" min="0" max="366" step="0.01" required value="${data.entitlement??''}"></label><label>Übertrag aus dem Vorjahr (Tage)<input name="carryover" type="number" min="0" max="366" step="0.01" required value="${data.carryover??''}"></label></div><label>Grund / Grundlage der Änderung<input name="reason" required minlength="5" maxlength="1000" placeholder="z. B. geprüfter Anspruch laut Arbeitsvertrag"></label><button type="submit">Urlaubskonto speichern</button></form></details><details class="sf-leave-settings" ${data.unconfirmed_approved?'open':''}><summary>Urlaubstage prüfen · ${data.absences.length} Einträge</summary><p>Für jeden Zeitraum die tatsächlich anzurechnenden Tage im Jahr ${data.year} bestätigen. Auch 0 Tage sind möglich, wenn nur freie Tage betroffen sind. Einträge über den Jahreswechsel werden je Jahr getrennt geprüft.</p>${data.absences.length?data.absences.map(a=>`<form data-leave-charge-form="${esc(a.id)}" class="sf-leave-charge"><div><b>${esc(date(a.start_date))} – ${esc(date(a.end_date))}</b><span>${esc(a.status==='Beantragt'?'In Prüfung':a.status)}${a.full_day===false?' · Teil des Tages':''}</span><small>${a.changed?'Zeitraum oder Umfang geändert: erneut bestätigen':a.days==null?'Anrechnung noch nicht bestätigt':'Anrechnung bestätigt'}</small></div><label>Urlaubstage ${data.year}<input name="days" type="number" min="0" max="${a.max_days}" step="0.01" value="${a.days??''}" required></label><label>Begründung<input name="reason" required minlength="5" maxlength="1000" placeholder="Anrechnung geprüft"></label><button type="submit">Tage bestätigen</button></form>`).join(''):'<p>Keine offenen oder bestätigten Urlaube in diesem Jahr.</p>'}</details>`;
 }
 async function rpc(name,args){const q=await B.client.rpc(name,args);if(q.error){if(/MFA_REQUIRED/.test(q.error.message||''))throw Error('Bitte bestätige zuerst die zweite Anmeldestufe für die Personalverwaltung.');throw q.error}return q.data}
 async function load(kind){
  if(busy||kind==='manager'&&!manager()||kind==='employee'&&!employee())return;
  const s=state[kind],who=scope();s.year??=yearNow();draw(kind);if(kind==='manager'&&!s.id)return;
  const seq=++s.seq,year=s.year,id=s.id,client=B.client;s.error='';
  try{const data=await rpc(kind==='manager'?'manager_leave_account':'employee_my_leave_account',{p_company_id:B.companyId,p_year:year,...(kind==='manager'?{p_employee_id:id}:{})});
   if(who!==scope()||client!==B.client||seq!==s.seq||year!==s.year||id!==s.id)return;
   if(!data||data.year!==year||!Array.isArray(data.absences))throw Error('Keine gültige Rückmeldung');s.data=data;s.loaded=Date.now();
  }catch(e){if(who!==scope()||seq!==s.seq)return;s.data=null;s.error='Urlaubskonto konnte nicht geladen werden. '+(e?.message||'Bitte erneut versuchen.');s.loaded=Date.now()}
  if(who===scope())draw(kind);
 }
 function formNumber(form,name){const v=form.elements[name].value;if(!v.trim()||!Number.isFinite(Number(v)))throw Error('Bitte eine gültige Anzahl Urlaubstage eintragen.');return Number(v)}
 async function write(host,operation){
  if(busy||!manager()||owner!==scope())return;const who=scope(),sequence=++writeSequence;busy=true;host.querySelectorAll('button,input,select').forEach(n=>n.disabled=true);const message=host.querySelector('[data-leave-message]');message.textContent='Wird gespeichert …';
  try{const data=await operation();if(who!==scope())return;if(!data||!Array.isArray(data.absences))throw Error('Keine Speicherbestätigung');state.manager.data=data;state.manager.loaded=Date.now();state.manager.error='';draw('manager');createHost('manager').querySelector('[data-leave-message]').textContent='Gespeichert. Der neue Stand ist im Mitarbeiterportal verfügbar.';
  }catch(e){if(who===scope()&&message.isConnected)message.textContent='Nicht gespeichert. '+(e?.message||'Bitte erneut versuchen.')}
  finally{if(sequence===writeSequence){busy=false;if(who===scope())host.querySelectorAll('button,input,select').forEach(n=>n.disabled=false)}}
 }
 function saveAccount(event,host,s){event.preventDefault();const form=event.target;write(host,()=>rpc('manager_save_leave_account',{p_company_id:B.companyId,p_employee_id:s.id,p_year:s.year,p_entitlement:formNumber(form,'entitlement'),p_carryover:formNumber(form,'carryover'),p_expected_revision:s.data.revision,p_reason:form.elements.reason.value.trim()}))}
 function saveCharge(event,host,s){event.preventDefault();const form=event.target,a=s.data.absences.find(a=>a.id===form.dataset.leaveChargeForm);if(!a)return;write(host,()=>rpc('manager_set_leave_charge',{p_absence_id:a.id,p_year:s.year,p_days:formNumber(form,'days'),p_expected_snapshot:a.expected_snapshot,p_expected_days:a.saved_days??null,p_reason:form.elements.reason.value.trim()}))}
 function mount(){
  const who=scope();if(owner!==who){owner=who;busy=false;writeSequence++;for(const s of Object.values(state)){s.seq++;s.data=null;s.loaded=0;s.error='';s.id='';s.year=yearNow()}document.getElementById('sfManagerLeaveAccounts')?.remove();document.querySelectorAll('[data-leave-account-host]').forEach(n=>n.replaceChildren())}
  if(employee()&&document.querySelector('[data-leave-account-host]')){const host=createHost('employee');if(!host.querySelector('[data-leave-year]'))draw('employee');if(document.getElementById('sfEmployeePortal')?.dataset.sfPortalActive==='absences'&&Date.now()-state.employee.loaded>60000&&!state.employee.loading){state.employee.loading=true;load('employee').finally(()=>state.employee.loading=false)}}
  if(manager()&&document.getElementById('view-absence')?.classList.contains('active')){const host=createHost('manager');if(!host.querySelector('[data-leave-year]'))draw('manager');if(!state.manager.loaded&&!state.manager.loading){state.manager.loading=true;load('manager').finally(()=>state.manager.loading=false)}}
 }
 function approvalHtml(a){const from=Number(a.start_date.slice(0,4)),to=Number(a.end_date.slice(0,4));if(to-from>5)throw Error('Bitte langen Urlaubszeitraum zuerst prüfen.');return `<div class="sf-leave-approval"><b>Anzurechnende Urlaubstage bestätigen</b><p>Nur tatsächliche Urlaubstage eintragen, keine pauschalen Kalendertage.</p>${Array.from({length:to-from+1},(_,i)=>`<label>Urlaubstage ${from+i}<input data-leave-approval-year="${from+i}" type="number" min="0" max="366" step="0.01" required placeholder="Anzurechnende Tage"></label>`).join('')}</div>`}
 async function approve(a,modal,note){if(a.company_id!==B.companyId||!manager())throw Error('Unternehmen oder Zugang wurde gewechselt. Bitte Dialog erneut öffnen.');const fields=[...modal.querySelectorAll('[data-leave-approval-year]')];if(!fields.length||fields.some(n=>!n.value.trim()||!n.checkValidity()))throw Error('Bitte die anzurechnenden Urlaubstage für jedes Jahr bestätigen.');return B.client.rpc('manager_approve_leave_request',{p_absence_id:a.id,p_allocations:fields.map(n=>({year:Number(n.dataset.leaveApprovalYear),days:Number(n.value)})),p_expected_snapshot:snapshot(a),p_review_note:note})}
 B.leaveAccounts={mount,refresh:()=>{state.employee.loaded=0;state.manager.loaded=0;mount()},approvalHtml,approve};
 setInterval(mount,1000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)B.leaveAccounts.refresh()});setTimeout(mount,100);
})();
