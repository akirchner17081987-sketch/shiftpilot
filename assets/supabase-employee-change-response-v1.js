// SchichtFunk – Mitarbeiterantwort auf veröffentlichte Schichtänderungen V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(typeof B.openEmployeePortal!=='function')return;

  const terminal=new Set(['APPLIED','REJECTED','CANCELLED','SUPERSEDED','BLOCKED']);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function injectCss(){
    if(document.getElementById('sfEmployeeChangeCss'))return;
    const s=document.createElement('style');
    s.id='sfEmployeeChangeCss';
    s.textContent=`
      .sf-change-list{display:flex;flex-direction:column;gap:10px}
      .sf-change-card{border:1px solid #263f56;background:#091725;border-radius:11px;padding:12px}
      .sf-change-card.pending{border-color:#80612f;background:linear-gradient(180deg,#171a1d,#101923)}
      .sf-change-head{display:flex;align-items:flex-start;gap:9px;margin-bottom:10px}
      .sf-change-icon{width:30px;height:30px;flex:0 0 30px;border-radius:8px;display:grid;place-items:center;background:#15352f;color:#75e7ce;font-weight:900}
      .sf-change-title{min-width:0;flex:1}.sf-change-title b{display:block;font-size:12px;color:#eef7ff}.sf-change-title small{display:block;margin-top:3px;color:#8198ad;font-size:10px}
      .sf-change-status{flex:0 0 auto;padding:4px 7px;border-radius:999px;border:1px solid #36516a;color:#a9bfd2;font-size:9px;font-weight:800;white-space:nowrap}
      .sf-change-status.pending{border-color:#80612f;background:#2c2113;color:#ffd188}.sf-change-status.ok{border-color:#276b59;background:#0d2c25;color:#7be7cf}.sf-change-status.no{border-color:#763646;background:#321821;color:#ff9ead}
      .sf-change-compare{display:grid;grid-template-columns:1fr 22px 1fr;gap:7px;align-items:stretch;margin:8px 0}
      .sf-change-snapshot{padding:9px;background:#0c1c2b;border:1px solid #20384e;border-radius:8px;min-width:0}.sf-change-snapshot small{display:block;color:#7891a8;font-size:9px;margin-bottom:4px}.sf-change-snapshot b{display:block;font-size:11px;line-height:1.35}.sf-change-snapshot span{display:block;color:#9fb2c4;font-size:10px;margin-top:3px}
      .sf-change-arrow{display:grid;place-items:center;color:#5e7890;font-weight:900}
      .sf-change-reason{margin-top:8px;padding:8px 9px;border-radius:8px;background:#0c1926;color:#9eb3c5;font-size:10px;line-height:1.45}.sf-change-reason b{color:#dce8f4}
      .sf-change-actions{display:flex;gap:7px;margin-top:10px}.sf-change-actions button{flex:1;min-height:36px;border-radius:8px;font-size:11px;font-weight:900}.sf-change-reject{border:1px solid #693445;background:#27151c;color:#ff9eac}.sf-change-reject:hover{background:#351a24}.sf-change-approve{border:1px solid #27d6b4;background:#27d6b4;color:#05261f}.sf-change-approve:hover{background:#3de1c2}
      .sf-portal-toast{position:fixed;right:20px;top:84px;z-index:26000;width:min(390px,calc(100vw - 40px));padding:12px 14px;border-radius:10px;border:1px solid #286b59;background:#0d2c25;color:#9af0da;box-shadow:0 18px 60px rgba(0,0,0,.35);font-size:11px;font-weight:700}.sf-portal-toast.bad{border-color:#7a3747;background:#321821;color:#ff9ead}
      @media(max-width:620px){.sf-change-compare{grid-template-columns:1fr}.sf-change-arrow{transform:rotate(90deg);height:18px}.sf-change-actions{flex-direction:column}}
    `;
    document.head.appendChild(s);
  }

  function tz(){return B.employeePortalData?.company?.timezone||'Europe/Berlin'}
  function datePart(v){if(!v)return '–';try{return new Intl.DateTimeFormat('de-DE',{timeZone:tz(),weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(v))}catch{return '–'}}
  function timePart(v){if(!v)return '–';try{return new Intl.DateTimeFormat('de-DE',{timeZone:tz(),hour:'2-digit',minute:'2-digit'}).format(new Date(v))}catch{return '–'}}
  function snapshot(s,empty){
    if(!s)return `<b>${esc(empty||'–')}</b><span>Keine Schicht</span>`;
    return `<b>${esc(s.type||'Schicht')} · ${esc(datePart(s.startsAt))}</b><span>${esc(timePart(s.startsAt))} – ${esc(timePart(s.endsAt))}${Number(s.breakMinutes||0)?` · Pause ${Number(s.breakMinutes)} Min.`:''}</span>`;
  }
  function statusInfo(r,a){
    if(r.status==='APPLIED')return ['Übernommen','ok'];
    if(r.status==='REJECTED')return ['Abgelehnt','no'];
    if(r.status==='PENDING_WORKS_COUNCIL')return ['Weitere Freigabe offen','pending'];
    if(r.status==='READY_TO_APPLY')return ['Bestätigt','ok'];
    if(r.status==='PENDING_EMPLOYEE'||(r.requires_employee_approval&&(!a||a.status==='PENDING')))return ['Antwort erforderlich','pending'];
    if(r.status==='CANCELLED')return ['Storniert',''];
    if(r.status==='SUPERSEDED')return ['Überholt',''];
    return [String(r.status||'Offen').replaceAll('_',' '),''];
  }
  const actionName=a=>a==='UPDATE'?'Schichtänderung':a==='DELETE'?'Schicht entfällt':a==='CREATE'?'Neue Schicht':'Schichtänderung';

  function requestHtml(r,d){
    const approval=(d.approvals||[]).find(a=>a.change_request_id===r.id&&a.approval_type==='EMPLOYEE');
    const actionable=!!r.requires_employee_approval&&!terminal.has(r.status)&&(!approval||approval.status==='PENDING');
    const [label,cls]=statusInfo(r,approval);
    return `<div class="sf-change-card ${actionable?'pending':''}">
      <div class="sf-change-head"><div class="sf-change-icon">↺</div><div class="sf-change-title"><b>${esc(actionName(r.action))}</b><small>Angefragt am ${esc(datePart(r.requested_at))} · ${esc(timePart(r.requested_at))}</small></div><span class="sf-change-status ${cls}">${esc(label)}</span></div>
      <div class="sf-change-compare"><div class="sf-change-snapshot"><small>BISHER</small>${snapshot(r.old_snapshot,r.action==='CREATE'?'Keine Schicht':'–')}</div><div class="sf-change-arrow">→</div><div class="sf-change-snapshot"><small>VORGESCHLAGEN</small>${snapshot(r.proposed_snapshot,r.action==='DELETE'?'Schicht entfällt':'–')}</div></div>
      <div class="sf-change-reason"><b>Grund:</b> ${esc(r.reason_code||'Sonstiges')}${r.reason_text?` · ${esc(r.reason_text)}`:''}</div>
      ${actionable?`<div class="sf-change-actions"><button class="sf-change-reject" data-sf-change-decision="REJECTED" data-sf-change-id="${esc(r.id)}">✕ Ablehnen</button><button class="sf-change-approve" data-sf-change-decision="APPROVED" data-sf-change-id="${esc(r.id)}">✓ Bestätigen</button></div>`:''}
    </div>`;
  }

  function enhance(){
    injectCss();
    const d=B.employeePortalData,p=document.getElementById('sfEmployeePortal');if(!d||!p)return;
    const section=[...p.querySelectorAll('.sf-portal-card')].find(x=>x.querySelector('h3')?.textContent.trim()==='Schichtänderungen');if(!section)return;
    const requests=(d.requests||[]).slice().sort((a,b)=>{
      const ao=terminal.has(a.status)?1:0,bo=terminal.has(b.status)?1:0;
      return ao-bo||new Date(b.requested_at)-new Date(a.requested_at);
    });
    section.innerHTML=`<h3>Schichtänderungen</h3>${requests.length?`<div class="sf-change-list">${requests.slice(0,12).map(r=>requestHtml(r,d)).join('')}</div>`:'<div class="sf-empty">Keine offenen oder bisherigen Änderungsanträge vorhanden.</div>'}`;
    section.querySelectorAll('[data-sf-change-decision]').forEach(btn=>btn.addEventListener('click',()=>respond(btn.dataset.sfChangeId,btn.dataset.sfChangeDecision)));
  }

  function toast(text,bad=false){
    document.querySelector('.sf-portal-toast')?.remove();const e=document.createElement('div');e.className='sf-portal-toast'+(bad?' bad':'');e.textContent=text;document.body.appendChild(e);setTimeout(()=>e.remove(),5200);
  }

  async function respond(id,decision){
    if(!id||!B.client||B.role!=='EMPLOYEE')return;
    const approve=decision==='APPROVED';
    const ok=confirm(approve?'Diese Schichtänderung verbindlich bestätigen?':'Diese Schichtänderung ablehnen? Die bisherige Planung bleibt bestehen.');
    if(!ok)return;
    try{
      B.showLoading?.(approve?'Schichtänderung wird bestätigt …':'Schichtänderung wird abgelehnt …');
      const {data,error}=await B.client.rpc('employee_respond_to_shift_change',{p_change_id:id,p_decision:decision,p_comment:''});
      if(error)throw error;
      const result=Array.isArray(data)?data[0]:data;
      await B.hydrateEmployee();
      B.openEmployeePortal();
      B.hideLoading?.();
      toast(result?.message||(approve?'Änderung bestätigt.':'Änderung abgelehnt.'));
    }catch(e){
      B.hideLoading?.();
      console.error('Mitarbeiterantwort',e);
      toast(e?.message||String(e),true);
    }
  }

  B.respondToShiftChange=respond;
  const base=B.openEmployeePortal;
  B.openEmployeePortal=function(){const r=base.apply(this,arguments);setTimeout(enhance,0);return r};
  setTimeout(enhance,0);
})();