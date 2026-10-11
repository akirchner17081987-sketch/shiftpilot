(function(){
  function dedupe(){
    var legacy=document.getElementById('sfHelpCenter');if(legacy&&legacy.parentNode)legacy.parentNode.removeChild(legacy);var nodes=[].slice.call(document.querySelectorAll('[id="sfHelpModal"]'));
    if(nodes.length<2) nodes=[].slice.call(document.querySelectorAll('.sf-help-backdrop'));
    if(nodes.length<2)return;
    nodes.slice(1).forEach(function(n){if(n&&n.parentNode)n.parentNode.removeChild(n)});
  }
  function run(){
    dedupe();
    if(window.MutationObserver){
      var obs=new MutationObserver(function(){dedupe()});
      obs.observe(document.body,{childList:true,subtree:true});
      setTimeout(function(){obs.disconnect();dedupe()},3000);
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
})();
