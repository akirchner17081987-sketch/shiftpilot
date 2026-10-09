// Four public access profiles; every capability is checked by the database.
(function(){
  const B=window.SFBackend=window.SFBackend||{},labels={OWNER:'Inhaber',ADMIN:'Administrator',TEAM_LEAD:'Teamleiter',EMPLOYEE:'Mitarbeiter'};
  const admin=()=>['OWNER','ADMIN'].includes(B.accessRole),readOnly=()=>B.accessPermissions?.includes('read_only');
  const allowed=key=>admin()||B.accessPermissions?.includes(key);
  const previousCan=B.can;
  B.can=key=>{
    if(!B.accessRole)return false;
    if(readOnly())return false;
    if(key==='publish')return !!allowed('publish_schedule');
    if(key==='manageTime')return !!allowed('manage_time');
    if(key==='confirmTime')return !!allowed('confirm_time');
    if(key==='viewTime')return !!(allowed('manage_time')||allowed('confirm_time'));
    if(['manageUsers','compliance'].includes(key))return admin();
    if(['plan','manageEmployees'].includes(key))return admin()||B.accessRole==='TEAM_LEAD';
    return previousCan?.(key)||false;
  };
  const ensure=B.ensureCompany;
  B.ensureCompany=async function(){
    B.accessRole=null;B.accessPermissions=[];B.accessProfileCompany=null;
    const result=await ensure.apply(this,arguments),company=B.companyId;
    const q=await B.client.rpc('access_profile_context',{p_company_id:company});if(q.error)throw q.error;
    if(B.companyId!==company)throw Error('Das Unternehmen hat sich geändert.');
    B.accessRole=q.data.role;B.accessPermissions=q.data.permissions||[];B.accessProfileCompany=company;
    apply();return result;
  };
  const hydrate=B.hydrate;
  B.hydrate=async function(){
    if(!readOnly())return hydrate.apply(this,arguments);
    const q=await B.client.rpc('read_only_schedule_snapshot',{p_company_id:B.companyId});if(q.error)throw q.error;
    const d=q.data,tz=d.company.timezone||'Europe/Berlin';B.companyTimeZone=tz;B.suppressSync=true;
    try{
      const part=(v,kind)=>new Intl.DateTimeFormat(kind==='date'?'sv-SE':'de-DE',kind==='date'?{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}:{timeZone:tz,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(v));
      B.empDb?.clear();B.empLocal?.clear();B.asgDb?.clear();B.asgLocal?.clear();B.absDb?.clear();
      if(typeof employees!=='undefined')employees=(d.employees||[]).map(x=>{B.empDb?.set(x.id,x.id);B.empLocal?.set(x.id,x.id);return{id:x.id,_dbId:x.id,first:x.first_name,last:x.last_name,status:x.status,shifts:[],qualifications:[],weeklyHours:0}});
      if(typeof assignments!=='undefined')assignments=(d.assignments||[]).map(x=>{B.asgDb?.set(x.id,x.id);B.asgLocal?.set(x.id,x.id);return{id:x.id,_dbId:x.id,employeeId:x.employee_id,type:x.shift_code,date:part(x.starts_at,'date'),start:part(x.starts_at,'time'),end:part(x.ends_at,'time'),pause:x.break_minutes||0,publishedAt:x.published_at}});
      if(typeof absences!=='undefined')absences=[];if(typeof timeEntries!=='undefined')timeEntries={};
      if(typeof shiftChangeRequests!=='undefined')shiftChangeRequests=[];if(typeof globalSoll!=='undefined')globalSoll={};if(typeof dailySoll!=='undefined')dailySoll={};
      if(window.SFCompliance){window.SFCompliance.audit=[];window.SFCompliance.publications={};}
      B.employeePortalData=null;B.hasLegacy=false;
      document.querySelector('.company-card b')?.replaceChildren(document.createTextNode(d.company.name||'SchichtFunk'));
      if(typeof renderAll==='function')renderAll();
    }finally{B.suppressSync=false}
  };
  for(const key of ['sync','importLegacy']){const old=B[key];if(typeof old==='function')B[key]=function(){return readOnly()?Promise.resolve():old.apply(this,arguments)}}
  const open=B.baseOpenApp;
  B.baseOpenApp=function(view){const target=readOnly()?'schedule':(!B.can('viewTime')&&view==='time'?'schedule':view);const result=open.call(this,target);apply();return result};
  const update=B.updateState;B.updateState=function(){const r=update?.apply(this,arguments);apply();return r};
  const qrOpen=B.qrCorrection?.open;
  if(qrOpen)B.qrCorrection.open=function(){if(!B.can('manageTime')){window.showSaveToast?.('Korrektur gesperrt','Das Zusatzrecht Zeiten verwalten fehlt.');return}return qrOpen.apply(this,arguments)};
  function apply(){
    if(!B.accessRole)return;
    document.body.classList.toggle('sf-access-read-only',!!readOnly());
    const role=document.querySelector('.side-bottom .user-row small'),label=labels[B.accessRole]+(readOnly()?' · Nur lesen':B.role==='TIME_TRACKING'?' · Zeitverwaltung':'');
    if(role&&role.textContent!==label)role.textContent=label;
    document.querySelectorAll('[data-view]').forEach(el=>{
      const v=el.dataset.view,hidden=readOnly()?v!=='schedule':v==='time'&&B.accessRole!=='EMPLOYEE'&&!B.can('viewTime');
      if(hidden){el.hidden=true;el.dataset.sfAccessHidden='true';}
      else if(el.dataset.sfAccessHidden){el.hidden=false;delete el.dataset.sfAccessHidden;}
    });
    document.querySelectorAll('#view-schedule button[data-action],#newShiftBtn,#newTemplateBtn,#globalSearch').forEach(el=>{if(readOnly()){el.hidden=true;el.dataset.sfReadOnlyHidden='true'}else if(el.dataset.sfReadOnlyHidden){el.hidden=false;delete el.dataset.sfReadOnlyHidden}});
    document.querySelectorAll('[data-publish],#publishScheduleBtn,#sfPublishPeriod,.sf-draft-publish,.sf-pub-confirm').forEach(el=>{if(!B.can('publish')){el.disabled=true;el.dataset.sfPublicationDisabled='true';el.title='Zusatzrecht Dienstplan veröffentlichen erforderlich'}else if(el.dataset.sfPublicationDisabled){el.disabled=false;delete el.dataset.sfPublicationDisabled;el.removeAttribute('title')}});
    if(B.accessRole&&!B.can('manageTime'))document.querySelectorAll('#sfQrCorrectionSave').forEach(el=>el.disabled=true);
  }
  // Navigation is only a convenience; SQL independently checks all writes.
  document.addEventListener('click',event=>{const nav=event.target.closest('[data-view]');if(!B.accessRole||!nav)return;if((readOnly()&&nav.dataset.view!=='schedule')||(nav.dataset.view==='time'&&B.accessRole!=='EMPLOYEE'&&!B.can('viewTime'))){event.preventDefault();event.stopImmediatePropagation()}},true);
  let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;apply()})}).observe(document.body,{childList:true,subtree:true});
  B.accessProfileLabels=labels;
})();
