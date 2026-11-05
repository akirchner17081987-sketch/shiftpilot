// QA ONLY: opt-in integration harness for the existing employee portal.
// Do not use as a production switch: other portal actions still require review.
(function(){
  'use strict';
  if(new URLSearchParams(location.search).get('qa_vollportal')!=='1')return;
  const B=window.SFBackend;
  if(!B||typeof B.__qaOriginalEmployeeHydrate!=='function'||typeof B.__qaOriginalEmployeeOpen!=='function')return;
  const fallbackHydrate=B.hydrateEmployee,fallbackOpen=B.openEmployeePortal;
  const choiceKey=()=>`sfQaEmployeeCompany:${B.user?.id||''}`;
  const identity=()=>[B.user?.id,B.companyId,B.employeeDbId].join('|');
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
  async function loadOriginal(){
    const expected=identity(),userId=B.user?.id,client=B.client,choice={company_id:B.companyId,employee_id:B.employeeDbId};
    const data=await fetchOriginal(choice,userId,client);
    if(identity()!==expected||B.client!==client)throw Error('Das Unternehmen wurde während des Ladens geändert.');
    B.employeePortalData=data;B.companyTimeZone=data.company.timezone||'Europe/Berlin';
  }
  B.hydrateEmployee=async function(){if(!B.__qaMultiEmployee)return fallbackHydrate.apply(this,arguments);return loadOriginal()};
  B.openEmployeePortal=function(){
    if(!B.__qaMultiEmployee)return fallbackOpen.apply(this,arguments);
    const result=B.__qaOriginalEmployeeOpen.apply(this,arguments),root=document.getElementById('sfEmployeePortal');
    if(!root)return result;
    root.querySelectorAll('#qaFullCompanySwitch').forEach(node=>node.remove());
    const bar=document.createElement('section');bar.id='qaFullCompanySwitch';bar.style.cssText='padding:14px 6%;background:#103241;color:#fff';
    bar.innerHTML='<strong>TESTUMGEBUNG – Vollportal wird geprüft</strong><label style="display:block;margin-top:8px" for="qaFullCompany">Unternehmen wechseln</label><select id="qaFullCompany" style="padding:8px;min-width:220px"></select><p id="qaFullCompanyStatus" role="status" aria-live="polite"></p>';
    const select=bar.querySelector('select'),status=bar.querySelector('[role=status]');
    for(const item of B.__qaMultiOptions){const option=document.createElement('option');option.value=item.company_id;option.textContent=item.company_name;select.append(option)}
    select.value=B.companyId;root.prepend(bar);
    select.onchange=async()=>{
      const desired=select.value,old={user:B.user?.id,company:B.companyId,employee:B.employeeDbId,record:B.employeeRecord,profile:B.__qaMultiProfile,options:B.__qaMultiOptions,data:B.employeePortalData,zone:B.companyTimeZone};
      root.inert=true;root.setAttribute('aria-busy','true');status.textContent='Unternehmen wird gewechselt …';let serverAttempted=false,committed=false;
      try{
        const options=await B.client.rpc('qa_employee_company_options');if(options.error)throw options.error;
        const choice=(options.data||[]).find(x=>String(x.company_id)===desired);if(!choice)throw Error('Dieses Unternehmen ist nicht mehr freigegeben.');
        const profile=await B.client.rpc('qa_employee_profile_scoped',{p_company:desired});if(profile.error)throw profile.error;
        if(B.user?.id!==old.user||String(profile.data?.employee?.id)!==String(choice.employee_id)||String(profile.data?.company?.id)!==desired)throw Error('Das Mitarbeiterprofil konnte nicht geprüft werden.');
        const staged=await fetchOriginal(choice,old.user,B.client);
        if(identity()!==[old.user,old.company,old.employee].join('|'))throw Error('Der Zugang hat sich während des Ladens geändert.');
        serverAttempted=true;const selected=await B.client.rpc('qa_set_employee_session_company',{p_company:desired});if(selected.error)throw selected.error;
        if(identity()!==[old.user,old.company,old.employee].join('|'))throw Error('Der Zugang hat sich während des Wechsels geändert.');
        B.companyId=desired;B.employeeDbId=choice.employee_id;B.employeeRecord=profile.data.employee;B.__qaMultiProfile=profile.data;B.__qaMultiOptions=options.data;B.accessProfileCompany=desired;B.employeePortalData=staged;B.companyTimeZone=staged.company.timezone||'Europe/Berlin';committed=true;
        try{sessionStorage.setItem(choiceKey(),desired)}catch{}
        B.openEmployeePortal();
      }catch(error){
        if(B.user?.id!==old.user){B.employeePortalData=null;root.remove();return}
        if(!committed&&identity()!==[old.user,old.company,old.employee].join('|')){
          if(serverAttempted){try{const rollback=await B.client.rpc('qa_set_employee_session_company',{p_company:B.companyId});if(rollback.error)throw rollback.error}catch{B.employeePortalData=null}}
          root.remove();return;
        }
        B.companyId=old.company;B.employeeDbId=old.employee;B.employeeRecord=old.record;B.__qaMultiProfile=old.profile;B.__qaMultiOptions=old.options;B.employeePortalData=old.data;B.companyTimeZone=old.zone;B.accessProfileCompany=old.company;
        select.value=old.company;
        if(serverAttempted){try{const rollback=await B.client.rpc('qa_set_employee_session_company',{p_company:old.company});if(rollback.error)throw rollback.error}catch{status.textContent='Wechsel konnte nicht sicher zurückgesetzt werden. Bitte neu anmelden.';return}}
        status.textContent=error.message||'Unternehmen konnte nicht gewechselt werden.';
      }finally{if(status.textContent!=='Wechsel konnte nicht sicher zurückgesetzt werden. Bitte neu anmelden.'){root.inert=false;root.removeAttribute('aria-busy')}}
    };
    return result;
  };
})();
