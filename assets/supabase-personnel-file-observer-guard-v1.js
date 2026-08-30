// SchichtFunk – Personalakte Observer Guard V1
(function(){
  if(window.__sfPersonnelObserverGuardV1)return;
  window.__sfPersonnelObserverGuardV1=true;
  const NativeMutationObserver=window.MutationObserver;
  if(!NativeMutationObserver)return;
  function GuardedMutationObserver(callback){
    const src=Function.prototype.toString.call(callback||function(){});
    if(src.includes('ensureLaunch')&&src.includes('view-employees')){
      return {
        observe(){},
        disconnect(){},
        takeRecords(){return []}
      };
    }
    return new NativeMutationObserver(callback);
  }
  GuardedMutationObserver.prototype=NativeMutationObserver.prototype;
  Object.setPrototypeOf(GuardedMutationObserver,NativeMutationObserver);
  window.MutationObserver=GuardedMutationObserver;
})();