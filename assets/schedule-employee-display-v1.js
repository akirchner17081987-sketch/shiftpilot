// Darstellung im Dienstplan; beeinflusst keine Planungsentscheidung.
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.SFScheduleEmployeeDisplay=api})(typeof window!=='undefined'?window:globalThis,function(root){
  const company='3dbc2d99-78d7-4b82-bcaf-fe11db8213d3';
  const order=['2001','26','2048','2059','37','119','2015'];
  const palette={yellow:{background:'#fff1ad',text:'#523b00',border:'#d8ac22',rgb:[255,241,173]},turquoise:{background:'#b7eee6',text:'#06483f',border:'#35b6a4',rgb:[183,238,230]},red:{background:'#f7cece',text:'#662323',border:'#d97575',rgb:[247,206,206]}};
  const enabled=id=>(id??root.SFBackend?.companyId)===company;
  const rank=e=>{const index=order.indexOf(String(e?.personnelNo??e?.personnel_no??'').trim());return index<0?order.length:index};
  function compare(a,b,id){a=a||{};b=b||{};if(!enabled(id))return 0;return rank(a)-rank(b)||String(a.last||a.last_name||'').localeCompare(String(b.last||b.last_name||''),'de',{sensitivity:'base'})||String(a.first||a.first_name||'').localeCompare(String(b.first||b.first_name||''),'de',{sensitivity:'base'})||String(a.personnelNo||'').localeCompare(String(b.personnelNo||''),'de',{numeric:true})}
  function color(e,id){if(!enabled(id))return null;const n=rank(e);return palette[n<3?'yellow':n<7?'turquoise':'red']}
  function style(e,id){const c=color(e,id);return c?`--sf-person-bg:${c.background};--sf-person-text:${c.text};--sf-person-border:${c.border}`:''}
  return{enabled,compare,color,style};
});
