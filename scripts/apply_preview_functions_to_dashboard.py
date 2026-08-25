from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')
marker='<!-- REAL_DASHBOARD_PREVIEW_FUNCTIONS -->'
if marker in s:
    print('already applied'); raise SystemExit(0)
addon=r'''
<!-- REAL_DASHBOARD_PREVIEW_FUNCTIONS -->
<style>
#view-overview .preview-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:14px 0}
#view-overview .preview-kpi{background:#0b1a29;border:1px solid #1f4054;border-radius:12px;padding:16px;cursor:pointer;transition:.18s ease}
#view-overview .preview-kpi:hover{transform:translateY(-2px);border-color:#2ed9d0;box-shadow:0 10px 26px rgba(0,0,0,.2)}
#view-overview .preview-kpi strong{display:block;font-size:26px;color:#f4f8ff}
#view-overview .preview-kpi small{display:block;color:#839ab0;margin-top:5px}
#view-overview .preview-main-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:14px;margin-top:14px}
#view-overview .preview-panel{background:#0b1a29;border:1px solid #1f4054;border-radius:13px;padding:16px}
#view-overview .preview-panel h3{margin:0 0 14px;font-size:15px}
#view-overview .preview-issue{display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid #17364a;cursor:pointer}
#view-overview .preview-issue:last-child{border-bottom:0}
#view-overview .preview-issue:hover b{color:#36ddd0}
#view-overview .preview-open{background:#3a2415;color:#ffad63;border:1px solid #75401a;border-radius:999px;padding:4px 8px;font-size:10px}
#view-overview .preview-bars{height:190px;display:flex;align-items:flex-end;gap:11px;padding:12px 8px 24px;border-bottom:1px solid #17364a}
#view-overview .preview-bar-wrap{flex:1;min-width:28px;text-align:center;height:100%;display:flex;flex-direction:column;justify-content:flex-end}
#view-overview .preview-bar{width:100%;min-height:4px;border-radius:5px 5px 0 0;background:linear-gradient(180deg,#26d6ca,#2686f2)}
#view-overview .preview-bar-wrap:nth-child(2) .preview-bar{background:linear-gradient(180deg,#36d98a,#1ba56c)}
#view-overview .preview-bar-wrap:nth-child(3) .preview-bar{background:linear-gradient(180deg,#ffc34b,#f59b18)}
#view-overview .preview-bar-wrap:nth-child(4) .preview-bar{background:linear-gradient(180deg,#a76bf2,#7641c9)}
#view-overview .preview-bar-wrap:nth-child(5) .preview-bar{background:linear-gradient(180deg,#33cfda,#1b9cab)}
#view-overview .preview-bar-wrap:nth-child(6) .preview-bar{background:linear-gradient(180deg,#ff6e9d,#e44979)}
#view-overview .preview-bar-wrap:nth-child(7) .preview-bar{background:linear-gradient(180deg,#6d8cff,#465ed1)}
#view-overview .preview-bar-label{font-size:9px;color:#8298ae;margin-top:7px}
#view-overview .preview-link{margin-top:12px;color:#2ed9d0;font-size:12px;cursor:pointer;display:inline-block}
#view-overview .warning-detail{color:#ffbd72}
@media(max-width:900px){#view-overview .preview-kpis{grid-template-columns:repeat(2,1fr)}#view-overview .preview-main-grid{grid-template-columns:1fr}}
</style>
<script>
function previewDashboardWarnings(dates){
  const warnings=[];
  const weekAssign=assignments.filter(a=>dates.includes(a.date));
  weekAssign.forEach(a=>{
    const e=employees.find(x=>x.id===a.employeeId);
    if(absences.some(x=>x.employeeId===a.employeeId&&x.date===a.date)) warnings.push(`${e?e.first+' '+e.last:'Mitarbeiter'} trotz Abwesenheit eingeplant`);
  });
  const dayMap={};
  weekAssign.forEach(a=>{const k=a.employeeId+'|'+a.date;(dayMap[k]||(dayMap[k]=[])).push(a)});
  Object.values(dayMap).forEach(arr=>{if(arr.length>1){const e=employees.find(x=>x.id===arr[0].employeeId);warnings.push(`${e?e.first+' '+e.last:'Mitarbeiter'} mehrfach an einem Tag eingeplant`)}});
  employees.filter(e=>e.status==='active').forEach(e=>{const h=plannedHoursForEmployee(e.id), target=Number(e.weeklyHours)||0;if(target&&h>target)warnings.push(`${e.first} ${e.last}: ${h.toFixed(1)} Std. bei ${target} Std. Wochen-SOLL`)});
  return [...new Set(warnings)];
}
function renderOverview(){
  const ds=currentWeekDates(), dates=ds.map(iso), active=employees.filter(e=>e.status==='active');
  const total=dates.reduce((sum,d)=>sum+TYPES.reduce((x,t)=>x+getSoll(d,t.id),0),0);
  const filled=dates.reduce((sum,d)=>sum+TYPES.reduce((x,t)=>x+Math.min(getSoll(d,t.id),assignmentsFor(d,t.id).length),0),0);
  const open=Math.max(0,total-filled), coverage=total?Math.round(filled/total*100):100;
  const warnings=previewDashboardWarnings(dates);
  const stats=document.getElementById('overviewStats');
  if(stats){stats.className='preview-kpis';stats.innerHTML=`
    <div class="preview-kpi" onclick="showView('employees')"><strong>${active.length}</strong><small>Aktive Mitarbeiter</small></div>
    <div class="preview-kpi" onclick="showView('schedule')"><strong>${coverage}%</strong><small>Planungsfortschritt</small></div>
    <div class="preview-kpi" onclick="showView('schedule')"><strong>${open}</strong><small>Offene Positionen</small></div>
    <div class="preview-kpi" onclick="showView('schedule')"><strong>${warnings.length}</strong><small>Warnungen</small></div>`}
  let issues=[];
  dates.forEach((d,di)=>TYPES.forEach(t=>{const so=getSoll(d,t.id),is=assignmentsFor(d,t.id).length;if(is<so)issues.push({d,di,type:t.id,so,is,missing:so-is})}));
  issues.sort((a,b)=>b.missing-a.missing||a.d.localeCompare(b.d));
  const issueBox=document.getElementById('overviewIssues');
  if(issueBox){issueBox.innerHTML=issues.length?issues.slice(0,8).map(x=>`<div class="preview-issue" onclick="showView('schedule')"><div><b>${DAYS[x.di]} · ${x.type}</b><small style="display:block;color:#7890aa;margin-top:3px">SOLL ${x.so} · IST ${x.is}</small></div><span class="preview-open">${x.missing} offen</span></div>`).join(''):'<div class="notice">✓ Keine Unterbesetzung in dieser Woche.</div>'}
  const issueCount=document.getElementById('overviewIssueCount');if(issueCount)issueCount.textContent=issues.length;
  const weekA=assignments.filter(a=>dates.includes(a.date));
  const mix=TYPES.map(t=>({id:t.id,n:weekA.filter(a=>a.type===t.id).length}));
  const max=Math.max(1,...mix.map(x=>x.n));
  const mixBox=document.getElementById('overviewShiftMix');
  if(mixBox){mixBox.innerHTML=`<div class="preview-bars">${mix.map(x=>`<div class="preview-bar-wrap" title="${x.id}: ${x.n} Zuweisungen"><div class="preview-bar" style="height:${Math.max(5,Math.round(x.n/max*100))}%"></div><div class="preview-bar-label">${x.id}<br>${x.n}</div></div>`).join('')}</div><span class="preview-link" onclick="showView('schedule')">Zur Schichtplanung →</span>`}
  const absBox=document.getElementById('overviewAbsences');
  if(absBox){const weekAbs=absences.filter(a=>dates.includes(a.date));absBox.innerHTML=weekAbs.length?weekAbs.map(a=>{const e=employees.find(x=>x.id===a.employeeId);return `<div class="section-box" style="margin-bottom:7px"><b>${e?e.first+' '+e.last:'Mitarbeiter'}</b><small style="display:block;color:#7890aa">${a.type} · ${new Date(a.date+'T00:00:00').toLocaleDateString('de-DE')}</small></div>`}).join(''):'<div class="notice">✓ Keine Abwesenheiten in dieser Woche.</div>'}
  const workBox=document.getElementById('overviewWorkload');
  if(workBox){const workload=active.map(e=>({e,h:plannedHoursForEmployee(e.id),target:Number(e.weeklyHours)||0})).sort((a,b)=>b.h-a.h);workBox.innerHTML=workload.slice(0,8).map(x=>`<div class="section-box" style="margin-bottom:7px;display:flex;justify-content:space-between"><b>${x.e.first} ${x.e.last}</b><span class="${x.target&&x.h>x.target?'warning-detail':''}">${x.h.toFixed(1)} / ${x.target} Std.</span></div>`).join('')}
  const page=document.getElementById('view-overview');
  if(page){const firstGrid=page.querySelector('.overview-grid');if(firstGrid)firstGrid.classList.add('preview-main-grid');}
}
</script>
'''
# inject before body close
s=s.replace('</body>',addon+'\n</body>',1)
p.write_text(s,encoding='utf-8')
print('Echte Dashboard-Funktionen aus Vorschau übernommen')
