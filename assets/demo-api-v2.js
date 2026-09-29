// SchichtFunk – hosting-unabhaengige Demo-API ueber Supabase Edge Functions V2
(function(){
  if(window.SFDemoAPI)return;
  const base='https://zbvloohfjleadjnqhbbh.supabase.co/functions/v1';
  const ACCESS_KEY='sf_demo_access_token_v2';
  const FAILURE_KEY='sf_demo_failure_token_v2';
  const read=key=>{try{return sessionStorage.getItem(key)||''}catch{return''}};
  const write=(key,value)=>{try{if(value)sessionStorage.setItem(key,value);else sessionStorage.removeItem(key)}catch{}};
  function headers(extra={}){
    const token=read(ACCESS_KEY),failure=read(FAILURE_KEY);
    return {...extra,...(token?{Authorization:`Bearer ${token}`}:{}) ,...(failure?{'X-Demo-Failure':failure}:{})};
  }
  window.SFDemoAPI={
    ACCESS_KEY,FAILURE_KEY,authUrl:`${base}/demo-auth`,analyticsUrl:`${base}/demo-analytics`,
    getAccessToken:()=>read(ACCESS_KEY),setAccessToken:value=>write(ACCESS_KEY,String(value||'')),clearAccessToken:()=>write(ACCESS_KEY,''),
    setFailureToken:value=>write(FAILURE_KEY,String(value||'')),clearFailureToken:()=>write(FAILURE_KEY,''),
    fetchAuth:(options={})=>fetch(`${base}/demo-auth`,{cache:'no-store',...options,headers:headers(options.headers||{})}),
    fetchAnalytics:(body,options={})=>fetch(`${base}/demo-analytics`,{method:'POST',keepalive:true,...options,headers:headers({'Content-Type':'text/plain;charset=UTF-8',...(options.headers||{})}),body:JSON.stringify(body)})
  };
})();
