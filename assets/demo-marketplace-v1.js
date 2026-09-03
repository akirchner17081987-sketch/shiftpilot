// SchichtFunk – isolierter Demo-Datenadapter V2
(function(){
  if(sessionStorage.getItem('sf_demo_session_v1')!=='active')return;
  if(window.__sfDemoCloudAdapterV2)return;window.__sfDemoCloudAdapterV2=true;

  const B=window.SFBackend=window.SFBackend||{};
  const MARKET_KEY='sf_demo_marketplace_v1';
  const TIME_KEY='sf_demo_time_tracking_v2';
  const DATEV_KEY='sf_demo_datev_v2';
  const pad=n=>String(n).padStart(2,'0');
  const clone=v=>JSON.parse(JSON.stringify(v));
  const mondayOf=d=>{const x=new Date(d);x.setHours(0,0,0,0);const day=x.getDay()||7;x.setDate(x.getDate()-day+1);return x};
  const plusDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
  const isoLocal=(d,h,m=0)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}:00+02:00`;
  const stamp=(dayOffset,hour,minute=0)=>{const d=new Date();d.setDate(d.getDate()+dayOffset);return isoLocal(d,hour,minute)};
  const read=(key,fallback)=>{try{const raw=sessionStorage.getItem(key);return raw?JSON.parse(raw):fallback}catch{return fallback}};
  const write=(key,value)=>{try{sessionStorage.setItem(key,JSON.stringify(value))}catch{}};

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

  let marketRows=seedMarketplace(),timeRows=seedTime(),datev=seedDatev();
  const saveMarket=()=>write(MARKET_KEY,marketRows),saveTime=()=>write(TIME_KEY,timeRows),saveDatev=()=>write(DATEV_KEY,datev);

  function timeBundle(){
    const names=[['demo-e01','Anna Becker','1001',2250],['demo-e02','Lukas Fischer','1002',2310],['demo-e03','Mira Schulz','1003',1800],['demo-e04','Jonas Wagner','1004',2250],['demo-e06','Daniel Koch','1006',2400],['demo-e08','Paul Klein','1008',2190],['demo-e11','Marie Schwarz','1011',2070],['demo-e13','Laura Braun','1013',2280]];
    return {employees:names.map(x=>({employee_id:x[0],employee_name:x[1],personnel_no:x[2],confirmed_work_minutes:x[3]})),details:[{employee_id:'demo-e03',employee_name:'Mira Schulz',work_date:'2026-08-17',absence_types:'Urlaub',absence_credit_minutes:480}]};
  }

  function demoRpc(name,args={}){
    if(name==='manager_list_shift_marketplace')return {data:clone(marketRows),error:null};
    if(name==='manager_review_shift_swap'){
      const row=marketRows.find(x=>x.id===args.p_swap_id);if(!row)return {data:null,error:{message:'Demo-Vorgang wurde nicht gefunden.'}};
      if(row.status!=='PENDING_MANAGER')return {data:null,error:{message:'Dieser Demo-Vorgang wurde bereits bearbeitet.'}};
      row.status=args.p_decision==='APPROVE'?'APPLIED':'REJECTED_MANAGER';row.manager_comment=args.p_comment||'';row.reviewed_at=new Date().toISOString();saveMarket();return {data:{id:row.id,status:row.status},error:null};
    }
    if(name==='manager_list_time_entries')return {data:clone(timeRows),error:null};
    if(name==='manager_save_time_entry'){
      const row=timeRows.find(x=>x.assignment_id===args.p_assignment_id);if(!row)return {data:null,error:{message:'Demo-Zeiteintrag wurde nicht gefunden.'}};
      row.actual_start=args.p_actual_start;row.actual_end=args.p_actual_end;row.actual_break_minutes=Number(args.p_break_minutes||0);row.manager_note=args.p_note||'';row.entry_status=args.p_confirm?'confirmed':'recorded';row.correction_note='';saveTime();return {data:clone(row),error:null};
    }
    if(name==='manager_review_time_entry'){
      const row=timeRows.find(x=>x.assignment_id===args.p_assignment_id);if(!row)return {data:null,error:{message:'Demo-Zeiteintrag wurde nicht gefunden.'}};
      if(args.p_decision==='CORRECTION'){row.entry_status='correction_requested';row.correction_note=args.p_comment||'Bitte Zeitangabe prüfen.';}saveTime();return {data:clone(row),error:null};
    }
    if(name==='manager_time_month_status'){
      const month=String(args.p_month||'').slice(0,7),now=new Date(),cur=`${now.getFullYear()}-${pad(now.getMonth()+1)}`;
      return {data:{status:month<cur?'CLOSED':'OPEN',closed_at:month<cur?new Date().toISOString():null},error:null};
    }
    if(name==='manager_time_report_bundle')return {data:timeBundle(),error:null};
    if(name==='manager_log_datev_lodas_export')return {data:{logged:true,demo:true},error:null};
    return null;
  }

  function demoFrom(table){
    if(table!=='datev_lodas_settings'&&table!=='datev_lodas_rules')return null;
    let op='select',payload=null,filters={};
    const run=single=>{
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
      select(){op='select';return q},eq(k,v){filters[k]=v;return q},order(){return q},
      maybeSingle(){return Promise.resolve(run(true))},
      upsert(row){datev.settings={...datev.settings,...row,company_id:datev.settings.company_id};saveDatev();return Promise.resolve({data:clone(datev.settings),error:null})},
      insert(row){const item={...row,id:`demo-datev-rule-${Date.now()}`,company_id:datev.settings.company_id,created_at:new Date().toISOString()};datev.rules.push(item);saveDatev();return Promise.resolve({data:clone(item),error:null})},
      update(row){op='update';payload=row;return q},delete(){op='delete';return q},
      then(resolve,reject){return Promise.resolve(run(false)).then(resolve,reject)}
    };return q;
  }

  function patch(){
    if(!B.client||typeof B.client.rpc!=='function'||typeof B.client.from!=='function'){setTimeout(patch,60);return}
    if(!B.client.rpc.__sfDemoCloudV2){
      const originalRpc=B.client.rpc.bind(B.client);
      const wrappedRpc=async function(name,args){const demo=demoRpc(name,args||{});if(demo)return demo;return originalRpc(name,args)};
      wrappedRpc.__sfDemoCloudV2=true;B.client.rpc=wrappedRpc;
    }
    if(!B.client.from.__sfDemoCloudV2){
      const originalFrom=B.client.from.bind(B.client);
      const wrappedFrom=function(table){return demoFrom(table)||originalFrom(table)};
      wrappedFrom.__sfDemoCloudV2=true;B.client.from=wrappedFrom;
    }
    if(typeof B.hydrate==='function'&&!B.hydrate.__sfDemoNoCloud){const noCloud=async()=>({demo:true});noCloud.__sfDemoNoCloud=true;B.hydrate=noCloud;}
    setTimeout(()=>{try{if(document.getElementById('view-time')?.classList.contains('active')&&typeof window.renderTimeTracking==='function')window.renderTimeTracking()}catch{}},80);
  }

  patch();[100,300,800,1600,3000].forEach(ms=>setTimeout(patch,ms));
})();
