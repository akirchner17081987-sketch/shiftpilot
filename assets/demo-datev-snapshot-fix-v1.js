// SchichtFunk – Demo DATEV Snapshot-Konsistenz V1
(function(){
  if(sessionStorage.getItem('sf_demo_session_v1')!=='active')return;
  if(window.__sfDemoDatevSnapshotFixV1)return;window.__sfDemoDatevSnapshotFixV1=true;

  const B=window.SFBackend=window.SFBackend||{};
  const MONTH='2026-08';
  let wrapper=null,wrappedBase=null,timer=0;
  const clone=v=>JSON.parse(JSON.stringify(v));

  function demoEmployees(){
    try{return typeof employees!=='undefined'&&Array.isArray(employees)?employees:[]}catch{return []}
  }
  function demoEntries(){
    try{return window.SchichtFunkDemoAugust2026?.entries?.()||[]}catch{return []}
  }
  function fullName(e){return `${e?.first||''} ${e?.last||''}`.trim()||'Demo-Mitarbeiter'}
  function numericPersonnelNo(e,index){
    const raw=String(e?.personnelNo||'');
    const m=raw.match(/(\d+)$/);
    return m?String(1000+Number(m[1])):String(1001+index);
  }
  function confirmedMinutes(id,entries){
    return entries.filter(x=>String(x.employee_id)===String(id)&&x.entry_status==='confirmed').reduce((sum,x)=>{
      if(!x.actual_start||!x.actual_end)return sum;
      const a=new Date(x.actual_start),b=new Date(x.actual_end);
      const mins=Math.round((b-a)/60000)-Number(x.actual_break_minutes||0);
      return sum+(Number.isFinite(mins)?Math.max(0,mins):0);
    },0);
  }
  function repairBundle(input){
    const bundle=clone(input||{employees:[],details:[]});
    bundle.employees=Array.isArray(bundle.employees)?bundle.employees:[];
    bundle.details=Array.isArray(bundle.details)?bundle.details:[];
    const entries=demoEntries(),staff=demoEmployees();
    const ids=new Set(bundle.employees.map(e=>String(e.employee_id||e.id||'')));
    const required=new Set([
      ...bundle.details.map(d=>String(d.employee_id||'')),
      ...entries.map(e=>String(e.employee_id||''))
    ].filter(Boolean));

    required.forEach(id=>{
      if(ids.has(id))return;
      const index=staff.findIndex(e=>String(e.id)===id);
      const e=index>=0?staff[index]:null;
      if(!e)return;
      bundle.employees.push({
        employee_id:id,
        employee_name:fullName(e),
        personnel_no:numericPersonnelNo(e,index),
        confirmed_work_minutes:confirmedMinutes(id,entries)
      });
      ids.add(id);
    });
    return bundle;
  }

  function patchApiBundle(){
    const api=window.SchichtFunkDemoAugust2026;
    if(!api||api.__sfDatevSnapshotFixed)return;
    const base=api.bundle;
    if(typeof base==='function')api.bundle=()=>repairBundle(base());
    api.__sfDatevSnapshotFixed=true;
  }

  function patchRpc(){
    const current=B.client?.rpc;
    if(typeof current!=='function')return false;
    if(current===wrapper)return true;
    wrappedBase=current.bind(B.client);
    wrapper=async function(name,args={}){
      const res=await wrappedBase(name,args);
      if(name==='manager_time_report_bundle'&&String(args?.p_month||'').startsWith(MONTH)&&!res?.error){
        return {...res,data:repairBundle(res?.data)};
      }
      return res;
    };
    wrapper.__sfDemoCloudV2=true;
    wrapper.__sfDemoDatevSnapshotFixV1=true;
    B.client.rpc=wrapper;
    return true;
  }

  function ensure(){
    patchApiBundle();patchRpc();
    clearTimeout(timer);timer=setTimeout(ensure,500);
  }
  ensure();
})();
