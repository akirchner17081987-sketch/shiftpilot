// SchichtFunk – verständlicher Ablauf für die bestehende Auto-Planung.
(function(){
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const el=id=>document.getElementById(id);
  const text=(id,value)=>{const node=el(id);if(node&&node.textContent!==String(value))node.textContent=value};
  const dateFormatter=new Intl.DateTimeFormat('de-DE',{weekday:'long',day:'2-digit',month:'2-digit'}),weekdayFormatter=new Intl.DateTimeFormat('de-DE',{weekday:'short'}),monthFormatter=new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}),dateLabels=new Map();
  const dateLabel=date=>{if(!dateLabels.has(date))dateLabels.set(date,dateFormatter.format(new Date(date+'T12:00:00')));return dateLabels.get(date)};
  const written=new WeakMap();
  const html=(node,value)=>{if(!node||written.get(node)===value)return;node.innerHTML=value;written.set(node,value)};
  let suggestionKey='',suggestionHost=null,stairMonth='',unresolvedPage=0,unresolvedKey='';
  const shiftLabel=code=>{const t=typeById(code),label=window.SFShiftModels?.label?.(code)||code;return t?.name&&t.name!==label?`${label} · ${t.name}`:label};
  function renderRuleCards(rules,company,core,confirmed){
    const p=rules||{},cards=[],hasOT=TYPES.some(t=>['OT1','OT2','OT3'].includes(t.id));
    const card=(key,title,rows=[],notes=[])=>{
      const preview={hours:rows.slice(0,2).map(([label,value])=>`${label}: ${value}`).join(' · '),recovery:rows.slice(0,2).map(([label,value])=>`${label}: ${value}`).join(' · '),'ot-weekend':`Sa & So · mindestens ${core?.otWeekendMinimum?.(p)||0} OT je Tag`,ot:`${p.otWeekdayRoster?'Mo–Fr · ':''}${p.otOnlyMonthlyMaxHours} h/Monat${p.otWeekdayRoster?' · Wochenende frei':''}`,leaders:`Max. ${p.teamLeaderMaxConsecutiveNightShifts} Nächte${p.teamLeaderMinimumMonthlyHours!=null?` · erstes Ziel ${p.teamLeaderMinimumMonthlyHours} h`:''}`,rhythms:rows[0]?.[1],changes:p.preventDescendingShifts?'Gleiche oder aufsteigende Dienste':'TL → O1 am Folgetag gesperrt',holidays:'OT nach Bedarf · keine OT1 / OT2 / OT3',personal:'Freigaben · Stundenlimits · Rhythmen'}[key];
      return `<details class="sf-auto-rule-card" data-rule-section="${key}"><summary><h3>${esc(title)}<small>${esc(preview)}</small></h3></summary><div class="sf-auto-rule-card-body">${rows.length?`<dl>${rows.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`:''}${notes.length?`<ul>${notes.map(note=>`<li>${esc(note)}</li>`).join('')}</ul>`:''}</div></details>`;
    };
    const weekdays=days=>(days||[]).map(d=>['','Mo','Di','Mi','Do','Fr','Sa','So'][d]).filter(Boolean).join(' · ');
    if(!confirmed){
      const hours=[];if(Number(company.monthlyPlanningMaxHours)>0)hours.push(['Monatsobergrenze',`${company.monthlyPlanningMaxHours} h`]);
      if(Number(company.monthlyPlanningMaxShifts)>0)hours.push(['Automatische Dienste / Monat',company.monthlyPlanningMaxShifts]);
      if(hours.length)cards.push(card('hours','Stunden & Monatsgrenzen',hours));
      if(p.enabled)cards.push(card('recovery','Arbeitsblöcke & Erholung',[
        ['Dienste am Stück',`Max. ${p.maxConsecutiveShifts??4}`],['Zwischen Arbeitsblöcken',`${p.minFreeStartDays??2} freie Starttage`],['Ruhe zwischen Blöcken',`Mind. ${p.minBlockRestHours??48} h`]
      ]));
    }else{
      const hours=p.monthlyHoursOnly?[['Monats-SOLL · Vollzeit',`${p.fullTimeMonthlyTarget??180} h`],['Automatische Monatsobergrenze',`${p.monthlyMaxHours??200} h`]]:[['Monatsobergrenze',`${p.monthlyMaxHours??190} h`]];
      hours.push(['Je Kalenderwoche',`Max. ${p.maxCalendarWeekHours??40} h`]);
      if(!p.monthlyHoursOnly){
        const minutes=t=>{const m=x=>Number(x.slice(0,2))*60+Number(x.slice(3,5));return(m(t.end)-m(t.start)+1440)%1440},normal=TYPES.filter(t=>!['OT1','OT2','OT3'].includes(t.id));
        if(normal.some(t=>minutes(t)>480))hours.push(['Dienste über 8 h',`Max. ${p.tenHourMaxShifts??18} / Monat`]);
        if(normal.some(t=>minutes(t)>0&&minutes(t)<=480))hours.push(['8-Stunden-Modell',`Max. ${p.eightHourMaxShifts??23} Dienste / ${Math.min(p.monthlyMaxHours??190,p.eightHourAutoMaxHours??184)} h automatisch`]);
      }
      cards.push(card('hours','Stunden & Monatsgrenzen',hours,[
        ...(p.monthlyHoursOnly?['Keine zusätzliche feste Anzahl automatischer Dienste.']:[]),
        'Teilzeit und niedrigere persönliche Grenzen bleiben maßgeblich. Nachtüberträge werden mitgerechnet.',
        ...(p.plannerMonthlyOverride?['Planer dürfen Vollzeit-SOLL und Monatsobergrenze individuell überschreiten; das System zeigt einen Hinweis.']:[])
      ]));
      cards.push(card('recovery','Arbeitsblöcke & Erholung',[
        ['Dienste am Stück',`Max. ${p.maxConsecutiveShifts??4}`],['Nächte am Stück',`Max. ${p.maxConsecutiveNightShifts??3}`],
        ['Zwischen Arbeitsblöcken',`${p.minFreeCalendarDays??2} volle freie Kalendertage`],['Ruhe zwischen Blöcken',`Mind. ${p.minBlockRestHours??48} h`],
        ['Nach Nachtblöcken',`${p.minNightRecoveryCalendarDays??3} volle freie Kalendertage`]
      ],['Vollständig frei: keine Arbeitszeit im Kalendertag, auch kein Nachtübertrag.','Besondere OT-, Teamleiter- und Rhythmusvorgaben stehen in den eigenen Bereichen.']));
      if(core?.otWeekendMinimum?.(p)>0)cards.push(card('ot-weekend','OT · Wochenenden',[['Samstag',`Mindestens ${core.otWeekendMinimum(p)} OT-Mitarbeiter`],['Sonntag',`Mindestens ${core.otWeekendMinimum(p)} OT-Mitarbeiter`]],['Verbindliche Mindestbesetzung je Tag. Die Auto-Planung priorisiert diese Dienste. Eine Übernahme mit fehlender OT-Besetzung ist gesperrt.','Es zählen unterschiedliche Mitarbeiter mit normalem OT-Dienst; OT1 / OT2 / OT3 ersetzen diese Besetzung nicht.']));
      if(hasOT&&p.otOnlyMonthlyMaxHours!=null){
        const roster=core?.otRoster?.(p),rows=[['Dienstlänge','10 h'],['Monatsobergrenze',`${p.otOnlyMonthlyMaxHours} h`],['Je Kalenderwoche',`Max. ${p.otOnlyMaxCalendarWeekHours??p.maxCalendarWeekHours??40} h`],['Dienste am Stück',`Max. ${p.otOnlyMaxConsecutiveShifts??p.maxConsecutiveShifts??4}`],['Zwischen Arbeitsblöcken',`${p.otOnlyMinFreeCalendarDays??p.minFreeCalendarDays??2} volle freie Tage / mind. ${p.otOnlyMinBlockRestHours??p.minBlockRestHours??48} h`]],notes=['Diese Sonderregeln gelten für OT1 / OT2 / OT3. Für normale OT-Dienste gelten die allgemeinen Regeln.'];
        if(roster){rows.push(['Arbeitstage',weekdays(roster.weekdays||[1,2,3,4,5])],['Wochenenden & konfigurierte Feiertage','Frei']);
          if(roster.allowDaysOff)rows.push(['Besetzung pro Werktag',`Mind. ${core.rosterMinimum(p)} Mitarbeiter`]);
          notes.push('OT2 wird bevorzugt. OT1 und OT3 übernehmen fehlende O3- bzw. O1-Abdeckung.');
          notes.push(roster.allowDaysOff?'Die Automatik verteilt zusätzliche freie Tage versetzt, wenn die Abdeckung ausreicht.':'Die feste Tagdienstgruppe wird an jedem regulären Werktag eingeplant.');
        }
        cards.push(card('ot','OT1 / OT2 / OT3',rows,notes));
      }
      if(p.teamLeaderMaxConsecutiveNightShifts!=null){
        const rows=[['Nächte am Stück',`Max. ${p.teamLeaderMaxConsecutiveNightShifts}`]];
        if(p.teamLeaderPreferredNightBlockLength!=null)rows.push(['Bevorzugte Blocklänge · Ziel',`${p.teamLeaderPreferredNightBlockLength} Nächte`]);
        if(p.teamLeaderMinNightRecoveryCalendarDays!=null)rows.push(['Nach Nachtblöcken',`${p.teamLeaderMinNightRecoveryCalendarDays} volle freie Kalendertage / mind. ${p.minBlockRestHours??48} h`]);
        if(p.teamLeaderMinimumMonthlyHours!=null)rows.push(['Erstes Monatsziel',`${p.teamLeaderMinimumMonthlyHours} h, danach Vertrags-SOLL`]);
        cards.push(card('leaders','Teamleiter',rows,['Persönliche niedrigere Grenzen und das Wochenmaximum gelten weiterhin.']));
      }
      const rhythm=[],notes=[],cycle=p.fixedWorkRestCycle;
      if(cycle?.pattern?.length){const runs=[];for(const value of cycle.pattern){const last=runs.at(-1);if(last?.value===value)last.count++;else runs.push({value,count:1})}rhythm.push(['Fester Rhythmus',runs.map(x=>`${x.count} ${x.value==='ALLE'?'Arbeit':x.value==='FREI'?'frei':x.value}`).join(' → ')]);if(cycle.excludeShifts?.length)notes.push(`Ausgenommen: ${cycle.excludeShifts.join(' / ')}.`);}
      if(p.threeNightBlockRecoveryFullCalendarDays!=null){rhythm.push(['Nach genau 3 Nächten',`Schlaftag + ${p.threeNightBlockRecoveryFullCalendarDays} voller freier Tag`],['Nach 4 Nächten',`Schlaftag + ${p.minNightRecoveryCalendarDays??2} volle freie Tage`]);notes.push(`Mindestens ${p.minBlockRestHours??48} h Ruhe bleiben verbindlich.`);}
      if(p.fixedWeeklyRoster){rhythm.push(['Fester Wochendienst',`${weekdays(p.fixedWeeklyRoster.weekdays)} · ${p.fixedWeeklyRoster.code||'laut Vorgabe'}`]);notes.push('Der feste Wochendienst gilt nur für die jeweils hinterlegten Mitarbeiter.');}
      if(rhythm.length)cards.push(card('rhythms','Feste Rhythmen',rhythm,notes));
      const changes=[];
      if(p.preventDescendingShifts)changes.push('Gleiche oder aufsteigende Dienste: OT → O1 → O2 / TL-LE / TL-RE → O3.','Absteigende Wechsel am Folgetag sind gesperrt.');
      else if(p.preventLeaderToO1)changes.push('TL-LE / TL-RE → O1 am Folgetag gesperrt. O1 → TL bleibt möglich.');
      if(changes.length)cards.push(card('changes','Schichtwechsel',[],changes));
      if(p.otDayHolidayExclusion)cards.push(card('holidays','Feiertage',[
        ['Normale OT','Nach Bedarf und Einsatzort'],['OT1 / OT2 / OT3','Keine Einplanung · SOLL 0']
      ],['Die konfigurierten Feiertage für Deutschland, Sachsen und Nordrhein-Westfalen werden berücksichtigt.']));
    }
    cards.push(card('personal','Persönliche Vorgaben',[],[
      'Verbindliche Rhythmen, feste Wochendienste und persönliche Schichtfreigaben werden aus den Mitarbeiterprofilen übernommen.',
      'Niedrigere persönliche Stundenlimits und Abwesenheiten bleiben maßgeblich.',
      ...(p.weekendPlanningByRhythm?['Für andere Mitarbeiter ergeben sich freie Wochenenden aus Rhythmus und Bedarf; es gibt kein zusätzliches Wochenendziel.']:[]),
      'Aktiver Mitarbeiter, passende Freigabe und freie Zeiten werden bei jeder Besetzung geprüft.'
    ]));
    html(el('autoRuleText'),cards.join(''));
  }
  function renderRules(){
    const company=window.SFCompliance?.policy||{},rules=company.solidPlanningRules,core=window.SFSolidPlanningCore,enabled=!!rules?.enabled,confirmed=core?.confirmed(rules),values=[];
    if(confirmed&&rules.monthlyHoursOnly)values.push(`Vollzeit-SOLL ${rules.fullTimeMonthlyTarget??180} h`);
    const month=confirmed?rules.monthlyMaxHours??(rules.monthlyHoursOnly?200:190):Number(company.monthlyPlanningMaxHours);
    if(month>0)values.push(`Automatisch max. ${month} h/Monat`);
    if(confirmed)values.push(`Max. ${rules.maxCalendarWeekHours??40} h/Kalenderwoche`);
    html(el('autoRuleValues'),values.length?values.map(v=>`<span>${esc(v)}</span>`).join(''):'Die hinterlegten Unternehmensregeln gelten.');
    renderRuleCards(rules,company,core,confirmed);
    const goals=el('autoRuleGoals');if(goals)goals.hidden=!enabled;
    if(enabled){const weekends=core?.weekendTarget?.(rules)||0,items=[['Bevorzugter Nachtblock',`${rules.preferredNightBlockLength||3} Nächte`],['Gleichmäßige Belastung',`${rules.rollingWeekTargetHours||40} h als Ziel in rollierenden 7 Tagen`]];if(weekends>0)items.push(['Zusätzliche freie Wochenenden',`${weekends} pro Monat`]);html(el('autoRuleGoalText'),`<dl>${items.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl><p>Diese Ziele werden angestrebt. Abweichungen erscheinen im Planungsergebnis.</p>`);}
  }
  function remainingSlots(slots,preview){
    const keyOf=x=>x.date+'|'+(x.coverageGroup||x.type);
    const counts=new Map();preview.forEach(x=>{const key=keyOf(x);counts.set(key,(counts.get(key)||0)+1)});
    const known=new Map();autoPlanUnresolved.forEach(x=>{const key=keyOf(x);if(!known.has(key))known.set(key,x.reason)});
    return slots.filter(x=>{const key=keyOf(x),n=counts.get(key)||0;if(n){counts.set(key,n-1);return false}return true}).map(x=>({...x,reason:known.get(keyOf(x))||'Für diese Position liegt kein Vorschlag vor. Bitte prüfe die Besetzung im Dienstplan.'}));
  }
  function explain(slot,simulated=[]){
    const {type,date}=slot;
    if(slot.coverageGroup==='OT-DAY')return 'Die feste OT-Tagdienstgruppe ist unvollständig. Abwesenheiten, persönliche Stundenlimits und Ruhezeiten der hinterlegten Mitarbeiter prüfen.';
    if(slot.coverageGroup){const alternatives=slot.alternatives||[type];return `Gemeinsame Leitung ${slot.coverageLabel}: kein verfügbarer TL unter den aktuellen Regeln. `+alternatives.map(code=>`${code}: ${explain({type:code,date},simulated)}`).join(' ')}
    let pool=employees.filter(e=>e.status==='active');
    if(!pool.length)return'Keine aktiven Mitarbeiter vorhanden. Prüfe die Mitarbeiterprofile.';
    pool=pool.filter(e=>(e.shifts||[]).includes(type));
    if(!pool.length)return`Kein aktiver Mitarbeiter hat eine Freigabe für ${(window.SFShiftModels?.label?.(type)||type)}. Prüfe die Schichtfreigaben.`;
    pool=pool.filter(e=>window.SFShiftModels?.allowsEmployee?.(type,e,date)!==false);
    if(!pool.length)return'Für diese Schicht fehlt ein aktiver zuständiger Mitarbeiter mit Schichtfreigabe.';
    pool=pool.filter(e=>!absent(e.id,date));
    if(!pool.length)return'Alle passenden Mitarbeiter sind an diesem Tag abwesend.';
    const all=[...assignments,...simulated];pool=pool.filter(e=>!all.some(a=>String(a.employeeId)===String(e.id)&&a.date===date));
    if(!pool.length)return'Die passenden Mitarbeiter sind an diesem Tag bereits eingeplant.';
    pool=pool.filter(e=>{const r=window.sfRhythmCheck?.(e,type,date);return !r||r.mode!=='required'||r.allowed});
    if(!pool.length)return'Der verbindliche Rhythmus der verfügbaren Mitarbeiter passt an diesem Tag nicht zu dieser Schicht.';
    const timePool=pool.filter(e=>!window.SFAutoPlanGuard||window.SFAutoPlanGuard.passesTimeRules(e.id,type,date,simulated));
    if(!timePool.length)return'Schichtwechsel, Schichtdauer, Ruhezeit, Überschneidung oder das Maximum an Diensten in Folge verhindern die Besetzung. Prüfe die Schichtzeiten und benachbarte Dienste.';
    const cap=Number(window.SFCompliance?.policy?.monthlyPlanningMaxHours)||220,count=Number(window.SFCompliance?.policy?.monthlyPlanningMaxShifts);return `Für die übrigen passenden Mitarbeiter reichen die freien Wochen- oder Monatsstunden nicht aus. Vollzeit: maximal ${cap} Monatsstunden${count?`, höchstens ${count} Schichten pro Monat`:''}; Ziel bleiben die persönlichen Monatsstunden. Bei Teilzeit bleibt das individuelle Monats-SOLL die feste Obergrenze.`;
  }
  function renderSuggestions(){
    const host=el('autoSuggestions');if(!host)return;
    const signature=JSON.stringify([window.SFBackend?.companyId,autoPlanPreview,employees.map(e=>[e.id,e.first,e.last]),TYPES.map(t=>[t.id,t.name])]);
    if(signature===suggestionKey&&host===suggestionHost)return;
    suggestionKey=signature;suggestionHost=host;
    const people=new Map(employees.map(e=>[String(e.id),e])),groups=new Map();autoPlanPreview.forEach((x,i)=>{if(!groups.has(x.date))groups.set(x.date,[]);groups.get(x.date).push({...x,index:i})});
    const previous=[...(host.querySelectorAll?.('details[data-auto-day]')||[])],openDates=new Set(previous.filter(x=>x.open).map(x=>x.dataset.autoDay)),sameDays=previous.some(x=>groups.has(x.dataset.autoDay));
    const body=list=>list.map(x=>{const e=people.get(String(x.employeeId));return `<div class="sf-auto-suggestion-row"><div class="sf-auto-shift"><b>${esc(shiftLabel(x.type))}</b><small>${esc(x.start)}–${esc(x.end)} Uhr</small></div><div class="sf-auto-person"><b>${esc(e?e.first+' '+e.last:'Mitarbeiter')}</b><small>${esc(x.reason)}</small></div><button type="button" class="ghost" data-sf-click="click-7ad8be672d93" data-sf-click-arg0="${encodeURIComponent(String(x.index))}" title="${x.blockId?'Gesamten Arbeitsblock entfernen':'Einzelnen Vorschlag entfernen'}" aria-label="Vorschlag für ${esc(e?e.first+' '+e.last:'Mitarbeiter')} am ${esc(x.date)} entfernen">Entfernen</button></div>`}).join('');
    html(host,groups.size?[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([date,list],n)=>{const open=sameDays?openDates.has(date):n===0;return `<details class="sf-auto-day" data-auto-day="${esc(date)}" ${open?'open':''}><summary><b>${esc(dateLabel(date))}</b><span>${list.length} Besetzung${list.length===1?'':'en'}</span></summary><div class="sf-auto-day-list" data-loaded="${open?'1':'0'}">${open?body(list):''}</div></details>`}).join(''):'<div class="sf-auto-empty"><b>Keine Besetzung vorgeschlagen</b><p>Die offenen Positionen und ihre Gründe findest du unter „Noch zu besetzen“.</p></div>');
    (host.querySelectorAll?.('details[data-auto-day]')||[]).forEach(node=>{node.sfAutoFill=()=>{const target=node.querySelector('.sf-auto-day-list');if(target&&target.dataset.loaded!=='1'){html(target,body(groups.get(node.dataset.autoDay)||[]));target.dataset.loaded='1'}};node.ontoggle=()=>{if(node.open)node.sfAutoFill()}});
  }
  const hoursLabel=value=>Number(value.toFixed(2)).toLocaleString('de-DE',{maximumFractionDigits:2})+' h';
  function draftHours(dates,people,all){
    const selected=new Set(dates),monthly=el('autoPlanPeriod')?.value==='month',months=new Set(dates.map(d=>d.slice(0,7))).size,totals=new Map();
    for(const a of all){if(!selected.has(a.date))continue;const key=String(a.employeeId),row=totals.get(key)||{duties:0,planned:0};row.duties++;row.planned+=plannedAssignmentHours(a);totals.set(key,row)}
    return people.map(e=>{const {duties,planned}=totals.get(String(e.id))||{duties:0,planned:0},target=monthly?employeeMonthlyTarget(e)*months:(Number(e.weeklyHours)||0)*dates.length/7;return {e,duties,planned,target,difference:planned-target}});
  }
  function staffingRows(dates,all,head){
    const active=all.filter(a=>a.status!=='CANCELLED'&&a._dbStatus!=='CANCELLED'),counts=new Map(),groups=new Map();
    for(const a of active){const key=a.date+'|'+a.type;if(!counts.has(key))counts.set(key,new Set());counts.get(key).add(String(a.employeeId))}
    const cell=(date,label,ist,soll)=>{const state=ist<soll?'is-short':ist>soll?'is-extra':'is-balanced';return `<td class="sf-auto-staffing-cell ${state}" title="${esc(dateLabel(date)+' · '+label+' · IST '+ist+' / SOLL '+soll)}"><b>IST ${ist}</b><small>SOLL ${soll}</small></td>`};
    const order=['TL-LE','TL-RE','OT1','OT2','OT3','O1','O2','O3','OT','QA','TR'];
    const rows=TYPES.map((t,index)=>{const rank=order.includes(t.id)?order.indexOf(t.id):order.length+index;const group=window.SFShiftModels?.coverageGroup?.(t.id);if(group){const previous=groups.get(group.key);groups.set(group.key,{code:previous?.code||t.id,rank:Math.max(previous?.rank??-1,rank)});}return {rank,html:`<tr data-staffing-shift="${esc(t.id)}"><th scope="row">${esc(shiftLabel(t.id))}${group?`<small>Bedarf gemeinsam: ${esc(group.label)}</small>`:''}</th>${dates.map(date=>{const ist=counts.get(date+'|'+t.id)?.size||0;if(group)return `<td class="sf-auto-staffing-cell" title="${esc(dateLabel(date)+' · '+shiftLabel(t.id)+' · gemeinsamer Bedarf '+group.label)}"><b>IST ${ist}</b><small>SOLL gemeinsam</small></td>`;const raw=getSoll(date,t.id),soll=window.SFShiftModels?.requiredSoll?.(date,t.id,raw,autoPlanPreview)??raw;return cell(date,shiftLabel(t.id),ist,Number(soll)||0)}).join('')}</tr>`}});
    const shared=[...groups].map(([key,{code,rank}])=>({rank:rank+.5,html:`<tr class="sf-auto-staffing-shared" data-staffing-group="${esc(key)}"><th scope="row">${esc(key)} · gemeinsam<small>Schichtalternativen zusammen</small></th>${dates.map(date=>{const g=window.SFShiftModels.coverageInfo(date,code,autoPlanPreview);return cell(date,key,g.filled,g.target)}).join('')}</tr>`}));
    return `<tbody class="sf-auto-staffing"><tr class="sf-auto-staffing-head"><th scope="row">Besetzung je Schicht<small>IST / SOLL · Mitarbeiter</small></th>${head}</tr>${[...rows,...shared].sort((a,b)=>a.rank-b.rank).map(row=>row.html).join('')}</tbody>`;
  }
  function renderStaircase(dates=autoPlanningDates()){
    const host=el('autoStaircase');if(!host)return;
    const all=[...assignments,...autoPlanPreview],months=[...new Set(dates.map(d=>d.slice(0,7)))];
    if(!months.includes(stairMonth))stairMonth=months[0];
    const shown=months.length>1?dates.filter(d=>d.startsWith(stairMonth)):dates,days=new Map(),phases=new Map();
    for(const a of all){const key=String(a.employeeId)+'|'+a.date;if(!days.has(key))days.set(key,a)}
    const phase=e=>{if(!phases.has(e.id)){const r=window.SFRhythm?.check(e,'O1',dates[0]),rule=window.SFRhythm?.config(e);phases.set(e.id,rule&&!rule.team&&rule.pattern.includes('ALLE')&&Number.isInteger(r?.index)?(rule.pattern.length-r.index)%rule.pattern.length:999)}return phases.get(e.id)};
    const ordered=window.SFScheduleEmployeeDisplay?.orderEnabled?.()??window.SFScheduleEmployeeDisplay?.enabled();
    const people=employees.filter(e=>e.status==='active'&&!e.deletedAt).sort((a,b)=>ordered?window.SFScheduleEmployeeDisplay.compare(a,b):phase(a)-phase(b)||String(a.personnelNo||a.last).localeCompare(String(b.personnelNo||b.last),'de',{numeric:true}));
    const rows=draftHours(dates,people,all),monthly=el('autoPlanPeriod')?.value==='month',planned=rows.reduce((n,r)=>n+r.planned,0),target=rows.reduce((n,r)=>n+r.target,0),duties=rows.reduce((n,r)=>n+r.duties,0),staffed=rows.filter(r=>r.duties).length;
    const scope=monthly&&months.length===1?'Monats':'Zeitraum',head=shown.map(d=>`<th scope="col" title="${esc(dateLabel(d))}">${Number(d.slice(-2))}<small>${esc(weekdayFormatter.format(new Date(d+'T12:00:00')))}</small></th>`).join('');
    html(host,`<div class="sf-auto-draft-summary" aria-label="Entwurf zusammengefasst"><span><b>${staffed} / ${people.length}</b> Mitarbeiter eingeplant</span><span><b>${duties}</b> ${duties===1?'Dienst':'Dienste'}</span><span><b>${hoursLabel(planned)}</b> Plan-IST</span><span><b>${hoursLabel(target)}</b> ${scope}-SOLL</span></div><p class="sf-auto-draft-note">Plan-IST = geplante Stunden einschließlich dieses Vorschlags. Differenz = Plan-IST minus ${scope}-SOLL; keine erfassten Arbeitszeiten.</p>${months.length>1?`<div class="sf-auto-preview-nav"><label>Monat in der Planvorschau <select aria-label="Monat in der Planvorschau" data-sf-change="change-8b4a4168b2ab">${months.map(m=>`<option value="${esc(m)}" ${m===stairMonth?'selected':''}>${esc(monthFormatter.format(new Date(m+'-01T12:00:00')))}</option>`).join('')}</select></label><p>Die Gesamtwerte gelten für den vollständigen Planungszeitraum. Die Tabelle zeigt den ausgewählten Monat.</p></div>`:''}<div class="sf-auto-stair-scroll" tabindex="0" aria-label="Treppenmuster horizontal scrollen"><table class="sf-auto-stair-table"><caption>${esc(autoPeriodLabel(shown))} · Schichtcode: besetzt · –: Rhythmusfrei · ○: Arbeitstag ohne Dienst · Abw.: abwesend</caption><thead><tr><th scope="col">Mitarbeiter</th>${head}</tr></thead><tbody>${rows.map(({e,duties,planned,target,difference})=>`<tr data-auto-employee="${esc(e.id)}"><th scope="row" style="${window.SFScheduleEmployeeDisplay?.style(e)||''}"><span class="sf-auto-draft-person">${esc(e.personnelNo||'')} · ${esc(e.first+' '+e.last)}</span><span class="sf-auto-draft-metrics"><span>${duties} ${duties===1?'Dienst':'Dienste'}</span><span>Plan-IST <b>${hoursLabel(planned)}</b></span><span>SOLL <b>${hoursLabel(target)}</b></span><span class="sf-auto-draft-balance ${difference<-.005?'is-short':difference>.005?'is-extra':'is-balanced'}" title="Plan-IST minus SOLL">Differenz <b>${difference>.005?'+':''}${hoursLabel(difference)}</b></span></span></th>${shown.map(d=>{const a=days.get(String(e.id)+'|'+d),r=window.SFRhythm?.check(e,'O1',d),away=absent(e.id,d),free=r?.mode==='required'&&r.expected==='FREI',work=r?.mode==='required'&&r.expected==='ALLE',value=a?a.type:away?'Abw.':free?'–':work?'○':'·',state=a?'assigned':away?'absent':free?'free':work?'work':'empty',title=a?`${(window.SFShiftModels?.label?.(a.type)||a.type)} · ${a.start||typeById(a.type)?.start}–${a.end||typeById(a.type)?.end}`:away?'Abwesend':free?'Verbindlicher freier Tag':work?'Arbeitstag ohne Dienst: Besetzung nach Bedarf und Stundenlimits':'Kein Dienst vorgesehen';return`<td class="is-${state}" title="${esc(d+' · '+e.first+' '+e.last+' · '+title)}">${esc(value)}</td>`}).join('')}</tr>`).join('')}</tbody>${staffingRows(shown,all,head)}</table></div><p class="sf-auto-draft-note">Besetzungs-IST = eingeplante Mitarbeiter einschließlich Vorschlägen; SOLL = Pflichtbedarf. Optionale Schichten dürfen bei SOLL 0 frei bleiben. Gemeinsamer Bedarf wird in der Summenzeile der Schichtalternativen geprüft.</p>`);
  }
  function renderUnresolved(remaining){
    const grouped=new Map();remaining.forEach(x=>{const key=x.date+'|'+x.type+'|'+x.reason;if(!grouped.has(key))grouped.set(key,{...x,count:0});grouped.get(key).count++});
    const list=[...grouped.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.type.localeCompare(b.type)),key=JSON.stringify([window.SFBackend?.companyId,list]);
    if(key!==unresolvedKey){unresolvedKey=key;unresolvedPage=0}
    const size=60,pages=Math.ceil(list.length/size);unresolvedPage=Math.max(0,Math.min(unresolvedPage,pages-1));
    html(el('autoUnresolved'),list.length?`${pages>1?`<div class="sf-auto-preview-nav" aria-label="Offene Positionen durchblättern"><span>Seite ${unresolvedPage+1} von ${pages} · ${list.length} Schichtgruppen</span><button type="button" class="ghost" data-sf-click="click-0268814d6fd6" ${unresolvedPage===0?'disabled':''}>Zurück</button><button type="button" class="ghost" data-sf-click="click-edb4d32093fc" ${unresolvedPage===pages-1?'disabled':''}>Weiter</button></div>`:''}${list.slice(unresolvedPage*size,(unresolvedPage+1)*size).map(x=>`<div class="sf-auto-unresolved-row"><div><b>${esc(dateLabel(x.date))} · ${esc(x.coverageLabel||shiftLabel(x.type))}</b><span class="sf-auto-needed">${x.count} Position${x.count===1?'':'en'} offen</span><p>${esc(x.reason)}</p>${window.SFPlanningReview?.slotMarkup(x)||''}</div><button type="button" class="ghost" data-auto-date="${esc(x.date)}" data-sf-click="click-1cb69e027894">Im Dienstplan prüfen</button></div>`).join('')}`:'<div class="sf-auto-empty is-good"><b>Alle offenen Positionen haben einen Vorschlag.</b><p>Prüfe die Besetzungen und übernimm sie anschließend als Entwurf.</p></div>');
  }
  function render(){
    if(!el('view-auto')||window.SFAutoPlanProgress?.isBusy())return;
    renderRules();
    const dates=syncAutoPeriodControls(),counts=autoAssignmentCounts(),slots=autoOpenSlots(dates,counts),remaining=remainingSlots(slots,autoPlanPreview),analyzed=autoPlanAnalyzed,applied=autoPlanApplied||0,label=autoPeriodLabel(dates),count=autoPlanPreview.length,published=autoPlanPreview.some(x=>window.SFCompliance?.isWeekPublished?.(x.date));
    const available=employees.filter(e=>e.status==='active'&&!dates.every(d=>absent(e.id,d))).length;
    text('autoPeriodDates',dates.length===1?'1 Planungstag':`${new Date(dates[0]+'T12:00:00').toLocaleDateString('de-DE')} bis ${new Date(dates.at(-1)+'T12:00:00').toLocaleDateString('de-DE')} · ${dates.length} Tage`);
    text('autoStartTitle',label);text('autoStartHint',slots.length?`${slots.length} offene Position${slots.length===1?'':'en'} im gewählten Zeitraum. Bestehende Besetzungen bleiben erhalten.`:'Keine offenen Positionen im gewählten Zeitraum.');
    const optionalSlots=typeof autoOptionalSlots==='function'?autoOptionalSlots(dates,counts):[];
    if(optionalSlots.length)text('autoStartHint',`${slots.length} offene Pflichtpositionen · ${optionalSlots.length} optionale Besetzungen. Pflichtdienste haben Vorrang.`);
    el('generateAutoPlanBtn').disabled=(!slots.length&&!optionalSlots.length)||autoPlanApplying;
    el('generateAutoPlanBtn').textContent=analyzed?'↻ Vorschläge neu erstellen':'✦ Vorschläge erstellen';
    const stats=[['Offene Positionen',slots.length,'im gewählten Zeitraum'],['Vorschläge',analyzed?count:'–',analyzed?'zur Prüfung bereit':'Analyse noch nicht gestartet'],['Noch zu besetzen',analyzed?remaining.length:'–',analyzed?'nach diesen Vorschlägen':'wird bei der Analyse geprüft'],['Verfügbare Profile',available,'aktive Mitarbeiter ohne durchgehende Abwesenheit']];
    html(el('autoStats'),stats.map(([title,value,note])=>`<div class="stat"><small>${esc(title)}</small><strong>${esc(value)}</strong><em>${esc(note)}</em></div>`).join(''));
    let title,copy,tone='';
    if(applied){title=`${applied} Besetzung${applied===1?'':'en'} als Entwurf übernommen`;copy=remaining.length?`${remaining.length} Positionen sind noch offen. Prüfe sie im Dienstplan oder erstelle weitere Vorschläge.`:'Der Zeitraum ist vollständig besetzt. Prüfe den Dienstplan und veröffentliche ihn, wenn alles passt.';tone='is-good'}
    else if(!slots.length){title=analyzed&&count?`${count} optionale Besetzung${count===1?'':'en'} vorgeschlagen`:optionalSlots.length?'Optionale Besetzung möglich':'Keine offenen Positionen';copy=analyzed?'Alle Pflichtpositionen sind abgedeckt. Nicht vorgeschlagene optionale Schichten dürfen frei bleiben.':'Für diesen Zeitraum ist keine zusätzliche Pflichtbesetzung erforderlich. Optionale Schichten werden bei freien Kapazitäten vorgeschlagen.';tone='is-good'}
    else if(!analyzed){title='Bereit für deinen Planungsvorschlag';copy='Starte „Vorschläge erstellen“. Anschließend siehst du passende Besetzungen und die Gründe für offene Positionen.'}
    else if(count){title=`${count} Besetzung${count===1?'':'en'} vorgeschlagen`;copy=remaining.length?`${remaining.length} Positionen benötigen noch deine Prüfung. Die Vorschläge kannst du einzeln entfernen oder als Entwurf übernehmen.`:'Für alle offenen Positionen gibt es einen Vorschlag. Prüfe die Mitarbeiterzuordnung und übernimm die Besetzungen als Entwurf.';tone=remaining.length?'is-warning':'is-good'}
    else{title='Für die offenen Positionen wurde kein passender Mitarbeiter gefunden';copy='Unter „Noch zu besetzen“ siehst du die Gründe. Prüfe dort die Profile, den Rhythmus oder bereits geplante Dienste.';tone='is-warning'}
    html(el('autoAnalysis'),`<div class="sf-auto-status ${tone}"><b>${esc(title)}</b><p>${esc(copy)}</p></div>`);
    text('autoReviewHint',analyzed?`${label} · Ergebnis der aktuellen Planung`:'Die Zahlen für Vorschläge und verbleibende Positionen erscheinen nach der Analyse.');
    el('autoResults').hidden=!analyzed||!!applied;
    if(analyzed)renderStaircase(dates);
    text('autoSuggestionCount',count);text('autoUnresolvedCount',remaining.length);
    if(analyzed&&!applied){renderSuggestions();renderUnresolved(remaining);const skipped=typeof autoPlanOptionalSkipped==='undefined'?[]:autoPlanOptionalSkipped;let optional=el('autoOptionalSkipped');if(!optional&&el('autoSuggestions')?.after&&document.createElement){optional=document.createElement('div');optional.id='autoOptionalSkipped';el('autoSuggestions').after(optional)}if(optional)html(optional,skipped.length?`<details class="sf-auto-day"><summary><b>Optional frei geblieben (${skipped.length})</b></summary>${skipped.map(x=>`<div class="sf-auto-unresolved-row"><div><b>${esc(dateLabel(x.date))} · ${esc(shiftLabel(x.type))} · Optional</b><p>${esc(x.reason)} Keine Pflichtlücke.</p></div></div>`).join('')}</details>`:'');if(!count&&remaining.length)el('autoUnresolvedPanel').open=true}
    el('applyAutoPlanBtn').disabled=!count||autoPlanApplying||published;el('applyAutoPlanBtn').textContent=count?`${count} Vorschlag${count===1?'':'e'} als Entwurf übernehmen`:'Vorschläge als Entwurf übernehmen';
    el('clearAutoPlanBtn').disabled=(!count&&!autoPlanUnresolved.length&&!(typeof autoPlanOptionalSkipped!=='undefined'&&autoPlanOptionalSkipped.length))||autoPlanApplying;
    text('autoApplyHint',published?'Ein Vorschlag betrifft eine bereits veröffentlichte Woche. Bitte prüfe solche Änderungen einzeln im Dienstplan.':applied?'Dein Entwurf ist im Dienstplan. Dort prüfst und veröffentlichst du die Schichten für deine Mitarbeiter.':'Übernommene Vorschläge werden als Entwurf gespeichert. Im Dienstplan gibst du sie anschließend für die Mitarbeiter frei.');
    document.querySelectorAll('[data-auto-step]').forEach(node=>{const step=Number(node.dataset.autoStep),current=applied?4:analyzed?3:1;node.classList.toggle('is-current',step===current);if(step===current)node.setAttribute('aria-current','step');else node.removeAttribute('aria-current')});
    window.SFOpenShiftMarket?.renderPublishEntry?.({analyzed,applied,count,remaining});
  }
  function openSchedule(date){
    if(date){weekStart=autoMonday(date);window.SchichtFunkCalendarView?.setMode?.('week')}
    // General return preserves the current calendar period; explicit issue dates still navigate.
    if(window.showView)window.showView('schedule');else switchView('schedule');
  }
  function startApply(count){
    const paint=()=>new Promise(resolve=>setTimeout(resolve,24));
    if(!document.createElement)return {paint,phase(){},update(){},finish(){}};
    const focused=document.activeElement,locked=[...document.querySelectorAll('#appShell button,#appShell input,#appShell select,#appShell textarea')].map(node=>({node,disabled:node.disabled}));
    locked.forEach(x=>x.node.disabled=true);
    const back=document.createElement('div');back.className='sf-auto-confirm-back';
    back.innerHTML='<section class="sf-auto-confirm sf-auto-apply" role="dialog" aria-modal="true" aria-labelledby="sfAutoApplyTitle" aria-busy="true"><div class="eyebrow">SCHICHTFUNK · ENTWURF</div><h2 id="sfAutoApplyTitle" tabindex="-1">Vorschläge werden übernommen</h2><ol class="sf-auto-apply-steps"><li>Vorschläge prüfen</li><li>Entwurf speichern</li><li>Dienstplan aktualisieren</li></ol><div class="sf-auto-apply-track" role="progressbar" aria-label="Übernahme läuft"><i></i></div><p id="sfAutoApplyDetail" role="status" aria-live="polite"></p><small id="sfAutoApplyTime"></small><p id="sfAutoApplyWait">Bitte warten und diese Seite geöffnet lassen.</p><footer hidden><button type="button" class="ghost" data-close>Schließen</button><button type="button" class="primary" data-schedule>Dienstplan öffnen</button></footer></section>';
    document.body.appendChild(back);
    const panel=back.firstElementChild,title=back.querySelector('h2'),detail=back.querySelector('#sfAutoApplyDetail'),track=back.querySelector('[role="progressbar"]'),steps=[...back.querySelectorAll('li')],footer=back.querySelector('footer'),close=back.querySelector('[data-close]'),schedule=back.querySelector('[data-schedule]'),started=Date.now();let done=false;
    const elapsed=()=>{const s=Math.floor((Date.now()-started)/1000);back.querySelector('#sfAutoApplyTime').textContent='Vergangen: '+(s<60?s+' s':Math.floor(s/60)+' min '+s%60+' s');};
    const timer=setInterval(elapsed,1000);
    const dismiss=()=>{document.removeEventListener('keydown',key);back.remove();if(focused?.isConnected&&!focused.disabled)focused.focus();else el('autoOpenScheduleBtn')?.focus();};
    const key=e=>{if(!back.isConnected)return;if(e.key==='Escape'){e.preventDefault();if(done)dismiss()}else if(e.key==='Tab'){if(!done){e.preventDefault();title.focus()}else if(e.shiftKey&&document.activeElement===close){e.preventDefault();(schedule.hidden?close:schedule).focus()}else if(!e.shiftKey&&document.activeElement===(schedule.hidden?close:schedule)){e.preventDefault();close.focus()}}};
    document.addEventListener('keydown',key);close.onclick=dismiss;schedule.onclick=()=>{dismiss();openSchedule()};title.focus();
    const phase=(stage,copy)=>{steps.forEach((node,i)=>{node.classList.toggle('is-current',i===stage);node.classList.toggle('is-done',i<stage);if(i===stage)node.setAttribute('aria-current','step');else node.removeAttribute('aria-current')});detail.textContent=copy;};
    phase(0,count+' Vorschläge werden auf Verfügbarkeit, Stunden und Schichtregeln geprüft.');elapsed();
    return {paint,phase,update:n=>{detail.textContent=n+' von '+count+' Vorschlägen geprüft.';},finish:({error,saved=false,copy}={})=>{if(done)return;done=true;clearInterval(timer);elapsed();locked.forEach(x=>x.node.disabled=x.disabled);panel.removeAttribute('aria-busy');panel.classList.toggle('is-error',!!error);track.hidden=true;back.querySelector('#sfAutoApplyWait').hidden=true;footer.hidden=false;schedule.hidden=!!error&&!saved;title.textContent=error?(saved?'Entwurf gespeichert – Ansicht prüfen':'Übernahme nicht abgeschlossen'):'Entwurf übernommen';if(!error)phase(3,count+' Besetzungen wurden als Entwurf übernommen. Die Veröffentlichung erfolgt gesondert im Dienstplan.');if(copy||error)detail.textContent=copy||error;close.focus();}};
  }
  function confirmApply(count){
    const monthly=window.SFMonthOptimizer?.getResult?.(),focused=document.activeElement,locked=[...document.querySelectorAll('#view-auto button,#view-auto input,#view-auto select')].map(node=>({node,disabled:node.disabled}));locked.forEach(x=>x.node.disabled=true);
    return new Promise(resolve=>{
      const back=document.createElement('div');back.className='sf-auto-confirm-back';back.innerHTML=`<section class="sf-auto-confirm" role="dialog" aria-modal="true" aria-labelledby="sfAutoConfirmTitle"><div class="eyebrow">SCHICHTFUNK · AUTO-PLANUNG</div><h2 id="sfAutoConfirmTitle">${monthly?'Monatsentwürfe durch die optimierte Verteilung ersetzen?':'Vorschläge in den Dienstplan übernehmen?'}</h2><p><b>${count} Besetzung${count===1?'':'en'}</b> für <b>${esc(autoPeriodLabel())}</b>.</p>${monthly?`<p><b>${monthly.movable.length} bisherige flexible Entwürfe</b> werden ersetzt. Feste und geschützte Dienste bleiben erhalten.</p>`:''}<div class="sf-auto-status"><b>Als Entwurf speichern</b><p>Du kannst die Schichten anschließend im Dienstplan prüfen. Die Mitarbeiter sehen sie erst nach deiner Veröffentlichung.</p></div><footer><button type="button" class="ghost" data-cancel>Abbrechen</button><button type="button" class="primary" data-accept>Als Entwurf übernehmen</button></footer></section>`;
      document.body.appendChild(back);const cancel=back.querySelector('[data-cancel]'),accept=back.querySelector('[data-accept]');
      const done=value=>{document.removeEventListener('keydown',key);back.remove();locked.forEach(x=>x.node.disabled=x.disabled);if(focused?.isConnected)focused.focus();resolve(value)};
      const key=e=>{if(e.key==='Escape'){e.preventDefault();done(false)}else if(e.key==='Tab'){if(e.shiftKey&&document.activeElement===cancel){e.preventDefault();accept.focus()}else if(!e.shiftKey&&document.activeElement===accept){e.preventDefault();cancel.focus()}}};
      cancel.onclick=()=>done(false);accept.onclick=()=>done(true);back.onclick=e=>{if(e.target===back)done(false)};document.addEventListener('keydown',key);cancel.focus();
    });
  }
  window.SFAutoPlanWorkspace={render,explain,remainingSlots,openSchedule,confirmApply,startApply,stairMonth:value=>{stairMonth=value;renderAutoPlanning()},unresolvedPage:delta=>{unresolvedPage+=delta;renderAutoPlanning()},expandDays:open=>document.querySelectorAll('#autoSuggestions details').forEach(x=>{if(open)x.sfAutoFill?.();x.open=open})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
})();

// Read-only diagnostics and comparisons. This module never changes roster assignments.
(function(){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const el=id=>document.getElementById(id),active=a=>a.status!=='CANCELLED'&&a._dbStatus!=='CANCELLED',company=()=>String(window.SFBackend?.companyId||'');
  const same=(a,b)=>String(a)===String(b),hours=n=>Number(n||0).toLocaleString('de-DE',{maximumFractionDigits:2})+' h';
  const person=e=>[e.personnelNo,e.last&&e.first?e.last+', '+e.first:e.last||e.first||'Mitarbeiter'].filter(Boolean).join(' · ');
  const withRows=(rows,fn)=>{const old=assignments;try{assignments=rows;return fn()}finally{assignments=old}};
  const people=()=>employees.filter(e=>e.status==='active'&&!e.deletedAt),prepared=()=>window.SFMonthOptimizer?.getResult?.();
  function normalize(rows,dates){const selected=new Set(dates);return rows.filter(a=>active(a)&&selected.has(a.date)).map(a=>{const t=typeById(a.type);return{employeeId:String(a.employeeId),date:a.date,type:a.type,start:a.start||t?.start||'',end:a.end||t?.end||'',hours:Number(plannedAssignmentHours(a))||0}});}
  const rowKey=a=>[a.employeeId,a.date,a.type,a.start,a.end].join('|');
  function missing(rows,targets){const totals=new Map();for(const a of rows)totals.set(a.employeeId,(totals.get(a.employeeId)||0)+a.hours);return targets.reduce((n,[id,target])=>n+Math.max(0,target-(totals.get(id)||0)),0);}
  function snapshot(rows,dates,openCount){const normal=normalize(rows,dates),months=new Set(dates.map(d=>d.slice(0,7))).size,targets=people().map(e=>[String(e.id),employeeMonthlyTarget(e)*months]);return{version:1,company:company(),dates:dates.slice(),rows:normal,targets,openCount:Number(openCount)||0};}
  function compare(before,afterRows,dates,openCount){
    if(before?.version!==1||before.company!==company()||JSON.stringify(before.dates)!==JSON.stringify(dates))return null;
    const after=normalize(afterRows,dates),buckets=new Map();for(const a of after){const k=rowKey(a);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(a);}
    const removed=[];let unchanged=0;for(const a of before.rows){const list=buckets.get(rowKey(a));if(list?.length){list.pop();unchanged++;}else removed.push(a);}
    const added=[...buckets.values()].flat(),changes=[...removed.map(a=>({kind:'removed',row:a})),...added.map(a=>({kind:'added',row:a}))].sort((a,b)=>a.row.date.localeCompare(b.row.date)||a.row.employeeId.localeCompare(b.row.employeeId)||a.kind.localeCompare(b.kind));
    return{openBefore:before.openCount,openAfter:Number(openCount)||0,missingBefore:missing(before.rows,before.targets),missingAfter:missing(after,before.targets),unchanged,removed:removed.length,added:added.length,changes};
  }
  let cached=null;
  function context(){
    const result=prepared(),rows=[...(result?.base||assignments),...autoPlanPreview].filter(active).map(a=>{const t=typeById(a.type);return{...a,start:a.start||t?.start,end:a.end||t?.end}}),dates=autoPlanningDates(),policy=window.SFCompliance?.policy;
    const key=JSON.stringify([company(),dates,rows,employees,TYPES,policy,typeof absences==='undefined'?[]:absences,typeof globalSoll==='undefined'?{}:globalSoll,typeof dailySoll==='undefined'?{}:dailySoll,window.SFShiftModels?.models,window.SFWishPlanning?.signature?.()]);if(cached?.key===key)return cached;
    const slots=withRows(rows,()=>autoOpenSlots(dates)),grouped=new Map();for(const slot of slots){const k=slot.date+'|'+(slot.coverageGroup||slot.type);if(!grouped.has(k))grouped.set(k,{...slot,positions:0});grouped.get(k).positions++;}
    cached={key,rows,dates,policy,slots:[...grouped.values()],people:people().sort((a,b)=>person(a).localeCompare(person(b),'de',{numeric:true})),checks:new Map()};return cached;
  }
  function evaluate(e,slot,ctx=context()){
    const alternatives=slot.alternatives||[slot.type],attempts=[];let incomplete=false;
    for(const type of alternatives){const t=typeById(type),reasons=[];
      if(!t||t.active===false){attempts.push({type,reasons:['Schichtmodell ist nicht aktiv.']});continue;}
      if(!(e.shifts||[]).includes(type))reasons.push('Keine persönliche Freigabe für '+type+'.');
      if(slot.coverageGroup==='OT-DAY'&&window.SFSolidPlanningCore?.rosterEmployee(e,ctx.policy?.solidPlanningRules)!==true)reasons.push('Diese Position gehört zur fest hinterlegten OT-Tagdienstgruppe.');
      if(e.startDate&&slot.date<e.startDate||e.contractEnd&&slot.date>e.contractEnd)reasons.push('Außerhalb des Beschäftigungszeitraums.');
      if(absent(e.id,slot.date))reasons.push('Abwesenheit oder gesperrter Tag.');
      if(ctx.rows.some(a=>same(a.employeeId,e.id)&&a.date===slot.date))reasons.push('An diesem Tag bereits mit einem Dienst belegt.');
      const restriction=window.SFShiftModels?.planningRestriction?.(type,e,slot.date,t.start,t.end);if(restriction)reasons.push(restriction);
      else if(window.SFShiftModels?.allowsEmployee?.(type,e,slot.date)===false)reasons.push('Für diese Schicht oder diesen Einsatzort nicht zuständig.');
      const rhythm=window.sfRhythmCheck?.(e,type,slot.date);if(rhythm?.mode==='required'&&!rhythm.allowed)reasons.push(rhythm.reason||'Verbindlicher Rhythmus sieht diesen Dienst nicht vor.');
      if(!reasons.length){
        const candidate={employeeId:e.id,date:slot.date,type,start:t.start,end:t.end},all=[...ctx.rows,candidate],C=window.SFCompliance,S=window.SFSolidPlanningCore;
        try{withRows(ctx.rows,()=>{
          if(C?.check)reasons.push(...(C.check(e,type,slot.date,t.start,t.end).hard||[]));
          if(C?.monthPlanningCheck){const months=new Set([slot.date.slice(0,7)]);if(S){const iv=S.interval(slot.date,t.start,t.end,ctx.policy?.solidPlanningRules?.timezone);months.add(S.localDate(iv.end-1,ctx.policy?.solidPlanningRules||{}).slice(0,7));}for(const month of months)reasons.push(...C.monthPlanningCheck(e,month+'-01',all));}
          if(S&&ctx.policy?.solidPlanningRules?.enabled)reasons.push(...S.errors(e,all,ctx.policy.solidPlanningRules,[slot.date]).map(x=>x.message));
          const limits=autoHourLimits(e),own=ctx.rows.filter(a=>same(a.employeeId,e.id)&&a.date.startsWith(slot.date.slice(0,7))),planned=own.reduce((n,a)=>n+plannedAssignmentHours(a),0);
          if(planned+plannedAssignmentHours(candidate)>limits.monthLimit+.000001)reasons.push('Automatische Monatsobergrenze '+hours(limits.monthLimit)+' würde überschritten.');
          if(limits.maxMonthlyShifts&&own.filter(a=>!S?.confirmed(ctx.policy?.solidPlanningRules)||S.countsTowardCap(a)).length>=limits.maxMonthlyShifts)reasons.push('Maximale automatische Dienstanzahl erreicht.');
          if(!S?.confirmed(ctx.policy?.solidPlanningRules)&&el('autoRespectHours')?.checked!==false&&limits.weeklyLimit>0&&autoPlannedHours(e.id,[],slot.date)+plannedAssignmentHours(candidate)>limits.weeklyLimit+.000001)reasons.push('Wochenmaximum '+hours(limits.weeklyLimit)+' würde überschritten.');
          if(window.SFAutoPlanGuard&&!window.SFAutoPlanGuard.passesTimeRules(e.id,type,slot.date)){const reason=window.SFAutoPlanGuard.transitionConflict?.(e.id,type,slot.date);reasons.push(reason||'Schichtfolge, Ruhezeit oder Dienstblock ist für diese Ergänzung nicht zulässig.');}
          if(!C?.check&&!window.SFAutoPlanGuard&&!S)incomplete=true;
        });}catch{incomplete=true;reasons.push('Die Regelprüfung ist unvollständig. Bitte Daten neu laden.');}
      }
      attempts.push({type,reasons:[...new Set(reasons)]});
    }
    const possible=attempts.filter(a=>!a.reasons.length).map(a=>a.type);return{employeeId:String(e.id),name:person(e),status:incomplete?'unknown':possible.length?'review':'blocked',possible,reasons:possible.length?[]:attempts.flatMap(a=>a.reasons.map(reason=>(attempts.length>1?a.type+': ':'')+reason))};
  }
  function cachedCheck(e,slot,ctx){const key=String(e.id)+'|'+slot.date+'|'+(slot.coverageGroup||slot.type);if(!ctx.checks.has(key))ctx.checks.set(key,evaluate(e,slot,ctx));return ctx.checks.get(key);}
  const slotMarkup=slot=>`<details class="sf-plan-diagnostic" data-plan-slot="${esc(encodeURIComponent(JSON.stringify({date:slot.date,type:slot.type,alternatives:slot.alternatives,coverageGroup:slot.coverageGroup})))}"><summary>Passende Mitarbeiter und konkrete Hinderungsgründe prüfen</summary><div data-plan-body></div></details>`;
  const hoursMarkup=(e,value)=>value>0?`<details class="sf-plan-diagnostic" data-plan-person="${esc(e.id)}"><summary>Warum fehlen Stunden?</summary><div data-plan-body></div></details>`:'<span class="sf-plan-ok">SOLL erreicht</span>';
  const pager=(page,total,size=40)=>total>size?`<div class="sf-plan-pages"><span>${page*size+1}–${Math.min((page+1)*size,total)} von ${total}</span><button type="button" class="ghost" data-plan-page="${page-1}" ${page===0?'disabled':''}>Zurück</button><button type="button" class="ghost" data-plan-page="${page+1}" ${(page+1)*size>=total?'disabled':''}>Weiter</button></div>`:'';
  function renderDiagnostic(node,page=0){
    const body=node.querySelector?.('[data-plan-body]');if(!body)return;const ctx=context(),size=40;let markup='';
    if(node.dataset.planPerson){
      const e=ctx.people.find(e=>same(e.id,node.dataset.planPerson));if(!e){body.textContent='Das Mitarbeiterprofil ist nicht mehr verfügbar.';return;}
      const compatible=ctx.slots.filter(s=>(s.alternatives||[s.type]).some(t=>(e.shifts||[]).includes(t))),total=compatible.length;page=Math.max(0,Math.min(page,Math.ceil(total/size)-1));
      markup=`<p>Geprüft werden offene Pflichtpositionen im ausgewählten Zeitraum einschließlich der aktuellen Vorschläge. Optionale Besetzungen und Zeitgutschriften sind separat zu prüfen.</p>`;
      if(!ctx.slots.length)markup+='<p>Es gibt keine offenen Pflichtpositionen im Zeitraum. Prüfe optionalen oder zusätzlichen tatsächlichen Bedarf, bevor du weitere Stunden einplanst.</p>';
      else if(!total)markup+='<p>Für die noch offenen Positionen fehlt eine passende persönliche Schichtfreigabe.</p>';
      else markup+=pager(page,total)+`<ul>${compatible.slice(page*size,(page+1)*size).map(slot=>{const found=cachedCheck(e,slot,ctx);return `<li><b>${esc(slot.date+' · '+(slot.coverageGroup||slot.type))}</b><span>${found.status==='review'?'Einzeldienst prüfbar; vollständiger Arbeitsblock und Gesamtverteilung müssen zusätzlich passen.':found.reasons.map(esc).join(' · ')||'Die Regelprüfung ist unvollständig.'}</span></li>`}).join('')}</ul>`;
    }else{
      let slot;try{slot=JSON.parse(decodeURIComponent(node.dataset.planSlot));}catch{return;}
      const total=ctx.people.length;page=Math.max(0,Math.min(page,Math.ceil(total/size)-1));
      markup='<p>„Einzeldienst prüfbar“ bedeutet: kein direktes Hindernis in dieser Prüfung. Ein vollständiger Arbeitsblock und die übrige Besetzung müssen ebenfalls passen.</p>'+pager(page,total);
      markup+=total?`<ul>${ctx.people.slice(page*size,(page+1)*size).map(e=>{const found=cachedCheck(e,slot,ctx);return `<li><b>${esc(found.name)}</b><span>${found.status==='review'?`Einzeldienst prüfbar (${esc(found.possible.join(' / '))}). Vollständiger Arbeitsblock und Gesamtverteilung bleiben zu prüfen.`:found.reasons.map(esc).join(' · ')||'Die Regelprüfung ist unvollständig.'}</span></li>`}).join('')}</ul>`:'<p>Keine aktiven Mitarbeiterprofile vorhanden.</p>';
    }
    body.innerHTML=markup;node.sfPlanContext=ctx.key;node.sfPlanPage=page;
  }
  const describe=a=>a?`${a.date} · ${(window.SFShiftModels?.label?.(a.type)||a.type)} · ${a.start}–${a.end}`:'–';
  function changeBody(node,page=0){
    const comparison=node.sfPlanComparison,body=node.querySelector('[data-plan-changes]');if(!comparison||!body)return;
    const filter=node.querySelector('[data-plan-change-person]')?.value||'',rows=comparison.changes.filter(c=>!filter||same(c.row.employeeId,filter)),size=40;page=Math.max(0,Math.min(page,Math.ceil(rows.length/size)-1));
    const names=new Map(employees.map(e=>[String(e.id),person(e)]));body.innerHTML=rows.length?pager(page,rows.length)+`<div class="sf-plan-table-scroll" tabindex="0" aria-label="Geänderte Zuordnungen"><table><thead><tr><th>Mitarbeiter</th><th>Bisher</th><th>Vorschlag</th></tr></thead><tbody>${rows.slice(page*size,(page+1)*size).map(c=>`<tr><th>${esc(names.get(c.row.employeeId)||'Mitarbeiterprofil nicht mehr verfügbar')}</th><td>${esc(c.kind==='removed'?describe(c.row):'–')}</td><td>${esc(c.kind==='added'?describe(c.row):'–')}</td></tr>`).join('')}</tbody></table></div>`:'<p>Keine Zuordnungen geändert.</p>';
  }
  function render(result){
    const host=el('autoPlanComparison');if(!host)return;host.hidden=!result||!!autoPlanApplied;if(host.hidden){host.innerHTML='';delete host.sfPlanKey;return;}
    const dates=autoPlanningDates(),all=[...result.base,...autoPlanPreview],afterOpen=withRows(all.filter(active),()=>autoOpenSlots(dates).length),comparison=compare(result.reviewBefore,all,dates,afterOpen);
    if(!comparison){delete host.sfPlanKey;host.innerHTML='<section class="sf-plan-comparison"><h3>Vorher / Nachher</h3><p>Für diesen Vorschlag fehlt ein passender gespeicherter Ausgangsstand. Erstelle einen neuen Vorschlag, um Veränderungen vollständig zu vergleichen.</p></section>';return;}
    const open=host.querySelector?.('details[data-plan-comparison]')?.open,ids=[...new Set(comparison.changes.map(c=>c.row.employeeId))],names=new Map(employees.map(e=>[String(e.id),person(e)]));
    const markup=`<section class="sf-plan-comparison"><h3>Was verändert der Vorschlag?</h3><div class="sf-plan-table-scroll"><table><thead><tr><th>Kennzahl</th><th>Bisher</th><th>Vorschlag</th></tr></thead><tbody><tr><th>Offene Positionen</th><td>${comparison.openBefore}</td><td>${comparison.openAfter}</td></tr><tr><th>Fehlende SOLL-Stunden</th><td>${hours(comparison.missingBefore)}</td><td>${hours(comparison.missingAfter)}</td></tr></tbody></table></div><div class="sf-plan-change-counts"><span><b>${comparison.unchanged}</b> Zuordnungen unverändert</span><span><b>${comparison.removed}</b> bestehende Zuordnungen entfallen</span><span><b>${comparison.added}</b> neue Zuordnungen vorgeschlagen</span></div><p>Entfallene und neue Zuordnungen können Teil einer Umverteilung sein. Gespeichert wird erst nach deiner Bestätigung.</p><details data-plan-comparison ${open?'open':''}><summary>Geänderte Zuordnungen ansehen (${comparison.removed+comparison.added})</summary><label>Nach Mitarbeiter filtern <select data-plan-change-person><option value="">Alle betroffenen Mitarbeiter</option>${ids.sort((a,b)=>(names.get(a)||a).localeCompare(names.get(b)||b,'de',{numeric:true})).map(id=>`<option value="${esc(id)}">${esc(names.get(id)||'Mitarbeiterprofil nicht mehr verfügbar')}</option>`).join('')}</select></label><div data-plan-changes></div></details></section>`;
    const key=JSON.stringify([comparison,employees.map(e=>[e.id,e.first,e.last,e.personnelNo])]);if(host.sfPlanKey!==key){host.innerHTML=markup;host.sfPlanKey=key;}const details=host.querySelector?.('[data-plan-comparison]');if(details){details.sfPlanComparison=comparison;if(details.open)changeBody(details);}
  }
  function refreshOpen(){const nodes=document.querySelectorAll?.('details.sf-plan-diagnostic[open]')||[];if(!nodes.length)return;const ctx=context();for(const node of nodes)if(node.sfPlanContext!==ctx.key)renderDiagnostic(node,node.sfPlanPage||0);}
  document.addEventListener('toggle',event=>{const node=event.target;if(!node.open)return;if(node.matches?.('details.sf-plan-diagnostic'))renderDiagnostic(node);else if(node.matches?.('details[data-plan-comparison]'))changeBody(node);},true);
  document.addEventListener('click',event=>{const button=event.target.closest?.('button[data-plan-page]');if(!button||button.disabled)return;const node=button.closest('details');if(node?.matches('[data-plan-comparison]'))changeBody(node,Number(button.dataset.planPage));else if(node?.matches('.sf-plan-diagnostic'))renderDiagnostic(node,Number(button.dataset.planPage));});
  document.addEventListener('change',event=>{if(event.target.matches?.('[data-plan-change-person]'))changeBody(event.target.closest('details'));});
  window.SFPlanningReview={snapshot,compare,evaluate,slotMarkup,hoursMarkup,render,refreshOpen,reset(){cached=null;const host=el('autoPlanComparison');if(host){host.hidden=true;host.innerHTML='';delete host.sfPlanKey;}}};
})();
