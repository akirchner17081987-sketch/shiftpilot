// SchichtFunk – feste Supabase Auth-Weiterleitung auf Produktion
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  B.productionUrl='https://shiftpilot-two.vercel.app/';
  const baseInit=B.init;
  if(typeof baseInit!=='function') return;
  B.init=async function(){
    const result=await baseInit.apply(this,arguments);
    if(B.client?.auth && !B.client.auth.__sfProductionRedirect){
      const originalSignUp=B.client.auth.signUp.bind(B.client.auth);
      B.client.auth.signUp=function(credentials){
        const input={...(credentials||{})};
        input.options={...(input.options||{}),emailRedirectTo:B.productionUrl+'#app'};
        return originalSignUp(input);
      };
      B.client.auth.__sfProductionRedirect=true;
    }
    return result;
  };
})();