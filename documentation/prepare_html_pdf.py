from pathlib import Path
import re
import sys

source = Path(sys.argv[1])
target = Path(sys.argv[2])
html = source.read_text(encoding="utf-8")

print_css = r"""
		@page { size: Letter; margin: 2.15cm 2.54cm 1.85cm 2.54cm; }
		html, body { margin: 0; padding: 0; }
		body { font-family: Calibri, Arial, sans-serif; }
		div[title="header"] { position: fixed; top: -1.55cm; left: 0; right: 0; height: 0.85cm; }
		div[title="header"] p { margin: 0 !important; padding-bottom: 0.12cm !important; }
		div[title="footer"] { position: fixed; bottom: -1.25cm; left: 0; right: 0; height: 0.6cm; }
		div[title="footer"] p { margin: 0 !important; color: #5f7386; font-size: 8pt; text-align: right; }
		div[title="header"], div[title="footer"] { display: none !important; }
		table { max-width: 100%; }
		thead { display: table-header-group; }
		tr, td { break-inside: avoid; page-break-inside: avoid; }
		h1, h2, h3 { break-after: avoid-page; page-break-after: avoid; }
		img { max-width: 100%; height: auto; }
"""
html = html.replace("</style>", print_css + "\n\t</style>", 1)
html = html.replace('<body lang="en-US"', '<body lang="de-DE"', 1)
html = re.sub(
    r'<div title="footer">.*?</div>',
    '<div title="footer"><p>SchichtFunk &nbsp;·&nbsp; Stand 31.08.2026</p></div>',
    html,
    flags=re.S,
)
html = re.sub(
    r'<h2 class="western" style="page-break-after: avoid">8\.5\s+Einsatzbereitschafts-Ampel</h2>',
    '<h2 class="western" style="page-break-before: always; page-break-after: avoid">8.5 Einsatzbereitschafts-Ampel</h2>',
    html,
    count=1,
)
html = re.sub(
    r'<h2 class="western" style="page-break-after: avoid">11\.1\s+Besonders\s+differenzierende Funktionen</h2>',
    '<h2 class="western" style="page-break-before: always; page-break-after: avoid">11.1 Besonders differenzierende Funktionen</h2>',
    html,
    count=1,
)
target.write_text(html, encoding="utf-8")
print(target)
