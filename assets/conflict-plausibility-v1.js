// SchichtFunk – Compliance + Supabase loader
(function(){
  const files=[
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
    'assets/supabase-compliance-bridge-v1.js',
    'assets/supabase-absence-employee-v3.js'
  ];
  const load=i=>{
    if(i>=files.length)return;
    const s=document.createElement('script');
    s.src=files[i]+'?v=20260829h';
    s.onload=()=>load(i+1);
    s.onerror=()=>console.error('SchichtFunk-Modul konnte nicht geladen werden:',files[i]);
    document.body.appendChild(s);
  };
  load(0);
})();