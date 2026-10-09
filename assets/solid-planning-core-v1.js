// Gemeinsame Erholungs- und Besetzungsregeln für freigeschaltete Unternehmen.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SFSolidPlanningCore=api})(typeof window!=='undefined'?window:globalThis,function(){
 const H=3600000,D=86400000,cache=new Map(),formats=new Map();
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
 function localDate(ms,p){const key=p.timezone||'Europe/Berlin';let f=formats.get('date|'+key);if(!f){f=new Intl.DateTimeFormat('en-CA',{timeZone:key,year:'numeric',month:'2-digit',day:'2-digit'});formats.set('date|'+key,f)}const v=Object.fromEntries(f.formatToParts(new Date(ms)).map(x=>[x.type,x.value]));return v.year+'-'+v.month+'-'+v.day}
 const weekKey=date=>plus(date,1-weekday(date));
 const night=a=>/^(ND|O1|O2|O3|O1S|O2S|TL|TL-LE|TL-RE|TEAMLEITER|QA)$/i.test(a.type)||a.start>='18:00';
 const countsTowardCap=a=>!a._marketApproved;
 function limits(e,types,p){
  if(!confirmed(p))return null;
  const allowed=types.filter(t=>t.active!==false&&(e.shifts||[]).includes(t.id||t.code)),minutes=t=>{const m=x=>Number(x.slice(0,2))*60+Number(x.slice(3,5));return (m(t.end)-m(t.start)+1440)%1440};
  const eight=allowed.length>0&&allowed.every(t=>minutes(t)>0&&minutes(t)<=480);
  const meta=k=>String((e.qualifications||[]).find(q=>String(q).startsWith('__sp:'+k+'='))||'').split('=').slice(1).join('=');
  const target=Number(e.monthlyHours??meta('monthlyHours'))||(/^Vollzeit(?:\s+180)?$/i.test(String(e.employment||'').trim())?180:Number(e.weeklyHours||40)*4.348);
  const full=/^Vollzeit(?:\s+180)?$/i.test(String(e.employment||'').trim())&&target>=180,configured=Number(e.weeklyLimit??e.maxWeeklyHours??meta('maxWeekly'))||Number(e.weeklyHours)||40;
  return{eightHourModel:eight,monthLimit:full?(eight?184:190):Math.min(190,target),calendarLimit:full?190:Math.min(190,target),maxMonthlyShifts:eight?23:18,weeklyLimit:Math.min(40,configured>0?configured:40)};
 }
 function confirmedErrors(e,rows,p,affected){
  const own=rows.filter(active).filter(a=>String(a.employeeId)===String(e.id)).map(a=>duty(a,p)).sort((a,b)=>a.startMs-b.startMs),wanted=affected&&new Set(affected),out=[],touch=b=>!wanted||b.some(a=>wanted.has(a.date)),push=(date,message)=>out.push({date,employeeId:e.id,message}),blocks=[];
  for(const a of own){const b=blocks.at(-1);if(b&&(b.at(-1).date===a.date||plus(b.at(-1).date,1)===a.date))b.push(a);else blocks.push([a])}
  for(let i=0;i<blocks.length;i++){const b=blocks[i],prev=blocks[i-1];if(touch(b)&&b.length>4)push(b[0].date,'Höchstens vier Dienste am Stück.');
   if(prev&&(touch(b)||touch(prev))){const last=prev.at(-1),free=Math.round((Date.parse(b[0].date)-Date.parse(localDate(last.endMs-1,p)))/D)-1,rest=(b[0].startMs-last.endMs)/H;
    if(free<2||rest<48-1e-6)push(b[0].date,'Zwischen Arbeitsblöcken mindestens zwei vollständig freie Kalendertage und 48 Stunden Ruhe.');
   }
  }
  const nights=[];for(const a of own.filter(night)){const b=nights.at(-1);if(b&&plus(b.at(-1).date,1)===a.date)b.push(a);else nights.push([a])}
  for(const b of nights){if(touch(b)&&b.length>3)push(b[0].date,'Höchstens drei Nachtdienste am Stück.');const last=b.at(-1),next=own.find(a=>a.startMs>=last.endMs&&a.date>last.date);
   if(next&&(touch(b)||!wanted||wanted.has(next.date))){const free=Math.round((Date.parse(next.date)-Date.parse(localDate(last.endMs-1,p)))/D)-1;if(free<3)push(next.date,'Nach einem Nachtblock mindestens drei vollständig freie Kalendertage.');}
  }
  for(let i=1;i<own.length;i++){const a=own[i-1],b=own[i];if(wanted&&!wanted.has(a.date)&&!wanted.has(b.date))continue;if(b.startMs-a.endMs<11*H-1e-6)push(b.date,'Mindestens 11 Stunden Ruhezeit.');if(plus(a.date,1)===b.date&&a.type==='O3'&&['O1','O2','TL','TL-LE','TL-RE','TEAMLEITER'].includes(b.type))push(b.date,'Nach O3 kein früherer Nachtdienst am Folgetag.');}
  const weeks=new Set();for(const a of own){if(wanted&&!wanted.has(a.date))continue;weeks.add(weekKey(a.date));weeks.add(weekKey(localDate(a.endMs-1,p)))}if(wanted)for(const d of wanted)weeks.add(weekKey(d));
  const meta=String((e.qualifications||[]).find(q=>String(q).startsWith('__sp:maxWeekly='))||'').split('=')[1],configured=Number(e.weeklyLimit??e.maxWeeklyHours??meta)||Number(e.weeklyHours)||40,cap=Math.min(40,configured>0?configured:40);
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
   if(touch(b))for(let j=1;j<b.length;j++){const a=b[j-1],c=b[j];if(c.startMs-a.endMs<11*H)out.push({date:c.date,employeeId:e.id,message:'Mindestens 11 Stunden Ruhezeit.'});if(a.type==='O3'&&['O1','O2','TL','TL-LE','TL-RE','TEAMLEITER'].includes(c.type))out.push({date:c.date,employeeId:e.id,message:'Nach O3 kein früherer Nachtdienst am Folgetag.'})}
  }return out;
 }
 function canAdd(e,byDay,option,p){if(!policy(p))return true;const values=new Map();for(const a of option){for(let n=-8;n<=8;n++){const b=byDay.get(a.day+n);if(b)values.set(b.date,b)}}for(const a of option)values.set(a.date,a);return !errors(e,[...values.values()],p,option.map(a=>a.date)).length}
 function required(date,code,rows,p){if(!policy(p))return null;const rule=(p.conditionalStaffing||[]).find(r=>r.shift===code);if(!rule)return null;if(weekday(date)>5)return 0;
  const from=instant(date,rule.coverageStart,p.timezone),to=instant(date,rule.coverageEnd,p.timezone),source=plus(date,rule.sourceDayOffset),seen=new Set();
  for(const a of rows){if(!active(a)||a.type!==rule.sourceShift||a.date!==source)continue;const d=duty(a,p);if(d.startMs<=from&&d.endMs>=to)seen.add(String(a.employeeId))}
  return seen.size>=rule.minimum?0:rule.fallbackCount;
 }
 function metrics(people,rows,p,months){const all=rows.filter(active).map(a=>duty(a,p)),out={nightBlocksOverPreferred:0,missingFreeWeekends:0,rollingWeekExcessHours:0,rollingWeekOverTargetWindows:0,startTimeChanges:0,isolatedDuties:0};
  for(const e of people){const own=all.filter(a=>String(a.employeeId)===String(e.id)).sort((a,b)=>a.date.localeCompare(b.date)),blocks=[];for(const a of own){if(!months.includes(a.date.slice(0,7)))continue;const b=blocks.at(-1);if(b&&plus(b.at(-1).date,1)===a.date)b.push(a);else blocks.push([a])}
   for(const b of blocks){if(b.length===1)out.isolatedDuties++;let night=0;for(let i=0;i<b.length;i++){if(b[i].start>='18:00')night++;else night=0;if(night>(p.preferredNightBlockLength||3))out.nightBlocksOverPreferred++;if(i&&b[i].start!==b[i-1].start)out.startTimeChanges++}}
   for(const month of months){let free=0;for(let date=month+'-01';date.startsWith(month);date=plus(date,1)){if(weekday(date)!==6)continue;const s=instant(date,'00:00',p.timezone),t=instant(plus(date,2),'00:00',p.timezone);if(!own.some(a=>a.startMs<t&&a.endMs>s))free++}out.missingFreeWeekends+=Math.max(0,(p.minFreeWeekendsPerMonth||1)-free)}
   for(const a of own){if(!months.includes(a.date.slice(0,7)))continue;const end=plus(a.date,7),h=own.filter(b=>b.date>=a.date&&b.date<end).reduce((n,b)=>n+b.hours,0);out.rollingWeekExcessHours+=Math.max(0,h-(p.rollingWeekTargetHours||40));if(h>(p.rollingWeekTargetHours||40)+1e-6)out.rollingWeekOverTargetWindows++}
  }return out;
 }
 const penalty=m=>m.nightBlocksOverPreferred*8+m.missingFreeWeekends*35+m.rollingWeekExcessHours*.3+m.startTimeChanges*3+m.isolatedDuties*4;
 return{plus,weekday,instant,interval,duty,errors,canAdd,required,metrics,penalty,confirmed,limits,countsTowardCap,night,localDate,weekKey};
});
