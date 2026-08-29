// SchichtFunk – Abwesenheitsportal Render-Guard V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__absencePortalRenderGuard)return;B.__absencePortalRenderGuard=true;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtDate=v=>{if(!v)return'–';try{return new Date(String(v).slice(0,10)+'T00:00:00').toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'})}catch{return String(v)}};
  const fmtDateTime=v=>{if(!v)return'';try{return new Date(v).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}catch{return String(v)}};
  const state=s=>s==='Beantragt'?['In Prüfung','pending']:s==='Genehmigt'?['Genehmigt','good']:s==='Erfasst'?['Erfasst','good']:s==='Abgelehnt'?['Abgelehnt','bad']:[s||'–',''];

  function ensureStyles(){
    if(document.getElementById('sfAbsPortalGuardCss'))return;
    const st=document.createElement('style');st.id='sfAbsPortalGuardCss';st.textContent=`
      .sf-abs-portal-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}.sf-abs-portal-head h3{margin:0!important}.sf-abs-portal-add{min-height:32px;padding:6px 10px!important;font-size:10px!important;white-space:nowrap}
      .sf-abs-portal-list{display:flex;flex-direction:column;gap:8px}.sf-abs-portal-row{border:1px solid #22394f;background:#0a1826;border-radius:9px;padding:10px}.sf-abs-portal-top{display:flex;gap:9px;align-items:flex-start}.sf-abs-portal-icon{min-width:38px;height:32px;padding:0 8px;border-radius:8px;background:#143b35;color:#72e6ce;display:grid;place-items:center;font-size:10px;font-weight:900}.sf-abs-portal-main{min-width:0;flex:1}.sf-abs-portal-main b{display:block;font-size:11px}.sf-abs-portal-main small{display:block;color:#8299ae;font-size:9px;margin-top:3px;line-height:1.4}.sf-abs-portal-note{margin-top:7px;padding-top:7px;border-top:1px solid #1d3245;color:#91a7ba;font-size:9px;line-height:1.4}.sf-abs-portal-state{flex:0 0 auto;font-size:9px;font-weight:900;padding:4px 7px;border-radius:999px;border:1px solid #3a5369;color:#b0c3d4}.sf-abs-portal-state.pending{border-color:#7c5c28;background:#2e2415;color:#ffd080}.sf-abs-portal-state.good{border-color:#246958;background:#0d2d26;color:#76e7cc}.sf-abs-portal-state.bad{border-color:#753443;background:#321821;color:#ff99aa}
      @media(max-width:560px){.sf-abs-portal-head{align-items:flex-start;flex-direction:column}.sf-abs-portal-add{width:100%}}
    `;document.head.appendChild(st);
  }

  function findSection(){
    const portal=document.getElementById('sfEmployeePortal');if(!portal)return null;
    return [...portal.querySelectorAll('.sf-portal-card')].find(x=>x.querySelector('h3')?.textContent.trim()==='Abwesenheiten')||null;
  }

  function render(){
    if(B.role!=='EMPLOYEE'||typeof B.openEmployeeAbsenceRequest!=='function')return false;
    const section=findSection(),data=B.employeePortalData;if(!section||!data)return false;
    if(section.querySelector('#sfEmployeeAbsenceAdd'))return true;
    ensureStyles();
    const rows=(data.absences||[]).slice().sort((a,b)=>String(b.requested_at||b.created_at||b.start_date).localeCompare(String(a.requested_at||a.created_at||a.start_date)));
    const body=rows.length?`<div class="sf-abs-portal-list">${rows.slice(0,12).map(a=>{const [label,cls]=state(a.status),partial=!a.full_day&&(a.start_time||a.end_time);return `<div class="sf-abs-portal-row"><div class="sf-abs-portal-top"><div class="sf-abs-portal-icon">${a.absence_type==='Krank'?'✚':'☼'}</div><div class="sf-abs-portal-main"><b>${esc(a.absence_type)}</b><small>${esc(fmtDate(a.start_date))}${a.end_date&&a.end_date!==a.start_date?' – '+esc(fmtDate(a.end_date)):''}${partial?` · ${esc(String(a.start_time||'').slice(0,5))}–${esc(String(a.end_time||'').slice(0,5))}`:''}</small>${a.requested_at?`<small>Beantragt: ${esc(fmtDateTime(a.requested_at))}</small>`:''}</div><span class="sf-abs-portal-state ${cls}">${esc(label)}</span></div>${a.note?`<div class="sf-abs-portal-note">Hinweis: ${esc(a.note)}</div>`:''}${a.review_note?`<div class="sf-abs-portal-note">Rückmeldung: ${esc(a.review_note)}</div>`:''}</div>`}).join('')}</div>`:'<div class="sf-empty">Noch keine Abwesenheiten oder Anträge vorhanden.</div>';
    section.innerHTML=`<div class="sf-abs-portal-head"><h3>Abwesenheiten</h3><button class="primary sf-abs-portal-add" id="sfEmployeeAbsenceAdd" type="button">＋ Antrag stellen</button></div>${body}`;
    section.querySelector('#sfEmployeeAbsenceAdd').onclick=()=>B.openEmployeeAbsenceRequest();
    return true;
  }

  let queued=false;
  const queue=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;render()})};
  const observer=new MutationObserver(queue);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  const oldOpen=B.openEmployeePortal;
  if(typeof oldOpen==='function')B.openEmployeePortal=function(){const r=oldOpen.apply(this,arguments);setTimeout(render,0);setTimeout(render,80);return r};
  setTimeout(render,0);setTimeout(render,300);setTimeout(render,1000);
})();