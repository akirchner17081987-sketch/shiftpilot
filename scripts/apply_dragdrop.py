from pathlib import Path

p=Path('index.html')
s=p.read_text(encoding='utf-8')

repls=[]
repls.append((
'.shift-row{display:flex;gap:10px;overflow:auto;padding-bottom:2px}.shift-chip',
'.shift-row{display:flex;gap:10px;overflow:auto;padding-bottom:2px}.employee-pool{padding:14px 16px;margin-top:12px}.employee-pool-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}.employee-pool-head h3{margin:0;font-size:14px}.employee-pool-head small{color:var(--muted)}.employee-pool-head input{margin-left:auto;min-width:240px;background:#0b1625;border:1px solid #24364d;color:#dce8f7;border-radius:8px;padding:8px 10px}.employee-pool-list{display:flex;gap:8px;overflow:auto;padding-bottom:2px}.employee-drag{display:flex;align-items:center;gap:8px;min-width:165px;padding:9px 10px;border:1px solid #284058;border-radius:9px;background:#101d2d;color:#dce8f7;cursor:grab;user-select:none}.employee-drag:active{cursor:grabbing}.employee-drag .avatar{width:28px;height:28px}.employee-drag b{font-size:12px}.employee-drag small{display:block;color:#8297af;font-size:10px;margin-top:2px}.employee-drag.dragging{opacity:.45}.drop-ready{outline:2px dashed #2ed9b8!important;outline-offset:-2px;background:#123127!important}.pill.drop-target{cursor:copy}.pill.drop-target:hover{border-color:#2ed9b8}.shift-chip'
))
repls.append((
'    <div class="card library"><div class="library-head"><div><h3>Schichtbibliothek</h3><p>Schicht auf einen Tag ziehen – auf Mobilgeräten erst Schicht, dann Tag antippen.</p></div><small style="color:#6f859f">☰ Drag & Drop</small></div><div class="shift-row" id="shiftLibrary"></div></div>\n    <div class="card calendar">',
'    <div class="card library"><div class="library-head"><div><h3>Schichtbibliothek</h3><p>Schicht auf einen Tag ziehen – auf Mobilgeräten erst Schicht, dann Tag antippen.</p></div><small style="color:#6f859f">☰ Drag & Drop</small></div><div class="shift-row" id="shiftLibrary"></div></div>\n    <div class="card employee-pool"><div class="employee-pool-head"><div><h3>Mitarbeiter-Pool</h3><small>Mitarbeiter auf eine SOLL/IST-Schicht ziehen, um direkt zuzuweisen.</small></div><input id="planEmployeeSearch" placeholder="Mitarbeiter filtern ..."></div><div class="employee-pool-list" id="planEmployeePool"></div></div>\n    <div class="card calendar">'
))
repls.append((
"function renderLibrary(){document.getElementById('shiftLibrary').innerHTML=TYPES.map(t=>`<div class=\"shift-chip ${t.cls}\" draggable=\"true\" data-type=\"${t.id}\"><span class=\"dots\">⋮</span><b>${t.id}</b><small>${t.start} – ${t.end} · Soll ${globalSoll[t.id]}</small></div>`).join('');document.querySelectorAll('.shift-chip').forEach(el=>el.addEventListener('dragstart',e=>e.dataTransfer.setData('text/plain',el.dataset.type)))}",
"function renderLibrary(){document.getElementById('shiftLibrary').innerHTML=TYPES.map(t=>`<div class=\"shift-chip ${t.cls}\" draggable=\"true\" data-type=\"${t.id}\"><span class=\"dots\">⋮</span><b>${t.id}</b><small>${t.start} – ${t.end} · Soll ${globalSoll[t.id]}</small></div>`).join('');document.querySelectorAll('.shift-chip').forEach(el=>el.addEventListener('dragstart',e=>e.dataTransfer.setData('text/plain','shift:'+el.dataset.type)))}\nfunction renderPlanEmployeePool(){const el=document.getElementById('planEmployeePool');if(!el)return;const q=(document.getElementById('planEmployeeSearch')?.value||'').toLowerCase();const list=employees.filter(e=>e.status==='active'&&(`${e.first} ${e.last} ${e.personnelNo||''} ${e.role||''}`).toLowerCase().includes(q));el.innerHTML=list.map(e=>`<div class=\"employee-drag\" draggable=\"true\" data-employee-id=\"${e.id}\"><div class=\"avatar\">${(e.first?.[0]||'')+(e.last?.[0]||'')}</div><div><b>${e.first} ${e.last}</b><small>${e.personnelNo||''} · ${e.role||e.employment||''}</small></div></div>`).join('')||'<div class=\"empty\" style=\"padding:8px\">Keine aktiven Mitarbeiter gefunden.</div>';document.querySelectorAll('.employee-drag').forEach(card=>{card.addEventListener('dragstart',e=>{card.classList.add('dragging');e.dataTransfer.setData('text/plain','employee:'+card.dataset.employeeId)});card.addEventListener('dragend',()=>card.classList.remove('dragging'))})}"
))
repls.append((
"document.querySelectorAll('.day-body').forEach(el=>{el.addEventListener('dragover',e=>e.preventDefault());el.addEventListener('drop',e=>{e.preventDefault();const type=e.dataTransfer.getData('text/plain');openAssign(type,el.dataset.date)})});",
"document.querySelectorAll('.day-body').forEach(el=>{el.addEventListener('dragover',e=>e.preventDefault());el.addEventListener('drop',e=>{e.preventDefault();const data=e.dataTransfer.getData('text/plain');if(data.startsWith('shift:'))openAssign(data.slice(6),el.dataset.date)})});"
))
repls.append((
"function renderSollGrid(){const dates=currentWeekDates();let html='<div class=\"soll-day\"></div>';dates.forEach(d=>{const date=iso(d);html+=`<div class=\"soll-day\"><small>SOLL / IST</small><div class=\"pillline\">${TYPES.map(t=>{const s=getSoll(date,t.id),i=assignmentsFor(date,t.id).length;return `<span class=\"pill ${i<s?'warn':'good'}\">${t.id}: ${s}/${i}</span>`}).join('')}</div></div>`});document.getElementById('sollGrid').innerHTML=html}",
"function renderSollGrid(){const dates=currentWeekDates();let html='<div class=\"soll-day\"></div>';dates.forEach(d=>{const date=iso(d);html+=`<div class=\"soll-day\"><small>SOLL / IST · Mitarbeiter hier ablegen</small><div class=\"pillline\">${TYPES.map(t=>{const s=getSoll(date,t.id),i=assignmentsFor(date,t.id).length;return `<span class=\"pill drop-target ${i<s?'warn':'good'}\" data-date=\"${date}\" data-type=\"${t.id}\">${t.id}: ${s}/${i}</span>`}).join('')}</div></div>`});document.getElementById('sollGrid').innerHTML=html;document.querySelectorAll('.pill.drop-target').forEach(p=>{p.addEventListener('dragover',e=>{e.preventDefault();p.classList.add('drop-ready')});p.addEventListener('dragleave',()=>p.classList.remove('drop-ready'));p.addEventListener('drop',e=>{e.preventDefault();p.classList.remove('drop-ready');const data=e.dataTransfer.getData('text/plain');if(data.startsWith('employee:'))assignEmployeeByDrop(data.slice(9),p.dataset.type,p.dataset.date)})})}"
))
repls.append((
'function openAssign(type,date){',
"function assignEmployeeByDrop(employeeId,type,date){const emp=employees.find(e=>e.id===employeeId);const t=typeById(type);if(!emp||!t)return;if(emp.status!=='active'){alert('Dieser Mitarbeiter ist aktuell inaktiv.');return}if(!(emp.shifts||[]).includes(type)){alert(`${emp.first} ${emp.last} ist für ${type} nicht freigegeben.`);return}if(absent(emp.id,date)){const a=absences.find(x=>x.employeeId===emp.id&&x.date===date);alert(`${emp.first} ${emp.last} ist am ${date} abwesend${a?.type?' ('+a.type+')':''}.`);return}if(assignments.some(a=>a.date===date&&a.employeeId===emp.id)){alert(`${emp.first} ${emp.last} ist an diesem Tag bereits eingeplant.`);return}assignments.push({id:'as'+Date.now(),date,type,employeeId:emp.id,start:t.start,end:t.end});saveAll();renderCalendar();renderPlanEmployeePool();showSaveToast('Schicht per Drag & Drop zugewiesen',`${emp.first} ${emp.last} wurde am ${date} für ${type} eingeplant.`)}\nfunction openAssign(type,date){"
))
repls.append(("saveAll();renderEmployees();updateStats();selectEmployee(selectedEmployeeId);showSaveToast","saveAll();renderEmployees();renderPlanEmployeePool();updateStats();selectEmployee(selectedEmployeeId);showSaveToast"))
repls.append(("saveAll();clearEmployeeForm();renderEmployees();renderCalendar();updateStats();showSaveToast","saveAll();clearEmployeeForm();renderEmployees();renderPlanEmployeePool();renderCalendar();updateStats();showSaveToast"))
repls.append(("if(name==='employees'){renderEmployees();if(selectedEmployeeId)selectEmployee(selectedEmployeeId)}","if(name==='plan'){renderPlanEmployeePool()}if(name==='employees'){renderEmployees();if(selectedEmployeeId)selectEmployee(selectedEmployeeId)}"))
repls.append(("document.getElementById('globalSearch').addEventListener","document.getElementById('planEmployeeSearch')?.addEventListener('input',renderPlanEmployeePool);\ndocument.getElementById('globalSearch').addEventListener"))
repls.append(("renderLibrary();renderCalendar();renderEmployees();","renderLibrary();renderPlanEmployeePool();renderCalendar();renderEmployees();"))

for old,new in repls:
    if old not in s:
        raise SystemExit('Patch-Stelle nicht gefunden: '+old[:80])
    s=s.replace(old,new,1)

p.write_text(s,encoding='utf-8')
print('Drag & Drop erfolgreich eingebaut')
