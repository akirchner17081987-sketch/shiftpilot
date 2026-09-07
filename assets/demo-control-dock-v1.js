// SchichtFunk – gebündelte Demo-Steuerung am unteren Bildschirmrand V1
(function(){
  if(window.__sfDemoControlDockV1)return;
  if(sessionStorage.getItem('sf_demo_session_v1')!=='active')return;
  window.__sfDemoControlDockV1=true;

  let syncing=false,queued=false;

  function ensureCss(){
    if(document.getElementById('sfDemoControlDockCss'))return;
    const style=document.createElement('style');style.id='sfDemoControlDockCss';style.textContent=`
      html[data-sf-demo="1"]{--sf-demo-dock-space:86px}
      #sfDemoControlDock{position:fixed;z-index:30000;left:50%;bottom:max(10px,env(safe-area-inset-bottom));transform:translateX(-50%);width:max-content;max-width:calc(100vw - 22px);padding:7px;border:1px solid #31536a;border-radius:15px;background:rgba(7,20,31,.96);box-shadow:0 18px 55px rgba(0,0,0,.48);backdrop-filter:blur(14px);color:#eaf5fd}
      #sfDemoControlDock .sf-demo-dock-controls{display:flex;align-items:center;justify-content:center;gap:7px;max-width:100%;overflow-x:auto;overscroll-behavior-inline:contain;scrollbar-width:thin;scrollbar-color:#31536a transparent}
      #sfDemoControlDock #sfDemoBadge{position:static!important;right:auto!important;bottom:auto!important;display:block!important;flex:0 0 auto;margin:0;padding:7px 10px;box-shadow:none;white-space:nowrap}
      #sfDemoControlDock .sf-demo-perspective{position:static!important;inset:auto!important;transform:none!important;flex:0 0 auto;margin:0!important;box-shadow:none}
      #sfDemoControlDock .sf-demo-perspective button{min-width:auto!important;min-height:44px!important}
      #sfDemoControlDock [data-demo-scenarios],#sfDemoControlDock #sfDemoResetBtn,#sfDemoControlDock #sfDemoExitBtn,#sfDemoControlDock #sfDemoEmployeeExit{position:static!important;inset:auto!important;display:block!important;flex:0 0 auto;min-height:44px!important;margin:0!important;box-shadow:none!important;white-space:nowrap}
      #sfDemoControlDock #sfDemoExitBtn[hidden],#sfDemoControlDock #sfDemoEmployeeExit[hidden]{display:none!important}
      html[data-sf-demo="1"] #appShell{height:100vh;min-height:0;overflow:hidden}
      html[data-sf-demo="1"] #appShell .main{margin-bottom:var(--sf-demo-dock-space)!important;padding-bottom:40px!important;scroll-padding-bottom:24px}
      html[data-sf-demo="1"] #sfEmployeePortal .sf-portal-main{bottom:var(--sf-demo-dock-space)!important;padding-bottom:40px!important;scroll-padding-bottom:24px}
      @media(max-width:560px){
        html[data-sf-demo="1"]{--sf-demo-dock-space:132px}
        #sfDemoControlDock{width:calc(100vw - 16px);bottom:max(8px,env(safe-area-inset-bottom));padding:7px 6px;border-radius:14px}
        #sfDemoControlDock .sf-demo-dock-controls{flex-wrap:wrap;gap:5px;overflow:visible}
        #sfDemoControlDock #sfDemoBadge{width:74px;font-size:0;padding:6px 8px;text-align:center}
        #sfDemoControlDock #sfDemoBadge:after{content:'DEMO';font-size:9px;letter-spacing:.1em}
        #sfDemoControlDock .sf-demo-perspective{order:1}
        #sfDemoControlDock [data-demo-scenarios]{order:2}
        #sfDemoControlDock #sfDemoBadge{order:3}
        #sfDemoControlDock #sfDemoResetBtn{order:4;font-size:10px!important;padding:0 9px!important}
        #sfDemoControlDock #sfDemoExitBtn,#sfDemoControlDock #sfDemoEmployeeExit{order:5;font-size:10px!important;padding:0 9px!important}
      }
    `;document.head.appendChild(style);
  }

  function dock(){
    let root=document.getElementById('sfDemoControlDock');
    if(root)return root;
    root=document.createElement('aside');root.id='sfDemoControlDock';root.setAttribute('aria-label','Demo-Steuerung');root.innerHTML='<div class="sf-demo-dock-controls" role="toolbar" aria-label="Demo bedienen"></div>';
    document.body.appendChild(root);return root;
  }

  function sync(){
    if(syncing||!document.body)return;syncing=true;
    try{
      ensureCss();const root=dock(),controls=root.querySelector('.sf-demo-dock-controls');
      const selectors=['#sfDemoBadge','#sfDemoPerspectiveSwitch','[data-demo-scenarios]','#sfDemoResetBtn','#sfDemoExitBtn','#sfDemoEmployeeExit'];
      selectors.forEach(selector=>{const node=[...document.querySelectorAll(selector)].find(item=>!root.contains(item));if(node)controls.appendChild(node)});
      const employee=!!document.getElementById('sfEmployeePortal'),managerExit=document.getElementById('sfDemoExitBtn'),employeeExit=document.getElementById('sfDemoEmployeeExit');
      if(managerExit)managerExit.hidden=employee&&!!employeeExit;if(employeeExit)employeeExit.hidden=!employee;
      document.documentElement.dataset.sfDemoDock='1';
    }finally{syncing=false}
  }

  const observer=new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;sync()})});
  function boot(){sync();observer.observe(document.body,{childList:true,subtree:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  document.addEventListener('sf:demo-perspective-change',()=>setTimeout(sync,0));
})();
