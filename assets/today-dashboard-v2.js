// SchichtFunk – Heute-Dashboard V2
(function(){
  if(window.__sfTodayDashboardV2)return;
  window.__sfTodayDashboardV2=true;

  const B=window.SFBackend=window.SFBackend||{};
  const MANAGER=new Set(['OWNER','ADMIN','DISPATCHER','PLANNER']);
  const GRACE_MINUTES=15;
  const REFRESH_MS=20000;
  let timeRows=new Map(), incidents=[], loading=false, lastLoadedAt=0, timer=null;

  const pad=n=>String(n).padStart(2,'0');
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const parseDate=s=>{const [y,m,d]=String(s||'').split('-').map(Number);return new Date(y,m-1,d,12,0,0,0)};
  const addDays=(s,n)=>{const d=parseDate(s);d.setDate(d.getDate()+n);return iso(d)};
  const demo=()=>sessionStorage.getItem('sf_demo_session_v1')==='active';
  const today=()=>demo()?'2026-08-17':iso(new Date());
  const now=()=>demo()?new Date('2026-08-17T22:30:00'):new Date();
  const allAssignments=()=>typeof assignments!=='undefined'&&Array.isArray(assignments)?assignments:[];
  const allEmployees=()=>typeof employees!=='undefined'&&Array.isArray(employees)?employees:[];
  const allAbsences=()=>typeof absences!=='undefined'&&Array.isArray(absences)?absences:[];
  const allTypes=()=>typeof TYPES!=='undefined'&&Array.isArray(TYPES)?TYPES:[];
  const typeOf=a=>typeof typeById==='function'?typeById(a.type):null;
  const startOf=a=>a.start||typeOf(a)?.start||'00:00';
  const endOf=a=>a.end||typeOf(a)?.end||'00:00';
  const minutes=t=>{const [h,m]=String(t||'00:00').split(':').map(Number);return (h||0)*60+(m||0)};
  const published=a=>String(a?._dbStatus||a?.status||'').toUpperCase()==='PUBLISHED'||!!a?.publishedAt||!!a?.published_at;
  const cancelled=a=>String(a?._dbStatus||a?.status||'').toUpperCase()==='CANCELLED';
  const dbId=a=>String(a?._dbId||B.asgDb?.get?.(String(a?.id))||a?.id||'');
  const employee=id=>allEmployees().find(e=>String(e.id)===String(id));
  const employeeName=id=>{const e=employee(id);return e?`${e.first||''} ${e.last||''}`.trim():'Mitarbeiter'};
  const deTime=v=>{if(!v)return'';const d=v instanceof Date?v:new Date(v);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit'}).format(d)};
  const fmtDay=d=>parseDate(d).toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});

  function scheduled(a){
    const base=parseDate(a.date),[sh,sm]=startOf(a).split(':').map(Number),[eh,em]=endOf(a).split(':').map(Number);
    const s=new Date(base.getFullYear(),base.getMonth(),base.getDate(),sh||0,sm||0,0,0);
    const e=new Date(base.getFullYear(),base.getMonth(),base.getDate(),eh||0,em||0,0,0);
    if(e<=s)e.setDate(e.getDate()+1);
    return{start:s,end:e};
  }
  function relevantAssignments(d){
    const prev=addDays(d,-1),dayStart=parseDate(d);dayStart.setHours(0,0,0,0);
    return allAssignments().filter(a=>{
      if(cancelled(a))return false;
      if(a.date===d)return true;
      if(a.date!==prev)return false;
      const p=scheduled(a);return p.end>dayStart;
    });
  }
  function absenceOn(a,d){
    const st=String(a?.status||'Genehmigt').toLowerCase();
    if(st==='abgelehnt'||st==='rejected'||st==='cancelled')return false;
    const s=a.startDate||a.date,e=a.endDate||a.date||s;
    return !!s&&d>=s&&d<=e;
  }
  function absenceFor(employeeId,d){return allAbsences().find(a=>String(a.employeeId)===String(employeeId)&&absenceOn(a,d))||null}
  function urgentAbsence(a){return /krank|notfall|emergency/i.test(String(a?.type||''))}
  function rawLocalEntry(a){
    try{
      const e=typeof timeEntries!=='undefined'?timeEntries?.[a.id]:null;
      if(!e)return null;
      return{actualStart:e.actualStart||'',actualEnd:e.actualEnd||'',breakMin:Number(e.breakMin||0),status:e.status||''};
    }catch{return null}
  }
  function entry(a){return timeRows.get(dbId(a))||rawLocalEntry(a)}
  function parseActual(v){if(!v)return null;if(v instanceof Date)return v;const d=new Date(v);return Number.isNaN(d.getTime())?null:d}
  function state(a,d){
    const abs=absenceFor(a.employeeId,d),e=entry(a),plan=scheduled(a),n=now();
    const actualStart=parseActual(e?.actualStart),actualEnd=parseActual(e?.actualEnd);
    if(!published(a))return{key:'draft',label:'ENTWURF',cls:'warn',rank:5,detail:'Mitarbeiter noch nicht informiert'};
    if(abs)return{key:'absent',label:'ABWESEND',cls:'bad',rank:0,detail:String(abs.type||'Abwesenheit')};
    if(actualEnd)return{key:'finished',label:'AUSGECHECKT',cls:'good',rank:4,detail:`${deTime(actualStart)}–${deTime(actualEnd)}`};
    if(actualStart){
      const late=Math.max(0,Math.round((actualStart-plan.start)/60000));
      if(n>new Date(plan.end.getTime()+GRACE_MINUTES*60000))return{key:'checkout',label:'CHECK-OUT OFFEN',cls:'warn',rank:1,detail:`seit ${deTime(actualStart)} eingecheckt`};
      if(late>GRACE_MINUTES)return{key:'late',label:`VERSPÄTET +${late} MIN`,cls:'warn',rank:2,detail:`Check-in ${deTime(actualStart)}`};
      return{key:'checked',label:'EINGECHECKT',cls:'good',rank:3,detail:`Check-in ${deTime(actualStart)}`};
    }
    if(n>new Date(plan.start.getTime()+GRACE_MINUTES*60000)&&n<new Date(plan.end.getTime()+6*60*60000))return{key:'missing',label:'NICHT ERSCHIENEN',cls:'bad',rank:0,detail:`Dienstbeginn ${startOf(a)}`};
    if(n>=plan.end)return{key:'unrecorded',label:'KEINE ZEITBUCHUNG',cls:'warn',rank:2,detail:'Schichtzeit abgelaufen'};
    return{key:'upcoming',label:'GEPLANT',cls:'neutral',rank:6,detail:`Dienstbeginn ${startOf(a)}`};
  }
  function todayCoverage(d){
    const todays=allAssignments().filter(a=>a.date===d&&!cancelled(a));
    const rows=allTypes().map(t=>{
      let soll=0;try{soll=Number(getSoll(d,t.id)||0)}catch{}
      const ist=todays.filter(a=>a.type===t.id).length;
      return{type:t.id,soll,ist,open:Math.max(0,soll-ist)};
    }).filter(x=>x.soll||x.ist);
    return{rows,open:rows.reduce((n,x)=>n+x.open,0),under:rows.filter(x=>x.open>0).length};
  }
  function workWarnings(rows){
    const result=[];
    const byEmployee=new Map();
    rows.forEach(a=>{
      const id=String(a.employeeId),x=byEmployee.get(id)||{id,assignments:[],actual:0};x.assignments.push(a);
      const e=entry(a),s=parseActual(e?.actualStart),en=parseActual(e?.actualEnd);
      if(s&&en)x.actual+=Math.max(0,(en-s)/60000-Number(e?.breakMin||0));
      byEmployee.set(id,x);
    });
    byEmployee.forEach(x=>{
      if(x.assignments.length>1)result.push({kind:'double',employeeId:x.id,text:`${employeeName(x.id)}: ${x.assignments.length} Schichten berühren den heutigen Tag.`});
      if(x.actual>600)result.push({kind:'hours',employeeId:x.id,text:`${employeeName(x.id)}: ${(x.actual/60).toLocaleString('de-DE',{maximumFractionDigits:1})} Std. IST-Arbeitszeit.`});
      x.assignments.forEach(a=>{const st=state(a,today());if(st.key==='checkout')result.push({kind:'checkout',employeeId:x.id,text:`${employeeName(x.id)}: Check-out nach ${a.type} noch offen.`})});
    });
    return result;
  }
  function openIncidents(){return incidents.filter(x=>String(x.status||'').toUpperCase()==='OPEN')}
  function incidentForAssignment(a){const id=dbId(a);return openIncidents().find(x=>String(x.assignment_id||x.assignmentId||'')===id)}

  async function loadLive(force=false){
    if(demo()||loading||!B.client?.rpc||!B.companyId)return;
    if(!force&&Date.now()-lastLoadedAt<12000)return;
    loading=true;render(false);
    const d=today(),prev=addDays(d,-1);
    try{
      const [timeQ,disQ]=await Promise.all([
        B.client.rpc('manager_list_time_entries',{p_company_id:B.companyId,p_start_date:prev,p_end_date:d}),
        B.client.rpc('manager_list_disruptions',{p_company_id:B.companyId})
      ]);
      if(timeQ?.error)throw timeQ.error;
      if(disQ?.error)throw disQ.error;
      const next=new Map();
      (timeQ?.data||[]).forEach(r=>{
        const id=String(r.assignment_id||r.assignmentId||'');if(!id)return;
        next.set(id,{actualStart:r.actual_start||r.actualStart||'',actualEnd:r.actual_end||r.actualEnd||'',breakMin:Number(r.actual_break_minutes??r.breakMin??0),status:r.entry_status||r.status||''});
      });
      timeRows=next;incidents=disQ?.data||[];lastLoadedAt=Date.now();
    }catch(e){console.warn('[SchichtFunk Heute]',e?.message||e)}finally{loading=false;render(false)}
  }

  function css(){
    if(document.getElementById('sfTodayV2Css'))return;
    const s=document.createElement('style');s.id='sfTodayV2Css';s.textContent=`
      #view-overview.sf-today-v2{--td-good:#55ddbd;--td-warn:#ffc36e;--td-bad:#ff8799}#view-overview.sf-today-v2 .td-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:13px}#view-overview.sf-today-v2 .td-head h1{font-size:30px;margin:4px 0 3px}#view-overview.sf-today-v2 .td-head p{margin:0;color:#91a7bd;font-size:13px}#view-overview .td-live{display:inline-flex;align-items:center;gap:6px;margin-left:8px;padding:3px 7px;border:1px solid #2f665a;border-radius:999px;background:#0e2a24;color:#7be4ca;font-size:9px;font-weight:900;vertical-align:middle}#view-overview .td-live:before{content:'';width:6px;height:6px;border-radius:50%;background:#4be0be;box-shadow:0 0 0 4px rgba(75,224,190,.09)}#view-overview .td-head-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}#view-overview .td-head-actions button{min-height:44px}
      #view-overview .td-status{display:flex;gap:10px;align-items:center;margin-bottom:12px;padding:9px 12px;border:1px solid #294159;border-radius:10px;background:#0a1826;color:#849bad;font-size:10px}#view-overview .td-status b{color:#c9d8e4}#view-overview .td-status .td-spin{display:inline-block;width:9px;height:9px;border:2px solid #557086;border-top-color:#52dabc;border-radius:50%;animation:tdSpin .8s linear infinite}#view-overview .td-status time{margin-left:auto}@keyframes tdSpin{to{transform:rotate(360deg)}}
      #view-overview .td-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px;margin:0 0 13px}#view-overview .td-kpi{min-width:0;min-height:104px;padding:13px;border:1px solid #263c51;border-radius:12px;background:linear-gradient(145deg,#0f1d2d,#0a1724);cursor:default}#view-overview .td-kpi small{display:block;min-height:30px;color:#8fa5b9;font-size:10px;font-weight:800}#view-overview .td-kpi strong{display:block;margin-top:5px;font-size:25px}#view-overview .td-kpi em{display:block;margin-top:6px;color:#71899e;font-size:9px;font-style:normal;line-height:1.35}#view-overview .td-kpi.good strong{color:var(--td-good)}#view-overview .td-kpi.warn{border-color:#6d542d}#view-overview .td-kpi.warn strong{color:var(--td-warn)}#view-overview .td-kpi.bad{border-color:#703743;background:linear-gradient(145deg,#251922,#0c1723)}#view-overview .td-kpi.bad strong{color:var(--td-bad)}
      #view-overview .td-layout{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(330px,.7fr);gap:13px}#view-overview .td-column{display:grid;gap:13px;align-content:start}#view-overview .td-card{overflow:hidden;border:1px solid #263e54;border-radius:13px;background:#0d1a29;box-shadow:0 10px 30px rgba(0,0,0,.12)}#view-overview .td-card-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #21384c}#view-overview .td-card-head h3{margin:0;font-size:13px}#view-overview .td-card-head p{margin:3px 0 0;color:#7890a5;font-size:9px}#view-overview .td-card-head .badge{margin-left:auto}#view-overview .td-list{padding:9px 11px;max-height:430px;overflow:auto}#view-overview .td-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;margin-bottom:7px;padding:10px 11px;border:1px solid #263c51;border-radius:9px;background:#091725}#view-overview .td-row:last-child{margin-bottom:0}#view-overview .td-row b{display:block;font-size:11px;color:#dce8f2}#view-overview .td-row small{display:block;margin-top:3px;color:#8198ac;font-size:9px;line-height:1.4}#view-overview .td-row-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}#view-overview .td-row-actions button{min-height:36px;padding:6px 9px;font-size:9px}#view-overview .td-pill{display:inline-flex;align-items:center;min-height:25px;padding:3px 7px;border:1px solid #315467;border-radius:999px;background:#102231;color:#9eb4c7;font-size:8px;font-weight:900;white-space:nowrap}#view-overview .td-pill.good{border-color:#296557;background:#102c26;color:#79e1c7}#view-overview .td-pill.warn{border-color:#75572d;background:#2b2117;color:#ffcb83}#view-overview .td-pill.bad{border-color:#743845;background:#301820;color:#ff9cac}
      #view-overview .td-shift-time{display:inline-block;min-width:92px;color:#a9bccd}#view-overview .td-empty{padding:22px 14px;text-align:center;color:#8097aa;font-size:10px}#view-overview .td-empty i{display:grid;place-items:center;width:35px;height:35px;margin:0 auto 7px;border:1px solid #2d5e53;border-radius:50%;background:#0f2924;color:#62ddc1;font-style:normal}#view-overview .td-critical{border-color:#73412e;background:linear-gradient(145deg,#251b16,#0c1722)}#view-overview .td-critical .td-card-head{border-bottom-color:#5b3829}#view-overview .td-autopilot{padding:14px}#view-overview .td-autopilot p{margin:0 0 11px;color:#8ca2b6;font-size:10px;line-height:1.5}#view-overview .td-autopilot .primary{width:100%;min-height:44px}
      #view-overview .td-coverage{padding:10px 12px}#view-overview .td-cov{display:grid;grid-template-columns:72px 1fr auto;gap:10px;align-items:center;margin-bottom:9px}#view-overview .td-cov:last-child{margin-bottom:0}#view-overview .td-cov b{font-size:10px}#view-overview .td-bar{height:7px;overflow:hidden;border-radius:999px;background:#17283a}#view-overview .td-bar i{display:block;height:100%;border-radius:inherit;background:#47d2b4}#view-overview .td-bar i.warn{background:#e9ae55}#view-overview .td-cov span{min-width:70px;text-align:right;color:#9fb3c4;font-size:9px}#view-overview .td-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;padding:11px}#view-overview .td-actions button{min-height:44px;text-align:left}
      @media(max-width:1220px){#view-overview .td-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:930px){#view-overview .td-layout{grid-template-columns:1fr}#view-overview.sf-today-v2 .td-head{align-items:flex-start;flex-direction:column}#view-overview .td-head-actions{justify-content:flex-start}}@media(max-width:650px){#view-overview .td-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}#view-overview .td-row{grid-template-columns:1fr}#view-overview .td-row-actions{justify-content:flex-start}#view-overview .td-status{flex-wrap:wrap}#view-overview .td-status time{width:100%;margin-left:0}#view-overview .td-head-actions{width:100%}#view-overview .td-head-actions button{flex:1}}@media(max-width:430px){#view-overview .td-kpis{grid-template-columns:1fr}#view-overview .td-actions{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }

  function nav(view){
    if(typeof window.showView==='function')window.showView(view);else window.switchView?.(view);
    document.querySelector('.main')?.scrollTo?.({top:0,behavior:'instant'});window.scrollTo({top:0,behavior:'instant'});
  }
  function openAutopilot(){
    const btn=document.querySelector('#nav [data-view="disruptions"]');
    if(btn){btn.click();return}
    if(document.getElementById('view-disruptions')){nav('disruptions');return}
    window.showSaveToast?.('Störfall-Autopilot','Der Störfall-Autopilot wird noch geladen.');
  }
  window.sfTodayV2Nav=nav;window.sfTodayV2Autopilot=openAutopilot;window.sfTodayV2Refresh=()=>loadLive(true);

  function actionRows(d,rows,cov,warnings){
    const items=[];
    openIncidents().forEach(x=>items.push({prio:0,title:`⚡ Offener Störfall · ${x.shift_code||'Schicht'}`,text:`${x.original_employee||'Mitarbeiter'} · ${x.incident_type||'Ausfall'}${Number(x.pending_count||0)?` · ${x.pending_count} Anfrage(n) offen`:''}`,button:'Autopilot',action:'autopilot'}));
    rows.forEach(a=>{
      const st=state(a,d),inc=incidentForAssignment(a);
      if(st.key==='missing'&&!inc)items.push({prio:1,title:`⨯ ${employeeName(a.employeeId)} nicht erschienen`,text:`${a.type} · ${startOf(a)}–${endOf(a)} · kein Check-in`,button:'Störfall lösen',action:'autopilot'});
      if(st.key==='absent'&&!inc)items.push({prio:1,title:`⨯ ${employeeName(a.employeeId)} trotz Planung abwesend`,text:`${a.type} · ${st.detail}`,button:'Störfall lösen',action:'autopilot'});
      if(st.key==='checkout')items.push({prio:3,title:`◷ Check-out fehlt · ${employeeName(a.employeeId)}`,text:`${a.type} · ${st.detail}`,button:'Zeiterfassung',action:'time'});
      if(st.key==='draft'&&a.date===d)items.push({prio:4,title:`Entwurf · ${employeeName(a.employeeId)} noch nicht informiert`,text:`${a.type} · ${startOf(a)}–${endOf(a)}`,button:'Dienstplan',action:'schedule'});
    });
    cov.rows.filter(x=>x.open).forEach(x=>items.push({prio:2,title:`△ ${x.type} unterbesetzt`,text:`SOLL ${x.soll} · IST ${x.ist} · ${x.open} offen`,button:'Dienstplan',action:'schedule'}));
    warnings.filter(w=>w.kind!=='checkout').forEach(w=>items.push({prio:3,title:'◷ Arbeitszeit prüfen',text:w.text,button:'Zeiterfassung',action:'time'}));
    return items.sort((a,b)=>a.prio-b.prio).slice(0,20);
  }
  function actionButton(item){return item.action==='autopilot'?`<button class="primary" onclick="sfTodayV2Autopilot()">${esc(item.button)}</button>`:`<button class="ghost" onclick="sfTodayV2Nav('${esc(item.action)}')">${esc(item.button)}</button>`}

  function render(fetch=true){
    const page=document.getElementById('view-overview');if(!page)return;
    css();page.className='view sf-today-v2'+(page.classList.contains('active')?' active':'');
    const d=today(),rows=relevantAssignments(d),cov=todayCoverage(d),warnings=workWarnings(rows),states=rows.map(a=>({a,s:state(a,d)}));
    const unique=x=>new Set(x.map(v=>String(v))).size;
    const planned=unique(rows.map(a=>a.employeeId));
    const checked=unique(states.filter(x=>['checked','late','checkout','finished'].includes(x.s.key)).map(x=>x.a.employeeId));
    const finished=unique(states.filter(x=>x.s.key==='finished').map(x=>x.a.employeeId));
    const missing=unique(states.filter(x=>x.s.key==='missing').map(x=>x.a.employeeId));
    const absConflicts=states.filter(x=>x.s.key==='absent'),absenceCount=unique(allAbsences().filter(a=>absenceOn(a,d)).map(a=>a.employeeId));
    const openDis=openIncidents(),outageIds=new Set([...states.filter(x=>['missing','absent'].includes(x.s.key)).map(x=>String(x.a.employeeId)),...openDis.map(x=>String(x.original_employee_id||''))].filter(Boolean));
    const drafts=states.filter(x=>x.s.key==='draft'&&x.a.date===d).length;
    const actions=actionRows(d,rows,cov,warnings);
    const current=states.slice().sort((x,y)=>x.s.rank-y.s.rank||scheduled(x.a).start-scheduled(y.a).start);
    const stamp=lastLoadedAt?new Date(lastLoadedAt).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'noch nicht geladen';
    const kpi=(label,value,sub,cls='')=>`<div class="td-kpi ${cls}"><small>${esc(label)}</small><strong>${esc(value)}</strong><em>${esc(sub)}</em></div>`;
    page.innerHTML=`
      <header class="td-head"><div><div class="eyebrow">HEUTE <span class="td-live">LIVE</span></div><h1>${esc(fmtDay(d))}</h1><p>Operative Leitstelle für Besetzung, Check-ins, Ausfälle und unmittelbaren Handlungsbedarf.</p></div><div class="td-head-actions"><button class="ghost" onclick="sfTodayV2Refresh()">↻ Aktualisieren</button><button class="ghost" onclick="sfTodayV2Nav('schedule')">▣ Dienstplan</button><button class="primary" onclick="sfTodayV2Autopilot()">⚡ Störfall-Autopilot</button></div></header>
      <div class="td-status"><span>${loading?'<span class="td-spin"></span>':'●'}</span><span><b>${loading?'Live-Daten werden aktualisiert':B.ready?'Cloud-Daten aktiv':'Lokaler Datenstand'}</b>${drafts?` · ${drafts} Entwurf${drafts===1?'':'e'} noch nicht veröffentlicht`:''}</span><time>Letzte Aktualisierung: ${esc(stamp)}</time></div>
      <section class="td-kpis">
        ${kpi('Geplante Mitarbeiter heute',planned,`${rows.length} Schichtzuweisungen inkl. laufender Nachtschichten`)}
        ${kpi('Eingecheckt / nicht erschienen',`${checked} ✓ / ${missing} !`,`${finished} bereits ausgecheckt`,missing?'bad':checked?'good':'')}
        ${kpi('Ausfälle',outageIds.size,`${openDis.length} offene Störfälle · ${absenceCount} Abwesenheiten`,outageIds.size?'bad':'')}
        ${kpi('Offene Schichten',cov.open,'SOLL heute noch nicht besetzt',cov.open?'warn':'good')}
        ${kpi('Unterbesetzungen',cov.under,'betroffene Schichtarten',cov.under?'warn':'good')}
        ${kpi('Arbeitszeitwarnungen',warnings.length,'IST > 10 Std., Doppelbelegung oder Check-out offen',warnings.length?'warn':'good')}
      </section>
      <div class="td-layout"><main class="td-column">
        <section class="td-card"><header class="td-card-head"><div><h3>Live-Besetzung</h3><p>Heute startende und noch relevante Nachtschichten</p></div><span class="badge">${current.length}</span></header><div class="td-list">${current.length?current.map(({a,s})=>{const p=scheduled(a),e=entry(a);return`<article class="td-row"><div><b>${esc(employeeName(a.employeeId))}</b><small><span class="td-shift-time">${esc(a.type)} · ${esc(startOf(a))}–${esc(endOf(a))}</span>${a.date!==d?' · läuft aus Vortag':''}${e?.actualStart?` · Check-in ${esc(deTime(e.actualStart))}`:''}</small></div><div class="td-row-actions"><span class="td-pill ${s.cls}">${esc(s.label)}</span></div></article>`}).join(''):'<div class="td-empty"><i>✓</i>Für heute sind noch keine Schichten geplant.</div>'}</div></section>
        <section class="td-card"><header class="td-card-head"><div><h3>Handlungsbedarf heute</h3><p>Dringende Punkte zuerst</p></div><span class="badge">${actions.length}</span></header><div class="td-list">${actions.length?actions.map(x=>`<article class="td-row"><div><b>${esc(x.title)}</b><small>${esc(x.text)}</small></div><div class="td-row-actions">${actionButton(x)}</div></article>`).join(''):'<div class="td-empty"><i>✓</i>Aktuell besteht kein unmittelbarer Handlungsbedarf.</div>'}</div></section>
      </main><aside class="td-column">
        <section class="td-card td-critical"><header class="td-card-head"><div><h3>⚡ Störfall-Autopilot</h3><p>${openDis.length?`${openDis.length} offener Vorgang${openDis.length===1?'':'e'} wartet auf Bearbeitung`:'Für spontane Ausfälle und Nichterscheinen'}</p></div>${openDis.length?`<span class="badge">${openDis.length}</span>`:''}</header><div class="td-autopilot"><p>Ersatzkräfte regelkonform priorisieren, per Push anfragen und die erste Zusage kontrolliert übernehmen.</p><button class="primary" onclick="sfTodayV2Autopilot()">${openDis.length?'Offene Störfälle bearbeiten':'Störfall-Autopilot öffnen'} →</button></div></section>
        <section class="td-card"><header class="td-card-head"><div><h3>SOLL / IST heute</h3><p>Besetzung je Schichtart</p></div><span class="badge">${cov.rows.length}</span></header><div class="td-coverage">${cov.rows.length?cov.rows.map(x=>{const pct=x.soll?Math.min(100,Math.round(x.ist/x.soll*100)):100;return`<div class="td-cov"><b>${esc(x.type)}</b><div class="td-bar"><i class="${x.open?'warn':''}" style="width:${pct}%"></i></div><span>SOLL ${x.soll} · IST ${x.ist}</span></div>`}).join(''):'<div class="td-empty">Keine SOLL-Werte für heute vorhanden.</div>'}</div></section>
        <section class="td-card"><header class="td-card-head"><div><h3>Schnellzugriff</h3><p>Direkt in die operative Bearbeitung</p></div></header><div class="td-actions"><button class="ghost" onclick="sfTodayV2Nav('time')">◷ Zeiterfassung</button><button class="ghost" onclick="sfTodayV2Nav('absence')">☼ Abwesenheiten</button><button class="ghost" onclick="sfTodayV2Nav('schedule')">▣ Dienstplan</button><button class="ghost" onclick="sfTodayV2Nav('auto')">✦ Auto-Planung</button></div></section>
      </aside></div>`;
    if(fetch)loadLive(false);
  }

  function markNavigation(){
    const btn=document.querySelector('#nav [data-view="overview"]');
    const label=btn?.querySelector('span:nth-child(2)');if(label)label.textContent='Heute';
    btn?.setAttribute('title','Heute-Dashboard');
  }
  function boot(){
    const page=document.getElementById('view-overview');if(!page)return setTimeout(boot,100);
    markNavigation();window.renderTodayDashboard=render;window.renderOverview=render;render();
    document.addEventListener('click',e=>{if(e.target.closest?.('[data-view="overview"]'))setTimeout(()=>render(),0)});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&page.classList.contains('active'))loadLive(true)});
    document.addEventListener('sf:backend-hydrated',()=>{if(page.classList.contains('active'))render()});
    timer=setInterval(()=>{if(page.classList.contains('active'))loadLive(false)},REFRESH_MS);
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
})();
