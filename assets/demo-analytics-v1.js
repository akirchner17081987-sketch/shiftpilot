// SchichtFunk – anonyme, kategoriebasierte Demo-Auswertung V1
(function(){
  if(window.__sfDemoAnalyticsV1)return;
  if(sessionStorage.getItem('sf_demo_session_v1')!=='active')return;
  window.__sfDemoAnalyticsV1=true;

  const SEEN_KEY='sf_demo_analytics_seen_v1';
  const ALLOWED={
    session_started:new Set(['manager']),
    area_opened:new Set(['overview','schedule','auto','disruptions','marketplace','employees','absence','time','reports','settings','employee_dashboard','employee_disruptions','employee_marketplace','employee_shifts','employee_changes','employee_swaps','employee_time','employee_absences','employee_account','employee_wage','employee_profile']),
    tour:new Set(['started','completed','skipped']),
    perspective_changed:new Set(['manager','employee']),
    scenario_selected:new Set(['outage','understaffing','vacation','deviation','swap']),
    scenario_reset:new Set(['prepared_scenario']),
    demo_reset:new Set(['presentation_state']),
    session_finished:new Set(['manual','idle','maximum'])
  };

  function seen(){try{const value=JSON.parse(sessionStorage.getItem(SEEN_KEY)||'[]');return new Set(Array.isArray(value)?value:[])}catch{return new Set()}}
  function save(values){try{sessionStorage.setItem(SEEN_KEY,JSON.stringify([...values].slice(-80)))}catch{}}

  function track(event,value,{once=true}={}){
    if(!Object.hasOwn(ALLOWED,event)||!ALLOWED[event].has(value))return false;
    const key=`${event}:${value}`,used=seen();
    if(once&&used.has(key))return false;
    if(once){used.add(key);save(used)}
    fetch('/api/demo-analytics',{
      method:'POST',credentials:'same-origin',keepalive:true,
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({event,value})
    }).catch(()=>{});
    return true;
  }

  function css(){
    if(document.getElementById('sfDemoAnalyticsCss'))return;
    const style=document.createElement('style');style.id='sfDemoAnalyticsCss';style.textContent=`
      .sf-demo-privacy-button{min-height:36px!important;padding:0 10px!important;border:1px solid #31516a!important;border-radius:9px!important;background:#0a1927!important;color:#9ab0c2!important;font:800 10px Inter,system-ui,sans-serif!important;cursor:pointer;white-space:nowrap}
      .sf-demo-privacy-button:hover{border-color:#3c796e!important;color:#88e7d1!important}
      .sf-demo-privacy-backdrop{position:fixed;inset:0;z-index:92000;display:grid;place-items:center;padding:20px;background:rgba(1,7,13,.82);backdrop-filter:blur(8px)}
      .sf-demo-privacy-card{width:min(570px,100%);overflow:hidden;border:1px solid #31536b;border-radius:18px;background:linear-gradient(155deg,#102536,#081520);color:#edf7ff;box-shadow:0 30px 100px rgba(0,0,0,.62);font-family:Inter,system-ui,sans-serif}
      .sf-demo-privacy-head{display:flex;align-items:flex-start;gap:14px;padding:24px;border-bottom:1px solid #294257}.sf-demo-privacy-icon{width:46px;height:46px;display:grid;place-items:center;flex:none;border:1px solid #297263;border-radius:13px;background:#10352e;color:#79ead0;font-size:21px}.sf-demo-privacy-copy{flex:1}.sf-demo-privacy-copy small{color:#54dfc3;font-size:9px;font-weight:900;letter-spacing:.13em}.sf-demo-privacy-copy h2{margin:5px 0 0;font-size:23px}.sf-demo-privacy-close{width:36px;height:36px;flex:none;border:1px solid #34536b;border-radius:9px;background:#0a1927;color:#bdd0df;cursor:pointer}
      .sf-demo-privacy-body{padding:21px 24px}.sf-demo-privacy-body p{margin:0;color:#a4b9ca;font-size:13px;line-height:1.62}.sf-demo-privacy-list{display:grid;gap:10px;margin:17px 0 0;padding:0;list-style:none}.sf-demo-privacy-list li{display:grid;grid-template-columns:25px 1fr;gap:9px;color:#cbdbe7;font-size:12px;line-height:1.5}.sf-demo-privacy-list i{font-style:normal;color:#5be0c4;font-weight:900}.sf-demo-privacy-note{margin-top:17px;padding:12px 13px;border:1px solid #31584f;border-radius:10px;background:#0e2924;color:#a8d9cd;font-size:11px;line-height:1.55}
      .sf-demo-privacy-foot{display:flex;justify-content:flex-end;padding:16px 24px;border-top:1px solid #294257}.sf-demo-privacy-ok{min-height:41px;padding:9px 15px;border:0;border-radius:9px;background:linear-gradient(135deg,#23d5bd,#298cf0);color:#fff;font-weight:850;cursor:pointer}
      @media(max-width:680px){.sf-demo-privacy-button span{display:none}.sf-demo-privacy-card{max-height:calc(100dvh - 28px);overflow:auto}.sf-demo-privacy-head,.sf-demo-privacy-body,.sf-demo-privacy-foot{padding-left:18px;padding-right:18px}}
    `;document.head.appendChild(style);
  }

  function closeInfo(){document.getElementById('sfDemoPrivacyInfo')?.remove()}
  function openInfo(){
    css();closeInfo();const back=document.createElement('div');back.id='sfDemoPrivacyInfo';back.className='sf-demo-privacy-backdrop';
    back.innerHTML=`<section class="sf-demo-privacy-card" role="dialog" aria-modal="true" aria-labelledby="sfDemoPrivacyTitle"><header class="sf-demo-privacy-head"><div class="sf-demo-privacy-icon">♢</div><div class="sf-demo-privacy-copy"><small>DATENSPARSAME DEMO</small><h2 id="sfDemoPrivacyTitle">Anonyme Demo-Auswertung</h2></div><button type="button" class="sf-demo-privacy-close" aria-label="Hinweis schließen">✕</button></header><div class="sf-demo-privacy-body"><p>Wir zählen ausschließlich, welche vorbereiteten Demo-Funktionen innerhalb einer Sitzung mindestens einmal verwendet wurden. Die Ergebnisse werden nur als tägliche Summen gespeichert.</p><ul class="sf-demo-privacy-list"><li><i>✓</i><span>Funktionsbereiche, Tour, Rollenwechsel, Szenarien, Zurücksetzen sowie Start und Ende</span></li><li><i>✓</i><span>Keine Namen, Eingaben, Suchbegriffe, Freitexte oder Inhalte aus der Demo</span></li><li><i>✓</i><span>Keine Besucher-, Geräte- oder dauerhaften Sitzungskennungen in der Auswertung</span></li></ul><div class="sf-demo-privacy-note">Einzelne Demo-Verläufe lassen sich aus den gespeicherten Tageszählern nicht wiederherstellen.</div></div><footer class="sf-demo-privacy-foot"><button type="button" class="sf-demo-privacy-ok">Verstanden</button></footer></section>`;
    document.body.appendChild(back);const close=()=>closeInfo();back.querySelector('.sf-demo-privacy-close').onclick=close;back.querySelector('.sf-demo-privacy-ok').onclick=close;back.onclick=e=>{if(e.target===back)close()};back.onkeydown=e=>{if(e.key==='Escape')close()};back.querySelector('.sf-demo-privacy-ok').focus();
  }

  function button(){const element=document.createElement('button');element.type='button';element.className='sf-demo-privacy-button';element.dataset.demoPrivacyInfo='';element.title='Welche anonymen Nutzungsdaten werden gezählt?';element.setAttribute('aria-label','Anonyme Auswertung');element.innerHTML='♢ <span>Anonyme Auswertung</span>';element.onclick=openInfo;return element}
  function ensureButtons(){
    const manager=document.querySelector('#appShell .top-actions');if(manager&&!manager.querySelector('[data-demo-privacy-info]'))manager.insertBefore(button(),manager.firstChild);
    const employee=document.querySelector('#sfEmployeePortal .sf-portal-top');if(employee&&!employee.querySelector('[data-demo-privacy-info]'))employee.appendChild(button());
  }

  function areaFrom(target){
    const manager=target.closest?.('[data-view]')?.dataset.view;if(manager&&ALLOWED.area_opened.has(manager))return manager;
    const employee=target.closest?.('[data-sf-portal-section]')?.dataset.sfPortalSection;if(employee){const value=`employee_${employee}`;if(ALLOWED.area_opened.has(value))return value}
    return null;
  }

  function boot(){
    css();ensureButtons();track('session_started','manager');track('area_opened','overview');
    new MutationObserver(ensureButtons).observe(document.body,{childList:true,subtree:true});
    document.addEventListener('click',event=>{const area=areaFrom(event.target);if(area)track('area_opened',area)},true);
    document.addEventListener('sf:demo-tour',event=>track('tour',String(event.detail?.state||'')));
    document.addEventListener('sf:demo-perspective-change',event=>track('perspective_changed',String(event.detail?.perspective||'')));
    document.addEventListener('sf:demo-scenario',event=>{const action=String(event.detail?.action||'');if(action==='selected')track('scenario_selected',String(event.detail?.scenario||''));if(action==='reset')track('scenario_reset','prepared_scenario')});
    document.addEventListener('sf:demo-reset',()=>track('demo_reset','presentation_state'));
    document.addEventListener('sf:demo-finish',event=>track('session_finished',String(event.detail?.reason||'')));
  }

  window.SFDemoAnalytics={track,openInfo};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
