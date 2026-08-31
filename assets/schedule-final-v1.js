// SchichtFunk – Dienstplan final: Wochenkontext, Wiederaufnahme und Nur-Lese-Modus
(function(){
  if(window.__sfScheduleFinalV1)return;window.__sfScheduleFinalV1=true;
  const B=window.SFBackend=window.SFBackend||{},C=window.SFCompliance=window.SFCompliance||{};
  const key='schichtfunk.schedule.week';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const canPlan=()=>typeof B.can==='function'?B.can('plan'):['OWNER','ADMIN','DISPATCHER','PLANNER'].includes(B.role);
  const localDate=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'–':d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'})};
  function styles(){if(document.getElementById('sfScheduleFinalCss'))return;const s=document.createElement('style');s.id='sfScheduleFinalCss';s.textContent=`
    .sf-plan-context{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px;padding:10px 12px;border:1px solid #20394e;border-radius:11px;background:linear-gradient(180deg,#0d1c2a,#091724)}
    .sf-plan-context-label{color:#8098ad;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.sf-plan-context strong{font-size:12px;color:#e8f4ff}
    .sf-plan-context .spacer{flex:1}.sf-plan-chip{display:inline-flex;align-items:center;min-height:25px;padding:4px 8px;border:1px solid #34516a;border-radius:999px;background:#102335;color:#aec2d3;font-size:9px;font-weight:850;white-space:nowrap}
    .sf-plan-chip.good{border-color:#28715e;background:#0f2d27;color:#82e8cf}.sf-plan-chip.warn{border-color:#80612f;background:#2d2314;color:#ffd08a}.sf-plan-chip.readonly{border-color:#65537d;background:#201a2b;color:#d7bdff}
    #view-schedule.sf-schedule-readonly #autoPlanBtn,#view-schedule.sf-schedule-readonly .sf-published:not(.sf-plan-chip),#view-schedule.sf-schedule-readonly button[onclick*="spPublishCurrentWeek"]{display:none!important}
    #view-schedule.sf-schedule-readonly .sf-week-employee,#view-schedule.sf-schedule-readonly .assignment{cursor:default!important}
    body.sf-schedule-readonly .sp-assign-edit input,body.sf-schedule-readonly .sp-assign-edit select,body.sf-schedule-readonly .sp-assign-edit textarea,body.sf-schedule-readonly .sp-assign-edit #spSaveAssign,body.sf-schedule-readonly .sp-assign-edit #spDeleteAssign{display:none!important}
    @media(max-width:680px){.sf-plan-context{align-items:flex-start}.sf-plan-context .spacer{display:none}.sf-plan-context-label{width:100%}.sf-plan-chip{white-space:normal}}
  `;document.head.appendChild(s)}
  function restore(){try{const raw=sessionStorage.getItem(key);if(!raw||typeof weekStart==='undefined')return;const d=new Date(raw+'T00:00:00');if(!Number.isNaN(d.getTime()))weekStart=d}catch{}}
  function remember(){try{if(typeof weekStart!=='undefined'&&typeof iso==='function')sessionStorage.setItem(key,iso(weekStart))}catch{}}
  function publication(){try{const k=typeof C.weekKey==='function'?C.weekKey(iso(weekStart)):iso(weekStart);return C.publications?.[k]}catch{return null}}
  function render(){
    styles();const view=document.getElementById('view-schedule'),card=view?.querySelector('.card.calendar');if(!view||!card||typeof weekStart==='undefined')return;
    const readonly=B.ready&&!canPlan(),pub=publication();view.classList.toggle('sf-schedule-readonly',readonly);document.body.classList.toggle('sf-schedule-readonly',readonly);
    let box=document.getElementById('sfPlanContext');if(!box){box=document.createElement('div');box.id='sfPlanContext';box.className='sf-plan-context';card.parentNode.insertBefore(box,card)}
    const html=`<span class="sf-plan-context-label">Aktueller Plan</span><strong>Woche ab ${esc(localDate(weekStart))}</strong><span class="spacer"></span><span class="sf-plan-chip ${pub?'good':'warn'}">${pub?'✓ Veröffentlicht':'● Entwurf'}</span><span class="sf-plan-chip ${B.ready?'good':'warn'}">${B.ready?'✓ Cloud gespeichert':'Cloud-Verbindung wird hergestellt'}</span>${readonly?'<span class="sf-plan-chip readonly">Nur lesen</span>':''}`;if(box.innerHTML!==html)box.innerHTML=html;
    remember();
  }
  function blockMutations(e){
    if(!B.ready||canPlan()||e.target.closest?.('.assignment,.sf-week-employee'))return;const t=e.target.closest?.('#view-schedule #autoPlanBtn,#view-schedule [onclick*="spPublishCurrentWeek"],#view-schedule .pill.drop-target,#view-schedule .sf-week-cell,#view-schedule .day-body');if(!t)return;
    e.preventDefault();e.stopImmediatePropagation();if(typeof showSaveToast==='function')showSaveToast('Nur-Lese-Zugriff','Diese Rolle darf den Dienstplan ansehen, aber nicht verändern.');
  }
  restore();
  const baseRender=window.renderCalendar;if(typeof baseRender==='function')window.renderCalendar=function(){const out=baseRender.apply(this,arguments);render();return out};
  document.addEventListener('click',blockMutations,true);document.addEventListener('dragstart',blockMutations,true);document.addEventListener('drop',blockMutations,true);
  new MutationObserver(render).observe(document.body,{childList:true,subtree:true});
  window.addEventListener('beforeunload',remember);setTimeout(()=>{render();if(typeof renderCalendar==='function')renderCalendar()},0);
})();
