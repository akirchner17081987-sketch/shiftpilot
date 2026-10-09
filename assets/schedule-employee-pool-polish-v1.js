// SchichtFunk – Mitarbeiter-Pool: Entwurf 3, Schichten im Fokus
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

    html #appShell #view-schedule .employee-pool{
      --sf-pool-card:#101d2d;--sf-pool-footer:#122234;--sf-pool-line:#2b3e55;
      --sf-pool-text:#eef4fc;--sf-pool-muted:#a1b3c9;
      --sf-pool-good:#71dec0;--sf-pool-warn:#eac483;--sf-pool-bad:#f5a5b1;
    }
    html[data-sf-theme="light"] #appShell #view-schedule .employee-pool{
      --sf-pool-card:#e9eef3;--sf-pool-footer:#e1e8ef;--sf-pool-line:#b9c8d5;
      --sf-pool-text:#183247;--sf-pool-muted:#4c6479;
      --sf-pool-good:#136d56;--sf-pool-warn:#805816;--sf-pool-bad:#9c3444;
    }
    html #appShell #view-schedule .employee-pool-list{
      grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr));
      gap:12px!important;
    }
    html #appShell #view-schedule .employee-drag{
      display:grid;grid-template-columns:2.25rem minmax(0,1fr) .75rem;
      grid-template-rows:auto auto auto minmax(0,1fr) auto auto;
      gap:0 10px;min-height:0!important;height:auto;min-width:0;
      align-self:stretch;align-items:start;position:relative;
      padding:14px!important;box-sizing:border-box;
      background:var(--sf-pool-card)!important;color:var(--sf-pool-text)!important;
      border:1px solid var(--sf-pool-line)!important;
      border-left:4px solid var(--sf-person-border,var(--teal,#27d6b4))!important;
      border-radius:9px;overflow:hidden;box-shadow:none;
    }
    html #appShell #view-schedule .employee-drag:before{
      content:"⠿";grid-column:3;grid-row:1/3;justify-self:end;align-self:start;
      color:var(--sf-pool-muted);font-size:1.125rem;line-height:1.4;
    }
    html #appShell #view-schedule .employee-drag .avatar{
      grid-column:1;grid-row:1/3;align-self:start;
      width:2.25rem;height:2.25rem;min-width:0;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      background:var(--sf-person-bg,#173a35)!important;
      color:var(--sf-person-text,#b5ddd7)!important;
      font-size:var(--sf-text-secondary,.8125rem);font-weight:700;
    }
    html #appShell #view-schedule .employee-drag .employee-pool-info{
      display:contents;min-width:0;min-height:0;
    }
    html #appShell #view-schedule .employee-pool-info>*{
      min-width:0;max-width:100%;box-sizing:border-box;
    }
    html #appShell #view-schedule .employee-pool-info>b{
      grid-column:2;grid-row:1;font-size:.9375rem;line-height:1.45;
      color:var(--sf-pool-text);white-space:normal;overflow-wrap:anywhere;
    }
    html #appShell #view-schedule .employee-pool-info>small{
      grid-column:2;grid-row:2;margin-top:3px;padding-right:0;
      color:var(--sf-pool-muted)!important;white-space:normal;
      overflow-wrap:anywhere;line-height:1.5;
    }
    html #appShell #view-schedule .pool-detail-label{
      grid-column:1/-1;grid-row:3;display:block;margin:13px 0 8px;
      padding-top:10px;border-top:1px solid var(--sf-pool-line);
      color:var(--sf-pool-muted)!important;text-transform:none;letter-spacing:0;
      font-weight:600;line-height:1.5;
    }
    html #appShell #view-schedule .pool-shifts{
      grid-column:1/-1;grid-row:4;align-self:start;
      display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;
    }
    html #appShell #view-schedule .pool-shift-tag{
      display:flex;align-items:center;justify-content:center;min-width:0;
      padding:6px 4px;border-radius:6px;text-align:center;
      background:var(--sf-person-bg,#173a35)!important;
      border:1px solid var(--sf-person-border,#35615d)!important;
      color:var(--sf-person-text,#b5ddd7)!important;
      white-space:normal;overflow-wrap:anywhere;font-weight:600;line-height:1.5;
    }
    html #appShell #view-schedule .pool-absence{
      grid-column:1/-1;grid-row:5;width:100%;margin:10px 0 0!important;
      padding:7px 8px;white-space:normal;overflow-wrap:anywhere;
      line-height:1.5;box-sizing:border-box;
    }
    html #appShell #view-schedule .pool-absence:not(.has-absence):not(.sf-range){display:none}
    html #appShell #view-schedule .pool-absence.has-absence,
    html #appShell #view-schedule .pool-absence.sf-range{
      display:block;background:var(--sf-pool-footer);border-color:var(--sf-pool-warn);
      color:var(--sf-pool-warn);
    }
    html #appShell #view-schedule .sp-pool-meta{
      grid-column:1/-1;grid-row:6;align-self:end;
      display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px 10px;
      margin:14px -14px -14px;max-width:none;padding:10px 14px;
      border-top:1px solid var(--sf-pool-line);background:var(--sf-pool-footer);
      font-size:var(--sf-text-secondary,.8125rem);line-height:1.5;
    }
    html #appShell #view-schedule .sp-pool-meta>span{
      padding:0;border:0;border-radius:0;background:none;
      font-size:inherit;line-height:inherit;color:var(--sf-pool-muted);
      white-space:normal;overflow-wrap:anywhere;min-width:0;
    }
    html #appShell #view-schedule .sp-pool-team{grid-column:1/-1;grid-row:1}
    html #appShell #view-schedule .sp-pool-hours{grid-column:2;grid-row:2;text-align:right}
    html #appShell #view-schedule .sp-pool-state{
      grid-column:1;grid-row:2;display:flex;align-items:center;gap:6px;
    }
    html #appShell #view-schedule .sp-pool-state:before{
      content:"";width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:currentColor;
    }
    html #appShell #view-schedule .sp-pool-state.available{color:var(--sf-pool-good)}
    html #appShell #view-schedule .sp-pool-state.limited{color:var(--sf-pool-warn)}
    html #appShell #view-schedule .sp-pool-state.unavailable{color:var(--sf-pool-bad)}
    html #appShell #view-schedule .employee-drag.selected{
      outline:2px solid var(--teal,#27d6b4);outline-offset:-2px;
      transform:none;box-shadow:none;
    }
    html #appShell #view-schedule .employee-drag.selected:after{
      position:static;grid-column:1/-1;grid-row:7;justify-self:start;
      max-width:100%;white-space:normal;line-height:1.5;
      margin-top:14px;color:var(--sf-pool-good);background:none;
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
