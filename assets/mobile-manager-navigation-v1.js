// SchichtFunk – beschriftete, ausklappbare Manager-Navigation auf Mobilgeraeten
(function(){
  if(window.__sfMobileManagerNavigationV1)return;
  window.__sfMobileManagerNavigationV1=true;

  const MOBILE='(max-width: 820px)';
  const media=window.matchMedia(MOBILE);
  const labels={
    overview:'Übersicht',schedule:'Dienstplan',auto:'Auto-Planung',disruptions:'Störfall-Autopilot',
    marketplace:'Schicht-Marktplatz',employees:'Mitarbeiter',absence:'Abwesenheiten',time:'Zeiterfassung',
    reports:'Auswertungen',audit:'Audit-Logs',settings:'Einstellungen'
  };

  function init(){
    const shell=document.getElementById('appShell');
    const sidebar=shell?.querySelector('.sidebar');
    const topbar=shell?.querySelector('.topbar');
    const search=topbar?.querySelector('.search');
    if(!shell||!sidebar||!topbar||document.getElementById('sfMobileManagerNavToggle'))return;

    sidebar.id=sidebar.id||'sfManagerSidebar';

    const head=document.createElement('div');
    head.className='sf-mobile-nav-head';
    head.innerHTML='<div class="sf-mobile-nav-title"><strong>Manager-Menü</strong><small>Bereich auswählen</small></div><button type="button" class="sf-mobile-nav-close" aria-label="Manager-Menü schließen">×</button>';
    sidebar.prepend(head);

    const toggle=document.createElement('button');
    toggle.type='button';
    toggle.id='sfMobileManagerNavToggle';
    toggle.className='sf-mobile-manager-nav';
    toggle.setAttribute('aria-controls',sidebar.id);
    toggle.setAttribute('aria-expanded','false');
    toggle.innerHTML='<span class="sf-mobile-manager-nav-icon" aria-hidden="true">☰</span><span class="sf-mobile-manager-nav-copy"><span>Menü</span><small>Übersicht</small></span>';
    topbar.insertBefore(toggle,search||topbar.firstChild);

    const backdrop=document.createElement('button');
    backdrop.type='button';
    backdrop.className='sf-mobile-nav-backdrop';
    backdrop.setAttribute('aria-label','Manager-Menü schließen');
    backdrop.setAttribute('tabindex','-1');
    shell.appendChild(backdrop);

    const closeButton=head.querySelector('.sf-mobile-nav-close');
    const current=toggle.querySelector('small');

    function updateCurrent(){
      const active=sidebar.querySelector('[data-view].active');
      const label=labels[active?.dataset.view]||active?.textContent?.trim()||'Übersicht';
      current.textContent=label;
      toggle.setAttribute('aria-label',`Manager-Menü öffnen. Aktueller Bereich: ${label}`);
    }

    function setOpen(open,returnFocus=true){
      const enabled=media.matches;
      const value=enabled&&open;
      shell.classList.toggle('sf-mobile-nav-open',value);
      document.documentElement.classList.toggle('sf-mobile-manager-menu-open',value);
      toggle.setAttribute('aria-expanded',String(value));
      sidebar.toggleAttribute('inert',enabled&&!value);
      if(enabled)sidebar.setAttribute('aria-hidden',String(!value));else sidebar.removeAttribute('aria-hidden');
      if(value)setTimeout(()=>closeButton.focus(),0);
      else if(returnFocus&&enabled)setTimeout(()=>toggle.focus(),0);
    }

    toggle.addEventListener('click',()=>setOpen(toggle.getAttribute('aria-expanded')!=='true'));
    closeButton.addEventListener('click',()=>setOpen(false));
    backdrop.addEventListener('click',()=>setOpen(false));
    sidebar.addEventListener('click',event=>{
      if(event.target.closest('[data-view]'))setTimeout(()=>{updateCurrent();setOpen(false)},0);
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&shell.classList.contains('sf-mobile-nav-open'))setOpen(false);
    });
    media.addEventListener?.('change',()=>setOpen(false,false));
    new MutationObserver(updateCurrent).observe(sidebar,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    updateCurrent();
    setOpen(false,false);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
