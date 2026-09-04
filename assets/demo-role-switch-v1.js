// SchichtFunk – Demo-Perspektivwechsel Manager / Mitarbeiter V1
(function(){
  if(window.__sfDemoRoleSwitchV1)return;
  if(sessionStorage.getItem('sf_demo_session_v1')!=='active')return;
  window.__sfDemoRoleSwitchV1=true;

  const B=window.SFBackend=window.SFBackend||{};
  const KEY='sf_demo_perspective_v1';
  const EMPLOYEE_NO='D001';
  let managerView='overview';
  let switching=false;

  const pad=n=>String(n).padStart(2,'0');
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function css(){
    if(document.getElementById('sfDemoRoleSwitchCss'))return;
    const style=document.createElement('style');style.id='sfDemoRoleSwitchCss';style.textContent=`
      .sf-demo-perspective{display:inline-flex;align-items:center;gap:4px;padding:4px;border:1px solid #31516a;border-radius:11px;background:#081724;box-shadow:0 8px 24px rgba(0,0,0,.2)}
      .sf-demo-perspective-label{padding:0 7px;color:#7892a8;font:900 9px/1 Inter,system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase}
      .sf-demo-perspective button{min-height:34px!important;padding:0 11px!important;border:0!important;border-radius:8px!important;background:transparent!important;color:#91a9bc!important;font:800 11px/1 Inter,system-ui,sans-serif!important;cursor:pointer}
      .sf-demo-perspective button[aria-pressed="true"]{background:#163d37!important;color:#8cebd5!important;box-shadow:inset 0 0 0 1px #2d7869}
      .sf-demo-employee-context{color:#8da6b9;font:700 10px/1.3 Inter,system-ui,sans-serif;white-space:nowrap}.sf-demo-employee-context b{color:#dcebf5}
      #sfEmployeePortal .sf-demo-perspective{margin-left:auto}#sfEmployeePortal .sf-portal-top>.spacer{display:none}#sfEmployeePortal #sfEmployeeLogout{display:none!important}
      #sfDemoEmployeeExit{min-height:40px;padding:0 13px;border:1px solid #36556c;border-radius:9px;background:#0a1928;color:#b9cddd;font:800 11px Inter,system-ui,sans-serif;cursor:pointer}
      @media(max-width:850px){.sf-demo-perspective-label,.sf-demo-employee-context{display:none}.sf-demo-perspective button{padding:0 9px!important}}
      @media(max-width:560px){.sf-demo-perspective{position:fixed;z-index:19050;left:10px;right:10px;bottom:12px;justify-content:center}.sf-demo-perspective button{flex:1}#sfDemoEmployeeExit{padding:0 9px}}
    `;document.head.appendChild(style);
  }

  function localStamp(assignment,end=false){
    const date=String(assignment.date||'').slice(0,10),time=String(end?assignment.end:assignment.start||'00:00').slice(0,5);
    const start=String(assignment.start||'00:00'),finish=String(assignment.end||'00:00');
    const d=new Date(`${date}T${time}:00`);
    if(end&&finish<=start)d.setDate(d.getDate()+1);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00+02:00`;
  }

  function demoEmployee(){
    try{return employees.find(e=>e.personnelNo===EMPLOYEE_NO)||employees.find(e=>e.status==='active')||employees[0]}catch{return null}
  }

  function portalData(){
    const employee=demoEmployee();if(!employee)return null;
    let allAssignments=[],allAbsences=[],entries={};
    try{allAssignments=assignments;allAbsences=absences;entries=timeEntries||{}}catch{}
    const shifts=allAssignments.filter(a=>String(a.employeeId)===String(employee.id)).map(a=>({
      id:a.id,employee_id:employee.id,shift_code:a.type||'Schicht',starts_at:localStamp(a),ends_at:localStamp(a,true),break_minutes:Number(a.pause||30),status:'PUBLISHED',published_at:a.publishedAt||'2026-07-27T08:00:00.000Z'
    }));
    const ownAbsences=allAbsences.filter(a=>String(a.employeeId)===String(employee.id)).map(a=>({id:a.id,employee_id:employee.id,absence_type:a.type||'Abwesenheit',start_date:a.startDate||a.date,end_date:a.endDate||a.startDate||a.date,status:a.status||'Genehmigt',full_day:a.fullDay!==false,note:a.note||''}));
    const ownEntries=shifts.map(shift=>{const source=entries[shift.id];if(!source)return null;const assignment=allAssignments.find(a=>String(a.id)===String(shift.id));return {assignment_id:shift.id,actual_start:localStamp({...assignment,start:source.actualStart||assignment.start}),actual_end:localStamp({...assignment,end:source.actualEnd||assignment.end},true),break_minutes:Number(source.breakMin||assignment.pause||30),status:source.status||'confirmed'}}).filter(Boolean);
    return {
      employee:{id:employee.id,first_name:employee.first,last_name:employee.last,personnel_no:employee.personnelNo,employment:employee.employment,weekly_hours:Number(employee.weeklyHours||0),email:employee.email,phone:employee.phone||'',work_time_model:'Fester Schichtrhythmus',shift_permissions:employee.shifts||[],status:'active'},
      company:{id:'demo-local-company',name:'SchichtFunk Demo GmbH',timezone:'Europe/Berlin'},
      shifts,absences:ownAbsences,requests:[],approvals:[],timeEntries:ownEntries,templates:[],policy:{employee_confirmation_under_hours:24}
    };
  }

  function minutesBetween(start,end,breakMinutes=0){
    const duration=Math.round((new Date(end)-new Date(start))/60000)-Number(breakMinutes||0);
    return Number.isFinite(duration)?Math.max(0,duration):0;
  }

  function employeeAccount(month){
    const data=B.employeePortalData||{},key=String(month||'2026-08').slice(0,7);
    const confirmed=(data.timeEntries||[]).filter(entry=>String(entry.actual_start||'').startsWith(key)&&entry.status==='confirmed').reduce((sum,entry)=>sum+minutesBetween(entry.actual_start,entry.actual_end,entry.break_minutes),0);
    const target=Math.round(Number(data.employee?.weekly_hours||40)*4.35*60),balance=confirmed-target;
    return {month:key,target_minutes:target,confirmed_work_minutes:confirmed,absence_credit_minutes:0,credited_total_minutes:confirmed,month_balance_minutes:balance,account_balance_minutes:balance,account_started:true,effective_account_start:'2026-08-01',pending_entries:0,federal_state:'DE',holidays:[]};
  }

  function patchEmployeeRpc(){
    const rpc=B.client?.rpc;if(typeof rpc!=='function'||rpc.__sfDemoPerspectiveV1)return;
    const base=rpc.bind(B.client),wrapped=async function(name,args={}){
      if(name==='employee_my_time_account_month')return {data:employeeAccount(args.p_month),error:null};
      if(name==='employee_list_disruption_offers')return {data:[],error:null};
      return base(name,args);
    };
    wrapped.__sfDemoPerspectiveV1=true;B.client.rpc=wrapped;
  }

  function switchMarkup(active){
    return `<div class="sf-demo-perspective" id="sfDemoPerspectiveSwitch" role="group" aria-label="Demo-Perspektive wechseln"><span class="sf-demo-perspective-label">Perspektive</span><button type="button" data-demo-perspective="manager" aria-pressed="${active==='manager'}">Manager</button><button type="button" data-demo-perspective="employee" aria-pressed="${active==='employee'}">Mitarbeiter</button></div>`;
  }

  function bindSwitch(root){
    root.querySelectorAll('[data-demo-perspective]').forEach(button=>button.onclick=()=>setPerspective(button.dataset.demoPerspective));
  }

  function managerSwitch(){
    const top=document.querySelector('#appShell .top-actions');if(!top)return false;
    top.querySelector('#sfDemoPerspectiveSwitch')?.remove();
    top.insertAdjacentHTML('afterbegin',switchMarkup('manager'));
    bindSwitch(top);return true;
  }

  function employeeSwitch(data){
    const top=document.querySelector('#sfEmployeePortal .sf-portal-top');if(!top)return false;
    top.querySelector('#sfDemoPerspectiveSwitch')?.remove();top.querySelector('#sfDemoEmployeeExit')?.remove();
    const context=document.createElement('span');context.className='sf-demo-employee-context';context.innerHTML=`Demo-Profil: <b>${esc(data.employee.first_name)} ${esc(data.employee.last_name)}</b>`;
    top.querySelector('.sf-demo-employee-context')?.remove();top.appendChild(context);
    top.insertAdjacentHTML('beforeend',switchMarkup('employee')+'<button type="button" id="sfDemoEmployeeExit">Demo beenden</button>');
    bindSwitch(top);top.querySelector('#sfDemoEmployeeExit').onclick=()=>window.sfExitDemo?.();return true;
  }

  function renderManager(){
    B.restoreNonEmployeeShell?.();document.getElementById('sfEmployeePortal')?.remove();
    B.role='ADMIN';B.employeePortalData=null;
    const landing=document.getElementById('landingPage'),app=document.getElementById('appShell');if(landing)landing.style.display='none';if(app)app.style.display='grid';
    const target=document.getElementById('view-'+managerView)?managerView:'overview';
    try{window.switchView?.(target)}catch{}
    try{window.renderOverview?.();window.renderCalendar?.();window.renderPlanEmployeePool?.()}catch{}
    managerSwitch();window.scrollTo({top:0,behavior:'instant'});
  }

  function renderEmployee(){
    const data=portalData();if(!data)return;
    managerView=document.querySelector('.view.active')?.id?.replace('view-','')||managerView;
    B.employeePortalData=data;B.role='EMPLOYEE';patchEmployeeRpc();B.openEmployeePortal();
    employeeSwitch(data);B.employeePortalNavigate?.('dashboard');
  }

  function setPerspective(next){
    if(switching||!['manager','employee'].includes(next))return;
    switching=true;sessionStorage.setItem(KEY,next);
    try{if(next==='employee')renderEmployee();else renderManager();document.dispatchEvent(new CustomEvent('sf:demo-perspective-change',{detail:{perspective:next}}))}finally{switching=false}
  }

  function boot(){
    css();
    if(typeof B.openEmployeePortal!=='function'||typeof B.restoreNonEmployeeShell!=='function'){setTimeout(boot,100);return}
    const saved=sessionStorage.getItem(KEY)==='employee'?'employee':'manager';setPerspective(saved);
  }

  window.SFDemoPerspective={set:setPerspective,current:()=>sessionStorage.getItem(KEY)==='employee'?'employee':'manager',employee:demoEmployee};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
