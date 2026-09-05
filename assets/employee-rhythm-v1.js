// SchichtFunk – wiederholbare Mitarbeiterrhythmen für manuelle und automatische Planung
(function(){
  if(window.SFRhythm)return;
  const DAY=86400000;
  const readMeta=(employee,key)=>String((employee?.qualifications||[]).find(value=>String(value).startsWith(`__sp:${key}=`))||'').split('=').slice(1).join('=');
  const normalizeToken=value=>{
    const token=String(value||'').trim().toUpperCase();
    if(['FREI','FREE','OFF','X'].includes(token))return 'FREI';
    if(['ALLE','ANY','BELIEBIG','*'].includes(token))return 'ALLE';
    return token;
  };
  const parsePattern=value=>String(value||'').split(/[,;\n]+/).map(normalizeToken).filter(Boolean);
  const utcDay=value=>{const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return match?Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3])):NaN};
  function config(employee){
    const rawMode=employee?.rhythmMode||readMeta(employee,'rhythmMode')||'off';
    const mode=['preferred','required'].includes(rawMode)?rawMode:'off';
    return {mode,start:employee?.rhythmStart||readMeta(employee,'rhythmStart')||'',pattern:parsePattern(employee?.rhythmPattern||readMeta(employee,'rhythmPattern'))};
  }
  function check(employee,shiftType,date){
    const rhythm=config(employee),target=utcDay(date),start=utcDay(rhythm.start);
    if(rhythm.mode==='off')return{mode:'off',allowed:true,reason:'Keine Rhythmusbindung'};
    if(!rhythm.pattern.length||!Number.isFinite(start)||!Number.isFinite(target))return{...rhythm,allowed:true,reason:'Rhythmus ist noch unvollständig'};
    const elapsed=Math.round((target-start)/DAY),index=((elapsed%rhythm.pattern.length)+rhythm.pattern.length)%rhythm.pattern.length,expected=rhythm.pattern[index];
    const allowed=expected==='ALLE'||expected.split(/[+|/]/).map(normalizeToken).includes(normalizeToken(shiftType));
    return {...rhythm,index,expected,allowed,reason:allowed?`Rhythmus: ${expected}`:`Rhythmus erwartet ${expected==='FREI'?'einen freien Tag':expected}`};
  }
  window.SFRhythm={config,check,parsePattern,normalizeToken};
  window.sfRhythmCheck=check;
})();
