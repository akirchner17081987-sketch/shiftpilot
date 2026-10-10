// Pure analytics. Identical calculations power the dashboard and both exports.
(function(root,factory){
 const api=factory(typeof module==='object'&&module.exports?require('./solid-planning-core-v1.js'):root.SFSolidPlanningCore,typeof module==='object'&&module.exports?require('./ot-weekend-holiday-policy.js'):root.SFOtPolicy);
 if(typeof module==='object'&&module.exports)module.exports=api;else root.SFReportsCore=api;
})(typeof window==='undefined'?globalThis:window,function(S,OT){
 'use strict';
 const D=86400000,M=60000,collator=new Intl.Collator('de',{numeric:true,sensitivity:'base'});
 const plus=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*D).toISOString().slice(0,10);
 const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&plus(d,0)===d;
 const days=(a,b)=>{if(!valid(a)||!valid(b)||a>b||Date.parse(b)-Date.parse(a)>365*D)throw Error('Bitte einen Zeitraum von höchstens 366 Tagen auswählen.');const out=[];for(let d=a;d<=b;d=plus(d,1))out.push(d);return out};
 const monthLast=d=>new Date(Date.UTC(+d.slice(0,4),+d.slice(5,7),0)).toISOString().slice(0,10);
 const weekday=d=>new Date(d+'T12:00:00Z').getUTCDay()||7;
 function period(mode,anchor){if(!valid(anchor))throw Error('Bitte ein gültiges Bezugsdatum auswählen.');let from=anchor,to=anchor;
  if(mode==='week'){from=plus(anchor,1-weekday(anchor));to=plus(from,6)}
  if(mode==='month'){from=anchor.slice(0,7)+'-01';to=monthLast(from)}
  if(mode==='quarter'){const m=Math.floor((+anchor.slice(5,7)-1)/3)*3+1;from=anchor.slice(0,4)+'-'+String(m).padStart(2,'0')+'-01';to=monthLast(shiftMonth(from,2))}
  if(mode==='year'){from=anchor.slice(0,4)+'-01-01';to=anchor.slice(0,4)+'-12-31'}return {from,to};
 }
 function shiftMonth(d,n){const x=new Date(Date.UTC(+d.slice(0,4),+d.slice(5,7)-1+n,1));return x.toISOString().slice(0,10)}
 function previous(mode,from,to){if(['month','quarter','year'].includes(mode))return period(mode,shiftMonth(from,mode==='month'?-1:mode==='quarter'?-3:-12));return{from:plus(from,-days(from,to).length),to:plus(from,-1)}}
 function chunks(from,to){days(from,to);const out=[];for(let d=from;d<=to;){const end=monthLast(d)<to?monthLast(d):to;out.push({from:d,to:end});d=plus(end,1)}return out}
 const unique=(rows,key='id')=>[...new Map(rows.map(x=>[x[key],x])).values()];
 function merge(parts){if(!parts.length)throw Error('Keine Auswertungsdaten vorhanden.');const first=parts[0],people=new Map();
  for(const p of parts){if(p.company_id!==first.company_id||p.timezone!==first.timezone||p.can_time!==first.can_time)throw Error('Der Unternehmenszugang hat sich geändert. Bitte neu laden.');
   for(const e of p.employees){let row=people.get(e.id);if(!row){row={...e};for(const k of ['target_minutes','elapsed_target_minutes','credit_minutes','elapsed_credit_minutes','confirmed_minutes'])row[k]=0;people.set(e.id,row)}
    for(const k of ['target_minutes','elapsed_target_minutes','credit_minutes','elapsed_credit_minutes','confirmed_minutes'])row[k]+=Number(e[k]||0);
   }
  }
  return {...first,from:parts[0].from,to:parts.at(-1).to,as_of:parts.map(p=>p.as_of).sort()[0],closed_month:parts.some(p=>p.closed_month),employees:[...people.values()],assignments:unique(parts.flatMap(p=>p.assignments)),times:unique(parts.flatMap(p=>p.times)),qr:unique(parts.flatMap(p=>p.qr)),absences:unique(parts.flatMap(p=>p.absences)),daily:unique(parts.flatMap(p=>p.daily).map(x=>({...x,id:x.date+'|'+x.shift})))};
 }
 function unionMinutes(rows,from,to){const intervals=rows.map(r=>[Math.max(Date.parse(r.start),from),Math.min(Date.parse(r.end)-Math.max(0,Number(r.break_minutes||0))*M,to)]).filter(([s,e])=>Number.isFinite(s)&&Number.isFinite(e)&&e>s).sort((a,b)=>a[0]-b[0]);let total=0,last=null;
  for(const [s,e] of intervals){if(last&&s<=last[1])last[1]=Math.max(last[1],e);else{if(last)total+=last[1]-last[0];last=[s,e]}}if(last)total+=last[1]-last[0];return total/M;
 }
 const approved=a=>['Genehmigt','Erfasst','APPROVED'].includes(a.status);
 function analyze(data,filters={}){
  const allDays=days(data.from,data.to),tz=data.timezone||'Europe/Berlin',now=Date.parse(data.as_of),begin=S.instant(data.from,'00:00',tz),finish=S.instant(plus(data.to,1),'00:00',tz),today=data.today;
  const types=data.models,active=types.filter(t=>t.active!==false),model=new Map(types.map(t=>[t.code,t])),overrides=new Map(data.daily.map(x=>[x.date+'|'+x.shift,Number(x.required)]));
  const siteMatch=r=>!filters.site||(filters.site==='unassigned'?!r.site_id:r.site_id===filters.site),shiftMatch=r=>!filters.shift||(filters.shift==='QR'?!r.shift:r.shift===filters.shift);
  const allAssignments=data.assignments.filter(a=>a.status!=='CANCELLED');
  const eligible=e=>(!filters.team||(filters.team==='none'?!e.team:e.team===filters.team))&&(!filters.employee||e.id===filters.employee)&&
    (!filters.shift||filters.shift==='QR'||e.shifts?.includes(filters.shift)||allAssignments.some(a=>a.employee_id===e.id&&a.shift===filters.shift));
  const people=data.employees.filter(eligible).filter(e=>filters.status==='all'||e.status==='active'||allAssignments.some(a=>a.employee_id===e.id&&a.date>=data.from&&a.date<=data.to)||[...data.times,...data.qr].some(t=>t.employee_id===e.id))
    .filter(e=>!filters.site||allAssignments.some(a=>a.employee_id===e.id&&a.date>=data.from&&a.date<=data.to&&siteMatch(a))||data.qr.some(q=>q.employee_id===e.id&&siteMatch(q))||data.sites.some(s=>s.id===filters.site&&s.name===e.site_name)||filters.site==='unassigned'&&e.status==='active'&&!(e.site_name&&data.sites.some(s=>s.name===e.site_name)))
    .sort((a,b)=>collator.compare(a.last,b.last)||collator.compare(a.first,b.first)||collator.compare(a.personnel_no,b.personnel_no)||collator.compare(a.id,b.id));
  const ids=new Set(people.map(e=>e.id)),scope=!!(filters.site||filters.shift),selected=a=>ids.has(a.employee_id)&&siteMatch(a)&&shiftMatch(a);
  const assignments=allAssignments.filter(a=>a.date>=data.from&&a.date<=data.to&&selected(a)),absence=data.absences.filter(a=>ids.has(a.employee_id)&&a.from<=data.to&&a.to>=data.from),timeRows=[...data.times,...data.qr].filter(selected);
  const completed=timeRows.filter(r=>r.start&&r.end&&Date.parse(r.end)<=now&&['recorded','correction_requested','confirmed','qr_booked'].includes(r.status));
  const accepted=completed.filter(r=>['confirmed','qr_booked'].includes(r.status));
  const plannedMinutes=a=>Math.max(0,(Date.parse(a.end)-Date.parse(a.start))/M-Math.max(0,Number(a.break_minutes||0)));
  const night=a=>{for(let d=plus(a.date,-1);d<=plus(a.date,1);d=plus(d,1))if(Date.parse(a.start)<S.instant(plus(d,1),'06:00',tz)&&Date.parse(a.end)>S.instant(d,'22:00',tz))return true;return false};
  const absenceOverlap=(a,b)=>{if(!approved(b)||a.employee_id!==b.employee_id)return false;const x=Math.max(Date.parse(a.start),S.instant(b.from,b.full_day===false?b.start_time?.slice(0,5)||'00:00':'00:00',tz)),y=Math.min(Date.parse(a.end),S.instant(b.full_day===false?b.to:plus(b.to,1),b.full_day===false?b.end_time?.slice(0,5)||'23:59':'00:00',tz));return x<y};
  const employeeRows=people.map(e=>{const own=assignments.filter(a=>a.employee_id===e.id),off=absence.filter(a=>a.employee_id===e.id&&approved(a));
   const available=allDays.filter(d=>(!e.start_date||d>=e.start_date)&&(!e.contract_end||d<=e.contract_end)&&!off.some(a=>a.full_day!==false&&a.from<=d&&a.to>=d));
   const plan=own.reduce((n,a)=>n+plannedMinutes(a),0),captured=unionMinutes(completed.filter(r=>r.employee_id===e.id),begin,finish),confirmed=scope?unionMinutes(accepted.filter(r=>r.employee_id===e.id),begin,finish):Number(e.confirmed_minutes||0);
   const nights=own.filter(night).length,weekends=own.filter(a=>weekday(a.date)>5).length,extra=own.filter(a=>a.extra||model.get(a.shift)?.planning_mode==='optional').length;
   const target=Number(e.target_minutes||0),credit=Number(e.credit_minutes||0),elapsedTarget=Number(e.elapsed_target_minutes||0),elapsedCredit=Number(e.elapsed_credit_minutes||0);
   return {...e,name:[e.last,e.first].filter(Boolean).join(', '),plan,captured:data.can_time?captured:null,confirmed:data.can_time?confirmed:null,target,credit,elapsedTarget,elapsedCredit,
    remaining:scope?null:Math.max(0,target-credit-plan),planRatio:!scope&&target>credit?plan/(target-credit):null,
    elapsedBalance:!scope&&data.can_time&&today>=data.from?confirmed+elapsedCredit-elapsedTarget:null,
    duties:own.length,nights,weekends,extra,availableDays:available.length,nightRate:available.length?nights/available.length*30:null,weekendRate:target>0?weekends/(target/60)*100:null,
    review:timeRows.filter(r=>r.employee_id===e.id&&['recorded','correction_requested'].includes(r.status)).length,
    conflict:own.filter(a=>off.some(b=>absenceOverlap(a,b))).length};
  });
  function raw(date,t){const override=overrides.get(date+'|'+t.code),dow=weekday(date),allowed=t.optional_weekdays||[1,2,3,4,5,6,7];
   if(t.code==='OT'){if(!OT.applies(date,Object.values(data.rules.otHolidayStatesBySite||{Berlin:'BE'})))return 0;return override??(t.planning_mode==='optional'?0:Number(data.global[t.code]||0))}
   if(t.strict_weekdays&&!allowed.includes(dow))return 0;return override??(t.planning_mode==='optional'||!allowed.includes(dow)?0:Number(data.global[t.code]||0));
  }
  const dutyRows=allAssignments.map(a=>({...a,type:a.shift,employeeId:a.employee_id,startMs:Date.parse(a.start),endMs:Date.parse(a.end)}));
  const cells=[],groups=new Set();
  const requested=filters.shift==='QR'?[]:active.filter(t=>(!filters.shift||t.code===filters.shift)&&siteMatch(t));
  for(const t of requested){const group=t.coverage_group,key=group||t.code;if(groups.has(key))continue;groups.add(key);
   const members=group?types.filter(m=>m.coverage_group===group):[t],codes=members.map(m=>m.code),liveMembers=members.filter(m=>m.active!==false);
   for(const date of allDays){let required;
    if(group){const values=liveMembers.map(m=>overrides.get(date+'|'+m.code)).filter(v=>v!==undefined);required=values.length?Math.max(...values):liveMembers.some(m=>(m.optional_weekdays||[1,2,3,4,5,6,7]).includes(weekday(date)))?Number(t.coverage_required||0):0}
    else{required=S.required(date,t.code,dutyRows,{...data.rules,timezone:tz})??raw(date,t);
     if(!data.rules.enabled&&['OT1','OT2'].includes(t.code)&&model.get('OT2')?.morning_ot_switch_min&&!overrides.has(date+'|OT1')&&!overrides.has(date+'|OT2')){const seen=new Set(allAssignments.filter(a=>a.shift==='O3'&&a.date===plus(date,-1)&&Date.parse(a.start)<=S.instant(date,'06:00',tz)&&Date.parse(a.end)>=S.instant(date,'08:00',tz)).map(a=>a.employee_id));if(seen.size>=model.get('OT2').morning_ot_switch_min){const own=allAssignments.filter(a=>a.date===date&&a.shift==='OT1').length;if(t.code==='OT1')required=Math.min(required,own);else required+=Math.max(0,raw(date,model.get('OT1'))-own)}}
    }
    const start=S.instant(date,t.default_start.slice(0,5),tz),end=S.instant(t.default_end<=t.default_start?plus(date,1):date,t.default_end.slice(0,5),tz);
    const bookings=allAssignments.filter(a=>a.date===date&&codes.includes(a.shift)&&(!group||Date.parse(a.start)<=start&&Date.parse(a.end)>=end));
    const filled=new Set(bookings.map(a=>a.employee_id)).size,missing=Math.max(0,required-filled),wanted=t.planning_mode==='optional'&&(t.optional_weekdays||[1,2,3,4,5,6,7]).includes(weekday(date))?Number(t.optional_staffing||0):0;
    cells.push({date,key,code:t.code,label:group||t.code,codes,required,filled,missing,optional:wanted,optionalMissing:Math.max(0,wanted-filled),site_id:t.site_id,shared:!!group,state:required===0?'neutral':missing===0?'good':filled?'warn':'bad'});
   }
  }
  const calendar=allDays.map(date=>{const own=cells.filter(c=>c.date===date),required=own.reduce((n,c)=>n+c.required,0),missing=own.reduce((n,c)=>n+c.missing,0);return{date,required,filled:required-missing,missing,ratio:required?1-missing/required:null,optionalMissing:own.reduce((n,c)=>n+c.optionalMissing,0),state:required===0?'neutral':missing===0?'good':missing<required?'warn':'bad'}});
  const alerts=cells.filter(c=>c.missing).map(c=>({kind:'coverage',date:c.date,shift:c.code,title:c.label+' · '+c.missing+' Positionen offen',detail:'Besetzt '+c.filled+' / Bedarf '+c.required+(c.shared?' · gemeinsame Besetzung':''),count:c.missing}));
  for(const a of assignments){const e=employeeRows.find(e=>e.id===a.employee_id);for(const off of absence.filter(b=>absenceOverlap(a,b)))alerts.push({kind:'absence',date:a.date,shift:a.shift,assignment:a.id,employee:e.id,title:e.name+' · Abwesenheitskonflikt',detail:a.shift+' überschneidet sich mit '+off.type,count:1});
   if(data.can_time&&Date.parse(a.end)<=now){const te=data.times.find(t=>t.id===a.id);if(!te?.start&&!data.qr.some(q=>q.employee_id===a.employee_id&&q.end&&Date.parse(q.start)<=Date.parse(a.start)&&Date.parse(q.end)>=Date.parse(a.end)))alerts.push({kind:'missingTime',date:a.date,shift:a.shift,assignment:a.id,employee:e.id,title:e.name+' · Ist-Zeit fehlt',detail:a.shift+' ist beendet; Zeitmeldung prüfen.',count:1});}
  }
  for(const t of data.can_time?timeRows:[]){const e=employeeRows.find(e=>e.id===t.employee_id);if(['recorded','correction_requested'].includes(t.status))alerts.push({kind:'review',date:t.date,assignment:t.id,employee:e.id,title:e.name+' · '+(t.status==='recorded'?'Zeit zur Prüfung':'Korrektur angefordert'),detail:t.shift+' · Zeiterfassung öffnen',count:1});if(t.status==='qr_running')alerts.push({kind:'running',date:today,employee:e.id,title:e.name+' · QR-Dienst läuft',detail:'Laufende Zeit wird noch nicht als abgeschlossene Arbeitszeit gezählt.',count:1});}
  alerts.sort((a,b)=>({absence:0,review:1,missingTime:2,coverage:3,running:4}[a.kind]-{absence:0,review:1,missingTime:2,coverage:3,running:4}[b.kind])||(a.date||'').localeCompare(b.date||'')||collator.compare(a.title,b.title));
  const required=cells.reduce((n,c)=>n+c.required,0),missing=cells.reduce((n,c)=>n+c.missing,0),sum=k=>employeeRows.reduce((n,e)=>n+Number(e[k]||0),0);
  const summary={plan:sum('plan'),captured:data.can_time?sum('captured'):null,confirmed:data.can_time?sum('confirmed'):null,target:sum('target'),credit:sum('credit'),elapsedTarget:sum('elapsedTarget'),required,missing,coverage:required?(required-missing)/required:null,
   underTarget:scope?null:employeeRows.filter(e=>e.remaining>1).length,review:alerts.filter(a=>a.kind==='review').length,absenceConflicts:alerts.filter(a=>a.kind==='absence').length,duties:assignments.length,people:employeeRows.length,
   qrMinutes:data.can_time?people.reduce((n,e)=>n+unionMinutes(data.qr.filter(q=>q.employee_id===e.id&&selected(q)&&q.end&&Date.parse(q.end)<=now),begin,finish),0):null};
  const absenceSummary=[...new Set(absence.map(a=>a.type))].map(type=>{const rows=absence.filter(a=>a.type===type&&approved(a)),count=new Set(rows.map(a=>a.employee_id)).size,dayCount=new Set(rows.flatMap(a=>allDays.filter(d=>d>=a.from&&d<=a.to).map(d=>a.employee_id+'|'+d))).size;return{type,people:count,days:dayCount,pending:absence.filter(a=>a.type===type&&!approved(a)).length}});
  return {data,filters,scope,employeeRows,assignments,timeRows,calendar,cells,alerts,summary,absenceSummary,mix:[...new Set(assignments.map(a=>a.shift))].map(code=>({code,count:assignments.filter(a=>a.shift===code).length,minutes:assignments.filter(a=>a.shift===code).reduce((n,a)=>n+plannedMinutes(a),0)}))};
 }
 return {valid,days,plus,weekday,period,previous,chunks,shiftMonth,monthLast,merge,unionMinutes,analyze};
});
