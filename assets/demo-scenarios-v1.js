// SchichtFunk – vorbereitete Demo-Szenarien V1
(function(){
  if(window.__sfDemoScenariosV1)return;
  if(sessionStorage.getItem('sf_demo_session_v1')!=='active')return;
  window.__sfDemoScenariosV1=true;

  const B=window.SFBackend=window.SFBackend||{};
  const ACTIVE_KEY='sf_demo_scenario_v1';
  const BASELINE_KEY='sf_demo_scenario_baseline_v1';
  const DISRUPTION_KEY='sf_demo_disruptions_v1';
  const MONTH='2026-08';
  const STAFFING_DATE='2026-08-10';
  const STAFFING_SHIFT='O1';
  const ABSENCE_ID='demo-scenario-vacation';
  const scenarios={
    outage:{icon:'⚡',title:'Kurzfristiger Ausfall',badge:'Störfall-Autopilot',description:'Anna Becker fällt kurzfristig für die O1-Schicht aus. Passende Ersatzkräfte sind bereits priorisiert.',target:'disruptions',result:'Ausfall erkannt · 3 passende Ersatzkräfte verfügbar'},
    understaffing:{icon:'◔',title:'Unterbesetzung',badge:'Dienstplan',description:'Am 10. August fehlt in der O1-Schicht eine Person gegenüber der benötigten Besetzung.',target:'schedule',result:'10.08.2026 · O1 · eine Person unter Soll'},
    vacation:{icon:'☀',title:'Urlaubsantrag',badge:'Abwesenheiten',description:'Anna Becker hat für den 24. und 25. August Urlaub beantragt. Der Antrag wartet auf eine Entscheidung.',target:'absence',result:'Anna Becker · 24.–25.08.2026 · Beantragt'},
    deviation:{icon:'◷',title:'Zeitabweichung',badge:'Zeiterfassung',description:'Bei Anna Becker weicht die gemeldete Ist-Zeit deutlich von der geplanten O1-Schicht ab.',target:'time',result:'Anna Becker · +32 Minuten netto · Prüfung offen'},
    swap:{icon:'⇄',title:'Schichttausch',badge:'Schicht-Marktplatz',description:'Lea Hoffmann möchte eine O2-Schicht von Jonas Wagner übernehmen. Die Freigabe durch die Planung steht aus.',target:'marketplace',result:'Jonas Wagner → Lea Hoffmann · Freigabe ausstehend'}
  };
  let applying=false;

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read=(key,fallback)=>{try{const value=sessionStorage.getItem(key);return value?JSON.parse(value):fallback}catch{return fallback}};
  const write=(key,value)=>{try{sessionStorage.setItem(key,JSON.stringify(value))}catch{}};

  function css(){
    if(document.getElementById('sfDemoScenarioCss'))return;
    const style=document.createElement('style');style.id='sfDemoScenarioCss';style.textContent=`
      .sf-demo-scenarios-button{min-height:40px!important;padding:0 13px!important;border:1px solid #2d7668!important;border-radius:9px!important;background:#10342f!important;color:#83e6d0!important;font:850 11px Inter,system-ui,sans-serif!important;cursor:pointer;white-space:nowrap}
      .sf-demo-scenarios-button:hover{border-color:#43b9a2!important;background:#16443d!important}.sf-demo-scenarios-button.active:after{content:'';display:inline-block;width:6px;height:6px;margin-left:7px;border-radius:50%;background:#ffbd69;vertical-align:middle}
      .sf-demo-scenario-backdrop{position:fixed;inset:0;z-index:52000;display:grid;place-items:center;padding:20px;background:rgba(1,7,13,.9);backdrop-filter:blur(8px)}
      .sf-demo-scenario-dialog{width:min(940px,96vw);max-height:min(780px,92vh);overflow:auto;border:1px solid #31536b;border-radius:20px;background:linear-gradient(160deg,#102235,#07131f 70%);box-shadow:0 35px 110px rgba(0,0,0,.65)}
      .sf-demo-scenario-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:23px 25px 18px;border-bottom:1px solid #243d52}.sf-demo-scenario-head h2{margin:5px 0 7px;font-size:25px}.sf-demo-scenario-head p{max-width:650px;margin:0;color:#93a9bb;font-size:12px;line-height:1.55}
      .sf-demo-scenario-close{width:38px;height:38px;flex:0 0 auto;border:1px solid #35536a;border-radius:9px;background:#0a1927;color:#bdd0df;cursor:pointer}
      .sf-demo-scenario-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px;padding:19px 25px}.sf-demo-scenario-card{display:grid;grid-template-columns:44px 1fr auto;gap:12px;align-items:start;padding:15px;border:1px solid #29465d;border-radius:13px;background:#0b1a29;color:#edf6ff;text-align:left;cursor:pointer}.sf-demo-scenario-card:hover,.sf-demo-scenario-card:focus-visible{border-color:#34bca3;background:#10283a;outline:none}.sf-demo-scenario-card.current{border-color:#c9883a;background:#2a2016}.sf-demo-scenario-icon{width:42px;height:42px;display:grid;place-items:center;border:1px solid #276a5c;border-radius:11px;background:#10352f;color:#79e8cf;font-size:20px}.sf-demo-scenario-copy b,.sf-demo-scenario-copy small{display:block}.sf-demo-scenario-copy b{font-size:13px}.sf-demo-scenario-copy small{margin-top:5px;color:#8fa7ba;font-size:10px;line-height:1.48}.sf-demo-scenario-badge{padding:5px 7px;border:1px solid #34516a;border-radius:999px;color:#a9bfd1;font-size:8px;font-weight:900;white-space:nowrap}
      .sf-demo-scenario-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 25px 20px;border-top:1px solid #243d52;color:#7891a7;font-size:10px}.sf-demo-scenario-reset{min-height:38px;padding:0 12px;border:1px solid #40586d;border-radius:8px;background:#0a1825;color:#c1d1df;font-weight:800;cursor:pointer}
      .sf-demo-scenario-banner{display:flex;align-items:center;gap:12px;margin:0 0 16px;padding:12px 14px;border:1px solid #a86d2d;border-radius:12px;background:linear-gradient(100deg,#2c2115,#10202d);box-shadow:0 9px 28px rgba(0,0,0,.18)}.sf-demo-scenario-banner .symbol{width:38px;height:38px;display:grid;place-items:center;flex:0 0 auto;border-radius:10px;background:#4b321b;color:#ffd093;font-size:18px}.sf-demo-scenario-banner .copy{min-width:0;flex:1}.sf-demo-scenario-banner small,.sf-demo-scenario-banner b{display:block}.sf-demo-scenario-banner small{color:#d09b5e;font-size:8px;font-weight:900;letter-spacing:.11em}.sf-demo-scenario-banner b{margin-top:3px;color:#f3f7fa;font-size:12px}.sf-demo-scenario-banner button{min-height:32px;padding:0 9px;border:1px solid #4b6375;border-radius:7px;background:#0c1a27;color:#b8cbd9;font-size:9px;font-weight:850;cursor:pointer}
      @media(max-width:760px){.sf-demo-scenario-grid{grid-template-columns:1fr;padding:15px}.sf-demo-scenario-head{padding:19px 16px 15px}.sf-demo-scenario-foot{padding:14px 16px 18px;align-items:flex-start;flex-direction:column}.sf-demo-scenario-card{grid-template-columns:40px 1fr}.sf-demo-scenario-badge{grid-column:2}.sf-demo-scenario-banner{align-items:flex-start;flex-wrap:wrap}.sf-demo-scenario-banner .copy{min-width:calc(100% - 52px)}#sfEmployeePortal .sf-demo-scenarios-button{display:none!important}}
    `;document.head.appendChild(style);
  }

  function active(){const key=sessionStorage.getItem(ACTIVE_KEY);return scenarios[key]?key:null}
  function baseline(){
    let value=read(BASELINE_KEY,null);if(value)return value;
    try{value={staffing:Number(dailySoll?.[STAFFING_DATE]?.[STAFFING_SHIFT]??0)}}catch{value={staffing:0}}
    write(BASELINE_KEY,value);return value;
  }
  function saveDemoData(){
    try{store.set('dailySoll',dailySoll);store.set('absences',absences)}catch{}
  }
  function clearPreparedData(){
    const base=baseline();
    try{
      absences=absences.filter(a=>String(a.id)!==ABSENCE_ID);
      dailySoll[STAFFING_DATE]=dailySoll[STAFFING_DATE]||{};
      if(base.staffing>0)dailySoll[STAFFING_DATE][STAFFING_SHIFT]=base.staffing;else delete dailySoll[STAFFING_DATE][STAFFING_SHIFT];
      saveDemoData();
    }catch{}
  }
  function prepareUnderstaffing(){
    try{
      baseline();const assigned=assignments.filter(a=>a.date===STAFFING_DATE&&a.type===STAFFING_SHIFT).length;
      dailySoll[STAFFING_DATE]=dailySoll[STAFFING_DATE]||{};dailySoll[STAFFING_DATE][STAFFING_SHIFT]=Math.max(assigned+1,1);saveDemoData();
    }catch{}
  }
  function prepareVacation(){
    try{
      const anna=employees.find(e=>e.personnelNo==='D001')||employees[0];if(!anna)return;
      absences=absences.filter(a=>String(a.id)!==ABSENCE_ID).concat({id:ABSENCE_ID,employeeId:anna.id,date:'2026-08-24',startDate:'2026-08-24',endDate:'2026-08-25',type:'Urlaub',status:'Beantragt',fullDay:true,note:'Vorbereitetes Demo-Szenario'});saveDemoData();
    }catch{}
  }

  function disruptionState(){
    const saved=read(DISRUPTION_KEY,null);if(saved)return saved;
    const data={incident:{id:'demo-disruption-01',status:'OPEN',incident_type:'SICKNESS',shift_code:'O1',starts_at:'2026-09-05T07:00:00+02:00',original_employee:'Anna Becker',note:'Kurzfristige Krankmeldung vor Schichtbeginn',pending_count:0,accepted_employee:null},candidates:[
      {employee_id:'demo-e02',employee_name:'Lukas Fischer',employee_role:'Maschinenführer',planned_hours:30,score:96,reasons:['O1 freigegeben','Ruhezeit erfüllt','Erreichbar'],offer_status:null},
      {employee_id:'demo-e03',employee_name:'Mira Schulz',employee_role:'Produktion',planned_hours:27.5,score:91,reasons:['O1 freigegeben','Keine Überschneidung'],offer_status:null},
      {employee_id:'demo-e07',employee_name:'Sophie Richter',employee_role:'Springerin',planned_hours:24,score:88,reasons:['Kurzfristig verfügbar','Wochenstunden passen'],offer_status:null}
    ]};write(DISRUPTION_KEY,data);return data;
  }
  function patchRpc(){
    const rpc=B.client?.rpc;if(typeof rpc!=='function'||rpc.__sfDemoScenariosV1)return false;
    const base=rpc.bind(B.client),wrapped=async function(name,args={}){
      if(name==='manager_list_time_entries'&&active()==='deviation'){
        const result=await base(name,args);if(result?.error||!Array.isArray(result?.data))return result;
        const data=JSON.parse(JSON.stringify(result.data)),row=data.find(x=>x.employee_name==='Anna Becker')||data.find(x=>String(x.starts_at).includes('T07:'))||data[0];
        if(row){row.employee_name='Anna Becker';row.shift_code='O1';row.actual_start=String(row.starts_at).replace(/T\d\d:\d\d/,'T07:18');row.actual_end=String(row.ends_at).replace(/T\d\d:\d\d/,'T15:50');row.actual_break_minutes=30;row.entry_status='recorded';row.employee_note='Demo-Szenario: verspäteter Beginn und verlängerte Übergabe.'}
        return {data,error:null};
      }
      if(active()==='outage'){
        const state=disruptionState();
        if(name==='manager_list_disruptions')return {data:[JSON.parse(JSON.stringify(state.incident))],error:null};
        if(name==='manager_list_disruption_candidates')return {data:JSON.parse(JSON.stringify(state.candidates)),error:null};
        if(name==='manager_send_disruption_offers'){
          const ids=new Set(args.p_employee_ids||[]);state.candidates.forEach(c=>{if(ids.has(c.employee_id))c.offer_status='OFFERED'});state.incident.pending_count=state.candidates.filter(c=>c.offer_status==='OFFERED').length;write(DISRUPTION_KEY,state);return {data:ids.size,error:null};
        }
        if(name==='manager_cancel_disruption'){state.incident.status='CANCELLED';state.incident.pending_count=0;write(DISRUPTION_KEY,state);return {data:true,error:null}}
      }
      return base(name,args);
    };
    wrapped.__sfDemoScenariosV1=true;B.client.rpc=wrapped;return true;
  }

  function scenarioButton(){return '<button type="button" class="sf-demo-scenarios-button" data-demo-scenarios aria-haspopup="dialog">▦ Szenarien</button>'}
  function ensureButtons(){
    const manager=document.querySelector('#appShell .top-actions');
    if(manager&&!manager.querySelector('[data-demo-scenarios]'))manager.insertAdjacentHTML('afterbegin',scenarioButton());
    const employee=document.querySelector('#sfEmployeePortal .sf-portal-top');
    if(employee&&!employee.querySelector('[data-demo-scenarios]'))employee.insertAdjacentHTML('beforeend',scenarioButton());
    document.querySelectorAll('[data-demo-scenarios]').forEach(button=>{button.classList.toggle('active',!!active());button.onclick=openDialog});
  }
  function closeDialog(){document.getElementById('sfDemoScenarioModal')?.remove()}
  function openDialog(){
    css();closeDialog();const current=active(),modal=document.createElement('div');modal.id='sfDemoScenarioModal';modal.className='sf-demo-scenario-backdrop';modal.innerHTML=`<section class="sf-demo-scenario-dialog" role="dialog" aria-modal="true" aria-labelledby="sfDemoScenarioTitle"><header class="sf-demo-scenario-head"><div><div class="eyebrow">VORBEREITETE DEMO-FÄLLE</div><h2 id="sfDemoScenarioTitle">Welches Szenario möchten Sie zeigen?</h2><p>Ein Klick stellt den Beispieldatenstand her und öffnet automatisch den passenden Arbeitsbereich.</p></div><button class="sf-demo-scenario-close" aria-label="Szenario-Auswahl schließen">✕</button></header><main class="sf-demo-scenario-grid">${Object.entries(scenarios).map(([key,s])=>`<button type="button" class="sf-demo-scenario-card ${current===key?'current':''}" data-scenario="${key}"><span class="sf-demo-scenario-icon">${s.icon}</span><span class="sf-demo-scenario-copy"><b>${esc(s.title)}</b><small>${esc(s.description)}</small></span><span class="sf-demo-scenario-badge">${esc(s.badge)}</span></button>`).join('')}</main><footer class="sf-demo-scenario-foot"><span>Alle Fälle verwenden ausschließlich fiktive Demo-Daten.</span><button type="button" class="sf-demo-scenario-reset">Ausgangslage wiederherstellen</button></footer></section>`;document.body.appendChild(modal);
    modal.querySelector('.sf-demo-scenario-close').onclick=closeDialog;modal.onclick=e=>{if(e.target===modal)closeDialog()};modal.querySelectorAll('[data-scenario]').forEach(button=>button.onclick=()=>apply(button.dataset.scenario));modal.querySelector('.sf-demo-scenario-reset').onclick=reset;
    modal.querySelector('.sf-demo-scenario-close').focus();
  }

  function banner(){
    const key=active(),scenario=scenarios[key];if(!scenario)return;
    document.querySelectorAll('.sf-demo-scenario-banner').forEach(x=>x.remove());
    const target=document.getElementById('view-'+scenario.target);if(!target)return;
    const head=target.querySelector('.page-head'),box=document.createElement('div');box.className='sf-demo-scenario-banner';box.dataset.scenario=key;box.innerHTML=`<span class="symbol">${scenario.icon}</span><span class="copy"><small>AKTIVES DEMO-SZENARIO · ${esc(scenario.title)}</small><b>${esc(scenario.result)}</b></span><button type="button" data-change>Szenario wechseln</button><button type="button" data-reset>Ausgangslage</button>`;
    head?.insertAdjacentElement('afterend',box);if(!head)target.prepend(box);box.querySelector('[data-change]').onclick=openDialog;box.querySelector('[data-reset]').onclick=reset;
    ensureScenarioDetail();
  }
  function ensureScenarioDetail(){
    if(active()!=='deviation')return;
    const host=document.getElementById('timeDeviations');if(!host||host.querySelector('.sf-demo-time-case'))return;
    const row=document.createElement('div');row.className='section-box sf-time-dev sf-demo-time-case';row.innerHTML='<div><strong>Anna Becker · O1</strong><small>Vorbereitetes Szenario · Plan 7,50 Std. · Ist 8,03 Std. · Prüfung offen</small></div><span class="delta sf-time-diff pos">+0,53 Std.</span>';host.prepend(row);
  }
  function showTarget(key){
    const scenario=scenarios[key];if(!scenario)return;
    const needsManager=window.SFDemoPerspective?.current?.()!=='manager';
    if(needsManager)window.SFDemoPerspective?.set?.('manager');
    setTimeout(()=>{
      if(key==='outage')window.SFDisruptionAutopilot?.open?.();
      else if(key==='swap'){
        const market=document.querySelector('#nav [data-view="marketplace"]');market?.click();window.switchView?.('marketplace');
      }else{
        if(key==='understaffing')window.SchichtFunkCalendarView?.setMonth?.(MONTH);
        if(key==='deviation')sessionStorage.setItem('sf.time.selectedMonth',MONTH);
        window.switchView?.(scenario.target);
        if(key==='understaffing'){window.renderCalendar?.();window.renderPlanEmployeePool?.()}
        if(key==='vacation')window.renderAbsenceDashboard?.();
        if(key==='deviation'){
          const input=document.getElementById('sfTimeMonthPicker');if(input){input.value=MONTH;input.dispatchEvent(new Event('change',{bubbles:true}))}else window.renderTimeTracking?.();
        }
      }
      setTimeout(banner,220);window.scrollTo({top:0,behavior:'instant'});
    },needsManager?140:20);
  }
  function apply(key){
    if(applying||!scenarios[key])return;applying=true;clearPreparedData();sessionStorage.setItem(ACTIVE_KEY,key);
    if(key==='understaffing')prepareUnderstaffing();if(key==='vacation')prepareVacation();if(key==='outage')disruptionState();patchRpc();closeDialog();ensureButtons();showTarget(key);applying=false;
  }
  function reset(){
    clearPreparedData();sessionStorage.removeItem(ACTIVE_KEY);sessionStorage.removeItem(DISRUPTION_KEY);closeDialog();document.querySelectorAll('.sf-demo-scenario-banner').forEach(x=>x.remove());ensureButtons();window.SFDemoPerspective?.set?.('manager');setTimeout(()=>{window.switchView?.('overview');window.renderOverview?.();window.renderCalendar?.();window.renderAbsenceDashboard?.();showSaveToast?.('Ausgangslage wiederhergestellt','Das vorbereitete Szenario wurde beendet.')},80);
  }
  function boot(){css();patchRpc();ensureButtons();if(active())showTarget(active())}
  const observer=new MutationObserver(()=>{ensureButtons();ensureScenarioDetail()});
  function start(){boot();if(document.body)observer.observe(document.body,{childList:true,subtree:true});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDialog()});document.addEventListener('sf:demo-perspective-change',()=>setTimeout(ensureButtons,30))}
  window.SFDemoScenarios={open:openDialog,apply,reset,current:active,list:()=>Object.keys(scenarios)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
