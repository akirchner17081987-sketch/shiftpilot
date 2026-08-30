// SchichtFunk – globale Mitarbeiter-Headeraktionen V2
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__personnelDeadlineHeaderStyleV2)return;B.__personnelDeadlineHeaderStyleV2=true;
  const ADMIN=new Set(['OWNER','ADMIN']);
  let badgeBusy=false,lastBadgeAt=0;

  function css(){
    if(document.getElementById('sfEmployeeHeaderActionsV2Css'))return;
    const s=document.createElement('style');s.id='sfEmployeeHeaderActionsV2Css';s.textContent=`
      #view-employees .sf-employees-header-actions-v2{display:flex;align-items:center;justify-content:flex-end;gap:11px;margin-left:auto;width:max-content;max-width:100%;flex-wrap:nowrap}
      #view-employees .sf-employees-header-actions-v2 #sfDeadlineDashboardOpen{height:44px!important;min-width:178px;padding:0 17px!important;margin:0!important;display:inline-flex!important;align-items:center;justify-content:center;gap:8px;border-radius:11px!important;border:1px solid #345873!important;background:linear-gradient(180deg,#12283a,#0e2131)!important;color:#d9ebf7!important;font-size:12px!important;font-weight:850!important;line-height:1!important;white-space:nowrap;box-shadow:0 5px 16px rgba(0,0,0,.12);transition:border-color .16s ease,background .16s ease,transform .16s ease,box-shadow .16s ease}
      #view-employees .sf-employees-header-actions-v2 #sfDeadlineDashboardOpen:hover{border-color:#2bd8b6!important;background:linear-gradient(180deg,#153448,#102b39)!important;color:#effcff!important;transform:translateY(-1px);box-shadow:0 8px 20px rgba(0,0,0,.17)}
      #view-employees .sf-employees-header-actions-v2 #sfDeadlineDashboardOpen[data-alert-count]:not([data-alert-count=""])::after{content:attr(data-alert-count);display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 5px;margin-left:1px;border-radius:999px;background:#f0a24a;color:#17100a;font-size:9px;font-weight:950;line-height:1;box-shadow:0 0 0 2px rgba(240,162,74,.12)}
      #view-employees .sf-employees-header-actions-v2 .sf-employee-add-primary-v2{height:44px!important;min-width:181px;padding:0 19px!important;margin:0!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;border-radius:11px!important;font-size:12px!important;font-weight:900!important;line-height:1!important;white-space:nowrap;box-shadow:0 7px 19px rgba(43,216,182,.12);transition:transform .16s ease,box-shadow .16s ease,filter .16s ease}
      #view-employees .sf-employees-header-actions-v2 .sf-employee-add-primary-v2:hover{transform:translateY(-1px);box-shadow:0 10px 24px rgba(43,216,182,.18);filter:brightness(1.03)}
      @media(max-width:900px){#view-employees .sf-employees-header-actions-v2{gap:8px;flex-wrap:wrap}#view-employees .sf-employees-header-actions-v2 #sfDeadlineDashboardOpen,#view-employees .sf-employees-header-actions-v2 .sf-employee-add-primary-v2{height:42px!important;min-width:165px}}
      @media(max-width:620px){#view-employees .sf-employees-header-actions-v2{width:100%;justify-content:flex-start;margin-left:0}#view-employees .sf-employees-header-actions-v2 #sfDeadlineDashboardOpen,#view-employees .sf-employees-header-actions-v2 .sf-employee-add-primary-v2{flex:1 1 165px;min-width:0}}
    `;document.head.appendChild(s)
  }

  function findAdd(view){
    return Array.from(view.querySelectorAll('button')).find(b=>/Mitarbeiter\s+anlegen/i.test((b.textContent||'').trim()))||null;
  }

  function arrange(){
    if(!ADMIN.has(B.role))return;
    css();
    const view=document.getElementById('view-employees');
    const dashboard=document.getElementById('sfDeadlineDashboardOpen');
    if(!view||!dashboard)return;
    const add=findAdd(view);if(!add)return;

    let group=document.getElementById('sfEmployeeHeaderActionsV2');
    if(!group){
      const parent=add.parentElement;if(!parent)return;
      group=document.createElement('div');group.id='sfEmployeeHeaderActionsV2';group.className='sf-employees-header-actions-v2';
      parent.insertBefore(group,add);
    }
    if(dashboard.parentElement!==group)group.appendChild(dashboard);
    if(add.parentElement!==group)group.appendChild(add);
    else if(dashboard.nextElementSibling!==add)group.appendChild(add);

    dashboard.classList.add('sf-pfd-global');
    dashboard.title='Fristen-Dashboard über alle Mitarbeiter öffnen';
    add.classList.add('sf-employee-add-primary-v2');
  }

  async function refreshBadge(force){
    if(!ADMIN.has(B.role)||badgeBusy||!B.client||!B.companyId)return;
    const now=Date.now();if(!force&&now-lastBadgeAt<240000)return;
    badgeBusy=true;
    try{
      const q=await B.client.rpc('manager_personnel_deadline_dashboard',{p_company_id:B.companyId});
      if(q.error)throw q.error;
      const d=typeof q.data==='string'?JSON.parse(q.data):q.data;
      const st=d?.stats||{};
      const count=Number(st.expired||0)+Number(st.d30||0)+Number(st.d60||0)+Number(st.d90||0);
      const btn=document.getElementById('sfDeadlineDashboardOpen');
      if(btn){btn.dataset.alertCount=count>0?String(count):'';btn.setAttribute('aria-label',count>0?`Fristen-Dashboard öffnen, ${count} Fristen mit Handlungsbedarf`:'Fristen-Dashboard öffnen')}
      lastBadgeAt=Date.now();
    }catch(e){console.warn('Fristen-Dashboard Warnzähler konnte nicht aktualisiert werden',e)}finally{badgeBusy=false}
  }

  document.addEventListener('visibilitychange',()=>{if(!document.hidden){setTimeout(arrange,80);refreshBadge(true)}});
  document.addEventListener('click',e=>{if(e.target?.closest?.('[data-view="employees"],#nav-employees,.nav-item')){setTimeout(arrange,120);setTimeout(()=>refreshBadge(false),250)}},true);
  setInterval(arrange,900);
  setInterval(()=>refreshBadge(false),300000);
  setTimeout(arrange,500);setTimeout(arrange,1500);setTimeout(()=>refreshBadge(true),1800);
})();
