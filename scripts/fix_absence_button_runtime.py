from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')
old="document.getElementById('absenceStats').innerHTML=[[todayCount,'Heute abwesend'],[weekCount,'Diese Woche'],[urlaub,'Urlaubstage'],[krank,'Kranktage']].map((x,i)=>`<div class=\"stat\"><div class=\"stat-icon\">${['◉','▦','☀','✚'][i]}</div><div><small>${x[1]}</small><strong>${x[0]}</strong><em>${period==='week'?'aktuelle Woche':'gewählter Zeitraum'}</em></div></div>`).join('');"
new="const absenceStatsEl=document.getElementById('absenceStats');if(absenceStatsEl)absenceStatsEl.innerHTML=[[todayCount,'Heute abwesend'],[weekCount,'Diese Woche'],[urlaub,'Urlaubstage'],[krank,'Kranktage']].map((x,i)=>`<div class=\"stat\"><div class=\"stat-icon\">${['◉','▦','☀','✚'][i]}</div><div><small>${x[1]}</small><strong>${x[0]}</strong><em>${period==='week'?'aktuelle Woche':'gewählter Zeitraum'}</em></div></div>`).join('');"
if old not in s:
    raise SystemExit('absenceStats renderer not found')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('absence button runtime fixed')
