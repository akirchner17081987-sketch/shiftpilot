// SchichtFunk – Einsatzbereitschafts-Ampel V1
(function(){
  const B=window.SFBackend=window.SFBackend||{},C=window.SFCompliance=window.SFCompliance||{};
  const MANAGER=new Set(['OWNER','ADMIN','DISPATCHER','PLANNER']);
  const LEVEL={green:0,amber:1,red:2};
  let confirmations=new Map(),lastModel=null,loading=false;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key=(assignmentId,employeeId)=>`${assignmentId}|${employeeId}`;
  const fmtDate=v=>new Intl.DateTimeFormat('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'}).format(new Date(`${v}T12:00:00`));
  const maxLevel=items=>items.reduce((m,x)=>LEVEL[x.level]>LEVEL[m]?x.level:m,'green');
  const dbAssignment=a=>a?._dbId||B.asgDb?.get(String(a?.id));
  const dbEmployee=e=>e?._dbId||B.empDb?.get(String(e?.id));
  const allAssignments=()=>typeof assignments==='undefined'?[]:assignments;
  const allEmployees=()=>typeof employees==='undefined'?[]:employees;
  const allTypes=()=>typeof TYPES==='undefined'?[]:TYPES;

  function css(){
    if(document.getElementById('sfReadinessCss'))return;
    const s=document.createElement('style');s.id='sfReadinessCss';s.textContent=`
      .sf-ready{margin:10px 0;padding:15px;border:1px solid #294159;border-radius:14px;background:linear-gradient(135deg,#0e1d2d,#0a1724);box-shadow:0 12px 30px rgba(0,0,0,.16)}
      .sf-ready-head{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:13px;align-items:center}.sf-ready-light{width:50px;height:50px;border-radius:50%;display:grid;place-items:center;font-size:22px;border:5px solid rgba(255,255,255,.08);box-shadow:0 0 24px currentColor}.sf-ready.green .sf-ready-light{color:#48e0b7;background:#18836a}.sf-ready.amber .sf-ready-light{color:#ffc45d;background:#966115}.sf-ready.red .sf-ready-light{color:#ff687c;background:#a32d43}
      .sf-ready-title b{display:block;font-size:16px}.sf-ready-title small{display:block;color:#96aac0;margin-top:3px}.sf-ready-counts{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.sf-ready-count{padding:5px 9px;border-radius:999px;font-size:11px;font-weight:850;border:1px solid #315069}.sf-ready-count.green{color:#67e5c3;border-color:#28705f;background:#102d27}.sf-ready-count.amber{color:#ffd078;border-color:#775a28;background:#2c2315}.sf-ready-count.red{color:#ff8c9b;border-color:#773344;background:#301821}
      .sf-ready-summary{margin:13px 0 0;padding-top:12px;border-top:1px solid #21384e;display:grid;gap:7px}.sf-ready-issue{display:grid;grid-template-columns:auto 1fr auto;gap:9px;align-items:center;padding:8px 10px;border-radius:9px;background:#0a1724}.sf-ready-dot{width:9px;height:9px;border-radius:50%}.sf-ready-dot.green{background:#45d9b4}.sf-ready-dot.amber{background:#f5b84f}.sf-ready-dot.red{background:#f45b70}.sf-ready-issue b{font-size:12px}.sf-ready-issue small{display:block;color:#8fa5ba;font-size:10px;margin-top:2px}.sf-ready-action{margin-top:11px;display:flex;justify-content:space-between;gap:10px;align-items:center}.sf-ready-action small{color:#7890a7}.sf-ready-action button{white-space:nowrap}
      .sf-ready-modal{position:fixed;inset:0;z-index:24000;background:rgba(2,7,13,.88);display:grid;place-items:center;padding:18px}.sf-ready-card{width:min(1000px,97vw);max-height:90vh;overflow:auto;background:#0b1826;border:1px solid #2b4961;border-radius:17px;padding:20px;box-shadow:0 30px 100px rgba(0,0,0,.6)}.sf-ready-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.sf-ready-card h2{margin:4px 0}.sf-ready-card p{color:#91a7bc;margin:0 0 14px}.sf-ready-list{display:grid;gap:8px}.sf-ready-row{display:grid;grid-template-columns:150px 95px 1fr;gap:12px;align-items:start;padding:12px;border:1px solid #223a50;border-radius:11px;background:#0d1b2a}.sf-ready-row-state{font-size:11px;font-weight:900;text-transform:uppercase}.sf-ready-row-state.green{color:#62e2bf}.sf-ready-row-state.amber{color:#ffca69}.sf-ready-row-state.red{color:#ff8494}.sf-ready-findings{display:flex;gap:6px;flex-wrap:wrap}.sf-ready-finding{font-size:10px;padding:5px 7px;border-radius:7px;background:#132438;color:#b8c9d8}.sf-ready-finding.red{background:#321923;color:#ff9aa8}.sf-ready-finding.amber{background:#302617;color:#ffd084}.sf-ready-finding.green{background:#102d27;color:#78e5c8}
      .sf-readiness-response{display:flex;flex-direction:column;align-items:flex-end;gap:5px}.sf-readiness-response small{font-size:9px;color:#8fa5ba}.sf-readiness-response-buttons{display:flex;gap:5px}.sf-readiness-response button{min-height:30px;padding:4px 8px;font-size:10px}.sf-readiness-response .confirmed{color:#75e7c7;border-color:#28705f}.sf-readiness-response .issue{color:#ff9aaa;border-color:#743344}.sf-readiness-note{position:fixed;inset:0;z-index:25000;background:rgba(2,7,13,.88);display:grid;place-items:center;padding:18px}.sf-readiness-note-card{width:min(470px,96vw);padding:20px;border:1px solid #2b4961;border-radius:16px;background:#0b1826}.sf-readiness-note-card textarea{width:100%;min-height:100px;margin:10px 0;background:#071421;border:1px solid #2b465e;color:#edf7ff;border-radius:9px;padding:10px}.sf-readiness-note-actions{display:flex;justify-content:flex-end;gap:8px}
      @media(max-width:700px){.sf-ready-head{grid-template-columns:auto 1fr}.sf-ready-counts{grid-column:1/-1;justify-content:flex-start}.sf-ready-row{grid-template-columns:1fr}.sf-ready-action{align-items:flex-start;flex-direction:column}.sf-ready-action button{width:100%}.sf-readiness-response{align-items:stretch}.sf-readiness-response-buttons{flex-wrap:wrap}.sf-readiness-response button{flex:1}}
    `;document.head.appendChild(s);
  }

  async function loadManagerConfirmations(){
    if(!B.client||!B.companyId||!MANAGER.has(B.role)||loading)return confirmations;
    loading=true;
    try{
      const weekDates=typeof currentWeekDates==='function'?currentWeekDates().map(iso):[];
      const ids=allAssignments().filter(a=>weekDates.includes(a.date)).map(dbAssignment).filter(Boolean);
      if(!ids.length){confirmations=new Map();return confirmations}
      const q=await B.client.from('shift_assignment_confirmations').select('assignment_id,employee_id,status,note,responded_at').eq('company_id',B.companyId).in('assignment_id',ids);
      if(q.error)throw q.error;
      confirmations=new Map((q.data||[]).map(x=>[key(x.assignment_id,x.employee_id),x]));
    }catch(e){console.warn('Einsatzbereitschaft: Bestätigungen konnten nicht geladen werden',e)}finally{loading=false}
    return confirmations;
  }

  function evaluate(){
    const dates=typeof currentWeekDates==='function'?currentWeekDates().map(iso):[],slots=new Map();
    for(const date of dates)for(const t of allTypes()){const required=Number(getSoll(date,t.id)||0);if(required>0)slots.set(`${date}|${t.id}`,{date,type:t.id,required,assignments:[]})}
    for(const a of allAssignments()){if(!dates.includes(a.date))continue;const k=`${a.date}|${a.type}`;if(!slots.has(k))slots.set(k,{date:a.date,type:a.type,required:Number(getSoll(a.date,a.type)||0),assignments:[]});slots.get(k).assignments.push(a)}
    const rows=[...slots.values()].map(slot=>{
      const findings=[],actual=slot.assignments.length;
      if(actual<slot.required)findings.push({level:'red',text:`Besetzung ${actual}/${slot.required} – ${slot.required-actual} Position${slot.required-actual===1?'':'en'} offen`});
      else findings.push({level:'green',text:`Besetzung ${actual}/${slot.required}`});
      for(const a of slot.assignments){
        const emp=allEmployees().find(e=>String(e.id)===String(a.employeeId)),name=emp?`${emp.first} ${emp.last}`:'Unbekannter Mitarbeiter';
        if(!emp){findings.push({level:'red',text:'Zugeordneter Mitarbeiter fehlt'});continue}
        if(String(emp.status).toLowerCase()!=='active')findings.push({level:'red',text:`${name}: nicht aktiv`});
        if(!(emp.shifts||[]).includes(slot.type))findings.push({level:'red',text:`${name}: keine Schichtfreigabe für ${slot.type}`});
        if(typeof C.roleAllows==='function'&&!C.roleAllows(emp,slot.type))findings.push({level:'red',text:`${name}: erforderliche Teamleitung fehlt`});
        if(typeof C.check==='function'){
          const check=C.check(emp,slot.type,slot.date,a.start,a.end,a.id);
          (check.hard||[]).forEach(text=>findings.push({level:'red',text:`${name}: ${text}`}));
          (check.soft||[]).forEach(text=>findings.push({level:'amber',text:`${name}: ${text}`}));
        }
        const published=a._dbStatus==='PUBLISHED'||!!a.publishedAt;
        if(!published)findings.push({level:'amber',text:`${name}: Schicht noch nicht veröffentlicht`});
        else if(new Date(`${a.date}T${a.start||'00:00'}:00`).getTime()>Date.now()){
          const response=confirmations.get(key(dbAssignment(a),dbEmployee(emp)));
          if(response?.status==='ISSUE_REPORTED')findings.push({level:'red',text:`${name}: Problem gemeldet${response.note?' – '+response.note:''}`});
          else if(response?.status==='CONFIRMED')findings.push({level:'green',text:`${name}: Schicht bestätigt`});
          else findings.push({level:'amber',text:`${name}: Bestätigung ausstehend`});
        }
        const openRequest=(C.requests||[]).some(r=>String(r.assignmentId)===String(a.id)&&!/APPLIED|REJECTED|CANCELLED/i.test(r.status||''));
        if(openRequest)findings.push({level:'amber',text:`${name}: Schichtänderung noch offen`});
      }
      const uniqueFindings=[...new Map(findings.map(f=>[`${f.level}|${f.text}`,f])).values()];
      const level=maxLevel(uniqueFindings);return{...slot,actual,findings:uniqueFindings,level};
    }).sort((a,b)=>LEVEL[b.level]-LEVEL[a.level]||a.date.localeCompare(b.date)||a.type.localeCompare(b.type));
    const count=l=>rows.filter(x=>x.level===l).length,overall=rows.some(x=>x.level==='red')?'red':rows.some(x=>x.level==='amber')?'amber':'green';
    return{rows,overall,green:count('green'),amber:count('amber'),red:count('red'),week:dates.length?`${fmtDate(dates[0])} – ${fmtDate(dates.at(-1))}`:'Aktuelle Woche'};
  }

  function render(){
    if(!MANAGER.has(B.role))return;
    const page=document.getElementById('view-schedule');if(!page)return;css();lastModel=evaluate();
    let panel=document.getElementById('sfReadinessPanel');if(!panel){panel=document.createElement('section');panel.id='sfReadinessPanel';const anchor=page.querySelector('.library')||page.querySelector('.calendar');anchor?.insertAdjacentElement('beforebegin',panel)}
    const m=lastModel,label=m.overall==='red'?'Einsatz gefährdet':m.overall==='amber'?'Prüfung erforderlich':'Einsatzbereit',symbol=m.overall==='green'?'✓':m.overall==='amber'?'!':'×',top=m.rows.filter(x=>x.level!=='green').slice(0,4);
    panel.className=`sf-ready ${m.overall}`;panel.innerHTML=`<div class="sf-ready-head"><div class="sf-ready-light" aria-label="${esc(label)}">${symbol}</div><div class="sf-ready-title"><b>Einsatzbereitschaft · ${esc(label)}</b><small>${esc(m.week)} · Besetzung, Freigaben, Ruhezeiten, Veröffentlichung und Bestätigungen</small></div><div class="sf-ready-counts"><span class="sf-ready-count green">${m.green} bereit</span><span class="sf-ready-count amber">${m.amber} prüfen</span><span class="sf-ready-count red">${m.red} kritisch</span></div></div>${top.length?`<div class="sf-ready-summary">${top.map(x=>`<div class="sf-ready-issue"><span class="sf-ready-dot ${x.level}"></span><div><b>${esc(fmtDate(x.date))} · ${esc(x.type)}</b><small>${esc(x.findings.find(f=>f.level===x.level)?.text||'Prüfung erforderlich')}</small></div><span class="sf-ready-row-state ${x.level}">${x.level==='red'?'Kritisch':'Prüfen'}</span></div>`).join('')}</div>`:`<div class="sf-ready-summary"><div class="sf-ready-issue"><span class="sf-ready-dot green"></span><div><b>Alle vorgesehenen Schichten sind einsatzbereit</b><small>Aktuell bestehen keine offenen kritischen Prüfungen.</small></div></div></div>`}<div class="sf-ready-action"><small>Entscheidungshilfe auf Basis der hinterlegten Daten · keine automatische Rechtsfreigabe</small><button class="ghost" id="sfReadinessDetails" type="button">Alle Schichten prüfen</button></div>`;
    panel.querySelector('#sfReadinessDetails').onclick=openDetails;
  }

  function openDetails(){
    const m=lastModel||evaluate();document.getElementById('sfReadinessModal')?.remove();const modal=document.createElement('div');modal.id='sfReadinessModal';modal.className='sf-ready-modal';modal.innerHTML=`<div class="sf-ready-card"><div class="sf-ready-card-head"><div><div class="eyebrow">EINSATZBEREITSCHAFT</div><h2>Prüfung je Schicht</h2><p>${esc(m.week)} · Kritische Punkte stehen zuerst.</p></div><button class="ghost" data-close type="button">Schließen</button></div><div class="sf-ready-list">${m.rows.length?m.rows.map(x=>`<article class="sf-ready-row"><div><b>${esc(fmtDate(x.date))}</b><small style="display:block;color:#8299ae;margin-top:3px">${esc(x.type)} · ${x.actual}/${x.required} besetzt</small></div><span class="sf-ready-row-state ${x.level}">${x.level==='green'?'Bereit':x.level==='amber'?'Prüfen':'Kritisch'}</span><div class="sf-ready-findings">${x.findings.map(f=>`<span class="sf-ready-finding ${f.level}">${esc(f.text)}</span>`).join('')}</div></article>`).join(''):'<div class="sf-empty">Für diese Woche sind keine Schichten vorgesehen.</div>'}</div></div>`;document.body.appendChild(modal);modal.querySelector('[data-close]').onclick=()=>modal.remove();modal.addEventListener('click',e=>{if(e.target===modal)modal.remove()});
  }

  async function saveResponse(shift,status,note=''){
    const d=B.employeePortalData,employee=d?.employee;if(!shift||!employee)return;
    B.showLoading?.('Rückmeldung wird gespeichert …');
    try{
      const q=await B.client.from('shift_assignment_confirmations').upsert({assignment_id:shift.id,company_id:shift.company_id,employee_id:employee.id,status,note:String(note||'').trim(),responded_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:'assignment_id,employee_id'});
      if(q.error)throw q.error;await augmentEmployee();B.notifications?.refresh?.();showSaveToast?.(status==='CONFIRMED'?'Schicht bestätigt':'Problem gemeldet',status==='CONFIRMED'?'Deine Einsatzbereitschaft wurde gespeichert.':'Die Disposition sieht deine Meldung in der Einsatzbereitschafts-Ampel.');
    }catch(e){alert('Rückmeldung konnte nicht gespeichert werden: '+(e.message||String(e)))}finally{B.hideLoading?.()}
  }

  function issueDialog(shift){
    document.getElementById('sfReadinessNote')?.remove();const m=document.createElement('div');m.id='sfReadinessNote';m.className='sf-readiness-note';m.innerHTML=`<div class="sf-readiness-note-card"><div class="eyebrow">EINSATZBEREITSCHAFT</div><h2>Problem melden</h2><p>Beschreibe kurz, warum du diese Schicht nicht wie geplant übernehmen kannst.</p><textarea maxlength="1000" placeholder="Zum Beispiel: Qualifikation fehlt, Anfahrt nicht möglich …"></textarea><div class="sf-readiness-note-actions"><button class="ghost" data-cancel type="button">Abbrechen</button><button class="primary" data-save type="button">Problem melden</button></div></div>`;document.body.appendChild(m);m.querySelector('[data-cancel]').onclick=()=>m.remove();m.querySelector('[data-save]').onclick=async()=>{const note=m.querySelector('textarea').value.trim();if(!note)return m.querySelector('textarea').focus();m.remove();await saveResponse(shift,'ISSUE_REPORTED',note)};
  }

  async function augmentEmployee(){
    if(B.role!=='EMPLOYEE'||!B.client||!B.employeePortalData)return;
    css();const root=document.getElementById('sfEmployeePortal');if(!root)return;
    const shifts=(B.employeePortalData.shifts||[]).filter(s=>new Date(s.ends_at).getTime()>=Date.now()).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)).slice(0,20),ids=shifts.map(s=>s.id);
    let map=new Map();if(ids.length){const q=await B.client.from('shift_assignment_confirmations').select('assignment_id,status,note,responded_at').eq('employee_id',B.employeePortalData.employee.id).in('assignment_id',ids);if(!q.error)map=new Map((q.data||[]).map(x=>[x.assignment_id,x]))}
    const rows=[...root.querySelectorAll('.sf-portal-card')].find(x=>x.querySelector('h3')?.textContent.trim()==='Meine Schichten')?.querySelectorAll('.sf-shift-item')||[];
    rows.forEach((row,i)=>{const shift=shifts[i];if(!shift)return;const old=row.querySelector('.sf-item-state'),response=map.get(shift.id),wrap=document.createElement('div');wrap.className='sf-readiness-response';wrap.innerHTML=`<small>${response?.status==='CONFIRMED'?'✓ Bestätigt':response?.status==='ISSUE_REPORTED'?'⚠ Problem gemeldet':'Rückmeldung offen'}</small><div class="sf-readiness-response-buttons"><button class="ghost confirmed" data-confirm type="button">Bestätigen</button><button class="ghost issue" data-issue type="button">Problem</button></div>`;old?.replaceWith(wrap);wrap.querySelector('[data-confirm]').onclick=()=>saveResponse(shift,'CONFIRMED','');wrap.querySelector('[data-issue]').onclick=()=>issueDialog(shift)});
  }

  function refresh(){if(MANAGER.has(B.role)&&document.getElementById('view-schedule')?.classList.contains('active'))loadManagerConfirmations().then(render);else if(B.role==='EMPLOYEE')augmentEmployee()}
  const boot=setInterval(()=>{if(!B.client||!B.role)return;clearInterval(boot);const oldRender=window.renderCalendar;if(typeof oldRender==='function'&&!oldRender.__readinessWrapped){window.renderCalendar=function(){const r=oldRender.apply(this,arguments);setTimeout(refresh,50);return r};window.renderCalendar.__readinessWrapped=true}const oldPortal=B.openEmployeePortal;if(typeof oldPortal==='function'&&!oldPortal.__readinessWrapped){B.openEmployeePortal=function(){const r=oldPortal.apply(this,arguments);setTimeout(augmentEmployee,80);return r};B.openEmployeePortal.__readinessWrapped=true}refresh();setInterval(refresh,20000)},250);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
  window.SFReadiness={evaluate,refresh};
})();
