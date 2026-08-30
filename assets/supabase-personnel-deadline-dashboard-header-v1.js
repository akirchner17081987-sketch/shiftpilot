// SchichtFunk – Fristen-Dashboard global in den Mitarbeiter-Seitenkopf verschieben V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__personnelDeadlineDashboardHeaderV1)return;B.__personnelDeadlineDashboardHeaderV1=true;
  const ADMIN=new Set(['OWNER','ADMIN']);

  function findAddEmployeeButton(view){
    return Array.from(view.querySelectorAll('button')).find(b=>/Mitarbeiter\s+anlegen/i.test((b.textContent||'').trim()))||null;
  }

  function move(){
    if(!ADMIN.has(B.role))return;
    const view=document.getElementById('view-employees');
    const dashboard=document.getElementById('sfDeadlineDashboardOpen');
    if(!view||!dashboard)return;
    const add=findAddEmployeeButton(view);
    if(!add||!add.parentElement)return;

    const parent=add.parentElement;
    if(dashboard.parentElement!==parent||dashboard.nextElementSibling!==add){
      parent.insertBefore(dashboard,add);
    }
    dashboard.textContent='⏱ Fristen-Dashboard';
    dashboard.title='Fristen-Dashboard über alle Mitarbeiter öffnen';
    dashboard.classList.add('sf-pfd-global');
  }

  function css(){
    if(document.getElementById('sfPfdHeaderCss'))return;
    const s=document.createElement('style');s.id='sfPfdHeaderCss';s.textContent=`
      #view-employees #sfDeadlineDashboardOpen.sf-pfd-global{margin-right:10px;white-space:nowrap;align-self:center}
      @media(max-width:760px){#view-employees #sfDeadlineDashboardOpen.sf-pfd-global{margin-right:6px}}
    `;document.head.appendChild(s)
  }

  css();
  document.addEventListener('click',e=>{
    if(e.target?.closest?.('[data-view="employees"],#nav-employees,.nav-item'))setTimeout(move,120);
  },true);
  setInterval(move,700);
  setTimeout(move,500);
  setTimeout(move,1500);
})();
