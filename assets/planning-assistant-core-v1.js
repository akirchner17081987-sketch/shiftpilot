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
  const Insights=typeof module!=='undefined'&&module.exports?require('./planning-assistant-insights-v1.js'):root.SFPlanningInsights;
  const meta=(e,k)=>String((e.qualifications||[]).find(q=>String(q).startsWith('__sp:'+k+'='))||'').split('=').slice(1).join('=');
  const team=e=>e.planningTeam??meta(e,'planningTeam');
  function duration(a,shifts){const t=shifts.find(t=>t.id===a.type),start=a.start||t?.start,end=a.end||t?.end;const mins=v=>/^\d{2}:\d{2}$/.test(v||'')?Number(v.slice(0,2))*60+Number(v.slice(3)):NaN;let m=mins(end)-mins(start);if(m<0)m+=1440;return Number.isFinite(m)?m/60:0;}
  function intentFor(q){
    if(/belastungscheck|belastung.*(?:pruef|hoch)|(?:wo|wer).*(?:belast|erholung)|lange arbeitsbloecke|ruhezeiten pruefen/.test(q))return 'loadCheck';
    if(/ausfall.*(?:durchspiel|simulier)|was passiert.*(?:ausfaellt|ausfall)|wenn.*(?:ausfaellt|fehlt)|ausfallsimulation/.test(q))return 'outage';
    if(/planungsprotokoll|gespeicherte.*(?:gruende|planung)|(?:letzte|damalige).*planungs(?:lauf|gruende)|was hat.*besetzung.*verhindert/.test(q))return 'runReasons';
    if(/verbesserungsvorsch|planverbesser|stunden.*(?:verbessern|optimier)|(?:wie.*(?:kollegen|mitarbeiter).*naeher.*soll)|(?:plan|monat|januar|februar|maerz|april|mai|juni|juli|august|september|oktober|november|dezember).*(?:ausgewogen|optimier|verbessern)/.test(q))return 'improvements';
    if(/^(?:bitte\s+)?(?:loesch|entfern|speicher|uebernehm|uebernimm|trag|buche|weise)\w*/.test(q)&&!/\b(wie|wo|hilfe|anleitung)\b/.test(q))return 'write';
    if(/monatscheck|planungscheck|was.*(?:fehlt|muss.*pruef)|(?:pruefe|kontrollier).*plan|planung.*(?:fertig|vollstaendig)|plan.*bereit/.test(q))return 'planningCheck';
    if(/ueberbesetz|zu viele.*(?:dienst|schicht)|mehr.*soll/.test(q))return 'overstaffed';
    if(/(?:fehl|ohne|kein).*schichtfreigab|schichtfreigab.*(?:fehl|ohne|kein)/.test(q))return 'missingPermissions';
    if(/(?:warum|weshalb|wieso).*(?:kann|darf|mitarbeiter|geeignet|passt)/.test(q)&&!/anmeld|login|passwort|speicher|qr|pause|urlaub|beantrag|zeiterfass|stundenkonto|mfa|kamera|zugang|export|auto.?plan/.test(q))return 'employeeDiagnosis';
    if(/team\s+[a-e]\b/.test(q)&&/(?:heute|morgen|uebermorgen|am\s+\d|rhythmus.*tag)/.test(q)&&/rhythm|schicht|frei|arbeitet/.test(q))return 'teamDay';
    if(/(?:dienste|schichten).*(?:hat|fuer|von|team\s+[a-e])|(?:wann|wo).*arbeitet|(?:dienstplan|planung)\s+(?:fuer|von)/.test(q))return 'employeePlan';
    if(/\b(export|excel|pdf|ausdruck|drucken)\w*/.test(q))return 'export';
    if(/veroeffentlich|freigeben|freigabe.*plan/.test(q))return 'publish';
    if(/\b(team|teams)\b/.test(q)&&/rhythm|rhytm|zyklus|tagesfolge|einstieg/.test(q)&&/\b(wie|wo|einstell|aender|einricht|hilfe)\w*/.test(q))return 'rhythmHelp';
    if(/(ohne|fehl\w*|kein\w*|nicht).*team|team.*(fehl\w*|ohne|nicht zugeordnet|keine zuordnung)/.test(q))return 'unassigned';
    if(/ersatz|einspring|uebernehmen|infrage|in frage|wer .*kann|passende.*mitarbeiter|verfuegbar.*mitarbeiter|mitarbeiter.*verfuegbar|wer.*verfuegbar|vertretung|besetz.*vorschlag/.test(q))return 'replacement';
    if(/(?:warum|weshalb|wieso).*(?:plan|dienst|schicht|besetz)|nicht besetz|keine vorschlaege|kein vorschlag|autoplanung.*(fehler|problem)|auto.?planung.*(fehler|problem)/.test(q))return 'diagnosis';
    if(/stunden|auslastung|ueberlast|unterlast|ueber.*(?:vertrags|monats).?soll|unter.*(?:vertrags|monats).?soll/.test(q))return 'workload';
    if(/\b(team|teams)\b/.test(q))return 'teams';
    if(/\b(wie|wo|hilfe|erklaer)\w*/.test(q)&&/auto.?planung|autoplanung|automatisch.*plan/.test(q))return 'autoHelp';
    if(/\b(offen\w*|unbesetzt\w*|unterbesetzt\w*|unterbesetzung|fehlende|luecken)\b|noch.*besetz/.test(q))return 'open';
    if(/\b(besetzung|abdeckung|soll|vollstaendig|planungscheck)\w*|(?:pruefe|kontrollier).*plan/.test(q))return 'coverage';
    if(/rhythm|rhytm|zyklus/.test(q))return 'rhythmHelp';
    if(/abwesen|urlaub|krank|ausfall/.test(q))return 'absence';
    if(/schichtfreigab|qualifikation|berechtigung.*schicht/.test(q))return 'permissionHelp';
    if(/\b(hilfe|help|unterstuetzung|funktionen|hilfethemen|wissensdatenbank|anleitungen)\b|was kannst/.test(q))return 'help';
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
  function coverage(s,dates,type){
    const rows=[];
    for(const date of dates)for(const shift of s.shifts){
      const group=s.coverageInfo?.(date,shift.id);
      if(type&&shift.id!==type&&!group?.members?.some(member=>member.id===type))continue;
      if(group&&group.representative!==shift.id)continue;
      const raw=s.getSoll(date,shift.id);
      const soll=Math.max(0,Number(group?group.target:(s.requiredSoll?.(date,shift.id,raw)??raw))||0);
      const ist=group?Math.max(0,Number(group.filled)||0):s.assignments.filter(a=>a.date===date&&a.type===shift.id).length;
      const optional=group?0:Math.max(0,Number(s.optionalTarget?.(date,shift.id))||0);
      if(soll||ist)rows.push({date,type:shift.id,label:group?.label,soll,ist,missing:Math.max(0,soll-ist),extra:Math.max(0,ist-Math.max(soll,optional))});
    }
    return rows;
  }

  const escapePattern=v=>String(v).replace(/[^a-z0-9]/g,c=>'\\'+c);
  function employeeMatches(q,staff){
    const has=value=>{const v=normalize(value).trim();return v&&new RegExp('(?:^|[^a-z0-9])'+escapePattern(v)+'(?:$|[^a-z0-9])').test(q);};
    const exact=staff.filter(e=>has(name(e))||e.personnelNo&&has(e.personnelNo));
    return exact.length?exact:staff.filter(e=>[e.first,e.last].some(v=>normalize(v).length>=3&&has(v)));
  }
  function plannedHours(s,e,dates){return s.assignments.filter(a=>String(a.employeeId)===String(e.id)&&dates.includes(a.date)).reduce((sum,a)=>sum+duration(a,s.shifts),0);}
  function fullMonth(dates){return dates.length>=28&&dates[0].endsWith('-01')&&dates[0].slice(0,7)===dates.at(-1).slice(0,7);}
  function response(title,text,more={}){return{title,text,rows:[],columns:[],actions:[],...more};}
  function planningCheck(s,dates,staff){
    const all=coverage(s,dates),open=all.reduce((n,x)=>n+x.missing,0),extra=all.reduce((n,x)=>n+x.extra,0),required=all.reduce((n,x)=>n+x.soll,0);
    const checks=[],add=(priority,topic,text,action)=>checks.push({priority,topic,text,action});
    const schedule={view:'schedule',date:dates[0],month:true,label:'Monat öffnen'};
    if(!required)add(1,'SOLL-Bedarf','Kein SOLL-Bedarf hinterlegt. Vollständigkeit kann noch nicht bewertet werden.',{view:'settings',label:'SOLL prüfen',section:'soll'});
    if(open)add(1,'Offene Dienste',open+' Positionen in '+all.filter(x=>x.missing).length+' Schichten fehlen.',{question:'Welche Dienste sind im '+dates[0].slice(0,7)+' noch offen?',label:'Offene Dienste anzeigen'});
    const activeCodes=new Set(s.shifts.map(t=>t.id));
    const noPermissions=staff.filter(e=>!(e.shifts||[]).some(t=>activeCodes.has(t)));
    if(noPermissions.length)add(1,'Schichtfreigaben',noPermissions.length+' aktive Mitarbeiter haben keine Freigabe für eine aktive Schichtart.',{question:'Welche Mitarbeiter haben keine Schichtfreigabe?',label:'Mitarbeiter prüfen'});
    const used=s.assignments.filter(a=>dates.includes(a.date));
    const conflicts=used.filter(a=>!staff.some(e=>String(e.id)===String(a.employeeId))||!activeCodes.has(a.type)||!staff.find(e=>String(e.id)===String(a.employeeId))?.shifts?.includes(a.type));
    if(conflicts.length)add(1,'Bestehende Zuweisungen',conflicts.length+' Dienste betreffen nicht aktive Mitarbeiter, entfernte Schichtarten oder fehlende Freigaben.',schedule);
    const teams=[...new Set(staff.map(team).filter(t=>/^[A-E]$/.test(t)))];
    if(s.teamRulesReady===false)add(2,'Teamregeln','Zentrale Teamregeln sind noch nicht geladen; dieser Teil der Prüfung ist offen.',{view:'settings',label:'Teamregeln prüfen'});
    else for(const t of teams){
      const r=s.teamRules?.find(r=>r.team===t);
      if(!r?.pattern?.length||!validDate(r.start)||!Number.isInteger(Number(r.offset||0))||Number(r.offset||0)<0||Number(r.offset||0)>=r.pattern.length||r.pattern.some(v=>!activeCodes.has(v)&&!['FREI','ALLE'].includes(v)))add(2,'Team '+t,'Zentrale Regel fehlt oder enthält unvollständige Angaben. Vorhandene individuelle Regeln gesondert prüfen.',{view:'settings',team:t,label:'Team '+t+' öffnen'});
      else if(r.start>dates.at(-1))add(2,'Team '+t,'Zentraler Rhythmus beginnt erst am '+formatDate(r.start)+'.',{view:'settings',team:t,label:'Startdatum prüfen'});
      else if(r.start>dates[0])add(2,'Team '+t,'Zentraler Rhythmus beginnt innerhalb des Monats am '+formatDate(r.start)+'. Frühere Tage gesondert prüfen.',{view:'settings',team:t,label:'Startdatum prüfen'});
    }
    const onlyEarly=e=>{const allowed=(e.shifts||[]).filter(t=>activeCodes.has(t));return allowed.length===1&&s.shifts.some(t=>t.id===allowed[0]&&(t.id==='FD'||/frueh/.test(normalize(t.name))));};
    const withoutTeam=staff.filter(e=>!['A','B','C','D','E'].includes(team(e))&&!onlyEarly(e)&&!noPermissions.includes(e));
    if(withoutTeam.length)add(2,'Teamzuordnung prüfen',withoutTeam.length+' Mitarbeiter ohne Planungsteam. Das kann vorgesehen sein; individuelle Regeln prüfen.',{view:'employees',employeeFilter:'__no_planning_team__',label:'Teamzuordnung öffnen'});
    const workloads=staff.map(e=>({e,h:plannedHours(s,e,dates),target:Number(s.monthTarget(e))}));
    const above=workloads.filter(x=>x.target>0&&x.h>x.target+0.05),below=workloads.filter(x=>x.target>0&&x.h<x.target-0.05),unknown=workloads.filter(x=>!(x.target>0));
    if(above.length)add(2,'Geplantes Monats-SOLL',above.length+' Mitarbeiter liegen mit geplanten Stunden über ihrem Monats-SOLL.',{question:'Wer liegt im '+dates[0].slice(0,7)+' über dem Monats-SOLL?',label:'Stunden prüfen'});
    if(unknown.length)add(2,'Stundenvorgaben',unknown.length+' aktive Mitarbeiter ohne positives Monats-SOLL; kein Stundenvergleich möglich.',{view:'employees',employeeId:unknown[0].e.id,label:'Stundenvorgaben prüfen'});
    if(extra)add(2,'Überbesetzung',extra+' Besetzungen über SOLL. Sie gleichen offene Dienste an anderer Stelle nicht aus.',{question:'Welche Dienste sind im '+dates[0].slice(0,7)+' überbesetzt?',label:'Überbesetzung anzeigen'});
    if(below.length)add(3,'Noch verplanbare Stunden',below.length+' Mitarbeiter liegen unter ihrem geplanten Monats-SOLL. Das ist ein Planungshinweis.',{question:'Wer liegt im '+dates[0].slice(0,7)+' unter dem Monats-SOLL?',label:'Stunden anzeigen'});
    const exempt=staff.filter(e=>!team(e)&&onlyEarly(e));
    if(exempt.length)add(3,'FD ohne Planungsteam',exempt.length+' ausschließlich für Frühdienst freigegebene Mitarbeiter ohne Team werden hier nicht als fehlende Teamzuordnung bewertet.',{view:'employees',employeeId:exempt[0].id,label:'Profil ansehen'});
    if(!staff.length)add(1,'Mitarbeiter','Keine aktiven Mitarbeiter geladen.',{view:'employees',label:'Mitarbeiter öffnen'});
    if(!checks.length)add(3,'Basisprüfung','Keine Auffälligkeiten in den geprüften Angaben.',schedule);
    if(Insights){const report=Insights.audit(s,dates);for(const issue of report.issues)add(1,'Belastung: '+Insights.person(issue.employee),issue.date+' · '+issue.message,{view:'schedule',date:issue.date,label:'Belastung prüfen'});for(const warning of report.unknown)add(2,'Belastungsprüfung offen',warning,schedule);add(3,'Konkrete Verbesserungen','Passende Zusatzbesetzung und Entlastungswechsel als Vorschau prüfen.',{question:'Verbesserungsvorschläge für '+dates[0].slice(0,7),label:'Verbesserungen vorschlagen'});}
    checks.sort((a,b)=>a.priority-b.priority);
    return response('Monatscheck – '+periodLabel(dates),open+' offene Positionen. '+checks.filter(x=>x.priority<3).length+' Prüfpunkte benötigen Aufmerksamkeit.',{
      columns:['Priorität','Prüfung','Ergebnis'],rows:checks.map(x=>[x.priority===1?'Zuerst prüfen':x.priority===2?'Danach prüfen':'Hinweis',x.topic,x.text]),rowActions:checks.map(x=>x.action),
      notes:['Prüfung der aktuell geladenen Planung und Stammdaten. Kein Ersatz für die vollständige Auto-Planungsanalyse oder die Prüfung vor Veröffentlichung.','Stunden beziehen sich auf geplante Dienste ohne Pausenabzug, nicht auf bestätigte Überstunden.'],
      actions:[schedule,{view:'auto',label:'Auto-Planung öffnen'}],context:{intent:'planningCheck',dates,pending:false}});
  }
  function findHelp(q,articles){
    const aliases=[
      [/monatsbericht|zeiterfassung.*(?:excel|pdf|export)|(?:excel|pdf|export).*zeiterfassung/,'reports','Wie exportiere ich Monatsberichte'],
      [/datev|lodas/,'reports','DATEV-LODAS'],
      [/qr.*(?:anzeigen|finden|ausdruck|nachdruc|drucken|code.*wo)|(?:wo|wie).*qr.?code/,'trouble','aktuelle QR-Code'],
      [/(?:zehn|10|viele).*paus|paus.*(?:zehn|10|viele)/,'qr','Wie viele Pausen'],
      [/qr.*paus.*bezahlt|paus.*(?:abzug|bezahlt)/,'qr','QR-Pausen bezahlt'],
      [/team.*(?:zuordn|zuweis|hinzufueg)|mitarbeiter.*team.*einstell/,'employees','Planungsteam zu'],
      [/team.*(?:rhythm|rhytm|zyklus)|rhythm.*team/,'settings','Teamrhythmen A'],
      [/monat.*(?:excel|pdf|export)|(?:excel|pdf|export).*monat/,'schedule','Gesamtdienstplan'],
      [/vorschlaege.*(?:alt|verwerf|erneut|nicht aktuell)/,'auto','Warum muss ich Vorschläge'],
      [/passwort|login|anmeld/,'trouble','nicht anmelden'],
      [/speicher.*(?:fehler|nicht)|nicht.*speicher/,'trouble','Änderung wird nicht gespeichert'],
      [/hell|dunkel|darkmode/,'appearance','Hell und Dunkel'],
      [/pwa|startbildschirm|installier/,'appearance','Startbildschirm'],
      [/stundenkonto|saldo/,'time','Stundenkonto'],
      [/nur zeiterfassung|zeiterfassungszugang/,'time','Nur Zeiterfassung'],
      [/schichttausch|marktplatz/,'portal','Schichttausch'],
      [/soll.*(?:aender|einstell|staerk)|(?:aender|einstell).*soll/,'settings','SOLL-Stärken']
    ];
    for(const [pattern,category,titlePart] of aliases)if(pattern.test(q)){
      const article=(articles?.[category]||[]).find(([title])=>normalize(title).includes(normalize(titlePart)));
      if(article)return{title:article[0],text:article[1],category,score:100};
    }

    const stop=new Set(['wie','wo','was','wer','warum','kann','kannst','koennen','ich','mir','man','den','die','das','der','dem','des','ein','eine','einen','einem','und','oder','im','in','am','an','zu','mit','von','fuer','bitte','meine','meinen','mein','sind','ist','werden','wird','habe','haben']);
    const words=[...new Set(q.split(/[^a-z0-9]+/).filter(w=>w.length>=3&&!stop.has(w)))];
    let best=null;
    for(const [category,items] of Object.entries(articles||{}))for(const [title,text] of items){
      const t=normalize(title),body=normalize(text),hits=words.filter(w=>t.includes(w)||body.includes(w)),score=hits.reduce((n,w)=>n+(t.includes(w)?3:1),0);
      if((hits.length>=2||hits.length===1&&hits[0].length>=6&&t.includes(hits[0]))&&(!best||score>best.score))best={title,text,score,category};
    }
    return best;
  }
  function answer(question,s,previous={}){
    if(!s.authorized)return response('Anmeldung erforderlich','Der Planungsassistent ist nur für angemeldete Benutzer mit Planungsrechten verfügbar.',{context:{}});
    if(s.loading)return response('Daten werden geladen','Bitte warte, bis das Unternehmen vollständig geladen ist, und stelle deine Frage erneut.',{context:{}});
    if(s.error)return response('Daten derzeit nicht bereit','Die Planungsdaten konnten nicht zuverlässig geladen werden. Bitte prüfe die Cloud-Verbindung und lade das Unternehmen erneut.',{context:{}});
    const q=normalize(question).trim();if(!q)return response('Deine Frage','Schreibe eine Frage zur Planung oder wähle eines der Beispiele.',{context:previous});
    const period=parsePeriod(q,s);if(period.error)return response('Datum prüfen',period.error,{context:previous});
    const detected=/^(?:(?:und|auch|fuer)\s+)?team\s+[a-e][?.!]*$/.test(q)&&previous.intent?previous.intent:intentFor(q),followup=previous.pending||/^(und|auch|dafuer|dazu|diese|diesen|am|im|fuer|team|fd\b|sd\b|nd\b|\d)/.test(q)||(!detected&&(period.explicit||parseShift(q,s)));
    const intent=detected||(followup?previous.intent:null);
    const selected=s.selectedService&&validDate(s.selectedService.date)&&s.shifts.some(t=>t.id===s.selectedService.type)?s.selectedService:null;
    const useService=selected&&['replacement','diagnosis','employeeDiagnosis'].includes(intent)&&(/\b(dieser|diesen|diesem|diese|hier|dafuer)\b/.test(q)||!period.explicit&&!previous.pending);
    const dates=period.explicit?period.dates:useService?[selected.date]:followup&&previous.dates?previous.dates:period.dates;
    const type=parseShift(q,s)||(useService?selected.type:followup?previous.type:null),requestedTeam=q.match(/\bteam\s+([a-e])\b/)?.[1]?.toUpperCase()||(followup?previous.team:null);
    const context={intent,dates,type,team:requestedTeam,pending:false},label=periodLabel(dates),shiftLabel=id=>{const t=s.shifts.find(t=>t.id===id);return t?.name&&t.name!==id?`${id} · ${t.name}`:id;};
    const staff=s.employees.filter(e=>!e.deletedAt&&e.status==='active');
    const nav=(view,label)=>({view,label});
    if(Insights&&['loadCheck','improvements','outage','runReasons'].includes(intent)){
      if(intent==='loadCheck')return Insights.workload(s,dates);
      if(intent==='runReasons')return Insights.journal(s,dates,type);
      if(intent==='outage'){
        const matched=employeeMatches(q,staff);if(!matched.length&&followup&&previous.employeeId){const employee=staff.find(e=>String(e.id)===String(previous.employeeId));if(employee)matched.push(employee);}
        if(matched.length!==1)return response('Wessen Ausfall möchtest du prüfen?',matched.length?'Bitte die Personalnummer nennen, damit der Mitarbeiter eindeutig ist.':'Bitte Mitarbeiter oder Personalnummer und den Tag des angenommenen Ausfalls nennen.',{context:{...context,pending:true}});
        const useDates=period.explicit?dates:previous.pending&&previous.dates?previous.dates:[];
        if(!useDates.length)return response('Für welchen Tag?', 'Bitte Datum oder Monat für den angenommenen Ausfall nennen.',{context:{...context,employeeId:matched[0].id,pending:true}});
        return Insights.improvements(s,useDates,new Set([String(matched[0].id)]),true);
      }
      const anchor=dates[Math.floor(dates.length/2)],month=monthDates(Number(anchor.slice(0,4)),Number(anchor.slice(5,7)));
      return Insights.improvements(s,month);
    }
    if(intent==='planningCheck'){
      const anchor=dates[Math.floor(dates.length/2)],month=monthDates(Number(anchor.slice(0,4)),Number(anchor.slice(5,7)));
      return planningCheck(s,month,staff);
    }
    const procedural=/^(?:bitte\s+)?(?:wie(?! viele| viel| lange)|wo\b|was bedeutet|was ist|was zeigt|warum (?:funktioniert|geht|wird|muss|kann ich mich|weichen)|ich kann mich|eine aenderung)/.test(q);
    const help=(!intent||procedural&&!['replacement','employeeDiagnosis','teamDay','employeePlan','overstaffed','missingPermissions','write'].includes(intent))?findHelp(q,s.helpArticles):null;
    if(help)return response(help.title,help.text,{notes:['Quelle: SchichtFunk Hilfe-Center.'],actions:[...(intent==='rhythmHelp'?[{view:'settings',team:requestedTeam,label:requestedTeam?'Team '+requestedTeam+' bearbeiten':'Teamrhythmen öffnen'}]:[]),{help:true,query:help.title,label:'Anleitung im Hilfe-Center öffnen'}],context:{}});

    const matched=employeeMatches(q,staff),inherited=followup&&!/\bteam\s+[a-e]\b/.test(q)&&previous.employeeIds?staff.filter(e=>previous.employeeIds.includes(String(e.id))):[];
    let pool=matched.length?matched:inherited.length?inherited:staff;
    if(requestedTeam)pool=pool.filter(e=>team(e)===requestedTeam);
    if(['workload','employeePlan','employeeDiagnosis','absence'].includes(intent)&&matched.length>1){
      return response('Welchen Mitarbeiter meinst du?','Mehrere aktive Mitarbeiter passen zu diesem Namen. Bitte nenne den vollständigen Namen oder die Personalnummer.',{suggestions:matched.slice(0,8).map(e=>name(e)),context:{...context,pending:true}});
    }
    if(matched.length||inherited.length)context.employeeIds=pool.map(e=>String(e.id));
    const explicitPerson=/\b(?:fuer|von)\s+(?!team\b|diese|diesen|den|die|alle|jeden)([a-z][a-z -]*?)(?=\s+(?:im|am|in|morgen|heute)\b|$)/.test(q);
    if(['workload','employeePlan','employeeDiagnosis'].includes(intent)&&!matched.length&&!inherited.length&&!requestedTeam&&explicitPerson){
      return response('Mitarbeiter nicht gefunden','Bitte nenne den vollständigen Namen oder die Personalnummer eines aktiven Mitarbeiters.',{context:{...context,pending:true}});
    }
    if(intent==='employeePlan'){
      if(!matched.length&&!inherited.length&&!requestedTeam)return response('Für wen möchtest du die Dienste sehen?','Nenne einen Mitarbeiter oder ein Planungsteam, zum Beispiel „Welche Dienste hat Team E im Dezember?“.',{context:{...context,pending:true}});
      const selected=new Set(pool.map(e=>String(e.id))),rows=s.assignments.filter(a=>selected.has(String(a.employeeId))&&dates.includes(a.date)&&(!type||a.type===type)).sort((a,b)=>a.date.localeCompare(b.date)||a.type.localeCompare(b.type));
      return response('Geplante Dienste · '+label,rows.length+' gespeicherte Dienste'+(requestedTeam?' für Team '+requestedTeam:'')+'. Der Status zeigt, ob ein Dienst bereits veröffentlicht ist.',{columns:['Tag','Mitarbeiter','Schicht','Zeiten','Status'],rows:rows.map(a=>[formatDate(a.date),name(pool.find(e=>String(e.id)===String(a.employeeId))),shiftLabel(a.type),(a.start||s.shifts.find(t=>t.id===a.type)?.start||'–')+' – '+(a.end||s.shifts.find(t=>t.id===a.type)?.end||'–'),a.published?'Veröffentlicht':'Entwurf']),rowActions:rows.map(a=>({view:'schedule',date:a.date,type:a.type,assignmentId:a.id,label:'Dienst öffnen'})),actions:[{view:'schedule',date:dates[0],month:dates.length>1,label:'Dienstplan öffnen'}],context});
    }
    if(intent==='teamDay'){
      if(dates.length!==1)return response('Für welchen Tag?','Nenne einen konkreten Tag, zum Beispiel „Welche Schicht hat Team E am 01.12.2026?“.',{context:{...context,pending:true}});
      if(s.teamRulesReady===false)return response('Teamregeln werden geladen','Bitte warte, bis die zentralen Teamregeln geladen sind.',{context});
      const teams=requestedTeam?[requestedTeam]:['A','B','C','D','E'];
      return response('Teamrhythmus · '+label,'Diese Vorgabe beschreibt den zentralen Rhythmus. Sie ist keine Zusage über tatsächlich besetzte Dienste.',{columns:['Team','Rhythmusvorgabe','Aktive Mitarbeiter'],rows:teams.map(t=>{
        const r=s.teamRules?.find(r=>r.team===t);let expected='Keine zentrale Regel';
        if(r?.start&&r.pattern?.length){if(dates[0]<r.start)expected='Beginnt am '+formatDate(r.start);else{const days=Math.round((Date.parse(dates[0]+'T12:00:00Z')-Date.parse(r.start+'T12:00:00Z'))/86400000),idx=((days+Number(r.offset||0))%r.pattern.length+r.pattern.length)%r.pattern.length;expected=r.pattern[idx];}}
        return[t,expected,String(staff.filter(e=>team(e)===t).length)];
      }),actions:[nav('settings','Teamrhythmen öffnen')],context});
    }
    if(intent==='missingPermissions'){
      const rows=pool.filter(e=>type?!(e.shifts||[]).includes(type):!(e.shifts||[]).some(id=>s.shifts.some(t=>t.id===id)));
      return response('Schichtfreigaben prüfen',rows.length+' aktive Mitarbeiter '+(type?'haben keine Freigabe für '+shiftLabel(type):'haben keine Freigabe für eine aktive Schichtart')+'. Eine Teamzuordnung ersetzt keine Freigabe.',{columns:['Mitarbeiter','Team','Freigegebene Schichten'],rows:rows.map(e=>[name(e),team(e)||'Ohne Team',(e.shifts||[]).join(', ')||'Keine']),rowActions:rows.map(e=>({view:'employees',employeeId:e.id,label:'Profil öffnen'})),actions:[nav('employees','Freigaben bearbeiten')],context});
    }
    if(intent==='employeeDiagnosis'){
      if(pool.length!==1||!matched.length&&!inherited.length||dates.length!==1||!type)return response('Welche Person und welcher Dienst?','Nenne einen Mitarbeiter, einen konkreten Tag und die Schichtart, zum Beispiel „Warum kann Anna Plan am 01.12.2026 den FD nicht übernehmen?“.',{context:{...context,pending:true}});
      const e=pool[0],result=s.candidates(type,dates[0]),assessment=result.assessments?.find(x=>String(x.employeeId)===String(e.id));
      const eligible=result.candidates.some(c=>String(c.e.id)===String(e.id));
      return response('Besetzungsprüfung · '+name(e),assessment?.reason||(eligible?'Dieser Mitarbeiter erfüllt aktuell die Auto-Planungsregeln für den Dienst.':'Für diese Person liegen noch keine vollständigen Prüfergebnisse vor.'),{notes:[shiftLabel(type)+' am '+label,'Aktueller Datenstand; keine Rekonstruktion früherer Auto-Planungen.'],actions:[{view:'employees',employeeId:e.id,label:'Mitarbeiter prüfen'},{view:'schedule',date:dates[0],type,label:'Dienst prüfen'}],context});
    }
    if(intent==='write')return response('Änderung im passenden Bereich durchführen','Ich kann die Planung prüfen und Vorschläge anzeigen. Zum Speichern, Löschen oder Übernehmen öffne bitte den passenden Bereich und bestätige die Änderung dort.',{actions:[nav('schedule','Dienstplan öffnen')],context});
    if(intent==='rhythmHelp')return response(requestedTeam?`Rhythmus von Team ${requestedTeam} einstellen`:'Teamrhythmus einstellen','1. Einstellungen öffnen und „Teamrhythmen A–E“ auswählen.\n2. Beim gewünschten Team „Einrichten“ oder „Bearbeiten“ wählen.\n3. Startdatum, Tagesfolge und Einstiegsposition festlegen.\n4. Speichern und die Auto-Planung neu prüfen.\nDie Regel gilt verbindlich für die zugeordneten Mitarbeiter. Ordne Mitarbeiter unter Personal → Mitarbeiter dem Planungsteam zu.',{actions:[{view:'settings',team:requestedTeam,label:'Teamrhythmen öffnen'},nav('employees','Mitarbeiter öffnen')],context});
    if(intent==='unassigned'){const rows=staff.filter(e=>!['A','B','C','D','E'].includes(team(e)));return response('Mitarbeiter ohne Teamzuordnung',`${rows.length} aktive Mitarbeiter haben kein Planungsteam A–E. Das kann beabsichtigt sein, beispielsweise bei Mitarbeitern ausschließlich für den Frühdienst. Für sie gilt eine vorhandene individuelle Schichtregel.`,{columns:['Mitarbeiter','Schichtfreigaben'],rows:rows.map(e=>[name(e),(e.shifts||[]).join(', ')||'Keine']),rowActions:rows.map(e=>({view:'employees',employeeId:e.id,label:'Profil öffnen'})),actions:[nav('employees','Teamzuordnung prüfen')],context});}
    if(intent==='teams'){const teams=requestedTeam?[requestedTeam]:['A','B','C','D','E'];return response('Planungsteams',teams.map(t=>`Team ${t}: ${staff.filter(e=>team(e)===t).length} aktive Mitarbeiter.`).join('\n'),{columns:['Team','Start','Tagesfolge','Einstieg'],rows:teams.map(t=>{const r=s.teamRules?.find(r=>r.team===t);return[t,r?.start?formatDate(r.start):'Keine zentrale Regel',r?.pattern?.join(' · ')||'Individuelle Regeln prüfen',r?`Tag ${Number(r.offset)+1}`:'–'];}),rowActions:teams.map(t=>({view:'settings',team:t,label:'Team '+t+' öffnen'})),actions:[nav('settings','Teamrhythmen öffnen')],context});}
    if(intent==='export')return response('Gesamten Dienstplan exportieren','Öffne den Dienstplan, wähle die Monatsansicht und den gewünschten Monat. Über die Export-Schaltflächen kannst du den Gesamtplan als Excel-Datei oder PDF ausgeben.',{actions:[{view:'schedule',label:'Dienstplan öffnen',date:dates[0],month:dates.length>1}],context});
    if(intent==='publish')return response('Dienstplan veröffentlichen','Öffne den Dienstplan im gewünschten Zeitraum und wähle „Veröffentlichen & Mitarbeiter informieren“. Prüfe die angezeigten offenen Positionen und Konflikte und bestätige anschließend die Veröffentlichung. Entwürfe sind noch nicht für Mitarbeiter freigegeben.',{actions:[nav('schedule','Dienstplan öffnen')],context});
    if(intent==='autoHelp')return response('Auto-Planung verwenden','1. Auto-Planung öffnen und Tag, Woche oder Monat auswählen.\n2. Die Regeln für Vertragsstunden und faire Verteilung prüfen.\n3. „Vorschläge erstellen“ wählen.\n4. Vorschläge und verbleibende offene Positionen prüfen.\n5. Geprüfte Vorschläge als Entwurf übernehmen und den Dienstplan anschließend veröffentlichen.',{actions:[nav('auto','Auto-Planung öffnen')],context});
    if(intent==='permissionHelp')return response('Schichtfreigaben prüfen','Öffne Personal → Mitarbeiter und wähle das Profil. Unter Qualifikationen die freigegebenen Schichtarten prüfen und speichern. Ein Teamrhythmus ersetzt keine Schichtfreigabe.',{actions:[nav('employees','Mitarbeiter öffnen')],context});
    if(intent==='absence'){const rows=s.absences.filter(a=>a.status!=='Abgelehnt'&&pool.some(e=>e.id===a.employeeId)&&dates.some(d=>d>=(a.startDate||a.date)&&d<=(a.endDate||a.date||a.startDate)));return response(`Abwesenheiten · ${label}`,`${rows.length} Abwesenheitseinträge überschneiden sich mit diesem Zeitraum. Beantragte Einträge sind noch nicht genehmigt.`,{columns:['Mitarbeiter','Von','Bis','Status'],rows:rows.map(a=>[name(staff.find(e=>e.id===a.employeeId)),formatDate(a.startDate||a.date),formatDate(a.endDate||a.date||a.startDate),a.status||'Erfasst']),actions:[nav('absence','Abwesenheiten öffnen')],context});}
    if(intent==='workload'){
      const full=fullMonth(dates),above=/ueber|mehr als|zu viel/.test(q),below=/unter|weniger als|zu wenig/.test(q),zero=/ohne.*dienst|noch nicht eingeplant|null stunden/.test(q);
      if((above||below)&&!full)return response('Vollständigen Monat auswählen','Für einen Vergleich mit dem Monats-SOLL brauche ich einen vollständigen Kalendermonat. Wähle den Monat im Chat oder nenne ihn in deiner Frage.',{context:{...context,pending:true}});
      let values=pool.map(e=>({e,h:plannedHours(s,e,dates),target:full?Number(s.monthTarget(e)):null}));
      if(above)values=values.filter(x=>x.target>0&&x.h>x.target+0.05);
      if(below)values=values.filter(x=>x.target>0&&x.h<x.target-0.05);
      if(zero)values=values.filter(x=>x.h===0);
      if(above||below)values.sort((a,b)=>(above?-1:1)*((a.h-a.target)-(b.h-b.target)));
      return response('Geplante Stunden · '+label,'Geplante Dienste nach Startdatum, ohne Pausenabzug. Die Abweichung beschreibt geplante Stunden und ist kein bestätigtes Überstundenkonto.'+(above||below?' Mitarbeiter ohne positives Monats-SOLL werden nicht bewertet.':''),{columns:['Mitarbeiter','Geplant','Monats-SOLL','Abweichung'],rows:values.map(x=>[name(x.e),hours(x.h)+' Std.',full?hours(x.target)+' Std.':'–',full&&x.target>0?(x.h>=x.target?'+':'')+hours(x.h-x.target)+' Std.':'–']),rowActions:values.map(x=>({view:'employees',employeeId:x.e.id,label:'Profil öffnen'})),actions:[nav('reports','Auswertungen öffnen')],context});
    }
    if(intent==='replacement'){
      if(dates.length!==1||!type)return response('Für welchen Dienst suchst du Ersatz?',`Bitte gib ${dates.length!==1?'einen konkreten Tag':''}${dates.length!==1&&!type?' und ':''}${!type?'die Schichtart':''} an, zum Beispiel „Wer kann am 01.12.2026 den FD übernehmen?“`,{context:{...context,pending:true},suggestions:s.shifts.slice(0,6).map(t=>`Ersatz für ${t.id}${dates.length===1?' am '+formatDate(dates[0]):''}`)});
      const result=s.candidates(type,dates[0]);
      const added=duration({type},s.shifts);
      return response('Ersatz für '+shiftLabel(type)+' · '+label,result.candidates.length?result.candidates.length+' Mitarbeiter erfüllen die aktuellen Auto-Planungsregeln. Die zusätzliche Schicht umfasst '+hours(added)+' Std. Vor der tatsächlichen Zuordnung erneut prüfen.':'Aktuell erfüllt kein Mitarbeiter alle Auto-Planungsregeln für diesen Dienst.',{
        columns:['Mitarbeiter','Warum geeignet?','Woche nach Einsatz / SOLL','Monat nach Einsatz / SOLL','Folgedienst'],
        rows:result.candidates.map(c=>{
          const week=Number(c.h||0)+added,month=Number(c.monthHours||0)+added;
          const next=s.assignments.filter(a=>String(a.employeeId)===String(c.e.id)&&a.date>dates[0]).sort((a,b)=>a.date.localeCompare(b.date)||String(a.start||'').localeCompare(String(b.start||'')))[0];
          const reasons=c.fit?.length?c.fit:['Freigabe '+type,'Keine harten Ausschlussgründe unter den aktuellen Regeln'];
          const limits=[c.target>0&&week>c.target+0.05?'über Wochen-SOLL':'',c.monthTarget>0&&month>c.monthTarget+0.05?'über Monats-SOLL':''].filter(Boolean);
          return[name(c.e),reasons.join('; ')+(limits.length?'. Hinweis: '+limits.join(' und '):''),hours(week)+' / '+(c.target>0?hours(c.target):'nicht hinterlegt')+' Std.',hours(month)+' / '+(c.monthTarget>0?hours(c.monthTarget):'nicht hinterlegt')+' Std.'+(c.monthTarget>0?' ('+(month>=c.monthTarget?'+':'')+hours(month-c.monthTarget)+' Std.)':''),next?formatDate(next.date)+' · '+next.type:'Kein späterer Dienst gespeichert'];
        }),rowActions:result.candidates.map(c=>({view:'employees',employeeId:c.e.id,label:'Profil öffnen'})),
        notes:result.candidates.length?['Stundenwerte zeigen den Stand nach einem zusätzlichen Einsatz, ohne Pausenabzug. Geplante Werte sind keine bestätigten Überstunden.','Die Rangfolge folgt der aktuellen Auto-Planung. Angezeigt werden gespeicherte Folgedienste; eine gemeinsame Besetzung mehrerer Dienste muss erneut geprüft werden.']:result.reasons.map(r=>r.count+' Mitarbeiter: '+r.label),actions:[{view:'schedule',date:dates[0],type,label:'Dienst im Plan prüfen'}],context});
    }
    if(['open','coverage','diagnosis','overstaffed'].includes(intent)){
      const all=coverage(s,dates,type),missing=all.filter(x=>x.missing),required=all.reduce((n,x)=>n+x.soll,0),open=missing.reduce((n,x)=>n+x.missing,0),extra=all.reduce((n,x)=>n+x.extra,0);
      if(intent==='diagnosis'){
        const relevant=dates.length===1&&type?all:missing;
        if(!relevant.length)return response(`Planungsprüfung · ${label}`,'Für den angefragten Zeitraum sind nach den gespeicherten SOLL-Werten keine offenen Positionen vorhanden.',{context,actions:[nav('auto','Auto-Planung öffnen')]});
        return response(`Besetzung prüfen · ${label}`,'Ich prüfe die aktuell gespeicherte Planung. Gründe aus einer früheren Auto-Planung lassen sich nur durch eine erneute Analyse mit denselben Regeln nachvollziehen. Kandidaten je Dienst können nicht gleichzeitig für mehrere Dienste zugesagt werden.',{columns:['Tag','Schicht','Offen','Aktuelle Prüfung'],rows:relevant.map(x=>{const r=s.candidates(x.type,x.date);return[formatDate(x.date),shiftLabel(x.type),String(x.missing),r.candidates.length?`${r.candidates.length} passende Mitarbeiter; Auto-Planung erneut analysieren.`:r.reasons.map(y=>`${y.count}× ${y.label}`).join('; ')||'Kein passender Mitarbeiter unter den aktuellen Regeln.'];}),actions:[nav('auto','Auto-Planung prüfen'),nav('employees','Mitarbeiter prüfen')],context});
      }
      const rows=intent==='open'?missing:intent==='overstaffed'?all.filter(x=>x.extra):all;
      return response(`${intent==='open'?'Offene Dienste':intent==='overstaffed'?'Überbesetzte Dienste':'SOLL / IST'} · ${label}`,required?`${open} offene Positionen in ${missing.length} Schichten. ${required-open} von ${required} benötigten Positionen sind besetzt.${extra?` Zusätzlich ${extra} Besetzungen über SOLL.`:''}`:'Für diesen Zeitraum ist kein SOLL-Bedarf hinterlegt. Bitte prüfe die Einstellungen, bevor du den Plan als vollständig bewertest.',{columns:['Tag','Schicht','SOLL','IST',intent==='overstaffed'?'Über SOLL':'Offen'],rows:rows.map(x=>[formatDate(x.date),x.label||shiftLabel(x.type),String(x.soll),String(x.ist),String(intent==='overstaffed'?x.extra:x.missing)]),rowActions:rows.map(x=>({view:'schedule',date:x.date,type:x.type,label:'Dienst öffnen'})),actions:[{view:'schedule',date:dates[0],month:dates.length>1,label:'Zeitraum im Dienstplan öffnen'},nav('auto','Auto-Planung öffnen')],suggestions:['Warum konnte die Auto-Planung die offenen Dienste nicht besetzen?'],context});
    }
    if(intent==='help')return response('Planungsanalysen und Wissensdatenbank','Ich kann offene und überbesetzte Dienste, Ersatzbesetzung, einzelne Mitarbeiter, Teams, Rhythmusvorgaben, geplante Stunden und Schichtfreigaben prüfen. Die Wissensdatenbank erklärt zusätzlich die Bedienung von SchichtFunk.',{columns:['Hilfebereich','Anleitungen'],rows:Object.entries(s.helpArticles||{}).map(([category,items])=>[s.helpCategories?.find(c=>c[0]===category)?.[1]||category,String(items.length)]),suggestions:['Welche Dienste hat Team E im Dezember?','Welche Mitarbeiter haben im Dezember zu viele Stunden?','Welche Dienste sind im Dezember überbesetzt?','Welche Mitarbeiter haben keine Schichtfreigabe?','Wie funktioniert der DATEV-LODAS-Export?','Wo finde ich meinen QR-Code?'],actions:[{help:true,label:'Wissensdatenbank öffnen'}],context:{}});
    const suggestions=/personal|mitarbeiter|team/.test(q)?['Welche Mitarbeiter haben keine Schichtfreigabe?','Bei welchen Mitarbeitern fehlt eine Teamzuordnung?','Geplante Stunden prüfen']:/plan|dienst|besetz|ersatz/.test(q)?['Monatscheck starten','Offene Dienste prüfen','Ersatz für einen Dienst suchen']:['Monatscheck starten','Offene Dienste prüfen','Ersatz für einen Dienst suchen','Geplante Stunden prüfen','Welche Hilfethemen kennst du?'];
    return response('Welches Thema meinst du?','Für diese Frage habe ich noch keine zuverlässige Auswertung. Wähle ein passendes Thema oder formuliere die Frage genauer. Bei einzelnen Diensten helfen Datum und Schichtart.',{suggestions,context:{}});
  }
  const api={answer,normalize,parsePeriod,parseShift,coverage,periodLabel,validDate,team,findHelp};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SFPlanningAssistantCore=api;
})(typeof window==='undefined'?globalThis:window);

