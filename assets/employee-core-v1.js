// ShiftPilot Mitarbeiter Core UX V1
(function(){
  const DAYS_SHORT=['Mo','Di','Mi','Do','Fr','Sa','So'];
  const allDays=[0,1,2,3,4,5,6];
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function employeeWeekAbsenceIds(){
    if(typeof currentWeekDates!=='function')return new Set();
    const dates=currentWeekDates().map(iso);
    return new Set((absences||[]).filter(a=>{
      const s=a.startDate||a.date,e=a.endDate||a.date||s;
      return dates.some(d=>s&&d>=s&&d<=e)&&a.status!=='Abgelehnt';
    }).map(a=>a.employeeId));
  }

  function ensureStats(){
    const view=document.getElementById('view-employees');
    const head=view?.querySelector('.page-head');
    if(!view||!head)return null;
    let stats=view.querySelector('.sp-employee-stats');
    if(!stats){
      stats=document.createElement('div');
      stats.className='sp-employee-stats';
      head.insertAdjacentElement('afterend',stats);
    }
    return stats;
  }

  function renderEmployeeStats(){
    const stats=ensureStats();if(!stats||!Array.isArray(employees))return;
    const active=employees.filter(e=>e.status==='active').length;
    const inactive=employees.length-active;
    const planned=new Set((assignments||[]).filter(a=>typeof currentWeekDates==='function'&&currentWeekDates().map(iso).includes(a.date)).map(a=>a.employeeId)).size;
    const absent=employeeWeekAbsenceIds().size;
    stats.innerHTML=`<div class="sp-employee-stat"><i>✓</i><div><small>Aktive Mitarbeiter</small><strong>${active}</strong></div></div><div class="sp-employee-stat"><i>○</i><div><small>Inaktiv</small><strong>${inactive}</strong></div></div><div class="sp-employee-stat"><i>▣</i><div><small>Diese Woche eingeplant</small><strong>${planned}</strong></div></div><div class="sp-employee-stat"><i>△</i><div><small>Diese Woche abwesend</small><strong>${absent}</strong></div></div>`;
  }

  function ensureAvailability(){
    const form=document.getElementById('employeeForm');
    if(!form)return;
    let wrap=form.querySelector('.sp-availability-wrap');
    if(!wrap){
      wrap=document.createElement('div');wrap.className='sp-availability-wrap';
      wrap.innerHTML=`<div class="sp-availability-head"><div><b>Regelmäßige Verfügbarkeit</b><small> · nutzbar für Auto-Planung und Vorschläge</small></div><button type="button" class="ghost" id="spAvailAll">Alle Tage</button></div><div class="sp-availability-days" id="spAvailabilityDays"></div>`;
      const note=document.getElementById('note')?.closest('label');
      if(note)form.insertBefore(wrap,note);else form.appendChild(wrap);
      wrap.querySelector('#spAvailAll').onclick=()=>renderAvailability(allDays);
    }
    if(!wrap.querySelector('#spAvailabilityDays').children.length)renderAvailability(allDays);
  }

  function renderAvailability(selected=allDays){
    ensureAvailability();
    const box=document.getElementById('spAvailabilityDays');if(!box)return;
    const set=new Set(Array.isArray(selected)&&selected.length?selected:[]);
    box.innerHTML=DAYS_SHORT.map((d,i)=>`<label class="sp-day-check"><input type="checkbox" value="${i}" ${set.has(i)?'checked':''}>${d}</label>`).join('');
  }

  function selectedAvailability(){return [...document.querySelectorAll('#spAvailabilityDays input:checked')].map(x=>Number(x.value));}

  const baseSelect=window.selectEmployee;
  if(typeof baseSelect==='function')window.selectEmployee=function(id){
    baseSelect(id);
    const e=employees.find(x=>x.id===id);
    renderAvailability(Array.isArray(e?.availability)?e.availability:allDays);
    renderEmployeeStats();
    markSelectedEmployee();
    enhanceSummary(e);
  };

  const baseClear=window.clearEmployeeForm;
  if(typeof baseClear==='function')window.clearEmployeeForm=function(){baseClear();renderAvailability(allDays);markSelectedEmployee();enhanceSummary(null)};

  const baseSave=window.saveEmployee;
  if(typeof baseSave==='function')window.saveEmployee=function(){
    const before=selectedEmployeeId;
    baseSave();
    const id=selectedEmployeeId||before;
    const e=employees.find(x=>x.id===id);
    if(e){e.availability=selectedAvailability();saveAll();}
    renderEmployeeStats();markSelectedEmployee();enhanceSummary(e);
    if(typeof renderPlanEmployeePool==='function')renderPlanEmployeePool();
  };

  function markSelectedEmployee(){
    document.querySelectorAll('#employeeList .emp').forEach(el=>el.classList.remove('sp-selected'));
    if(!selectedEmployeeId)return;
    const cards=[...document.querySelectorAll('#employeeList .emp')];
    const idx=employees.filter(e=>{
      const q=(document.getElementById('empSearch')?.value||'').toLowerCase();
      const f=document.getElementById('empFilter')?.value||'all';
      return (f==='all'||e.status===f)&&(`${e.first} ${e.last} ${e.personnelNo} ${e.role||''} ${e.city||''}`).toLowerCase().includes(q);
    }).findIndex(e=>e.id===selectedEmployeeId);
    if(idx>=0)cards[idx]?.classList.add('sp-selected');
  }

  function enhanceSummary(e){
    const box=document.getElementById('employeeSummary');if(!box||!e)return;
    let foot=box.querySelector('.sp-profile-foot');if(foot)foot.remove();
    foot=document.createElement('div');foot.className='sp-profile-foot';
    const avail=Array.isArray(e.availability)?e.availability:allDays;
    const absence=(absences||[]).some(a=>a.employeeId===e.id&&a.status!=='Abgelehnt');
    const contract=e.contractEnd?new Date(e.contractEnd+'T00:00:00'):null;
    const soon=contract&&!Number.isNaN(contract.getTime())&&(contract-new Date())<1000*60*60*24*90;
    foot.innerHTML=`<span class="sp-profile-chip good">${(e.shifts||[]).length} Schichtfreigaben</span><span class="sp-profile-chip">${(e.qualifications||[]).length} Qualifikationen</span><span class="sp-profile-chip">${avail.length}/7 Tage verfügbar</span>${absence?'<span class="sp-profile-chip warn">Abwesenheit vorhanden</span>':''}${soon?'<span class="sp-profile-chip warn">Vertragsende beachten</span>':''}`;
    box.appendChild(foot);
  }

  const baseRender=window.renderEmployees;
  if(typeof baseRender==='function')window.renderEmployees=function(){baseRender();renderEmployeeStats();setTimeout(markSelectedEmployee,0)};

  window.addAbsenceForSelected=function(){
    if(!selectedEmployeeId){alert('Bitte zuerst einen Mitarbeiter auswählen.');return}
    const emp=employees.find(e=>e.id===selectedEmployeeId);if(!emp)return;
    if(typeof openAbsenceDialog!=='function'){return}
    openAbsenceDialog();
    setTimeout(()=>{
      const select=document.getElementById('absEmp');
      const search=document.getElementById('absEmpSearch');
      if(select){select.value=emp.id;select.dispatchEvent(new Event('change',{bubbles:true}))}
      if(search){search.value=`${emp.first} ${emp.last} · ${emp.personnelNo||''}`;search.dispatchEvent(new Event('input',{bubbles:true}))}
    },0);
  };

  const baseDelete=window.deleteEmployee;
  if(typeof baseDelete==='function')window.deleteEmployee=function(){
    if(!selectedEmployeeId)return;
    const e=employees.find(x=>x.id===selectedEmployeeId);if(!e)return;
    const hasAssignments=(assignments||[]).some(a=>a.employeeId===e.id);
    const hasAbsences=(absences||[]).some(a=>a.employeeId===e.id);
    if(hasAssignments||hasAbsences){
      if(e.status==='active'){
        if(confirm(`${e.first} ${e.last} besitzt bereits Planungs- oder Abwesenheitsdaten.\n\nStatt diese Historie zu löschen, den Mitarbeiter auf „Inaktiv“ setzen?`)){
          e.status='inactive';saveAll();renderEmployees();renderPlanEmployeePool?.();renderCalendar?.();updateStats?.();selectEmployee(e.id);showSaveToast?.('Mitarbeiter deaktiviert',`${e.first} ${e.last} bleibt mit seiner Historie erhalten.`);
        }
        return;
      }
      if(!confirm(`${e.first} ${e.last} ist bereits inaktiv, besitzt aber Historiedaten. Wirklich endgültig löschen?`))return;
    }
    baseDelete();renderEmployeeStats();
  };

  function bind(){
    ensureAvailability();renderEmployeeStats();
    const btn=document.getElementById('addEmployeeAbsenceBtn');if(btn)btn.onclick=window.addAbsenceForSelected;
    document.getElementById('empSearch')?.addEventListener('input',()=>setTimeout(markSelectedEmployee,0));
    document.getElementById('empFilter')?.addEventListener('change',()=>setTimeout(markSelectedEmployee,0));
    if(selectedEmployeeId){const e=employees.find(x=>x.id===selectedEmployeeId);if(e){renderAvailability(Array.isArray(e.availability)?e.availability:allDays);enhanceSummary(e)}}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
