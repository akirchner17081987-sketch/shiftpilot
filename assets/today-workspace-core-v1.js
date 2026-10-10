// Pure operational-day calculations shared by the UI and regression tests.
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./solid-planning-core-v1.js'):root.SFSolidPlanningCore,typeof module==='object'&&module.exports?require('./reports-workspace-core-v1.js'):root.SFReportsCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.SFTodayCore=api;})(typeof window==='undefined'?globalThis:window,function(S,R){
 'use strict';
 const MIN=60000,HOUR=60*MIN,collator=new Intl.Collator('de',{numeric:true,sensitivity:'base'});
 const ms=v=>v?Date.parse(v):NaN,unique=a=>[...new Set(a)],published=a=>a.status==='PUBLISHED';
 const localDate=(value,tz)=>new Intl.DateTimeFormat('sv-SE',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
 const overlaps=(a,b,c,d)=>a<d&&b>c;
 const union=(ranges)=>{let total=0,last;for(const [s,e]of ranges.filter(([s,e])=>Number.isFinite(s)&&Number.isFinite(e)&&e>s).sort((a,b)=>a[0]-b[0])){if(last&&s<=last[1])last[1]=Math.max(last[1],e);else{if(last)total+=last[1]-last[0];last=[s,e]}}return(total+(last?last[1]-last[0]:0))/MIN};
 const name=e=>[e?.last,e?.first].filter(Boolean).join(', ')||'Mitarbeiter';
 const labels={working:'Im Dienst',pause:'In Pause',finished:'Dienst beendet',missing:'Check-in fehlt – bitte prüfen',checkout:'Check-out offen',stale:'Alte offene Buchung – prüfen',upcoming:'Geplant',draft:'Entwurf',absent:'Genehmigt abwesend',unknown:'Anwesenheit nicht verfügbar'};
 const rank={absent:0,missing:0,stale:0,checkout:1,pause:2,working:3,unknown:4,upcoming:4,draft:5,finished:6};
 function absenceOverlap(a,b,tz){
  if(a.employee_id!==b.employee_id||!['Genehmigt','Erfasst','APPROVED'].includes(b.status))return false;
  const start=S.instant(b.from,b.full_day===false?(b.start_time||'00:00').slice(0,5):'00:00',tz);
  let end=S.instant(b.full_day===false?b.to:R.plus(b.to,1),b.full_day===false?(b.end_time||'23:59').slice(0,5):'00:00',tz);
  if(b.full_day===false&&end<=start)end=S.instant(R.plus(b.to,1),(b.end_time||'00:00').slice(0,5),tz);
  return overlaps(ms(a.start),ms(a.end),start,end);
 }
 function analyze(data,filters={},options={}){
  const now=options.now??ms(data.as_of),tz=data.timezone||'Europe/Berlin',date=localDate(now,tz),start=S.instant(date,'00:00',tz),end=S.instant(R.plus(date,1),'00:00',tz),horizon=now+2*HOUR;
  const reliable=!!data.can_time&&options.reliable!==false,people=new Map(data.employees.map(e=>[e.id,e])),models=new Map(data.models.map(m=>[m.code,m]));
  const siteMatch=x=>!filters.site||(filters.site==='unassigned'?!x.site_id:x.site_id===filters.site),shiftMatch=x=>!filters.shift||(filters.shift==='QR'?!x.shift:x.shift===filters.shift);
  const eligible=x=>siteMatch(x)&&shiftMatch(x);
  const assignments=[],seen=new Map();
  for(const a of data.assignments.filter(a=>a.status!=='CANCELLED')){
   const key=[a.employee_id,a.shift,a.start,a.end,a.site_id||'',a.status].join('|');
   if(seen.has(key)){seen.get(key).duplicates.push(a.id);continue}
   const row={...a,duplicates:[]};assignments.push(row);seen.set(key,row);
  }
  const allBookings=data.can_time?[...data.times.map(t=>({...t,source:'time',key:'time:'+t.id})),...data.qr.map(q=>({...q,source:'qr',key:'qr:'+q.id}))].filter(t=>Number.isFinite(ms(t.start))&&ms(t.start)<=now):[];
  const byAssignment=new Map(),free=[];
  for(const b of allBookings){
   let a=b.source==='time'?assignments.find(a=>a.id===b.id||a.duplicates.includes(b.id)):null;
   if(b.source==='qr'){
    const candidates=assignments.filter(a=>published(a)&&a.employee_id===b.employee_id&&(!b.site_id||!a.site_id||a.site_id===b.site_id)&&overlaps(ms(b.start),b.end?ms(b.end):now+1,ms(a.start)-30*MIN,ms(a.end)));
    candidates.sort((a,c)=>Math.abs(ms(a.start)-ms(b.start))-Math.abs(ms(c.start)-ms(b.start)));a=candidates[0];
   }
   if(a){const list=byAssignment.get(a.id)||[];list.push(b);byAssignment.set(a.id,list)}else if(b.source==='qr')free.push(b);
  }
  function row(a,bookings){
   const active=bookings.filter(b=>ms(b.start)<=now&&(!b.end||ms(b.end)>now)),valid=active.filter(b=>now-ms(b.start)<=24*HOUR),old=active.filter(b=>now-ms(b.start)>24*HOUR);
   const breaks=bookings.flatMap(b=>(b.breaks||[]).map(p=>({...p,end:p.end||b.end||null,booking_end:b.end,booking_start:b.start})));
   const onBreak=valid.some(b=>(b.breaks||[]).some(p=>ms(p.start)<=now&&(!p.end||ms(p.end)>now)));
   const absence=a?data.absences.filter(b=>absenceOverlap(a,b,tz)):[];
   const employeeId=a?.employee_id||bookings[0]?.employee_id,e=people.get(employeeId),planned=a?published(a):false;
   let status=!a?'finished':!planned?'draft':now<ms(a.start)?'upcoming':'unknown';
   if(reliable){if(old.length&&!valid.length)status='stale';else if(valid.length)status=onBreak?'pause':a&&now>ms(a.end)+15*MIN?'checkout':'working';else if(bookings.some(b=>b.end&&ms(b.end)<=now))status='finished';else if(absence.length&&planned)status='absent';else if(planned&&now>ms(a.start)+15*MIN)status='missing';}
   else if(absence.length&&planned)status='absent';
   const relevant=(a?overlaps(ms(a.start),ms(a.end),start,end):bookings.some(b=>overlaps(ms(b.start),b.end?ms(b.end):now+1,start,end)))||active.length>0;
   const liveStart=valid.length?Math.min(...valid.map(b=>ms(b.start))):null;
   const attendance=union(bookings.map(b=>[ms(b.start),Math.min(b.end?ms(b.end):now,now)]));
   const pauseMinutes=Math.max(union(breaks.map(p=>[Math.max(ms(p.start),ms(p.booking_start)),Math.min(p.end?ms(p.end):now,p.booking_end?ms(p.booking_end):now,now)])),...bookings.filter(b=>b.source==='time').map(b=>Number(b.break_minutes)||0),0);
   const sites=unique(bookings.map(b=>b.site_id).filter(Boolean));
   return{id:a?.id||'qr:'+bookings[0]?.id,assignment:a||null,employee_id:employeeId,employee:e,name:name(e),shift:a?.shift||null,site_id:a?.site_id||bookings[0]?.site_id||null,
    start:a?.start||bookings[0]?.start,end:a?.end||bookings[0]?.end,date:a?.date||localDate(ms(bookings[0]?.start),tz),bookings,absence,status,label:labels[status],planned,relevant,
    present:reliable&&valid.length>0,onBreak:reliable&&onBreak,attendance,pauseMinutes,liveStart,terminals:unique(bookings.map(b=>b.terminal).filter(Boolean)),actualSites:sites,
    checkIn:bookings.length?Math.min(...bookings.map(b=>ms(b.start))):null,checkOut:bookings.length&&!active.length?Math.max(...bookings.map(b=>ms(b.end))):null,
    late:planned&&bookings.length?Math.max(0,Math.round((Math.min(...bookings.map(b=>ms(b.start)))-ms(a.start))/MIN)):0};
  }
  const allRows=assignments.map(a=>row(a,byAssignment.get(a.id)||[]));
  for(const b of free)allRows.push(row(null,[b]));
  const rows=allRows.filter(r=>r.relevant&&eligible(r)).sort((a,b)=>rank[a.status]-rank[b.status]||collator.compare(a.name,b.name)||ms(a.start)-ms(b.start));
  // Use the same shared TL, weekday, holiday and conditional-demand rules as Reports.
  const coverageBase={...data,from:R.plus(date,-1),to:R.plus(date,1),today:date,employees:[],absences:[],times:[],qr:[],assignments:assignments.filter(published)};
  const cells=R.analyze(coverageBase,{site:filters.site||'',shift:filters.shift||''}).cells.map(c=>{
   const model=models.get(c.code),cs=S.instant(c.date,(model.default_start||'00:00').slice(0,5),tz),ce=S.instant(model.default_end<=model.default_start?R.plus(c.date,1):c.date,(model.default_end||'00:00').slice(0,5),tz),running=cs<=now&&ce>now;
   const members=assignments.filter(a=>a.date===c.date&&c.codes.includes(a.shift)),drafts=unique(members.filter(a=>!published(a)).map(a=>a.employee_id)).length;
   const present=running&&reliable?unique(allRows.filter(r=>r.present&&r.assignment&&published(r.assignment)&&c.codes.includes(r.shift)&&ms(r.start)<=now&&ms(r.end)>now&&r.actualSites.every(s=>!r.site_id||s===r.site_id)).map(r=>r.employee_id)).length:null;
   return{...c,start:cs,end:ce,running,drafts,present};
  });
  const todayCells=cells.filter(c=>c.date===date||c.running),alerts=[];
  const add=(kind,priority,title,detail,ref={})=>alerts.push({kind,priority,title,detail,...ref});
  for(const r of rows){
   const ref={rowId:r.id,employee_id:r.employee_id,date:r.date,assignment:r.assignment?.id,site_id:r.site_id,shift:r.shift};
   if(['missing','stale','checkout'].includes(r.status))add(r.status,r.status==='missing'?1:2,r.name+' · '+r.label,r.shift||'Freier QR-Dienst',{...ref,action:'time'});
   if(r.absence.length)add('absence',0,r.name+' · Abwesenheitskonflikt',r.absence.map(a=>a.type).join(', '),{...ref,action:'schedule'});
   if(r.status==='draft')add('draft',3,r.name+' · Dienst noch im Entwurf',r.shift,{...ref,action:'schedule'});
   if(r.assignment?.duplicates.length)add('duplicate',1,r.name+' · Doppelte Zuweisung',r.shift+' wird nur einmal als besetzt gezählt.',{...ref,action:'schedule'});
  }
  for(const c of todayCells.filter(c=>c.missing))add('coverage',1,c.label+' · '+c.missing+' Positionen offen','Veröffentlicht '+c.filled+' / Bedarf '+c.required+(c.drafts?' · '+c.drafts+' Entwürfe':''),{date:c.date,shift:c.code,site_id:c.site_id,action:'schedule'});
  for(const id of unique(rows.map(r=>r.employee_id))){const own=rows.filter(r=>r.employee_id===id),duties=own.filter(r=>r.planned);let conflict=false;
   for(let i=0;i<duties.length;i++)for(let j=i+1;j<duties.length;j++){const a=duties[i],b=duties[j],ga=models.get(a.shift)?.coverage_group,gb=models.get(b.shift)?.coverage_group;if(overlaps(ms(a.start),ms(a.end),ms(b.start),ms(b.end))&&!(ga&&ga===gb))conflict=true;}
   if(conflict)add('overlap',0,name(people.get(id))+' · Dienste überschneiden sich','Zeitliche Doppelbelegung prüfen.',{rowId:own[0].id,date,action:'schedule',employee_id:id});
   if(reliable){const minutes=union(allBookings.filter(b=>b.employee_id===id).map(b=>[Math.max(ms(b.start),start),Math.min(b.end?ms(b.end):now,now,end)]));if(minutes>600)add('duration',2,name(people.get(id))+' · Lange Anwesenheit',Math.round(minutes/60*10)/10+' Std. seit Tagesbeginn · Pausen bleiben bezahlt; Arbeitszeit prüfen.',{rowId:own[0].id,date,action:'time',employee_id:id});}
  }
  for(const i of data.incidents||[]){const a=assignments.find(a=>a.id===i.assignment_id);if(i.status!=='OPEN'||!eligible({site_id:a?.site_id||i.site_id,shift:a?.shift||i.shift}))continue;
   add('incident',0,'Offener Störfall · '+(i.shift||a?.shift||'Dienst'),name(people.get(i.employee_id))+(i.pending_count?' · '+i.pending_count+' offene Ersatzanfragen':''),{incident:i.id,assignment:i.assignment_id,date:a?.date||localDate(ms(i.start),tz),action:'incident'});
  }
  alerts.sort((a,b)=>a.priority-b.priority||collator.compare(a.title,b.title));
  const transitions=[];
  for(const r of allRows.filter(r=>r.planned&&eligible(r))){for(const[kind,t]of[['start',ms(r.start)],['end',ms(r.end)]])if(t>=now&&t<=horizon)transitions.push({kind,at:t,row:r});}
  for(const c of cells)if(c.start>=now&&c.start<=horizon&&c.missing)transitions.push({kind:'gap',at:c.start,cell:c});
  transitions.sort((a,b)=>a.at-b.at||collator.compare(a.row?.name||a.cell?.label,b.row?.name||b.cell?.label));
  const summary={planned:unique(rows.filter(r=>r.planned).map(r=>r.employee_id)).length,present:reliable?unique(rows.filter(r=>r.present).map(r=>r.employee_id)).length:null,
   paused:reliable?unique(rows.filter(r=>r.onBreak).map(r=>r.employee_id)).length:null,finished:reliable?unique(rows.filter(r=>r.status==='finished'&&!rows.some(x=>x.employee_id===r.employee_id&&x.present)).map(r=>r.employee_id)).length:null,
   missing:reliable?unique(rows.filter(r=>r.status==='missing').map(r=>r.employee_id)).length:null,open:todayCells.reduce((n,c)=>n+c.missing,0),actions:alerts.length,drafts:rows.filter(r=>r.status==='draft').length};
  return{date,now,tz,rows,allRows,coverage:todayCells,alerts,transitions,summary,reliable};
 }
 return{analyze,absenceOverlap,localDate,union,name,labels};
});
