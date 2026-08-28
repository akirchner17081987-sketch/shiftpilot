// SchichtFunk – Mitarbeiterzugang UI Fix V2
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  const ROLES=new Set(['OWNER','ADMIN','DISPATCHER','PLANNER']);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function installStyles(){
    let s=document.getElementById('sfEmployeeAccessPolish');
    if(!s){s=document.createElement('style');s.id='sfEmployeeAccessPolish';document.head.appendChild(s)}
    s.textContent=`
      #employeeSummary .sf-access-box{
        display:block!important;width:100%!important;min-width:0!important;height:auto!important;
        margin:14px 0 0!important;padding:14px 15px!important;
        border:1px solid #29465e!important;border-radius:12px!important;
        background:linear-gradient(180deg,#0d1c2c 0%,#0a1725 100%)!important;
        box-shadow:0 10px 28px rgba(0,0,0,.12)!important;
      }
      #employeeSummary .sf-access-head{
        display:flex!important;align-items:flex-start!important;justify-content:space-between!important;
        gap:14px!important;margin:0 0 11px!important;width:100%!important;
      }
      #employeeSummary .sf-access-title{display:flex!important;flex-direction:column!important;gap:4px!important;min-width:0!important;flex:1!important}
      #employeeSummary .sf-access-title b{display:flex!important;align-items:center!important;gap:7px!important;color:#eef7ff!important;font-size:13px!important;line-height:1.25!important;margin:0!important}
      #employeeSummary .sf-access-title small{display:block!important;color:#8ea5ba!important;font-size:11px!important;line-height:1.35!important;overflow-wrap:anywhere!important;word-break:normal!important;margin:0!important}
      #employeeSummary .sf-access-status{
        flex:0 0 auto!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;
        min-height:25px!important;padding:4px 9px!important;border-radius:999px!important;
        border:1px solid #3a566f!important;background:#102131!important;color:#b4c7d8!important;
        font-size:10px!important;line-height:1.1!important;font-weight:800!important;white-space:nowrap!important;text-align:center!important;
      }
      #employeeSummary .sf-access-status.active{border-color:#28715e!important;background:#0f2d27!important;color:#82e8cf!important}
      #employeeSummary .sf-access-status.invited{border-color:#80612f!important;background:#2d2314!important;color:#ffd08a!important}
      #employeeSummary .sf-access-actions{display:flex!important;align-items:center!important;gap:9px!important;flex-wrap:wrap!important;margin:0!important;width:100%!important}
      #employeeSummary .sf-access-actions .primary{
        width:auto!important;min-width:0!important;max-width:100%!important;height:38px!important;min-height:38px!important;
        padding:0 14px!important;border-radius:9px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;
        font-size:12px!important;line-height:1!important;font-weight:800!important;white-space:nowrap!important;
      }
      #employeeSummary .sf-access-note{font-size:11px!important;line-height:1.4!important;color:#79dbc7!important}
      @media(max-width:560px){
        #employeeSummary .sf-access-head{flex-direction:column!important;gap:8px!important}
        #employeeSummary .sf-access-status{align-self:flex-start!important}
        #employeeSummary .sf-access-actions .primary{width:100%!important}
      }
    `;
  }

  const employeeList=()=>{
    try{if(typeof employees!=='undefined'&&Array.isArray(employees))return employees}catch{}
    return Array.isArray(window.employees)?window.employees:[];
  };
  const selectedId=()=>{
    try{if(typeof selectedEmployeeId!=='undefined')return selectedEmployeeId}catch{}
    return window.selectedEmployeeId||null;
  };
  const accessMarkup=(email,active,status,label,buttonId)=>{
    if(typeof B.employeeAccessMarkup==='function')return B.employeeAccessMarkup(email,active,status,label,buttonId);
    return `
      <div class="sf-access-head">
        <div class="sf-access-title">
          <b><span aria-hidden="true">🔐</span> Mitarbeiterzugang</b>
          <small>${esc(email||'Keine E-Mail hinterlegt')}</small>
        </div>
        <span class="sf-access-status ${active?'active':status==='INVITED'?'invited':''}">${esc(label)}</span>
      </div>
      <div class="sf-access-actions">
        ${active
          ?'<span class="sf-access-note">✓ Eigener SchichtFunk-Zugang ist verknüpft.</span>'
          :`<button class="primary" type="button" id="${buttonId}">${status==='INVITED'?'Einladung neu erstellen':'Zugang einrichten'}</button>`}
      </div>`;
  };

  async function renderFor(id){
    installStyles();
    if(!B.ready||!B.client||!ROLES.has(String(B.role||'').toUpperCase()))return;
    const box=document.getElementById('employeeSummary');
    if(!box)return;
    const e=employeeList().find(x=>String(x.id)===String(id));
    if(!e)return;
    box.querySelector('.sf-access-box')?.remove();
    const d=document.createElement('div');
    d.className='sf-access-box';
    d.innerHTML='<small style="color:#8ea5ba">Zugang wird geprüft …</small>';
    box.appendChild(d);
    const dbId=e._dbId||B.empDb?.get(String(e.id));
    if(!dbId){d.innerHTML='<small style="color:#8ea5ba">Mitarbeiter ist noch nicht mit PostgreSQL verknüpft.</small>';return}
    const q=await B.client.from('employees').select('auth_user_id,access_status,email').eq('id',dbId).single();
    if(q.error){d.innerHTML='<small style="color:#8ea5ba">Zugangsstatus konnte nicht geladen werden.</small>';return}
    const active=!!q.data.auth_user_id;
    const status=active?'ACTIVE':(q.data.access_status||'NONE');
    const label=active?'Aktiv':status==='INVITED'?'Eingeladen':'Nicht eingerichtet';
    d.innerHTML=accessMarkup(q.data.email,active,status,label,'sfCreateEmployeeAccessFix');
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

  installStyles();
  setTimeout(()=>{const id=selectedId();if(id)renderFor(id)},250);
  window.SFEmployeeAccessFix={render:renderFor};
})();