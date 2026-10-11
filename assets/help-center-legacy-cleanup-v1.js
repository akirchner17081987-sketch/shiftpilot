(function(){
  function removeLegacyHelp(){var legacy=document.getElementById("sfHelpCenter");if(legacy&&legacy.parentNode)legacy.parentNode.removeChild(legacy);}
  document.addEventListener("click",function(event){
    var trigger=event.target&&event.target.closest?event.target.closest("#sfHelpButton"):null;
    if(!trigger)return;
    setTimeout(removeLegacyHelp,0);
    setTimeout(removeLegacyHelp,100);
  },true);
  removeLegacyHelp();
})();
