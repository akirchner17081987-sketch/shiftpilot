// SchichtFunk – Auto-Planung Cloud Guard V1
(function(){
  const HOUR=60*60*1000;
  const MIN_REST_HOURS=11;
  const MAX_SHIFT_HOURS=10;

  const interval=(date,start,end)=>{
    const s=new Date(`${date}T${start}:00`),e=new Date(`${date}T${end}:00`);
    if(e<=s)e.setDate(e.getDate()+1);
    return {start:s,end:e};
  };
  const intervalForAssignment=a=>{
    const t=typeof typeById==='function'?typeById(a.type):null;
    return interval(a.date,a.start||t?.start||'00:00',a.end||t?.end||'00:00');
  };
  function passesTimeRules(employeeId,type,date,simulated=[]){
    const t=typeof typeById==='function'?typeById(type):null;
    if(!t)return true;
    const target=interval(date,t.start,t.end);
    const duration=(target.end-target.start)/HOUR;
    if(duration>MAX_SHIFT_HOURS)return false;

    const existing=[...(typeof assignments!=='undefined'&&Array.isArray(assignments)?assignments:[]),...(Array.isArray(simulated)?simulated:[])]
      .filter(a=>String(a.employeeId)===String(employeeId));

    for(const a of existing){
      const other=intervalForAssignment(a);
      if(target.start<other.end && target.end>other.start)return false;
      if(target.start>=other.end){
        const rest=(target.start-other.end)/HOUR;
        if(rest<MIN_REST_HOURS)return false;
      }else if(other.start>=target.end){
        const rest=(other.start-target.end)/HOUR;
        if(rest<MIN_REST_HOURS)return false;
      }
    }
    return true;
  }

  const baseEligible=window.autoEligibleEmployees;
  if(typeof baseEligible==='function'){
    window.autoEligibleEmployees=function(type,date,simulated=[]){
      return baseEligible(type,date,simulated).filter(c=>passesTimeRules(c.e.id,type,date,simulated));
    };
  }

  const baseApply=window.applyAutoPlanPreview;
  if(typeof baseApply==='function'){
    window.applyAutoPlanPreview=function(){
      if(typeof autoPlanPreview==='undefined'||!Array.isArray(autoPlanPreview))return baseApply.apply(this,arguments);
      const accepted=[],rejected=[];
      for(const x of autoPlanPreview){
        if(passesTimeRules(x.employeeId,x.type,x.date,accepted))accepted.push(x);else rejected.push(x);
      }
      if(rejected.length){
        autoPlanPreview=accepted;
        if(typeof renderAutoPlanning==='function')renderAutoPlanning();
        if(typeof showSaveToast==='function')showSaveToast(
          'Auto-Planung angepasst',
          `${rejected.length} Vorschlag${rejected.length===1?' wurde':'e wurden'} wegen Überschneidung, Ruhezeit oder Schichtdauer nicht übernommen.`
        );
        if(!accepted.length)return;
      }
      return baseApply.apply(this,arguments);
    };
  }

  window.SFAutoPlanGuard={passesTimeRules};
})();
