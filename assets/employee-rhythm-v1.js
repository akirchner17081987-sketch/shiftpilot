// SchichtFunk – wiederholbare Mitarbeiterrhythmen für manuelle und automatische Planung
(function(){
  if(window.SFRhythm)return;
  const DAY=86400000;
  const EXEMPT_OT=['OT1','OT2','OT3'];
  const teams=['A','B','C','D','E'];
  const readMeta=(employee,key)=>String((employee?.qualifications||[]).find(value=>String(value).startsWith(`__sp:${key}=`))||'').split('=').slice(1).join('=');
  const normalizeToken=value=>{
    const token=String(value||'').trim().toUpperCase();
    if(['FREI','FREE','OFF','X'].includes(token))return 'FREI';
    if(['ALLE','ANY','BELIEBIG','*'].includes(token))return 'ALLE';
    return token;
  };
  const parsePattern=value=>String(value||'').split(/[,;\n]+/).map(normalizeToken).filter(Boolean);
  const teamOffset=(team,length)=>teams.includes(team)?Math.floor(teams.indexOf(team)*length/teams.length):0;
  const utcDay=value=>{const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return match?Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3])):NaN};
  function config(employee){
    const rawMode=employee?.rhythmMode||readMeta(employee,'rhythmMode')||'off';
    const mode=['preferred','required'].includes(rawMode)?rawMode:'off';
    const selected=employee?.planningTeam??readMeta(employee,'planningTeam'),team=teams.includes(selected)?selected:'',pattern=parsePattern(employee?.rhythmPattern||readMeta(employee,'rhythmPattern'));
    const central=team?window.SFPlanningTeams?.get(team):null;
    if(central)return{mode:'required',start:central.start,pattern:central.pattern.map(t=>window.SFShiftModels?.teamRhythmCode(t)||t),team,offset:central.offset,central:true};
    return {mode:team?'required':mode,exemptOt:!team&&(employee?.rhythmExemptOt??(readMeta(employee,'rhythmExemptOt')==='true'))===true,start:employee?.rhythmStart||readMeta(employee,'rhythmStart')||'',pattern:team?pattern.map(t=>window.SFShiftModels?.teamRhythmCode(t)||t):pattern,team,offset:teamOffset(team,pattern.length)};
  }
  function check(employee,shiftType,date){
    const scope=window.SFShiftModels?.planningRestriction(shiftType,employee,date),scoped=result=>scope?{...result,mode:'required',allowed:false,reason:scope}:result;
    const rhythm=config(employee),target=utcDay(date),start=utcDay(rhythm.start);
    if(rhythm.exemptOt&&EXEMPT_OT.includes(normalizeToken(shiftType)))return scoped({mode:'off',allowed:true,exempt:true,reason:'OT1 / OT2 / OT3 sind von dieser Schichtregel ausgenommen'});
    if(rhythm.mode==='off')return scoped({mode:'off',allowed:true,reason:'Keine Rhythmusbindung'});
    if(!rhythm.pattern.length||!Number.isFinite(start)||!Number.isFinite(target))return scoped({...rhythm,allowed:!rhythm.team,reason:rhythm.team?'Teamrhythmus ist noch unvollständig':'Rhythmus ist noch unvollständig'});
    if(rhythm.team&&target<start)return scoped({...rhythm,mode:'off',allowed:true,reason:`Teamrhythmus beginnt am ${rhythm.start}`});
    const elapsed=Math.round((target-start)/DAY)+rhythm.offset,index=((elapsed%rhythm.pattern.length)+rhythm.pattern.length)%rhythm.pattern.length,expected=rhythm.pattern[index];
    const allowed=expected==='ALLE'||expected.split(/[+|/]/).map(normalizeToken).includes(normalizeToken(shiftType));
    const label=rhythm.team?`Team ${rhythm.team}: `:'';
    return scoped({...rhythm,index,expected,allowed,reason:label+(allowed?`Rhythmus: ${expected}`:`Rhythmus erwartet ${expected==='FREI'?'einen freien Tag':expected}`)});
  }
  window.SFRhythm={config,check,parsePattern,normalizeToken,teams,teamOffset};
  window.sfRhythmCheck=check;
})();
