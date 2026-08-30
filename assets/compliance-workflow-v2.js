// SchichtFunk Compliance V2 – Workflow
(function(){
  const C=window.SFCompliance;if(!C)return;

  C.snapshot=a=>a?{
    id:a.id,employeeId:a.employeeId,type:a.type,date:a.date,start:a.start,end:a.end,
    pause:Number(a.pause||0),note:a.note||'',version:Number(a.version||1),publishedAt:a.publishedAt||null
  }:null;

  C.requestStatus=(result,approvals={})=>{
    if(result.level==='BLOCK')return 'BLOCKED';
    if(result.employeeApproval&&approvals.employee!=='APPROVED')return 'PENDING_EMPLOYEE';
    if(result.worksCouncil&&approvals.worksCouncil!=='APPROVED')return 'PENDING_WORKS_COUNCIL';
    return 'READY_TO_APPLY';
  };

  C.openPlausibilityDialog=(items,onConfirm)=>{
    document.getElementById('sfPlausibilityDialog')?.remove();
    if(!document.getElementById('sfPlausibilityDialogCss')){
      const style=document.createElement('style');style.id='sfPlausibilityDialogCss';style.textContent=`
        .sf-pd-backdrop{position:fixed;inset:0;z-index:14000;display:grid;place-items:center;padding:20px;background:rgba(2,8,15,.72);backdrop-filter:blur(6px)}
        .sf-pd-modal{width:min(520px,100%);overflow:hidden;border:1px solid #314a62;border-radius:14px;background:linear-gradient(180deg,#102235,#0b1826);box-shadow:0 28px 90px rgba(0,0,0,.58);color:#edf6ff}
        .sf-pd-head{display:flex;gap:14px;padding:20px 22px 17px;border-bottom:1px solid #24394e;background:linear-gradient(180deg,rgba(255,189,79,.08),transparent)}
        .sf-pd-icon{flex:none;width:40px;height:40px;display:grid;place-items:center;border:1px solid #7c5b24;border-radius:10px;background:#302719;color:#ffd08a;font-size:20px}
        .sf-pd-head h2{margin:1px 0 4px;font-size:18px}.sf-pd-head p{margin:0;color:#91a7bd;font-size:12px;line-height:1.45}
        .sf-pd-body{padding:18px 22px}.sf-pd-label{display:block;margin-bottom:9px;color:#718ba5;font-size:10px;font-weight:800;letter-spacing:.09em}
        .sf-pd-list{display:grid;gap:8px}.sf-pd-item{display:grid;grid-template-columns:22px 1fr;gap:9px;align-items:start;padding:11px 12px;border:1px solid #594621;border-radius:8px;background:#282218;color:#f3d29c;font-size:12px;line-height:1.45}.sf-pd-item i{font-style:normal;font-weight:900;color:#ffbd4f}
        .sf-pd-note{margin:14px 0 0;padding:10px 12px;border-left:3px solid #ffbd4f;background:#172334;color:#9db0c3;font-size:11px;line-height:1.5}
        .sf-pd-foot{display:flex;justify-content:flex-end;gap:9px;padding:14px 22px;border-top:1px solid #22384c;background:#0b1724}.sf-pd-foot button{border-radius:8px;padding:9px 14px;font-size:12px;font-weight:800}
        .sf-pd-cancel{border:1px solid #34495d;background:#132335;color:#afc1d2}.sf-pd-confirm{border:1px solid #8a6123;background:#3a2c18;color:#ffd28d}.sf-pd-confirm:hover{background:#49371b}
      `;document.head.appendChild(style);
    }
    const esc=C.esc||((s)=>String(s??''));
    const back=document.createElement('div');back.id='sfPlausibilityDialog';back.className='sf-pd-backdrop';
    back.innerHTML=`<section class="sf-pd-modal" role="alertdialog" aria-modal="true" aria-labelledby="sfPdTitle" aria-describedby="sfPdNote"><header class="sf-pd-head"><div class="sf-pd-icon">⚠</div><div><h2 id="sfPdTitle">Plausibilitätsprüfung</h2><p>Die Zuweisung ist möglich, benötigt aber deine Aufmerksamkeit.</p></div></header><div class="sf-pd-body"><span class="sf-pd-label">BITTE PRÜFEN</span><div class="sf-pd-list">${items.map(x=>`<div class="sf-pd-item"><i>!</i><span>${esc(x)}</span></div>`).join('')}</div><p class="sf-pd-note" id="sfPdNote">Wenn du fortfährst, wird die Schicht trotz dieser Hinweise gespeichert.</p></div><footer class="sf-pd-foot"><button type="button" class="sf-pd-cancel">Abbrechen</button><button type="button" class="sf-pd-confirm">Trotzdem speichern</button></footer></section>`;
    document.body.appendChild(back);const close=()=>back.remove();
    back.querySelector('.sf-pd-cancel').onclick=close;back.querySelector('.sf-pd-confirm').onclick=()=>{close();onConfirm()};
    back.onclick=e=>{if(e.target===back)close()};back.onkeydown=e=>{if(e.key==='Escape')close()};back.querySelector('.sf-pd-confirm').focus();
  };

  C.directSave=(emp,type,date,start,end,extra={})=>{
    const existing=extra.ignoreId?assignments.find(x=>x.id===extra.ignoreId):null;
    const c=C.check(emp,type,date,start,end,existing?.id||null);
    if(c.hard.length){alert('Zuweisung nicht möglich:\n\n'+c.hard.join('\n'));return false}
    if(c.soft.length&&!extra.softConfirmed){C.openPlausibilityDialog(c.soft,()=>C.directSave(emp,type,date,start,end,{...extra,softConfirmed:true}));return false}
    if(existing){
      Object.assign(existing,{employeeId:emp.id,type,date,start,end,pause:Number(extra.pause||0),note:extra.note||'',version:Number(existing.version||1)+1});
    }else{
      assignments.push({id:C.uid('as'),employeeId:emp.id,type,date,start,end,pause:Number(extra.pause||0),note:extra.note||'',version:1});
    }
    C.audit(existing?'SHIFT_UPDATED_DRAFT':'SHIFT_CREATED_DRAFT',existing?.id||null,{employeeId:emp.id,type,date,start,end});
    C.refresh();
    C.toast(existing?'Schicht aktualisiert':'Schicht zugewiesen',`${emp.first} ${emp.last} · ${type} · ${C.fmt(date)} · ${start}–${end}`);
    extra.onSaved?.(existing||assignments[assignments.length-1]);
    return true;
  };

  C.save=(emp,type,date,start,end,extra={})=>{
    const assignment=extra.ignoreId?assignments.find(x=>x.id===extra.ignoreId):null;
    const published=assignment?C.isPublished(assignment):C.isWeekPublished(date);
    if(!published)return C.directSave(emp,type,date,start,end,extra);
    C.openChangeDrawer?.({
      action:assignment?'UPDATE':'CREATE',assignment,employeeId:emp.id,type,date,start,end,
      pause:Number(extra.pause||0),note:extra.note||''
    });
    return false;
  };

  C.createRequest=(payload,form,result)=>{
    const assignment=payload.assignment||null;
    const approvals={employee:'NOT_REQUIRED',worksCouncil:'NOT_REQUIRED'};
    if(result.employeeApproval)approvals.employee='PENDING';
    if(result.worksCouncil)approvals.worksCouncil='PENDING';
    const req={
      id:C.uid('cr'),action:payload.action,assignmentId:assignment?.id||null,
      employeeId:payload.employeeId||assignment?.employeeId||null,
      type:payload.type||assignment?.type||null,date:payload.date||assignment?.date||null,
      old:C.snapshot(assignment),
      proposed:payload.action==='DELETE'?null:{employeeId:payload.employeeId,type:payload.type,date:payload.date,start:payload.start,end:payload.end,pause:Number(payload.pause||0),note:payload.note||''},
      baseVersion:Number(assignment?.version||0),reasonCode:form.reasonCode,reasonText:form.reasonText||'',predictable:form.predictable||'UNKNOWN',
      requestedAt:new Date().toISOString(),requestedBy:'Administrator',noticeHours:null,
      complianceStatus:result.level,findings:result.findings,approvals,status:'DRAFT',appliedAt:null,rejectedAt:null
    };
    const iv=payload.action==='DELETE'?C.shiftInterval(assignment):C.interval(payload.date,payload.start,payload.end);
    if(iv)req.noticeHours=(iv.start-Date.now())/3600000;
    req.status=C.requestStatus(result,approvals);
    C.requests.unshift(req);C.persist();
    C.audit('SHIFT_CHANGE_CREATED',req.id,{action:req.action,assignmentId:req.assignmentId,status:req.status,reasonCode:req.reasonCode});
    return req;
  };

  C.findRequest=id=>C.requests.find(r=>r.id===id);
  C.latestCheckForRequest=req=>C.complianceCheck({
    action:req.action,assignment:req.assignmentId?assignments.find(a=>a.id===req.assignmentId):null,
    employeeId:req.proposed?.employeeId||req.employeeId,type:req.proposed?.type||req.type,date:req.proposed?.date||req.date,
    start:req.proposed?.start,end:req.proposed?.end
  });

  C.applyRequest=id=>{
    const req=C.findRequest(id);if(!req)return false;
    const current=req.assignmentId?assignments.find(a=>a.id===req.assignmentId):null;
    if(req.assignmentId&&(!current||Number(current.version||1)!==Number(req.baseVersion||0))){
      req.status='SUPERSEDED';C.audit('SHIFT_CHANGE_SUPERSEDED',req.id,{reason:'VERSION_CONFLICT'});C.persist();C.openComplianceCenter?.();return false;
    }
    const fresh=C.latestCheckForRequest(req);req.findings=fresh.findings;req.complianceStatus=fresh.level;
    if(fresh.level==='BLOCK'){
      req.status='BLOCKED';C.audit('SHIFT_CHANGE_BLOCKED',req.id,{findings:fresh.findings});C.persist();C.openComplianceCenter?.();return false;
    }
    if(fresh.employeeApproval&&req.approvals.employee!=='APPROVED'){
      req.approvals.employee='PENDING';req.status='PENDING_EMPLOYEE';C.persist();C.openComplianceCenter?.();return false;
    }
    if(fresh.worksCouncil&&req.approvals.worksCouncil!=='APPROVED'){
      req.approvals.worksCouncil='PENDING';req.status='PENDING_WORKS_COUNCIL';C.persist();C.openComplianceCenter?.();return false;
    }
    if(req.action==='UPDATE'){
      Object.assign(current,{...req.proposed,version:Number(current.version||1)+1,lastChangeRequestId:req.id});
    }else if(req.action==='CREATE'){
      const pub=C.publication(req.proposed.date);
      assignments.push({id:C.uid('as'),...req.proposed,version:1,publishedAt:pub?.publishedAt||new Date().toISOString(),lastChangeRequestId:req.id});
    }else if(req.action==='DELETE'){
      assignments=assignments.filter(a=>a.id!==req.assignmentId);
    }
    req.status='APPLIED';req.appliedAt=new Date().toISOString();
    C.audit('SHIFT_CHANGE_APPLIED',req.id,{action:req.action,assignmentId:req.assignmentId});
    C.refresh();C.openComplianceCenter?.();
    C.toast('Schichtänderung übernommen','Compliance-Prüfung und erforderliche Freigaben sind abgeschlossen.');
    return true;
  };

  C.approveRequest=(id,kind)=>{
    const req=C.findRequest(id);if(!req)return;
    if(kind==='employee'){req.approvals.employee='APPROVED';C.audit('EMPLOYEE_APPROVED',id)}
    if(kind==='worksCouncil'){req.approvals.worksCouncil='APPROVED';C.audit('WORKS_COUNCIL_APPROVED',id)}
    const fresh=C.latestCheckForRequest(req);req.status=C.requestStatus(fresh,req.approvals);C.persist();
    if(req.status==='READY_TO_APPLY')C.applyRequest(id);else C.openComplianceCenter?.();
  };
  C.rejectRequest=(id,kind='employee')=>{
    const req=C.findRequest(id);if(!req)return;
    if(kind==='employee')req.approvals.employee='REJECTED';
    if(kind==='worksCouncil')req.approvals.worksCouncil='REJECTED';
    req.status='REJECTED';req.rejectedAt=new Date().toISOString();C.audit(kind==='worksCouncil'?'WORKS_COUNCIL_REJECTED':'EMPLOYEE_REJECTED',id);C.persist();C.openComplianceCenter?.();
  };
  C.cancelRequest=id=>{const req=C.findRequest(id);if(!req||req.status==='APPLIED')return;req.status='CANCELLED';C.audit('SHIFT_CHANGE_CANCELLED',id);C.persist();C.openComplianceCenter?.()};

  window.spApplyChangeRequest=id=>C.applyRequest(id);
  window.spApproveRequest=(id,kind)=>C.approveRequest(id,kind);
  window.spRejectRequest=(id,kind)=>C.rejectRequest(id,kind);
  window.spCancelChangeRequest=id=>C.cancelRequest(id);

  window.assignEmployeeByDrop=function(employeeId,type,date){
    const emp=employees.find(e=>e.id===employeeId),t=typeById(type);if(!emp||!t)return;
    C.save(emp,type,date,t.start,t.end);
  };
  window.isEligible=function(emp,type,date){const t=typeById(type);return !!t&&C.check(emp,type,date,t.start,t.end).hard.length===0};
  window.absent=function(employeeId,date){const d=C.parseDate(date);if(!d)return false;const day={start:d.getTime(),end:d.getTime()+86400000};return absences.some(a=>a.employeeId===employeeId&&C.overlap(day,C.absenceInterval(a)))};

  function closeAssign(){document.getElementById('spAssignModal')?.remove()}
  window.spCloseAssignModal=closeAssign;
  function personRows(type,date,start,end,q=''){
    q=q.trim().toLowerCase();
    return employees.filter(e=>e.status==='active'&&(`${e.first} ${e.last} ${e.personnelNo||''} ${e.role||''}`).toLowerCase().includes(q)).map(e=>{
      const x=C.check(e,type,date,start,end),blocked=x.hard.length>0,status=blocked?x.hard.join(' '):(x.soft.length?'⚠ '+x.soft.join(' '):'✓ Verfügbar und freigegeben');
      return `<button type="button" class="sp-assign-person ${blocked?'blocked':''}" data-emp="${C.esc(e.id)}" ${blocked?'disabled':''}><span class="avatar">${C.esc((e.first?.[0]||'')+(e.last?.[0]||''))}</span><span class="sp-assign-person-copy"><b>${C.esc(e.first+' '+e.last)}</b><small>${C.esc((e.personnelNo||'')+(e.role?' · '+e.role:''))}</small><em>${C.esc(status)}</em></span></button>`;
    }).join('')||'<div class="sp-assign-empty">Keine passenden Mitarbeiter gefunden.</div>';
  }
  window.openAssign=function(type,date){
    const t=typeById(type);if(!t)return;closeAssign();
    const m=document.createElement('div');m.id='spAssignModal';m.className='sp-assign-backdrop';
    m.innerHTML=`<div class="sp-assign-modal" role="dialog" aria-modal="true"><div class="sp-assign-head"><div><div class="eyebrow">SCHICHTZUWEISUNG</div><h2>${C.esc(type)} besetzen</h2><p>${C.esc(C.fmt(date))} · ${C.esc(t.start)}–${C.esc(t.end)}${C.isWeekPublished(date)?' · veröffentlichter Plan':''}</p></div><button class="sp-assign-close" onclick="spCloseAssignModal()">✕</button></div><div class="sp-assign-body"><label class="sp-assign-label">Mitarbeiter suchen</label><input id="spAssignSearch" class="sp-assign-search" placeholder="Vorname, Nachname oder Personalnummer ..."><div class="sp-assign-help">Gesetzliche Standard-Sperren blockieren. Bei einem veröffentlichten Plan wird eine Änderungsprüfung gestartet.</div><div id="spAssignPeople" class="sp-assign-people"></div></div><div class="sp-assign-foot"><button class="ghost" onclick="spCloseAssignModal()">Abbrechen</button></div></div>`;
    document.body.appendChild(m);const input=m.querySelector('#spAssignSearch'),people=m.querySelector('#spAssignPeople');
    const render=()=>{people.innerHTML=personRows(type,date,t.start,t.end,input.value);people.querySelectorAll('.sp-assign-person:not(.blocked)').forEach(b=>b.onclick=()=>{const emp=employees.find(e=>e.id===b.dataset.emp);if(!emp)return;C.save(emp,type,date,t.start,t.end);closeAssign()});};input.oninput=render;render();input.focus();
  };

  window.editAssignment=function(id){
    const a=assignments.find(x=>x.id===id);if(!a)return;const t=typeById(a.type),emp=employees.find(e=>e.id===a.employeeId);if(!t||!emp)return;closeAssign();
    const types=TYPES.map(x=>`<option value="${C.esc(x.id)}" ${x.id===a.type?'selected':''}>${C.esc(x.id)}</option>`).join('');
    const emps=employees.filter(e=>e.status==='active'||e.id===emp.id).map(e=>`<option value="${C.esc(e.id)}" ${e.id===emp.id?'selected':''}>${C.esc(e.first+' '+e.last+(e.personnelNo?' · '+e.personnelNo:''))}</option>`).join('');
    const m=document.createElement('div');m.id='spAssignModal';m.className='sp-assign-backdrop';
    m.innerHTML=`<div class="sp-assign-modal sp-assign-edit" role="dialog" aria-modal="true"><div class="sp-assign-head"><div><div class="eyebrow">SCHICHT BEARBEITEN</div><h2>${C.esc(a.type)} · ${C.esc(emp.first+' '+emp.last)}</h2><p>${C.isPublished(a)?'Veröffentlichte Schicht: Änderungen laufen über die Compliance-Prüfung.':'Entwurf: Änderungen können direkt gespeichert werden.'}</p></div><button class="sp-assign-close" onclick="spCloseAssignModal()">✕</button></div><div class="sp-assign-body"><div class="sp-edit-grid"><label>Mitarbeiter<select id="spEditEmp">${emps}</select></label><label>Schicht<select id="spEditType">${types}</select></label><label>Datum<input id="spEditDate" type="date" value="${C.esc(a.date)}"></label><label>Beginn<input id="spEditStart" type="time" value="${C.esc(a.start||t.start)}"></label><label>Ende<input id="spEditEnd" type="time" value="${C.esc(a.end||t.end)}"></label><label>Pause (Min.)<input id="spEditPause" type="number" min="0" step="5" value="${Number(a.pause||0)}"></label></div><label class="sp-edit-note">Bemerkung<textarea id="spEditNote" rows="3">${C.esc(a.note||'')}</textarea></label><div id="spEditCheck" class="sp-edit-check"></div></div><div class="sp-assign-foot"><button class="danger" id="spDeleteAssign">🗑 Schicht löschen</button><span></span><button class="ghost" onclick="spCloseAssignModal()">Abbrechen</button><button class="primary" id="spSaveAssign">${C.isPublished(a)?'Änderung prüfen':'Änderungen speichern'}</button></div></div>`;
    document.body.appendChild(m);const val=x=>m.querySelector('#'+x).value;
    const validate=()=>{const e=employees.find(x=>x.id===val('spEditEmp')),type=val('spEditType'),tt=typeById(type),date=val('spEditDate'),start=val('spEditStart')||tt?.start,end=val('spEditEnd')||tt?.end,c=e&&tt?C.check(e,type,date,start,end,a.id):{hard:['Ungültige Eingabe'],soft:[]};const box=m.querySelector('#spEditCheck');box.className='sp-edit-check '+(c.hard.length?'bad':c.soft.length?'warn':'good');box.innerHTML=c.hard.length?'⛔ '+C.esc(c.hard.join(' ')):c.soft.length?'⚠ '+C.esc(c.soft.join(' ')):'✓ Keine Standardverletzung erkannt.';return{e,type,date,start,end,c}};
    ['spEditEmp','spEditType','spEditDate','spEditStart','spEditEnd'].forEach(x=>m.querySelector('#'+x).onchange=validate);validate();
    m.querySelector('#spSaveAssign').onclick=()=>{const v=validate();if(!v.e)return;if(!C.isPublished(a)&&v.c.hard.length)return;C.save(v.e,v.type,v.date,v.start,v.end,{ignoreId:a.id,pause:val('spEditPause'),note:val('spEditNote')});closeAssign()};
    m.querySelector('#spDeleteAssign').onclick=()=>{if(C.isPublished(a)){closeAssign();C.openChangeDrawer?.({action:'DELETE',assignment:a,employeeId:a.employeeId,type:a.type,date:a.date,start:a.start||t.start,end:a.end||t.end,pause:a.pause||0,note:a.note||''});return}if(!confirm(`Schicht ${a.type} für ${emp.first} ${emp.last} wirklich löschen?`))return;assignments=assignments.filter(x=>x.id!==a.id);C.audit('SHIFT_DELETED_DRAFT',a.id);C.refresh();closeAssign();C.toast('Schicht gelöscht',`${a.type} · ${emp.first} ${emp.last}`)};
  };

  if(typeof window.applyAutoPlanPreview==='function'){
    const baseAuto=window.applyAutoPlanPreview;
    window.applyAutoPlanPreview=function(){if(C.isWeekPublished(C.iso(weekStart))){alert('Der Dienstplan dieser Woche ist bereits veröffentlicht. Auto-Planung darf veröffentlichte Pläne nicht direkt überschreiben. Bitte Änderungen einzeln prüfen.');return}return baseAuto.apply(this,arguments)};
  }
})();

