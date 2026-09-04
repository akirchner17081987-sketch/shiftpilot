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
        @media(max-width:980px){#view-time #sfTimeAccounts[data-datev-only-host="1"] .sf-datev-grid{grid-template-columns:1fr 1fr}}
        @media(max-width:620px){#view-time #sfTimeAccounts[data-datev-only-host="1"] .sf-datev-grid{grid-template-columns:1fr}}
      `;
      document.head.appendChild(style);
    }

    const grid=panel.querySelector('.sf-datev-grid');
    if(grid&&!document.getElementById('sfDatevMonthWrap')){
      const label=document.createElement('label');
      label.id='sfDatevMonthWrap';
      label.innerHTML='<span>Abrechnungsmonat</span><input id="sfTaMonth" type="month">';
      const input=label.querySelector('#sfTaMonth');
      input.value=initialDatevMonth();
      input.addEventListener('change',()=>input.dispatchEvent(new Event('input',{bubbles:true})));
      grid.insertBefore(label,grid.firstChild);
      if(sessionStorage.getItem('sf_demo_session_v1')==='active')input.dispatchEvent(new Event('change',{bubbles:true}));
    }
  }

  function loadDatev(){
    ensureDatevHost();
    if(document.getElementById('sfDatevLodasExportScript'))return;
    const s=document.createElement('script');
    s.id='sfDatevLodasExportScript';
    s.src='assets/datev-lodas-export-v1.js?v=20260903-lodas2';
    s.async=true;
    s.addEventListener('load',()=>{setTimeout(enhanceDatevPanel,50);setTimeout(enhanceDatevPanel,700)});
    document.head.appendChild(s);
  }

  function loadDatevSicDownload(){
    if(document.getElementById('sfDatevSicDownloadScript'))return;
    const s=document.createElement('script');
    s.id='sfDatevSicDownloadScript';
    s.src='assets/datev-sic-download-v1.js?v=20260903-sic1';
    s.async=true;
    document.head.appendChild(s);
  }

  function loadTimeMonthPicker(){
    if(document.getElementById('sfTimeMonthPickerScript'))return;
    const s=document.createElement('script');
    s.id='sfTimeMonthPickerScript';
    s.src='assets/time-month-picker-v1.js?v=20260903-month1';
    s.async=true;
    document.head.appendChild(s);
  }

  function init(){
    run();
    ensureDatevHost();
    loadDatevSicDownload();
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
