from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')
old="function dayClick(ev,date){if(ev.target.closest('.assignment'))return;openAssign(selectedType,date)}"
new="function dayClick(ev,date){if(ev.target.closest('.assignment'))return;if(selectedPlanEmployeeId){assignEmployeeByDrop(selectedPlanEmployeeId,selectedType,date);return}openAssign(selectedType,date)}"
if old not in s:
    raise SystemExit('dayClick-Anker nicht gefunden')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('Direkte Zuweisung von ausgewählter Schicht + Mitarbeiter eingebaut')
