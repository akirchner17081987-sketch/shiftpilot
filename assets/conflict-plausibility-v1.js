// SchichtFunk – Compliance + Supabase loader
(function(){
  const files=[
    'assets/compliance-core-v2.js',
    'assets/compliance-workflow-v2.js',
    'assets/compliance-ui-v2.js',
    'assets/supabase-auth-v1.js',
    'assets/supabase-data-v1.js',
    'assets/supabase-compliance-bridge-v1.js'
  ];
  const load=i=>{
    if(i>=files.length)return;
    const s=document.createElement('script');
    s.src=files[i]+'?v=20260828b';
    s.onload=()=>load(i+1);
    s.onerror=()=>console.error('SchichtFunk-Modul konnte nicht geladen werden:',files[i]);
    document.body.appendChild(s);
  };
  load(0);
})();