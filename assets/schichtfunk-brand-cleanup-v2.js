// SchichtFunk – finaler Branding-Cleanup V2 (safe)
(function(){
  function run(){
    if(document.title.includes('ShiftPilot')) document.title=document.title.replace(/ShiftPilot/g,'SchichtFunk');
  }

  function currentMonth(){
    const d=new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }

  function initialDatevMonth(){
    return sessionStorage.getItem('sf_demo_session_v1')==='active'?'2026-08':currentMonth();
  }

  function ensureDatevHost(){
    const view=document.getElementById('view-time');
    if(!view)return null;
    let host=document.getElementById('sfTimeAccounts');
    if(!host){
      host=document.createElement('section');
      host.id='sfTimeAccounts';
      host.dataset.datevOnlyHost='1';
      host.style.display='none';
      host.style.marginTop='14px';
      const stats=document.getElementById('timeStats');
      if(stats?.parentElement===view) stats.insertAdjacentElement('afterend',host);
      else view.appendChild(host);
    }
    return host;
  }

  function arrangeManagerTabs(host,panel){
    if(!host?.closest('#view-reports'))return;
    let tabs=host.querySelector(':scope > .sf-ta-tabs');
    let account=host.querySelector(':scope > .sf-ta-account-pane');
    let datev=host.querySelector(':scope > .sf-ta-datev-pane');
    if(!tabs){
      tabs=document.createElement('div');
      tabs.className='sf-ta-tabs';
      tabs.setAttribute('role','tablist');
      tabs.setAttribute('aria-label','Bereich auswählen');
      tabs.innerHTML='<button type="button" role="tab" data-sf-ta-tab="account">Stundenkonto</button><button type="button" role="tab" data-sf-ta-tab="datev">DATEV</button>';
      host.prepend(tabs);
    }
    if(!account){account=document.createElement('div');account.className='sf-ta-account-pane';account.id='sfTaAccountPane';host.insertBefore(account,tabs.nextSibling)}
    if(!datev){datev=document.createElement('div');datev.className='sf-ta-datev-pane';datev.id='sfTaDatevPane';host.appendChild(datev)}
    [...host.children].filter(node=>![tabs,account,datev].includes(node)).forEach(node=>account.appendChild(node));
    if(panel.parentElement!==datev)datev.appendChild(panel);
    const activate=name=>{
      const selected=name==='datev'?'datev':'account';
      host.dataset.activeTimeAccountTab=selected;
      account.hidden=selected!=='account';datev.hidden=selected!=='datev';
      tabs.querySelectorAll('[data-sf-ta-tab]').forEach(button=>{const active=button.dataset.sfTaTab===selected;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1});
    };
    tabs.querySelectorAll('[data-sf-ta-tab]').forEach(button=>{if(button.dataset.sfTaBound)return;button.dataset.sfTaBound='1';button.addEventListener('click',()=>activate(button.dataset.sfTaTab))});
    activate(host.dataset.activeTimeAccountTab||'account');
  }

  function enhanceDatevPanel(){
    const host=ensureDatevHost();
    const panel=document.getElementById('sfDatevPanel');
    if(!host||!panel)return;
    host.style.display='block';

    if(!document.getElementById('sfDatevHostStyle')){
      const style=document.createElement('style');
      style.id='sfDatevHostStyle';
      style.textContent=`
        #view-time #sfTimeAccounts[data-datev-only-host="1"]{display:block!important;margin-top:14px}
        #view-time #sfTimeAccounts[data-datev-only-host="1"] .sf-datev-grid{grid-template-columns:155px 155px 155px minmax(220px,1fr)}
        #view-reports #sfTimeAccounts>.sf-ta-tabs{display:flex;gap:5px;margin:-2px 0 14px;padding:4px;border:1px solid #29445a;border-radius:11px;background:#081624;width:max-content;max-width:100%}
        #view-reports #sfTimeAccounts>.sf-ta-tabs button{min-height:36px;padding:0 16px;border:0;border-radius:8px;background:transparent;color:#8ca4b8;font:800 11px Inter,system-ui,sans-serif;cursor:pointer}
        #view-reports #sfTimeAccounts>.sf-ta-tabs button[aria-selected="true"]{background:#153d37;color:#8cebd5;box-shadow:inset 0 0 0 1px #2c7566}
        #view-reports #sfTimeAccounts>.sf-ta-account-pane[hidden],#view-reports #sfTimeAccounts>.sf-ta-datev-pane[hidden]{display:none!important}
        #view-reports #sfTimeAccounts>.sf-ta-datev-pane>.sf-datev{margin:0}
        @media(max-width:980px){#view-time #sfTimeAccounts[data-datev-only-host="1"] .sf-datev-grid{grid-template-columns:1fr 1fr}}
        @media(max-width:620px){#view-time #sfTimeAccounts[data-datev-only-host="1"] .sf-datev-grid{grid-template-columns:1fr}#view-reports #sfTimeAccounts>.sf-ta-tabs{width:100%}#view-reports #sfTimeAccounts>.sf-ta-tabs button{flex:1;padding:0 10px}}
      `;
      document.head.appendChild(style);
    }

    const grid=panel.querySelector('.sf-datev-grid');
    if(grid&&!document.getElementById('sfDatevMonthWrap')){
      const label=document.createElement('label');
      label.id='sfDatevMonthWrap';
      label.innerHTML='<span>Abrechnungsmonat</span><input id="sfDatevMonth" type="month">';
      const input=label.querySelector('#sfDatevMonth');
      input.value=initialDatevMonth();
      input.addEventListener('change',()=>input.dispatchEvent(new Event('input',{bubbles:true})));
      grid.insertBefore(label,grid.firstChild);
      if(sessionStorage.getItem('sf_demo_session_v1')==='active')input.dispatchEvent(new Event('change',{bubbles:true}));
    }
    arrangeManagerTabs(host,panel);
  }

  function loadDatev(){
    ensureDatevHost();
    if(document.getElementById('sfDatevLodasExportScript'))return;
    const s=document.createElement('script');
    s.id='sfDatevLodasExportScript';
    s.src='assets/datev-lodas-export-v1.js?v=20260906-lodas94';
    s.async=true;
    s.addEventListener('load',()=>{setTimeout(enhanceDatevPanel,50);setTimeout(enhanceDatevPanel,700)});
    document.head.appendChild(s);
  }

  function loadTimeMonthPicker(){
    if(document.getElementById('sfTimeMonthPickerScript'))return;
    const s=document.createElement('script');
    s.id='sfTimeMonthPickerScript';
    s.src='assets/time-month-picker-v1.js?v=20260912-monthfix2';
    s.async=true;
    document.head.appendChild(s);
  }

  function init(){
    run();
    ensureDatevHost();
    loadDatev();
    loadTimeMonthPicker();
    const observer=new MutationObserver(()=>enhanceDatevPanel());
    observer.observe(document.documentElement,{childList:true,subtree:true});
    document.addEventListener('click',e=>{
      if(e.target.closest?.('[data-view="time"]'))setTimeout(()=>{ensureDatevHost();enhanceDatevPanel()},650);
    },true);
    setTimeout(()=>{ensureDatevHost();enhanceDatevPanel()},2800);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
