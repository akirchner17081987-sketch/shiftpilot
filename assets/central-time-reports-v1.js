// Add central captured time to the existing planning dashboard.
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(window.SFReports||B.__centralTimeReports)return;B.__centralTimeReports=true;
  const roles=new Set(['OWNER','ADMIN','DISPATCHER','PLANNER']);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const hours=seconds=>(Number(seconds||0)/3600).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1});
  let sequence=0,cache=null,inflight='',error='';
  function context(){
    if(!B.ready||!B.client||!B.companyId||!roles.has(B.role)||B.demo||B.demoMode)return null;
    const dates=typeof reportDates==='function'?reportDates():[];
    if(!dates.length)return null;
    return {company:B.companyId,role:B.role,from:dates[0],to:dates.at(-1),key:[B.companyId,B.role,dates[0],dates.at(-1)].join('|')};
  }
  function paint(ctx){
    if(context()?.key!==ctx.key)return;
    const stats=document.getElementById('reportStats'),list=document.getElementById('reportHours');if(!stats||!list)return;
    let card=document.getElementById('sfCentralReportHours');
    if(!card){card=document.createElement('div');card.id='sfCentralReportHours';card.className='stat';stats.appendChild(card)}
    if(!cache||cache.key!==ctx.key){card.innerHTML=`<div><small>Erfasste Arbeitsstunden</small><strong>-</strong><em>${esc(error||'QR- und best�tigte Zeiten werden geladen .')}</em></div>`;return}
    const people=typeof employees!=='undefined'?employees.filter(e=>e.status==='active'):[],summary=cache.data.confirmed_summary||[];
    const rows=people.map(e=>{const dbId=e._dbId||B.empDb?.get(String(e.id))||e.id,r=summary.find(x=>x.employee_id===dbId||String(x.employee_legacy_id)===String(e.id));return {e,seconds:Number(r?.confirmed_seconds||0),plan:typeof hoursForEmployeeDates==='function'?hoursForEmployeeDates(e.id,typeof reportDates==='function'?reportDates():[]):0}});
    card.innerHTML=`<div><small>Erfasste Arbeitsstunden</small><strong>${hours(rows.reduce((sum,r)=>sum+r.seconds,0))}</strong><em>${esc(error||'Abgeschlossene QR-Dienste und best�tigte Meldungen')}</em></div>`;
    list.innerHTML=rows.sort((a,b)=>b.plan-a.plan).slice(0,15).map(r=>{
      const dates=typeof reportDates==='function'?reportDates():[],target=typeof reportTargetForEmployee==='function'?reportTargetForEmployee(r.e,dates):Number(r.e.weeklyHours||0)*dates.length/7;
      return `<div class="section-box" style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><b>${esc(r.e.first+' '+r.e.last)}</b><span>IST ${hours(r.seconds)} / SOLL ${Number(target).toLocaleString('de-DE',{maximumFractionDigits:1})} Std.</span></div><small style="display:block;margin-top:5px;color:var(--muted)">Plan ${r.plan.toLocaleString('de-DE',{maximumFractionDigits:1})} Std. � QR und best�tigte Zeitmeldungen</small></div>`;
    }).join('')||'<div class="empty">Keine aktiven Mitarbeiter.</div>';
  }
  async function refresh(force=false){
    const ctx=context();if(!ctx){sequence++;cache=null;inflight='';error='';return}
    if(cache?.key!==ctx.key){cache=null;error=''}
    if(!force&&cache?.key===ctx.key&&Date.now()-cache.loaded<15000){paint(ctx);return}
    if(inflight===ctx.key){paint(ctx);return}
    const request=++sequence;inflight=ctx.key;paint(ctx);
    try{
      const q=await B.client.rpc('manager_central_time_entries',{p_company_id:ctx.company,p_start_date:ctx.from,p_end_date:ctx.to});
      if(request!==sequence||context()?.key!==ctx.key)return;
      if(q.error)throw q.error;
      const data=typeof q.data==='string'?JSON.parse(q.data):q.data;
      if(!Array.isArray(data?.confirmed_summary))throw new Error('Zentrale Zeiten nicht verf�gbar.');
      cache={key:ctx.key,data,loaded:Date.now()};error='';
    }catch(e){if(request!==sequence||context()?.key!==ctx.key)return;error='Zeitwerte nicht aktuell - bitte erneut laden.'}
    finally{if(request===sequence){inflight='';if(context()?.key===ctx.key)paint(ctx)}}
  }
  const base=window.renderReports;
  if(typeof base==='function')window.renderReports=function(){const result=base.apply(this,arguments);refresh();return result};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.getElementById('view-reports')?.classList.contains('active'))refresh(true)});
  if(typeof setInterval==='function')setInterval(()=>{if(!document.hidden&&document.getElementById('view-reports')?.classList.contains('active'))refresh(true)},30000);
  B.centralTimeReports={refresh:()=>refresh(true)};
  if(typeof setTimeout==='function')setTimeout(()=>{if(document.getElementById('view-reports')?.classList.contains('active'))refresh()},1000);
})();

