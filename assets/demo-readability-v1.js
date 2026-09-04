// SchichtFunk – präsentationsfreundliche Lesbarkeit im Demo-Modus V1
(function(){
  if(window.__sfDemoReadabilityV1)return;
  if(sessionStorage.getItem('sf_demo_session_v1')!=='active')return;
  window.__sfDemoReadabilityV1=true;

  const style=document.createElement('style');
  style.id='sfDemoReadabilityV1Css';
  style.textContent=`
    html[data-sf-demo="1"]{--sidebar:252px}
    html[data-sf-demo="1"] #appShell .main{padding:30px clamp(24px,2.4vw,46px) 48px;font-size:16px;line-height:1.48}
    html[data-sf-demo="1"] #appShell .content{width:100%;max-width:1720px}
    html[data-sf-demo="1"] #appShell .sidebar{padding-left:16px;padding-right:16px}
    html[data-sf-demo="1"] #appShell .nav button{min-height:43px;padding:12px 13px;font-size:13.5px;line-height:1.25}
    html[data-sf-demo="1"] #appShell .nav-group-label{font-size:10px;line-height:1.35}
    html[data-sf-demo="1"] #appShell .company-card b{font-size:14px;line-height:1.3}
    html[data-sf-demo="1"] #appShell .company-card small,
    html[data-sf-demo="1"] #appShell .user-row small{font-size:11.5px;line-height:1.4}
    html[data-sf-demo="1"] #appShell .page-head{margin-bottom:20px}
    html[data-sf-demo="1"] #appShell .page-head h1{font-size:32px;line-height:1.15;letter-spacing:-.02em}
    html[data-sf-demo="1"] #appShell .page-head p{max-width:840px;font-size:14px;line-height:1.55}
    html[data-sf-demo="1"] #appShell .eyebrow{font-size:12px;line-height:1.35}
    html[data-sf-demo="1"] #appShell .stat{min-height:104px;padding:17px}
    html[data-sf-demo="1"] #appShell .stat small{font-size:12px!important;line-height:1.35}
    html[data-sf-demo="1"] #appShell .stat strong{font-size:25px}
    html[data-sf-demo="1"] #appShell .stat em{font-size:11.5px;line-height:1.4}
    html[data-sf-demo="1"] #appShell .card h3,
    html[data-sf-demo="1"] #appShell .table-head h3{font-size:16px;line-height:1.3}
    html[data-sf-demo="1"] #appShell .main small{font-size:11px!important;line-height:1.5!important}
    html[data-sf-demo="1"] #appShell .main button,
    html[data-sf-demo="1"] #appShell .main input,
    html[data-sf-demo="1"] #appShell .main select,
    html[data-sf-demo="1"] #appShell .main textarea{font-size:12.5px;line-height:1.35}
    html[data-sf-demo="1"] #appShell .main table{font-size:13px;line-height:1.48}
    html[data-sf-demo="1"] #appShell .main th{font-size:11.5px;line-height:1.4}
    html[data-sf-demo="1"] #appShell .main td{padding-top:12px;padding-bottom:12px}
    html[data-sf-demo="1"] #appShell .sf-db-card-head{min-height:60px;padding:14px 16px}
    html[data-sf-demo="1"] #appShell .sf-db-card-head h3{font-size:15px}
    html[data-sf-demo="1"] #appShell .sf-db-card-head p{font-size:11px;line-height:1.45}
    html[data-sf-demo="1"] #appShell .sf-db-card-body{padding:13px 14px;max-height:390px}
    html[data-sf-demo="1"] #appShell .sf-db-list-row{padding:12px 13px}
    html[data-sf-demo="1"] #appShell .sf-db-list-row b{font-size:12.5px;line-height:1.35}
    html[data-sf-demo="1"] #appShell .sf-db-list-row small{font-size:11px!important}
    html[data-sf-demo="1"] #appShell .sf-db-pill{min-height:27px;font-size:10.5px}
    html[data-sf-demo="1"] #appShell .sf-db-bar-top,
    html[data-sf-demo="1"] #appShell .sf-db-mix-item{font-size:11.5px}
    html[data-sf-demo="1"] #appShell .sf-db-action{min-height:82px;padding:13px!important}
    html[data-sf-demo="1"] #appShell .sf-db-action b{font-size:12.5px}
    html[data-sf-demo="1"] #appShell .sf-db-action small{font-size:10.5px!important}
    html[data-sf-demo="1"] #appShell .employee-drag b,
    html[data-sf-demo="1"] #appShell .shift-chip b{font-size:13.5px}
    html[data-sf-demo="1"] #appShell .employee-drag small,
    html[data-sf-demo="1"] #appShell .shift-chip small,
    html[data-sf-demo="1"] #appShell .pill{font-size:11px!important}
    html[data-sf-demo="1"] #appShell .notice,
    html[data-sf-demo="1"] #appShell .empty{font-size:13px;line-height:1.55}

    html[data-sf-demo="1"] #sfEmployeePortal{--sf-employee-nav:304px}
    html[data-sf-demo="1"] #sfEmployeePortal .sf-portal-main{padding:34px clamp(26px,3.5vw,64px) 52px!important;font-size:16px;line-height:1.5}
    html[data-sf-demo="1"] #sfEmployeePortal .sf-employee-side-head b{font-size:14px}
    html[data-sf-demo="1"] #sfEmployeePortal .sf-employee-side-head small{font-size:11px}
    html[data-sf-demo="1"] #sfEmployeePortal .sf-employee-nav-group>span{font-size:10px}
    html[data-sf-demo="1"] #sfEmployeePortal .sf-employee-nav-btn{min-height:52px;padding:11px 12px}
    html[data-sf-demo="1"] #sfEmployeePortal .sf-employee-nav-copy b{font-size:12.5px}
    html[data-sf-demo="1"] #sfEmployeePortal .sf-employee-nav-copy small{font-size:10px;line-height:1.4}
    html[data-sf-demo="1"] #sfEmployeePortal .sf-portal-welcome h1{font-size:34px}
    html[data-sf-demo="1"] #sfEmployeePortal .sf-portal-welcome p{font-size:14px;line-height:1.55}
    html[data-sf-demo="1"] #sfEmployeePortal .sf-portal-stat{min-height:108px;padding:20px}
    html[data-sf-demo="1"] #sfEmployeePortal .sf-portal-stat small{font-size:12px!important;line-height:1.45}
    html[data-sf-demo="1"] #sfEmployeePortal .sf-portal-stat strong{font-size:27px}
    html[data-sf-demo="1"] #sfEmployeePortal .sf-employee-dashboard h2{font-size:20px}
    html[data-sf-demo="1"] #sfEmployeePortal .sf-employee-dashboard>p{font-size:13px;line-height:1.55}
    html[data-sf-demo="1"] #sfEmployeePortal .sf-employee-tile{min-height:148px;padding:20px}
    html[data-sf-demo="1"] #sfEmployeePortal .sf-employee-tile b{font-size:14.5px}
    html[data-sf-demo="1"] #sfEmployeePortal .sf-employee-tile small{font-size:11px;line-height:1.5}
    html[data-sf-demo="1"] #sfEmployeePortal .sf-employee-view-head h1{font-size:31px}
    html[data-sf-demo="1"] #sfEmployeePortal .sf-employee-view-head p{max-width:820px;font-size:13.5px;line-height:1.55}
    html[data-sf-demo="1"] #sfEmployeePortal .sf-portal-card{padding:25px}
    html[data-sf-demo="1"] #sfEmployeePortal .sf-portal-card h3{font-size:17px}
    html[data-sf-demo="1"] #sfEmployeePortal .sf-portal-card small{font-size:11px!important;line-height:1.5!important}

    @media(max-width:1100px){html[data-sf-demo="1"]{--sidebar:205px}html[data-sf-demo="1"] #sfEmployeePortal{--sf-employee-nav:256px}}
    @media(max-width:820px){
      html[data-sf-demo="1"]{--sidebar:72px}
      html[data-sf-demo="1"] #appShell .main{padding:22px 18px 36px}
      html[data-sf-demo="1"] #appShell .page-head h1{font-size:29px}
      html[data-sf-demo="1"] #sfEmployeePortal{--sf-employee-head:76px}
      html[data-sf-demo="1"] #sfEmployeePortal .sf-portal-main{padding:24px 18px 38px!important}
      html[data-sf-demo="1"] #sfEmployeePortal .sf-employee-nav-btn{min-height:46px}
    }
    @media(max-width:560px){
      html[data-sf-demo="1"]{--sidebar:58px}
      html[data-sf-demo="1"] #appShell .main{padding:17px 12px 76px}
      html[data-sf-demo="1"] #appShell .page-head h1{font-size:26px}
      html[data-sf-demo="1"] #appShell .page-head p{font-size:13px}
      html[data-sf-demo="1"] #appShell .stat{min-height:92px;padding:15px}
      html[data-sf-demo="1"] #sfEmployeePortal .sf-portal-main{padding:20px 14px 80px!important}
      html[data-sf-demo="1"] #sfEmployeePortal .sf-portal-welcome h1{font-size:28px}
      html[data-sf-demo="1"] #sfEmployeePortal .sf-employee-tile{min-height:136px;padding:18px}
      html[data-sf-demo="1"] #sfEmployeePortal .sf-portal-card{padding:19px}
    }
  `;
  document.head.appendChild(style);
})();
