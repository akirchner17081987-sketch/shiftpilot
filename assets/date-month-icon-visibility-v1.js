// SchichtFunk – sichtbare Kalender-Symbole für dunkle Datums-/Monatsfelder V1
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
    }

    #appShell input[type="date"]::-webkit-calendar-picker-indicator,
    #appShell input[type="month"]::-webkit-calendar-picker-indicator,
    #view-time input[type="date"]::-webkit-calendar-picker-indicator,
    #view-time input[type="month"]::-webkit-calendar-picker-indicator,
    .sf-ta-wrap input[type="month"]::-webkit-calendar-picker-indicator,
    .sf-datev input[type="month"]::-webkit-calendar-picker-indicator{
      opacity:1!important;
      filter:invert(88%) sepia(17%) saturate(1182%) hue-rotate(116deg) brightness(105%) contrast(92%);
      cursor:pointer;
      width:16px;
      height:16px;
      padding:2px;
    }

    #appShell input[type="date"]:hover::-webkit-calendar-picker-indicator,
    #appShell input[type="month"]:hover::-webkit-calendar-picker-indicator,
    #view-time input[type="date"]:hover::-webkit-calendar-picker-indicator,
    #view-time input[type="month"]:hover::-webkit-calendar-picker-indicator{
      filter:invert(95%) sepia(23%) saturate(1469%) hue-rotate(104deg) brightness(112%) contrast(96%);
    }
  `;
  document.head.appendChild(s);
})();
