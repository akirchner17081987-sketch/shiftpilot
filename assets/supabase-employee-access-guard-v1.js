// SchichtFunk – Mitarbeiterzugang Guard V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  const base=B.ensureCompany;
  if(typeof base!=='function')return;
  B.ensureCompany=async function(){
    if(!B.client||!B.user)return base.apply(this,arguments);
    // The URL selects the workspace, never the stored membership or its rights.
    const employeeEntry=!!window.location?.search&&new URLSearchParams(window.location.search).get('bereich')==='mitarbeiter';
    const m=await B.client.from('company_members').select('company_id,role,status,created_at,extra_permissions').eq('user_id',B.user.id);
    if(m.error)throw m.error;
    const active=(m.data||[]).filter(member=>member.status==='ACTIVE');
    B.employeeDbId=null;B.employeeRecord=null;B.employeePortalData=null;
    if(!employeeEntry&&active.length){const member=B.pickCompanyMembership?.(active)||active[0];B.companyId=member.company_id;B.role=member.role;return}
    const e=await B.client.from('employees').select('id,company_id,first_name,last_name,email,status,access_status,deleted_at').eq('auth_user_id',B.user.id).maybeSingle();
    if(e.error)throw e.error;
    if(e.data){
      const member=(m.data||[]).find(row=>row.company_id===e.data.company_id);
      if(e.data.status!=='active'||e.data.access_status!=='ACTIVE'||e.data.deleted_at||member&&(member.status!=='ACTIVE'||['VIEWER','TIME_TRACKING'].includes(member.role)||member.extra_permissions?.includes('read_only')))throw Object.assign(new Error('Dieser Mitarbeiterzugang ist deaktiviert oder für persönliche Mitarbeiterfunktionen nicht freigegeben. Bitte wende dich an die Verwaltung.'),{code:'employee_portal_disabled'});
      B.companyId=e.data.company_id;B.role='EMPLOYEE';B.employeeDbId=e.data.id;B.employeeRecord=e.data;return;
    }
    if(employeeEntry)throw Object.assign(new Error('Für dieses Konto ist kein persönliches Mitarbeiterprofil verknüpft. Bitte nutze den Zugang „Verwaltung“ oder lass dein Mitarbeiterprofil mit diesem Konto verknüpfen.'),{code:'employee_profile_missing'});
    return base.apply(this,arguments);
  };
})();
