// Pure planning analyses. All eligibility decisions come from the application's guards.
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./solid-planning-core-v1.js'):root.SFSolidPlanningCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.SFPlanningInsights=api})(typeof window!=='undefined'?window:globalThis,function(Solid){
  'use strict';
  const active=a=>a.status!=='CANCELLED'&&a._dbStatus!=='CANCELLED';
  const person=e=>[e.last,e.first].filter(Boolean).join(', ')||String(e.personnelNo||e.id);
  const h=n=>Number(n||0).toLocaleString('de-DE',{maximumFractionDigits:1});
  const response=(title,text,more={})=>({title,text,columns:[],rows:[],actions:[],...more});
  const model=(s,a)=>{const t=s.shifts.find(t=>t.id===a.type);return {...a,start:a.start||t?.start,end:a.end||t?.end}};
  const valid=a=>/^\d\d:\d\d/.test(a.start||'')&&/^\d\d:\d\d/.test(a.end||'');
  const paid=(s,a)=>{const d=model(s,a);if(!valid(d))return 0;if(s.assignmentHours)return Number(s.assignmentHours(d))||0;if(s.solidRules?.enabled&&Solid){const iv=Solid.interval(d.date,d.start,d.end,s.solidRules.timezone);return (iv.end-iv.start)/3600000;}const mins=t=>Number(t.slice(0,2))*60+Number(t.slice(3,5));return ((mins(d.end)-mins(d.start)+1440)%1440)/60};
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
      const checked=s.candidates(type,slot.date,rows,slot);
      for(const c of checked.candidates||[]){const e=c.e,a={date:slot.date,type,employeeId:e.id,...(slot.start?{start:slot.start}:{}),...(slot.end?{end:slot.end}:{})};if(excluded.has(String(e.id))||!capacity(s,e,rows,a))continue;out.push({e,a:model(s,a),fit:c.fit||[]});}
    }return out;
  }
  const issueKey=x=>String(x.employee.id)+'|'+x.date+'|'+x.message;
  function analysisReady(s,title){
    if(!rulesReady(s)||!s.candidates)return response(title+' – noch nicht bereit','Bitte die vollständigen Planungsregeln und Besetzungsprüfungen laden.');
    if(s.assignments.filter(active).some(a=>!valid(model(s,a))))return response(title+' – Daten prüfen','Mindestens einem geladenen Dienst fehlen gültige Schichtzeiten. Die Prüfung ist unvollständig.');
    return null;
  }
  function checkedPlan(s,original,plan,changedIds,dates){
    const before=audit({...s,assignments:original},dates),after=audit({...s,assignments:plan},dates);
    const baseline=new Set(before.issues.map(issueKey)),problems=after.issues.filter(x=>!baseline.has(issueKey(x))).map(x=>person(x.employee)+': '+x.message);
    if(before.unknown.length||after.unknown.length)problems.push('Die Regelprüfung ist unvollständig.');
    for(const a of plan.filter(a=>changedIds.has(String(a.employeeId)))){
      const e=s.employees.find(e=>String(e.id)===String(a.employeeId)),without=plan.filter(x=>x!==a);
      if(!e||!capacity(s,e,without,a)||!(s.candidates(a.type,a.date,without,model(s,a)).candidates||[]).some(c=>String(c.e.id)===String(e.id)))problems.push(a.date+' · '+a.type+': Für '+(e?person(e):'die Person')+' ist der Gesamtplan unter den aktuellen Regeln nicht bestätigt.');
    }
    return [...new Set(problems)];
  }
  function forecast(s,dates){
    const unavailable=analysisReady(s,'Frühwarnung');if(unavailable)return unavailable;
    const original=s.assignments.filter(active),checks=[],actions=[],warnings=[],started=Date.now();let tested=0,limited=false;
    const chosen=dates.slice(0,31),existing=slots(s,chosen,original),staff=new Map(s.employees.filter(e=>e.status==='active'&&!e.deletedAt).map(e=>[String(e.id),e]));
    // Open positions and independent single-person outages are separate findings.
    for(const slot of existing){const key=slot.date+'|'+slot.type;if(checks.some(x=>x.key===key))continue;checks.push({key,priority:0,row:['Bereits offen',slot.date+' · '+slot.type,'Pflichtposition ist bereits unbesetzt.','Engpasslöser oder passende Vertretung prüfen.']});actions.push({key,view:'schedule',date:slot.date,type:slot.type,label:'Dienst prüfen'});}
    const grouped=new Map();
    for(const a of original.filter(a=>chosen.includes(a.date))){
      if(tested>=160||Date.now()-started>1800){limited=true;break;}tested++;
      const e=staff.get(String(a.employeeId));if(!e){warnings.push(a.date+' · '+a.type+': Mitarbeiterzuordnung nicht vollständig.');continue;}
      const without=original.filter(x=>x!==a),before=slots(s,[a.date],original),after=slots(s,[a.date],without);
      if(after.length<=before.length)continue; // Existing overstaffing covers this single outage.
      const affected=after.find(x=>after.filter(y=>y.type===x.type).length>before.filter(y=>y.type===x.type).length);if(!affected)continue;
      const options=candidates(s,{...affected,...(!affected.alternatives?{start:model(s,a).start,end:model(s,a).end}:{})},without,new Set([String(e.id)]));
      const unique=[...new Map(options.map(c=>[String(c.e.id),c])).values()];if(unique.length>1)continue;
      const key=a.date+'|'+affected.type,entry=grouped.get(key)||{date:a.date,type:affected.type,people:[],minimum:2};entry.minimum=Math.min(entry.minimum,unique.length);entry.people.push(person(e)+': '+(unique.length?'nur '+person(unique[0].e)+' als direkte Vertretung':'keine direkte Vertretung gefunden'));grouped.set(key,entry);
    }
    for(const [key,g] of grouped){checks.push({key:key+'|outage',priority:g.minimum?2:1,row:[g.minimum?'Wenig Reserve':'Keine direkte Reserve',g.date+' · '+g.type,g.people.join('\n'),g.minimum?'Vertretungsbereitschaft klären oder andere Verteilung prüfen.':'Gezielte Umverteilung oder zusätzliche qualifizierte Vertretung prüfen.']});actions.push({key:key+'|outage',view:'schedule',date:g.date,type:g.type,label:'Dienst prüfen'});}
    checks.sort((a,b)=>a.priority-b.priority||a.key.localeCompare(b.key));
    return response('Frühwarnung – Vertretungsreserve',(limited||dates.length>31||warnings.length?'Teilanalyse. ':'')+chosen[0]+' bis '+chosen.at(-1)+': '+checks.length+' Hinweise; '+tested+' einzelne Ausfallszenarien geprüft.',{columns:['Priorität','Dienst','Befund','Nächster Schritt'],rows:checks.map(x=>x.row),blockers:[...warnings,...(limited||dates.length>31?['Suchgrenze erreicht; ungeprüfte Dienste sind nicht als sicher bewertet.']:[])],rowActions:checks.map(x=>{const {key,...action}=actions.find(a=>a.key===x.key);return action;}),notes:[
      'Jede Reserve gilt für einen einzelnen Ausfall und den aktuellen Plan. Dieselbe Person kann in mehreren unabhängigen Szenarien erscheinen; sie ist nicht mehrfach zugesagt.',
      'Geprüft werden direkte Vertretungen mit Freigaben, Verfügbarkeit, Rhythmus, Erholung und Stundenlimits. Umverteilungen können weitere Lösungen ermöglichen.',
      'Es wird keine Erkrankung oder tatsächliche Ausfallwahrscheinlichkeit vorhergesagt. Keine Nachricht und keine Planänderung wird ausgelöst.',
      'Die Auswertung verwendet geladene Dienste und hinterlegten Bedarf. Fehlende Planungsdaten oder fehlender Bedarf sind keine bestätigte Sicherheit.',
      ...(limited||dates.length>31?['Teilanalyse: Suchgrenze erreicht (31 Tage, 160 Szenarien oder Zeitbudget). Ungeprüfte Dienste sind nicht als sicher bewertet.']:[]),...warnings],suggestions:['Engpasslöser starten'],context:{intent:'forecast',dates:chosen}});
  }
  function leaveImpact(s,employeeId,dates){
    const unavailable=analysisReady(s,'Urlaubsfolgen');if(unavailable)return unavailable;
    const e=s.employees.find(e=>String(e.id)===String(employeeId)&&e.status==='active'&&!e.deletedAt);if(!e)return response('Mitarbeiter nicht gefunden','Bitte einen aktiven Mitarbeiter des ausgewählten Unternehmens wählen.');
    const original=s.assignments.filter(active),tz=s.solidRules.timezone,from=Solid.instant(dates[0],'00:00',tz),to=Solid.instant(Solid.plus(dates.at(-1),1),'00:00',tz);
    const removed=original.filter(a=>{if(String(a.employeeId)!==String(e.id))return false;const d=model(s,a),iv=Solid.interval(d.date,d.start,d.end,tz);return iv.start<to&&iv.end>from;});
    const base=original.filter(a=>!removed.includes(a)),wanted=[...new Set([...dates,...removed.map(a=>a.date)])].sort(),proposed=[],rows=[],actions=[],blocked=[],started=Date.now();let limited=false;
    const extraSlots=plan=>{const before=slots(s,wanted,original),after=slots(s,wanted,plan),used=new Map();return after.filter(slot=>{const key=slot.date+'|'+slot.type,n=(used.get(key)||0)+1;used.set(key,n);return n>before.filter(x=>x.date===slot.date&&x.type===slot.type).length;});};
    const displaced=removed.slice(),initial=extraSlots(base).map(slot=>{if(slot.alternatives)return slot;const index=displaced.findIndex(a=>a.date===slot.date&&a.type===slot.type);if(index<0)return slot;const a=model(s,displaced.splice(index,1)[0]);return {...slot,start:a.start,end:a.end};});
    for(const slot of initial.slice(0,100)){
      if(Date.now()-started>1800){limited=true;break;}
      const plan=[...base,...proposed],options=candidates(s,slot,plan,new Set([String(e.id)]));let accepted=null;
      for(const c of options.slice(0,8)){if(Date.now()-started>1800){limited=true;break;}const next=[...plan,c.a];if(!checkedPlan(s,original,next,new Set([String(c.e.id)]),wanted).length){accepted=c;break;}}
      if(accepted){proposed.push(accepted.a);rows.push([slot.date+' · '+accepted.a.type,person(accepted.e),'Gemeinsam geprüfte direkte Vertretung','Freigaben, Erholung, Rhythmus und Stundenlimits berücksichtigt.']);}
      else{rows.push([slot.date+' · '+slot.type,'Keine direkte Vertretung','Zusätzlicher Engpass','Andere Verteilung oder zusätzliche passende Kapazität prüfen.']);blocked.push(slot.date+' · '+slot.type);}
      actions.push({view:'schedule',date:slot.date,type:slot.type,label:'Dienst prüfen'});
    }
    const remaining=extraSlots([...base,...proposed]).length,protectedCount=removed.filter(a=>s.isPublished?.(a.date)||!s.movable?.(a)).length;
    return response('Urlaubsfolgen – Simulation',person(e)+' · '+dates[0]+' bis '+dates.at(-1)+': '+removed.length+' betroffene Dienste ('+h(removed.reduce((n,a)=>n+paid(s,a),0))+' geplante Dienststunden). '+initial.length+' zusätzliche Pflichtpositionen würden frei; '+proposed.length+' direkte Vertretungen gefunden; '+remaining+' zusätzliche Positionen verbleiben.',{
      columns:['Dienst','Vertretung','Ergebnis','Begründung'],rows,rowActions:actions,blockers:[...(remaining?[remaining+' zusätzliche Pflichtpositionen bleiben in dieser begrenzten Simulation ohne direkte Lösung.']:[]),...(protectedCount?[protectedCount+' betroffene Dienste sind veröffentlicht oder geschützt. Die Simulation erteilt keine Änderungsfreigabe.']:[])],notes:[
        'Reine Entscheidungshilfe: Es wird kein Urlaub genehmigt, keine Abwesenheit angelegt und kein Dienst verändert. Die zuständige Person entscheidet im Abwesenheitsbereich.',
        'Nachtüberträge in den ersten Urlaubstag werden einbezogen. Betroffene Dienste werden vollständig als zu vertreten angenommen; es wird keine stundenweise Freistellung berechnet.',
        'Bestehende wirksame Abwesenheiten anderer Mitarbeiter werden durch die zentralen Kandidatenprüfungen berücksichtigt. Bestehende Lücken werden von zusätzlich entstehenden Lücken getrennt.',
        'Vertretungen werden gemeinsam geprüft; andere Reihenfolgen oder Umverteilungen können weitere Lösungen liefern. Geplante Dienststunden sind kein Urlaubskontingent und keine Berechnung der Urlaubsgutschrift.',
        ...(limited||initial.length>100?['Teilanalyse: Zeit- oder Positionsgrenze erreicht. Die verbleibenden Positionen enthalten ungeprüfte Dienste.']:[]),
        ...(!removed.length?['Im geladenen Plan wurde kein überschneidender Dienst gefunden. Daraus folgt keine automatische Genehmigung.']:[])],actions:[{view:'absence',label:'Abwesenheiten öffnen'}],proposal:null,context:{intent:'leaveImpact',dates,employeeId:e.id}});
  }
  function changeImpact(s,request){
    const unavailable=analysisReady(s,'Änderungsvorschau');if(unavailable)return unavailable;
    const original=s.assignments.filter(active),source=original.find(a=>String(a.id)===String(request.assignmentId)),e=s.employees.find(e=>String(e.id)===String(request.targetEmployeeId)&&e.status==='active'&&!e.deletedAt);
    if(!source||!e)return response('Auswahl prüfen','Bitte einen vorhandenen Dienst und einen aktiven Zielmitarbeiter dieses Unternehmens wählen.');
    const owner=s.employees.find(e=>String(e.id)===String(source.employeeId));if(!owner)return response('Zuordnung prüfen','Der bisherige Mitarbeiter ist nicht vollständig geladen.');
    const assignment=model(s,{date:request.date||source.date,type:request.type||source.type,employeeId:e.id,start:request.start||model(s,source).start,end:request.end||model(s,source).end});
    if(!valid(assignment)||!s.shifts.some(t=>t.id===assignment.type))return response('Eingaben prüfen','Schicht und gültige Uhrzeiten müssen vollständig gewählt sein.');
    const dates=[...new Set([source.date,assignment.date])].sort(),without=original.filter(a=>a!==source),after=[...without,assignment],guard=s.candidates(assignment.type,assignment.date,without,assignment),id=String(e.id),problems=[];
    if(!(guard.candidates||[]).some(c=>String(c.e.id)===id))problems.push((guard.assessments||[]).find(x=>String(x.employeeId)===id)?.reason||'Der Zielmitarbeiter erfüllt die aktuellen Besetzungsregeln für diesen Dienst nicht.');
    if(!capacity(s,e,without,assignment))problems.push('Erholung, Arbeitsblock oder persönliche Stundenobergrenze verhindert die Zuweisung.');
    problems.push(...checkedPlan(s,original,after,new Set([id,String(owner.id)]),dates));
    if(s.isPublished?.(source.date)||s.isPublished?.(assignment.date)||!s.movable?.(source))problems.push('Der Ausgangsdienst oder der Zeitraum ist geschützt. Änderungen müssen im zuständigen Bereich gesondert geprüft werden.');
    const beforeOpen=slots(s,dates,original).length,afterOpen=slots(s,dates,after).length;if(afterOpen>beforeOpen)problems.push('Die Änderung erzeugt '+(afterOpen-beforeOpen)+' zusätzliche offene Pflichtposition(en).');
    const affected=[...new Map([owner,e].map(e=>[String(e.id),e])).values()],months=[...new Set(dates.map(d=>d.slice(0,7)))];
    const metrics=[];for(const person_ of affected)for(const month of months){const monthDates=Array.from({length:new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate()},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));
      const neighbours=after.filter(a=>String(a.employeeId)===String(person_.id)&&a!==assignment).map(a=>model(s,a)).filter(a=>a.date>=Solid.plus(dates[0],-7)&&a.date<=Solid.plus(dates.at(-1),7)).sort((a,b)=>a.date.localeCompare(b.date));
      metrics.push([person(person_)+' · '+month,h(hours(s,person_,original,monthDates))+' → '+h(hours(s,person_,after,monthDates))+' h',h(s.monthTarget?.(person_)||0)+' h',neighbours.map(a=>a.date+' · '+a.type).join('\n')||'Keine weiteren Dienste im geladenen Randbereich.']);
    }
    return response('Dienständerung – Vorschau',source.date+' · '+source.type+' · '+person(owner)+' → '+assignment.date+' · '+assignment.type+' · '+person(e)+' ('+assignment.start+'–'+assignment.end+'). Offene Pflichtpositionen '+beforeOpen+' → '+afterOpen+'. '+(problems.length?'Prüfbedarf: '+new Set(problems).size+' Hinweis(e).':'Unter den geladenen Regeln gemeinsam geprüft.'),{columns:['Mitarbeiter / Monat','Geplante Stunden','Monats-SOLL','Angrenzende Dienste (±7 Tage)'],rows:metrics,blockers:[...new Set(problems)],notes:[
      'Vorschau ohne Speicherung. Bestehende Vorschläge und gespeicherte Dienste werden nicht verändert. Nach tatsächlichen Änderungen müssen ältere Vorschläge erneut geprüft werden; ihre bisherige Freigabe gilt nicht weiter.',
      'Geprüft werden Besetzung, Freigaben, Abwesenheiten, Rhythmus, Erholung, Stundenlimits und die verbleibenden Dienste beider Personen. Änderungen an Datum, Schicht und Uhrzeiten sind einbezogen.',
      'Die Berechnung verwendet aktuell geladene Daten. Vor dem Speichern gelten weiterhin die Prüfungen des Dienstplan-Editors und des Servers.'
    ],actions:[{view:'schedule',date:assignment.date,type:assignment.type,label:'Im Dienstplan prüfen'}],proposal:null,context:{intent:'changeImpact',dates}});
  }
  function improvements(s,dates,excluded=new Set(),outage=false){
    if(!rulesReady(s))return response('Regeln noch nicht bereit','Die verbindlichen Planungsregeln müssen vor einer Vorschau vollständig geladen sein.',{context:{intent:outage?'outage':'improvements',dates}});
    if(!s.candidates)return response('Prüfung nicht verfügbar','Die Besetzungsprüfung ist noch nicht geladen.');
    const original=s.assignments.filter(active),removed=outage?original.filter(a=>dates.includes(a.date)&&excluded.has(String(a.employeeId))):[],base=original.filter(a=>!removed.includes(a)),proposed=[],changes=[];
    const initial=outage?removed.map(a=>({date:a.date,type:a.type})):slots(s,dates,base),remaining=new Map();
    const target=e=>Math.max(0,Number(s.monthTarget(e,dates[0].slice(0,7)))||0);
    for(const slot of initial.slice(0,500)){
      if(!outage&&s.isPublished?.(slot.date))continue;
      const options=candidates(s,slot,[...base,...proposed],excluded).filter(c=>outage||hours(s,c.e,[...base,...proposed],dates)<target(c.e)-0.05);
      options.sort((a,b)=>(target(b.e)-hours(s,b.e,[...base,...proposed],dates))-(target(a.e)-hours(s,a.e,[...base,...proposed],dates))||person(a.e).localeCompare(person(b.e),'de'));
      const c=options[0];if(!c){const key=slot.date+'|'+slot.type;remaining.set(key,(remaining.get(key)||0)+1);continue;}
      proposed.push(c.a);changes.push({assignment:c.a,employee:c.e,before:hours(s,c.e,[...base,...proposed.slice(0,-1)],dates),after:hours(s,c.e,[...base,...proposed],dates),target:target(c.e),reason:'Freigaben, Abwesenheiten, Rhythmus, Erholung und persönliche Stunden-/Schichtgrenzen geprüft.'});
    }
    // A single local reassignment can relieve a violation without creating a new one.
    if(!outage&&s.movable){const issues=audit(s,dates).issues;for(const issue of issues.slice(0,20)){
      const rows=[...base,...proposed],beforeIssues=audit({...s,assignments:rows},dates).issues,key=x=>String(x.employee.id)+'|'+x.date+'|'+x.message,beforeKeys=new Set(beforeIssues.map(key));
      for(const a of rows.filter(a=>base.includes(a)&&String(a.employeeId)===String(issue.employee.id)&&dates.includes(a.date)&&s.movable(a))){
        const without=rows.filter(x=>x!==a),options=candidates(s,{date:a.date,type:a.type},without,new Set([String(a.employeeId)]));
        const c=options.find(c=>{if(hours(s,c.e,rows,dates)>=target(c.e))return false;const after=audit({...s,assignments:[...without,c.a]},dates).issues;return after.length<beforeIssues.length&&after.every(x=>beforeKeys.has(key(x)))});if(!c)continue;
        base.splice(base.indexOf(a),1);proposed.push(c.a);changes.push({assignment:c.a,replaces:a,employee:c.e,before:hours(s,c.e,rows,dates),after:hours(s,c.e,[...without,c.a],dates),target:target(c.e),reason:'Entlastet '+person(issue.employee)+'; Regelauffälligkeiten nehmen ab. Feste und geschützte Dienste bleiben erhalten.'});break;
      }
    }}
    const beforeMissing=slots(s,dates,original).length,afterMissing=slots(s,dates,[...base,...proposed]).length,deficit=rows=>s.employees.filter(e=>e.status==='active'&&!e.deletedAt).reduce((n,e)=>n+Math.max(0,target(e)-hours(s,e,rows,dates)),0);
    return response(outage?'Ausfall durchspielen – Simulation':'Konkrete Verbesserungen – Vorschau',changes.length+' geprüfte Zuweisungen vorgeschlagen. '+(outage?remaining.size+' betroffene Schichten bleiben ohne passenden Ersatz.':'Offene Positionen: '+beforeMissing+' → '+afterMissing+'. Stunden-Soll-Defizit: '+h(deficit(original))+' → '+h(deficit([...base,...proposed]))+' h.'),{columns:['Mitarbeiter','Dienst','Stunden vorher → nachher','Monats-SOLL','Begründung'],rows:changes.map(c=>[person(c.employee),c.assignment.date+' · '+c.assignment.type,h(c.before)+' → '+h(c.after)+' h',h(c.target)+' h',c.reason]),rowActions:changes.map(c=>({view:'schedule',date:c.assignment.date,type:c.assignment.type,label:'Dienst prüfen'})),notes:[outage?'Angenommener Ausfall. Es wird keine Abwesenheit gebucht und kein Dienst geändert.':'Nur Entwürfe. Übernahme erst nach Bestätigung und erneuter Prüfung des gespeicherten Plans.','Die Suche prüft direkte Besetzungen und einzelne Entlastungswechsel; sie garantiert kein globales Optimum.',...(initial.length>500?['Die Vorschau ist auf 500 Positionen begrenzt.']:[]),...([...remaining].map(([k,n])=>k.replace('|',' · ')+': '+n+' Position(en) ohne regelkonformen Vorschlag.'))],proposal:outage?null:{base,proposed,changes,dates},context:{intent:outage?'outage':'improvements',dates,pending:false}});
  }
  // Bounded repair search: keep every protected assignment and only accept a
  // jointly checked plan with fewer gaps or a strictly smaller hours deficit.
  function bottlenecks(s,dates,focusIds=null,options={}){
    const context={intent:'bottlenecks',dates,pending:false};
    if(!rulesReady(s)||!s.candidates||!s.monthTarget)return response('Engpasslöser noch nicht bereit','Die verbindlichen Regeln und Besetzungsprüfungen müssen vollständig geladen sein.',{context});
    const original=s.assignments.filter(active),staff=s.employees.filter(e=>e.status==='active'&&!e.deletedAt);
    const focused=e=>!focusIds||focusIds.includes(String(e.id));
    const target=e=>Math.max(0,Number(s.monthTarget(e,dates[0].slice(0,7)))||0);
    const deficit=(rows,focus=false)=>staff.filter(e=>!focus||focused(e)).reduce((n,e)=>n+Math.max(0,target(e)-hours(s,e,rows,dates)),0);
    const baseline=audit(s,dates),key=x=>String(x.employee.id)+'|'+x.date+'|'+x.message;
    if(baseline.unknown.length)return response('Engpasslöser – Daten prüfen','Die Prüfung ist unvollständig. Bitte zuerst die fehlenden Daten ergänzen.',{notes:baseline.unknown,context});
    const allowedIssues=new Set(baseline.issues.map(key));
    const started=Date.now();let checks=0,limited=false,rows=original.slice();
    const budget=()=>{if(checks>=240||Date.now()-started>1800){limited=true;return false;}return true;};
    const eligible=(slot,plan,exclude=new Set())=>{if(!budget())return [];checks++;const list=candidates(s,slot,plan,exclude),scores=options.balanceScore?new Map(list.map(c=>[c,options.balanceScore([...plan,c.a])])):null;return list.sort((a,b)=>{
      const gain=c=>Math.min(paid(s,c.a),Math.max(0,target(c.e)-hours(s,c.e,plan,dates)));
      return Number(focused(b.e))-Number(focused(a.e))||(scores?scores.get(a)-scores.get(b):0)||gain(b)-gain(a)||person(a.e).localeCompare(person(b.e),'de');
    });};
    const canMove=a=>original.includes(a)&&staff.some(e=>String(e.id)===String(a.employeeId))&&dates.includes(a.date)&&!s.isPublished?.(a.date)&&!!s.movable?.(a);
    const finalValid=plan=>{
      if(audit({...s,assignments:plan},dates).issues.some(x=>!allowedIssues.has(key(x))))return false;
      // Removing a duty can affect the donor's block/rhythm as well as the recipient.
      const affected=new Set([...original.filter(a=>!plan.includes(a)),...plan.filter(a=>!original.includes(a))].map(a=>String(a.employeeId)));
      for(const a of plan.filter(a=>affected.has(String(a.employeeId)))){
        if(!budget())return false;checks++;
        const e=staff.find(e=>String(e.id)===String(a.employeeId)),without=plan.filter(x=>x!==a);
        if(!e||!capacity(s,e,without,a)||!(s.candidates(a.type,a.date,without,model(s,a)).candidates||[]).some(c=>String(c.e.id)===String(e.id)))return false;
      }return true;
    };
    const initialSlots=slots(s,dates,original),blocked=[];
    const accept=plan=>{
      if(deficit(plan)>deficit(rows)+0.05||deficit(plan,true)>deficit(rows,true)+0.05||options.balanceScore&&options.balanceScore(plan)>options.balanceScore(rows)+0.05||!finalValid(plan))return false;
      rows=plan;return true;
    };
    for(const slot of initialSlots.slice(0,100)){
      if(!budget())break;
      if(s.isPublished?.(slot.date)){blocked.push([slot,'Veröffentlichter Zeitraum bleibt geschützt.']);continue;}
      // Recalculate coverage: a previously repaired group may already be full.
      if(!slots(s,[slot.date],rows).some(x=>x.type===slot.type))continue;
      const direct=eligible(slot,rows);let found=false;
      for(const c of direct){if(accept([...rows,c.a])){found=true;break;}}
      if(found)continue;
      // Free a qualified person by handing one movable draft to another person.
      for(const donor of rows.filter(canMove)){
        if(!budget())break;
        const without=rows.filter(a=>a!==donor);
        const next=eligible(slot,without).filter(c=>String(c.e.id)===String(donor.employeeId));
        for(const c of next){
          const replacements=eligible({date:donor.date,type:donor.type},[...without,c.a],new Set([String(donor.employeeId)]));
          for(const replacement of replacements){
            const a=model(s,{...replacement.a,start:donor.start||replacement.a.start,end:donor.end||replacement.a.end,note:donor.note||'',pause:Number(donor.pause||0)});
            if(accept([...without,c.a,a])){found=true;break;}
          }if(found)break;
        }if(found)break;
      }
      if(!found)blocked.push([slot,'In der begrenzten Suche keine gemeinsam geprüfte Besetzung gefunden.']);
    }
    // Redistribute existing duties to staff below target without creating gaps
    // or increasing the total deficit. No extra demand is invented to add hours.
    for(const donor of (options.goal==='coverage'?[]:rows.filter(canMove))){
      if(!budget())break;
      const without=rows.filter(a=>a!==donor),before=deficit(rows),beforeFocus=deficit(rows,true);
      for(const c of eligible({date:donor.date,type:donor.type},without,new Set([String(donor.employeeId)]))){
        if(!focused(c.e)||hours(s,c.e,rows,dates)>=target(c.e)-0.05)continue;
        const a=model(s,{...c.a,start:donor.start||c.a.start,end:donor.end||c.a.end,note:donor.note||'',pause:Number(donor.pause||0)}),plan=[...without,a];
        if((options.balanceScore?options.balanceScore(plan)<options.balanceScore(rows)-0.05:focusIds?deficit(plan,true)<beforeFocus-0.05:deficit(plan)<before-0.05)&&accept(plan))break;
      }
    }
    const removed=original.filter(a=>!rows.includes(a)),base=original.filter(a=>rows.includes(a)),proposed=rows.filter(a=>!original.includes(a));
    const unmatched=removed.slice(),changes=proposed.map(a=>{
      const index=unmatched.findIndex(x=>x.date===a.date&&x.type===a.type),replaced=index<0?null:unmatched.splice(index,1)[0],e=staff.find(e=>String(e.id)===String(a.employeeId));
      return {assignment:a,...(replaced?{replaces:replaced}:{}),employee:e,before:hours(s,e,original,dates),after:hours(s,e,rows,dates),target:target(e),reason:replaced?'Entwurf von '+person(staff.find(e=>String(e.id)===String(replaced.employeeId)))+' umverteilen; Pflichtbesetzung bleibt erhalten.':'Offene Pflichtposition besetzen; Freigaben und verbindliche Regeln geprüft.'};
    });
    const remaining=slots(s,dates,rows),diagnoses=[],seen=new Set();
    const suggestion=reason=>/Freigabe|Leitungsrolle|Standort/i.test(reason)?'Zusätzliche verfügbare Person mit passender Freigabe, Rolle und Standortzuordnung prüfen.':/Abwesenheit|Freizeit/i.test(reason)?'Weitere verfügbare Vertretung prüfen; Abwesenheiten und Freizeitzusagen bleiben geschützt.':/Stunden|grenze|Schichtanzahl/i.test(reason)?'Qualifiziertes Personal mit verbleibender Stundenkapazität prüfen.':/Rhythmus|Erholung|Ruhezeit|Arbeitsblock|Schichtwechsel/i.test(reason)?'Passenden Arbeitsblock oder weitere Vertretung prüfen; verbindliche Regeln bleiben bestehen.':'Zusätzliche passende Kapazität oder eine weitergehende manuelle Umplanung prüfen.';
    for(const slot of remaining){
      const id=slot.date+'|'+slot.type;if(seen.has(id)||diagnoses.length>=12)continue;seen.add(id);
      const protectedDay=s.isPublished?.(slot.date);let reasons=[];
      if(!protectedDay&&budget()){checks++;for(const type of slot.alternatives||[slot.type]){if(!budget())break;checks++;reasons.push(...(s.candidates(type,slot.date,rows).reasons||[]));}}
      const labels=[...new Set(reasons.map(r=>r.label))];
      diagnoses.push(slot.date+' · '+slot.type+': '+(protectedDay?'Veröffentlicht und geschützt. Änderungen einzeln im Dienstplan prüfen.':labels.length?labels.join('; ')+'. '+suggestion(labels.join(' ')):blocked.find(([x])=>x.date===slot.date&&x.type===slot.type)?.[1]||'Keine Lösung in der begrenzten Suche gefunden. Zusätzliche Kapazität oder weitere Umplanung prüfen.'));
    }
    const beforeMissing=initialSlots.length,afterMissing=remaining.length;
    const afterAudit=audit({...s,assignments:rows},dates);
    if(deficit(rows,true)>0.05)diagnoses.push('Noch fehlende Sollstunden'+(focusIds?' im gewählten Fokus':'')+': '+h(deficit(rows,true))+' h. Eine vollständige Pflichtbesetzung bedeutet nicht automatisch, dass alle ihr Stunden-SOLL erreichen. Weitere Verteilung oder zusätzlichen tatsächlichen Bedarf gesondert prüfen.');
    const affected=[...new Set([...removed,...proposed].map(a=>String(a.employeeId)))].map(id=>staff.find(e=>String(e.id)===id)).filter(Boolean);
    return response('Engpasslöser – Entscheidungsvorschlag',new Date(dates[0]+'T12:00:00Z').toLocaleDateString('de-DE',{month:'long',year:'numeric',timeZone:'UTC'})+': Offene Pflichtpositionen '+beforeMissing+' → '+afterMissing+'. Fehlende Sollstunden '+h(deficit(original))+' → '+h(deficit(rows))+' h. Verbindliche Regelauffälligkeiten '+baseline.issues.length+' → '+afterAudit.issues.length+'.'+(focusIds?' Fokus: '+staff.filter(focused).map(person).join(', ')+'.':''),{
      columns:['Änderung','Dienst','Stunden vorher → nachher','Monats-SOLL','Begründung'],
      rows:changes.map(c=>[person(c.employee),c.assignment.date+' · '+c.assignment.type,h(c.before)+' → '+h(c.after)+' h',h(c.target)+' h',c.reason]),
      rowActions:changes.map(c=>({view:'schedule',date:c.assignment.date,type:c.assignment.type,label:'Dienst prüfen'})),
      blockers:diagnoses,
      notes:[changes.length?changes.length+' Zuweisungen, davon '+removed.length+' veränderte Entwurfsdienste.':'Keine übernehmbare Änderung gefunden.',
        ...affected.map(e=>person(e)+': '+h(hours(s,e,original,dates))+' → '+h(hours(s,e,rows,dates))+' h; SOLL '+h(target(e))+' h.'),
        ...(remaining.length>seen.size?['Weitere offene Positionen sind im Dienstplan sichtbar.']:[]),
        'Geprüft werden direkte Besetzungen, das Umverteilen eines Entwurfs mit Ersatz und Stundenverschiebungen. Längere Ketten und das Versetzen ganzer Arbeitsblöcke sind nicht Teil dieser Suche. Kein Nachweis, dass andere Lösungen unmöglich sind.',
        'Ausschlussgründe beziehen sich auf die aktuelle Kandidatenprüfung; sie sind kein Beweis für eine notwendige Regeländerung.',
        ...(limited||initialSlots.length>100?['Suchgrenze erreicht. Das Ergebnis ist eine Teilanalyse; erneut prüfen oder im Dienstplan weiterplanen.']:[]),
        'Feste und geschützte Dienste sowie veröffentlichte Zeiträume bleiben erhalten. Übernahme erst nach Bestätigung und erneuter Prüfung.'],
      actions:[{view:'schedule',date:dates[0],month:true,label:'Dienstplan prüfen'}],
      proposal:proposed.length?{base,proposed,changes,dates}:null,context
    });
  }
  function journal(s,dates,type){
    if(s.journalError)return response('Planungsprotokoll nicht verfügbar',s.journalError,{context:{intent:'runReasons',dates,type}});
    const runs=(s.planningRuns||[]).filter(r=>r.first_month<=dates.at(-1)&&r.last_date>=dates[0]),run=runs[0];
    if(!run)return response('Kein gespeichertes Planungsprotokoll','Für diesen Zeitraum wurde noch kein Planungsprotokoll geladen oder gespeichert. Neue Auto-Planungsläufe zeichnen die Prüfung der verbleibenden Lücken auf. Frühere Entscheidungen werden nicht nachträglich erfunden.',{context:{intent:'runReasons',dates,type}});
    const entries=(run.analysis?.entries||[]).filter(x=>dates.includes(x.date)&&(!type||x.type===type));
    return response('Gespeicherte Planungsgründe','Stand des Laufs vom '+new Date(run.created_at).toLocaleString('de-DE')+'. '+run.analysis.open+' offene Positionen im damaligen Ergebnis.',{columns:['Datum','Schicht','Ausschlussgründe im Ergebnis'],rows:entries.map(x=>[x.date,x.type,x.reasons.map(r=>r.count+' × '+r.label).join('; ')||'Keine passende Besetzung unter den geprüften Regeln.']),notes:['Gespeicherte Prüfung am Ende des Planungslaufs. Dies ist keine vollständige Aufzeichnung aller Suchschritte.','Im verwendeten Browser gespeichert, getrennt nach Benutzer und Unternehmen; bis zu 20 Läufe der letzten 90 Tage. Keine Synchronisierung zwischen Geräten.','Das aktuelle Ergebnis kann nach späteren Änderungen abweichen.',...(run.analysis.truncated?['Die Detailansicht wurde auf 200 Schichten begrenzt.']:[])],context:{intent:'runReasons',dates,type}});
  }
  return {audit,workload,improvements,bottlenecks,checkedPlan,forecast,leaveImpact,changeImpact,journal,person,hours,paid,capacity,slots};
});
