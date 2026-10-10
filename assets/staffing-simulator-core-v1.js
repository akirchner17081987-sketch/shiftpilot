// Isolated what-if planning. Never imports a backend or mutates application state.
(function(root,factory){const node=typeof module==='object'&&module.exports,api=factory(node?require('./solid-planning-core-v1.js'):root.SFSolidPlanningCore,node?require('./month-optimizer-core-v1.js'):root.SFMonthOptimizerCore,node?require('./ot-weekend-holiday-policy.js'):root.SFOtPolicy);if(node)module.exports=api;else root.SFStaffingSimulatorCore=api})(typeof window==='undefined'?globalThis:window,function(S,O,OT){
 'use strict';
 const H=3600000,clone=x=>JSON.parse(JSON.stringify(x)),meta=(e,k)=>String((e.qualifications||[]).find(q=>String(q).startsWith('__sp:'+k+'='))||'').split('=').slice(1).join('=');
 const plus=S.plus,monthNext=m=>new Date(Date.UTC(+m.slice(0,4),+m.slice(5,7),1)).toISOString().slice(0,10),round=x=>Math.round(x*100)/100;
 const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')&&Number.isFinite(Date.parse(d+'T12:00Z'))&&plus(d,0)===d;
 const days=(from,to)=>{const a=[];for(let d=from;d<=to;d=plus(d,1))a.push(d);return a};
 function number(v,min,max,label){const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)throw Error(label+' liegt außerhalb des erlaubten Bereichs.');return n}
 function validate(data,config){
  if(!S.confirmed(data.rules))throw Error('Der Simulator benötigt die bestätigten Erholungsregeln (Version 2).');
  if(!valid(data.from)||!valid(data.to)||data.to<data.from||Date.parse(data.to)-Date.parse(data.from)>366*86400000)throw Error('Ungültiger Simulationszeitraum.');
  const c=clone(config),ids=new Set(data.employees.map(e=>e.id));c.name=String(c.name||'Variante').trim().slice(0,80);
  c.hires=number(c.hires||0,0,20,'Neue Mitarbeiter');if(!Number.isInteger(c.hires))throw Error('Mitarbeiterzahl muss ganzzahlig sein.');
  if(c.hires&&!ids.has(c.templateId))throw Error('Bitte ein verfügbares Referenzprofil für die Einstellungen wählen.');
  c.hireHours=number(c.hireHours??180,1,190,'Vertragsstunden neuer Mitarbeiter');c.hireWeekly=number(c.hireWeekly??40,1,40,'Wochenmaximum neuer Mitarbeiter');
  for(const k of ['hourCost','hireHourCost'])c[k]=c[k]===''||c[k]==null?null:number(c[k],0,500,'Arbeitgeberkosten pro Stunde');
  if(c.changeId){if(!ids.has(c.changeId))throw Error('Das gewählte Vertragsprofil ist nicht mehr verfügbar.');c.changeHours=number(c.changeHours,1,190,'Geänderte Vertragsstunden');c.changeWeekly=number(c.changeWeekly??40,1,40,'Geändertes Wochenmaximum');}
  c.extraCount=number(c.extraCount||0,0,20,'Zusätzlicher Bedarf');if(!Number.isInteger(c.extraCount))throw Error('Zusätzlicher Bedarf muss ganzzahlig sein.');
  if(c.extraCount&&!data.models.some(t=>t.code===c.extraShift&&t.active!==false))throw Error('Bitte ein aktives Schichtmodell für den Mehrbedarf wählen.');
  if(c.outageId){if(!ids.has(c.outageId))throw Error('Das gewählte Ausfallprofil ist nicht mehr verfügbar.');if(!valid(c.outageFrom)||!valid(c.outageTo)||c.outageFrom>c.outageTo||c.outageFrom<data.from||c.outageTo>data.to)throw Error('Der angenommene Ausfall muss innerhalb des Simulationszeitraums liegen.');}
  return c;
 }
 function staff(data,c){
  const people=clone(data.employees).map(e=>({...e,monthlyHours:Number(meta(e,'monthlyHours'))||(/^Vollzeit(?:\s+180)?$/i.test(e.employment)?180:Number(e.weeklyHours||40)*4.348),weeklyLimit:Number(meta(e,'maxWeekly'))||Number(e.weeklyHours)||40}));
  const contract=(e,h,w)=>Object.assign(e,{monthlyHours:h,weeklyLimit:w,employment:h>=180?'Vollzeit':'Teilzeit',qualifications:(e.qualifications||[]).filter(q=>!/^__sp:(monthlyHours|maxWeekly)=/.test(q))});
  if(c.changeId)contract(people.find(e=>e.id===c.changeId),c.changeHours,c.changeWeekly);
  if(c.hires){const source=people.find(e=>e.id===c.templateId);for(let i=0;i<c.hires;i++){const e=clone(source);Object.assign(e,{id:'simulation-hire-'+i,personnelNo:'',first:'Neue Stelle',last:String(i+1),startDate:data.from,contractEnd:null,hypothetical:true});e.qualifications=e.qualifications.filter(q=>!/^__sp:(availability|personnel)/.test(q));contract(e,c.hireHours,c.hireWeekly);people.push(e)}}
  return people;
 }
 function absenceInterval(a,zone){let from=a.from,to=a.to,start=a.fullDay===false?(a.startTime||'00:00').slice(0,5):'00:00',end=a.fullDay===false?(a.endTime||'23:59').slice(0,5):'00:00';if(a.fullDay!==false||from===to&&end<=start)to=plus(to,1);return{start:S.instant(from,start,zone),end:S.instant(to,end,zone)}}
 function eligibility(e,t,date,data,off){
  if(!(e.shifts||[]).includes(t.code))return 'Schichtfreigabe fehlt';
  if(meta(e,'availability')==='red'||e.startDate&&date<e.startDate||e.contractEnd&&date>e.contractEnd)return 'Verfügbarkeit oder Vertragszeitraum';
  const no=String(e.personnelNo||''),exclusive=data.models.find(x=>x.active!==false&&x.exclusive_employees&&x.allowed_personnel_nos?.map(String).includes(no));
  if(exclusive&&exclusive.code!==t.code||t.allowed_personnel_nos&&!t.allowed_personnel_nos.map(String).includes(no)||t.responsible_only&&t.responsible_employee_id!==e.id)return 'Persönliche Schichtbindung';
  if(t.requires_planning_team&&!['A','B','C','D','E'].includes(meta(e,'planningTeam')))return 'Planungsteam fehlt';
  if(t.strict_weekdays&&!t.optional_weekdays.includes(S.weekday(date)))return 'Einsatztag passt nicht';
  if(t.code.toLowerCase()==='teamleiter'&&!/teamleiter|schichtleiter/i.test(e.role||''))return 'Leitungsrolle fehlt';
  const mapping=data.rules.otHolidayStatesBySite;if(t.code==='OT'&&mapping&&!OT.applies(date,[OT.siteState(meta(e,'team'),mapping)]))return 'Kein OT-Tag am Einsatzort';
  const r=e.rhythms?.[date];if(r?.mode==='required'&&!(r.exemptOt&&['OT1','OT2','OT3'].includes(t.code))&&r.expected!=='ALLE'&&r.expected!==t.code.toUpperCase())return 'Verbindlicher Rhythmus';
  const iv=S.interval(date,t.default_start,t.default_end,data.timezone);if((iv.end-iv.start)/H>10+.000001)return 'Schicht länger als 10 Stunden';
  if(off.some(a=>a.employeeId===e.id&&a.start<iv.end&&a.end>iv.start))return 'Abwesenheit oder angenommener Ausfall';return '';
 }
 function cells(data,config,dates,rows){
  const active=data.models.filter(t=>t.active!==false),overrides=new Map(data.daily.map(d=>[d.date+'|'+d.shift,Number(d.required)])),out=[];
  for(const date of dates){const done=new Set();for(const t of active){const group=t.coverage_group,key=date+'|'+(group||t.code);if(done.has(key))continue;done.add(key);
   const members=group?active.filter(v=>v.coverage_group===group):[t],possible=members.filter(v=>!v.strict_weekdays||v.optional_weekdays.includes(S.weekday(date))),alternatives=possible.filter(v=>v.code==='OT'&&data.rules.otHolidayStatesBySite?OT.applies(date,Object.values(data.rules.otHolidayStatesBySite)):v.optional_weekdays.includes(S.weekday(date))||overrides.has(date+'|'+v.code));
   let required=0;
   if(group){const values=members.filter(v=>overrides.has(date+'|'+v.code)).map(v=>overrides.get(date+'|'+v.code));required=values.length?Math.max(...values):alternatives.length?Math.max(...members.map(v=>Number(v.coverage_required)||0)):0;}
   else{const override=overrides.get(date+'|'+t.code);required=t.strict_weekdays&&!possible.length?0:override??(t.planning_mode==='optional'||!alternatives.length?0:Number(data.global[t.code])||0);const conditional=S.required(date,t.code,rows,data.rules);if(conditional!==null)required=conditional;}
   if(t.code==='OT'&&data.rules.otHolidayStatesBySite&&!OT.applies(date,Object.values(data.rules.otHolidayStatesBySite)))required=0;
   const minimum=(data.rules.criticalShifts||[]).find(r=>r.code===t.code&&(!r.weekdays?.length||r.weekdays.includes(S.weekday(date))));if(minimum)required=Math.max(required,Number(minimum.minimum)||0);if(group&&(data.rules.criticalCoverageGroups||[]).includes(group))required=Math.max(required,...members.map(v=>Number(v.coverage_required)||0));
   const extra=config.extraCount&&members.some(v=>v.code===config.extraShift)&&alternatives.length?config.extraCount:0;required+=extra;
   const iv=S.interval(date,t.default_start,t.default_end,data.timezone),covered=new Set(rows.filter(a=>a.date===date&&members.some(v=>v.code===a.type)&&a.startMs<=iv.start&&a.endMs>=iv.end).map(a=>a.employeeId)).size;
   out.push({date,key,type:t.code,alternatives:alternatives.map(v=>v.code),required,missing:Math.max(0,required-covered),hours:(iv.end-iv.start)/H,group:group||null,extra});
  }}return out;
 }
 const contractTarget=(e,month)=>{const first=month+'-01',last=plus(monthNext(first),-1),all=days(first,last),available=all.filter(d=>(!e.startDate||d>=e.startDate)&&(!e.contractEnd||d<=e.contractEnd));return e.monthlyHours*available.length/all.length};
 async function run(data,config,{yieldStep=()=>Promise.resolve(),progress=()=>{},iterations=4}={}){
  data={...data,rules:{...data.rules,timezone:data.timezone}};
  const c=validate(data,config),people=staff(data,c),policy={...data.rules,timezone:data.timezone},dates=days(data.from,data.to),months=[...new Set(dates.map(d=>d.slice(0,7)))],types=data.models.filter(t=>t.active!==false).map(t=>({...t,id:t.code,start:t.default_start.slice(0,5),end:t.default_end.slice(0,5)}));
  const off=[...data.absences,...(c.outageId?[{employeeId:c.outageId,from:c.outageFrom,to:c.outageTo,fullDay:true}]:[])].map(a=>({...a,...absenceInterval(a,data.timezone)}));
  const boundary=(data.boundary||[]).filter(a=>people.some(e=>e.id===a.employeeId)).map(a=>({...S.duty(a,policy),hours:(a.endMs-a.startMs)/H,day:Math.floor(Date.parse(a.date+'T12:00:00Z')/86400000)})),preview=[],diagnoses=[];
  for(const month of months){progress({month,phase:"prepare",iteration:0,iterations});await yieldStep();const monthDates=dates.filter(d=>d.startsWith(month)),base=[...boundary,...preview],slots=cells(data,c,monthDates,base),capacities=slots.map(s=>[s.key,s.missing]);
   const employees=people.map(e=>({...e,target:contractTarget(e,month),...S.limits(e,types,policy),maxConsecutive:Math.min(4,Number(meta(e,'maxConsecutive'))||4)}));
   const groups=[],critical=new Map(),slotByKey=new Map(slots.map(s=>[s.key,s]));
   for(const slot of slots){const rule=(policy.criticalShifts||[]).find(r=>r.code===slot.type&&(!r.weekdays?.length||r.weekdays.includes(S.weekday(slot.date))));if(rule||slot.group&&(policy.criticalCoverageGroups||[]).includes(slot.group))critical.set(slot.key,Math.min(slot.missing,rule?rule.minimum:slot.required));}
   for(const e of employees){const choices=new Map();for(const date of monthDates){const list=[];for(const t of types){const slot=slotByKey.get(date+'|'+(t.coverage_group||t.code));if(!slot?.missing||!slot.alternatives.includes(t.code)||eligibility(e,t,date,data,off))continue;list.push({employeeId:e.id,date,type:t.code,start:t.start,end:t.end,resource:slot.key});}choices.set(date,list)}
    for(const date of monthDates){const options=[];for(const first of choices.get(date)||[]){let block=[];for(let n=0;n<4;n++){const a=choices.get(plus(date,n))?.find(a=>a.type===first.type);if(!a)break;block=[...block,a];options.push(block)}}if(options.length)groups.push({id:e.id+'|'+date,employee:e,block:true,options});}
   }
   // Extra conditional demand is represented separately from the company's fallback rule.
   const required=(date,code,rows)=>{const value=S.required(date,code,rows,policy);return value===null?null:value+(slotByKey.get(date+'|'+code)?.extra||0)};
   const accept=(e,own,option)=>{const touched=new Set(option.flatMap(a=>[a.date.slice(0,7),S.localDate(a.endMs-1,policy).slice(0,7)]));for(const m of touched){const start=S.instant(m+'-01','00:00',data.timezone),end=S.instant(monthNext(m+'-01'),'00:00',data.timezone);if([...own,...option].reduce((n,a)=>n+Math.max(0,Math.min(a.endMs,end)-Math.max(a.startMs,start))/H,0)>e.calendarLimit+1e-6)return false;}return true};
   const input={month,employees,base,groups,capacities,criticalBeamWidth:16,respectHours:true,solidRules:policy,required,accept,criticalCapacities:[...critical]};
   const found=await O.optimize(input,{iterations,yieldStep,progress:p=>progress({month,...p})});preview.push(...found.preview.map(a=>S.duty(a,policy)));
  }
  const all=[...boundary,...preview],errors=[];
  for(const e of people){const own=all.filter(a=>a.employeeId===e.id),changed=preview.filter(a=>a.employeeId===e.id).map(a=>a.date);if(!changed.length)continue;
   errors.push(...S.errors(e,own,policy,changed));const limits=S.limits(e,types,policy);
   for(const month of months){const start=S.instant(month+'-01','00:00',data.timezone),end=S.instant(monthNext(month+'-01'),'00:00',data.timezone),hours=own.reduce((n,a)=>n+Math.max(0,Math.min(a.endMs,end)-Math.max(a.startMs,start))/H,0),started=own.filter(a=>a.date.startsWith(month)&&!a._marketApproved);if(hours>limits.calendarLimit+1e-6||started.length>limits.maxMonthlyShifts||started.reduce((n,a)=>n+a.hours,0)>limits.monthLimit+1e-6)errors.push({employeeId:e.id,date:month,message:'Monatsgrenze überschritten.'});}
  }
  if(errors.length)throw Error('Die Vorschau hat die abschließende Regelprüfung nicht bestanden: '+errors[0].date+' · '+errors[0].message);
  const coverage=cells(data,c,dates,all),byMonth=months.map(month=>{const these=coverage.filter(x=>x.date.startsWith(month));return{month,required:these.reduce((n,x)=>n+x.required,0),open:these.reduce((n,x)=>n+x.missing,0),openHours:round(these.reduce((n,x)=>n+x.missing*x.hours,0))}});
  const rows=people.map(e=>{const monthly=months.map(month=>{const start=S.instant(month+'-01','00:00',data.timezone),end=S.instant(monthNext(month+'-01'),'00:00',data.timezone),planned=preview.filter(a=>a.employeeId===e.id).reduce((n,a)=>n+Math.max(0,Math.min(a.endMs,end)-Math.max(a.startMs,start))/H,0);return{month,target:round(contractTarget(e,month)),planned:round(planned)}});return{id:e.id,name:(e.first+' '+e.last).trim(),hypothetical:!!e.hypothetical,monthly,target:round(monthly.reduce((n,r)=>n+r.target,0)),planned:round(monthly.reduce((n,r)=>n+r.planned,0)),missing:round(monthly.reduce((n,r)=>n+Math.max(0,r.target-r.planned),0))}});
  for(const cell of coverage.filter(x=>x.missing)){const reasons=new Map();for(const e of people){const msgs=cell.alternatives.map(code=>eligibility(e,types.find(t=>t.code===code),cell.date,data,off)),reason=msgs.some(x=>!x)?'Stunden, Erholung oder Verteilung im gefundenen Plan':msgs[0]||'Einsatztag passt nicht';reasons.set(reason,(reasons.get(reason)||0)+1)}diagnoses.push({...cell,reasons:[...reasons].map(([reason,count])=>({reason,count}))});}
  const required=coverage.reduce((n,r)=>n+r.required,0),open=coverage.reduce((n,r)=>n+r.missing,0),costKnown=people.every(e=>(e.hypothetical?c.hireHourCost:c.hourCost)!==null),cost=costKnown?round(rows.reduce((n,r)=>n+r.target*(r.hypothetical?c.hireHourCost:c.hourCost),0)):null;
  return {name:c.name,config:c,people:people.length,hires:c.hires,required,open,coverage:required?(required-open)/required:null,openHours:round(coverage.reduce((n,r)=>n+r.missing*r.hours,0)),target:round(rows.reduce((n,r)=>n+r.target,0)),planned:round(rows.reduce((n,r)=>n+r.planned,0)),missing:round(rows.reduce((n,r)=>n+r.missing,0)),cost,rows,byMonth,preview,diagnoses,asOf:data.as_of,fingerprint:data.fingerprint,version:1};
 }
 return {validate,staff,eligibility,cells,contractTarget,absenceInterval,run,days,monthNext};
});
