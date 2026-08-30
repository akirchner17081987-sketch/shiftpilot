// SchichtFunk – vertikales, logisch gepaartes Mitarbeiterportal V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__employeePortalVerticalLayoutV1)return;B.__employeePortalVerticalLayoutV1=true;
  const sections={
    'Meine Schichten':['shifts',10],
    'Arbeitszeit':['time',20],
    'Schichtänderungen':['changes',30],
    'Schichttausch':['swaps',40],
    'Abwesenheiten':['absences',50],
    'Stundenkonto':['account',60],
    'Mein Profil':['profile',70]
  };
  function css(){
    if(document.getElementById('sfEmployeePortalVerticalLayoutV1'))return;
    const s=document.createElement('style');s.id='sfEmployeePortalVerticalLayoutV1';s.textContent=`
      #sfEmployeePortal .sf-portal-main{max-width:1380px;padding:30px 34px 46px}
      #sfEmployeePortal .sf-portal-welcome{max-width:780px}
      #sfEmployeePortal .sf-portal-stats{grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:20px 0 16px}
      #sfEmployeePortal .sf-portal-grid{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        grid-auto-flow:row;
        align-items:start;
        gap:16px;
      }
      #sfEmployeePortal .sf-portal-grid>.sf-portal-layout-source{display:contents!important}
      #sfEmployeePortal .sf-portal-card{
        min-width:0;
        height:auto!important;
        align-self:start;
        padding:18px;
        border-radius:14px;
      }
      #sfEmployeePortal .sf-portal-card[data-sf-portal-section="shifts"]{order:10}
      #sfEmployeePortal .sf-portal-card[data-sf-portal-section="time"]{order:20}
      #sfEmployeePortal .sf-portal-card[data-sf-portal-section="changes"]{order:30}
      #sfEmployeePortal .sf-portal-card[data-sf-portal-section="swaps"]{order:40}
      #sfEmployeePortal .sf-portal-card[data-sf-portal-section="absences"]{order:50}
      #sfEmployeePortal .sf-portal-card[data-sf-portal-section="account"]{order:60}
      #sfEmployeePortal .sf-portal-card[data-sf-portal-section="profile"]{order:70;grid-column:1/-1}
      #sfEmployeePortal .sf-portal-card h3{font-size:16px;margin-bottom:14px}
      #sfEmployeePortal .sf-profile-list{grid-template-columns:repeat(3,minmax(0,1fr))}
      @media(max-width:980px){
        #sfEmployeePortal .sf-portal-main{padding:24px 20px 38px}
        #sfEmployeePortal .sf-portal-grid{grid-template-columns:1fr}
        #sfEmployeePortal .sf-portal-card[data-sf-portal-section="profile"]{grid-column:auto}
        #sfEmployeePortal .sf-profile-list{grid-template-columns:repeat(2,minmax(0,1fr))}
      }
      @media(max-width:640px){
        #sfEmployeePortal .sf-portal-main{padding:18px 14px 32px}
        #sfEmployeePortal .sf-portal-stats{grid-template-columns:1fr}
        #sfEmployeePortal .sf-profile-list{grid-template-columns:1fr}
      }
    `;document.head.appendChild(s);
  }
  function arrange(){
    const portal=document.getElementById('sfEmployeePortal');if(!portal)return false;css();
    const grid=portal.querySelector('.sf-portal-grid');if(!grid)return false;
    const source=[...grid.children].find(x=>x.matches('div[style*="display:grid"]'));
    source?.classList.add('sf-portal-layout-source');
    portal.querySelectorAll('.sf-portal-card').forEach(card=>{
      const title=card.querySelector('h3')?.textContent.trim(),meta=sections[title];
      if(meta){card.dataset.sfPortalSection=meta[0];card.style.order=String(meta[1])}
    });
    portal.dataset.sfVerticalLayout='1';return true;
  }
  const old=B.openEmployeePortal;
  if(typeof old==='function')B.openEmployeePortal=function(){const r=old.apply(this,arguments);setTimeout(arrange,0);setTimeout(arrange,180);setTimeout(arrange,700);return r};
  let queued=false;const observer=new MutationObserver(()=>{if(queued||!document.getElementById('sfEmployeePortal'))return;queued=true;requestAnimationFrame(()=>{queued=false;arrange()})});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(arrange,0);setTimeout(arrange,600);
})();

