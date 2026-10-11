// SchichtFunk – visible, authenticated startup and on-demand workspaces.
(function(){
  'use strict';
  const B=window.SFBackend=window.SFBackend||{};
  let locks=[],card=null,navigation=0,startedAt=0;
  const demo=()=>sessionStorage.getItem('sf_demo_session_v1')==='active';
  const now=()=>performance.now();
  function styles(){
    if(document.getElementById('sfStartupCss'))return;
    const style=document.createElement('style');style.id='sfStartupCss';
    style.textContent=`#appShell.sf-startup-pending .view,#appShell.sf-view-loading .view{display:none!important}
      .sf-startup-card{box-sizing:border-box;width:min(720px,100%);margin:28px auto;padding:28px;border:1px solid var(--border,#294159);border-radius:16px;background:var(--panel,#0d1b2a);color:var(--text,#eef7ff)}
      .sf-startup-card h2{margin:0 0 12px;font-size:22px}.sf-startup-card p{font-size:14px;line-height:1.6;color:var(--muted,#9eb3c9)}
      .sf-startup-track{height:5px;overflow:hidden;border-radius:9px;background:var(--border,#294159);margin:22px 0}
      .sf-startup-track span{display:block;width:35%;height:100%;background:var(--teal,#2bd8b6);animation:sf-startup-slide 1.6s ease-in-out infinite}
      .sf-startup-actions{display:flex;gap:10px;flex-wrap:wrap}.sf-startup-actions button{min-height:42px;font-size:13px}
      @keyframes sf-startup-slide{from{transform:translateX(-110%)}to{transform:translateX(390%)}}
      @media(prefers-reduced-motion:reduce){.sf-startup-track span{animation:none;width:100%;opacity:.6}}
      @media(max-width:620px){.sf-startup-card{padding:20px;margin:16px auto}}`;
    document.head.appendChild(style);
  }
  function message(title,text){
    const content=document.querySelector('#appShell .content');if(!content)return;
    styles();
    if(!card||!card.isConnected){
      card=document.createElement('section');card.id='sfStartupStatus';card.className='sf-startup-card';
      card.setAttribute('role','status');card.setAttribute('aria-live','polite');
      card.innerHTML='<h2></h2><p></p><div class="sf-startup-track" aria-hidden="true"><span></span></div><div class="sf-startup-actions"><button type="button" class="ghost" data-startup-reload hidden>Erneut laden</button><button type="button" class="ghost" data-startup-logout>Abmelden</button></div>';
      content.prepend(card);
      card.querySelector('[data-startup-reload]').onclick=()=>location.reload();
      card.querySelector('[data-startup-logout]').onclick=()=>B.signOutSafely?.();
    }
    card.querySelector('h2').textContent=title;card.querySelector('p').textContent=text;
  }
  function lock(){
    if(locks.length)return;
    locks=[...document.querySelectorAll('#appShell .sidebar,#appShell .topbar,#appShell .view')].map(el=>({el,inert:el.inert}));
    locks.forEach(({el})=>el.inert=true);
  }
  function unlock(){locks.forEach(({el,inert})=>el.inert=inert);locks=[];}
  function clean(){card?.remove();card=null;const shell=document.getElementById('appShell');shell?.classList.remove('sf-startup-pending','sf-view-loading');shell?.removeAttribute('aria-busy');unlock();}
  B.startupStage=text=>{if(B.__startupActive)message('Willkommen bei SchichtFunk',text)};
  B.beginStartup=()=>{
    if(B.ready||B.__startupActive||B.role==='EMPLOYEE'||demo())return;
    if(!B.user||!B.companyId||B.__explicitSignOut||B.__finishingSignOut)return;
    const shell=document.getElementById('appShell');if(!shell)return;
    startedAt=now();B.__startupActive=true;
    message('Willkommen bei SchichtFunk','Anmeldung bestätigt. Deine Unternehmensdaten werden geladen …');
    lock();shell.classList.add('sf-startup-pending');shell.setAttribute('aria-busy','true');
    const company=document.querySelector('.company-card b');if(company)company.textContent='Unternehmen wird geladen …';
    document.getElementById('landingPage')?.style.setProperty('display','none');shell.style.setProperty('display','grid');
    B.closeAuth?.();B.hideLoading?.();
    // This flag only controls the decorative entry. Data readiness stays false.
    B.shellReady=true;
    window.SFStartupMetrics={shellShownAtMs:Math.round(startedAt),dataReadyMs:null,workspaceReadyMs:null};
  };
  B.finishStartup=()=>{
    if(!B.__startupActive||!B.ready||B.__explicitSignOut||B.__finishingSignOut)return;
    if(window.SFStartupMetrics)window.SFStartupMetrics.workspaceReadyMs=Math.round(now()-startedAt);
    B.__startupActive=false;clean();
  };
  B.startupDataReady=()=>{if(B.__startupActive&&window.SFStartupMetrics)window.SFStartupMetrics.dataReadyMs=Math.round(now()-startedAt)};
  B.failStartup=()=>{
    if(!B.__startupActive)return;
    B.ready=false;B.shellReady=false;
    message('Daten konnten nicht geladen werden','Bitte lade die Seite erneut. Deine gespeicherten Daten bleiben erhalten.');
    card?.querySelector('[data-startup-reload]')?.removeAttribute('hidden');
  };
  B.installStartupNavigation=()=>{
    const open=B.baseOpenApp;
    if(typeof open==='function'&&!open.__sfStartup){
      const wrapped=function(){if(!B.ready||B.__explicitSignOut||B.__finishingSignOut)return;return open.apply(this,arguments)};
      wrapped.__sfStartup=true;B.baseOpenApp=wrapped;
    }
    const signOut=B.finishSignOut;
    if(typeof signOut==='function'&&!signOut.__sfStartup){
      const wrapped=function(){navigation++;B.shellReady=false;B.__startupActive=false;clean();return signOut.apply(this,arguments)};
      wrapped.__sfStartup=true;B.finishSignOut=wrapped;
    }
    const switchView=window.switchView;
    if(typeof switchView!=='function'||switchView.__sfStartup)return;
    const wrapped=function(name){
      if(!B.ready||B.__startupActive||B.__explicitSignOut||B.__finishingSignOut)return;
      const request=++navigation;
      if(!B.managerViewNeedsLoading?.(name)){clean();return switchView.apply(this,arguments)}
      const user=B.user?.id,company=B.companyId,args=arguments,self=this;
      message('Bereich wird vorbereitet','Die Funktionen für diesen Bereich werden geladen …');
      const shell=document.getElementById('appShell');shell?.classList.add('sf-view-loading');shell?.setAttribute('aria-busy','true');
      return B.ensureManagerViewModules(name).then(()=>{
        if(request!==navigation||!B.ready||B.user?.id!==user||B.companyId!==company||B.__explicitSignOut||B.__finishingSignOut)return;
        clean();return switchView.apply(self,args);
      }).catch(error=>{
        if(request!==navigation||!B.ready||B.__explicitSignOut||B.__finishingSignOut)return;
        message('Bereich konnte nicht geladen werden','Bitte lade die Seite erneut, damit alle Funktionen vollständig verfügbar sind.');
        card?.querySelector('[data-startup-reload]')?.removeAttribute('hidden');console.error('SchichtFunk Bereich',error);
      });
    };
    wrapped.__sfStartup=true;window.switchView=wrapped;
  };
})();
