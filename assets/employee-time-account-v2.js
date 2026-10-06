// SchichtFunk – persönliches Stundenkonto, lesbare Monatswerte und Verlauf.
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.renderEmployeeTimeAccountV2)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const valid=v=>/^\d{4}-(0[1-9]|1[0-2])$/.test(v||'');
  const current=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:B.companyTimeZone||'Europe/Berlin',year:'numeric',month:'2-digit'}).format(new Date());
  const selected=()=>valid(B.employeeFinanceMonth)?B.employeeFinanceMonth:current();
  const shift=(m,n)=>{const [y,mo]=m.split('-').map(Number),d=new Date(Date.UTC(y,mo-1+n,1));return d.toISOString().slice(0,7)};
  const label=m=>new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(m+'-01T12:00:00Z'));
  const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||'').slice(0,10))?new Date(String(v).slice(0,10)+'T12:00:00Z').toLocaleDateString('de-DE',{timeZone:'UTC'}):'Nicht hinterlegt';
  const scope=()=>[B.user?.id,B.companyId,B.employeeDbId||B.employeePortalData?.employee?.id].join('|');
  let sequence=0,historySequence=0,owner='',data=null,dataMonth='',loading=false,loadError='',format='decimal',historyOpen=false,historyRows=null,historyError='',updated='';
  const tone=n=>Number(n)>0?'positive':Number(n)<0?'negative':'neutral';
  const hours=(v,signed=false)=>{if(v==null||!Number.isFinite(Number(v)))return '–';const n=Math.round(Number(v)),prefix=n<0?'−':signed&&n>0?'+':'';return format==='clock'?`${prefix}${Math.floor(Math.abs(n)/60)}:${String(Math.abs(n)%60).padStart(2,'0')} h`:`${prefix}${(Math.abs(n)/60).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})} Std.`};
  function css(){if(document.getElementById('sfAccountV2Css'))return;const s=document.createElement('link');s.id='sfAccountV2Css';s.rel='stylesheet';s.href='assets/employee-time-account-v2.css?v=20261002-account1';document.head.appendChild(s)}
  function shell(){
    const portal=document.getElementById('sfEmployeePortal');if(!portal)return null;
    let card=portal.querySelector('#sfEmployeeTimeAccount');
    if(!card){card=document.createElement('section');card.id='sfEmployeeTimeAccount';card.className='sf-portal-card sf-ta-employee';portal.querySelector('.sf-portal-grid')?.appendChild(card)}
    card.dataset.sfPortalSection='account';
    if(card.dataset.accountV2!=='1'){
      card.dataset.accountV2='1';card.innerHTML=`<header class="sf-ac-head"><div><span class="sf-ac-eyebrow">DEINE ZEIT. DEIN ÜBERBLICK.</span><h3>Stundenkonto</h3><p>Monatssoll, bestätigte Stunden und dein Kontostand.</p></div><button type="button" data-ac="refresh">↻ Aktualisieren</button></header><div class="sf-ac-controls"><div class="sf-ac-month"><button type="button" data-ac="previous" aria-label="Vorheriger Monat">‹</button><label><span>Monat</span><input type="month" id="sfAccountMonth" aria-label="Monat für Stundenkonto und Lohnvorschau"></label><button type="button" data-ac="next" aria-label="Nächster Monat">›</button><button type="button" data-ac="today">Aktueller Monat</button></div><label class="sf-ac-format">Anzeige<select id="sfAccountFormat"><option value="decimal">Dezimalstunden</option><option value="clock">Stunden : Minuten</option></select></label></div><div class="sf-ac-feedback" role="status" aria-live="polite"></div><div class="sf-ac-content"></div><footer class="sf-ac-actions"><button type="button" data-ac="history" aria-expanded="false">Monatsverlauf anzeigen</button><button type="button" data-ac="export">↓ Monat als CSV</button><button type="button" data-ac="time">Arbeitszeit öffnen ↗</button></footer><div class="sf-ac-history"></div><p class="sf-ac-sync">Die Monatsauswahl gilt auch für deine Lohnvorschau.</p>`;
      card.querySelector('#sfAccountMonth').onchange=e=>choose(e.target.value);
      card.querySelector('#sfAccountFormat').onchange=e=>{format=e.target.value;draw(card);drawHistory(card)};
      card.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!card.contains(b))return;
        if(b.dataset.acMonth){choose(b.dataset.acMonth);return}
        switch(b.dataset.ac){case'previous':choose(shift(selected(),-1));break;case'next':choose(shift(selected(),1));break;case'today':choose(current());break;case'refresh':render();break;case'history':historyOpen=!historyOpen;drawHistory(card);if(historyOpen)loadHistory();break;case'export':download();break;case'time':B.employeePortalNavigate?.('time');break;}
      });
    }
    return card;
  }
  function choose(month){if(!valid(month)){const c=shell();if(c)c.querySelector('#sfAccountMonth').value=selected();return}if(month===selected())return;B.employeeFinanceMonth=month;document.dispatchEvent(new CustomEvent('sf:employee-finance-month-change',{detail:{month}}))}
  function draw(card){
    card.querySelector('#sfAccountMonth').value=selected();card.querySelector('#sfAccountFormat').value=format;
    card.querySelector('[data-ac="refresh"]').disabled=loading;
    card.querySelector('[data-ac="export"]').disabled=loading||!data||dataMonth!==selected()||!!loadError;
    card.querySelector('.sf-ac-feedback').textContent=loadError||(loading?'Monatswerte werden geladen …':updated?'Aktualisiert um '+updated:'');
    const content=card.querySelector('.sf-ac-content');content.setAttribute('aria-busy',String(loading));
    if(!data||dataMonth!==selected()){content.innerHTML=`<div class="sf-ac-empty">${loadError?'Die Monatswerte sind derzeit nicht verfügbar. Bitte erneut aktualisieren.':'Dein Stundenkonto wird geladen …'}</div>`;return}
    const r=data,m=dataMonth,future=m>current(),running=m===current(),pending=Number(r.pending_entries||0),started=r.account_started===true;
    const kpi=(title,value,note,kind='')=>`<article class="sf-ac-kpi ${kind}"><span>${title}</span><strong>${value.replace(/ (Std\.|h)$/, ' <small>$1</small>')}</strong><p>${note}</p></article>`;
    const line=(title,value,extra='')=>`<div><dt>${title}${extra?`<small>${extra}</small>`:''}</dt><dd>${value}</dd></div>`;
    const total=Number(r.credited_total_minutes),target=Number(r.target_minutes),percent=target>0?Math.round(total/target*100):null;
    const holidays=Array.isArray(r.holidays)?r.holidays:[];
    content.innerHTML=`<div class="sf-ac-period"><h4>${esc(label(m))}</h4><span>${future?'Zukünftiger Monat':running?'Laufender Monat':'Vergangener Monat'}</span></div><div class="sf-ac-kpis">${kpi('Kontostand zum Monatsende',started?hours(r.account_balance_minutes,true):'Noch nicht aktiv',started?'Rechnerischer Stand inklusive Startsaldo und Vorperioden.':'Kontostart: '+esc(date(r.effective_account_start)),'hero '+(started?tone(r.account_balance_minutes):'neutral'))}${kpi('Monatsdifferenz',hours(r.month_balance_minutes,true),'Angerechnete Zeit minus Monatssoll.',tone(r.month_balance_minutes))}${kpi('Angerechnete Zeit',hours(r.credited_total_minutes),'Abgeschlossene QR-Dienste und bestätigte Arbeit plus Abwesenheitsgutschrift.')}${kpi('Monatssoll',hours(r.target_minutes),'Soll für den vollständigen ausgewählten Monat.')}</div>${future||running?`<div class="sf-ac-notice"><b>${future?'Vorschau auf den ganzen Monat':'Der Monat läuft noch'}</b><p>Die Differenz zieht bereits das gesamte Monatssoll ab. Fehlende oder noch unbestätigte Arbeitszeiten können den Wert verändern. Ein negativer Wert ist deshalb kein Nachweis bereits entstandener Fehlstunden.</p></div>`:''}${pending?`<div class="sf-ac-pending"><b>${pending} ${pending===1?'Zeiteintrag wartet':'Zeiteinträge warten'} auf Prüfung</b><p>Diese Zeiten sind noch nicht als bestätigte Arbeitszeit enthalten. Details findest du unter „Arbeitszeit“.</p></div>`:''}<div class="sf-ac-columns"><section class="sf-ac-panel"><h4>So setzt sich dein Monat zusammen</h4><dl>${line('Bestätigte Arbeitszeit',hours(r.confirmed_work_minutes),'Abgeschlossene QR-Dienste und bestätigte Zeitmeldungen')}${line('+ Abwesenheitsgutschrift',hours(r.absence_credit_minutes),'Anrechenbare, bestätigte Abwesenheiten')}${line('= Angerechnete Zeit',hours(r.credited_total_minutes))}${line('− Monatssoll',hours(r.target_minutes))}${line('= Monatsdifferenz',hours(r.month_balance_minutes,true))}</dl>${percent!==null?`<div class="sf-ac-progress-head"><span>Angerechnet vom Monatssoll</span><b>${percent} %</b></div><div class="sf-ac-track" role="progressbar" aria-label="Angerechnete Zeit vom Monatssoll" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.max(0,Math.min(100,percent))}" aria-valuetext="${percent} Prozent"><i style="width:${Math.max(0,Math.min(100,percent))}%"></i></div>`:'<p class="sf-ac-muted">Ohne Monatssoll wird kein Prozentwert berechnet.</p>'}</section><section class="sf-ac-panel"><h4>Grundlagen deines Kontos</h4><dl>${line('Vertragliche Wochenstunden',esc(Number(r.weekly_hours||0).toLocaleString('de-DE'))+' Std.')}${line('Kontostart',esc(date(r.effective_account_start)))}${line('Hinterlegter Startsaldo',hours(r.opening_balance_minutes,true))}${line('Feiertagsabzug vom Soll',hours(r.holiday_minutes),'Bereits im angezeigten Monatssoll berücksichtigt')}</dl><p class="sf-ac-muted">Das Soll basiert auf Wochenstunden ÷ 5 und den aktiven Werktagen Montag bis Freitag. Gesetzliche Feiertage werden nach der hinterlegten Region berücksichtigt.</p>${r.opening_note?`<details><summary>Hinweis zum Startsaldo</summary><p>${esc(r.opening_note)}</p></details>`:''}<p class="sf-ac-muted">Monatsdifferenz und Kontostand sind unterschiedliche Werte: Das Konto berücksichtigt zusätzlich frühere Perioden und den Startsaldo. Die Anzeige bestätigt keinen Monatsabschluss.</p></section></div><section class="sf-ac-panel sf-ac-holidays"><h4>Feiertage im ${esc(label(m))}</h4><p class="sf-ac-muted">Hinterlegte Region: ${esc(r.federal_state==='DE-SN'?'Sachsen':r.federal_state==='DE'?'Bundesweite Feiertage':r.federal_state||'Nicht hinterlegt')}</p><div class="sf-ac-holiday-list">${holidays.length?holidays.map(x=>{const weekend=[0,6].includes(new Date(String(x.date).slice(0,10)+'T12:00:00Z').getUTCDay());return `<div><b>${esc(x.name)}</b><span>${esc(date(x.date))}</span><small>${weekend?'Wochenende · kein zusätzlicher Sollabzug':'Werktag · im Feiertagsabzug berücksichtigt'}</small></div>`}).join(''):'<p>Keine gesetzlichen Feiertage für diese Region in diesem Monat.</p>'}</div></section>`;
  }
  async function fetchMonth(month){const q=await B.client.rpc('employee_my_time_account_month',{p_month:month+'-01'});if(q.error)throw q.error;const r=typeof q.data==='string'?JSON.parse(q.data):q.data;
    if(!r||!['target_minutes','credited_total_minutes','month_balance_minutes','account_balance_minutes'].every(k=>r[k]!=null&&Number.isFinite(Number(r[k]))))throw Error('Unvollständige Monatswerte');
    const employee=B.employeeDbId||B.employeePortalData?.employee?.id;if(r.employee_id&&employee&&String(r.employee_id)!==String(employee))throw Error('Abweichender Mitarbeiter');return r;
  }
  async function render(){
    if(B.role!=='EMPLOYEE'||!B.client)return;const who=scope();
    if(owner!==who){owner=who;data=null;dataMonth='';historyRows=null;historyError='';historyOpen=false;historySequence++;updated=''}
    css();const card=shell();if(!card)return;const request=++sequence,month=selected();if(dataMonth!==month){historyRows=null;historyError='';historySequence++}loading=true;loadError='';draw(card);drawHistory(card);
    try{const result=await fetchMonth(month);if(request!==sequence||scope()!==who||B.role!=='EMPLOYEE'||!card.isConnected)return;data=result;dataMonth=month;updated=new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});}
    catch(e){if(request!==sequence||scope()!==who||B.role!=='EMPLOYEE')return;loadError='Aktualisierung fehlgeschlagen. '+(data&&dataMonth===month?'Die zuletzt geladenen Werte bleiben sichtbar.':'Bitte versuche es erneut.');console.warn('Stundenkonto konnte nicht geladen werden',e)}
    finally{if(request===sequence&&scope()===who&&B.role==='EMPLOYEE'&&card.isConnected){loading=false;draw(card);if(historyOpen)loadHistory()}}
  }
  function drawHistory(card){
    const btn=card.querySelector('[data-ac="history"]'),host=card.querySelector('.sf-ac-history');btn.setAttribute('aria-expanded',String(historyOpen));btn.textContent=historyOpen?'Monatsverlauf ausblenden':'Monatsverlauf anzeigen';
    if(!historyOpen){host.innerHTML='';return}
    host.innerHTML=`<section class="sf-ac-panel"><h4>Sechs Monate im Überblick</h4><p class="sf-ac-muted">Bis einschließlich ${esc(label(selected()))}. Ein Klick auf den Monat öffnet seine Details.</p>${historyError?`<p role="alert">${esc(historyError)} Nutze „Aktualisieren“, um es erneut zu versuchen.</p>`:!historyRows?'<p role="status">Monatsverlauf wird geladen …</p>':`<div class="sf-ac-table-scroll"><table><thead><tr><th>Monat</th><th>Soll</th><th>Angerechnet</th><th>Differenz</th><th>Konto</th></tr></thead><tbody>${historyRows.map(({month,row})=>`<tr><th><button type="button" data-ac-month="${month}">${esc(label(month))}</button></th><td>${hours(row.target_minutes)}</td><td>${hours(row.credited_total_minutes)}</td><td class="${tone(row.month_balance_minutes)}">${hours(row.month_balance_minutes,true)}</td><td>${row.account_started?hours(row.account_balance_minutes,true):'Nicht aktiv'}</td></tr>`).join('')}</tbody></table></div>`}</section>`;
  }
  async function loadHistory(){const id=++historySequence,who=scope(),month=selected(),card=shell();historyRows=null;historyError='';drawHistory(card);
    try{const rows=await Promise.all(Array.from({length:6},(_,i)=>shift(month,-5+i)).map(async m=>({month:m,row:m===dataMonth&&data?data:await fetchMonth(m)})));if(id!==historySequence||who!==scope()||month!==selected()||B.role!=='EMPLOYEE')return;historyRows=rows;}
    catch{if(id!==historySequence||who!==scope()||B.role!=='EMPLOYEE')return;historyError='Der Verlauf konnte nicht geladen werden.'}
    if(id===historySequence&&who===scope()&&B.role==='EMPLOYEE'&&card.isConnected)drawHistory(card);
  }
  function download(){if(B.role!=='EMPLOYEE'||owner!==scope()||!data||loading||loadError||dataMonth!==selected())return;const n=v=>v==null?'':(Number(v)/60).toFixed(2).replace('.',',');
    const rows=[['Monat','Soll (Std.)','Bestätigte Arbeitszeit (Std.)','Abwesenheitsgutschrift (Std.)','Angerechnet (Std.)','Monatsdifferenz (Std.)','Kontostand Monatsende (Std.)','Offene Einträge'],[dataMonth,n(data.target_minutes),n(data.confirmed_work_minutes),n(data.absence_credit_minutes),n(data.credited_total_minutes),n(data.month_balance_minutes),data.account_started?n(data.account_balance_minutes):'',String(data.pending_entries||0)]];
    const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='SchichtFunk-Stundenkonto-'+dataMonth+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  B.renderEmployeeTimeAccountV2=render;
  setTimeout(render,0);
})();
