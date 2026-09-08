// SchichtFunk – lokale QR-Verwaltungsantworten für die isolierte Demo
(function(){
  if(sessionStorage.getItem('sf_demo_session_v1')!=='active')return;
  if(window.__sfDemoQrLocalBridgeV1)return;
  window.__sfDemoQrLocalBridgeV1=true;

  const LOCAL_RPC=new Set([
    'manager_list_time_qr_terminals',
    'manager_list_time_qr_pilot_candidates',
  ]);

  function patch(){
    const B=window.SFBackend;
    if(!B?.client?.__sfDemoLocalClientV1||typeof B.client.rpc!=='function'){
      setTimeout(patch,60);
      return;
    }
    if(B.client.rpc.__sfDemoQrLocalV1)return;
    const base=B.client.rpc.bind(B.client);
    const wrapped=async function(name,args){
      if(LOCAL_RPC.has(String(name||'')))return {data:[],error:null};
      return base(name,args);
    };
    wrapped.__sfDemoCloudV2=true;
    wrapped.__sfDemoQrLocalV1=true;
    B.client.rpc=wrapped;
  }

  patch();
  [100,300,800,1600,3000].forEach(ms=>setTimeout(patch,ms));
})();
