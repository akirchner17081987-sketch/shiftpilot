// Independent QR attendance in the existing manager time view.
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__qrIndependentReport)return;B.__qrIndependentReport=true;
  const MANAGER=new Set(['OWNER','ADMIN','DISPATCHER','PLANNER','TIME_TRACKING']);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tz=()=>B.companyTimeZone||'Europe/Berlin';
  const format=(v,options)=>v?new Intl.DateTimeFormat('de-DE',{timeZone:tz(),...options}).format(new Date(v)):'–';
  const date=v=>format(v,{day:'2-digit',month:'2-digit',year:'numeric'});
  const clock=v=>format(v,{hour:'2-digit',minute:'2-digit'});
  const duration=v=>{if(v==null)return 'Läuft';const n=Math.max(0,Math.round(Number(v)||0));const h=Math.floor(n/60),m=n%60;return h?(h+' Std.'+(m?' '+m+' Min.':'')):m+' Min.'};
  const currentMonth=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:tz(),year:'numeric',month:'2-digit'}).format(new Date());
  const initialMonth=currentMonth(),[year,mon]=initialMonth.split('-').map(Number);
  const state={mode:'month',year,month:mon,quarter:Math.ceil(mon/3),page:0,loaded:0,total:0,from:initialMonth+'-01',to:initialMonth+'-'+String(new Date(Date.UTC(year,mon,0)).getUTCDate()).padStart(2,'0'),search:'',rows:[],company:null,error:'',loading:false,expanded:new Set()};
  const PAGE_SIZE=50;
  const iso=(y,m,d)=>new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10);
  const parseDate=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return NaN;const d=new Date(v+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v?d.getTime():NaN};
  function presetRange(){
    if(state.mode==='custom')return;
    const y=Number(state.year);
    if(!Number.isInteger(y)||y<1000||y>9999){state.from='';state.to='';return}
    const first=state.mode==='year'?1:state.mode==='quarter'?(state.quarter-1)*3+1:state.month;
    const count=state.mode==='year'?12:state.mode==='quarter'?3:1;
    state.from=iso(y,first,1);state.to=iso(y,first+count,0);
  }
  function syncControls(card){
    const setValue=(input,value)=>{if(document.activeElement!==input)input.value=String(value)};
    card.querySelectorAll('[data-sfqr-period]').forEach(b=>{const active=b.dataset.sfqrPeriod===state.mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
    card.querySelector('#sfQrReportMonth').closest('label').hidden=state.mode!=='month';
    card.querySelector('#sfQrReportQuarter').closest('label').hidden=state.mode!=='quarter';
    card.querySelector('#sfQrReportYear').closest('label').hidden=state.mode==='custom';
    setValue(card.querySelector('#sfQrReportMonth'),state.month);
    setValue(card.querySelector('#sfQrReportQuarter'),state.quarter);
    setValue(card.querySelector('#sfQrReportYear'),state.year);
    for(const [id,key]of [['#sfQrReportFrom','from'],['#sfQrReportTo','to']]){
      const input=card.querySelector(id);setValue(input,state[key]);input.closest('label').hidden=state.mode!=='custom';
    }
    card.querySelectorAll('[data-sfqr-step]').forEach(b=>b.hidden=state.mode==='custom');
    card.querySelector('#sfQrReportRange').textContent=state.from&&state.to?date(state.from+'T12:00:00Z')+' – '+date(state.to+'T12:00:00Z'):'Bitte ein gültiges Jahr wählen.';
  }
  function shiftPeriod(step){
    if(state.mode==='year')state.year+=step;
    else{
      const offset=state.mode==='quarter'?3*step:step;
      const base=state.mode==='quarter'?(state.quarter-1)*3:state.month-1;
      const d=new Date(Date.UTC(state.year,base+offset,1));
      state.year=d.getUTCFullYear();state.month=d.getUTCMonth()+1;state.quarter=Math.ceil(state.month/3);
    }
    presetRange();
  }
  // Disjoint calendar-month slices keep the existing authorized RPC within its limit.
  function monthSlices(from,to){
    const slices=[];let cursor=from;
    while(cursor<=to){
      const [y,m]=cursor.split('-').map(Number);
      const end=iso(y,m+1,0),last=end<to?end:to;
      slices.push({from:cursor,to:last});
      if(last===to)break;
      cursor=iso(y,m+1,1);
    }
    return slices;
  }
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
#sfQrIndependentReport [hidden]{display:none!important}\n#sfQrIndependentReport .sfqr-periods{display:flex;gap:6px;flex-wrap:wrap;margin:16px 0 10px}\n#sfQrIndependentReport .sfqr-periods .active{border-color:var(--teal);color:var(--teal);background:var(--bg2)}\n#sfQrIndependentReport .sfqr-range{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}\n#sfQrIndependentReport .sfqr-pagination{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:12px;flex-wrap:wrap}\n#sfQrIndependentReport input,#sfQrIndependentReport select{min-height:44px;min-width:0;padding:10px 12px;color:var(--text);background:var(--bg2);border:1px solid var(--line);border-radius:8px;color-scheme:dark}
html[data-sf-theme="light"] #sfQrIndependentReport input,html[data-sf-theme="light"] #sfQrIndependentReport select{color-scheme:light}
#sfQrIndependentReport button{min-height:44px;padding:9px 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg2);color:var(--text);font-size:13px}
#sfQrIndependentReport button:focus-visible,#sfQrIndependentReport input:focus-visible{outline:2px solid var(--teal);outline-offset:2px}
#sfQrIndependentReport .sfqr-scroll{overflow:auto}#sfQrIndependentReport table{width:100%;min-width:760px;border-collapse:collapse;text-align:left;font-size:14px}
#sfQrIndependentReport th{padding:14px 10px;color:var(--muted);font-size:12px}#sfQrIndependentReport td{padding:14px 10px;border-top:1px solid var(--line);vertical-align:middle}
#sfQrIndependentReport .sfqr-name small{display:block;margin-top:5px;color:var(--muted)}#sfQrIndependentReport .sfqr-status{display:inline-block;font-size:11px;margin-top:7px;padding:4px 7px;border:1px solid var(--line);border-radius:6px}
#sfQrIndependentReport .sfqr-status.running{color:var(--teal)}#sfQrIndependentReport .sfqr-end small{display:block;margin-top:4px;color:var(--muted)}
#sfQrIndependentReport .sfqr-detail td{padding:16px;background:var(--bg2)}#sfQrIndependentReport .sfqr-detail[hidden]{display:none}
#sfQrIndependentReport .sfqr-detail-head{display:flex;gap:24px;flex-wrap:wrap;margin-bottom:14px;font-size:13px}#sfQrIndependentReport .sfqr-breaks{max-width:650px;min-width:0;font-size:13px}
#sfQrIndependentReport .sfqr-breaks td,#sfQrIndependentReport .sfqr-breaks th{padding:10px 12px}#sfQrIndependentReport .sfqr-error{color:var(--danger);margin:12px 0}
</style><div class="sfqr-head"><div><div class="eyebrow">QR-BUCHUNGEN OHNE SCHICHTBEZUG</div><h3>Zeiten und Pausen im Überblick</h3><small class="sfqr-muted">Einzelne Pausen und Standort unter „Details“ anzeigen.</small></div><span class="sfqr-paid">Pausen bezahlt – kein Abzug</span></div><div class="sfqr-periods" role="group" aria-label="Zeitraum der QR-Buchungen"><button type="button" data-sfqr-period="month">Monat</button><button type="button" data-sfqr-period="quarter">Quartal</button><button type="button" data-sfqr-period="year">Jahr</button><button type="button" data-sfqr-period="custom">Freier Zeitraum</button></div><div class="sfqr-range"><button type="button" data-sfqr-step="-1" aria-label="Vorheriger Zeitraum">‹</button><b id="sfQrReportRange"></b><button type="button" data-sfqr-step="1" aria-label="Nächster Zeitraum">›</button></div><div class="sfqr-filters"><label>Monat<select id="sfQrReportMonth">${Array.from({length:12},(_,i)=>'<option value="'+(i+1)+'">'+new Intl.DateTimeFormat('de-DE',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2026,i,1)))+'</option>').join('')}</select></label><label>Quartal<select id="sfQrReportQuarter"><option value="1">1. Quartal · Jan–Mär</option><option value="2">2. Quartal · Apr–Jun</option><option value="3">3. Quartal · Jul–Sep</option><option value="4">4. Quartal · Okt–Dez</option></select></label><label>Jahr<input id="sfQrReportYear" type="number" min="1000" max="9999" step="1" value="${state.year}" style="width:100px"></label><label class="sfqr-search">Mitarbeiter suchen<input id="sfQrReportSearch" type="search" placeholder="Name oder Personalnummer" autocomplete="off"></label><label>Von<input id="sfQrReportFrom" type="date" value="${state.from}"></label><label>Bis<input id="sfQrReportTo" type="date" value="${state.to}"></label><button id="sfQrReportRefresh" type="button">Aktualisieren</button></div><p class="sfqr-muted" style="font-size:12px;margin:0 0 10px">Zuordnung nach Dienstbeginn. Dienste über Mitternacht bleiben vollständig erhalten.</p><div id="sfQrReportMessage" role="status" aria-live="polite"></div><div class="sfqr-scroll"><table aria-label="QR-Buchungen"><thead><tr><th scope="col">Mitarbeiter</th><th scope="col">Datum</th><th scope="col">Beginn</th><th scope="col">Ende</th><th scope="col">Bezahlte Zeit</th><th scope="col">Pausen gesamt</th><th scope="col">Details</th></tr></thead><tbody id="sfQrReportRows"></tbody></table></div><div id="sfQrReportPagination" class="sfqr-pagination"><button type="button" id="sfQrReportPagePrev">Vorherige Seite</button><span id="sfQrReportPageInfo"></span><button type="button" id="sfQrReportPageNext">Nächste Seite</button></div>`;
      card.querySelector('#sfQrReportRefresh').onclick=refresh;
      card.querySelector('#sfQrReportSearch').oninput=e=>{state.search=e.target.value;state.page=0;draw(card)};
      card.querySelectorAll('[data-sfqr-period]').forEach(b=>b.onclick=()=>{
        if(state.mode==='custom'&&Number.isFinite(parseDate(state.from))){const [y,m]=state.from.split('-').map(Number);state.year=y;state.month=m;state.quarter=Math.ceil(m/3)}
        state.mode=b.dataset.sfqrPeriod;presetRange();refresh();
      });
      for(const [id,key]of [['#sfQrReportMonth','month'],['#sfQrReportQuarter','quarter'],['#sfQrReportYear','year']])card.querySelector(id).onchange=e=>{state[key]=Number(e.target.value);if(key==='month')state.quarter=Math.ceil(state.month/3);if(key==='quarter')state.month=(state.quarter-1)*3+1;presetRange();refresh()};
      card.querySelectorAll('[data-sfqr-step]').forEach(b=>b.onclick=()=>{shiftPeriod(Number(b.dataset.sfqrStep));refresh()});
      card.querySelector('#sfQrReportPagePrev').onclick=()=>{state.page--;draw(card)};
      card.querySelector('#sfQrReportPageNext').onclick=()=>{state.page++;draw(card)};
      for(const [id,key] of [['#sfQrReportFrom','from'],['#sfQrReportTo','to']])card.querySelector(id).onchange=e=>{state.mode='custom';state[key]=e.target.value;refresh()};
      card.querySelector('#sfQrReportRows').onclick=e=>{const correction=e.target.closest('[data-sfqr-correct]');if(correction){const row=state.rows[Number(correction.dataset.sfqrCorrect)];if(row)B.qrCorrection?.open(row.id);return}const button=e.target.closest('[data-sfqr-detail]');if(!button)return;const index=Number(button.dataset.sfqrDetail),r=state.rows[index];if(!r)return;const key=String(r.id??index);state.expanded.has(key)?state.expanded.delete(key):state.expanded.add(key);draw(card);card.querySelector('[data-sfqr-detail="'+index+'"]')?.focus()};
    }
    return card;
  }
  function draw(card){
    syncControls(card);
    const query=state.search.trim().toLocaleLowerCase('de-DE');
    const visible=state.rows.map((r,i)=>({r,i})).filter(({r})=>[r.employee_name,r.personnel_no].some(v=>String(v??'').toLocaleLowerCase('de-DE').includes(query)));
    card.querySelector('#sfQrReportRefresh').disabled=state.loading;
    card.querySelector('#sfQrReportRefresh').textContent=state.loading?'Lädt …':'Aktualisieren';
    const pages=Math.max(1,Math.ceil(visible.length/PAGE_SIZE));state.page=Math.max(0,Math.min(state.page,pages-1));
    card.querySelector('#sfQrReportPagination').hidden=state.loading||state.error||visible.length<=PAGE_SIZE;
    card.querySelector('#sfQrReportPagePrev').disabled=state.page===0;
    card.querySelector('#sfQrReportPageNext').disabled=state.page===pages-1;
    card.querySelector('#sfQrReportPageInfo').textContent='Seite '+(state.page+1)+' von '+pages+' · '+visible.length+' Buchungen';
    const message=card.querySelector('#sfQrReportMessage');message.className=state.error?'sfqr-error':'sfqr-muted';message.textContent=state.error||(state.loading?'Buchungen werden geladen … ('+state.loaded+' von '+state.total+' Abschnitten)':visible.length+' Buchung'+(visible.length===1?'':'en'));
    card.querySelector('#sfQrReportRows').innerHTML=visible.length?visible.slice(state.page*PAGE_SIZE,(state.page+1)*PAGE_SIZE).map(({r,i})=>{
      const pauses=Array.isArray(r.breaks)?r.breaks:[],open=!r.ended_at,inBreak=open&&pauses.some(p=>!p.ended_at),expanded=state.expanded.has(String(r.id??i)),detailId='sfQrDetails'+i;
      const endDate=r.ended_at&&date(r.ended_at)!==date(r.started_at)?`<small>${esc(date(r.ended_at))}</small>`:'';
      const breakRows=Array.from({length:10},(_,i)=>i+1).map(n=>{const p=pauses.find(v=>Number(v.number)===n);const minutes=p?.ended_at?Math.max(0,(new Date(p.ended_at)-new Date(p.started_at))/60000):null;const end=p?.ended_at?clock(p.ended_at)+(date(p.started_at)!==date(p.ended_at)?' · '+date(p.ended_at):''):p?'Läuft':'–';return `<tr><td>Pause ${n}</td><td>${p?esc(clock(p.started_at))+' · '+esc(date(p.started_at)):'–'}</td><td>${esc(end)}</td><td>${p?esc(duration(minutes)):'–'}</td></tr>`}).join('');
      return `<tr><td class="sfqr-name"><b>${esc(r.employee_name)}</b><small>Personalnr. ${esc(r.personnel_no||'–')}</small>${open?`<span class="sfqr-status running">${Date.now()-Date.parse(r.started_at)>86400000?'Über 24 Std. · Abschluss prüfen':inBreak?'In Pause':'Im Dienst'}</span>`:''}</td><td>${esc(date(r.started_at))}</td><td>${esc(clock(r.started_at))}</td><td class="sfqr-end">${r.ended_at?esc(clock(r.ended_at))+endDate:'Offen'}</td><td><b>${esc(duration(r.paid_minutes))}</b></td><td>${esc(duration(r.pause_minutes))}<br><small class="sfqr-muted">${pauses.length} Pause${pauses.length===1?'':'n'}${inBreak?' · läuft':''}</small></td><td><button type="button" data-sfqr-detail="${i}" aria-expanded="${expanded}" aria-controls="${detailId}" aria-label="Pausen für ${esc(r.employee_name)} ${esc(date(r.started_at))} ${esc(clock(r.started_at))} ${expanded?'ausblenden':'anzeigen'}">${expanded?'▴ Schließen':'▾ Anzeigen'}</button></td></tr><tr id="${detailId}" class="sfqr-detail" ${expanded?'':'hidden'}><td colspan="7"><div class="sfqr-detail-head"><span>Standort: <b>${esc(r.terminal_name||'–')}</b></span><span>Arbeitszeit ohne Pausen: <b>${esc(r.paid_minutes==null?'Läuft':duration(Math.max(0,r.paid_minutes-(r.pause_minutes||0))))}</b></span><span class="sfqr-muted">Pausen werden nicht von der bezahlten Zeit abgezogen.</span></div><button type="button" data-sfqr-correct="${i}">${open?'Dienst nachträglich abschließen':'QR-Buchung korrigieren'}</button><table class="sfqr-breaks" aria-label="Einzelne Pausen"><thead><tr><th scope="col">Pause</th><th scope="col">Beginn</th><th scope="col">Ende</th><th scope="col">Dauer</th></tr></thead><tbody>${breakRows}</tbody></table></td></tr>`;
    }).join(''):`<tr><td colspan="7">${state.loading?'Buchungen werden geladen …':state.error?'Bitte Filter prüfen oder erneut aktualisieren.':query?'Keine passenden Mitarbeiter gefunden.':'Keine QR-Buchungen im ausgewählten Zeitraum.'}</td></tr>`;
  }
  function validRange(){
    const start=parseDate(state.from),end=parseDate(state.to);
    return Number.isFinite(start)&&Number.isFinite(end)&&end>=start&&(end-start)/86400000<366;
  }
  let request=0;
  async function refresh(){
    const version=++request,card=shell();if(!card)return;
    const company=B.companyId,client=B.client;
    const active=()=>version===request&&company===B.companyId&&client===B.client&&MANAGER.has(B.role);
    if(state.company!==company){state.rows=[];state.expanded.clear();state.company=company}
    if(!client||!company){state.rows=[];state.loading=false;state.error='Cloud-Verbindung wird geladen.';draw(card);return}
    if(!validRange()){state.rows=[];state.loading=false;state.error='Bitte einen gültigen Zeitraum von höchstens 366 Tagen wählen.';draw(card);return}
    const slices=monthSlices(state.from,state.to),rows=[];
    state.loading=true;state.error='';state.rows=[];state.page=0;state.expanded.clear();state.loaded=0;state.total=slices.length;draw(card);
    try{
      // Two workers avoid one oversized annual query and bound network concurrency.
      let next=0,failed=false;
      const worker=async()=>{while(active()&&!failed&&next<slices.length){
        const slice=slices[next++];
        const q=await client.rpc('manager_qr_independent_report',{p_company_id:company,p_start_date:slice.from,p_end_date:slice.to});
        if(!active()||failed)return;
        if(q.error){failed=true;throw q.error}
        if(!Array.isArray(q.data)){failed=true;throw new Error('Buchungen konnten nicht vollständig geladen werden. Bitte erneut aktualisieren.')}
        rows.push(...q.data);state.loaded++;draw(card);
      }};
      await Promise.all([worker().catch(e=>{failed=true;throw e}),worker().catch(e=>{failed=true;throw e})]);
      if(!active())return;
      state.rows=Array.from(new Map(rows.map(r=>[r.id,r])).values()).sort((a,b)=>Date.parse(b.started_at)-Date.parse(a.started_at)||String(a.id).localeCompare(String(b.id)));
    }
    catch(e){if(!active())return;state.rows=[];state.error=e?.message||'Buchungen konnten nicht vollständig geladen werden. Bitte erneut aktualisieren.'}
    finally{if(active()){state.loading=false;draw(card)}}
  }
  const previous=window.renderTimeTracking;
  if(typeof previous==='function'&&!previous.__sfQrIndependentWrapped){const wrapped=async function(){const result=await previous.apply(this,arguments);await refresh();return result};wrapped.__sfQrIndependentWrapped=true;window.renderTimeTracking=wrapped}
  document.addEventListener('click',e=>{if(e.target.closest('[data-view="time"]'))setTimeout(refresh,120)},true);
  B.qrIndependentReport={refresh};setTimeout(()=>{if(document.getElementById('view-time')?.classList.contains('active'))refresh()},1200);
})();
