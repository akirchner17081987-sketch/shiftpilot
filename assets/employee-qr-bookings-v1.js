// SchichtFunk – eigene QR-Buchungen mit den gespeicherten Serverzeiten.
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.renderEmployeeQrBookings)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const current=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:B.companyTimeZone||'Europe/Berlin',year:'numeric',month:'2-digit'}).format(new Date());
  const valid=m=>/^(19\d{2}|[2-9]\d{3})-(0[1-9]|1[0-2])$/.test(m||'')&&!m.startsWith('9999');
  const shift=(m,n)=>{const [y,mo]=m.split('-').map(Number);return new Date(Date.UTC(y,mo-1+n,1)).toISOString().slice(0,7)};
  const scope=()=>[B.user?.id,B.companyId,B.employeeDbId||B.employeePortalData?.employee?.id].join('|');
  let month=current(),source='qr',owner='',sequence=0,data=null,dataMonth='',loading=false,error='',visible=10,filter='all';
  function stamp(value,timezone){if(!value)return 'Noch nicht gebucht';const d=new Date(value);return Number.isNaN(d.getTime())?'Zeit nicht verfügbar':new Intl.DateTimeFormat('de-DE',{timeZone:timezone,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(d)}
  const duration=n=>`${Math.floor(Number(n||0)/60)} Std. ${String(Number(n||0)%60).padStart(2,'0')} Min.`;
  function shell(){
    if(B.role!=='EMPLOYEE')return null;
    const portal=document.getElementById('sfEmployeePortal'),grid=portal?.querySelector('.sf-portal-grid');if(!grid)return null;
    if(!document.getElementById('sfQrBookingsCss')){const link=document.createElement('link');link.id='sfQrBookingsCss';link.rel='stylesheet';link.href='assets/employee-qr-bookings-v1.css?v=20261002-qrbookings1';document.head.appendChild(link)}
    let card=portal.querySelector('#sfEmployeeQrBookings');
    if(!card){card=document.createElement('section');card.id='sfEmployeeQrBookings';card.className='sf-portal-card sf-qb';card.dataset.sfPortalSection='time';
      card.innerHTML=`<header class="sf-qb-head"><div><span class="sf-qb-eyebrow">PERSÖNLICHE ZEITERFASSUNG</span><h3>Arbeitszeit</h3><p>Deine QR-Buchungen und Zeiten aus dem Dienstplan.</p></div></header><div class="sf-qb-sources" role="group" aria-label="Quelle der Arbeitszeiten"><button type="button" data-qb-source="qr" aria-pressed="true">Meine QR-Buchungen</button><button type="button" data-qb-source="plan" aria-pressed="false">Dienstplan-Zeiten</button></div><div class="sf-qb-body"><div class="sf-qb-controls"><div class="sf-qb-month"><button type="button" data-qb="previous" aria-label="Vorheriger Monat der QR-Buchungen">‹</button><label>Monat<input type="month" id="sfQrBookingsMonth" min="1900-01" max="9998-12"></label><button type="button" data-qb="next" aria-label="Nächster Monat der QR-Buchungen">›</button><button type="button" data-qb="today">Aktueller Monat</button></div><button type="button" data-qb="refresh">↻ Aktualisieren</button><label>Status<select id="sfQrBookingsFilter"><option value="all">Alle Buchungen</option><option value="open">Offene Dienste</option><option value="closed">Beendete Dienste</option></select></label></div><p class="sf-qb-note">Die Zeiten wurden beim Buchen vom System gespeichert. Jeder Dienst erscheint im Monat seines Dienstbeginns. Pausen werden separat ausgewiesen und bei diesen QR-Buchungen nicht von der Anwesenheitszeit abgezogen.</p><p class="sf-qb-feedback" role="status" aria-live="polite"></p><div class="sf-qb-list"></div><button type="button" data-qb="more" hidden>Weitere Buchungen anzeigen</button></div>`;
      card.addEventListener('click',event=>{const button=event.target.closest('button');if(!button||!card.contains(button))return;
        if(button.dataset.qbSource){source=button.dataset.qbSource;draw(card);if(source==='qr'&&!data&&!loading)render();return}
        switch(button.dataset.qb){case'previous':choose(shift(month,-1));break;case'next':choose(shift(month,1));break;case'today':choose(current());break;case'refresh':render();break;case'more':visible+=10;draw(card);break}
      });
      card.querySelector('#sfQrBookingsMonth').onchange=e=>choose(e.target.value);
      card.querySelector('#sfQrBookingsFilter').onchange=e=>{filter=e.target.value;visible=10;draw(card)};
      grid.prepend(card);
    }
    return card;
  }
  function choose(next){if(!valid(next)||next===month){const card=shell();if(card)draw(card);return}month=next;visible=10;render()}
  function draw(card){
    card.closest('#sfEmployeePortal').dataset.sfTimeSource=source;
    card.querySelectorAll('[data-qb-source]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.qbSource===source)));
    card.querySelector('.sf-qb-body').hidden=source!=='qr';card.querySelector('#sfQrBookingsMonth').value=month;
    card.querySelector('#sfQrBookingsFilter').value=filter;card.querySelector('[data-qb="refresh"]').disabled=loading;
    card.querySelector('[data-qb="previous"]').disabled=month==='1900-01';card.querySelector('[data-qb="next"]').disabled=month==='9998-12';
    const list=card.querySelector('.sf-qb-list'),feedback=card.querySelector('.sf-qb-feedback'),more=card.querySelector('[data-qb="more"]');more.hidden=true;list.setAttribute('aria-busy',String(loading));
    feedback.textContent=error||(loading?'QR-Buchungen werden geladen …':data&&dataMonth===month?'Stand: '+stamp(data.as_of,data.timezone)+' · '+data.timezone:'');
    if(!data||dataMonth!==month){list.innerHTML=`<div class="sf-qb-empty">${error?'Die Buchungen sind derzeit nicht verfügbar. Bitte erneut aktualisieren.':'Deine Buchungen werden geladen …'}</div>`;return}
    const rows=data.rows.filter(r=>filter==='all'||(filter==='open'?!r.ended_at:!!r.ended_at)),tz=data.timezone;
    more.hidden=rows.length<=visible;
    list.innerHTML=`<div class="sf-qb-count">${rows.length} ${rows.length===1?'Dienst':'Dienste'}${data.truncated?' · Es werden die neuesten 500 Dienste angezeigt.':''}</div>`+(rows.length?rows.slice(0,visible).map(r=>{
      const open=!r.ended_at,inPause=open&&r.breaks.some(b=>!b.ended_at),status=inPause?'In Pause':open?'Im Dienst':'Dienst beendet';
      return `<article class="sf-qb-entry"><header><div><h4>${esc(new Intl.DateTimeFormat('de-DE',{timeZone:tz,weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(new Date(r.started_at)))}</h4><span>${esc(r.terminal_name||'QR-Terminal')}</span></div><span class="sf-qb-badge ${open?'open':''}">${status}</span></header><dl class="sf-qb-times"><div><dt>Dienstbeginn</dt><dd>${esc(stamp(r.started_at,tz))}</dd></div><div><dt>Dienstende</dt><dd>${esc(stamp(r.ended_at,tz))}</dd></div><div><dt>Anwesenheit${open?' bis zum angezeigten Stand':''}</dt><dd>${duration(r.attendance_minutes)}</dd></div><div><dt>Pausen gesamt${inPause?' · laufend':''}</dt><dd>${duration(r.pause_minutes)}</dd></div></dl>${r.breaks.length?`<details><summary>${r.breaks.length} ${r.breaks.length===1?'Pause':'Pausen'} · Buchungszeiten ansehen</summary><div class="sf-qb-breaks">${r.breaks.map(b=>`<section><h5>Pause ${Number(b.number)}</h5><dl><div><dt>Beginn</dt><dd>${esc(stamp(b.started_at,tz))}</dd></div><div><dt>Ende</dt><dd>${esc(stamp(b.ended_at,tz))}${!b.ended_at?' · Pause läuft':''}</dd></div><div><dt>Dauer${!b.ended_at?' bis zum Stand':''}</dt><dd>${duration(b.minutes)}</dd></div></dl></section>`).join('')}</div></details>`:'<p class="sf-qb-no-break">Keine Pause gebucht.</p>'}</article>`;
    }).join(''):`<div class="sf-qb-empty">${data.demo?'QR-Buchungen sind in der Demo nicht verfügbar. Deine Beispielzeiten findest du unter „Dienstplan-Zeiten“.':data.rows.length?'Keine Dienste für diesen Status.':'In diesem Monat wurden noch keine QR-Dienste für dich gebucht.'}</div>`);
  }
  async function render(){
    if(B.role!=='EMPLOYEE'||!B.client)return;const who=scope();
    if(owner!==who){owner=who;month=current();data=null;dataMonth='';source='qr';filter='all';visible=10;error=''}
    const card=shell();if(!card)return;const request=++sequence,requestedMonth=month;loading=true;error='';draw(card);
    try{const result=B.client.__sfDemoLocalClientV1?{data:{employee_id:B.employeeDbId||B.employeePortalData?.employee?.id,month:requestedMonth+'-01',timezone:B.companyTimeZone||'Europe/Berlin',as_of:new Date().toISOString(),rows:[],demo:true}}:await B.client.rpc('employee_my_qr_bookings',{p_month:requestedMonth+'-01'});if(result.error)throw result.error;
      const value=typeof result.data==='string'?JSON.parse(result.data):result.data,employee=B.employeeDbId||B.employeePortalData?.employee?.id;
      if(!value||!Array.isArray(value.rows)||value.month!==requestedMonth+'-01'||!value.timezone||!value.as_of||(employee&&value.employee_id!==employee)||value.rows.some(r=>!r.started_at||!Array.isArray(r.breaks)))throw Error('Unvollständige QR-Buchungen');
      // Validate the database timezone before rendering stored timestamps.
      new Intl.DateTimeFormat('de-DE',{timeZone:value.timezone}).format(new Date(value.as_of));
      if(request!==sequence||who!==scope()||B.role!=='EMPLOYEE'||!card.isConnected)return;data=value;dataMonth=requestedMonth;
    }catch(e){if(request!==sequence||who!==scope()||B.role!=='EMPLOYEE')return;error='Aktualisierung fehlgeschlagen. '+(data&&dataMonth===month?'Die zuletzt geladenen Buchungen bleiben sichtbar.':'Bitte versuche es erneut.');console.warn('Eigene QR-Buchungen konnten nicht geladen werden',e)}
    finally{if(request===sequence&&who===scope()&&B.role==='EMPLOYEE'&&card.isConnected){loading=false;draw(card)}}
  }
  B.renderEmployeeQrBookings=render;
  const old=B.openEmployeePortal;if(typeof old==='function')B.openEmployeePortal=function(){const value=old.apply(this,arguments);setTimeout(()=>{const card=shell();if(card){draw(card);if(card.closest('#sfEmployeePortal').dataset.sfPortalActive==='time')render()}},0);return value};
  setTimeout(()=>{const card=shell();if(card){draw(card);if(card.closest('#sfEmployeePortal').dataset.sfPortalActive==='time')render()}},0);
})();
