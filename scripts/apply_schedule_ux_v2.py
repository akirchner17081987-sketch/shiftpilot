from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')

if 'SHIFTPILOT_SCHEDULE_UX_V2' in s:
    print('Schedule UX V2 already applied')
    raise SystemExit(0)

marker = '<!-- /SHIFTPILOT_QUALITY_PASS_V1 -->'
if marker not in s:
    raise SystemExit('Quality pass marker not found')

block = r'''
<!-- SHIFTPILOT_SCHEDULE_UX_V2 -->
<style id="shiftpilot-schedule-ux-v2">
#view-schedule .page-head{margin-bottom:10px;align-items:center}
#view-schedule .page-head h1{margin-top:3px}
#view-schedule .stats{margin:8px 0 10px;gap:10px}
#view-schedule .stat{min-height:78px;padding:11px 13px}
#view-schedule .stat small,#view-schedule .stat em{font-size:12px}
#view-schedule .stat strong{font-size:22px}
#view-schedule .library{padding:12px 14px;margin-top:8px}
#view-schedule .library-head{margin-bottom:8px}
#view-schedule .library-head h3{font-size:15px}
#view-schedule .library-head p{font-size:12px}
#view-schedule .shift-row{display:grid;grid-template-columns:repeat(7,minmax(118px,1fr));gap:8px;overflow:visible;padding:0}
#view-schedule .shift-chip{min-width:0;width:100%;min-height:72px;padding:9px 10px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start}
#view-schedule .shift-chip b{font-size:14px;line-height:1.15}
#view-schedule .shift-chip small{font-size:11px;line-height:1.2;margin-top:4px}
#view-schedule .shift-chip .dots{top:5px;right:7px}
#view-schedule .shift-chip.selected:after{font-size:9px;right:7px;bottom:5px}
#view-schedule .employee-pool{padding:12px 14px;margin-top:10px}
#view-schedule .employee-pool-head{margin-bottom:8px}
#view-schedule .employee-pool-head h3{font-size:15px}
#view-schedule .employee-pool-head small{font-size:12px;color:#a8bad0}
#view-schedule .employee-pool-head input{min-width:255px;min-height:38px;font-size:13px}
#view-schedule .employee-pool-list{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;max-height:210px;overflow-y:auto;overflow-x:hidden;padding:1px 5px 2px 1px;scrollbar-gutter:stable}
#view-schedule .employee-pool-list::-webkit-scrollbar{width:9px}
#view-schedule .employee-pool-list::-webkit-scrollbar-track{background:#0a1522;border-radius:99px}
#view-schedule .employee-pool-list::-webkit-scrollbar-thumb{background:#2b435c;border-radius:99px;border:2px solid #0a1522}
#view-schedule .employee-pool-list::-webkit-scrollbar-thumb:hover{background:#3a5a76}
#view-schedule .employee-drag{min-width:0;width:100%;padding:10px 11px;gap:9px;border-color:#294159;min-height:116px}
#view-schedule .employee-drag .avatar{width:30px;height:30px;flex:0 0 30px;font-size:11px}
#view-schedule .employee-drag b{font-size:13px;line-height:1.25}
#view-schedule .employee-drag small{font-size:11px;line-height:1.3;color:#a5b7cb}
#view-schedule .employee-drag .employee-pool-info>small{padding-right:0}
#view-schedule .pool-detail-label{font-size:10px;margin-top:6px;margin-bottom:4px;color:#9db1c7}
#view-schedule .pool-shifts{gap:4px}
#view-schedule .pool-shift-tag{font-size:10px;padding:2px 6px}
#view-schedule .pool-absence{font-size:10px;line-height:1.25;margin-top:6px;padding:4px 6px}
#view-schedule .employee-drag.selected:after{font-size:8px;top:6px;right:7px;padding:2px 4px;border-radius:5px;background:#10352e}
#view-schedule .calendar{margin-top:10px;border-color:#294159}
#view-schedule .cal-toolbar{min-height:48px;padding:8px 10px;position:sticky;top:0;z-index:8;background:#0f1b2b}
#view-schedule .cal-toolbar .ghost{min-height:34px;padding:6px 9px}
#view-schedule .date-label{font-size:14px}
#view-schedule .time-head,#view-schedule .day-head{font-size:12px;height:48px}
#view-schedule .day-head b{font-size:14px}
#view-schedule .time-slot{font-size:11px}
#view-schedule .assignment{font-size:12px}
#view-schedule .pill{font-size:11px}
#view-schedule .shift-chip:hover,#view-schedule .employee-drag:hover{border-color:#45d6bd;box-shadow:0 7px 20px rgba(0,0,0,.18)}
#view-schedule .employee-drag{transition:border-color .15s ease,background .15s ease,transform .15s ease,box-shadow .15s ease}
#view-schedule .employee-drag:hover{transform:translateY(-1px)}
#view-schedule .employee-drag:focus-visible,#view-schedule .shift-chip:focus-visible{outline:3px solid rgba(95,241,216,.5);outline-offset:2px}
@media(max-width:1300px){
  #view-schedule .employee-pool-list{grid-template-columns:repeat(3,minmax(0,1fr))}
  #view-schedule .shift-row{grid-template-columns:repeat(4,minmax(125px,1fr));overflow:auto;padding-bottom:3px}
}
@media(max-width:980px){
  #view-schedule .employee-pool-list{grid-template-columns:repeat(2,minmax(0,1fr));max-height:250px}
  #view-schedule .shift-row{display:flex;overflow-x:auto;scrollbar-width:thin}
  #view-schedule .shift-chip{min-width:140px;width:140px}
}
@media(max-width:620px){
  #view-schedule .employee-pool-list{grid-template-columns:1fr;max-height:280px}
  #view-schedule .employee-pool-head input{min-width:100%;width:100%}
  #view-schedule .stat{min-height:74px}
}
</style>
<!-- /SHIFTPILOT_SCHEDULE_UX_V2 -->
'''

s = s.replace(marker, marker + '\n' + block)
p.write_text(s, encoding='utf-8')
print('Schedule UX V2 applied')
