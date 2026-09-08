// SchichtFunk – lokale QR-Verwaltungsantworten für die isolierte Demo
(function(){
  if(sessionStorage.getItem('sf_demo_session_v1')!=='active')return;
  if(window.__sfDemoQrLocalBridgeV1)return;
  window.__sfDemoQrLocalBridgeV1=true;

  const LOCAL_RPC=new Set([
    'manager_list_time_qr_terminals',
    'manager_list_time_qr_pilot_candidates',
  ]);

  function wrapClient(client){
    if(!client?.__sfDemoLocalClientV1||typeof client.rpc!=='function')return client;
    if(client.rpc.__sfDemoQrLocalV1)return client;
    const base=client.rpc.bind(client);
    const wrapped=async function(name,args){
      if(LOCAL_RPC.has(String(name||'')))return {data:[],error:null};
      return base(name,args);
    };
    wrapped.__sfDemoCloudV2=true;
    wrapped.__sfDemoQrLocalV1=true;
    client.rpc=wrapped;
    return client;
  }

  function patchFactory(){
    const factory=window.SFDemoDataClient;
    if(!factory||typeof factory.create!=='function')return false;
    if(!factory.create.__sfDemoQrFactoryV1){
      const baseCreate=factory.create.bind(factory);
      const create=function(){return wrapClient(baseCreate.apply(factory,arguments))};
      create.__sfDemoQrFactoryV1=true;
      factory.create=create;
    }
    return true;
  }

  function patch(){
    patchFactory();
    const B=window.SFBackend;
    if(B?.client?.__sfDemoLocalClientV1)wrapClient(B.client);
    if(!window.SFDemoDataClient||!B?.client?.__sfDemoLocalClientV1)setTimeout(patch,60);
  }

  patch();
  [100,300,800,1600,3000,6000].forEach(ms=>setTimeout(patch,ms));
})();
