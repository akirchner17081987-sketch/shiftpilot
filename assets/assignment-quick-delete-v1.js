// SchichtFunk – Schnelllöschung geplanter Schichten
(function(){
  if(typeof window==='undefined') return;

  function refresh(){
    if(typeof saveAll==='function') saveAll();
    if(typeof renderCalendar==='function') renderCalendar();
    if(typeof renderPlanEmployeePool==='function') renderPlanEmployeePool();
    if(typeof renderOverview==='function') renderOverview();
    if(typeof updateStats==='function') updateStats();
  }

  window.spQuickDeleteAssignment=function(id,ev){
    if(ev){ev.preventDefault();ev.stopPropagation();}
    const a=(assignments||[]).find(x=>x.id===id);if(!a)return false;
    const emp=(employees||[]).find(e=>e.id===a.employeeId);
    const t=typeof typeById==='function'?typeById(a.type):null;
    const start=a.start||t?.start||'',end=a.end||t?.end||'';
    const dateLabel=new Date(a.date+'T00:00:00').toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});
    const name=emp?`${emp.first} ${emp.last}`:'Mitarbeiter';
    const ok=confirm(`Schicht wirklich löschen?\n\n${a.type} · ${name}\n${dateLabel} · ${start}–${end}`);
    if(!ok)return false;
    assignments=assignments.filter(x=>x.id!==id);
    refresh();
    if(typeof showSaveToast==='function')showSaveToast('Schicht gelöscht',`${a.type} · ${name} wurde aus dem Dienstplan entfernt.`);
    return false;
  };

  const previous=window.renderAssignments;
  if(typeof previous!=='function'||previous.__quickDeleteV1)return;
  const wrapped=function(date){
    const html=previous(date);
    const box=document.createElement('div');box.innerHTML=html;
    box.querySelectorAll('.assignment').forEach(el=>{
      const raw=el.getAttribute('onclick')||'';
      const m=raw.match(/editAssignment\('([^']+)'\)/);
      const id=m&&m[1];if(!id||el.querySelector('.sp-assignment-x'))return;
      const x=document.createElement('button');
      x.type='button';x.className='sp-assignment-x';x.textContent='×';
      x.title='Schicht schnell löschen';x.setAttribute('aria-label','Schicht löschen');
      x.setAttribute('onclick',`return spQuickDeleteAssignment('${id}',event)`);
      el.appendChild(x);
    });
    return box.innerHTML;
  };
  wrapped.__quickDeleteV1=true;
  window.renderAssignments=wrapped;
})();
