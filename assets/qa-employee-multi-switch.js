// QA-only prototype: multi-profile login and read-only company switching.
(function(){
  'use strict';
  const B=window.SFBackend;
  if(!B || typeof B.ensureCompany!=='function' || typeof B.hydrateEmployee!=='function' || typeof B.openEmployeePortal!=='function')return;
  const ensure=B.ensureCompany,hydrate=B.hydrateEmployee,open=B.openEmployeePortal;
  const key=()=>`sfQaEmployeeCompany:${B.user?.id||''}`;
  const readChoice=()=>{try{return sessionStorage.getItem(key())||''}catch{return ''}};
  const saveChoice=id=>{try{sessionStorage.setItem(key(),id)}catch{}};
  const fail=message=>Object.assign(new Error(message),{code:'employee_portal_disabled'});
  async function options(){const q=await B.client.rpc('qa_employee_company_options');if(q.error)throw q.error;return Array.isArray(q.data)?q.data:[]}
  async function profile(choice){
    const q=await B.client.rpc('qa_employee_profile_scoped',{p_company:choice.company_id});
    if(q.error)throw q.error;
    const d=q.data;
    if(!d||String(d.employee?.id)!==String(choice.employee_id)||String(d.company?.id)!==String(choice.company_id))throw fail('Das Mitarbeiterprofil stimmt nicht mit dem ausgewählten Unternehmen überein.');
    return d;
  }
  B.ensureCompany=async function(){
    B.__qaMultiEmployee=false;B.__qaMultiOptions=[];B.__qaMultiProfile=null;
    if(!B.client||!B.user)return ensure.apply(this,arguments);
    const userId=B.user.id;
    const employeeEntry=new URLSearchParams(window.location.search).get('bereich')==='mitarbeiter';
    const memberships=await B.client.from('company_members').select('company_id,role,status,created_at,extra_permissions').eq('user_id',B.user.id);
    if(memberships.error)throw memberships.error;
    if(!employeeEntry&&(memberships.data||[]).some(x=>x.status==='ACTIVE'))return ensure.apply(this,arguments);
    const own=await B.client.from('employees').select('id,company_id').eq('auth_user_id',B.user.id);
    if(own.error)throw own.error;
    if((own.data||[]).length<2)return ensure.apply(this,arguments);
    const available=await options();
    if(!available.length)throw fail('Für dieses Konto ist kein aktives Mitarbeiterprofil freigegeben.');
    const choice=available.find(x=>String(x.company_id)===readChoice())||available[0];
    const data=await profile(choice);
    if(B.user?.id!==userId)throw fail('Die Anmeldung hat sich geändert. Bitte erneut anmelden.');
    B.__qaMultiEmployee=true;B.__qaMultiOptions=available;B.__qaMultiProfile=data;
    B.companyId=choice.company_id;B.employeeDbId=choice.employee_id;B.employeeRecord=data.employee;B.role='EMPLOYEE';
    B.accessRole='EMPLOYEE';B.accessPermissions=[];B.accessProfileCompany=choice.company_id;B.personnelConversationEmployeeIds=[];B.personnelConversationExcludedEmployeeIds=[];B.personnelConversationScope=null;
    saveChoice(choice.company_id);
  };
  B.hydrateEmployee=async function(){
    if(!B.__qaMultiEmployee)return hydrate.apply(this,arguments);
    B.employeePortalData={employee:B.__qaMultiProfile.employee,company:B.__qaMultiProfile.company};
  };
  B.openEmployeePortal=function(){
    if(!B.__qaMultiEmployee)return open.apply(this,arguments);
    document.getElementById('sfQaEmployeePortal')?.remove();
    const root=document.createElement('div');root.id='sfQaEmployeePortal';
    root.innerHTML='<header><strong>SchichtFunk</strong><button type="button" id="qaLogout">Abmelden</button></header><main><p class="qa-label">GETRENNTE TESTUMGEBUNG · LESEANSICHT</p><h1>Mitarbeiterportal</h1><p>Unternehmenswechsel und Profilzuordnung prüfen</p><label for="qaCompany">Unternehmen wechseln</label><select id="qaCompany"></select><p id="qaSwitchStatus" role="status" aria-live="polite"></p><section><h2>Mein Mitarbeiterprofil</h2><dl><dt>Unternehmen</dt><dd id="qaCompanyName"></dd><dt>Name</dt><dd id="qaPerson"></dd><dt>Personalnummer</dt><dd id="qaPersonnel"></dd></dl></section><p>Weitere Portalfunktionen werden für mehrere Profile noch geprüft.</p></main>';
    const style=document.createElement('style');style.textContent='#sfQaEmployeePortal{position:fixed;inset:0;z-index:22000;overflow:auto;background:#071321;color:#edf8ff;font:16px system-ui,sans-serif}#sfQaEmployeePortal header{display:flex;justify-content:space-between;align-items:center;padding:18px 6%;background:#0c2031;border-bottom:1px solid #24475a}#sfQaEmployeePortal main{max-width:760px;margin:38px auto;padding:0 22px}#sfQaEmployeePortal h1{font-size:30px}#sfQaEmployeePortal .qa-label{color:#6ce0c9;font-weight:700;letter-spacing:.08em;font-size:12px}#sfQaEmployeePortal select,#sfQaEmployeePortal button{font:inherit;border:1px solid #47798a;border-radius:9px;padding:10px;color:#fff;background:#102f40}#sfQaEmployeePortal select{display:block;width:100%;margin-top:8px}#sfQaEmployeePortal section{margin-top:22px;padding:20px;border:1px solid #274a5c;border-radius:15px;background:#0d2131}#sfQaEmployeePortal dl{display:grid;grid-template-columns:160px 1fr;gap:14px;margin-bottom:0}#sfQaEmployeePortal dt{color:#a2bbca}#sfQaEmployeePortal dd{margin:0;overflow-wrap:anywhere}@media(max-width:480px){#sfQaEmployeePortal dl{grid-template-columns:1fr;gap:5px}#sfQaEmployeePortal dd{margin-bottom:10px}}';root.appendChild(style);
    document.body.appendChild(root);
    const select=root.querySelector('#qaCompany'),status=root.querySelector('#qaSwitchStatus');
    function render(){
      select.replaceChildren(...B.__qaMultiOptions.map(c=>{const o=document.createElement('option');o.value=c.company_id;o.textContent=c.company_name;return o}));
      select.value=B.companyId;
      const d=B.__qaMultiProfile;root.querySelector('#qaCompanyName').textContent=d.company.name||'–';root.querySelector('#qaPerson').textContent=[d.employee.first_name,d.employee.last_name].filter(Boolean).join(' ')||'–';root.querySelector('#qaPersonnel').textContent=d.employee.personnel_no||'–';
    }
    render();
    select.onchange=async()=>{
      const requested=select.value,previous=B.companyId,userId=B.user?.id;select.disabled=true;status.textContent='Unternehmen wird gewechselt …';
      try{
        const available=await options(),choice=available.find(x=>String(x.company_id)===requested);
        if(!choice)throw fail('Dieses Unternehmen ist nicht mehr freigegeben.');
        const data=await profile(choice);
        if(B.user?.id!==userId)throw fail('Die Anmeldung hat sich geändert. Bitte erneut anmelden.');
        B.__qaMultiOptions=available;B.__qaMultiProfile=data;B.companyId=choice.company_id;B.employeeDbId=choice.employee_id;B.employeeRecord=data.employee;B.accessProfileCompany=choice.company_id;B.employeePortalData={employee:data.employee,company:data.company};saveChoice(choice.company_id);render();status.textContent='Unternehmen gewechselt.';
      }catch(e){select.value=previous;status.textContent=e.message||'Unternehmen konnte nicht gewechselt werden.'}
      finally{select.disabled=false}
    };
    root.querySelector('#qaLogout').onclick=async event=>{const btn=event.currentTarget,storageKey=key();btn.disabled=true;try{const q=await B.client.auth.signOut();if(q.error)throw q.error;try{sessionStorage.removeItem(storageKey)}catch{}root.remove();location.reload()}catch(e){status.textContent=e.message||'Abmelden fehlgeschlagen.';btn.disabled=false}};
  };
})();

