// SchichtFunk Compliance V2 – Core
(function(){
  const C=window.SFCompliance=window.SFCompliance||{}, DAY=86400000, HOUR=3600000;
  C.esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  C.uid=p=>p+Date.now()+Math.random().toString(36).slice(2,7);
  C.parseDate=v=>{const m=String(v||'').slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?new Date(+m[1],+m[2]-1,+m[3]):null};
  C.iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  C.mins=t=>{const m=String(t||'').match(/^(\d{1,2}):(\d{2})$/);return m?+m[1]*60 + +m[2]:null};
  C.interval=(date,start,end)=>{const d=C.parseDate(date),s=C.mins(start),e=C.mins(end);if(!d||s===null||e===null||s===e)return null;return{start:d.getTime()+s*60000,end:d.getTime()+e*60000+(e<=s?DAY:0)}};
  C.shiftInterval=a=>{const t=typeById(a.type);return C.interval(a.date,a.start||t?.start,a.end||t?.end)};
  C.overlap=(a,b)=>!!a&&!!b&&a.start<b.end&&b.start<a.end;
  C.fmt=d=>new Date(d+'T00:00:00').toLocaleDateString('de-DE');
  C.monday=date=>{const d=C.parseDate(date);if(!d)return null;d.setDate(d.getDate()-((d.getDay()+6)%7));return d};
  C.weekKey=date=>{const d=C.monday(date);return d?C.iso(d):String(date||'')};

  C.absenceInterval=a=>{
    if(!a||a.status==='Abgelehnt')return null;
    const s=C.parseDate(a.startDate||a.date),e=C.parseDate(a.endDate||a.date||a.startDate);if(!s||!e)return null;
    if(a.fullDay!==false)return{start:s.getTime(),end:e.getTime()+DAY};
    const sm=C.mins(a.startTime),em=C.mins(a.endTime);
    if(sm===null||em===null)return{start:s.getTime(),end:e.getTime()+DAY};
    return{start:s.getTime()+sm*60000,end:e.getTime()+em*60000+(s.getTime()===e.getTime()&&em<=sm?DAY:0)};
  };
  C.roleAllows=(emp,type)=>String(type).toLowerCase()!=='teamleiter'||/teamleiter|schichtleiter/i.test(emp?.role||'');
  C.otAllowed=date=>window.SchichtFunkScheduleCore?.isOTDay?!!window.SchichtFunkScheduleCore.isOTDay(date):(typeof shiftPilotOtApplies==='function'?!!shiftPilotOtApplies(date):[0,6].includes(C.parseDate(date)?.getDay()));
  C.weekHours=(empId,date,ignoreId)=>{
    const m=C.monday(date);if(!m)return 0;const end=new Date(m);end.setDate(end.getDate()+7);
    return assignments.filter(a=>a.employeeId===empId&&a.id!==ignoreId).reduce((n,a)=>{const iv=C.shiftInterval(a);return !iv||iv.start<m.getTime()||iv.start>=end.getTime()?n:n+(iv.end-iv.start)/HOUR},0);
  };
  C.nearestRest=(empId,p,ignoreId)=>{
    let hours=Infinity,assignment=null;
    assignments.filter(a=>a.employeeId===empId&&a.id!==ignoreId).forEach(a=>{const iv=C.shiftInterval(a);if(!iv||C.overlap(iv,p))return;const h=iv.end<=p.start?(p.start-iv.end)/HOUR:p.end<=iv.start?(iv.start-p.end)/HOUR:Infinity;if(h<hours){hours=h;assignment=a}});
    return{hours,assignment};
  };

  C.check=(emp,type,date,start,end,ignoreId=null)=>{
    const hard=[],soft=[],t=typeById(type),p=C.interval(date,start||t?.start,end||t?.end);
    if(!emp||!t)return{hard:['Mitarbeiter oder Schichtvorlage wurde nicht gefunden.'],soft:[]};
    if(!p)return{hard:['Beginn und Ende müssen gültig und unterschiedlich sein.'],soft:[]};
    if(emp.status!=='active')hard.push('Mitarbeiter ist inaktiv.');
    if(!(emp.shifts||[]).includes(type))hard.push(`Keine Freigabe für ${type}.`);
    if(!C.roleAllows(emp,type))hard.push('Teamleiter-Schicht erfordert Teamleiter/Schichtleiter.');
    if(String(type).toUpperCase()==='OT'&&!C.otAllowed(date))hard.push('OT ist nach der hinterlegten OT-Regel an diesem Tag nicht zulässig.');
    const ab=absences.find(a=>a.employeeId===emp.id&&C.overlap(p,C.absenceInterval(a)));if(ab)hard.push(`Abwesenheit (${ab.type||'Abwesend'}) überschneidet sich mit der Schicht.`);
    const clash=assignments.find(a=>a.employeeId===emp.id&&a.id!==ignoreId&&C.overlap(p,C.shiftInterval(a)));if(clash){const ct=typeById(clash.type);hard.push(`Zeitüberschneidung mit ${clash.type} am ${C.fmt(clash.date)} (${clash.start||ct?.start}–${clash.end||ct?.end}).`)}
    const rest=C.nearestRest(emp.id,p,ignoreId);
    if(rest.assignment&&rest.hours<11)hard.push(`Standard-Ruhezeit unterschritten: ${rest.hours.toFixed(1)} Std. (Standardprüfung 11 Std.). Ausnahmefälle müssen gesondert geprüft werden.`);
    const duration=(p.end-p.start)/HOUR;
    if(duration>10)hard.push(`Schichtdauer ${duration.toFixed(1)} Std. überschreitet die Standard-Höchstgrenze 10 Std. Ausnahmefälle müssen gesondert geprüft werden.`);
    else if(duration>8)soft.push(`Schichtdauer ${duration.toFixed(1)} Std.: Ausgleichszeitraum prüfen.`);
    const current=C.weekHours(emp.id,date,ignoreId),target=Number(emp.weeklyHours)||0;
    if(target&&current+duration>target+.01)soft.push(`Wochen-SOLL würde auf ${(current+duration).toFixed(1)} / ${target.toFixed(1)} Std. steigen.`);
    const so=Number(getSoll(date,type)||0),ist=assignmentsFor(date,type).filter(a=>a.id!==ignoreId).length;if(so&&ist>=so)soft.push(`SOLL-Stärke ${so} ist bereits erreicht.`);
    return{hard,soft,proposed:p,duration,rest};
  };
  window.spAssignmentConflict=C.check;

  C.defaults={shortNoticeHours:48,criticalNoticeHours:24,employeeConfirmationUnderHours:24,requireReason:true,worksCouncilEnabled:false,sector:'security'};
  C.policy={...C.defaults,...store.get('compliancePolicy',{})};
  C.requests=store.get('shiftChangeRequests',[]);
  C.auditEvents=store.get('complianceAudit',[]);
  C.publications=store.get('planPublications',{});
  C.persist=()=>{store.set('compliancePolicy',C.policy);store.set('shiftChangeRequests',C.requests);store.set('complianceAudit',C.auditEvents);store.set('planPublications',C.publications)};
  C.audit=(event,id,details={})=>{C.auditEvents.unshift({id:C.uid('au'),event,entityId:id||null,at:new Date().toISOString(),actor:'Administrator',details});C.auditEvents=C.auditEvents.slice(0,500);C.persist()};
  assignments.forEach(a=>a.version=a.version||1);
  C.publication=date=>C.publications[C.weekKey(date)]||null;
  C.isWeekPublished=date=>!!C.publication(date)?.publishedAt;
  C.isPublished=a=>!!a&&(!!a.publishedAt||C.isWeekPublished(a.date));

  C.complianceCheck=({action='UPDATE',assignment=null,employeeId,type,date,start,end})=>{
    const emp=employees.find(e=>e.id===employeeId), findings=[];let level='GREEN',employeeApproval=false,worksCouncil=!!C.policy.worksCouncilEnabled;
    const add=(code,status,text,basis='')=>{findings.push({code,status,text,basis});if(status==='BLOCK')level='BLOCK';else if(status==='REVIEW'&&level!=='BLOCK')level='REVIEW'};
    if(action!=='DELETE'){
      const b=C.check(emp,type,date,start,end,assignment?.id||null);
      b.hard.forEach((x,i)=>add('RULE_'+(i+1),'BLOCK',x));b.soft.forEach((x,i)=>add('CHECK_'+(i+1),'REVIEW',x));
      if(!b.hard.length&&!b.soft.length)add('BASIC','PASS','Keine Standardverletzung erkannt.');
      if(!b.rest?.assignment)add('REST_11H','PASS','Keine angrenzende Schicht mit kritischer Ruhezeit gefunden.');
      else if(b.rest.hours>=11)add('REST_11H','PASS',`Ruhezeit ${b.rest.hours.toFixed(1)} Std.`);
    }
    const published=assignment?C.isPublished(assignment):C.isWeekPublished(date);
    if(published){
      const iv=action==='DELETE'?C.shiftInterval(assignment):C.interval(date,start,end), nh=iv?(iv.start-Date.now())/HOUR:Infinity;
      if(nh<0)add('STARTED_SHIFT','REVIEW','Schicht hat bereits begonnen oder liegt in der Vergangenheit; ggf. Zeiterfassung korrigieren.');
      else if(nh<C.policy.shortNoticeHours)add('SHORT_NOTICE','REVIEW',`${nh<C.policy.criticalNoticeHours?'Sehr kurzfristige':'Kurzfristige'} Änderung: ${nh.toFixed(1)} Std. Vorlauf.`);
      else add('NOTICE','PASS',`Vorlauf ${nh.toFixed(1)} Std.`);
      if(nh>=0&&nh<C.policy.employeeConfirmationUnderHours)employeeApproval=true;
      if(action==='CREATE')add('FREE_DAY_TO_WORK','REVIEW','Veröffentlichter Plan wird nachträglich um eine Besetzung ergänzt.');
      if(action!=='DELETE'&&emp?.workTimeModel==='ON_CALL'&&nh<96){add('ON_CALL_NOTICE','REVIEW',`Arbeit auf Abruf: weniger als vier Tage Vorlauf (${nh.toFixed(1)} Std.). Freiwillige Übernahme anfragen.`,'§ 12 Abs. 3 TzBfG');employeeApproval=true}
      if(action!=='DELETE'&&C.parseDate(date)?.getDay()===0&&C.policy.sector==='security')add('SUNDAY_SECURITY','PASS','Sonntag im Bewachungsgewerbe erkannt; Ersatzruhetag separat prüfen.','§§ 10, 11 ArbZG');
    }
    if(worksCouncil)add('WORKS_COUNCIL','REVIEW','Betriebsratsfreigabe ist betrieblich hinterlegt.','§ 87 Abs. 1 Nr. 2/3 BetrVG');
    return{level,findings,employeeApproval,worksCouncil,published};
  };
  C.refresh=()=>{saveAll();C.persist();renderCalendar();renderPlanEmployeePool();renderOverview();updateStats()};
  C.toast=(t,x)=>typeof showSaveToast==='function'?showSaveToast(t,x):alert(t+'\n'+x);
  window.SchichtFunkConflictAudit={check:C.check,complianceCheck:C.complianceCheck,isWeekPublished:C.isWeekPublished,requests:()=>C.requests,audit:()=>C.auditEvents};
})();