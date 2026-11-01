// Shared regional day-service rules. The caller remains responsible for
// checking ordinary shift permissions, working time and planner overrides.
(function(root,factory){
  const holiday=typeof module==='object'&&module.exports?require('./ot-weekend-holiday-policy.js'):root.SFOtPolicy;
  const api=factory(holiday);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.SFRegionalDayStaffing=api;
})(typeof window==='undefined'?globalThis:window,function(holiday){
  function allowed(date,site,code,config){
    if(!holiday?.isValidDate(date))throw new Error('Ungültiges Planungsdatum');
    const states=config?.statesBySite||{};
    const name=String(site||'').trim().toLocaleLowerCase('de-DE');
    const match=Object.entries(states).find(([key])=>key.trim().toLocaleLowerCase('de-DE')===name);
    if(!match)return false;
    const day=new Date(date+'T12:00:00Z').getUTCDay();
    const special=day===0||day===6||holiday.isHoliday(date,[match[1]]);
    return (special?(config.specialCodes||[]):(config.weekdayCodes||[])).includes(code);
  }
  function group(date,rows,config){
    if(!holiday?.isValidDate(date))throw new Error('Ungültiges Planungsdatum');
    const codes=new Set([...(config?.weekdayCodes||[]),...(config?.specialCodes||[])]);
    const people=new Set((rows||[]).filter(row=>row.date===date&&row.employeeId!=null&&row.employeeId!==''&&row.status!=='CANCELLED'&&row._dbStatus!=='CANCELLED'&&codes.has(row.type)).map(row=>String(row.employeeId)));
    const target=Number(config?.target);
    if(!Number.isInteger(target)||target<0)throw new Error('Ungültiger Tagesbedarf');
    return {target,filled:people.size,missing:Math.max(0,target-people.size),excess:Math.max(0,people.size-target)};
  }
  function alternatives(date,activeCodes,config){
    const sites=Object.keys(config?.statesBySite||{});
    const codes=new Set([...(config?.weekdayCodes||[]),...(config?.specialCodes||[])]);
    return (activeCodes||[]).filter(code=>codes.has(code)&&sites.some(site=>allowed(date,site,code,config)));
  }
  return {allowed,group,alternatives};
});
