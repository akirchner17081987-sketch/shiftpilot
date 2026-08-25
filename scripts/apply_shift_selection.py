from pathlib import Path
import re

p=Path('index.html')
s=p.read_text(encoding='utf-8')

# CSS: active shift clearly highlighted
css_anchor='.shift-chip.violet{color:#8f7dff}.dots{position:absolute;right:8px;top:6px;color:#7c8ea4}'
css_new='.shift-chip.violet{color:#8f7dff}.shift-chip.selected{outline:3px solid #f4f8ff;outline-offset:2px;box-shadow:0 0 0 5px rgba(39,214,180,.22),0 10px 28px rgba(0,0,0,.35);transform:translateY(-2px)}.shift-chip.selected:after{content:"✓ Ausgewählt";position:absolute;left:8px;top:7px;background:#f4f8ff;color:#08111f;border-radius:999px;padding:2px 7px;font-size:9px;font-weight:900;letter-spacing:.02em}.shift-chip.selected .dots{display:none}.dots{position:absolute;right:8px;top:6px;color:#7c8ea4}'
if css_anchor in s:
    s=s.replace(css_anchor,css_new,1)
elif '.shift-chip.selected{' not in s:
    raise SystemExit('CSS-Anker nicht gefunden')

old_render="function renderLibrary(){document.getElementById('shiftLibrary').innerHTML=TYPES.map(t=>`<button class=\"shift-chip ${t.cls}\" onclick=\"chooseType('${t.id}')\"><span class=\"dots\">⋮</span><b>${t.id}</b><small>${t.start} – ${t.end}</small><small>SOLL ${globalSoll[t.id]}</small></button>`).join('')}"
new_render="function renderLibrary(){document.getElementById('shiftLibrary').innerHTML=TYPES.map(t=>`<button class=\"shift-chip ${t.cls} ${selectedType===t.id?'selected':''}\" aria-pressed=\"${selectedType===t.id?'true':'false'}\" onclick=\"chooseType('${t.id}')\"><span class=\"dots\">⋮</span><b>${t.id}</b><small>${t.start} – ${t.end}</small><small>SOLL ${globalSoll[t.id]}</small></button>`).join('')}"
if old_render in s:
    s=s.replace(old_render,new_render,1)
elif "selectedType===t.id?'selected':''" not in s:
    raise SystemExit('renderLibrary-Anker nicht gefunden')

old_choose="function chooseType(t){selectedType=t;showSaveToast('Schichtvorlage ausgewählt',`${t} ist für die nächste Besetzung aktiv.`)}"
new_choose="function chooseType(t){selectedType=t;renderLibrary();showSaveToast('Schichtvorlage ausgewählt',`${t} ist für die nächste Besetzung aktiv.`)}"
if old_choose in s:
    s=s.replace(old_choose,new_choose,1)
elif 'selectedType=t;renderLibrary();showSaveToast' not in s:
    raise SystemExit('chooseType-Anker nicht gefunden')

p.write_text(s,encoding='utf-8')
print('Auswahlmarkierung der Schichtbibliothek eingebaut')
