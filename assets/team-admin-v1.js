// SchichtFunk – Benutzer & Rechte V1
(function(){
  if(window.__sfUserPermissionsV1)return;window.__sfUserPermissionsV1=true;
  const B=window.SFBackend=window.SFBackend||{},ADMIN=new Set(['OWNER','ADMIN']),PARAM='teamInvite';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const roles={OWNER:['Inhaber','Vollzugriff, Unternehmensverantwortung und Administratoren verwalten.'],ADMIN:['Administrator','Benutzer, Stammdaten, Planung, Zeiten und Einstellungen verwalten. Administratoren verwaltet der Inhaber.'],TEAM_LEAD:['Teamleiter','Mitarbeiter und Dienstplan bearbeiten. Veröffentlichung und Zeiteinträge benötigen Zusatzrechte.'],EMPLOYEE:['Mitarbeiter','Persönliches Portal mit eigenen Diensten, Zeiten und Anträgen. Zeitverwaltung ist ein ausdrückliches Zusatzrecht.']};
  const roleOrder=['OWNER','ADMIN','TEAM_LEAD','EMPLOYEE'];
  const roleShort={OWNER:'Vollzugriff',ADMIN:'Verwaltung und Planung',TEAM_LEAD:'Planung · Personalgespräche automatisch',EMPLOYEE:'Persönliches Mitarbeiterportal'};
  const extras={publish_schedule:'Dienstplan veröffentlichen',manage_time:'Zeiten verwalten',confirm_time:'Zeiten bestätigen',read_only:'Nur lesender Dienstplanzugriff',personnel_conversations:'Personalgespräche (MFA erforderlich)'};
  const rights=[
    ['Dienstplan bearbeiten',['OWNER','ADMIN','TEAM_LEAD']],
    ['Mitarbeiter verwalten',['OWNER','ADMIN','TEAM_LEAD']],
    ['Dienstplan veröffentlichen',['OWNER','ADMIN'],'publish_schedule'],
    ['Zeiten verwalten',['OWNER','ADMIN'],'manage_time'],
    ['Zeiten bestätigen',['OWNER','ADMIN'],'confirm_time'],
    ['Personalgespräche für Mitarbeiter außer Teamleitern (MFA)',['OWNER','ADMIN','TEAM_LEAD']],
    ['Private Personalakten und Krankheitsgründe (MFA)',['OWNER','ADMIN']],
    ['Personenbezogene Monatsberichte und Lohndatenexporte (MFA)',['OWNER','ADMIN']],
    ['QR-Terminals verwalten (MFA)',['OWNER','ADMIN']],
    ['Benutzer und Einstellungen verwalten',['OWNER','ADMIN']],
    ['Administratoren verwalten',['OWNER']],
    ['Eigene Dienste, Zeiten und Anträge',['EMPLOYEE']]
  ];
  let employeeChoices=[],personnelChoices=[];
  const canAdminister=r=>B.role==='OWNER'||r.role!=='ADMIN';
  const selectedPermissions=m=>[...m.querySelectorAll('[data-access-permission]:checked')].map(el=>el.dataset.accessPermission);
  function extraFields(role,permissions=[],employeeId='',conversationIds=null){
    const required=role==='EMPLOYEE'&&!permissions.length;
    return `<fieldset class="sf-access-extras"><legend>Zusatzrechte</legend>${role==='ADMIN'||role==='OWNER'?'<p>Diese Rolle hat alle Verwaltungsrechte.</p>':Object.entries(extras).filter(([key])=>key!=='personnel_conversations'&&(role==='TEAM_LEAD'||['manage_time','confirm_time'].includes(key))).map(([key,label])=>`<label class="sf-access-check"><input type="checkbox" data-access-permission="${key}" ${permissions.includes(key)?'checked':''}> <span>${label}</span></label>`).join('')}<p>„Zeiten verwalten“ erlaubt Bearbeitung. „Zeiten bestätigen“ erlaubt Freigabe und Korrekturanforderung. Beide Rechte lassen sich getrennt vergeben. Änderungen und Freigaben verlangen eine bestätigte MFA-Sitzung; bestehende MFA-Sitzungen werden weiterverwendet.</p></fieldset>${role==='TEAM_LEAD'&&conversationIds!==null?`<fieldset id="sfPersonnelAssignments" class="sf-personnel-assignments" ${permissions.includes('read_only')?'hidden':''} aria-describedby="sfPersonnelScope"><legend>Mitarbeiterzuordnung</legend><p id="sfPersonnelScope" class="sf-personnel-scope">Alle Mitarbeiter werden automatisch zugeordnet – auch neu angelegte. Teamleiter-Akten sind ausgeschlossen.</p><label class="sf-personnel-search" for="sfPersonnelSearch">Mitarbeiter suchen<input id="sfPersonnelSearch" type="search" placeholder="Nachname oder Vorname" aria-controls="sfPersonnelChoices"></label><div class="sf-personnel-list-head"><b>Automatisch zugeordnet</b><span id="sfPersonnelSelectionCount" role="status" aria-live="polite"></span></div><div id="sfPersonnelChoices" class="sf-personnel-choices">${personnelChoices.map(e=>`<div class="sf-personnel-assigned-row" data-personnel-choice><span class="sf-personnel-assigned-mark" aria-hidden="true">✓</span><span>${esc(e.name)}</span></div>`).join('')}<p id="sfPersonnelEmpty" class="sf-personnel-empty" hidden>${personnelChoices.length?'Keine Mitarbeiter zur Suche gefunden.':'Keine zuordenbaren Mitarbeiter verfügbar.'}</p></div><div class="sf-personnel-protection"><b>MFA erforderlich</b><p>Krankheitsgründe, private Dokumente und bestehende private Notizen bleiben geschützt.</p><p>Neue Gesprächsnotizen und Ziele werden im Bereich „Personalgespräche“ erfasst.</p></div></fieldset>`:''}${role==='EMPLOYEE'?`<label id="sfAccessEmployeeLabel" ${required?'':'hidden'}>Mitarbeiterprofil<select id="sfAccessEmployee"><option value="">Bitte auswählen</option>${employeeChoices.map(e=>`<option value="${esc(e.id)}" ${e.id===employeeId?'selected':''}>${esc(e.name)}${e.email?' · '+esc(e.email):''}</option>`).join('')}</select></label><p id="sfAccessEmployeeHint">Ohne Zusatzrechte öffnet dieser Zugang das persönliche Mitarbeiterportal. Mit Zeitrechten ist der Verwaltungsbereich Zeiterfassung freigeschaltet.</p>`:''}`;
  }
  function bindExtras(m){
    const checks=[...m.querySelectorAll('[data-access-permission]')],read=m.querySelector('[data-access-permission="read_only"]');
    const sync=()=>{if(read?.checked)checks.filter(el=>el!==read).forEach(el=>{el.checked=false;el.disabled=true});else checks.forEach(el=>el.disabled=false);const label=m.querySelector('#sfAccessEmployeeLabel');if(label)label.hidden=selectedPermissions(m).length>0;const assignments=m.querySelector('#sfPersonnelAssignments');if(assignments)assignments.hidden=!!read?.checked;};
    checks.forEach(el=>el.onchange=sync);
    const search=m.querySelector('#sfPersonnelSearch'),choices=[...m.querySelectorAll('[data-personnel-choice]')];
    const selection=()=>{const count=m.querySelector('#sfPersonnelSelectionCount');if(count)count.textContent=`${choices.length} Mitarbeiter`;};
    const filter=()=>{const term=(search?.value||'').trim().toLocaleLowerCase('de-DE');choices.forEach(el=>el.hidden=!el.textContent.toLocaleLowerCase('de-DE').includes(term));const empty=m.querySelector('#sfPersonnelEmpty');if(empty)empty.hidden=choices.some(el=>!el.hidden);};
    if(search)search.oninput=filter;selection();filter();sync();
  }
    let rows=[],renderSequence=0;
  function css(){if(document.getElementById('sfUsersCss'))return;const link=document.createElement('link');link.id='sfUsersCss';link.rel='stylesheet';link.href='assets/users-permissions-v2.css?v=20261012-automatic-personnel1';document.head.appendChild(link)}
  const digest=async t=>{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')};
  const newToken=()=>crypto.randomUUID()+crypto.randomUUID();
  const base=()=>String(location.origin==='https://home-5021836522.app-ionos.space'?location.origin+'/':(B.productionUrl||location.origin+'/')).replace(/\/+$/,'/');
  function options(value){return roleOrder.filter(k=>(k!=='OWNER'||value==='OWNER')&&(k!=='ADMIN'||B.role==='OWNER'||value==='ADMIN')).map(k=>`<option value="${k}" ${k===value?'selected':''}>${esc(roles[k][0])}</option>`).join('')}
  const state=r=>r.kind==='INVITE'?(r.status==='EXPIRED'?'Einladung abgelaufen':'Einladung ausstehend'):(r.status==='DISABLED'?'Gesperrt':'Aktiv');
  const statusKey=r=>r.kind==='INVITE'?(r.status==='EXPIRED'?'expired':'invited'):(r.status==='DISABLED'?'disabled':'active');
  const statusIcon={active:'✓',disabled:'⊘',invited:'◷',expired:'!'};
  function employeeName(r){
    if(r.display_name)return r.display_name;
    const staff=typeof employees!=='undefined'&&Array.isArray(employees)?employees:[];
    const matches=staff.filter(e=>r.email&&String(e.email||'').trim().toLowerCase()===String(r.email).trim().toLowerCase());
    const employee=matches.length===1?matches[0]:null;
    return employee&&employee.last?[employee.last,employee.first].filter(Boolean).join(', '):String(r.email||'Benutzer');
  }
  function dateLabel(value){const d=new Date(value);return value&&Number.isFinite(d.getTime())?d.toLocaleDateString('de-DE'):'–'}
  function roleDetails(role,permissions=[]){const read=permissions.includes('read_only');return `<details class="sf-user-role-details"><summary>Berechtigungen anzeigen</summary><p>${esc(read?'Dienstplan mit Namen und Schichtzeiten ansehen. Personenakten und Zeiteinträge sind gesperrt.':role==='EMPLOYEE'&&permissions.length?'Zugriff auf die Zeitverwaltung mit den ausdrücklich zugewiesenen Zusatzrechten.':roles[role]?.[1]||'Unbekannte Rolle')}</p><ul>${(read?[]:rights.filter(([,allowed])=>allowed.includes(role)&&!(role==='EMPLOYEE'&&permissions.length))).map(([label])=>`<li>${esc(label)}</li>`).join('')}${permissions.filter(key=>key!=='personnel_conversations').map(key=>`<li>${esc(extras[key]||key)}</li>`).join('')}</ul></details>`}
  function permissionOverview(){return `<details id="sfRoleComparison" class="sf-users-permissions"><summary><span>Rollen und Berechtigungen vergleichen</span><small>4 Rollen · Zusatzrechte gezielt vergeben</small></summary><div class="sf-users-permissions-body"><p>Die Hauptrolle legt den Grundzugriff fest. Bei Teamleitern und Mitarbeitern werden zusätzliche Zeitrechte ausdrücklich vergeben. Nur der Inhaber darf Administratoren verwalten.</p><div class="sf-users-matrix-wrap" tabindex="0" role="region" aria-label="Rechtevergleich, horizontal scrollbar"><table class="sf-users-matrix"><caption>Berechtigungen der vier Hauptrollen</caption><thead><tr><th scope="col">Berechtigung</th>${roleOrder.map(role=>`<th scope="col">${esc(roles[role][0])}</th>`).join('')}</tr></thead><tbody>${rights.map(([label,allowed,key])=>`<tr><th scope="row">${esc(label)}</th>${roleOrder.map(role=>{const yes=allowed.includes(role),optional=key&&(role==='TEAM_LEAD'||role==='EMPLOYEE'&&['manage_time','confirm_time'].includes(key));return `<td><span class="sf-right-${yes?'yes':'no'}">${yes?'✓ Ja':optional?'Zusatzrecht':'– Nein'}</span></td>`}).join('')}</tr>`).join('')}</tbody></table></div><p>„Nur lesender Dienstplanzugriff“ ist eine Einschränkung der Teamleiterrolle. Mitarbeiter sehen standardmäßig ihre eigenen Daten. Die Inhaberrolle und der eigene Zugang sind geschützt.</p></div></details>`}
    async function load(companyId=B.companyId){if(!ADMIN.has(B.role))throw Error('Nicht berechtigt');const q=await B.client.rpc('manager_list_access_users',{p_company_id:companyId});if(q.error)throw q.error;if(B.companyId!==companyId)throw Error('Das Unternehmen wurde gewechselt. Bitte die Benutzerliste neu öffnen.');rows=q.data?.users||[];employeeChoices=q.data?.employees||[];personnelChoices=[...(q.data?.personnel_employees||[])].sort((a,b)=>String(a.name).localeCompare(String(b.name),'de',{sensitivity:'base'}))}
  function notice(host,message,bad=false){const box=host.querySelector('#sfUsersNotice');if(!box)return;box.textContent=message;box.className='sf-users-notice '+(bad?'bad':'good');box.hidden=false}
  function draw(host){
    const list=host.querySelector('#sfUsersList');if(!list)return;
    const term=(host.querySelector('#sfUserSearch')?.value||'').trim().toLocaleLowerCase('de-DE'),role=host.querySelector('#sfUserRoleFilter')?.value||'',status=host.querySelector('#sfUserStatusFilter')?.value||'';
    const data=rows.filter(r=>(!term||`${employeeName(r)} ${r.email} ${roles[r.role]?.[0]} ${state(r)}`.toLocaleLowerCase('de-DE').includes(term))&&(!role||r.role===role)&&(!status||statusKey(r)===status)).sort((a,b)=>employeeName(a).localeCompare(employeeName(b),'de',{sensitivity:'base'})||String(a.email).localeCompare(String(b.email),'de'));
    host.querySelector('#sfUsersCount').textContent=`${data.length} von ${rows.length} Einträgen · ${rows.filter(r=>r.kind!=='INVITE').length} Zugänge · ${rows.filter(r=>r.kind==='INVITE').length} Einladungen`;
    list.innerHTML=data.length?`<table class="sf-users-table"><caption class="sf-users-sr">Benutzer, Rollen, Zugangsstatus und Aktionen</caption><thead><tr><th scope="col">Benutzer</th><th scope="col">Rolle</th><th scope="col">Zugangsstatus</th><th scope="col">Aktionen</th></tr></thead><tbody>${data.map(r=>{
      const invite=r.kind==='INVITE',locked=r.role==='OWNER'||r.is_self||!canAdminister(r),name=employeeName(r),key=statusKey(r);
      const note=invite?'Gültig bis '+dateLabel(r.expires_at):r.is_self?'Dein Konto':r.role==='OWNER'?'Geschützter Inhaberzugang':'Teamkonto';
      return `<tr class="sf-user-row" data-id="${esc(r.record_id)}"><td data-label="Benutzer"><div class="sf-user-id"><span class="sf-user-avatar" aria-hidden="true">${esc(name.slice(0,1).toUpperCase())}</span><div><b>${esc(name)}</b>${name!==r.email?`<span class="sf-user-email">${esc(r.email)}</span>`:''}<small>${esc(note)}</small></div></div></td><td data-label="Rolle"><b class="sf-user-role-label">${esc(roles[r.role]?.[0]||r.role)}</b><small class="sf-user-role-short">${esc(r.role==='EMPLOYEE'&&r.permissions?.length?'Zeitverwaltung · Zusatzrechte zugewiesen':roleShort[r.role]||'')}</small>${roleDetails(r.role,r.permissions)}</td><td data-label="Zugangsstatus"><span class="sf-user-state ${key}"><span aria-hidden="true">${statusIcon[key]}</span> ${state(r)}</span></td><td data-label="Aktionen"><div class="sf-user-actions">${invite&&!canAdminister(r)?'<span class="sf-user-protected">Nur durch Inhaber verwaltbar</span>':invite?'<button type="button" class="ghost" data-new>Einladung erneuern</button><button type="button" class="danger" data-revoke>Einladung zurückziehen</button>':locked?`<span class="sf-user-protected">${r.is_self?'Eigener Zugang geschützt':r.role==='ADMIN'?'Nur durch Inhaber verwaltbar':'Inhaberzugang geschützt'}</span>`:`<button type="button" class="ghost" data-edit-role>Rolle ändern</button>${r.kind==='MEMBER'&&r.role==='TEAM_LEAD'&&r.status==='ACTIVE'&&!r.employee_id?'<button type="button" class="ghost" data-link-profile>Profil zuordnen</button>':''}<button type="button" class="${r.status==='ACTIVE'?'danger':'ghost'}" data-toggle>${r.status==='ACTIVE'?'Zugang sperren':'Zugang aktivieren'}</button>`}</div></td></tr>`;
    }).join('')}</tbody></table>`:'<div class="sf-users-empty"><b>Keine passenden Benutzer oder Einladungen</b><p>Prüfe den Suchbegriff und die Filter oder lade einen Benutzer ein.</p><button type="button" class="ghost" id="sfClearUserFilters">Filter zurücksetzen</button></div>';
    host.querySelector('#sfClearUserFilters')?.addEventListener('click',()=>{host.querySelector('#sfUserSearch').value='';host.querySelector('#sfUserRoleFilter').value='';host.querySelector('#sfUserStatusFilter').value='';draw(host)});
    const rowFor=button=>rows.find(r=>String(r.record_id)===button.closest('[data-id]').dataset.id);
    host.querySelectorAll('[data-edit-role]').forEach(button=>button.onclick=()=>editRole(rowFor(button),host));
    host.querySelectorAll('[data-link-profile]').forEach(button=>button.onclick=()=>linkExistingProfile(rowFor(button),host));
    host.querySelectorAll('[data-toggle]').forEach(button=>button.onclick=()=>toggleAccess(rowFor(button),host));
    host.querySelectorAll('[data-revoke]').forEach(button=>button.onclick=()=>revoke(rowFor(button),host));
    host.querySelectorAll('[data-new]').forEach(button=>button.onclick=()=>{const r=rowFor(button);invite(r.email,r.role,host,true,r.permissions,r.employee_id,r.record_id)});
  }
  B.renderUserManagement=async host=>{
    css();const request=++renderSequence,companyId=B.companyId;host.__sfUsersRequest=request;
    if(!ADMIN.has(B.role)){host.innerHTML='<div class="sf-users-empty">Nur Inhaber und Administratoren dürfen Benutzer verwalten.</div>';return}
    host.innerHTML='<div class="sf-users-empty" role="status">Benutzer werden geladen …</div>';
    try{
      await load(companyId);if(host.__sfUsersRequest!==request||!host.isConnected||B.companyId!==companyId)return;
      host.dataset.sfUsersCompany=companyId;
      host.innerHTML=`<div class="sf-users-editor"><div class="sf-users-tools"><label class="sf-users-search"><span>Benutzer suchen</span><input id="sfUserSearch" type="search" placeholder="Name, E-Mail oder Rolle"></label><label><span>Rolle</span><select id="sfUserRoleFilter"><option value="">Alle Rollen</option>${roleOrder.map(role=>`<option value="${role}">${esc(roles[role][0])}</option>`).join('')}</select></label><label><span>Status</span><select id="sfUserStatusFilter"><option value="">Alle Status</option><option value="active">Aktiv</option><option value="invited">Einladung ausstehend</option><option value="disabled">Gesperrt</option><option value="expired">Einladung abgelaufen</option></select></label><button type="button" class="primary" id="sfInviteUser">Benutzer einladen</button></div><div class="sf-users-list-head"><p id="sfUsersCount" role="status" aria-live="polite"></p><button type="button" class="ghost" id="sfRefreshUsers">Liste aktualisieren</button></div><div id="sfUsersNotice" class="sf-users-notice" role="status" aria-live="polite" hidden></div><div id="sfUsersList" class="sf-users-list"></div>${permissionOverview()}</div>`;
      draw(host);host.querySelector('#sfUserSearch').oninput=()=>draw(host);host.querySelectorAll('#sfUserRoleFilter,#sfUserStatusFilter').forEach(field=>field.onchange=()=>draw(host));host.querySelector('#sfInviteUser').onclick=()=>invite('','EMPLOYEE',host);
      host.querySelector('#sfRefreshUsers').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{await load(companyId);draw(host);notice(host,'Benutzerliste aktualisiert.')}catch(error){notice(host,error.message||'Die Liste konnte nicht geladen werden.',true)}finally{button.disabled=false}};
    }catch(error){if(host.__sfUsersRequest!==request)return;host.innerHTML=`<div class="sf-users-empty" role="alert"><b>Benutzer konnten nicht geladen werden.</b><p>${esc(error.message||error)}</p><button type="button" class="ghost" id="sfRetryUsers">Erneut versuchen</button></div>`;host.querySelector('#sfRetryUsers').onclick=()=>B.renderUserManagement(host)}
  };
  function assertCompany(companyId){if(B.companyId!==companyId||!ADMIN.has(B.role))throw Error('Der Zugang oder das Unternehmen hat sich geändert. Bitte die Benutzerverwaltung neu öffnen.')}
  function message(modal,text,bad=true){const box=modal.querySelector('#sfUserMsg');if(box){box.className='sf-user-msg show '+(bad?'bad':'good');box.textContent=text}}
  function pending(modal,busy){modal.dataset.busy=String(busy);modal.querySelectorAll('button,input,select').forEach(field=>field.disabled=busy)}
  async function refreshAfterWrite(host,companyId,label){try{await load(companyId);if(host.dataset.sfUsersCompany===companyId){draw(host);notice(host,label)}}catch(error){notice(host,'Änderung gespeichert. Die Liste konnte nicht aktualisiert werden: '+(error.message||error),true)}}
  async function update(r,role,status,host,companyId,permissions=r.permissions||[],personnelIds=null){assertCompany(companyId);if(r.kind==='INVITE'||r.role==='OWNER'||r.is_self)throw Error('Dieser Zugang ist geschützt.');const q=await B.client.rpc(personnelIds===null?'manager_set_access_profile':'manager_set_access_profile_with_personnel',{p_company_id:companyId,p_user_id:r.user_id,p_role:role,p_permissions:permissions,p_status:status,...(personnelIds===null?{}:{p_personnel_employee_ids:personnelIds})});if(q.error)throw q.error;await refreshAfterWrite(host,companyId,'Änderung für '+r.email+' gespeichert.');window.showSaveToast?.('Rechte gespeichert',r.email)}
  function linkExistingProfile(r,host){
    if(!r||r.kind!=='MEMBER'||r.role!=='TEAM_LEAD'||r.status!=='ACTIVE'||r.employee_id||r.is_self||!canAdminister(r))return;
    const companyId=B.companyId,email=String(r.email||'').trim().toLowerCase();
    const candidates=employeeChoices.filter(e=>email&&String(e.email||'').trim().toLowerCase()===email);
    modal(`<div class="eyebrow">BENUTZER & RECHTE</div><h2 id="sfUserDialogTitle">Mitarbeiterprofil zuordnen</h2><p>Teamleiter: <b>${esc(employeeName(r))}</b><br>${esc(r.email)}</p><p>Das Profil muss im aktuellen Unternehmen liegen, noch frei sein und dieselbe E-Mail-Adresse wie der bestätigte Zugang haben.</p>${candidates.length?`<label>Mitarbeiterprofil<select id="sfLinkEmployee"><option value="">Bitte auswählen</option>${candidates.map(e=>`<option value="${esc(e.id)}">${esc(e.name)} · ${esc(e.email)}</option>`).join('')}</select></label>`:'<p>Kein passendes freies Mitarbeiterprofil gefunden. Bitte prüfe die E-Mail-Adresse im Mitarbeiterprofil.</p>'}<div id="sfUserMsg" class="sf-user-msg" role="status" aria-live="polite"></div><div class="sf-user-modal-actions"><button type="button" class="ghost" data-close>Abbrechen</button>${candidates.length?'<button type="button" class="primary" id="sfLinkProfileSave">Profil zuordnen</button>':''}</div>`,m=>{
      const button=m.querySelector('#sfLinkProfileSave');if(!button)return;
      button.onclick=async()=>{const id=m.querySelector('#sfLinkEmployee').value;if(!id||!candidates.some(e=>String(e.id)===id)){message(m,'Bitte ein Mitarbeiterprofil auswählen.');return}pending(m,true);try{assertCompany(companyId);const q=await B.client.rpc('manager_link_existing_staff_profile',{p_company:companyId,p_user:r.user_id,p_employee:id});if(q.error)throw q.error;await refreshAfterWrite(host,companyId,'Mitarbeiterprofil für '+r.email+' zugeordnet.');m.__sfClose();window.showSaveToast?.('Mitarbeiterprofil zugeordnet',r.email)}catch(error){message(m,error.message||'Das Profil konnte nicht zugeordnet werden.');pending(m,false)}};
    });
  }
  function editRole(r,host){if(!r||r.role==='OWNER'||r.is_self||!canAdminister(r))return;const companyId=B.companyId;
    modal(`<div class="eyebrow">BENUTZER & RECHTE</div><h2 id="sfUserDialogTitle">Rolle ändern</h2><p>Benutzer: <b>${esc(employeeName(r))}</b><br>${esc(r.email)}</p><p>Aktuelle Rolle: <b>${esc(roles[r.role]?.[0]||r.role)}</b></p><label>Neue Rolle<select id="sfEditUserRole">${options(r.role)}</select></label><div id="sfSelectedRoleInfo"></div><div id="sfAccessExtraFields"></div><div id="sfUserMsg" class="sf-user-msg" role="status" aria-live="polite"></div><div class="sf-user-modal-actions"><button type="button" class="ghost" data-close>Abbrechen</button><button type="button" class="primary" id="sfSaveUserRole">Rolle speichern</button></div>`,m=>{
      const select=m.querySelector('#sfEditUserRole'),sync=()=>{m.querySelector('#sfSelectedRoleInfo').innerHTML=roleDetails(select.value);m.querySelector('#sfAccessExtraFields').innerHTML=extraFields(select.value,select.value===r.role?r.permissions:[],r.employee_id,select.value===r.role?r.personnel_employee_ids||[]:[]);bindExtras(m);};select.onchange=sync;sync();
      m.querySelector('#sfSaveUserRole').onclick=async()=>{const chosen=select.value,permissions=selectedPermissions(m);pending(m,true);try{await update(r,chosen,r.status,host,companyId,permissions);m.__sfClose()}catch(error){message(m,error.message||'Die Rolle konnte nicht gespeichert werden.');pending(m,false);bindExtras(m)}}
    });
  }
  function toggleAccess(r,host){if(!r||r.role==='OWNER'||r.is_self||!canAdminister(r))return;const companyId=B.companyId,block=r.status==='ACTIVE',label=block?'Zugang sperren':'Zugang aktivieren';
    modal(`<div class="eyebrow">BENUTZER & RECHTE</div><h2 id="sfUserDialogTitle">${label}?</h2><p>Benutzer: <b>${esc(employeeName(r))}</b><br>${esc(r.email)}</p><p>${block?'Der Teamzugang zu diesem Unternehmen wird gesperrt. Seine vorhandenen Daten bleiben erhalten.':'Der Benutzer erhält wieder Zugriff mit seiner vorhandenen Rolle.'}</p><div id="sfUserMsg" class="sf-user-msg" role="status" aria-live="polite"></div><div class="sf-user-modal-actions"><button type="button" class="ghost" data-close>Abbrechen</button><button type="button" class="${block?'danger':'primary'}" id="sfConfirmUserAccess">${label}</button></div>`,m=>{m.querySelector('#sfConfirmUserAccess').onclick=async()=>{pending(m,true);try{await update(r,r.role,block?'DISABLED':'ACTIVE',host,companyId);m.__sfClose()}catch(error){message(m,error.message||'Der Zugang konnte nicht geändert werden.');pending(m,false)}}});
  }
  function revoke(r,host){if(!r||r.kind!=='INVITE')return;const companyId=B.companyId;
    modal(`<div class="eyebrow">BENUTZER & RECHTE</div><h2 id="sfUserDialogTitle">Einladung zurückziehen?</h2><p>Einladung für <b>${esc(r.email)}</b>.</p><p>Der bisherige Einladungslink wird ungültig.</p><div id="sfUserMsg" class="sf-user-msg" role="status" aria-live="polite"></div><div class="sf-user-modal-actions"><button type="button" class="ghost" data-close>Abbrechen</button><button type="button" class="danger" id="sfConfirmRevoke">Einladung zurückziehen</button></div>`,m=>{m.querySelector('#sfConfirmRevoke').onclick=async()=>{pending(m,true);try{assertCompany(companyId);const q=await B.client.rpc(B.__sfMultiRoleInvitesReady===true?'manager_revoke_multi_or_single_invite':'manager_revoke_access_invite',{p_company_id:companyId,p_invite_id:r.record_id});if(q.error)throw q.error;await refreshAfterWrite(host,companyId,'Einladung für '+r.email+' zurückgezogen.');m.__sfClose();window.showSaveToast?.('Einladung zurückgezogen','Der Link ist nicht mehr gültig.')}catch(error){message(m,error.message||'Die Einladung konnte nicht zurückgezogen werden.');pending(m,false)}}});
  }
  function multiInvite(email='',role='EMPLOYEE',host,employeeId='',renewId=null){
    const source=B.companyId;
    modal(`<div class="eyebrow">BENUTZER & RECHTE</div><h2 id="sfUserDialogTitle">Benutzer einladen</h2><p>Wähle die Unternehmen und die jeweilige Rolle. Eine persönliche Einladung gilt für die gesamte Auswahl.</p><label>E-Mail-Adresse<input id="sfInviteEmail" type="email" autocomplete="email" value="${esc(email)}" ${renewId?'readonly':''} placeholder="name@unternehmen.de"></label><div id="sfMultiInviteCompanies" aria-live="polite">Unternehmen werden geladen …</div><div id="sfUserMsg" class="sf-user-msg" role="status" aria-live="polite"></div><div class="sf-user-modal-actions"><button type="button" class="ghost" data-close>Abbrechen</button><button type="button" class="primary" id="sfCreateTeamInvite" disabled>Einladung erstellen</button></div>`,m=>{
      const list=m.querySelector('#sfMultiInviteCompanies'),button=m.querySelector('#sfCreateTeamInvite');let options=[],sync=()=>{},snapshot=null;
      const render=()=>{
        list.innerHTML=options.map(item=>{
          const current=item.company_id===source,chosen=current?role:'EMPLOYEE';
          const staff=(item.employees||[]).map(e=>`<option value="${esc(e.id)}" ${current&&String(e.id)===String(employeeId)?'selected':''}>${esc(e.name)}${e.email?' · '+esc(e.email):''}</option>`).join('');
          return `<fieldset data-multi-company="${esc(item.company_id)}"><legend>${esc(item.company_name)}</legend><label class="sf-access-check"><input type="checkbox" data-company-enabled ${current?'checked disabled':''}><span>${current?'Aktuelles Unternehmen (erforderlich)':'Zugang freigeben'}</span></label><label>Rolle<select data-company-role><option value="EMPLOYEE" ${chosen==='EMPLOYEE'?'selected':''}>Mitarbeiter</option><option value="TEAM_LEAD" ${chosen==='TEAM_LEAD'?'selected':''}>Teamleiter</option>${item.can_invite_admin?'<option value="ADMIN" '+(chosen==='ADMIN'?'selected':'')+'>Administrator</option>':''}</select></label><label data-employee-label><span data-employee-title>Mitarbeiterprofil</span><select data-company-employee><option value="">Bitte auswählen</option>${staff}</select></label></fieldset>`;
        }).join('')||'<p>Keine verwaltbaren Unternehmen gefunden.</p>';
        sync=()=>{for(const field of list.querySelectorAll('[data-multi-company]')){const active=field.querySelector('[data-company-enabled]').checked,roleField=field.querySelector('[data-company-role]'),label=field.querySelector('[data-employee-label]'),profile=field.querySelector('[data-company-employee]');field.querySelector('[data-company-enabled]').disabled=field.dataset.multiCompany===source;roleField.disabled=!active;label.hidden=roleField.value==='ADMIN';profile.disabled=!active||roleField.value==='ADMIN';label.querySelector('[data-employee-title]').textContent=roleField.value==='TEAM_LEAD'?'Mitarbeiterprofil (optional)':'Mitarbeiterprofil'}};
        list.querySelectorAll('[data-company-enabled],[data-company-role]').forEach(el=>el.addEventListener('change',sync));sync();
      };
      (async()=>{try{
        assertCompany(source);
        if(renewId){
          const saved=await B.client.rpc('manager_multi_invite_snapshot',{p_company_id:source,p_invite_id:renewId});if(saved.error)throw saved.error;assertCompany(source);
          snapshot=saved.data;if(!snapshot){m.__sfClose();invite(email,role,host,true,[],employeeId,renewId,true);return}
        }
        const q=await B.client.rpc('manager_multi_invite_options');if(q.error)throw q.error;assertCompany(source);
        options=Array.isArray(q.data)?q.data:[];if(!options.some(x=>x.company_id===source))throw Error('Das aktuelle Unternehmen ist nicht verfügbar.');
        render();
        if(snapshot){
          for(const target of snapshot.targets||[]){
            const field=[...list.querySelectorAll('[data-multi-company]')].find(x=>x.dataset.multiCompany===target.company_id);
            if(!field)throw Error('Ein Unternehmen der Einladung ist nicht mehr verfügbar.');
            field.querySelector('[data-company-enabled]').checked=true;
            const select=field.querySelector('[data-company-role]');select.value=target.role;
            if(select.value!==target.role)throw Error('Eine Rolle der Einladung ist nicht mehr verfügbar.');
            if(target.employee_id){const employee=field.querySelector('[data-company-employee]');employee.value=target.employee_id;if(employee.value!==target.employee_id)throw Error('Ein Mitarbeiterprofil der Einladung ist nicht mehr verfügbar.')}
          }
          sync();
        }
        button.disabled=false;
      }catch(error){list.textContent='Unternehmen konnten nicht geladen werden.';message(m,error.message||'Bitte erneut versuchen.')}})();
      button.onclick=async()=>{
        const mail=m.querySelector('#sfInviteEmail').value.trim().toLowerCase();
        if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)){message(m,'Bitte eine gültige E-Mail-Adresse eingeben.');return}
        const targets=[];
        for(const field of list.querySelectorAll('[data-multi-company]')){
          if(!field.querySelector('[data-company-enabled]').checked)continue;
          const chosen=field.querySelector('[data-company-role]').value,profile=field.querySelector('[data-company-employee]').value;
          if(chosen==='EMPLOYEE'&&!profile){message(m,'Bitte für jedes Unternehmen mit Mitarbeiterrolle ein Mitarbeiterprofil auswählen.');return}
          targets.push({company_id:field.dataset.multiCompany,role:chosen,employee_id:chosen==='EMPLOYEE'||chosen==='TEAM_LEAD'?(profile||null):null});
        }
        pending(m,true);
        try{
          assertCompany(source);const raw=newToken(),q=await B.client.rpc(renewId?'manager_renew_multi_access_invite':'manager_create_multi_access_invite',{p_source:source,...(renewId?{p_invite_id:renewId}:{}),p_email:mail,p_targets:targets,p_token_hash:await digest(raw)});if(q.error)throw q.error;
          const link=base()+'?'+q.data.parameter+'='+encodeURIComponent(raw);
          let sent=false;try{const result=await B.client.functions.invoke('send-invitation',{body:{companyId:source,inviteId:q.data.id,kind:q.data.parameter,token:raw}});sent=!result.error}catch(_){}
          m.querySelector('.sf-user-card').innerHTML=`<div class="eyebrow">EINLADUNG ERSTELLT</div><h2 id="sfUserDialogTitle">Link sicher weitergeben</h2><p>Einladung für <b>${esc(mail)}</b> mit ${targets.length} Unternehmenszugang/Zugängen.</p><p>${sent?'Die Einladung wurde zum Versand angenommen.':'Die E-Mail konnte nicht versendet werden. Bitte den Link persönlich weitergeben.'}</p><label>Einladungslink</label><div class="sf-invite-link"><input id="sfTeamInviteValue" aria-label="Persönlicher Einladungslink" readonly value="${esc(link)}"><button type="button" class="primary" id="sfCopyTeamInvite">Link kopieren</button></div><div class="sf-user-modal-actions"><button type="button" class="ghost" data-close>Schließen</button></div>`;
          m.dataset.busy='false';bindClose(m);m.querySelector('#sfCopyTeamInvite').onclick=async()=>{try{await navigator.clipboard.writeText(link);m.querySelector('#sfCopyTeamInvite').textContent='✓ Kopiert'}catch{m.querySelector('#sfTeamInviteValue').select()}};
          m.querySelector('#sfCopyTeamInvite').focus();await refreshAfterWrite(host,source,'Einladung für '+mail+' erstellt.');
        }catch(error){message(m,error.message||'Die Einladung konnte nicht erstellt werden.');pending(m,false);sync()}
      };
    });
  }
  function invite(email='',role='EMPLOYEE',host,renew=false,permissions=[],employeeId='',inviteId=null,forceLegacy=false){const companyId=B.companyId;
    if(B.__sfMultiRoleInvitesReady===true&&!forceLegacy)return multiInvite(email,role,host,employeeId,renew?inviteId:null);
    modal(`<div class="eyebrow">BENUTZER & RECHTE</div><h2 id="sfUserDialogTitle">${renew?'Einladung erneuern':'Benutzer einladen'}</h2><p>${renew?'Ein neuer Link ersetzt den bisherigen Einladungslink. Du kannst dabei die Rolle ändern.':'Erstelle einen persönlichen Einladungslink für einen Teamzugang.'} Der Link ist sieben Tage gültig und wird per E-Mail versendet.</p><label>E-Mail-Adresse<input id="sfInviteEmail" type="email" autocomplete="email" value="${esc(email)}" ${renew?'readonly':''} placeholder="name@unternehmen.de"></label><label>Rolle<select id="sfInviteRole">${options(role)}</select></label><div id="sfSelectedRoleInfo"></div><div id="sfAccessExtraFields"></div><div id="sfUserMsg" class="sf-user-msg" role="status" aria-live="polite"></div><div class="sf-user-modal-actions"><button type="button" class="ghost" data-close>Abbrechen</button><button type="button" class="primary" id="sfCreateTeamInvite">${renew?'Neuen Link erstellen':'Einladung erstellen'}</button></div>`,m=>{
      const select=m.querySelector('#sfInviteRole'),sync=()=>{m.querySelector('#sfSelectedRoleInfo').innerHTML=roleDetails(select.value);m.querySelector('#sfAccessExtraFields').innerHTML=extraFields(select.value,select.value===role?permissions:[],employeeId);bindExtras(m);};select.onchange=sync;sync();
      m.querySelector('#sfCreateTeamInvite').onclick=async()=>{
        const mail=m.querySelector('#sfInviteEmail').value.trim().toLowerCase(),chosen=select.value;
        if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)){message(m,'Bitte eine gültige E-Mail-Adresse eingeben.');return}
        const selected=selectedPermissions(m),employee=m.querySelector('#sfAccessEmployee')?.value||null;if(chosen==='EMPLOYEE'&&!selected.length&&!employee){message(m,'Bitte das zugehörige Mitarbeiterprofil auswählen.');return}pending(m,true);
        try{
          assertCompany(companyId);const raw=newToken(),q=await B.client.rpc('manager_create_access_invite',{p_company_id:companyId,p_email:mail,p_role:chosen,p_permissions:selected,p_employee_id:employee,p_token_hash:await digest(raw)});if(q.error)throw q.error;
          const link=base()+'?'+(q.data?.parameter||PARAM)+'='+encodeURIComponent(raw);
          let sendOk=false;
          try{
            const result=await B.client.functions.invoke('send-invitation',{body:{companyId,inviteId:q.data.id,kind:q.data.parameter||PARAM,token:raw}});
            sendOk=!result.error;
          }catch(_){sendOk=false}

          m.querySelector('.sf-user-card').innerHTML=`<div class="eyebrow">EINLADUNG ERSTELLT</div><h2 id="sfUserDialogTitle">Link sicher weitergeben</h2><p>Einladung für <b>${esc(mail)}</b> als ${esc(roles[chosen][0])}.</p><p>${sendOk?'Die Einladung wurde zum Versand angenommen.':'Die E-Mail konnte nicht versendet werden. Bitte den Link persönlich weitergeben oder die Einladung später erneuern.'}${renew?' Der bisherige Link ist jetzt ungültig.':''}</p><label>Einladungslink</label><div class="sf-invite-link"><input id="sfTeamInviteValue" aria-label="Persönlicher Einladungslink" readonly value="${esc(link)}"><button type="button" class="primary" id="sfCopyTeamInvite">Link kopieren</button></div><div class="sf-user-modal-actions"><button type="button" class="ghost" data-close>Schließen</button></div>`;
          m.dataset.busy='false';bindClose(m);m.querySelector('#sfCopyTeamInvite').onclick=async()=>{try{await navigator.clipboard.writeText(link);m.querySelector('#sfCopyTeamInvite').textContent='✓ Kopiert'}catch{m.querySelector('#sfTeamInviteValue').select()}};
          m.querySelector('#sfCopyTeamInvite').focus();await refreshAfterWrite(host,companyId,'Einladung für '+mail+' erstellt.');
        }catch(error){message(m,error.message||'Die Einladung konnte nicht erstellt werden.');pending(m,false)}
      };
    });
  }
  function modal(html,ready){css();document.getElementById('sfUserModal')?.__sfClose?.();const opener=document.activeElement,m=document.createElement('div');m.id='sfUserModal';m.className='sf-user-modal';m.innerHTML=`<div class="sf-user-card" role="dialog" aria-modal="true" aria-labelledby="sfUserDialogTitle">${html}</div>`;document.body.appendChild(m);
    m.__sfClose=()=>{m.remove();if(opener?.isConnected)opener.focus();else document.querySelector('#sfUserSearch')?.focus()};
    m.onkeydown=event=>{if(event.key==='Escape'&&m.dataset.busy!=='true'){event.preventDefault();m.__sfClose()}if(event.key==='Tab'){const focusable=[...m.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')].filter(e=>e.getClientRects().length);if(!focusable.length){event.preventDefault();return}const first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&(document.activeElement===first||!m.contains(document.activeElement))){event.preventDefault();last.focus()}else if(!event.shiftKey&&(document.activeElement===last||!m.contains(document.activeElement))){event.preventDefault();first.focus()}}};
    bindClose(m);ready?.(m);(m.querySelector('input:not([readonly]),select,button')||m.querySelector('.sf-user-card')).focus();
  }
  const bindClose=m=>m.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>m.__sfClose());
  function registerMulti(raw){
    if((B.ready||B.user)&&B.__sfMultiRoleInvitesReady===true&&typeof B.offerMultiCompanyInvitation==='function'){B.offerMultiCompanyInvitation();return}
    if(B.ready||B.user){
      modal('<div class="eyebrow">SCHICHTFUNK TEAMZUGANG</div><h2 id="sfUserDialogTitle">Einladung annehmen</h2><p>Du bist bereits mit einem anderen Zugang angemeldet.</p><p>Öffne den persönlichen Einladungslink in einem privaten Browserfenster, um den neuen Zugang mit der eingeladenen E-Mail-Adresse einzurichten.</p><div class="sf-user-modal-actions"><button type="button" class="ghost" data-close>Schließen</button></div>',m=>{m.dataset.sfInvitation='true'});
      return;
    }
    modal(`<div class="eyebrow">SCHICHTFUNK TEAMZUGANG</div><h2 id="sfUserDialogTitle">Einladung annehmen</h2><p>Nutze genau die E-Mail-Adresse deiner Einladung.</p><label>E-Mail-Adresse<input id="sfTeamRegEmail" type="email"></label><label>Passwort<input id="sfTeamRegPassword" type="password" minlength="8"></label><div id="sfUserMsg" class="sf-user-msg"></div><div class="sf-user-modal-actions"><button class="ghost" data-close>Abbrechen</button><button class="ghost" id="sfTeamRegLogin">Ich habe bereits ein Konto</button><button class="primary" id="sfTeamRegSubmit">Zugang erstellen</button></div>`,m=>{m.dataset.sfInvitation='true';m.querySelector('#sfTeamRegLogin').onclick=()=>{m.__sfClose();B.authDialog?.('login')};m.querySelector('#sfTeamRegSubmit').onclick=async()=>{const email=m.querySelector('#sfTeamRegEmail').value.trim(),password=m.querySelector('#sfTeamRegPassword').value,msg=m.querySelector('#sfUserMsg');if(!email||password.length<8){msg.className='sf-user-msg show bad';msg.textContent='Bitte E-Mail und mindestens acht Passwortzeichen eingeben.';return}try{const {data,error}=await B.client.auth.signUp({email,password,options:{data:{sf_company_invite:raw},emailRedirectTo:base()+'#app'}});if(error)throw error;const u=new URL(location.href);u.searchParams.delete(PARAM);history.replaceState(null,'',u.pathname+(u.search||'')+(u.hash||''));if(data.session){m.remove();await B.boot(data.session)}else{msg.className='sf-user-msg show good';msg.textContent='Zugang erstellt. Bitte bestätige jetzt deine E-Mail.'}}catch(e){msg.className='sf-user-msg show bad';msg.textContent=B.friendlyAuthError?.(e,'Der Teamzugang konnte nicht erstellt werden. Bitte prüfe die Einladung und versuche es erneut.')||'Der Teamzugang konnte nicht erstellt werden.'}}})}
  function register(raw){
    if(B.__sfMultiRoleInvitesReady===true){registerMulti(raw);return}
    if(B.ready||B.user){
      modal('<div class="eyebrow">SCHICHTFUNK TEAMZUGANG</div><h2 id="sfUserDialogTitle">Einladung annehmen</h2><p>Du bist bereits mit einem anderen Zugang angemeldet.</p><p>Öffne den persönlichen Einladungslink in einem privaten Browserfenster, um den neuen Zugang mit der eingeladenen E-Mail-Adresse einzurichten.</p><div class="sf-user-modal-actions"><button type="button" class="ghost" data-close>Schließen</button></div>',m=>{m.dataset.sfInvitation='true'});
      return;
    }
    modal(`<div class="eyebrow">SCHICHTFUNK TEAMZUGANG</div><h2 id="sfUserDialogTitle">Einladung annehmen</h2><p>Nutze genau die E-Mail-Adresse deiner Einladung.</p><label>E-Mail-Adresse<input id="sfTeamRegEmail" type="email"></label><label>Passwort<input id="sfTeamRegPassword" type="password" minlength="8"></label><div id="sfUserMsg" class="sf-user-msg"></div><div class="sf-user-modal-actions"><button class="ghost" data-close>Abbrechen</button><button class="primary" id="sfTeamRegSubmit">Zugang erstellen</button></div>`,m=>{m.dataset.sfInvitation='true';m.querySelector('#sfTeamRegSubmit').onclick=async()=>{const email=m.querySelector('#sfTeamRegEmail').value.trim(),password=m.querySelector('#sfTeamRegPassword').value,msg=m.querySelector('#sfUserMsg');if(!email||password.length<8){msg.className='sf-user-msg show bad';msg.textContent='Bitte E-Mail und mindestens acht Passwortzeichen eingeben.';return}try{const {data,error}=await B.client.auth.signUp({email,password,options:{data:{sf_company_invite:raw},emailRedirectTo:base()+'#app'}});if(error)throw error;const u=new URL(location.href);u.searchParams.delete(PARAM);history.replaceState(null,'',u.pathname+(u.search||'')+(u.hash||''));if(data.session){m.remove();await B.boot(data.session)}else{msg.className='sf-user-msg show good';msg.textContent='Zugang erstellt. Bitte bestätige jetzt deine E-Mail.'}}catch(e){msg.className='sf-user-msg show bad';msg.textContent=B.friendlyAuthError?.(e,'Der Teamzugang konnte nicht erstellt werden. Bitte prüfe die Einladung und versuche es erneut.')||'Der Teamzugang konnte nicht erstellt werden.'}}})}
  let initHooked=false,invitationOpened=false;
  B.showTeamInvitation=raw=>{if(!raw||invitationOpened)return;invitationOpened=true;register(raw)};
  function hookInit(){if(initHooked)return;if(typeof B.init!=='function'){setTimeout(hookInit,120);return}initHooked=true;const init=B.init;B.init=async function(){const raw=new URL(location.href).searchParams.get(PARAM),r=await init.apply(this,arguments);B.showTeamInvitation(raw);return r}}
  B.roleLabels=roles;css();hookInit();
})();

