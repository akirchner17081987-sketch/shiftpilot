// SchichtFunk – finaler Branding-Cleanup V2 (safe)
(function(){
  function run(){
    if(document.title.includes('ShiftPilot')) document.title=document.title.replace(/ShiftPilot/g,'SchichtFunk');
  }
  function loadDatev(){
    if(document.getElementById('sfDatevLodasExportScript'))return;
    const s=document.createElement('script');
    s.id='sfDatevLodasExportScript';
    s.src='assets/datev-lodas-export-v1.js?v=20260903-lodas1';
    s.async=true;
    document.head.appendChild(s);
  }
  function init(){run();loadDatev()}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
