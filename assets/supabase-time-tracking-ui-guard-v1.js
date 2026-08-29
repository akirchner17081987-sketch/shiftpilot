// SchichtFunk – Zeiterfassung UI-Guard V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__timeTrackingUiGuardV1)return;B.__timeTrackingUiGuardV1=true;
  const endCache=new Map();
  async function patch(){
    if(!B.client||!['OWNER','ADMIN','DISPATCHER','PLANNER'].includes(B.role))return;
    const body=document.getElementById('timeTableBody');if(!body)return;
    const buttons=[...body.querySelectorAll('[data-time-open]')].filter(b=>b.textContent.trim()==='Erfassen');
    if(!buttons.length)return;
    const missing=[...new Set(buttons.map(b=>b.dataset.timeOpen).filter(id=>id&&!endCache.has(id)))];
    if(missing.length){try{const q=await B.client.from('shift_assignments').select('id,ends_at').in('id',missing);if(!q.error)(q.data||[]).forEach(x=>endCache.set(x.id,x.ends_at))}catch{}}
    const now=Date.now();buttons.forEach(b=>{const end=endCache.get(b.dataset.timeOpen);if(end&&new Date(end).getTime()>now){b.disabled=true;b.textContent='Nach Schichtende';b.title='Ist-Zeit kann erst nach dem geplanten Schichtende erfasst werden.'}});
  }
  const base=window.renderTimeTracking;if(typeof base==='function')window.renderTimeTracking=async function(){const r=await base.apply(this,arguments);await patch();return r};
  if(B.timeTracking?.refreshManager){const br=B.timeTracking.refreshManager;B.timeTracking.refreshManager=async function(){const r=await br.apply(this,arguments);await patch();return r}}
  document.addEventListener('click',e=>{if(e.target.closest('[data-view="time"]'))setTimeout(patch,250)},true);
  setInterval(()=>{if(document.getElementById('view-time')?.classList.contains('active'))patch()},2500);
})();