from pathlib import Path

p=Path('index.html')
s=p.read_text(encoding='utf-8')
old='onclick="openScheduleFromDashboard()">Dienstplan öffnen</button>'
new='onclick="switchView(\'plan\'); window.scrollTo({top:0,behavior:\'instant\'})">Dienstplan öffnen</button>'
s=s.replace(old,new)
old2='onclick="openScheduleFromDashboard()">▣ Dienstplan öffnen</button>'
new2='onclick="switchView(\'plan\'); window.scrollTo({top:0,behavior:\'instant\'})">▣ Dienstplan öffnen</button>'
s=s.replace(old2,new2)
p.write_text(s,encoding='utf-8')
