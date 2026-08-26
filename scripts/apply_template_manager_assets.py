from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')
css='<link rel="stylesheet" href="assets/template-manager.css">'
js='<script src="assets/template-manager.js"></script>'
if css not in s:s=s.replace('</head>',css+'\n</head>')
if js not in s:s=s.replace('</body>',js+'\n</body>')
p.write_text(s,encoding='utf-8')
