// ShiftPilot Dienstplan UX V3
(function(){
  function setupPoolToggle(){
    const view=document.getElementById('view-schedule');
    if(!view)return;
    const pool=view.querySelector('.employee-pool');
    const head=view.querySelector('.employee-pool-head');
    if(!pool||!head)return;

    pool.classList.add('sp-pool-compact');
    let btn=head.querySelector('.sp-pool-toggle');
    if(!btn){
      btn=document.createElement('button');
      btn.type='button';
      btn.className='ghost sp-pool-toggle';
      btn.setAttribute('aria-expanded','false');
      btn.textContent='Pool erweitern ↓';
      head.appendChild(btn);
    }else{
      btn.textContent='Pool erweitern ↓';
      btn.setAttribute('aria-expanded','false');
    }

    btn.onclick=()=>{
      const compact=pool.classList.toggle('sp-pool-compact');
      btn.textContent=compact?'Pool erweitern ↓':'Pool einklappen ↑';
      btn.setAttribute('aria-expanded',String(!compact));
      if(compact){
        const calendar=view.querySelector('.calendar');
        calendar?.scrollIntoView({behavior:'smooth',block:'start'});
      }
    };
  }

  function enhanceCalendarFocus(){
    const view=document.getElementById('view-schedule');
    const calendar=view?.querySelector('.calendar');
    if(!calendar)return;
    calendar.setAttribute('aria-label','Wochenkalender Dienstplanung');
  }

  function init(){setupPoolToggle();enhanceCalendarFocus();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-view="schedule"]'))setTimeout(init,0);
  });
})();
