// SchichtFunk – Compliance + Supabase loader
(function(){
  const files=[
    'assets/status-toast-v2.js',
    'assets/compliance-core-v2.js',
    'assets/compliance-workflow-v2.js',
    'assets/compliance-ui-v2.js',
    'assets/noop-change-guard-v1.js',
    'assets/supabase-auth-v1.js',
    'assets/supabase-password-reset-v1.js',
    'assets/view-state-v1.js',
    'assets/supabase-auth-redirect-v1.js',
    'assets/supabase-data-v1.js',
    'assets/supabase-delta-sync-v1.js',
    'assets/supabase-employee-sync-reconcile-v1.js',
    'assets/supabase-upsert-batch-guard-v1.js',
    'assets/supabase-legacy-import-v2.js',
    'assets/supabase-legacy-review-v1.js',
    'assets/supabase-auto-plan-guard-v1.js',
    'assets/supabase-delete-bridge-v1.js',
    'assets/supabase-employee-access-v1.js',
    'assets/supabase-employee-access-guard-v1.js',
    'assets/supabase-employee-access-fix-v1.js',
    'assets/supabase-employee-invite-fix-v1.js',
    'assets/supabase-publish-v1.js',
    'assets/supabase-employee-change-response-v1.js',
    'assets/supabase-absence-workflow-v1.js',
    'assets/supabase-absence-manager-v2.js',
    'assets/supabase-absence-planning-guard-v2.js',
    'assets/supabase-compliance-bridge-v1.js',
    'assets/supabase-absence-employee-v3.js',
    'assets/supabase-schedule-reset-v1.js',
    'assets/supabase-shift-swap-v1.js',
    'assets/supabase-time-tracking-v1.js',
    'assets/supabase-time-tracking-ui-guard-v1.js',
    'assets/supabase-time-accounts-v1.js',
    'assets/supabase-time-account-holidays-v1.js',
    'assets/employee-wage-preview-v1.js',
    'assets/employee-portal-workspace-v2.js',
    'assets/employee-portal-vertical-layout-v1.js',
    'assets/supabase-time-month-close-v1.js',
    'assets/supabase-report-export-v2.js',
    'assets/supabase-report-pdf-style-v3.js',
    'assets/supabase-personnel-file-observer-guard-v1.js',
    'assets/supabase-personnel-file-v1.js',
    'assets/supabase-personnel-file-modal-lock-v1.js',
    'assets/supabase-personnel-file-enhancements-v1.js',
    'assets/supabase-personnel-reminders-ui-v1.js',
    'assets/supabase-personnel-deadline-dashboard-v1.js',
    'assets/supabase-personnel-deadline-dashboard-focus-fix-v1.js',
    'assets/supabase-personnel-deadline-dashboard-polish-v2.js',
    'assets/supabase-personnel-deadline-dashboard-button-order-fix-v1.js',
    'assets/supabase-personnel-deadline-dashboard-header-v1.js',
    'assets/supabase-personnel-deadline-dashboard-header-style-v2.js',
    'assets/workspace-state-v2.js',
    'assets/workspace-navigation-sync-v1.js',
    'assets/supabase-notifications-v1.js',
    'assets/supabase-personnel-notification-navigation-v1.js',
    'assets/supabase-notifications-delete-v1.js',
    'assets/schedule-auto-plan-navigation-v1.js',
    'assets/schedule-week-board-v2-phase1.js',
    'assets/schedule-month-view-v1.js',
    'assets/schedule-status-history-v1.js',
    'assets/schedule-toolbar-polish-v1.js',
    'assets/schedule-employee-pool-polish-v1.js',
    'assets/schichtfunk-help-center-v1.js'
  ];
  const managerStart=files.indexOf('assets/supabase-time-month-close-v1.js');
  let managerPromise=null;
  const present=file=>[...document.scripts].some(s=>{try{return new URL(s.src,location.href).pathname===new URL(file,location.href).pathname}catch{return false}});
  const append=(file,next)=>{if(present(file)){next();return}const s=document.createElement('script');s.src=file+'?v=20260902loader1';s.onload=next;s.onerror=()=>{console.error('SchichtFunk-Modul konnte nicht geladen werden:',file);next()};document.body.appendChild(s)};
  const loadManager=()=>{
    if(managerPromise)return managerPromise;
    managerPromise=new Promise(resolve=>{const next=i=>{if(i>=files.length){resolve();return}append(files[i],()=>next(i+1))};next(managerStart)}).then(()=>{const B=window.SFBackend;if(B?.ready&&B.role!=='EMPLOYEE')B.baseOpenApp?.(B.pendingView||'overview')});
    return managerPromise;
  };
  const start=()=>{
    const B=window.SFBackend=window.SFBackend||{};
    if(B.__loaderInitStarted)return;B.__loaderInitStarted=true;
    const baseBoot=B.boot;
    if(typeof baseBoot==='function'&&!B.__roleLoaderWrapped){B.__roleLoaderWrapped=true;B.boot=async function(){const result=await baseBoot.apply(this,arguments);if(B.role!=='EMPLOYEE')await loadManager();return result}};
    Promise.resolve(B.init?.()).catch(e=>{B.hideLoading?.();console.error('SchichtFunk Supabase init',e);B.updateState?.()});
  };
  const load=i=>{
    if(i>=managerStart){start();return}
    append(files[i],()=>load(i+1));
  };
  load(0);
})();


