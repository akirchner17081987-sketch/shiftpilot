// Gesamtdienstplan: reine Datenaufbereitung für Excel und PDF.
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./schedule-employee-display-v1.js'):root.SFScheduleEmployeeDisplay);if(typeof module==='object'&&module.exports)module.exports=api;else root.SFScheduleExportCore=api})(typeof window!=='undefined'?window:globalThis,function(display){
  const pad=n=>String(n).padStart(2,'0');
  const localISO=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  const number=n=>Math.round(n*100)/100;
  const absenceCodes={Urlaub:'U',Krank:'K',Frei:'F',Fortbildung:'FB',Sperrzeit:'SP',Sonderurlaub:'SU',Sonstiges:'AB'};
  function minutes(value){const match=String(value||'').match(/^([01]\d|2[0-3]):([0-5]\d)(?::\d{2})?$/);return match?Number(match[1])*60+Number(match[2]):null}
  function effective(a){return ['Genehmigt','Erfasst','approved','recorded'].includes(a.status)}
  function employeeSite(employee){
    const stored=(employee.qualifications||[]).find(q=>String(q).startsWith('__sp:team='));
    const site=String(employee.team??(stored?stored.slice(10):'')).trim().toLocaleLowerCase('de-DE');
    return site==='leipzig'?'Leipzig':site==='recklinghausen'?'Recklinghausen':'';
  }
  function monthlyTarget(e,source){
    if(e.monthlyHours==null&&e.weeklyHours==null&&e.weekly_hours==null&&!(e.qualifications||[]).some(q=>String(q).startsWith('__sp:monthlyHours=')))return null;
    const value=e.monthlyHours??(e.qualifications||[]).find(q=>String(q).startsWith('__sp:monthlyHours='))?.split('=')[1]??source.employeeMonthlyTarget?.(e);
    if(value!==''&&value!=null&&Number.isFinite(Number(value)))return number(Math.max(0,Number(value)));
    const weekly=e.weeklyHours??e.weekly_hours;
    return weekly!==''&&weekly!=null&&Number.isFinite(Number(weekly))?number(Math.max(0,Number(weekly))*4.348):null;
  }
  function summarize(rows){
    const missingTargets=rows.filter(r=>r.targetHours===null).length,targetHours=number(rows.reduce((n,r)=>n+(r.targetHours??0),0));
    return{employeeCount:rows.length,assignedEmployeeCount:rows.filter(r=>r.shiftCount>0).length,targetHours,missingTargets,difference:missingTargets?null:number(rows.reduce((n,r)=>n+r.hours,0)-targetHours)};
  }
  function staffingResolver(types,requirements,overrides,assignments){
    const global=new Map(requirements.map(r=>[r.shift_code,Number(r.required_count)])),daily=new Map(overrides.map(r=>[r.work_date+'|'+r.shift_code,Number(r.required_count)]));
    const weekday=date=>new Date(date+'T12:00:00').getDay()||7;
    const allowed=(t,date)=>(t.optionalWeekdays||[1,2,3,4,5,6,7]).includes(weekday(date));
    const raw=(date,code)=>{const t=types.find(t=>t.id===code),key=date+'|'+code;if(t?.strictWeekdays&&!allowed(t,date))return 0;return daily.has(key)?daily.get(key):t&&(t.planningMode==='optional'||!allowed(t,date))?0:global.get(code)||0};
    return(date,code)=>{
      const t=types.find(t=>t.id===code);
      if(t?.coverageGroup){
        const members=types.filter(x=>x.coverageGroup===t.coverageGroup),active=members.filter(x=>x.active!==false),values=active.map(x=>daily.get(date+'|'+x.id)).filter(x=>x!=null);
        const target=values.length?Math.max(...values):active.some(x=>allowed(x,date))?t.coverageRequired:0;
        const start=minutes(t.start),end=minutes(t.end)+(t.end<=t.start?1440:0);
        const covered=assignments.filter(a=>{const model=members.find(x=>x.id===a.type);if(!model||a.date!==date)return false;const s=minutes(a.start||model.start),e=minutes(a.end||model.end);return s<=start&&e+(e<=s?1440:0)>=end});
        const own=assignments.filter(a=>a.date===date&&a.type===code).length;
        return own+(active[0]?.id===code?Math.max(0,target-new Set(covered.map(a=>a.employeeId)).size):0);
      }
      if(['OT1','OT2'].includes(code)&&types.find(x=>x.id==='OT2')?.morningOtMinimum&&!daily.has(date+'|OT1')&&!daily.has(date+'|OT2')){
        const previous=new Date(date+'T12:00:00');previous.setDate(previous.getDate()-1);
        const night=types.find(x=>x.id==='O3'),seen=new Set(assignments.filter(a=>{if(a.type!=='O3'||a.date!==localISO(previous))return false;const s=minutes(a.start||night?.start),e=minutes(a.end||night?.end);return s!==null&&e!==null&&s<=1800&&e+(e<=s?1440:0)>=1920}).map(a=>a.employeeId));
        if(seen.size>=types.find(x=>x.id==='OT2').morningOtMinimum){const own=assignments.filter(a=>a.date===date&&a.type==='OT1').length;return code==='OT1'?Math.min(raw(date,code),own):raw(date,code)+Math.max(0,raw(date,'OT1')-own)}
      }
      return raw(date,code);
    };
  }
  function objectSummary(coverage){
    const sum=key=>number(coverage.reduce((n,c)=>n+c[key],0));
    return{requiredDuties:sum('required'),openDuties:sum('open'),requiredHours:sum('requiredHours'),openHours:sum('openHours'),overstaffedDuties:sum('overstaffed')};
  }
  function buildPlan(source){
    const month=String(source.month||'');if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||Number(month.slice(0,4))<100)throw Error('Bitte einen gültigen Monat ab dem Jahr 0100 wählen.');
    const [year,m]=month.split('-').map(Number),count=new Date(year,m,0).getDate();
    const days=Array.from({length:count},(_,i)=>{const date=month+'-'+pad(i+1),d=new Date(date+'T12:00:00');return{date,day:i+1,weekday:d.toLocaleDateString('de-DE',{weekday:'short'}),weekend:[0,6].includes(d.getDay())}});
    const start=days[0].date,end=days[count-1].date;
    const shifts=(source.assignments||[]).filter(a=>String(a.date||'')>=start&&String(a.date||'')<=end).map(a=>{
      const employeeId=String(a.employeeId??a.employee_id??'');if(!employeeId)throw Error('Eine Schicht hat keine Mitarbeiterzuordnung. Bitte vor dem Export korrigieren.');
      const type=String(a.type||a.shift_code||''),template=(source.types||[]).find(t=>t.id===type)||source.typeById?.(type)||{};
      const from=a.start||template.start,to=a.end||template.end,sm=minutes(from),em=minutes(to);if(sm===null||em===null)throw Error('Für '+a.date+' / '+type+' fehlen gültige Schichtzeiten.');
      const duration=em<sm?em+1440-sm:em-sm;
      return{...a,employeeId,type,start:String(from).slice(0,5),end:String(to).slice(0,5),minutes:duration,hours:duration/60,overnight:em<sm,adjusted:!!(template.start&&template.end&&(String(from).slice(0,5)!==template.start.slice(0,5)||String(to).slice(0,5)!==template.end.slice(0,5))),published:!!a.publishedAt};
    }).sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start)||a.type.localeCompare(b.type));
    const assignedIds=new Set(shifts.map(a=>a.employeeId)),people=new Map();
    (source.employees||[]).forEach(e=>{
      const id=String(e.id),active=e.status==='active'&&(!e.startDate||e.startDate<=end)&&(!e.contractEnd||e.contractEnd>=start);
      if(active||assignedIds.has(id))people.set(id,{...e,id,name:[e.first,e.last].filter(Boolean).join(' ')||'Mitarbeiter ohne Namen',site:employeeSite(e),team:e.planningTeam||''});
    });
    assignedIds.forEach(id=>{if(!people.has(id))people.set(id,{id,name:'Ehemaliger Mitarbeiter',team:'',site:'',personnelNo:''})});
    const absences=(source.absences||[]).filter(a=>effective(a)&&String(a.startDate||a.start_date||a.date)<=end&&String(a.endDate||a.end_date||a.date||a.startDate)>=start);
    const rows=[...people.values()].sort((a,b)=>(display?.orderEnabled?.(source.companyId)??display?.enabled(source.companyId))?display.compare(a,b,source.companyId):String(a.team||'ZZ').localeCompare(String(b.team||'ZZ'))||a.name.localeCompare(b.name,'de')).map(person=>{
      const own=shifts.filter(a=>a.employeeId===person.id),ownAbs=absences.filter(a=>String(a.employeeId??a.employee_id)===person.id);
      const cells=days.map(day=>{
        const list=own.filter(a=>a.date===day.date),off=ownAbs.filter(a=>day.date>=String(a.startDate||a.start_date||a.date)&&day.date<=String(a.endDate||a.end_date||a.date||a.startDate));
        const labels=off.map(a=>(absenceCodes[a.type||a.absence_type]||'AB')+(a.fullDay===false?' (teilw.)':''));
        return{date:day.date,shifts:list,absences:off,excel:[...list.map(a=>a.type+' '+a.start+'–'+a.end+(a.overnight?' (+1 Tag)':'')),...labels].join('\n')||'–',pdf:[...list.map(a=>a.type+(a.adjusted?'*':'')),...labels].join('\n')||'–'};
      });
      const hours=number(own.reduce((n,a)=>n+a.minutes,0)/60),targetHours=monthlyTarget(person,source);
      return{person,color:display?.color(person,source.companyId)||null,cells,shiftCount:own.length,hours,targetHours,difference:targetHours===null?null:number(hours-targetHours)};
    });
    const types=new Map((source.types||[]).filter(t=>t.active!==false).map(t=>[t.id,t]));
    shifts.forEach(a=>{if(!types.has(a.type)){const t=source.typeById?.(a.type)||{};types.set(a.type,{id:a.type,name:t.name||a.type,start:t.start||a.start,end:t.end||a.end})}});
    shifts.forEach(a=>{const t=types.get(a.type);if(t?.start&&t?.end&&(a.start!==t.start.slice(0,5)||a.end!==t.end.slice(0,5)))a.adjusted=true});
    rows.forEach(r=>r.cells.forEach(c=>{const labels=c.absences.map(a=>(absenceCodes[a.type||a.absence_type]||'AB')+(a.fullDay===false?' (teilw.)':''));c.pdf=[...c.shifts.map(a=>a.type+(a.adjusted?'*':'')),...labels].join('\n')||'–'}));
    const details=shifts.map(a=>({...a,person:people.get(a.employeeId)}));
    const coverage=days.flatMap(day=>[...types.values()].map(type=>{const required=Math.max(0,Number(source.getSoll?.(day.date,type.id)||0)),own=shifts.filter(a=>a.date===day.date&&a.type===type.id),actual=own.length,open=Math.max(0,required-actual),sm=minutes(type.start),em=minutes(type.end);if(required&&(sm===null||em===null))throw Error('Für die SOLL-Stunden von '+type.id+' fehlen gültige Schichtzeiten.');const duration=sm===null||em===null?0:(em<sm?em+1440-sm:em-sm)/60;return{date:day.date,type:type.id,required,actual,open,overstaffed:Math.max(0,actual-required),actualHours:own.reduce((n,a)=>n+a.minutes,0)/60,requiredHours:required*duration,openHours:open*duration}}));
    return{...summarize(rows),objectTotals:objectSummary(coverage),month,start,end,days,rows,details,types:[...types.values()],coverage,company:source.company||'Unternehmen',createdAt:source.createdAt||new Date().toISOString(),label:new Date(start+'T12:00:00').toLocaleDateString('de-DE',{month:'long',year:'numeric'}),hours:number(shifts.reduce((n,a)=>n+a.minutes,0)/60),shiftCount:shifts.length,status:shifts.length&&shifts.every(a=>a.published)?'Veröffentlicht':shifts.some(a=>a.published)?'Teilweise veröffentlicht':'Entwurf'};
  }
  function selectPDFPlan(plan,scope='Gesamt'){
    if(!['Leipzig','Recklinghausen','Gesamt'].includes(scope))throw Error('Bitte Leipzig, Recklinghausen oder Gesamt für das PDF wählen.');
    if(scope==='Gesamt')return {...plan,pdfScope:scope};
    const rows=plan.rows.filter(row=>row.person.site===scope),ids=new Set(rows.map(row=>row.person.id)),details=plan.details.filter(shift=>ids.has(shift.employeeId));
    const codes=new Set(details.map(shift=>shift.type));
    return {...plan,...summarize(rows),objectTotals:null,pdfScope:scope,rows,details,types:plan.types.filter(type=>codes.has(type.id)),coverage:[],hours:number(details.reduce((sum,shift)=>sum+shift.minutes,0)/60),shiftCount:details.length,status:details.length&&details.every(shift=>shift.published)?'Veröffentlicht':details.some(shift=>shift.published)?'Teilweise veröffentlicht':'Entwurf'};
  }
  function workbookRows(plan){
    const head=['Personal-Nr.','Mitarbeiter','Team',...plan.days.map(d=>d.weekday+' '+pad(d.day)), 'Dienste','Plan-IST (h)','Monats-SOLL (h)','Differenz (h)'];
    const matrix=[['SchichtFunk – Gesamtdienstplan'],[plan.company,plan.label],['Planstand',plan.status],['Erstellt am',plan.createdAt],['Hinweis: Plan-IST = geplante Stunden ohne Pausenabzug. Differenz = Plan-IST minus Monats-SOLL. Keine erfassten Arbeitszeiten.'],[plan.assignedEmployeeCount+' / '+plan.employeeCount+' Mitarbeiter eingeplant · '+plan.shiftCount+' Dienste · Plan-IST '+plan.hours.toLocaleString('de-DE')+' h · Monats-SOLL '+plan.targetHours.toLocaleString('de-DE')+' h · Differenz '+(plan.difference===null?'–':(plan.difference>0?'+':'')+plan.difference.toLocaleString('de-DE'))+' h'],head,...plan.rows.map(r=>[r.person.personnelNo||'',r.person.name,r.person.team,...r.cells.map(c=>c.excel),r.shiftCount,r.hours,r.targetHours??'–',r.difference??'–'])];
    const details=[['Datum','Personal-Nr.','Mitarbeiter','Team','Schicht','Beginn','Ende','Ende am Folgetag','Planstunden','Planstand'],...plan.details.map(a=>[a.date,a.person.personnelNo||'',a.person.name,a.person.team,a.type,a.start,a.end,a.overnight?'Ja':'Nein',a.hours,a.published?'Veröffentlicht':'Entwurf'])];
    const coverage=[['Datum','Schicht','SOLL','IST','Offen','SOLL-Stunden','IST-Stunden (geplant)','Offene Stunden'],...plan.coverage.map(c=>[c.date,c.type,c.required,c.actual,c.open,number(c.requiredHours),number(c.actualHours),number(c.openHours)])];
    const legend=[['SchichtFunk – Hinweise'],['Unternehmen',plan.company],['Monat',plan.label],['Planstand',plan.status],['Mitarbeiter gesamt',plan.employeeCount],['Mitarbeiter eingeplant',plan.assignedEmployeeCount],['Dienste',plan.shiftCount],['Plan-IST gesamt (h)',plan.hours],['Monats-SOLL gesamt (h)',plan.targetHours],['Differenz gesamt (h)',plan.difference??'–'],['Fehlendes Monats-SOLL',plan.missingTargets],[],['Schicht','Bezeichnung','Beginn','Ende'],...plan.types.map(t=>[t.id,t.name||t.id,t.start||'',t.end||'']),[],['Abwesenheiten','U = Urlaub, K = Krank, F = Frei, FB = Fortbildung, SP = Sperrzeit, SU = Sonderurlaub, AB = Sonstiges'],['Leere Felder','– = kein Dienst eingetragen; bedeutet nicht automatisch Frei'],['Stunden','Plan-IST = geplante Schichtdauer ohne Pausenabzug. Keine IST-Zeiterfassung.'],['Monats-SOLL','Persönliches Monatsziel aus dem Mitarbeiterprofil; andernfalls Wochenstunden × 4,348. – = kein Ziel hinterlegt.'],['Differenz','Plan-IST minus Monats-SOLL. Minus = Stunden fehlen, Plus = über SOLL. Bei fehlenden Zielen keine Gesamtdifferenz.']];
    if(plan.objectTotals)legend.push([],['Objekt-SOLL gesamt (h)',plan.objectTotals.requiredHours],['Benötigte Dienste',plan.objectTotals.requiredDuties],['Offene Dienste',plan.objectTotals.openDuties],['Offene Stunden',plan.objectTotals.openHours],['Objekt-SOLL','Benötigte Besetzung je Datum und Schicht, unabhängig von persönlichen Mitarbeiterzielen.']);
    return{matrix,details,coverage,legend};
  }
  return{buildPlan,workbookRows,selectPDFPlan,staffingResolver};
});
