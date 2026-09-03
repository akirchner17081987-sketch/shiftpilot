// SchichtFunk – vollständiger Demo-Referenzmonat August 2026 V1
(function(){
  if(window.__sfDemoAugust2026V1)return;window.__sfDemoAugust2026V1=true;
  if(sessionStorage.getItem('sf_demo_session_v1')!=='active')return;

  const B=window.SFBackend=window.SFBackend||{};
  const MONTH='2026-08';
  const FIRST='2026-08-01';
  const LAST='2026-08-31';
  const INIT_KEY='sf_demo_data_august_standard_v1';
  const PICKER_KEY='sf_demo_data_august_picker_v1';
  const pad=n=>String(n).padStart(2,'0');
  const shiftTimes={
    O1:['07:00','15:00'],O1S:['18:00','04:00'],O2:['15:00','23:00'],QA:['20:00','06:00'],
    Teamleiter:['08:00','16:00'],O3:['23:00','07:00'],OT1:['10:00','18:00'],OT2:['12:00','20:00'],OT:['18:00','02:00']
  };
  const primaryByNo={
    D001:'O1',D002:'O1',D003:'O1S',D004:'QA',D005:'O2',D006:'Teamleiter',D007:'Teamleiter',
    D008:'O3',D009:'O3',D010:'OT1',D011:'OT2',D012:'OT2',D013:'OT',D014:'OT',D015:'OT'
  };
  let rpcPatched=false,seeded=false;
  let augustAssignments=[],augustEntries=[],augustBundle={employees:[],details:[]};

  function localDate(y,m,d){return `${y}-${pad(m)}-${pad(d)}`}
  function plusDays(iso,n){const d=new Date(`${iso}T12:00:00`);d.setDate(d.getDate()+n);return localDate(d.getFullYear(),d.getMonth()+1,d.getDate())}
  function monthDates(){return Array.from({length:31},(_,i)=>`2026-08-${pad(i+1)}`)}
  function localStamp(date,time,delta=0,nextDay=false){
    const [h,m]=String(time).split(':').map(Number),base=new Date(`${date}T${pad(h)}:${pad(m)}:00`);
    if(nextDay)base.setDate(base.getDate()+1);base.setMinutes(base.getMinutes()+delta);
    return `${localDate(base.getFullYear(),base.getMonth()+1,base.getDate())}T${pad(base.getHours())}:${pad(base.getMinutes())}:00+02:00`;
  }
  function isOvernight(start,end){const [sh,sm]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number);return eh*60+em<=sh*60+sm}
  function netMinutes(e){const a=new Date(e.actual_start),b=new Date(e.actual_end);return Math.max(0,Math.round((b-a)/60000)-Number(e.actual_break_minutes||0))}
  function nameOf(e){return `${e.first||''} ${e.last||''}`.trim()}

  function employeeWorks(emp,index,day){
    // Staggered 5/2 rotation for full-time and 4/3 for part-time employees.
    const target=Number(emp.weeklyHours||40)>=40?5:4;
    const cycle=((day-1)+(index*2))%7;
    if(emp.personnelNo==='D005'&&(day===17||day===18))return false; // Demo-Urlaub
    return cycle<target;
  }

  function buildAugust(){
    if(typeof employees==='undefined'||!Array.isArray(employees)||!employees.length)return false;
    augustAssignments=[];augustEntries=[];
    const confirmed=new Map();
    for(let day=1;day<=31;day++){
      const date=`2026-08-${pad(day)}`;
      employees.forEach((emp,index)=>{
        if(!employeeWorks(emp,index,day))return;
        const type=primaryByNo[emp.personnelNo]||emp._demoPrimary||emp.shifts?.[0]||'O1';
        const times=shiftTimes[type]||['08:00','16:00'];
        const id=`demo-aug26-${pad(day)}-${emp.personnelNo||pad(index+1)}`;
        const assignment={id,date,type,employeeId:emp.id,start:times[0],end:times[1],pause:30,note:'Demo August 2026 · vollständig geplant',version:1,publishedAt:'2026-07-27T08:00:00.000Z'};
        augustAssignments.push(assignment);
        const startDelta=[0,2,-2,4,0][(day+index)%5],endDelta=[0,5,-3,7,2][(day+index*2)%5];
        const entry={
          assignment_id:id,employee_id:emp.id,employee_name:nameOf(emp),shift_code:type,
          starts_at:localStamp(date,times[0]),ends_at:localStamp(date,times[1],0,isOvernight(times[0],times[1])),planned_break_minutes:30,
          actual_start:localStamp(date,times[0],startDelta),actual_end:localStamp(date,times[1],endDelta,isOvernight(times[0],times[1])),actual_break_minutes:30,
          entry_status:'confirmed',employee_note:(day+index)%11===0?'Demo: Übergabe geringfügig verlängert.':'',manager_note:'August 2026 geprüft und bestätigt.',correction_note:''
        };
        augustEntries.push(entry);confirmed.set(String(emp.id),(confirmed.get(String(emp.id))||0)+netMinutes(entry));
      });
    }
    augustBundle={
      employees:employees.map((e,i)=>({employee_id:e.id,employee_name:nameOf(e),personnel_no:String(1001+i),confirmed_work_minutes:confirmed.get(String(e.id))||0})),
      details:[
        {employee_id:employees.find(e=>e.personnelNo==='D005')?.id||'demo-e05',employee_name:nameOf(employees.find(e=>e.personnelNo==='D005')||{}),work_date:'2026-08-17',absence_types:'Urlaub',absence_credit_minutes:480},
        {employee_id:employees.find(e=>e.personnelNo==='D005')?.id||'demo-e05',employee_name:nameOf(employees.find(e=>e.personnelNo==='D005')||{}),work_date:'2026-08-18',absence_types:'Urlaub',absence_credit_minutes:480}
      ]
    };
    return true;
  }

  function seedPlanning(){
    if(seeded)return true;
    try{
      if(typeof assignments==='undefined'||typeof dailySoll==='undefined'||typeof timeEntries==='undefined'||typeof absences==='undefined'||typeof store==='undefined')return false;
      if(!buildAugust())return false;
      assignments=assignments.filter(a=>!String(a.id||'').startsWith('demo-aug26-')).concat(augustAssignments);
      for(const date of monthDates()){
        const counts={};augustAssignments.filter(a=>a.date===date).forEach(a=>counts[a.type]=(counts[a.type]||0)+1);
        dailySoll[date]={...counts};
      }
      const oldAbs=absences.filter(a=>a.id!=='demo-aug26-urlaub');
      absences=oldAbs.concat({id:'demo-aug26-urlaub',employeeId:employees.find(e=>e.personnelNo==='D005')?.id||'demo-e05',date:'2026-08-17',startDate:'2026-08-17',endDate:'2026-08-18',type:'Urlaub',status:'Genehmigt',fullDay:true,note:'Demo-Urlaub für DATEV-Abwesenheitsbuchung'});
      for(const e of augustEntries){
        const start=new Date(e.actual_start),end=new Date(e.actual_end);
        timeEntries[e.assignment_id]={actualStart:`${pad(start.getHours())}:${pad(start.getMinutes())}`,actualEnd:`${pad(end.getHours())}:${pad(end.getMinutes())}`,breakMin:30,status:'confirmed'};
      }
      store.set('assignments',assignments);store.set('dailySoll',dailySoll);store.set('absences',absences);store.set('timeEntries',timeEntries);
      sessionStorage.setItem(INIT_KEY,'ready');
      seeded=true;return true;
    }catch(err){console.error('[SchichtFunk Demo August] Planung konnte nicht erzeugt werden.',err);return false}
  }

  function setDefaultAugustView(){
    if(sessionStorage.getItem(INIT_KEY)!=='ready')return false;
    if(sessionStorage.getItem('sf_demo_data_august_view_initialized_v1')==='1')return true;
    try{if(typeof weekStart!=='undefined')weekStart=new Date(2026,7,3)}catch{}
    try{window.SchichtFunkCalendarView?.setMode?.('month')}catch{}
    sessionStorage.setItem('sf_demo_data_august_view_initialized_v1','1');
    try{if(typeof renderCalendar==='function')renderCalendar()}catch{}
    return true;
  }

  function setDefaultMonthPicker(){
    if(sessionStorage.getItem(PICKER_KEY)==='1')return true;
    const input=document.getElementById('sfTaMonth');if(!input)return false;
    input.value=MONTH;sessionStorage.setItem(PICKER_KEY,'1');
    input.dispatchEvent(new Event('change',{bubbles:true}));return true;
  }

  function rangeTouchesAugust(args={}){
    const start=String(args.p_start_date||''),end=String(args.p_end_date||'');
    return (!start||start<=LAST)&&(!end||end>=FIRST)&&(start.startsWith(MONTH)||end.startsWith(MONTH)||start<=FIRST&&end>=LAST);
  }

  function patchRpc(){
    if(rpcPatched)return true;
    const rpc=B.client?.rpc;if(typeof rpc!=='function'||!rpc.__sfDemoCloudV2)return false;
    const base=rpc.bind(B.client);
    const wrapped=async function(name,args={}){
      const month=String(args?.p_month||'');
      if(name==='manager_time_month_status'&&month.startsWith(MONTH))return {data:{status:'CLOSED',closed_at:'2026-09-01T06:00:00+02:00',demo:true},error:null};
      if(name==='manager_time_report_bundle'&&month.startsWith(MONTH))return {data:JSON.parse(JSON.stringify(augustBundle)),error:null};
      if(name==='manager_list_time_entries'&&rangeTouchesAugust(args)){
        const start=String(args.p_start_date||FIRST),end=String(args.p_end_date||LAST);
        return {data:JSON.parse(JSON.stringify(augustEntries.filter(e=>e.starts_at.slice(0,10)>=start&&e.starts_at.slice(0,10)<=end))),error:null};
      }
      return base(name,args);
    };
    wrapped.__sfDemoCloudV2=true;wrapped.__sfDemoAugust2026V1=true;B.client.rpc=wrapped;rpcPatched=true;return true;
  }

  function addDemoHint(){
    const panel=document.getElementById('sfDatevPanel');if(!panel||panel.querySelector('.sf-demo-aug-hint'))return;
    const hint=document.createElement('div');hint.className='sf-datev-status good sf-demo-aug-hint';hint.textContent='Demo-Referenzmonat: August 2026 ist vollständig geplant, zeiterfasst, bestätigt und abgeschlossen – DATEV-Export ist vorführbereit.';panel.appendChild(hint);
  }

  function boot(){
    const ok=seedPlanning();if(ok){setDefaultAugustView();setDefaultMonthPicker();patchRpc();addDemoHint()}
    if(!ok||!rpcPatched||sessionStorage.getItem(PICKER_KEY)!=='1')setTimeout(boot,120);
  }
  const observer=new MutationObserver(()=>{setDefaultMonthPicker();addDemoHint()});
  function start(){boot();if(document.body)observer.observe(document.body,{childList:true,subtree:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.SchichtFunkDemoAugust2026={month:MONTH,assignments:()=>augustAssignments.slice(),entries:()=>augustEntries.slice(),bundle:()=>JSON.parse(JSON.stringify(augustBundle))};
})();
