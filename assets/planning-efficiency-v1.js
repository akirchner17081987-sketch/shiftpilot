// Explicit planning tools. Existing guards and confirmed draft writes remain authoritative.
(function(){
'use strict';if(window.SFPlanningEfficiency)return;
const Core=window.SFPlanningEfficiencyCore,A=()=>window.SFPlanningAssistant,B=()=>window.SFBackend||{},roles=['OWNER','ADMIN','PLANNER','DISPATCHER'],el=id=>document.getElementById(id),make=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
let owner='',records=[],running=new Map(),saving=false;
const identity=()=>B().ready&&B().companyId&&roles.includes(B().role)&&!B().companySwitching?JSON.stringify([B().companyId,B().user?.id||'demo',B().role,B().accessRole,B().accessPermissions]):'';
const writable=()=>!!identity()&&!B().accessPermissions?.includes('read_only');
const stamp=()=>JSON.stringify([identity(),typeof assignments==='undefined'?[]:assignments,typeof employees==='undefined'?[]:employees,typeof absences==='undefined'?[]:absences,typeof TYPES==='undefined'?[]:TYPES,typeof globalSoll==='undefined'?{}:globalSoll,typeof dailySoll==='undefined'?{}:dailySoll,window.SFCompliance?.policy,el('autoPlanMonth')?.value,el('autoPlanPeriod')?.value,window.SFAutonomousPlanning?.getState?.()?.config]);
const time=()=>window.performance?.now?.()??Date.now(),format=n=>Number(n||0).toLocaleString('de-DE',{maximumFractionDigits:1});
function record(label,ms,counts={}){if(!identity())return;records.unshift({label,ms:Math.max(0,Number(ms)||0),requests:Number(counts.requests)||0,hits:Number(counts.hits)||0,misses:Number(counts.misses)||0});records=records.slice(0,20);}
function dialog(title){
 el('sfPlanningEfficiencyDialog')?.remove();const d=make('dialog');d.id='sfPlanningEfficiencyDialog';d.className='sf-eff-dialog';d.setAttribute('aria-labelledby','sfEfficiencyTitle');
 const head=make('header'),heading=make('h2',title),x=make('button','×');heading.id='sfEfficiencyTitle';x.type='button';x.setAttribute('aria-label','Planungsfenster schließen');head.append(heading,x);d.append(head);
 const main=make('div');main.className='sf-eff-body';const footer=make('footer'),cancel=make('button','Abbrechen');cancel.type='button';footer.append(cancel);d.append(main,footer);
 let resolve=()=>{};const closed=new Promise(r=>resolve=r),scope=identity();
 const close=value=>{if(saving&&value!==true)return;d.close();d.remove();resolve(value===true);};d.sfClose=()=>close(false);x.onclick=cancel.onclick=()=>close(false);d.addEventListener('cancel',event=>{event.preventDefault();close(false);});d.sfOwner=scope;document.body.appendChild(d);d.showModal();cancel.focus();
 return{d,main,footer,cancel,closed,close};
}
function addAction(host,label,fn){const button=make('button',label);button.type='button';button.onclick=fn;host.appendChild(button);return button;}
function period(){const s=A()?.snapshot();return s?.defaultDates?.length?s.defaultDates:[];}
function metrics(){
 const m=dialog('Laufzeiten der Planung');m.cancel.textContent='Schließen';m.main.append(make('p','Messungen dieses Browsers und Unternehmens. Die beobachtete Serverwartezeit enthält Warten und den Abstand bis zur nächsten Statusmeldung. Es werden keine Personendaten oder Messwerte versendet.'));
 if(!records.length)m.main.append(make('p','Noch keine Messung vorhanden. Starte eine Machbarkeits- oder Ersatzprüfung.'));
 for(const r of records){const row=make('p',r.label+': '+format(r.ms)+' ms'+(r.requests?' · '+r.requests+' Kandidatenabfragen · '+r.hits+' wiederverwendet':''));m.main.appendChild(row);}
 const stats=window.SFAutoPlanGuard?.getTimingStats?.();if(stats)m.main.append(make('p','Zeitintervalle im Browser: '+stats.intervalHits+' wiederverwendet, '+stats.intervalMisses+' berechnet. Der Cache enthält höchstens 4.096 reine Zeitintervalle.'));
}
async function preflight(dates=period(),options={}){
 if(!identity()||!A()||!Core)return false;const m=dialog(options.beforeRun?'Vorprüfung vor dem Planungslauf':'Machbarkeit prüfen'),scope=identity();m.main.append(make('p','Bedarf, verfügbare Personen und Planungsregeln werden geprüft …'));let basis;
 try{
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  let protectedIds=null;
  if(options.beforeRun&&sessionStorage.getItem('sf_demo_session_v1')!=='active'){
   if(B().syncing)throw Error('Eine Speicherung läuft. Bitte anschließend erneut starten.');
   const started=time();clearTimeout(B().syncTimer);B().syncTimer=null;await B().sync?.();if(B().lastSyncError)throw B().lastSyncError;await B().hydrate?.();
   if(scope!==identity()||!m.d.isConnected)return false;
   const months=[...new Set(dates.map(d=>d.slice(0,7)))],r=await B().client.rpc('preview_planning_period',{p_company_id:B().companyId,p_first_month:months[0]+'-01',p_month_count:months.length});if(r.error)throw r.error;
   if(scope!==identity()||!m.d.isConnected)return false;protectedIds=new Set(r.data.protectedIds||[]);record('Aktuellen Planungsstand laden',time()-started);
  }
  const s=A().snapshot();if(s.loading||s.error)throw Error('Die Planungsdaten sind noch nicht bereit.');
  const state=protectedIds?{...s,movable:a=>s.movable(a)&&!protectedIds.has(a._dbId||B().asgDb?.get(String(a.id)))}:s;basis=stamp();const result=Core.preflight(state,dates,{rebuild:!!options.beforeRun});record('Machbarkeit prüfen',result.ms,result.cache);
  if(scope!==identity()||!m.d.isConnected)return false;
  m.main.replaceChildren();m.main.append(make('p',result.mode+' · '+result.dates[0]+' bis '+result.dates.at(-1)),make('p',result.open+' offene Positionen · '+result.checked+' von '+result.totalGroups+' Dienstgruppen geprüft.'));
  for(const [kind,label] of [['capacity','Personelle Grenzen'],['rule','Verbindliche Regelkonflikte'],['missing','Fehlende Daten / offene Prüfung']]){const section=make('section');section.appendChild(make('h3',label));const rows=result.rows.filter(r=>r.kind===kind);if(!rows.length)section.appendChild(make('p',result.complete?'Keine Hinweise in dieser Prüfung.':'In der geprüften Teilmenge kein Hinweis.'));else for(const row of rows)section.appendChild(make('p',(row.date?row.date+' · ':'')+(row.type?row.type+' · ':'')+row.message));m.main.appendChild(section);}
  for(const month of result.months)m.main.append(make('p',month.month+': '+format(month.openHours)+' h offener Bedarf · optimistisch '+(month.optimisticAvailableHours==null?'nicht vollständig geprüft':format(month.optimisticAvailableHours)+' h zusätzlich verfügbar')+' · '+format(month.target)+' h Vertrags-SOLL'+(!month.completeMonth?' (Zeitraum enthält einen Teilmonat)':'')));
  for(const note of result.notes)m.main.appendChild(make('p',note));
  const details=make('details');details.appendChild(make('summary','Gemessene Prüfschritte'));for(const p of result.phases)details.appendChild(make('p',p.label+': '+format(p.ms)+' ms'));m.main.appendChild(details);
  if(options.beforeRun){const accept=addAction(m.footer,'Planung starten',()=>{if(scope!==identity()||basis!==stamp()){accept.disabled=true;m.main.appendChild(make('p','Die Planungsdaten wurden geändert. Bitte die Vorprüfung neu starten.'));return;}m.close(true);});accept.disabled=!state.rulesReady||!state.solidRules?.enabled;m.main.appendChild(make('p','Die Vorprüfung ist eine Einschätzung. Der eigentliche Planungslauf prüft alle verbindlichen Regeln erneut. Personelle Lücken verhindern den Start nicht.'));}
  else m.cancel.textContent='Schließen';
 }catch(error){if(scope===identity()&&m.d.isConnected){m.main.replaceChildren(make('p',error.message||String(error)));addAction(m.footer,'Erneut prüfen',()=>{m.close(false);preflight(dates,options);});}}
 return m.closed;
}
function repair(){
 if(!identity()||!A())return;const s=A().snapshot();if(s.loading||s.error)return;const dates=period();if(!dates.length)return;
 const m=dialog('Ausfall gezielt nachplanen'),form=make('form'),personLabel=make('label','Betroffene Person'),person=make('select');person.id='sfRepairEmployee';
 for(const e of s.employees.filter(e=>!e.deletedAt&&s.assignments.some(a=>String(a.employeeId)===String(e.id)))){const option=make('option',[e.first,e.last].filter(Boolean).join(' '));option.value=e.id;person.appendChild(option);}personLabel.appendChild(person);
 const fromLabel=make('label','Von'),from=make('input'),toLabel=make('label','Bis'),to=make('input');from.type=to.type='date';from.id='sfRepairFrom';to.id='sfRepairTo';from.value=dates[0];to.value=dates.at(-1);fromLabel.append(from);toLabel.append(to);form.append(personLabel,fromLabel,toLabel);m.main.append(form,make('p','Die Vorschau ersetzt nur Dienste dieser Person an den ausgewählten Tagen. Andere Dienste bleiben erhalten. Für veröffentlichte Dienste wird der Störfallablauf angeboten. Eine Abwesenheit wird nicht automatisch erfasst.'));
 const status=make('p');status.setAttribute('role','alert');m.main.appendChild(status);const scope=identity(),accept=addAction(m.footer,'Ersatzvorschau prüfen',async()=>{if(scope!==identity())return;const range=window.SFPlanningAssistantCore.rangeDates(from.value,to.value);if(range.error){status.textContent=range.error;return;}if(!person.value){status.textContent='Bitte eine Person mit gespeicherten Diensten auswählen.';return;}m.close(true);await A().repair({employeeId:person.value,dates:range.dates});});accept.disabled=!person.options.length;form.onsubmit=e=>{e.preventDefault();accept.click();};
}
async function lockDialog(id){
 if(!writable()||saving)return;const a=typeof assignments==='undefined'?null:assignments.find(a=>String(a.id)===String(id));if(!a)return;
 const scope=identity(),basis=stamp(),m=dialog(a.plannerLocked?'Planerfixierung aufheben?':'Dienst als Planerentscheidung fixieren?');m.main.append(make('p',a.date+' · '+a.type),make('p',a.plannerLocked?'Nach dem Entsperren darf die automatische Planung diesen beweglichen Entwurf wieder ändern. Andere Schutzregeln bleiben erhalten.':'Dieser Dienst bleibt bei automatischen Planungsläufen erhalten. Vor Änderungen muss er ausdrücklich entsperrt werden. Die Fixierung ist keine Freigabe für Regelverletzungen.'));
 const status=make('p');status.setAttribute('role','alert');m.main.appendChild(status);
 const accept=addAction(m.footer,a.plannerLocked?'Fixierung aufheben':'Dienst fixieren',async()=>{
  if(saving||scope!==identity()||basis!==stamp()){status.textContent='Die Planungsdaten wurden geändert. Bitte den Dienst erneut öffnen.';return;}
  let committed=false;try{saving=true;for(const b of m.d.querySelectorAll('button'))b.disabled=true;
   if(sessionStorage.getItem('sf_demo_session_v1')==='active'){a.plannerLocked=!a.plannerLocked;a.version=Number(a.version||1)+1;window.saveAll?.();committed=true;}
   else{if(B().syncing||B().autoPlanApplying)throw Error('Eine Speicherung läuft. Bitte anschließend erneut versuchen.');clearTimeout(B().syncTimer);B().syncTimer=null;await B().sync?.();if(B().lastSyncError)throw B().lastSyncError;if(scope!==identity()||basis!==stamp())throw Error('Der Datenstand hat sich geändert. Bitte erneut öffnen.');const aid=a._dbId||B().asgDb?.get(String(a.id));if(!aid)throw Error('Bitte den Dienst zuerst speichern und neu laden.');const r=await B().client.rpc('set_planner_assignment_lock',{p_company_id:B().companyId,p_assignment_id:aid,p_locked:!a.plannerLocked,p_expected_version:Number(a.version||1)});if(r.error)throw r.error;committed=true;if(scope!==identity())return;a.plannerLocked=r.data.planner_locked;a.version=r.data.version;await B().hydrate?.();}
   if(scope!==identity())return;window.renderCalendar?.();window.renderAutoPlanning?.();el('spAssignModal')?.remove();m.close(true);window.showSaveToast?.('Planerentscheidung gespeichert','Der aktuelle Schutz ist im Dienstplan gekennzeichnet.');
  }catch(error){if(scope===identity()&&m.d.isConnected){status.textContent=committed?'Die Fixierung wurde gespeichert. Bitte die Ansicht neu laden.':error.message;for(const b of m.d.querySelectorAll('button'))b.disabled=false;if(committed)accept.disabled=true;}}
  finally{saving=false;}
 });
}
function decorate(){
 if(!identity())return;
 for(const host of document.querySelectorAll('#view-schedule [data-assignment-id]')){const a=assignments.find(a=>String(a.id)===String(host.dataset.assignmentId));let mark=host.querySelector('.sf-planner-lock-mark');if(a?.plannerLocked){if(!mark){mark=make('span','Fixiert');mark.className='sf-planner-lock-mark';mark.setAttribute('aria-label','Durch Planerentscheidung fixiert');host.appendChild(mark);}}else mark?.remove();}
 const schedule=el('sfVacancySummary'),auto=document.querySelector('#view-auto .sf-auto-start');
 for(const host of [schedule,auto]){if(!host||host.querySelector('.sf-eff-tools'))continue;const tools=make('div');tools.className='sf-eff-tools';addAction(tools,'Ausfall nachplanen',repair);addAction(tools,'Machbarkeit prüfen',()=>preflight());addAction(tools,'Laufzeiten',metrics);host.appendChild(tools);}
 const original=window.editAssignment;if(typeof original==='function'&&!original.__sfPlannerLock){const wrapper=function(id){const a=assignments.find(a=>String(a.id)===String(id));if(!a)return;const value=original.apply(this,arguments),modal=el('spAssignModal');if(!modal||modal.querySelector('#sfPlannerLockButton'))return value;const initial=[...modal.querySelectorAll('input,select,textarea')].map(n=>n.value),footer=modal.querySelector('.sp-assign-foot')||modal.querySelector('.sp-assign-modal')||modal;const button=addAction(footer,a.plannerLocked?'Fixierung aufheben':'Als Planerentscheidung fixieren',()=>{const current=[...modal.querySelectorAll('input,select,textarea')].map(n=>n.value);if(JSON.stringify(current)!==JSON.stringify(initial)){window.showSaveToast?.('Änderungen zuerst bearbeiten','Bitte die Eingaben zuerst speichern oder verwerfen.');return;}lockDialog(id);});button.id='sfPlannerLockButton';button.disabled=!writable();
  if(a.plannerLocked){const note=make('p','Dieser Dienst ist fixiert. Bitte vor Änderungen ausdrücklich entsperren.');modal.querySelector('.sp-assign-head')?.after(note);for(const n of modal.querySelectorAll('input,select,textarea,#spSaveAssign,#spDeleteAssign,#spDeleteAssignment,#spDeleteShift'))n.disabled=true;}
  return value;};wrapper.__sfPlannerLock=true;window.editAssignment=wrapper;}
}
function tick(){
 const next=identity();if(owner!==next){owner=next;records=[];running.clear();if(el('sfPlanningEfficiencyDialog')){saving=false;el('sfPlanningEfficiencyDialog').sfClose?.();}document.querySelectorAll('.sf-eff-tools,.sf-planner-lock-mark').forEach(n=>n.remove());}
 if(!next)return;decorate();
 for(const run of window.SFAutonomousPlanning?.getState?.()?.runs||[]){if(['QUEUED','PREPARING','CALCULATING','ASSESS_QUEUED','ASSESSING'].includes(run.status)){if(!running.has(run.id))running.set(run.id,time());}else if(running.has(run.id)){record('Serverlauf beobachtet (inkl. Wartezeit)',time()-running.get(run.id));running.delete(run.id);}if(running.size>20)running.delete(running.keys().next().value);}
}
window.SFPlanningEfficiency={preflight,repair,lockDialog,record,getMetrics:()=>identity()?records.slice():[],beforeRun:(month)=>{if(!writable()){window.showSaveToast?.('Nur Leserechte','Ein Planungslauf benötigt schreibende Planungsrechte.');return false;}const count=Math.max(1,Math.min(12,Number(window.SFAutonomousPlanning?.getState?.()?.config?.month_count)||1)),dates=window.SFPlanningWorkflows.months(month,count).flatMap(window.SFPlanningWorkflows.datesFor);return preflight(dates,{beforeRun:true});}};
setInterval(tick,700);document.addEventListener('sf:schedule-period-changed',()=>{if(!saving)el('sfPlanningEfficiencyDialog')?.sfClose?.();});
})();
