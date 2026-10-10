(function(root){
 'use strict';
 const kinds={TASK:'Aufgabe',CHECK:'Checkliste',INCIDENT:'Vorkommnis',NOTE:'Hinweis'},states={OPEN:'Offen',IN_PROGRESS:'In Arbeit',DONE:'Erledigt',CARRIED:'Weitergegeben'};
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const overdue=(item,now=Date.now())=>['OPEN','IN_PROGRESS'].includes(item.status)&&Number.isFinite(Date.parse(item.due_at))&&Date.parse(item.due_at)<now;
 const stats=(items,now=Date.now())=>({open:items.filter(i=>['OPEN','IN_PROGRESS'].includes(i.status)).length,done:items.filter(i=>i.status==='DONE').length,critical:items.filter(i=>i.critical&&overdue(i,now)).length});
 function validate(v){if(!kinds[v.kind]||String(v.title||'').trim().length<3||String(v.title).length>160)throw Error('Bitte einen Titel mit 3 bis 160 Zeichen eingeben.');if(v.critical&&(!v.due_at||!Number.isFinite(Date.parse(v.due_at))||String(v.escalation||'').trim().length<3))throw Error('Kritische Punkte brauchen eine Frist und einen Eskalationsweg.');if(v.status==='DONE'&&v.kind!=='NOTE'&&String(v.resolution||'').trim().length<3)throw Error('Bitte Erledigung kurz dokumentieren.');return v;}
 function reportText(r,zone='Europe/Berlin'){
 if(r.state!=='APPROVED'||!r.approved_at)throw Error('Nur freigegebene Leistungsberichte dürfen exportiert werden.');
 const s=r.snapshot,dt=v=>v?new Date(v).toLocaleString('de-DE',{timeZone:zone}):'Noch nicht bestätigt',h=v=>(Number(v||0)/60).toLocaleString('de-DE',{maximumFractionDigits:2});
 return ['LEISTUNGSBERICHT · FREIGEGEBEN · VERSION '+r.version,s.company,s.site+' · '+s.shift,dt(s.start)+' – '+dt(s.end),'Datenstand: '+dt(s.as_of),'Berichtskennung: '+r.id,'Freigegeben: '+dt(r.approved_at),'Prüfvermerk: '+r.review_note,'','GEPLANTE BESETZUNG',s.planned_people+' Personen · '+h(s.planned_minutes)+' geplante Stunden','BESTÄTIGTE LEISTUNGSZEIT',s.confirmed_people+' abgeschlossene Zeitbuchungen · '+h(s.confirmed_minutes)+' bestätigte Stunden',s.time_evidence,'Planzeiten sind kein Nachweis erbrachter Leistungen. Fehlende Bestätigungen bedeuten nicht, dass nicht gearbeitet wurde.','','ÜBERGABE','Gesendet: '+dt(s.handover_sent),'Übernommen: '+dt(s.handover_received),'','AUSGEWÄHLTE LEISTUNGEN UND OFFENE PUNKTE',...(s.items||[]).flatMap(i=>[kinds[i.kind]+' · '+i.title+' · '+states[i.status]+(i.critical?' · Kritisch':''),i.detail||'',i.due_at?'Frist: '+dt(i.due_at):'',i.resolution?'Ergebnis: '+i.resolution:'',''])].join('\n');
 }
 const api={kinds,states,esc,overdue,stats,validate,reportText};if(typeof module==='object'&&module.exports)module.exports=api;else root.SFHandoverCore=api;
})(typeof window==='undefined'?globalThis:window);
