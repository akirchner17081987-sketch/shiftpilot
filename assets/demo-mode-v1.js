// SchichtFunk – isolierter Präsentations-Demo-Modus V1
(function(){
  if(window.__sfDemoModeV1)return;
  if(sessionStorage.getItem('sf_demo_session_v1')!=='active')return;
  window.__sfDemoModeV1=true;

  const B=window.SFBackend=window.SFBackend||{};
  const DEMO_EMAIL='demo@schichtfunk.de';
  const DEMO_COMPANY='SchichtFunk Demo GmbH';
  const DEMO_USER='Demo Administrator';
  const DATA_PREFIX='sf_demo_data_';
  const pad=n=>String(n).padStart(2,'0');
  const localIso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const mondayOf=d=>{const x=new Date(d);x.setHours(0,0,0,0);const day=x.getDay()||7;x.setDate(x.getDate()-day+1);return x};
  const plusDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};

  const shiftDefaults={
    O1:['07:00','15:00'],O1S:['18:00','04:00'],O2:['15:00','23:00'],QA:['20:00','06:00'],
    Teamleiter:['08:00','16:00'],O3:['23:00','07:00'],OT1:['10:00','18:00'],OT2:['12:00','20:00'],OT:['18:00','02:00']
  };
  const staffing={O1:3,O1S:0,O2:2,QA:0,Teamleiter:2,O3:2,OT1:1,OT2:2,OT:3};
  const staff=[
    ['D001','Anna','Becker','Sicherheitsmitarbeiter','Vollzeit',40,'O1',['O1','O2']],
    ['D002','Lukas','Fischer','Sicherheitsmitarbeiter','Vollzeit',40,'O1',['O1','O2']],
    ['D003','Mira','Schulz','Sicherheitsmitarbeiter','Vollzeit',40,'O1',['O1','O2']],
    ['D004','Jonas','Wagner','Sicherheitsmitarbeiter','Vollzeit',40,'O2',['O2','O1']],
    ['D005','Lea','Hoffmann','Sicherheitsmitarbeiter','Teilzeit',32,'O2',['O2','O1']],
    ['D006','Daniel','Koch','Teamleiter','Vollzeit',40,'Teamleiter',['Teamleiter','O1','O2']],
    ['D007','Sophie','Richter','Teamleiter','Vollzeit',40,'Teamleiter',['Teamleiter','O1','O2']],
    ['D008','Paul','Klein','Sicherheitsmitarbeiter','Vollzeit',40,'O3',['O3','OT']],
    ['D009','Nina','Wolf','Sicherheitsmitarbeiter','Vollzeit',40,'O3',['O3','OT']],
    ['D010','Tim','Neumann','Sicherheitsmitarbeiter','Teilzeit',32,'OT1',['OT1','OT2']],
    ['D011','Marie','Schwarz','Sicherheitsmitarbeiter','Vollzeit',40,'OT2',['OT2','OT1','OT']],
    ['D012','Emil','Zimmermann','Sicherheitsmitarbeiter','Vollzeit',40,'OT2',['OT2','OT1','OT']],
    ['D013','Laura','Braun','Sicherheitsmitarbeiter','Vollzeit',40,'OT',['OT','O3','OT2']],
    ['D014','Felix','Krüger','Sicherheitsmitarbeiter','Vollzeit',40,'OT',['OT','O3','OT2']],
    ['D015','Jana','Hartmann','Sicherheitsmitarbeiter','Teilzeit',32,'OT',['OT','O3','OT2']]
  ];

  function writeDemo(k,v){try{sessionStorage.setItem(DATA_PREFIX+k,JSON.stringify(v))}catch{}}
  function readDemo(k,d){try{const v=sessionStorage.getItem(DATA_PREFIX+k);return v==null?d:JSON.parse(v)}catch{return d}}

  function assignmentFor(emp,date,dayIndex){
    const primary=emp._demoPrimary;
    const times=shiftDefaults[primary]||['08:00','16:00'];
    return {id:`demo-as-${dayIndex}-${emp.personnelNo}`,date,type:primary,employeeId:emp.id,start:times[0],end:times[1],pause:30,note:'Demo-Dienstplan'};
  }

  function seedDemo(){
    try{
      if(typeof employees==='undefined'||typeof assignments==='undefined'||typeof absences==='undefined'||typeof globalSoll==='undefined'||typeof dailySoll==='undefined'||typeof timeEntries==='undefined'||typeof weekStart==='undefined'||typeof store==='undefined'||typeof TYPES==='undefined')return false;
      const mon=mondayOf(new Date());
      const dates=Array.from({length:7},(_,i)=>localIso(plusDays(mon,i)));
      employees=staff.map((r,i)=>({
        id:'demo-e'+pad(i+1),personnelNo:r[0],first:r[1],last:r[2],role:r[3],employment:r[4],weeklyHours:r[5],monthlyHours:'',
        startDate:'2024-01-01',contractEnd:'',birthDate:'',status:'active',email:`${String(r[1]).toLowerCase()}.${String(r[2]).toLowerCase().replaceAll('ä','ae').replaceAll('ö','oe').replaceAll('ü','ue').replaceAll('ß','ss')}@demo.schichtfunk.invalid`,
        phone:'',address:'',zip:'',city:'',shifts:r[7],qualifications:r[3]==='Teamleiter'?['§34a Sachkunde','Erste Hilfe','Teamleitung']:['§34a Sachkunde','Erste Hilfe'],note:'Fiktiver Demo-Datensatz',_demoPrimary:r[6]
      }));
      globalSoll={...staffing};
      dailySoll={};
      absences=[
        {id:'demo-a1',employeeId:'demo-e03',date:dates[2],startDate:dates[2],endDate:dates[2],type:'Urlaub',status:'Genehmigt',fullDay:true,note:'Demo-Abwesenheit'},
        {id:'demo-a2',employeeId:'demo-e05',date:dates[3],startDate:dates[3],endDate:dates[3],type:'Fortbildung',status:'Genehmigt',fullDay:true,note:'Demo-Fortbildung'},
        {id:'demo-a3',employeeId:'demo-e09',date:dates[4],startDate:dates[4],endDate:dates[4],type:'Krank',status:'Erfasst',fullDay:true,note:'Demo-Krankmeldung'}
      ];
      const absentKeys=new Set(absences.map(a=>`${a.employeeId}|${a.date}`));
      assignments=[];
      for(let day=0;day<5;day++){
        for(const emp of employees){
          if(absentKeys.has(`${emp.id}|${dates[day]}`))continue;
          assignments.push(assignmentFor(emp,dates[day],day));
        }
      }
      const sat=['D001','D004','D006','D008','D010','D011','D013','D014'];
      const sun=['D002','D007','D009','D012','D015'];
      for(const [day,nos] of [[5,sat],[6,sun]])for(const no of nos){const emp=employees.find(e=>e.personnelNo===no);if(emp)assignments.push(assignmentFor(emp,dates[day],day))}
      timeEntries={};
      assignments.filter(a=>a.date===dates[0]).slice(0,8).forEach((a,i)=>{
        const [sh,sm]=a.start.split(':').map(Number),[eh,em]=a.end.split(':').map(Number);
        const startMin=sh*60+sm+(i%3===0?6:0),endMin=(eh*60+em+(i%4===0?9:0))%(24*60);
        timeEntries[a.id]={actualStart:`${pad(Math.floor(startMin/60)%24)}:${pad(startMin%60)}`,actualEnd:`${pad(Math.floor(endMin/60)%24)}:${pad(endMin%60)}`,breakMin:30,status:i%2?'recorded':'confirmed'};
      });
      weekStart=mon;
      if(typeof selectedEmployeeId!=='undefined')selectedEmployeeId=employees[0]?.id||null;
      if(typeof selectedPlanEmployeeId!=='undefined')selectedPlanEmployeeId=null;
      if(typeof selectedType!=='undefined')selectedType='O1';
      TYPES.forEach(t=>{const v=shiftDefaults[t.id];if(v){t.start=v[0];t.end=v[1]}});

      store.get=(k,d)=>readDemo(k,d);
      store.set=(k,v)=>writeDemo(k,v);
      writeDemo('employees',employees);
      writeDemo('assignments',assignments);
      writeDemo('absences',absences);
      writeDemo('globalSoll',globalSoll);
      writeDemo('dailySoll',dailySoll);
      writeDemo('timeEntries',timeEntries);
      writeDemo('shiftTimes',Object.fromEntries(TYPES.map(t=>[t.id,{start:t.start,end:t.end}])));
      return true;
    }catch(err){console.error('SchichtFunk Demo Seed',err);return false}
  }

  function renderDemoState(){
    document.documentElement.dataset.sfDemo='1';
    document.querySelectorAll('.sf-auth-backdrop,#spAuthDialog,#sfAuthBackdrop').forEach(el=>el.remove());
    const company=document.querySelector('.company-card b');if(company&&company.textContent!==DEMO_COMPANY)company.textContent=DEMO_COMPANY;
    const companyIcon=document.querySelector('.company-icon');if(companyIcon&&companyIcon.textContent!=='D')companyIcon.textContent='D';
    const userRow=document.querySelector('.user-row');
    if(userRow){const b=userRow.querySelector('b'),small=userRow.querySelector('small'),avatar=userRow.querySelector('.avatar');if(b&&b.textContent!==DEMO_USER)b.textContent=DEMO_USER;if(small&&small.textContent!=='Demo-Administrator')small.textContent='Demo-Administrator';if(avatar&&avatar.textContent!=='DA')avatar.textContent='DA'}
    const cloud=document.getElementById('sfCloudState');if(cloud){if(cloud.textContent!=='● Demo-Modus')cloud.textContent='● Demo-Modus';cloud.classList.remove('off');cloud.title='Lokale Präsentations-Sandbox – keine Produktivdaten'}
    const audit=document.getElementById('sfAuditNav');if(audit)audit.hidden=true;
    const top=document.querySelector('.top-actions');
    if(top&&!document.getElementById('sfDemoExitBtn')){
      const btn=document.createElement('button');btn.id='sfDemoExitBtn';btn.className='iconbtn';btn.type='button';btn.textContent='Demo beenden';btn.onclick=exitDemo;top.appendChild(btn);
    }
    if(!document.getElementById('sfDemoBadge')){
      const badge=document.createElement('div');badge.id='sfDemoBadge';badge.textContent='DEMO-MODUS · BEISPIELDATEN';badge.title='Isolierte lokale Präsentationsumgebung';document.body.appendChild(badge);
    }
  }

  function addDemoCss(){
    if(document.getElementById('sfDemoModeCss'))return;
    const css=document.createElement('style');css.id='sfDemoModeCss';css.textContent=`
      #sfDemoBadge{position:fixed;right:18px;bottom:18px;z-index:30000;padding:8px 11px;border-radius:999px;border:1px solid #2a8b78;background:#0d332c;color:#8ff0d8;font:800 10px/1.2 Inter,system-ui,sans-serif;letter-spacing:.08em;box-shadow:0 10px 30px rgba(0,0,0,.28);pointer-events:none}
      html[data-sf-demo="1"] .company-card{border-color:#2b7566}html[data-sf-demo="1"] .company-icon{background:#2ed9b8}
      #sfDemoExitBtn{border-color:#2f6e62!important;color:#8ce9d4!important}
    `;document.head.appendChild(css);
  }

  function demoOpen(view='overview'){
    const landing=document.getElementById('landingPage'),app=document.getElementById('appShell');
    if(landing)landing.style.display='none';if(app)app.style.display='grid';
    const target=document.getElementById('view-'+view)?view:'overview';
    try{if(typeof switchView==='function')switchView(target)}catch(err){console.error(err)}
    window.scrollTo({top:0,behavior:'instant'});
    try{history.replaceState(null,'',location.pathname+'?demo=1#app')}catch{}
    renderDemoState();
  }

  function demoUserManagement(host){
    if(!host)return;
    host.innerHTML='<div class="sf-users-empty"><b>Demo-Modus</b><br>Benutzer, Einladungen und sicherheitskritische Kontoeinstellungen sind in der Präsentations-Sandbox deaktiviert.</div>';
  }

  function patchAuthLayer(){
    B.demo=true;B.demoMode=true;B.role='ADMIN';B.companyId='demo-local-company';B.user={id:'demo-local-user',email:DEMO_EMAIL,user_metadata:{name:DEMO_USER}};B.ready=false;
    B.authDialog=()=>demoOpen('overview');
    B.showAuth=()=>demoOpen('overview');
    B.updateState=()=>renderDemoState();
    B.renderUserManagement=demoUserManagement;
    B.confirmSignOut=exitDemo;
    B.signOutSafely=async()=>{exitDemo();return true};
    window.openApp=demoOpen;
    renderDemoState();
  }

  function restoreProductAuth(){
    const raw=sessionStorage.getItem('sf_demo_auth_backup_v1');
    if(!raw)return;
    let backup;try{backup=JSON.parse(raw)}catch{return}
    for(const storage of [localStorage,sessionStorage]){
      for(let i=storage.length-1;i>=0;i--){const key=storage.key(i);if(key&&/^sb-.*-auth-token$/i.test(key))storage.removeItem(key)}
    }
    for(const [k,v] of Object.entries(backup.local||{}))if(v!=null)localStorage.setItem(k,v);
    for(const [k,v] of Object.entries(backup.session||{}))if(v!=null)sessionStorage.setItem(k,v);
  }

  function exitDemo(){
    const backup=sessionStorage.getItem('sf_demo_auth_backup_v1');
    Object.keys(sessionStorage).filter(k=>k.startsWith('sf_demo_')).forEach(k=>sessionStorage.removeItem(k));
    if(backup)sessionStorage.setItem('sf_demo_auth_backup_v1',backup);
    restoreProductAuth();
    sessionStorage.removeItem('sf_demo_auth_backup_v1');
    location.replace('/demo');
  }
  window.sfExitDemo=exitDemo;

  function rerender(){
    try{if(typeof renderLibrary==='function')renderLibrary();if(typeof renderPlanEmployeePool==='function')renderPlanEmployeePool();if(typeof renderCalendar==='function')renderCalendar();if(typeof renderEmployees==='function')renderEmployees();if(typeof renderTimeTracking==='function')renderTimeTracking();if(typeof renderAbsenceDashboard==='function')renderAbsenceDashboard();if(typeof renderSettings==='function')renderSettings();if(typeof renderOverview==='function')renderOverview()}catch(err){console.error('SchichtFunk Demo Render',err)}
  }

  function start(){
    if(!seedDemo()){setTimeout(start,60);return}
    addDemoCss();patchAuthLayer();demoOpen('overview');rerender();
    [50,180,500,1200,2500].forEach(ms=>setTimeout(()=>{patchAuthLayer();demoOpen(document.querySelector('.view.active')?.id?.replace('view-','')||'overview')},ms));
    const observer=new MutationObserver(()=>renderDemoState());
    observer.observe(document.body,{childList:true,subtree:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
