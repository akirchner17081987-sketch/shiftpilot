// SchichtFunk – Audit-Logs V1 (nur Inhaber/Administratoren)
(function(){
  const B=window.SFBackend=window.SFBackend||{},ADMIN=new Set(['OWNER','ADMIN']);
  let rows=[],loading=false;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={INSERT:'Angelegt',UPDATE:'Geändert',DELETE:'Gelöscht',SHIFT_CHANGE_APPLIED:'Schichtänderung übernommen'};
  const roleLabels={OWNER:'Inhaber',ADMIN:'Administrator',DISPATCHER:'Disponent',PLANNER:'Planer',VIEWER:'Leser',EMPLOYEE:'Mitarbeiter',SYSTEM:'System'};
  const fieldLabels={status:'Status',role:'Rolle',first_name:'Vorname',last_name:'Nachname',personnel_no:'Personalnummer',email:'E-Mail',phone:'Telefon',start_date:'Eintrittsdatum',contract_end:'Vertragsende',birth_date:'Geburtsdatum',weekly_hours:'Wochenstunden',shift_code:'Schicht',work_date:'Datum',starts_at:'Beginn',ends_at:'Ende',break_minutes:'Pause',absence_type:'Abwesenheitsart',full_day:'Ganztägig',note:'Notiz',reason_text:'Begründung',reason_code:'Grund',published_at:'Veröffentlicht am',active:'Aktiv',employment:'Beschäftigung',work_time_model:'Arbeitszeitmodell',required_count:'SOLL-Besetzung'};
  const valueLabels={REQUESTED:'Beantragt',PENDING:'Ausstehend',APPROVED:'Genehmigt',REJECTED:'Abgelehnt',CANCELLED:'Storniert',ACTIVE:'Aktiv',INACTIVE:'Inaktiv',DRAFT:'Entwurf',PUBLISHED:'Veröffentlicht',READY_TO_APPLY:'Bereit zur Übernahme',APPLIED:'Übernommen',EMPLOYEE:'Mitarbeiter',OWNER:'Inhaber',ADMIN:'Administrator',DISPATCHER:'Disponent',PLANNER:'Planer',VIEWER:'Leser'};
  const technicalFields=new Set(['id','company_id','legacy_id','created_at','updated_at','created_by','updated_by','version']);

  function css(){if(document.getElementById('sfAuditCss'))return;const s=document.createElement('style');s.id='sfAuditCss';s.textContent=`
    #sfAuditNav[hidden]{display:none!important}.sf-audit-toolbar{display:grid;grid-template-columns:repeat(4,minmax(145px,1fr)) auto;gap:10px;align-items:end}.sf-audit-toolbar label{display:grid;gap:6px;color:#9eb3c9;font-size:11px;font-weight:800}.sf-audit-toolbar input,.sf-audit-toolbar select{width:100%;min-height:40px;box-sizing:border-box;border:1px solid #29445d;border-radius:8px;background:#091624;color:#edf6ff;padding:8px 10px}.sf-audit-list{display:grid;gap:8px;margin-top:14px;max-height:min(68vh,720px);overflow-y:scroll;overscroll-behavior:contain;scrollbar-gutter:stable;padding-right:6px;scrollbar-width:thin;scrollbar-color:#2fd4bd #0a1725}.sf-audit-list::-webkit-scrollbar{width:10px}.sf-audit-list::-webkit-scrollbar-track{background:#0a1725;border-radius:10px}.sf-audit-list::-webkit-scrollbar-thumb{background:#2a766e;border:2px solid #0a1725;border-radius:10px}.sf-audit-list::-webkit-scrollbar-thumb:hover{background:#2fd4bd}.sf-audit-row{width:100%;display:grid;grid-template-columns:165px minmax(170px,1fr) minmax(190px,1.2fr) 125px 24px;gap:12px;align-items:center;text-align:left;border:1px solid #20394f;border-radius:10px;background:#0a1725;color:#eaf4ff;padding:12px}.sf-audit-row:hover{border-color:#367092;background:#0d1d2d}.sf-audit-row small{display:block;color:#89a0b6;margin-top:3px}.sf-audit-action{font-weight:900}.sf-audit-entity{color:#a8bdd0}.sf-audit-empty{padding:35px;text-align:center;border:1px dashed #29445d;border-radius:10px;color:#8da4ba}.sf-audit-modal{position:fixed;inset:0;z-index:25000;background:rgba(2,7,13,.88);display:grid;place-items:center;padding:18px}.sf-audit-detail{width:min(900px,96vw);max-height:90vh;overflow:auto;border:1px solid #29455e;border-radius:16px;background:#091522;box-shadow:0 30px 90px rgba(0,0,0,.55)}.sf-audit-detail header{display:flex;justify-content:space-between;gap:15px;padding:20px;border-bottom:1px solid #20384e}.sf-audit-detail h2{margin:3px 0}.sf-audit-detail-body{padding:20px}.sf-audit-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:15px}.sf-audit-meta div{border:1px solid #20384e;border-radius:9px;background:#0c1a29;padding:11px}.sf-audit-meta small{display:block;color:#849bb0;margin-bottom:4px}.sf-audit-changes{display:grid;gap:8px}.sf-audit-change-head,.sf-audit-change-row{display:grid;grid-template-columns:minmax(135px,.75fr) minmax(150px,1fr) 28px minmax(150px,1fr);gap:10px;align-items:center}.sf-audit-change-head{padding:0 12px;color:#839bb1;font-size:11px;font-weight:800}.sf-audit-change-row{border:1px solid #20384e;border-radius:9px;background:#0c1a29;padding:12px}.sf-audit-change-row>strong{font-size:12px}.sf-audit-change-value{overflow-wrap:anywhere;color:#d7e5f1}.sf-audit-change-arrow{text-align:center;color:#57dec5;font-weight:900}.sf-audit-technical{margin-top:15px;border-top:1px solid #20384e;padding-top:12px}.sf-audit-technical summary{cursor:pointer;color:#8da4ba;font-size:11px}.sf-audit-technical-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.sf-audit-technical pre{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #20384e;border-radius:9px;background:#07121e;color:#9eb3c7;font:10px/1.5 ui-monospace,monospace;margin:0;padding:10px}.sf-audit-close{min-width:42px}@media(max-width:820px){.sf-audit-toolbar{grid-template-columns:1fr 1fr}.sf-audit-row{grid-template-columns:1fr 1fr}.sf-audit-row>span:last-child{display:none}.sf-audit-meta,.sf-audit-technical-grid{grid-template-columns:1fr}}@media(max-width:620px){.sf-audit-change-head{display:none}.sf-audit-change-row{grid-template-columns:1fr}.sf-audit-change-arrow{text-align:left}.sf-audit-change-arrow:after{content:' Neuer Wert'}}@media(max-width:520px){.sf-audit-toolbar,.sf-audit-row{grid-template-columns:1fr}}
  `;document.head.appendChild(s)}

  function actionLabel(r){const prefix=(r.event_type||'').split('_')[0];return labels[r.event_type]||labels[prefix]||String(r.event_type||'Ereignis').replaceAll('_',' ')}
  function dateTime(v){return new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'medium'}).format(new Date(v))}
  function fieldLabel(key){if(fieldLabels[key])return fieldLabels[key];return String(key||'Wert').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}
  function displayValue(value,key){
    if(value===null||value===undefined||value==='')return '–';
    if(typeof value==='boolean')return value?'Ja':'Nein';
    if(Array.isArray(value))return value.length?value.map(v=>displayValue(v,key)).join(', '):'–';
    if(typeof value==='object')return Object.entries(value).filter(([k])=>!technicalFields.has(k)).map(([k,v])=>`${fieldLabel(k)}: ${displayValue(v,k)}`).join(' · ')||'–';
    const raw=String(value),translated=valueLabels[raw.toUpperCase()];
    if(translated)return translated;
    if(/^\d{4}-\d{2}-\d{2}T/.test(raw)){const d=new Date(raw);if(!Number.isNaN(d.valueOf()))return dateTime(raw)}
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){const d=new Date(raw+'T00:00:00');return new Intl.DateTimeFormat('de-DE',{dateStyle:'medium'}).format(d)}
    if(key==='break_minutes')return `${raw} Minuten`;
    return raw;
  }
  function changeRows(oldValues,newValues){
    const before=oldValues&&typeof oldValues==='object'?oldValues:{},after=newValues&&typeof newValues==='object'?newValues:{};
    return [...new Set([...Object.keys(before),...Object.keys(after)])]
      .filter(key=>!technicalFields.has(key)&&JSON.stringify(before[key])!==JSON.stringify(after[key]))
      .map(key=>({key,before:displayValue(before[key],key),after:displayValue(after[key],key)}));
  }
  function ensureAccess(){const nav=document.getElementById('sfAuditNav');if(nav)nav.hidden=!ADMIN.has(B.role);if(!ADMIN.has(B.role)&&document.getElementById('view-audit')?.classList.contains('active'))window.switchView?.('overview')}

  async function load(){
    if(loading||!ADMIN.has(B.role)||!B.client||!B.companyId)return;
    loading=true;
    const list=document.getElementById('sfAuditList');
    if(list)list.innerHTML='<div class="sf-audit-empty">Audit-Logs werden geladen …</div>';
    try{
      const from=document.getElementById('sfAuditFrom')?.value||null;
      const toValue=document.getElementById('sfAuditTo')?.value||null;
      const to=toValue?new Date(toValue+'T00:00:00'):null;
      if(to)to.setDate(to.getDate()+1);
      const actor=document.getElementById('sfAuditActor')?.value||null;
      const action=document.getElementById('sfAuditAction')?.value||null;
      const [q,users]=await Promise.all([
        B.client.rpc('manager_list_audit_events',{p_company_id:B.companyId,p_from:from?new Date(from+'T00:00:00').toISOString():null,p_to:to?to.toISOString():null,p_actor_id:actor||null,p_action:action||null,p_limit:500}),
        B.client.rpc('manager_list_company_users',{p_company_id:B.companyId})
      ]);
      if(q.error)throw q.error;
      if(users.error)throw users.error;
      const emails=new Map((users.data||[]).filter(x=>x.user_id).map(x=>[x.user_id,x.email]));
      rows=(q.data||[]).map(x=>({...x,actor_email:x.actor_id?(emails.get(x.actor_id)||x.actor_email):'System'}));
      renderFilters();
      renderList();
    }catch(e){
      if(list)list.innerHTML=`<div class="sf-audit-empty">Audit-Logs konnten nicht geladen werden.<br>${esc(e.message||e)}</div>`;
    }finally{loading=false}
  }

  function renderFilters(){
    const actor=document.getElementById('sfAuditActor'),action=document.getElementById('sfAuditAction');
    if(!actor||!action)return;
    const av=actor.value,ac=action.value;
    const actors=[...new Map(rows.filter(r=>r.actor_id).map(r=>[r.actor_id,r.actor_email||r.actor_role])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
    const actions=[...new Set(rows.map(r=>r.event_type).filter(Boolean))].sort();
    actor.innerHTML='<option value="">Alle Benutzer</option>'+actors.map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');
    action.innerHTML='<option value="">Alle Aktionen</option>'+actions.map(x=>`<option value="${esc(x)}">${esc(actionLabel({event_type:x}))}</option>`).join('');
    actor.value=av;action.value=ac;
  }

  function renderList(){
    const list=document.getElementById('sfAuditList'),count=document.getElementById('sfAuditCount');
    if(!list)return;
    if(count)count.textContent=String(rows.length);
    list.innerHTML=rows.length?rows.map(r=>`<button type="button" class="sf-audit-row" data-audit-id="${esc(r.id)}"><span><b>${esc(dateTime(r.created_at))}</b><small>${esc(r.id.slice(0,8))}</small></span><span><b>${esc(r.actor_email||'System')}</b><small>${esc(roleLabels[r.actor_role]||r.actor_role||'System')}</small></span><span class="sf-audit-action">${esc(actionLabel(r))}<small class="sf-audit-entity">${esc(r.entity_type||'System')}</small></span><span>${r.old_values&&r.new_values?'Vorher → Nachher':r.new_values?'Neuer Eintrag':r.old_values?'Entfernt':'Ereignis'}</span><span>›</span></button>`).join(''):'<div class="sf-audit-empty">Für die gewählten Filter wurden keine Einträge gefunden.</div>';
    list.querySelectorAll('[data-audit-id]').forEach(b=>b.onclick=()=>detail(rows.find(r=>r.id===b.dataset.auditId)));
  }

  function detail(r){
    if(!r)return;
    document.getElementById('sfAuditModal')?.remove();
    const m=document.createElement('div');m.id='sfAuditModal';m.className='sf-audit-modal';
    const json=v=>esc(JSON.stringify(v??{},null,2)),changes=changeRows(r.old_values,r.new_values);
    const changesHtml=changes.length?`<div class="sf-audit-changes"><div class="sf-audit-change-head"><span>Feld</span><span>Vorher</span><span></span><span>Nachher</span></div>${changes.map(change=>`<div class="sf-audit-change-row"><strong>${esc(fieldLabel(change.key))}</strong><span class="sf-audit-change-value">${esc(change.before)}</span><span class="sf-audit-change-arrow">→</span><span class="sf-audit-change-value">${esc(change.after)}</span></div>`).join('')}</div>`:'<div class="sf-audit-empty">Keine fachlichen Feldänderungen vorhanden.</div>';
    m.innerHTML=`<section class="sf-audit-detail" role="dialog" aria-modal="true" aria-labelledby="sfAuditDetailTitle"><header><div><div class="eyebrow">AUDIT-DETAIL</div><h2 id="sfAuditDetailTitle">${esc(actionLabel(r))}</h2><small>${esc(fieldLabel(r.entity_type||'System'))} · ${esc(r.entity_id||r.id)}</small></div><button type="button" class="ghost sf-audit-close" aria-label="Schließen">✕</button></header><div class="sf-audit-detail-body"><div class="sf-audit-meta"><div><small>Zeitstempel</small><b>${esc(dateTime(r.created_at))}</b></div><div><small>Benutzer</small><b>${esc(r.actor_email||'System')}</b></div><div><small>Rolle</small><b>${esc(roleLabels[r.actor_role]||r.actor_role||'System')}</b></div></div>${changesHtml}<details class="sf-audit-technical"><summary>Technische Details anzeigen</summary><div class="sf-audit-technical-grid"><pre>${json(r.old_values)}</pre><pre>${json(r.new_values)}</pre></div></details></div></section>`;
    document.body.appendChild(m);
    const close=()=>m.remove();
    m.querySelector('.sf-audit-close').onclick=close;
    m.onclick=e=>{if(e.target===m)close()};
    const key=e=>{if(e.key==='Escape'){document.removeEventListener('keydown',key);close()}};
    document.addEventListener('keydown',key);
    m.querySelector('.sf-audit-close').focus();
  }

  window.renderAuditLogs=()=>{css();ensureAccess();if(ADMIN.has(B.role))load()};
  document.addEventListener('click',e=>{if(e.target.closest('[data-view="audit"]'))setTimeout(window.renderAuditLogs,0)});
  const originalBoot=B.boot;
  if(typeof originalBoot==='function'&&!B.__auditBootWrapped){
    B.__auditBootWrapped=true;
    B.boot=async function(){const result=await originalBoot.apply(this,arguments);ensureAccess();return result};
  }
  document.addEventListener('DOMContentLoaded',()=>{
    css();ensureAccess();
    let attempts=0;
    const accessTimer=setInterval(()=>{ensureAccess();attempts+=1;if(B.role||attempts>=40)clearInterval(accessTimer)},250);
    document.getElementById('sfAuditApply')?.addEventListener('click',load);
    document.getElementById('sfAuditReset')?.addEventListener('click',()=>{['sfAuditFrom','sfAuditTo','sfAuditActor','sfAuditAction'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});load()});
  });
})();
