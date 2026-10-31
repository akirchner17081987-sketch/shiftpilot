// Per-analysis reuse and conservative feasibility bounds. No writes or external services.
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./planning-assistant-core-v1.js'):root.SFPlanningAssistantCore,typeof module==='object'&&module.exports?require('./planning-assistant-insights-v1.js'):root.SFPlanningInsights);if(typeof module==='object'&&module.exports)module.exports=api;else root.SFPlanningEfficiencyCore=api})(typeof window==='undefined'?globalThis:window,function(Core,I){
'use strict';
const clock=()=>typeof performance!=='undefined'?performance.now():Date.now();
function cachedSnapshot(s,limit=256){
 const map=new Map(),stats={requests:0,hits:0,misses:0},copy=r=>({...r,candidates:(r.candidates||[]).map(c=>({...c,fit:c.fit?.slice()})),reasons:(r.reasons||[]).map(r=>({...r})),assessments:r.assessments?.map(a=>({...a}))});
 return {stats,snapshot:{...s,candidates:(type,date,rows=s.assignments,duty)=>{
  stats.requests++;const key=JSON.stringify([type,date,duty,s.solidRules,s.employees,s.absences,s.shifts,rows.map(a=>[a.id,a.employeeId,a.date,a.type,a.start,a.end,a.version,a.plannerLocked,a.rhythmOverride,a.status,a._dbStatus])]);
  if(map.has(key)){stats.hits++;return copy(map.get(key));}stats.misses++;const r=s.candidates(type,date,rows,duty);map.set(key,copy(r));if(map.size>limit)map.delete(map.keys().next().value);return copy(r);
 }}};
}
function matching(groups){
 const positions=groups.flatMap(g=>Array.from({length:Math.min(g.missing,g.people.length)},()=>g.people)),owner=new Map();
 const find=(index,seen)=>{for(const id of positions[index]){if(seen.has(id))continue;seen.add(id);if(!owner.has(id)||find(owner.get(id),seen)){owner.set(id,index);return true;}}return false;};
 let filled=0;for(let i=0;i<positions.length;i++)if(find(i,new Set()))filled++;const required=groups.reduce((n,g)=>n+g.missing,0);return {required,possible:filled,shortfall:required-filled};
}
function preflight(state,dates,options={}){
 if(!state.authorized||state.loading||state.error)throw Error('Die autorisierten Planungsdaten müssen vollständig geladen sein.');
 if(!Array.isArray(dates)||!dates.length||dates.some(d=>!Core.validDate(d)))throw Error('Bitte einen gültigen Planungszeitraum wählen.');
 const started=clock(),phases=[],measure=(label,fn)=>{const t=clock(),r=fn();phases.push({label,ms:Math.max(0,clock()-t)});return r;},cache=cachedSnapshot(state),s=cache.snapshot;
 const chosen=dates.slice(0,62),limitedDates=chosen.length<dates.length,base=options.rebuild?state.assignments.filter(a=>!state.movable?.(a)):state.assignments;
 const slots=measure('Bedarf ermitteln',()=>I.slots(s,chosen,base)),groups=new Map();
 for(const slot of slots){const key=slot.date+'|'+(slot.coverageGroup||slot.type),g=groups.get(key)||{date:slot.date,type:slot.type,alternatives:slot.alternatives||[slot.type],missing:0,people:[]};g.missing++;groups.set(key,g);}
 const rows=[],days=new Map(),potential=new Map();let checked=0,limited=false;
 measure('Freigaben und Verfügbarkeit prüfen',()=>{
  for(const g of groups.values()){
   if(checked>=500||clock()-started>(options.budgetMs??2500)){limited=true;break;}
   const people=new Set();for(const type of g.alternatives){const checked=s.candidates(type,g.date,base);for(const c of checked.candidates||[]){people.add(String(c.e.id));const duty={date:g.date,type},hours=Core.paidHours(s,duty),key=g.date.slice(0,7)+'|'+String(c.e.id),byDay=potential.get(key)||new Map();byDay.set(g.date,Math.max(byDay.get(g.date)||0,hours));potential.set(key,byDay);}}
   g.people=[...people];const day=days.get(g.date)||[];day.push(g);days.set(g.date,day);checked++;
   if(people.size<g.missing)rows.push({kind:'capacity',date:g.date,type:g.type,missing:g.missing,available:people.size,message:g.missing+' offene Plätze, aber nur '+people.size+' aktuell geeignete Personen.'});
  }
 });
 measure('Gemeinsame Personalgrenzen prüfen',()=>{for(const [date,groups] of days){const r=matching(groups);if(r.shortfall)rows.push({kind:'capacity',date,message:'Mindestens '+r.shortfall+' Plätze konkurrieren um dieselben verfügbaren Personen. Eine Person wird pro Tag nur einmal eingeplant.'});}});
 const checks=measure('Bestehende Regelkonflikte prüfen',()=>I.audit({...s,assignments:base},chosen));
 for(const x of checks.issues||[])rows.push({kind:'rule',date:x.date,message:x.message});
 for(const x of checks.unknown||[])rows.push({kind:'missing',message:typeof x==='string'?x:x.message||'Ein Teil der Planungsregeln ist nicht geladen.'});
 const complete=!limited&&!limitedDates&&checked===groups.size;
 const months=[...new Set(chosen.map(d=>d.slice(0,7)))].map(month=>{
  const wanted=chosen.filter(d=>d.startsWith(month)),openHours=slots.filter(a=>a.date.startsWith(month)).reduce((n,a)=>n+Core.paidHours(s,a),0),people=state.employees.filter(e=>e.status==='active'&&!e.deletedAt),target=people.reduce((n,e)=>n+(Number(s.monthTarget(e))||0),0),available=people.reduce((n,e)=>{const possible=[...(potential.get(month+'|'+String(e.id))?.values()||[])].reduce((a,b)=>a+b,0),current=Core.plannedHours({...s,assignments:base},e,Core.parsePeriod(month,{today:chosen[0],defaultDates:chosen}).dates),limit=s.hourLimits?.(e)?.monthLimit;return n+Math.max(0,Math.min(possible,Number.isFinite(limit)?limit-current:possible));},0);
  return{month,target,openHours,optimisticAvailableHours:complete?available:null,completeMonth:Core.fullMonth(wanted)};
 });
 if(!complete)rows.push({kind:'missing',message:'Teilanalyse: '+checked+' von '+groups.size+' offenen Dienstgruppen geprüft; höchstens 62 Tage und ein begrenztes Prüfzeitbudget.'});
 return{dates:chosen,mode:options.rebuild?'Bewegliche Entwürfe neu verteilen':'Bestehenden Plan ergänzen',open:slots.length,checked,totalGroups:groups.size,complete,rows,months,optimistic:true,phases,ms:clock()-started,cache:{...cache.stats},notes:['Verfügbarkeit und Stunden sind optimistische Obergrenzen. Ganze Arbeitsblöcke, Ruhezeiten und die gemeinsame Verteilung können weitere Grenzen setzen.','Personelle Grenzen, verbindliche Regelkonflikte und fehlende Daten werden getrennt angezeigt. Eine Teilanalyse oder begrenzte Suche ist kein Nachweis der Unlösbarkeit.']};
}
return {cachedSnapshot,matching,preflight};
});
