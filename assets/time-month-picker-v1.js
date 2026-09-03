// SchichtFunk – freie Monatswahl in der Zeiterfassung V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__timeMonthPickerV1)return;B.__timeMonthPickerV1=true;

  const KEY='sf.time.selectedMonth';
  let wrapped=false;
  let originalRender=null;
  let ensureTimer=0;

  const pad=n=>String(n).padStart(2,'0');
  const currentMonth=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}`};
  const validMonth=v=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v||''));
  const storedMonth=()=>{try{const v=sessionStorage.getItem(KEY);return validMonth(v)?v:currentMonth()}catch{return currentMonth()}};
  const saveMonth=v=>{try{sessionStorage.setItem(KEY,v)}catch{}};

  function selectedMonth(){
    const input=document.getElementById('sfTimeMonthPicker');
    return validMonth(input?.value)?input.value:storedMonth();
  }

  function monthDates(month){
    const [y,m]=month.split('-').map(Number);
    return Array.from({length:7},(_,i)=>new Date(y,m-1,1+i,12,0,0,0));
  }

  function css(){
    if(document.getElementById('sfTimeMonthPickerCss'))return;
    const s=document.createElement('style');
    s.id='sfTimeMonthPickerCss';
    s.textContent=`
      #view-time .sf-time-period-controls{display:flex;align-items:flex-end;justify-content:flex-end;gap:8px;flex-wrap:wrap}
      #view-time .sf-time-period-field{display:flex;flex-direction:column;gap:4px;color:#8fa5ba;font-size:10px;font-weight:750}
      #view-time .sf-time-period-field span{padding-left:2px}
      #view-time #timePeriod,#view-time #sfTimeMonthPicker{min-height:38px;border:1px solid #2a4058;border-radius:8px;background:#0b1725;color:#e9f3fb;padding:7px 9px;font-size:12px}
      #view-time #sfTimeMonthPicker{min-width:160px;color-scheme:dark}
      #view-time .sf-time-period-hint{align-self:center;color:#7891a7;font-size:9px;white-space:nowrap}
      @media(max-width:700px){#view-time .sf-time-period-controls{width:100%;justify-content:flex-start}#view-time .sf-time-period-field{flex:1 1 145px}#view-time #timePeriod,#view-time #sfTimeMonthPicker{width:100%;min-width:0}.sf-time-period-hint{width:100%}}
    `;
    document.head.appendChild(s);
  }

  function syncDatevMonth(month){
    const datev=document.getElementById('sfTaMonth');
    if(datev&&datev.value!==month){
      datev.value=month;
      datev.dispatchEvent(new Event('change',{bubbles:true}));
    }
  }

  function ensureControls(){
    clearTimeout(ensureTimer);
    const view=document.getElementById('view-time');
    const select=document.getElementById('timePeriod');
    if(!view||!select)return scheduleEnsure(300);
    css();

    const monthOption=[...select.options].find(o=>o.value==='month');
    if(monthOption)monthOption.textContent='Monat';

    let controls=document.getElementById('sfTimePeriodControls');
    if(!controls){
      controls=document.createElement('div');
      controls.id='sfTimePeriodControls';
      controls.className='sf-time-period-controls';
      select.insertAdjacentElement('beforebegin',controls);
      const periodField=document.createElement('label');
      periodField.className='sf-time-period-field';
      periodField.innerHTML='<span>Zeitraum</span>';
      controls.appendChild(periodField);
      periodField.appendChild(select);

      const monthField=document.createElement('label');
      monthField.className='sf-time-period-field';
      monthField.innerHTML='<span>Monat auswählen</span><input id="sfTimeMonthPicker" type="month" aria-label="Monat für Zeiterfassung auswählen">';
      controls.appendChild(monthField);

      const hint=document.createElement('span');
      hint.className='sf-time-period-hint';
      hint.textContent='Beliebiger Monat möglich';
      controls.appendChild(hint);
    }

    const picker=document.getElementById('sfTimeMonthPicker');
    if(picker&&!validMonth(picker.value))picker.value=storedMonth();

    if(select.dataset.sfMonthPickerBound!=='1'){
      select.dataset.sfMonthPickerBound='1';
      select.addEventListener('change',async()=>{
        if(select.value==='month'){
          const m=selectedMonth();saveMonth(m);syncDatevMonth(m);
        }
        await window.renderTimeTracking?.();
      });
    }

    if(picker&&picker.dataset.sfMonthPickerBound!=='1'){
      picker.dataset.sfMonthPickerBound='1';
      picker.addEventListener('change',async()=>{
        if(!validMonth(picker.value))return;
        saveMonth(picker.value);
        select.value='month';
        syncDatevMonth(picker.value);
        await window.renderTimeTracking?.();
      });
    }
  }

  function wrapRender(){
    if(wrapped)return;
    const current=window.renderTimeTracking;
    if(typeof current!=='function')return scheduleEnsure(250);
    originalRender=current;
    window.renderTimeTracking=async function(){
      ensureControls();
      const select=document.getElementById('timePeriod');
      if(select?.value!=='month')return originalRender.apply(this,arguments);

      const month=selectedMonth();
      const prior=window.currentWeekDates;
      window.currentWeekDates=()=>monthDates(month);
      try{return await originalRender.apply(this,arguments)}
      finally{window.currentWeekDates=prior}
    };
    window.renderTimeTracking.__sfTimeMonthPickerWrapped=true;
    wrapped=true;
  }

  function scheduleEnsure(ms=200){clearTimeout(ensureTimer);ensureTimer=setTimeout(()=>{ensureControls();wrapRender()},ms)}

  document.addEventListener('click',e=>{
    if(e.target.closest?.('[data-view="time"]'))scheduleEnsure(120);
  },true);
  const mo=new MutationObserver(records=>{
    if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('#view-time,#timePeriod')||n.querySelector?.('#view-time,#timePeriod')))))scheduleEnsure(80);
  });
  mo.observe(document.documentElement,{childList:true,subtree:true});

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>scheduleEnsure(0),{once:true});
  else scheduleEnsure(0);
  setTimeout(()=>scheduleEnsure(0),1200);
  setTimeout(()=>scheduleEnsure(0),2600);
})();
