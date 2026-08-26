from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')
s=s.replace("switchView('plan'); window.scrollTo({top:0,behavior:'instant'})","switchView('schedule'); window.scrollTo({top:0,behavior:'instant'})")
s=s.replace("onclick=\"switchView('plan')\">▣ Dienstplan öffnen","onclick=\"switchView('schedule')\">▣ Dienstplan öffnen")
s=s.replace("if(name==='plan'){renderPlanEmployeePool()}","if(name==='schedule'){if(typeof renderLibrary==='function')renderLibrary();if(typeof renderCalendar==='function')renderCalendar();if(typeof renderPlanEmployeePool==='function')renderPlanEmployeePool();}")
p.write_text(s,encoding='utf-8')
