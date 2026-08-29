// SchichtFunk – robuster Admin-Workflow für Abwesenheitsanträge V2
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__absenceManagerV2)return;B.__absenceManagerV2=true;
  const ALLOWED=new Set(['OWNER','ADMIN','DISPATCHER','PLANNER']);
  let rendering=false,lastKey='';

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>{if(!v)return'–';try{return new Date(String(v).slice(0,10)+'T00:00:00').toLocaleDateString('de-DE')}catch{return String(v)}};
  const role=()=>String(B.role||'').toUpperCase();
  const employeesList=()=>{try{return typeof employees!=='undefined'&&Array.isArray(employees)?employees:(Array.isArray(window.employees)?window.employees:[])}catch{return Array.isArray(window.employees)?window.employees:[]}};
  const assignmentsList=()=>{try{return typeof assignments!=='undefined'&&Array.isArray(assignments)?assignments:(Array.isArray(window.assignments)?window.assignments:[])}catch{return Array.isArray(window.assignments)?window.assignments:[]}};
  const localEmployee=dbId=>employeesList().find(e=>String(e._dbId||B.empDb?.get?.(String(e.id)))===String(dbId));

  function css(){
    if(document.getElementById('sfAbsMgrV2Css'))return;
    const s=document.createElement('style');s.id='sfAbsMgrV2Css';s.textContent=`
      .sf-abs-mgr-v2{margin:0 0 16px;padding:16px 18px;background:linear-gradient(180deg,#112034,#0d1b2b);border:1px solid #29445e;border-radius:13px;box-shadow:0 15px 40px rgba(0,0,0,.16)}
      .sf-abs-mgr-v2-head{display:flex;align-items:center;gap:10px;margin-bottom:12px}.sf-abs-mgr-v2-head h3{margin:0;font-size:15px}.sf-abs-mgr-v2-count{padding:3px 7px;border-radius:999px;background:#3a2a16;color:#ffc66d;font-size:10px;font-weight:900}.sf-abs-mgr-v2-note{margin-left:auto;color:#8299ae;font-size:10px}
      .sf-abs-mgr-v2-list{display:flex;flex-direction:column;gap:8px}.sf-abs-mgr-v2-row{display:grid;grid-template-columns:1.25fr .8fr .75fr auto;gap:12px;align-items:center;padding:11px 12px;border:1px solid #263e55;background:#0b1927;border-radius:10px}.sf-abs-mgr-v2-row b{display:block;font-size:11px}.sf-abs-mgr-v2-row small{display:block;margin-top:3px;color:#8299ae;font-size:9px;line-height:1.4}.sf-abs-mgr-v2-status{display:inline-flex;padding:4px 7px;border-radius:999px;border:1px solid #7b5c28;background:#2e2415;color:#ffd080;font-size:9px;font-weight:900}.sf-abs-mgr-v2-actions{display:flex;gap:6px;justify-content:flex-end}.sf-abs-mgr-v2-actions button{min-height:31px;padding:5px 9px;border-radius:7px;font-size:10px;font-weight:900}.sf-abs-mgr-v2-reject{border:1px solid #663643;background:#2a1820;color:#ff9baa}.sf-abs-mgr-v2-approve{border:1px solid #2bd8b6;background:#2bd8b6;color:#06261f}.sf-abs-mgr-v2-empty{padding:10px;border:1px dashed #294159;border-radius:8px;color:#8299ae;font-size:10px}
      .sf-abs-mgr-v2-back{position:fixed;inset:0;z-index:29500;background:rgba(2,7,13,.87);backdrop-filter:blur(8px);display:grid;place-items:center;padding:18px}.sf-abs-mgr-v2-modal{width:min(520px,96vw);background:linear-gradient(180deg,#0f1d2c,#081522);border:1px solid #2a4861;border-radius:17px;box-shadow:0 30px 100px rgba(0,0,0,.58);overflow:hidden}.sf-abs-mgr-v2-modal-head{padding:20px 22px 15px;border-bottom:1px solid #20364a}.sf-abs-mgr-v2-modal-head h2{margin:4px 0 4px;font-size:20px}.sf-abs-mgr-v2-modal-head p{margin:0;color:#8fa5b9;font-size:11px}.sf-abs-mgr-v2-body{padding:18px 22px}.sf-abs-mgr-v2-body label{display:block;margin-bottom:6px;color:#9bb0c4;font-size:10px;font-weight:800}.sf-abs-mgr-v2-body textarea{width:100%;min-height:90px;background:#081624;border:1px solid #294159;color:#edf6ff;border-radius:9px;padding:10px 11px;resize:vertical}.sf-abs-mgr-v2-warning{margin-bottom:12px;padding:9px 10px;border:1px solid #6c522a;background:#2e2415;color:#ffd080;border-radius:8px;font-size:10px;line-height:1.45}.sf-abs-mgr-v2-error{display:none;margin-top:10px;padding:9px 10px;border:1px solid #713342;background:#321821;color:#ffa0ad;border-radius:8px;font-size:10px}.sf-abs-mgr-v2-error.show{display:block}.sf-abs-mgr-v2-foot{display:flex;justify-content:flex-end;gap:8px;padding:14px 22px;border-top:1px solid #20364a}.sf-abs-mgr-v2-foot button{padding:9px 12px;border-radius:8px}.sf-abs-mgr-v2-cancel{border:1px solid #2a3f53;background:#0d1a27;color:#b3c2d1}
      @media(max-width:760px){.sf-abs-mgr-v2-row{grid-template-columns:1fr}.sf-abs-mgr-v2-actions{justify-content:flex-start}.sf-abs-mgr-v2-note{display:none}}
    `;document.head.appendChild(s);
  }

  function conflicts(a){
    const e=localEmployee(a.employee_id);if(!e)return 0;
    return assignmentsList().filter(x=>String(x.employeeId)===String(e.id)&&String(x.date)>=String(a.start_date)&&String(x.date)<=String(a.end_date)).length;
  }

  async function fetchOpen(){
    if(!B.client||!B.companyId)return[];
    const q=await B.client.from('absences').select('id,employee_id,start_date,end_date,absence_type,status,full_day,start_time,end_time,note,requested_at').eq('company_id',B.companyId).eq('request_source','EMPLOYEE').eq('status','Beantragt').order('requested_at',{ascending:true});
    if(q.error)throw q.error;return q.data||[];
  }

  function updateBadge(n){
    const b=document.querySelector('.nav button[data-view="absence"] .badge');if(!b)return;
    b.textContent=String(n);b.style.display=n?'inline-flex':'none';
  }

  async function render(force=false){
    if(rendering||!ALLOWED.has(role())||!B.ready||!B.client||!B.companyId)return;
    const page=document.getElementById('view-absence');if(!page)return;
    rendering=true;css();
    try{
      const rows=await fetchOpen(),key=rows.map(x=>x.id+':'+x.status).join('|');updateBadge(rows.length);
      let box=document.getElementById('sfAbsenceManagerV2');
      if(!box){box=document.createElement('div');box.id='sfAbsenceManagerV2';box.className='sf-abs-mgr-v2';const anchor=page.querySelector('.absence-manage-card')||page.querySelector('.page-head')?.nextElementSibling;if(anchor)page.insertBefore(box,anchor);else page.prepend(box)}
      if(!force&&key===lastKey&&box.dataset.ready==='1')return;
      lastKey=key;box.dataset.ready='1';
      if(!rows.length){box.innerHTML='<div class="sf-abs-mgr-v2-head"><span>☼</span><h3>Mitarbeiteranträge</h3><span class="sf-abs-mgr-v2-count">0 offen</span></div><div class="sf-abs-mgr-v2-empty">Keine offenen Abwesenheitsanträge.</div>';return}
      box.innerHTML=`<div class="sf-abs-mgr-v2-head"><span>☼</span><h3>Mitarbeiteranträge</h3><span class="sf-abs-mgr-v2-count">${rows.length} offen</span><span class="sf-abs-mgr-v2-note">Genehmigte Anträge werden sofort planungswirksam.</span></div><div class="sf-abs-mgr-v2-list">${rows.map(a=>{const e=localEmployee(a.employee_id),c=conflicts(a),partial=!a.full_day;return `<div class="sf-abs-mgr-v2-row" data-id="${a.id}"><div><b>${esc(e?e.first+' '+e.last:'Mitarbeiter')} · ${esc(a.absence_type)}</b><small>${esc(fmt(a.start_date))}${a.end_date!==a.start_date?' – '+esc(fmt(a.end_date)):''}${partial?' · '+esc(String(a.start_time||'').slice(0,5))+'–'+esc(String(a.end_time||'').slice(0,5)):''}</small>${a.note?`<small>Hinweis: ${esc(a.note)}</small>`:''}</div><div><span class="sf-abs-mgr-v2-status">In Prüfung</span><small>${c?`⚠ ${c} geplante Schicht${c===1?'':'en'}`:'Keine Planungskonflikte'}</small></div><div><small>Antrag eingegangen</small><b>${a.requested_at?esc(new Date(a.requested_at).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})):'–'}</b></div><div class="sf-abs-mgr-v2-actions"><button type="button" class="sf-abs-mgr-v2-reject" data-decision="REJECT">Ablehnen</button><button type="button" class="sf-abs-mgr-v2-approve" data-decision="APPROVE">${a.absence_type==='Krank'?'Als erfasst übernehmen':'Genehmigen'}</button></div></div>`}).join('')}</div>`;
      box.querySelectorAll('[data-decision]').forEach(btn=>btn.addEventListener('click',()=>openDecision(rows.find(x=>x.id===btn.closest('[data-id]')?.dataset.id),btn.dataset.decision)));
    }catch(e){console.error('Mitarbeiteranträge konnten nicht geladen werden',e)}finally{rendering=false}
  }

  function openDecision(a,decision){
    if(!a)return;document.getElementById('sfAbsMgrV2Modal')?.remove();const approve=decision==='APPROVE',e=localEmployee(a.employee_id),c=conflicts(a),m=document.createElement('div');m.id='sfAbsMgrV2Modal';m.className='sf-abs-mgr-v2-back';
    m.innerHTML=`<div class="sf-abs-mgr-v2-modal"><div class="sf-abs-mgr-v2-modal-head"><div class="eyebrow">ABWESENHEITSANTRAG</div><h2>${approve?(a.absence_type==='Krank'?'Krankmeldung übernehmen':'Antrag genehmigen'):'Antrag ablehnen'}</h2><p>${esc(e?e.first+' '+e.last:'Mitarbeiter')} · ${esc(a.absence_type)} · ${esc(fmt(a.start_date))}${a.end_date!==a.start_date?' – '+esc(fmt(a.end_date)):''}</p></div><div class="sf-abs-mgr-v2-body">${approve&&c?`<div class="sf-abs-mgr-v2-warning">⚠ Für diesen Zeitraum bestehen bereits ${c} geplante Schicht${c===1?'':'en'}. Nach der Genehmigung wird die Abwesenheit planungswirksam und die betroffenen Schichten werden im Dienstplan als Konflikt markiert.</div>`:''}<label>Rückmeldung an Mitarbeiter (optional)</label><textarea id="sfAbsMgrV2Note" maxlength="2000" placeholder="z. B. genehmigt / bitte anderen Zeitraum abstimmen …"></textarea><div id="sfAbsMgrV2Error" class="sf-abs-mgr-v2-error"></div></div><div class="sf-abs-mgr-v2-foot"><button type="button" class="sf-abs-mgr-v2-cancel">Abbrechen</button><button type="button" class="${approve?'sf-abs-mgr-v2-approve':'sf-abs-mgr-v2-reject'}" id="sfAbsMgrV2Submit">${approve?(a.absence_type==='Krank'?'Als erfasst übernehmen':'Genehmigen'):'Ablehnen'}</button></div></div>`;
    document.body.appendChild(m);const close=()=>m.remove();m.querySelector('.sf-abs-mgr-v2-cancel').onclick=close;m.addEventListener('click',ev=>{if(ev.target===m)close()});
    m.querySelector('#sfAbsMgrV2Submit').onclick=async ev=>{const btn=ev.currentTarget,err=m.querySelector('#sfAbsMgrV2Error');btn.disabled=true;btn.textContent='Wird gespeichert …';try{B.showLoading?.('Entscheidung wird gespeichert …');const {data,error}=await B.client.rpc('manager_review_absence_request',{p_absence_id:a.id,p_decision:decision,p_review_note:m.querySelector('#sfAbsMgrV2Note').value.trim()});if(error)throw error;close();await B.hydrate?.();await render(true);if(typeof renderAbsenceDashboard==='function')renderAbsenceDashboard();if(typeof renderCalendar==='function')renderCalendar();if(typeof renderPlanEmployeePool==='function')renderPlanEmployeePool();if(typeof showSaveToast==='function')showSaveToast(approve?'Abwesenheit übernommen':'Antrag abgelehnt',approve?`Status: ${data||'gespeichert'}.`:'Die Entscheidung ist jetzt im Mitarbeiterportal sichtbar.')}catch(ex){err.textContent=ex?.message||String(ex);err.classList.add('show');btn.disabled=false;btn.textContent=approve?(a.absence_type==='Krank'?'Als erfasst übernehmen':'Genehmigen'):'Ablehnen'}finally{B.hideLoading?.()}};
  }

  B.renderAbsenceManagerV2=()=>render(true);
  document.addEventListener('click',e=>{const nav=e.target.closest('.nav button[data-view="absence"]');if(nav)setTimeout(()=>render(true),80)},true);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.getElementById('view-absence')?.classList.contains('active'))setTimeout(()=>render(true),100)});
  setInterval(()=>{if(document.getElementById('view-absence')?.classList.contains('active'))render(false)},2500);
  setTimeout(()=>render(true),300);setTimeout(()=>render(true),1200);
})();
