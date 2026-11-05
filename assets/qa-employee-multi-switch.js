// QA-only prototype: multi-profile login and read-only company switching.
(function(){
  'use strict';
  const B=window.SFBackend;
  if(!B || typeof B.ensureCompany!=='function' || typeof B.hydrateEmployee!=='function' || typeof B.openEmployeePortal!=='function')return;
  const ensure=B.ensureCompany,hydrate=B.hydrateEmployee,open=B.openEmployeePortal;
  B.__qaOriginalEmployeeHydrate=hydrate;B.__qaOriginalEmployeeOpen=open;
  const key=()=>`sfQaEmployeeCompany:${B.user?.id||''}`;
  const readChoice=()=>{try{return sessionStorage.getItem(key())||''}catch{return ''}};
  const saveChoice=id=>{try{sessionStorage.setItem(key(),id)}catch{}};
  const fail=message=>Object.assign(new Error(message),{code:'employee_portal_disabled'});
  async function options(){const q=await B.client.rpc('qa_employee_company_options');if(q.error)throw q.error;return Array.isArray(q.data)?q.data:[]}
  async function setSessionCompany(company){const q=await B.client.rpc('qa_set_employee_session_company',{p_company:company});if(q.error)throw q.error}
  async function profile(choice){
    const q=await B.client.rpc('qa_employee_profile_scoped',{p_company:choice.company_id});
    if(q.error)throw q.error;
    const d=q.data;
    if(!d||String(d.employee?.id)!==String(choice.employee_id)||String(d.company?.id)!==String(choice.company_id))throw fail('Das Mitarbeiterprofil stimmt nicht mit dem ausgewählten Unternehmen überein.');
    return d;
  }
  async function details(choice){
    const company=choice.company_id;
    const requests=[
      ['time','qa_employee_time_account_scoped',{p_company:company,p_month:null}],
      ['qr','qa_employee_qr_bookings_scoped',{p_company:company,p_month:null}],
      ['shifts','qa_employee_shifts_scoped',{p_company:company}],
      ['absences','qa_employee_absences_scoped',{p_company:company}],
      ['swaps','qa_employee_list_shift_swaps_scoped',{p_company:company}],
      ['market','qa_employee_list_shift_marketplace_scoped',{p_company:company}],
      ['offers','qa_employee_list_disruption_offers_scoped',{p_company:company}]
    ];
    const results=await Promise.allSettled(requests.map(async ([,name,args])=>{const q=await B.client.rpc(name,args);if(q.error)throw q.error;return q.data}));
    const data={};
    results.forEach((r,i)=>{data[requests[i][0]]=r.status==='fulfilled'?r.value:null});
    for(const name of ['time','qr'])if(data[name]?.employee_id&&String(data[name].employee_id)!==String(choice.employee_id))throw fail('Die geladenen Zeitdaten gehören nicht zum ausgewählten Profil.');
    return data;
  }
  B.ensureCompany=async function(){
    B.__qaMultiEmployee=false;B.__qaMultiOptions=[];B.__qaMultiProfile=null;
    if(!B.client||!B.user)return ensure.apply(this,arguments);
    const userId=B.user.id;
    const employeeEntry=new URLSearchParams(window.location.search).get('bereich')==='mitarbeiter';
    const memberships=await B.client.from('company_members').select('company_id,role,status,created_at,extra_permissions').eq('user_id',B.user.id);
    if(memberships.error)throw memberships.error;
    if(!employeeEntry&&(memberships.data||[]).some(x=>x.status==='ACTIVE'))return ensure.apply(this,arguments);
    const own=await B.client.from('employees').select('id,company_id').eq('auth_user_id',B.user.id);
    if(own.error)throw own.error;
    if(!employeeEntry&&(own.data||[]).length<2)return ensure.apply(this,arguments);
    const available=await options();
    if(!available.length)throw fail('Für dieses Konto ist kein aktives Mitarbeiterprofil freigegeben.');
    const choice=available.find(x=>String(x.company_id)===readChoice())||available[0];
    const data=await profile(choice);
    if(B.user?.id!==userId)throw fail('Die Anmeldung hat sich geändert. Bitte erneut anmelden.');
    await setSessionCompany(choice.company_id);
    if(B.user?.id!==userId)throw fail('Die Anmeldung hat sich geändert. Bitte erneut anmelden.');
    B.__qaMultiEmployee=true;B.__qaMultiOptions=available;B.__qaMultiProfile=data;
    B.companyId=choice.company_id;B.employeeDbId=choice.employee_id;B.employeeRecord=data.employee;B.role='EMPLOYEE';
    B.accessRole='EMPLOYEE';B.accessPermissions=[];B.accessProfileCompany=choice.company_id;B.personnelConversationEmployeeIds=[];B.personnelConversationExcludedEmployeeIds=[];B.personnelConversationScope=null;
    saveChoice(choice.company_id);
  };
  B.hydrateEmployee=async function(){
    if(!B.__qaMultiEmployee)return hydrate.apply(this,arguments);
    const userId=B.user?.id,company=B.companyId,choice=B.__qaMultiOptions.find(x=>String(x.company_id)===String(company));
    if(!choice)throw fail('Das ausgewählte Unternehmen ist nicht mehr verfügbar.');
    const data=await details(choice);
    if(B.user?.id!==userId||B.companyId!==company)throw fail('Der Zugang wurde während des Ladens geändert.');
    B.__qaMultiDetails=data;B.employeePortalData={employee:B.__qaMultiProfile.employee,company:B.__qaMultiProfile.company};
  };
  B.openEmployeePortal=function(){
    if(!B.__qaMultiEmployee)return open.apply(this,arguments);
    document.getElementById('sfQaEmployeePortal')?.remove();
    const root=document.createElement('div');root.id='sfQaEmployeePortal';
    root.innerHTML='<header><strong>SchichtFunk</strong><button type="button" id="qaLogout">Abmelden</button></header><main><p class="qa-label">GETRENNTE TESTUMGEBUNG</p><h1>Mitarbeiterportal</h1><p>Bitte ausschließlich fiktive Testdaten verwenden.</p><label for="qaCompany">Unternehmen wechseln</label><select id="qaCompany"></select><p id="qaSwitchStatus" role="status" aria-live="polite"></p><section><h2>Mein Mitarbeiterprofil</h2><dl><dt>Unternehmen</dt><dd id="qaCompanyName"></dd><dt>Name</dt><dd id="qaPerson"></dd><dt>Personalnummer</dt><dd id="qaPersonnel"></dd></dl></section><section><h2>Meine Dienste</h2><p>Veröffentlichte Dienste der nächsten 90 Tage</p><ul id="qaShiftList"></ul></section><section><h2>Meine Zeiten</h2><p>Aktueller Monat</p><dl><dt>Sollzeit</dt><dd id="qaTarget"></dd><dt>Bestätigte Arbeitszeit</dt><dd id="qaWorked"></dd><dt>QR-Buchungen</dt><dd id="qaQrCount"></dd></dl></section><section><h2>Abwesenheiten</h2><ul id="qaAbsenceList"></ul><form id="qaAbsenceForm"><fieldset id="qaAbsenceFields"><legend>Testantrag erstellen</legend><label for="qaAbsenceType">Art</label><select id="qaAbsenceType"><option>Urlaub</option><option>Frei</option><option>Fortbildung</option><option>Sonstiges</option></select><label for="qaAbsenceFrom">Von</label><input id="qaAbsenceFrom" type="date" required><label for="qaAbsenceTo">Bis</label><input id="qaAbsenceTo" type="date" required><button type="submit">Testantrag senden</button></fieldset><p id="qaAbsenceStatus" role="status" aria-live="polite"></p></form></section><section><h2>Meine Anfragen</h2><dl><dt>Schichttausch</dt><dd id="qaSwapCount"></dd><dt>Schichtmarkt</dt><dd id="qaMarketCount"></dd><dt>Ersatzangebote</dt><dd id="qaOfferCount"></dd></dl><fieldset id="qaActionFields"><legend>Testanfragen bearbeiten</legend><ul id="qaActionList"></ul></fieldset><p id="qaActionStatus" role="status" aria-live="polite"></p></section><p>Weitere Portalfunktionen werden für mehrere Profile noch geprüft.</p></main>';
    const style=document.createElement('style');style.textContent='#sfQaEmployeePortal{position:fixed;inset:0;z-index:22000;overflow:auto;background:#071321;color:#edf8ff;font:16px system-ui,sans-serif}#sfQaEmployeePortal header{display:flex;justify-content:space-between;align-items:center;padding:18px 6%;background:#0c2031;border-bottom:1px solid #24475a}#sfQaEmployeePortal main{max-width:760px;margin:38px auto;padding:0 22px}#sfQaEmployeePortal h1{font-size:30px}#sfQaEmployeePortal .qa-label{color:#6ce0c9;font-weight:700;letter-spacing:.08em;font-size:12px}#sfQaEmployeePortal select,#sfQaEmployeePortal button{font:inherit;border:1px solid #47798a;border-radius:9px;padding:10px;color:#fff;background:#102f40}#sfQaEmployeePortal select{display:block;width:100%;margin-top:8px}#sfQaEmployeePortal section{margin-top:22px;padding:20px;border:1px solid #274a5c;border-radius:15px;background:#0d2131}#sfQaEmployeePortal dl{display:grid;grid-template-columns:160px 1fr;gap:14px;margin-bottom:0}#sfQaEmployeePortal dt{color:#a2bbca}#sfQaEmployeePortal dd{margin:0;overflow-wrap:anywhere}@media(max-width:480px){#sfQaEmployeePortal dl{grid-template-columns:1fr;gap:5px}#sfQaEmployeePortal dd{margin-bottom:10px}}';root.appendChild(style);
    style.textContent+='#sfQaEmployeePortal #qaAbsenceFields{display:grid;gap:9px;border:1px solid #274a5c;border-radius:10px;padding:14px}#sfQaEmployeePortal input{font:inherit;border:1px solid #47798a;border-radius:9px;padding:10px;color:#fff;background:#102f40}#sfQaEmployeePortal #qaAbsenceFields select{margin:0}#sfQaEmployeePortal #qaAbsenceFields button{margin-top:8px}';
    document.body.appendChild(root);
    const select=root.querySelector('#qaCompany'),status=root.querySelector('#qaSwitchStatus');
    function render(){
      select.replaceChildren(...B.__qaMultiOptions.map(c=>{const o=document.createElement('option');o.value=c.company_id;o.textContent=c.company_name;return o}));
      select.value=B.companyId;
      const d=B.__qaMultiProfile;root.querySelector('#qaCompanyName').textContent=d.company.name||'–';root.querySelector('#qaPerson').textContent=[d.employee.first_name,d.employee.last_name].filter(Boolean).join(' ')||'–';root.querySelector('#qaPersonnel').textContent=d.employee.personnel_no||'–';
      const info=B.__qaMultiDetails||{},hours=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))?(Number(v)/60).toLocaleString('de-DE',{maximumFractionDigits:2})+' Std.':'Nicht verfügbar',count=v=>Array.isArray(v)?String(v.length):'Nicht verfügbar';
      root.querySelector('#qaTarget').textContent=info.time?hours(info.time.target_minutes):'Nicht verfügbar';root.querySelector('#qaWorked').textContent=info.time?hours(info.time.confirmed_work_minutes):'Nicht verfügbar';root.querySelector('#qaQrCount').textContent=count(info.qr?.rows);
      root.querySelector('#qaSwapCount').textContent=count(info.swaps);root.querySelector('#qaMarketCount').textContent=count(info.market);root.querySelector('#qaOfferCount').textContent=count(info.offers);

      const actions=root.querySelector('#qaActionList');actions.replaceChildren();
      const addAction=(label,buttons)=>{const li=document.createElement('li');const title=document.createElement('p');title.textContent=label;li.append(title);for(const [text,name,args] of buttons){const button=document.createElement('button');button.type='button';button.textContent=text;button.onclick=()=>runAction(name,args);li.append(button)}actions.append(li)};
      for(const swap of Array.isArray(info.swaps)?info.swaps:[]){
        const buttons=[];
        if(swap.direction==='INCOMING'&&swap.status==='PENDING_COLLEAGUE')buttons.push(['Annehmen','qa_respond_swap_scoped',{p_swap:swap.id,p_decision:'APPROVE',p_comment:''}],['Ablehnen','qa_respond_swap_scoped',{p_swap:swap.id,p_decision:'REJECT',p_comment:''}]);
        if(swap.direction==='OUTGOING'&&['PENDING_COLLEAGUE','PENDING_MANAGER'].includes(swap.status))buttons.push(['Zurückziehen','qa_cancel_swap_scoped',{p_swap:swap.id}]);
        if(buttons.length)addAction(['Tauschanfrage',swap.shift_code||'Dienst',swap.other_employee_name||'Mitarbeiter'].join(' · '),buttons);
      }
      for(const item of Array.isArray(info.market)?info.market:[])if(item.is_own&&item.status==='MARKET_OPEN')addAction('Eigenes Marktangebot · '+(item.shift_code||'Dienst'),[['Zurückziehen','qa_cancel_swap_scoped',{p_swap:item.id}]]);
      for(const offer of Array.isArray(info.offers)?info.offers:[])if(offer.offer_status==='OFFERED')addAction('Ersatzangebot · '+(offer.shift_code||'Dienst'),[['Annehmen','qa_respond_offer_scoped',{p_offer:offer.offer_id,p_decision:'ACCEPT',p_comment:''}],['Ablehnen','qa_respond_offer_scoped',{p_offer:offer.offer_id,p_decision:'DECLINE',p_comment:''}]]);
      if(!actions.childElementCount){const li=document.createElement('li');li.textContent=[info.swaps,info.market,info.offers].every(Array.isArray)?'Keine offenen Testanfragen.':'Anfragen sind momentan nicht vollständig verfügbar.';actions.append(li)}
      const shiftList=root.querySelector('#qaShiftList');shiftList.replaceChildren();
      if(!Array.isArray(info.shifts)||!info.shifts.length){const li=document.createElement('li');li.textContent=Array.isArray(info.shifts)?'Keine kommenden Dienste vorhanden.':'Dienste sind momentan nicht verfügbar.';shiftList.append(li)}
      else info.shifts.forEach(shift=>{const li=document.createElement('li');const fmt=new Intl.DateTimeFormat('de-DE',{timeZone:d.company.timezone||'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});li.textContent=`${shift.shift_code} · ${fmt.format(new Date(shift.starts_at))} – ${fmt.format(new Date(shift.ends_at))}`;shiftList.append(li)});
      const list=root.querySelector('#qaAbsenceList');list.replaceChildren();
      if(!Array.isArray(info.absences)||!info.absences.length){const li=document.createElement('li');li.textContent=Array.isArray(info.absences)?'Keine Abwesenheiten vorhanden.':'Abwesenheiten sind momentan nicht verfügbar.';list.append(li)}
      else info.absences.forEach(a=>{const li=document.createElement('li');li.textContent=[a.absence_type,a.start_date===a.end_date?a.start_date:`${a.start_date} – ${a.end_date}`,a.status].filter(Boolean).join(' · ');list.append(li)});
    }
    async function runAction(name,args){
      const company=B.companyId,userId=B.user?.id,fields=root.querySelector('#qaActionFields'),absenceFields=root.querySelector('#qaAbsenceFields'),message=root.querySelector('#qaActionStatus');
      fields.disabled=true;absenceFields.disabled=true;select.disabled=true;message.textContent='Testanfrage wird bearbeitet …';let saved=false;
      try{
        const q=await B.client.rpc(name,{p_company:company,...args});if(q.error)throw q.error;saved=true;
        const choice=B.__qaMultiOptions.find(x=>String(x.company_id)===String(company));if(!choice||B.user?.id!==userId||B.companyId!==company)throw fail('Der Zugang wurde während der Aktion geändert.');
        const info=await details(choice);if(B.user?.id!==userId||B.companyId!==company)throw fail('Der Zugang wurde während des Ladens geändert.');
        B.__qaMultiDetails=info;render();message.textContent='Testanfrage wurde bearbeitet.';
      }catch(e){message.textContent=saved?'Aktion gespeichert, aber die Übersicht konnte nicht aktualisiert werden.':(e.message||'Testanfrage konnte nicht bearbeitet werden.')}
      finally{fields.disabled=false;absenceFields.disabled=false;select.disabled=false}
    }
    render();
    select.onchange=async()=>{
      const requested=select.value,previous=B.companyId,userId=B.user?.id,fields=root.querySelector('#qaAbsenceFields'),actionFields=root.querySelector('#qaActionFields');select.disabled=true;fields.disabled=true;actionFields.disabled=true;status.textContent='Unternehmen wird gewechselt …';
      try{
        const available=await options(),choice=available.find(x=>String(x.company_id)===requested);
        if(!choice)throw fail('Dieses Unternehmen ist nicht mehr freigegeben.');
        const [data,info]=await Promise.all([profile(choice),details(choice)]);
        if(B.user?.id!==userId)throw fail('Die Anmeldung hat sich geändert. Bitte erneut anmelden.');
        await setSessionCompany(choice.company_id);
        if(B.user?.id!==userId)throw fail('Die Anmeldung hat sich geändert. Bitte erneut anmelden.');
        B.__qaMultiOptions=available;B.__qaMultiProfile=data;B.__qaMultiDetails=info;B.companyId=choice.company_id;B.employeeDbId=choice.employee_id;B.employeeRecord=data.employee;B.accessProfileCompany=choice.company_id;B.employeePortalData={employee:data.employee,company:data.company};saveChoice(choice.company_id);render();root.querySelector('#qaAbsenceForm').reset();root.querySelector('#qaAbsenceStatus').textContent='';root.querySelector('#qaActionStatus').textContent='';status.textContent='Unternehmen gewechselt.';
      }catch(e){select.value=previous;status.textContent=e.message||'Unternehmen konnte nicht gewechselt werden.'}
      finally{select.disabled=false;fields.disabled=false;actionFields.disabled=false}
    };
    root.querySelector('#qaAbsenceForm').onsubmit=async event=>{
      event.preventDefault();const company=B.companyId,userId=B.user?.id,status=root.querySelector('#qaAbsenceStatus'),fields=root.querySelector('#qaAbsenceFields');
      const from=root.querySelector('#qaAbsenceFrom').value,to=root.querySelector('#qaAbsenceTo').value,type=root.querySelector('#qaAbsenceType').value;
      if(!from||!to||to<from){status.textContent='Bitte einen gültigen Zeitraum auswählen.';return}
      fields.disabled=true;root.querySelector('#qaActionFields').disabled=true;select.disabled=true;status.textContent='Testantrag wird gesendet …';let saved=false;
      try{
        const q=await B.client.rpc('qa_submit_absence_scoped',{p_company:company,p_absence_type:type,p_start_date:from,p_end_date:to,p_note:'',p_full_day:true,p_start_time:null,p_end_time:null,p_time_note:''});if(q.error)throw q.error;saved=true;
        const choice=B.__qaMultiOptions.find(x=>String(x.company_id)===String(company));if(!choice||B.user?.id!==userId||B.companyId!==company)throw fail('Das Unternehmen wurde während des Speicherns gewechselt.');
        const info=await details(choice);if(B.user?.id!==userId||B.companyId!==company)throw fail('Das Unternehmen wurde während des Ladens gewechselt.');
        B.__qaMultiDetails=info;render();event.target.reset();status.textContent='Testantrag gespeichert.';
      }catch(e){status.textContent=saved?'Testantrag gespeichert, aber die Übersicht konnte nicht aktualisiert werden.':(e.message||'Testantrag konnte nicht gespeichert werden.')}
      finally{fields.disabled=false;root.querySelector('#qaActionFields').disabled=false;select.disabled=false}
    };
    root.querySelector('#qaLogout').onclick=async event=>{const btn=event.currentTarget,storageKey=key();btn.disabled=true;try{const q=await B.client.auth.signOut();if(q.error)throw q.error;try{sessionStorage.removeItem(storageKey)}catch{}root.remove();location.reload()}catch(e){status.textContent=e.message||'Abmelden fehlgeschlagen.';btn.disabled=false}};
  };
})();
