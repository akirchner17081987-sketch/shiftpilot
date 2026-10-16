// SchichtFunk – finaler Branding-Cleanup V2 (safe)
(function(){
  function run(){
    if(document.title.includes('ShiftPilot')) document.title=document.title.replace(/ShiftPilot/g,'SchichtFunk');
  }

  function ensureLegalLinks(){
    if(!document.getElementById('sfLegalLinksStyle')){
      const style=document.createElement('style');
      style.id='sfLegalLinksStyle';
      style.textContent=`
        .sf-legal-links{display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:11px;color:#7189a2}
        .sf-legal-links a{color:#91a8bd;text-decoration:none}
        .sf-legal-links a:hover,.sf-legal-links a:focus-visible{color:#5fe8d2;text-decoration:underline}
        .sidebar .sf-legal-links{margin:4px 10px 0;padding-top:10px;border-top:1px solid #17263a}
        .landing-footer .sf-legal-links{justify-content:center;margin-top:10px}
        @media(max-width:820px){.sidebar .sf-legal-links{display:none}}
      `;
      document.head.appendChild(style);
    }

    const landingFooter=document.querySelector('.landing-footer');
    if(landingFooter&&!landingFooter.querySelector('.sf-legal-links')){
      const nav=document.createElement('nav');
      nav.className='sf-legal-links';
      nav.setAttribute('aria-label','Rechtliche Informationen');
      nav.innerHTML='<a href="/impressum">Impressum</a><a href="/datenschutz">Datenschutz</a><a href="mailto:info@schichtfunk.de">Kontakt</a>';
      landingFooter.appendChild(nav);
    }

    const sideBottom=document.querySelector('.sidebar .side-bottom');
    if(sideBottom&&!sideBottom.querySelector('.sf-legal-links')){
      const nav=document.createElement('nav');
      nav.className='sf-legal-links';
      nav.setAttribute('aria-label','Rechtliche Informationen');
      nav.innerHTML='<a href="/impressum" target="_blank" rel="noopener">Impressum</a><a href="/datenschutz" target="_blank" rel="noopener">Datenschutz</a>';
      sideBottom.appendChild(nav);
    }
  }

  function loadTimeMonthPicker(){
    if([...document.scripts].some(s=>new URL(s.src,location.href).pathname.endsWith('/time-month-picker-v1.js')))return;
    const s=document.createElement('script');
    s.id='sfTimeMonthPickerScript';
    s.src='assets/time-month-picker-v1.js?v=20260929-customday1&billing=20261016-1';
    s.async=true;
    document.head.appendChild(s);
  }

  function init(){
    run();
    ensureLegalLinks();
    const observer=new MutationObserver(()=>{ensureLegalLinks()});
    observer.observe(document.documentElement,{childList:true,subtree:true});
    document.addEventListener('click',e=>{
      if(e.target.closest?.('[data-view="time"]'))setTimeout(()=>{if(window.SFBackend?.ready&&window.SFBackend.role!=='EMPLOYEE'){loadTimeMonthPicker()}},650);
    },true);
    setTimeout(()=>{ensureLegalLinks()},2800);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
