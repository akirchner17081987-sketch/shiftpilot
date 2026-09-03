// SchichtFunk – strikter DATEV-LODAS-Formatter V1
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module?.exports)module.exports=api;
  if(root)root.SFDatevLodasCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SATZBESCHREIBUNG='1;u_lod_bwd_buchung_standard;abrechnung_zeitraum#bwd;bs_wert_butab#bwd;pnr#bwd;la_eigene#bwd;bs_nr#bwd;kostenstelle#bwd;abw_lohnfaktor#bwd;bemerkung#bwd;';
  const SOURCE_TYPES=new Set(['WORK_TOTAL','SHIFT_CODE','ABSENCE_TYPE']);
  const digits=v=>/^\d+$/.test(String(v??'').trim());
  const safeToken=v=>!/[;\r\n]/.test(String(v??''));
  const monthOk=v=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v||''));
  const pad=n=>String(n).padStart(2,'0');

  function monthStartDmy(month){
    if(!monthOk(month))throw new Error('Ungültiger Abrechnungsmonat.');
    const [y,m]=month.split('-');return `01.${m}.${y}`;
  }
  function formatValueFromMinutes(minutes){
    const n=Number(minutes||0)/60;
    if(!Number.isFinite(n))throw new Error('Ungültiger Buchungswert.');
    const rounded=Math.round((n+Number.EPSILON)*100)/100;
    return rounded.toFixed(2).replace('.',',');
  }
  function validateSettings(settings){
    const errors=[];
    const berater=String(settings?.berater_nr??settings?.beraterNr??'').trim();
    const mandant=String(settings?.mandanten_nr??settings?.mandantenNr??'').trim();
    if(!/^\d{1,10}$/.test(berater))errors.push('BeraterNr fehlt oder ist nicht rein numerisch.');
    if(!/^\d{1,10}$/.test(mandant))errors.push('MandantenNr fehlt oder ist nicht rein numerisch.');
    return errors;
  }
  function normalizeRules(rules){
    return (rules||[]).filter(r=>r&&r.active!==false).map((r,i)=>({
      ...r,
      source_type:String(r.source_type||'').trim(),
      source_key:String(r.source_key||'').trim(),
      wage_type:String(r.wage_type||'').trim(),
      cost_center:String(r.cost_center||'').trim(),
      sort_order:Number.isFinite(Number(r.sort_order))?Number(r.sort_order):100,
      _order:i
    })).sort((a,b)=>a.sort_order-b.sort_order||a._order-b._order);
  }
  function validateRules(rules){
    const errors=[];const active=normalizeRules(rules);
    if(!active.length)errors.push('Es ist noch keine aktive Lohnarten-Zuordnung hinterlegt.');
    active.forEach((r,i)=>{
      const n=i+1;
      if(!SOURCE_TYPES.has(r.source_type))errors.push(`Regel ${n}: unbekannte Quelle.`);
      if(r.source_type!=='WORK_TOTAL'&&!r.source_key)errors.push(`Regel ${n}: Quelle/Schlüssel fehlt.`);
      if(!/^\d{1,6}$/.test(r.wage_type))errors.push(`Regel ${n}: Lohnart muss numerisch sein.`);
      if(r.cost_center&&!safeToken(r.cost_center))errors.push(`Regel ${n}: Kostenstelle enthält unzulässige Zeichen.`);
    });
    return errors;
  }
  function entryNetMinutes(e){
    if(!e?.actual_start||!e?.actual_end)return 0;
    const a=new Date(e.actual_start),b=new Date(e.actual_end),mins=Math.round((b-a)/60000)-Number(e.actual_break_minutes||0);
    return Number.isFinite(mins)?Math.max(0,mins):0;
  }
  function splitAbsenceTypes(v){return String(v||'').split(',').map(x=>x.trim()).filter(Boolean)}

  function buildRows({rules,employees,details,entries}){
    const errors=[...validateRules(rules)],warnings=[];
    const active=normalizeRules(rules),emps=employees||[],dets=details||[],ents=entries||[];
    const employeeById=new Map(emps.map((e,i)=>[String(e.employee_id||e.id),{...e,_order:i}]));
    const employeeErrors=new Set();
    const accumulator=new Map();

    function employeePnr(id){
      const e=employeeById.get(String(id));
      const pnr=String(e?.personnel_no??'').trim();
      if(!e){employeeErrors.add(`Mitarbeiter ${id} ist im Monats-Snapshot nicht vorhanden.`);return null}
      if(!digits(pnr)){employeeErrors.add(`${e.employee_name||'Mitarbeiter'}: Personalnummer „${pnr||'leer'}“ ist für das feste LODAS-Muster nicht rein numerisch.`);return null}
      return {e,pnr};
    }
    function add(employeeId,rule,minutes){
      const m=Math.round(Number(minutes||0));if(!Number.isFinite(m)||m<=0)return;
      const ep=employeePnr(employeeId);if(!ep)return;
      const cost=rule.cost_center||'NULL';
      const key=[ep.pnr,rule.wage_type,cost].join('|');
      const old=accumulator.get(key);
      const row={pnr:ep.pnr,wage_type:rule.wage_type,cost_center:cost,minutes:m,employee_order:ep.e._order,rule_order:rule.sort_order};
      if(old){old.minutes+=m;old.rule_order=Math.min(old.rule_order,row.rule_order)}else accumulator.set(key,row);
    }

    active.forEach(rule=>{
      if(rule.source_type==='WORK_TOTAL'){
        emps.forEach(e=>add(e.employee_id||e.id,rule,Number(e.confirmed_work_minutes||0)));
        return;
      }
      if(rule.source_type==='SHIFT_CODE'){
        const sums=new Map();
        ents.filter(e=>String(e.entry_status||'').toLowerCase()==='confirmed'&&String(e.shift_code||'')===rule.source_key)
          .forEach(e=>sums.set(String(e.employee_id),(sums.get(String(e.employee_id))||0)+entryNetMinutes(e)));
        sums.forEach((m,id)=>add(id,rule,m));return;
      }
      if(rule.source_type==='ABSENCE_TYPE'){
        dets.forEach(d=>{
          const types=splitAbsenceTypes(d.absence_types);if(!types.includes(rule.source_key))return;
          if(types.length>1){errors.push(`${d.employee_name||'Mitarbeiter'} · ${d.work_date||''}: mehrere Abwesenheitsarten an einem Tag können für DATEV nicht eindeutig aufgeteilt werden.`);return}
          add(d.employee_id,rule,Number(d.absence_credit_minutes||0));
        });
      }
    });
    employeeErrors.forEach(e=>errors.push(e));
    const rows=[...accumulator.values()].filter(r=>Number(formatValueFromMinutes(r.minutes).replace(',','.'))!==0)
      .sort((a,b)=>a.employee_order-b.employee_order||a.rule_order-b.rule_order||a.wage_type.localeCompare(b.wage_type,'de',{numeric:true}));
    if(!rows.length&&!errors.length)warnings.push('Die aktiven Lohnarten-Zuordnungen ergeben für diesen Monat keine Buchungswerte.');
    return {rows,errors:[...new Set(errors)],warnings};
  }

  function formatContent({beraterNr,mandantenNr,month,rows}){
    const settings={beraterNr,mandantenNr};const errors=validateSettings(settings);if(errors.length)throw new Error(errors.join(' '));
    const date=monthStartDmy(month);const out=[
      '[Allgemein]',
      'Ziel=LODAS',
      'Datumsformat=TT.MM.JJJJ',
      'Zahlenkomma=,',
      'Version_=15.06',
      `BeraterNr=${String(beraterNr).trim()}`,
      `MandantenNr=${String(mandantenNr).trim()}`,
      '[Satzbeschreibung]',
      SATZBESCHREIBUNG,
      '[Bewegungsdaten]'
    ];
    (rows||[]).forEach(r=>{
      const pnr=String(r.pnr||'').trim(),wage=String(r.wage_type||'').trim(),cost=String(r.cost_center||'NULL').trim()||'NULL';
      if(!digits(pnr))throw new Error(`Ungültige Personalnummer: ${pnr||'leer'}`);
      if(!/^\d{1,6}$/.test(wage))throw new Error(`Ungültige Lohnart: ${wage||'leer'}`);
      if(!safeToken(cost))throw new Error('Kostenstelle enthält unzulässige Zeichen.');
      out.push(`1;${date};${formatValueFromMinutes(r.minutes)};${pnr};${wage};1;${cost};`);
    });
    return out.join('\r\n');
  }

  return {SATZBESCHREIBUNG,monthStartDmy,formatValueFromMinutes,validateSettings,validateRules,buildRows,formatContent};
});
