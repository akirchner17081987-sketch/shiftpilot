Warning: truncated output (original token count: 2685)
Total output lines: 110

// SchichtFunk - Compliance + Supabase loader
(function(){
  const files=[
    'assets/status-toast-v2.js',
    'assets/solid-planning-core-v1.js','assets/compliance-core-v2.js',
    'assets/compliance-workflow-v2.js',
    'assets/compliance-ui-v2.js',
    'assets/noop-change-guard-v1.js',
    'assets/supabase-auth-errors-v1.js',
    'assets/supabase-auth-v1.js',
    'assets/company-switcher-v1.js',
    'assets/shift-models-v1.js',
    'assets/employee-removal-v1.js',
    'assets/employee-erasure-v1.js',
    'assets/supabase-password-reset-v1.js',
    'assets/view-state-v1.js',
    'assets/supabase-auth-redirect-v1.js',
    'assets/supabase-data-v1.js',
    'assets/supabase-mfa-v1.js',
    'assets/privacy-retention-ui-v1.js',
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
    'assets/central-time-core-v1.js',
    'assets/qr-manager-correction-v1.js',
    'assets/supabase-time-tracking-v1.js',
    'assets/supabase-time-tracking-ui-guard-v1.js',
    'assets/supabase-time-accounts-v1.js',
    'assets/central-time-reports-v1.js',
    'assets/supabase-time-account-holidays-v1.js',
    'assets/employee-time-account-…1685 tokens truncated…assets/schedule-week-board-v2-phase1.js'].includes(file)?'20261001-models1':['assets/supabase-data-v1.js','assets/company-switcher-v1.js','assets/supabase-auth-v1.js','assets/supabase-employee-access-v1.js','assets/supabase-employee-access-guard-v1.js'].includes(file)?'20260930-company1':['assets/time-only-access-v1.js','assets/time-workspace-v2.js','assets/supabase-time-tracking-v1.js'].includes(file)?'20260930-timeonly3':['assets/supabase-absence-employee-v3.js','assets/employee-portal-workspace-v2.js'].includes(file)?'20260912-acceptance1':file==='assets/supabase-time-account-holidays-v1.js'?'20260911-saxony1':file==='assets/time-month-picker-v1.js'?'20260929-customday1':file==='assets/privacy-retention-ui-v1.js'?'20260918-successor1':file==='assets/schedule-week-board-v2-phase1.js'?'20260929-compact1':'20260906-timeaccount1';s.src=file+'?v='+version;s.onload=next;s.onerror=()=>{console.error('SchichtFunk-Modul konnte nicht geladen werden:',file);next()};document.body.appendChild(s)};
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


