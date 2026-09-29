// Independent QR attendance in the existing manager time view.
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__qrIndependentReport)return;B.__qrIndependentReport=true;
  const MANAGER=new Set(['OWNER','ADMIN','DISPATCHER','PLANNER']);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tz=()=>B.companyTimeZone||'Europe/Berlin';
  const format=(v,options)=>v?new Intl.DateTimeFormat('de-DE',{timeZone:tz(),...options}).format(new Date(v)):'–';
  const date=v=>format(v,{day:'2-digit',month:'2-digit',year:'numeric'});
  const clock=v=>format(v,{hour:'2-digit',minute:'2-digit'});
  const duration=v=>{if(v==null)return 'Läuft';const n=Math.max(0,Math.round(Number(v)||0));const h=Math.floor(n/60),m=n%60;return h?(h+' Std.'+(m?' '+m+' Min.':'')):m+' Min.'};
  const currentMonth=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:tz(),year:'numeric',month:'2-digit'}).format(new Date());
  const initialMonth=currentMonth(),[year,mon]=initialMonth.split('-').map(Number);
  const state={from:initialMonth+'-01',to:initialMonth+'-'+String(new Date(Date.UTC(year,mon,0)).getUTCDate()).padStart(2,'0'),search:'',rows:[],company:null,error:'',loading:false,expanded:new Set()};
  function shell(){
    if(!MANAGER.has(B.role))return null;
    const view=document.getElementById('view-time');if(!view)return null;
    let card=document.getElementById('sfQrIndependentReport');
    if(!card){card=document.createElement('section');card.id='sfQrIndependentReport';card.className='card';card.style.cssText='margin:14px 0;padding:18px';
      const after=document.getElementById('sfQrTerminalAdmin');if(after)after.after(card);else view.insertBefore(card,document.getElementById('timeStats'));
      card.innerHTML=`<style>
#sfQrIndependentReport .sfqr-head{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}
#sfQrIndependentReport h3{margin:5px 0 8px}#sfQrIndependentReport .sfqr-muted{color:var(--muted)}
#sfQrIndependentReport .sfqr-paid{display:inline-block;border:1px solid var(--line);border-radius:20px;padding:7px 12px;font-size:12px;font-weight:700}
#sfQrIndependentReport .sfqr-filters{display:flex;align-items:flex-end;flex-wrap:wrap;gap:12px;margin:20px 0 12px}
#sfQrIndependentReport label{display:grid;gap:6px;font-size:12px;font-weight:600}#sfQrIndependentReport .sfqr-search{flex:1;min-width:190px}
#sfQrIndependentReport input{min-height:44px;min-width:0;padding:10px 12px;color:var(--text);background:var(--bg2);border:1px solid var(--line);border-radius:8px;color-scheme:dark}
html[data-sf-theme="light"] #sfQrIndependentReport input{color-scheme:light}
#sfQrIndependentReport button{min-height:44px;padding:9px 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg2);color:var(--text);font-size:13px}
#sfQrIndependentReport button:focus-visible,#sfQrIndependentReport input:focus-visible{outline:2px solid var(--teal);outline-offset:2px}
#sfQrIndependentReport .sfqr-scroll{overflow:auto}#sfQrIndependentReport table{width:100%;min-width:760px;border-collapse:collapse;text-align:left;font-size:14px}
#sfQrIndependentReport th{padding:14px 10px;color:var(--muted);font-size:12px}#sfQrIndependentReport td{padding:14px 10px;border-top:1px solid var(--line);vertical-align:middle}
#sfQrIndependentReport .sfqr-name small{display:block;margin-top:5px;color:var(--muted)}#sfQrIndependentReport .sfqr-status{display:inline-block;font-size:11px;margin-top:7px;padding:4px 7px;border:1px solid var(--line);border-radius:6px}
#sfQrIndependentReport .sfqr-status.running{color:var(--teal)}#sfQrIndependentReport .sfqr-end small{display:block;margin-top:4px;color:var(--muted)}
#sfQrIndependentReport .sfqr-detail td{padding:16px;background:var(--bg2)}#sfQrIndependentReport .sfqr-detail[hidden]{display:none}
#sfQrIndependentReport .sfqr-detail-head{display:flex;gap:24px;flex-wrap:wrap;margin-bottom:14px;font-size:13px}#sfQrIndependentReport .sfqr-breaks{max-width:650px;min-width:0;font-size:13px}
#sfQrIndependentReport .sfqr-breaks td,#sfQrIndependentReport .sfqr-breaks th{padding:10px 12px}#sfQrIndependentReport .sfqr-error{color:var(--danger);margin:12px 0}
</style><div class="sfqr-head"><div><div class="eyebrow">QR-BUCHUNGEN OHNE SCHICHTBEZUG</div><h3>Zeiten und Pausen im Überblick</h3><small class="sfqr-muted">Einzelne Pausen und Standort unter „Details“ anzeigen.</small></div><span class="sfqr-paid">Pausen bezahlt – kein Abzug</span></div><div class="sfqr-filters"><label class="sfqr-search">Mitarbeiter suchen<input id="sfQrReportSearch" type="search" placeholder="Name oder Personalnummer" autocomplete="off"></label><label>Von<input id="sfQrReportFrom" type="date" value="${state.from}"></label><label>Bis<input id="sfQrReportTo" type="date" value="${state.to}"></label><button id="sfQrReportRefresh" type="button">Aktualisieren</button></div><div id="sfQrReportMessage" role="status" aria-live="polite"></div><div class="sfqr-scroll"><table aria-label="QR-Buchungen"><thead><tr><th scope="col">Mitarbeiter</th><th scope="col">Datum</th><th scope="col">Beginn</th><th scope="col">Ende</th><th scope="col">Bezahlte Zeit</th><th scope="col">Pausen gesamt</th><th scope="col">Details</th></tr></thead><tbody id="sfQrReportRows"></tbody></table></div>`;
      card.querySelector('#sfQrReportRefresh').onclick=refresh;
      card.querySelector('#sfQrReportSearch').oninput=e=>{state.search=e.target.value;draw(card)};
      for(const [id,key] of [['#sfQrReportFrom','from'],['#sfQrReportTo','to']])card.querySelector(id).onchange=e=>{state[key]=e.target.value;refresh()};
      card.querySelector('#sfQrReportRows').onclick=e=>{const button=e.target.closest('[data-sfqr-detail]');if(!button)return;const index=Number(button.dataset.sfqrDetail),r=state.rows[index];if(!r)return;const key=String(r.id??index);state.expanded.has(key)?state.expanded.delete(key):state.expanded.add(key);draw(card);card.querySelector('[data-sfqr-detail="'+index+'"]')?.focus()};
    }
    return card;
  }
  function draw(card){
    const query=state.search.trim().toLocaleLowerCase('de-DE');
    const visible=state.rows.map((r,i)=>({r,i})).filter(({r})=>[r.employee_name,r.personnel_no].some(v=>String(v??'').toLocaleLowerCase('de-DE').includes(query)));
    card.querySelector('#sfQrReportRefresh').disabled=state.loading;
    card.querySelector('#sfQrReportRefresh').textContent=state.loading?'Lädt …':'Aktualisieren';
    const message=card.querySelector('#sfQrReportMessage');message.className=state.error?'sfqr-error':'sfqr-muted';message.textContent=state.error||(state.loading?'Buchungen werden geladen …':visible.length+' Buchung'+(visible.length===1?'':'en'));
    card.querySelector('#sfQrReportRows').innerHTML=visible.length?visible.map(({r,i})=>{
      const pauses=Array.isArray(r.breaks)?r.breaks:[],open=!r.ended_at,inBreak=open&&pauses.some(p=>!p.ended_at),expanded=state.expanded.has(String(r.id??i)),detailId='sfQrDetails'+i;
      const endDate=r.ended_at&&date(r.ended_at)!==date(r.started_at)?`<small>${esc(date(r.ended_at))}</small>`:'';
      const breakRows=[1,2,3,4,5].map(n=>{const p=pauses.find(v=>Number(v.number)===n);const minutes=p?.ended_at?Math.max(0,(new Date(p.ended_at)-new Date(p.started_at))/60000):null;const end=p?.ended_at?clock(p.ended_at)+(date(p.started_at)!==date(p.ended_at)?' · '+date(p.ended_at):''):p?'Läuft':'–';return `<tr><td>Pause ${n}</td><td>${p?esc(clock(p.started_at))+' · '+esc(date(p.started_at)):'–'}</td><td>${esc(end)}</td><td>${p?esc(duration(minutes)):'–'}</td></tr>`}).join('');
      return `<tr><td class="sfqr-name"><b>${esc(r.employee_name)}</b><small>Personalnr. ${esc(r.personnel_no||'–')}</small>${open?`<span class="sfqr-status running">${inBreak?'In Pause':'Im Dienst'}</span>`:''}</td><td>${esc(date(r.started_at))}</td><td>${esc(clock(r.started_at))}</td><td class="sfqr-end">${r.ended_at?esc(clock(r.ended_at))+endDate:'Offen'}</td><td><b>${esc(duration(r.paid_minutes))}</b></td><td>${esc(duration(r.pause_minutes))}<br><small class="sfqr-muted">${pauses.length} Pause${pauses.length===1?'':'n'}${inBreak?' · läuft':''}</small></td><td><button type="button" data-sfqr-detail="${i}" aria-expanded="${expanded}" aria-controls="${detailId}" aria-label="Pausen für ${esc(r.employee_name)} ${esc(date(r.started_at))} ${esc(clock(r.started_at))} ${expanded?'ausblenden':'anzeigen'}">${expanded?'▴ Schließen':'▾ Anzeigen'}</button></td></tr><tr id="${detailId}" class="sfqr-detail" ${expanded?'':'hidden'}><td colspan="7"><div class="sfqr-detail-head"><span>Standort: <b>${esc(r.terminal_name||'–')}</b></span><span>Arbeitszeit ohne Pausen: <b>${esc(r.paid_minutes==null?'Läuft':duration(Math.max(0,r.paid_minutes-(r.pause_minutes||0))))}</b></span><span class="sfqr-muted">Pausen werden nicht von der bezahlten Zeit abgezogen.</span></div><table class="sfqr-breaks" aria-label="Einzelne Pausen"><thead><tr><th scope="col">Pause</th><th scope="col">Beginn</th><th scope="col">Ende</th><th scope="col">Dauer</th></tr></thead><tbody>${breakRows}</tbody></table></td></tr>`;
    }).join(''):`<tr><td colspan="7">${state.loading?'Buchungen werden geladen …':state.error?'Bitte Filter prüfen oder erneut aktualisieren.':query?'Keine passenden Mitarbeiter gefunden.':'Keine QR-Buchungen im ausgewählten Zeitraum.'}</td></tr>`;
  }
  function validRange(){
    const parse=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return NaN;const d=new Date(v+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v?d.getTime():NaN};
    const start=parse(state.from),end=parse(state.to);return Number.isFinite(start)&&Number.isFinite(end)&&end>=start&&(end-start)/86400000<63;
  }
  let request=0;
  async function refresh(){
    const card=shell();if(!card)return;
    const version=++request,company=B.companyId;
    if(state.company!==company){state.rows=[];state.expanded.clear();state.company=company}
    if(!B.client||!company){state.rows=[];state.loading=false;state.error='Cloud-Verbindung wird geladen.';draw(card);return}
    if(!validRange()){state.rows=[];state.loading=false;state.error='Bitte einen gültigen Zeitraum von höchstens 63 Tagen wählen.';draw(card);return}
    state.loading=true;state.error='';state.rows=[];draw(card);
    try{const q=await B.client.rpc('manager_qr_independent_report',{p_company_id:company,p_start_date:state.from,p_end_date:state.to});if(version!==request||company!==B.companyId||!MANAGER.has(B.role))return;if(q.error)throw q.error;state.rows=Array.isArray(q.data)?q.data:[]}
    catch(e){if(version!==request||company!==B.companyId)return;state.rows=[];state.error=e?.message||'Buchungen konnten nicht geladen werden.'}
    finally{if(version===request&&company===B.companyId){state.loading=false;draw(card)}}
  }
  const previous=window.renderTimeTracking;
  if(typeof previous==='function'&&!previous.__sfQrIndependentWrapped){const wrapped=async function(){const result=await previous.apply(this,arguments);await refresh();return result};wrapped.__sfQrIndependentWrapped=true;window.renderTimeTracking=wrapped}
  document.addEventListener('click',e=>{if(e.target.closest('[data-view="time"]'))setTimeout(refresh,120)},true);
  B.qrIndependentReport={refresh};setTimeout(()=>{if(document.getElementById('view-time')?.classList.contains('active'))refresh()},1200);
})();
