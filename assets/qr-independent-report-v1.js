// Independent QR attendance in the existing manager time view.
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__qrIndependentReport)return;B.__qrIndependentReport=true;
  const MANAGER=new Set(['OWNER','ADMIN','DISPATCHER','PLANNER']);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tz=()=>B.companyTimeZone||'Europe/Berlin';
  const stamp=v=>v?new Intl.DateTimeFormat('de-DE',{timeZone:tz(),day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(v)):'–';
  const clock=v=>v?new Intl.DateTimeFormat('de-DE',{timeZone:tz(),hour:'2-digit',minute:'2-digit'}).format(new Date(v)):'–';
  const month=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:tz(),year:'numeric',month:'2-digit'}).format(new Date());
  let loading=false;
  function shell(){
    if(!MANAGER.has(B.role))return null;
    const view=document.getElementById('view-time');if(!view)return null;
    let card=document.getElementById('sfQrIndependentReport');
    if(!card){card=document.createElement('section');card.id='sfQrIndependentReport';card.className='card';card.style.cssText='margin:14px 0;padding:18px';
      const after=document.getElementById('sfQrTerminalAdmin');if(after)after.after(card);else view.insertBefore(card,document.getElementById('timeStats'));}
    return card;
  }
  function draw(card,rows,error=''){
    const selected=card.querySelector('#sfQrReportMonth')?.value||month();
    card.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><div class="eyebrow">QR-BUCHUNGEN OHNE SCHICHTBEZUG</div><h3 style="margin:4px 0">Beginn, Ende und fünf Pausen</h3><small style="color:var(--muted)">Bezahlte Zeit: Beginn bis Ende, ohne Pausenabzug. Tatsächliche Arbeitszeit: ohne Pausen.</small></div><div style="display:flex;align-items:center;gap:8px"><label for="sfQrReportMonth">Monat</label><input id="sfQrReportMonth" type="month" value="${esc(selected)}"><button class="ghost" id="sfQrReportRefresh">Aktualisieren</button></div></div>${error?`<p style="margin:16px 0;color:var(--red)">${esc(error)}</p>`:''}<div style="overflow:auto;margin-top:15px"><table style="width:100%;min-width:1400px;border-collapse:collapse;text-align:left;font-size:12px"><thead><tr style="color:var(--muted)"><th>Mitarbeiter</th><th>Beginn</th><th>Ende</th>${[1,2,3,4,5].map(n=>`<th>Pause ${n}<br>Beginn – Ende</th>`).join('')}<th>Bezahlte Zeit</th><th>Pausen</th><th>Arbeitszeit</th><th>Standort</th></tr></thead><tbody>${rows.length?rows.map(r=>{const pauses=Array.isArray(r.breaks)?r.breaks:[];return `<tr style="border-top:1px solid var(--line)"><td style="padding:11px 9px"><b>${esc(r.employee_name)}</b><br><small>${esc(r.personnel_no||'')}</small></td><td>${esc(stamp(r.started_at))}</td><td>${esc(stamp(r.ended_at))}</td>${[1,2,3,4,5].map(n=>{const b=pauses.find(x=>Number(x.number)===n);return `<td>${b?esc(clock(b.started_at))+' – '+esc(clock(b.ended_at)):'–'}</td>`}).join('')}<td>${r.paid_minutes==null?'offen':esc(r.paid_minutes)+' Min.'}</td><td>${esc(r.pause_minutes)} Min.</td><td>${r.paid_minutes==null?'offen':esc(Math.max(0,r.paid_minutes-r.pause_minutes))+' Min.'}</td><td>${esc(r.terminal_name)}</td></tr>`}).join(''):'<tr><td colspan="12" style="padding:18px">Keine QR-Buchungen im ausgewählten Monat.</td></tr>'}</tbody></table></div>${rows.length>=500?'<p>Es werden die neuesten 500 Buchungen gezeigt. Bitte einen kleineren Zeitraum wählen.</p>':''}`;
    card.querySelector('#sfQrReportRefresh').onclick=refresh;
    card.querySelector('#sfQrReportMonth').onchange=refresh;
  }
  async function refresh(){const card=shell();if(!card||loading)return;if(!B.client||!B.companyId){draw(card,[],'Cloud-Verbindung wird geladen.');return}
    const selected=card.querySelector('#sfQrReportMonth')?.value||month();if(!/^\d{4}-\d{2}$/.test(selected))return;
    loading=true;const [year,mon]=selected.split('-').map(Number);const last=new Date(Date.UTC(year,mon,0)).getUTCDate();
    try{const q=await B.client.rpc('manager_qr_independent_report',{p_company_id:B.companyId,p_start_date:selected+'-01',p_end_date:selected+'-'+String(last).padStart(2,'0')});if(q.error)throw q.error;draw(card,Array.isArray(q.data)?q.data:[])}catch(e){draw(card,[],e?.message||'Buchungen konnten nicht geladen werden')}finally{loading=false}
  }
  const previous=window.renderTimeTracking;
  if(typeof previous==='function'&&!previous.__sfQrIndependentWrapped){const wrapped=async function(){const result=await previous.apply(this,arguments);await refresh();return result};wrapped.__sfQrIndependentWrapped=true;window.renderTimeTracking=wrapped}
  document.addEventListener('click',e=>{if(e.target.closest('[data-view="time"]'))setTimeout(refresh,120)},true);
  B.qrIndependentReport={refresh};setTimeout(()=>{if(document.getElementById('view-time')?.classList.contains('active'))refresh()},1200);
})();
