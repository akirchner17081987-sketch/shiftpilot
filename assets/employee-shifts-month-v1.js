// Personal monthly schedule; uses only published employee-portal data.
(function(){
  const root=typeof window!=='undefined'?window:globalThis;
  const B=root.SFBackend=root.SFBackend||{};
  const validMonth=m=>/^\d{4}-(0[1-9]|1[0-2])$/.test(m)&&Number(m.slice(0,4))>=1900&&Number(m.slice(0,4))<=2100;
  const zone=d=>d.company?.timezone||B.companyTimeZone||'Europe/Berlin';
  function dayKey(value,tz){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;}
  const hours=s=>Math.max(0,(new Date(s.ends_at)-new Date(s.starts_at))/3600000-Math.max(0,Number(s.break_minutes)||0)/60);
  function published(data){return (data.shifts||[]).filter(s=>s.published_at&&(!s.status||s.status==='PUBLISHED')&&Number.isFinite(+new Date(s.starts_at))&&Number.isFinite(+new Date(s.ends_at))&&new Date(s.ends_at)>new Date(s.starts_at)).slice().sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));}
  function moveMonth(month,delta){const [y,m]=month.split('-').map(Number),date=new Date(Date.UTC(y,m-1+delta,1));return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;}
  function model(data,month,now=new Date()){
    if(!validMonth(month))throw Error('Ung\u00fcltiger Monat');
    const tz=zone(data),all=published(data),shifts=all.filter(s=>dayKey(s.starts_at,tz).slice(0,7)===month),byDay=new Map();
    for(const s of shifts){const key=dayKey(s.starts_at,tz);if(!byDay.has(key))byDay.set(key,[]);byDay.get(key).push(s);}
    const [year,m]=month.split('-').map(Number),first=new Date(Date.UTC(year,m-1,1)),offset=(first.getUTCDay()+6)%7,days=new Date(Date.UTC(year,m,0)).getUTCDate();
    const cells=Array.from({length:Math.ceil((offset+days)/7)*7},(_,i)=>{const date=new Date(Date.UTC(year,m-1,1-offset+i)),key=date.toISOString().slice(0,10);return {key,day:date.getUTCDate(),inMonth:key.slice(0,7)===month,weekend:date.getUTCDay()===0||date.getUTCDay()===6,shifts:byDay.get(key)||[]};});
    return {month,tz,all,shifts,byDay,cells,hours:shifts.reduce((sum,s)=>sum+hours(s),0),workDays:byDay.size,next:shifts.find(s=>new Date(s.starts_at)>=now),availableMonths:[...new Set(all.map(s=>dayKey(s.starts_at,tz).slice(0,7)))].sort()};
  }
  const api=root.SFEmployeeMonthView={model,dayKey,hours,moveMonth,validMonth};
  if(typeof document==='undefined')return;
  let owner='',selectedMonth='',selectedDay='',view='',lastSignature='';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=n=>new Intl.NumberFormat('de-DE',{maximumFractionDigits:1}).format(n);
  const dateLabel=(key,options={weekday:'long',day:'2-digit',month:'long'})=>new Intl.DateTimeFormat('de-DE',{...options,timeZone:'UTC'}).format(new Date(key+'T12:00:00Z'));
  const monthLabel=m=>dateLabel(m+'-01',{month:'long',year:'numeric'});
  const time=(s,tz)=>new Intl.DateTimeFormat('de-DE',{timeZone:tz,hour:'2-digit',minute:'2-digit'}).format(new Date(s));
  function tone(s,tz){const code=String(s.shift_code||'').toUpperCase();if(code.startsWith('FD'))return 'early';if(code.startsWith('SD'))return 'late';if(code.startsWith('ND'))return 'night';const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',hourCycle:'h23'}).format(new Date(s.starts_at)));return hour<12?'early':hour<21?'late':'night';}
  function initialize(data){
    const nextOwner=[B.user?.id,data.company?.id,data.employee?.id||B.employeeDbId].filter(Boolean).join(':');
    if(owner===nextOwner&&selectedMonth)return;
    owner=nextOwner;selectedMonth=dayKey(new Date(),zone(data)).slice(0,7);selectedDay='';view=root.matchMedia?.('(max-width:620px)').matches?'list':'calendar';lastSignature='';
    try{const saved=JSON.parse(sessionStorage.getItem('sfMyShiftsMonth:'+owner)||'null');if(saved&&validMonth(saved.month)){selectedMonth=saved.month;if(['calendar','list'].includes(saved.view))view=saved.view;}}catch{}
  }
  const save=()=>{try{sessionStorage.setItem('sfMyShiftsMonth:'+owner,JSON.stringify({month:selectedMonth,view}));}catch{}};
  function shiftRow(s,m){
    const name=(B.employeePortalData?.templates||[]).find(t=>t.code===s.shift_code)?.name||s.shift_code;
    const endDay=dayKey(s.ends_at,m.tz),startDay=dayKey(s.starts_at,m.tz),overnight=endDay!==startDay;
    const extra=/Zusatzdienst/i.test(s.note||'');
    return `<article class="sf-shift-item sf-my-shift-row" data-assignment-id="${esc(s.id)}"><span class="sf-my-shift-code sf-my-tone-${tone(s,m.tz)}">${esc(s.shift_code)}</span><div class="sf-item-main"><b>${esc(name)}${extra?' <span class="sf-my-extra">Zusatzdienst</span>':''}</b><small>${esc(dateLabel(startDay,{weekday:'short',day:'2-digit',month:'2-digit'}))} \u00b7 ${time(s.starts_at,m.tz)}\u2013${time(s.ends_at,m.tz)}${overnight?' <span class="sf-my-overnight">(+1 Tag)</span>':''}</small><small>${number(hours(s))} Std.${Number(s.break_minutes)>0?' \u00b7 '+number(Number(s.break_minutes))+' Min. Pause':''}</small>${s.note?`<small class="sf-my-shift-note">${esc(s.note)}</small>`:''}</div><span class="sf-item-state sf-my-published">Freigegeben</span></article>`;
  }
  function empty(m){const next=m.availableMonths.find(x=>x>m.month);return `<div class="sf-my-empty"><span aria-hidden="true">\u25a6</span><div><b>F\u00fcr ${esc(monthLabel(m.month))} sind noch keine Dienste ver\u00f6ffentlicht.</b><p>Sobald die Planung deine Dienste freigibt, erscheinen sie hier automatisch.</p>${next?`<button type="button" data-month-jump="${next}">Zu ${esc(monthLabel(next))} wechseln</button>`:''}</div></div>`;}
  function render(card,force=false){
    const data=B.employeePortalData;if(!data)return;
    initialize(data);const m=model(data,selectedMonth),today=dayKey(new Date(),m.tz);
    if(selectedDay.slice(0,7)!==selectedMonth)selectedDay=today.slice(0,7)===selectedMonth?today:m.shifts.length?dayKey(m.shifts[0].starts_at,m.tz):selectedMonth+'-01';
    const sig=JSON.stringify([owner,selectedMonth,selectedDay,view,m.shifts,data.templates,m.availableMonths,today]);if(!force&&sig===lastSignature&&card.querySelector('.sf-my-month-toolbar'))return;lastSignature=sig;
    card.id='sfMyShiftsMonth';card.dataset.sfPortalSection='shifts';card.dataset.sfMonthCount=String(m.shifts.length);
    const cells=m.cells.map(day=>{
      if(!day.inMonth)return `<span class="sf-my-calendar-outside" aria-hidden="true">${day.day}</span>`;
      const title=dateLabel(day.key)+(day.shifts.length?': '+day.shifts.map(s=>`${s.shift_code} ${time(s.starts_at,m.tz)}\u2013${time(s.ends_at,m.tz)}`).join(', '):': Kein ver\u00f6ffentlichter Dienst');
      return `<button type="button" class="sf-my-calendar-day${day.weekend?' sf-my-weekend':''}${day.key===selectedDay?' selected':''}${day.key===today?' sf-my-today':''}" data-month-day="${day.key}" aria-pressed="${day.key===selectedDay}" aria-label="${esc(title)}"><span class="sf-my-day-number">${day.day}${day.key===today?'<i>Heute</i>':''}</span>${day.shifts.length?day.shifts.slice(0,2).map(s=>`<span class="sf-my-calendar-shift sf-my-tone-${tone(s,m.tz)}"><b>${esc(s.shift_code)}</b><small>${time(s.starts_at,m.tz)}\u2013${time(s.ends_at,m.tz)}</small></span>`).join('')+(day.shifts.length>2?`<span class="sf-my-calendar-more">+${day.shifts.length-2} weitere</span>`:''):'<span class="sf-my-no-shift">Kein Dienst</span>'}</button>`;
    }).join('');
    const selected=m.byDay.get(selectedDay)||[];
    card.innerHTML=`<header class="sf-my-month-head"><div><div class="sf-my-kicker">PERS\u00d6NLICHER DIENSTPLAN</div><h3>Meine Schichten</h3><p>Dein Monat im \u00dcberblick \u2013 mit allen freigegebenen Diensten.</p></div><span class="sf-my-scope">\u25cf Freigegebene Planung</span></header><div class="sf-my-month-toolbar"><div class="sf-my-month-picker"><label for="sfMyShiftMonth">Monat ausw\u00e4hlen</label><div><button type="button" data-month-step="-1" aria-label="Vorheriger Monat" ${selectedMonth==='1900-01'?'disabled':''}>\u2039</button><input type="month" id="sfMyShiftMonth" min="1900-01" max="2100-12" value="${selectedMonth}"><button type="button" data-month-step="1" aria-label="N\u00e4chster Monat" ${selectedMonth==='2100-12'?'disabled':''}>\u203a</button></div></div><button type="button" class="sf-my-current-month" data-month-current>Aktueller Monat</button><div class="sf-my-view-switch" role="group" aria-label="Darstellung des Dienstplans"><button type="button" data-month-view="calendar" aria-pressed="${view==='calendar'}">Kalender</button><button type="button" data-month-view="list" aria-pressed="${view==='list'}">Liste</button></div></div><div class="sf-my-month-summary" aria-live="polite"><div><small>Dienste</small><strong data-month-count>${m.shifts.length}</strong></div><div><small>Geplante Stunden</small><strong data-month-hours>${number(m.hours)} <span>Std.</span></strong></div><div><small>Tage mit Dienst</small><strong>${m.workDays}</strong></div><div><small>N\u00e4chster Dienst im Monat</small><strong class="sf-my-next">${m.next?esc(m.next.shift_code)+' <span>'+esc(dateLabel(dayKey(m.next.starts_at,m.tz),{day:'2-digit',month:'2-digit'}))+'</span>':'\u2013'}</strong></div></div><div class="sf-my-month-title"><h2>${esc(monthLabel(selectedMonth))}</h2><small>${view==='calendar'?'Tag ausw\u00e4hlen f\u00fcr Details':'Alle Dienste nach Datum sortiert'}</small></div>${!m.shifts.length?empty(m):''}${view==='calendar'?`<div class="sf-my-month-layout"><section class="sf-my-calendar-panel" aria-label="Monatskalender"><div class="sf-my-calendar-scroll"><div class="sf-my-calendar-weekdays" aria-hidden="true">${['Mo','Di','Mi','Do','Fr','Sa','So'].map(x=>'<span>'+x+'</span>').join('')}</div><div class="sf-my-calendar-grid">${cells}</div></div><div class="sf-my-calendar-legend"><span><i class="sf-my-tone-early"></i>Fr\u00fch / Tag</span><span><i class="sf-my-tone-late"></i>Sp\u00e4t</span><span><i class="sf-my-tone-night"></i>Nacht</span></div></section><section class="sf-my-day-details" aria-labelledby="sfMySelectedDay"><div class="sf-my-day-heading"><small>AUSGEW\u00c4HLTER TAG</small><h4 id="sfMySelectedDay">${esc(dateLabel(selectedDay))}</h4></div><div data-month-day-details>${selected.length?selected.map(s=>shiftRow(s,m)).join(''):'<div class="sf-my-day-empty">F\u00fcr diesen Tag ist kein Dienst ver\u00f6ffentlicht.<small>W\u00e4hle einen belegten Tag, um Zeiten und Details zu sehen.</small></div>'}</div></section></div>`:`<div class="sf-my-month-list">${m.shifts.map(s=>shiftRow(s,m)).join('')}</div>`}<footer class="sf-my-month-foot">Zeiten in ${esc(m.tz)} \u00b7 Es werden ausschlie\u00dflich deine ver\u00f6ffentlichten Dienste angezeigt.</footer>`;
    bind(card);root.SFShiftMarketplace?.refreshOfferButtons?.();
    document.querySelectorAll('#sfEmployeePortal [data-count-for="shifts"]').forEach(x=>{if(x.textContent!==String(m.shifts.length))x.textContent=String(m.shifts.length);});
  }
  function changeMonth(card,value,focus){if(!validMonth(value))return;selectedMonth=value;selectedDay='';save();render(card,true);card.querySelector(focus||'#sfMyShiftMonth')?.focus({preventScroll:true});}
  function bind(card){
    card.querySelector('#sfMyShiftMonth').onchange=e=>{if(validMonth(e.target.value))changeMonth(card,e.target.value);else e.target.value=selectedMonth;};
    card.querySelectorAll('[data-month-step]').forEach(b=>b.onclick=()=>changeMonth(card,moveMonth(selectedMonth,Number(b.dataset.monthStep)),`[data-month-step="${b.dataset.monthStep}"]`));
    card.querySelector('[data-month-current]').onclick=()=>changeMonth(card,dayKey(new Date(),zone(B.employeePortalData)).slice(0,7),'[data-month-current]');
    card.querySelectorAll('[data-month-jump]').forEach(b=>b.onclick=()=>changeMonth(card,b.dataset.monthJump));
    card.querySelectorAll('[data-month-view]').forEach(b=>b.onclick=()=>{view=b.dataset.monthView;save();render(card,true);card.querySelector(`[data-month-view="${view}"]`)?.focus({preventScroll:true});});
    card.querySelectorAll('[data-month-day]').forEach(b=>b.onclick=()=>{selectedDay=b.dataset.monthDay;render(card,true);card.querySelector(`[data-month-day="${selectedDay}"]`)?.focus({preventScroll:true});});
  }
  function mount(){const portal=document.getElementById('sfEmployeePortal');if(!portal||!B.employeePortalData)return;const card=portal.querySelector('.sf-portal-card[data-sf-portal-section="shifts"]')||[...portal.querySelectorAll('.sf-portal-card')].find(c=>c.querySelector('h3')?.textContent.trim()==='Meine Schichten');if(card)render(card);}
  api.mount=mount;
  const old=B.openEmployeePortal;if(typeof old==='function')B.openEmployeePortal=function(){const result=old.apply(this,arguments);mount();return result;};
  new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.id==='sfEmployeePortal'||n.querySelector?.('#sfEmployeePortal')))))mount();}).observe(document.documentElement,{childList:true,subtree:true});
  mount();
})();
