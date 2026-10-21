// Preview edits stay local; already saved duties use the regular assignment editing workflow.
(function(){
 'use strict';
 if(window.SFAutoPlanPreviewEditor)return;
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const optimizer=()=>window.SFMonthOptimizer,prepared=()=>optimizer()?.getResult(),policy=()=>window.SFCompliance?.policy?.solidPlanningRules;
 const base=()=>prepared()?.base||assignments,active=a=>a.status!=='CANCELLED'&&a._dbStatus!=='CANCELLED',same=(a,b)=>String(a)===String(b);
 const withRows=(rows,fn)=>{const old=assignments;try{assignments=rows;return fn()}finally{assignments=old}};
 const canPlan=()=>{const B=window.SFBackend;if(!B?.ready)return true;return typeof B.can==='function'?B.can('plan'):['OWNER','ADMIN','PLANNER','DISPATCHER'].includes(B.role);};
 const available=()=>canPlan()&&!autoPlanApplying&&!optimizer()?.isBusy()&&!window.SFAutoPlanProgress?.isBusy();
 const editable=()=>available()&&autoPlanAnalyzed&&!autoPlanApplied;
 let history=[],context='',revision=0,dialog=null;
 const key=()=>JSON.stringify([window.SFBackend?.companyId,autoPlanningDates(),base(),autoPlanPreview]);
 const label=e=>[e.personnelNo,e.last&&e.first?e.last+', '+e.first:e.last||e.first||'Mitarbeiter'].filter(Boolean).join(' · ');
 const plus=(date,n)=>window.SFSolidPlanningCore?.plus(date,n)||iso(addDays(new Date(date+'T12:00:00'),n));
 function contextChanged(){const next=key();if(context&&context!==next){history=[];revision=0;}context=next;}
 function range(from,to){const selected=new Set(autoPlanningDates()),dates=[];if(!selected.has(from)||!selected.has(to)||to<from)throw Error('Bitte Tage innerhalb des gewählten Planungszeitraums auswählen.');for(let d=from;d<=to;d=plus(d,1)){if(!selected.has(d)||dates.length===31)throw Error('Bitte höchstens 31 zusammenhängende Planungstage wählen.');dates.push(d);}return dates;}
 function normalize(rows){const before=new Map(rows.map(a=>[a.id,[a.type,a.date,a.start,a.end].join('|')]));withRows(base(),()=>window.SFShiftModels?.normalizeMorningOt?.(rows,base()));for(const a of rows)if(before.get(a.id)!==[a.type,a.date,a.start,a.end].join('|'))for(const k of ['startMs','endMs','hours','day','week'])delete a[k];return rows;}
 function check(rows,changed,staffingDates=changed.flatMap(a=>[a.date,plus(a.date,1)])){
  const all=[...base(),...rows].filter(active),issues=[],C=window.SFCompliance,S=window.SFSolidPlanningCore;
  for(const a of changed){
   const e=employees.find(e=>same(e.id,a.employeeId)),t=typeById(a.type);
   if(!e||e.status!=='active'||e.deletedAt||!t||t.active===false){issues.push('Mitarbeiter oder Schicht ist nicht mehr verfügbar.');continue}
   const prefix=a.date+' · '+label(e)+': ',others=all.filter(b=>b!==a);
   if(!autoPlanningDates().includes(a.date))issues.push(prefix+'Tag liegt außerhalb der Vorplanung.');
   if(C?.isWeekPublished?.(a.date))issues.push(prefix+'Die Woche ist bereits veröffentlicht.');
   if(!(e.shifts||[]).includes(a.type))issues.push(prefix+'Keine Freigabe für '+a.type+'.');
   if(/^(TL-LE|TL-RE|TEAMLEITER)$/i.test(a.type)&&!/teamleiter|schichtleiter/i.test(e.role||''))issues.push(prefix+'Diese Schicht benötigt eine Leitungsrolle.');
   if(e.startDate&&a.date<e.startDate||e.contractEnd&&a.date>e.contractEnd)issues.push(prefix+'Dienst liegt außerhalb des Beschäftigungszeitraums.');
   if(absent(e.id,a.date))issues.push(prefix+'Mitarbeiter ist abwesend.');
   const restriction=window.SFShiftModels?.planningRestriction?.(a.type,e,a.date,a.start,a.end);if(restriction)issues.push(prefix+restriction);
   if(window.SFShiftModels?.allowsEmployee?.(a.type,e,a.date)===false&&!restriction)issues.push(prefix+'Dieser Mitarbeiter ist für die Schicht nicht zuständig.');
   const manual=window.SFManualRhythm?.isPreviewOverride(a),rhythm=window.sfRhythmCheck?.(e,a.type,a.date);if(rhythm?.mode==='required'&&!rhythm.allowed&&!manual)issues.push(prefix+rhythm.reason);
   if(others.some(b=>same(b.employeeId,e.id)&&b.date===a.date))issues.push(prefix+'An diesem Tag ist bereits ein Dienst vorhanden.');
   if(C?.check)withRows(others,()=>issues.push(...C.check(e,a.type,a.date,a.start,a.end,null,{manualRhythm:manual}).hard.map(v=>prefix+v)));
   if(C?.monthPlanningCheck){const end=S?.interval(a.date,a.start,a.end,policy()?.timezone)?.end;for(const month of new Set([a.date.slice(0,7),end?S.localDate(end-1,policy()).slice(0,7):a.date.slice(0,7)]))issues.push(...C.monthPlanningCheck(e,month+'-01',all).map(v=>prefix+v));}
   else if(window.SFAutoPlanGuard)withRows(others,()=>{const reason=window.SFAutoPlanGuard.transitionConflict?.(e.id,a.type,a.date);if(reason)issues.push(prefix+reason);else if(!window.SFAutoPlanGuard.passesTimeRules(e.id,a.type,a.date))issues.push(prefix+'Ruhezeit, Schichtwechsel oder Dienstfolge ist nicht zulässig.');});
   if(policy()?.enabled&&S)issues.push(...S.errors(e,all,policy(),[a.date]).map(v=>prefix+v.message));
   const limits=withRows(others,()=>autoHourLimits(e)),own=all.filter(b=>same(b.employeeId,e.id)&&b.date.slice(0,7)===a.date.slice(0,7));
   if(own.reduce((n,b)=>n+plannedAssignmentHours(b),0)>limits.monthLimit+.000001||own.filter(b=>!S?.confirmed(policy())||S.countsTowardCap(b)).length>limits.maxMonthlyShifts)issues.push(prefix+'Persönliche Monatsgrenze oder maximale Dienstzahl überschritten.');
   if(!S?.confirmed(policy())&&$('autoRespectHours')?.checked!==false&&limits.weeklyLimit>0&&withRows(others,()=>autoPlannedHours(e.id,[],a.date))+plannedAssignmentHours(a)>limits.weeklyLimit+.000001)issues.push(prefix+'Persönliches Wochenmaximum überschritten.');
  }
  withRows(all,()=>{
   for(const date of new Set(staffingDates)){
    const seen=new Set();
    for(const t of TYPES){const group=window.SFShiftModels?.coverageInfo?.(date,t.id),k=group?.key||t.id;if(seen.has(k))continue;seen.add(k);
     const required=group?group.target:window.SFShiftModels?.requiredSoll?.(date,t.id,getSoll(date,t.id))??getSoll(date,t.id),optional=window.SFShiftModels?.optionalTarget?.(date,t.id)||0;
     const count=group?group.filled:all.filter(a=>a.date===date&&a.type===t.id).length;
     if(count>Math.max(required,optional))issues.push(date+' · '+k+': Die benötigte Besetzung ist bereits vollständig.');
    }
   }
  });
  return [...new Set(issues)];
 }
 function reviewIssues(){
  if(!autoPlanAnalyzed||autoPlanApplied)return[];
  const rows=[...base(),...autoPlanPreview].filter(active),dates=autoPlanningDates(),selected=new Set(dates),out=[],S=window.SFSolidPlanningCore;
  if(revision)out.push(...check(autoPlanPreview,autoPlanPreview.filter(a=>a.rhythmOverride),dates));
  if(prepared()?.needsReplan)out.push('Ein gespeicherter Dienst wurde geändert. Bitte die Vorplanung vor der Übernahme neu berechnen.');
  if(prepared()?.solid&&prepared().criticalOpen)out.push('Verbindliche Pflichtbesetzung: noch '+prepared().criticalOpen+' Positionen offen.');
  for(const e of employees.filter(e=>e.status==='active'&&!e.deletedAt)){
   if(revision&&policy()?.enabled)out.push(...(S?.errors(e,rows,policy(),dates)||[]).map(v=>label(e)+': '+v.message));
   const rule=window.SFRhythm?.config(e);if(!rule||rule.mode!=='required')continue;
   const fixed=S?.fixedWeeklyRoster?.(e,policy());
   if(fixed){const missing=dates.filter(d=>fixed.weekdays.includes(new Date(d+'T12:00:00').getDay()||7)&&(!e.startDate||d>=e.startDate)&&(!e.contractEnd||d<=e.contractEnd)&&!absent(e.id,d)&&!rows.some(a=>same(a.employeeId,e.id)&&a.date===d&&a.type===fixed.code));if(missing.length)out.push(label(e)+': '+missing.length+' feste '+fixed.code+'-Dienste fehlen (z. B. '+missing[0]+').');}
   if(rule.team||!rule.pattern.includes('ALLE')||!rule.pattern.includes('FREI')||rule.pattern.some(x=>!['ALLE','FREI'].includes(x)))continue;
   const seen=new Set(),n=rule.pattern.length;
   for(const a of rows.filter(a=>same(a.employeeId,e.id)&&selected.has(a.date)&&!['OT1','OT2','OT3'].includes(a.type))){
    const r=window.SFRhythm.check(e,a.type,a.date);if(r.expected!=='ALLE')continue;let before=0,after=0;
    while(before<n-1&&rule.pattern[(r.index-before-1+n)%n]==='ALLE')before++;
    while(after<n-1&&rule.pattern[(r.index+after+1)%n]==='ALLE')after++;
    const start=plus(a.date,-before);if(seen.has(start))continue;seen.add(start);
    const block=Array.from({length:before+after+1},(_,i)=>plus(start,i)).filter(d=>selected.has(d)&&(!e.startDate||d>=e.startDate)&&(!e.contractEnd||d<=e.contractEnd)&&!absent(e.id,d));
    const missing=block.filter(d=>!rows.some(b=>same(b.employeeId,e.id)&&b.date===d&&!['OT1','OT2','OT3'].includes(b.type)));
    if(missing.length)out.push(label(e)+': Arbeitsblock ab '+start+' unvollständig ('+(block.length-missing.length)+'/'+block.length+' Dienste).');
   }
  }
  return out;
 }
 function commit(next,changed=[]){
  if(!editable())throw Error('Die Vorplanung kann gerade nicht bearbeitet werden.');
  contextChanged();const previous=autoPlanPreview,nextRows=normalize(next.map(a=>({...a}))),changedIds=new Set(changed.map(a=>a.id));
  const altered=nextRows.filter(a=>changedIds.has(a.id)||JSON.stringify(a)!==JSON.stringify(previous.find(b=>b.id===a.id))),errors=check(nextRows,altered);
  if(errors.length)throw Error(errors.slice(0,4).join('\n'));
  history.push(previous.map(a=>({...a})));if(history.length>20)history.shift();
  autoPlanPreview=nextRows;revision++;context=key();optimizer()?.refreshPreview?.();renderAutoPlanning();
  if(typeof CustomEvent==='function')document.dispatchEvent(new CustomEvent('sf:planning-analysis-ready',{detail:{dates:autoPlanningDates(),assignments:[...base(),...autoPlanPreview]}}));
 }
 function remove(index,whole=false){
  const target=autoPlanPreview[index];if(!target)return;
  const next=autoPlanPreview.filter((a,i)=>whole&&target.blockId?a.blockId!==target.blockId:i!==index);
  try{commit(next);showSaveToast('Vorplanung geändert',whole?'Arbeitsblock aus dem Vorschlag entfernt.':'Dienst aus dem Vorschlag entfernt.');}catch(e){showSaveToast('Vorplanung nicht geändert',e.message);}
 }
 function undo(){if(!editable())return;contextChanged();if(!history.length)return;autoPlanPreview=history.pop();revision++;context=key();optimizer()?.refreshPreview?.();renderAutoPlanning();}
 function savedChanged(id){optimizer()?.savedAssignmentChanged?.(id);history=[];revision=0;context=key();renderAutoPlanning();}
 function openSaved(id){
  if(!available()||typeof window.editAssignment!=='function')return;
  const company=window.SFBackend?.companyId,a=assignments.find(a=>same(a.id,id));
  if(!a){showSaveToast('Dienst nicht mehr verfügbar','Bitte die Planung aktualisieren.');return;}
  window.editAssignment(a.id,{fixedEmployee:true,fixedDate:true,fromPreview:true,onSaved:()=>{if(window.SFBackend?.companyId===company)savedChanged(a.id);},onDeleted:()=>{if(window.SFBackend?.companyId===company)savedChanged(a.id);}});
 }
 function decorateEmployeeCells(host,onlySaved=false){
  const dates=autoPlanningDates(),shown=dates.filter(d=>d.startsWith(host.querySelector('.sf-auto-preview-nav select')?.value||dates[0]?.slice(0,7)));
  for(const row of host.querySelectorAll('.sf-auto-stair-table > tbody:not(.sf-auto-staffing) > tr')){
   const e=employees.find(e=>same(e.id,row.dataset.autoEmployee));if(!e)continue;
   [...row.querySelectorAll('td')].forEach((cell,i)=>{const date=shown[i];if(!date)return;const a=autoPlanPreview.filter(a=>same(a.employeeId,e.id)&&a.date===date).at(-1),saved=base().filter(a=>same(a.employeeId,e.id)&&a.date===date).at(-1);if(onlySaved&&!saved)return;
    const btn=cell.querySelector('button')||document.createElement('button');btn.type='button';btn.className='sf-auto-edit-cell';btn.textContent=cell.textContent;btn.title=cell.title;btn.setAttribute('aria-label',label(e)+' · '+date+' · '+(a&&!onlySaved?'Dienst ändern':saved?'Gespeicherten Dienst bearbeiten':'Dienst hinzufügen'));
    btn.onclick=()=>{if(saved&&(!a||onlySaved))openSaved(saved.id);else open({id:a?.id,employeeId:e.id,date,rowEmployee:true});};cell.replaceChildren(btn);
   });
  }
 }
 function open(options={}){
  if(!editable())return;contextChanged();if(dialog)dialog.remove();
  const company=window.SFBackend?.companyId,signature=key(),focused=document.activeElement,dates=autoPlanningDates(),target=options.id?autoPlanPreview.find(a=>a.id===options.id):null;
  const date=target?.date||options.date||dates[0],employee=target?.employeeId||options.employeeId||'',type=target?.type||options.type||TYPES[0]?.id,staffing=options.staffing===true,group=staffing&&options.group?window.SFShiftModels?.coverageGroup?.(type):null,groupValue='__shared_coverage__';
  const fixedEmployee=options.rowEmployee===true&&employee!=='',person=fixedEmployee?employees.find(e=>same(e.id,employee)&&e.status==='active'&&!e.deletedAt):null;
  if(fixedEmployee&&!person){showSaveToast('Mitarbeiter nicht verfügbar','Bitte die Planung neu laden.');return;}
  const types=TYPES.filter(t=>t.active!==false&&(!group||group.active.some(m=>m.id===t.id))&&(!fixedEmployee||(person.shifts||[]).includes(t.id)));
  const fixedContext=fixedEmployee?`<p class="sf-auto-row-context"><b>${esc(label(person))}</b> · ${esc(new Date(date+'T12:00:00').toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'}))}</p>`:'';
  if(!target&&employee){const saved=base().filter(a=>same(a.employeeId,employee)&&a.date===date).at(-1);if(saved){openSaved(saved.id);return;}}
  const back=document.createElement('div');back.className='sf-auto-confirm-back';back.innerHTML=`<section class="sf-auto-confirm sf-auto-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="sfPreviewEditTitle"><div class="eyebrow">VORPLANUNG BEARBEITEN</div><h2 id="sfPreviewEditTitle">${target?'Dienst ändern':fixedEmployee?'Dienst auswählen':staffing?'Offene Stelle besetzen':'Dienst hinzufügen'}</h2><p>Änderungen bleiben in der Vorschau, bis du sie als Entwurf übernimmst.</p>${fixedContext}<form id="sfPreviewEditForm"><div class="sf-auto-edit-grid">${fixedEmployee?`<input id="sfPreviewFrom" type="hidden" value="${esc(date)}"><input id="sfPreviewTo" type="hidden" value="${esc(date)}">`:`<label>Von<input id="sfPreviewFrom" type="date" min="${dates[0]}" max="${dates.at(-1)}" value="${esc(date)}" required></label><label>Bis<input id="sfPreviewTo" type="date" min="${dates[0]}" max="${dates.at(-1)}" value="${esc(date)}" required></label>`}<label>${fixedEmployee?'Dienst':'Schicht'}<select id="sfPreviewShift" ${types.length?'':'disabled'}>${types.length?'':'<option value="">Keine Schichtfreigabe vorhanden</option>'}${group?`<option value="${groupValue}" selected>${esc(group.label+' · passende Schicht je Mitarbeiter')}</option>`:''}${types.map(t=>`<option value="${esc(t.id)}" ${!group&&t.id===type?'selected':''}>${esc(t.id+' · '+t.start+'–'+t.end)}</option>`).join('')}</select></label>${target?`<label>Beginn<input id="sfPreviewStart" type="time" required value="${esc(target.start||typeById(type)?.start)}"></label><label>Ende<input id="sfPreviewEnd" type="time" required value="${esc(target.end||typeById(type)?.end)}"></label>`:''}${staffing?'<label>Mitarbeiter suchen<input id="sfPreviewSearch" type="search" placeholder="Name oder Personalnummer" autocomplete="off"></label>':''}${fixedEmployee?`<input id="sfPreviewEmployee" type="hidden" value="${esc(employee)}">`:'<label>Mitarbeiter<select id="sfPreviewEmployee" required></select></label>'}</div>${staffing?'<p id="sfPreviewCandidatesStatus" class="sf-auto-draft-note" role="status"></p><details id="sfPreviewUnavailable" class="sf-auto-unavailable" hidden><summary></summary><ul></ul></details>':''}<p id="sfPreviewRhythmNote" class="sf-auto-draft-note" role="status"></p><p class="sf-auto-edit-error" id="sfPreviewEditError" role="status"></p>${fixedEmployee?'':'<p class="sf-auto-draft-note">Für einen Arbeitsblock Von/Bis wählen. Rhythmus-Frei kann bewusst übersteuert werden. Abwesenheiten und Stundenlimits werden weiterhin geprüft.</p>'}<footer>${target?'<button type="button" class="ghost" data-remove>Nur diesen Dienst entfernen</button>':''}<button type="button" class="ghost" data-cancel>Abbrechen</button><button type="submit" class="primary">In Vorplanung übernehmen</button></footer></form></section>`;
  document.body.appendChild(back);dialog=back;
  const close=()=>{document.removeEventListener('keydown',keydown);back.remove();if(dialog===back)dialog=null;if(focused?.isConnected)focused.focus();else $('sfAutoPreviewTools')?.querySelector('[data-add]')?.focus();};
  const evaluate=e=>{
   const selected=$('sfPreviewShift').value,codes=group&&selected===groupValue?types.map(t=>t.id):[selected],remaining=autoPlanPreview.filter(a=>a!==target),selectedDates=fixedEmployee?[date]:range($('sfPreviewFrom').value,$('sfPreviewTo').value);let failure;
   for(const code of codes){
    const t=typeById(code);if(!t||t.active===false)continue;
    if(group&&selectedDates.some(date=>!window.SFShiftModels.coverageInfo(date,code)?.alternatives.includes(code))){failure??={error:'Diese Schicht ist an den gewählten Tagen keine aktive Schichtalternative.'};continue;}
    const coverage=window.SFSolidPlanningCore?.otRoster(policy())&&['OT1','OT2','OT3'].includes(t.id)?{key:'OT-DAY',label:'Feste OT-Tagdienstgruppe'}:window.SFShiftModels?.coverageGroup?.(t.id);
    const add=selectedDates.map((date,i)=>({id:'manual-preview-'+Date.now()+'-'+i+'-'+Math.random(),employeeId:e.id,date,type:t.id,start:target?$('sfPreviewStart').value:t.start,end:target?$('sfPreviewEnd').value:t.end,resource:date+'|'+(coverage?.key||t.id),coverageGroup:coverage?.key,coverageLabel:coverage?.label,reason:'Von dir in der Vorplanung angepasst'}));
    const ids=new Set(add.map(a=>a.id)),rows=normalize([...remaining,...add].map(a=>({...a}))),changed=rows.filter(a=>ids.has(a.id)||JSON.stringify(a)!==JSON.stringify(remaining.find(b=>b.id===a.id)));
    for(const a of changed)if(ids.has(a.id)){const override=window.SFManualRhythm?.previewOverride(a);if(override)a.rhythmOverride=override;}
    const error=check(rows,changed)[0]||'',result={add:rows.filter(a=>ids.has(a.id)),error,code:t.id};
    if(!error)return result;if(!failure||(e.shifts||[]).includes(t.id))failure=result;
   }
   return failure||{error:'Bitte eine aktive Schicht auswählen.'};
  };
  const rhythmNote=e=>{let result;try{result=e&&evaluate(e);}catch{}$('sfPreviewRhythmNote').textContent=result?.add?.some(a=>a.rhythmOverride)?'Rhythmusabweichung: Mit „In Vorplanung übernehmen“ setzt du diesen Dienst bewusst auch an einem laut Rhythmus freien Tag oder abweichend von der vorgesehenen Schicht. Die Ausnahme wird dokumentiert.':'';};
  const candidates=()=>{rhythmNote(employees.find(e=>same(e.id,fixedEmployee?employee:$('sfPreviewEmployee').value||employee)));if(fixedEmployee){let error='';try{const e=employees.find(e=>same(e.id,employee)&&e.status==='active'&&!e.deletedAt);error=!e?'Dieser Mitarbeiter ist nicht mehr verfügbar.':!types.length?'Für diesen Mitarbeiter ist keine aktive Schicht freigegeben.':evaluate(e).error;}catch(x){error=x.message;}$('sfPreviewEditError').textContent=error||'';back.querySelector('[type=submit]').disabled=!!error;return;}const select=$('sfPreviewEmployee'),chosen=select.value||employee,query=($('sfPreviewSearch')?.value||'').trim().toLocaleLowerCase('de'),unavailable=[];let available=0;select.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent='Mitarbeiter auswählen';select.appendChild(empty);
   for(const e of employees.filter(e=>e.status==='active'&&!e.deletedAt).sort((a,b)=>label(a).localeCompare(label(b),'de',{numeric:true}))){let result;try{result=evaluate(e);}catch(x){result={error:x.message};}
    const error=result.error,name=label(e);if(staffing&&error){unavailable.push({name,error});continue;}if(query&&!query.split(/\s+/).every(part=>(name+' '+(e.first||'')+' '+(e.last||'')).toLocaleLowerCase('de').includes(part)))continue;
    const opt=document.createElement('option');opt.value=e.id;opt.disabled=!!error;opt.textContent=name+(error?' — '+error.split(': ').at(-1):group?' · '+result.code:'');opt.title=error;select.appendChild(opt);if(!error)available++;
   }
   const chosenOption=[...select.options].find(o=>o.value&&same(o.value,chosen)&&!o.disabled);if(chosenOption)select.value=chosenOption.value;else select.value='';
   $('sfPreviewEditError').textContent=chosen&&!chosenOption&&!query?'Die bisherige Auswahl ist hier nicht zulässig. Bitte einen verfügbaren Mitarbeiter auswählen.':'';
   if(staffing){$('sfPreviewCandidatesStatus').textContent=available?available+' passende Mitarbeiter zur Auswahl.':query?'Keine passenden Mitarbeiter für diese Suche.':'Für diesen Dienst ist aktuell kein Mitarbeiter regelkonform einsetzbar. Gründe stehen unter „Nicht einsetzbar“. Zeitraum oder Schicht können angepasst werden.';const details=$('sfPreviewUnavailable');details.hidden=!unavailable.length;details.querySelector('summary').textContent='Nicht einsetzbar ('+unavailable.length+')';details.querySelector('ul').replaceChildren(...unavailable.map(({name,error})=>{const li=document.createElement('li');li.textContent=name+' — '+(error.includes(': ')?error.slice(error.indexOf(': ')+2):error);return li;}));back.querySelector('[type=submit]').disabled=!available;}
  };
  back.querySelector('[data-cancel]').onclick=close;back.querySelector('[data-remove]')?.addEventListener('click',()=>{if(key()!==signature)return $('sfPreviewEditError').textContent='Die Vorplanung wurde geändert. Bitte erneut öffnen.';const i=autoPlanPreview.indexOf(target);close();remove(i);});
  for(const id of ['sfPreviewFrom','sfPreviewTo','sfPreviewShift','sfPreviewStart','sfPreviewEnd'])$(id)?.addEventListener('change',()=>{if(id==='sfPreviewShift'&&target){const t=typeById($('sfPreviewShift').value);if(t){$('sfPreviewStart').value=t.start;$('sfPreviewEnd').value=t.end;}}if(id==='sfPreviewFrom'&&$('sfPreviewTo').value<$('sfPreviewFrom').value)$('sfPreviewTo').value=$('sfPreviewFrom').value;candidates();});
  $('sfPreviewEditForm').onsubmit=event=>{event.preventDefault();try{if(window.SFBackend?.companyId!==company||key()!==signature)throw Error('Die Planungsdaten wurden geändert. Bitte den Dialog erneut öffnen.');const e=employees.find(e=>same(e.id,fixedEmployee?employee:$('sfPreviewEmployee').value));if(!e)throw Error('Bitte einen verfügbaren Mitarbeiter auswählen.');const result=evaluate(e);if(result.error)throw Error(result.error);const add=result.add;commit([...autoPlanPreview.filter(a=>a!==target),...add].sort((a,b)=>a.date.localeCompare(b.date)),add);close();}catch(e){$('sfPreviewEditError').textContent=e.message;}};
  const keydown=event=>{if(event.key==='Escape'){event.preventDefault();close();}else if(event.key==='Tab'){const focusable=[...back.querySelectorAll('button,input:not([type=hidden]),select')].filter(n=>!n.disabled),first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}};
  back.onclick=event=>{if(event.target===back)close();};document.addEventListener('keydown',keydown);$('sfPreviewSearch')?.addEventListener('input',candidates);$('sfPreviewEmployee').addEventListener('change',()=>rhythmNote(employees.find(e=>same(e.id,$('sfPreviewEmployee').value))));candidates();(fixedEmployee?$('sfPreviewShift').disabled?back.querySelector('[data-cancel]'):$('sfPreviewShift'):staffing?$('sfPreviewSearch'):$('sfPreviewFrom')).focus();
 }
 function decorate(){
  contextChanged();const host=$('autoStaircase');if(!host)return;
  let tools=$('sfAutoPreviewTools');if(!tools){tools=document.createElement('div');tools.id='sfAutoPreviewTools';tools.className='sf-auto-preview-tools';host.before(tools);}
  tools.hidden=!editable();if(!editable()){host.querySelectorAll('.sf-auto-edit-cell,.sf-auto-staffing-add').forEach(button=>{if(button.classList.contains('sf-auto-staffing-add'))button.querySelector('span')?.remove();button.replaceWith(...button.childNodes);});if(available()&&typeof window.editAssignment==='function')decorateEmployeeCells(host,true);return;}
  const issues=reviewIssues();tools.innerHTML=`<div><b>Vorplanung bearbeiten</b><p>Mitarbeiterzelle anklicken: Dienst für diesen Mitarbeiter und Tag auswählen, ändern oder entfernen. Orange IST/SOLL-Stelle anklicken: passende Mitarbeiter auswählen. Vorschlagsänderungen werden erst mit der Übernahme als Entwurf gespeichert. Bereits gespeicherte Dienste öffnen die normale Bearbeitung.</p></div><div class="sf-auto-edit-actions"><button type="button" class="primary" data-add>Dienst hinzufügen</button><button type="button" class="ghost" data-undo ${history.length?'':'disabled'}>Rückgängig</button></div>${issues.length?`<div class="sf-auto-edit-review" role="status"><b>Vor der Übernahme korrigieren</b><p>${issues.slice(0,5).map(esc).join('<br>')}${issues.length>5?'<br>Weitere '+(issues.length-5)+' Konflikte.':''}</p></div>`:''}`;
  tools.querySelector('[data-add]').onclick=()=>open();tools.querySelector('[data-undo]').onclick=undo;
  if(issues.length&&$('applyAutoPlanBtn'))$('applyAutoPlanBtn').disabled=true;
  decorateEmployeeCells(host);
  const dates=autoPlanningDates(),shown=dates.filter(d=>d.startsWith(host.querySelector('.sf-auto-preview-nav select')?.value||dates[0]?.slice(0,7)));
  for(const row of host.querySelectorAll('.sf-auto-staffing tr[data-staffing-shift],.sf-auto-staffing tr[data-staffing-group]')){
   const group=row.dataset.staffingGroup,type=row.dataset.staffingShift||TYPES.find(t=>window.SFShiftModels?.coverageGroup?.(t.id)?.key===group)?.id;if(!type)continue;
   [...row.querySelectorAll('td')].forEach((cell,i)=>{const date=shown[i];if(!date||!cell.classList.contains('is-short')||cell.querySelector('button'))return;const button=document.createElement('button');button.type='button';button.className='sf-auto-staffing-add';button.innerHTML=cell.innerHTML+'<span>+ Besetzen</span>';button.title=cell.title+' · Mitarbeiter auswählen';button.setAttribute('aria-label',date+' · '+(group||type)+' · offene Stelle besetzen');button.onclick=()=>open({date,type,group,staffing:true});cell.replaceChildren(button);});
  }
  for(const row of document.querySelectorAll('#autoSuggestions .sf-auto-suggestion-row')){if(row.querySelector('[data-preview-edit]'))continue;const removeButton=row.querySelector('button'),index=Number(removeButton?.getAttribute('onclick')?.match(/\((\d+)\)/)?.[1]);if(!Number.isInteger(index)||!autoPlanPreview[index])continue;const button=document.createElement('button');button.type='button';button.className='ghost';button.dataset.previewEdit='1';button.textContent='Ändern';button.onclick=()=>open({id:autoPlanPreview[index]?.id});row.appendChild(button);removeButton.title='Nur diesen Dienst entfernen';}
 }
 const render=window.SFAutoPlanWorkspace.render;window.SFAutoPlanWorkspace.render=function(){const value=render.apply(this,arguments);decorate();return value;};
 const confirm=window.SFAutoPlanWorkspace.confirmApply;window.SFAutoPlanWorkspace.confirmApply=function(){const issues=reviewIssues();if(issues.length){showSaveToast('Vorplanung unvollständig',issues[0]);return Promise.resolve(false);}return confirm.apply(this,arguments);};
 window.removeAutoSuggestion=index=>remove(index);
 window.SFAutoPlanPreviewEditor={open,openSaved,remove,undo,check,reviewIssues,decorate,commit};
 document.addEventListener('toggle',event=>{if(event.target.matches?.('#autoSuggestions details[data-auto-day]')&&event.target.open)decorate();},true);
})();
