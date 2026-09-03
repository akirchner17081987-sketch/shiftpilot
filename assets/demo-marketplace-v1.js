// SchichtFunk – Demo-Datenadapter für den Schicht-Marktplatz V1
(function(){
  if(sessionStorage.getItem('sf_demo_session_v1')!=='active')return;
  if(window.__sfDemoMarketplaceV1)return;window.__sfDemoMarketplaceV1=true;

  const B=window.SFBackend=window.SFBackend||{};
  const KEY='sf_demo_marketplace_v1';
  const pad=n=>String(n).padStart(2,'0');
  const stamp=(dayOffset,hour,minute=0)=>{
    const d=new Date();
    d.setHours(hour,minute,0,0);
    d.setDate(d.getDate()+dayOffset);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00+02:00`;
  };

  function seed(){
    const existing=sessionStorage.getItem(KEY);
    if(existing){try{return JSON.parse(existing)}catch{}}
    const rows=[
      {id:'demo-market-01',assignment_id:'demo-as-market-01',shift_code:'O1',starts_at:stamp(1,7),offered_by:'Anna Becker',claimed_by:null,reason:'Privater Termin am Vormittag',status:'MARKET_OPEN',colleague_comment:null},
      {id:'demo-market-02',assignment_id:'demo-as-market-02',shift_code:'OT',starts_at:stamp(3,18),offered_by:'Felix Krüger',claimed_by:null,reason:'Tausch wegen Familienfeier',status:'MARKET_OPEN',colleague_comment:null},
      {id:'demo-market-03',assignment_id:'demo-as-market-03',shift_code:'OT2',starts_at:stamp(5,12),offered_by:'Marie Schwarz',claimed_by:null,reason:'Kurzfristige Terminüberschneidung',status:'MARKET_OPEN',colleague_comment:null},
      {id:'demo-market-04',assignment_id:'demo-as-market-04',shift_code:'O2',starts_at:stamp(2,15),offered_by:'Jonas Wagner',claimed_by:'Lea Hoffmann',reason:'Arzttermin',status:'PENDING_MANAGER',colleague_comment:'Ich kann die Schicht vollständig übernehmen.'},
      {id:'demo-market-05',assignment_id:'demo-as-market-05',shift_code:'Teamleiter',starts_at:stamp(4,8),offered_by:'Daniel Koch',claimed_by:'Sophie Richter',reason:'Fortbildung',status:'PENDING_MANAGER',colleague_comment:'Teamleiter-Freigabe und Zeitfenster passen.'},
      {id:'demo-market-06',assignment_id:'demo-as-market-06',shift_code:'O3',starts_at:stamp(-2,23),offered_by:'Paul Klein',claimed_by:'Nina Wolf',reason:'Privater Termin',status:'APPLIED',colleague_comment:'Übernahme bestätigt.'},
      {id:'demo-market-07',assignment_id:'demo-as-market-07',shift_code:'O1',starts_at:stamp(-5,7),offered_by:'Lukas Fischer',claimed_by:'Mira Schulz',reason:'Behördentermin',status:'APPLIED',colleague_comment:'Dienstplan wurde angepasst.'},
      {id:'demo-market-08',assignment_id:'demo-as-market-08',shift_code:'OT1',starts_at:stamp(-7,10),offered_by:'Tim Neumann',claimed_by:'Emil Zimmermann',reason:'Terminüberschneidung',status:'REJECTED_MANAGER',colleague_comment:'Wochenstunden hätten die Übernahme überschritten.'},
      {id:'demo-market-09',assignment_id:'demo-as-market-09',shift_code:'OT',starts_at:stamp(-9,18),offered_by:'Laura Braun',claimed_by:null,reason:'Angebot nicht mehr benötigt',status:'CANCELLED',colleague_comment:null}
    ];
    sessionStorage.setItem(KEY,JSON.stringify(rows));
    return rows;
  }

  let rows=seed();
  const save=()=>sessionStorage.setItem(KEY,JSON.stringify(rows));
  const clone=value=>JSON.parse(JSON.stringify(value));

  function demoRpc(name,args={}){
    if(name==='manager_list_shift_marketplace'){
      return {data:clone(rows),error:null};
    }
    if(name==='manager_review_shift_swap'){
      const row=rows.find(x=>x.id===args.p_swap_id);
      if(!row)return {data:null,error:{message:'Demo-Vorgang wurde nicht gefunden.'}};
      if(row.status!=='PENDING_MANAGER')return {data:null,error:{message:'Dieser Demo-Vorgang wurde bereits bearbeitet.'}};
      row.status=args.p_decision==='APPROVE'?'APPLIED':'REJECTED_MANAGER';
      row.manager_comment=args.p_comment||'';
      row.reviewed_at=new Date().toISOString();
      save();
      return {data:{id:row.id,status:row.status},error:null};
    }
    return null;
  }

  function patch(){
    if(!B.client||typeof B.client.rpc!=='function'){setTimeout(patch,60);return}
    if(B.client.rpc.__sfDemoMarketplace)return;
    const original=B.client.rpc.bind(B.client);
    const wrapped=async function(name,args){
      const demo=demoRpc(name,args||{});
      if(demo)return demo;
      return original(name,args);
    };
    wrapped.__sfDemoMarketplace=true;
    B.client.rpc=wrapped;

    if(typeof B.hydrate==='function'&&!B.hydrate.__sfDemoNoCloud){
      const noCloud=async()=>({demo:true});
      noCloud.__sfDemoNoCloud=true;
      B.hydrate=noCloud;
    }
  }

  patch();
  [100,300,800,1600].forEach(ms=>setTimeout(patch,ms));
})();
