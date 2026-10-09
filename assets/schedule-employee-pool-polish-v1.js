// SchichtFunk – Mitarbeiter-Pool mit flexiblen Karten und getrennten Filterzeilen
(function(){
  const style=document.getElementById('sfScheduleEmployeePoolPolishV1')||document.createElement('style');
  style.id='sfScheduleEmployeePoolPolishV1';
  style.textContent=`
    html #appShell #view-schedule .employee-pool-head{
      display:grid;
      grid-template-columns:minmax(0,1fr) minmax(12rem,18rem);
      gap:10px 16px;
      align-items:center;
    }
    html #appShell #view-schedule .employee-pool-head>div:first-child{
      grid-column:1;grid-row:1;min-width:0;
    }
    html #appShell #view-schedule .employee-pool-head h3,
    html #appShell #view-schedule .employee-pool-head small{
      white-space:normal;overflow-wrap:anywhere;line-height:1.5;
    }
    html #appShell #view-schedule .employee-pool-head small{display:block}
    html #appShell #view-schedule .employee-pool-head .sp-pool-toggle{
      grid-column:2;grid-row:1;justify-self:end;margin:0;max-width:100%;white-space:normal;
    }
    html #appShell #view-schedule .employee-pool-head .sp-dynpool-info{
      grid-column:1;grid-row:2;min-width:0;width:auto;margin:0;
      display:flex;flex-wrap:wrap;gap:8px;order:initial!important;
    }
    html #appShell #view-schedule .employee-pool-head .sp-dynpool-count{
      white-space:normal;overflow-wrap:anywhere;line-height:1.5;
    }
    html #appShell #view-schedule .employee-pool-head input{
      grid-column:2;grid-row:2;min-width:0;width:100%;margin:0;order:initial!important;
    }
    html #appShell #view-schedule .employee-pool-list{
      align-items:stretch;grid-auto-rows:auto;
      gap:10px!important;padding:3px 6px 10px 3px!important;
      overflow-y:auto!important;overflow-x:hidden!important;scroll-padding-bottom:10px;
    }
    html #appShell #view-schedule .employee-pool.sp-pool-compact .employee-pool-list{
      max-height:20rem!important;
    }
    html #appShell #view-schedule .employee-pool:not(.sp-pool-compact) .employee-pool-list{
      max-height:34rem!important;
    }
    html #appShell #view-schedule .employee-drag{
      display:grid;grid-template-columns:30px minmax(0,1fr);gap:8px 10px;
      min-height:0!important;height:auto;min-width:0;align-self:stretch;align-items:start;
      border-color:#2d4962;border-radius:10px;overflow:hidden;
      box-shadow:0 2px 8px rgba(0,0,0,.12);
    }
    html #appShell #view-schedule .employee-drag .avatar{grid-column:1;grid-row:1}
    html #appShell #view-schedule .employee-drag .employee-pool-info{
      grid-column:2;grid-row:1;display:flex;flex-direction:column;gap:5px;
      min-width:0;min-height:0;
    }
    html #appShell #view-schedule .employee-pool-info>*{flex-shrink:0;max-width:100%}
    html #appShell #view-schedule .employee-pool-info>b,
    html #appShell #view-schedule .employee-pool-info>small{
      white-space:normal;overflow-wrap:anywhere;line-height:1.5;
    }
    html #appShell #view-schedule .employee-pool-info>small{padding-right:0}
    html #appShell #view-schedule .pool-detail-label{display:block;margin:4px 0 0}
    html #appShell #view-schedule .pool-shifts{display:flex;flex-wrap:wrap;gap:4px}
    html #appShell #view-schedule .pool-absence{
      width:100%;margin-top:4px!important;white-space:normal;overflow-wrap:anywhere;
      line-height:1.5;box-sizing:border-box;
    }
    html #appShell #view-schedule .sp-pool-meta{
      display:flex;flex-wrap:wrap;gap:5px 8px;margin-top:3px;
      font-size:var(--sf-text-secondary,.8125rem);line-height:1.5;
    }
    html #appShell #view-schedule .sp-pool-meta span{font-size:inherit;line-height:inherit}
    html #appShell #view-schedule .employee-drag.selected:after{
      position:static;grid-column:1/-1;justify-self:start;
      max-width:100%;white-space:normal;line-height:1.5;margin-top:2px;
    }
    @media(max-width:700px){
      html #appShell #view-schedule .employee-pool-head{grid-template-columns:minmax(0,1fr)}
      html #appShell #view-schedule .employee-pool-head .sp-pool-toggle{
        grid-column:1;grid-row:2;justify-self:start;
      }
      html #appShell #view-schedule .employee-pool-head .sp-dynpool-info{grid-column:1;grid-row:3}
      html #appShell #view-schedule .employee-pool-head input{grid-column:1;grid-row:4}
    }
`;
  if(!style.isConnected)document.head.appendChild(style);
})();
