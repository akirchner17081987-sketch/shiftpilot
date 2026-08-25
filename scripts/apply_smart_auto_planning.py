from pathlib import Path
p=Path('index.html'); s=p.read_text(encoding='utf-8')
old='''<section id="view-auto" class="view"><div class="page-head"><div><div class="eyebrow">AUTOMATISIERUNG</div><h1>Auto-Planung</h1><p>Besetze offene Positionen automatisch anhand von Freigaben und Verfügbarkeit.</p></div><button class="primary" onclick="runAutoPlan()">Planung starten</button></div><div class="card table-card"><div class="notice">Die Auto-Planung berücksichtigt Schichtfreigaben, Aktivstatus, Abwesenheiten und Doppelbelegungen.</div></div></section>'''
new='''<section id="view-auto" class="view"><div class="page-head"><div><div class="eyebrow">AUTOMATISIERUNG</div><h1>Auto-Planung</h1><p>Offene Positionen analysieren, geeignete Mitarbeiter vorschlagen und die Planung kontrolliert übernehmen.</p></div><button class="primary" onclick="generateAutoPlanPreview()">✦ Vorschläge erstellen</button></div><div class="stats" id="autoStats"></div><div class="panel-grid" style="margin-top:14px"><div class="card table-card"><div class="table-head"><h3>Planungsregeln</h3></div><div class="section-box"><label class="check"><input type="checkbox" id="autoRespectHours" checked> Wochenstunden berücksichtigen</label><label class="check" style="margin-left:8px"><input type="checkbox" id="autoFairDistribution" checked> Auslastung fair verteilen</label><p style="color:var(--muted);font-size:12px;margin-bottom:0">Immer berücksichtigt: Aktivstatus, Schichtfreigabe, Abwesenheit und keine Doppelbelegung am selben Tag.</p></div></div><div class="card table-card"><div class="table-head"><h3>Analyse</h3></div><div id="autoAnalysis"></div></div></div><div class="card table-card" style="margin-top:14px"><div class="table-head"><h3>Besetzungsvorschläge</h3><span class="badge" id="autoSuggestionCount">0</span></div><div id="autoSuggestions"></div><div class="form-actions" style="margin-top:14px"><button class="primary" id="applyAutoPlanBtn" onclick="applyAutoPlanPreview()" disabled>Vorschläge übernehmen</button><button class="ghost" onclick="clearAutoPlanPreview()">Vorschläge verwerfen</button></div></div><div class="card table-card" style="margin-top:14px"><div class="table-head"><h3>Nicht automatisch lösbar</h3><span class="badge" id="autoUnresolvedCount">0</span></div><div id="autoUnresolved"></div></div></section>'''
if old in s: s=s.replace(old,new,1)
elif 'id="view-auto"' not in s: raise SystemExit('auto section missing')
js=r'''
let autoPlanPreview=[];
let autoPlanUnresolved=[];
function autoPlannedHours(employeeId, simulated=[]){
  const dates=currentWeekDates().map(iso);
  return [...assignments,...simulated].filter(a=>a.employeeId===employeeId&&dates.includes(a.date)).reduce((sum,a)=>{const t=typeById(a.type),st=(a.start||t?.start||'00:00').split(':').map(Number),en=(a.end||t?.end||'00:00').split(':').map(Number);let m=(en[0]*60+en[1])-(st[0]*60+st[1]);if(m<0)m+=1440;return sum+m/60},0)
}
function autoEligibleEmployees(type,date,simulated=[]){
  const respectHours=document.getElementById('autoRespectHours')?.checked!==false;
  const fair=document.getElementById('autoFairDistribution')?.checked!==false;
  const all=[...assignments,...simulated];
  return employees.filter(e=>e.status==='active'&&(e.shifts||[]).includes(type)&&!absent(e.id,date)&&!all.some(a=>a.date===date&&a.employeeId===e.id)).map(e=>{
    const h=autoPlannedHours(e.id,simulated), target=Number(e.weeklyHours)||0;
    const t=typeById(type); let dur=0;if(t){const a=t.start.split(':').map(Number),b=t.end.split(':').map(Number);let m=b[0]*60+b[1]-(a[0]*60+a[1]);if(m<0)m+=1440;dur=m/60}
    const over=respectHours&&target&&h+dur>target;
    const rolePenalty=type==='Teamleiter'&&e.role!=='Teamleiter'?100:0;
    const load=target?h/target:h/40;
    return {e,h,target,over,score:rolePenalty+(over?50:0)+(fair?load*20:h*.1)}
  }).sort((a,b)=>a.score-b.score||a.h-b.h)
}
function autoOpenSlots(){const dates=currentWeekDates().map(iso),slots=[];dates.forEach((d,di)=>TYPES.forEach(t=>{const missing=Math.max(0,getSoll(d,t.id)-assignmentsFor(d,t.id).length);for(let i=0;i<missing;i++)slots.push({date:d,day:DAYS[di],type:t.id})}));return slots}
function renderAutoPlanning(){
  const dates=currentWeekDates().map(iso), open=autoOpenSlots(), active=employees.filter(e=>e.status==='active');
  const available=active.filter(e=>!dates.every(d=>absent(e.id,d))).length;
  const stats=document.getElementById('autoStats');if(stats)stats.innerHTML=`<div class="stat"><div><small>Offene Positionen</small><strong>${open.length}</strong><em>aktuelle Woche</em></div></div><div class="stat"><div><small>Vorschläge</small><strong>${autoPlanPreview.length}</strong><em>automatisch lösbar</em></div></div><div class="stat"><div><small>Nicht lösbar</small><strong>${autoPlanUnresolved.length}</strong><em>manuell prüfen</em></div></div><div class="stat"><div><small>Verfügbare Mitarbeiter</small><strong>${available}</strong><em>aktive Profile</em></div></div>`;
  const analysis=document.getElementById('autoAnalysis');if(analysis)analysis.innerHTML=open.length?`<div class="notice">${open.length} offene Positionen erkannt. Klicke auf „Vorschläge erstellen“, um geeignete Mitarbeiter zuzuordnen.</div>`:'<div class="notice">✓ Die aktuelle Woche ist vollständig besetzt.</div>';
  const sug=document.getElementById('autoSuggestions');if(sug)sug.innerHTML=autoPlanPreview.length?autoPlanPreview.map((x,i)=>{const e=employees.find(a=>a.id===x.employeeId);return `<div class="section-box" style="margin-bottom:8px;display:grid;grid-template-columns:90px 80px 1fr auto;gap:10px;align-items:center"><b>${x.day} ${new Date(x.date+'T00:00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})}</b><span class="pool-shift-tag">${x.type}</span><div><b>${e?e.first+' '+e.last:'Mitarbeiter'}</b><small style="display:block;color:var(--muted)">${x.reason}</small></div><button class="ghost" onclick="removeAutoSuggestion(${i})">Entfernen</button></div>`}).join(''):'<div class="empty">Noch keine Vorschläge erstellt.</div>';
  const unresolved=document.getElementById('autoUnresolved');if(unresolved)unresolved.innerHTML=autoPlanUnresolved.length?autoPlanUnresolved.map(x=>`<div class="section-box" style="margin-bottom:8px;display:flex;justify-content:space-between"><div><b>${x.day} · ${x.type}</b><small style="display:block;color:var(--muted)">${new Date(x.date+'T00:00:00').toLocaleDateString('de-DE')} · kein geeigneter verfügbarer Mitarbeiter</small></div><span class="status inactive">manuell</span></div>`).join(''):'<div class="notice">✓ Keine ungelösten Positionen.</div>';
  const sc=document.getElementById('autoSuggestionCount');if(sc)sc.textContent=autoPlanPreview.length;const uc=document.getElementById('autoUnresolvedCount');if(uc)uc.textContent=autoPlanUnresolved.length;const btn=document.getElementById('applyAutoPlanBtn');if(btn)btn.disabled=!autoPlanPreview.length
}
function generateAutoPlanPreview(){
  autoPlanPreview=[];autoPlanUnresolved=[];const simulated=[];
  autoOpenSlots().forEach(slot=>{const candidates=autoEligibleEmployees(slot.type,slot.date,simulated);const best=candidates[0];if(!best){autoPlanUnresolved.push(slot);return}const t=typeById(slot.type);const item={id:'preview-'+Date.now()+'-'+Math.random(),date:slot.date,day:slot.day,type:slot.type,employeeId:best.e.id,start:t.start,end:t.end,reason:`${best.h.toFixed(1)} Std. bisher geplant${best.target?' · '+best.target+' Std. Wochen-SOLL':''}${best.over?' · würde Wochen-SOLL überschreiten':''}`};autoPlanPreview.push(item);simulated.push(item)});
  renderAutoPlanning();showSaveToast('Auto-Planung analysiert',`${autoPlanPreview.length} Vorschläge erstellt, ${autoPlanUnresolved.length} Positionen bleiben offen.`)
}
function removeAutoSuggestion(i){autoPlanPreview.splice(i,1);renderAutoPlanning()}
function clearAutoPlanPreview(){autoPlanPreview=[];autoPlanUnresolved=[];renderAutoPlanning()}
function applyAutoPlanPreview(){if(!autoPlanPreview.length)return;if(!confirm(`${autoPlanPreview.length} vorgeschlagene Besetzungen in den Dienstplan übernehmen?`))return;autoPlanPreview.forEach(x=>assignments.push({id:'as'+Date.now()+Math.random(),date:x.date,type:x.type,employeeId:x.employeeId,start:x.start,end:x.end}));const n=autoPlanPreview.length;autoPlanPreview=[];autoPlanUnresolved=[];saveAll();renderCalendar();renderAutoPlanning();showSaveToast('Auto-Planung übernommen',`${n} Besetzungen wurden in den Dienstplan eingetragen.`)}
function runAutoPlan(){generateAutoPlanPreview();if(document.getElementById('view-auto')&&!document.getElementById('view-auto').classList.contains('active'))switchView('auto')}
'''
# append before the first final closing script where possible; duplicate declarations later override old runAutoPlan
marker='function renderOverviewStats(){renderOverview()}'
if 'function generateAutoPlanPreview()' not in s:
    if marker in s:s=s.replace(marker,js+'\n'+marker,1)
    else:s=s.replace('</script>',js+'\n</script>',1)
# ensure switchView renders auto planning
old="if(name==='absence')renderAbsences();"
if old in s and "if(name==='auto')renderAutoPlanning();" not in s:s=s.replace(old,old+"if(name==='auto')renderAutoPlanning();",1)
p.write_text(s,encoding='utf-8'); print('Smarte Auto-Planung ergänzt')