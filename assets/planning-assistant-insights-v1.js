// Pure planning analyses. All eligibility decisions come from the application's guards.
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./solid-planning-core-v1.js'):root.SFSolidPlanningCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.SFPlanningInsights=api})(typeof window!=='undefined'?window:globalThis,function(Solid){
  'use strict';
  const active=a=>a.status!=='CANCELLED'&&a._dbStatus!=='CANCELLED';
  const person=e=>[e.last,e.first].filter(Boolean).join(', ')||String(e.personnelNo||e.id);
  const h=n=>Number(n||0).toLocaleString('de-DE',{maximumFractionDigits:1});
  const response=(title,text,more={})=>({title,text,columns:[],rows:[],actions:[],...more});
  const model=(s,a)=>{const t=s.shifts.find(t=>t.id===a.type);return {...a,start:a.start||t?.start,end:a.end||t?.end}};
  const valid=a=>/^\d\d:\d\d/.test(a.start||'')&&/^\d\d:\d\d/.test(a.end||'');
  const paid=(s,a)=>{const d=model(s,a);if(!valid(d))return 0;const mins=t=>Number(t.slice(0,2))*60+Number(t.slice(3,5));return ((mins(d.end)-mins(d.start)+1440)%1440)/60};
  const hours=(s,e,rows,dates)=>rows.filter(active).filter(a=>String(a.employeeId)===String(e.id)&&dates.includes(a.date)).reduce((n,a)=>n+paid(s,a),0);
  const rulesReady=s=>!!(Solid&&s.solidRules?.enabled&&s.rulesReady!==false);
  function limits(s,e){return Solid.limits(e,s.shifts,s.solidRules)||s.hourLimits?.(e)||null}
  function capacity(s,e,rows,a){
    const lim=limits(s,e);if(!lim)return false;
    const own=rows.filter(active).filter(x=>String(x.employeeId)===String(e.id)),month=a.date.slice(0,7),all=[...own,a].map(x=>model(s,x));
    if(all.some(x=>!valid(x)))return false;
    const counted=all.filter(x=>x.date.startsWith(month)&&Solid.countsTowardCap(x));
    if(counted.length>lim.maxMonthlyShifts||counted.reduce((n,x)=>n+paid(s,x),0)>lim.monthLimit+1e-6)return false;
    const start=Solid.instant(month+'-01','00:00',s.solidRules.timezone),next=new Date(month+'-01T12:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);
    const end=Solid.instant(next.toISOString().slice(0,10),'00:00',s.solidRules.timezone);
    const calendar=all.reduce((n,x)=>{const d=Solid.duty(x,s.solidRules);return n+Math.max(0,Math.min(end,d.endMs)-Math.max(start,d.startMs))/3600000},0);
    return calendar<=lim.calendarLimit+1e-6&&!Solid.errors(e,all,s.solidRules,[a.date]).length;
  }
  function audit(s,dates){
    const rows=s.assignments.filter(active),duties=rows.map(a=>model(s,a)),issues=[],unknown=[];
    if(!rulesReady(s))return {issues,unknown:['Verbindliche Erholungsregeln sind noch nicht geladen.']};
    for(const e of s.employees.filter(e=>e.status==='active'&&!e.deletedAt)){
      const own=duties.filter(a=>String(a.employeeId)===String(e.id));if(own.some(a=>!valid(a))){unknown.push(person(e)+': Schichtzeiten fehlen.');continue;}
      for(const x of Solid.errors(e,own,s.solidRules,dates))issues.push({...x,employee:e,priority:'Handlungsbedarf'});
      const lim=limits(s,e);
      if(lim)for(const month of [...new Set(dates.map(d=>d.slice(0,7)))]){
        const counted=own.filter(a=>a.date.startsWith(month)&&Solid.countsTowardCap(a));
        if(counted.length>lim.maxMonthlyShifts)issues.push({employee:e,date:month+'-01',message:'Automatische Schichtanzahl über der persönlichen Grenze ('+lim.maxMonthlyShifts+').',priority:'Handlungsbedarf'});
        if(counted.reduce((n,a)=>n+paid(s,a),0)>lim.monthLimit+1e-6)issues.push({employee:e,date:month+'-01',message:'Geplante Stunden über der persönlichen Monatsgrenze ('+h(lim.monthLimit)+' h).',priority:'Handlungsbedarf'});
        const from=Solid.instant(month+'-01','00:00',s.solidRules.timezone),to=Solid.instant(Solid.plus(month+'-01',new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate()),'00:00',s.solidRules.timezone);
        const actual=own.reduce((n,a)=>{const d=Solid.duty(a,s.solidRules);return n+Math.max(0,Math.min(to,d.endMs)-Math.max(from,d.startMs))/3600000},0);
        if(actual>lim.calendarLimit+1e-6)issues.push({employee:e,date:month+'-01',message:'Zeitanteilige Monatsgrenze einschließlich Nachtübertrag überschritten ('+h(actual)+' / '+h(lim.calendarLimit)+' h).',priority:'Handlungsbedarf'});
      }
    }
    return {issues,unknown};
  }
  function workload(s,dates){
    const result=audit(s,dates),rows=result.issues.map(x=>['Handlungsbedarf',person(x.employee),x.date,x.message]),actions=result.issues.map(x=>({view:'schedule',date:x.date,employeeId:x.employee.id,label:'Im Dienstplan prüfen'}));
    if(rulesReady(s))for(const e of s.employees.filter(e=>e.status==='active'&&!e.deletedAt)){
      const own=s.assignments.filter(active).filter(a=>String(a.employeeId)===String(e.id)).map(a=>model(s,a));if(own.some(a=>!valid(a)))continue;
      const metrics=Solid.metrics([e],own,s.solidRules,[...new Set(dates.map(d=>d.slice(0,7)))]);
      if(metrics.missingFreeWeekends){rows.push(['Verbesserungspotenzial',person(e),dates[0],'Weniger vollständig freie Wochenenden als das hinterlegte Planungsziel.']);actions.push({view:'schedule',date:dates[0],month:true,label:'Wochenenden prüfen'});}
    }
    return response('Belastung prüfen',rows.length?rows.length+' Auffälligkeiten im ausgewählten Zeitraum.':result.unknown.length?'Prüfung noch unvollständig.':'Keine Auffälligkeiten in den geprüften Belastungsregeln.',{columns:['Priorität','Mitarbeiter','Datum','Ergebnis'],rows,rowActions:actions,notes:[...result.unknown,'Vormonat und Folgemonat werden aus den geladenen Diensten einbezogen. Fehlende Randdaten können nicht geprüft werden.','Wochenenden sind ein Optimierungsziel. Verbindliche Erholungs- und Stundenregeln haben Vorrang.'],context:{intent:'loadCheck',dates}});
  }
  function slots(s,dates,rows){
    if(s.openSlots)return s.openSlots(dates,rows);
    const out=[];for(const date of dates)for(const t of s.shifts){const count=rows.filter(active).filter(a=>a.date===date&&a.type===t.id).length;for(let i=count;i<Number(s.getSoll(date,t.id));i++)out.push({date,type:t.id});}return out;
  }
  function candidates(s,slot,rows,excluded){
    const out=[];for(const type of slot.alternatives||[slot.type]){
      const checked=s.candidates(type,slot.date,rows);
      for(const c of checked.candidates||[]){const e=c.e,a={date:slot.date,type,employeeId:e.id};if(excluded.has(String(e.id))||!capacity(s,e,rows,a))continue;out.push({e,a:model(s,a),fit:c.fit||[]});}
    }return out;
  }
  function improvements(s,dates,excluded=new Set(),outage=false){
    if(!rulesReady(s))return response('Regeln noch nicht bereit','Die verbindlichen Planungsregeln müssen vor einer Vorschau vollständig geladen sein.',{context:{intent:outage?'outage':'improvements',dates}});
    if(!s.candidates)return response('Prüfung nicht verfügbar','Die Besetzungsprüfung ist noch nicht geladen.');
    const original=s.assignments.filter(active),removed=outage?original.filter(a=>dates.includes(a.date)&&excluded.has(String(a.employeeId))):[],base=original.filter(a=>!removed.includes(a)),proposed=[],changes=[];
    const initial=outage?removed.map(a=>({date:a.date,type:a.type})):slots(s,dates,base),remaining=new Map();
    const target=e=>Math.max(0,Number(s.monthTarget(e))||0);
    for(const slot of initial.slice(0,500)){
      if(!outage&&s.isPublished?.(slot.date))continue;
      const options=candidates(s,slot,[...base,...proposed],excluded).filter(c=>outage||hours(s,c.e,[...base,...proposed],dates)<target(c.e)-0.05);
      options.sort((a,b)=>(target(b.e)-hours(s,b.e,[...base,...proposed],dates))-(target(a.e)-hours(s,a.e,[...base,...proposed],dates))||person(a.e).localeCompare(person(b.e),'de'));
      const c=options[0];if(!c){const key=slot.date+'|'+slot.type;remaining.set(key,(remaining.get(key)||0)+1);continue;}
      proposed.push(c.a);changes.push({assignment:c.a,employee:c.e,before:hours(s,c.e,[...base,...proposed.slice(0,-1)],dates),after:hours(s,c.e,[...base,...proposed],dates),target:target(c.e),reason:'Freigaben, Abwesenheiten, Rhythmus, Erholung und persönliche Stunden-/Schichtgrenzen geprüft.'});
    }
    // A single local reassignment can relieve a violation without creating a new one.
    if(!outage&&s.movable){const issues=audit(s,dates).issues;for(const issue of issues.slice(0,20)){
      const rows=[...base,...proposed],before=audit({...s,assignments:rows},dates).issues.length;
      for(const a of rows.filter(a=>base.includes(a)&&String(a.employeeId)===String(issue.employee.id)&&dates.includes(a.date)&&s.movable(a))){
        const without=rows.filter(x=>x!==a),options=candidates(s,{date:a.date,type:a.type},without,new Set([String(a.employeeId)]));
        const c=options.find(c=>hours(s,c.e,rows,dates)<target(c.e)&&audit({...s,assignments:[...without,c.a]},dates).issues.length<before);if(!c)continue;
        base.splice(base.indexOf(a),1);proposed.push(c.a);changes.push({assignment:c.a,replaces:a,employee:c.e,before:hours(s,c.e,rows,dates),after:hours(s,c.e,[...without,c.a],dates),target:target(c.e),reason:'Entlastet '+person(issue.employee)+'; Regelauffälligkeiten nehmen ab. Feste und geschützte Dienste bleiben erhalten.'});break;
      }
    }}
    const beforeMissing=slots(s,dates,original).length,afterMissing=slots(s,dates,[...base,...proposed]).length,deficit=rows=>s.employees.filter(e=>e.status==='active'&&!e.deletedAt).reduce((n,e)=>n+Math.max(0,target(e)-hours(s,e,rows,dates)),0);
    return response(outage?'Ausfall durchspielen – Simulation':'Konkrete Verbesserungen – Vorschau',changes.length+' geprüfte Zuweisungen vorgeschlagen. '+(outage?remaining.size+' betroffene Schichten bleiben ohne passenden Ersatz.':'Offene Positionen: '+beforeMissing+' → '+afterMissing+'. Stunden-Soll-Defizit: '+h(deficit(original))+' → '+h(deficit([...base,...proposed]))+' h.'),{columns:['Mitarbeiter','Dienst','Stunden vorher → nachher','Monats-SOLL','Begründung'],rows:changes.map(c=>[person(c.employee),c.assignment.date+' · '+c.assignment.type,h(c.before)+' → '+h(c.after)+' h',h(c.target)+' h',c.reason]),rowActions:changes.map(c=>({view:'schedule',date:c.assignment.date,type:c.assignment.type,label:'Dienst prüfen'})),notes:[outage?'Angenommener Ausfall. Es wird keine Abwesenheit gebucht und kein Dienst geändert.':'Nur Entwürfe. Übernahme erst nach Bestätigung und erneuter Prüfung des gespeicherten Plans.','Die Suche prüft direkte Besetzungen und einzelne Entlastungswechsel; sie garantiert kein globales Optimum.',...(initial.length>500?['Die Vorschau ist auf 500 Positionen begrenzt.']:[]),...([...remaining].map(([k,n])=>k.replace('|',' · ')+': '+n+' Position(en) ohne regelkonformen Vorschlag.'))],proposal:outage?null:{base,proposed,changes,dates},context:{intent:outage?'outage':'improvements',dates,pending:false}});
  }
  function journal(s,dates,type){
    if(s.journalError)return response('Planungsprotokoll nicht verfügbar',s.journalError,{context:{intent:'runReasons',dates,type}});
    const runs=(s.planningRuns||[]).filter(r=>r.first_month<=dates.at(-1)&&r.last_date>=dates[0]),run=runs[0];
    if(!run)return response('Kein gespeichertes Planungsprotokoll','Für diesen Zeitraum wurde noch kein Planungsprotokoll geladen oder gespeichert. Neue Auto-Planungsläufe zeichnen die Prüfung der verbleibenden Lücken auf. Frühere Entscheidungen werden nicht nachträglich erfunden.',{context:{intent:'runReasons',dates,type}});
    const entries=(run.analysis?.entries||[]).filter(x=>dates.includes(x.date)&&(!type||x.type===type));
    return response('Gespeicherte Planungsgründe','Stand des Laufs vom '+new Date(run.created_at).toLocaleString('de-DE')+'. '+run.analysis.open+' offene Positionen im damaligen Ergebnis.',{columns:['Datum','Schicht','Ausschlussgründe im Ergebnis'],rows:entries.map(x=>[x.date,x.type,x.reasons.map(r=>r.count+' × '+r.label).join('; ')||'Keine passende Besetzung unter den geprüften Regeln.']),notes:['Gespeicherte Prüfung am Ende des Planungslaufs. Dies ist keine vollständige Aufzeichnung aller Suchschritte.','Im verwendeten Browser gespeichert, getrennt nach Benutzer und Unternehmen; bis zu 20 Läufe der letzten 90 Tage. Keine Synchronisierung zwischen Geräten.','Das aktuelle Ergebnis kann nach späteren Änderungen abweichen.',...(run.analysis.truncated?['Die Detailansicht wurde auf 200 Schichten begrenzt.']:[])],context:{intent:'runReasons',dates,type}});
  }
  return {audit,workload,improvements,journal,person,hours,paid,capacity,slots};
});
