// SchichtFunk – Abwesenheiten in der Dienstplanung vollständig absichern V2
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__absencePlanningGuardV2)return;B.__absencePlanningGuardV2=true;
  const EFFECTIVE=new Set(['Genehmigt','Erfasst']);

  const listAbsences=()=>{try{return typeof absences!=='undefined'&&Array.isArray(absences)?absences:(Array.isArray(window.absences)?window.absences:[])}catch{return Array.isArray(window.absences)?window.absences:[]}};
  const listAssignments=()=>{try{return typeof assignments!=='undefined'&&Array.isArray(assignments)?assignments:(Array.isArray(window.assignments)?window.assignments:[])}catch{return Array.isArray(window.assignments)?window.assignments:[]}};
  const listEmployees=()=>{try{return typeof employees!=='undefined'&&Array.isArray(employees)?employees:(Array.isArray(window.employees)?window.employees:[])}catch{return Array.isArray(window.employees)?window.employees:[]}};
  const typeFor=id=>{try{return typeof typeById==='function'?typeById(id):null}catch{return null}};
  const localIso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const addDay=s=>{const d=new Date(String(s).slice(0,10)+'T00:00:00');d.setDate(d.getDate()+1);return localIso(d)};
  const fmtDate=s=>{try{return new Date(String(s).slice(0,10)+'T00:00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'})}catch{return String(s)}};
  const effective=a=>EFFECTIVE.has(a?.status);

  function interval(date,start,end){
    const s=new Date(`${date}T${start||'00:00'}:00`),e=new Date(`${date}T${end||'00:00'}:00`);
    if(e<=s)e.setDate(e.getDate()+1);
    return {start:s,end:e};
  }
  function overlaps(x,y){return x.start<y.end&&x.end>y.start}

  function absenceIntervalOnDate(a,date){
    if(!a||!date)return null;
    const from=String(a.startDate||a.start_date||a.date||'').slice(0,10),to=String(a.endDate||a.end_date||a.date||from).slice(0,10);
    if(!from||date<from||date>to)return null;
    const full=a.fullDay!==false&&a.full_day!==false;
    if(full)return {start:new Date(`${date}T00:00:00`),end:new Date(`${addDay(date)}T00:00:00`)};
    const st=String(a.startTime||a.start_time||'').slice(0,5),en=String(a.endTime||a.end_time||'').slice(0,5);
    if(!st||!en)return null;
    return interval(date,st,en);
  }

  function findConflict(employeeId,date,start,end){
    const target=interval(date,start,end);
    for(const a of listAbsences()){
      if(!effective(a)||String(a.employeeId||a.employee_id)!==String(employeeId))continue;
      const from=String(a.startDate||a.start_date||a.date||'').slice(0,10),to=String(a.endDate||a.end_date||a.date||from).slice(0,10);
      if(!from)continue;
      const full=a.fullDay!==false&&a.full_day!==false;
      if(full){
        const ai={start:new Date(`${from}T00:00:00`),end:new Date(`${addDay(to)}T00:00:00`)};
        if(overlaps(target,ai))return a;
        continue;
      }
      let d=new Date(from+'T00:00:00'),last=new Date(to+'T00:00:00');
      while(d<=last){
        const key=localIso(d),ai=absenceIntervalOnDate(a,key);
        if(ai&&overlaps(target,ai))return a;
        d.setDate(d.getDate()+1);
      }
    }
    return null;
  }

  function assignmentConflict(a){
    if(!a)return null;const t=typeFor(a.type);return findConflict(a.employeeId,a.date,a.start||t?.start||'00:00',a.end||t?.end||'00:00');
  }

  function fullDayAbsent(employeeId,date){
    return listAbsences().some(a=>{
      if(!effective(a)||String(a.employeeId||a.employee_id)!==String(employeeId))return false;
      const full=a.fullDay!==false&&a.full_day!==false;if(!full)return false;
      const from=String(a.startDate||a.start_date||a.date||'').slice(0,10),to=String(a.endDate||a.end_date||a.date||from).slice(0,10);
      return !!from&&date>=from&&date<=to;
    });
  }
  try{absent=fullDayAbsent}catch{}window.absent=fullDayAbsent;

  function eligible(emp,type,date){
    if(!emp||emp.status!=='active'||!(emp.shifts||[]).includes(type))return false;
    const t=typeFor(type);if(!t)return false;
    if(findConflict(emp.id,date,t.start,t.end))return false;
    return !listAssignments().some(a=>a.date===date&&String(a.employeeId)===String(emp.id));
  }
  try{isEligible=eligible}catch{}window.isEligible=eligible;

  const oldDrop=window.assignEmployeeByDrop;
  if(typeof oldDrop==='function'&&!oldDrop.__sfAbsenceGuardV2){
    const wrapped=function(employeeId,type,date){
      const t=typeFor(type),emp=listEmployees().find(e=>String(e.id)===String(employeeId));
      if(t&&emp){
        const c=findConflict(employeeId,date,t.start,t.end);
        if(c){
          const from=c.startDate||c.start_date||c.date,to=c.endDate||c.end_date||c.date||from;
          const label=c.type||c.absence_type||'Abwesenheit';
          if(typeof showSaveToast==='function')showSaveToast('Planung blockiert',`${emp.first} ${emp.last} ist wegen ${label} (${fmtDate(from)}${to&&to!==from?'–'+fmtDate(to):''}) nicht verfügbar.`);
          return false;
        }
      }
      return oldDrop.apply(this,arguments);
    };
    wrapped.__sfAbsenceGuardV2=true;try{assignEmployeeByDrop=wrapped}catch{}window.assignEmployeeByDrop=wrapped;
  }

  const oldEligible=window.autoEligibleEmployees;
  if(typeof oldEligible==='function'&&!oldEligible.__sfAbsenceGuardV2){
    const wrapped=function(type,date,simulated=[]){
      const t=typeFor(type),rows=oldEligible.apply(this,arguments)||[];if(!t)return rows;
      return rows.filter(x=>!findConflict(x?.e?.id||x?.id,date,t.start,t.end));
    };
    wrapped.__sfAbsenceGuardV2=true;window.autoEligibleEmployees=wrapped;try{autoEligibleEmployees=wrapped}catch{}
  }

  const oldApply=window.applyAutoPlanPreview;
  if(typeof oldApply==='function'&&!oldApply.__sfAbsenceGuardV2){
    const wrapped=function(){
      try{
        if(typeof autoPlanPreview!=='undefined'&&Array.isArray(autoPlanPreview)){
          const before=autoPlanPreview.length;
          autoPlanPreview=autoPlanPreview.filter(x=>!findConflict(x.employeeId,x.date,x.start||typeFor(x.type)?.start,x.end||typeFor(x.type)?.end));
          const rejected=before-autoPlanPreview.length;
          if(rejected){if(typeof renderAutoPlanning==='function')renderAutoPlanning();if(typeof showSaveToast==='function')showSaveToast('Auto-Planung angepasst',`${rejected} Vorschlag${rejected===1?' wurde':'e wurden'} wegen genehmigter Abwesenheit entfernt.`);if(!autoPlanPreview.length)return}
        }
      }catch(e){console.warn('Abwesenheitsprüfung Auto-Planung',e)}
      return oldApply.apply(this,arguments);
    };
    wrapped.__sfAbsenceGuardV2=true;window.applyAutoPlanPreview=wrapped;try{applyAutoPlanPreview=wrapped}catch{}
  }

  function css(){
    if(document.getElementById('sfAbsPlanningGuardCss'))return;
    const s=document.createElement('style');s.id='sfAbsPlanningGuardCss';s.textContent=`
      .assignment.sf-absence-conflict{outline:2px solid #ff6677!important;outline-offset:-2px!important;box-shadow:0 0 0 3px rgba(255,102,119,.15),0 7px 18px rgba(0,0,0,.35)!important}.sf-absence-conflict-badge{position:absolute!important;right:6px!important;bottom:5px!important;display:inline-flex!important;width:auto!important;margin:0!important;padding:2px 5px!important;border-radius:999px!important;background:#4a1e29!important;border:1px solid #a94b5d!important;color:#ffd2d9!important;font-size:8px!important;font-weight:900!important;line-height:1.2!important}.sf-absence-plan-banner{margin:0 0 10px;padding:10px 12px;border-radius:10px;border:1px solid #78404d;background:#321a22;color:#ffc1cb;font-size:11px;line-height:1.45}.sf-absence-plan-banner b{color:#fff}.pool-absence.sf-range{border-color:#76532a;background:#302414;color:#ffd08a}
    `;document.head.appendChild(s);
  }

  const oldRenderAssignments=window.renderAssignments;
  if(typeof oldRenderAssignments==='function'&&!oldRenderAssignments.__sfAbsenceGuardV2){
    const wrapped=function(date){
      const html=oldRenderAssignments.apply(this,arguments);css();const box=document.createElement('div');box.innerHTML=html;
      box.querySelectorAll('.assignment').forEach(el=>{
        const raw=el.getAttribute('onclick')||'',m=raw.match(/editAssignment\('([^']+)'\)/),id=m?.[1];if(!id)return;
        const a=listAssignments().find(x=>String(x.id)===String(id)),c=assignmentConflict(a);if(!c)return;
        el.classList.add('sf-absence-conflict');el.title=`Konflikt mit ${c.type||c.absence_type||'Abwesenheit'}`;
        if(!el.querySelector('.sf-absence-conflict-badge')){const b=document.createElement('span');b.className='sf-absence-conflict-badge';b.textContent='⚠ Abwesend';el.appendChild(b)}
      });return box.innerHTML;
    };
    wrapped.__sfAbsenceGuardV2=true;window.renderAssignments=wrapped;try{renderAssignments=wrapped}catch{}
  }

  function weekKeys(){try{return currentWeekDates().map(d=>iso(d))}catch{return[]}}
  function currentWeekConflicts(){const keys=weekKeys();if(!keys.length)return[];return listAssignments().filter(a=>keys.includes(a.date)&&assignmentConflict(a)).map(a=>({a,c:assignmentConflict(a)}))}
  function renderBanner(){
    css();const cal=document.querySelector('#view-schedule .calendar');if(!cal)return;let b=document.getElementById('sfAbsencePlanBanner');const rows=currentWeekConflicts();if(!rows.length){b?.remove();return}
    if(!b){b=document.createElement('div');b.id='sfAbsencePlanBanner';b.className='sf-absence-plan-banner';cal.insertAdjacentElement('beforebegin',b)}
    b.innerHTML=`<b>⚠ ${rows.length} Planungskonflikt${rows.length===1?'':'e'} mit genehmigten Abwesenheiten.</b> Betroffene Schichten sind im Kalender rot markiert. Bitte bewusst neu besetzen oder ändern.`;
  }

  const oldCalendar=window.renderCalendar;
  if(typeof oldCalendar==='function'&&!oldCalendar.__sfAbsenceGuardV2){
    const wrapped=function(){const r=oldCalendar.apply(this,arguments);setTimeout(renderBanner,0);return r};wrapped.__sfAbsenceGuardV2=true;window.renderCalendar=wrapped;try{renderCalendar=wrapped}catch{}
  }

  function patchPool(){
    const keys=weekKeys();if(!keys.length)return;document.querySelectorAll('#planEmployeePool .employee-drag[data-employee-id]').forEach(card=>{
      const id=card.dataset.employeeId,rows=listAbsences().filter(a=>effective(a)&&String(a.employeeId||a.employee_id)===String(id)).filter(a=>{
        const from=String(a.startDate||a.start_date||a.date||''),to=String(a.endDate||a.end_date||a.date||from);return keys.some(k=>k>=from&&k<=to)
      });
      const target=card.querySelector('.pool-absence');if(!target)return;
      if(!rows.length){target.classList.remove('has-absence','sf-range');target.textContent='✓ Keine genehmigte Abwesenheit in dieser Woche';return}
      target.classList.add('has-absence','sf-range');target.innerHTML='<strong>Abwesend:</strong> '+rows.map(a=>{const from=a.startDate||a.start_date||a.date,to=a.endDate||a.end_date||a.date||from,label=a.type||a.absence_type||'Abwesenheit',partial=(a.fullDay===false||a.full_day===false);return `${label} · ${fmtDate(from)}${to!==from?'–'+fmtDate(to):''}${partial?' · '+String(a.startTime||a.start_time||'').slice(0,5)+'–'+String(a.endTime||a.end_time||'').slice(0,5):''}`}).join(' · ');
    })
  }
  const oldPool=window.renderPlanEmployeePool;
  if(typeof oldPool==='function'&&!oldPool.__sfAbsenceGuardV2){const wrapped=function(){const r=oldPool.apply(this,arguments);setTimeout(patchPool,0);return r};wrapped.__sfAbsenceGuardV2=true;window.renderPlanEmployeePool=wrapped;try{renderPlanEmployeePool=wrapped}catch{}}

  B.absencePlanning={findConflict,assignmentConflict,effective};
  css();setTimeout(()=>{patchPool();renderBanner()},0);
})();
