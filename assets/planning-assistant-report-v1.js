// Local planning reports: use the authorized snapshot; no upload or plan writes.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SFPlanningReport=api})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const text=v=>String(v??'').replace(/\r\n/g,'\n'),hours=v=>Number(v||0).toLocaleString('de-DE',{maximumFractionDigits:1});
 function collect(Core,s,dates){
  if(!s.authorized||s.loading||s.error)throw Error('Planungsdaten sind derzeit nicht zuverlässig verfügbar.');
  if(!dates?.length||dates.length>62||dates.some(d=>!Core.validDate(d)))throw Error('Bitte einen gültigen Zeitraum von höchstens 62 Tagen wählen.');
  const staff=s.employees.filter(e=>e.status==='active'&&!e.deletedAt),state={...s,assignments:s.assignments.filter(a=>a.status!=='CANCELLED'&&a._dbStatus!=='CANCELLED'),defaultDates:dates},coverage=Core.coverage(state,dates),missing=coverage.filter(x=>x.missing),started=Date.now();let examined=0,limited=false;
  const open=missing.map(x=>{
   const model=s.shifts.find(t=>t.id===x.type),location=model?.siteName||model?.locationName||'Unternehmensweit';
   let reason='Für diesen Datenstand nicht einzeln geprüft.';
   if(examined<40&&Date.now()-started<1200&&s.candidates){
    examined++;
    try{
     const shared=s.coverageInfo?.(x.date,x.type);
     if(shared?.members?.length>1)reason='Gemeinsamer Schichtbedarf; die Alternativen im Assistenten einzeln prüfen.';
     else{const result=s.candidates(x.type,x.date),count=result.candidates?.length||0;reason=count?count+' Personen einzeln grundsätzlich geeignet; gemeinsame Verteilung nicht geprüft.':(result.reasons||[]).map(r=>r.count+' × '+r.label).join('; ')||'Kein zulässiger Kandidat gefunden; kein Nachweis, dass eine andere Gesamtverteilung unmöglich ist.';}
    }catch{reason='Eignungsprüfung nicht verfügbar; Ursache offen.';}
   }else limited=true;
   return [x.date,x.label||x.type,location,String(x.soll),String(x.ist),String(x.missing),reason];
  });
  const check=Core.answer(Core.fullMonth(dates)?'Monatscheck '+dates[0].slice(0,7):'Belastung prüfen',state);
  const journal=Core.answer('Gespeicherte Planungsgründe anzeigen',state),full=Core.fullMonth(dates);
  const employees=staff.map(e=>{const planned=Core.plannedHours(state,e,dates),target=full?Number(s.monthTarget(e)):null;return [[e.last,e.first].filter(Boolean).join(', ')||e.personnelNo||'Mitarbeiter',hours(planned),target>0?hours(target):'Nicht bewertet',target>0?(planned>=target?'+':'')+hours(planned-target):'Nicht bewertet'];});
  const decisions=s.assignments.filter(a=>dates.includes(a.date)&&a._dbStatus!=='CANCELLED'&&a.status!=='CANCELLED'&&(a.rhythmOverride||a.fixed||a.locked||a.protected)).map(a=>{const e=staff.find(e=>String(e.id)===String(a.employeeId));return [a.date,a.type,e?[e.last,e.first].filter(Boolean).join(', '):'Nicht aktives Profil',[a.rhythmOverride?'Bewusste manuelle Einplanung':'',a.fixed?'Fest hinterlegt':'',a.locked||a.protected?'Geschützt':''].filter(Boolean).join(' · ')];});
  const notes=[...(check.notes||[]),'Planstunden sind keine erfasste Arbeitszeit und kein bestätigtes Überstundenkonto. Der Bericht übernimmt oder veröffentlicht keinen Dienstplan.','Die Kandidatenprüfung betrifft einzelne Dienste; passende Personen sind keine gemeinsame Besetzungszusage.',...(!full?['Monats-SOLL und Abweichung werden nur für einen vollständigen einzelnen Kalendermonat bewertet.']:[]),...(limited?['Die Einzelprüfung ist auf 40 offene Schichten und ein Zeitbudget begrenzt. Alle offenen Positionen werden aufgeführt; ungeprüfte Gründe bleiben ausdrücklich offen.']:[])];
  return {schemaVersion:1,title:'Planungsbericht',basis:Core.analysisBasis(s,dates,limited?{text:'Teilanalyse'}:check),summary:[['Pflichtpositionen',coverage.reduce((n,x)=>n+x.soll,0)],['Besetzte Pflichtpositionen',coverage.reduce((n,x)=>n+Math.min(x.soll,x.ist),0)],['Offene Positionen',coverage.reduce((n,x)=>n+x.missing,0)],['Über SOLL',coverage.reduce((n,x)=>n+x.extra,0)]].map(([label,value])=>[label,String(value)]),open,checks:{title:Core.fullMonth(dates)?'Monatscheck und offene Entscheidungen':'Belastungscheck',columns:check.columns,rows:check.rows},employees,decisions,history:{text:journal.text,columns:journal.columns,rows:journal.rows,notes:journal.notes||[]},notes,examined};
 }
 const dateTime=(value,zone)=>value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('de-DE',{timeZone:zone,dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'Nicht bestätigt';
 function buildDocument(report,{jsPDF,fonts}){
  if(report?.schemaVersion!==1||!fonts?.regular||!fonts?.bold)throw Error('Bericht oder PDF-Schriften sind nicht vollständig verfügbar.');
  const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
  doc.addFileToVFS('DejaVuSans.ttf',fonts.regular);doc.addFont('DejaVuSans.ttf','SFReport','normal');doc.addFileToVFS('DejaVuSans-Bold.ttf',fonts.bold);doc.addFont('DejaVuSans-Bold.ttf','SFReport','bold');doc.setFont('SFReport');
  const w=doc.internal.pageSize.getWidth(),height=doc.internal.pageSize.getHeight(),b=report.basis,zone=b.timezone||'Europe/Berlin';let y=33;
  const header=()=>{doc.setFillColor(8,24,38);doc.rect(0,0,w,24,'F');doc.setFillColor(39,214,180);doc.rect(0,24,w,1,'F');doc.setTextColor(245,250,255);doc.setFont('SFReport','bold');doc.setFontSize(13);doc.text('SchichtFunk | Planungsbericht',14,10);doc.setFont('SFReport','normal');doc.setFontSize(8);doc.text(doc.splitTextToSize(text(b.company),w-28).slice(0,2),14,17);};
  const paragraph=value=>{doc.setFont('SFReport','normal');doc.setFontSize(8);doc.setTextColor(35,52,65);for(const line of doc.splitTextToSize(text(value),w-28)){if(y>height-21){doc.addPage();header();y=33;}doc.text(line,14,y);y+=4;}y+=2;};
  const table=(title,columns,rows,widths)=>{
   if(y>height-48){doc.addPage();header();y=33;}doc.setFont('SFReport','bold');doc.setFontSize(10);doc.setTextColor(15,98,86);doc.text(title,14,y);y+=6;
   if(!rows?.length){paragraph('Keine Einträge im geprüften Bestand.');return;}
   doc.autoTable({startY:y,margin:{left:14,right:14,top:33,bottom:17},head:[columns.map(text)],body:rows.map(row=>row.map(text)),theme:'grid',styles:{font:'SFReport',fontStyle:'normal',fontSize:7,cellPadding:2,overflow:'linebreak',lineColor:[215,225,232],lineWidth:.1,textColor:[30,46,60]},headStyles:{fontStyle:'bold',fillColor:[17,76,73],textColor:[255,255,255]},alternateRowStyles:{fillColor:[244,248,250]},columnStyles:widths?Object.fromEntries(widths.map((n,i)=>[i,{cellWidth:n}])):{},didDrawPage:header});y=doc.lastAutoTable.finalY+9;
  };
  header();table('Prüfgrundlage',['Merkmal','Geprüfter Stand'],[['Unternehmen',b.company],['Zeitraum',b.from+' bis '+b.to+' ('+b.days+' Tage)'],['Planstatus',b.planStatus],['Umfang',b.scope],['Letzter Unternehmensabruf',dateTime(b.readAt,zone)],['Prüfung erstellt',dateTime(b.checkedAt,zone)],['Vollständigkeit',b.completeness],['Zeitzone',zone]], [57,w-85]);
  for(const warning of b.warnings||[])paragraph('Hinweis: '+warning);
  table('Besetzung im geprüften Zeitraum',['Kennzahl','Positionen'],report.summary,[90,w-118]);
  table('Offene Pflichtpositionen und aktuelle Einzelprüfung',['Tag','Schicht','Standort','SOLL','IST','Offen','Prüfung / offene Ursache'],report.open,[23,25,29,12,12,13,w-142]);
  table(report.checks.title,report.checks.columns,report.checks.rows);
  table('Planstunden und Monatsziel',['Mitarbeiter','Planstunden','Monats-SOLL','Abweichung'],report.employees);
  table('Gekennzeichnete manuelle Einplanungen',['Tag','Schicht','Mitarbeiter','Kennzeichnung'],report.decisions);
  paragraph('Freie Notizen und Abwesenheitsgründe werden nicht in den Bericht übernommen.');
  paragraph('Historische Planungsgründe: '+report.history.text);table('Gespeicherte Enddiagnose - historischer Stand',report.history.columns,report.history.rows);
  for(const note of [...report.history.notes,...report.notes])paragraph(note);
  const pages=doc.getNumberOfPages();for(let page=1;page<=pages;page++){doc.setPage(page);doc.setDrawColor(205,218,228);doc.line(14,height-12,w-14,height-12);doc.setFont('SFReport','normal');doc.setFontSize(7);doc.setTextColor(90,110,125);doc.text('Vertraulich | SchichtFunk | '+b.from+' bis '+b.to,14,height-7);doc.text('Seite '+page+' von '+pages,w-14,height-7,{align:'right'});}
  doc.setProperties({title:'SchichtFunk Planungsbericht '+b.from+' bis '+b.to,subject:b.company,author:'SchichtFunk'});return doc;
 }
 let assets=null;
 function script(src,ready){if(ready())return Promise.resolve();return new Promise((resolve,reject)=>{const el=document.createElement('script'),timer=setTimeout(()=>{el.remove();reject(Error('PDF-Bibliothek konnte nicht rechtzeitig geladen werden.'));},15000);el.src=src;el.onload=()=>{clearTimeout(timer);ready()?resolve():reject(Error('PDF-Bibliothek ist unvollständig.'));};el.onerror=()=>{clearTimeout(timer);el.remove();reject(Error('PDF-Bibliothek konnte nicht geladen werden.'));};document.head.appendChild(el);});}
 async function libraries(){
  if(!assets)assets=(async()=>{await script('/assets/vendor/jspdf-2.5.2.min.js',()=>!!window.jspdf?.jsPDF);await script('/assets/vendor/jspdf-autotable-3.8.4.min.js',()=>!!window.jspdf?.jsPDF?.API?.autoTable);const load=async path=>{const r=await fetch(path);if(!r.ok)throw Error('PDF-Schrift konnte nicht geladen werden.');const bytes=new Uint8Array(await r.arrayBuffer());let out='';for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(out);};return {jsPDF:window.jspdf.jsPDF,fonts:{regular:await load('/assets/vendor/DejaVuSans.ttf'),bold:await load('/assets/vendor/DejaVuSans-Bold.ttf')}};})().catch(error=>{assets=null;throw error;});return assets;
 }
 async function download(report,assertFresh){assertFresh();const options=await libraries();assertFresh();const doc=buildDocument(report,options);assertFresh();doc.save('SchichtFunk_Planungsbericht_'+report.basis.from+'_'+report.basis.to+'.pdf');}
 return {collect,buildDocument,download,dateTime};
});
