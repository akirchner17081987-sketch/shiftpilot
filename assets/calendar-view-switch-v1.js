// SchichtFunk – Wochen-/Monatsansicht V1
(function(){
  if(window.__sfCalendarViewSwitchV1)return;window.__sfCalendarViewSwitchV1=true;

  const MODE_KEY='sf_schedule_view_mode_v1';
  let mode=sessionStorage.getItem(MODE_KEY)==='month'?'month':'week';
  let monthCursor=null;
  let baseRenderCalendar=null;
  let bound=false;

  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const localISO=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const startOfMonth=d=>new Date(d.getFullYear(),d.getMonth(),1);
  const endOfMonth=d=>new Date(d.getFullYear(),d.getMonth()+1,0);
  const addMonths=(d,n)=>new Date(d.getFullYear(),d.getMonth()+n,1);
  const mondayOf=d=>{const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());const day=x.getDay()||7;x.setDate(x.getDate()-day+1);return x};
  const dateFromWeekStart=()=>{try{return typeof weekStart!=='undefined'&&weekStart instanceof Date?new Date(weekStart):new Date()}catch{return new Date()}};

  function ensureCss(){
    if(document.getElementById('sfCalendarViewCss'))return;
    const s=document.createElement('style');s.id='sfCalendarViewCss';s.textContent=`
      .sf-month-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));background:#0c1725}
      .sf-month-weekday{padding:10px 8px;border-right:1px solid #203248;border-bottom:1px solid #203248;text-align:center;color:#8ca0b8;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;background:#0d1928}
      .sf-month-day{min-height:145px;border-right:1px solid #203248;border-bottom:1px solid #203248;padding:8px;background:#0c1725;position:relative;overflow:hidden}
      .sf-month-day.other{opacity:.38;background:#09131f}.sf-month-day.today{background:rgba(39,214,180,.08)}
      .sf-month-day.drop-ready{outline:2px dashed #2ed9b8;outline-offset:-3px;background:#123127}
      .sf-month-day-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;gap:6px}.sf-month-day-head b{font-size:12px}.sf-month-day.today .sf-month-day-head b{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--teal);color:#063027}
      .sf-month-day-head small{color:#7890aa;font-size:9px}.sf-month-items{display:flex;flex-direction:column;gap:4px}
      .sf-month-item{border:1px solid #2b435a;background:#102033;border-radius:6px;padding:4px 6px;font-size:9px;color:#c9d8e7;text-align:left;width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .sf-month-item b{color:#fff}.sf-month-item.blue{border-color:#355c9c}.sf-month-item.cyan{border-color:#287b81}.sf-month-item.amber{border-color:#7a5924}.sf-month-item.pink{border-color:#7a3650}.sf-month-item.teal{border-color:#23705d}.sf-month-item.violet{border-color:#59468f}
      .sf-month-more{font-size:9px;color:#8da3ba;margin-top:4px}.sf-month-open{font-size:9px;color:#ffd08a;margin-top:5px}.sf-month-ok{font-size:9px;color:#76e4c7;margin-top:5px}
      .sf-month-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:7px;padding:10px;background:#0c1725;border-top:1px solid #203248}
      .sf-month-summary .pill{display:flex;justify-content:space-between;gap:8px;border-radius:8px;padding:7px 8px}
      @media(max-width:900px){.sf-month-day{min-height:120px;padding:5px}.sf-month-item{font-size:8px;padding:3px 4px}.sf-month-weekday{font-size:9px;padding:8px 4px}}
    `;document.head.appendChild(s);
  }

  function toolbarButtons(){
    const seg=document.querySelector('#view-schedule .cal-toolbar .seg');
    if(!seg)return null;
    const buttons=[...seg.querySelectorAll('button')];
    if(buttons[0]){buttons[0].dataset.calendarMode='week';buttons[0].setAttribute('aria-pressed',String(mode==='week'))}
    if(buttons[1]){buttons[1].dataset.calendarMode='month';buttons[1].setAttribute('aria-pressed',String(mode==='month'))}
    return buttons;
  }

  function syncControls(){
    const buttons=toolbarButtons()||[];
    buttons.forEach(b=>{const active=b.dataset.calendarMode===mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
    const title=document.querySelector('#view-schedule .page-head h1');if(title)title.textContent=mode==='month'?'Monatsplanung':'Wochenplanung';
    const p=document.querySelector('#view-schedule .page-head p');if(p)p.textContent=mode==='month'?'Schichten im Monatsüberblick planen, Mitarbeiter zuweisen und Besetzung kontrollieren.':'Schichten planen, Mitarbeiter zuweisen und Besetzung kontrollieren.';
    const stats=document.querySelectorAll('#view-schedule .stats .stat em');
    if(stats[0])stats[0].textContent=mode==='month'?'im Monat':'diese Woche';
    if(stats[2])stats[2].textContent=mode==='month'?'im Monat zu besetzen':'Mitarbeiter zuweisen';
  }

  function monthDates(cursor){
    const first=startOfMonth(cursor),last=endOfMonth(cursor);const out=[];
    for(let d=new Date(first);d<=last;d.setDate(d.getDate()+1))out.push(localISO(d));
    return out;
  }

  function updateMonthStats(cursor){
    try{
      const dates=monthDates(cursor),monthA=assignments.filter(a=>dates.includes(a.date));
      const planned=new Set(monthA.map(a=>a.date+'|'+a.type)).size;
      const emps=new Set(monthA.map(a=>a.employeeId)).size;
      const open=dates.reduce((sum,d)=>sum+TYPES.reduce((s,t)=>s+Math.max(0,Number(getSoll(d,t.id)||0)-assignments.filter(a=>a.date===d&&a.type===t.id).length),0),0);
      const total=dates.reduce((sum,d)=>sum+TYPES.reduce((s,t)=>s+Number(getSoll(d,t.id)||0),0),0);const filled=total-open;
      const el=id=>document.getElementById(id);if(el('statShifts'))el('statShifts').textContent=planned;if(el('statEmployees'))el('statEmployees').textContent=emps;if(el('statOpen'))el('statOpen').textContent=open;if(el('statCoverage'))el('statCoverage').textContent=total?Math.round(filled/total*100)+'%':'100%';
      const av=el('availableTxt');if(av)av.textContent=`von ${employees.filter(e=>e.status==='active').length} verfügbar`;
    }catch{}
  }

  function assignmentClass(a){try{const t=typeById(a.type);return t?.cls||'violet'}catch{return'violet'}}
  function employeeName(id){try{const e=employees.find(x=>x.id===id);return e?`${e.first} ${e.last}`:'Mitarbeiter'}catch{return'Mitarbeiter'}}

  function renderMonth(){
    const grid=document.getElementById('calendarGrid'),soll=document.getElementById('sollList'),label=document.getElementById('weekLabel');if(!grid||!soll)return;
    if(!monthCursor)monthCursor=startOfMonth(dateFromWeekStart());
    const first=startOfMonth(monthCursor),last=endOfMonth(monthCursor),gridStart=mondayOf(first),gridEnd=new Date(mondayOf(last));gridEnd.setDate(gridEnd.getDate()+6);
    const today=localISO(new Date()),currentMonth=first.getMonth(),days=[];for(let d=new Date(gridStart);d<=gridEnd;d.setDate(d.getDate()+1))days.push(new Date(d));
    grid.className='sf-month-grid';soll.className='sf-month-summary';if(label)label.textContent=first.toLocaleDateString('de-DE',{month:'long',year:'numeric'});
    let html=['Mo','Di','Mi','Do','Fr','Sa','So'].map(x=>`<div class="sf-month-weekday">${x}</div>`).join('');
    for(const d of days){
      const date=localISO(d),inMonth=d.getMonth()===currentMonth,dayA=assignments.filter(a=>a.date===date),open=TYPES.reduce((n,t)=>n+Math.max(0,Number(getSoll(date,t.id)||0)-dayA.filter(a=>a.type===t.id).length),0);const visible=dayA.slice(0,4);
      html+=`<div class="sf-month-day ${inMonth?'':'other'} ${date===today?'today':''}" data-month-date="${date}"><div class="sf-month-day-head"><b>${d.getDate()}</b><small>${dayA.length} Schicht${dayA.length===1?'':'en'}</small></div><div class="sf-month-items">${visible.map(a=>`<button type="button" class="sf-month-item ${assignmentClass(a)}" data-assignment-id="${esc(a.id)}" title="${esc(a.type+' · '+employeeName(a.employeeId))}"><b>${esc(a.type)}</b> · ${esc(employeeName(a.employeeId))}</button>`).join('')}</div>${dayA.length>4?`<div class="sf-month-more">+ ${dayA.length-4} weitere</div>`:''}${open?`<div class="sf-month-open">${open} Position${open===1?'':'en'} offen</div>`:`<div class="sf-month-ok">✓ SOLL erfüllt</div>`}</div>`;
    }
    grid.innerHTML=html;
    grid.querySelectorAll('[data-assignment-id]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();if(typeof editAssignment==='function')editAssignment(b.dataset.assignmentId)}));
    grid.querySelectorAll('[data-month-date]').forEach(cell=>{
      cell.addEventListener('click',e=>{if(e.target.closest('[data-assignment-id]'))return;const date=cell.dataset.monthDate;try{if(typeof selectedPlanEmployeeId!=='undefined'&&selectedPlanEmployeeId){assignEmployeeByDrop(selectedPlanEmployeeId,selectedType,date);return}}catch{}if(typeof openAssign==='function')openAssign(selectedType,date)});
      cell.addEventListener('dragover',e=>{e.preventDefault();cell.classList.add('drop-ready')});cell.addEventListener('dragleave',()=>cell.classList.remove('drop-ready'));cell.addEventListener('drop',e=>{e.preventDefault();cell.classList.remove('drop-ready');const raw=e.dataTransfer.getData('text/plain');if(raw.startsWith('employee:'))assignEmployeeByDrop(raw.slice(9),selectedType,cell.dataset.monthDate)});
    });
    const dates=monthDates(first);soll.innerHTML=TYPES.map(t=>{const so=dates.reduce((n,d)=>n+Number(getSoll(d,t.id)||0),0),is=assignments.filter(a=>dates.includes(a.date)&&a.type===t.id).length;return `<span class="pill ${is>=so?'good':'warn'}"><b>${esc(t.id)}</b><span>SOLL ${so} · IST ${is}</span></span>`}).join('');
    updateMonthStats(first);syncControls();
  }

  function restoreWeekContainers(){const grid=document.getElementById('calendarGrid'),soll=document.getElementById('sollList');if(grid)grid.className='cal-grid';if(soll)soll.className='sollist'}

  function renderCurrent(){
    if(mode==='month'){renderMonth();return}
    restoreWeekContainers();if(typeof baseRenderCalendar==='function')baseRenderCalendar();syncControls();
  }

  function setMode(next){
    mode=next==='month'?'month':'week';sessionStorage.setItem(MODE_KEY,mode);
    if(mode==='month'&&!monthCursor)monthCursor=startOfMonth(dateFromWeekStart());
    renderCurrent();
  }

  function setMonth(value){
    const match=String(value||'').match(/^(\d{4})-(0[1-9]|1[0-2])$/);if(!match)return false;
    monthCursor=new Date(Number(match[1]),Number(match[2])-1,1);
    try{weekStart=mondayOf(monthCursor)}catch{}
    setMode('month');
    if(typeof renderSettings==='function')renderSettings();
    return true;
  }

  function bind(){
    if(bound)return true;
    const buttons=toolbarButtons(),prev=document.getElementById('prevWeek'),next=document.getElementById('nextWeek'),today=document.getElementById('todayBtn');if(!buttons||buttons.length<2||!prev||!next||!today||typeof window.renderCalendar!=='function')return false;
    baseRenderCalendar=window.renderCalendar;window.renderCalendar=renderCurrent;
    buttons[0].onclick=()=>setMode('week');buttons[1].onclick=()=>setMode('month');
    const weekPrev=prev.onclick,weekNext=next.onclick,weekToday=today.onclick;
    prev.onclick=()=>{if(mode==='month'){monthCursor=addMonths(monthCursor||startOfMonth(dateFromWeekStart()),-1);try{weekStart=mondayOf(monthCursor)}catch{}renderCurrent();if(typeof renderSettings==='function')renderSettings();return}if(typeof weekPrev==='function')weekPrev()};
    next.onclick=()=>{if(mode==='month'){monthCursor=addMonths(monthCursor||startOfMonth(dateFromWeekStart()),1);try{weekStart=mondayOf(monthCursor)}catch{}renderCurrent();if(typeof renderSettings==='function')renderSettings();return}if(typeof weekNext==='function')weekNext()};
    today.onclick=()=>{if(mode==='month'){monthCursor=startOfMonth(new Date());try{weekStart=mondayOf(new Date())}catch{}renderCurrent();if(typeof renderSettings==='function')renderSettings();return}if(typeof weekToday==='function')weekToday()};
    bound=true;ensureCss();renderCurrent();return true;
  }

  function boot(){ensureCss();if(!bind())setTimeout(boot,120)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.SchichtFunkCalendarView={getMode:()=>mode,setMode,setMonth};
})();
