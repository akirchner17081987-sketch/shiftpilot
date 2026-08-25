from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')
marker='/* ===== Dark homepage dashboard preview ===== */'
if marker in s:
    print('already applied')
    raise SystemExit(0)
css=r'''
/* ===== Dark homepage dashboard preview ===== */
.preview-window{background:linear-gradient(180deg,#07131f 0%,#0a1927 100%)!important;color:#eaf5ff!important;border:1px solid #17364a}
.preview-top{background:linear-gradient(90deg,#04101a,#071827)!important;border-bottom:1px solid #17364a}
.preview-top span{color:#9fb4c8!important}
.preview-body{background:#07131f!important}
.preview-side{background:linear-gradient(180deg,#05101a,#071521)!important;border-right:1px solid #16364a!important;color:#b7c9d9!important}
.preview-side b{color:#38ded5!important}
.preview-menu span{color:#b7c9d9!important}
.preview-menu span:first-child{background:linear-gradient(90deg,#0d3c54,#0d2d43)!important;color:#51e8e0!important;box-shadow:inset 0 0 0 1px rgba(50,216,213,.28)}
.preview-main{background:radial-gradient(circle at 80% 12%,rgba(21,180,202,.08),transparent 30%),linear-gradient(180deg,#0a1825,#081522)!important;color:#eef8ff!important}
.preview-main h3{color:#f4fbff!important}
.preview-main>p{color:#8fa7bb!important}
.preview-stat{background:linear-gradient(180deg,#0c1c2b,#0a1723)!important;border:1px solid #1d3b50!important;box-shadow:0 8px 22px rgba(0,0,0,.15)}
.preview-stat strong{color:#f7fbff!important}
.preview-stat small{color:#8fa6ba!important}
.preview-card{background:linear-gradient(180deg,#0b1b29,#091622)!important;border:1px solid #1d3c50!important;color:#eef8ff!important;box-shadow:0 10px 26px rgba(0,0,0,.16)}
.preview-card h4{color:#f1f8ff!important}
.mini-line{border-bottom-color:#163448!important;color:#dceaf5!important}
.mini-badge{background:#342019!important;color:#ff9a4f!important;border:1px solid rgba(255,132,58,.18)}
.bars{border-bottom:1px solid #1d3b50;padding-bottom:1px}
.preview-shell{background:linear-gradient(145deg,#081927,#06111c)!important;border-color:#1b4a60!important;box-shadow:0 36px 90px rgba(0,0,0,.55),0 0 50px rgba(17,180,196,.08)!important}
'''
s=s.replace('</style>',css+'\n</style>',1)
p.write_text(s,encoding='utf-8')
print('Dunkle Dashboard-Vorschau ergänzt')
