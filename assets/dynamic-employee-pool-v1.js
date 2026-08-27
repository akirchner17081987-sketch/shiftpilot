// ShiftPilot – Dynamischer Mitarbeiter-Pool V1
(function(){
  const schedule=document.getElementById('view-schedule');
  if(!schedule) return;

  let activeShift=null;
  let applying=false;

  function norm(v){return String(v||'').trim().toLowerCase();}
  function selectedShift(){
    const chip=schedule.querySelector('.shift-chip.selected');
    if(!chip) return null;
    const b=chip.querySelector('b');
    return b ? b.textContent.trim() : null;
  }
  function cardRole(card){
    const sm=card.querySelector('.employee-pool-info > small, small');
    if(!sm) return '';
    const txt=sm.textContent.trim();
    const parts=txt.split('·');
    return norm(parts.length>1 ? parts.slice(1).join('·') : txt);
  }
  function cardShiftTags(card){
    return [...card.querySelectorAll('.pool-shift-tag')].map(x=>norm(x.textContent));
  }
  function eligibleForShift(card,shift){
    if(!shift) return true;
    const s=norm(shift);
    const role=cardRole(card);
    const tags=cardShiftTags(card);
    if(s==='teamleiter'){
      return role.includes('teamleiter') || role.includes('schichtleiter');
    }
    return tags.includes(s);
  }
  function ensureUi(){
    const head=schedule.querySelector('.employee-pool-head');
    if(!head) return null;
    let info=head.querySelector('.sp-dynpool-info');
    if(!info){
      info=document.createElement('div');
      info.className='sp-dynpool-info';
      info.innerHTML='<span class="sp-dynpool-count"></span><button type="button" class="ghost sp-dynpool-reset">Filter zurücksetzen</button>';
      const input=head.querySelector('input');
      if(input) head.insertBefore(info,input); else head.appendChild(info);
      info.querySelector('.sp-dynpool-reset').addEventListener('click',()=>{
        activeShift=null;
        schedule.querySelectorAll('.shift-chip.selected').forEach(x=>x.classList.remove('selected'));
        apply();
      });
    }
    return info;
  }
  function apply(){
    if(applying) return;
    applying=true;
    try{
      const detected=selectedShift();
      if(detected) activeShift=detected;
      else if(!schedule.querySelector('.shift-chip.selected')) activeShift=null;
      const cards=[...schedule.querySelectorAll('#planEmployeePool .employee-drag')];
      const info=ensureUi();
      let visible=0;
      cards.forEach(card=>{
        const ok=eligibleForShift(card,activeShift);
        card.classList.toggle('sp-dynpool-hidden',!ok);
        card.setAttribute('aria-hidden',ok?'false':'true');
        if(ok) visible++;
      });
      if(info){
        const count=info.querySelector('.sp-dynpool-count');
        const reset=info.querySelector('.sp-dynpool-reset');
        if(activeShift){
          count.textContent=`${visible} von ${cards.length} für ${activeShift} geeignet`;
          reset.hidden=false;
          info.classList.add('active');
        }else{
          count.textContent=`${cards.length} Mitarbeiter im Pool`;
          reset.hidden=true;
          info.classList.remove('active');
        }
      }
      const empty=schedule.querySelector('.sp-dynpool-empty');
      if(activeShift && cards.length && visible===0){
        if(!empty){
          const el=document.createElement('div');
          el.className='sp-dynpool-empty';
          el.textContent=`Keine Mitarbeiter erfüllen aktuell die Voraussetzungen für ${activeShift}.`;
          schedule.querySelector('#planEmployeePool')?.appendChild(el);
        } else empty.textContent=`Keine Mitarbeiter erfüllen aktuell die Voraussetzungen für ${activeShift}.`;
      }else empty?.remove();
    } finally {applying=false;}
  }

  // Toggle-Verhalten: Eine bereits ausgewählte Schicht kann durch erneuten Klick abgewählt werden.
  schedule.addEventListener('click',e=>{
    const chip=e.target.closest('.shift-chip');
    if(!chip) return;
    const wasSelected=chip.classList.contains('selected');
    setTimeout(()=>{
      if(wasSelected){
        chip.classList.remove('selected');
        activeShift=null;
      }
      apply();
    },0);
  });

  // Suchfeld bleibt nutzbar; nach jedem Rerender wird der Schichtfilter erneut angewendet.
  schedule.querySelector('#planEmployeeSearch')?.addEventListener('input',()=>setTimeout(apply,0));

  const observer=new MutationObserver(muts=>{
    if(applying) return;
    const relevant=muts.some(m=>m.target.closest?.('#planEmployeePool,.shift-row') || m.target.id==='planEmployeePool');
    if(relevant) setTimeout(apply,0);
  });
  const pool=schedule.querySelector('#planEmployeePool');
  const lib=schedule.querySelector('.shift-row');
  if(pool) observer.observe(pool,{childList:true,subtree:true});
  if(lib) observer.observe(lib,{attributes:true,subtree:true,attributeFilter:['class']});

  document.addEventListener('click',e=>{
    if(e.target.closest('[data-view="schedule"]')) setTimeout(apply,30);
  });
  apply();
})();
