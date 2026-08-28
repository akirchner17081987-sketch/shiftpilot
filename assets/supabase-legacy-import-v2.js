// SchichtFunk – conflict-tolerant one-time LocalStorage import V2
(function(){
  const B=window.SFBackend=window.SFBackend||{},C=window.SFCompliance=window.SFCompliance||{};
  const baseImport=B.importLegacy;
  if(typeof baseImport!=='function')return;

  const monday=date=>{const d=new Date(date+'T00:00:00');d.setDate(d.getDate()-((d.getDay()+6)%7));return d.toISOString().slice(0,10)};
  const interval=(date,start,end)=>{const s=new Date(`${date}T${start}:00`),e=new Date(`${date}T${end}:00`);if(e<=s)e.setDate(e.getDate()+1);return{startsAt:s.toISOString(),endsAt:e.toISOString()}};
  const employeePayload=e=>({
    company_id:B.companyId,legacy_id:String(e.id),first_name:e.first||'',last_name:e.last||'',
    personnel_no:e.personnelNo||null,role:e.role||'Sicherheitsmitarbeiter',employment:e.employment||'Vollzeit',
    weekly_hours:Number(e.weeklyHours||0),start_date:e.startDate||null,contract_end:e.contractEnd||null,
    birth_date:e.birthDate||null,status:e.status||'active',email:e.email||null,phone:e.phone||null,
    address:e.address||null,zip:e.zip||null,city:e.city||null,shift_permissions:e.shifts||[],
    qualifications:e.qualifications||[],work_time_model:e.workTimeModel||'SHIFT',note:e.note||''
  });

  async function ensureEmployeeMap(L){
    if(Array.isArray(L.employees)&&L.employees.length){
      const q=await B.client.from('employees').upsert(L.employees.map(employeePayload),{onConflict:'company_id,legacy_id'}).select('id,legacy_id');
      if(q.error)throw q.error;
    }
    const q=await B.client.from('employees').select('id,legacy_id').eq('company_id',B.companyId);
    if(q.error)throw q.error;
    B.empDb.clear();B.empLocal.clear();
    (q.data||[]).forEach(x=>{const lid=String(x.legacy_id||x.id);B.empDb.set(lid,x.id);B.empLocal.set(x.id,lid)});
  }

  async function importAssignments(L){
    B.asgDb.clear();B.asgLocal.clear();
    const existing=await B.client.from('shift_assignments').select('id,legacy_id').eq('company_id',B.companyId);
    if(existing.error)throw existing.error;
    (existing.data||[]).forEach(x=>{if(x.legacy_id){B.asgDb.set(String(x.legacy_id),x.id);B.asgLocal.set(x.id,String(x.legacy_id))}});

    let count=0;
    for(const a of (Array.isArray(L.assignments)?L.assignments:[])){
      const employeeId=B.empDb.get(String(a.employeeId));
      if(!employeeId)continue;
      const t=typeof typeById==='function'?typeById(a.type):null;
      const iv=interval(a.date,a.start||t?.start||'00:00',a.end||t?.end||'00:00');
      const pub=a.publishedAt||C.publications?.[monday(a.date)]?.publishedAt||null;
      const q=await B.client.rpc('import_legacy_shift_assignment',{
        p_company_id:B.companyId,
        p_employee_id:employeeId,
        p_legacy_id:String(a.id),
        p_shift_code:a.type,
        p_starts_at:iv.startsAt,
        p_ends_at:iv.endsAt,
        p_break_minutes:Number(a.pause||0),
        p_note:a.note||'',
        p_status:pub?'PUBLISHED':'DRAFT',
        p_published_at:pub,
        p_version:Number(a.version||1)
      });
      if(q.error)throw new Error(`Schicht ${a.id}: ${q.error.message}`);
      B.asgDb.set(String(a.id),q.data);B.asgLocal.set(q.data,String(a.id));count++;
    }
    return count;
  }

  async function importTimeEntries(L){
    let count=0;
    for(const [lid,t] of Object.entries(L.timeEntries||{})){
      const assignmentId=B.asgDb.get(String(lid));
      const a=(L.assignments||[]).find(x=>String(x.id)===String(lid));
      if(!assignmentId||!a)continue;
      let actual_start=null,actual_end=null;
      if(t.actualStart&&t.actualEnd){const iv=interval(a.date,t.actualStart,t.actualEnd);actual_start=iv.startsAt;actual_end=iv.endsAt}
      const q=await B.client.from('time_entries').upsert({
        assignment_id:assignmentId,company_id:B.companyId,actual_start,actual_end,
        break_minutes:Number(t.breakMin||0),status:t.status||'open',updated_by:B.user.id
      });
      if(q.error)throw q.error;count++;
    }
    return count;
  }

  B.importLegacy=async()=>{
    if(!B.hasLegacy)return;
    const done=await B.client.from('legacy_imports').select('imported_at').eq('company_id',B.companyId).eq('user_id',B.user.id).eq('source','localstorage_v1').maybeSingle();
    if(done.error)throw done.error;
    if(done.data)return;

    const L=B.legacy;
    await ensureEmployeeMap(L);
    const assignmentCount=await importAssignments(L);
    const timeEntryCount=await importTimeEntries(L);

    // The original importer remains responsible for absences, staffing targets,
    // publications, change requests and historical audit events. Assignments and
    // time entries are temporarily hidden from it so its strict live-write path
    // cannot reject legitimate legacy conflicts a second time.
    const savedAssignments=L.assignments,savedTimeEntries=L.timeEntries;
    L.assignments=[];L.timeEntries=null;
    try{
      await baseImport();
      const marker=await B.client.from('legacy_imports').select('counts').eq('company_id',B.companyId).eq('user_id',B.user.id).eq('source','localstorage_v1').maybeSingle();
      if(!marker.error&&marker.data){
        const counts={...(marker.data.counts||{}),assignments:assignmentCount,timeEntries:timeEntryCount};
        const u=await B.client.from('legacy_imports').update({counts}).eq('company_id',B.companyId).eq('user_id',B.user.id).eq('source','localstorage_v1');
        if(u.error)console.warn('SchichtFunk Importstatistik',u.error);
      }
    } finally {
      L.assignments=savedAssignments;L.timeEntries=savedTimeEntries;
    }
  };
})();