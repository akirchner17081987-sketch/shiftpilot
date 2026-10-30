// SchichtFunk: deterministic, read-only planning answers. No model or external API.
(function(root){
  'use strict';
  const normalize=v=>String(v||'').toLocaleLowerCase('de-DE').replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const Vocabulary=typeof module!=='undefined'&&module.exports?require('./planning-vocabulary-v1.js'):root.SFPlanningVocabulary;
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
  const Workflows=typeof module!=='undefined'&&module.exports?require('./planning-assistant-workflows-v1.js'):root.SFPlanningWorkflows;
  const meta=(e,k)=>String((e.qualifications||[]).find(q=>String(q).startsWith('__sp:'+k+'='))||'').split('=').slice(1).join('=');
  const team=e=>e.planningTeam??meta(e,'planningTeam');
  // Use only authenticated configuration for the selected company; never mutate
  // the public catalogue or retain private answers in shared browser storage.
  function companyHelpArticles(articles,backend,demo=false){
    const config=backend?.companyPrivateConfiguration;
    const overrides=!demo&&backend?.ready&&backend?.user?.id&&config?.companyId===backend.companyId?config.data?.helpArticles:null;
    return Object.fromEntries(Object.entries(articles).map(([category,items])=>[category,items.map(([question,answer])=>[question,typeof overrides?.[category]?.[question]==='string'?overrides[category][question]:answer])]));
  }
  const currentHelpTopics=[
    [/planungsbericht.*(?:pdf|export)|(?:pdf|export).*planungsbericht/,'auto','Wie exportiere ich den Planungsbericht?'],
    [/planungsbericht/,'auto','Wo finde ich den Planungsbericht und die Planungsgründe?'],
    [/empfaenger.*(?:plan|berechnung)|\b(?:wer|wen)\b.*(?:fertigmeldung|abschlussmeldung|benachrichtig)|(?:fertigmeldung|abschlussmeldung).*empfaenger/,'auto','Wer kann die Fertigmeldung der Auto-Planung erhalten?'],
    [/(?:benachrichtig|fertigmeldung|abschlussmeldung|empfaenger|push).*(?:plan|berechnung)|(?:plan|berechnung).*(?:benachrichtig|fertigmeldung|abschlussmeldung|empfaenger|push)/,'auto','Wie erhalte ich eine Benachrichtigung, wenn die Planung fertig ist?'],
    [/pausenpruefung|pausenueberschreit|(?:pause|pausenzeit).*(?:60|kulanz|kontroll|ueberschreit)|(?:kontroll|ueberwach).*(?:pause|pausenzeit)/,'qr','Wie funktioniert die Pausenprüfung bei mehr als 60 Minuten?'],
    [/(?:kurzfristige[nr]? uebernahm|48.?stunden.*uebernahm)/,'reports','Was zählt als kurzfristige Übernahme?'],
    [/(?:fair\w*.*(?:verteil|nacht|feiertag|belast)|belastung.*verteilung|verteil\w*.*(?:nacht|feiertag)|feiertagsdienste)/,'reports','Wie prüfe ich die faire Verteilung von Nacht-, Wochenend- und Feiertagsdiensten?'],
    [/(?:wunschbilanz|wuensche.*veroeffentlicht|schichtwuensche.*vergleich)/,'reports','Wie vergleiche ich Schichtwünsche mit dem veröffentlichten Plan?'],
    [/planstatus|(?:entwurf|veroeffentlicht).*auswertung/,'reports','Was bedeutet der Planstatus in der Auswertung?'],
    [/(?:admin|administrator|verwaltungszugang).*(?:ohne.*(?:plan|mitarbeiter)|nicht.*(?:einplan|dienstplan)|nur.*verwalt)/,'access','Wie nutze ich einen Administrator ohne Dienstplanung?'],
    [/(?:unternehmensspezifisch|betrieblich).*(?:hilfe|antwort)|(?:hilfe|assistent).*(?:unternehmensregeln|9.?stunden|9h)|(?:plan|regel|modell).*\b9(?:h|.?stunden)/,'assistant','Welche Unternehmensregeln verwendet der Planungsassistent?']
  ];
  function currentHelpTopic(q,articles){
    if(!/^(?:bitte\s+)?(?:wie\b|wo\b|was\b|wer\b|wen\b|warum\b|weshalb\b|wieso\b|wann\b|welche\b|kann ich\b|laeuft\b|planungsbericht\b|pausenpruefung\b)/.test(q))return null;
    for(const [category,items] of Object.entries(articles||{}))for(const [title,text] of items)if(normalize(title).replace(/[?!.,]/g,'')===q.replace(/[?!.,]/g,''))return{title,text,category};
    for(const [pattern,category,title] of currentHelpTopics)if(pattern.test(q)){
      const article=articles?.[category]?.find(a=>a[0]===title);
      if(article)return{title:article[0],text:article[1],category};
    }
    return null;
  }
  const questionGroups=[
    ['Planung erleichtern',['Lernpräferenzen verwalten','Planungsprofile verwalten','November mit unserem Standardprofil vorbereiten','Änderungscheck anzeigen','Planvarianten vergleichen']],
    ['Planungsaufträge und Begleitung',['Zielauftrag starten','Meine Planungsaufträge','Setze meinen November-Auftrag fort','Planungsauftrag starten','Bringe die Teamleiter im November möglichst auf ihre Sollstunden. Bereits veröffentlichte Dienste bleiben bestehen.','Hilf mir, diesen Monat fertigzustellen','Mehrmonatsausgleich starten','Nimm die letzte Änderung des Assistenten zurück.']],
    ['Vorausschauen und Änderungen prüfen',['Frühwarnung starten','Welche Dienste sind in den nächsten 28 Tagen besonders anfällig?','Urlaubsfolgen prüfen','Dienstverschiebung prüfen']],
    ['Plan prüfen und Engpässe lösen',['Engpasslöser starten','Wie bekommen wir alle auf ihre Sollstunden und besetzen alle Pflichtdienste?','Wie bekommen wir die Teamleiter auf ihre Sollstunden?','Monatscheck starten','Belastungscheck starten','Verbesserungsvorschläge erstellen']],
    ['Besetzung und Ersatz',['Welche Dienste sind im gewählten Zeitraum noch offen?','Welche Dienste sind im gewählten Zeitraum überbesetzt?','Welche Mitarbeiter kommen als Ersatz infrage?','Warum konnte die Auto-Planung diesen Dienst nicht besetzen?','Ausfallsimulation starten','Gespeicherte Planungsgründe anzeigen']],
    ['Mitarbeiter und Teams',['Wie viele Stunden sind im gewählten Zeitraum geplant?','Welche Dienste hat Team E im gewählten Zeitraum?','Bei welchen Mitarbeitern fehlt eine Teamzuordnung?','Welche Mitarbeiter haben keine Schichtfreigabe?']],
    ['Regeln und Bedienung',['Welche Planungsregeln gelten?','Welche Schichtwechsel sind erlaubt?','Wie stelle ich den Rhythmus von Team E ein?','Wie funktioniert der DATEV-LODAS-Export?','Wie veröffentliche ich den Dienstplan?']],
    ['Benachrichtigungen und aktuelle Auswertungen',['Wie erhalte ich eine Benachrichtigung, wenn die Planung fertig ist?','Wo finde ich den Planungsbericht und die Planungsgründe?','Wie funktioniert die Pausenprüfung bei mehr als 60 Minuten?','Wie prüfe ich die faire Verteilung von Nacht-, Wochenend- und Feiertagsdiensten?','Was zählt als kurzfristige Übernahme?','Wie nutze ich einen Administrator ohne Dienstplanung?']]
  ];
  function duration(a,shifts){const t=shifts.find(t=>t.id===a.type),start=a.start||t?.start,end=a.end||t?.end;const mins=v=>/^\d{2}:\d{2}$/.test(v||'')?Number(v.slice(0,2))*60+Number(v.slice(3)):NaN;let m=mins(end)-mins(start);if(m<0)m+=1440;return Number.isFinite(m)?m/60:0;}
  function intentFor(q){
    q=naturalQuestion(q);
    if(/(?:auftrag|auftraege).*(?:fortsetzen|fortfuehren)|setze.*auftrag.*fort|(?:november|dezember|januar|februar|maerz|april|mai|juni|juli|august|september|oktober)[- ]auftrag.*(?:weiter|fort)/.test(q))return 'goalResume';
    if(/meine (?:planungs)?auftraege|gespeicherte (?:planungs)?auftraege|auftragsuebersicht/.test(q))return 'goalOrders';
    if(/zielauftrag|begleitete[rn]? (?:planungs)?auftrag|selbstaendig\w*.*auftrag|auftrag.*selbstaendig|^bereite\b.*\bvor\b|^(?:mach|mache)\b.*\b(?:plan|monat|januar|februar|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\b.*\bvoll\b/.test(q))return 'goalOrder';
    if(!/^(?:wie|wo|was|warum)\b/.test(q)&&/planungsbericht|pdf[- ]?bericht/.test(q)&&/erstell|erzeug|export|herunterlad|mach|bitte/.test(q))return 'report';
    if(/^(?:(?:bitte\s+)?(?:erstelle?|erzeuge?|exportiere?)\b.*planungsbericht|planungsbericht\s+(?:erstellen|exportieren|herunterladen|als pdf))/.test(q))return 'report';
    if(/lernpr(?:ae|e)ferenz|lernende planung|aus.*korrekturen.*lernen/.test(q))return 'learning';
    if(/aenderungscheck|folgepruefung|automatische.*(?:aenderung|pruefung)/.test(q))return 'followup';
    if(/planvarianten|planvariante|varianten vergleichen/.test(q))return 'variants';
    if(/planungsprofil|standardprofil|\bprofil\b/.test(q))return 'profiles';
    if(/rueckgaengig|ruecknahme|(?:aenderung|assistentenauftrag).*zurueck|letzte.*aenderung.*zurueck/.test(q))return 'undo';
    if(/mehrmonats|(?:naechsten|ueber|in)\s+(?:zwei|drei|vier|fuenf|sechs|\d+)\s+monat/.test(q))return 'multiBalance';
    if(/gefuehrt|monatsbegleit|planung fortsetzen|hilf mir.*(?:monat|plan|fertig)/.test(q))return 'wizard';
    if(/planungsauftrag|^(?:bitte\s+)?(?:bringe?|besetze|optimiere?|verteile|verbessere?)\b/.test(q))return 'order';
    if(/fruehwarn|vertretungsreserve|anfaellig|(?:kritisch|riskant).*(?:dienst|schicht)|(?:dienst|schicht).*kritisch/.test(q))return 'forecast';
    if(/urlaubsfolgen|urlaubsantrag.*pruef|(?:folgen|auswirkung).*urlaub|urlaub.*(?:folgen|auswirkung|pruefen|genehmigen|vom|am\s+\d)/.test(q))return 'leaveImpact';
    if(/aenderungsvorschau|dienstverschiebung|was passiert.*(?:verschieb|umplan)|(?:auswirkung|folgen).*(?:dienst|schicht).*aender|was passiert.*(?:dienst|schicht).*(?:verschieb|von|auf)|(?:dienst|schicht).*(?:verschieb|aenderung pruef)/.test(q))return 'changeImpact';
    if(/welche.*fragen|was.*(?:fragen|dich fragen)|beispielfragen|fragenuebersicht/.test(q))return 'questions';
    if(/engpass|engpaesse|(?:plan|dienstplan).*(?:reparier|aufgeht)|was.*(?:aendern|aenderung).*(?:plan|besetz)|wie.*(?:bekomm\w*|bring\w*|erreich\w*).*(?:sollstunden|soll|stunden)|wie.*(?:luecken|pflichtdienste).*(?:schliess|besetz)/.test(q))return 'bottlenecks';
    if(/^(?:bitte\s+)?(?:aktuelle|geltende|geladene) planungsregeln|welche.*(?:planungsregeln|wochenobergrenze|monatsobergrenze)|planungsgrenzen (?:anzeigen|pruefen)/.test(q)&&!/\b(wie|wo)\b/.test(q))return 'rules';
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
    if(/(?:zeig\w*|pruef\w*)\s+(?:mir\s+)?(?:ihre|seine|meine|die)\s+(?:dienste|schichten)\b/.test(q))return 'employeePlan';
    if(/\b(export|excel|pdf|ausdruck|drucken)\w*/.test(q))return 'export';
    if(/veroeffentlich|freigeben|freigabe.*plan/.test(q))return 'publish';
    if(/\b(team|teams)\b/.test(q)&&/rhythm|rhytm|zyklus|tagesfolge|einstieg/.test(q)&&/\b(wie|wo|einstell|aender|einricht|hilfe)\w*/.test(q))return 'rhythmHelp';
    if(/(ohne|fehl\w*|kein\w*|nicht).*team|team.*(fehl\w*|ohne|nicht zugeordnet|keine zuordnung)/.test(q))return 'unassigned';
    if(/ersatz|einspring|aushilf|aushelfen|vertretung suchen|uebernehmen|infrage|in frage|wer .*kann|passende.*mitarbeiter|verfuegbar.*mitarbeiter|mitarbeiter.*verfuegbar|wer.*verfuegbar|vertretung|besetz.*vorschlag/.test(q))return 'replacement';
    if(/(?:warum|weshalb|wieso).*(?:plan|dienst|schicht|besetz)|nicht besetz|keine vorschlaege|kein vorschlag|autoplanung.*(fehler|problem)|auto.?planung.*(fehler|problem)/.test(q))return 'diagnosis';
    if(/stunden|auslastung|ueberlast|unterlast|ueber.*(?:vertrags|monats).?soll|unter.*(?:vertrags|monats).?soll/.test(q))return 'workload';
    if(/\b(team|teams)\b/.test(q))return 'teams';
    if(/\b(wie|wo|hilfe|erklaer)\w*/.test(q)&&/auto.?planung|autoplanung|automatisch.*plan/.test(q))return 'autoHelp';
    if(/\b(offen\w*|unbesetzt\w*|unterbesetzt\w*|unterbesetzung|fehlende|luecken|besetzungsluecken|dienstluecken)\b|noch.*besetz|(?:dienste|schichten|positionen).*(?:nicht besetzt|nicht belegt|fehlen)|(?:welche|wo).*(?:dienste|schichten).*(?:fehlen|frei sind)/.test(q))return 'open';
    if(/\b(besetzung|abdeckung|soll|vollstaendig|planungscheck)\w*|(?:pruefe|kontrollier).*plan/.test(q))return 'coverage';
    if(/rhythm|rhytm|zyklus/.test(q))return 'rhythmHelp';
    if(/abwesen|urlaub|krank|ausfall/.test(q))return 'absence';
    if(/schichtfreigab|qualifikation|berechtigung.*schicht/.test(q))return 'permissionHelp';
    if(/\b(hilfe|help|unterstuetzung|funktionen|hilfethemen|wissensdatenbank|anleitungen)\b|was kannst/.test(q))return 'help';
    return null;
  }
  function naturalQuestion(value){
    const original=(Vocabulary?Vocabulary.clean(value):normalize(value)).trim().replace(/^(?:hallo|hey|guten morgen|guten tag)[!, .]+/,''),plain=original.replace(/^(?:(?:kannst|koenntest|wuerdest) du(?: mir)?|ich (?:moechte|haette gerne|wuerde gerne))\s+(?:bitte\s+)?/,'').replace(/^bitte\s+/,'');
    const action=plain.match(/\b(loeschen|speichern|uebernehmen|veroeffentlichen)[?.!]*$/);
    if(plain!==original&&action)return ({loeschen:'loesche',speichern:'speichere',uebernehmen:'uebernimm',veroeffentlichen:'veroeffentliche'})[action[1]]+' '+plain.slice(0,action.index).trim();
    return plain;
  }
  // A range must never silently degrade to its first day. Dates remain local
  // calendar dates; the existing planning engine handles duty time zones.
  function explicitRange(q,s){
    if(!/\bbis\b|[–—]|\d\s*-\s*\d/.test(q))return null;
    const y=Number((s.defaultDates?.[0]||s.today).slice(0,4)),join='\\s*(?:bis(?:\\s+zum)?|[-–—])\\s*';
    let m=q.match(new RegExp('(\\d{4}-\\d{2}-\\d{2})'+join+'(\\d{4}-\\d{2}-\\d{2})'));
    if(m)return {...rangeDates(m[1],m[2]),explicit:true};
    let first,last;
    m=q.match(new RegExp('\\b(\\d{1,2})\\.(\\d{1,2})(?:\\.(20\\d{2}))?\\.?'+join+'(\\d{1,2})\\.(\\d{1,2})(?:\\.(20\\d{2}))?\\.?(?!\\d)'));
    if(!m)m=q.match(new RegExp('\\b(\\d{1,2})\\.\\s*(?:(\\d{1,2})\\.\\s*)?(?:(20\\d{2})\\b)?'+join+'(\\d{1,2})\\.\\s*(?:(\\d{1,2})\\.\\s*)?(?:(20\\d{2})\\b)?'));
    if(m&&(m[2]||m[5])){first={d:+m[1],m:+(m[2]||m[5]),y:m[3]?+m[3]:null};last={d:+m[4],m:+(m[5]||m[2]),y:m[6]?+m[6]:null};}
    if(!first){
      const names=months.join('|');
      m=q.match(new RegExp('\\b(\\d{1,2})\\.?(?:\\s*('+names+'))?(?:\\s+(20\\d{2}))?'+join+'(\\d{1,2})\\.?\\s*('+names+')(?:\\s+(20\\d{2}))?\\b'));
      if(m){first={d:+m[1],m:months.indexOf(m[2]||m[5])+1,y:m[3]?+m[3]:null};last={d:+m[4],m:months.indexOf(m[5])+1,y:m[6]?+m[6]:null};}
    }
    if(first){
      if(!first.y&&!last.y){first.y=y;last.y=y+(last.m<first.m?1:0);}
      else if(!first.y)first.y=last.y-(first.m>last.m?1:0);
      else if(!last.y)last.y=first.y+(last.m<first.m?1:0);
      return {...rangeDates(day(first.y,first.m,first.d),day(last.y,last.m,last.d)),explicit:true};
    }
    if(new RegExp('\\d{1,2}\\.|\\d{4}-\\d{2}-\\d{2}|\\b(?:'+months.join('|')+')\\b').test(q)&&/\bbis\b|[–—]/.test(q))return {error:'Bitte den Zeitraum mit gültigem Beginn und Ende angeben, zum Beispiel 01.11.2026 bis 15.11.2026.',explicit:true};
    return null;
  }
  const taskLabels={open:'Offene Dienste prüfen',coverage:'Besetzung prüfen',workload:'Stunden prüfen',loadCheck:'Belastung prüfen',report:'PDF-Planungsbericht erstellen',planningCheck:'Monatscheck durchführen',replacement:'Ersatz prüfen',forecast:'Vertretungsreserve prüfen',employeePlan:'Geplante Dienste anzeigen',overstaffed:'Überbesetzung prüfen',improvements:'Verbesserungen prüfen',bottlenecks:'Engpasslöser prüfen',write:'Gewünschte Änderung im passenden Bereich prüfen',export:'Dienstplanexport öffnen'};
  function requestPlan(question,s,previous={}){
    const q=naturalQuestion(question),verbs='(?:zeige?\\w*|pruefe?\\w*|kontrolliere?\\w*|erstelle?\\w*|erzeuge?\\w*|exportiere?\\w*|suche?\\w*|finde?\\w*|loesche?\\w*|speichere?\\w*|uebernimm|veroeffentliche?\\w*|welche|wer|wie viele|mach\\w*|kannst du|koenntest du)';
    const chunks=q.split(new RegExp('\\s*;\\s*|\\s+(?:und(?: dann| anschliessend)?|danach|anschliessend|ausserdem|sowie)\\s+(?='+verbs+'\\b)')).map(p=>p.trim()).filter(Boolean);
    const parts=chunks.flatMap(source=>{
      if(!/^(?:wie|wo|warum|was bedeutet)\b/.test(source)&&(/^(?:pruef\w*|kontrollier\w*|zeig\w*)\b/.test(source)||/\b(?:pruefen|kontrollieren|zeigen|anzeigen|erstellen)[.!?]*$/.test(source))&&/\bund\b|,/.test(source)&&!intentFor(source)?.match(/write|publish|changeImpact|leaveImpact/)){
        const topics=[[/\b(?:offene dienste|luecken)\b/,'Offene Dienste'],[/\bbesetzung\b/,'Besetzung prüfen'],[/\b(?:geplante stunden|planstunden|stunden)\b/,/geplante stunden|planstunden/.test(source)?'Geplante Stunden prüfen':/erfasst|tatsaechlich|geleistet/.test(source)?'Tatsächlich erfasste Stunden prüfen':'Stunden prüfen'],[/\bbelastung\b/,'Belastungscheck'],[/\b(?:planungsbericht|pdf[- ]?bericht)\b/,'Planungsbericht erstellen']].filter(([re])=>re.test(source));
        if(topics.length>1)return topics.map(([,part])=>({part,source}));
      }
      return [{part:source,source}];
    });
    if(parts.length<2)return null;
    const period=parsePeriod(q,s);if(period.error)return response('Datum prüfen',period.error,{context:{}});
    if(parts.length>4)return response('Auftrag bitte aufteilen','Ich habe mehr als vier Anliegen erkannt. Bitte stelle höchstens vier Aufgaben gemeinsam, damit jedes Anliegen vollständig geprüft werden kann.',{context:{}});
    const dates=period.explicit?period.dates:previous.dates||period.dates,staff=s.employees||[],explicitPeople=employeeMatches(q,staff),reference=/\b(?:ihre|seine|dafuer|dazu|auch)\b/.test(q),people=explicitPeople.length?explicitPeople:reference?staff.filter(e=>previous.employeeIds?.includes(String(e.id))):[],teamId=q.match(/\bteam\s+([a-e])\b/)?.[1]||(reference?previous.team:null),sharedType=parseShift(q,s);
    for(const {source} of parts){const own=parsePeriod(source,{...s,defaultDates:dates});if(own.error)return response('Datum prüfen',own.error,{context:{}});}
    const tasks=parts.map(({part,source})=>{
      const own=parsePeriod(source,{...s,defaultDates:dates}),taskDates=own.explicit?own.dates:dates,scope=' vom '+taskDates[0]+' bis '+taskDates.at(-1),sourcePeople=employeeMatches(source,staff),taskPeople=sourcePeople.length?sourcePeople:people,taskTeam=source.match(/\bteam\s+([a-e])\b/)?.[1]||teamId,taskType=parseShift(source,s)||sharedType;
      let intent=intentFor(part);if(/pdf[- ]?bericht/.test(part)&&!/dienstplan/.test(part)&&!/^(?:wie|wo)\b/.test(part)){intent='report';part='Planungsbericht erstellen';}
      const person=taskPeople.length===1&&['workload','employeePlan','employeeDiagnosis','outage'].includes(intent)&&!employeeMatches(part,staff).length?' für '+name(taskPeople[0]):taskTeam&&['workload','employeePlan'].includes(intent)&&!/team\s+[a-e]/.test(part)?' für Team '+taskTeam.toUpperCase():'';
      const type=taskType&&['replacement','diagnosis','open','coverage','overstaffed'].includes(intent)&&!parseShift(part,s)?' · '+taskType:'';
      return {label:taskLabels[intent]||'Anliegen klären',question:part+person+scope+type,intent};
    });
    return response('Auftrag in '+tasks.length+' Schritten','Ich habe diese Anliegen erkannt. Starte mit einem Schritt; nach der Auswertung kannst du mit dem nächsten fortfahren. Änderungen werden einzeln als Vorschau geprüft und erst nach Bestätigung gespeichert.',{taskPlan:{tasks},context:{dates}});
  }
  function parsePeriod(q,s){
    q=normalize(q);
    const range=explicitRange(q,s);if(range)return range;
    const base=s.defaultDates?.[0]||s.today,year=Number(base.slice(0,4));
    const upcoming=q.match(/naechsten?\s+(\d+)\s+tag/);if(upcoming){const n=Number(upcoming[1]);return n>=1&&n<=62?{dates:Array.from({length:n},(_,i)=>addDays(s.today,i)),explicit:true}:{error:'Bitte einen Zeitraum von 1 bis 62 Tagen wählen.'};}
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
  function parseRange(q,s){
    q=normalize(q);
    const range=explicitRange(q,s);if(range?.error)return {error:range.error};if(range?.dates)return {startDate:range.dates[0],endDate:range.dates.at(-1)};
    const year=Number((s.defaultDates?.[0]||s.today).slice(0,4)),iso=[...q.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map(m=>m[0]);
    let values=iso.length?iso:[...q.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(?:(\d{4})\b)?/g)].map(m=>day(m[3]?+m[3]:year,+m[2],+m[1]));
    if(!values.length){const month=months.findIndex(m=>new RegExp('\\b'+m+'\\b').test(q));if(month>=0){const m=q.match(/(?:vom|von|ab)\s+(\d{1,2})\.?\s*(?:bis|[-–])\s*(\d{1,2})\.?/);if(m){const y=Number(q.match(/\b20\d{2}\b/)?.[0]||year);values=[day(y,month+1,+m[1]),day(y,month+1,+m[2])];}}}
    if(!values.length)return{};
    if(values.length>2||values.some(v=>!validDate(v)))return{error:'Bitte einen eindeutigen Zeitraum mit gültigem Beginn und Ende angeben.'};
    if(values.length===1&&/\bbis\b/.test(q))return{};
    return {startDate:values[0],endDate:values[1]||values[0]};
  }
  function rangeDates(start,end){
    if(!validDate(start)||!validDate(end)||end<start)return {error:'Bitte gültige Daten wählen; das Ende darf nicht vor dem Beginn liegen.'};
    const n=Math.round((Date.parse(end+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000)+1;
    return n<=62?{dates:Array.from({length:n},(_,i)=>addDays(start,i))}:{error:'Bitte höchstens 62 Kalendertage auf einmal prüfen.'};
  }
  function scenarioAnswer(q,s,previous,intent,period,staff){
    const request=s.analysisRequest?.kind===intent?s.analysisRequest:{},form=(text,params={})=>response(intent==='leaveImpact'?'Urlaubsfolgen prüfen':'Dienstverschiebung prüfen',text,{form:{kind:intent,...params},context:{intent,pending:true,...params}});
    if(intent==='forecast')return Insights.forecast(s,period.explicit||s.selectedPeriodExplicit?period.dates:Array.from({length:28},(_,i)=>addDays(s.today,i)));
    if(intent==='leaveImpact'){
      const matches=employeeMatches(q,staff),employeeId=request.employeeId||(matches.length===1?matches[0].id:previous.intent===intent?previous.employeeId:null),range=parseRange(q,s);
      if(range.error)return form(range.error,{employeeId});
      const startDate=request.startDate||range.startDate||(previous.intent===intent?previous.startDate:null),endDate=request.endDate||range.endDate||(previous.intent===intent?previous.endDate:null);
      const params={employeeId,startDate,endDate};
      if(!employeeId||!startDate||!endDate)return form(matches.length>1?'Mehrere Personen passen zu diesem Namen. Bitte Mitarbeiter und Zeitraum eindeutig auswählen.':'Wähle Mitarbeiter und Zeitraum. Ich zeige betroffene Dienste, gemeinsam geprüfte Vertretungen und verbleibende zusätzliche Lücken.',params);
      if(!staff.some(e=>String(e.id)===String(employeeId)))return form('Diese Person ist im ausgewählten Unternehmen nicht als aktiver Mitarbeiter verfügbar.',{});
      const checked=rangeDates(startDate,endDate);if(checked.error)return form(checked.error,params);
      return Insights.leaveImpact(s,employeeId,checked.dates);
    }
    let assignmentId=request.assignmentId,targetEmployeeId=request.targetEmployeeId;
    const targetText=q.split(/\b(?:auf|an)\s+(?:mitarbeiter\s+)?/).at(-1),targets=targetText!==q?employeeMatches(targetText,staff):[];
    if(!targetEmployeeId&&targets.length===1)targetEmployeeId=targets[0].id;
    if(!assignmentId){
      const ownerText=q.split(/\b(?:auf|an)\s+(?:mitarbeiter\s+)?/)[0],owners=employeeMatches(ownerText,staff),type=parseShift(q,s);
      if(!period.explicit&&!type&&!owners.length)assignmentId=s.selectedService?.assignmentId;
      if(!assignmentId&&(period.explicit||type||owners.length)){
        const options=s.assignments.filter(a=>(!period.explicit||period.dates.includes(a.date))&&(!type||a.type===type)&&(owners.length!==1||String(a.employeeId)===String(owners[0].id)));
        if(options.length===1)assignmentId=options[0].id;
      }
    }
    const params={assignmentId,targetEmployeeId,...Object.fromEntries(['date','type','start','end'].filter(k=>request[k]).map(k=>[k,request[k]]))};
    if(!assignmentId||!targetEmployeeId)return form('Wähle den Ausgangsdienst und den Zielmitarbeiter. Datum, Schicht und Uhrzeit kannst du bei Bedarf zusätzlich ändern.',params);
    const a=s.assignments.find(a=>String(a.id)===String(assignmentId));
    if(!a||!staff.some(e=>String(e.id)===String(targetEmployeeId)))return form('Der gewählte Dienst oder Mitarbeiter ist nicht mehr verfügbar. Bitte neu auswählen.');
    if(request.date&&!validDate(request.date)||['start','end'].some(k=>request[k]&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(request[k])))return form('Bitte gültige Daten und Uhrzeiten wählen.',params);
    return Insights.changeImpact(s,params);
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
  function paidHours(s,a){return s.assignmentHours?Number(s.assignmentHours(a))||0:duration(a,s.shifts);}
  function plannedHours(s,e,dates){return s.assignments.filter(a=>String(a.employeeId)===String(e.id)&&dates.includes(a.date)).reduce((sum,a)=>sum+paidHours(s,a),0);}
  function fullMonth(dates){if(!dates?.length||!validDate(dates[0])||!dates[0].endsWith('-01'))return false;const expected=monthDates(Number(dates[0].slice(0,4)),Number(dates[0].slice(5,7)));return dates.length===expected.length&&dates.every((d,i)=>d===expected[i]);}
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
  function findHelp(q,articles,explicitOnly=false){
    for(const [category,items] of Object.entries(articles||{}))for(const [title,text] of items)if(normalize(title).replace(/[?!.,]/g,'')===q.replace(/[?!.,]/g,''))return{title,text,category,score:100};
    const aliases=[
      [/hintergrund|browser.*(?:schliess|verlass)|weiter.*(?:desktop|browser)/,'auto','Läuft die Auto-Planung weiter'],
      [/(?:entwurf|uebernahme|uebernehmen).*(?:haeng|dauer|fortschritt|status)|(?:haeng|dauer|status).*(?:entwurf|uebernahme)|entwurf gespeichert.*ansicht/,'auto','Was zeigt der Status'],
      [/fortschritt|prozent|100\s*%/,'auto','Fortschrittsbalken'],
      [/schichtwechsel|aufsteigend|absteigend|\b(?:o[123]|tl(?:-le|-re)?)\s*(?:nicht\s+)?(?:->|→|auf|zu|nach)\s*(?:o[123]|tl(?:-le|-re)?|ot)\b/,'auto','aufsteigenden und absteigenden'],
      [/(?:feiertag|wochenende).*(?:ot|tagdienst)|(?:ot[123]?|tagdienst).*feiertag/,'auto','Welche Feiertage gelten'],
      [/vorplan|unabhaengig.*wunsch|wunsch.*(?:blockier|verhind|sperr)/,'wishes','fehlgeschlagener Wunschplanung'],
      [/(?:neustart|vormonat|monatsuebergang|geloeschter.*monat|dezember.*geloescht)/,'auto','Welche bestehenden Dienste'],
      [/4\s*[/.-]\s*3\s*[/.-]\s*3\s*[/.-]\s*2|schlaftag|freie tage.*nacht|erholung.*nacht/,'auto','Wie werden freie Tage nach'],
      [/teamleiter.*(?:stunden|monatsziel|arbeitstage)|(?:stunden|monatsziel).*teamleiter/,'settings','Wie plant das System Teamleiter'],
      [/ot.tagdienst|tagdienst.*(?:regel|grenz)|(?:wie|welche).*(?:ot1|ot2|ot3).*(?:regel|plan|einstell|trenn)|ot1.*ot2.*ot3/,'settings','Wie werden OT1, OT2 und OT3'],
      [/vertrags.soll.*(?:grenz|obergrenz)|(?:wochen|monats)(?:obergrenze|grenze|limit)|stunden.*(?:grenz|limit)/,'settings','Wie unterscheiden sich Vertrags-SOLL'],
      [/planungsregeln/,'settings','Wo sehe und ändere ich'],
      [/pflichtbesetz|gemeinsame.*deckung|optionale.*dienste/,'settings','Was bedeuten Pflichtbesetzung'],
      [/handlungsbedarf.*(?:filter|blaett|lang)|(?:filter|blaett).*handlungsbedarf/,'overview','Wie filtere und blättere'],
      [/standortpunkt|standort.*(?:karte|erde)/,'overview','Was zeigen die Standortpunkte'],
      [/personal(?:bedarf|simulator)|neueinstellung/,'staffing','Wie vergleiche ich'],
      [/schichtuebergabe/,'handover','Wie starte ich'],
      [/stoerfall|akute[nr]? ausfall/,'disruptions','Wie melde ich'],
      [/monatsbericht|zeiterfassung.*(?:excel|pdf|export)|(?:excel|pdf|export).*zeiterfassung/,'reports','Wie exportiere ich Monatsberichte'],
      [/datev|lodas|abrechnung/,'reports','DATEV-LODAS'],
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
    if(explicitOnly)return null;

    const stop=new Set(['wie','wo','was','wer','warum','kann','kannst','koennen','ich','mir','man','den','die','das','der','dem','des','ein','eine','einen','einem','und','oder','im','in','am','an','zu','mit','von','fuer','bitte','meine','meinen','mein','sind','ist','werden','wird','habe','haben']);
    const words=[...new Set(q.split(/[^a-z0-9]+/).filter(w=>w.length>=3&&!stop.has(w)))];
    let best=null;
    for(const [category,items] of Object.entries(articles||{}))for(const [title,text] of items){
      const t=normalize(title),body=normalize(text),hits=words.filter(w=>t.includes(w)||body.includes(w)),score=hits.reduce((n,w)=>n+(t.includes(w)?3:1),0);
      if((hits.length>=2||hits.length===1&&hits[0].length>=6&&t.includes(hits[0]))&&(!best||score>best.score))best={title,text,score,category};
    }
    return best;
  }
  function answerRaw(question,s,previous={}){
    if(!s.authorized)return response('Anmeldung erforderlich','Der Planungsassistent ist nur für angemeldete Benutzer mit Planungsrechten verfügbar.',{context:{}});
    if(s.loading)return response('Daten werden geladen','Bitte warte, bis das Unternehmen vollständig geladen ist, und stelle deine Frage erneut.',{context:{}});
    if(s.error)return response('Daten derzeit nicht bereit','Die Planungsdaten konnten nicht zuverlässig geladen werden. Bitte prüfe die Cloud-Verbindung und lade das Unternehmen erneut.',{context:{}});
    if(previous.hoursQuestion){const matches=employeeMatches(normalize(question),s.employees||[]);if(matches.length===1)return answerRaw(previous.hoursQuestion+' · '+name(matches[0]),s,{});}
    const q=naturalQuestion(question);if(!q)return response('Deine Frage','Schreibe eine Frage zur Planung oder wähle eines der Beispiele.',{context:previous});
    if(/^(?:(?:und|also)\s+)?wer fehlt(?:\s+(?:heute|morgen|im .+|am .+))?[?.!]*$/.test(q)){const period=parsePeriod(q,s);if(period.error)return response('Datum prüfen',period.error,{context:previous});const dates=period.explicit?period.dates:previous.dates||period.dates,range=dates.length===1?' am '+dates[0]:' vom '+dates[0]+' bis '+dates.at(-1);return response('Was möchtest du prüfen?','Meinst du offene Dienste oder abwesende Mitarbeiter?',{clarification:[{label:'Offene Dienste',question:'Offene Dienste'+range},{label:'Abwesende Mitarbeiter',question:'Abwesenheiten'+range}],context:{...previous,dates,clarify:'missing'}});}
    const detectedIntent=intentFor(q);
    const currentTopic=detectedIntent==='report'?null:currentHelpTopic(q,s.helpArticles);
    if(currentTopic)return response(currentTopic.title,currentTopic.text,{notes:['Quelle: SchichtFunk Hilfe-Center. Maßgeblich sind die geladenen Regeln des ausgewählten Unternehmens.'],actions:[{help:true,query:currentTopic.title,label:'Anleitung im Hilfe-Center öffnen'}],context:{}});
    if(!previous.pending&&detectedIntent==='workload'&&!/^(?:warum|weshalb|wieso)\b/.test(q)&&/stunden/.test(q)&&!/geplant|planstunden|planung|soll|vertrag|auslastung|ueberlast|unterlast/.test(q)&&employeeMatches(q,s.employees||[]).length<=1&&!(/\bfuer\s+[a-z]/.test(q)&&!employeeMatches(q,s.employees||[]).length)){
      const requested=parsePeriod(q,s);if(requested.error)return response('Datum prüfen',requested.error,{context:{}});
      const explicitActual=/tatsaechlich|erfasst|ist[- ]?stunden|geleistet|gearbeitet/.test(q);
      if(explicitActual)return response('Tatsächlich erfasste Arbeitszeit','Für erfasste oder bestätigte Arbeitszeiten öffne Auswertungen und wähle dort den gewünschten Zeitraum. Der Planungsassistent berechnet Planstunden; diese werden nicht als tatsächlich geleistete Arbeit ausgegeben.',{actions:[{view:'reports',label:'Erfasste Arbeitszeit auswerten'}],context:{intent:'actualHours',dates:requested.explicit?requested.dates:previous.dates||requested.dates}});
      const planned=String(question).replace(/stunden/i,'geplante Stunden'),actual=String(question).replace(/stunden/i,'tatsächlich erfasste Stunden');
      return response('Welche Stunden meinst du?','Möchtest du geplante Dienste prüfen oder tatsächlich erfasste Arbeitszeit ansehen?',{clarification:[{label:'Geplante Stunden',question:planned},{label:'Erfasste Arbeitszeit',question:actual}],context:{clarify:'hours',originalQuestion:question,dates:requested.explicit?requested.dates:previous.dates||requested.dates}});
    }
    if(/^(?:(?:hilfe (?:bei|zur) )?(?:planung|dienstplan)|(?:bei der |mit der )?planung helfen)[?.!]*$/.test(q))return response('Wobei soll ich dir helfen?','Wähle eine Prüfung der aktuellen Planung oder eine Erklärung zur Bedienung.',{clarification:[{label:'Planung prüfen',question:'Monatscheck starten'},{label:'Bedienung erklären',question:'Wie erstelle und übernehme ich Auto-Planungsvorschläge?'},{label:'PDF-Bericht erstellen',question:'Planungsbericht erstellen'}],context:{}});
    const conversational=/^(?:und|auch|wie sieht es|was ist|fuer denselben|fuer dieselbe)\b/.test(q),period=parsePeriod(q,conversational&&previous.dates?.length?{...s,defaultDates:previous.dates}:s);if(period.error)return response('Datum prüfen',period.error,{context:previous});
    const detected=/^(?:(?:und|auch|fuer)\s+)?team\s+[a-e][?.!]*$/.test(q)&&previous.intent?previous.intent:intentFor(q),followup=previous.pending||/^(und|auch|wie sieht es|was ist|dafuer|dazu|diese|diesen|am|im|fuer|team|fd\b|sd\b|nd\b|\d)/.test(q)||/\b(?:dafuer|dazu|davon|derselbe|denselben|dieselben|seine|ihre)\b/.test(q)||(!detected&&(period.explicit||parseShift(q,s)));
    const intent=detected||(followup?previous.intent:null);
    const selected=s.selectedService&&validDate(s.selectedService.date)&&s.shifts.some(t=>t.id===s.selectedService.type)?s.selectedService:null;
    const useService=selected&&['replacement','diagnosis','employeeDiagnosis'].includes(intent)&&(/\b(dieser|diesen|diesem|diese|hier|dafuer)\b/.test(q)||!period.explicit&&!previous.pending);
    const dates=s._filterDates|| (period.explicit?period.dates:useService?[selected.date]:followup&&previous.dates?previous.dates:period.dates);
    const type=parseShift(q,s)||(useService?selected.type:followup?previous.type:null),requestedTeam=q.match(/\bteam\s+([a-e])\b/)?.[1]?.toUpperCase()||(followup?previous.team:null);
    const context={intent,dates,type,team:requestedTeam,pending:false},label=periodLabel(dates),shiftLabel=id=>{const t=s.shifts.find(t=>t.id===id);return t?.name&&t.name!==id?`${id} · ${t.name}`:id;};
    if(intent==='report')return response('Planungsbericht · '+label,'Der Bericht enthält die aktuelle Besetzung, offene Positionen mit geprüften Gründen, Stundenabweichungen, Regelhinweise und gekennzeichnete manuelle Einplanungen. Prüfe die Grundlage und lade anschließend die PDF herunter.',{reportRequest:true,context});
    const staff=s.employees.filter(e=>!e.deletedAt&&e.status==='active');
    const nav=(view,label)=>({view,label});
    if(intent==='goalOrders'||intent==='goalResume')return response('Meine Planungsaufträge','Gespeicherte Ziele, Prüfschritte und Entscheidungen des aktuellen Benutzers und Unternehmens. Beim Fortsetzen wird der aktuelle Plan erneut geprüft.',{goalManager:{resume:intent==='goalResume',month:period.explicit?dates[Math.floor(dates.length/2)].slice(0,7):null},context});
    if(intent==='goalOrder'){
      const matches=employeeMatches(q,staff),focus=requestedTeam?'team:'+requestedTeam:/teamleiter/.test(q)?'leaders':matches.length===1?'person:'+matches[0].id:'all',goal=/pflicht|besetz/.test(q)&&!/stunden|soll|fair/.test(q)?'coverage':'both';
      return response('Begleiteten Planungsauftrag starten','Wähle Monat, Ziel und Mitarbeiterkreis. Der Assistent prüft mehrere Strategien, behält regelkonforme Verbesserungen und speichert den Fortschritt. Vorschläge werden erst nach deiner Bestätigung als Entwurf übernommen.',{form:{kind:'goalOrder',month:dates[Math.floor(dates.length/2)].slice(0,7),focus,goal},context:{...context,pending:true}});
    }
    if(Insights&&['forecast','leaveImpact','changeImpact'].includes(intent))return scenarioAnswer(q,s,previous,intent,period,staff);
    if(intent==='learning')return response('Lernende Planung','Bestätige Präferenzen aus manuellen Dienstkorrekturen. Sie unterstützen neue Vorschläge zusätzlich zu den verbindlichen Planungsregeln.',{actions:[{label:'Lernpräferenzen verwalten',learning:true}],context:{intent:'learning',dates}});
    if(Workflows&&['profiles','variants','followup'].includes(intent)){
      const help=findHelp(q,s.helpArticles,true);if(help&&/^(?:wie|was|wo)\b/.test(q))return response(help.title,help.text,{context:{}});
      const request=s.analysisRequest||{},month=request.month||dates[Math.floor(dates.length/2)].slice(0,7);
      if(!Workflows.validMonth(month))return response('Monat prüfen','Bitte einen gültigen Startmonat wählen.');
      if(intent==='followup')return Workflows.followup(s,s.changeRequest);
      if(intent==='variants'){
        const focus=request.focus||'all',ids=Array.isArray(request.focusIds)?request.focusIds.filter(id=>staff.some(e=>String(e.id)===String(id))):Workflows.focusIds(s,focus);if(ids&&!ids.length)return response('Mitarbeiterkreis prüfen','Für den gewählten Fokus ist kein aktiver Mitarbeiter verfügbar.');
        return Workflows.variants(s,Workflows.datesFor(month),ids,request.strategy||null);
      }
      if(s.profileError)return response('Planungsprofile derzeit nicht verfügbar',s.profileError,{profileManager:true,context:{intent:'profiles'}});
      const profiles=s.profiles||[],matches=profiles.filter(p=>q.includes(normalize(p.name))),chosen=request.profileId?profiles.find(p=>p.id===request.profileId):matches.length===1?matches[0]:null;
      if(!chosen||/verwalten|anlegen|speichern|bearbeiten/.test(q))return response('Planungsprofile',profiles.length+' Profile im ausgewählten Unternehmen. Wähle ein Profil und den Startmonat oder lege ein neues Profil an.',{profileManager:true,context:{intent:'profiles',dates}});
      const config=Workflows.profileConfig(chosen.config);if(!config)return response('Profil prüfen','Dieses Profil enthält nicht unterstützte Angaben. Bitte bearbeiten.');
      const ids=Workflows.focusIds(s,config.focus);if(ids&&!ids.length)return response('Profil prüfen','Der gespeicherte Mitarbeiterkreis ist hier nicht mehr verfügbar. Bitte das Profil aktualisieren.',{profileManager:true});
      let result=config.mode==='multiBalance'?Workflows.multi(s,month,config.count,ids):config.mode==='variants'?Workflows.variants(s,Workflows.datesFor(month),ids,request.strategy||null):Workflows.order(s,Workflows.datesFor(month),ids,config.goal);
      if(result.variants)result.variants=result.variants.map(v=>({...v,profileId:chosen.id}));
      const compareOnly=config.mode==='variants'&&!request.strategy;
      const plan=result.proposal?[...result.proposal.base,...result.proposal.proposed]:s.assignments,period=result.context?.dates||Workflows.datesFor(month),notes=[];
      if(!compareOnly&&config.checks.includes('rules')){const audit=Insights.audit({...s,assignments:plan},period);notes.push('Profilprüfung Regeln: '+audit.issues.length+' Auffälligkeiten; '+audit.unknown.length+' offene Datenhinweise.');}
      if(!compareOnly&&config.checks.includes('hours'))notes.push('Profilprüfung Stunden: '+hours(staff.reduce((n,e)=>n+Math.max(0,Number(s.monthTarget(e))*new Set(period.map(d=>d.slice(0,7))).size-Insights.hours(s,e,plan,period)),0))+' h verbleibender Sollstundenfehlbetrag.');
      if(!compareOnly&&config.checks.includes('reserve')){const r=Workflows.reserveMetrics(s,plan,period);notes.push('Profilprüfung Reserve: '+r.none+' ohne direkte Reserve, '+r.single+' mit einer Reserve, '+r.checked+' von '+r.total+' Diensten geprüft.');}
      return {...result,title:chosen.name+' · '+result.title,notes:['Gespeichertes Unternehmensprofil. Startmonat: '+month+'. Ziele ersetzen keine verbindlichen Regeln.',...(result.notes||[]),...notes]};
    }
    if(Workflows&&['order','multiBalance','wizard','undo'].includes(intent)){
      const help=findHelp(q,s.helpArticles,true);if(help&&/^(?:wie|was|wo)\b/.test(q))return response(help.title,help.text,{actions:[{help:true,query:help.title,label:'Anleitung im Hilfe-Center öffnen'}],context:{}});
      if(intent==='undo')return Workflows.undo(s,s.undoEntries?.find(e=>!e.undone));
      const request=s.analysisRequest?.kind===intent?s.analysisRequest:{},anchor=request.month||(intent==='wizard'&&!period.explicit?s.wizardMonth:null)||dates[Math.floor(dates.length/2)].slice(0,7);
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(anchor))return response('Monat prüfen','Bitte einen gültigen Monat auswählen.',{context});
      const month=Workflows.datesFor(anchor),matches=employeeMatches(q,staff);
      const focusName=request.focus||(requestedTeam?'team:'+requestedTeam:/teamleiter/.test(q)?'leaders':matches.length===1?'person:'+matches[0].id:'all');
      const focus=focusName==='all'?null:focusName==='leaders'?staff.filter(e=>e.role==='Teamleiter'):focusName.startsWith('team:')?staff.filter(e=>team(e)===focusName.slice(5)):focusName.startsWith('person:')?staff.filter(e=>String(e.id)===focusName.slice(7)):[];
      const form=(text)=>response(intent==='order'?'Planungsauftrag vorbereiten':'Mehrmonatsausgleich vorbereiten',text,{form:{kind:intent,month:anchor,focus:focusName,goal:request.goal||'both',count:request.count||3},context:{...context,pending:true}});
      if(intent==='wizard')return Workflows.wizard(s,month,s.wizardProgress?.[anchor]||{});
      if(focus&&!focus.length)return form('Für diesen Fokus wurde kein aktiver Mitarbeiter gefunden. Bitte die Auswahl prüfen.');
      if(matches.length>1&&!request.focus)return form('Mehrere Personen passen zum Namen. Wähle den Mitarbeiter eindeutig aus.');
      if(!request.focus&&/mitarbeiter\s+\d|personalnummer\s+\d/.test(q)&&!matches.length)return form('Diese Personalnummer ist keinem aktiven Mitarbeiter zugeordnet.');
      if(intent==='multiBalance'){
        const words={zwei:2,drei:3,vier:4,fuenf:5,sechs:6},match=q.match(/(?:naechsten|ueber|in)\s+(zwei|drei|vier|fuenf|sechs|\d+)\s+monat/),count=Number(request.count||(match?(words[match[1]]||match[1]):3));
        if(!s.analysisRequest&&!match&&!period.explicit)return form('Wähle Startmonat, zwei bis sechs Monate und den gewünschten Fokus.');
        return Workflows.multi(s,anchor,count,focus?.map(e=>String(e.id))||null);
      }
      if(!request.goal&&(/starten|vorbereiten/.test(q)||!/(?:soll|stunden|pflicht|besetz|optimier|verbesser)/.test(q)))return form('Wähle Ziel, Monat und Mitarbeiterkreis. Danach erhältst du einen gemeinsam geprüften Entwurf zur Bestätigung.');
      const restrictions=q.replace(/(?:ohne|keine)\s+(?:veroeffentlichte|geschuetzte|feste)\s+(?:dienste|schichten)(?:\s+(?:zu\s+)?(?:aendern|veraendern))?/g,'');
      const unsupported=/\b(?:nur|ausser|ohne|maximal|mindestens|hoechstens|keine|keinen|niemals|bevorzuge)\b/.test(restrictions);
      if(!request.goal&&(unsupported||/\b(?:loesche|ignoriere|erzwinge|ueberschreite)\b/.test(q)))return form('Diese Zusatzbedingung kann ich nicht zuverlässig als Planungsregel ausführen. Bitte wähle den unterstützten Auftrag unten; die aktuellen verbindlichen Regeln bleiben maßgeblich.');
      const goal=request.goal||(/pflicht|besetz/.test(q)&&!/stunden|soll|optimier/.test(q)?'coverage':'both');
      if(!['both','coverage'].includes(goal))return form('Bitte ein unterstütztes Planungsziel wählen.');
      return Workflows.order(s,month,focus?.map(e=>String(e.id))||null,goal);
    }

    // Explicit product topics take precedence over broad analytical keywords.
    // A named person or a pending service diagnosis keeps the actual data analysis.
    const explanatory=/^(?:bitte\s+)?(?:wie(?! viele| viel)|wo\b|was\b|warum|weshalb|wieso|welche.*(?:regeln|grenzen|schichtwechsel|feiertage|obergrenze)|kann ich|laeuft|darf ich)/.test(q);
    if(intent==='questions')return response('Welche Fragen kann ich stellen?','Du kannst frei formulieren. Ich erkenne unterstützte Planungsthemen und Anleitungen, bin aber kein allgemeiner KI-Chat. Nenne bei einzelnen Diensten Datum und Schicht, bei Personen Name oder Personalnummer. Für Analysen gilt der ausgewählte Zeitraum; der Engpasslöser prüft immer den zugehörigen Monat.',{columns:['Thema','Beispielfragen'],rows:questionGroups.map(([title,questions])=>[title,questions.join('\n')]),suggestions:questionGroups.flatMap(([,questions])=>questions),context:{}});
    const topic=explanatory&&intent!=='write'&&intent!=='rules'&&!['replacement','outage','improvements','bottlenecks','loadCheck','runReasons','planningCheck','employeePlan'].includes(intent)&&!employeeMatches(q,staff).length&&!previous.pending?findHelp(q,s.helpArticles,true):null;
    if(topic)return response(topic.title,topic.text,{notes:['Quelle: SchichtFunk Hilfe-Center. Maßgeblich sind die geladenen Regeln des ausgewählten Unternehmens.'],actions:[...(intent==='rhythmHelp'?[{view:'settings',team:requestedTeam,label:requestedTeam?'Team '+requestedTeam+' bearbeiten':'Teamrhythmen öffnen'}]:[]),{help:true,query:topic.title,label:'Anleitung im Hilfe-Center öffnen'}],context:{}});
    if(intent==='rules'){
      if(!s.rulesReady||!s.solidRules?.enabled||!s.hourLimits)return response('Planungsregeln noch nicht bereit','Die aktuellen Unternehmensregeln müssen vollständig geladen sein. Öffne Einstellungen → Planungsregeln und prüfe das ausgewählte Unternehmen.',{actions:[{view:'settings',section:'rules',label:'Planungsregeln öffnen'}],context:{}});
      const number=v=>Number.isFinite(Number(v))&&v!=null?hours(v):'Nicht hinterlegt';
      const p=s.solidRules,notes=[
        'Allgemeiner Arbeitsblock: '+number(p.maxConsecutiveShifts)+' Dienste; Nachtblock: '+number(p.maxConsecutiveNightShifts)+' Nächte.',
        'OT1/OT2/OT3: eigene Blockgrenze '+number(p.otOnlyMaxConsecutiveShifts)+' Dienste und Monatsobergrenze '+number(p.otOnlyMonthlyMaxHours)+' Std.',
        'Teamleiter: eigene Nachtblockgrenze '+number(p.teamLeaderMaxConsecutiveNightShifts)+' Nächte.',
        'Sperre absteigender Schichtwechsel: '+(p.preventDescendingShifts?'aktiv':'nicht aktiviert')+'. Freigaben, feste Rhythmen, Feiertage und Erholung werden zusätzlich geprüft.',
        'Die Tabelle zeigt persönliche Obergrenzen aus der aktuellen Auto-Planung. Vertrags-SOLL und Obergrenze sind unterschiedliche Werte; höhere Grenzen garantieren keine zusätzlichen Dienste.'
      ];
      const values=staff.map(e=>({e,limit:s.hourLimits(e)}));
      return response('Aktuelle Planungsregeln','Geladene Regeln des ausgewählten Unternehmens. Wochen- und Kalendermonatsgrenzen berücksichtigen Nachtüberträge zeitanteilig.',{columns:['Mitarbeiter','Monats-SOLL','Wochenobergrenze','Monatsobergrenze','Max. Dienste'],rows:values.map(({e,limit})=>[name(e),number(s.monthTarget(e))+' Std.',number(limit?.weeklyLimit)+' Std.',number(limit?.monthLimit)+' Std.',number(limit?.maxMonthlyShifts)]),rowActions:values.map(({e})=>({view:'employees',employeeId:e.id,label:'Profil prüfen'})),notes,actions:[{view:'settings',section:'rules',label:'Planungsregeln öffnen'},{help:true,query:'Wo sehe und ändere ich die aktuell geltenden Planungsregeln?',label:'Regeln erklärt'}],context:{intent:'rules',dates}});
    }
    if(Insights&&['loadCheck','improvements','bottlenecks','outage','runReasons'].includes(intent)){
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
      if(intent==='bottlenecks'){
        const matched=employeeMatches(q,staff),leaders=/teamleiter/.test(q),teamStaff=requestedTeam?staff.filter(e=>team(e)===requestedTeam):null;
        if(!matched.length&&/mitarbeiter\s+\d|personalnummer\s+\d/.test(q))return response('Mitarbeiter nicht gefunden','Diese Personalnummer ist keinem aktiven Mitarbeiter des ausgewählten Unternehmens zugeordnet.',{context});
        if(matched.length>1)return response('Welchen Mitarbeiter meinst du?','Bitte die Personalnummer oder den vollständigen Namen nennen.',{context:{...context,pending:true},suggestions:matched.map(e=>'Engpasslöser für Mitarbeiter '+(e.personnelNo||name(e)))});
        const focus=matched.length?matched:leaders?staff.filter(e=>e.role==='Teamleiter'):teamStaff;
        if(focus&&!focus.length)return response('Keine passenden Mitarbeiter','Für diesen Fokus sind keine aktiven Mitarbeiter im ausgewählten Unternehmen geladen.',{context});
        return Insights.bottlenecks(s,month,focus?focus.map(e=>String(e.id)):null);
      }
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
      const added=paidHours(s,{date:dates[0],type});
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
        return response(`Besetzung prüfen · ${label}`,'Ich prüfe die aktuell gespeicherte Planung. Gründe aus einer früheren Auto-Planung lassen sich nur durch eine erneute Analyse mit denselben Regeln nachvollziehen. Kandidaten je Dienst können nicht gleichzeitig für mehrere Dienste zugesagt werden.',{columns:['Tag','Schicht','Offen','Aktuelle Prüfung'],rows:relevant.map(x=>{const r=s.candidates(x.type,x.date);return[formatDate(x.date),shiftLabel(x.type),String(x.missing),(r.candidates.length?`${r.candidates.length} aktuell passende Mitarbeiter.`:'Aktuell kein passender Mitarbeiter.')+((r.reasons||[]).length?' Erkannte Ausschlussgründe: '+r.reasons.map(y=>`${y.count}× ${y.label}`).join('; ')+'.':'')+' Gründe können sich überschneiden; dies erklärt keine früheren Planungsläufe.'];}),actions:[nav('auto','Auto-Planung prüfen'),nav('employees','Mitarbeiter prüfen')],context});
      }
      const rows=intent==='open'?missing:intent==='overstaffed'?all.filter(x=>x.extra):all;
      return response(`${intent==='open'?'Offene Dienste':intent==='overstaffed'?'Überbesetzte Dienste':'SOLL / IST'} · ${label}`,required?`${open} offene Positionen in ${missing.length} Schichten. ${required-open} von ${required} benötigten Positionen sind besetzt.${extra?` Zusätzlich ${extra} Besetzungen über SOLL.`:''}`:'Für diesen Zeitraum ist kein SOLL-Bedarf hinterlegt. Bitte prüfe die Einstellungen, bevor du den Plan als vollständig bewertest.',{columns:['Tag','Schicht','SOLL','IST',intent==='overstaffed'?'Über SOLL':'Offen'],rows:rows.map(x=>[formatDate(x.date),x.label||shiftLabel(x.type),String(x.soll),String(x.ist),String(intent==='overstaffed'?x.extra:x.missing)]),rowActions:rows.map(x=>({view:'schedule',date:x.date,type:x.type,label:'Dienst öffnen'})),actions:[{view:'schedule',date:dates[0],month:dates.length>1,label:'Zeitraum im Dienstplan öffnen'},nav('auto','Auto-Planung öffnen'),...(open&&['open','coverage'].includes(intent)?[{question:'Warum sind Dienste'+(type?' '+type:'')+(dates.length===1?' am '+dates[0]:' vom '+dates[0]+' bis '+dates.at(-1))+' nicht besetzt?',label:'Gründe für offene Dienste prüfen'},{question:'Engpasslöser starten für '+dates[Math.floor(dates.length/2)].slice(0,7),label:'Lösungen für den Monat prüfen'}]:[])],suggestions:open?['Warum konnte die Auto-Planung die offenen Dienste nicht besetzen?']:[],context});
    }
    if(intent==='help')return response('Planungsanalysen und Wissensdatenbank','Ich prüfe offene und überbesetzte Dienste, Ersatzbesetzung, Mitarbeiter, Teams, Stunden und Schichtfreigaben. Dazu kommen Monatscheck, Belastungsprüfung, gemeinsam geprüfte Verbesserungsvorschläge, Ausfallsimulation und gespeicherte Planungsgründe. Die Wissensdatenbank erklärt die aktuellen Funktionen und Regeln von SchichtFunk.',{columns:['Hilfebereich','Anleitungen'],rows:Object.entries(s.helpArticles||{}).map(([category,items])=>[s.helpCategories?.find(c=>c[0]===category)?.[1]||category,String(items.length)]),suggestions:['Welche Planungsregeln gelten?','Welche Schichtwechsel sind erlaubt?','Wie werden OT1 OT2 OT3 geplant?','Läuft die Auto-Planung im Hintergrund?','Kann ich unabhängig von der Wunschplanung vorplanen?','Wie funktioniert der DATEV-LODAS-Export?'],actions:[{help:true,label:'Wissensdatenbank öffnen'}],context:{}});
    const suggestions=[...(/personal|mitarbeiter|team/.test(q)?['Welche Mitarbeiter haben keine Schichtfreigabe?','Bei welchen Mitarbeitern fehlt eine Teamzuordnung?','Geplante Stunden prüfen']:/plan|dienst|besetz|ersatz/.test(q)?['Monatscheck starten','Engpasslöser starten','Offene Dienste prüfen','Ersatz für einen Dienst suchen']:['Monatscheck starten','Offene Dienste prüfen','Ersatz für einen Dienst suchen','Geplante Stunden prüfen','Welche Hilfethemen kennst du?']),'Welche Fragen kann ich stellen?'];
    const derived=Vocabulary?.suggest(q,s)||[];if(derived.length)return response('Meinst du eines dieser Themen?','Die Vorschläge stammen aus den vorhandenen Funktionen, Hilfeartikeln oder aktuell geladenen Schichtnamen.',{clarification:derived.map(x=>({label:x.term,question:x.question})),context:{...previous}});
    const learningTerm=Vocabulary?.learnable(q,s);if(learningTerm)return response('Welche Bedeutung hat dieser Planungsbegriff?','Wähle die passende Prüfung. Wiederholt übereinstimmende Auswahlen können den allgemeinen Wortschatz erweitern.',{clarification:Object.entries(Vocabulary.topics).map(([key,label])=>({label,question:label,learning:{term:learningTerm,target:'topic:'+key}})),context:{...previous}});
    return response('Welches Thema meinst du?','Für diese Frage habe ich noch keine zuverlässige Auswertung. Wähle ein passendes Thema oder formuliere die Frage genauer. Bei einzelnen Diensten helfen Datum und Schichtart.',{suggestions,context:{}});
  }
  function analysisBasis(s,dates,result={}){
    const data=s.dataRead,matched=!!(data&&s.companyId&&s.userId&&data.companyId===s.companyId&&data.userId===s.userId&&Number.isFinite(Date.parse(data.readAt))),readAt=matched?data.readAt:null;
    const rows=(s.assignments||[]).filter(a=>dates.includes(a.date)&&a.status!=='CANCELLED'&&a._dbStatus!=='CANCELLED');
    const counts={draft:0,published:0,unknown:0};for(const a of rows){const status=a._dbStatus||a.status;if(status==='PUBLISHED'||a.publishedAt)counts.published++;else if(status==='DRAFT')counts.draft++;else counts.unknown++;}
    const warnings=[];if(!matched)warnings.push('Zeitpunkt und Vollständigkeit des letzten Unternehmensabrufs sind nicht bestätigt.');
    else if(data.possibleLimit)warnings.push('Eine Abrufgrenze kann erreicht sein; die Vollständigkeit ist offen.');
    if(readAt&&Date.now()-Date.parse(readAt)>300000)warnings.push('Der letzte Unternehmensabruf liegt mehr als fünf Minuten zurück. Zwischenzeitliche Änderungen sind möglich.');
    if(s.rulesReady!==true)warnings.push('Unternehmensregeln sind nicht vollständig bestätigt.');
    if(s.teamRulesReady===false)warnings.push('Teamregeln sind noch nicht vollständig geladen.');
    if(counts.unknown)warnings.push(counts.unknown+' Dienste haben keinen eindeutig geladenen Entwurfs- oder Veröffentlichungsstatus.');
    if(s.pendingChanges)warnings.push('Speicherungen sind ausstehend oder fehlgeschlagen. Die Prüfung verwendet den lokalen Planungsstand.');
    if(/Teilanalyse|unvollständig|Suchgrenze erreicht/i.test([result.text,...(result.blockers||[])].join(' ')))warnings.push('Die Analyse weist Einschränkungen auf; ungeprüfte Ergebnisse sind nicht als unauffällig bewertet.');
    return {company:s.companyName||'Ausgewähltes Unternehmen',from:dates[0],to:dates.at(-1),days:dates.length,timezone:s.timezone||'Europe/Berlin',checkedAt:new Date().toISOString(),readAt:readAt||null,planStatus:`Entwürfe und veröffentlichte Dienste (${counts.draft} Entwürfe, ${counts.published} veröffentlicht, ${counts.unknown} ohne eindeutigen Status)`+(result.proposal?.proposed?.length?' · Verbesserungsvorschlag separat, noch nicht gespeichert':''),scope:`${(s.employees||[]).filter(e=>e.status==='active'&&!e.deletedAt).length} aktive Mitarbeiter · ${rows.length} Dienste im Zeitraum · ${(s.absences||[]).length} geladene Abwesenheiten`,completeness:matched&&!data.possibleLimit?'Unternehmensabruf erfolgreich; Prüfung des geladenen Bestands':'Vollständigkeit nicht bestätigt',warnings};
  }
  function answer(question,s,previous={}){
    if(s.authorized&&!s.loading&&!s.error){
      let q=naturalQuestion(question);
      if(!s._constraintsApplied&&Vocabulary&&!/^(?:wie(?! viele| viel)|wo (?:finde|sehe)|was (?:bedeutet|ist|passiert))\b/.test(q)&&!['unassigned','missingPermissions'].includes(intentFor(q))&&!(previous.clarify==='hours'&&/\bnur(?: die)? (?:geplant|erfasst|tatsaechlich|geleistet|planstunden)/.test(q))){const filter=Vocabulary.constraints(q,s.shifts||[]);if(filter.matched){
        if(filter.error)return response('Einschränkung bitte präzisieren',filter.error,{context:previous});
        const base=filter.base.replace(/^alle(?: mitarbeiter)?$/,''),wanted=base?intentFor(base):previous.intent,allowed=['open','coverage','overstaffed','diagnosis','workload','employeePlan','absence','replacement'];
        if(!allowed.includes(wanted))return response('Welche Auswertung möchtest du eingrenzen?','Diese Einschränkungen sind für Besetzungs-, Dienst-, Stunden-, Abwesenheits- und Ersatzprüfungen verfügbar. Nenne zuerst die gewünschte Prüfung.',{context:previous});
        const follow=!base||/^(?:nur|ohne|ausser|alle|und)\b/.test(q),old=follow?previous.constraints||{}:{},state={...old,...filter.state,excludeTypes:[...new Set([...(old.excludeTypes||[]),...(filter.state.excludeTypes||[])])]};
        if((state.type||follow&&previous.type)&&state.excludeTypes.includes(state.type||previous.type))return response('Widersprüchliche Auswahl','Die gleiche Schicht soll einbezogen und ausgeschlossen werden. Bitte wähle eine eindeutige Auswahl.',{context:previous});
        if(state.excludeLeaders&&['open','coverage','overstaffed','diagnosis'].includes(wanted))return response('Personenauswahl und Besetzung unterscheiden','Die Pflichtbesetzung gilt für das Unternehmen und lässt sich nicht durch das Ausblenden von Teamleitern ändern. Prüfe dafür geplante Stunden oder einzelne Mitarbeiterdienste.',{context:previous});
        if(wanted==='absence'&&(state.type||state.excludeTypes.length))return response('Abwesenheiten nach Zeitraum und Personen prüfen','Eine Schichtauswahl beschreibt keine Abwesenheitsart. Bitte verwende hier den Zeitraum und die Personenauswahl.',{context:previous});
        const period=parsePeriod(base,{...s,defaultDates:previous.constraintBaseDates||previous.dates||s.defaultDates});if(period.error)return response('Datum prüfen',period.error,{context:previous});
        const original=period.explicit?period.dates:previous.constraintBaseDates||previous.dates||period.dates,dates=original.filter(d=>!state.week||(state.week==='weekends')===[0,6].includes(new Date(d+'T12:00:00Z').getUTCDay()));
        if(!dates.length)return response('Keine Tage in dieser Auswahl','Der Zeitraum enthält keine Tage für den gewählten Wochenendfilter.',{context:previous});
        if(state.excludeTypes.some(t=>dates.some(d=>(s.coverageInfo?.(d,t)?.members||[]).length>1)))return response('Gemeinsame Besetzung berücksichtigen','Diese Schicht gehört zu einer gemeinsamen Besetzung. Bitte wähle die gewünschte Schicht ausdrücklich, damit der gemeinsame Bedarf nicht ausgeblendet wird.',{context:previous});
        const people=s.employees.filter(e=>!state.excludeLeaders||normalize(e.role)!=='teamleiter'),ids=new Set(people.map(e=>String(e.id))),typeAllowed=a=>(!state.type||a.type===state.type)&&!state.excludeTypes.includes(a.type),candidates=s.candidates;
        const scoped={...s,_constraintsApplied:true,_filterDates:dates,employees:people,shifts:s.shifts.filter(t=>!state.excludeTypes.includes(t.id)),assignments:['workload','employeePlan'].includes(wanted)?s.assignments.filter(typeAllowed):s.assignments,candidates:(t,d,...args)=>{const r=candidates(t,d,...args);return {...r,candidates:r.candidates.filter(c=>ids.has(String(c.e.id))),assessments:r.assessments?.filter(c=>ids.has(String(c.employeeId))),reasons:state.excludeLeaders?[]:r.reasons};}};
        const prompts={open:'Offene Dienste',coverage:'Besetzung prüfen',overstaffed:'Überbesetzte Dienste',diagnosis:'Warum sind Dienste nicht besetzt?',workload:'Geplante Stunden prüfen',employeePlan:'Zeige ihre Dienste',absence:'Abwesenheiten',replacement:'Ersatz suchen'},canonical=(base||'Und '+prompts[wanted])+(state.type?' '+state.type:'')+' vom '+original[0]+' bis '+original.at(-1),result=answer(canonical,scoped,previous);
        const summary=[state.type?'nur '+state.type:'',state.week==='weekdays'?'ohne Wochenende':state.week==='weekends'?'nur Wochenende':'',state.excludeLeaders?'ohne Teamleiter':'',...state.excludeTypes.map(t=>'ohne '+t)].filter(Boolean).join(' · ');
        result.interpretation='Verstandene Auswahl: '+summary;result.context={...result.context,constraints:state,constraintBaseDates:original};result.replayQuestion=question;return result;
      }}
      if(!s._conversationResolved&&previous.dates?.length){const free=/^(?:und )?(?:frei|die freien|freie dienste|wer ist frei|wer hat frei|wer ist verfuegbar)[?.!]*$/.test(q),room=/^(?:und )?wer hat (?:noch )?luft[?.!]*$/.test(q);let canonical=null,meaning='';
        const period=' vom '+previous.dates[0]+' bis '+previous.dates.at(-1),type=previous.type?' '+previous.type:'';
        if((free||room)&&previous.intent==='replacement'){canonical='Und Ersatz suchen'+type+period;meaning='„Frei“ wird hier als Ersatzprüfung für den vorherigen Dienst verstanden.';}
        else if(free&&previous.intent==='absence'){canonical='Und Abwesenheiten'+period;meaning='„Frei“ bezieht sich hier auf die zuvor geprüften Abwesenheiten.';}
        else if(free&&['open','coverage','diagnosis'].includes(previous.intent)&&/^(?:und )?(?:frei|die freien|freie dienste)/.test(q)){canonical='Und Offene Dienste'+type+period;meaning='Gemeint sind die offenen Dienste der vorherigen Besetzungsprüfung.';}
        else if(room&&previous.intent==='workload'){canonical='Und wer liegt unter dem Monats-SOLL'+period;meaning='Ich prüfe verbleibende geplante Sollstunden. Das ist keine Zusage zur Einsatzverfügbarkeit.';}
        if(canonical){const result=answer(canonical,{...s,_conversationResolved:true},previous);result.interpretation=meaning;result.replayQuestion=canonical;return result;}
      }
      const alias=Vocabulary?.expand(q,s.dictionary,s.shifts||[]),hits=alias?.hits||[];
      if(!s._vocabularyResolved&&hits.length){
        const targets=[...new Set(hits.map(x=>x.target))];
        if(targets.length>1)return response('Welchen Begriff meinst du?','Mehrere Wörterbucheinträge passen. Bitte wähle die Bedeutung.',{clarification:targets.map(target=>({label:target.startsWith('topic:')?Vocabulary.topics[target.slice(6)]:target,question:hits.reduce((text,h)=>Vocabulary.replaceTerm(text,h.term,''),q)+' '+(target.startsWith('topic:')?Vocabulary.topics[target.slice(6)]:target)})),context:previous});
        const unavailable=targets.filter(t=>!t.startsWith('topic:')&&!(s.shifts||[]).some(x=>x.id===t));if(unavailable.length)return response('Begriff bekannt · Schicht hier nicht eingerichtet','Der gemeinsame Wortschatz kennt die Zuordnung zu '+unavailable.join(', ')+'. Diese Schicht ist im ausgewählten Unternehmen nicht aktiv eingerichtet. Bitte wähle eine vorhandene Schicht oder prüfe die Einstellungen.',{context:previous,clarification:(s.shifts||[]).slice(0,8).map(t=>({label:t.id+' · '+(t.name||t.id),question:hits.reduce((text,h)=>Vocabulary.replaceTerm(text,h.term,''),q)+' '+t.id}))});
        const target=targets[0],revised=Vocabulary.replaceTerm(q,hits[0].term,target.startsWith('topic:')?Vocabulary.topics[target.slice(6)]:target);const r=answer(revised,{...s,_vocabularyResolved:true},previous);r.replayQuestion=revised;return r;
      }
      const shiftWord=q.match(/\b(?:frueh|spaet|nacht)(?:schicht|dienst)?\b/);
      if(shiftWord&&!hits.length){const stem=shiftWord[0].replace(/schicht|dienst/g,''),choices=(s.shifts||[]).filter(t=>normalize(t.name||'').includes(stem)),exact=(s.shifts||[]).some(t=>new RegExp('(?:^|[^a-z0-9])'+normalize(t.id).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:$|[^a-z0-9])').test(q));if(choices.length>1&&!exact)return response('Welche Schicht meinst du?','Mehrere aktive Schichten passen zu dieser Bezeichnung. Bitte wähle eine aus.',{clarification:choices.map(t=>({label:t.id+' · '+t.name,question:q.replace(shiftWord[0],t.id)})),context:previous});}
      const siteFollow=/^(?:und|auch)\s+(.+?)[?.!]*$/.exec(q);if(siteFollow&&previous.dates?.length&&(s.shifts||[]).some(t=>t.siteName&&normalize(t.siteName).includes(siteFollow[1])))q='nur '+siteFollow[1];
      const narrow=/^(?:(?:und|bitte|dann)\s+)*(?:nur|ausschliesslich)\s+(.+?)[?.!]*$/.exec(q);
      if(narrow&&previous.dates?.length&&previous.clarify!=='hours'){
        const filter=narrow[1],type=parseShift(filter,s),weekend=/^(?:am |an den |die )?(?:wochenende|wochenenden)$/.test(filter),site=(s.shifts||[]).filter(t=>t.siteName&&normalize(t.siteName).includes(filter));
        if(!['open','coverage','overstaffed','diagnosis','employeePlan','workload'].includes(previous.intent))return response('Filter genauer angeben','Bitte starte eine Besetzungs-, Dienst- oder Stundenprüfung und grenze anschließend das Ergebnis ein.',{context:previous});
        if(site.length&&!type)return response('Standort genauer auswählen','Die Besetzung kann standortübergreifend gelten. Wähle die konkrete Schicht am Standort; die Unternehmensvorgaben bleiben maßgeblich.',{clarification:site.map(t=>({label:t.id+' · '+t.siteName,question:'Nur '+t.id})),context:previous});
        if(weekend||type){const dates=weekend?previous.dates.filter(d=>[0,6].includes(new Date(d+'T12:00:00Z').getUTCDay())):previous.dates;if(!dates.length)return response('Keine Wochenendtage','Der vorherige Zeitraum enthält keine Wochenendtage.',{context:previous});const prompts={open:'Offene Dienste',coverage:'Besetzung prüfen',overstaffed:'Überbesetzte Dienste',diagnosis:'Warum sind Dienste nicht besetzt?',employeePlan:'Zeige ihre Dienste',workload:'Geplante Stunden prüfen'},revised='Und '+prompts[previous.intent]+(type?' '+type:previous.type?' '+previous.type:'')+' vom '+dates[0]+' bis '+dates.at(-1),r=answer(revised,{...s,_filterDates:dates,_filterWeekend:weekend},previous);r.replayQuestion=(weekend?'Nur Wochenende':revised);return r;}
        return response('Welchen Filter meinst du?','Nenne eine vorhandene Schicht oder „nur Wochenende“. Standorte benötigen eine eindeutige Schichtzuordnung.',{context:previous});
      }
      if(/^(?:frei|die freien|freie dienste)[?.!]*$/.test(q))return response('Was meinst du mit frei?','Meinst du offene Dienste, Abwesenheiten oder passende Ersatzpersonen?',{clarification:[{label:'Offene Dienste',question:'Offene Dienste'},{label:'Abwesenheiten',question:'Abwesenheiten'},{label:'Ersatz suchen',question:'Ersatz suchen'}],context:previous});
      if(/^wer (?:ist frei|hat frei|ist verfuegbar)\b/.test(q)){const p=parsePeriod(q,s);if(p.error)return response('Datum prüfen',p.error,{context:previous});const dates=p.explicit?p.dates:previous.dates||p.dates,range=' vom '+dates[0]+' bis '+dates.at(-1);return response('Was bedeutet frei für dich?','Möchtest du Ersatz für einen Dienst suchen oder Abwesenheiten ansehen?',{clarification:[{label:'Ersatz suchen',question:'Ersatz suchen'+range},{label:'Abwesenheiten',question:'Abwesenheiten'+range}],context:{...previous,dates}});}
      if(previous.clarify==='missing'&&previous.dates?.length&&/^(?:(?:die|ich meine|bitte|nur)\s+)*(?:offen\w*|luecken|unbesetzt\w*|abwesend\w*|abwesenheiten|krank\w*)(?:\s+(?:dienste|schichten|mitarbeiter|personen|bitte))*[.!?]*$/.test(q)){
        const range=previous.dates.length===1?' am '+previous.dates[0]:' vom '+previous.dates[0]+' bis '+previous.dates.at(-1),revised=(/abwesen|abwesend|krank/.test(q)?'Abwesenheiten':'Offene Dienste')+range,result=answer(revised,{...s,defaultDates:previous.dates},{});result.replayQuestion=revised;return result;
      }
      if(previous.clarify==='hours'&&/^(?:(?:die|nur|bitte|ich meine)\s+)*(?:geplant\w*|planstunden|erfasst\w*|tatsaechlich\w*|ist[- ]?stunden|geleistet\w*)(?:\s+(?:stunden|arbeitszeit|bitte|meine ich))*[.!?]*$/.test(q)){
        const actual=/erfasst|tatsaechlich|ist[- ]?stunden|geleistet/.test(q),revised=previous.originalQuestion.replace(/stunden/i,actual?'tatsächlich erfasste Stunden':'geplante Stunden');
        const result=answer(revised,{...s,defaultDates:previous.dates||s.defaultDates},{...previous,clarify:null});result.replayQuestion=revised;return result;
      }
      if(previous.clarify==='hours'&&/^(?:ja|nein|okay|ok|bitte)[.!?]*$/.test(q))return answer(previous.originalQuestion,{...s,defaultDates:previous.dates||s.defaultDates},{});
      if(/^(?:und\s+)?(?:warum|weshalb|wieso)(?:\s+(?:ist das so|ist das|denn))?[?.!]*$/.test(q)&&['open','coverage','planningCheck','diagnosis'].includes(previous.intent)&&previous.dates?.length){const range=previous.dates.length===1?' am '+previous.dates[0]:' vom '+previous.dates[0]+' bis '+previous.dates.at(-1),type=previous.type?' '+previous.type:'';const revised='Warum sind Dienste'+type+range+' nicht besetzt?';const result=answer(revised,{...s,defaultDates:previous.dates},{});result.replayQuestion=revised;return result;}
      if(isReportFollowup(question,previous)){const result=answer('Planungsbericht erstellen',{...s,defaultDates:previous.dates},{});result.replayQuestion='Planungsbericht erstellen';return result;}
      if(!s.analysisRequest&&!['goalOrder','goalOrders','goalResume'].includes(intentFor(q))){const plan=requestPlan(question,s,previous);if(plan)return plan;}
    }
    const result=answerRaw(question,s,previous);
    if(s.authorized&&!s.loading&&!s.error&&result.context?.pending&&result.context.intent==='workload'&&/stunden/.test(normalize(question))&&!/geplant|planstunden|planung|soll|vertrag/.test(normalize(question)))result.context={...result.context,hoursQuestion:question};
    if(!s.authorized||s.loading||s.error||result.title==='Datum prüfen'||result.clarification||result.context?.pending||result.notes?.some(n=>/^Quelle: SchichtFunk Hilfe-Center/.test(n))||result.profileManager||result.form)return result;
    const intent=result.context?.intent||intentFor(normalize(question));
    if(['report','planningCheck','loadCheck','workload','open','coverage','diagnosis','overstaffed','replacement','employeePlan','employeeDiagnosis','missingPermissions','unassigned','teamDay','outage','improvements','bottlenecks','forecast','leaveImpact','changeImpact','order','multiBalance','variants','followup','runReasons','rules','wizard'].includes(intent)){
      const dates=result.context?.dates||parsePeriod(normalize(question),s).dates||s.defaultDates||[s.today];result.basis=analysisBasis(s,dates,result);
    }
    return result;
  }
  function isReportFollowup(question,previous){return !!(previous?.dates&&/^(?:(?:und|auch|das|bitte|dann|dafuer)\s+)*(?:als\s+)?pdf(?:[- ]?bericht)?(?:\s+bitte)?[.!?]*$/.test(naturalQuestion(question)));}
  const api={answer,normalize,naturalQuestion,isReportFollowup,requestPlan,parsePeriod,parseRange,rangeDates,parseShift,coverage,periodLabel,validDate,team,findHelp,questionGroups,intentFor,companyHelpArticles,analysisBasis,paidHours,plannedHours,fullMonth};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SFPlanningAssistantCore=api;
})(typeof window==='undefined'?globalThis:window);

