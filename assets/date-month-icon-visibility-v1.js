// SchichtFunk – Kalender-Symbole im Standard-Türkis V1
(function(){
  if(window.__sfDateMonthIconVisibilityV1)return;window.__sfDateMonthIconVisibilityV1=true;
  const s=document.createElement('style');
  s.id='sfDateMonthIconVisibilityV1';
  s.textContent=`
    #appShell input[type="date"],
    #appShell input[type="month"],
    #view-time input[type="date"],
    #view-time input[type="month"],
    .sf-ta-wrap input[type="month"],
    .sf-datev input[type="month"]{
      color-scheme:dark;
      background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%2327d6b4' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='5' width='18' height='16' rx='2'/%3E%3Cpath d='M16 3v4M8 3v4M3 10h18'/%3E%3C/svg%3E");
      background-repeat:no-repeat;
      background-position:right 9px center;
      background-size:16px 16px;
      padding-right:34px!important;
    }

    #appShell input[type="date"]::-webkit-calendar-picker-indicator,
    #appShell input[type="month"]::-webkit-calendar-picker-indicator,
    #view-time input[type="date"]::-webkit-calendar-picker-indicator,
    #view-time input[type="month"]::-webkit-calendar-picker-indicator,
    .sf-ta-wrap input[type="month"]::-webkit-calendar-picker-indicator,
    .sf-datev input[type="month"]::-webkit-calendar-picker-indicator{
      opacity:0!important;
      cursor:pointer;
      width:20px;
      height:20px;
      padding:2px;
    }
  `;
  document.head.appendChild(s);
})();
