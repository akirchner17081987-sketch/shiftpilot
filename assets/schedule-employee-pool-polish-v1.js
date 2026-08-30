// SchichtFunk – saubere Mitarbeiterkarten im kompakten Pool V1
(function(){
  if(document.getElementById('sfScheduleEmployeePoolPolishV1'))return;
  const style=document.createElement('style');
  style.id='sfScheduleEmployeePoolPolishV1';
  style.textContent=`
    #view-schedule .employee-pool-list{
      align-items:stretch;
      padding:1px 5px 10px 1px!important;
      scroll-padding-bottom:10px;
    }
    #view-schedule .employee-pool.sp-pool-compact .employee-pool-list{
      max-height:152px;
    }
    #view-schedule .employee-pool:not(.sp-pool-compact) .employee-pool-list{
      max-height:350px;
    }
    #view-schedule .employee-drag{
      min-height:132px;
      height:100%;
      align-self:stretch;
      border-color:#2d4962;
      border-radius:10px;
      overflow:visible;
      box-shadow:0 2px 8px rgba(0,0,0,.12);
    }
    #view-schedule .employee-drag .employee-pool-info{
      display:flex;
      min-width:0;
      min-height:100%;
      flex:1;
      flex-direction:column;
    }
    #view-schedule .employee-drag .pool-absence{
      width:100%;
      margin-top:auto;
    }
    @media(max-width:620px){
      #view-schedule .employee-pool.sp-pool-compact .employee-pool-list{max-height:158px}
    }
  `;
  document.head.appendChild(style);
})();

