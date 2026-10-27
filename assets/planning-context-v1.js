// Share only the visible planning period. Historical run summaries stay historical.
(function(){
  'use strict';
  const B=()=>window.SFBackend||{},el=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const valid=m=>/^\d{4}-(0[1-9]|1[0-2])$/.test(m||'');
  const plus=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
  const active=a=>a.status!=='CANCELLED'&&a._dbStatus!=='CANCELLED';
  function current(){
    if(B().companySwitching)return null;
    const view=document.querySelector('.view.active')?.id;
    if(view==='view-schedule')return window.SchichtFunkCalendarView?.getPeriod();
    if(view==='view-wishes'){const month=window.SFWishPlanning?.getMonth();return valid(month)?{mode:'month',start:month+'-01'}:null;}
    if(view==='view-auto'){
      const mode=el('autoPlanPeriod')?.value||'week',start=mode==='month'?el('autoPlanMonth')?.value+'-01':el(mode==='date'?'autoPlanDate':'autoPlanWeekDate')?.value;
      return /^\d{4}-\d{2}-\d{2}$/.test(start||'')?{mode,start}:null;
    }
    return null;
  }
  function handoff(target){
    const period=current(),source=document.querySelector('.view.active')?.id;
    if(!period?.start||source==='view-'+target)return;
    if(target==='auto'&&!window.SFMonthOptimizer?.isBusy?.()&&!window.SFAutoPlanProgress?.isBusy?.()){
      const mode=period.mode==='month'?'month':period.mode==='date'?'date':'week',field=el(mode==='month'?'autoPlanMonth':mode==='date'?'autoPlanDate':'autoPlanWeekDate'),value=mode==='month'?period.start.slice(0,7):period.start;
      if(!field||!el('autoPlanPeriod'))return;
      if(el('autoPlanPeriod').value!==mode||field.value!==value){el('autoPlanPeriod').value=mode;field.value=value;if(el('autoPlanMonthCount'))el('autoPlanMonthCount').value='1';window.changeAutoPlanPeriod?.();}
    }else if(target==='wishes')window.SFWishPlanning?.setMonth(period.start.slice(0,7));
    else if(target==='schedule'){
      if(period.mode==='month')window.SchichtFunkCalendarView?.setMonth(period.start.slice(0,7));
      else if(typeof weekStart!=='undefined'){const d=new Date(period.start+'T12:00:00');d.setDate(d.getDate()-(d.getDay()+6)%7);weekStart=d;window.SchichtFunkCalendarView?.setMode('week');}
    }
  }
  function coverage(month,count=1){
    if(!B().ready||B().companySwitching||!valid(month)||typeof assignments==='undefined'||typeof TYPES==='undefined'||typeof getSoll!=='function')return null;
    const end=new Date(month+'-01T12:00:00Z');end.setUTCMonth(end.getUTCMonth()+Math.max(1,Math.min(12,Number(count)||1)));
    const to=end.toISOString().slice(0,10),rows=assignments.filter(a=>active(a)&&a.date>=month+'-01'&&a.date<to);let open=0,required=0;
    for(let date=month+'-01';date<to;date=plus(date,1))for(const t of TYPES){const need=Math.max(0,Number(getSoll(date,t.id))||0);required+=need;open+=Math.max(0,need-rows.filter(a=>a.date===date&&a.type===t.id).length);}
    return {open,required,assignments:rows.length};
  }
  function currentCoverageMarkup(run){
    const value=coverage(String(run.first_month).slice(0,7),run.month_count);if(!value)return '';
    const differs=run.summary?.open!=null&&Number(run.summary.open)!==value.open;
    return `<p><strong>Aktueller Dienstplan:</strong> ${value.assignments} Personaleinsätze · ${value.open} Pflichtpositionen offen.${differs?' Der gespeicherte Prüfstand und der aktuelle Kalender weichen ab. Maßgeblich für weitere Änderungen sind die heutigen Daten und Regeln.':''}</p>`;
  }
  function rhythmMarkup(rows,dates,expanded=false){
    const selected=rows.filter(a=>active(a)&&a.rhythmOverride&&dates.includes(a.date));if(!selected.length)return '';
    const reasons=new Map();for(const a of selected){const reason=String(a.rhythmOverride.reason||'Begründung am Personaleinsatz hinterlegt.');reasons.set(reason,(reasons.get(reason)||0)+1);}
    return `<details class="sf-plan-rhythm-summary"${expanded?' open=""':''}><summary>${selected.length} bestätigte Rhythmusausnahmen · ${new Set(selected.map(a=>String(a.employeeId))).size} Mitarbeiter</summary><p>Diese dokumentierten Abweichungen werden separat von offenen Regelkonflikten angezeigt. Einzelheiten stehen an den jeweiligen Personaleinsätzen.</p><ul>${[...reasons].map(([reason,n])=>`<li>${n} × ${esc(reason)}</li>`).join('')}</ul></details>`;
  }
  window.SFPlanningContext={current,handoff,coverage,currentCoverageMarkup,rhythmMarkup};
  const previous=window.switchView;if(previous)window.switchView=function(name){handoff(name);return previous.apply(this,arguments)};
})();
