// SchichtFunk – Lesbarkeit und Informationshierarchie im Dienstplan
(function(){
  if(window.__sfScheduleReadabilityV1)return;window.__sfScheduleReadabilityV1=true;
  const css=`
  #view-schedule .page-head{margin-bottom:13px}
  #view-schedule .stats{gap:10px;margin:10px 0}
  #view-schedule .stat{min-height:76px;padding:11px 13px;box-shadow:none}
  #view-schedule .stat strong{font-size:20px}
  #view-schedule .library{padding:11px 13px;background:#0d1928;box-shadow:none}
  #view-schedule .library-head{margin-bottom:7px}
  #view-schedule .shift-row{gap:7px;padding-bottom:1px}
  #view-schedule .shift-chip{min-width:124px;padding:8px 9px}
  #view-schedule .employee-pool{padding:10px 13px;background:#0d1928;box-shadow:none}
  #view-schedule .employee-pool-head{display:grid;grid-template-columns:minmax(210px,1fr) auto minmax(210px,280px) auto;gap:8px;align-items:center;margin-bottom:8px}
  #view-schedule .employee-pool-head input{order:initial!important;margin:0;min-width:0;width:100%}
  #view-schedule .employee-pool-head .sp-dynpool-info{order:initial!important}
  #view-schedule .employee-pool-head .sp-pool-toggle{margin:0}
  #view-schedule .employee-pool-list{gap:7px!important}
  #view-schedule .employee-pool.sp-pool-compact .employee-pool-list{max-height:108px!important}
  #view-schedule .employee-pool.sp-pool-compact .employee-drag{min-height:92px!important;padding:9px 10px}
  #view-schedule .employee-pool.sp-pool-compact .pool-detail-label,
  #view-schedule .employee-pool.sp-pool-compact .pool-shifts{display:none}
  #view-schedule .employee-pool.sp-pool-compact .pool-absence{margin-top:auto;font-size:11px;padding:4px 6px}
  #view-schedule .calendar{border-color:#29445d;background:#091522;box-shadow:0 16px 34px rgba(0,0,0,.16)}
  #view-schedule .cal-toolbar{min-height:64px;padding:10px 12px;gap:7px;background:#0c1928;border-bottom-color:#294159}
  #view-schedule .cal-toolbar #prevWeek{order:1}
  #view-schedule .cal-toolbar #todayBtn{order:2}
  #view-schedule .cal-toolbar .date-label{order:3;min-width:112px;margin:0 4px;padding:8px 11px;border:1px solid #294159;border-radius:8px;background:#091624;text-align:center;font-size:14px}
  #view-schedule .cal-toolbar #nextWeek{order:4}
  #view-schedule .cal-toolbar .toolbar-spacer{order:5}
  #view-schedule .cal-toolbar #sfWeekModeSeg{order:6}
  #view-schedule .cal-toolbar>button:not(#prevWeek):not(#nextWeek):not(#todayBtn){order:7}
  #view-schedule .cal-toolbar>.seg{order:8}
  #view-schedule .cal-toolbar #sfComplianceToolbar{order:9}
  #view-schedule .cal-toolbar #sfPlanStatusTools{order:10}
  #view-schedule .cal-toolbar #prevWeek,#view-schedule .cal-toolbar #nextWeek{width:37px;font-size:18px;padding:5px}
  #view-schedule .cal-toolbar #todayBtn{font-weight:800;color:#d8e8f5}
  #view-schedule .sf-readability-legend{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:8px 12px;border-bottom:1px solid #20364b;background:#091725;color:#8ea5ba;font-size:11px}
  #view-schedule .sf-readability-legend>span:first-child{margin-right:2px;color:#b9cada;font-weight:800}
  #view-schedule .sf-readability-key{display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border:1px solid #294158;border-radius:999px;background:#0e1e2d;white-space:nowrap}
  #view-schedule .sf-readability-key:before{content:"";width:7px;height:7px;border-radius:50%;background:#71879b}
  #view-schedule .sf-readability-key.good:before{background:#36d7ae;box-shadow:0 0 8px rgba(54,215,174,.28)}
  #view-schedule .sf-readability-key.warn:before{background:#ffbd4f}
  #view-schedule .sf-readability-key.over:before{background:#a78bfa}
  #view-schedule .sf-week-board-wrap{max-height:calc(100vh - 150px);padding:13px;scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:#3a5b73 #07131f}
  #view-schedule .sf-week-board-wrap::-webkit-scrollbar{width:11px;height:11px}
  #view-schedule .sf-week-board-wrap::-webkit-scrollbar-track{background:#07131f;border-radius:999px}
  #view-schedule .sf-week-board-wrap::-webkit-scrollbar-thumb{background:#36566e;border:2px solid #07131f;border-radius:999px}
  #view-schedule .sf-week-board{grid-template-columns:repeat(7,minmax(220px,1fr));gap:10px;min-width:1600px}
  #view-schedule .sf-week-day{border-color:#29445c;box-shadow:0 8px 18px rgba(0,0,0,.22)}
  #view-schedule .sf-week-day-head{padding:11px 12px 10px}
  #view-schedule .sf-week-day-title strong{font-size:14px}
  #view-schedule .sf-week-day-title span{font-size:12px}
  #view-schedule .sf-week-day-coverage{font-size:11.5px;line-height:1.35}
  #view-schedule .sf-week-shift-cell{padding:8px}
  #view-schedule .sf-week-shift{border-radius:9px;background:#101f30}
  #view-schedule .sf-week-shift-head{padding:9px 10px}
  #view-schedule .sf-week-shift-main strong{font-size:13.5px}
  #view-schedule .sf-week-shift-main small{font-size:11.5px;color:#a0b4c8}
  #view-schedule .sf-week-shift-count b{font-size:11.5px;padding:4px 7px}
  #view-schedule .sf-week-employees{gap:6px;padding:0 8px 8px}
  #view-schedule .sf-week-employee{grid-template-columns:32px minmax(0,1fr);gap:8px;min-height:47px;padding:7px 8px;border-color:#29465f;background:#142a3d}
  #view-schedule .sf-week-avatar{width:32px;height:32px;font-size:10.5px}
  #view-schedule .sf-week-employee-info b{font-size:12.5px;line-height:1.3}
  #view-schedule .sf-week-employee-info small{font-size:11px;color:#9fb4c8}
  #view-schedule .sf-shift-status{font-size:9.5px!important;padding:3px 6px!important;letter-spacing:.02em}
  #view-schedule .sf-week-open{font-size:11.5px;padding:8px}
  #view-schedule .sf-week-over{font-size:10.5px;padding:6px 8px}
  #view-schedule .sf-week-shift.is-inactive{min-height:44px;border-style:dashed;background:repeating-linear-gradient(135deg,rgba(30,50,68,.16),rgba(30,50,68,.16) 7px,rgba(11,24,37,.30) 7px,rgba(11,24,37,.30) 14px)}
  #view-schedule .sf-week-shift-empty{font-size:12px;color:#617990}
  @media(max-width:1500px){#view-schedule .sf-week-board{grid-template-columns:repeat(7,220px);min-width:max-content}}
  @media(max-width:1180px){#view-schedule .employee-pool-head{grid-template-columns:1fr auto}#view-schedule .employee-pool-head input{grid-column:1/-1;grid-row:2}#view-schedule .employee-pool-head .sp-dynpool-info{grid-column:1/-1}#view-schedule .cal-toolbar #sfComplianceToolbar,#view-schedule .cal-toolbar #sfPlanStatusTools{margin-left:0!important}}
  @media(max-width:720px){#view-schedule .sf-readability-legend{overflow-x:auto;flex-wrap:nowrap}#view-schedule .cal-toolbar .date-label{order:1;flex:1 0 calc(100% - 128px)}#view-schedule .cal-toolbar #prevWeek,#view-schedule .cal-toolbar #todayBtn,#view-schedule .cal-toolbar #nextWeek{order:1}}
  `;
  function enhance(){
    if(!document.getElementById('sfScheduleReadabilityV1')){const style=document.createElement('style');style.id='sfScheduleReadabilityV1';style.textContent=css;document.head.appendChild(style)}
    const calendar=document.querySelector('#view-schedule .calendar'),toolbar=calendar?.querySelector('.cal-toolbar');
    if(toolbar&&!calendar.querySelector('.sf-readability-legend'))toolbar.insertAdjacentHTML('afterend','<div class="sf-readability-legend" aria-label="Legende zur Besetzung"><span>Besetzungsstatus</span><span class="sf-readability-key good">Vollständig</span><span class="sf-readability-key warn">Offene Position</span><span class="sf-readability-key over">Über SOLL</span><span class="sf-readability-key">Inaktiv</span></div>');
    const pool=document.querySelector('#view-schedule .employee-pool'),toggle=pool?.querySelector('.sp-pool-toggle');
    if(pool&&toggle&&pool.classList.contains('sp-pool-compact')){toggle.textContent='Mitarbeiter anzeigen ↓';toggle.setAttribute('aria-label','Mitarbeiter-Pool vollständig anzeigen')}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(enhance,0),{once:true});else setTimeout(enhance,0);
  document.addEventListener('click',e=>{if(e.target.closest('[data-view="schedule"]'))setTimeout(enhance,80);if(e.target.closest('.sp-pool-toggle'))setTimeout(()=>{const pool=document.querySelector('#view-schedule .employee-pool'),toggle=pool?.querySelector('.sp-pool-toggle');if(!toggle)return;const compact=pool.classList.contains('sp-pool-compact');toggle.textContent=compact?'Mitarbeiter anzeigen ↓':'Mitarbeiter einklappen ↑';toggle.setAttribute('aria-expanded',String(!compact))},0)});
})();
