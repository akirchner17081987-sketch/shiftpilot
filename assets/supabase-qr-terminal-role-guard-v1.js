// SchichtFunk – QR-Terminal Rollen-Guard V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__qrTerminalRoleGuardV1)return;B.__qrTerminalRoleGuardV1=true;

  const ADMIN=new Set(['OWNER','ADMIN']);
  const MANAGER=new Set(['OWNER','ADMIN','DISPATCHER','PLANNER']);

  function apply(){
    if(!B.role||!MANAGER.has(B.role)||ADMIN.has(B.role))return;
    const card=document.getElementById('sfQrTerminalAdmin');
    if(!card)return;

    const create=card.querySelector('.sf-qrt-create');
    if(create&&!create.dataset.sfReadonly){
      create.dataset.sfReadonly='1';
      create.innerHTML='<div class="sf-qrt-readonly" style="grid-column:1/-1;padding:9px 11px;border:1px solid #2c485e;border-radius:9px;color:#91a6b8;background:#0a1825;font-size:10px;line-height:1.45">Lesemodus: QR-Terminals können nur von Inhabern und Administratoren angelegt oder geändert werden.</div>';
    }

    card.querySelectorAll('.sf-qrt-actions button').forEach(button=>{
      button.disabled=true;
      button.hidden=true;
    });
    card.querySelectorAll('.sf-qrt-actions').forEach(actions=>{
      if(actions.querySelector('[data-sf-readonly-note]'))return;
      const note=document.createElement('span');
      note.dataset.sfReadonlyNote='1';
      note.textContent='Nur lesen';
      note.style.cssText='color:#91a6b8;font-size:10px;font-weight:800';
      actions.appendChild(note);
    });
  }

  const observer=new MutationObserver(apply);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',e=>{if(e.target.closest('[data-view="time"]'))setTimeout(apply,150)},true);
  let tries=0;const timer=setInterval(()=>{apply();if(++tries>80)clearInterval(timer)},250);
})();
