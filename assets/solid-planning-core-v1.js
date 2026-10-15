// Gemeinsame Erholungs- und Besetzungsregeln für freigeschaltete Unternehmen.
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./ot-weekend-holiday-policy.js'):()=>root.SFOtPolicy);if(typeof module==='object'&&module.exports)module.exports=api;else root.SFSolidPlanningCore=api})(typeof window!=='undefined'?window:globalThis,function(OT){
 const H=3600000,D=86400000,cache=new Map(),formats=new Map(),localDates=new Map();
 const plus=(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*D).toISOString().slice(0,10);
 const weekday=date=>new Date(date+'T12:00:00Z').getUTCDay()||7;
 function instant(date,time,zone='Europe/Berlin'){
  const key=date+'|'+time+'|'+zone;if(cache.has(key))return cache.get(key);
  let f=formats.get(zone);if(!f){f=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});formats.set(zone,f)}
  const nominal=Date.parse(date+'T'+time.slice(0,5)+':00Z');let v=nominal;
  for(let i=0;i<4;i++){const p=Object.fromEntries(f.formatToParts(new Date(v)).map(x=>[x.type,x.value])),local=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second),next=nominal-(local-v);if(next===v)break;v=next}
  cache.set(key,v);return v;
 }
 function interval(date,start,end,zone){return {start:instant(date,start,zone),end:instant(end.slice(0,5)<=start.slice(0,5)?plus(date,1):date,end,zone)}}
 const policy=p=>p?.enabled?p:null;
 function duty(a,p){if(Number.isFinite(a.startMs)&&Number.isFinite(a.endMs))return a;const i=interval(a.date,a.start,a.end,p?.timezone);return {...a,startMs:i.start,endMs:i.end,hours:(i.end-i.start)/H,day:Math.floor(Date.parse(a.date+'T12:00:00Z')/D)}}
 const active=a=>a.status!=='CANCELLED'&&a._dbStatus!=='CANCELLED';
 function confirmed(p){return !!policy(p)&&Number(p.confirmedRulesVersion)>=2}
 function localDate(ms,p){const key=p.timezone||'Europe/Berlin',memo=ms+'|'+key;if(localDates.has(memo))return localDates.get(memo);let f=formats.get('date|'+key);if(!f){f=new Intl.DateTimeFormat('en-CA',{timeZone:key,year:'numeric',month:'2-digit',day:'2-digit'});formats.set('date|'+key,f)}const v=Object.fromEntries(f.formatToParts(new Date(ms)).map(x=>[x.type,x.value])),date=v.year+'-'+v.month+'-'+v.day;if(localDates.size>=8192)localDates.clear();localDates.set(memo,date);return date}
 const weekKey=date=>plus(date,1-weekday(date));
 const night=a=>/^(ND|O1|O2|O3|O1S|O2S|TL|TL-LE|TL-RE|TEAMLEITER|QA)$/i.test(a.type)||a.start>='18:00';
 const shiftOrder={OT:0,O1:1,O2:2,TL:2,'TL-LE':2,'TL-RE':2,TEAMLEITER:2,O3:3};
 function transitionError(from,to,p){
  from=String(from).toUpperCase();to=String(to).toUpperCase();
  if(from==='O3'&&['O1','O2','TL','TL-LE','TL-RE','TEAMLEITER'].includes(to))return 'Nach O3 kein früherer Nachtdienst am Folgetag.';
  if(policy(p)?.preventLeaderToO1&&['TL-LE','TL-RE'].includes(from)&&to==='O1')return 'Nach TL-LE oder TL-RE ist O1 am Folgetag nicht zulässig.';
  if(policy(p)?.preventDescendingShifts&&shiftOrder[from]!=null&&shiftOrder[to]!=null&&shiftOrder[from]>shiftOrder[to])return `Absteigender Schichtwechsel ${from} → ${to} am Folgetag ist nicht zulässig.`;
  return null;
 }
 const allowsTransition=(from,to,p)=>!transitionError(from,to,p);
 const countsTowardCap=a=>!a._marketApproved;
 function fixedWeeklyRoster(e,p){
  const rule=p?.fixedWeeklyRoster;
  return rule&&Array.isArray(rule.employeeIds)&&rule.employeeIds.map(String).includes(String(e._dbId||e.id))?rule:null;
 }
 function otDayEmployee(e){
  const target=Number(e.monthlyHours??String((e.qualifications||[]).find(q=>String(q).startsWith('__sp:monthlyHours='))||'').split('=')[1])||180;
  return /^Vollzeit(?:\s+180)?$/i.test(String(e.employment||'').trim())&&target>=180&&(e.shifts||[]).length>0&&e.shifts.every(code=>['OT1','OT2','OT3'].includes(code));
 }
 function employeeRules(e,p){
  if(e.role==='Teamleiter'&&['teamLeaderMaxConsecutiveNightShifts','teamLeaderMinNightRecoveryCalendarDays','teamLeaderPreferredNightBlockLength'].some(key=>p[key]!=null)){
   const result={...p};for(const [source,target] of [['teamLeaderMaxConsecutiveNightShifts','maxConsecutiveNightShifts'],['teamLeaderMinNightRecoveryCalendarDays','minNightRecoveryCalendarDays'],['teamLeaderPreferredNightBlockLength','preferredNightBlockLength']])if(p[source]!=null)result[target]=p[source];
   return result;
  }
  if(!otDayEmployee(e))return p;
  const result={...p};for(const [source,target] of [['otOnlyMaxConsecutiveShifts','maxConsecutiveShifts'],['otOnlyMaxCalendarWeekHours','maxCalendarWeekHours'],['otOnlyMinFreeCalendarDays','minFreeCalendarDays'],['otOnlyMinBlockRestHours','minBlockRestHours']])if(p[source]!=null)result[target]=p[source];
  return result;
 }
 function weeklyLimit(e,p){
  const meta=String((e.qualifications||[]).find(q=>String(q).startsWith('__sp:maxWeekly='))||'').split('=')[1];
  const cap=Number(employeeRules(e,p).maxCalendarWeekHours)||40,explicit=Number(e.maxWeeklyHours??meta)||Number(e.weeklyLimit);
  const configured=explicit>0?explicit:otDayEmployee(e)&&p.otOnlyMaxCalendarWeekHours!=null?cap:Number(e.weeklyHours)||40;
  return Math.min(cap,configured);
 }
 function limits(e,types,p){
  if(!confirmed(p))return null;
  const allowed=types.filter(t=>t.active!==false&&(e.shifts||[]).includes(t.id||t.code)),minutes=t=>{const m=x=>Number(x.slice(0,2))*60+Number(x.slice(3,5));return (m(t.end)-m(t.start)+1440)%1440};
  const eight=allowed.length>0&&allowed.every(t=>minutes(t)>0&&minutes(t)<=480);
  const meta=k=>String((e.qualifications||[]).find(q=>String(q).startsWith('__sp:'+k+'='))||'').split('=').slice(1).join('=');
  const target=Number(e.monthlyHours??meta('monthlyHours'))||(/^Vollzeit(?:\s+180)?$/i.test(String(e.employment||'').trim())?180:Number(e.weeklyHours||40)*4.348);
  const full=/^Vollzeit(?:\s+180)?$/i.test(String(e.employment||'').trim())&&target>=180,configured=Number(e.weeklyLimit??e.maxWeeklyHours??meta('maxWeekly'))||Number(e.weeklyHours)||40;
  const otMaximum=Number(p.otOnlyMonthlyMaxHours),otOnly=full&&(e.shifts||[]).length>0&&e.shifts.every(code=>['OT1','OT2','OT3'].includes(code))&&Number.isFinite(otMaximum)&&otMaximum>0&&otMaximum<=220;
  const monthMax=Number(p.monthlyMaxHours)||190,eightMax=Math.min(monthMax,Number(p.eightHourAutoMaxHours)||184),eightCount=Number(p.eightHourMaxShifts)||23,tenCount=Number(p.tenHourMaxShifts)||18;
  const fixed=fixedWeeklyRoster(e,p);
  return{eightHourModel:eight,monthLimit:fixed?fixed.monthlyMaxHours:otOnly?otMaximum:full?(eight?eightMax:monthMax):Math.min(monthMax,target),calendarLimit:fixed?fixed.monthlyMaxHours:otOnly?otMaximum:full?monthMax:Math.min(monthMax,target),maxMonthlyShifts:fixed?fixed.maxMonthlyShifts:otOnly?Math.floor(otMaximum/10):eight?eightCount:tenCount,weeklyLimit:weeklyLimit(e,p)};
 }
 function confirmedErrors(e,rows,p,affected){
  const weekCap=weeklyLimit(e,p);p=employeeRules(e,p);
  const maxBlock=Number(p.maxConsecutiveShifts)||4,maxNight=Number(p.maxConsecutiveNightShifts)||3,freeDays=p.minFreeCalendarDays??2,nightFree=p.minNightRecoveryCalendarDays??3,restHours=Number(p.minBlockRestHours)||48;
  const own=rows.filter(active).filter(a=>String(a.employeeId)===String(e.id)).map(a=>duty(a,p)).sort((a,b)=>a.startMs-b.startMs),wanted=affected&&new Set(affected),out=[],touch=b=>!wanted||b.some(a=>wanted.has(a.date)),push=(date,message)=>out.push({date,employeeId:e.id,message}),blocks=[];
  for(const a of own){const b=blocks.at(-1);if(b&&(b.at(-1).date===a.date||plus(b.at(-1).date,1)===a.date))b.push(a);else blocks.push([a])}
  for(let i=0;i<blocks.length;i++){const b=blocks[i],prev=blocks[i-1];if(touch(b)&&b.length>maxBlock)push(b[0].date,maxBlock===4?'Höchstens vier Dienste am Stück.':`Höchstens ${maxBlock} Dienste am Stück.`);
   if(prev&&(touch(b)||touch(prev))){const last=prev.at(-1),free=Math.round((Date.parse(b[0].date)-Date.parse(localDate(last.endMs-1,p)))/D)-1,rest=(b[0].startMs-last.endMs)/H;
    const requiredFree=prev.length===3&&prev.every(night)&&p.threeNightBlockRecoveryFullCalendarDays!=null?Math.min(freeDays,Number(p.threeNightBlockRecoveryFullCalendarDays)):freeDays;
    if(free<requiredFree||rest<restHours-1e-6)push(b[0].date,requiredFree===2&&restHours===48?'Zwischen Arbeitsblöcken mindestens zwei vollständig freie Kalendertage und 48 Stunden Ruhe.':`Zwischen Arbeitsblöcken mindestens ${requiredFree} vollständig freie Kalendertage und ${restHours} Stunden Ruhe.`);
   }
  }
  const nights=[];for(const a of own.filter(night)){const b=nights.at(-1);if(b&&plus(b.at(-1).date,1)===a.date)b.push(a);else nights.push([a])}
  for(const b of nights){if(touch(b)&&b.length>maxNight)push(b[0].date,maxNight===3?'Höchstens drei Nachtdienste am Stück.':`Höchstens ${maxNight} Nachtdienste am Stück.`);const last=b.at(-1),next=own.find(a=>a.startMs>=last.endMs&&a.date>last.date);
   if(next&&(touch(b)||!wanted||wanted.has(next.date))){const free=Math.round((Date.parse(next.date)-Date.parse(localDate(last.endMs-1,p)))/D)-1;const requiredNightFree=b.length===3&&p.threeNightBlockRecoveryFullCalendarDays!=null?Math.min(nightFree,Number(p.threeNightBlockRecoveryFullCalendarDays)):nightFree;if(free<requiredNightFree)push(next.date,requiredNightFree===3?'Nach einem Nachtblock mindestens drei vollständig freie Kalendertage.':`Nach einem Nachtblock mindestens ${requiredNightFree} vollständig freie Kalendertage.`);}
  }
  for(let i=1;i<own.length;i++){const a=own[i-1],b=own[i];if(wanted&&!wanted.has(a.date)&&!wanted.has(b.date))continue;if(b.startMs-a.endMs<11*H-1e-6)push(b.date,'Mindestens 11 Stunden Ruhezeit.');if(plus(a.date,1)===b.date){const message=transitionError(a.type,b.type,p);if(message)push(b.date,message);}}
  const weeks=new Set();for(const a of own){if(wanted&&!wanted.has(a.date))continue;weeks.add(weekKey(a.date));weeks.add(weekKey(localDate(a.endMs-1,p)))}if(wanted)for(const d of wanted)weeks.add(weekKey(d));
  const cap=weekCap;
  for(const w of weeks){const start=instant(w,'00:00',p.timezone),end=instant(plus(w,7),'00:00',p.timezone),hours=own.reduce((sum,a)=>sum+Math.max(0,Math.min(a.endMs,end)-Math.max(a.startMs,start))/H,0);if(hours>cap+1e-6)push(w,'Höchstens '+cap+' Stunden pro Kalenderwoche; Nachtdienste zählen zeitanteilig.')}
  return out.filter((x,i)=>out.findIndex(v=>v.date===x.date&&v.message===x.message)===i);
 }

 function errors(e,rows,p,affected){if(!policy(p))return[];if(confirmed(p))return confirmedErrors(e,rows,p,affected);
  const by=new Map(rows.filter(active).filter(a=>String(a.employeeId)===String(e.id)).map(a=>[a.date,duty(a,p)]));
  const dates=[...by.keys()].sort(),blocks=[];for(const date of dates){const last=blocks.at(-1);if(last&&plus(last.at(-1).date,1)===date)last.push(by.get(date));else blocks.push([by.get(date)])}
  const wanted=affected&&new Set(affected),out=[],touch=b=>!wanted||b.some(a=>wanted.has(a.date));
  for(let i=0;i<blocks.length;i++){const b=blocks[i],previous=blocks[i-1],last=b.at(-1),first=b[0];
   if(touch(b)&&b.length>(p.maxConsecutiveShifts||4))out.push({date:first.date,employeeId:e.id,message:'Höchstens vier Dienste am Stück.'});
   if(previous&&(touch(b)||touch(previous))){const left=previous.at(-1),free=Math.round((Date.parse(first.date)-Date.parse(left.date))/D)-1,rest=(first.startMs-left.endMs)/H,short=(p.shortBlockRecoveryPersonnelNos||[]).includes(String(e.personnelNo))&&previous.length<=(p.shortBlockMaximum||2)&&previous.every(a=>['OT1','OT2','OT3'].includes(a.type));
    if(free<(short?1:p.minFreeStartDays||2)||rest<(short?11:p.minBlockRestHours||48)-1e-6)out.push({date:first.date,employeeId:e.id,message:short?'Nach kurzen OT-Blöcken mindestens ein freier Tag und 11 Stunden Ruhe.':'Zwischen Arbeitsblöcken mindestens zwei freie Starttage und 48 Stunden Ruhe.'});
   }
   if(touch(b))for(let j=1;j<b.length;j++){const a=b[j-1],c=b[j];if(c.startMs-a.endMs<11*H)out.push({date:c.date,employeeId:e.id,message:'Mindestens 11 Stunden Ruhezeit.'});const message=transitionError(a.type,c.type,p);if(message)out.push({date:c.date,employeeId:e.id,message})}
  }return out;
 }
 function canAdd(e,byDay,option,p){if(!policy(p))return true;const values=new Map();for(const a of option){for(let n=-8;n<=8;n++){const b=byDay.get(a.day+n);if(b)values.set(b.date,b)}}for(const a of option)values.set(a.date,a);return !errors(e,[...values.values()],p,option.map(a=>a.date)).length}
 function workRestOptions(e,date,choices,dates,base=[],excluded=()=>false,accept=()=>true,p){
  const meta=k=>String((e.qualifications||[]).find(q=>String(q).startsWith('__sp:'+k+'='))||'').split('=').slice(1).join('=');
  const mode=e.rhythmMode||meta('rhythmMode'),pattern=String(e.rhythmPattern||meta('rhythmPattern')).split(/[,;\n]/).map(v=>v.trim().toUpperCase()).filter(Boolean),anchor=e.rhythmStart||meta('rhythmStart');
  if(mode!=='required'||(e.planningTeam||meta('planningTeam'))||!pattern.includes('FREI')||!pattern.includes('ALLE')||pattern.some(v=>!['ALLE','FREI'].includes(v))||!/^\d{4}-\d{2}-\d{2}$/.test(anchor))return null;
  const n=pattern.length,index=((Math.round((Date.parse(date)-Date.parse(anchor))/D)%n)+n)%n;if(pattern[index]!=='ALLE')return {options:[]};
  let before=0,after=0;while(before<n-1&&pattern[(index-before-1+n)%n]==='ALLE')before++;while(after<n-1&&pattern[(index+after+1)%n]==='ALLE')after++;
  const selected=new Set(dates),wanted=Array.from({length:before+after+1},(_,i)=>plus(date,i-before)).filter(d=>selected.has(d)&&!excluded(d)&&!base.some(a=>active(a)&&String(a.employeeId)===String(e.id)&&a.date===d&&!['OT1','OT2','OT3'].includes(a.type)));
  if(wanted[0]!==date)return {options:[]};
  const lists=wanted.map(d=>(choices.get(d)||[]).filter(a=>!['OT1','OT2','OT3'].includes(a.type))),options=[],seen=new Set();
  const add=rows=>{if(rows.some(a=>!a))return;const key=rows.map(a=>a.type+'|'+a.resource).join(';');if(!seen.has(key)){seen.add(key);if(accept(rows))options.push(rows)}};
  for(const first of lists[0]||[])add(lists.map(list=>list.find(a=>a.type===first.type)));
  function visit(at,rows){if(options.length>=64)return;if(at===lists.length){add(rows);return}for(const a of lists[at]){const last=rows.at(-1);if(last&&!allowsTransition(last.type,a.type,p))continue;visit(at+1,[...rows,a]);if(options.length>=64)break}}
  if(lists.length&&lists.every(list=>list.length))visit(0,[]);
  return {options};
 }
 const otCodes=['OT1','OT2','OT3'];
 function otRoster(p){return policy(p)&&Array.isArray(p.otWeekdayRoster?.employeeIds)&&p.otWeekdayRoster.employeeIds.length?p.otWeekdayRoster:null}
 function rosterEmployee(e,p){return !!otRoster(p)?.employeeIds.map(String).includes(String(e._dbId||e.id))}
 function rosterMinimum(p){const r=otRoster(p);return r?Math.max(1,Math.min(r.employeeIds.length,r.allowDaysOff?Number(r.minimumDailyStaff)||r.employeeIds.length:r.employeeIds.length)):0}
 function rosterMissing(date,rows,p){
  const needs=Object.fromEntries(otCodes.map(code=>[code,required(date,code,rows,p)||0]));
  if(otRoster(p)?.allowDaysOff&&!needs.OT1&&!needs.OT3)needs.OT2=Math.min(needs.OT2,rosterMinimum(p));
  return otCodes.reduce((n,code)=>n+Math.max(0,needs[code]-rows.filter(a=>active(a)&&a.date===date&&a.type===code).length),0);
 }
 // Reserve staggered days off before the daily solver spends every employee's
 // monthly budget on the same first twenty weekdays. Extend weekends so the
 // existing two-day recovery rule remains binding.
 function rosterDaysOff(people,choices,dates,base,p){
  const result=new Map(),roster=otRoster(p);if(!roster?.allowDaysOff)return result;
  const crew=people.filter(e=>rosterEmployee(e,p));
  for(const month of new Set(dates.map(d=>d.slice(0,7)))){
   const days=dates.filter(d=>d.startsWith(month)&&rosterDay(d,p)),capacity=new Map();
   for(const d of days){const available=crew.filter(e=>choices.get(String(e.id))?.get(d)?.some(a=>otCodes.includes(a.type))).length,filled=new Set(base.filter(a=>active(a)&&a.date===d&&otCodes.includes(a.type)&&crew.some(e=>String(e.id)===String(a.employeeId))).map(a=>String(a.employeeId))).size;capacity.set(d,Math.max(0,available+filled-rosterMinimum(p)))}
   const tasks=crew.map(e=>{
    const own=base.filter(a=>active(a)&&String(a.employeeId)===String(e.id)).map(a=>duty(a,p)),started=own.filter(a=>a.date.startsWith(month)),begin=instant(month+'-01','00:00',p.timezone),endDate=new Date(month+'-01T12:00Z');endDate.setUTCMonth(endDate.getUTCMonth()+1);const end=instant(endDate.toISOString().slice(0,10),'00:00',p.timezone);
    const calendar=own.reduce((n,a)=>n+Math.max(0,Math.min(a.endMs,end)-Math.max(a.startMs,begin))/H,0),slots=Math.max(0,Math.min((e.maxMonthlyShifts??Infinity)-started.filter(countsTowardCap).length,Math.floor(((e.monthLimit??Infinity)-started.reduce((n,a)=>n+a.hours,0)+1e-6)/10),Math.floor(((e.calendarLimit??Infinity)-calendar+1e-6)/10)));
    const available=days.filter(d=>choices.get(String(e.id))?.get(d)?.some(a=>otCodes.includes(a.type)));
    return {id:String(e.id),left:Math.max(0,available.length-slots),candidates:available.filter(d=>[1,5].includes(weekday(d))&&capacity.get(d)>0&&!(required(d,'OT1',base,p)||required(d,'OT3',base,p))),off:new Set(),weeks:new Set()};
   }).filter(t=>t.left>0);
   const used=new Map();let visits=0;
   function assign(){
    if(++visits>20000)return false;
    const pending=tasks.filter(t=>t.left>0).map(t=>({t,dates:t.candidates.filter(d=>!t.off.has(d)&&!t.weeks.has(weekKey(d))&&(used.get(d)||0)<capacity.get(d))})).sort((a,b)=>a.dates.length-b.dates.length||b.t.left-a.t.left||a.t.id.localeCompare(b.t.id));
    if(!pending.length)return true;const {t,dates:options}=pending[0];if(options.length<t.left)return false;
    for(const d of options){t.left--;t.off.add(d);t.weeks.add(weekKey(d));used.set(d,(used.get(d)||0)+1);if(assign())return true;used.set(d,used.get(d)-1);t.weeks.delete(weekKey(d));t.off.delete(d);t.left++}return false;
   }
   if(assign())for(const t of tasks){if(!result.has(t.id))result.set(t.id,new Set());for(const d of t.off)result.get(t.id).add(d)}
  }
  return result;
 }
 function otDayHoliday(date,p){if(!p?.otDayHolidayExclusion)return false;const api=typeof OT==='function'?OT():OT;if(!api?.isHoliday)throw Error('Feiertagskalender konnte nicht geladen werden. Bitte die Seite neu laden.');return api.isHoliday(date,p.otDayHolidayStates||['DE','SN','NW']);}
 function rosterDay(date,p){return !!otRoster(p)&&!otDayHoliday(date,p)&&(p.otWeekdayRoster.weekdays||[1,2,3,4,5]).includes(weekday(date))}
 function required(date,code,rows,p){if(otCodes.includes(code)&&otDayHoliday(date,p))return 0;if(!policy(p))return null;if(otRoster(p)&&code==='OT2'){if(!rosterDay(date,p))return 0;return Math.max(0,otRoster(p).employeeIds.length-(required(date,'OT1',rows,p)||0)-(required(date,'OT3',rows,p)||0))}const rule=(p.conditionalStaffing||[]).find(r=>r.shift===code);if(!rule)return null;if(weekday(date)>5)return 0;
  const from=instant(date,rule.coverageStart,p.timezone),to=instant(date,rule.coverageEnd,p.timezone),source=plus(date,rule.sourceDayOffset),seen=new Set();
  for(const a of rows){if(!active(a)||a.type!==rule.sourceShift||a.date!==source)continue;const d=duty(a,p);if(d.startMs<=from&&d.endMs>=to)seen.add(String(a.employeeId))}
  return seen.size>=rule.minimum?0:rule.fallbackCount;
 }
 function summary(p,types=[],companyPolicy={}){
  if(!policy(p))return '';
  if(!confirmed(p)){const month=Number(companyPolicy.monthlyPlanningMaxHours),count=Number(companyPolicy.monthlyPlanningMaxShifts);return `Verbindlich: ${month>0?`Monatsgrenze ${month} h; `:''}${count>0?`${count} automatische Dienste pro Monat; `:''}max. ${p.maxConsecutiveShifts??4} Dienste am Stück. Zwischen Blöcken ${p.minFreeStartDays??2} freie Starttage und ${p.minBlockRestHours??48} h Ruhe. Persönliche niedrigere Grenzen, Freigaben und Abwesenheiten bleiben maßgeblich.`;}

  const durations=types.filter(t=>!['OT1','OT2','OT3'].includes(t.id)).map(t=>{const m=x=>Number(x.slice(0,2))*60+Number(x.slice(3,5));return(m(t.end)-m(t.start)+1440)%1440});
  const model=[];if(durations.some(m=>m>480))model.push(`über 8 h: ${p.tenHourMaxShifts??18} automatische Dienste`);if(durations.some(m=>m>0&&m<=480))model.push(`8 h: ${p.eightHourMaxShifts??23} automatische Dienste / ${Math.min(p.monthlyMaxHours??190,p.eightHourAutoMaxHours??184)} h`);
  if(p.otOnlyMonthlyMaxHours!=null&&types.some(t=>['OT1','OT2','OT3'].includes(t.id)))model.push(`Tagdienst OT1 / OT2 / OT3 · 10 h je Dienst: ${p.otOnlyMonthlyMaxHours} h/Monat, ${p.otOnlyMaxCalendarWeekHours??p.maxCalendarWeekHours??40} h/Woche, ${p.otOnlyMaxConsecutiveShifts??p.maxConsecutiveShifts??4} Dienste am Stück, ${p.otOnlyMinFreeCalendarDays??p.minFreeCalendarDays??2} freie Tage und ${p.otOnlyMinBlockRestHours??p.minBlockRestHours??48} h zwischen Blöcken (normale OT ausgenommen)`);
  if(p.teamLeaderMaxConsecutiveNightShifts!=null)model.push(`Teamleiter: höchstens ${p.teamLeaderMaxConsecutiveNightShifts} Nächte am Stück${p.teamLeaderPreferredNightBlockLength!=null?`, bevorzugt ${p.teamLeaderPreferredNightBlockLength}`:''}${p.teamLeaderMinNightRecoveryCalendarDays!=null?`; danach ${p.teamLeaderMinNightRecoveryCalendarDays} vollständig freie Kalendertage und mindestens ${p.minBlockRestHours??48} h Ruhe`:''}${p.teamLeaderMinimumMonthlyHours!=null?`; Monatsziel zuerst ${p.teamLeaderMinimumMonthlyHours} h, anschließend Vertrags-SOLL (persönliche niedrigere Grenzen bleiben verbindlich)`:''}; Wochenmaximum bleibt verbindlich`);
  if(p.threeNightBlockRecoveryFullCalendarDays!=null)model.push(`Fester 4 Arbeit / 3 frei / 3 Arbeit / 2 frei: nach genau drei Nächten Schlaftag plus ${p.threeNightBlockRecoveryFullCalendarDays} voller freier Tag; nach vier Nächten Schlaftag plus ${p.minNightRecoveryCalendarDays??2} volle freie Tage; mindestens ${p.minBlockRestHours??48} h Ruhe`);
  if(p.otDayHolidayExclusion)model.push('Feiertage Deutschland / Sachsen / Nordrhein-Westfalen: keine Pflichtbesetzung OT1 / OT2 / OT3; normale OT nach hinterlegtem Bedarf und Einsatzort');
  if(p.preventDescendingShifts)model.push('Innerhalb eines Arbeitsblocks nur gleiche oder aufsteigende Dienste: OT → O1 → O2 / TL-LE / TL-RE → O3; absteigende Wechsel am Folgetag gesperrt');
  else if(p.preventLeaderToO1)model.push('TL-LE / TL-RE → O1 am Folgetag gesperrt; O1 → TL bleibt zulässig');
  if(otRoster(p))model.push(otRoster(p).allowDaysOff?`Feste OT-Tagdienstgruppe: höchstens ${p.otOnlyMonthlyMaxHours} h je Mitarbeiter; zusätzliche freie Tage versetzt bei ausreichender Nachtabdeckung, mindestens ${rosterMinimum(p)} Mitarbeiter pro Werktag; OT1/OT3 nach Nachtabdeckung, übrige OT2; Wochenende und konfigurierte Feiertage frei`:'Feste OT-Tagdienstgruppe: jeder Mitarbeiter Montag–Freitag; OT1/OT3 nur bei fehlender Nachtabdeckung, alle übrigen auf OT2; Wochenende und konfigurierte Feiertage frei');
  return `Verbindlich: max. ${p.monthlyMaxHours??190} h pro Kalendermonat${model.length?'; '+model.join('; '):''}. Allgemeine Regeln für andere Mitarbeiter: max. ${p.maxConsecutiveShifts??4} Dienste und ${p.maxConsecutiveNightShifts??3} Nächte am Stück. Zwischen Blöcken ${p.minFreeCalendarDays??2} vollständig freie Kalendertage und ${p.minBlockRestHours??48} h Ruhe; nach Nachtblöcken ${p.minNightRecoveryCalendarDays??3} freie Kalendertage. Max. ${p.maxCalendarWeekHours??40} h pro Kalenderwoche einschließlich Nachtübertrag. Persönliche niedrigere Grenzen, Freigaben und Abwesenheiten bleiben maßgeblich.`;
 }
 function metrics(people,rows,p,months){const all=rows.filter(active).map(a=>duty(a,p)),out={nightBlocksOverPreferred:0,missingFreeWeekends:0,rollingWeekExcessHours:0,rollingWeekOverTargetWindows:0,startTimeChanges:0,isolatedDuties:0};
  for(const e of people){const own=all.filter(a=>String(a.employeeId)===String(e.id)).sort((a,b)=>a.date.localeCompare(b.date)),blocks=[];for(const a of own){if(!months.includes(a.date.slice(0,7)))continue;const b=blocks.at(-1);if(b&&plus(b.at(-1).date,1)===a.date)b.push(a);else blocks.push([a])}
   for(const b of blocks){if(b.length===1)out.isolatedDuties++;let night=0;for(let i=0;i<b.length;i++){if(b[i].start>='18:00')night++;else night=0;if(night>(employeeRules(e,p).preferredNightBlockLength||3))out.nightBlocksOverPreferred++;if(i&&b[i].start!==b[i-1].start)out.startTimeChanges++}}
   for(const month of months){let free=0;for(let date=month+'-01';date.startsWith(month);date=plus(date,1)){if(weekday(date)!==6)continue;const s=instant(date,'00:00',p.timezone),t=instant(plus(date,2),'00:00',p.timezone);if(!own.some(a=>a.startMs<t&&a.endMs>s))free++}out.missingFreeWeekends+=Math.max(0,(p.minFreeWeekendsPerMonth??1)-free)}
   for(const a of own){if(!months.includes(a.date.slice(0,7)))continue;const end=plus(a.date,7),h=own.filter(b=>b.date>=a.date&&b.date<end).reduce((n,b)=>n+b.hours,0);out.rollingWeekExcessHours+=Math.max(0,h-(p.rollingWeekTargetHours||40));if(h>(p.rollingWeekTargetHours||40)+1e-6)out.rollingWeekOverTargetWindows++}
  }return out;
 }
 const penalty=m=>m.nightBlocksOverPreferred*8+m.missingFreeWeekends*35+m.rollingWeekExcessHours*.3+m.startTimeChanges*3+m.isolatedDuties*4;
 return{transitionError,allowsTransition,fixedWeeklyRoster,workRestOptions,otDayHoliday,otCodes,otRoster,rosterEmployee,rosterMinimum,rosterMissing,rosterDaysOff,rosterDay,employeeRules,otDayEmployee,weeklyLimit,summary,plus,weekday,instant,interval,duty,errors,canAdd,required,metrics,penalty,confirmed,limits,countsTowardCap,night,localDate,weekKey};
});
