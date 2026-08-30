// SchichtFunk – saubere, responsive Dienstplan-Werkzeugleiste V1
(function(){
  if(document.getElementById('sfScheduleToolbarPolishV1'))return;
  const style=document.createElement('style');
  style.id='sfScheduleToolbarPolishV1';
  style.textContent=`
    #view-schedule .cal-toolbar{
      min-height:58px;
      height:auto;
      display:flex;
      flex-wrap:wrap;
      align-items:center;
      align-content:center;
      gap:8px;
      padding:9px 11px;
      overflow:visible;
    }
    #view-schedule .cal-toolbar>*{flex-shrink:0}
    #view-schedule .cal-toolbar button{
      max-width:none;
      white-space:nowrap;
      overflow:visible;
      text-overflow:clip;
      line-height:1.25;
    }
    #view-schedule .cal-toolbar .date-label{
      min-width:92px;
      margin:0 6px 0 4px;
      white-space:nowrap;
      line-height:1.25;
    }
    #view-schedule .cal-toolbar .toolbar-spacer{
      flex:1 1 20px;
      min-width:0;
      margin-left:0;
    }
    #view-schedule .sf-week-mode-seg,
    #view-schedule .cal-toolbar>.seg{
      display:inline-flex;
      flex-shrink:0;
      overflow:hidden;
    }
    #view-schedule .sf-week-mode-seg button{min-width:76px;padding-inline:12px}
    #view-schedule .cal-toolbar>.seg button{min-width:68px;padding-inline:12px}
    #view-schedule #sfComplianceToolbar,
    #view-schedule #sfPlanStatusTools{
      display:inline-flex!important;
      flex-wrap:nowrap;
      align-items:center;
      gap:7px!important;
      margin-left:0!important;
    }
    #view-schedule #sfComplianceToolbar .ghost{min-width:max-content}
    #view-schedule #sfPlanStatusTools .sf-plan-legend{white-space:nowrap}
    @media(max-width:1500px){
      #view-schedule .cal-toolbar .toolbar-spacer{display:none}
      #view-schedule #sfComplianceToolbar{margin-left:auto!important}
      #view-schedule #sfPlanStatusTools{margin-left:auto!important}
    }
    @media(max-width:1180px){
      #view-schedule #sfComplianceToolbar{margin-left:0!important}
      #view-schedule #sfPlanStatusTools{margin-left:0!important}
      #view-schedule .sf-plan-legend{display:none}
    }
    @media(max-width:720px){
      #view-schedule .cal-toolbar{gap:7px;padding:8px}
      #view-schedule .cal-toolbar .date-label{order:1;flex:1 0 calc(100% - 128px);min-width:120px}
      #view-schedule .cal-toolbar>button:not(#prevWeek):not(#nextWeek):not(#todayBtn),
      #view-schedule .sf-week-mode-seg,
      #view-schedule .cal-toolbar>.seg,
      #view-schedule #sfComplianceToolbar,
      #view-schedule #sfPlanStatusTools{order:2}
    }
  `;
  document.head.appendChild(style);
})();

