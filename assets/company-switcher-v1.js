// SchichtFunk – Unternehmensauswahl für aktive Teamzugehörigkeiten.
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  const key=()=>`sf_active_company_v1:${B.user?.id||''}`;
  const roles={OWNER:'Inhaber',ADMIN:'Administrator',DISPATCHER:'Disponent',PLANNER:'Planer',VIEWER:'Leser',TIME_TRACKING:'Nur Zeiterfassung'};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stored=()=>{try{return sessionStorage.getItem(key())}catch{return null}};
  const remember=id=>sessionStorage.setItem(key(),id);
  let opening=false,dialog=null,trigger=null;

  // The preference selects among server-verified memberships; it never grants access.
  B.pickCompanyMembership=rows=>{
    const active=(rows||[]).filter(x=>x.status==='ACTIVE').sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||'')));
    const selected=stored();
    const member=active.find(x=>x.company_id===selected)||active[0];
    if(member){
      // Unscoped browser legacy data must not be copied into another company.
      if(selected||active.length>1){B.hasLegacy=false;B.legacy={};}
      if(selected&&selected!==member.company_id)sessionStorage.removeItem(key());
    }
    return member;
  };
  async function memberships(){
    if(!B.ready||!B.client||!B.user||B.role==='EMPLOYEE')return [];
    const q=await B.client.from('company_members').select('company_id,role,status').eq('user_id',B.user.id).eq('status','ACTIVE');
    if(q.error)throw q.error;
    return (q.data||[]).filter(x=>x.status==='ACTIVE');
  }
  function close(){dialog?.remove();dialog=null;trigger?.setAttribute('aria-expanded','false');trigger?.focus();}
  B.switchCompany=async id=>{
    if(B.companySwitching)return false;
    B.companySwitching=true;
    try{
      const rows=await memberships();
      const member=rows.find(x=>x.company_id===id);
      if(!member)throw new Error('Für dieses Unternehmen besteht kein aktiver Zugang.');
      if(id===B.companyId){close();return false;}
      if(B.syncing||B.shiftModelSaving||B.employeeRemovalBusy||B.bootPromise||B.employeeBootPromise)throw new Error('Daten werden noch gespeichert oder geladen. Bitte versuche es gleich erneut.');
      B.showLoading?.('Unternehmen wird gewechselt …');
      if(B.syncTimer){clearTimeout(B.syncTimer);B.syncTimer=null;await B.sync?.();if(B.lastSyncError)throw B.lastSyncError;}
      remember(id);
      // Reload all modules and caches. Never change companyId while old requests run.
      sessionStorage.removeItem('sf_workspace_state_v2');
      sessionStorage.setItem('sf_active_view_v1','overview');
      B.ready=false;B.suppressSync=true;
      location.reload();
      return true;
    }catch(error){B.hideLoading?.();throw error;}
    finally{B.companySwitching=false;}
  };
  function styles(){
    if(document.getElementById('sfCompanySwitcherCss'))return;
    const s=document.createElement('style');s.id='sfCompanySwitcherCss';s.textContent=`
      button.company-card{width:calc(100% - 4px);text-align:left;color:var(--text);font:inherit;cursor:pointer;min-height:64px}
      button.company-card:hover{border-color:var(--teal);background:var(--panel)}
      button.company-card:disabled{cursor:default;opacity:1}
      .sf-company-shade{position:fixed;inset:0;z-index:21000;background:rgba(0,0,0,.38);display:flex;align-items:flex-start;padding:88px 22px 22px}
      .sf-company-menu{box-sizing:border-box;width:min(370px,100%);max-height:calc(100dvh - 110px);overflow:auto;border:1px solid var(--line,#294159);border-radius:14px;background:var(--panel,#0d1827);color:var(--text,#eef7ff);box-shadow:0 18px 60px rgba(0,0,0,.4);padding:16px}
      .sf-company-menu header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
      .sf-company-menu h2{font-size:17px;margin:0}.sf-company-menu button{min-height:44px}
      .sf-company-option{display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:transparent;border:1px solid var(--line,#294159);color:inherit;padding:12px;border-radius:10px;margin:8px 0;font:inherit;cursor:pointer}
      .sf-company-option[aria-current=true]{border-color:var(--teal);background:color-mix(in srgb,var(--teal) 10%,transparent)}
      .sf-company-option:hover{border-color:var(--teal)}.sf-company-option span{flex:1;min-width:0}.sf-company-option b{display:block;overflow-wrap:anywhere}.sf-company-option small{display:block;margin-top:4px;color:var(--muted)}
      .sf-company-note{color:var(--muted);line-height:1.5;font-size:12px;margin:12px 0 0}.sf-company-error{color:#ef7484;font-size:13px;line-height:1.5}
      @media(max-width:820px){#appShell.sf-mobile-nav-open .sidebar .company-card{display:grid}.sf-company-shade{padding:70px 14px 14px}}
    `;document.head.appendChild(s);
  }
  async function open(){
    if(opening||!B.ready||B.role==='EMPLOYEE')return;
    if(dialog){close();return;}
    opening=true;styles();
    dialog=document.createElement('div');dialog.className='sf-company-shade';dialog.id='sfCompanySwitcher';
    dialog.innerHTML='<section class="sf-company-menu" role="dialog" aria-modal="true" aria-labelledby="sfCompanySwitcherTitle"><header><h2 id="sfCompanySwitcherTitle">Unternehmen wechseln</h2><button type="button" class="ghost" aria-label="Unternehmensauswahl schließen">×</button></header><div class="sf-company-list" aria-live="polite">Unternehmen werden geladen …</div><p class="sf-company-error" role="alert"></p></section>';
    const currentDialog=dialog;document.body.appendChild(dialog);trigger?.setAttribute('aria-expanded','true');
    dialog.querySelector('header button').onclick=close;
    dialog.onclick=e=>{if(e.target===currentDialog)close();};
    dialog.querySelector('header button').focus();
    try{
      const rows=await memberships();
      const options=await Promise.all(rows.map(async member=>{
        const q=member.role==='TIME_TRACKING'
          ?await B.client.rpc('time_access_context',{p_company_id:member.company_id})
          :await B.client.from('companies').select('id,name').eq('id',member.company_id).single();
        if(q.error)throw q.error;
        const co=typeof q.data==='string'?JSON.parse(q.data):q.data;
        return {...member,name:co?.name||'Unternehmen'};
      }));
      if(dialog!==currentDialog)return;
      const list=dialog.querySelector('.sf-company-list');
      list.innerHTML=options.map(o=>`<button type="button" class="sf-company-option" data-company="${esc(o.company_id)}" aria-current="${o.company_id===B.companyId}"><span><b>${esc(o.name)}</b><small>${esc(roles[o.role]||o.role)}</small></span>${o.company_id===B.companyId?'✓':''}</button>`).join('')||'<p class="sf-company-note">Kein aktiver Unternehmenszugang gefunden.</p>';
      if(options.length<2)list.insertAdjacentHTML('beforeend','<p class="sf-company-note">Weitere Unternehmen erscheinen hier, sobald dein Zugang dafür freigeschaltet ist.</p>');
      list.querySelectorAll('[data-company]').forEach(button=>button.onclick=async()=>{
        list.querySelectorAll('button').forEach(b=>b.disabled=true);
        try{await B.switchCompany(button.dataset.company);}
        catch(error){if(dialog===currentDialog){dialog.querySelector('.sf-company-error').textContent=error.message||'Unternehmen konnte nicht gewechselt werden.';list.querySelectorAll('button').forEach(b=>b.disabled=false);}}
      });
      list.querySelector('[aria-current="true"]')?.focus();
    }catch(error){if(dialog===currentDialog){dialog.querySelector('.sf-company-list').textContent='';dialog.querySelector('.sf-company-error').textContent=error.message||'Unternehmen konnten nicht geladen werden.';}}
    finally{opening=false;}
  }
  function bind(){
    trigger=document.querySelector('button.company-card');if(!trigger)return;
    trigger.onclick=open;trigger.disabled=!B.ready||B.role==='EMPLOYEE';
    trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls','sfCompanySwitcher');
    if(!dialog)trigger.setAttribute('aria-expanded','false');
    trigger.setAttribute('aria-label',`Unternehmen wechseln – ${trigger.querySelector('b')?.textContent||'SchichtFunk'}`);
    const icon=trigger.querySelector('.company-icon'),name=trigger.querySelector('b')?.textContent;
    if(icon&&B.ready&&name)icon.textContent=name.trim().slice(0,1).toUpperCase();
  }
  const update=B.updateState;B.updateState=function(){const result=update?.apply(this,arguments);if(!B.ready&&dialog)close();bind();return result;};
  document.addEventListener('keydown',e=>{
    if(!dialog)return;
    if(e.key==='Escape'){e.preventDefault();close();}
    if(e.key==='Tab'){
      const buttons=[...dialog.querySelectorAll('button:not(:disabled)')];const first=buttons[0],last=buttons.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }
  });
  styles();bind();
})();
