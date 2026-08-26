from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')
css='''\n.absence-table{width:100%;border-collapse:collapse}.absence-table th{color:var(--muted);font-size:11px;text-align:left;padding:10px 12px}.absence-table td{padding:14px 12px;border-top:1px solid #203248;vertical-align:middle}.absence-person{display:flex;align-items:center;gap:10px}.absence-person .avatar{width:34px;height:34px}.absence-type{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;border:1px solid #25405a;background:#102437;font-weight:800;font-size:12px}.absence-type.sick{color:#ff7a86;border-color:#6d2d39;background:#2c1720}.absence-type.vac{color:#38dfbf;border-color:#1e5c50;background:#0f2b27}.absence-status{display:inline-flex;padding:5px 9px;border-radius:7px;background:#10362f;color:#53e2c2;border:1px solid #1f5b50;font-size:11px;font-weight:800}.absence-action{border:1px solid #7c2b37;background:#341821;color:#ff8791;border-radius:8px;padding:7px 10px}.absence-summary-card{padding:18px}.absence-summary-card h3{margin:0 0 6px;display:flex;align-items:center;gap:8px}.absence-summary-card p{margin:0;color:var(--muted)}\n'''
if css.strip() not in s:s=s.replace('</style>',css+'</style>',1)
addon=r'''
function renderAbsenceDashboard(){
  const panel=document.getElementById('absencePanel'); if(!panel)return;
  const period=document.getElementById('absencePeriod')?.value||'week';
  const tf=document.getElementById('absenceTypeFilter')?.value||'';
  const wd=currentWeekDates().map(iso), month=iso(weekStart).slice(0,7);
  let list=absences.filter(a=>!tf||a.type===tf);
  if(period==='week') list=list.filter(a=>absenceDates(a).some(d=>wd.includes(d)));
  if(period==='month') list=list.filter(a=>absenceDates(a).some(d=>d.startsWith(month)));
  list.sort((a,b)=>(a.startDate||a.date).localeCompare(b.startDate||b.date));
  panel.innerHTML=list.length?`<div style="overflow:auto"><table class="absence-table"><thead><tr><th>Mitarbeiter</th><th>Art</th><th>Zeitraum</th><th>Status</th><th>Aktionen</th></tr></thead><tbody>${list.map(a=>{const e=employees.find(x=>x.id===a.employeeId),dates=absenceDates(a),start=dates[0],end=dates[dates.length-1],days=dates.length,typeCls=a.type==='Krank'?'sick':a.type==='Urlaub'?'vac':'';return `<tr><td><div class="absence-person"><div class="avatar">${(e?.first?.[0]||'')+(e?.last?.[0]||'')}</div><div><b>${e?e.first+' '+e.last:'Unbekannt'}</b><small style="display:block;color:var(--muted)">${e?.personnelNo?'Personalnummer: '+e.personnelNo:''}</small></div></div></td><td><span class="absence-type ${typeCls}">${a.type==='Krank'?'♡':a.type==='Urlaub'?'☂':'•'} ${a.type}</span></td><td><b>${new Date(start+'T00:00:00').toLocaleDateString('de-DE')}${end!==start?' – '+new Date(end+'T00:00:00').toLocaleDateString('de-DE'):''}</b><small style="display:block;color:var(--muted);margin-top:3px">${days} Tag${days===1?'':'e'}</small></td><td><span class="absence-status">${absenceStatus(a)}</span></td><td><button class="absence-action" onclick="deleteAbsenceEnhanced('${a.id}')">Entfernen</button></td></tr>`}).join('')}</tbody></table></div>`:'<div class="empty">Keine Abwesenheiten im gewählten Zeitraum.</div>';
  const cal=document.getElementById('absenceCalendar'); if(cal) cal.innerHTML=`<div class="absence-summary-card"><h3>▣ Wochenkalender</h3><p>Übersicht der Abwesenheiten in dieser Woche.</p></div>`;
  const conflicts=[]; absences.filter(a=>absenceStatus(a)!=='Abgelehnt').forEach(a=>assignments.filter(x=>x.employeeId===a.employeeId&&absenceOn(a,x.date)).forEach(x=>conflicts.push({a,x})));
  const badge=document.getElementById('absenceConflictCount'); if(badge) badge.textContent=conflicts.length;
  const conf=document.getElementById('absenceConflicts'); if(conf) conf.innerHTML=`<div class="absence-summary-card"><h3>◈ Konflikte & Auswirkungen <span class="badge">${conflicts.length}</span></h3><p>${conflicts.length?conflicts.length+' Konflikt'+(conflicts.length===1?'':'e')+' mit dem Dienstplan erkannt.':'Keine Konflikte in dieser Woche.'}</p></div>`;
}
'''
# place after all earlier definitions so this wins
idx=s.rfind('</script>')
s=s[:idx]+addon+s[idx:]
p.write_text(s,encoding='utf-8')
print('final absence renderer fixed')