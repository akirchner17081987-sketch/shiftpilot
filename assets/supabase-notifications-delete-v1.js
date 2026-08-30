// SchichtFunk – Benachrichtigungen löschen V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__notificationsDeleteV1)return;B.__notificationsDeleteV1=true;
  let busy=false;

  function css(){
    if(document.getElementById('sfNotifyDeleteCss'))return;
    const s=document.createElement('style');s.id='sfNotifyDeleteCss';s.textContent=`
      .sf-notify-item{grid-template-columns:34px 1fr auto 28px!important}.sf-notify-delete{width:28px;height:28px;border:1px solid #4a3341;background:#261923;color:#d98a98;border-radius:7px;display:grid;place-items:center;font-size:11px;cursor:pointer;align-self:center;transition:.15s}.sf-notify-delete:hover{border-color:#8e4053;background:#3a1c28;color:#ff9dad}.sf-notify-delete-all{border:1px solid #6c3545;background:#2d1922;color:#ef9cac;border-radius:7px;padding:6px 8px;font-size:9px;font-weight:800;cursor:pointer}.sf-notify-delete-all:hover{background:#3a1d28;border-color:#8d4356}.sf-notify-head-actions{display:flex;gap:6px;align-items:center}
      @media(max-width:620px){.sf-notify-item{grid-template-columns:34px 1fr 28px!important}.sf-notify-delete{grid-column:3;grid-row:1}.sf-notify-head{align-items:flex-start}.sf-notify-head-actions{flex-wrap:wrap;justify-content:flex-end;max-width:155px}}
    `;document.head.appendChild(s)
  }

  function enhance(){
    const p=document.getElementById('sfNotifyPanel');if(!p)return;css();
    p.querySelectorAll('.sf-notify-item[data-id]').forEach(item=>{
      if(item.querySelector('.sf-notify-delete'))return;
      const d=document.createElement('span');d.className='sf-notify-delete';d.setAttribute('role','button');d.setAttribute('tabindex','0');d.setAttribute('aria-label','Mitteilung löschen');d.title='Mitteilung löschen';d.textContent='🗑';item.appendChild(d)
    });
    const head=p.querySelector('.sf-notify-head');if(!head||head.querySelector('.sf-notify-delete-all'))return;
    const spacer=head.querySelector('.spacer');let actions=head.querySelector('.sf-notify-head-actions');
    if(!actions){actions=document.createElement('span');actions.className='sf-notify-head-actions';const all=head.querySelector('.sf-notify-all');if(all)actions.appendChild(all);head.appendChild(actions)}
    const del=document.createElement('button');del.type='button';del.className='sf-notify-delete-all';del.textContent='Alle löschen';actions.appendChild(del)
  }

  async function refresh(){try{await B.notifications?.refresh?.()}catch{}setTimeout(enhance,60)}
  async function removeOne(id){if(busy||!id||!B.client||!B.user?.id)return;busy=true;try{const q=await B.client.from('notifications').delete().eq('id',id).eq('user_id',B.user.id);if(q.error)throw q.error;await refresh()}catch(e){console.warn('Mitteilung konnte nicht gelöscht werden',e)}finally{busy=false}}
  async function removeAll(){if(busy||!B.client||!B.user?.id)return;if(!confirm('Alle Benachrichtigungen wirklich löschen?\n\nDieser Vorgang kann nicht rückgängig gemacht werden.'))return;busy=true;try{const q=await B.client.from('notifications').delete().eq('user_id',B.user.id);if(q.error)throw q.error;await refresh()}catch(e){console.warn('Benachrichtigungen konnten nicht gelöscht werden',e)}finally{busy=false}}

  document.addEventListener('click',e=>{
    const del=e.target?.closest?.('.sf-notify-delete');if(del){e.preventDefault();e.stopImmediatePropagation();const item=del.closest('.sf-notify-item[data-id]');removeOne(item?.dataset?.id);return}
    const all=e.target?.closest?.('.sf-notify-delete-all');if(all){e.preventDefault();e.stopImmediatePropagation();removeAll()}
  },true);
  document.addEventListener('keydown',e=>{const del=e.target?.closest?.('.sf-notify-delete');if(del&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopImmediatePropagation();removeOne(del.closest('.sf-notify-item[data-id]')?.dataset?.id)}},true);
  setInterval(enhance,700);setTimeout(enhance,900)
})();
