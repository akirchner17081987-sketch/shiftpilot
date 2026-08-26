// ShiftPilot: OT zählt nur Samstag, Sonntag und Berliner gesetzliche Feiertage.
(function(){
  function pad(n){return String(n).padStart(2,'0')}
  function isoDate(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
  function easterSunday(year){
    const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,
      f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,
      i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),
      month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
    return new Date(year,month-1,day);
  }
  function plusDays(date,n){const d=new Date(date);d.setDate(d.getDate()+n);return d}
  function berlinHolidaySet(year){
    const easter=easterSunday(year);
    const days=[
      `${year}-01-01`, // Neujahr
      `${year}-03-08`, // Internationaler Frauentag Berlin
      isoDate(plusDays(easter,-2)), // Karfreitag
      isoDate(plusDays(easter,1)),  // Ostermontag
      `${year}-05-01`, // Tag der Arbeit
      isoDate(plusDays(easter,39)), // Christi Himmelfahrt
      isoDate(plusDays(easter,50)), // Pfingstmontag
      `${year}-10-03`, // Tag der Deutschen Einheit
      `${year}-12-25`,
      `${year}-12-26`
    ];
    return new Set(days);
  }
  function parseLocalDate(value){
    if(value instanceof Date)return new Date(value.getFullYear(),value.getMonth(),value.getDate());
    const s=String(value||'').slice(0,10),m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m)return null;
    return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
  }
  function otApplies(dateValue){
    const d=parseLocalDate(dateValue); if(!d)return true;
    const weekday=d.getDay();
    if(weekday===0||weekday===6)return true;
    return berlinHolidaySet(d.getFullYear()).has(isoDate(d));
  }
  window.shiftPilotOtApplies=otApplies;

  function installPolicy(){
    if(typeof window.getSoll!=='function'||window.getSoll.__otPolicy)return false;
    const original=window.getSoll;
    const wrapped=function(date,type){
      if(String(type).toUpperCase()==='OT'&&!otApplies(date))return 0;
      return original.apply(this,arguments);
    };
    wrapped.__otPolicy=true;wrapped.__original=original;
    window.getSoll=wrapped;
    return true;
  }
  function refresh(){
    installPolicy();
    if(typeof window.renderCalendar==='function')window.renderCalendar();
    if(typeof window.updateStats==='function')window.updateStats();
    if(typeof window.renderOverview==='function'&&document.getElementById('view-overview')?.classList.contains('active'))window.renderOverview();
  }
  function addSettingsHint(){
    const settings=document.getElementById('view-settings'); if(!settings)return;
    if(settings.querySelector('.sp-ot-policy-hint'))return;
    const candidates=[...settings.querySelectorAll('input[data-soll], label, .setting-row, .section-box, .card')];
    let target=candidates.find(el=>/\bOT\b/.test((el.textContent||'').trim())&&/SOLL|Besetzung|OT/.test(el.textContent||''));
    if(!target)return;
    const note=document.createElement('div');note.className='sp-ot-policy-hint';
    note.innerHTML='<b>OT-Regel</b><span>Die OT-SOLL-Besetzung gilt ausschließlich samstags, sonntags und an gesetzlichen Feiertagen in Berlin. An normalen Werktagen wird OT automatisch mit SOLL 0 bewertet.</span>';
    target.insertAdjacentElement('afterend',note);
  }
  function init(){
    let tries=0;const timer=setInterval(()=>{tries++;const ok=installPolicy();addSettingsHint();if(ok||tries>30){clearInterval(timer);refresh()}},100);
    document.addEventListener('click',e=>{
      if(e.target.closest('[data-view="settings"]'))setTimeout(addSettingsHint,50);
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
