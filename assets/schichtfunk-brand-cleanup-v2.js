// SchichtFunk – finaler Branding-Cleanup V2 (safe)
(function(){
  function run(){
    if(document.title.includes('ShiftPilot')) document.title=document.title.replace(/ShiftPilot/g,'SchichtFunk');
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',run,{once:true});
  else run();
})();
