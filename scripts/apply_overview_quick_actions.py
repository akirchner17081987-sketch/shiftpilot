from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')
old = '''<div class="form-actions"><button class="primary" onclick="openScheduleFromDashboard()">▣ Dienstplan öffnen</button><button class="ghost" onclick="showView('employees');document.getElementById('addEmployeeBtn').click()">＋ Mitarbeiter anlegen</button><button class="ghost" onclick="showView('absence')">☼ Abwesenheit eintragen</button><button class="ghost" onclick="showView('auto')">✦ Auto-Planung</button></div>'''
new = '''<div class="form-actions"><button class="primary" onclick="openScheduleFromDashboard()">▣ Dienstplan öffnen</button><button class="ghost" onclick="showView('employees');setTimeout(()=>document.getElementById('addEmployeeBtn')?.click(),0)">＋ Mitarbeiter anlegen</button><button class="ghost" onclick="showView('absence');setTimeout(()=>openAbsenceDialog(),0)">☼ Abwesenheit eintragen</button><button class="ghost" onclick="showView('auto');setTimeout(()=>generateAutoPlanPreview(),0)">✦ Auto-Planung</button></div>'''
if old not in s:
    raise SystemExit('Schnellaktionen-Block nicht gefunden')
s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')
print('Schnellaktionen verknüpft')
