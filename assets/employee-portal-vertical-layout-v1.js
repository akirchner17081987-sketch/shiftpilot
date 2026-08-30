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
      #sfEmployeePortal{overflow-anchor:none}
      #sfEmployeePortal .sf-portal-logo{
        width:188px;height:48px;border-radius:0;background:transparent;color:inherit;
        display:flex;align-items:center;justify-content:flex-start;overflow:visible;
      }
      #sfEmployeePortal .sf-portal-logo img{display:block;width:180px;max-width:100%;height:46px;object-fit:contain;object-position:left center}
      #sfEmployeePortal .sf-portal-brand b{display:none}
      #sfEmployeePortal .sf-portal-welcome{max-width:780px}
      #sfEmployeePortal .sf-portal-stats{grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:20px 0 16px}
      #sfEmployeePortal .sf-portal-grid{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        grid-auto-flow:row;
        align-items:start;
        gap:16px;
      }
      #sfEmployeePortal.sf-portal-layout-pending .sf-portal-grid{visibility:hidden;opacity:0}
      #sfEmployeePortal .sf-portal-grid{transition:opacity .16s ease}
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
      #sfEmployeePortal .sf-portal-card[data-sf-portal-section="absences"]{order:50;grid-column:2}
      #sfEmployeePortal .sf-portal-card[data-sf-portal-section="account"]{order:60;grid-column:2}
      #sfEmployeePortal .sf-portal-card[data-sf-portal-section="profile"]{order:70;grid-column:1/-1}
      #sfEmployeePortal .sf-portal-card h3{font-size:16px;margin-bottom:14px}
      #sfEmployeePortal .sf-profile-list{grid-template-columns:repeat(3,minmax(0,1fr))}
      @media(max-width:980px){
        #sfEmployeePortal .sf-portal-main{padding:24px 20px 38px}
        #sfEmployeePortal .sf-portal-grid{grid-template-columns:1fr}
        #sfEmployeePortal .sf-portal-card[data-sf-portal-section="absences"],
        #sfEmployeePortal .sf-portal-card[data-sf-portal-section="account"]{grid-column:auto}
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
    const logo=portal.querySelector('.sf-portal-logo');
    if(logo&&!logo.querySelector('img'))logo.innerHTML='<img src="assets/schichtfunk-logo.svg" alt="SchichtFunk">';
    const grid=portal.querySelector('.sf-portal-grid');if(!grid)return false;
    const source=[...grid.children].find(x=>x.matches('div[style*="display:grid"]'));
    source?.classList.add('sf-portal-layout-source');
    portal.querySelectorAll('.sf-portal-card').forEach(card=>{
      const title=card.querySelector('h3')?.textContent.trim(),meta=sections[title];
      if(meta){card.dataset.sfPortalSection=meta[0];card.style.order=String(meta[1])}
    });
    portal.dataset.sfVerticalLayout='1';return true;
  }
  function dataSignature(){
    const d=B.employeePortalData||{},pick=list=>(list||[]).map(x=>[x.id,x.updated_at,x.status,x.published_at]);
    try{return JSON.stringify([d.employee?.id,d.employee?.updated_at,pick(d.shifts),pick(d.absences),pick(d.requests),pick(d.approvals),pick(d.timeEntries),pick(d.templates)])}catch{return String(Date.now())}
  }
  const old=B.openEmployeePortal;
  if(typeof old==='function')B.openEmployeePortal=function(){
    const existing=document.getElementById('sfEmployeePortal'),signature=dataSignature();
    if(existing?.dataset.sfRenderSignature===signature){arrange();return existing}
    const portalScroll=existing?existing.scrollTop:0;
    const r=old.apply(this,arguments);
    const portal=document.getElementById('sfEmployeePortal');
    if(portal){portal.dataset.sfRenderSignature=signature;portal.classList.add('sf-portal-layout-pending')}
    const finish=()=>{arrange();const current=document.getElementById('sfEmployeePortal');if(existing&&current&&portalScroll>0&&Math.abs(current.scrollTop-portalScroll)>1)current.scrollTop=portalScroll};
    requestAnimationFrame(finish);setTimeout(finish,180);setTimeout(()=>{finish();document.getElementById('sfEmployeePortal')?.classList.remove('sf-portal-layout-pending')},700);return r
  };
  let queued=false;const observer=new MutationObserver(()=>{if(queued||!document.getElementById('sfEmployeePortal'))return;queued=true;requestAnimationFrame(()=>{queued=false;arrange()})});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(arrange,0);setTimeout(arrange,600);
})();

