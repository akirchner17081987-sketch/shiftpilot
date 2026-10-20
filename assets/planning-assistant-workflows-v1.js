// Bounded planning workflows. All mutations remain confirmed, fingerprinted server operations.
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./planning-assistant-insights-v1.js'):root.SFPlanningInsights);if(typeof module==='object'&&module.exports)module.exports=api;else root.SFPlanningWorkflows=api})(typeof window!=='undefined'?window:globalThis,function(I){
  'use strict';
  const reply=(title,text,more={})=>({title,text,columns:[],rows:[],actions:[],...more});
  const h=n=>Number(n||0).toLocaleString('de-DE',{maximumFractionDigits:1});
  const staff=s=>s.employees.filter(e=>e.status==='active'&&!e.deletedAt);
  function months(first,count){const d=new Date(first.slice(0,7)+'-01T12:00:00Z'),out=[];for(let i=0;i<count;i++){out.push(d.toISOString().slice(0,7));d.setUTCMonth(d.getUTCMonth()+1);}return out;}
  function datesFor(month){const n=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate();return Array.from({length:n},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));}
  function diff(original,rows,dates,s){const removed=original.filter(a=>!rows.includes(a)),proposed=rows.filter(a=>!original.includes(a)),left=removed.slice();return {base:original.filter(a=>rows.includes(a)),proposed,removed,dates,monthCount:new Set(dates.map(d=>d.slice(0,7))).size,changes:proposed.map(a=>{const i=left.findIndex(x=>x.date===a.date&&x.type===a.type),replaces=i<0?null:left.splice(i,1)[0];return{assignment:a,replaces,employee:s.employees.find(e=>String(e.id)===String(a.employeeId))};})};}
  function order(s,dates,focusIds,goal='both'){
    const r=I.bottlenecks(s,dates,focusIds,{goal});
    return {...r,title:'Planungsauftrag – Vorschau',text:(goal==='coverage'?'Ziel: Pflichtdienste besetzen. ':'Ziel: Pflichtdienste besetzen und Sollstunden verbessern. ')+r.text,notes:['Auftrag für '+dates[0].slice(0,7)+'. Veröffentlichte, feste und geschützte Dienste bleiben bestehen. Übernahme erst nach Bestätigung.',...(r.notes||[])],context:{intent:'order',dates}};
  }
  function multi(s,first,count=3,focusIds=null){
    if(!Number.isInteger(count)||count<2||count>6)return reply('Zeitraum prüfen','Bitte zwei bis sechs aufeinanderfolgende Kalendermonate wählen.');
    const keys=months(first,count),dates=keys.flatMap(datesFor),people=staff(s),original=s.assignments.slice();let plan=original.slice();const notes=[];
    if(!s.solidRules?.enabled||!s.rulesReady||!s.candidates)return reply('Mehrmonatsausgleich – noch nicht bereit','Bitte vollständige Planungsregeln und Dienstpläne laden.');
    const target=(e,m)=>Math.max(0,Number(s.monthTarget(e,m))||0),total=e=>keys.reduce((n,m)=>n+target(e,m),0),actual=(e,rows)=>I.hours(s,e,rows,dates);
    // Squared deficits prioritize chronic under-allocation without raising monthly limits.
    const wanted=new Set(dates),targets=new Map(people.filter(e=>!focusIds||focusIds.includes(String(e.id))).map(e=>[String(e.id),total(e)])),paidMemo=new WeakMap();
    const score=rows=>{const sums=new Map();for(const a of rows){const id=String(a.employeeId);if(!targets.has(id)||!wanted.has(a.date))continue;if(!paidMemo.has(a))paidMemo.set(a,I.paid(s,a));sums.set(id,(sums.get(id)||0)+paidMemo.get(a));}let value=0;for(const [id,target] of targets)value+=Math.max(0,target-(sums.get(id)||0))**2;return value;};
    for(const m of keys){
      const md=datesFor(m),local={...s,assignments:plan,monthTarget:e=>target(e,m)};
      const result=I.bottlenecks(local,md,focusIds,{balanceScore:score});
      if(result.proposal)plan=[...result.proposal.base,...result.proposal.proposed];
      notes.push(m+': '+(result.blockers?.length?result.blockers.join(' '):result.proposal?'Geprüfte Änderungen vorgeschlagen.':result.text),...(result.notes||[]).filter(n=>/Suchgrenze|unvollstaendig|unvollständig/.test(n)));
    }
    const ids=new Set([...original.filter(a=>!plan.includes(a)),...plan.filter(a=>!original.includes(a))].map(a=>String(a.employeeId)));
    const problems=I.checkedPlan(s,original,plan,ids,dates),proposal=diff(original,plan,dates,s);
    return reply('Mehrmonatsausgleich – Vorschau',keys[0]+' bis '+keys.at(-1)+': '+proposal.proposed.length+' Zuweisungen vorgeschlagen. Jeder Monat behält seine persönlichen Obergrenzen.',{
      columns:['Mitarbeiter',...keys.map(m=>m+' vorher → nachher'),'Gesamt vor → nach / SOLL','Restdefizit'],
      rows:people.filter(e=>!focusIds||focusIds.includes(String(e.id))).map(e=>[I.person(e),...keys.map(m=>h(I.hours(s,e,original,datesFor(m)))+' → '+h(I.hours(s,e,plan,datesFor(m)))+' / '+h(target(e,m))+' h'),h(actual(e,original))+' → '+h(actual(e,plan))+' / '+h(total(e))+' h',h(Math.max(0,total(e)-actual(e,plan)))+' h']),
      notes:['Auswertung tatsächlicher geladener Dienstpläne; geplante Stunden, keine Lohnabrechnung oder Überstundenfreigabe.','Fehlende Belegungen in einem Monat zählen als 0 geplante Stunden. Prüfe, ob diese Monate bereits ausgeplant sind.','Das geladene Vertrags-SOLL gilt für jeden Monat. Künftige Vertragsänderungen sind nur berücksichtigt, wenn sie bereits in den Vorgaben hinterlegt sind.','Erholung und Wochenstunden werden auch an Monatsgrenzen gemeinsam geprüft. Die begrenzte Suche garantiert kein Optimum.','Stunden werden durch zulässige Besetzungen und Umverteilungen ausgeglichen. Monatsobergrenzen werden nicht zwischen Monaten übertragen.',...notes],
      blockers:problems,proposal:!problems.length&&proposal.proposed.length?proposal:null,context:{intent:'multiBalance',dates}});
  }
  function wizard(s,dates,progress={}){
    const month=dates[0].slice(0,7),open=I.slots(s,dates,s.assignments).length,audit=I.audit(s,dates),people=staff(s),under=people.filter(e=>I.hours(s,e,s.assignments,dates)<Number(s.monthTarget(e))-0.05).length;
    const definitions=[['coverage','Pflichtbesetzung',open?open+' Positionen offen.':'Pflichtpositionen besetzt.','Engpasslöser '+month,open===0],['rules','Verbindliche Regeln',audit.unknown.length?'Regelprüfung unvollständig.':audit.issues.length?audit.issues.length+' Auffälligkeiten.':'Keine Auffälligkeiten in den geprüften Regeln.','Belastungscheck '+month,!audit.unknown.length&&!audit.issues.length],['hours','Stundenverteilung',under+' Personen unter ihrem Monats-SOLL.','Planungsauftrag '+month,false],['reserve','Vertretungsreserve','Vertretungsreserve prüfen und verbleibende Engpässe bewerten.','Frühwarnung '+month,false],['release','Veröffentlichung vorbereiten','Abschließenden Monatscheck und Veröffentlichungsdialog prüfen.','Monatscheck '+month,false]];
    const steps=definitions.map(([key,title,text,question,automatic])=>({key,title,text,question,done:['coverage','rules'].includes(key)?automatic:!!progress[key],automatic:['coverage','rules'].includes(key)}));
    const next=steps.find(x=>!x.done);
    return reply('Geführte Monatsplanung – '+month,next?'Nächster Schritt: '+next.title+'.':'Alle Schritte wurden bearbeitet. Prüfe den aktuellen Plan vor der Veröffentlichung.',{wizard:{month,steps},notes:['Pflichtbesetzung und Regeln werden bei jedem Aufruf neu geprüft. Manuelle Bestätigungen werden nach Planänderungen zurückgesetzt.','Fortschritt wird in diesem Browser getrennt nach Benutzer und Unternehmen gespeichert. Keine automatische Veröffentlichung.'],actions:next?[{question:next.question,label:next.title+' bearbeiten'}]:[{view:'schedule',date:dates[0],month:true,label:'Monat öffnen'}],context:{intent:'wizard',dates}});
  }
  // Include metadata and version so even a later note edit prevents an unsafe undo.
  function stamp(s,a){const t=s.shifts.find(t=>t.id===a.type);return JSON.stringify([String(a.employeeId),a.date,a.type,a.start||t?.start,a.end||t?.end,Number(a.pause||0),a.note||'',a.version??null,a._dbStatus||a.status||'DRAFT',a.publishedAt||null]);}
  function undo(s,entry){
    const notes=['Rücknahmehistorie dieses Browsers, getrennt nach Benutzer und Unternehmen. Höchstens 20 Vorgänge der letzten 90 Tage.','Es werden ausschließlich Dienste dieses Vorgangs zurückgenommen. Spätere Änderungen oder geschützte Dienste blockieren die Rücknahme.'];
    if(!entry)return reply('Änderungen rückgängig machen','Hier ist kein rücknehmbarer Assistentenvorgang gespeichert.',{notes,context:{intent:'undo'}});
    const removed=[],problems=[];
    for(const expected of entry.added||[]){const a=s.assignments.find(a=>String(a.id)===String(expected.id));if(!a||stamp(s,a)!==expected.stamp)problems.push('Dienst '+expected.date+' · '+expected.type+' wurde zwischenzeitlich geändert oder entfernt.');else if(!s.movable?.(a)||s.isPublished?.(a.date))problems.push('Dienst '+a.date+' · '+a.type+' ist inzwischen geschützt.');else removed.push(a);}
    if(!entry.added?.length)problems.push('Dieser Vorgang enthält keine nachweisbaren Assistentendienste.');
    const base=s.assignments.filter(a=>!removed.includes(a)),restored=(entry.before||[]).map(a=>{const copy={...a};delete copy._dbId;delete copy.id;delete copy.version;return copy;}),plan=[...base,...restored],ids=new Set([...removed,...restored].map(a=>String(a.employeeId)));
    if(!problems.length)problems.push(...I.checkedPlan(s,s.assignments,plan,ids,entry.dates));
    const proposal={base,proposed:restored,removed,dates:entry.dates,monthCount:entry.monthCount||1,changes:restored.map(a=>({assignment:a,employee:s.employees.find(e=>String(e.id)===String(a.employeeId))})),undoId:entry.id};
    return reply('Rücknahme – Vorschau',entry.label+' vom '+new Date(entry.created).toLocaleString('de-DE')+': '+removed.length+' Assistentendienste entfernen, '+restored.length+' frühere Entwurfsdienste wiederherstellen.',{columns:['Änderung','Datum','Schicht','Mitarbeiter'],rows:[...removed.map(a=>['Entfernen',a.date,a.type,I.person(s.employees.find(e=>String(e.id)===String(a.employeeId))||{id:a.employeeId})]),...restored.map(a=>['Wiederherstellen',a.date,a.type,I.person(s.employees.find(e=>String(e.id)===String(a.employeeId))||{id:a.employeeId})])],blockers:problems,notes:[...notes,'Durch die Rücknahme können zuvor geschlossene Besetzungslücken wieder offen sein. Verbindliche Serverprüfungen bleiben aktiv.'],proposal:problems.length?null:proposal,context:{intent:'undo',dates:entry.dates}});
  }
  return {months,datesFor,diff,order,multi,wizard,stamp,undo};
});
