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
    'assets/topbar-actions-v2.js',
    'assets/sidebar-design-v1.js',
    'assets/schedule-auto-plan-navigation-v1.js',
    'assets/schedule-week-board-v2-phase1.js',
    'assets/schedule-month-view-v1.js',
    'assets/schedule-status-history-v1.js',
    'assets/schedule-toolbar-polish-v1.js',
    'assets/schedule-employee-pool-polish-v1.js',
    'assets/schedule-readability-v1.js',
    'assets/employee-management-v2.js',
    'assets/team-access-v1.js',
    'assets/settings-management-v2.js',
    'assets/employee-portal-vertical-layout-v1.js'
  ];
  const start=()=>{
    const B=window.SFBackend=window.SFBackend||{};
    if(B.__loaderInitStarted)return;B.__loaderInitStarted=true;
    Promise.resolve(B.init?.()).catch(e=>{B.hideLoading?.();console.error('SchichtFunk Supabase init',e);B.updateState?.()});
  };
  const load=i=>{
    if(i>=files.length){start();return}
    const s=document.createElement('script');
    s.src=files[i]+'?v=20260831o';
    s.onload=()=>load(i+1);
    s.onerror=()=>{console.error('SchichtFunk-Modul konnte nicht geladen werden:',files[i]);load(i+1)};
    document.body.appendChild(s);
  };
  load(0);
})();

