// Server-prepared inputs only; no browser globals, credentials or external calls.
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./solid-planning-core-v1.js'):root.SFSolidPlanningCore,typeof module==='object'&&module.exports?require('./background-auto-plan-core-v1.js'):root.SFBackgroundAutoPlanCore,typeof module==='object'&&module.exports?require('./individual-month-planner-v1.js'):root.SFIndividualMonthPlanner,typeof module==='object'&&module.exports?require('./auto-plan-repair-core-v1.js'):root.SFAutoPlanRepairCore,typeof module==='object'&&module.exports?require('./month-optimizer-core-v1.js'):root.SFMonthOptimizerCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.SFAutonomousPlanningCore=api})(typeof window==='undefined'?globalThis:window,function(S,B,I,R,M){
 'use strict';
 const H=3600000,meta=(e,k)=>String((e.qualifications||[]).find(q=>q.startsWith('__sp:'+k+'='))||'').split('=').slice(1).join('='),active=a=>a.status!=='CANCELLED'&&a._dbStatus!=='CANCELLED';
 const nextMonth=m=>new Date(Date.UTC(+m.slice(0,4),+m.slice(5,7),1)).toISOString().slice(0,7);
 function limits(e,types,policy){
  const target=Number(meta(e,'monthlyHours'))||(/^Vollzeit(?:\s+180)?$/i.test(e.employment||'')?180:Number(e.weeklyHours||40)*4.348),weekly=Number(meta(e,'maxWeekly'))||Number(e.weeklyHours)||40;
  const person={...e,target,monthlyHours:target,maxWeeklyHours:weekly,maxConsecutive:Number(meta(e,'maxConsecutive'))||0,permissions:e.shifts.length};
  const confirmed=S.limits(person,types,policy.solid_planning_rules);if(confirmed)return {...person,...confirmed};
  const maximum=Number(policy.monthly_planning_max_hours)||220,full=/^Vollzeit(?:\s+180)?$/i.test(e.employment||'')&&target>=180;
  return {...person,monthLimit:full?maximum:Math.min(maximum,target),calendarLimit:maximum,maxMonthlyShifts:Number(policy.monthly_planning_max_shifts)||1e9,weeklyLimit:weekly};
 }
 function build(snapshot,employeeIds=null){
  if(snapshot.version!==1||!snapshot.company||!snapshot.fingerprint||!Array.isArray(snapshot.months)||!snapshot.months.length)throw Error('Ungültiger Server-Datenstand.');
  const policy=snapshot.policy,storedRules=policy.solid_planning_rules||{},zone=snapshot.timezone||'Europe/Berlin',rules={...storedRules,timezone:zone},types=snapshot.types.filter(t=>t.active!==false),history=snapshot.base.filter(active),margin=Math.max(8,...snapshot.employees.map(e=>Number(meta(e,'maxConsecutive'))||0))+1,base=history.filter(a=>a.date>=S.plus(snapshot.months[0]+'-01',-margin)&&a.date<S.plus(nextMonth(snapshot.months.at(-1))+'-01',margin)),groups=new Map(),byType=new Map(types.map(t=>[t.id,t]));
  for(const t of types)if(t.coverageGroup){const list=groups.get(t.coverageGroup)||[];list.push(t);groups.set(t.coverageGroup,list);}
  for(const list of groups.values())if(list.some(t=>t.start!==list[0].start||t.end!==list[0].end))throw Error('Gemeinsame Besetzung mit unterschiedlichen Zeitfenstern benötigt eine individuelle Prüfung.');
  const people=snapshot.employees.map(e=>limits(e,types,policy)),ownBase=new Map(people.map(e=>[String(e.id),base.filter(a=>String(a.employeeId)===String(e.id)).map(a=>S.duty(a,rules))])),eligible=new Map(),raw=new Map(snapshot.demand.map(d=>[d.date+'|'+d.type,Number(d.count)||0]));
  for(const a of snapshot.candidates){const k=a.date+'|'+a.type,list=eligible.get(k)||new Set();list.add(String(a.employeeId));eligible.set(k,list);}
  const source=snapshot.rhythms||[],rhythms=new Map(source.map(r=>[String(r.employeeId)+'|'+r.date,r]));
  const resources=new Map(),slots=[];
  for(const d of snapshot.demand){const t=byType.get(d.type);if(!t)continue;let code=t.id,count=Number(d.count)||0;
   if(t.coverageGroup){const members=groups.get(t.coverageGroup);if(t.id!==members[0].id)continue;code=t.coverageGroup;count=Math.max(...members.map(m=>raw.get(d.date+'|'+m.id)||0));}
   if(S.otRoster(rules)&&S.otCodes.includes(t.id)){if(t.id!==S.otCodes.find(code=>byType.has(code)))continue;code='OT-DAY';count=S.rosterDay(d.date,rules)?S.otRoster(rules).employeeIds.length:0;}
   const alternatives=code==='OT-DAY'?S.otCodes.filter(code=>byType.has(code)):t.coverageGroup?groups.get(t.coverageGroup).map(t=>t.id):[t.id],key=d.date+'|'+code;
   const filled=new Set(base.filter(a=>a.date===d.date&&alternatives.includes(a.type)&&(code==='OT-DAY'||S.duty(a,rules).startMs<=S.instant(d.date,t.start,zone)&&S.duty(a,rules).endMs>=S.interval(d.date,t.start,t.end,zone).end)).map(a=>String(a.employeeId))).size;
   resources.set(key,{date:d.date,type:t.id,alternatives,coverageGroup:code===t.id?undefined:code,count:Math.max(0,count-filled),total:count});
  }
  for(const slot of resources.values())for(let n=0;n<slot.count;n++)slots.push({...slot});
  function input(month,criticalOnly=false){
   const dates=[...new Set(snapshot.demand.filter(d=>!month||d.date.startsWith(month)).map(d=>d.date))].sort(),capacities=new Map([...resources].filter(([,s])=>!month||s.date.startsWith(month)).map(([key,s])=>[key,s.count])),reserved=[],optionGroups=[];
   const choicesBy=new Map();
   for(const e of people){const choices=new Map();
    for(const date of dates){const own=[];for(const [resource,slot] of resources){if(slot.date!==date||!capacities.get(resource))continue;for(const type of slot.alternatives){const t=byType.get(type);if(!eligible.get(date+'|'+type)?.has(String(e.id))||base.some(a=>String(a.employeeId)===String(e.id)&&a.date===date))continue;
      const a={employeeId:e.id,date,type,start:t.start,end:t.end,resource,coverageGroup:slot.coverageGroup};const r=rhythms.get(String(e.id)+'|'+date);
      if(r?.mode==='required'&&r.expected&&!['ALLE','FREI'].includes(r.expected)&&!r.exemptOt){if(capacities.get(resource)>0&&!reserved.some(b=>String(b.employeeId)===String(e.id)&&b.date===date)){reserved.push(a);capacities.set(resource,capacities.get(resource)-1);}continue;}own.push(a);
    }}choices.set(date,own);}choicesBy.set(String(e.id),choices);
   }
   const eight=types.some(t=>t.id==='SD'&&S.duty({date:dates[0],type:t.id,start:t.start,end:t.end},rules).hours===8)&&types.some(t=>t.id==='ND'&&S.duty({date:dates[0],type:t.id,start:t.start,end:t.end},rules).hours===8);
   const crew=people.map(e=>{const individual=!rules.enabled&&eight&&!meta(e,'planningTeam')&&(meta(e,'rhythmMode')||'off')==='off'&&e.shifts.length&&e.shifts.every(s=>['SD','ND','FD-WE'].includes(s));return {...e,individual,maxConsecutive:individual?Math.min(5,e.maxConsecutive||5):e.maxConsecutive||Number(S.employeeRules(e,rules).maxConsecutiveShifts)||4,monthLimit:individual?Math.min(e.monthLimit,/^Vollzeit(?:\s+180)?$/i.test(e.employment||'')?Math.floor((e.target+4)/8)*8:Math.floor(e.target/8)*8):e.monthLimit};});
   for(const e of crew){if(employeeIds&&!employeeIds.map(String).includes(String(e.id)))continue;const choices=choicesBy.get(String(e.id));
    for(const date of dates){const options=[],seen=new Set(),accept=rows=>!S.errors(e,[...ownBase.get(String(e.id)),...reserved.filter(a=>String(a.employeeId)===String(e.id)),...rows],rules,rows.map(a=>a.date)).length,excluded=d=>snapshot.unavailableDays?.some(x=>String(x.employeeId)===String(e.id)&&x.date===d);
     const fixed=rules.enabled?S.workRestOptions(e,date,choices,dates,[...base,...reserved],excluded,accept,rules):null;
     if(fixed){if(fixed.options.length)optionGroups.push({id:e.id+'|'+date,employee:e,block:true,fullWorkRest:true,options:fixed.options});continue;}
     const remember=rows=>{if(!rows.length||options.length>=128)return;const key=rows.map(a=>a.date+a.type).join(';');if(seen.has(key)||!accept(rows))return;if(e.individual&&!I.personValid({base:base.filter(a=>String(a.employeeId)===String(e.id)),start:Math.floor(Date.parse(month+'-01T12:00Z')/86400000),end:Math.floor(Date.parse(nextMonth(month)+'-01T12:00Z')/86400000)-1,respectHours:true},e,rows))return;seen.add(key);options.push(rows);};
     function extend(rows){remember(rows);if(rows.length>=(criticalOnly?1:e.maxConsecutive)||options.length>=128)return;const next=rows.length?S.plus(rows.at(-1).date,1):date;for(const a of choices.get(next)||[]){const prev=rows.at(-1);if(prev&&!S.allowsTransition(prev.type,a.type,rules))continue;extend([...rows,a]);if(options.length>=128)break;}}
     if(!criticalOnly||!e.individual)extend([]);
     if(options.length)optionGroups.push({id:e.id+'|'+date,employee:e,block:true,options});
    }
   }
   const critical=[];for(const [key,s] of resources){if(month&&!s.date.startsWith(month))continue;let minimum=0;for(const r of rules.criticalShifts||[])if(s.alternatives.includes(r.code)&&(!r.weekdays?.length||r.weekdays.includes(S.weekday(s.date))))minimum=Math.max(minimum,Number(r.minimum)||0);if((rules.criticalCoverageGroups||[]).includes(s.coverageGroup))minimum=s.total;if(s.coverageGroup==='OT-DAY')minimum=S.rosterDay(s.date,rules)?S.rosterMinimum(rules):0;const filled=s.total-s.count+reserved.filter(a=>a.resource===key).length;if(minimum>filled)critical.push([key,minimum-filled]);}
   return {month:month||snapshot.months[0],employees:crew,base:[...base,...reserved],preferenceBase:history,reserved,groups:optionGroups,capacities:[...capacities],criticalCapacities:critical,solidRules:storedRules,timezone:zone,searchIterations:48,criticalPeriod:!month,criticalOnly,scopedBlockRecovery:snapshot.scopedBlockRecovery===true,respectHours:true,fairDistribution:true,maxShiftHours:Number(policy.standard_max_shift_hours)||10,minRestHours:Number(policy.standard_min_rest_hours)||11,wishes:snapshot.wishes||[],learned:snapshot.learned||[],individualConstraints:true,historyMonths:snapshot.historyMonths??3};
  }
  const months=snapshot.months,monthInputs=months.map(m=>B.pack(input(m))),minimumInput=B.pack(input(null,true));
  const metadata={company:snapshot.company,month:months[0],months,dates:[...new Set(snapshot.demand.map(d=>d.date))].sort(),fingerprint:snapshot.fingerprint,base:history,movable:snapshot.movable,beforeOpen:slots.length,originalValid:false,beforeHours:people.map(e=>[String(e.id),snapshot.original.filter(a=>String(a.employeeId)===String(e.id)&&months.includes(a.date.slice(0,7))).reduce((n,a)=>n+S.duty(a,rules).hours,0)]),eligibility:[...resources].map(([resource,s])=>({resource,employeeIds:[...new Set(snapshot.candidates.filter(a=>a.date===s.date&&s.alternatives.includes(a.type)).map(a=>String(a.employeeId)))]})),requirements:[...resources].map(([key,s])=>({resource:key,date:s.date,type:s.type,alternatives:s.alternatives,total:s.total})),demandHours:[...resources.values()].reduce((n,s)=>{const t=byType.get(s.type);return n+s.total*S.duty({date:s.date,type:t.id,start:t.start,end:t.end},rules).hours;},0),autonomousRunId:snapshot.runId};
  return B.compactPayload({version:1,months,minimumInput,monthInputs,metadata});
 }
 function mergeEmployeeParts(parts){
  if(!parts.length)throw Error('Keine vorbereiteten Mitarbeiter vorhanden.');const first=parts[0],merge=inputs=>{const result={...inputs[0],candidates:[],groups:[]};for(const input of inputs){if(input.month!==result.month)throw Error('Mitarbeiterteile gehören zu verschiedenen Monaten.');const offset=result.candidates.length;result.candidates.push(...input.candidates);result.groups.push(...input.groups.map(g=>({...g,options:g.options.map(o=>o.map(i=>i+offset))})));}return result;};
  return {...first,minimumInput:merge(parts.map(p=>p.minimumInput)),monthInputs:[merge(parts.map(p=>p.monthInputs[0]))]};
 }
 function combine(parts,snapshot){
  if(parts.length!==snapshot.months.length)throw Error('Die vorbereiteten Monate sind unvollständig.');
  const first=parts[0],minimum={...first.minimumInput,month:snapshot.months[0],candidates:[],groups:[],capacities:[],criticalCapacities:[],reserved:[],base:[],preferenceBase:snapshot.base};
  for(const part of parts){const source=part.minimumInput,offset=minimum.candidates.length;minimum.candidates.push(...source.candidates);minimum.groups.push(...source.groups.map(g=>({...g,options:g.options.map(o=>o.map(i=>i+offset))})));minimum.capacities.push(...source.capacities);minimum.criticalCapacities.push(...source.criticalCapacities);minimum.reserved.push(...source.reserved);}
  minimum.base=B.unique([...snapshot.base,...minimum.reserved]);minimum.criticalPeriod=true;
  const metadata={...first.metadata,month:snapshot.months[0],months:snapshot.months,dates:parts.flatMap(p=>p.metadata.dates),base:snapshot.base,movable:snapshot.movable,beforeOpen:parts.reduce((n,p)=>n+p.metadata.beforeOpen,0),demandHours:parts.reduce((n,p)=>n+p.metadata.demandHours,0),eligibility:parts.flatMap(p=>p.metadata.eligibility),requirements:parts.flatMap(p=>p.metadata.requirements),beforeHours:first.monthInputs[0].employees.map(e=>[String(e.id),snapshot.original.filter(a=>String(a.employeeId)===String(e.id)&&snapshot.months.includes(a.date.slice(0,7))).reduce((n,a)=>n+S.duty(a,minimum.solidRules).hours,0)]),individualValidation:parts.map(p=>({month:p.months[0],employees:p.monthInputs[0].employees.filter(e=>e.individual)}))};
  return B.compactPayload({version:1,months:snapshot.months,minimumInput:minimum,monthInputs:parts.map(p=>p.monthInputs[0]),metadata});
 }
 function assess(payload,output){
  const all=[...payload.metadata.base,...output.preview],types=new Map(),employees=payload.monthInputs[0].employees,rules={...payload.minimumInput.solidRules,timezone:payload.minimumInput.timezone||payload.minimumInput.solidRules.timezone||'Europe/Berlin'},errors=[];
  for(const input of payload.monthInputs)for(const a of input.candidates)types.set(a.type,a);
  for(const e of employees){const changed=output.preview.filter(a=>String(a.employeeId)===String(e.id)).map(a=>a.date);errors.push(...S.errors(e,all,rules,changed));}
  for(const check of payload.metadata.individualValidation||[]){const start=Math.floor(Date.parse(check.month+'-01T12:00Z')/86400000),end=Math.floor(Date.parse(nextMonth(check.month)+'-01T12:00Z')/86400000)-1;for(const e of check.employees)if(!I.personValid({base:[],start,end,respectHours:true},e,all.filter(a=>String(a.employeeId)===String(e.id))))errors.push({message:'Individuelle Arbeits- oder Nachtblockregel verletzt.'});}
  // Repeat generic caps/rest/duration checks over the complete final proposal.
  // Individual block validation is performed above on complete months.
  for(const wire of payload.monthInputs){const input=B.unpack(wire),month=wire.month,keys=new Set(input.base.map(B.rowKey)),rows=output.preview.filter(a=>a.date.startsWith(month)&&!keys.has(B.rowKey(a))),candidateKeys=new Set([...wire.candidates,...wire.reserved].map(B.rowKey));
   const p=M.prepare({...input,solidRules:{...input.solidRules,enabled:false},respectHours:!S.confirmed(input.solidRules),individualConstraints:false,groups:rows.map((a,i)=>({id:'audit-'+i,employee:employees.find(e=>String(e.id)===String(a.employeeId)),options:[[a]]})),base:B.unique([...input.base,...output.preview.filter(a=>!a.date.startsWith(month))])}),state=M.state({...p,solidRules:input.solidRules});
   for(const g of p.groups){const option=g.options[0];if(!g.employee||!candidateKeys.has(B.rowKey(option[0]))||!M.feasible(p,state,g,option)){errors.push({message:'Vollständige Kapazitäts-, Ruhezeit- oder Kandidatenprüfung fehlgeschlagen.'});break;}M.checkpointPrimitives.commit(state,{group:g,option},month);}
  }
  let spread=0;for(const month of payload.months){const buckets=new Map();for(const e of employees){const list=buckets.get(e.target)||[];list.push(all.filter(a=>String(a.employeeId)===String(e.id)&&a.date.startsWith(month)).reduce((n,a)=>n+S.duty(a,rules).hours,0));buckets.set(e.target,list);}for(const h of buckets.values())if(h.length>1)spread=Math.max(spread,Math.max(...h)-Math.min(...h));}
  const quality=output.quality||[],open=(payload.metadata.requirements||[]).reduce((n,r)=>{if(r.resource.endsWith('|OT-DAY'))return n+S.rosterMissing(r.date,all,rules);const dynamic=r.resource.endsWith('|'+r.type)?S.required(r.date,r.type,all,rules):null,need=dynamic===null?r.total:dynamic,filled=new Set(all.filter(a=>a.date===r.date&&r.alternatives.includes(a.type)).map(a=>String(a.employeeId))).size;return n+Math.max(0,need-filled);},0),critical=quality.reduce((n,q)=>n+(q.critical||0),0),shift=Math.max(0,...output.preview.map(a=>S.duty(a,rules).hours));
  const slots=(payload.metadata.requirements||[]).flatMap(r=>{const dynamic=r.resource.endsWith('|'+r.type)?S.required(r.date,r.type,all,rules):null,filled=new Set(all.filter(a=>a.date===r.date&&r.alternatives.includes(a.type)).map(a=>String(a.employeeId))).size,total=r.resource.endsWith('|OT-DAY')?S.rosterMissing(r.date,all,rules):Math.max(0,(dynamic===null?r.total:dynamic)-filled);return Array.from({length:total},()=>({date:r.date,resource:r.resource}));});
  const diagnosis=R.diagnose({slots,eligible:slot=>(payload.metadata.eligibility||[]).find(r=>r.resource===slot.resource)?.employeeIds||[],searchLimited:quality.some(q=>q.searchLimited)});
  return {open,critical,errors:errors.length,spread,maximumShift:shift,diagnosis,canApply:!open&&!critical&&!errors.length&&spread<=shift+.001,checked:output.preview.length};
 }
 return{build,mergeEmployeeParts,combine,assess,limits,nextMonth};
});
