from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')

old="function renderAssignments(date){return assignments.filter(a=>a.date===date).map(a=>{const t=typeById(a.type);const emp=employees.find(e=>e.id===a.employeeId);if(!t||!emp)return'';const top=timeTop(a.start||t.start),height=Math.max(40,timeHeight(a.start||t.start,a.end||t.end));return `<div class=\"assignment ass-${t.cls==='pink'?'pink':t.cls==='teal'?'teal':t.cls==='cyan'?'cyan':t.cls==='amber'?'amber':t.cls==='blue'?'blue':'violet'}\" style=\"top:${top}px;height:${height}px\" onclick=\"editAssignment('${a.id}')\"><b>${t.id} · ${emp.first} ${emp.last}</b><span>${a.start||t.start} – ${a.end||t.end}</span></div>`}).join('')}"
new="function renderAssignments(date){const dayAssignments=assignments.filter(a=>a.date===date);return dayAssignments.map(a=>{const t=typeById(a.type);const emp=employees.find(e=>e.id===a.employeeId);if(!t||!emp)return'';const same=dayAssignments.filter(x=>x.type===a.type);const idx=same.findIndex(x=>x.id===a.id);const count=Math.max(1,same.length);const gap=4;const usable=100;const width=(usable-(count-1)*gap)/count;const left=idx*(width+gap);const top=timeTop(a.start||t.start),height=Math.max(40,timeHeight(a.start||t.start,a.end||t.end));return `<div class=\"assignment ass-${t.cls==='pink'?'pink':t.cls==='teal'?'teal':t.cls==='cyan'?'cyan':t.cls==='amber'?'amber':t.cls==='blue'?'blue':'violet'}\" style=\"top:${top}px;height:${height}px;left:calc(8px + ${left}%);right:auto;width:calc(${width}% - 16px)\" onclick=\"editAssignment('${a.id}')\"><b>${t.id} · ${emp.first} ${emp.last}</b><span>${a.start||t.start} – ${a.end||t.end}</span></div>`}).join('')}"
if old not in s:
    raise SystemExit('renderAssignments-Anker nicht gefunden')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('Mehrfachbelegung nebeneinander dargestellt')
