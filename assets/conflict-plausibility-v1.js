// SchichtFunk – Konflikt- und Plausibilitätsprüfung V1
(function(){
  if(typeof window==='undefined')return;
  const pad=n=>String(n).padStart(2,'0');
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const DAY=86400000;

  function parseDate(v){
    if(v instanceof Date)return new Date(v.getFullYear(),v.getMonth(),v.getDate());
    const m=String(v||'').slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return null;
    return new Date(+m[1],+m[2]-1,+m[3]);
  }
  function mins(t){const m=String(t||'').match(/^(\d{1,2}):(\d{2})$/);return m?+m[1]*60 + +m[2]:null;}
  function interval(date,start,end){
    const d=parseDate(date),s=mins(start),e=mins(end);if(!d||s===null||e===null||s===e)return null;
    const base=d.getTime();return {start:base+s*60000,end:base+e*60000+(e<=s?DAY:0)};
  }
  function shiftInterval(a){const t=typeof typeById==='function'?typeById(a.type):null;return interval(a.date,a.start||t?.start,a.end||t?.end);}
  function overlap(a,b){return !!a&&!!b&&a.start<b.end&&b.start<a.end;}
  function fmtDate(d){return new Date(d+'T00:00:00').toLocaleDateString('de-DE');}
  function fmtDateTime(ms){return new Date(ms).toLocaleString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}

  function absenceInterval(a){
    if(!a || a.status==='Abgelehnt')return null;
    const sd=parseDate(a.startDate||a.date),ed=parseDate(a.endDate||a.date||a.startDate);if(!sd||!ed)return null;
    if(a.fullDay!==false)return {start:sd.getTime(),end:ed.getTime()+DAY};
    const st=mins(a.startTime),en=mins(a.endTime);
    if(st===null||en===null){
      // Bei Teilzeit-Abwesenheit ohne maschinenlesbare Uhrzeiten vorsichtshalber ganztägig behandeln.
      return {start:sd.getTime(),end:ed.getTime()+DAY};
    }
    const start=sd.getTime()+st*60000;
    const end=ed.getTime()+en*60000+(ed.getTime()===sd.getTime()&&en<=st?DAY:0);
    return {start,end};
  }

  function roleAllows(emp,type){
    if(String(type).toLowerCase()!=='teamleiter')return true;
    const r=String(emp?.role||'').toLowerCase();
    return r.includes('teamleiter')||r.includes('schichtleiter');
  }
  function otAllowed(date){
    if(window.SchichtFunkScheduleCore?.isOTDay)return !!window.SchichtFunkScheduleCore.isOTDay(date);
    if(typeof window.shiftPilotOtApplies==='function')return !!window.shiftPilotOtApplies(date);
    const d=parseDate(date);return !!d&&(d.getDay()===0||d.getDay()===6);
  }
  function mondayOf(date){const d=parseDate(date);if(!d)return null;const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);return d;}
  function weekHours(employeeId,date,ignoreId){
    const m=mondayOf(date);if(!m)return 0;const e=new Date(m);e.setDate(e.getDate()+7);
    return (assignments||[]).filter(a=>a.employeeId===employeeId&&a.id!==ignoreId).reduce((sum,a)=>{
      const iv=shiftInterval(a);if(!iv||iv.start<m.getTime()||iv.start>=e.getTime())return sum;
      return sum+(iv.end-iv.start)/36e5;
    },0);
  }
  function nearestRest(employeeId,proposed,ignoreId){
    let min=Infinity,neighbor=null;
    (assignments||[]).filter(a=>a.employeeId===employeeId&&a.id!==ignoreId).forEach(a=>{
      const iv=shiftInterval(a);if(!iv||overlap(iv,proposed))return;
      const rest=iv.end<=proposed.start?(proposed.start-iv.end)/36e5:proposed.end<=iv.start?(iv.start-proposed.end)/36e5:Infinity;
      if(rest<min){min=rest;neighbor=a;}
    });
    return {hours:min,assignment:neighbor};
  }

  function check(emp,type,date,start,end,ignoreId=null){
    const hard=[],soft=[];const t=typeof typeById==='function'?typeById(type):null;
    if(!emp||!t)return {hard:['Mitarbeiter oder Schichtvorlage wurde nicht gefunden.'],soft:[]};
    const proposed=interval(date,start||t.start,end||t.end);
    if(!proposed)return {hard:['Beginn und Ende müssen gültig und unterschiedlich sein.'],soft:[]};
    if(emp.status!=='active')hard.push('Mitarbeiter ist inaktiv.');
    if(!(emp.shifts||[]).includes(type))hard.push(`Keine Freigabe für ${type}.`);
    if(!roleAllows(emp,type))hard.push('Teamleiter-Schicht erfordert die Position Teamleiter oder Schichtleiter.');
    if(String(type).toUpperCase()==='OT'&&!otAllowed(date))hard.push('OT ist nur samstags, sonntags oder an gesetzlichen Feiertagen zulässig.');

    const absence=(absences||[]).find(a=>a.employeeId===emp.id&&overlap(proposed,absenceInterval(a)));
    if(absence)hard.push(`Abwesenheit (${absence.type||'Abwesend'}) überschneidet sich mit dieser Schicht.`);

    const clash=(assignments||[]).find(a=>a.employeeId===emp.id&&a.id!==ignoreId&&overlap(proposed,shiftInterval(a)));
    if(clash){const ct=typeById(clash.type);hard.push(`Zeitüberschneidung mit ${clash.type} am ${fmtDate(clash.date)} (${clash.start||ct?.start}–${clash.end||ct?.end}).`);}

    const rest=nearestRest(emp.id,proposed,ignoreId);
    if(rest.assignment&&rest.hours<11){
      const rt=typeById(rest.assignment.type);
      soft.push(`Nur ${rest.hours.toFixed(1)} Std. Ruhezeit zur Schicht ${rest.assignment.type} (${fmtDate(rest.assignment.date)} ${rest.assignment.start||rt?.start}–${rest.assignment.end||rt?.end}).`);
    }

    const duration=(proposed.end-proposed.start)/36e5;
    if(duration>12)soft.push(`Schichtdauer beträgt ${duration.toFixed(1)} Std.`);

    const current=weekHours(emp.id,date,ignoreId),target=Number(emp.weeklyHours)||0;
    if(target&&current+duration>target+0.01)soft.push(`Wochen-SOLL würde auf ${(current+duration).toFixed(1)} / ${target.toFixed(1)} Std. steigen.`);

    const so=typeof getSoll==='function'?Number(getSoll(date,type)||0):0;
    const ist=typeof assignmentsFor==='function'?assignmentsFor(date,type).filter(a=>a.id!==ignoreId).length:0;
    if(so>0&&ist>=so)soft.push(`SOLL-Stärke ${so} ist bereits erreicht.`);
    return {hard,soft,proposed,duration};
  }
  window.spAssignmentConflict=check;

  function refresh(){
    if(typeof saveAll==='function')saveAll();
    if(typeof renderCalendar==='function')renderCalendar();
    if(typeof renderPlanEmployeePool==='function')renderPlanEmployeePool();
    if(typeof renderOverview==='function')renderOverview();
    if(typeof updateStats==='function')updateStats();
  }
  function toast(title,text){if(typeof showSaveToast==='function')showSaveToast(title,text);else alert(title+'\n'+text);}
  function save(emp,type,date,start,end,extra={}){
    const c=check(emp,type,date,start,end,extra.ignoreId||null);if(c.hard.length){alert('Zuweisung nicht möglich:\n\n'+c.hard.join('\n'));return false;}
    if(c.soft.length&&!confirm('Plausibilitätswarnung:\n\n'+c.soft.join('\n')+'\n\nTrotzdem speichern?'))return false;
    if(extra.ignoreId){const a=assignments.find(x=>x.id===extra.ignoreId);if(!a)return false;Object.assign(a,{employeeId:emp.id,type,date,start,end,pause:Number(extra.pause||0),note:extra.note||''});}
    else assignments.push({id:'as'+Date.now()+Math.random().toString(36).slice(2,6),employeeId:emp.id,type,date,start,end,pause:Number(extra.pause||0),note:extra.note||''});
    refresh();toast(extra.ignoreId?'Schicht aktualisiert':'Schicht zugewiesen',`${emp.first} ${emp.last} · ${type} · ${fmtDate(date)} · ${start}–${end}`);return true;
  }

  window.assignEmployeeByDrop=function(employeeId,type,date){
    const emp=employees.find(e=>e.id===employeeId),t=typeById(type);if(!emp||!t)return;
    save(emp,type,date,t.start,t.end);
  };
  window.isEligible=function(emp,type,date){const t=typeById(type);return !!t&&check(emp,type,date,t.start,t.end).hard.length===0;};
  window.absent=function(employeeId,date){
    const d=parseDate(date);if(!d)return false;const day={start:d.getTime(),end:d.getTime()+DAY};
    return (absences||[]).some(a=>a.employeeId===employeeId&&overlap(day,absenceInterval(a)));
  };

  function personRows(type,date,start,end,q=''){
    q=q.trim().toLowerCase();
    return employees.filter(e=>e.status==='active'&&(`${e.first} ${e.last} ${e.personnelNo||''} ${e.role||''}`).toLowerCase().includes(q)).map(e=>{
      const c=check(e,type,date,start,end),blocked=c.hard.length>0;
      const status=blocked?c.hard.join(' '):(c.soft.length?'⚠ '+c.soft.join(' '):'✓ Verfügbar und freigegeben');
      return `<button type="button" class="sp-assign-person ${blocked?'blocked':''}" data-emp="${esc(e.id)}" ${blocked?'disabled':''}><span class="avatar">${esc((e.first?.[0]||'')+(e.last?.[0]||''))}</span><span class="sp-assign-person-copy"><b>${esc(e.first+' '+e.last)}</b><small>${esc((e.personnelNo||'')+(e.role?' · '+e.role:''))}</small><em>${esc(status)}</em></span></button>`;
    }).join('')||'<div class="sp-assign-empty">Keine passenden Mitarbeiter gefunden.</div>';
  }
  function close(){document.getElementById('spAssignModal')?.remove();}
  window.spCloseAssignModal=close;

  window.openAssign=function(type,date){
    const t=typeById(type);if(!t)return;close();
    const m=document.createElement('div');m.id='spAssignModal';m.className='sp-assign-backdrop';
    m.innerHTML=`<div class="sp-assign-modal" role="dialog" aria-modal="true"><div class="sp-assign-head"><div><div class="eyebrow">SCHICHTZUWEISUNG</div><h2>${esc(type)} besetzen</h2><p>${esc(fmtDate(date))} · ${esc(t.start)}–${esc(t.end)}</p></div><button type="button" class="sp-assign-close" onclick="spCloseAssignModal()">✕</button></div><div class="sp-assign-body"><label class="sp-assign-label">Mitarbeiter suchen</label><input id="spAssignSearch" class="sp-assign-search" placeholder="Vorname, Nachname oder Personalnummer ..."><div class="sp-assign-help">Harte Konflikte blockieren. Plausibilitätswarnungen können bewusst bestätigt werden.</div><div id="spAssignPeople" class="sp-assign-people"></div></div><div class="sp-assign-foot"><button type="button" class="ghost" onclick="spCloseAssignModal()">Abbrechen</button></div></div>`;
    document.body.appendChild(m);const input=m.querySelector('#spAssignSearch'),people=m.querySelector('#spAssignPeople');
    const render=()=>{people.innerHTML=personRows(type,date,t.start,t.end,input.value);people.querySelectorAll('.sp-assign-person:not(.blocked)').forEach(b=>b.onclick=()=>{const emp=employees.find(e=>e.id===b.dataset.emp);if(emp&&save(emp,type,date,t.start,t.end))close();});};
    input.oninput=render;render();input.focus();
  };

  window.editAssignment=function(id){
    const a=assignments.find(x=>x.id===id);if(!a)return;const t=typeById(a.type),emp=employees.find(e=>e.id===a.employeeId);if(!t||!emp)return;close();
    const types=TYPES.map(x=>`<option value="${esc(x.id)}" ${x.id===a.type?'selected':''}>${esc(x.id)}</option>`).join('');
    const emps=employees.filter(e=>e.status==='active'||e.id===emp.id).map(e=>`<option value="${esc(e.id)}" ${e.id===emp.id?'selected':''}>${esc(e.first+' '+e.last+(e.personnelNo?' · '+e.personnelNo:''))}</option>`).join('');
    const m=document.createElement('div');m.id='spAssignModal';m.className='sp-assign-backdrop';
    m.innerHTML=`<div class="sp-assign-modal sp-assign-edit" role="dialog" aria-modal="true"><div class="sp-assign-head"><div><div class="eyebrow">SCHICHT BEARBEITEN</div><h2>${esc(a.type)} · ${esc(emp.first+' '+emp.last)}</h2><p>Änderungen werden erneut vollständig auf Konflikte geprüft.</p></div><button type="button" class="sp-assign-close" onclick="spCloseAssignModal()">✕</button></div><div class="sp-assign-body"><div class="sp-edit-grid"><label>Mitarbeiter<select id="spEditEmp">${emps}</select></label><label>Schicht<select id="spEditType">${types}</select></label><label>Datum<input id="spEditDate" type="date" value="${esc(a.date)}"></label><label>Beginn<input id="spEditStart" type="time" value="${esc(a.start||t.start)}"></label><label>Ende<input id="spEditEnd" type="time" value="${esc(a.end||t.end)}"></label><label>Pause (Min.)<input id="spEditPause" type="number" min="0" step="5" value="${Number(a.pause||0)}"></label></div><label class="sp-edit-note">Bemerkung<textarea id="spEditNote" rows="3">${esc(a.note||'')}</textarea></label><div id="spEditCheck" class="sp-edit-check"></div></div><div class="sp-assign-foot"><button type="button" class="danger sp-delete-assignment" id="spDeleteAssign">🗑 Schicht löschen</button><span></span><button type="button" class="ghost" onclick="spCloseAssignModal()">Abbrechen</button><button type="button" class="primary" id="spSaveAssign">Änderungen speichern</button></div></div>`;
    document.body.appendChild(m);const val=x=>m.querySelector('#'+x).value;
    const validate=()=>{const e=employees.find(x=>x.id===val('spEditEmp')),type=val('spEditType'),tt=typeById(type),date=val('spEditDate'),start=val('spEditStart')||tt?.start,end=val('spEditEnd')||tt?.end,c=e&&tt?check(e,type,date,start,end,a.id):{hard:['Ungültige Eingabe'],soft:[]};const box=m.querySelector('#spEditCheck');box.className='sp-edit-check '+(c.hard.length?'bad':c.soft.length?'warn':'good');box.innerHTML=c.hard.length?'⚠ '+esc(c.hard.join(' ')):c.soft.length?'⚠ '+esc(c.soft.join(' ')):'✓ Keine Konflikte erkannt.';return {e,type,date,start,end,c};};
    ['spEditEmp','spEditType','spEditDate','spEditStart','spEditEnd'].forEach(x=>m.querySelector('#'+x).onchange=validate);validate();
    m.querySelector('#spSaveAssign').onclick=()=>{const v=validate();if(!v.e||v.c.hard.length)return;if(save(v.e,v.type,v.date,v.start,v.end,{ignoreId:a.id,pause:val('spEditPause'),note:val('spEditNote')}))close();};
    m.querySelector('#spDeleteAssign').onclick=()=>{if(!confirm(`Schicht ${a.type} für ${emp.first} ${emp.last} wirklich löschen?`))return;assignments=assignments.filter(x=>x.id!==a.id);refresh();close();toast('Schicht gelöscht',`${a.type} · ${emp.first} ${emp.last}`);};
  };

  window.SchichtFunkConflictAudit={check,absenceInterval,shiftInterval,weekHours,otAllowed,roleAllows};
})();
