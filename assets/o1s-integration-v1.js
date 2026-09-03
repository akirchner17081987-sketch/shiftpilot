// SchichtFunk – O1S Vollintegration V1
(function(){
  if(window.__sfO1SIntegrationV1)return;window.__sfO1SIntegrationV1=true;
  const O1S={id:'O1S',name:'O1S',start:'18:00',end:'04:00',cls:'cyan'};
  const protectedEmployees=new WeakSet();
  let demoRpcPatched=false,lastRender=0;

  function ensureType(){
    try{
      if(typeof TYPES==='undefined'||!Array.isArray(TYPES))return false;
      let t=TYPES.find(x=>x?.id==='O1S');
      if(!t){
        const idx=TYPES.findIndex(x=>x?.id==='O1');
        TYPES.splice(idx>=0?idx+1:1,0,{...O1S});
        t=TYPES.find(x=>x?.id==='O1S');
      }
      if(t){
        t.name=t.name||'O1S';t.cls=t.cls||'cyan';
        try{
          if(typeof store!=='undefined'&&store?.get){
            const saved=store.get('shiftTimes',{});const s=saved?.O1S;
            t.start=s?.start||t.start||O1S.start;t.end=s?.end||t.end||O1S.end;
          }else{t.start=t.start||O1S.start;t.end=t.end||O1S.end}
        }catch{t.start=t.start||O1S.start;t.end=t.end||O1S.end}
      }
      if(typeof globalSoll!=='undefined'&&globalSoll&&globalSoll.O1S==null)globalSoll.O1S=0;
      return true;
    }catch(err){console.warn('[SchichtFunk O1S] Schichttyp konnte noch nicht ergänzt werden.',err);return false}
  }

  function protectEmployee(e){
    if(!e||typeof e!=='object'||protectedEmployees.has(e))return;
    const desc=Object.getOwnPropertyDescriptor(e,'shifts');
    if(desc&&!desc.configurable)return;
    let backing=Array.isArray(e.shifts)?Array.from(new Set(e.shifts)):[];
    if(backing.includes('O1S')&&Array.isArray(e.qualifications)&&!e.qualifications.includes('O1S'))e.qualifications.push('O1S');
    try{
      Object.defineProperty(e,'shifts',{
        configurable:true,enumerable:true,
        get(){return backing},
        set(value){
          let next=Array.isArray(value)?Array.from(new Set(value)):[];
          if(Array.isArray(e.qualifications)&&e.qualifications.includes('O1S')&&!next.includes('O1S'))next.push('O1S');
          backing=next;
        }
      });
      protectedEmployees.add(e);
    }catch{}
  }

  function protectAllEmployees(){
    try{if(typeof employees!=='undefined'&&Array.isArray(employees))employees.forEach(protectEmployee)}catch{}
  }

  function selectedEmployee(){
    try{return typeof selectedEmployeeId!=='undefined'&&Array.isArray(employees)?employees.find(e=>String(e.id)===String(selectedEmployeeId)):null}catch{return null}
  }

  function enhanceEmployeeManagement(){
    protectAllEmployees();
    const root=document.getElementById('spEmployeeV2');
    if(root){
      const filters=root.querySelector('#spEmpQualFilters');
      if(filters&&!filters.querySelector('[data-q="O1S"]')){
        const b=document.createElement('button');b.type='button';b.className='sp-filter-chip';b.dataset.q='O1S';b.textContent='O1S';
        b.addEventListener('click',()=>{
          root.querySelectorAll('#spEmpQualFilters [data-q]').forEach(x=>x.classList.toggle('active',x===b));
          const rows=root.querySelectorAll('#spEmployeeList [data-id]');
          rows.forEach(row=>{const e=(typeof employees!=='undefined'?employees:[]).find(x=>String(x.id)===String(row.dataset.id));row.style.display=e?.shifts?.includes('O1S')?'':'none'});
        });filters.appendChild(b);
      }
      root.querySelectorAll('#spEmployeeList [data-id]').forEach(row=>{
        const e=(typeof employees!=='undefined'?employees:[]).find(x=>String(x.id)===String(row.dataset.id));
        if(!e?.shifts?.includes('O1S'))return;
        const set=row.querySelector('.sp-qual-set');if(set&&![...set.querySelectorAll('.sp-q')].some(x=>x.textContent.trim()==='O1S')){const i=document.createElement('i');i.className='sp-q';i.textContent='O1S';set.appendChild(i)}
      });
    }
    const body=document.getElementById('spTabBody');
    if(!body)return;
    const emp=selectedEmployee();
    const qualInputs=[...body.querySelectorAll('input[data-qual]')];
    if(qualInputs.length&&!body.querySelector('input[data-qual][value="O1S"]')){
      const host=qualInputs[0]?.closest('.sp-checks');
      if(host){const l=document.createElement('label');l.className='sp-check';l.innerHTML=`<input type="checkbox" data-qual value="O1S" ${emp?.qualifications?.includes('O1S')||emp?.shifts?.includes('O1S')?'checked':''}>O1S`;host.appendChild(l)}
    }
    const prefInputs=[...body.querySelectorAll('input[data-preferred]')];
    if(prefInputs.length&&!body.querySelector('input[data-preferred][value="O1S"]')){
      const host=prefInputs[0]?.closest('.sp-checks');
      if(host){const l=document.createElement('label');l.className='sp-check';l.innerHTML=`<input type="checkbox" data-preferred value="O1S" ${emp?.preferredShifts?.includes('O1S')?'checked':''}>O1S`;host.appendChild(l)}
    }
  }

  function isoPlusDays(isoDate,days){
    const m=String(isoDate||'').match(/^(\d{4})-(\d{2})-(\d{2})/);if(!m)return String(isoDate||'').slice(0,10);
    const d=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])+days));return d.toISOString().slice(0,10);
  }
  function timeOn(base,time,dayDelta=0){const date=isoPlusDays(String(base||'').slice(0,10),dayDelta);return `${date}T${time}:00+02:00`}

  function patchDemoRpc(){
    if(sessionStorage.getItem('sf_demo_session_v1')!=='active')return false;
    const B=window.SFBackend;
    const rpc=B?.client?.rpc;
    if(typeof rpc!=='function'||!rpc.__sfDemoCloudV2||rpc.__sfO1SIntegrationV1)return false;
    const base=rpc.bind(B.client);
    const wrapped=async function(name,args){
      const res=await base(name,args);
      if(!res?.error&&Array.isArray(res?.data)){
        if(name==='manager_list_shift_marketplace'||name==='employee_list_shift_marketplace'){
          res.data=res.data.map(row=>{
            if(row?.id!=='demo-market-01')return row;
            return {...row,shift_code:'O1S',starts_at:timeOn(row.starts_at,'18:00')};
          });
        }
        if(name==='manager_list_time_entries'){
          res.data=res.data.map(row=>{
            if(row?.assignment_id!=='demo-time-03')return row;
            const start=timeOn(row.starts_at,'18:00'),end=timeOn(row.starts_at,'04:00',1);
            return {...row,shift_code:'O1S',starts_at:start,ends_at:end,actual_start:timeOn(row.starts_at,'18:20'),actual_end:end};
          });
        }
      }
      return res;
    };
    wrapped.__sfDemoCloudV2=true;wrapped.__sfO1SIntegrationV1=true;B.client.rpc=wrapped;demoRpcPatched=true;return true;
  }

  function patchDemoPlanning(){
    if(sessionStorage.getItem('sf_demo_session_v1')!=='active')return false;
    try{
      if(typeof employees==='undefined'||typeof assignments==='undefined'||!Array.isArray(employees)||!Array.isArray(assignments))return false;
      const e=employees.find(x=>x.id==='demo-e03');if(!e)return false;
      protectEmployee(e);
      e.qualifications=Array.from(new Set([...(e.qualifications||[]),'O1S']));
      e.shifts=Array.from(new Set(['O1S',...(e.shifts||[])]));e._demoPrimary='O1S';
      if(typeof globalSoll!=='undefined'&&globalSoll)globalSoll.O1S=1;
      assignments.filter(a=>a.employeeId===e.id).forEach(a=>{a.type='O1S';a.start='18:00';a.end='04:00'});
      try{if(typeof store!=='undefined'&&store?.set){store.set('employees',employees);store.set('assignments',assignments);store.set('globalSoll',globalSoll)}}catch{}
      return true;
    }catch{return false}
  }

  function rerender(){
    const now=Date.now();if(now-lastRender<120)return;lastRender=now;
    try{if(typeof renderLibrary==='function')renderLibrary()}catch{}
    try{if(typeof renderPlanEmployeePool==='function')renderPlanEmployeePool()}catch{}
    try{if(typeof renderCalendar==='function')renderCalendar()}catch{}
    try{if(typeof renderSettings==='function')renderSettings()}catch{}
    try{if(typeof renderEmployees==='function')renderEmployees()}catch{}
    try{if(typeof updateStats==='function')updateStats()}catch{}
  }

  function run(){
    const typeReady=ensureType();protectAllEmployees();enhanceEmployeeManagement();
    const demoChanged=patchDemoPlanning();const rpcChanged=patchDemoRpc();
    if(typeReady&&(demoChanged||rpcChanged))rerender();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{run();rerender()},{once:true});else{run();rerender()}
  [80,180,350,700,1200,2200,4000].forEach(ms=>setTimeout(()=>{run();if(ms===700||ms===2200)rerender()},ms));
  const observer=new MutationObserver(()=>{ensureType();protectAllEmployees();enhanceEmployeeManagement();patchDemoPlanning();patchDemoRpc()});
  if(document.documentElement)observer.observe(document.documentElement,{childList:true,subtree:true});
})();
