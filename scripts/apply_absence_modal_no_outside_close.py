from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')
old = '<div class="abs-modal-backdrop" id="absenceModal" onclick="if(event.target===this)this.remove()">'
new = '<div class="abs-modal-backdrop" id="absenceModal">'
if old not in s:
    raise SystemExit('absence modal backdrop handler not found')
s = s.replace(old, new)
p.write_text(s, encoding='utf-8')
print('absence modal outside-click close disabled')
