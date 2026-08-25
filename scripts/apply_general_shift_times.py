from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')
old='<section id="view-settings" class="view"><div class="page-head"><div><div class="eyebrow">EINSTELLUNGEN</div><h1>SOLL-Besetzung</h1><p>Globale Besetzungsstärken festlegen oder einzelne Tage überschreiben.</p></div></div><div class="panel-grid"><div class="card form-card"><h3>Globale SOLL-Stärke</h3><div class="form" id="sollForm"></div></div><div class="card form-card"><h3>Individuell je Tag</h3><div class="form" id="dailySollForm"></div></div></div></section>'
new='<section id="view-settings" class="view"><div class="page-head"><div><div class="eyebrow">EINSTELLUNGEN</div><h1>Schichten & SOLL-Besetzung</h1><p>Übliche Schichtzeiten allgemein festlegen und bei Bedarf einzelne Tage überschreiben.</p></div></div><div class="card form-card" style="margin-bottom:14px"><h3>Allgemein · übliche Schichtzeiten</h3><p style="color:var(--muted);margin-top:-4px">Diese Zeiten gelten standardmäßig für neue Einplanungen. Individuelle Änderungen einer bereits eingetragenen Schicht bleiben möglich.</p><div class="form" id="generalShiftTimeForm"></div></div><div class="panel-grid"><div class="card form-card"><h3>Globale SOLL-Stärke</h3><div class="form" id="sollForm"></div></div><div class="card form-card"><h3>Individuell je Tag</h3><div class="form" id="dailySollForm"></div></div></div></section>'
if old not in s: raise SystemExit('settings section not found')
s=s.replace(old,new,1)
old2="function renderSettings(){document.getElementById('sollForm').innerHTML=TYPES.map(t=>`<label>${t.id}<input type=\"number\" min=\"0\" value=\"${globalSoll[t.id]}\" data-soll=\"${t.id}\"></label>`).join('')+`<div class=\"form-actions\"><button class=\"primary\" onclick=\"saveSoll()\">Globale Werte speichern</button></div>`;"
new2="function renderSettings(){document.getElementById('generalShiftTimeForm').innerHTML=TYPES.map(t=>`<div class=\"section-box full\" style=\"display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;align-items:end\"><div><b>${t.id}</b><small style=\"display:block;color:var(--muted);margin-top:3px\">Standardzeit</small></div><label>Beginn<input type=\"time\" value=\"${t.start}\" data-shift-start=\"${t.id}\"></label><label>Ende<input type=\"time\" value=\"${t.end}\" data-shift-end=\"${t.id}\"></label></div>`).join('')+`<div class=\"form-actions\"><button class=\"primary\" onclick=\"saveGeneralShiftTimes()\">Allgemeine Zeiten speichern</button></div>`;document.getElementById('sollForm').innerHTML=TYPES.map(t=>`<label>${t.id}<input type=\"number\" min=\"0\" value=\"${globalSoll[t.id]}\" data-soll=\"${t.id}\"></label>`).join('')+`<div class=\"form-actions\"><button class=\"primary\" onclick=\"saveSoll()\">Globale Werte speichern</button></div>`;"
if old2 not in s: raise SystemExit('renderSettings anchor not found')
s=s.replace(old2,new2,1)
anchor="function saveSoll(){"
fn="function saveGeneralShiftTimes(){TYPES.forEach(t=>{const st=document.querySelector(`[data-shift-start=\"${t.id}\"]`),en=document.querySelector(`[data-shift-end=\"${t.id}\"]`);if(st?.value)t.start=st.value;if(en?.value)t.end=en.value});store.set('shiftTimes',Object.fromEntries(TYPES.map(t=>[t.id,{start:t.start,end:t.end}])));renderLibrary();renderCalendar();showSaveToast('Allgemeine Schichtzeiten gespeichert','Die üblichen Beginn- und Endzeiten gelten ab jetzt für neue Einplanungen.')}\n"
if anchor not in s: raise SystemExit('saveSoll anchor not found')
s=s.replace(anchor,fn+anchor,1)
anchor2="let globalSoll=store.get('globalSoll'"
insert="const savedShiftTimes=store.get('shiftTimes',{});TYPES.forEach(t=>{if(savedShiftTimes[t.id]){t.start=savedShiftTimes[t.id].start||t.start;t.end=savedShiftTimes[t.id].end||t.end}});\n"
pos=s.find(anchor2)
if pos<0: raise SystemExit('globalSoll anchor not found')
s=s[:pos]+insert+s[pos:]
p.write_text(s,encoding='utf-8')
print('Allgemeine Schichtzeiten ergänzt')
