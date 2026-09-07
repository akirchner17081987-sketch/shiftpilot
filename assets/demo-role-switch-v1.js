// SchichtFunk – Demo-Perspektivwechsel Manager / Mitarbeiter V1
(function(){
  if(window.__sfDemoRoleSwitchV1)return;
  if(sessionStorage.getItem('sf_demo_session_v1')!=='active')return;
  window.__sfDemoRoleSwitchV1=true;

  const B=window.SFBackend=window.SFBackend||{};
  const KEY='sf_demo_perspective_v1';
  const DISRUPTION_KEY='sf_demo_disruption_offers_v1';
  const SHIFT_CHANGE_KEY='sf_demo_shift_changes_v1';
  const ABSENCE_KEY='sf_demo_absence_requests_v1';
  const TIME_KEY='sf_demo_time_tracking_v2';
  const EMPLOYEE_NO='D001';
  let managerView='overview';
  let switching=false;

  const pad=n=>String(n).padStart(2,'0');
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone=value=>JSON.parse(JSON.stringify(value));
  const read=(key,fallback)=>{try{const raw=sessionStorage.getItem(key);return raw?JSON.parse(raw):fallback}catch{return fallback}};
  const write=(key,value)=>{try{sessionStorage.setItem(key,JSON.stringify(value))}catch{}};

  function futureStamp(dayOffset,time){
    const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+dayOffset);
    const [hour,minute]=String(time).split(':').map(Number);d.setHours(hour,minute||0,0,0);
    return d.toISOString();
  }

  function futureDate(dayOffset){
    const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+dayOffset);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }

  function disruptionOffers(){
    try{const saved=sessionStorage.getItem(DISRUPTION_KEY);if(saved)return JSON.parse(saved)}catch{}
    const offers=[
      {offer_id:'demo-disruption-offer-01',offer_status:'OFFERED',incident_id:'demo-disruption-incident-01',assignment_id:'demo-disruption-assignment-01',shift_code:'O2',starts_at:futureStamp(1,'15:00'),ends_at:futureStamp(1,'23:00'),incident_type:'SICKNESS',note:'Kurzfristige Krankmeldung – Einsatz kann vollständig übernommen werden.',expires_at:futureStamp(1,'12:00'),employee_comment:''},
      {offer_id:'demo-disruption-offer-02',offer_status:'OFFERED',incident_id:'demo-disruption-incident-02',assignment_id:'demo-disruption-assignment-02',shift_code:'OT',starts_at:futureStamp(3,'18:00'),ends_at:futureStamp(4,'02:00'),incident_type:'EMERGENCY',note:'Dringender Ersatz für den Spätdienst gesucht.',expires_at:futureStamp(2,'18:00'),employee_comment:''},
      {offer_id:'demo-disruption-offer-03',offer_status:'DECLINED',incident_id:'demo-disruption-incident-03',assignment_id:'demo-disruption-assignment-03',shift_code:'O1',starts_at:futureStamp(-3,'07:00'),ends_at:futureStamp(-3,'15:00'),incident_type:'NO_SHOW',note:'Bereits bearbeitete Beispielanfrage.',expires_at:futureStamp(-4,'18:00'),employee_comment:'Terminüberschneidung'}
    ];
    try{sessionStorage.setItem(DISRUPTION_KEY,JSON.stringify(offers))}catch{}
    return offers;
  }

  function saveDisruptionOffers(offers){try{sessionStorage.setItem(DISRUPTION_KEY,JSON.stringify(offers))}catch{}}

  function shiftChanges(){
    try{const saved=sessionStorage.getItem(SHIFT_CHANGE_KEY);if(saved)return JSON.parse(saved)}catch{}
    const state={
      requests:[
        {id:'demo-change-01',action:'UPDATE',status:'PENDING_EMPLOYEE',requires_employee_approval:true,requested_at:futureStamp(-1,'10:15'),old_snapshot:{type:'O1',startsAt:futureStamp(2,'07:00'),endsAt:futureStamp(2,'15:00'),breakMinutes:30},proposed_snapshot:{type:'O2',startsAt:futureStamp(2,'15:00'),endsAt:futureStamp(2,'23:00'),breakMinutes:30},reason_code:'Dienstplananpassung',reason_text:'Vertretung wegen einer kurzfristigen Abwesenheit.'},
        {id:'demo-change-02',action:'UPDATE',status:'APPLIED',requires_employee_approval:true,requested_at:futureStamp(-5,'09:30'),old_snapshot:{type:'O1',startsAt:futureStamp(-2,'07:00'),endsAt:futureStamp(-2,'15:00'),breakMinutes:30},proposed_snapshot:{type:'O1S',startsAt:futureStamp(-2,'08:00'),endsAt:futureStamp(-2,'16:00'),breakMinutes:30},reason_code:'Objektübergabe',reason_text:'Der spätere Beginn wurde bereits bestätigt und in den Dienstplan übernommen.'},
        {id:'demo-change-03',action:'DELETE',status:'REJECTED',requires_employee_approval:true,requested_at:futureStamp(-8,'14:20'),old_snapshot:{type:'OT',startsAt:futureStamp(-4,'18:00'),endsAt:futureStamp(-3,'02:00'),breakMinutes:30},proposed_snapshot:null,reason_code:'Einsatz entfällt',reason_text:'Die vorgeschlagene Stornierung wurde abgelehnt; die bisherige Planung blieb bestehen.'}
      ],
      approvals:[
        {id:'demo-change-approval-01',change_request_id:'demo-change-01',approval_type:'EMPLOYEE',status:'PENDING'},
        {id:'demo-change-approval-02',change_request_id:'demo-change-02',approval_type:'EMPLOYEE',status:'APPROVED'},
        {id:'demo-change-approval-03',change_request_id:'demo-change-03',approval_type:'EMPLOYEE',status:'REJECTED'}
      ]
    };
    try{sessionStorage.setItem(SHIFT_CHANGE_KEY,JSON.stringify(state))}catch{}
    return state;
  }

  function absenceRequests(employeeId){
    try{const saved=sessionStorage.getItem(ABSENCE_KEY);if(saved)return JSON.parse(saved)}catch{}
    const rows=[
      {id:'demo-absence-01',employee_id:employeeId,absence_type:'Fortbildung',start_date:futureDate(6),end_date:futureDate(6),status:'Beantragt',full_day:true,note:'Brandschutz-Auffrischung beim Bildungsträger.',requested_at:futureStamp(-1,'11:20')},
      {id:'demo-absence-02',employee_id:employeeId,absence_type:'Urlaub',start_date:futureDate(14),end_date:futureDate(18),status:'Genehmigt',full_day:true,note:'Geplanter Erholungsurlaub.',review_note:'Freigegeben – Vertretung ist eingeplant.',requested_at:futureStamp(-9,'08:40')},
      {id:'demo-absence-03',employee_id:employeeId,absence_type:'Frei',start_date:futureDate(9),end_date:futureDate(9),status:'Abgelehnt',full_day:true,note:'Privater Termin.',review_note:'An diesem Tag ist die Mindestbesetzung bereits erreicht.',requested_at:futureStamp(-5,'16:10')}
    ];
    try{sessionStorage.setItem(ABSENCE_KEY,JSON.stringify(rows))}catch{}
    return rows;
  }

  function css(){
    if(document.getElementById('sfDemoRoleSwitchCss'))return;
    const style=document.createElement('style');style.id='sfDemoRoleSwitchCss';style.textContent=`
      .sf-demo-perspective{display:inline-flex;align-items:center;gap:4px;padding:4px;border:1px solid #31516a;border-radius:11px;background:#081724;box-shadow:0 8px 24px rgba(0,0,0,.2)}
      .sf-demo-perspective-label{padding:0 7px;color:#7892a8;font:900 9px/1 Inter,system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase}
      .sf-demo-perspective button{min-height:34px!important;padding:0 11px!important;border:0!important;border-radius:8px!important;background:transparent!important;color:#91a9bc!important;font:800 11px/1 Inter,system-ui,sans-serif!important;cursor:pointer}
      .sf-demo-perspective button[aria-pressed="true"]{background:#163d37!important;color:#8cebd5!important;box-shadow:inset 0 0 0 1px #2d7869}
      .sf-demo-employee-context{color:#8da6b9;font:700 10px/1.3 Inter,system-ui,sans-serif;white-space:nowrap}.sf-demo-employee-context b{color:#dcebf5}
      #sfEmployeePortal .sf-portal-main{max-width:none!important;padding:26px 28px 40px!important}
      #sfEmployeePortal .sf-demo-perspective{margin-left:auto}#sfEmployeePortal .sf-portal-top>.spacer{display:none}#sfEmployeePortal #sfEmployeeLogout{display:none!important}
      #sfDemoEmployeeExit{min-height:40px;padding:0 13px;border:1px solid #36556c;border-radius:9px;background:#0a1928;color:#b9cddd;font:800 11px Inter,system-ui,sans-serif;cursor:pointer}
      @media(max-width:850px){.sf-demo-perspective-label,.sf-demo-employee-context{display:none}.sf-demo-perspective button{padding:0 9px!important}}
      @media(max-width:820px){#sfEmployeePortal .sf-portal-main{padding:22px 20px 38px!important}}
      @media(max-width:560px){#sfEmployeePortal .sf-portal-main{padding:18px 14px 72px!important}.sf-demo-perspective{position:fixed;z-index:19050;left:10px;right:10px;bottom:12px;justify-content:center}.sf-demo-perspective button{flex:1}#sfDemoEmployeeExit{padding:0 9px}}
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
    const changeState=shiftChanges();
    let allAssignments=[],allAbsences=[],entries={};
    try{allAssignments=assignments;allAbsences=absences;entries=timeEntries||{}}catch{}
    const futureShifts=allAssignments.filter(a=>String(a.employeeId)===String(employee.id)).map(a=>({
      id:a.id,employee_id:employee.id,shift_code:a.type||'Schicht',starts_at:localStamp(a),ends_at:localStamp(a,true),break_minutes:Number(a.pause||30),status:'PUBLISHED',published_at:a.publishedAt||'2026-07-27T08:00:00.000Z'
    })).filter(s=>new Date(s.ends_at).getTime()>Date.now()).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)).slice(0,2);
    const patterns=[['O1','07:00','15:00'],['O2','15:00','23:00'],['O1S','08:00','16:00'],['O1','07:00','15:00'],['O2','15:00','23:00'],['O1','07:00','15:00']];
    const pastShifts=patterns.map((p,index)=>({id:`demo-employee-shift-${pad(index+1)}`,employee_id:employee.id,shift_code:p[0],starts_at:futureStamp(-(index+1),p[1]),ends_at:futureStamp(-(index+1),p[2]),break_minutes:30,status:'PUBLISHED',published_at:futureStamp(-20,'08:00')}));
    const shifts=[...pastShifts,...futureShifts];
    const ownAbsences=[...absenceRequests(employee.id),...allAbsences.filter(a=>String(a.employeeId)===String(employee.id)).map(a=>({id:a.id,employee_id:employee.id,absence_type:a.type||'Abwesenheit',start_date:a.startDate||a.date,end_date:a.endDate||a.startDate||a.date,status:a.status||'Genehmigt',full_day:a.fullDay!==false,note:a.note||'',review_note:a.reviewNote||'',requested_at:a.requestedAt||futureStamp(-12,'09:00')}))];
    const saved=read(TIME_KEY,[]),states=['recorded','confirmed','correction_requested','confirmed','recorded','open'];
    pastShifts.forEach((shift,index)=>{if(saved.some(row=>row.assignment_id===shift.id))return;const actual=index===5?null:{start:new Date(new Date(shift.starts_at).getTime()+(index===0?4:index===2?12:0)*60000).toISOString(),end:new Date(new Date(shift.ends_at).getTime()+(index===1?15:index===4?20:0)*60000).toISOString()};saved.push({assignment_id:shift.id,employee_id:employee.id,employee_name:`${employee.first} ${employee.last}`,shift_code:shift.shift_code,starts_at:shift.starts_at,ends_at:shift.ends_at,planned_break_minutes:shift.break_minutes,actual_start:actual?.start||null,actual_end:actual?.end||null,actual_break_minutes:actual?30:null,entry_status:states[index],employee_note:index===0?'Verkehrsbedingt wenige Minuten später gestartet.':index===4?'Übergabe dauerte etwas länger.':'',manager_note:states[index]==='confirmed'?'Geprüft und bestätigt.':'',correction_note:states[index]==='correction_requested'?'Bitte tatsächliches Ende noch einmal prüfen.':''})});
    write(TIME_KEY,saved);
    const ownEntries=saved.filter(row=>shifts.some(shift=>shift.id===row.assignment_id)).map(row=>({assignment_id:row.assignment_id,starts_at:row.starts_at,actual_start:row.actual_start,actual_end:row.actual_end,break_minutes:row.actual_break_minutes,status:row.entry_status,employee_note:row.employee_note||'',manager_note:row.manager_note||'',correction_note:row.correction_note||''}));
    return {
      employee:{id:employee.id,first_name:employee.first,last_name:employee.last,personnel_no:employee.personnelNo,employment:employee.employment,weekly_hours:Number(employee.weeklyHours||0),email:employee.email,phone:employee.phone||'',work_time_model:'Fester Schichtrhythmus',shift_permissions:employee.shifts||[],status:'active'},
      company:{id:'demo-local-company',name:'SchichtFunk Demo GmbH',timezone:'Europe/Berlin'},
      shifts,absences:ownAbsences,requests:clone(changeState.requests),approvals:clone(changeState.approvals),timeEntries:ownEntries,templates:[],policy:{employee_confirmation_under_hours:24}
    };
  }

  function minutesBetween(start,end,breakMinutes=0){
    const duration=Math.round((new Date(end)-new Date(start))/60000)-Number(breakMinutes||0);
    return Number.isFinite(duration)?Math.max(0,duration):0;
  }

  function employeeAccount(month){
    const data=B.employeePortalData||{},key=String(month||'2026-08').slice(0,7);
    const confirmed=(data.timeEntries||[]).filter(entry=>String(entry.actual_start||'').startsWith(key)&&entry.status==='confirmed').reduce((sum,entry)=>sum+minutesBetween(entry.actual_start,entry.actual_end,entry.break_minutes),0);
    const [year,monthNo]=key.split('-').map(Number),last=new Date(year,monthNo,0),weekdays=Array.from({length:last.getDate()},(_,i)=>new Date(year,monthNo-1,i+1)).filter(d=>d.getDay()>0&&d.getDay()<6).length;
    const daily=Math.round(Number(data.employee?.weekly_hours||40)*12),target=weekdays*daily;
    const absenceCredit=(data.absences||[]).filter(a=>['Genehmigt','Erfasst'].includes(a.status)&&['Urlaub','Krank','Fortbildung','Sonderurlaub'].includes(a.absence_type)&&String(a.start_date||'').startsWith(key)).reduce((sum,a)=>{const from=new Date(a.start_date+'T12:00:00'),to=new Date(a.end_date+'T12:00:00');let days=0;for(const d=new Date(from);d<=to;d.setDate(d.getDate()+1))if(d.getDay()>0&&d.getDay()<6)days++;return sum+days*daily},0);
    const credited=confirmed+absenceCredit,balance=credited-target,pending=(data.timeEntries||[]).filter(entry=>String(entry.actual_start||entry.starts_at||'').startsWith(key)&&['recorded','correction_requested'].includes(entry.status)).length;
    return {month:key,target_minutes:target,confirmed_work_minutes:confirmed,absence_credit_minutes:absenceCredit,credited_total_minutes:credited,month_balance_minutes:balance,account_balance_minutes:270+balance,account_started:true,effective_account_start:'2026-01-01',pending_entries:pending,federal_state:'DE-NW',holidays:[],holiday_minutes:0};
  }

  function patchEmployeeRpc(){
    const rpc=B.client?.rpc;if(typeof rpc!=='function'||rpc.__sfDemoPerspectiveV1)return;
    const base=rpc.bind(B.client),wrapped=async function(name,args={}){
      if(name==='employee_my_time_account_month')return {data:employeeAccount(args.p_month),error:null};
      if(name==='employee_list_disruption_offers')return {data:clone(disruptionOffers()),error:null};
      if(name==='employee_respond_disruption_offer'){
        const offers=disruptionOffers(),offer=offers.find(item=>String(item.offer_id)===String(args.p_offer_id));
        if(!offer)return {data:null,error:{message:'Demo-Ersatzanfrage wurde nicht gefunden.'}};
        if(offer.offer_status!=='OFFERED')return {data:null,error:{message:'Diese Demo-Ersatzanfrage wurde bereits beantwortet.'}};
        const decision=String(args.p_decision||'').toUpperCase();
        if(!['ACCEPT','DECLINE'].includes(decision))return {data:null,error:{message:'Ungültige Entscheidung.'}};
        offer.offer_status=decision==='ACCEPT'?'ACCEPTED':'DECLINED';offer.employee_comment=String(args.p_comment||'').slice(0,1000);offer.responded_at=new Date().toISOString();saveDisruptionOffers(offers);
        return {data:[{status:offer.offer_status,message:decision==='ACCEPT'?'Schicht wurde in der Demo als übernommen markiert.':'Anfrage abgelehnt. Die Disposition wurde informiert.',assignment_id:offer.assignment_id}],error:null};
      }
      return base(name,args);
    };
    wrapped.__sfDemoPerspectiveV1=true;wrapped.__sfDemoCloudV2=rpc.__sfDemoCloudV2===true;B.client.rpc=wrapped;
  }

  function patchEmployeeHydrate(){
    if(B.hydrateEmployee?.__sfDemoPerspectiveV1)return;
    const hydrate=async()=>{const data=portalData();if(data)B.employeePortalData=data;return data};
    hydrate.__sfDemoPerspectiveV1=true;B.hydrateEmployee=hydrate;
  }

  function switchMarkup(active){
    return `<div class="sf-demo-perspective" id="sfDemoPerspectiveSwitch" role="group" aria-label="Demo-Perspektive wechseln"><span class="sf-demo-perspective-label">Perspektive</span><button type="button" data-demo-perspective="manager" aria-pressed="${active==='manager'}">Manager</button><button type="button" data-demo-perspective="employee" aria-pressed="${active==='employee'}">Mitarbeiter</button></div>`;
  }

  function bindSwitch(root){
    root.querySelectorAll('[data-demo-perspective]').forEach(button=>button.onclick=()=>setPerspective(button.dataset.demoPerspective));
  }

  function managerSwitch(){
    const top=document.querySelector('#appShell .top-actions');if(!top)return false;
    document.getElementById('sfDemoPerspectiveSwitch')?.remove();document.getElementById('sfDemoEmployeeExit')?.remove();
    top.insertAdjacentHTML('afterbegin',switchMarkup('manager'));
    bindSwitch(top);return true;
  }

  function employeeSwitch(data){
    const top=document.querySelector('#sfEmployeePortal .sf-portal-top');if(!top)return false;
    document.getElementById('sfDemoPerspectiveSwitch')?.remove();document.getElementById('sfDemoEmployeeExit')?.remove();
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
    B.employeePortalData=data;B.role='EMPLOYEE';patchEmployeeRpc();patchEmployeeHydrate();B.openEmployeePortal();
    employeeSwitch(data);B.employeePortalNavigate?.('dashboard');
    for(const delay of [0,100,300])setTimeout(()=>B.refreshEmployeeShiftChanges?.(),delay);
    for(const delay of [0,250,800])setTimeout(()=>window.SFDisruptionAutopilot?.refresh?.(),delay);
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
