from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')
s=s.replace('assets/shiftpilot-logo.png','assets/shiftpilot-logo.svg')
s=s.replace('assets/shiftpilot-logo.webp','assets/shiftpilot-logo.svg')
p.write_text(s,encoding='utf-8')
print('Logo auf SVG umgestellt')
