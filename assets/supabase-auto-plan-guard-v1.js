// SchichtFunk – Auto-Planung Cloud Guard V1
(function(){
  const HOUR=60*60*1000;
  const MIN_REST_HOURS=11;
  const MAX_SHIFT_HOURS=10;
  const nextDay=date=>{const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const earlyNight=type=>['O1','O2','TL','TL-LE','TL-RE','TEAMLEITER'].includes(String(type).toUpperCase());
  const allowsTransition=(from,to)=>!(String(from).toUpperCase()==='O3'&&earlyNight(to));
  function passesShiftTransitions(employeeId,type,date,simulated=[]){
    const all=[...(typeof assignments==='undefined'?[]:assignments),...simulated].filter(a=>String(a.employeeId)===String(employeeId));
    return all.every(a=>!(nextDay(a.date)===date&&!allowsTransition(a.type,type)||nextDay(date)===a.date&&!allowsTransition(type,a.type)));
  }

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

    const employee=typeof employees==='undefined'?null:employees.find(e=>String(e.id)===String(employeeId));
    const stored=employee?.qualifications?.find(q=>String(q).startsWith('__sp:maxConsecutive=')),maximum=Number(employee?.maxConsecutiveShifts??stored?.split('=')[1]);
    if(Number.isFinite(maximum)&&maximum>0){
      const days=new Set(existing.map(a=>a.date));let count=1;
      for(const direction of [-1,1]){const cursor=new Date(date+'T12:00:00');for(let i=0;i<days.size;i++){cursor.setDate(cursor.getDate()+direction);const key=`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}-${String(cursor.getDate()).padStart(2,'0')}`;if(!days.has(key))break;count++}}
      if(count>maximum)return false;
    }

    for(const a of existing){
      if(nextDay(a.date)===date&&!allowsTransition(a.type,type)||nextDay(date)===a.date&&!allowsTransition(type,a.type))return false;
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
        const blocked=new Set(rejected.map(x=>x.blockId).filter(Boolean));
        autoPlanPreview=accepted.filter(x=>!x.blockId||!blocked.has(x.blockId));
        if(typeof renderAutoPlanning==='function')renderAutoPlanning();
        if(typeof showSaveToast==='function')showSaveToast(
          'Auto-Planung angepasst',
          `${rejected.length} Vorschlag${rejected.length===1?' wurde':'e wurden'} wegen Überschneidung, Ruhezeit oder Schichtdauer nicht übernommen.`
        );
        if(!autoPlanPreview.length)return;
      }
      return baseApply.apply(this,arguments);
    };
  }

  window.SFAutoPlanGuard={passesTimeRules,allowsTransition,passesShiftTransitions};
})();
