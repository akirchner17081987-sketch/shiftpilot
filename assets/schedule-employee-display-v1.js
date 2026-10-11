// Generic schedule presentation; company assignments arrive through authenticated data.
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.SFScheduleEmployeeDisplay=api})(typeof window!=='undefined'?window:globalThis,function(root){
  let companyId=null,configuration=null;
  function apply(value,id){clear();if(!id||!value||typeof value!=='object')return;companyId=String(id);configuration=JSON.parse(JSON.stringify(value));}
  function clear(){companyId=null;configuration=null;}
  const scoped=id=>configuration&&String(id??root.SFBackend?.companyId??'')===companyId?configuration:null;
  const palette={yellow:{darkBackground:'#2b281d',darkText:'#e4d6a5',darkBorder:'#6f6039',background:'#fff1ad',text:'#523b00',border:'#d8ac22',rgb:[255,241,173]},turquoise:{darkBackground:'#14302f',darkText:'#b5ddd7',darkBorder:'#35615d',background:'#b7eee6',text:'#06483f',border:'#35b6a4',rgb:[183,238,230]},red:{darkBackground:'#302229',darkText:'#e4bdc4',darkBorder:'#6e4651',background:'#f7cece',text:'#662323',border:'#d97575',rgb:[247,206,206]}};
  const enabled=id=>scoped(id)?.colored===true;
  const orderEnabled=id=>Array.isArray(scoped(id)?.order)&&scoped(id).order.length>0;
  const personnel=e=>String(e?.personnelNo??e?.personnel_no??'').trim();
  const rank=(e,c)=>{const order=c.order||[],index=order.indexOf(personnel(e));return index<0?order.length:index};
  const teamRank=e=>{const team=String(e.planningTeam??e.planning_team??(e.qualifications||[]).find(q=>String(q).startsWith('__sp:planningTeam='))?.split('=')[1]??'').trim().toUpperCase();const index=['A','B','C','D','E'].indexOf(team);return index<0?5:index};
  function compare(a,b,id){a=a||{};b=b||{};const c=scoped(id);if(!orderEnabled(id))return 0;const priority=(c.priorityPersonnelNos||[]).length;return (c.byTeam?Math.min(rank(a,c),priority)-Math.min(rank(b,c),priority)||teamRank(a)-teamRank(b):rank(a,c)-rank(b,c))||String(a.last||a.last_name||'').localeCompare(String(b.last||b.last_name||''),'de',{sensitivity:'base'})||String(a.first||a.first_name||'').localeCompare(String(b.first||b.first_name||''),'de',{sensitivity:'base'})||personnel(a).localeCompare(personnel(b),'de',{numeric:true})}
  function color(e,id){if(!enabled(id))return null;const c=scoped(id),group=Object.keys(c.colorGroups||{}).find(key=>(c.colorGroups[key]||[]).includes(personnel(e)));return palette[group||'red']||null;}
  function style(e,id){const c=color(e,id);return c?`--sf-person-bg:${c.darkBackground};--sf-person-text:${c.darkText};--sf-person-border:${c.darkBorder};--sf-person-light-bg:${c.background};--sf-person-light-text:${c.text};--sf-person-light-border:${c.border}`:''}
  return{apply,clear,enabled,orderEnabled,compare,color,style};
});
