// SchichtFunk – private, lokale Lohnvorschau im Mitarbeiterportal V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__employeeWagePreviewV1)return;B.__employeeWagePreviewV1=true;
  let renderSeq=0,rateInputTimer=0;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>Number(n||0).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
  const hours=m=>(Number(m||0)/60).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' Std.';
  const monthKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  const berlinHourFormatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',hourCycle:'h23'});
  const berlinHour=d=>Number(berlinHourFormatter.formatToParts(d).find(x=>x.type==='hour')?.value);
  const financeMonth=()=>B.employeeFinanceMonth||monthKey(new Date());
  function setFinanceMonth(value){const next=/^\d{4}-\d{2}$/.test(value||'')?value:monthKey(new Date());if(B.employeeFinanceMonth===next)return;B.employeeFinanceMonth=next;document.dispatchEvent(new CustomEvent('sf:employee-finance-month-change',{detail:{month:next}}))}
  const storageKey=()=>`sf_private_hourly_wage_${B.employeeDbId||B.user?.id||'employee'}`;
  function css(){if(document.getElementById('sfWagePreviewCss'))return;const s=document.createElement('style');s.id='sfWagePreviewCss';s.textContent=`
    .sf-wage-head{display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap}.sf-wage-head h3{margin:0}.sf-wage-head p{margin:4px 0 0;color:#7f95a8;font-size:10px}.sf-wage-spacer{margin-left:auto}.sf-wage-month,.sf-wage-rate{background:#081624;border:1px solid #294159;color:#edf6ff;border-radius:8px;padding:8px 10px}.sf-wage-rate{width:120px}.sf-wage-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}.sf-wage-kpi{padding:10px;border:1px solid #20384d;background:#091725;border-radius:9px}.sf-wage-kpi small{display:block;color:#7f95a8;font-size:8px;text-transform:uppercase}.sf-wage-kpi b{display:block;margin-top:4px;font-size:14px}.sf-wage-total{border-color:#2c806f;background:#0b2825}.sf-wage-total b{color:#72e7c8;font-size:18px}.sf-wage-detail{margin-top:10px;border-top:1px solid #20384d}.sf-wage-row{display:flex;justify-content:space-between;gap:10px;padding:8px 2px;border-bottom:1px solid #172c3e;font-size:10px}.sf-wage-row span{color:#8ca1b3}.sf-wage-note{margin-top:10px;padding:9px 10px;border:1px solid #564a2f;background:#241f14;color:#d9c894;border-radius:8px;font-size:9px;line-height:1.45}.sf-wage-private{color:#6dd9bd!important}@media(max-width:640px){.sf-wage-grid{grid-template-columns:1fr 1fr}.sf-wage-spacer{display:none;width:100%}}
  `;document.head.appendChild(s)}
  function rate(){const n=Number(localStorage.getItem(storageKey()));return Number.isFinite(n)&&n>0?n:0}
  function holidaysFrom(r){return new Set((r?.holidays||[]).map(x=>String(x.date||x).slice(0,10)))}
  function minuteSummary(month,holidays){
    const d=B.employeePortalData||{},byAssignment=new Map((d.timeEntries||[]).map(x=>[x.assignment_id,x]));
    const out={base:0,night:0,sunday:0,holiday:0,entries:0};
    (d.shifts||[]).forEach(shift=>{const te=byAssignment.get(shift.id);if(!te||te.status!=='confirmed'||!te.actual_start||!te.actual_end)return;const start=new Date(te.actual_start),end=new Date(te.actual_end);if(Number.isNaN(+start)||Number.isNaN(+end)||monthKey(start)!==month)return;let mins=[];for(let t=+start;t<+end;t+=60000){const dt=new Date(t),date=dt.toLocaleDateString('sv-SE',{timeZone:'Europe/Berlin'}),hour=berlinHour(dt);let kind='base';if(holidays.has(date))kind='holiday';else if(new Date(`${date}T12:00:00`).getDay()===0)kind='sunday';else if(hour>=22||hour<6)kind='night';mins.push(kind)}
      const pause=Math.max(0,Math.min(mins.length,Number(te.break_minutes||0)));if(pause)mins.splice(Math.max(0,mins.length-pause),pause);
      mins.forEach(k=>out[k]++);out.entries++;
    });return out
  }
  async function render(){if(B.role!=='EMPLOYEE')return;const portal=document.getElementById('sfEmployeePortal');if(!portal)return;css();let card=portal.querySelector('#sfEmployeeWagePreview');if(!card){card=document.createElement('section');card.id='sfEmployeeWagePreview';card.className='sf-portal-card';card.innerHTML='<h3>Lohnvorschau</h3>';portal.querySelector('.sf-portal-grid')?.appendChild(card)}
    const seq=++renderSeq,month=financeMonth();card.dataset.month=month;let account=null;try{const q=await B.client.rpc('employee_my_time_account_month',{p_month:`${month}-01`});if(!q.error)account=typeof q.data==='string'?JSON.parse(q.data):q.data}catch{}if(seq!==renderSeq)return;
    const s=minuteSummary(month,holidaysFrom(account)),r=rate(),baseMinutes=s.base+s.night+s.sunday+s.holiday,base=baseMinutes/60*r,night=s.night/60*r*.2,sunday=s.sunday/60*r*.5,holiday=s.holiday/60*r,total=base+night+sunday+holiday;
    card.innerHTML=`<div class="sf-wage-head"><div><h3>Lohnvorschau</h3><p class="sf-wage-private">Privat auf diesem Gerät · wird nicht an den Arbeitgeber übertragen</p></div><span class="sf-wage-spacer"></span><input class="sf-wage-month" type="month" value="${esc(month)}" aria-label="Monat"><input class="sf-wage-rate" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Stundenlohn €" value="${r||''}" aria-label="Privater Stundenlohn"></div><div class="sf-wage-grid"><div class="sf-wage-kpi"><small>Bestätigte Arbeit</small><b>${hours(baseMinutes)}</b></div><div class="sf-wage-kpi"><small>Grundlohn</small><b>${r?money(base):'–'}</b></div><div class="sf-wage-kpi sf-wage-total"><small>Voraussichtliches Brutto</small><b>${r?money(total):'Stundenlohn eingeben'}</b></div></div><div class="sf-wage-detail"><div class="sf-wage-row"><span>Nacht 22–06 Uhr · 20 % · ${hours(s.night)}</span><b>${r?money(night):'–'}</b></div><div class="sf-wage-row"><span>Sonntag · 50 % · ${hours(s.sunday)}</span><b>${r?money(sunday):'–'}</b></div><div class="sf-wage-row"><span>Feiertag · 100 % · ${hours(s.holiday)}</span><b>${r?money(holiday):'–'}</b></div></div><div class="sf-wage-note">Unverbindliche private Vorschau, keine Lohnabrechnung. Es zählen ausschließlich bestätigte IST-Zeiten. Zuschläge werden nicht addiert; je Minute gilt nur der höchste Satz. Pausen werden mangels genauer Pausenlage vom Schichtende abgezogen.</div>`;
    card.querySelector('.sf-wage-month').onchange=e=>setFinanceMonth(e.target.value);const rateInput=card.querySelector('.sf-wage-rate'),saveRate=()=>{clearTimeout(rateInputTimer);const n=Number(rateInput.value);if(Number.isFinite(n)&&n>0)localStorage.setItem(storageKey(),String(n));else localStorage.removeItem(storageKey());render()};rateInput.oninput=()=>{clearTimeout(rateInputTimer);rateInputTimer=setTimeout(saveRate,250)};rateInput.onchange=saveRate;
  }
  const old=B.openEmployeePortal;if(typeof old==='function')B.openEmployeePortal=function(){const x=old.apply(this,arguments);setTimeout(render,180);return x};B.wagePreview={render};setTimeout(render,1600);
  document.addEventListener('sf:employee-finance-month-change',()=>{if(B.role==='EMPLOYEE')render()});
})();
