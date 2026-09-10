// SchichtFunk – QR-Status auf der Mitarbeiter-Übersicht V2
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__employeeQrStatusV2)return;B.__employeeQrStatusV2=true;

  let busy=false;
  const demo=()=>sessionStorage.getItem('sf_demo_session_v1')==='active';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tz=()=>B.companyTimeZone||'Europe/Berlin';
  const fmtTime=v=>v?new Intl.DateTimeFormat('de-DE',{timeZone:tz(),hour:'2-digit',minute:'2-digit'}).format(new Date(v)).replace('24:','00:'):'–';
  const fmtDate=v=>v?new Intl.DateTimeFormat('de-DE',{timeZone:tz(),weekday:'short',day:'2-digit',month:'2-digit'}).format(new Date(v)):'–';

  function css(){
    if(document.getElementById('sfEmployeeQrStatusCss'))return;
    const s=document.createElement('style');s.id='sfEmployeeQrStatusCss';s.textContent=`
      #sfEmployeePortal .sf-emp-qr-card{display:block!important;width:100%;margin:0 0 22px;padding:18px 20px;border:1px solid #28594c;border-radius:15px;background:linear-gradient(145deg,#0e2824,#0b1c28);box-shadow:0 12px 30px #02091242;color:#eaf7f4}
      #sfEmployeePortal .sf-emp-qr-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
      #sfEmployeePortal .sf-emp-qr-head h3{margin:0;font-size:15px;color:#eef7ff}
      #sfEmployeePortal .sf-emp-qr-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border:1px solid #2d6d5c;border-radius:999px;background:#102e27;color:#7de4c8;font-size:9px;font-weight:900;white-space:nowrap}
      #sfEmployeePortal .sf-emp-qr-badge.wait{border-color:#735a2d;background:#302217;color:#ffc37e}
      #sfEmployeePortal .sf-emp-qr-badge.done{border-color:#35516a;background:#142435;color:#a9c4df}
      #sfEmployeePortal .sf-emp-qr-badge.demo{border-color:#5c4d87;background:#211c37;color:#c7b9ff}
      #sfEmployeePortal .sf-emp-qr-body{display:grid;grid-template-columns:44px minmax(0,1fr);gap:12px;align-items:start}
      #sfEmployeePortal .sf-emp-qr-icon{width:44px;height:44px;border-radius:11px;display:grid;place-items:center;background:#123b35;color:#69e4cb;font-size:21px;box-shadow:inset 0 0 0 1px #2c6558}
      #sfEmployeePortal .sf-emp-qr-main b{display:block;font-size:13px;color:#eef7ff}
      #sfEmployeePortal .sf-emp-qr-main small{display:block;color:#91a8bb;font-size:10px;line-height:1.55;margin-top:4px}
      #sfEmployeePortal .sf-emp-qr-live{margin-top:11px;padding:9px 10px;border:1px solid #286b59;border-radius:9px;background:#0f3028;color:#96ead4;font-size:10px;line-height:1.5}
      #sfEmployeePortal .sf-emp-qr-live.wait{border-color:#6f5529;background:#2b2114;color:#ffd08a}
      #sfEmployeePortal .sf-emp-qr-live.done{border-color:#29465b;background:#0c1b2a;color:#a8bdcf}
      #sfEmployeePortal .sf-emp-qr-hint{display:inline-flex;align-items:center;gap:6px;margin-top:9px;color:#79d8c5;font-size:9px;font-weight:800}
      @media(max-width:600px){#sfEmployeePortal .sf-emp-qr-card{padding:16px;margin-bottom:18px}#sfEmployeePortal .sf-emp-qr-head{align-items:flex-start}#sfEmployeePortal .sf-emp-qr-body{grid-template-columns:40px minmax(0,1fr)}#sfEmployeePortal .sf-emp-qr-icon{width:40px;height:40px}}
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
    const portal=document.getElementById('sfEmployeePortal');
    if(!portal)return null;
    return portal.querySelector('.sf-employee-dashboard');
  }

  function mount(html){
    const host=target();if(!host)return false;css();
    host.querySelector('#sfEmployeeQrStatus')?.remove();
    const c=document.createElement('section');
    c.id='sfEmployeeQrStatus';c.className='sf-emp-qr-card';c.setAttribute('aria-label','QR-Zeiterfassung');c.innerHTML=html;
    host.insertBefore(c,host.firstChild);
    return true;
  }

  function renderDemo(){
    mount(`<div class="sf-emp-qr-head"><h3>QR-Zeiterfassung</h3><span class="sf-emp-qr-badge demo">DEMO</span></div><div class="sf-emp-qr-body"><div class="sf-emp-qr-icon">▦</div><div class="sf-emp-qr-main"><b>Kommen &amp; Gehen per QR-Code</b><small>Im Echtbetrieb scannt der Mitarbeiter den QR-Code am Objekt/Einsatzort mit der Smartphone-Kamera. SchichtFunk prüft Konto, Schicht und Terminal.</small><span class="sf-emp-qr-hint">📱 QR-Code am Einsatzort scannen</span></div></div><div class="sf-emp-qr-live done">Demo-Vorschau · Es wird keine echte Zeitbuchung ausgelöst.</div>`);
  }

  function render(info,entry){
    if(!info){
      mount('<div class="sf-emp-qr-head"><h3>QR-Zeiterfassung</h3><span class="sf-emp-qr-badge done">BEREIT</span></div><div class="sf-emp-qr-body"><div class="sf-emp-qr-icon">▦</div><div class="sf-emp-qr-main"><b>Kommen &amp; Gehen per QR-Code</b><small>Aktuell steht keine veröffentlichte Schicht an. Bei Dienstbeginn den QR-Code am Objekt/Einsatzort mit der Smartphone-Kamera scannen.</small><span class="sf-emp-qr-hint">📱 QR-Code am Einsatzort scannen</span></div></div>');
      return;
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
    mount(`<div class="sf-emp-qr-head"><h3>QR-Zeiterfassung</h3>${badge}</div><div class="sf-emp-qr-body"><div class="sf-emp-qr-icon">▦</div><div class="sf-emp-qr-main"><b>${esc(s.shift_code||'Schicht')} · ${esc(fmtDate(s.starts_at))}</b><small>Geplant ${esc(fmtTime(s.starts_at))}–${esc(fmtTime(s.ends_at))} · QR-Code am Objekt/Einsatzort</small><span class="sf-emp-qr-hint">📱 QR-Code am Einsatzort scannen</span></div></div>${note}`);
  }

  async function refresh(){
    if(B.role!=='EMPLOYEE'||busy)return;
    if(demo()){renderDemo();return}
    const info=relevantShift();
    if(!info){render(null,null);return}
    if(!B.client){render(info,null);return}
    busy=true;
    try{
      const q=await B.client.from('time_entries').select('assignment_id,actual_start,actual_end,status,source,employee_note').eq('assignment_id',info.shift.id).maybeSingle();
      if(q.error)throw q.error;
      render(info,q.data||null);
    }catch(e){console.debug('[SchichtFunk Mitarbeiter QR]',e?.message||e);render(info,null)}finally{busy=false}
  }

  function schedule(delay=80){setTimeout(refresh,delay)}
  const base=B.openEmployeePortal;if(typeof base==='function')B.openEmployeePortal=function(){const r=base.apply(this,arguments);schedule();return r};
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-sf-employee-view="dashboard"],[data-view="employee-portal"],[data-employee-home]'))schedule()},true);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
  const observer=new MutationObserver(records=>{if(B.role!=='EMPLOYEE')return;const added=records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('.sf-employee-dashboard')||n.querySelector?.('.sf-employee-dashboard'))));if(added)schedule(20)});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setInterval(()=>{if(B.role==='EMPLOYEE'&&document.getElementById('sfEmployeePortal'))refresh()},15000);
  setTimeout(refresh,1000);
})();
