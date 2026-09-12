// SchichtFunk – strikter DATEV-LODAS-Formatter V1
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module?.exports)module.exports=api;
  if(root)root.SFDatevLodasCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SATZBESCHREIBUNG='1;u_lod_bwd_buchung_standard;abrechnung_zeitraum#bwd;bs_wert_butab#bwd;pnr#bwd;la_eigene#bwd;bs_nr#bwd;kostenstelle#bwd;abw_lohnfaktor#bwd;bemerkung#bwd;';
  const SOURCE_TYPES=new Set(['WORK_TOTAL','SHIFT_CODE','ABSENCE_TYPE','ABSENCE_DAYS','NIGHT_WINDOW','SUNDAY_WINDOW','HOLIDAY_WINDOW']);
  const safeAsciiToken=v=>/^[\x20-\x7E]+$/.test(String(v??''))&&!/[;\r\n]/.test(String(v??''));
  const monthOk=v=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v||''));
  const BERLIN_TZ='Europe/Berlin';
  const berlinPartsFormatter=new Intl.DateTimeFormat('en-GB',{timeZone:BERLIN_TZ,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});

  function monthStartDmy(month){
    if(!monthOk(month))throw new Error('Ungültiger Abrechnungsmonat.');
    const [y,m]=month.split('-');return `01.${m}.${y}`;
  }
  function formatNumber(value){
    const n=Number(value||0);if(!Number.isFinite(n))throw new Error('Ungültiger Buchungswert.');
    return (Math.round((n+Number.EPSILON)*100)/100).toFixed(2).replace('.',',');
  }
  function formatValueFromMinutes(minutes){return formatNumber(Number(minutes||0)/60)}
  function validateSettings(settings){
    const errors=[];
    const berater=String(settings?.berater_nr??settings?.beraterNr??'').trim();
    const mandant=String(settings?.mandanten_nr??settings?.mandantenNr??'').trim();
    if(!/^\d{4,7}$/.test(berater))errors.push('BeraterNr muss aus 4 bis 7 Ziffern bestehen.');
    if(!/^\d{1,5}$/.test(mandant))errors.push('MandantenNr muss aus 1 bis 5 Ziffern bestehen.');
    return errors;
  }
  function normalizeRules(rules){
    return (rules||[]).filter(r=>r&&r.active!==false).map((r,i)=>({...r,source_type:String(r.source_type||'').trim(),source_key:String(r.source_key||'').trim(),wage_type:String(r.wage_type||'').trim(),cost_center:String(r.cost_center||'').trim(),sort_order:Number.isFinite(Number(r.sort_order))?Number(r.sort_order):100,_order:i})).sort((a,b)=>a.sort_order-b.sort_order||a._order-b._order);
  }
  function validateRules(rules){
    const errors=[];const active=normalizeRules(rules);
    if(!active.length)errors.push('Es ist noch keine aktive Lohnarten-Zuordnung hinterlegt.');
    active.forEach((r,i)=>{
      const n=i+1;
      if(!SOURCE_TYPES.has(r.source_type))errors.push(`Regel ${n}: unbekannte Quelle.`);
      if(['SHIFT_CODE','ABSENCE_TYPE','ABSENCE_DAYS'].includes(r.source_type)&&!r.source_key)errors.push(`Regel ${n}: Quelle/Schlüssel fehlt.`);
      if(r.source_type==='NIGHT_WINDOW'&&r.source_key!=='22:00-06:00')errors.push(`Regel ${n}: Nachtfenster muss 22:00-06:00 sein.`);
      if(r.source_type==='SUNDAY_WINDOW'&&r.source_key!=='00:00-24:00')errors.push(`Regel ${n}: Sonntagsfenster muss 00:00-24:00 sein.`);
      if(r.source_type==='HOLIDAY_WINDOW'&&r.source_key!=='00:00-24:00')errors.push(`Regel ${n}: Feiertagsfenster muss 00:00-24:00 sein.`);
      if(!/^\d{1,4}$/.test(r.wage_type))errors.push(`Regel ${n}: Lohnart muss aus 1 bis 4 Ziffern bestehen.`);
      if(r.cost_center&&(r.cost_center.length>13||!safeAsciiToken(r.cost_center)))errors.push(`Regel ${n}: Kostenstelle darf höchstens 13 druckbare ASCII-Zeichen ohne Semikolon enthalten.`);
    });
    return errors;
  }
  function entryNetMinutes(e){
    if(!e?.actual_start||!e?.actual_end)return 0;
    const a=new Date(e.actual_start),b=new Date(e.actual_end),mins=Math.round((b-a)/60000)-Number(e.actual_break_minutes??e.break_minutes??0);
    return Number.isFinite(mins)?Math.max(0,mins):0;
  }
  function entryStatus(e){return String(e?.entry_status??e?.status??'').toLowerCase()}
  function breakMinutes(e){return Math.max(0,Number(e?.actual_break_minutes??e?.break_minutes??0)||0)}
  function splitAbsenceTypes(v){return String(v||'').split(',').map(x=>x.trim()).filter(Boolean)}
  function berlinMinuteInfo(ms){
    const parts=berlinPartsFormatter.formatToParts(new Date(ms));
    const get=t=>parts.find(p=>p.type===t)?.value||'';
    return {weekday:get('weekday'),hour:Number(get('hour')),minute:Number(get('minute')),date:`${get('year')}-${get('month')}-${get('day')}`};
  }
  function premiumMinutes(e,type,holidayDates){
    if(!e?.actual_start||!e?.actual_end||entryStatus(e)!=='confirmed')return 0;
    const start=new Date(e.actual_start).getTime(),end=new Date(e.actual_end).getTime();
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return 0;
    let minutes=0;const first=Math.floor(start/60000)*60000;
    for(let t=first;t<end;t+=60000){
      const segStart=Math.max(start,t),segEnd=Math.min(end,t+60000);if(segEnd<=segStart)continue;
      const info=berlinMinuteInfo(t+30000);
      const qualifies=type==='NIGHT_WINDOW'?(info.hour>=22||info.hour<6):type==='SUNDAY_WINDOW'?(info.weekday==='Sun'):type==='HOLIDAY_WINDOW'?(holidayDates?.has(info.date)):false;
      if(qualifies)minutes+=(segEnd-segStart)/60000;
    }
    return Math.round(minutes);
  }

  function buildRows({rules,employees,details,entries}){
    const errors=[...validateRules(rules)],warnings=[];
    const active=normalizeRules(rules),emps=employees||[],dets=details||[],ents=entries||[];
    const employeeById=new Map(emps.map((e,i)=>[String(e.employee_id||e.id),{...e,_order:i}]));
    const employeeErrors=new Set(),accumulator=new Map();
    const holidayDates=new Set(dets.filter(d=>String(d?.holiday_name||'').trim()).map(d=>String(d.work_date||'')).filter(Boolean));
    function employeePnr(id){
      const e=employeeById.get(String(id)),pnr=String(e?.personnel_no??'').trim();
      if(!e){employeeErrors.add(`Mitarbeiter ${id} ist im Monats-Snapshot nicht vorhanden.`);return null}
      if(!/^\d{1,5}$/.test(pnr)){employeeErrors.add(`${e.employee_name||'Mitarbeiter'}: Personalnummer „${pnr||'leer'}“ muss für LODAS aus 1 bis 5 Ziffern bestehen.`);return null}
      return {e,pnr};
    }
    function add(employeeId,rule,amount,unit='MINUTES'){
      const n=Number(amount||0);if(!Number.isFinite(n)||n<=0)return;
      const ep=employeePnr(employeeId);if(!ep)return;
      const cost=rule.cost_center||'NULL',key=[ep.pnr,rule.wage_type,cost,unit].join('|'),old=accumulator.get(key);
      const row={pnr:ep.pnr,wage_type:rule.wage_type,cost_center:cost,minutes:unit==='MINUTES'?Math.round(n):0,quantity:unit==='DAYS'?n:0,unit,employee_order:ep.e._order,rule_order:rule.sort_order};
      if(old){if(unit==='DAYS')old.quantity+=n;else old.minutes+=Math.round(n);old.rule_order=Math.min(old.rule_order,row.rule_order)}else accumulator.set(key,row);
    }

    active.forEach(rule=>{
      if(rule.source_type==='WORK_TOTAL'){emps.forEach(e=>add(e.employee_id||e.id,rule,Number(e.confirmed_work_minutes||0)));return}
      if(rule.source_type==='SHIFT_CODE'){
        const sums=new Map();ents.filter(e=>entryStatus(e)==='confirmed'&&String(e.shift_code||'')===rule.source_key).forEach(e=>sums.set(String(e.employee_id),(sums.get(String(e.employee_id))||0)+entryNetMinutes(e)));sums.forEach((m,id)=>add(id,rule,m));return;
      }
      if(['NIGHT_WINDOW','SUNDAY_WINDOW','HOLIDAY_WINDOW'].includes(rule.source_type)){
        const sums=new Map();ents.filter(e=>entryStatus(e)==='confirmed').forEach(e=>{if(breakMinutes(e)>0){errors.push(`${e.employee_name||'Mitarbeiter'} · ${e.work_date||''}: Zuschlagsberechnung ist wegen einer Pause ohne genaue Pausenlage nicht eindeutig.`);return}const m=premiumMinutes(e,rule.source_type,holidayDates);if(m>0)sums.set(String(e.employee_id),(sums.get(String(e.employee_id))||0)+m)});sums.forEach((m,id)=>add(id,rule,m));return;
      }
      if(rule.source_type==='ABSENCE_TYPE'){
        dets.forEach(d=>{const types=splitAbsenceTypes(d.absence_types);if(!types.includes(rule.source_key))return;if(types.length>1){errors.push(`${d.employee_name||'Mitarbeiter'} · ${d.work_date||''}: mehrere Abwesenheitsarten an einem Tag können für DATEV nicht eindeutig aufgeteilt werden.`);return}add(d.employee_id,rule,Number(d.absence_credit_minutes||0))});return;
      }
      if(rule.source_type==='ABSENCE_DAYS'){
        const seen=new Set();dets.forEach(d=>{const types=splitAbsenceTypes(d.absence_types);if(!types.includes(rule.source_key))return;if(types.length>1){errors.push(`${d.employee_name||'Mitarbeiter'} · ${d.work_date||''}: mehrere Abwesenheitsarten an einem Tag können für DATEV nicht eindeutig aufgeteilt werden.`);return}const key=`${d.employee_id}|${d.work_date}`;if(seen.has(key))return;seen.add(key);add(d.employee_id,rule,1,'DAYS')});
      }
    });
    employeeErrors.forEach(e=>errors.push(e));
    const rows=[...accumulator.values()].filter(r=>r.unit==='DAYS'?Number(r.quantity)>0:Number(r.minutes)>0).sort((a,b)=>a.employee_order-b.employee_order||a.rule_order-b.rule_order||a.wage_type.localeCompare(b.wage_type,'de',{numeric:true}));
    if(!rows.length&&!errors.length)errors.push('Die aktiven Lohnarten-Zuordnungen ergeben für diesen Monat keine Bewegungsdaten. Ein leerer DATEV-Export ist nicht zulässig.');
    return {rows,errors:[...new Set(errors)],warnings};
  }

  function formatContent({beraterNr,mandantenNr,month,rows}){
    const settings={beraterNr,mandantenNr};const errors=validateSettings(settings);if(errors.length)throw new Error(errors.join(' '));
    const date=monthStartDmy(month),out=['[Allgemein]','Ziel=LODAS','Datumsformat=TT.MM.JJJJ','Zahlenkomma=,','Version=15.06',`BeraterNr=${String(beraterNr).trim()}`,`MandantenNr=${String(mandantenNr).trim()}`,'[Satzbeschreibung]',SATZBESCHREIBUNG,'[Bewegungsdaten]'];
    (rows||[]).forEach(r=>{
      const pnr=String(r.pnr||'').trim(),wage=String(r.wage_type||'').trim(),cost=String(r.cost_center||'NULL').trim()||'NULL';
      if(!/^\d{1,5}$/.test(pnr))throw new Error(`Ungültige Personalnummer: ${pnr||'leer'}`);
      if(!/^\d{1,4}$/.test(wage))throw new Error(`Ungültige Lohnart: ${wage||'leer'}`);
      if(cost!=='NULL'&&(cost.length>13||!safeAsciiToken(cost)))throw new Error('Kostenstelle darf höchstens 13 druckbare ASCII-Zeichen ohne Semikolon enthalten.');
      const value=r.unit==='DAYS'?formatNumber(r.quantity):formatValueFromMinutes(r.minutes);
      out.push(`1;${date};${value};${pnr};${wage};1;${cost};`);
    });
    return out.join('\r\n');
  }

  return {SATZBESCHREIBUNG,monthStartDmy,formatNumber,formatValueFromMinutes,validateSettings,validateRules,entryNetMinutes,premiumMinutes,buildRows,formatContent};
});
