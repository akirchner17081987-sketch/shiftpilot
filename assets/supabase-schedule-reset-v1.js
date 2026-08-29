// SchichtFunk – kompletter Dienstplan-Reset V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  const C=window.SFCompliance=window.SFCompliance||{};
  if(B.__scheduleResetV1)return;B.__scheduleResetV1=true;
  const ALLOWED=new Set(['OWNER','ADMIN']);
  let busy=false;

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function css(){
    if(document.getElementById('sfScheduleResetCss'))return;
    const s=document.createElement('style');s.id='sfScheduleResetCss';s.textContent=`
      .sf-plan-reset-btn{border:1px solid #753443!important;background:#2b1820!important;color:#ff9cab!important;border-radius:8px!important;padding:8px 10px!important;font-weight:800!important;white-space:nowrap}.sf-plan-reset-btn:hover{background:#3b1d27!important;border-color:#a34355!important;color:#ffc0ca!important}
      .sf-reset-backdrop{position:fixed;inset:0;z-index:31000;background:rgba(2,7,13,.88);backdrop-filter:blur(9px);display:grid;place-items:center;padding:18px}.sf-reset-card{width:min(570px,96vw);background:linear-gradient(180deg,#101b29,#09131e);border:1px solid #633240;border-radius:18px;box-shadow:0 32px 100px rgba(0,0,0,.62);overflow:hidden}.sf-reset-head{padding:20px 22px 15px;border-bottom:1px solid #36222b;display:flex;gap:14px;align-items:flex-start}.sf-reset-icon{width:42px;height:42px;border-radius:11px;background:#351922;border:1px solid #723345;color:#ff8fa2;display:grid;place-items:center;font-size:20px;flex:0 0 auto}.sf-reset-head h2{margin:2px 0 5px;font-size:21px}.sf-reset-head p{margin:0;color:#96a9bb;font-size:11px;line-height:1.5}.sf-reset-body{padding:18px 22px}.sf-reset-warning{border:1px solid #663442;background:#2d1921;color:#ffc2cc;border-radius:10px;padding:11px 12px;font-size:11px;line-height:1.5;margin-bottom:13px}.sf-reset-counts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:15px}.sf-reset-count{border:1px solid #263c50;background:#0b1825;border-radius:9px;padding:10px}.sf-reset-count small{display:block;color:#8298ab;font-size:9px}.sf-reset-count strong{display:block;margin-top:4px;font-size:17px}.sf-reset-field{display:flex;flex-direction:column;gap:6px}.sf-reset-field label{font-size:10px;font-weight:800;color:#a8bac9}.sf-reset-field input{background:#081521;border:1px solid #4f3440;color:#f5f8fb;border-radius:9px;padding:11px 12px;outline:none}.sf-reset-field input:focus{border-color:#a64558;box-shadow:0 0 0 2px rgba(198,73,94,.12)}.sf-reset-hint{color:#7f94a7;font-size:9px;margin-top:6px;line-height:1.45}.sf-reset-msg{display:none;margin-top:11px;border:1px solid #713342;background:#321821;color:#ffacb8;border-radius:9px;padding:9px 10px;font-size:10px}.sf-reset-msg.show{display:block}.sf-reset-foot{display:flex;justify-content:flex-end;gap:8px;padding:14px 22px;border-top:1px solid #36222b}.sf-reset-danger{border:1px solid #b8465a;background:#b8465a;color:#fff;border-radius:8px;padding:9px 12px;font-weight:900}.sf-reset-danger:disabled{opacity:.38;cursor:not-allowed}.sf-reset-close{border:1px solid #2a3e53;background:#0d1a27;color:#b3c2d1;border-radius:8px;padding:9px 12px}@media(max-width:620px){.sf-reset-counts{grid-template-columns:1fr}.sf-reset-foot{flex-direction:column-reverse}.sf-reset-foot button{width:100%}}
    `;document.head.appendChild(s);
  }

  function toolbar(){return document.querySelector('#view-plan .cal-toolbar')||document.querySelector('.view.active .cal-toolbar')}

  function install(){
    if(!ALLOWED.has(B.role))return;
    const bar=toolbar();if(!bar||bar.querySelector('#sfDeleteWholeScheduleBtn'))return;
    css();
    const btn=document.createElement('button');btn.type='button';btn.id='sfDeleteWholeScheduleBtn';btn.className='sf-plan-reset-btn';btn.textContent='🗑 Dienstplan löschen';btn.title='Gesamten Dienstplan des Unternehmens löschen';btn.onclick=open;
    bar.appendChild(btn);
  }

  async function counts(){
    const {data,error}=await B.client.from('shift_assignments').select('status').eq('company_id',B.companyId);
    if(error)throw error;
    const rows=data||[];
    return {total:rows.length,draft:rows.filter(x=>x.status==='DRAFT').length,published:rows.filter(x=>x.status==='PUBLISHED').length,cancelled:rows.filter(x=>x.status==='CANCELLED').length};
  }

  async function open(){
    if(busy||!B.ready||!B.client||!B.companyId||!ALLOWED.has(B.role))return;
    css();document.getElementById('sfScheduleResetBackdrop')?.remove();
    let c;
    try{B.showLoading?.('Dienstplan wird geprüft …');c=await counts()}catch(e){C.toast?.('Dienstplan konnte nicht geprüft werden',e?.message||String(e));return}finally{B.hideLoading?.()}
    const m=document.createElement('div');m.id='sfScheduleResetBackdrop';m.className='sf-reset-backdrop';
    m.innerHTML=`<div class="sf-reset-card" role="dialog" aria-modal="true" aria-labelledby="sfResetTitle"><div class="sf-reset-head"><div class="sf-reset-icon">!</div><div><div class="eyebrow">ADMINISTRATIVER KOMPLETT-RESET</div><h2 id="sfResetTitle">Gesamten Dienstplan löschen?</h2><p>Dieser Vorgang betrifft das gesamte Unternehmen und nicht nur die aktuell angezeigte Woche.</p></div></div><div class="sf-reset-body"><div class="sf-reset-warning"><b>Diese Aktion kann nicht rückgängig gemacht werden.</b><br>Entwürfe und bereits veröffentlichte Schichten werden entfernt. Mitarbeiter sehen diese Schichten danach nicht mehr. Frühere Audit- und Änderungsnachweise bleiben zur Dokumentation erhalten.</div><div class="sf-reset-counts"><div class="sf-reset-count"><small>GESAMT</small><strong>${c.total}</strong></div><div class="sf-reset-count"><small>ENTWÜRFE</small><strong>${c.draft}</strong></div><div class="sf-reset-count"><small>VERÖFFENTLICHT</small><strong>${c.published}</strong></div></div><div class="sf-reset-field"><label>Zur Bestätigung exakt LÖSCHEN eingeben</label><input id="sfResetConfirm" autocomplete="off" spellcheck="false" placeholder="LÖSCHEN"></div><div class="sf-reset-hint">Nur Owner und Administratoren können diesen Komplett-Reset ausführen. Der Vorgang wird im Audit-Log protokolliert.</div><div id="sfResetMsg" class="sf-reset-msg"></div></div><div class="sf-reset-foot"><button type="button" class="sf-reset-close" id="sfResetCancel">Abbrechen</button><button type="button" class="sf-reset-danger" id="sfResetSubmit" disabled>Gesamten Dienstplan löschen</button></div></div>`;
    document.body.appendChild(m);
    const input=m.querySelector('#sfResetConfirm'),submit=m.querySelector('#sfResetSubmit'),msg=m.querySelector('#sfResetMsg');
    const close=()=>{if(!busy)m.remove()};
    input.addEventListener('input',()=>submit.disabled=input.value.trim()!=='LÖSCHEN');
    m.querySelector('#sfResetCancel').onclick=close;m.addEventListener('click',e=>{if(e.target===m)close()});
    document.addEventListener('keydown',function escClose(e){if(!document.body.contains(m)){document.removeEventListener('keydown',escClose);return}if(e.key==='Escape')close()});
    submit.onclick=async()=>{
      if(input.value.trim()!=='LÖSCHEN'||busy)return;
      busy=true;submit.disabled=true;submit.textContent='Wird gelöscht …';
      try{
        B.showLoading?.('Gesamter Dienstplan wird sicher gelöscht …');
        const {data,error}=await B.client.rpc('reset_company_schedule',{p_company_id:B.companyId,p_confirmation:'LÖSCHEN'});
        if(error)throw error;
        await B.hydrate();
        m.remove();
        C.updateScheduleControls?.();
        if(typeof renderCalendar==='function')renderCalendar();
        if(typeof renderPlanEmployeePool==='function')renderPlanEmployeePool();
        if(typeof renderOverview==='function')renderOverview();
        if(typeof updateStats==='function')updateStats();
        const r=Array.isArray(data)?data[0]:data;
        const n=Number(r?.deletedAssignments||0);
        if(typeof showSaveToast==='function')showSaveToast('Dienstplan gelöscht',`${n} Schichten wurden vollständig aus dem Dienstplan entfernt.`);
        else C.toast?.('Dienstplan gelöscht',`${n} Schichten wurden vollständig entfernt.`);
      }catch(e){console.error('Komplett-Reset fehlgeschlagen',e);msg.textContent=e?.message||String(e);msg.classList.add('show');submit.disabled=false;submit.textContent='Gesamten Dienstplan löschen'}finally{B.hideLoading?.();busy=false}
    };
    input.focus();
  }

  B.openFullScheduleReset=open;
  const mo=new MutationObserver(install);mo.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(install,0);setTimeout(install,500);setTimeout(install,1500);
})();
