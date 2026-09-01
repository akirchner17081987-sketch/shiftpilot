// SchichtFunk – Mitarbeiter-Abwesenheitsantrag V3, stabiler Render + delegierter Klick
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__absenceEmployeeV3)return;B.__absenceEmployeeV3=true;
  const TYPES=['Urlaub','Krank','Frei','Fortbildung','Sperrzeit','Sonderurlaub','Sonstiges'];
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>{if(!v)return'–';try{return new Date(String(v).slice(0,10)+'T00:00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'})}catch{return String(v)}};
  const state=s=>s==='Beantragt'?['In Prüfung','pending']:s==='Genehmigt'?['Genehmigt','good']:s==='Erfasst'?['Erfasst','good']:s==='Abgelehnt'?['Abgelehnt','bad']:[s||'–',''];

  function css(){
    if(document.getElementById('sfAbsEmpV3Css'))return;
    const s=document.createElement('style');s.id='sfAbsEmpV3Css';s.textContent=`
      .sf-ae3-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}.sf-ae3-head h3{margin:0!important}.sf-ae3-add{min-height:32px;padding:6px 10px!important;font-size:10px!important;white-space:nowrap;cursor:pointer}
      .sf-ae3-list{display:flex;flex-direction:column;gap:8px}.sf-ae3-row{border:1px solid #22394f;background:#0a1826;border-radius:9px;padding:10px}.sf-ae3-top{display:flex;gap:9px;align-items:flex-start}.sf-ae3-icon{min-width:38px;height:32px;padding:0 8px;border-radius:8px;background:#143b35;color:#72e6ce;display:grid;place-items:center;font-size:10px;font-weight:900}.sf-ae3-main{min-width:0;flex:1}.sf-ae3-main b{display:block;font-size:11px}.sf-ae3-main small{display:block;color:#8299ae;font-size:9px;margin-top:3px;line-height:1.4}.sf-ae3-state{font-size:9px;font-weight:900;padding:4px 7px;border-radius:999px;border:1px solid #3a5369;color:#b0c3d4}.sf-ae3-state.pending{border-color:#7c5c28;background:#2e2415;color:#ffd080}.sf-ae3-state.good{border-color:#246958;background:#0d2d26;color:#76e7cc}.sf-ae3-state.bad{border-color:#753443;background:#321821;color:#ff99aa}.sf-ae3-note{margin-top:7px;padding-top:7px;border-top:1px solid #1d3245;color:#91a7ba;font-size:9px}
      .sf-ae3-modal{position:fixed;inset:0;z-index:29000;background:rgba(2,7,13,.88);backdrop-filter:blur(8px);display:grid;place-items:center;padding:18px}.sf-ae3-card{width:min(540px,96vw);max-height:92vh;overflow:auto;background:linear-gradient(180deg,#0e1c2b,#081522);border:1px solid #2a4861;border-radius:17px;box-shadow:0 30px 100px rgba(0,0,0,.58)}.sf-ae3-mh{padding:20px 22px 15px;border-bottom:1px solid #20364a;display:flex;justify-content:space-between;gap:15px}.sf-ae3-mh h2{margin:4px 0;font-size:20px}.sf-ae3-mh p{margin:0;color:#8fa5b9;font-size:11px}.sf-ae3-x{width:34px;height:34px;border:1px solid #294159;background:#0c1a28;color:#9db2c5;border-radius:9px;cursor:pointer}.sf-ae3-body{padding:18px 22px}.sf-ae3-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.sf-ae3-field{display:flex;flex-direction:column;gap:6px;margin-bottom:10px}.sf-ae3-field label{color:#9bb0c4;font-size:10px;font-weight:800}.sf-ae3-field input,.sf-ae3-field select,.sf-ae3-field textarea{width:100%;background:#081624;border:1px solid #294159;color:#edf6ff;border-radius:9px;padding:10px 11px;outline:none}.sf-ae3-help{border:1px solid #25435a;background:#0b1b2a;color:#88a2b8;border-radius:8px;padding:9px 10px;font-size:9px;line-height:1.45}.sf-ae3-msg{display:none;margin-top:9px;padding:9px;border-radius:8px;font-size:10px;background:#321821;border:1px solid #713342;color:#ffa0ad}.sf-ae3-msg.show{display:block}.sf-ae3-foot{display:flex;justify-content:flex-end;gap:8px;padding:14px 22px;border-top:1px solid #20364a}
      @media(max-width:560px){.sf-ae3-head{align-items:flex-start;flex-direction:column}.sf-ae3-add{width:100%}.sf-ae3-grid{grid-template-columns:1fr}.sf-ae3-foot{flex-direction:column-reverse}.sf-ae3-foot button{width:100%}}
    `;document.head.appendChild(s);
  }

  function section(){
    const p=document.getElementById('sfEmployeePortal');if(!p)return null;
    return [...p.querySelectorAll('.sf-portal-card')].find(x=>x.querySelector('h3')?.textContent.trim()==='Abwesenheiten')||null;
  }

  function render(force=false){
    if(B.role!=='EMPLOYEE')return false;
    const sec=section(),d=B.employeePortalData;if(!sec||!d)return false;
    if(!force&&sec.dataset.sfAbsenceV3==='1'&&sec.querySelector('[data-sf-absence-request="1"]'))return true;
    css();
    const rows=(d.absences||[]).slice().sort((a,b)=>String(b.requested_at||b.created_at||b.start_date).localeCompare(String(a.requested_at||a.created_at||a.start_date)));
    const body=rows.length?`<div class="sf-ae3-list">${rows.slice(0,12).map(a=>{const [label,cl]=state(a.status);return `<div class="sf-ae3-row"><div class="sf-ae3-top"><div class="sf-ae3-icon">${a.absence_type==='Krank'?'✚':'☼'}</div><div class="sf-ae3-main"><b>${esc(a.absence_type)}</b><small>${esc(fmt(a.start_date))}${a.end_date&&a.end_date!==a.start_date?' – '+esc(fmt(a.end_date)):''}</small></div><span class="sf-ae3-state ${cl}">${esc(label)}</span></div>${a.note?`<div class="sf-ae3-note">Hinweis: ${esc(a.note)}</div>`:''}${a.review_note?`<div class="sf-ae3-note">Rückmeldung: ${esc(a.review_note)}</div>`:''}</div>`}).join('')}</div>`:'<div class="sf-empty">Noch keine Abwesenheiten oder Anträge vorhanden.</div>';
    sec.dataset.sfAbsenceV3='1';
    sec.innerHTML=`<div class="sf-ae3-head"><h3>Abwesenheiten</h3><button type="button" class="primary sf-ae3-add" data-sf-absence-request="1">＋ Antrag stellen</button></div>${body}`;
    return true;
  }

  function open(){
    css();document.getElementById('sfAbsenceEmployeeV3Modal')?.remove();
    const today=new Date().toISOString().slice(0,10),m=document.createElement('div');m.id='sfAbsenceEmployeeV3Modal';m.className='sf-ae3-modal';
    m.innerHTML=`<div class="sf-ae3-card" role="dialog" aria-modal="true" aria-labelledby="sfAe3Title" tabindex="-1"><div class="sf-ae3-mh"><div><div class="eyebrow">ABWESENHEITSANTRAG</div><h2 id="sfAe3Title">Abwesenheit melden</h2><p>Der Antrag wird an die Dienstplanung übermittelt.</p></div><button type="button" class="sf-ae3-x" aria-label="Dialog schließen">✕</button></div><div class="sf-ae3-body"><div class="sf-ae3-field"><label>Art</label><select id="sfAe3Type">${TYPES.map(x=>`<option>${esc(x)}</option>`).join('')}</select></div><div class="sf-ae3-grid"><div class="sf-ae3-field"><label>Von</label><input id="sfAe3From" type="date" value="${today}"></div><div class="sf-ae3-field"><label>Bis</label><input id="sfAe3To" type="date" value="${today}"></div></div><div class="sf-ae3-field"><label>Umfang</label><select id="sfAe3Full"><option value="1">Ganztägig</option><option value="0">Teil des Tages</option></select></div><div id="sfAe3Times" class="sf-ae3-grid" style="display:none"><div class="sf-ae3-field"><label>Beginn</label><input id="sfAe3Start" type="time"></div><div class="sf-ae3-field"><label>Ende</label><input id="sfAe3End" type="time"></div></div><div class="sf-ae3-field"><label>Bemerkung (optional)</label><textarea id="sfAe3Note" rows="3" maxlength="2000"></textarea></div><div class="sf-ae3-help">Der Antrag ist zunächst „In Prüfung“. Erst nach Freigabe wird die Abwesenheit planungswirksam.</div><div class="sf-ae3-msg" id="sfAe3Msg" role="alert" aria-live="assertive"></div></div><div class="sf-ae3-foot"><button type="button" class="ghost" id="sfAe3Cancel">Abbrechen</button><button type="button" class="primary" id="sfAe3Submit">Antrag senden</button></div></div>`;
    document.body.appendChild(m);
    const help=m.querySelector('.sf-ae3-help');help.id='sfAe3Help';help.textContent='Mit * gekennzeichnete Felder sind Pflichtfelder. '+help.textContent;
    [['sfAe3Type',true],['sfAe3From',true],['sfAe3To',true],['sfAe3Full',true],['sfAe3Start',true],['sfAe3End',true],['sfAe3Note',false]].forEach(([id,required])=>{const field=m.querySelector('#'+id),label=field?.previousElementSibling;if(!field||label?.tagName!=='LABEL')return;label.htmlFor=id;if(required){label.insertAdjacentHTML('beforeend',' <span aria-hidden="true">*</span>');field.required=true;field.setAttribute('aria-required','true')}field.setAttribute('aria-describedby','sfAe3Help')});
    ['#sfAe3Start','#sfAe3End'].forEach(sel=>{const field=m.querySelector(sel);field.required=false;field.setAttribute('aria-required','false')});
    const close=B.bindAccessibleModal?.(m,{initialFocus:'#sfAe3Type'})||(()=>m.remove()),msg=m.querySelector('#sfAe3Msg');
    m.querySelector('.sf-ae3-x').onclick=close;m.querySelector('#sfAe3Cancel').onclick=close;m.addEventListener('click',e=>{if(e.target===m)close()});
    m.querySelector('#sfAe3Full').onchange=e=>{const partial=e.target.value==='0';m.querySelector('#sfAe3Times').style.display=partial?'grid':'none';['#sfAe3Start','#sfAe3End'].forEach(sel=>{const field=m.querySelector(sel);field.required=partial;field.setAttribute('aria-required',String(partial))})};
    m.querySelector('#sfAe3Submit').onclick=async()=>{
      const type=m.querySelector('#sfAe3Type').value,from=m.querySelector('#sfAe3From').value,to=m.querySelector('#sfAe3To').value,full=m.querySelector('#sfAe3Full').value==='1',st=m.querySelector('#sfAe3Start').value,en=m.querySelector('#sfAe3End').value,note=m.querySelector('#sfAe3Note').value.trim();
      const fail=t=>{msg.textContent=t;msg.classList.add('show')};
      if(!from||!to||to<from)return fail('Bitte einen gültigen Zeitraum wählen.');
      if(!full&&(!st||!en))return fail('Bitte Beginn und Ende angeben.');
      try{
        const btn=m.querySelector('#sfAe3Submit');btn.disabled=true;btn.textContent='Wird gesendet …';
        const {error}=await B.client.rpc('employee_submit_absence_request',{p_absence_type:type,p_start_date:from,p_end_date:to,p_note:note,p_full_day:full,p_start_time:full?null:st,p_end_time:full?null:en,p_time_note:''});
        if(error)throw error;
        await B.hydrateEmployee();close();B.openEmployeePortal();setTimeout(()=>render(true),60);
      }catch(e){const btn=m.querySelector('#sfAe3Submit');btn.disabled=false;btn.textContent='Antrag senden';fail(e?.message||String(e))}
    };
  }

  B.openEmployeeAbsenceRequestV3=open;
  B.openEmployeeAbsenceRequest=open;

  // Delegierter Capture-Handler: bleibt auch nach jedem Portal-Neuaufbau aktiv.
  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('[data-sf-absence-request="1"],#sfEmployeeAbsenceAdd,#sfEmployeeAbsenceAddV2');
    if(!btn||B.role!=='EMPLOYEE')return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();open();
  },true);

  const old=B.openEmployeePortal;
  if(typeof old==='function')B.openEmployeePortal=function(){const r=old.apply(this,arguments);setTimeout(()=>render(true),0);setTimeout(()=>render(),120);setTimeout(()=>render(),500);return r};

  // Beobachtet nur, ob das Portal komplett neu aufgebaut wurde; eigener Render löst keine Schleife aus.
  let queued=false;
  const mo=new MutationObserver(()=>{if(queued||B.role!=='EMPLOYEE')return;queued=true;setTimeout(()=>{queued=false;render()},80)});
  mo.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(()=>render(true),0);setTimeout(()=>render(),300);setTimeout(()=>render(),1000);
})();
