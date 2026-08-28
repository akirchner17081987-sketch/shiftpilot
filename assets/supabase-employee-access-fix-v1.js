// SchichtFunk – Mitarbeiterzugang UI Fix V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  const ROLES=new Set(['OWNER','ADMIN','DISPATCHER','PLANNER']);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const employeeList=()=>{
    try{if(typeof employees!=='undefined'&&Array.isArray(employees))return employees}catch{}
    return Array.isArray(window.employees)?window.employees:[];
  };
  const selectedId=()=>{
    try{if(typeof selectedEmployeeId!=='undefined')return selectedEmployeeId}catch{}
    return window.selectedEmployeeId||null;
  };

  async function renderFor(id){
    if(!B.ready||!B.client||!ROLES.has(String(B.role||'').toUpperCase()))return;
    const box=document.getElementById('employeeSummary');
    if(!box)return;
    const e=employeeList().find(x=>String(x.id)===String(id));
    if(!e)return;
    box.querySelector('.sf-access-box')?.remove();
    const d=document.createElement('div');
    d.className='sf-access-box';
    d.innerHTML='<small>Zugang wird geprüft …</small>';
    box.appendChild(d);
    const dbId=e._dbId||B.empDb?.get(String(e.id));
    if(!dbId){d.innerHTML='<small>Mitarbeiter ist noch nicht mit PostgreSQL verknüpft.</small>';return}
    const q=await B.client.from('employees').select('auth_user_id,access_status,email').eq('id',dbId).single();
    if(q.error){d.innerHTML='<small>Zugangsstatus konnte nicht geladen werden.</small>';return}
    const active=!!q.data.auth_user_id;
    const status=active?'ACTIVE':(q.data.access_status||'NONE');
    const label=active?'Aktiv':status==='INVITED'?'Eingeladen':'Nicht eingerichtet';
    d.innerHTML=`<div class="sf-access-head"><div><b>🔐 Mitarbeiterzugang</b><small>${esc(q.data.email||'Keine E-Mail hinterlegt')}</small></div><span class="sf-access-status ${active?'active':status==='INVITED'?'invited':''}">${esc(label)}</span></div><div class="sf-access-actions">${active?'<span style="font-size:11px;color:#79dbc7">Eigener SchichtFunk-Zugang ist verknüpft.</span>':`<button class="primary" type="button" id="sfCreateEmployeeAccessFix">${status==='INVITED'?'Einladung neu erstellen':'Zugang einrichten'}</button>`}</div>`;
    d.querySelector('#sfCreateEmployeeAccessFix')?.addEventListener('click',()=>B.createEmployeeInvite?.(e.id));
  }

  const oldSelect=window.selectEmployee;
  if(typeof oldSelect==='function')window.selectEmployee=function(id){
    const r=oldSelect.apply(this,arguments);
    setTimeout(()=>renderFor(id),60);
    return r;
  };

  const oldRender=window.renderEmployees;
  if(typeof oldRender==='function')window.renderEmployees=function(){
    const r=oldRender.apply(this,arguments);
    const id=selectedId();
    if(id)setTimeout(()=>renderFor(id),80);
    return r;
  };

  document.addEventListener('click',e=>{
    if(!e.target.closest('#employeeList'))return;
    setTimeout(()=>{const id=selectedId();if(id)renderFor(id)},100);
  },true);

  setTimeout(()=>{const id=selectedId();if(id)renderFor(id)},250);
  window.SFEmployeeAccessFix={render:renderFor};
})();
