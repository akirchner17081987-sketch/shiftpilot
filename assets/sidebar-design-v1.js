// SchichtFunk – verfeinerte Hauptnavigation
(function(){
  if(window.__sfSidebarDesignV1)return;window.__sfSidebarDesignV1=true;
  const labels={overview:'Übersicht',schedule:'Dienstplan',employees:'Mitarbeiter',time:'Zeiterfassung',absence:'Abwesenheiten',auto:'Auto-Planung',reports:'Auswertungen',settings:'Einstellungen'};
  const css=`
  .sidebar{position:relative;isolation:isolate;padding:18px 14px 16px;background:#07121e!important;background-image:none!important;border-right:1px solid #183149;box-shadow:14px 0 42px rgba(0,0,0,.14)}
  .sidebar:after{content:none!important;display:none!important}
  .brand.home-link{min-height:58px;margin:0 3px 13px;padding:0 8px 12px!important;border-bottom:1px solid rgba(94,143,173,.13)}
  .brand.home-link .app-brand-img{width:178px!important;max-height:55px!important;filter:drop-shadow(0 5px 16px rgba(30,219,201,.10));transition:filter .2s ease,transform .2s ease}
  .brand.home-link:hover .app-brand-img{filter:drop-shadow(0 6px 19px rgba(35,224,203,.22));transform:translateY(-1px)}
  .company-card{position:relative;margin:0 1px 20px;padding:12px;border:1px solid #213c55;border-radius:13px;background:linear-gradient(145deg,rgba(17,35,52,.96),rgba(10,24,38,.96));grid-template-columns:38px minmax(0,1fr) 20px;gap:10px;box-shadow:0 10px 24px rgba(0,0,0,.16),inset 0 1px rgba(255,255,255,.025);transition:border-color .2s ease,transform .2s ease}
  .company-card:hover{border-color:#2c5a70;transform:translateY(-1px)}
  .company-icon{width:38px;height:38px;border-radius:11px;background:linear-gradient(145deg,#35e0c3,#18bca2);box-shadow:0 7px 16px rgba(30,205,177,.18);font-size:14px}
  .company-card b{display:block;overflow:hidden;text-overflow:ellipsis;font-size:13px;line-height:1.35;color:#f2f8ff}
  .company-card small{font-size:10px;letter-spacing:.025em;color:#7f9bb3}
  .company-card>span:last-child{width:20px;height:20px;display:grid;place-items:center;border-radius:6px;color:#75e8d3;background:rgba(42,211,184,.07);font-size:12px}
  #nav{gap:5px}
  #nav:before,.side-bottom:before{content:"NAVIGATION";display:block;padding:0 10px 7px;color:#526d85;font-size:9px;font-weight:800;letter-spacing:.16em}
  .nav button{position:relative;min-height:43px;padding:7px 10px;border:1px solid transparent;border-radius:10px;gap:10px;color:#91abc2;transition:color .16s ease,background .16s ease,border-color .16s ease,transform .16s ease}
  .nav button>span:first-child{width:28px;height:28px;flex:0 0 28px;display:grid;place-items:center;border:1px solid transparent;border-radius:8px;background:rgba(52,83,108,.10);color:#71a8d7;font-size:14px;transition:all .16s ease}
  .nav button>span:nth-child(2){font-size:13px;font-weight:570;letter-spacing:.005em}
  .nav button:hover{color:#e8f6ff;background:rgba(20,46,67,.72);border-color:rgba(47,84,111,.42);transform:translateX(2px)}
  .nav button:hover>span:first-child{color:#72ead4;background:rgba(35,211,182,.08);border-color:rgba(42,214,186,.16)}
  .nav button.active{color:#f1fffc;background:linear-gradient(90deg,rgba(23,74,75,.88),rgba(18,46,67,.94));border-color:rgba(50,214,187,.24);box-shadow:inset 3px 0 #35dfc0,0 8px 20px rgba(0,0,0,.13);transform:none}
  .nav button.active:after{content:"";position:absolute;right:11px;width:5px;height:5px;border-radius:50%;background:#45e5c7;box-shadow:0 0 10px #35dfc0}
  .nav button.active>span:first-child{color:#071d1a;background:linear-gradient(145deg,#44e6c8,#22c7a9);border-color:#4be8cc;box-shadow:0 5px 14px rgba(34,205,175,.20)}
  .nav .badge{position:absolute;right:10px;min-width:19px;padding:2px 6px;text-align:center;background:#e95d6e;border:2px solid #0c1b29;box-shadow:0 4px 10px rgba(233,93,110,.2)}
  .nav button.active .badge{right:23px}
  .side-bottom{margin-top:auto;padding-top:12px;border-top:1px solid rgba(74,112,142,.18)}
  .side-bottom:before{content:"KONTO";padding-top:1px}
  .side-bottom .nav{margin-bottom:7px}
  .user-row{position:relative;padding:10px;border:1px solid #1c344b;border-radius:11px;background:rgba(12,27,42,.72);transition:border-color .18s ease,background .18s ease}
  .user-row:hover{border-color:#294b65;background:#0f2133}
  .user-row .avatar{width:35px;height:35px;flex:0 0 35px;background:linear-gradient(145deg,#294968,#1b344d);border:1px solid #365a79;color:#dff4ff}
  .user-row b{display:block;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:#eaf4fc}
  .user-row small{font-size:10px;color:#718da5}
  @media(max-width:1100px){.brand.home-link .app-brand-img{width:158px!important}.nav button{padding-left:8px;padding-right:8px}.company-card{grid-template-columns:35px minmax(0,1fr) 18px}.company-icon{width:35px;height:35px}}
  @media(max-width:700px){#nav:before,.side-bottom:before{display:none}.sidebar{padding:12px 7px}.brand.home-link{min-height:48px;padding:0 1px 10px!important}.brand.home-link .app-brand-img{width:48px!important;height:46px!important;object-fit:cover!important;object-position:left!important}.nav button{justify-content:center;padding:7px}.nav button>span:first-child{width:32px;height:32px;flex-basis:32px}.nav button.active:after{right:5px}.user-row{padding:7px;justify-content:center}}
  `;
  function enhance(){
    if(!document.getElementById('sfSidebarDesignV1')){const style=document.createElement('style');style.id='sfSidebarDesignV1';style.textContent=css;document.head.appendChild(style)}
    document.querySelectorAll('.sidebar [data-view]').forEach(button=>{const label=labels[button.dataset.view];if(label){button.title=label;button.setAttribute('aria-label',label)}});
    const company=document.querySelector('.sidebar .company-card');if(company){company.setAttribute('role','group');company.setAttribute('aria-label','Aktives Unternehmen')}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance,{once:true});else enhance();
})();
