from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')

def rep(old,new):
    global s
    if old not in s:
        raise SystemExit('Patch-Stelle nicht gefunden: '+old[:120])
    s=s.replace(old,new,1)

css_old='.employee-drag.dragging{opacity:.45}'
css_new='.employee-drag.dragging{opacity:.45}.employee-drag.selected{background:#17382f;border-color:#2ed9b8;box-shadow:0 0 0 2px #2ed9b8,0 0 18px rgba(46,217,184,.18);transform:translateY(-1px);position:relative}.employee-drag.selected:after{content:"✓ AUSGEWÄHLT";position:absolute;right:8px;top:7px;color:#72f0d1;font-size:8px;font-weight:900;letter-spacing:.05em}'
if css_old in s and '.employee-drag.selected{' not in s:
    rep(css_old,css_new)

state_old="let selectedEmployeeId=employees[0]?.id||null;"
state_new="let selectedEmployeeId=employees[0]?.id||null;\nlet selectedPlanEmployeeId=null;"
if state_old in s and 'selectedPlanEmployeeId' not in s:
    rep(state_old,state_new)

old="function renderPlanEmployeePool(){const el=document.getElementById('planEmployeePool');if(!el)return;const q=(document.getElementById('planEmployeeSearch')?.value||'').toLowerCase();const list=employees.filter(e=>e.status==='active'&&(`${e.first} ${e.last} ${e.personnelNo||''} ${e.role||''}`).toLowerCase().includes(q));el.innerHTML=list.map(e=>`<div class=\"employee-drag\" draggable=\"true\" data-employee-id=\"${e.id}\"><div class=\"avatar\">${(e.first?.[0]||'')+(e.last?.[0]||'')}</div><div><b>${e.first} ${e.last}</b><small>${e.personnelNo||''} · ${e.role||e.employment||''}</small></div></div>`).join('')||'<div class=\"empty\" style=\"padding:8px\">Keine aktiven Mitarbeiter gefunden.</div>';document.querySelectorAll('.employee-drag').forEach(card=>{card.addEventListener('dragstart',e=>{card.classList.add('dragging');e.dataTransfer.setData('text/plain','employee:'+card.dataset.employeeId)});card.addEventListener('dragend',()=>card.classList.remove('dragging'))})}"
new="function renderPlanEmployeePool(){const el=document.getElementById('planEmployeePool');if(!el)return;const q=(document.getElementById('planEmployeeSearch')?.value||'').toLowerCase();const list=employees.filter(e=>e.status==='active'&&(`${e.first} ${e.last} ${e.personnelNo||''} ${e.role||''}`).toLowerCase().includes(q));el.innerHTML=list.map(e=>`<div class=\"employee-drag ${selectedPlanEmployeeId===e.id?'selected':''}\" draggable=\"true\" data-employee-id=\"${e.id}\" aria-pressed=\"${selectedPlanEmployeeId===e.id}\"><div class=\"avatar\">${(e.first?.[0]||'')+(e.last?.[0]||'')}</div><div><b>${e.first} ${e.last}</b><small>${e.personnelNo||''} · ${e.role||e.employment||''}</small></div></div>`).join('')||'<div class=\"empty\" style=\"padding:8px\">Keine aktiven Mitarbeiter gefunden.</div>';document.querySelectorAll('.employee-drag').forEach(card=>{card.addEventListener('click',()=>{selectedPlanEmployeeId=card.dataset.employeeId;renderPlanEmployeePool();const emp=employees.find(e=>e.id===selectedPlanEmployeeId);if(emp)showSaveToast('Mitarbeiter ausgewählt',`${emp.first} ${emp.last} ist aktuell ausgewählt.`)});card.addEventListener('dragstart',e=>{selectedPlanEmployeeId=card.dataset.employeeId;card.classList.add('dragging');e.dataTransfer.setData('text/plain','employee:'+card.dataset.employeeId)});card.addEventListener('dragend',()=>{card.classList.remove('dragging');renderPlanEmployeePool()})})}"
if old in s:
    rep(old,new)
elif "selectedPlanEmployeeId===e.id?'selected':''" not in s:
    raise SystemExit('renderPlanEmployeePool-Anker nicht gefunden')

p.write_text(s,encoding='utf-8')
print('Mitarbeiter-Pool Auswahlmarkierung eingebaut')
# trigger
