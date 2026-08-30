// SchichtFunk – Fristen-Dashboard über alle Mitarbeiter V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__personnelDeadlineDashboardV1)return;B.__personnelDeadlineDashboardV1=true;
  const ADMIN=new Set(['OWNER','ADMIN']);
  let data=null,urgency='ALL',kind='ALL',status='ALL',query='',busy=false;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dmy=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('de-DE'):'–';
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const labels={EXPIRED:'Überfällig',D30:'≤ 30 Tage',D60:'31–60 Tage',D90:'61–90 Tage',LATER:'Später',NONE:'Ohne Frist'};
  const order={EXPIRED:0,D30:1,D60:2,D90:3,LATER:4,NONE:5};

  function css(){
    if(document.getElementById('sfDeadlineDashboardCss'))return;
    const s=document.createElement('style');s.id='sfDeadlineDashboardCss';s.textContent=`
      #sfPersonnelLaunch{gap:8px}.sf-pfd-open{border:1px solid #35576f;background:#102434;color:#b8d5e7;border-radius:9px;padding:9px 12px;font-weight:900;font-size:12px}.sf-pfd-open:hover{background:#153047;border-color:#4a7898}
      .sf-pfd-back{position:fixed;inset:0;z-index:42500;background:rgba(2,7,13,.94);backdrop-filter:blur(9px);display:grid;place-items:center;padding:18px}.sf-pfd-modal{width:min(1320px,98vw);height:min(890px,96vh);display:flex;flex-direction:column;overflow:hidden;background:linear-gradient(180deg,#101e2d,#08131f);border:1px solid #31506a;border-radius:18px;box-shadow:0 35px 120px rgba(0,0,0,.68)}
      .sf-pfd-head{display:flex;align-items:center;gap:13px;padding:17px 20px;border-bottom:1px solid #20364a;background:linear-gradient(90deg,#0d1f2e,#0a1825)}.sf-pfd-head-icon{width:45px;height:45px;border-radius:12px;display:grid;place-items:center;background:#123a32;color:#79ebd0;font-size:18px}.sf-pfd-head h2{margin:2px 0 3px;font-size:20px}.sf-pfd-head p{margin:0;color:#839caf;font-size:10px}.sf-pfd-spacer{flex:1}.sf-pfd-x{width:38px;height:38px;border:1px solid #30485d;background:#0d1a27;color:#a9bdcf;border-radius:9px;font-size:16px}
      .sf-pfd-stats{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;padding:12px 20px;border-bottom:1px solid #20364a;background:#0a1724}.sf-pfd-stat{border:1px solid #294158;background:#0d1b29;border-radius:10px;padding:10px 11px;text-align:left;color:#dce9f3;cursor:pointer}.sf-pfd-stat:hover,.sf-pfd-stat.active{border-color:#2bd8b6;background:#12322e}.sf-pfd-stat small{display:block;color:#7891a6;font-size:8px;text-transform:uppercase;letter-spacing:.04em}.sf-pfd-stat b{display:block;margin-top:4px;font-size:17px}.sf-pfd-stat.expired b{color:#ff8d9d}.sf-pfd-stat.d30 b{color:#ffb182}.sf-pfd-stat.d60 b{color:#ffd084}.sf-pfd-stat.d90 b{color:#e5dc8e}.sf-pfd-stat.none b{color:#9db0c0}
      .sf-pfd-tools{display:grid;grid-template-columns:minmax(220px,1fr) auto auto auto;gap:8px;padding:11px 20px;border-bottom:1px solid #20364a;background:#0b1825}.sf-pfd-search,.sf-pfd-select{background:#081624;border:1px solid #294159;color:#edf6ff;border-radius:8px;padding:9px 10px;font-size:10px;outline:none}.sf-pfd-search:focus,.sf-pfd-select:focus{border-color:#2bd8b6}.sf-pfd-reset{border:1px solid #335069;background:#102130;color:#bed0de;border-radius:8px;padding:8px 10px;font-size:10px;font-weight:800}.sf-pfd-summary{padding:8px 20px;color:#7891a6;font-size:9px;border-bottom:1px solid #1d3245;background:#091623}
      .sf-pfd-body{flex:1;overflow:auto;padding:12px 20px 22px;scrollbar-gutter:stable}.sf-pfd-table-head,.sf-pfd-row{display:grid;grid-template-columns:minmax(175px,1.1fr) minmax(180px,1.2fr) 120px 120px 125px 105px;gap:10px;align-items:center}.sf-pfd-table-head{padding:0 12px 8px;color:#70899d;font-size:8px;text-transform:uppercase;font-weight:900;letter-spacing:.04em}.sf-pfd-row{width:100%;padding:11px 12px;margin-bottom:7px;border:1px solid #294158;background:#0d1b29;border-radius:10px;color:#dce9f3;text-align:left;cursor:pointer}.sf-pfd-row:hover{border-color:#3a6c79;background:#102635}.sf-pfd-name b,.sf-pfd-item b{display:block;font-size:10px}.sf-pfd-name span,.sf-pfd-item span{display:block;margin-top:3px;color:#7f98ad;font-size:8px}.sf-pfd-type,.sf-pfd-status,.sf-pfd-deadline{display:inline-flex;width:max-content;max-width:100%;padding:4px 7px;border-radius:999px;border:1px solid #355269;background:#102334;color:#b9ccdc;font-size:8px;font-weight:900}.sf-pfd-type.q{border-color:#356b5d;background:#123029;color:#83dfc5}.sf-pfd-type.d{border-color:#405b78;background:#14263a;color:#a9c8e8}.sf-pfd-status.inactive{border-color:#59414a;background:#281b22;color:#c89aa7}.sf-pfd-deadline.expired{border-color:#7c3544;background:#321922;color:#ff91a0}.sf-pfd-deadline.d30{border-color:#80503a;background:#321f17;color:#ffb08b}.sf-pfd-deadline.d60{border-color:#80612e;background:#302514;color:#ffd084}.sf-pfd-deadline.d90{border-color:#696235;background:#292715;color:#ded58a}.sf-pfd-deadline.none{color:#99adbd}.sf-pfd-days{font-size:10px;font-weight:900}.sf-pfd-days.bad{color:#ff8d9d}.sf-pfd-days.warn{color:#ffd084}.sf-pfd-empty{padding:35px 18px;text-align:center;color:#7f96a9;border:1px dashed #29445b;border-radius:10px;background:#0a1724;font-size:11px}.sf-pfd-loading{display:grid;place-items:center;min-height:260px;color:#86a0b5;font-size:11px}
      @media(max-width:1050px){.sf-pfd-stats{grid-template-columns:repeat(3,1fr)}.sf-pfd-table-head{display:none}.sf-pfd-row{grid-template-columns:1fr 1fr 100px}.sf-pfd-row>*:nth-child(n+4){justify-self:start}.sf-pfd-tools{grid-template-columns:1fr 1fr}.sf-pfd-search{grid-column:1/-1}}
      @media(max-width:620px){.sf-pfd-back{padding:5px}.sf-pfd-modal{width:100vw;height:100vh;max-height:none;border-radius:0}.sf-pfd-head{padding:13px}.sf-pfd-stats{padding:9px 13px;grid-template-columns:1fr 1fr}.sf-pfd-tools{padding:9px 13px;grid-template-columns:1fr}.sf-pfd-search{grid-column:auto}.sf-pfd-summary{padding:8px 13px}.sf-pfd-body{padding:10px 13px}.sf-pfd-row{grid-template-columns:1fr 1fr}.sf-pfd-row>*:nth-child(n+3){justify-self:start}}
    `;document.head.appendChild(s)
  }

  function ensureLaunch(){
    if(!ADMIN.has(B.role))return;
    css();
    const bar=document.getElementById('sfPersonnelLaunch');
    if(!bar||document.getElementById('sfDeadlineDashboardOpen'))return;
    const btn=document.createElement('button');btn.type='button';btn.id='sfDeadlineDashboardOpen';btn.className='sf-pfd-open';btn.textContent='⏱ Fristen-Dashboard';btn.onclick=open;bar.insertBefore(btn,bar.firstChild);
  }

  async function load(){
    if(!B.client||!B.companyId)throw new Error('Cloud-Verbindung noch nicht bereit');
    const q=await B.client.rpc('manager_personnel_deadline_dashboard',{p_company_id:B.companyId});
    if(q.error)throw q.error;data=typeof q.data==='string'?JSON.parse(q.data):q.data;return data;
  }

  function stats(){return data?.stats||{expired:0,d30:0,d60:0,d90:0,later:0,no_expiry:0,total:0,qualifications:0,documents:0,employees:0}}
  function modal(){
    document.getElementById('sfPersonnelDeadlineDashboard')?.remove();css();
    const back=document.createElement('div');back.id='sfPersonnelDeadlineDashboard';back.className='sf-pfd-back';back.innerHTML=`<div class="sf-pfd-modal" role="dialog" aria-modal="true"><div class="sf-pfd-head"><span class="sf-pfd-head-icon">⏱</span><div><div class="eyebrow">MITARBEITER · PERSONALAKTE</div><h2>Fristen-Dashboard</h2><p>Qualifikationen und Dokumentfristen über alle Mitarbeiter</p></div><span class="sf-pfd-spacer"></span><button type="button" class="sf-pfd-x" id="sfDeadlineDashboardClose">✕</button></div><div id="sfDeadlineDashboardContent" class="sf-pfd-loading">Fristen werden geladen …</div></div>`;document.body.appendChild(back);back.querySelector('#sfDeadlineDashboardClose').onclick=()=>back.remove();
  }

  function statCards(){const s=stats(),arr=[['EXPIRED','Überfällig',s.expired,'expired'],['D30','≤ 30 Tage',s.d30,'d30'],['D60','31–60 Tage',s.d60,'d60'],['D90','61–90 Tage',s.d90,'d90'],['LATER','Später',s.later,''],['NONE','Ohne Frist',s.no_expiry,'none']];return `<div class="sf-pfd-stats">${arr.map(([k,l,n,c])=>`<button type="button" class="sf-pfd-stat ${c} ${urgency===k?'active':''}" data-urgency="${k}"><small>${l}</small><b>${n}</b></button>`).join('')}</div>`}
  function filtered(){
    const q=query.trim().toLocaleLowerCase('de-DE');
    return (data?.rows||[]).filter(r=>{
      if(urgency!=='ALL'&&r.urgency!==urgency)return false;
      if(kind!=='ALL'&&r.entity_type!==kind)return false;
      if(status!=='ALL'&&String(r.employee_status)!==status)return false;
      if(q){const hay=[r.employee_name,r.personnel_no,r.employee_role,r.title,r.category].join(' ').toLocaleLowerCase('de-DE');if(!hay.includes(q))return false}
      return true;
    }).sort((a,b)=>(order[a.urgency]-order[b.urgency])||String(a.expires_on||'9999').localeCompare(String(b.expires_on||'9999'))||String(a.employee_name).localeCompare(String(b.employee_name),'de'));
  }
  function deadlineLabel(r){if(r.urgency==='EXPIRED')return `seit ${Math.abs(Number(r.days_until_expiry||0))} Tag${Math.abs(Number(r.days_until_expiry||0))===1?'':'en'}`;if(r.urgency==='NONE')return 'Keine Frist';return r.days_until_expiry===0?'Heute':`noch ${r.days_until_expiry} Tage`}
  function rowsHtml(){
    const rows=filtered();if(!rows.length)return '<div class="sf-pfd-empty">Für die gewählten Filter wurden keine Fristen gefunden.</div>';
    return `<div class="sf-pfd-table-head"><span>Mitarbeiter</span><span>Nachweis / Dokument</span><span>Typ</span><span>Ablauf</span><span>Status</span><span>Restzeit</span></div>${rows.map(r=>`<button type="button" class="sf-pfd-row" data-employee="${esc(r.employee_id)}" data-tab="${r.entity_type==='DOCUMENT'?'documents':'qualifications'}"><span class="sf-pfd-name"><b>${esc(r.employee_name||'–')}</b><span>${esc(r.personnel_no||'ohne Personalnr.')} · ${esc(r.employee_role||'')}</span></span><span class="sf-pfd-item"><b>${esc(r.title||'–')}</b><span>${esc(r.category||'')}</span></span><span class="sf-pfd-type ${r.entity_type==='DOCUMENT'?'d':'q'}">${r.entity_type==='DOCUMENT'?'Dokument':'Qualifikation'}</span><span>${esc(dmy(r.expires_on))}</span><span class="sf-pfd-deadline ${String(r.urgency||'').toLowerCase()}">${esc(labels[r.urgency]||r.urgency)}</span><span class="sf-pfd-days ${r.urgency==='EXPIRED'?'bad':(['D30','D60'].includes(r.urgency)?'warn':'')}">${esc(deadlineLabel(r))}</span></button>`).join('')}`;
  }
  function render(){
    const root=document.getElementById('sfDeadlineDashboardContent');if(!root||!data)return;const s=stats(),rows=filtered();root.className='';root.innerHTML=`${statCards()}<div class="sf-pfd-tools"><input class="sf-pfd-search" id="sfPfdSearch" placeholder="Mitarbeiter, Personalnummer oder Nachweis suchen …" value="${esc(query)}"><select class="sf-pfd-select" id="sfPfdKind"><option value="ALL">Alle Arten</option><option value="QUALIFICATION" ${kind==='QUALIFICATION'?'selected':''}>Nur Qualifikationen</option><option value="DOCUMENT" ${kind==='DOCUMENT'?'selected':''}>Nur Dokumente</option></select><select class="sf-pfd-select" id="sfPfdStatus"><option value="ALL">Aktive + inaktive</option><option value="active" ${status==='active'?'selected':''}>Nur aktive</option><option value="inactive" ${status==='inactive'?'selected':''}>Nur inaktive</option></select><button type="button" class="sf-pfd-reset" id="sfPfdReset">Filter zurücksetzen</button></div><div class="sf-pfd-summary"><b>${rows.length}</b> von ${s.total} Einträgen · ${s.employees} Mitarbeiter · ${s.qualifications} Qualifikationen · ${s.documents} Dokumente</div><div class="sf-pfd-body">${rowsHtml()}</div>`;
    root.querySelectorAll('[data-urgency]').forEach(b=>b.onclick=()=>{urgency=urgency===b.dataset.urgency?'ALL':b.dataset.urgency;render()});
    root.querySelector('#sfPfdSearch').oninput=e=>{query=e.target.value;render()};
    root.querySelector('#sfPfdKind').onchange=e=>{kind=e.target.value;render()};
    root.querySelector('#sfPfdStatus').onchange=e=>{status=e.target.value;render()};
    root.querySelector('#sfPfdReset').onclick=()=>{urgency='ALL';kind='ALL';status='ALL';query='';render()};
    root.querySelectorAll('.sf-pfd-row[data-employee]').forEach(b=>b.onclick=()=>openPersonnel(b.dataset.employee,b.dataset.tab));
  }

  function localEmployeeId(dbId){
    try{if(B.empLocal?.get?.(dbId))return String(B.empLocal.get(dbId));if(typeof employees!=='undefined'){const e=employees.find(x=>String(x._dbId||B.empDb?.get?.(String(x.id))||'')===String(dbId));if(e)return String(e.id)}}catch{}return null;
  }
  async function openPersonnel(dbId,tab){
    const localId=localEmployeeId(dbId);if(!localId)return;
    document.getElementById('sfPersonnelDeadlineDashboard')?.remove();
    try{if(typeof window.switchView==='function')window.switchView('employees');else if(typeof switchView==='function')switchView('employees')}catch{}
    await sleep(70);
    try{if(typeof window.selectEmployee==='function')window.selectEmployee(localId);else if(typeof selectEmployee==='function')selectEmployee(localId)}catch{}
    try{sessionStorage.setItem('sf_workspace_state_v2',JSON.stringify({view:'employees',employeeId:localId,personnelOpen:true,personnelTab:tab,savedAt:Date.now()}))}catch{}
    for(let i=0;i<18;i++){if(document.getElementById('sfPersonnelOpen')||B.personnelFile?.open)break;await sleep(80)}
    try{if(!document.getElementById('sfPersonnelFile')){if(B.personnelFile?.open)await B.personnelFile.open();else document.getElementById('sfPersonnelOpen')?.click()}}catch(e){console.warn('Fristen-Dashboard: Personalakte konnte nicht geöffnet werden',e)}
    for(let i=0;i<24;i++){const target=document.querySelector(`#sfPersonnelFile #sfPfTabs [data-pftab="${tab}"]`);if(target){if(!target.classList.contains('active'))target.click();return}await sleep(80)}
  }

  async function open(){
    if(busy||!ADMIN.has(B.role))return;busy=true;modal();try{await load();render()}catch(e){console.warn('Fristen-Dashboard konnte nicht geladen werden',e);const r=document.getElementById('sfDeadlineDashboardContent');if(r){r.className='sf-pfd-loading';r.textContent='Fristen konnten nicht geladen werden.'}}finally{busy=false}
  }
  B.personnelDeadlineDashboard={open,refresh:async()=>{await load();render()}};
  setInterval(ensureLaunch,1200);setTimeout(ensureLaunch,700);setTimeout(ensureLaunch,1800);
})();