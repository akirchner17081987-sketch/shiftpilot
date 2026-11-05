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
  async function loadOriginal(){
    const expected=identity(),employee=B.employeeDbId,company=B.companyId;
    await B.__qaOriginalEmployeeHydrate();
    if(identity()!==expected||String(B.employeePortalData?.employee?.id)!==String(employee)||String(B.employeePortalData?.company?.id)!==String(company))throw Error('Das geladene Profil stimmt nicht mit dem Unternehmen überein.');
  }
  B.hydrateEmployee=async function(){if(!B.__qaMultiEmployee)return fallbackHydrate.apply(this,arguments);return loadOriginal()};
  B.openEmployeePortal=function(){
    if(!B.__qaMultiEmployee)return fallbackOpen.apply(this,arguments);
    const result=B.__qaOriginalEmployeeOpen.apply(this,arguments),root=document.getElementById('sfEmployeePortal');
    if(!root)return result;
    const bar=document.createElement('section');bar.id='qaFullCompanySwitch';bar.style.cssText='padding:14px 6%;background:#103241;color:#fff';
    bar.innerHTML='<strong>TESTUMGEBUNG – Vollportal wird geprüft</strong><label style="display:block;margin-top:8px" for="qaFullCompany">Unternehmen wechseln</label><select id="qaFullCompany" style="padding:8px;min-width:220px"></select><p id="qaFullCompanyStatus" role="status" aria-live="polite"></p>';
    const select=bar.querySelector('select'),status=bar.querySelector('[role=status]');
    for(const item of B.__qaMultiOptions){const option=document.createElement('option');option.value=item.company_id;option.textContent=item.company_name;select.append(option)}
    select.value=B.companyId;root.prepend(bar);
    select.onchange=async()=>{
      const desired=select.value,old={user:B.user?.id,company:B.companyId,employee:B.employeeDbId,record:B.employeeRecord,profile:B.__qaMultiProfile,options:B.__qaMultiOptions,data:B.employeePortalData,zone:B.companyTimeZone};
      root.inert=true;root.setAttribute('aria-busy','true');status.textContent='Unternehmen wird gewechselt …';let serverAttempted=false;
      try{
        const options=await B.client.rpc('qa_employee_company_options');if(options.error)throw options.error;
        const choice=(options.data||[]).find(x=>String(x.company_id)===desired);if(!choice)throw Error('Dieses Unternehmen ist nicht mehr freigegeben.');
        const profile=await B.client.rpc('qa_employee_profile_scoped',{p_company:desired});if(profile.error)throw profile.error;
        if(B.user?.id!==old.user||String(profile.data?.employee?.id)!==String(choice.employee_id)||String(profile.data?.company?.id)!==desired)throw Error('Das Mitarbeiterprofil konnte nicht geprüft werden.');
        serverAttempted=true;const selected=await B.client.rpc('qa_set_employee_session_company',{p_company:desired});if(selected.error)throw selected.error;
        if(B.user?.id!==old.user)throw Error('Die Anmeldung hat sich geändert.');
        B.companyId=desired;B.employeeDbId=choice.employee_id;B.employeeRecord=profile.data.employee;B.__qaMultiProfile=profile.data;B.__qaMultiOptions=options.data;B.accessProfileCompany=desired;
        await loadOriginal();
        try{sessionStorage.setItem(choiceKey(),desired)}catch{}
        B.openEmployeePortal();
      }catch(error){
        if(B.user?.id!==old.user){B.employeePortalData=null;root.remove();return}
        B.companyId=old.company;B.employeeDbId=old.employee;B.employeeRecord=old.record;B.__qaMultiProfile=old.profile;B.__qaMultiOptions=old.options;B.employeePortalData=old.data;B.companyTimeZone=old.zone;B.accessProfileCompany=old.company;
        select.value=old.company;
        if(serverAttempted){try{const rollback=await B.client.rpc('qa_set_employee_session_company',{p_company:old.company});if(rollback.error)throw rollback.error}catch{status.textContent='Wechsel konnte nicht sicher zurückgesetzt werden. Bitte neu anmelden.';return}}
        status.textContent=error.message||'Unternehmen konnte nicht gewechselt werden.';
      }finally{if(status.textContent!=='Wechsel konnte nicht sicher zurückgesetzt werden. Bitte neu anmelden.'){root.inert=false;root.removeAttribute('aria-busy')}}
    };
    return result;
  };
})();
