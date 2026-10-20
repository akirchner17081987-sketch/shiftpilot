// A future day is a plan projection; no actual attendance is extrapolated.
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./reports-workspace-core-v1.js'):root.SFReportsCore,typeof module==='object'&&module.exports?require('./today-workspace-core-v1.js'):root.SFTodayCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.SFPlanningTimelineCore=api;})(typeof window==='undefined'?globalThis:window,function(R,T){
 'use strict';
 function project(data,date,filters={}){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<data.from||date>data.to)throw Error('Datum liegt außerhalb der geladenen Vorschau.');
  const assignments=data.assignments.filter(a=>a.status!=='CANCELLED'),published=assignments.filter(a=>a.status==='PUBLISHED'),conflicts=published.filter(a=>data.absences.some(b=>T.absenceOverlap(a,b,data.timezone))),conflictIds=new Set(conflicts.map(a=>a.id)),available=published.filter(a=>!conflictIds.has(a.id));
  const safe={...data,from:date,to:date,times:[],qr:[],can_time:false,employees:[],absences:[],assignments:available};
  function at(id){
   const options={site:id,shift:filters.shift||''},report=R.analyze(safe,options),cells=report.cells;
   const siteMatch=a=>(!id||id==='unassigned'?!id||!a.site_id:a.site_id===id)&&(!filters.shift||a.shift===filters.shift);
   const own=assignments.filter(a=>a.date===date&&siteMatch(a)),bad=conflicts.filter(a=>a.date===date&&siteMatch(a)),drafts=own.filter(a=>a.status==='DRAFT'),open=cells.reduce((n,c)=>n+c.missing,0),required=cells.reduce((n,c)=>n+c.required,0),planned=new Set(own.filter(a=>a.status==='PUBLISHED'&&!conflictIds.has(a.id)).map(a=>a.employee_id)).size;
   return {planned,drafts:new Set(drafts.map(a=>a.employee_id)).size,open,required,conflicts:bad.length,cells,issues:[...cells.filter(c=>c.missing).map(c=>({date,shift:c.code,type:'coverage',missing:c.missing,shared:c.shared,label:c.label})),...bad.map(a=>({date,shift:a.shift,type:'absence',assignment:a.legacy_id||a.id,label:a.shift}))]};
  }
  const sites=data.sites.map(s=>{const p=at(s.id),status=p.conflicts?'critical':p.open?'attention':p.required||p.planned?'good':'neutral';return {id:s.id,code:s.code||'',name:s.name,active:s.is_active!==false,status,label:p.conflicts?'Geplante Besetzung mit Abwesenheitskonflikt':p.open?'Planungslücken':p.required||p.planned?'Planbedarf gedeckt':'Kein Pflichtbedarf',present:p.planned,open:p.open,actions:p.issues.length,urgent:p.conflicts,drafts:p.drafts,conflicts:p.conflicts};});
  return {date,projection:true,asOf:data.as_of,timezone:data.timezone,fresh:true,selected:filters.site||'',shift:filters.shift||'',sites,summary:at(filters.site||'')};
 }
 function portions(from,to){const out=[];let start=from;while(start<=to){const last=new Date(Date.UTC(+start.slice(0,4),+start.slice(5,7),0)).toISOString().slice(0,10),end=last<to?last:to;out.push({from:start,to:end});start=R.plus(end,1);}return out;}
 function merge(parts){if(!parts.length)throw Error('Keine Planungsdaten.');const first=parts[0],unique=(key,id)=>[...new Map(parts.flatMap(p=>p[key]||[]).map(r=>[id(r),r])).values()];return {...first,from:parts[0].from,to:parts.at(-1).to,as_of:parts.map(p=>p.as_of).sort()[0],assignments:unique('assignments',r=>r.id),absences:unique('absences',r=>r.id),daily:unique('daily',r=>r.date+'|'+r.shift),times:[],qr:[],can_time:false};}
 return {project,portions,merge};
});
