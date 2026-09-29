// SchichtFunk – isolierter Demo-Datenadapter V2
(function(){
  if(sessionStorage.getItem('sf_demo_session_v1')!=='active')return;
  if(window.__sfDemoCloudAdapterV2)return;window.__sfDemoCloudAdapterV2=true;

  const B=window.SFBackend=window.SFBackend||{};
  const MARKET_KEY='sf_demo_marketplace_v1';
  const DISRUPTION_KEY='sf_demo_disruption_offers_v1';
  const SHIFT_CHANGE_KEY='sf_demo_shift_changes_v1';
  const ABSENCE_KEY='sf_demo_absence_requests_v1';
  const TIME_KEY='sf_demo_time_tracking_v2';
  const DATEV_KEY='sf_demo_datev_v2';
  const ACCOUNT_KEY='sf_demo_time_account_settings_v1';
  const pad=n=>String(n).padStart(2,'0');
  const clone=v=>JSON.parse(JSON.stringify(v));
  const mondayOf=d=>{const x=new Date(d);x.setHours(0,0,0,0);const day=x.getDay()||7;x.setDate(x.getDate()-day+1);return x};
  const plusDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
  const isoLocal=(d,h,m=0)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}:00+02:00`;
  const stamp=(dayOffset,hour,minute=0)=>{const d=new Date();d.setDate(d.getDate()+dayOffset);return isoLocal(d,hour,minute)};
  const read=(key,fallback)=>{try{const raw=sessionStorage.getItem(key);return raw?JSON.parse(raw):fallback}catch{return fallback}};
  const write=(key,value)=>{try{sessionStorage.setItem(key,JSON.stringify(value))}catch{}};

  // Defense in depth: only the dedicated demo gate and its category-only
  // analytics endpoint may leave the local sandbox. Product data stays local.
  const isSupabaseUrl=value=>{try{return /(^|\.)supabase\.(co|in)$/i.test(new URL(typeof value==='string'?value:value?.url,location.href).hostname)}catch{return false}};
  const isAllowedDemoApiUrl=value=>{try{const url=new URL(typeof value==='string'?value:value?.url,location.href);return url.hostname==='zbvloohfjleadjnqhbbh.supabase.co'&&['/functions/v1/demo-auth','/functions/v1/demo-analytics'].includes(url.pathname)}catch{return false}};
  if(!window.__sfDemoNetworkGuardV1){
    window.__sfDemoNetworkGuardV1=true;
    const nativeFetch=window.fetch.bind(window);
    window.fetch=function(input,init){
      if(isSupabaseUrl(input)&&!isAllowedDemoApiUrl(input)){const error=new Error('SF_DEMO_NETWORK_BLOCKED: Externe Supabase-Verbindungen sind im Demo-Modus gesperrt.');error.code='SF_DEMO_NETWORK_BLOCKED';return Promise.reject(error)}
      return nativeFetch(input,init);
    };
    const nativeOpen=XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open=function(method,url){if(isSupabaseUrl(url)&&!isAllowedDemoApiUrl(url))throw Object.assign(new Error('SF_DEMO_NETWORK_BLOCKED: Supabase-XHR ist im Demo-Modus gesperrt.'),{code:'SF_DEMO_NETWORK_BLOCKED'});return nativeOpen.apply(this,arguments)};
    if(typeof window.WebSocket==='function'){
      const NativeWebSocket=window.WebSocket;
      window.WebSocket=new Proxy(NativeWebSocket,{construct(Target,args){if(isSupabaseUrl(args[0]))throw Object.assign(new Error('SF_DEMO_NETWORK_BLOCKED: Supabase-Realtime ist im Demo-Modus gesperrt.'),{code:'SF_DEMO_NETWORK_BLOCKED'});return Reflect.construct(Target,args)}});
    }
  }

  function seedMarketplace(){
    const old=read(MARKET_KEY,null);if(old)return old;
    const rows=[
      {id:'demo-market-01',assignment_id:'demo-as-market-01',shift_code:'O1',starts_at:stamp(1,7),offered_by:'Anna Becker',claimed_by:null,reason:'Privater Termin am Vormittag',status:'MARKET_OPEN',colleague_comment:null},
      {id:'demo-market-02',assignment_id:'demo-as-market-02',shift_code:'OT',starts_at:stamp(3,18),offered_by:'Felix Krüger',claimed_by:null,reason:'Tausch wegen Familienfeier',status:'MARKET_OPEN',colleague_comment:null},
      {id:'demo-market-03',assignment_id:'demo-as-market-03',shift_code:'OT2',starts_at:stamp(5,12),offered_by:'Marie Schwarz',claimed_by:null,reason:'Kurzfristige Terminüberschidung',status:'MARKET_OPEN',colleague_comment:null},
      {id:'demo-market-04',assignment_id:'demo-as-market-04',shift_code:'O2',starts_at:stamp(2,15),offered_by:'Jonas Wagner',claimed_by:'Lea Hoffmann',reason:'Arzttermin',status:'PENDING_MANAGER',colleague_comment:'Ich kann die Schicht vollständig übernehmen.'},
      {id:'demo-market-05',assignment_id:'demo-as-market-05',shift_code:'Teamleiter',starts_at:stamp(4,8),offered_by:'Daniel Koch',claimed_by:'Sophie Richter',reason:'Fortbildung',status:'PENDING_MANAGER',colleague_comment:'Teamleiter-Freigabe und Zeitfenster passen.'},
      {id:'demo-market-06',assignment_id:'demo-as-market-06',shift_code:'O3',starts_at:stamp(-2,23),offered_by:'Paul Klein',claimed_by:'Nina Wolf',reason:'Privater Termin',status:'APPLIED',colleague_comment:'Übernahme bestätigt.'},
      {id:'demo-market-07',assignment_id:'demo-as-market-07',shift_code:'O1',starts_at:stamp(-5,7),offered_by:'Lukas Fischer',claimed_by:'Mira Schulz',reason:'Behördentermin',status:'APPLIED',colleague_comment:'Dienstplan wurde angepasst.'},
      {id:'demo-market-08',assignment_id:'demo-as-market-08',shift_code:'OT1',starts_at:stamp(-7,10),offered_by:'Tim Neumann',claimed_by:'Emil Zimmermann',reason:'Terminüberschneidung',status:'REJECTED_MANAGER',colleague_comment:'Wochenstunden hätten die Übernahme überschritten.'},
      {id:'demo-market-09',assignment_id:'demo-as-market-09',shift_code:'OT',starts_at:stamp(-9,18),offered_by:'Laura Braun',claimed_by:null,reason:'Angebot nicht mehr benötigt',status:'CANCELLED',colleague_comment:null}
    ];write(MARKET_KEY,rows);return rows;
  }

  function seedTime(){
    const old=read(TIME_KEY,null);if(old)return old;
    const mon=mondayOf(new Date()),d=i=>plusDays(mon,i),next=i=>plusDays(mon,i+1);
    const rows=[
      {assignment_id:'demo-time-01',employee_id:'demo-e01',employee_name:'Anna Becker',shift_code:'O1',starts_at:isoLocal(d(0),7),ends_at:isoLocal(d(0),15),planned_break_minutes:30,actual_start:isoLocal(d(0),7,4),actual_end:isoLocal(d(0),15,12),actual_break_minutes:30,entry_status:'recorded',employee_note:'Verkehrsbedingt wenige Minuten später gestartet.',manager_note:'',correction_note:''},
      {assignment_id:'demo-time-02',employee_id:'demo-e02',employee_name:'Lukas Fischer',shift_code:'O1',starts_at:isoLocal(d(0),7),ends_at:isoLocal(d(0),15),planned_break_minutes:30,actual_start:isoLocal(d(0),6,55),actual_end:isoLocal(d(0),15,20),actual_break_minutes:30,entry_status:'confirmed',employee_note:'Übergabe verlängert.',manager_note:'Geprüft und bestätigt.',correction_note:''},
      {assignment_id:'demo-time-03',employee_id:'demo-e03',employee_name:'Mira Schulz',shift_code:'O1',starts_at:isoLocal(d(1),7),ends_at:isoLocal(d(1),15),planned_break_minutes:30,actual_start:isoLocal(d(1),7,20),actual_end:isoLocal(d(1),15),actual_break_minutes:30,entry_status:'recorded',employee_note:'Verspäteter Dienstantritt gemeldet.',manager_note:'',correction_note:''},
      {assignment_id:'demo-time-04',employee_id:'demo-e04',employee_name:'Jonas Wagner',shift_code:'O2',starts_at:isoLocal(d(1),15),ends_at:isoLocal(d(1),23),planned_break_minutes:30,actual_start:isoLocal(d(1),15),actual_end:isoLocal(d(1),23),actual_break_minutes:30,entry_status:'confirmed',employee_note:'',manager_note:'Planmäßig.',correction_note:''},
      {assignment_id:'demo-time-05',employee_id:'demo-e06',employee_name:'Daniel Koch',shift_code:'Teamleiter',starts_at:isoLocal(d(2),8),ends_at:isoLocal(d(2),16),planned_break_minutes:30,actual_start:isoLocal(d(2),8),actual_end:isoLocal(d(2),16,35),actual_break_minutes:30,entry_status:'correction_requested',employee_note:'Längere Einsatznachbesprechung.',manager_note:'',correction_note:'Bitte Ende der Nachbesprechung noch einmal prüfen.'},
      {assignment_id:'demo-time-06',employee_id:'demo-e08',employee_name:'Paul Klein',shift_code:'O3',starts_at:isoLocal(d(2),23),ends_at:isoLocal(next(2),7),planned_break_minutes:30,actual_start:isoLocal(d(2),23,5),actual_end:isoLocal(next(2),7),actual_break_minutes:30,entry_status:'confirmed',employee_note:'',manager_note:'Bestätigt.',correction_note:''},
      {assignment_id:'demo-time-07',employee_id:'demo-e11',employee_name:'Marie Schwarz',shift_code:'OT2',starts_at:isoLocal(d(3),12),ends_at:isoLocal(d(3),20),planned_break_minutes:30,actual_start:null,actual_end:null,actual_break_minutes:null,entry_status:'open',employee_note:'',manager_note:'',correction_note:''},
      {assignment_id:'demo-time-08',employee_id:'demo-e13',employee_name:'Laura Braun',shift_code:'OT',starts_at:isoLocal(d(3),18),ends_at:isoLocal(next(3),2),planned_break_minutes:30,actual_start:isoLocal(d(3),17,55),actual_end:isoLocal(next(3),2,18),actual_break_minutes:30,entry_status:'recorded',employee_note:'Objektübergabe dauerte länger.',manager_note:'',correction_note:''}
    ];write(TIME_KEY,rows);return rows;
  }

  function seedDatev(){
    const old=read(DATEV_KEY,null);if(old)return old;
    const state={
      settings:{company_id:'00000000-0000-4000-8000-000000000001',berater_nr:'9999999',mandanten_nr:'99999',updated_at:new Date().toISOString()},
      rules:[
        {id:'demo-datev-rule-1',company_id:'00000000-0000-4000-8000-000000000001',label:'Grundstunden',source_type:'WORK_TOTAL',source_key:null,wage_type:'100',cost_center:'1000',sort_order:10,active:true,created_at:new Date().toISOString()},
        {id:'demo-datev-rule-2',company_id:'00000000-0000-4000-8000-000000000001',label:'Urlaub',source_type:'ABSENCE_TYPE',source_key:'Urlaub',wage_type:'300',cost_center:'1000',sort_order:20,active:true,created_at:new Date().toISOString()}
      ]
    };write(DATEV_KEY,state);return state;
  }

  function seedDisruptionOffers(){
    const old=read(DISRUPTION_KEY,null);if(old)return old;
    const rows=[
      {offer_id:'demo-disruption-offer-01',offer_status:'OFFERED',incident_id:'demo-disruption-incident-01',assignment_id:'demo-disruption-assignment-01',shift_code:'O2',starts_at:stamp(1,15),ends_at:stamp(1,23),incident_type:'SICKNESS',note:'Kurzfristige Krankmeldung – Einsatz kann vollständig übernommen werden.',expires_at:stamp(1,12),employee_comment:''},
      {offer_id:'demo-disruption-offer-02',offer_status:'OFFERED',incident_id:'demo-disruption-incident-02',assignment_id:'demo-disruption-assignment-02',shift_code:'OT',starts_at:stamp(3,18),ends_at:stamp(4,2),incident_type:'EMERGENCY',note:'Dringender Ersatz für den Spätdienst gesucht.',expires_at:stamp(2,18),employee_comment:''},
      {offer_id:'demo-disruption-offer-03',offer_status:'DECLINED',incident_id:'demo-disruption-incident-03',assignment_id:'demo-disruption-assignment-03',shift_code:'O1',starts_at:stamp(-3,7),ends_at:stamp(-3,15),incident_type:'NO_SHOW',note:'Bereits bearbeitete Beispielanfrage.',expires_at:stamp(-4,18),employee_comment:'Terminüberschneidung'}
    ];write(DISRUPTION_KEY,rows);return rows;
  }

  function seedAccountSettings(){
    const old=read(ACCOUNT_KEY,null);if(old)return old;
    const state={company_id:'demo-local-company',account_start_date:'2026-01-01',credited_absence_types:['Urlaub','Krank','Fortbildung','Sonderurlaub'],target_method:'WEEKDAYS',federal_state:'DE-NW'};
    write(ACCOUNT_KEY,state);return state;
  }

  let marketRows=seedMarketplace(),disruptionRows=seedDisruptionOffers(),timeRows=seedTime(),datev=seedDatev(),accountSettings=seedAccountSettings();
  const saveMarket=()=>write(MARKET_KEY,marketRows),saveDisruptions=()=>write(DISRUPTION_KEY,disruptionRows),saveTime=()=>write(TIME_KEY,timeRows),saveDatev=()=>write(DATEV_KEY,datev),saveAccount=()=>write(ACCOUNT_KEY,accountSettings);

  function timeBundle(){
    const names=[['demo-e01','Anna Becker','1001',2250],['demo-e02','Lukas Fischer','1002',2310],['demo-e03','Mira Schulz','1003',1800],['demo-e04','Jonas Wagner','1004',2250],['demo-e06','Daniel Koch','1006',2400],['demo-e08','Paul Klein','1008',2190],['demo-e11','Marie Schwarz','1011',2070],['demo-e13','Laura Braun','1013',2280]];
    return {employees:names.map(x=>({employee_id:x[0],employee_name:x[1],personnel_no:x[2],confirmed_work_minutes:x[3]})),details:[{employee_id:'demo-e03',employee_name:'Mira Schulz',work_date:'2026-08-17',absence_types:'Urlaub',absence_credit_minutes:480}]};
  }

  function monthlyHolidays(monthValue){
    const month=String(monthValue||new Date().toISOString().slice(0,7)).slice(0,7);
    const known={
      '2026-01':[['2026-01-01','Neujahr']],
      '2026-04':[['2026-04-03','Karfreitag'],['2026-04-06','Ostermontag']],
      '2026-05':[['2026-05-01','Tag der Arbeit'],['2026-05-14','Christi Himmelfahrt'],['2026-05-25','Pfingstmontag']],
      '2026-10':[['2026-10-03','Tag der Deutschen Einheit']],
      '2026-12':[['2026-12-25','1. Weihnachtstag'],['2026-12-26','2. Weihnachtstag']]
    };
    const holidays=(known[month]||[]).map(([date,name])=>({date,name,target_relevant:![0,6].includes(new Date(date+'T12:00:00').getDay())}));
    return {month_start:month+'-01',federal_state:accountSettings.federal_state,holidays};
  }

  function employeeRows(){
    try{return (employees||[]).map(e=>({id:e.id,company_id:'demo-local-company',first_name:e.first,last_name:e.last,personnel_no:e.personnelNo,status:e.status||'active',employment:e.employment||'Vollzeit',weekly_hours:Number(e.weeklyHours||40)}))}catch{return []}
  }
  function assignmentRows(){
    try{return (assignments||[]).map(a=>({id:a.id,company_id:'demo-local-company',employee_id:a.employeeId,shift_code:a.type,starts_at:`${a.date}T${a.start}:00+02:00`,ends_at:`${a.date}T${a.end}:00+02:00`,status:'PUBLISHED',version:1}))}catch{return []}
  }
  function absenceRows(){
    try{return (absences||[]).map(a=>({id:a.id,company_id:'demo-local-company',employee_id:a.employeeId,absence_type:a.type,start_date:a.startDate||a.date,end_date:a.endDate||a.startDate||a.date,status:a.status||'Genehmigt',full_day:a.fullDay!==false,note:a.note||'',request_source:a.requestSource||'MANAGER',requested_at:a.requestedAt||new Date().toISOString()}))}catch{return []}
  }
  function employeeAccount(monthValue){
    const month=String(monthValue||new Date().toISOString().slice(0,7)).slice(0,7),holidays=monthlyHolidays(month).holidays;
    const rows=read(TIME_KEY,timeRows),own=rows.filter(r=>r.employee_name==='Anna Becker'&&String(r.actual_start||r.starts_at||'').startsWith(month));
    const work=own.filter(r=>r.entry_status==='confirmed').reduce((sum,r)=>sum+Math.max(0,Math.round((new Date(r.actual_end)-new Date(r.actual_start))/60000)-Number(r.actual_break_minutes||0)),0);
    const [y,m]=month.split('-').map(Number),days=new Date(y,m,0).getDate(),weekdays=Array.from({length:days},(_,i)=>new Date(y,m-1,i+1)).filter(d=>d.getDay()>0&&d.getDay()<6).length,holidayMinutes=holidays.filter(x=>x.target_relevant).length*480,target=weekdays*480-holidayMinutes;
    const pending=own.filter(r=>['recorded','correction_requested'].includes(r.entry_status)).length,balance=work-target;
    return {month,target_minutes:target,confirmed_work_minutes:work,absence_credit_minutes:0,credited_total_minutes:work,month_balance_minutes:balance,account_balance_minutes:270+balance,account_started:true,effective_account_start:accountSettings.account_start_date,pending_entries:pending,federal_state:accountSettings.federal_state,holidays,holiday_minutes:holidayMinutes};
  }

  function managerAccountRows(monthValue){
    const month=String(monthValue||new Date().toISOString().slice(0,7)).slice(0,7),[y,m]=month.split('-').map(Number),days=new Date(y,m,0).getDate(),weekdays=Array.from({length:days},(_,i)=>new Date(y,m-1,i+1)).filter(d=>d.getDay()>0&&d.getDay()<6).length,holidayDays=monthlyHolidays(month).holidays.filter(x=>x.target_relevant).length,current=read(TIME_KEY,timeRows);
    const fallback=timeBundle().employees;
    return fallback.map((e,i)=>{const profile=employeeRows().find(x=>x.id===e.employee_id)||{},weekly=Number(profile.weekly_hours||(i%4===2?32:40)),daily=Math.round(weekly*12),target=Math.max(0,(weekdays-holidayDays)*daily),entries=current.filter(r=>r.employee_id===e.employee_id&&String(r.actual_start||r.starts_at||'').startsWith(month)),confirmed=entries.filter(r=>r.entry_status==='confirmed').reduce((sum,r)=>sum+Math.max(0,Math.round((new Date(r.actual_end)-new Date(r.actual_start))/60000)-Number(r.actual_break_minutes||0)),0),work=confirmed||Math.min(target,Math.round(target*(.88+i*.012))),absence=i===2?daily:0,credited=work+absence,balance=credited-target;return {...e,employment:profile.employment||(weekly<40?'Teilzeit':'Vollzeit'),weekly_hours:weekly,target_minutes:target,confirmed_work_minutes:work,absence_credit_minutes:absence,credited_total_minutes:credited,month_balance_minutes:balance,account_balance_minutes:balance+(i-3)*90,account_started:true,effective_account_start:accountSettings.account_start_date,pending_entries:entries.filter(r=>['recorded','correction_requested'].includes(r.entry_status)).length,opening_balance_minutes:0}});
  }

  function demoRpc(name,args={}){
    if(name==='employee_list_disruption_offers')return {data:clone(disruptionRows),error:null};
    if(name==='employee_respond_disruption_offer'){
      const offer=disruptionRows.find(item=>String(item.offer_id)===String(args.p_offer_id));
      if(!offer)return {data:null,error:{message:'Demo-Ersatzanfrage wurde nicht gefunden.'}};
      if(offer.offer_status!=='OFFERED')return {data:null,error:{message:'Diese Demo-Ersatzanfrage wurde bereits beantwortet.'}};
      const decision=String(args.p_decision||'').toUpperCase();
      if(!['ACCEPT','DECLINE'].includes(decision))return {data:null,error:{message:'Ungültige Entscheidung.'}};
      offer.offer_status=decision==='ACCEPT'?'ACCEPTED':'DECLINED';offer.employee_comment=String(args.p_comment||'').slice(0,1000);offer.responded_at=new Date().toISOString();saveDisruptions();
      return {data:[{status:offer.offer_status,message:decision==='ACCEPT'?'Schicht wurde in der Demo als übernommen markiert.':'Anfrage abgelehnt. Die Disposition wurde informiert.',assignment_id:offer.assignment_id}],error:null};
    }
    if(name==='employee_respond_to_shift_change'){
      const state=read(SHIFT_CHANGE_KEY,{requests:[],approvals:[]});
      const request=(state.requests||[]).find(item=>String(item.id)===String(args.p_change_id));
      if(!request)return {data:null,error:{message:'Demo-Schichtänderung wurde nicht gefunden.'}};
      const approval=(state.approvals||[]).find(item=>item.change_request_id===request.id&&item.approval_type==='EMPLOYEE');
      if(!approval||approval.status!=='PENDING')return {data:null,error:{message:'Diese Demo-Schichtänderung wurde bereits beantwortet.'}};
      const decision=String(args.p_decision||'').toUpperCase();
      if(!['APPROVED','REJECTED'].includes(decision))return {data:null,error:{message:'Ungültige Entscheidung.'}};
      approval.status=decision;approval.responded_at=new Date().toISOString();approval.comment=String(args.p_comment||'').slice(0,1000);
      request.status=decision==='APPROVED'?'READY_TO_APPLY':'REJECTED';request.updated_at=new Date().toISOString();
      write(SHIFT_CHANGE_KEY,state);
      return {data:[{status:request.status,message:decision==='APPROVED'?'Schichtänderung wurde in der Demo bestätigt.':'Schichtänderung wurde in der Demo abgelehnt.'}],error:null};
    }
    if(name==='manager_list_shift_marketplace')return {data:clone(marketRows),error:null};
    if(name==='employee_list_shift_marketplace'){
      const employeeName='Anna Becker';
      const rows=marketRows
        .filter(row=>row.status==='MARKET_OPEN'||row.offered_by===employeeName||row.claimed_by===employeeName)
        .map(row=>{
          const isOwn=row.offered_by===employeeName;
          const canTake=row.status==='MARKET_OPEN'&&!isOwn;
          return {...row,is_own:isOwn,employee_role:'Sicherheitsmitarbeiter',can_take:canTake,block_reason:null,requested_at:row.requested_at||row.starts_at};
        });
      return {data:clone(rows),error:null};
    }
    if(name==='employee_offer_shift_marketplace'){
      const assignmentId=String(args.p_assignment_id||'');
      const active=marketRows.find(row=>row.assignment_id===assignmentId&&['MARKET_OPEN','PENDING_COLLEAGUE','PENDING_MANAGER'].includes(row.status));
      if(active)return {data:null,error:{message:'Für diese Schicht läuft bereits ein Angebot'}};
      const assignment=assignmentRows().find(row=>String(row.id)===assignmentId);
      if(!assignment)return {data:null,error:{message:'Demo-Schicht wurde nicht gefunden.'}};
      const row={id:`demo-market-${Date.now()}`,assignment_id:assignment.id,shift_code:assignment.shift_code,starts_at:assignment.starts_at,ends_at:assignment.ends_at,offered_by:'Anna Becker',claimed_by:null,reason:String(args.p_reason||'').slice(0,1000),status:'MARKET_OPEN',colleague_comment:null,requested_at:new Date().toISOString()};
      marketRows.unshift(row);saveMarket();return {data:row.id,error:null};
    }
    if(name==='employee_claim_shift_marketplace'){
      const row=marketRows.find(item=>String(item.id)===String(args.p_offer_id));
      if(!row||row.status!=='MARKET_OPEN')return {data:null,error:{message:'Dieses Angebot ist nicht mehr verfügbar'}};
      if(row.offered_by==='Anna Becker')return {data:null,error:{message:'Eigene Schichten können nicht übernommen werden'}};
      row.claimed_by='Anna Becker';row.status='PENDING_MANAGER';row.colleague_comment=String(args.p_comment||'').slice(0,1000);row.updated_at=new Date().toISOString();saveMarket();
      return {data:'PENDING_MANAGER',error:null};
    }
    if(name==='employee_cancel_shift_swap'){
      const row=marketRows.find(item=>String(item.id)===String(args.p_swap_id));
      if(!row)return {data:null,error:{message:'Demo-Angebot wurde nicht gefunden.'}};
      if(row.offered_by!=='Anna Becker')return {data:null,error:{message:'Dieses Angebot gehört nicht zum Demo-Profil.'}};
      if(!['MARKET_OPEN','PENDING_COLLEAGUE','PENDING_MANAGER'].includes(row.status))return {data:null,error:{message:'Dieses Angebot kann nicht mehr zurückgezogen werden.'}};
      row.status='CANCELLED';row.updated_at=new Date().toISOString();saveMarket();return {data:'CANCELLED',error:null};
    }
    if(name==='manager_review_shift_swap'){
      const row=marketRows.find(x=>x.id===args.p_swap_id);if(!row)return {data:null,error:{message:'Demo-Vorgang wurde nicht gefunden.'}};
      if(row.status!=='PENDING_MANAGER')return {data:null,error:{message:'Dieser Demo-Vorgang wurde bereits bearbeitet.'}};
      row.status=args.p_decision==='APPROVE'?'APPLIED':'REJECTED_MANAGER';row.manager_comment=args.p_comment||'';row.reviewed_at=new Date().toISOString();saveMarket();return {data:{id:row.id,status:row.status},error:null};
    }
    if(name==='manager_list_time_entries'){timeRows=read(TIME_KEY,timeRows);return {data:clone(timeRows),error:null}}
    if(name==='manager_save_time_entry'){
      timeRows=read(TIME_KEY,timeRows);
      const row=timeRows.find(x=>x.assignment_id===args.p_assignment_id);if(!row)return {data:null,error:{message:'Demo-Zeiteintrag wurde nicht gefunden.'}};
      row.actual_start=args.p_actual_start;row.actual_end=args.p_actual_end;row.actual_break_minutes=Number(args.p_break_minutes||0);row.manager_note=args.p_note||'';row.entry_status=args.p_confirm?'confirmed':'recorded';row.correction_note='';saveTime();return {data:clone(row),error:null};
    }
    if(name==='manager_bulk_record_time_entries'){
      timeRows=read(TIME_KEY,timeRows);const start=String(args.p_start_date||''),end=String(args.p_end_date||''),now=Date.now();let updated=0,existing=0,future=0;
      timeRows.filter(row=>String(row.starts_at||'').slice(0,10)>=start&&String(row.starts_at||'').slice(0,10)<=end).forEach(row=>{if(row.entry_status!=='open'||row.actual_start||row.actual_end){existing++;return}if(new Date(row.ends_at).getTime()>now){future++;return}row.actual_start=row.starts_at;row.actual_end=row.ends_at;row.actual_break_minutes=Number(row.planned_break_minutes||0);row.manager_note=args.p_note||'';row.entry_status=args.p_confirm?'confirmed':'recorded';row.correction_note='';updated++});saveTime();return {data:{total:updated+existing+future,updated,status:args.p_confirm?'confirmed':'recorded',skippedExisting:existing,skippedFuture:future,skippedClosed:0,skippedUnpublished:0,skippedInvalid:0},error:null};
    }
    if(name==='manager_review_time_entry'){
      timeRows=read(TIME_KEY,timeRows);
      const row=timeRows.find(x=>x.assignment_id===args.p_assignment_id);if(!row)return {data:null,error:{message:'Demo-Zeiteintrag wurde nicht gefunden.'}};
      if(args.p_decision==='CORRECTION'){row.entry_status='correction_requested';row.correction_note=args.p_comment||'Bitte Zeitangabe prüfen.';}saveTime();return {data:clone(row),error:null};
    }
    if(name==='manager_time_month_status'){
      const month=String(args.p_month||'').slice(0,7),now=new Date(),cur=`${now.getFullYear()}-${pad(now.getMonth()+1)}`;
      return {data:{status:month<cur?'CLOSED':'OPEN',closed_at:month<cur?new Date().toISOString():null,revision:month<cur?1:0},error:null};
    }
    if(name==='manager_time_report_bundle')return {data:timeBundle(),error:null};
    if(name==='manager_log_datev_lodas_export')return {data:{logged:true,demo:true},error:null};
    if(name==='manager_authorize_datev_lodas_export'){
      if(Number(args.p_expected_closure_revision)!==1)return {data:null,error:{message:'Der Demo-Monatsabschluss wurde seit der Vorprüfung geändert.'}};
      if(Number(args.p_row_count)<1||!/^[0-9a-f]{64}$/.test(String(args.p_content_sha256||'')))return {data:null,error:{message:'Die Demo-Exportfreigabe ist unvollständig.'}};
      return {data:'00000000-0000-4000-8000-000000000008',error:null};
    }
    if(name==='manager_monthly_holidays')return {data:monthlyHolidays(args.p_month),error:null};
    if(name==='manager_update_time_account_settings'||name==='manager_update_time_account_settings_v2'){
      accountSettings={...accountSettings,account_start_date:args.p_account_start_date||accountSettings.account_start_date,credited_absence_types:args.p_credited_absence_types||accountSettings.credited_absence_types,federal_state:args.p_federal_state||accountSettings.federal_state};saveAccount();return {data:clone(accountSettings),error:null};
    }
    if(name==='manager_monthly_time_accounts'){
      return {data:managerAccountRows(args.p_month),error:null};
    }
    if(name==='manager_set_time_account_opening')return {data:{saved:true,demo:true},error:null};
    if(name==='employee_my_time_account_month')return {data:employeeAccount(args.p_month),error:null};
    if(name==='employee_list_shift_swaps')return {data:clone(marketRows.filter(x=>x.status!=='MARKET_OPEN').map(x=>({...x,direction:x.claimed_by==='Anna Becker'?'INCOMING':'OUTGOING',other_employee_name:x.claimed_by||x.offered_by}))),error:null};
    if(name==='employee_list_shift_swap_candidates')return {data:employeeRows().filter(x=>x.id!=='demo-e01').slice(0,5).map(x=>({employee_id:x.id,display_name:`${x.first_name} ${x.last_name}`,employee_role:'Sicherheitsmitarbeiter'})),error:null};
    if(name==='employee_create_shift_swap')return {data:{id:`demo-swap-${Date.now()}`,status:'PENDING_COLLEAGUE'},error:null};
    if(name==='employee_respond_shift_swap')return {data:{saved:true,demo:true},error:null};
    if(name==='employee_submit_absence_request'){
      const rows=read(ABSENCE_KEY,[]),from=String(args.p_start_date||''),to=String(args.p_end_date||'');
      if(!from||!to||to<from)return {data:null,error:{message:'Bitte einen gültigen Zeitraum wählen.'}};
      const row={id:`demo-absence-${Date.now()}`,employee_id:'demo-e01',absence_type:String(args.p_absence_type||'Sonstiges'),start_date:from,end_date:to,status:'Beantragt',full_day:args.p_full_day!==false,start_time:args.p_start_time||null,end_time:args.p_end_time||null,note:String(args.p_note||'').slice(0,2000),requested_at:new Date().toISOString()};
      rows.unshift(row);write(ABSENCE_KEY,rows);return {data:{id:row.id,status:row.status,saved:true,demo:true},error:null};
    }
    if(name==='employee_submit_time_entry'){
      timeRows=read(TIME_KEY,timeRows);let row=timeRows.find(x=>String(x.assignment_id)===String(args.p_assignment_id));
      if(!row){const assignment=assignmentRows().find(x=>String(x.id)===String(args.p_assignment_id));row={assignment_id:String(args.p_assignment_id),employee_id:assignment?.employee_id||'demo-e01',employee_name:'Anna Becker',shift_code:assignment?.shift_code||'Schicht',starts_at:assignment?.starts_at||args.p_actual_start,ends_at:assignment?.ends_at||args.p_actual_end,planned_break_minutes:Number(args.p_break_minutes||0),manager_note:'',correction_note:''};timeRows.push(row)}
      row.actual_start=args.p_actual_start;row.actual_end=args.p_actual_end;row.actual_break_minutes=Number(args.p_break_minutes||0);row.employee_note=String(args.p_note||'').slice(0,1000);row.entry_status='recorded';row.submitted_at=new Date().toISOString();row.correction_note='';saveTime();return {data:clone(row),error:null};
    }
    if(name==='manager_review_absence_request')return {data:args.p_decision==='APPROVE'?'Genehmigt':'Abgelehnt',error:null};
    return null;
  }

  function demoFrom(table){
    const supported=new Set(['datev_lodas_settings','datev_lodas_rules','time_account_settings','shift_swap_requests','employees','shift_assignments','time_entries','shift_assignment_confirmations','absences']);
    if(!supported.has(table))return unsupportedQuery('Tabelle',table);
    let op='select',payload=null,filters={};
    const run=single=>{
      if(table==='time_account_settings'){
        if(op==='update'||op==='upsert'){accountSettings={...accountSettings,...payload};saveAccount()}
        return {data:single?clone(accountSettings):[clone(accountSettings)],error:null};
      }
      let source=null;
      if(table==='shift_swap_requests')source=marketRows;
      if(table==='employees')source=employeeRows();
      if(table==='shift_assignments')source=assignmentRows();
      if(table==='time_entries'){timeRows=read(TIME_KEY,timeRows);source=timeRows.map(x=>({assignment_id:x.assignment_id,actual_start:x.actual_start,actual_end:x.actual_end,break_minutes:x.actual_break_minutes,status:x.entry_status,employee_note:x.employee_note,manager_note:x.manager_note,correction_note:x.correction_note,submitted_at:x.submitted_at||null,confirmed_at:x.confirmed_at||null,version:x.version||1}))}
      if(table==='shift_assignment_confirmations')source=[];
      if(table==='absences')source=absenceRows();
      if(source){
        const rows=source.filter(row=>Object.entries(filters).every(([key,value])=>Array.isArray(value)?value.map(String).includes(String(row[key])):String(row[key])===String(value)));
        return {data:single?(rows[0]?clone(rows[0]):null):clone(rows),error:null};
      }
      if(table==='datev_lodas_settings'){
        if(op==='select')return {data:clone(datev.settings),error:null};
        return {data:clone(datev.settings),error:null};
      }
      if(op==='select')return {data:single?(datev.rules[0]?clone(datev.rules[0]):null):clone(datev.rules),error:null};
      if(op==='update'){
        const i=datev.rules.findIndex(r=>!filters.id||String(r.id)===String(filters.id));if(i>=0)datev.rules[i]={...datev.rules[i],...payload};saveDatev();return {data:i>=0?clone(datev.rules[i]):null,error:null};
      }
      if(op==='delete'){
        datev.rules=datev.rules.filter(r=>filters.id&&String(r.id)!==String(filters.id));saveDatev();return {data:null,error:null};
      }
      return {data:null,error:null};
    };
    const q={
      select(){op='select';return q},eq(k,v){filters[k]=v;return q},in(k,v){filters[k]=Array.isArray(v)?v:[];return q},order(){return q},limit(){return q},
      single(){return Promise.resolve(run(true))},
      maybeSingle(){return Promise.resolve(run(true))},
      upsert(row){if(table==='time_account_settings'){op='upsert';payload=row;return Promise.resolve(run(true))}datev.settings={...datev.settings,...row,company_id:datev.settings.company_id};saveDatev();return Promise.resolve({data:clone(datev.settings),error:null})},
      insert(row){const item={...row,id:`demo-datev-rule-${Date.now()}`,company_id:datev.settings.company_id,created_at:new Date().toISOString()};datev.rules.push(item);saveDatev();return Promise.resolve({data:clone(item),error:null})},
      update(row){op='update';payload=row;return q},delete(){op='delete';return q},
      then(resolve,reject){return Promise.resolve(run(false)).then(resolve,reject)}
    };return q;
  }

  function demoError(kind,name){return {message:`Demo-Funktion nicht lokal verfügbar: ${kind} ${name}`,code:'SF_DEMO_UNHANDLED',details:'Die Anfrage wurde sicher blockiert und nicht an Supabase gesendet.'}}
  function unsupportedQuery(kind,name){
    const result=()=>({data:null,error:demoError(kind,name)}),q={select(){return q},eq(){return q},in(){return q},order(){return q},limit(){return q},single(){return Promise.resolve(result())},maybeSingle(){return Promise.resolve(result())},insert(){return q},upsert(){return q},update(){return q},delete(){return q},then(resolve,reject){return Promise.resolve(result()).then(resolve,reject)}};return q;
  }

  function createDemoClient(){
    const authResult=()=>Promise.resolve({data:{session:null,user:null},error:null});
    return {
      __sfDemoLocalClientV1:true,
      rpc:async(name,args)=>demoRpc(name,args||{})||({data:null,error:demoError('RPC',name)}),
      from:table=>demoFrom(table),
      auth:{getSession:authResult,refreshSession:authResult,getUser:authResult,signOut:authResult,signUp:authResult,signInWithPassword:authResult,onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}
    };
  }
  window.SFDemoDataClient={create:createDemoClient,error:demoError};

  function patch(){
    if(!B.client||!B.client.__sfDemoLocalClientV1)B.client=createDemoClient();
    if(typeof B.client.rpc!=='function'||typeof B.client.from!=='function'){setTimeout(patch,60);return}
    if(!B.client.rpc.__sfDemoCloudV2){
      const wrappedRpc=async function(name,args){const demo=demoRpc(name,args||{});return demo||{data:null,error:demoError('RPC',name)}};
      wrappedRpc.__sfDemoCloudV2=true;B.client.rpc=wrappedRpc;
    }
    if(!B.client.from.__sfDemoCloudV2){
      const wrappedFrom=function(table){return demoFrom(table)};
      wrappedFrom.__sfDemoCloudV2=true;B.client.from=wrappedFrom;
    }
    if(typeof B.hydrate==='function'&&!B.hydrate.__sfDemoNoCloud){const noCloud=async()=>({demo:true});noCloud.__sfDemoNoCloud=true;B.hydrate=noCloud;}
    setTimeout(()=>{try{if(document.getElementById('view-time')?.classList.contains('active')&&typeof window.renderTimeTracking==='function')window.renderTimeTracking()}catch{}},80);
  }

  patch();[100,300,800,1600,3000].forEach(ms=>setTimeout(patch,ms));
})();
