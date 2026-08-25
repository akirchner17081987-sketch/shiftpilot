from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')
marker='<!-- FIX_DASHBOARD_SCHEDULE_NAV -->'
if marker in s:
    print('already applied'); raise SystemExit(0)
# Replace overview buttons/links that should open the schedule with a robust helper.
s=s.replace("onclick=\"showView('schedule')\"","onclick=\"openScheduleFromDashboard()\"")
s=s.replace("onclick=\"showView(\\'schedule\\')\"","onclick=\"openScheduleFromDashboard()\"")
helper=r'''
<!-- FIX_DASHBOARD_SCHEDULE_NAV -->
<script>
function openScheduleFromDashboard(){
  const scheduleBtn=document.querySelector('#nav button[data-view="schedule"]');
  if(scheduleBtn){
    scheduleBtn.click();
  }else{
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    const scheduleView=document.getElementById('view-schedule');
    if(scheduleView)scheduleView.classList.add('active');
    document.querySelectorAll('#nav button[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='schedule'));
    if(typeof renderCalendar==='function')renderCalendar();
    if(typeof renderLibrary==='function')renderLibrary();
    if(typeof renderPlanEmployeePool==='function')renderPlanEmployeePool();
  }
  const main=document.querySelector('.main');
  if(main)main.scrollTop=0;
}
</script>
'''
s=s.replace('</body>',helper+'\n</body>',1)
p.write_text(s,encoding='utf-8')
print('Dashboard-Dienstplan-Navigation korrigiert')
