// SchichtFunk – Demo DATEV Snapshot-Konsistenz V2
(function(){
  if(sessionStorage.getItem('sf_demo_session_v1')!=='active')return;
  if(window.__sfDemoDatevSnapshotFixV2)return;window.__sfDemoDatevSnapshotFixV2=true;

  const B=window.SFBackend=window.SFBackend||{};
  const MONTH='2026-08';
  let patched=false,retryTimer=0;
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

  function augustBundle(){
    try{return repairBundle(window.SchichtFunkDemoAugust2026?.bundle?.()||{employees:[],details:[]})}
    catch{return {employees:[],details:[]}}
  }
  function filterAugustEntries(args={}){
    const start=String(args.p_start_date||'2026-08-01');
    const end=String(args.p_end_date||'2026-08-31');
    return demoEntries().filter(e=>{
      const d=String(e.starts_at||'').slice(0,10);
      return d>=start&&d<=end;
    });
  }
  function requestMonth(name,args={}){
    if(name==='manager_list_time_entries')return String(args.p_start_date||'').slice(0,7);
    return String(args.p_month||'').slice(0,7);
  }

  function patchApiBundle(){
    const api=window.SchichtFunkDemoAugust2026;
    if(!api||api.__sfDatevSnapshotFixedV2)return;
    const base=api.bundle;
    if(typeof base==='function')api.bundle=()=>repairBundle(base());
    api.__sfDatevSnapshotFixedV2=true;
  }

  function patchRpc(){
    if(patched)return true;
    const client=B.client,current=client?.rpc;
    if(typeof current!=='function')return false;
    if(current.__sfDemoDatevSnapshotFixV2){patched=true;return true}
    const base=current.bind(client);
    const wrapper=async function(name,args={}){
      const month=requestMonth(name,args);
      if(name==='manager_time_month_status'){
        if(month===MONTH)return {data:{status:'CLOSED',closed_at:'2026-09-01T06:00:00+02:00',demo:true},error:null};
        return {data:{status:'OPEN',closed_at:null,demo:true},error:null};
      }
      if(name==='manager_time_report_bundle'){
        if(month===MONTH)return {data:clone(augustBundle()),error:null};
        return {data:{employees:[],details:[],demo:true},error:null};
      }
      if(name==='manager_list_time_entries'){
        if(month===MONTH)return {data:clone(filterAugustEntries(args)),error:null};
        return {data:[],error:null};
      }
      return base(name,args);
    };
    wrapper.__sfDemoCloudV2=true;
    wrapper.__sfDemoDatevSnapshotFixV2=true;
    client.rpc=wrapper;
    patched=true;
    return true;
  }

  function boot(){
    patchApiBundle();
    if(patchRpc())return;
    clearTimeout(retryTimer);retryTimer=setTimeout(boot,120);
  }
  boot();
})();
