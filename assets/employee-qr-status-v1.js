// SchichtFunk – QR-Status im Mitarbeiterportal V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__employeeQrStatusV1)return;B.__employeeQrStatusV1=true;

  let busy=false,lastAssignment='';
  const demo=()=>sessionStorage.getItem('sf_demo_session_v1')==='active';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tz=()=>B.companyTimeZone||'Europe/Berlin';
  const fmtTime=v=>v?new Intl.DateTimeFormat('de-DE',{timeZone:tz(),hour:'2-digit',minute:'2-digit'}).format(new Date(v)).replace('24:','00:'):'–';
  const fmtDate=v=>v?new Intl.DateTimeFormat('de-DE',{timeZone:tz(),weekday:'short',day:'2-digit',month:'2-digit'}).format(new Date(v)):'–';

  function css(){
    if(document.getElementById('sfEmployeeQrStatusCss'))return;
    const s=document.createElement('style');s.id='sfEmployeeQrStatusCss';s.textContent=`
      .sf-emp-qr-card{border-color:#28594c!important;background:linear-gradient(145deg,#0e2824,#0b1c28)!important}.sf-emp-qr-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.sf-emp-qr-head h3{margin:0;font-size:14px}.sf-emp-qr-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border:1px solid #2d6d5c;border-radius:999px;background:#102e27;color:#7de4c8;font-size:9px;font-weight:900}.sf-emp-qr-badge.wait{border-color:#735a2d;background:#302217;color:#ffc37e}.sf-emp-qr-badge.done{border-color:#35516a;background:#142435;color:#a9c4df}.sf-emp-qr-body{display:grid;grid-template-columns:38px 1fr;gap:10px;align-items:start}.sf-emp-qr-icon{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;background:#123b35;color:#69e4cb;font-size:18px}.sf-emp-qr-main b{font-size:12px}.sf-emp-qr-main small{display:block;color:#91a8bb;font-size:10px;line-height:1.5;margin-top:3px}.sf-emp-qr-live{margin-top:9px;padding:8px 9px;border:1px solid #286b59;border-radius:8px;background:#0f3028;color:#96ead4;font-size:10px;line-height:1.45}.sf-emp-qr-live.wait{border-color:#6f5529;background:#2b2114;color:#ffd08a}.sf-emp-qr-live.done{border-color:#29465b;background:#0c1b2a;color:#a8bdcf}
    `;document.head.appendChild(s);
  }

  function shifts(){return Array.isArray(B.employeePortalData?.shifts)?B.employeePortalData.shifts:[]}
  function relevantShift(){
    const now=Date.now();
    const current=shifts().filter(s=>s.published_at&&now>=new Date(s.starts_at).getTime()-60*60000&&now<=new Date(s.ends_at).getTime()+120*60000).sort((a,b)=>Math.abs(new Date(a.starts_at)-now)-Math.abs(new Date(b.starts_at)-now))[0];
    if(current)return{shift:current,current:true};
    const next=shifts().filter(s=>s.published_at&&new Date(s.starts_at).getTime()>now).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at))[0];
    return next?{shift:next,current:false}:null;
  }

  function target(){
    const portal=document.getElementById('sfEmployeePortal');if(!portal)return null;
    const right=portal.querySelector('.sf-portal-grid > div[style*="display:grid"]')||portal.querySelector('.sf-portal-grid');
    return right||portal;
  }

  function render(info,entry){
    const host=target();if(!host)return;css();host.querySelector('#sfEmployeeQrStatus')?.remove();
    const c=document.createElement('section');c.id='sfEmployeeQrStatus';c.className='sf-portal-card sf-emp-qr-card';
    if(!info){
      c.innerHTML='<div class="sf-emp-qr-head"><h3>QR-Zeiterfassung</h3><span class="sf-emp-qr-badge done">BEREIT</span></div><div class="sf-emp-qr-body"><div class="sf-emp-qr-icon">▦</div><div class="sf-emp-qr-main"><b>Keine anstehende veröffentlichte Schicht</b><small>Sobald eine Schicht ansteht, kann der QR-Code am Einsatzort für Kommen und Gehen verwendet werden.</small></div></div>';
      host.insertBefore(c,host.firstChild);return;
    }
    const s=info.shift,started=!!entry?.actual_start,ended=!!entry?.actual_end;
    const badge=ended?'<span class="sf-emp-qr-badge done">BEENDET</span>':started?'<span class="sf-emp-qr-badge">● EINGECHECKT</span>':'<span class="sf-emp-qr-badge wait">NOCH NICHT EINGECHECKT</span>';
    const note=ended
      ?`<div class="sf-emp-qr-live done">QR-Zeiterfassung abgeschlossen · Kommen ${esc(fmtTime(entry.actual_start))} · Gehen ${esc(fmtTime(entry.actual_end))}</div>`
      :started
        ?`<div class="sf-emp-qr-live">● Arbeitszeit läuft seit <b>${esc(fmtTime(entry.actual_start))}</b>. Zum Dienstende den QR-Code am Einsatzort erneut scannen.</div>`
        :info.current
          ?'<div class="sf-emp-qr-live wait"><b>Jetzt am Einsatzort:</b> QR-Code mit der Smartphone-Kamera scannen und „Arbeitszeit starten“ wählen.</div>'
          :'<div class="sf-emp-qr-live done">Der QR-Check-in wird im Startfenster vor Dienstbeginn freigeschaltet.</div>';
    c.innerHTML=`<div class="sf-emp-qr-head"><h3>QR-Zeiterfassung</h3>${badge}</div><div class="sf-emp-qr-body"><div class="sf-emp-qr-icon">▦</div><div class="sf-emp-qr-main"><b>${esc(s.shift_code||'Schicht')} · ${esc(fmtDate(s.starts_at))}</b><small>Geplant ${esc(fmtTime(s.starts_at))}–${esc(fmtTime(s.ends_at))} · QR-Code am Objekt/Einsatzort</small></div></div>${note}`;
    host.insertBefore(c,host.firstChild);
  }

  async function refresh(){
    if(B.role!=='EMPLOYEE'||demo()||busy)return;
    const info=relevantShift();if(!info){render(null,null);return}
    if(!B.client)return;
    busy=true;
    try{
      const q=await B.client.from('time_entries').select('assignment_id,actual_start,actual_end,status,source,employee_note').eq('assignment_id',info.shift.id).maybeSingle();
      if(q.error)throw q.error;
      lastAssignment=info.shift.id;render(info,q.data||null);
    }catch(e){console.debug('[SchichtFunk Mitarbeiter QR]',e?.message||e)}finally{busy=false}
  }

  function schedule(){setTimeout(refresh,80)}
  const base=B.openEmployeePortal;if(typeof base==='function')B.openEmployeePortal=function(){const r=base.apply(this,arguments);schedule();return r};
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-view="employee-portal"],[data-employee-home]'))schedule()},true);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
  setInterval(()=>{if(B.role==='EMPLOYEE'&&document.getElementById('sfEmployeePortal'))refresh()},15000);
  setTimeout(refresh,1300);
})();
