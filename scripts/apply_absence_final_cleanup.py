from pathlib import Path
import re
p=Path('index.html')
s=p.read_text(encoding='utf-8')
# Ensure all legacy entry points use the new dashboard renderer
s=s.replace("if(name==='absence')renderAbsences();","if(name==='absence')renderAbsenceDashboard();")
s=s.replace("renderEmployeeAbsences();renderAbsences();renderCalendar();showSaveToast('Abwesenheit gespeichert'","renderEmployeeAbsences();renderAbsenceDashboard();renderCalendar();showSaveToast('Abwesenheit gespeichert'")
s=s.replace("saveAll();renderAbsences();renderEmployeeAbsences();renderCalendar();showSaveToast('Abwesenheit entfernt'","saveAll();renderAbsenceDashboard();renderEmployeeAbsences();renderCalendar();showSaveToast('Abwesenheit entfernt'")
s=s.replace("renderEmployeeSummary(null);renderEmployeeAbsences();renderAbsences();renderSettings();","renderEmployeeSummary(null);renderEmployeeAbsences();renderAbsenceDashboard();renderSettings();")
# Replace the old legacy renderer with a safe alias to the new renderer
s=re.sub(r"function renderAbsences\(\)\{document\.getElementById\('absencePanel'\)\.innerHTML=`<div class=\\\"table-head\\\"><h3>Aktuelle Abwesenheiten</h3>.*?\nfunction addAbsence\(\)","function renderAbsences(){renderAbsenceDashboard()}\nfunction addAbsence()",s,flags=re.S)
# Make the old addAbsence route open the modern modal instead of prompt dialogs
s=re.sub(r"function addAbsence\(\)\{const active=.*?showSaveToast\('Abwesenheit gespeichert'.*?\}\nfunction removeAbsence","function addAbsence(){openAbsenceDialog()}\nfunction removeAbsence",s,flags=re.S)
p.write_text(s,encoding='utf-8')
print('final absence cleanup applied')