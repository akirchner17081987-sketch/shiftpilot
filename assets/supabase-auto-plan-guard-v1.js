// SchichtFunk – Auto-Planung Cloud Guard V1
(function(){
  const HOUR=60*60*1000;
  const MIN_REST_HOURS=11;
  const MAX_SHIFT_HOURS=10;
  let blockCandidateDepth=0;
  // Recovery depends on the complete night block. Only synchronous candidate
  // collection may defer it; the solver and confirmation check complete rows.
  function withBlockCandidates(collect){blockCandidateDepth++;try{return collect()}finally{blockCandidateDepth--}}
  const nextDay=date=>{const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const earlyNight=type=>['O1','O2','TL','TL-LE','TL-RE','TEAMLEITER'].includes(String(type).toUpperCase());
  function transitionMessage(from,to){
    const rules=window.SFCompliance?.policy?.solidPlanningRules;
    if(window.SFSolidPlanningCore?.transitionError)return window.SFSolidPlanningCore.transitionError(from,to,rules);
    if(String(from).toUpperCase()==='O3'&&earlyNight(to))return 'Nach O3 kein früherer Nachtdienst am Folgetag.';
    if(rules?.enabled&&rules.preventLeaderToO1&&['TL-LE','TL-RE'].includes(String(from).toUpperCase())&&String(to).toUpperCase()==='O1')return 'Nach TL-LE oder TL-RE ist O1 am Folgetag nicht zulässig.';
    const order={OT:0,O1:1,O2:2,TL:2,'TL-LE':2,'TL-RE':2,TEAMLEITER:2,O3:3},a=String(from).toUpperCase(),b=String(to).toUpperCase();
    if(rules?.enabled&&rules.preventDescendingShifts&&order[a]!=null&&order[b]!=null&&order[a]>order[b])return `Absteigender Schichtwechsel ${a} → ${b} am Folgetag ist nicht zulässig.`;
    return null;
  }
  const allowsTransition=(from,to)=>!transitionMessage(from,to);
  function transitionConflict(employeeId,type,date,simulated=[]){
    const all=[...(typeof assignments==='undefined'?[]:assignments),...simulated].filter(a=>String(a.employeeId)===String(employeeId));
    for(const a of all){const message=nextDay(a.date)===date?transitionMessage(a.type,type):nextDay(date)===a.date?transitionMessage(type,a.type):null;if(message)return message;}
    return null;
  }
  const passesShiftTransitions=(employeeId,type,date,simulated=[])=>!transitionConflict(employeeId,type,date,simulated);

  const interval=(date,start,end)=>{
    const rules=window.SFCompliance?.policy?.solidPlanningRules;if(rules?.enabled&&window.SFSolidPlanningCore){const i=window.SFSolidPlanningCore.interval(date,start,end,rules.timezone);return {start:new Date(i.start),end:new Date(i.end)}}
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

    const confirmedRules=window.SFCompliance?.policy?.solidPlanningRules;if(!blockCandidateDepth&&employee&&window.SFSolidPlanningCore?.confirmed(confirmedRules)){const rows=[...existing,{employeeId,date,type,start:t.start,end:t.end}].map(a=>{const model=typeById(a.type);return{...a,start:a.start||model?.start,end:a.end||model?.end}});if(window.SFSolidPlanningCore.errors(employee,rows,confirmedRules,[date]).length)return false;}
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
      if(window.SFMonthOptimizer?.getResult?.())return baseApply.apply(this,arguments);
      if(typeof autoPlanPreview==='undefined'||!Array.isArray(autoPlanPreview))return baseApply.apply(this,arguments);
      const accepted=[],rejected=[];
      for(const x of autoPlanPreview){
        if(passesTimeRules(x.employeeId,x.type,x.date,autoPlanPreview.filter(a=>a!==x)))accepted.push(x);else rejected.push(x);
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

  window.SFAutoPlanGuard={passesTimeRules,allowsTransition,passesShiftTransitions,transitionConflict,withBlockCandidates};
})();
