// SchichtFunk: deterministic, read-only planning answers. No model or external API.
(function(root){
  'use strict';
  const normalize=v=>String(v||'').toLocaleLowerCase('de-DE').replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const months=['januar','februar','maerz','april','mai','juni','juli','august','september','oktober','november','dezember'];
  const pad=n=>String(n).padStart(2,'0');
  const day=(y,m,d)=>`${y}-${pad(m)}-${pad(d)}`;
  function validDate(value){const m=String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return false;const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));return d.toISOString().slice(0,10)===value;}
  function addDays(value,n){const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
  function monthDates(year,month){return Array.from({length:new Date(Date.UTC(year,month,0)).getUTCDate()},(_,i)=>day(year,month,i+1));}
  const formatDate=v=>new Date(v+'T12:00:00Z').toLocaleDateString('de-DE',{timeZone:'UTC'});
  const hours=v=>Number(v||0).toLocaleString('de-DE',{maximumFractionDigits:1});
  const name=e=>[e.first,e.last].filter(Boolean).join(' ')||e.personnelNo||'Mitarbeiter';
  const meta=(e,k)=>String((e.qualifications||[]).find(q=>String(q).startsWith('__sp:'+k+'='))||'').split('=').slice(1).join('=');
  const team=e=>e.planningTeam??meta(e,'planningTeam');
  function duration(a,shifts){const t=shifts.find(t=>t.id===a.type),start=a.start||t?.start,end=a.end||t?.end;const mins=v=>/^\d{2}:\d{2}$/.test(v||'')?Number(v.slice(0,2))*60+Number(v.slice(3)):NaN;let m=mins(end)-mins(start);if(m<0)m+=1440;return Number.isFinite(m)?m/60:0;}
  function intentFor(q){
    if(/^(?:bitte\s+)?(?:loesch|entfern|speicher|uebernehm|uebernimm|trag|buche|weise)\w*/.test(q)&&!/\b(wie|wo|hilfe|anleitung)\b/.test(q))return 'write';
    if(/\b(export|excel|pdf|ausdruck|drucken)\w*/.test(q))return 'export';
    if(/veroeffentlich|freigeben|freigabe.*plan/.test(q))return 'publish';
    if(/\b(team|teams)\b/.test(q)&&/rhythm|rhytm|zyklus|tagesfolge|einstieg/.test(q)&&/\b(wie|wo|einstell|aender|einricht|hilfe)\w*/.test(q))return 'rhythmHelp';
    if(/(ohne|fehl\w*|kein\w*|nicht).*team|team.*(fehl\w*|ohne|nicht zugeordnet|keine zuordnung)/.test(q))return 'unassigned';
    if(/ersatz|einspring|uebernehmen|infrage|in frage|wer .*kann|passende.*mitarbeiter|verfuegbar.*mitarbeiter|mitarbeiter.*verfuegbar|wer.*verfuegbar|vertretung|besetz.*vorschlag/.test(q))return 'replacement';
    if(/(?:warum|weshalb|wieso).*(?:plan|dienst|schicht|besetz)|nicht besetz|keine vorschlaege|kein vorschlag|autoplanung.*(fehler|problem)|auto.?planung.*(fehler|problem)/.test(q))return 'diagnosis';
    if(/stunden|auslastung|ueberlast|unterlast/.test(q))return 'workload';
    if(/\b(team|teams)\b/.test(q))return 'teams';
    if(/\b(wie|wo|hilfe|erklaer)\w*/.test(q)&&/auto.?planung|autoplanung|automatisch.*plan/.test(q))return 'autoHelp';
    if(/\b(offen|unbesetzt|unterbesetzt|unterbesetzung|fehlende|luecken)\b|noch.*besetz/.test(q))return 'open';
    if(/\b(besetzung|abdeckung|soll|vollstaendig|planungscheck)\w*|(?:pruefe|kontrollier).*plan/.test(q))return 'coverage';
    if(/rhythm|rhytm|zyklus/.test(q))return 'rhythmHelp';
    if(/abwesen|urlaub|krank|ausfall/.test(q))return 'absence';
    if(/schichtfreigab|qualifikation|berechtigung.*schicht/.test(q))return 'permissionHelp';
    if(/\b(hilfe|help|unterstuetzung|funktionen)\b|was kannst/.test(q))return 'help';
    return null;
  }
  function parsePeriod(q,s){
    const base=s.defaultDates?.[0]||s.today,year=Number(base.slice(0,4));
    const iso=q.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if(iso)return validDate(iso[1])?{dates:[iso[1]],explicit:true}:{error:'Dieses Datum ist ungültig. Bitte gib beispielsweise 01.12.2026 ein.'};
    const numeric=q.match(/\b(\d{1,2})\.(\d{1,2})\.(?:(\d{4})\b)?/);
    if(numeric){const v=day(numeric[3]?+numeric[3]:year,+numeric[2],+numeric[1]);return validDate(v)?{dates:[v],explicit:true}:{error:'Dieses Datum ist ungültig. Bitte prüfe Tag, Monat und Jahr.'};}
    const shortMonth=q.match(/\b(\d{4})-(\d{2})\b/);
    if(shortMonth)return +shortMonth[2]>=1&&+shortMonth[2]<=12?{dates:monthDates(+shortMonth[1],+shortMonth[2]),explicit:true}:{error:'Bitte einen Monat zwischen 01 und 12 angeben.'};
    const month=months.findIndex(m=>new RegExp('\\b'+m+'\\b').test(q));
    if(month>=0){const y=Number(q.match(/\b(20\d{2})\b/)?.[1]||year),d=q.match(new RegExp('\\b(\\d{1,2})\\.?\\s+'+months[month]+'\\b'));if(d){const v=day(y,month+1,+d[1]);return validDate(v)?{dates:[v],explicit:true}:{error:'Dieses Datum ist ungültig.'};}return{dates:monthDates(y,month+1),explicit:true};}
    if(/\bheute\b/.test(q))return{dates:[s.today],explicit:true};
    if(/\buebermorgen\b/.test(q))return{dates:[addDays(s.today,2)],explicit:true};
    if(/\bmorgen\b/.test(q))return{dates:[addDays(s.today,1)],explicit:true};
    if(/(naechsten|kommenden|naechster|kommender|diesen|aktuellen|dieser) monat/.test(q)){const d=new Date(s.today+'T12:00:00Z');if(/naechst|kommend/.test(q))d.setUTCMonth(d.getUTCMonth()+1,1);return{dates:monthDates(d.getUTCFullYear(),d.getUTCMonth()+1),explicit:true};}
    if(/(diese|aktuellen|aktuelle|naechste|kommende) woche/.test(q)){const d=new Date(s.today+'T12:00:00Z');let offset=-((d.getUTCDay()+6)%7);if(/naechst|kommend/.test(q))offset+=7;const start=addDays(s.today,offset);return{dates:Array.from({length:7},(_,i)=>addDays(start,i)),explicit:true};}
    return{dates:s.defaultDates||[s.today],explicit:false};
  }
  function parseShift(q,s){
    const exact=s.shifts.filter(t=>new RegExp('(?:^|[^a-z0-9])'+normalize(t.id).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:$|[^a-z0-9])').test(q));
    if(exact.length===1)return exact[0].id;
    if(exact.length>1)return null;
    const aliases=[[/frueh(?:schicht|dienst)?/,'FD'],[/spaet(?:schicht|dienst)?/,'SD'],[/nacht(?:schicht|dienst)?/,'ND']];
    const ids=aliases.filter(([p])=>p.test(q)).map(([,id])=>s.shifts.find(t=>t.id===id)||s.shifts.find(t=>normalize(t.name).includes(id==='FD'?'frueh':id==='SD'?'spaet':'nacht'))).filter(Boolean);
    if(ids.length===1)return ids[0].id;
    const byName=s.shifts.filter(t=>t.name&&t.name!==t.id&&q.includes(normalize(t.name)));return byName.length===1?byName[0].id:null;
  }
  function periodLabel(dates){if(dates.length===1)return formatDate(dates[0]);if(dates.length>=28&&dates[0].endsWith('-01')&&dates.at(-1).slice(0,7)===dates[0].slice(0,7))return new Date(dates[0]+'T12:00:00Z').toLocaleDateString('de-DE',{month:'long',year:'numeric',timeZone:'UTC'});return `${formatDate(dates[0])} bis ${formatDate(dates.at(-1))}`;}
  function coverage(s,dates,type){const rows=[];for(const date of dates)for(const shift of s.shifts){if(type&&shift.id!==type)continue;const soll=Math.max(0,Number(s.getSoll(date,shift.id))||0),ist=s.assignments.filter(a=>a.date===date&&a.type===shift.id).length;if(soll||ist)rows.push({date,type:shift.id,soll,ist,missing:Math.max(0,soll-ist),extra:Math.max(0,ist-soll)});}return rows;}
  function response(title,text,more={}){return{title,text,rows:[],columns:[],actions:[],...more};}
  function findHelp(q,articles){
    const stop=new Set(['wie','wo','was','wer','warum','kann','kannst','koennen','ich','mir','man','den','die','das','der','dem','des','ein','eine','einen','einem','und','oder','im','in','am','an','zu','mit','von','fuer','bitte','meine','meinen','mein','sind','ist','werden','wird','habe','haben']);
    const words=[...new Set(q.split(/[^a-z0-9]+/).filter(w=>w.length>=3&&!stop.has(w)))];
    let best=null;
    for(const items of Object.values(articles||{}))for(const [title,text] of items){
      const t=normalize(title),body=normalize(text),hits=words.filter(w=>t.includes(w)||body.includes(w)),score=hits.reduce((n,w)=>n+(t.includes(w)?3:1),0);
      if((hits.length>=2||hits.length===1&&hits[0].length>=6&&t.includes(hits[0]))&&(!best||score>best.score))best={title,text,score};
    }
    return best;
  }
  function answer(question,s,previous={}){
    if(!s.authorized)return response('Anmeldung erforderlich','Der Planungsassistent ist nur für angemeldete Benutzer mit Planungsrechten verfügbar.',{context:{}});
    if(s.loading)return response('Daten werden geladen','Bitte warte, bis das Unternehmen vollständig geladen ist, und stelle deine Frage erneut.',{context:{}});
    if(s.error)return response('Daten derzeit nicht bereit','Die Planungsdaten konnten nicht zuverlässig geladen werden. Bitte prüfe die Cloud-Verbindung und lade das Unternehmen erneut.',{context:{}});
    const q=normalize(question).trim();if(!q)return response('Deine Frage','Schreibe eine Frage zur Planung oder wähle eines der Beispiele.',{context:previous});
    const period=parsePeriod(q,s);if(period.error)return response('Datum prüfen',period.error,{context:previous});
    const detected=intentFor(q),followup=previous.pending||/^(und|auch|dafuer|dazu|diese|diesen|am|im|fuer|team|fd\b|sd\b|nd\b|\d)/.test(q)||(!detected&&(period.explicit||parseShift(q,s)));
    const intent=detected||(followup?previous.intent:null),dates=period.explicit?period.dates:followup&&previous.dates?previous.dates:period.dates;
    const type=parseShift(q,s)||(followup?previous.type:null),requestedTeam=q.match(/\bteam\s+([a-e])\b/)?.[1]?.toUpperCase()||(followup?previous.team:null);
    const context={intent,dates,type,team:requestedTeam,pending:false},label=periodLabel(dates),shiftLabel=id=>{const t=s.shifts.find(t=>t.id===id);return t?.name&&t.name!==id?`${id} · ${t.name}`:id;};
    const staff=s.employees.filter(e=>!e.deletedAt&&e.status==='active');
    const nav=(view,label)=>({view,label});
    const help=(!intent||/^(wie|wo)\b/.test(q)&&!['rhythmHelp','autoHelp','export','publish','replacement','permissionHelp','workload'].includes(intent))?findHelp(q,s.helpArticles):null;
    if(help)return response(help.title,help.text,{actions:[{help:true,label:'Anleitung im Hilfe-Center öffnen'}],context:{}});
    if(intent==='write')return response('Änderung im passenden Bereich durchführen','Ich kann die Planung prüfen und Vorschläge anzeigen. Zum Speichern, Löschen oder Übernehmen öffne bitte den passenden Bereich und bestätige die Änderung dort.',{actions:[nav('schedule','Dienstplan öffnen')],context});
    if(intent==='rhythmHelp')return response(requestedTeam?`Rhythmus von Team ${requestedTeam} einstellen`:'Teamrhythmus einstellen','1. Einstellungen öffnen und „Teamrhythmen A–E“ auswählen.\n2. Beim gewünschten Team „Einrichten“ oder „Bearbeiten“ wählen.\n3. Startdatum, Tagesfolge und Einstiegsposition festlegen.\n4. Speichern und die Auto-Planung neu prüfen.\nDie Regel gilt verbindlich für die zugeordneten Mitarbeiter. Ordne Mitarbeiter unter Personal → Mitarbeiter dem Planungsteam zu.',{actions:[nav('settings','Teamrhythmen öffnen'),nav('employees','Mitarbeiter öffnen')],context});
    if(intent==='unassigned'){const rows=staff.filter(e=>!['A','B','C','D','E'].includes(team(e)));return response('Mitarbeiter ohne Teamzuordnung',`${rows.length} aktive Mitarbeiter haben kein Planungsteam A–E. Das kann beabsichtigt sein, beispielsweise bei Mitarbeitern ausschließlich für den Frühdienst. Für sie gilt eine vorhandene individuelle Schichtregel.`,{columns:['Mitarbeiter','Schichtfreigaben'],rows:rows.map(e=>[name(e),(e.shifts||[]).join(', ')||'Keine']),actions:[nav('employees','Teamzuordnung prüfen')],context});}
    if(intent==='teams'){const teams=requestedTeam?[requestedTeam]:['A','B','C','D','E'];return response('Planungsteams',teams.map(t=>`Team ${t}: ${staff.filter(e=>team(e)===t).length} aktive Mitarbeiter.`).join('\n'),{columns:['Team','Start','Tagesfolge','Einstieg'],rows:teams.map(t=>{const r=s.teamRules?.find(r=>r.team===t);return[t,r?.start?formatDate(r.start):'Keine zentrale Regel',r?.pattern?.join(' · ')||'Individuelle Regeln prüfen',r?`Tag ${Number(r.offset)+1}`:'–'];}),actions:[nav('settings','Teamrhythmen öffnen')],context});}
    if(intent==='export')return response('Gesamten Dienstplan exportieren','Öffne den Dienstplan, wähle die Monatsansicht und den gewünschten Monat. Über die Export-Schaltflächen kannst du den Gesamtplan als Excel-Datei oder PDF ausgeben.',{actions:[{view:'schedule',label:'Dienstplan öffnen',date:dates[0],month:dates.length>1}],context});
    if(intent==='publish')return response('Dienstplan veröffentlichen','Öffne den Dienstplan im gewünschten Zeitraum und wähle „Veröffentlichen & Mitarbeiter informieren“. Prüfe die angezeigten offenen Positionen und Konflikte und bestätige anschließend die Veröffentlichung. Entwürfe sind noch nicht für Mitarbeiter freigegeben.',{actions:[nav('schedule','Dienstplan öffnen')],context});
    if(intent==='autoHelp')return response('Auto-Planung verwenden','1. Auto-Planung öffnen und Tag, Woche oder Monat auswählen.\n2. Die Regeln für Vertragsstunden und faire Verteilung prüfen.\n3. „Vorschläge erstellen“ wählen.\n4. Vorschläge und verbleibende offene Positionen prüfen.\n5. Geprüfte Vorschläge als Entwurf übernehmen und den Dienstplan anschließend veröffentlichen.',{actions:[nav('auto','Auto-Planung öffnen')],context});
    if(intent==='permissionHelp')return response('Schichtfreigaben prüfen','Öffne Personal → Mitarbeiter und wähle das Profil. Unter Qualifikationen die freigegebenen Schichtarten prüfen und speichern. Ein Teamrhythmus ersetzt keine Schichtfreigabe.',{actions:[nav('employees','Mitarbeiter öffnen')],context});
    if(intent==='absence'){const rows=s.absences.filter(a=>a.status!=='Abgelehnt'&&staff.some(e=>e.id===a.employeeId)&&dates.some(d=>d>=(a.startDate||a.date)&&d<=(a.endDate||a.date||a.startDate)));return response(`Abwesenheiten · ${label}`,`${rows.length} Abwesenheitseinträge überschneiden sich mit diesem Zeitraum. Beantragte Einträge sind noch nicht genehmigt.`,{columns:['Mitarbeiter','Von','Bis','Status'],rows:rows.map(a=>[name(staff.find(e=>e.id===a.employeeId)),formatDate(a.startDate||a.date),formatDate(a.endDate||a.date||a.startDate),a.status||'Erfasst']),actions:[nav('absence','Abwesenheiten öffnen')],context});}
    if(intent==='workload'){const named=staff.filter(e=>q.includes(normalize(name(e)))||e.personnelNo&&new RegExp('\\b'+normalize(e.personnelNo)+'\\b').test(q)),pool=named.length?named:staff;return response(`Geplante Stunden · ${label}`,'Die Werte zählen geplante Dienste nach ihrem Startdatum und ohne Pausenabzug. Ein Monats-SOLL wird nur bei einem vollständigen Kalendermonat gegenübergestellt.',{columns:['Mitarbeiter','Geplant','Monats-SOLL'],rows:pool.map(e=>{const h=s.assignments.filter(a=>a.employeeId===e.id&&dates.includes(a.date)).reduce((sum,a)=>sum+duration(a,s.shifts),0),full=dates.length>=28&&dates[0].endsWith('-01')&&dates[0].slice(0,7)===dates.at(-1).slice(0,7);return[name(e),hours(h)+' Std.',full?hours(s.monthTarget(e))+' Std.':'–'];}),actions:[nav('reports','Auswertungen öffnen')],context});}
    if(intent==='replacement'){
      if(dates.length!==1||!type)return response('Für welchen Dienst suchst du Ersatz?',`Bitte gib ${dates.length!==1?'einen konkreten Tag':''}${dates.length!==1&&!type?' und ':''}${!type?'die Schichtart':''} an, zum Beispiel „Wer kann am 01.12.2026 den FD übernehmen?“`,{context:{...context,pending:true},suggestions:s.shifts.slice(0,6).map(t=>`Ersatz für ${t.id}${dates.length===1?' am '+formatDate(dates[0]):''}`)});
      const result=s.candidates(type,dates[0]);
      return response(`Ersatz für ${shiftLabel(type)} · ${label}`,result.candidates.length?`${result.candidates.length} Mitarbeiter erfüllen die aktuellen Auto-Planungsregeln. Die Auswahl ist ein Vorschlag; vor der tatsächlichen Zuordnung erneut prüfen.`:'Aktuell erfüllt kein Mitarbeiter alle Auto-Planungsregeln für diesen Dienst.',{columns:['Mitarbeiter','Woche geplant / SOLL','Monat geplant / SOLL'],rows:result.candidates.map(c=>[name(c.e),`${hours(c.h)} / ${hours(c.target)} Std.`,`${hours(c.monthHours)} / ${hours(c.monthTarget)} Std.`]),notes:result.candidates.length?['Die Rangfolge berücksichtigt die aktuell eingestellten Regeln für Stunden und faire Verteilung.']:result.reasons.map(r=>`${r.count} Mitarbeiter: ${r.label}`),actions:[{view:'schedule',date:dates[0],label:'Dienst im Plan prüfen'}],context});
    }
    if(['open','coverage','diagnosis'].includes(intent)){
      const all=coverage(s,dates,type),missing=all.filter(x=>x.missing),required=all.reduce((n,x)=>n+x.soll,0),open=missing.reduce((n,x)=>n+x.missing,0),extra=all.reduce((n,x)=>n+x.extra,0);
      if(intent==='diagnosis'){
        const relevant=dates.length===1&&type?all:missing;
        if(!relevant.length)return response(`Planungsprüfung · ${label}`,'Für den angefragten Zeitraum sind nach den gespeicherten SOLL-Werten keine offenen Positionen vorhanden.',{context,actions:[nav('auto','Auto-Planung öffnen')]});
        return response(`Besetzung prüfen · ${label}`,'Ich prüfe die aktuell gespeicherte Planung. Gründe aus einer früheren Auto-Planung lassen sich nur durch eine erneute Analyse mit denselben Regeln nachvollziehen. Kandidaten je Dienst können nicht gleichzeitig für mehrere Dienste zugesagt werden.',{columns:['Tag','Schicht','Offen','Aktuelle Prüfung'],rows:relevant.map(x=>{const r=s.candidates(x.type,x.date);return[formatDate(x.date),shiftLabel(x.type),String(x.missing),r.candidates.length?`${r.candidates.length} passende Mitarbeiter; Auto-Planung erneut analysieren.`:r.reasons.map(y=>`${y.count}× ${y.label}`).join('; ')||'Kein passender Mitarbeiter unter den aktuellen Regeln.'];}),actions:[nav('auto','Auto-Planung prüfen'),nav('employees','Mitarbeiter prüfen')],context});
      }
      const rows=intent==='open'?missing:all;
      return response(`${intent==='open'?'Offene Dienste':'SOLL / IST'} · ${label}`,required?`${open} offene Positionen in ${missing.length} Schichten. ${required-open} von ${required} benötigten Positionen sind besetzt.${extra?` Zusätzlich ${extra} Besetzungen über SOLL.`:''}`:'Für diesen Zeitraum ist kein SOLL-Bedarf hinterlegt. Bitte prüfe die Einstellungen, bevor du den Plan als vollständig bewertest.',{columns:['Tag','Schicht','SOLL','IST','Offen'],rows:rows.map(x=>[formatDate(x.date),shiftLabel(x.type),String(x.soll),String(x.ist),String(x.missing)]),actions:[{view:'schedule',date:dates[0],month:dates.length>1,label:'Zeitraum im Dienstplan öffnen'},nav('auto','Auto-Planung öffnen')],suggestions:['Warum konnte die Auto-Planung die offenen Dienste nicht besetzen?'],context});
    }
    return response(intent==='help'?'Dabei kann ich dich unterstützen':'Bitte konkretisiere deine Frage',intent==='help'?'Ich unterstütze dich bei offenen Diensten, Besetzung, Ersatzsuche, Teamzuordnung, Teamrhythmen, Stunden, Abwesenheiten, Export und Veröffentlichung.':'Für diese Frage habe ich noch keine zuverlässige Auswertung. Nenne bitte das Planungsthema und bei Dienstfragen den Zeitraum oder den konkreten Tag mit Schichtart.',{suggestions:['Welche Dienste sind im Dezember noch offen?','Warum konnte die Auto-Planung diesen Dienst nicht besetzen?','Welche Mitarbeiter kommen als Ersatz infrage?','Bei welchen Mitarbeitern fehlt eine Teamzuordnung?','Wie stelle ich den Rhythmus von Team E ein?','Wie viele Stunden sind im Dezember geplant?'],context:{}});
  }
  const api={answer,normalize,parsePeriod,parseShift,coverage,periodLabel,validDate,team,findHelp};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SFPlanningAssistantCore=api;
})(typeof window==='undefined'?globalThis:window);
