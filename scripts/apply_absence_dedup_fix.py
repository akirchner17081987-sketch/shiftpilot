from pathlib import Path

p=Path('index.html')
s=p.read_text(encoding='utf-8')
marker='id="absence-final-dedup-js"'
if marker in s:
    print('absence dedup already applied')
    raise SystemExit(0)
js=r'''<script id="absence-final-dedup-js">
// Final renderer: only rows go into absencePanel; card headings remain static in the page markup.
renderAbsenceDashboard=function(){
 const panel=document.getElementById('absencePanel'); if(!panel)return;
 const period=document.getElementById('absencePeriod')?.value||'week';
 const tf=document.getElementById('absenceTypeFilter')?.value||'';
 const wd=currentWeekDates().map(iso), month=iso(weekStart).slice(0,7);
 let list=absences.filter(a=>!tf||a.type===tf);
 if(period==='week') list=list.filter(a=>absenceDates(a).some(d=>wd.includes(d)));
 if(period==='month') list=list.filter(a=>absenceDates(a).some(d=>d.startsWith(month)));
 panel.innerHTML=list.length?list.sort((a,b)=>(a.startDate||a.date).localeCompare(b.startDate||b.date)).map(a=>{
   const e=employees.find(x=>x.id===a.employeeId), dates=absenceDates(a), st=absenceStatus(a);
   const kind=a.type==='Krank'?'sick':(['Urlaub','Frei','Fortbildung','Sperrzeit','Sonderurlaub'].includes(a.type)?'':'other');
   const label=a.type==='Krank'?'♡ Krank':a.type==='Urlaub'?'☂ Urlaub':a.type;
   const range=dates.length>1?`${new Date(dates[0]+'T00:00:00').toLocaleDateString('de-DE')} - ${new Date(dates.at(-1)+'T00:00:00').toLocaleDateString('de-DE')}`:new Date(dates[0]+'T00:00:00').toLocaleDateString('de-DE');
   return `<div class="absence-row-final"><div class="absence-employee"><div class="avatar">${(e?.first?.[0]||'')+(e?.last?.[0]||'')}</div><div><b>${e?e.first+' '+e.last:'Unbekannt'}</b><small>Personalnummer: ${e?.personnelNo||'—'}</small></div></div><div><span class="absence-kind ${kind}">${label}</span></div><div class="absence-period"><b>${range}</b><small>${dates.length} ${dates.length===1?'Tag':'Tage'}</small></div><div><span class="absence-status ${st==='Beantragt'?'pending':st==='Abgelehnt'?'rejected':''}">${st}</span></div><div><button class="absence-delete" title="Entfernen" onclick="deleteAbsenceEnhanced('${a.id}')">⌫</button></div></div>`;
 }).join(''):'<div class="absence-empty">Keine Abwesenheiten im gewählten Zeitraum.</div>';
 const cal=document.getElementById('absenceCalendar');
 if(cal) cal.innerHTML=`<div class="absence-calendar-days">${wd.map((d,i)=>{const aa=absences.filter(a=>absenceOn(a,d)&&absenceStatus(a)!=='Abgelehnt');return `<div class="absence-cal-day"><b>${DAYS[i]} ${new Date(d+'T00:00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})}</b><small>${aa.length?aa.map(a=>{const e=employees.find(x=>x.id===a.employeeId);return `${e?.first||''} ${a.type}`}).join('<br>'):'Keine'}</small></div>`}).join('')}</div>`;
 const conflicts=[];
 absences.filter(a=>absenceStatus(a)!=='Abgelehnt').forEach(a=>{const e=employees.find(x=>x.id===a.employeeId);assignments.filter(x=>x.employeeId===a.employeeId&&absenceOn(a,x.date)).forEach(x=>conflicts.push({a,e,x}))});
 const cnt=document.getElementById('absenceConflictCount'); if(cnt)cnt.textContent=conflicts.length;
 const summary=document.getElementById('absenceConflictSummary'); if(summary)summary.textContent=conflicts.length?`${conflicts.length} Konflikt${conflicts.length===1?'':'e'} gefunden.`:'Keine Konflikte in dieser Woche.';
 const box=document.getElementById('absenceConflicts'); if(box)box.innerHTML=conflicts.length?conflicts.map(c=>`<div class="absence-conflict-item">⚠ ${c.e?.first||''} ${c.e?.last||''} · ${new Date(c.x.date+'T00:00:00').toLocaleDateString('de-DE')} · ${c.x.type} trotz ${c.a.type}</div>`).join(''):'';
};
// Keep the compatibility route on the final renderer too.
renderAbsences=function(){renderAbsenceDashboard()};
if(document.getElementById('view-absence')?.classList.contains('active')) renderAbsenceDashboard();
</script>'''
s=s.replace('</body>',js+'\n</body>',1)
p.write_text(s,encoding='utf-8')
print('absence duplicate rendering fixed')
