// OT-Wochenend-/Feiertagsdienste nach dem hinterlegten Einsatzort.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  const rules=()=>root.SFCompliance?.policy?.solidPlanningRules?.otHolidayStatesBySite;
  const stateFor=employee=>{
    const mapping=rules();if(!mapping)return 'BE';
    const stored=(employee?.qualifications||[]).find(x=>String(x).startsWith('__sp:team='));
    const site=typeof employee==='string'?employee:employee?.team??(stored?stored.slice(10):'');
    return api.siteState(site,mapping);
  };
  const applies=(date,employee)=>api.applies(date,employee==null?Object.values(rules()||{Berlin:'BE'}):[stateFor(employee)]);
  root.SFOtPolicy={...api,stateFor,applies,configured:()=>!!rules()};
  root.schichtFunkOtApplies=applies;
  function installPolicy(){
    if(typeof root.getSoll!=='function'||root.getSoll.__otPolicy)return false;
    const original=root.getSoll,wrapped=function(date,type){
      if(String(type).toUpperCase()==='OT'&&!applies(date))return 0;
      return original.apply(this,arguments);
    };
    wrapped.__otPolicy=true;wrapped.__original=original;root.getSoll=wrapped;return true;
  }
  function addSettingsHint(){
    const settings=document.getElementById('view-settings');if(!settings)return;
    let note=settings.querySelector('.sp-ot-policy-hint');
    if(!note){const target=[...settings.querySelectorAll('input[data-soll], label, .setting-row, .section-box, .card')].find(el=>/\bOT\b/.test(el.textContent||''));if(!target)return;note=document.createElement('div');note.className='sp-ot-policy-hint';target.insertAdjacentElement('afterend',note);}
    note.innerHTML=rules()?'<b>OT-Regel</b><span>OT gilt samstags, sonntags und an gesetzlichen Feiertagen am hinterlegten Einsatzort: Leipzig (Sachsen), Recklinghausen (NRW). Reguläre OT1/OT2/OT3 sind den freigegebenen Tagdienstmitarbeitern vorbehalten.</span>':'<b>OT-Regel</b><span>OT gilt samstags, sonntags und an den für dieses Unternehmen hinterlegten Feiertagen.</span>';
  }
  function init(){
    let tries=0;const timer=setInterval(()=>{tries++;const ok=installPolicy();addSettingsHint();if(ok||tries>30){clearInterval(timer);root.renderCalendar?.();root.updateStats?.();}},100);
    document.addEventListener('click',e=>{if(e.target.closest('[data-view="settings"]'))setTimeout(addSettingsHint,50);});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(typeof window!=='undefined'?window:globalThis,function(){
  const pad=n=>String(n).padStart(2,'0'),iso=d=>d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate()),cache=new Map();
  function date(value){if(value instanceof Date)return new Date(Date.UTC(value.getFullYear(),value.getMonth(),value.getDate()));const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return null;const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));return iso(d)===m[0]?d:null;}
  function easter(year){const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);return new Date(Date.UTC(year,Math.floor((h+l-7*m+114)/31)-1,(h+l-7*m+114)%31+1));}
  function holidays(year,state='DE'){
    state=String(state).toUpperCase().replace(/^DE-/,'');const key=year+'|'+state;if(cache.has(key))return cache.get(key);
    const e=easter(year),move=n=>iso(new Date(+e+n*86400000)),days=[year+'-01-01',move(-2),move(1),year+'-05-01',move(39),move(50),year+'-10-03',year+'-12-25',year+'-12-26'];
    if(state==='BE')days.push(year+'-03-08');
    if(state==='NW')days.push(move(60),year+'-11-01');
    if(state==='SN'){days.push(year+'-10-31');const nov=new Date(Date.UTC(year,10,22));days.push(iso(new Date(+nov-((nov.getUTCDay()+4)%7)*86400000)));}
    const result=new Set(days);cache.set(key,result);return result;
  }
  function siteState(site,mapping={Leipzig:'SN',Recklinghausen:'NW'}){const key=String(site||'').trim().toLocaleLowerCase('de-DE');return Object.entries(mapping).find(([name])=>name.toLocaleLowerCase('de-DE')===key)?.[1]||'DE';}
  function applies(value,states=['DE']){const d=date(value);if(!d)return false;if([0,6].includes(d.getUTCDay()))return true;return (Array.isArray(states)?states:[states]).some(state=>holidays(d.getUTCFullYear(),state).has(iso(d)));}
  return {holidays,siteState,applies};
});
