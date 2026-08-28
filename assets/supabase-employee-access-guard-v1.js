// SchichtFunk – Mitarbeiterzugang Guard V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  const base=B.ensureCompany;
  if(typeof base!=='function')return;
  B.ensureCompany=async function(){
    if(!B.client||!B.user)return base.apply(this,arguments);
    const m=await B.client.from('company_members').select('company_id,role,status').eq('user_id',B.user.id).eq('status','ACTIVE').limit(1);
    if(m.error)throw m.error;
    if(m.data?.length){B.companyId=m.data[0].company_id;B.role=m.data[0].role;B.employeeDbId=null;return}
    const e=await B.client.from('employees').select('id,company_id,first_name,last_name,email,status,access_status').eq('auth_user_id',B.user.id).maybeSingle();
    if(e.error)throw e.error;
    if(e.data){
      if(e.data.status!=='active'||e.data.access_status==='DISABLED')throw new Error('Dieser Mitarbeiterzugang ist deaktiviert. Bitte wende dich an die Dienstplanung.');
      B.companyId=e.data.company_id;B.role='EMPLOYEE';B.employeeDbId=e.data.id;B.employeeRecord=e.data;return;
    }
    return base.apply(this,arguments);
  };
})();