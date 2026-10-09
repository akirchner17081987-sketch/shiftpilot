// SchichtFunk: restricted team login, with server-enforced TIME_TRACKING role.
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__timeOnlyAccess)return;B.__timeOnlyAccess=true;
  const restricted=()=>B.role==='TIME_TRACKING';
  const blockedSelector='[data-view]:not([data-view="time"]),#globalSearch,#newTemplateBtn,#sfTimeWorkspaceTabs [data-time-mode="account"]';
  const css=document.createElement('style');css.textContent=`
    body.sf-time-only .view:not(#view-time){display:none!important}
    body.sf-time-only [data-view]:not([data-view="time"]),body.sf-time-only #newTemplateBtn,body.sf-time-only #globalSearch,body.sf-time-only #sfTimeWorkspaceTabs button:disabled{opacity:.35!important;filter:grayscale(1);cursor:not-allowed!important;transform:none!important}
    body.sf-time-only .sf-notify-wrap,body.sf-time-only #sfNotifyPanel,body.sf-time-only #sfTimeAccounts,body.sf-time-only #view-time #sfQrTerminalAdmin{display:none!important}
  `;document.head.appendChild(css);
  function apply(){
    const on=restricted();document.body.classList.toggle('sf-time-only',on);
    document.querySelectorAll(blockedSelector).forEach(el=>{
      if(on){if(el.dataset.sfTimeBlocked!=='1'){el.dataset.sfTimeWasDisabled=String(!!el.disabled);el.dataset.sfTimeOldTitle=el.getAttribute('title')||'';el.dataset.sfTimeBlocked='1'}el.disabled=true;el.setAttribute('aria-disabled','true');el.title='Für diesen Zugang nicht verfügbar';}
      else if(el.dataset.sfTimeBlocked==='1'){el.disabled=el.dataset.sfTimeWasDisabled==='true';el.removeAttribute('aria-disabled');el.title=el.dataset.sfTimeOldTitle;delete el.dataset.sfTimeBlocked;}
    });
    if(!on)return;
    B.pendingView='time';
    const name=document.querySelector('.side-bottom .user-row b'),role=document.querySelector('.side-bottom .user-row small');
    const label=B.user?.email||'Zeiterfassung';if(name&&name.textContent!==label)name.textContent=label;if(role&&role.textContent!=='Mitarbeiter · Zeitverwaltung')role.textContent='Mitarbeiter · Zeitverwaltung';
    document.querySelectorAll('[data-view="time"]').forEach(el=>{el.disabled=false;el.removeAttribute('aria-disabled')});
    const view=document.getElementById('view-time');
    if(view&&!view.classList.contains('active')&&B.ready)window.switchView?.('time');
  }
  B.hydrateTimeOnly=async function(){
    const q=await B.client.rpc('time_access_context',{p_company_id:B.companyId});if(q.error)throw q.error;
    const context=typeof q.data==='string'?JSON.parse(q.data):q.data||{};
    B.companyTimeZone=context.timezone||'Europe/Berlin';
    if(typeof employees!=='undefined')employees=[];if(typeof assignments!=='undefined')assignments=[];
    if(typeof absences!=='undefined')absences=[];if(typeof timeEntries!=='undefined')timeEntries={};
    if(typeof globalSoll!=='undefined')globalSoll={};if(typeof dailySoll!=='undefined')dailySoll={};
    ['empDb','empLocal','asgDb','asgLocal','absDb'].forEach(k=>B[k]?.clear?.());
    const company=document.querySelector('.company-card b');if(company)company.textContent=context.name||'SchichtFunk';
    B.pendingView='time';sessionStorage.setItem('sf_active_view_v1','time');sessionStorage.setItem('sf.time.mode','entries');
    apply();return true;
  };
  const ensure=B.ensureCompany;
  B.ensureCompany=async function(){
    if(B.client&&B.user){const q=await B.client.from('company_members').select('company_id,role,status').eq('user_id',B.user.id);if(q.error)throw q.error;
      if(q.data?.length&&!q.data.some(x=>x.status==='ACTIVE')&&q.data.some(x=>x.role==='TIME_TRACKING'))throw new Error('Dieser Zugang ist deaktiviert. Bitte wende dich an die Verwaltung.');}
    return ensure.apply(this,arguments);
  };
  const hydrate=B.hydrate;B.hydrate=async function(){return restricted()?B.hydrateTimeOnly():hydrate.apply(this,arguments)};
  for(const key of ['sync','importLegacy']){const original=B[key];if(typeof original==='function')B[key]=function(){if(restricted())return Promise.resolve();return original.apply(this,arguments)};}
  const open=B.baseOpenApp;B.baseOpenApp=function(view){const result=open.call(this,restricted()?'time':view);apply();return result};
  const update=B.updateState;B.updateState=function(){const result=update?.apply(this,arguments);apply();if(B.ready&&restricted())B.qrIndependentReport?.refresh?.();return result};
  document.addEventListener('click',e=>{if(restricted()&&e.target.closest?.(blockedSelector)){e.preventDefault();e.stopImmediatePropagation();B.pendingView='time';}},true);
  document.addEventListener('keydown',e=>{if(restricted()&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();e.stopImmediatePropagation();}},true);
  let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;apply()})}).observe(document.body,{childList:true,subtree:true});
  apply();
})();
