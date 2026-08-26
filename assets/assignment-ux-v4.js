// ShiftPilot Schichtzuweisung UX V4
(function(){
  const pad=n=>String(n).padStart(2,'0');
  const esc=s=>String(s??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));

  function shiftInterval(date,start,end){
    const [sh,sm]=String(start||'00:00').split(':').map(Number);
    const [eh,em]=String(end||'00:00').split(':').map(Number);
    const s=new Date(`${date}T${pad(sh)}:${pad(sm)}:00`);
    const e=new Date(`${date}T${pad(eh)}:${pad(em)}:00`);
    if(e<=s)e.setDate(e.getDate()+1);
    return [s,e];
  }
  function overlap(a1,a2,b1,b2){return a1<b2&&b1<a2}
  function assignmentInterval(a){const t=typeof typeById==='function'?typeById(a.type):null;return shiftInterval(a.date,a.start||t?.start,a.end||t?.end)}
  function activeAbsence(a){return !a.status||a.status!=='Abgelehnt'}
  function absenceRange(a){const start=a.startDate||a.date,end=a.endDate||a.date||start;return [start,end]}
  function dateInRange(date,a){const [s,e]=absenceRange(a);return !!s&&date>=s&&date<=e}
  function absenceConflicts(a,shiftStart,shiftEnd){
    if(!activeAbsence(a))return false;
    const dates=[];for(let d=new Date(shiftStart);d<shiftEnd;d.setDate(d.getDate()+1))dates.push(d.toISOString().slice(0,10));
    if(!dates.some(d=>dateInRange(d,a)))return false;
    if(a.fullDay!==false)return true;
    const st=a.startTime||'00:00',en=a.endTime||'23:59';
    return dates.some(d=>{if(!dateInRange(d,a))return false;const [as,ae]=shiftInterval(d,st,en);return overlap(shiftStart,shiftEnd,as,ae)});
  }
  function conflictFor(emp,type,date,start,end,ignoreId=null){
    const t=typeById(type);if(!emp||!t)return {hard:['Ungültige Schicht oder Mitarbeiter.'],soft:[]};
    const hard=[],soft=[];
    if(emp.status!=='active')hard.push('Mitarbeiter ist inaktiv.');
    if(!(emp.shifts||[]).includes(type))hard.push(`Keine Freigabe für ${type}.`);
    const [ns,ne]=shiftInterval(date,start||t.start,end||t.end);
    const abs=(absences||[]).find(a=>a.employeeId===emp.id&&absenceConflicts(a,ns,ne));
    if(abs)hard.push(`Abwesenheit: ${abs.type||'Abwesend'}.`);
    const clash=(assignments||[]).find(a=>a.id!==ignoreId&&a.employeeId===emp.id&&overlap(ns,ne,...assignmentInterval(a)));
    if(clash){const ct=typeById(clash.type);hard.push(`Zeitüberschneidung mit ${clash.type} am ${new Date(clash.date+'T00:00:00').toLocaleDateString('de-DE')} (${clash.start||ct?.start}–${clash.end||ct?.end}).`)}
    const current=typeof plannedHoursForEmployee==='function'?plannedHoursForEmployee(emp.id):0;
    const hrs=(ne-ns)/36e5;
    if(Number(emp.weeklyHours)>0&&current+hrs>Number(emp.weeklyHours)+0.01)soft.push(`Wochen-SOLL würde auf ${(current+hrs).toFixed(1)} / ${Number(emp.weeklyHours).toFixed(1)} Std. steigen.`);
    const so=typeof getSoll==='function'?getSoll(date,type):0,is=typeof assignmentsFor==='function'?assignmentsFor(date,type).filter(a=>a.id!==ignoreId).length:0;
    if(so>0&&is>=so)soft.push(`SOLL-Stärke ${so} ist bereits erreicht.`);
    return {hard,soft};
  }
  window.spAssignmentConflict=conflictFor;

  function notice(title,text,kind='warn'){
    document.getElementById('spAssignNotice')?.remove();
    const n=document.createElement('div');n.id='spAssignNotice';n.className=`sp-assign-notice ${kind}`;
    n.innerHTML=`<b>${esc(title)}</b><span>${esc(text)}</span>`;document.body.appendChild(n);
    requestAnimationFrame(()=>n.classList.add('show'));setTimeout(()=>{n.classList.remove('show');setTimeout(()=>n.remove(),220)},3600);
  }
  function closeModal(){document.getElementById('spAssignModal')?.remove()}
  window.spCloseAssignModal=closeModal;

  function saveAssignment(emp,type,date,start,end,extra={}){
    const t=typeById(type);const check=conflictFor(emp,type,date,start,end,extra.ignoreId||null);
    if(check.hard.length){notice('Zuweisung nicht möglich',check.hard.join(' '),'danger');return false}
    if(extra.ignoreId){
      const a=assignments.find(x=>x.id===extra.ignoreId);if(!a)return false;
      Object.assign(a,{employeeId:emp.id,type,date,start,end,pause:Number(extra.pause||0),note:extra.note||''});
    }else assignments.push({id:'as'+Date.now()+Math.random().toString(36).slice(2,6),date,type,employeeId:emp.id,start,end,pause:Number(extra.pause||0),note:extra.note||''});
    saveAll();renderCalendar();renderPlanEmployeePool();if(typeof renderOverview==='function')renderOverview();
    const title=extra.ignoreId?'Schicht aktualisiert':'Schicht zugewiesen';
    const msg=`${emp.first} ${emp.last} · ${type} · ${new Date(date+'T00:00:00').toLocaleDateString('de-DE')} · ${start}–${end}${check.soft.length?' · Hinweis: '+check.soft.join(' '):''}`;
    if(typeof showSaveToast==='function')showSaveToast(title,msg);else notice(title,msg,'good');
    return true;
  }

  window.assignEmployeeByDrop=function(employeeId,type,date){
    const emp=employees.find(e=>e.id===employeeId),t=typeById(type);if(!emp||!t)return;
    saveAssignment(emp,type,date,t.start,t.end);
  };
  window.isEligible=function(emp,type,date){const t=typeById(type);return !!t&&conflictFor(emp,type,date,t.start,t.end).hard.length===0};
  window.absent=function(employeeId,date){const s=new Date(`${date}T00:00:00`),e=new Date(`${date}T23:59:59`);return (absences||[]).some(a=>a.employeeId===employeeId&&absenceConflicts(a,s,e))};

  function employeeRows(type,date,start,end,query=''){
    const q=query.trim().toLowerCase();
    return employees.filter(e=>e.status==='active'&&(`${e.first} ${e.last} ${e.personnelNo||''} ${e.role||''}`).toLowerCase().includes(q)).map(e=>{
      const c=conflictFor(e,type,date,start,end);const blocked=c.hard.length>0;
      return `<button type="button" class="sp-assign-person ${blocked?'blocked':''}" data-emp="${esc(e.id)}" ${blocked?'disabled':''}><span class="avatar">${esc((e.first?.[0]||'')+(e.last?.[0]||''))}</span><span class="sp-assign-person-copy"><b>${esc(e.first+' '+e.last)}</b><small>${esc((e.personnelNo||'')+(e.role?' · '+e.role:''))}</small><em>${blocked?esc(c.hard.join(' ')):(c.soft.length?'⚠ '+esc(c.soft.join(' ')):'✓ Verfügbar und freigegeben')}</em></span></button>`;
    }).join('')||'<div class="sp-assign-empty">Keine passenden Mitarbeiter gefunden.</div>';
  }

  window.openAssign=function(type,date){
    const t=typeById(type);if(!t)return;closeModal();
    const m=document.createElement('div');m.id='spAssignModal';m.className='sp-assign-backdrop';
    m.innerHTML=`<div class="sp-assign-modal" role="dialog" aria-modal="true" aria-labelledby="spAssignTitle"><div class="sp-assign-head"><div><div class="eyebrow">SCHICHTZUWEISUNG</div><h2 id="spAssignTitle">${esc(type)} besetzen</h2><p>${new Date(date+'T00:00:00').toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'})} · ${esc(t.start)}–${esc(t.end)}</p></div><button type="button" class="sp-assign-close" onclick="spCloseAssignModal()">✕</button></div><div class="sp-assign-body"><label class="sp-assign-label">Mitarbeiter suchen</label><input id="spAssignSearch" class="sp-assign-search" placeholder="Vorname, Nachname oder Personalnummer ..." autocomplete="off"><div class="sp-assign-help">Nicht verfügbare Mitarbeiter werden mit dem konkreten Grund angezeigt.</div><div id="spAssignPeople" class="sp-assign-people"></div></div><div class="sp-assign-foot"><button type="button" class="ghost" onclick="spCloseAssignModal()">Abbrechen</button></div></div>`;
    document.body.appendChild(m);const search=m.querySelector('#spAssignSearch'),people=m.querySelector('#spAssignPeople');
    const render=()=>{people.innerHTML=employeeRows(type,date,t.start,t.end,search.value);people.querySelectorAll('.sp-assign-person:not(.blocked)').forEach(b=>b.onclick=()=>{const emp=employees.find(e=>e.id===b.dataset.emp);if(emp&&saveAssignment(emp,type,date,t.start,t.end))closeModal()})};
    search.addEventListener('input',render);render();search.focus();
  };

  window.editAssignment=function(id){
    const a=assignments.find(x=>x.id===id);if(!a)return;const t=typeById(a.type),emp=employees.find(e=>e.id===a.employeeId);if(!t||!emp)return;closeModal();
    const types=TYPES.map(x=>`<option value="${esc(x.id)}" ${x.id===a.type?'selected':''}>${esc(x.id)}</option>`).join('');
    const emps=employees.filter(e=>e.status==='active'||e.id===emp.id).map(e=>`<option value="${esc(e.id)}" ${e.id===emp.id?'selected':''}>${esc(e.first+' '+e.last+(e.personnelNo?' · '+e.personnelNo:''))}</option>`).join('');
    const m=document.createElement('div');m.id='spAssignModal';m.className='sp-assign-backdrop';
    m.innerHTML=`<div class="sp-assign-modal sp-assign-edit" role="dialog" aria-modal="true"><div class="sp-assign-head"><div><div class="eyebrow">SCHICHT BEARBEITEN</div><h2>${esc(a.type)} · ${esc(emp.first+' '+emp.last)}</h2><p>Zeit, Mitarbeiter oder Schicht nachträglich anpassen.</p></div><button class="sp-assign-close" onclick="spCloseAssignModal()">✕</button></div><div class="sp-assign-body"><div class="sp-edit-grid"><label>Mitarbeiter<select id="spEditEmp">${emps}</select></label><label>Schicht<select id="spEditType">${types}</select></label><label>Datum<input id="spEditDate" type="date" value="${esc(a.date)}"></label><label>Beginn<input id="spEditStart" type="time" value="${esc(a.start||t.start)}"></label><label>Ende<input id="spEditEnd" type="time" value="${esc(a.end||t.end)}"></label><label>Pause (Min.)<input id="spEditPause" type="number" min="0" step="5" value="${Number(a.pause||0)}"></label></div><label class="sp-edit-note">Bemerkung<textarea id="spEditNote" rows="3" placeholder="Optionaler Hinweis zur Schicht ...">${esc(a.note||'')}</textarea></label><div id="spEditCheck" class="sp-edit-check"></div></div><div class="sp-assign-foot"><button type="button" class="danger" id="spDeleteAssign">Schicht entfernen</button><span></span><button type="button" class="ghost" onclick="spCloseAssignModal()">Abbrechen</button><button type="button" class="primary" id="spSaveAssign">Änderungen speichern</button></div></div>`;
    document.body.appendChild(m);const val=id=>m.querySelector('#'+id).value;
    const validate=()=>{const e=employees.find(x=>x.id===val('spEditEmp')),type=val('spEditType'),tt=typeById(type),date=val('spEditDate'),start=val('spEditStart')||tt?.start,end=val('spEditEnd')||tt?.end,c=e&&tt?conflictFor(e,type,date,start,end,a.id):{hard:['Ungültige Eingabe'],soft:[]};const box=m.querySelector('#spEditCheck');box.className='sp-edit-check '+(c.hard.length?'bad':c.soft.length?'warn':'good');box.innerHTML=c.hard.length?'⚠ '+esc(c.hard.join(' ')):c.soft.length?'⚠ '+esc(c.soft.join(' ')):'✓ Keine Konflikte erkannt.';return {e,type,date,start,end,c}};
    ['spEditEmp','spEditType','spEditDate','spEditStart','spEditEnd'].forEach(x=>m.querySelector('#'+x).addEventListener('change',validate));validate();
    m.querySelector('#spSaveAssign').onclick=()=>{const v=validate();if(!v.e||v.c.hard.length)return;const ok=saveAssignment(v.e,v.type,v.date,v.start,v.end,{ignoreId:a.id,pause:val('spEditPause'),note:val('spEditNote')});if(ok)closeModal()};
    m.querySelector('#spDeleteAssign').onclick=()=>{assignments=assignments.filter(x=>x.id!==a.id);saveAll();renderCalendar();renderPlanEmployeePool();if(typeof renderOverview==='function')renderOverview();closeModal();showSaveToast('Schicht entfernt',`${emp.first} ${emp.last} wurde aus ${a.type} entfernt.`)};
  };

  const baseRenderAssignments=window.renderAssignments;
  window.renderAssignments=function(date){const html=baseRenderAssignments(date);const wrap=document.createElement('div');wrap.innerHTML=html;wrap.querySelectorAll('.assignment').forEach(el=>{const onclick=el.getAttribute('onclick')||'';const id=(onclick.match(/editAssignment\('([^']+)'\)/)||[])[1];const a=id&&assignments.find(x=>x.id===id);if(a){const bits=[];if(Number(a.pause)>0)bits.push(`Pause ${a.pause} Min.`);if(a.note)bits.push(a.note);if(bits.length)el.setAttribute('title',bits.join(' · '));el.setAttribute('tabindex','0');el.setAttribute('role','button');el.setAttribute('aria-label',el.textContent.trim()+' – bearbeiten')}});return wrap.innerHTML};

  window.renderSoll=function(ds){let html='<div></div>';for(const d of ds){const date=iso(d);html+=`<div class="soll-day"><small>SOLL / IST · klicken oder Mitarbeiter ablegen</small><div class="pillline">${TYPES.map(t=>{const so=getSoll(date,t.id),is=assignmentsFor(date,t.id).length,miss=Math.max(0,so-is);return `<button type="button" class="pill drop-target ${is>=so?'good':'warn'}" data-date="${date}" data-type="${t.id}" title="${t.id} am ${date} besetzen">${t.id}: SOLL ${so} · IST ${is}${miss?' · FEHLT '+miss:' · OK'}</button>`}).join('')}</div></div>`}document.getElementById('sollList').innerHTML=html;document.querySelectorAll('.pill.drop-target').forEach(p=>{p.addEventListener('click',()=>openAssign(p.dataset.type,p.dataset.date));p.addEventListener('dragover',e=>{e.preventDefault();p.classList.add('drop-ready')});p.addEventListener('dragleave',()=>p.classList.remove('drop-ready'));p.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();p.classList.remove('drop-ready');const data=e.dataTransfer.getData('text/plain');if(data.startsWith('employee:'))assignEmployeeByDrop(data.slice(9),p.dataset.type,p.dataset.date)})})};

  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('spAssignModal'))closeModal()});
})();
