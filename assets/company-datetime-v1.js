// SchichtFunk – dynamisches Datum und Uhrzeit in der Unternehmenskarte V1
(function(){
  if(window.__sfCompanyDateTimeV1)return;window.__sfCompanyDateTimeV1=true;
  const FALLBACK_TIME_ZONE='Europe/Berlin';
  const settings=()=>{try{return JSON.parse(localStorage.getItem('sp_settings_v2')||'{}')}catch{return{}}};
  const timeZone=()=>window.SFBackend?.companyTimeZone||settings().timezone||FALLBACK_TIME_ZONE;
  const element=()=>document.getElementById('sfCompanyDateTime')||document.querySelector('.company-card small');
  function format(now,timeZoneName){
    const date=new Intl.DateTimeFormat('de-DE',{timeZone:timeZoneName,day:'2-digit',month:'2-digit',year:'numeric'}).format(now);
    const time=new Intl.DateTimeFormat('de-DE',{timeZone:timeZoneName,hour:'2-digit',minute:'2-digit',hour12:false}).format(now).replace('24:','00:');
    return `${date} · ${time}`;
  }
  function update(){
    const target=element();if(!target)return;
    const zone=timeZone();
    try{target.textContent=format(new Date(),zone);target.title=`Datum und Uhrzeit · ${zone}`}
    catch{target.textContent=format(new Date(),FALLBACK_TIME_ZONE);target.title=`Datum und Uhrzeit · ${FALLBACK_TIME_ZONE}`}
  }
  function init(){update();window.setInterval(update,1000)}
  window.addEventListener('sf:company-timezone-change',update);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)update()});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
