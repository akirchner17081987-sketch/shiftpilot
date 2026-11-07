// Unternehmenswechsel im Mitarbeiterportal. Bis zur vollständigen Freigabe durch Funktionsschalter deaktiviert.
(function(){
  'use strict';
  const B=window.SFBackend;
  if(!B||typeof B.ensureCompany!=='function'||typeof B.hydrateEmployee!=='function'||typeof B.openEmployeePortal!=='function')return;
  const ensure=B.ensureCompany,hydrate=B.hydrateEmployee,open=B.openEmployeePortal;
  function offerInvitation(){
    if(B.__sfMultiRoleInvitesReady!==true||!B.user||!B.ready||document.getElementById('sfMultiInviteAccept'))return;
    const url=new URL(location.href),raw=url.searchParams.get('employeeInvite')||url.searchParams.get('teamInvite');if(!raw)return;
    const card=document.createElement('div');card.id='sfMultiInviteAccept';card.className='sf-user-modal';
    card.style.cssText='position:fixed;inset:0;z-index:30000;display:grid;place-items:center;background:rgba(0,0,0,.72);padding:20px';
    card.innerHTML='<div class="sf-user-card" style="max-width:520px;width:100%;padding:24px;border-radius:16px;background:#102235;color:#fff"  role="dialog" aria-modal="true" aria-labelledby="sfMultiInviteTitle"><h2 id="sfMultiInviteTitle">Einladung annehmen</h2><p>Die Einladung wird mit deinem angemeldeten und bestätigten Konto verbunden.</p><p id="sfMultiInviteMessage" role="status" aria-live="polite"></p><div class="sf-user-modal-actions"><button type="button" data-close>Später</button><button type="button" data-accept>Einladung annehmen</button></div></div>';
    document.body.append(card);card.querySelector('[data-close]').onclick=()=>card.remove();
    card.querySelector('[data-accept]').onclick=async()=>{
      const accept=card.querySelector('[data-accept]'),message=card.querySelector('#sfMultiInviteMessage');accept.disabled=true;message.textContent='Einladung wird geprüft …';
      try{
        const result=await B.client.rpc('claim_multi_company_invite',{p_token:raw});if(result.error)throw result.error;
        const next=new URL(location.href);next.searchParams.delete('employeeInvite');next.searchParams.delete('teamInvite');next.hash='app';
        B.ready=false;B.clearCompanyPrivateConfiguration?.();location.assign(next.href);
      }catch(error){message.textContent=error.message||'Die Einladung konnte nicht angenommen werden.';accept.disabled=false}
    };
    card.querySelector('[data-accept]').focus();
  }
  B.offerMultiCompanyInvitation=offerInvitation;
  if(typeof B.boot==='function'){
    const boot=B.boot;B.boot=async function(){const result=await boot.apply(this,arguments);offerInvitation();return result};
  }
  const enabled=()=>B.__sfEmployeeMultiCompanyReady===true;
  const choiceKey=()=>`sfEmployeeCompany:${B.user?.id||''}`;
  const identity=()=>[B.user?.id,B.companyId,B.employeeDbId].join('|');
  const readChoice=()=>{try{return sessionStorage.getItem(choiceKey())||''}catch{return ''}};
  const saveChoice=id=>{try{sessionStorage.setItem(choiceKey(),id)}catch{}};
  const fail=message=>Object.assign(new Error(message),{code:'employee_portal_disabled'});
  async function options(client){const r=await client.rpc('employee_company_options');if(r.error)throw r.error;return Array.isArray(r.data)?r.data:[]}
  async function profile(client,choice){
    const r=await client.rpc('employee_company_profile',{p_company:choice.company_id});if(r.error)throw r.error;
    const d=typeof r.data==='string'?JSON.parse(r.data):r.data;
    if(!d||String(d.employee?.id)!==String(choice.employee_id)||String(d.company?.id)!==String(choice.company_id))throw fail('Das Mitarbeiterprofil stimmt nicht mit dem Unternehmen überein.');
    return d;
  }
  async function fetchOriginal(choice,userId,client){
    const company=choice.company_id,employee=choice.employee_id;
    const [emp,co,shifts,abs,req,tpl,policy]=await Promise.all([
      client.from('employees').select('*').eq('id',employee).eq('company_id',company).eq('auth_user_id',userId).eq('status','active').eq('access_status','ACTIVE').is('deleted_at',null).single(),
      client.from('companies').select('id,name,timezone').eq('id',company).single(),
      client.from('shift_assignments').select('*').eq('company_id',company).eq('employee_id',employee).eq('status','PUBLISHED').not('published_at','is',null).order('starts_at'),
      client.from('absences').select('*').eq('company_id',company).eq('employee_id',employee).order('start_date',{ascending:false}),
      client.from('shift_change_requests').select('*').eq('company_id',company).eq('employee_id',employee).order('requested_at',{ascending:false}),
      client.from('shift_templates').select('code,display_code,name,default_start,default_end').eq('company_id',company).eq('active',true),
      client.from('company_compliance_policy').select('employee_confirmation_under_hours').eq('company_id',company).maybeSingle()
    ]);
    for(const q of [emp,co,shifts,abs,req,tpl])if(q.error)throw q.error;
    if(String(emp.data?.id)!==String(employee)||String(emp.data?.company_id)!==String(company)||String(co.data?.id)!==String(company))throw Error('Das geladene Profil stimmt nicht mit dem Unternehmen überein.');
    const requestIds=(req.data||[]).map(x=>x.id).filter(Boolean),assignmentIds=(shifts.data||[]).map(x=>x.id).filter(Boolean);
    const [apv,te]=await Promise.all([
      requestIds.length?client.from('shift_change_approvals').select('*').in('change_request_id',requestIds):Promise.resolve({data:[],error:null}),
      assignmentIds.length?client.from('time_entries').select('*').in('assignment_id',assignmentIds):Promise.resolve({data:[],error:null})
    ]);
    for(const q of [apv,te])if(q.error)throw q.error;
    if(B.user?.id!==userId||B.client!==client)throw Error('Die Anmeldung hat sich geändert.');
    return {employee:emp.data,company:co.data,shifts:shifts.data||[],absences:abs.data||[],requests:req.data||[],approvals:apv.data||[],timeEntries:te.data||[],templates:tpl.data||[],policy:policy.error?{employee_confirmation_under_hours:24}:policy.data||{employee_confirmation_under_hours:24}};
  }
  B.ensureCompany=async function(){
    B.__sfMultiEmployee=false;B.__sfEmployeeOptions=[];B.__sfEmployeeProfile=null;
    if(!enabled()||!B.client||!B.user)return ensure.apply(this,arguments);
    const client=B.client,userId=B.user.id,employeeEntry=new URLSearchParams(location.search).get('bereich')==='mitarbeiter';
    const memberships=await client.from('company_members').select('company_id,role,status,created_at,extra_permissions').eq('user_id',userId);
    if(memberships.error)throw memberships.error;
    if(!employeeEntry&&(memberships.data||[]).some(x=>x.status==='ACTIVE'))return ensure.apply(this,arguments);
    const own=await client.from('employees').select('id,company_id').eq('auth_user_id',userId);
    if(own.error)throw own.error;
    if(!employeeEntry&&(own.data||[]).length<2)return ensure.apply(this,arguments);
    const choices=await options(client);if(!choices.length)throw fail('Für dieses Konto ist kein aktives Mitarbeiterprofil freigegeben.');
    const choice=choices.find(x=>String(x.company_id)===readChoice())||choices[0],data=await profile(client,choice);
    if(B.user?.id!==userId||B.client!==client)throw fail('Die Anmeldung hat sich geändert. Bitte erneut anmelden.');
    B.__sfMultiEmployee=true;B.__sfEmployeeOptions=choices;B.__sfEmployeeProfile=data;
    B.companyId=choice.company_id;B.employeeDbId=choice.employee_id;B.employeeRecord=data.employee;B.role='EMPLOYEE';
    B.accessRole='EMPLOYEE';B.accessPermissions=[];B.accessProfileCompany=choice.company_id;B.personnelConversationEmployeeIds=[];B.personnelConversationExcludedEmployeeIds=[];B.personnelConversationScope=null;saveChoice(choice.company_id);
  };
  B.hydrateEmployee=async function(){
    if(!enabled()||!B.__sfMultiEmployee)return hydrate.apply(this,arguments);
    const expected=identity(),userId=B.user?.id,client=B.client,choice={company_id:B.companyId,employee_id:B.employeeDbId};
    const data=await fetchOriginal(choice,userId,client);
    if(identity()!==expected||B.client!==client)throw fail('Das Unternehmen wurde während des Ladens geändert.');
    B.employeePortalData=data;B.companyTimeZone=data.company.timezone||'Europe/Berlin';
  };
  B.openEmployeePortal=function(){
    if(!enabled()||!B.__sfMultiEmployee)return open.apply(this,arguments);
    const result=open.apply(this,arguments),root=document.getElementById('sfEmployeePortal');if(!root)return result;
    root.querySelectorAll('#sfEmployeeCompanySwitch').forEach(node=>node.remove());
    const bar=document.createElement('section');bar.id='sfEmployeeCompanySwitch';bar.style.cssText='padding:14px 6%;background:#103241;color:#fff';
    bar.innerHTML='<label style="display:block;margin-bottom:8px" for="sfEmployeeCompanySelect">Unternehmen wechseln</label><select id="sfEmployeeCompanySelect" style="padding:8px;min-width:220px"></select><p role="status" aria-live="polite"></p>';
    const select=bar.querySelector('select'),status=bar.querySelector('[role=status]');
    for(const item of B.__sfEmployeeOptions){const option=document.createElement('option');option.value=item.company_id;option.textContent=item.company_name;select.append(option)}
    select.value=B.companyId;(root.querySelector('.sf-portal-main')||root).prepend(bar);
    if(B.__sfMultiRoleInvitesReady===true){
      const owner=identity(),client=B.client;
      client.rpc('multi_role_company_options').then(q=>{
        if(q.error)throw q.error;if(identity()!==owner||B.client!==client||!root.isConnected)return;
        for(const item of Array.isArray(q.data)?q.data:[])if(item.mode==='manager'){
          const option=document.createElement('option');option.value='manager:'+item.company_id;
          option.textContent=item.company_name+' · '+({OWNER:'Inhaber',ADMIN:'Administrator',PLANNER:'Teamleiter',DISPATCHER:'Teamleiter',VIEWER:'Nur lesen',TIME_TRACKING:'Zeitverwaltung'}[item.role]||item.role);select.append(option);
        }
      }).catch(()=>{if(root.isConnected)status.textContent='Weitere Unternehmensrollen konnten nicht geladen werden.'});
    }
    select.onchange=async()=>{
      const desired=select.value,client=B.client,old={user:B.user?.id,company:B.companyId,employee:B.employeeDbId,record:B.employeeRecord,profile:B.__sfEmployeeProfile,options:B.__sfEmployeeOptions,data:B.employeePortalData,zone:B.companyTimeZone};
      root.inert=true;root.setAttribute('aria-busy','true');status.textContent='Unternehmen wird gewechselt …';let committed=false;
      try{
        if(desired.startsWith('manager:')&&B.__sfMultiRoleInvitesReady===true){
          const company=desired.slice('manager:'.length),q=await client.rpc('multi_role_company_options');
          if(q.error)throw q.error;
          if(!(Array.isArray(q.data)?q.data:[]).some(x=>x.mode==='manager'&&String(x.company_id)===company))throw fail('Dieser Verwaltungszugang ist nicht mehr freigegeben.');
          if(identity()!==[old.user,old.company,old.employee].join('|')||B.client!==client)throw fail('Der Zugang hat sich während des Wechsels geändert.');
          sessionStorage.setItem('sf_active_company_v1:'+old.user,company);
          const next=new URL(location.href);next.searchParams.delete('bereich');next.hash='app';
          B.clearCompanyPrivateConfiguration?.();B.ready=false;B.suppressSync=true;location.assign(next.href);return;
        }
        const choices=await options(client),choice=choices.find(x=>String(x.company_id)===desired);
        if(!choice)throw fail('Dieses Unternehmen ist nicht mehr freigegeben.');
        const p=await profile(client,choice),data=await fetchOriginal(choice,old.user,client);
        if(identity()!==[old.user,old.company,old.employee].join('|')||B.client!==client)throw fail('Der Zugang hat sich während des Wechsels geändert.');
        B.companyId=desired;B.employeeDbId=choice.employee_id;B.employeeRecord=p.employee;B.__sfEmployeeProfile=p;B.__sfEmployeeOptions=choices;B.accessProfileCompany=desired;B.employeePortalData=data;B.companyTimeZone=data.company.timezone||'Europe/Berlin';committed=true;
        B.openEmployeePortal();saveChoice(desired);
      }catch(error){
        if(B.user?.id!==old.user||B.client!==client){B.employeePortalData=null;root.remove();return}
        if(!committed&&identity()!==[old.user,old.company,old.employee].join('|')){root.remove();return}
        B.companyId=old.company;B.employeeDbId=old.employee;B.employeeRecord=old.record;B.__sfEmployeeProfile=old.profile;B.__sfEmployeeOptions=old.options;B.employeePortalData=old.data;B.companyTimeZone=old.zone;B.accessProfileCompany=old.company;
        if(committed){try{B.openEmployeePortal()}catch{B.employeePortalData=null;root.remove();return}}
        else{select.value=old.company;status.textContent=error.message||'Unternehmen konnte nicht gewechselt werden.'}
      }finally{root.inert=false;root.removeAttribute('aria-busy')}
    };
    return result;
  };
})();

