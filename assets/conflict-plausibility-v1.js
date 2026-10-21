// SchichtFunk – Compliance + Supabase loader
(function(){
  const files=[
    'assets/status-toast-v2.js',
    'assets/solid-planning-core-v1.js','assets/compliance-core-v2.js',
    'assets/compliance-workflow-v2.js',
    'assets/compliance-ui-v2.js',
    'assets/noop-change-guard-v1.js',
    'assets/supabase-auth-errors-v1.js',
    'assets/supabase-auth-v1.js',
    'assets/company-profile-v1.js',
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
    'assets/employee-time-account-v2.js',
    'assets/employee-wage-preview-v1.js',
    'assets/employee-profile-v1.js',
    'assets/employee-portal-workspace-v2.js',
    'assets/personnel-evidence-v1.js',
    'assets/employee-qr-bookings-v1.js',
    'assets/supabase-notifications-v1.js',
    'assets/employee-portal-vertical-layout-v1.js',
    'assets/employee-shifts-month-v1.js',
    'assets/time-only-access-v1.js',
    'assets/access-profiles-v1.js',
    'assets/supabase-time-month-close-v1.js',
    'assets/time-month-picker-v1.js',
    'assets/time-workspace-v2.js',
    'assets/datev-lodas-export-v1.js',
    'assets/supabase-report-export-v2.js',
    'assets/supabase-report-pdf-style-v4.js',
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
    'assets/supabase-personnel-notification-navigation-v1.js',
    'assets/supabase-notifications-delete-v1.js',
    'assets/schedule-auto-plan-navigation-v1.js',
    'assets/schedule-week-board-v2-phase1.js',
    'assets/schedule-month-view-v1.js',
    'assets/schedule-status-history-v1.js',
    'assets/schedule-toolbar-polish-v1.js',
    'assets/schedule-employee-pool-polish-v1.js',
    'assets/schichtfunk-help-center-v1.js',
    'assets/employee-profile-manager-v1.js'
  ];
  const managerStart=files.indexOf('assets/supabase-time-month-close-v1.js');
  const timeModules=new Set(files.slice(managerStart,files.indexOf('assets/supabase-personnel-file-observer-guard-v1.js')));
  const personnelModules=new Set(files.filter(file=>file.includes('supabase-personnel-')&&!file.includes('notification-navigation')));
  const coreFiles=files.slice(managerStart).filter(file=>!timeModules.has(file)&&!personnelModules.has(file));
  const loaded=new Set(),promises=new Map(),failedGroups=new Map();
  const isDemo=()=>typeof sessionStorage!=='undefined'&&sessionStorage.getItem('sf_demo_session_v1')==='active';
  const groupFor=view=>view==='employees'?'personnel':['time','reports','billing'].includes(view)?'time':null;
  const present=file=>[...document.scripts].some(s=>{try{return new URL(s.src,location.href).pathname===new URL(file,location.href).pathname}catch{return false}});
  const append=(file,next,fail)=>{if(present(file)){next();return}const s=document.createElement('script');s.async=false;const version=file==='assets/auto-plan-preview-editor-v1.js'?'20261021-employee-row1':["assets/compliance-ui-v2.js", "assets/compliance-core-v2.js", "assets/compliance-workflow-v2.js", "assets/employee-management-v2.js", "assets/month-optimizer-v1.js", "assets/planning-assistant-v1.js", "assets/schedule-week-board-v2-phase1.js", "assets/settings-management-v2.js", "assets/supabase-data-v1.js", "assets/help-center-content-v3.js"].includes(file)?'20261021-manual-rhythm1':['assets/settings-management-v2.js','assets/help-center-content-v3.js'].includes(file)?'20261021-stagger1':["assets/auto-plan-workspace-v1.js", "assets/settings-management-v2.js", "assets/compliance-core-v2.js", "assets/supabase-data-v1.js", "assets/supabase-auto-plan-guard-v1.js", "assets/month-optimizer-core-v1.js", "assets/month-optimizer-v1.js", "assets/background-auto-plan-core-v1.js", "assets/staffing-simulator-core-v1.js", "assets/staffing-simulator-v1.js"].includes(file)?'20261021-shift-duration1':["assets/shift-models-v1.js", "assets/employee-management-v2.js", "assets/employee-profile-v1.js", "assets/supabase-auto-plan-guard-v1.js", "assets/auto-plan-workspace-v1.js"].includes(file)?'20261021-shift-labels1':file==='assets/month-optimizer-v1.js'?'20261020-company-rules2':['assets/auto-plan-workspace-v1.js','assets/month-optimizer-v1.js','assets/settings-management-v2.js','assets/compliance-ui-v2.js'].includes(file)?'20261020-company-rules1':["assets/datev-lodas-export-v1.js","assets/soll-summary-v5.js", "assets/assignment-ux-v4.js", "assets/schichtfunk-schedule-core-v1.js", "assets/schedule-week-board-v2-phase1.js", "assets/dashboard-final-v1.js", "assets/template-manager.js", "assets/calendar-view-switch-v1.js", "assets/employee-shifts-month-v1.js", "assets/employee-profile-v1.js", "assets/reports-workspace-v1.js", "assets/employee-management-v2.js", "assets/supabase-employee-access-v1.js", "assets/settings-management-v2.js", "assets/reports-final-v1.js", "assets/schedule-export-core-v1.js", "assets/schedule-export-v1.js", "assets/today-dashboard-v1.js", "assets/auto-plan-workspace-v1.js", "assets/today-dashboard-v2.js", "assets/shift-models-v1.js"].includes(file)?'20261020-edit-code1':file==='assets/shift-models-v1.js'?'20261020-dialog1':file==='assets/company-switcher-v1.js'?'20261020-company-order1':['assets/view-state-v1.js','assets/workspace-state-v2.js'].includes(file)?'20261019-start-overview1':file==='assets/supabase-auth-v1.js'?'20261018-entry-dive1':['assets/auto-plan-workspace-v1.js','assets/month-optimizer-v1.js','assets/help-center-content-v3.js'].includes(file)?'20261015-apply-feedback1':['assets/solid-planning-core-v1.js','assets/month-optimizer-core-v1.js','assets/supabase-auto-plan-guard-v1.js','assets/settings-management-v2.js','assets/help-center-content-v3.js'].includes(file)?'20261015-forward-order1':['assets/auto-plan-preview-editor-v1.js','assets/help-center-content-v3.js'].includes(file)?'20261015-vacancy-picker1':['assets/month-optimizer-v1.js','assets/solid-planning-core-v1.js','assets/month-optimizer-core-v1.js','assets/supabase-auto-plan-guard-v1.js','assets/supabase-absence-planning-guard-v2.js','assets/settings-management-v2.js','assets/help-center-content-v3.js'].includes(file)?'20261015-tl-forward1':['assets/month-optimizer-v1.js','assets/solid-planning-core-v1.js','assets/month-optimizer-core-v1.js','assets/solid-planning-resume-v1.js','assets/settings-management-v2.js','assets/help-center-content-v3.js'].includes(file)?'20261015-ot200-1':['assets/month-optimizer-v1.js','assets/solid-planning-core-v1.js','assets/supabase-auto-plan-guard-v1.js','assets/help-center-content-v3.js'].includes(file)?'20261015-block-context1':file==='assets/auto-plan-preview-editor-v1.js'?'20261015-preview-edit2':['assets/auto-plan-preview-editor-v1.js','assets/auto-plan-workspace-v1.js','assets/month-optimizer-v1.js','assets/supabase-auto-plan-guard-v1.js'].includes(file)?'20261015-preview-edit1':['assets/solid-planning-core-v1.js','assets/employee-rhythm-v1.js'].includes(file)?'20261014-fixed-week1':['assets/solid-planning-core-v1.js','assets/month-optimizer-core-v1.js','assets/solid-planning-resume-v1.js','assets/background-auto-plan-core-v1.js','assets/month-optimizer-v1.js','assets/settings-management-v2.js','assets/staffing-simulator-core-v1.js','assets/staffing-simulator-v1.js'].includes(file)?'20261014-fixed-cycle1':['assets/solid-planning-core-v1.js','assets/shift-models-v1.js','assets/month-optimizer-v1.js','assets/settings-management-v2.js','assets/staffing-simulator-core-v1.js','assets/staffing-simulator-v1.js'].includes(file)?'20261014-ot-holidays1':file==='assets/auto-plan-workspace-v1.js'?'20261014-staffing-order1':['assets/auto-plan-workspace-v1.js','assets/shift-models-v1.js'].includes(file)?'20261014-staffing-summary1':file==='assets/employee-erasure-v1.js'?'20261020-erasure-speed1':['assets/background-auto-plan-core-v1.js','assets/solid-planning-core-v1.js','assets/month-optimizer-core-v1.js','assets/solid-planning-resume-v1.js','assets/month-optimizer-v1.js','assets/settings-management-v2.js'].includes(file)?'20261014-tl-targets1':file==='assets/settings-management-v2.js'?'20261014-week55-1':['assets/solid-planning-core-v1.js','assets/background-auto-plan-core-v1.js','assets/settings-management-v2.js'].includes(file)?'20261014-tl-nights1':['assets/auto-plan-workspace-v1.js','assets/solid-planning-core-v1.js','assets/month-optimizer-core-v1.js','assets/month-optimizer-v1.js','assets/solid-planning-resume-v1.js','assets/background-auto-plan-core-v1.js','assets/shift-models-v1.js','assets/settings-management-v2.js'].includes(file)?'20261014-ot-roster1':file==='assets/auto-plan-workspace-v1.js'?'20261013-preserve-period1':file==='assets/schedule-week-board-v2-phase1.js'?'20261013-inline-picker1':['assets/solid-planning-core-v1.js','assets/month-optimizer-core-v1.js','assets/solid-planning-resume-v1.js','assets/background-auto-plan-core-v1.js','assets/auto-plan-progress-v1.js','assets/month-optimizer-v1.js'].includes(file)?'20261013-speed1':file==='assets/schedule-week-board-v2-phase1.js'||file==='assets/schedule-month-view-v1.js'?'20261013-manual1':['assets/background-auto-plan-v1.js','assets/background-auto-plan-core-v1.js','assets/solid-planning-resume-v1.js','assets/auto-plan-progress-v1.js','assets/month-optimizer-core-v1.js','assets/month-optimizer-v1.js'].includes(file)?'20261012-background1':['assets/settings-management-v2.js','assets/solid-planning-core-v1.js','assets/help-center-content-v3.js'].includes(file)?'20261012-ot-scope1':['assets/audit-logs-v1.js','assets/help-center-content-v3.js','assets/settings-management-v2.js', 'assets/solid-planning-core-v1.js', 'assets/supabase-data-v1.js', 'assets/company-switcher-v1.js', 'assets/month-optimizer-v1.js'].includes(file)?'20261012-rule-settings2':['assets/schichtfunk-help-center-v1.js','assets/team-admin-v1.js','assets/access-profiles-v1.js','assets/supabase-mfa-v1.js','assets/supabase-personnel-file-v1.js','assets/supabase-personnel-file-enhancements-v1.js'].includes(file)?'20261012-personnel-talks':['assets/supabase-mfa-v1.js','assets/supabase-data-v1.js','assets/access-profiles-v1.js','assets/supabase-absence-workflow-v1.js','assets/supabase-absence-manager-v2.js'].includes(file)?'20261011-personnel-mfa':file==='assets/supabase-auth-v1.js'?'20261011-privacy1':file==='assets/supabase-data-v1.js'?'20261011-privacy1':file==='assets/company-switcher-v1.js'?'20261011-privacy1':file==='assets/supabase-personnel-notification-navigation-v1.js'||file==='assets/employee-profile-manager-v1.js'?'20261011-startup1':file==='assets/supabase-absence-manager-v2.js'?'20261011-badge1':['assets/compliance-core-v2.js','assets/employee-portal-workspace-v2.js'].includes(file)?'20261010-handover1':file==='assets/supabase-time-tracking-v1.js'?'20261010-today1':file==='assets/central-time-reports-v1.js'?'20261010-reports1':['assets/supabase-report-pdf-style-v4.js','assets/company-profile-v1.js','assets/company-switcher-v1.js','assets/employee-profile-v1.js','assets/audit-logs-v1.js','assets/shift-models-v1.js'].includes(file)?'20261010-company1':['assets/supabase-publish-v1.js','assets/settings-management-v2.js','assets/access-profiles-v1.js','assets/company-switcher-v1.js','assets/time-only-access-v1.js','assets/supabase-time-tracking-v1.js'].includes(file)?'20261009-accessroles1':['assets/settings-management-v2.js','assets/schedule-week-board-v2-phase1.js'].includes(file)?'20261009-display-controls1':['assets/compliance-ui-v2.js','assets/settings-management-v2.js'].includes(file)?'20261009-arbzg-info2':['assets/solid-planning-core-v1.js','assets/shift-models-v1.js'].includes(file)?'20261009-site-holidays3':['assets/solid-planning-core-v1.js','assets/supabase-data-v1.js','assets/compliance-core-v2.js','assets/shift-models-v1.js','assets/auto-plan-workspace-v1.js','assets/supabase-auto-plan-guard-v1.js'].includes(file)?'20261008-solid-auto3':['assets/supabase-time-accounts-v1.js','assets/supabase-time-account-holidays-v1.js','assets/employee-time-account-v2.js'].includes(file)?'20261008-target1':['assets/employee-erasure-v1.js','assets/employee-management-v2.js','assets/supabase-data-v1.js'].includes(file)?'20261006-erasure1':['assets/qr-manager-correction-v1.js','assets/supabase-time-tracking-v1.js','assets/audit-logs-v1.js'].includes(file)?'20261006-deformat3':['assets/supabase-time-month-close-v1.js','assets/central-time-core-v1.js','assets/supabase-time-tracking-v1.js','assets/central-time-reports-v1.js','assets/employee-time-account-v2.js','assets/demo-marketplace-v1.js'].includes(file)?'20261006-central1':['assets/shift-models-v1.js','assets/compliance-core-v2.js','assets/auto-plan-workspace-v1.js','assets/schichtfunk-schedule-core-v1.js'].includes(file)?'20261004-fd-split1':file==='assets/supabase-data-v1.js'?'20261004-all-plan-pages1':file==='assets/shift-models-v1.js'?'20261003-morningot1':file==='assets/schedule-week-board-v2-phase1.js'?'20261003-personorder1':['assets/supabase-data-v1.js','assets/supabase-auto-plan-guard-v1.js','assets/supabase-absence-planning-guard-v2.js'].includes(file)?'20261003-monthopt1':file==='assets/supabase-personnel-file-v1.js'?'20261003-personnel-visible1':['assets/shift-models-v1.js','assets/schedule-week-board-v2-phase1.js'].includes(file)?'20261002-sharedtl1':['assets/employee-profile-v1.js','assets/employee-profile-manager-v1.js','assets/supabase-notifications-v1.js','assets/employee-portal-workspace-v2.js'].includes(file)?'20261002-profile1':['assets/employee-wage-preview-v1.js','assets/employee-portal-workspace-v2.js'].includes(file)?'20261002-wage2':['assets/employee-qr-bookings-v1.js','assets/employee-portal-workspace-v2.js'].includes(file)?'20261002-qrbookings1':['assets/supabase-time-accounts-v1.js','assets/supabase-time-account-holidays-v1.js','assets/employee-time-account-v2.js'].includes(file)?'20261002-account1':file==='assets/employee-portal-vertical-layout-v1.js'?'20261002-layout-owner1':['assets/supabase-absence-employee-v3.js','assets/supabase-absence-workflow-v1.js','assets/employee-portal-workspace-v2.js'].includes(file)?'20261002-absence-clicks2':['assets/supabase-time-tracking-v1.js','assets/employee-portal-workspace-v2.js'].includes(file)?'20261002-employee-time1':file==='assets/employee-portal-workspace-v2.js'?'20261002-leftnav1':file==='assets/supabase-shift-swap-v1.js'||file==='assets/employee-portal-workspace-v2.js'?'20261002-swap1':file==='assets/supabase-employee-change-response-v1.js'||file==='assets/employee-portal-workspace-v2.js'?'20261002-changes1':['assets/employee-shifts-month-v1.js','assets/employee-portal-workspace-v2.js','assets/supabase-shift-swap-v1.js'].includes(file)?'20261002-month2':file==='assets/audit-logs-v1.js'?'20261001-withdraw1':file==='assets/supabase-delta-sync-v1.js'?'20261001-market-sync1':file==='assets/supabase-schedule-reset-v1.js'?'20261001-monthreset2':['assets/supabase-schedule-reset-v1.js','assets/company-switcher-v1.js','assets/compliance-core-v2.js','assets/audit-logs-v1.js'].includes(file)?'20261001-monthreset1':file==='assets/company-switcher-v1.js'?'20261001-market1':['assets/compliance-core-v2.js','assets/compliance-workflow-v2.js','assets/supabase-absence-planning-guard-v2.js','assets/schedule-month-view-v1.js'].includes(file)?'20261001-schedulefix1':['assets/supabase-data-v1.js','assets/company-switcher-v1.js'].includes(file)?'20261001-centralteams1':file==='assets/schichtfunk-help-center-v1.js'?'20261001-teams1':file==='assets/compliance-workflow-v2.js'?'20261001-workflow2':['assets/supabase-publish-v1.js','assets/schedule-month-view-v1.js','assets/compliance-ui-v2.js'].includes(file)?'20261001-period1':['assets/company-switcher-v1.js','assets/schichtfunk-help-center-v1.js'].includes(file)?'20261001-workflow1':['assets/employee-removal-v1.js','assets/supabase-data-v1.js','assets/company-switcher-v1.js'].includes(file)?'20261001-statusdialog1':['assets/shift-models-v1.js','assets/supabase-data-v1.js','assets/company-switcher-v1.js','assets/schedule-week-board-v2-phase1.js'].includes(file)?'20261001-models1':['assets/supabase-data-v1.js','assets/company-switcher-v1.js','assets/supabase-auth-v1.js','assets/supabase-employee-access-v1.js','assets/supabase-employee-access-guard-v1.js'].includes(file)?'20260930-company1':['assets/time-only-access-v1.js','assets/time-workspace-v2.js','assets/supabase-time-tracking-v1.js'].includes(file)?'20260930-timeonly3':['assets/supabase-absence-employee-v3.js','assets/employee-portal-workspace-v2.js'].includes(file)?'20260912-acceptance1':file==='assets/supabase-time-account-holidays-v1.js'?'20260911-saxony1':file==='assets/time-month-picker-v1.js'?'20260929-customday1':file==='assets/privacy-retention-ui-v1.js'?'20260918-successor1':file==='assets/schedule-week-board-v2-phase1.js'?'20261013-timetable1':'20260906-timeaccount1';s.src=file+'?v='+version;if(['assets/personnel-evidence-v1.js','assets/employee-portal-workspace-v2.js','assets/supabase-personnel-file-v1.js','assets/supabase-notifications-v1.js','assets/help-center-content-v3.js'].includes(file))s.src+='&evidence=20261020-1';if(['assets/supabase-auth-errors-v1.js','assets/supabase-employee-access-v1.js','assets/supabase-employee-access-guard-v1.js','assets/access-profiles-v1.js'].includes(file))s.src+='&portalEntry=20261018-1';if(['assets/supabase-notifications-v1.js','assets/help-center-content-v3.js','assets/shift-handover-v1.js'].includes(file))s.src+='&handoverReminders=20261018-1';if(file==='assets/help-center-content-v3.js')s.src+='&portal=20261017-2';if(['assets/employee-portal-workspace-v2.js','assets/disruption-autopilot-v1.js','assets/employee-profile-v1.js','assets/employee-qr-bookings-v1.js','assets/employee-shifts-month-v1.js','assets/employee-time-account-v2.js','assets/employee-wage-preview-v1.js','assets/shift-handover-v1.js','assets/supabase-absence-employee-v3.js','assets/supabase-employee-change-response-v1.js','assets/supabase-shift-marketplace-v1.js','assets/supabase-shift-swap-v1.js','assets/wish-planning-v1.js'].includes(file))s.src+='&portalPolish=20261017-3';if(['assets/auto-plan-workspace-v1.js','assets/month-optimizer-v1.js','assets/help-center-content-v3.js'].includes(file))s.src+='&review=20261017-1';if(file==='assets/month-optimizer-v1.js')s.src+='&singleplan=20261017-1';if(file==='assets/month-optimizer-v1.js')s.src+='&optionstatus=20261017-1';if(file==='assets/auto-plan-workspace-v1.js')s.src+='&rulecards=20261017-1';if(['assets/solid-planning-core-v1.js','assets/auto-plan-workspace-v1.js','assets/month-optimizer-v1.js','assets/settings-management-v2.js','assets/help-center-content-v3.js'].includes(file))s.src+='&weekends=20261017-rhythm1';if(['assets/auto-plan-workspace-v1.js','assets/month-optimizer-v1.js'].includes(file))s.src+='&rulesview=20261017-compact1';if(['assets/solid-planning-core-v1.js','assets/compliance-core-v2.js','assets/settings-management-v2.js','assets/auto-plan-preview-editor-v1.js'].includes(file))s.src+='&monthly=20261017-200h';if(file==='assets/employee-shifts-month-v1.js')s.src+='&employeehome=20261017-1';if(['assets/supabase-absence-employee-v3.js','assets/supabase-absence-manager-v2.js'].includes(file))s.src+='&leave=20261018-2';if(file==='assets/supabase-shift-swap-v1.js')s.src+='&swap=20261018-1';if(['assets/supabase-time-month-close-v1.js','assets/supabase-report-export-v2.js','assets/datev-lodas-export-v1.js'].includes(file))s.src+='&monthclose=20261018-1';s.src+='&security=20261016-matrix1&csp=20261017-1';if(['assets/datev-lodas-export-v1.js','assets/time-month-picker-v1.js','assets/access-profiles-v1.js','assets/view-state-v1.js'].includes(file))s.src+='&billing=20261016-2';if(file==='assets/time-workspace-v2.js')s.src+='&pin=20261016-visible1';if(file==='assets/supabase-data-v1.js')s.src+='&startupAudit=20261016-1';s.onload=next;s.onerror=()=>{s.remove?.();console.error('SchichtFunk-Modul konnte nicht geladen werden:',file);if(fail)fail(new Error('Modul konnte nicht geladen werden: '+file));else next()};document.body.appendChild(s)};
  // Download each phase concurrently; classic scripts with async=false execute in insertion order.
  const loadGroup=(from,to,done)=>{let pending=to-from;if(!pending){done();return}for(let i=from;i<to;i++)append(files[i],()=>{if(!--pending)done()})};
  const loadManagerGroup=group=>{
    if(loaded.has(group))return Promise.resolve();
    if(failedGroups.has(group))return Promise.reject(failedGroups.get(group));
    if(promises.has(group))return promises.get(group);
    const selected=group==='personnel'?files.filter(file=>personnelModules.has(file)):group==='time'?files.filter(file=>timeModules.has(file)):coreFiles;
    const promise=Promise.allSettled(selected.map(file=>new Promise((resolve,reject)=>append(file,resolve,reject))))
      .then(results=>{const failed=results.find(result=>result.status==='rejected');if(failed){failedGroups.set(group,failed.reason);throw failed.reason}loaded.add(group)}).finally(()=>promises.delete(group));
    promises.set(group,promise);return promise;
  };
  const start=()=>{
    const B=window.SFBackend=window.SFBackend||{};
    if(B.__loaderInitStarted)return;B.__loaderInitStarted=true;
    B.prepareManagerModules=()=>B.role==='EMPLOYEE'?Promise.resolve():loadManagerGroup('core');
    B.managerViewNeedsLoading=view=>B.role!=='EMPLOYEE'&&!!groupFor(view)&&!loaded.has(groupFor(view));
    B.ensureManagerViewModules=view=>B.role==='EMPLOYEE'?Promise.resolve():groupFor(view)?loadManagerGroup(groupFor(view)):Promise.resolve();
    B.installStartupNavigation?.();
    const baseBoot=B.boot;
    if(typeof baseBoot==='function'&&!B.__roleLoaderWrapped){
      B.__roleLoaderWrapped=true;let bootPromise=null;
      B.boot=function(){
        if(bootPromise)return bootPromise;
        bootPromise=(async()=>{
          const result=await baseBoot.apply(this,arguments);
          if(B.__explicitSignOut||B.__finishingSignOut)return result;
          if(B.role!=='EMPLOYEE'){
            B.startupStage?.('Daten geladen. Dein Arbeitsbereich wird vorbereitet …');
            await B.prepareManagerModules();
            if(isDemo())await Promise.all([loadManagerGroup('time'),loadManagerGroup('personnel')]);
            else await B.ensureManagerViewModules(B.role==='TIME_TRACKING'?'time':B.pendingView||'overview');
            B.installStartupNavigation?.();
          }
          B.finishStartup?.();return result;
        })().catch(error=>{B.failStartup?.();throw error}).finally(()=>bootPromise=null);
        return bootPromise;
      };
    }
    const init=()=>Promise.resolve(B.init?.()).catch(e=>{B.hideLoading?.();console.error('SchichtFunk Supabase init',e);B.updateState?.()});
    if(window.SFPageReady)window.SFPageReady.then(init);else init();
  };
  const load=i=>{
    if(i>=managerStart){start();return}
    loadGroup(i,managerStart,start);
  };
  load(0);
})();
