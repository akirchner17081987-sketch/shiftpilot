from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')

def rep(old,new):
    global s
    if old not in s:
        raise SystemExit('Patch-Stelle nicht gefunden: '+old[:120])
    s=s.replace(old,new,1)

rep('.shift-chip.violet{color:#8f7dff}.dots', '.shift-chip.violet{color:#8f7dff}.shift-chip.selected{background:#17382f;box-shadow:0 0 0 2px #2ed9b8,0 0 20px rgba(46,217,184,.18);transform:translateY(-1px)}.shift-chip.selected:after{content:"✓ AUSGEWÄHLT";position:absolute;right:8px;bottom:7px;color:#72f0d1;font-size:8px;font-weight:900;letter-spacing:.05em}.shift-chip.selected small:last-child{padding-right:54px}.dots')
rep("function renderLibrary(){document.getElementById('shiftLibrary').innerHTML=TYPES.map(t=>`<button class=\"shift-chip ${t.cls}\" onclick=\"chooseType('${t.id}')\"><span class=\"dots\">⋮</span><b>${t.id}</b><small>${t.start} – ${t.end}</small><small>SOLL ${globalSoll[t.id]}</small></button>`).join('')}", "function renderLibrary(){document.getElementById('shiftLibrary').innerHTML=TYPES.map(t=>`<button class=\"shift-chip ${t.cls} ${selectedType===t.id?'selected':''}\" aria-pressed=\"${selectedType===t.id}\" onclick=\"chooseType('${t.id}')\"><span class=\"dots\">⋮</span><b>${t.id}</b><small>${t.start} – ${t.end}</small><small>SOLL ${globalSoll[t.id]}</small></button>`).join('')}")
rep("function chooseType(t){selectedType=t;showSaveToast('Schichtvorlage ausgewählt',`${t} ist für die nächste Besetzung aktiv.`)}", "function chooseType(t){selectedType=t;renderLibrary();showSaveToast('Schichtvorlage ausgewählt',`${t} ist für die nächste Besetzung aktiv.`)}")
p.write_text(s,encoding='utf-8')
print('Aktive Schicht wird jetzt deutlich markiert')
