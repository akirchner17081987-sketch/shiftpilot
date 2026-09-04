// SchichtFunk – Rollen + Mitarbeiterportal V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  const MANAGER_ROLES=new Set(['OWNER','ADMIN','DISPATCHER','PLANNER']);
  const INVITE_PARAM='employeeInvite';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const timeZone=()=>B.employeePortalData?.company?.timezone||B.companyTimeZone||'Europe/Berlin';
  const dateOnly=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''));
  const fmtDate=v=>v?new Intl.DateTimeFormat('de-DE',{timeZone:dateOnly(v)?'UTC':timeZone(),weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(dateOnly(v)?`${v}T12:00:00Z`:v)):'–';
  const fmtTime=v=>v?new Intl.DateTimeFormat('de-DE',{timeZone:timeZone(),hour:'2-digit',minute:'2-digit'}).format(new Date(v)).replace('24:','00:'):'–';
  const dateKey=v=>v?new Intl.DateTimeFormat('sv-SE',{timeZone:timeZone(),year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v)):'';
  const shiftRange=(start,end)=>`${fmtTime(start)}–${fmtTime(end)}${start&&end&&dateKey(start)!==dateKey(end)?' (Folgetag)':''}`;
  B.companyTimeZone=B.companyTimeZone||'Europe/Berlin';B.sfFormatDate=fmtDate;B.sfFormatTime=fmtTime;B.sfShiftTimeRange=shiftRange;B.sfCompanyDateKey=dateKey;

  B.permissions={
    OWNER:{manageUsers:true,manageEmployees:true,plan:true,publish:true,compliance:true},
    ADMIN:{manageUsers:true,manageEmployees:true,plan:true,publish:true,compliance:true},
    DISPATCHER:{manageUsers:false,manageEmployees:true,plan:true,publish:true,compliance:false},
    PLANNER:{manageUsers:false,manageEmployees:true,plan:true,publish:true,compliance:false},
    VIEWER:{manageUsers:false,manageEmployees:false,plan:false,publish:false,compliance:false},
    EMPLOYEE:{manageUsers:false,manageEmployees:false,plan:false,publish:false,compliance:false}
  };
  B.can=key=>!!B.permissions[B.role]?.[key];

  B.employeeAccessMarkup=(email,active,status,label,buttonId='sfCreateEmployeeAccess')=>`
    <div class="sf-access-head">
      <div class="sf-access-title">
        <b><span aria-hidden="true">🔐</span> Mitarbeiterzugang</b>
        <small>${esc(email||'Keine E-Mail hinterlegt')}</small>
      </div>
      <span class="sf-access-status ${active?'active':status==='INVITED'?'invited':''}">${esc(label)}</span>
    </div>
    <div class="sf-access-actions">
      ${active
        ?'<span class="sf-access-note">✓ Eigener SchichtFunk-Zugang ist verknüpft.</span>'
        :`<button class="primary" type="button" id="${buttonId}">${status==='INVITED'?'Einladung neu erstellen':'Zugang einrichten'}</button>`}
    </div>`;

  function css(){
    if(document.getElementById('sfEmployeeAccessCss'))return;
    const s=document.createElement('style');s.id='sfEmployeeAccessCss';s.textContent=`
      .sf-access-box{margin-top:14px;padding:14px 15px;border:1px solid #29465e;border-radius:12px;background:linear-gradient(180deg,#0d1c2c,#0a1725);box-shadow:0 10px 28px rgba(0,0,0,.12)}
      .sf-access-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:11px}
      .sf-access-title{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
      .sf-access-title b{display:flex;align-items:center;gap:7px;color:#eef7ff;font-size:13px;line-height:1.25}
      .sf-access-title small{display:block;color:#8ea5ba;font-size:11px;line-height:1.35;overflow-wrap:anywhere}
      .sf-access-status{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;min-height:25px;padding:4px 9px;border-radius:999px;border:1px solid #3a566f;background:#102131;color:#b4c7d8;font-size:10px;line-height:1.1;font-weight:800;white-space:nowrap}
      .sf-access-status.active{border-color:#28715e;color:#82e8cf;background:#0f2d27}
      .sf-access-status.invited{border-color:#80612f;color:#ffd08a;background:#2d2314}
      .sf-access-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:0}
      .sf-access-actions .primary{width:auto;min-width:0;min-height:38px;padding:0 14px;border-radius:9px;font-size:12px;font-weight:800;white-space:nowrap}
      .sf-access-note{font-size:11px;line-height:1.4;color:#79dbc7}
      @media(max-width:560px){.sf-access-head{flex-direction:column;gap:8px}.sf-access-status{align-self:flex-start}.sf-access-actions .primary{width:100%}}
      .sf-link-modal{position:fixed;inset:0;z-index:22000;background:rgba(3,8,14,.86);display:grid;place-items:center;padding:18px}.sf-link-card{width:min(620px,96vw);background:#0c1927;border:1px solid #2a4861;border-radius:16px;box-shadow:0 30px 90px rgba(0,0,0,.55);padding:20px}.sf-link-card h2{margin:3px 0 6px}.sf-link-card p{color:#91a7bb;font-size:12px}.sf-link-row{display:flex;gap:7px;margin-top:12px}.sf-link-row input{flex:1;min-width:0;background:#071421;border:1px solid #2b465e;color:#eaf5ff;border-radius:8px;padding:10px}
      .sf-employee-register{position:fixed;inset:0;z-index:23000;background:rgba(2,7,13,.9);display:grid;place-items:center;padding:18px}.sf-employee-register-card{width:min(470px,96vw);background:linear-gradient(180deg,#0d1b2a,#08131f);border:1px solid #29455e;border-radius:18px;padding:22px}.sf-employee-register-card h2{margin:4px 0}.sf-employee-register-card p{color:#8fa5bd;font-size:12px}.sf-employee-register-card label{display:block;font-size:11px;font-weight:800;color:#9eb3c9;margin-top:12px}.sf-employee-register-card input{width:100%;margin-top:6px;background:#091624;border:1px solid #294159;color:#eef7ff;border-radius:10px;padding:11px 12px}.sf-employee-register-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}.sf-employee-register-msg{margin-top:12px;padding:10px;border-radius:8px;font-size:11px;display:none}.sf-employee-register-msg.show{display:block}.sf-employee-register-msg.good{background:#0e2d26;border:1px solid #216b59;color:#84ebd0}.sf-employee-register-msg.bad{background:#321822;border:1px solid #7a2d3c;color:#ff9aa8}
      .sf-portal{position:fixed;inset:0;z-index:18000;background:#07111d;color:#eef6ff;overflow:auto}.sf-portal-top{height:68px;position:sticky;top:0;z-index:2;background:#0a1725;border-bottom:1px solid #1f3449;display:flex;align-items:center;padding:0 28px;gap:14px}.sf-portal-logo{width:36px;height:36px;border-radius:11px;background:#27d6b4;color:#05251f;display:grid;place-items:center;font-weight:1000}.sf-portal-brand b{display:block}.sf-portal-brand small{display:block;color:#8299ae;font-size:10px;margin-top:2px}.sf-portal-top .spacer{margin-left:auto}.sf-portal-main{max-width:1180px;margin:0 auto;padding:28px}.sf-portal-welcome h1{margin:4px 0;font-size:28px}.sf-portal-welcome p{margin:0;color:#8ca2b7}.sf-portal-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:18px 0}.sf-portal-stat{border:1px solid #21384f;background:#0d1c2c;border-radius:13px;padding:15px}.sf-portal-stat small{color:#8299ae}.sf-portal-stat strong{display:block;font-size:22px;margin-top:5px}.sf-portal-grid{display:grid;grid-template-columns:1.25fr .75fr;gap:14px}.sf-portal-card{border:1px solid #21384f;background:#0d1b2a;border-radius:13px;padding:15px}.sf-portal-card h3{margin:0 0 12px;font-size:15px}.sf-shift-item,.sf-absence-item,.sf-request-item{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:11px 0;border-bottom:1px solid #1c3044}.sf-shift-item:last-child,.sf-absence-item:last-child,.sf-request-item:last-child{border-bottom:0}.sf-shift-code{min-width:54px;text-align:center;padding:7px 8px;border-radius:8px;background:#133a35;color:#7be7d0;font-weight:900}.sf-item-main b{display:block;font-size:12px}.sf-item-main small{display:block;color:#8299ae;margin-top:3px;font-size:10px}.sf-item-state{font-size:10px;padding:4px 7px;border:1px solid #35506a;border-radius:999px;color:#a8bdd0}.sf-profile-list{display:grid;grid-template-columns:1fr 1fr;gap:9px}.sf-profile-field{padding:10px;background:#091725;border:1px solid #1d3347;border-radius:9px}.sf-profile-field small{display:block;color:#7890a5;font-size:9px}.sf-profile-field b{display:block;margin-top:4px;font-size:12px}.sf-empty{padding:18px;text-align:center;color:#7e96aa;font-size:11px;border:1px dashed #274158;border-radius:9px}@media(max-width:820px){.sf-portal-stats{grid-template-columns:1fr}.sf-portal-grid{grid-template-columns:1fr}.sf-portal-main{padding:18px}.sf-portal-top{padding:0 16px}.sf-profile-list{grid-template-columns:1fr}}
      .sf-profile-warning{margin:16px 0 0;padding:12px 14px;border:1px solid #805e2e;border-radius:11px;background:#2c2114;color:#ffd18a;font-size:11px;line-height:1.5}.sf-profile-warning b{display:block;color:#ffe0ad;margin-bottom:3px}
    `;document.head.appendChild(s);
  }

  async function sha256(text){const bytes=new TextEncoder().encode(text),buf=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('')}
  function inviteToken(){return (crypto.randomUUID?.()||Math.random().toString(36).slice(2))+(crypto.randomUUID?.()||Math.random().toString(36).slice(2))}
  function productionBase(){return (B.productionUrl||location.origin+'/').replace(/\/+$/,'/')}
  function currentInviteToken(){return new URL(location.href).searchParams.get(INVITE_PARAM)||''}
  function removeInviteParam(){const u=new URL(location.href);u.searchParams.delete(INVITE_PARAM);history.replaceState(null,'',u.pathname+(u.search||'')+(u.hash||''))}

  B.createEmployeeInvite=async function(employeeId){
    if(!B.ready||!B.client||!MANAGER_ROLES.has(B.role))return;
    const e=(window.employees||[]).find(x=>String(x.id)===String(employeeId));if(!e)return;
    const dbId=e._dbId||B.empDb?.get(String(e.id));if(!dbId)return alert('Mitarbeiter ist noch nicht mit PostgreSQL verknüpft.');
    const q=await B.client.from('employees').select('id,email,auth_user_id,access_status,first_name,last_name').eq('id',dbId).single();if(q.error)return alert(q.error.message);
    if(!q.data.email)return alert('Bitte zuerst eine E-Mail-Adresse beim Mitarbeiter hinterlegen.');if(q.data.auth_user_id)return alert('Für diesen Mitarbeiter besteht bereits ein aktiver Zugang.');
    const token=inviteToken(),hash=await sha256(token),expires=new Date(Date.now()+7*86400000).toISOString();
    const up=await B.client.from('employee_access_invites').upsert({company_id:B.companyId,employee_id:dbId,email:q.data.email,token_hash:hash,expires_at:expires,claimed_at:null,claimed_by:null,created_by:B.user.id},{onConflict:'company_id,employee_id'});if(up.error)return alert(up.error.message);
    const eu=await B.client.from('employees').update({access_status:'INVITED'}).eq('id',dbId);if(eu.error)return alert(eu.error.message);
    const link=productionBase()+'?'+INVITE_PARAM+'='+encodeURIComponent(token);showInviteLink(`${q.data.first_name||''} ${q.data.last_name||''}`.trim(),q.data.email,link,expires);renderAccessControl(e);
  };

  function showInviteLink(name,email,link,expires){css();document.getElementById('sfInviteLinkModal')?.remove();const m=document.createElement('div');m.id='sfInviteLinkModal';m.className='sf-link-modal';m.innerHTML=`<div class="sf-link-card"><div class="eyebrow">MITARBEITERZUGANG</div><h2>Einladung erstellt</h2><p>Der persönliche Registrierungslink für <b>${esc(name)}</b> (${esc(email)}) ist 7 Tage gültig. Teile ihn nur mit dieser Person.</p><div class="sf-link-row"><input id="sfInviteLinkValue" readonly value="${esc(link)}"><button class="primary" id="sfCopyInvite">Kopieren</button></div><p>Gültig bis: ${esc(fmtDate(expires))}</p><div style="display:flex;justify-content:flex-end"><button class="ghost" id="sfCloseInvite">Schließen</button></div></div>`;document.body.appendChild(m);m.querySelector('#sfCloseInvite').onclick=()=>m.remove();m.querySelector('#sfCopyInvite').onclick=async()=>{try{await navigator.clipboard.writeText(link);m.querySelector('#sfCopyInvite').textContent='✓ Kopiert'}catch{m.querySelector('#sfInviteLinkValue').select()}}}

  async function renderAccessControl(e){
    css();const box=document.getElementById('employeeSummary');if(!box||!e||!B.ready||!MANAGER_ROLES.has(B.role))return;box.querySelector('.sf-access-box')?.remove();const d=document.createElement('div');d.className='sf-access-box';d.innerHTML='<small>Zugang wird geprüft …</small>';box.appendChild(d);
    const dbId=e._dbId||B.empDb?.get(String(e.id));if(!dbId){d.remove();return}const q=await B.client.from('employees').select('auth_user_id,access_status,email').eq('id',dbId).single();if(q.error){d.innerHTML='<small>Zugangsstatus konnte nicht geladen werden.</small>';return}
    const active=!!q.data.auth_user_id,status=active?'ACTIVE':(q.data.access_status||'NONE'),label=active?'Aktiv':status==='INVITED'?'Eingeladen':'Nicht eingerichtet';
    d.innerHTML=B.employeeAccessMarkup(q.data.email,active,status,label,'sfCreateEmployeeAccess');
    d.querySelector('#sfCreateEmployeeAccess')?.addEventListener('click',()=>B.createEmployeeInvite(e.id));
  }

  const baseSelect=window.selectEmployee;if(typeof baseSelect==='function')window.selectEmployee=function(id){const r=baseSelect.apply(this,arguments);setTimeout(()=>{const e=(window.employees||[]).find(x=>String(x.id)===String(id));if(e)renderAccessControl(e)},0);return r};
  const baseRenderEmployees=window.renderEmployees;if(typeof baseRenderEmployees==='function')window.renderEmployees=function(){const r=baseRenderEmployees.apply(this,arguments);if(window.selectedEmployeeId){const e=(window.employees||[]).find(x=>String(x.id)===String(window.selectedEmployeeId));if(e)setTimeout(()=>renderAccessControl(e),0)}return r};

  const baseEnsure=B.ensureCompany;if(typeof baseEnsure==='function')B.ensureCompany=async function(){
    const m=await B.client.from('company_members').select('company_id,role,status').eq('user_id',B.user.id).eq('status','ACTIVE').limit(1);if(m.error)throw m.error;if(m.data?.length){B.companyId=m.data[0].company_id;B.role=m.data[0].role;B.employeeDbId=null;return}
    const e=await B.client.from('employees').select('id,company_id,first_name,last_name,email,access_status').eq('auth_user_id',B.user.id).eq('status','active').maybeSingle();if(e.error)throw e.error;if(e.data){B.companyId=e.data.company_id;B.role='EMPLOYEE';B.employeeDbId=e.data.id;B.employeeRecord=e.data;return}return baseEnsure.apply(this,arguments);
  };

  B.hydrateEmployee=async function(){
    const [emp,company,shifts,abs,req,tpl,policy]=await Promise.all([
      B.client.from('employees').select('*').eq('auth_user_id',B.user.id).eq('status','active').single(),B.client.from('companies').select('id,name,timezone').eq('id',B.companyId).single(),B.client.from('shift_assignments').select('*').eq('employee_id',B.employeeDbId).eq('status','PUBLISHED').not('published_at','is',null).order('starts_at'),B.client.from('absences').select('*').eq('employee_id',B.employeeDbId).order('start_date',{ascending:false}),B.client.from('shift_change_requests').select('*').eq('employee_id',B.employeeDbId).order('requested_at',{ascending:false}),B.client.from('shift_templates').select('code,name,default_start,default_end').eq('company_id',B.companyId).eq('active',true),B.client.from('company_compliance_policy').select('employee_confirmation_under_hours').eq('company_id',B.companyId).maybeSingle()
    ]);for(const q of [emp,company,shifts,abs,req,tpl])if(q.error)throw q.error;B.companyTimeZone=company.data?.timezone||'Europe/Berlin';
    const requestIds=(req.data||[]).map(x=>x.id).filter(Boolean),assignmentIds=(shifts.data||[]).map(x=>x.id).filter(Boolean);
    const [apv,te]=await Promise.all([
      requestIds.length?B.client.from('shift_change_approvals').select('*').in('change_request_id',requestIds):Promise.resolve({data:[],error:null}),
      assignmentIds.length?B.client.from('time_entries').select('*').in('assignment_id',assignmentIds):Promise.resolve({data:[],error:null})
    ]);for(const q of [apv,te])if(q.error)throw q.error;if(policy.error)console.warn('Mitarbeiterportal: Bestätigungsfrist nicht lesbar, Standardwert 24 Stunden wird verwendet.',policy.error);B.employeePortalData={employee:emp.data,company:company.data,shifts:shifts.data||[],absences:abs.data||[],requests:req.data||[],approvals:apv.data||[],timeEntries:te.data||[],templates:tpl.data||[],policy:policy.error?{employee_confirmation_under_hours:24}:policy.data||{employee_confirmation_under_hours:24}};
  };

  const detachedShells=new Map();
  const detachShell=id=>{if(detachedShells.has(id))return;const node=document.getElementById(id);if(!node?.parentNode)return;const marker=document.createComment('sf-'+id);node.parentNode.insertBefore(marker,node);node.remove();detachedShells.set(id,{node,marker})};
  const detachNonEmployeeShell=()=>{detachShell('landingPage');detachShell('appShell')};
  const restoreNonEmployeeShell=()=>{detachedShells.forEach(({node,marker},id)=>{if(marker.parentNode)marker.parentNode.insertBefore(node,marker);marker.remove();detachedShells.delete(id)});document.getElementById('landingPage')?.style.setProperty('display','block');document.getElementById('appShell')?.style.setProperty('display','none')};
  B.restoreNonEmployeeShell=restoreNonEmployeeShell;
  B.openEmployeePortal=function(){
    css();const d=B.employeePortalData;if(!d)return;detachNonEmployeeShell();document.getElementById('sfEmployeePortal')?.remove();const now=Date.now(),upcoming=d.shifts.filter(s=>new Date(s.ends_at).getTime()>=now).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)),next=upcoming[0],weekEnd=now+7*86400000,weekHours=upcoming.filter(s=>new Date(s.starts_at).getTime()<weekEnd).reduce((n,s)=>n+Math.max(0,(new Date(s.ends_at)-new Date(s.starts_at))/3600000-(Number(s.break_minutes||0)/60)),0),name=`${d.employee.first_name||''} ${d.employee.last_name||''}`.trim(),missing=[];if(!String(d.employee.first_name||'').trim())missing.push('Vorname');if(!String(d.employee.last_name||'').trim())missing.push('Nachname');if(!String(d.employee.personnel_no||'').trim())missing.push('Personalnummer');if(!String(d.employee.employment||'').trim())missing.push('Beschäftigung');if(Number(d.employee.weekly_hours||0)<=0)missing.push('Wochenstunden');if(!String(d.employee.work_time_model||'').trim())missing.push('Arbeitszeitmodell');if(!Array.isArray(d.employee.shift_permissions)||!d.employee.shift_permissions.length)missing.push('Schichtberechtigungen');if(!String(d.employee.email||B.user?.email||'').trim())missing.push('E-Mail');const profileWarning=missing.length?`<div class="sf-profile-warning" role="status"><b>Stammdaten unvollständig</b>Bitte die Verwaltung bitten, folgende Angaben zu ergänzen: ${esc(missing.join(', '))}.</div>`:'';
    const shiftHtml=upcoming.length?upcoming.slice(0,20).map(s=>`<div class="sf-shift-item"><div class="sf-shift-code">${esc(s.shift_code)}</div><div class="sf-item-main"><b>${esc(fmtDate(s.starts_at))}</b><small>${esc(shiftRange(s.starts_at,s.ends_at))} · Pause ${Number(s.break_minutes||0)} Min.</small></div><span class="sf-item-state">${s.published_at?'Veröffentlicht':esc(s.status)}</span></div>`).join(''):'<div class="sf-empty">Aktuell sind keine veröffentlichten kommenden Schichten vorhanden.</div>';
    const absHtml=d.absences.length?d.absences.slice(0,8).map(a=>`<div class="sf-absence-item"><div class="sf-shift-code">–</div><div class="sf-item-main"><b>${esc(a.absence_type)}</b><small>${esc(fmtDate(a.start_date))}${a.end_date&&a.end_date!==a.start_date?' – '+esc(fmtDate(a.end_date)):''}</small></div><span class="sf-item-state">${esc(a.status)}</span></div>`).join(''):'<div class="sf-empty">Keine Abwesenheiten vorhanden.</div>';
    const reqHtml=d.requests.length?d.requests.slice(0,8).map(r=>`<div class="sf-request-item"><div class="sf-shift-code">↺</div><div class="sf-item-main"><b>${esc(r.reason_code||'Schichtänderung')}</b><small>${esc(r.action)} · ${esc(fmtDate(r.requested_at))}</small></div><span class="sf-item-state">${esc(r.status)}</span></div>`).join(''):'<div class="sf-empty">Keine offenen oder bisherigen Änderungsanträge vorhanden.</div>';
    const p=document.createElement('div');p.id='sfEmployeePortal';p.className='sf-portal';p.innerHTML=`<div class="sf-portal-top"><div class="sf-portal-logo">SF</div><div class="sf-portal-brand"><b>SchichtFunk</b><small>${esc(d.company.name||'Mitarbeiterportal')}</small></div><div class="spacer"></div><button class="ghost" id="sfEmployeeLogout" type="button">Abmelden</button></div><main class="sf-portal-main"><div class="sf-portal-welcome"><div class="eyebrow">MITARBEITERPORTAL</div><h1>Hallo ${esc(d.employee.first_name||name||'Mitarbeiter')}</h1><p>Hier siehst du ausschließlich deine persönlichen SchichtFunk-Daten.</p></div>${profileWarning}<div class="sf-portal-stats"><div class="sf-portal-stat"><small>Kommende Schichten</small><strong>${upcoming.length}</strong></div><div class="sf-portal-stat"><small>Nächste Schicht</small><strong>${next?esc(next.shift_code)+' · '+esc(fmtDate(next.starts_at)):'–'}</strong></div><div class="sf-portal-stat"><small>Geplante Stunden · 7 Tage</small><strong>${weekHours.toFixed(1)} h</strong></div></div><div class="sf-portal-grid"><section class="sf-portal-card"><h3>Meine Schichten</h3>${shiftHtml}</section><div style="display:grid;gap:14px"><section class="sf-portal-card"><h3>Schichtänderungen</h3>${reqHtml}</section><section class="sf-portal-card"><h3>Abwesenheiten</h3>${absHtml}</section><section class="sf-portal-card"><h3>Mein Profil</h3><div class="sf-profile-list"><div class="sf-profile-field"><small>Personalnummer</small><b>${esc(d.employee.personnel_no||'–')}</b></div><div class="sf-profile-field"><small>Beschäftigung</small><b>${esc(d.employee.employment||'–')}</b></div><div class="sf-profile-field"><small>Wochenstunden</small><b>${Number(d.employee.weekly_hours||0)>0?Number(d.employee.weekly_hours)+' h':'–'}</b></div><div class="sf-profile-field"><small>E-Mail</small><b>${esc(d.employee.email||B.user?.email||'–')}</b></div><div class="sf-profile-field"><small>Telefon</small><b>${esc(d.employee.phone||'–')}</b></div><div class="sf-profile-field"><small>Arbeitszeitmodell</small><b>${esc(d.employee.work_time_model||'–')}</b></div></div></section></div></div></main>`;document.body.appendChild(p);p.querySelector('#sfEmployeeLogout').onclick=async e=>{const btn=e.currentTarget;if(btn.disabled)return;btn.disabled=true;btn.textContent='Wird abgemeldet …';try{const {error}=await B.client.auth.signOut();if(error)throw error}catch(x){btn.disabled=false;btn.textContent='Abmelden';alert('Abmelden fehlgeschlagen: '+(x?.message||String(x)))}};
  };

  const staffBoot=B.boot;if(typeof staffBoot==='function')B.boot=async function(session){if(!session?.user)return;B.user=session.user;await B.ensureCompany();if(B.role!=='EMPLOYEE')return staffBoot.apply(this,arguments);if(B.employeeBootPromise)return B.employeeBootPromise;B.employeeBootPromise=(async()=>{B.showLoading?.('Mitarbeiterportal wird geladen …');try{await B.hydrateEmployee();B.ready=true;B.updateState?.();B.openEmployeePortal();return true}catch(e){console.error('Mitarbeiterportal konnte nicht geladen werden',e);throw e}finally{B.hideLoading?.()}})().finally(()=>B.employeeBootPromise=null);return B.employeeBootPromise};
  const staffOpen=B.baseOpenApp;if(typeof staffOpen==='function')B.baseOpenApp=function(view){if(B.role==='EMPLOYEE'){B.openEmployeePortal();return}return staffOpen.call(this,view)};
  function employeeRegisterDialog(token){
    css();if(!token||document.getElementById('sfEmployeeRegister'))return;const m=document.createElement('div');m.id='sfEmployeeRegister';m.className='sf-employee-register';m.innerHTML=`<div class="sf-employee-register-card"><div class="eyebrow">SCHICHTFUNK MITARBEITERZUGANG</div><h2>Zugang aktivieren</h2><p>Registriere dich mit der E-Mail-Adresse, für die dein persönlicher Einladungslink erstellt wurde.</p><label>E-Mail<input id="sfEmpRegEmail" type="email" autocomplete="email"></label><label>Passwort<input id="sfEmpRegPassword" type="password" minlength="8" autocomplete="new-password"></label><div id="sfEmpRegMsg" class="sf-employee-register-msg"></div><div class="sf-employee-register-actions"><button class="ghost" id="sfEmpRegLogin">Ich habe bereits ein Konto</button><button class="primary" id="sfEmpRegSubmit">Zugang erstellen</button></div></div>`;document.body.appendChild(m);const msg=m.querySelector('#sfEmpRegMsg'),say=(t,c='bad')=>{msg.className='sf-employee-register-msg show '+c;msg.textContent=t};m.querySelector('#sfEmpRegLogin').onclick=()=>{m.remove();B.authDialog?.('login')};m.querySelector('#sfEmpRegSubmit').onclick=async()=>{const email=m.querySelector('#sfEmpRegEmail').value.trim(),password=m.querySelector('#sfEmpRegPassword').value;if(!email||password.length<8)return say('Bitte E-Mail und ein Passwort mit mindestens 8 Zeichen eingeben.');try{B.showLoading?.('Mitarbeiterzugang wird erstellt …');const {data,error}=await B.client.auth.signUp({email,password,options:{data:{sf_employee_invite:token},emailRedirectTo:productionBase()+'#app'}});if(error)throw error;removeInviteParam();if(!data.session){B.hideLoading?.();say('Zugang erstellt. Bitte bestätige jetzt die E-Mail von Supabase. Danach kannst du dich normal bei SchichtFunk anmelden.','good');return}await B.boot(data.session);m.remove();B.hideLoading?.();B.openEmployeePortal()}catch(e){B.hideLoading?.();say(e.message||String(e))}};
  }

  const baseInit=B.init;if(typeof baseInit==='function')B.init=async function(){const r=await baseInit.apply(this,arguments);B.client?.auth?.onAuthStateChange?.(event=>{if(event==='SIGNED_OUT')restoreNonEmployeeShell()});const token=currentInviteToken();if(token&&!B.ready)employeeRegisterDialog(token);return r};
  css();
})();

