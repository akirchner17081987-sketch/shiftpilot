// SchichtFunk – Dienstplan Kernlogik V1
(function(){
  if (typeof window === 'undefined') return;

  const DAY_MS = 86400000;
  const originalChooseType = window.chooseType;

  function parseISODate(date){
    if(date instanceof Date){
      if(Number.isNaN(date.getTime())) return null;
      return new Date(date.getFullYear(),date.getMonth(),date.getDate());
    }
    const raw=String(date||'').trim();
    let m=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m){
      const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
      return Number.isNaN(d.getTime())?null:d;
    }
    m=raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if(m){
      const d=new Date(Number(m[3]),Number(m[2])-1,Number(m[1]));
      return Number.isNaN(d.getTime())?null:d;
    }
    const fallback=new Date(raw);
    return Number.isNaN(fallback.getTime())?null:new Date(fallback.getFullYear(),fallback.getMonth(),fallback.getDate());
  }

  function canonicalDate(date){
    const d=parseISODate(date);return d?localISO(d):'';
  }

  function easterSunday(year){
    const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4;
    const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
    const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
    const month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
    return new Date(year,month-1,day);
  }

  function localISO(d){
    const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  function berlinHolidays(year){
    const easter=easterSunday(year);
    const add=(n)=>{const d=new Date(easter);d.setDate(d.getDate()+n);return localISO(d)};
    return new Set([
      `${year}-01-01`,`${year}-03-08`,add(-2),add(1),`${year}-05-01`,add(39),add(50),`${year}-10-03`,`${year}-12-25`,`${year}-12-26`
    ]);
  }

  const holidayCache = new Map();
  function isBerlinHoliday(date){
    const d=parseISODate(date); if(!d) return false;
    const y=d.getFullYear();
    if(!holidayCache.has(y)) holidayCache.set(y,berlinHolidays(y));
    return holidayCache.get(y).has(localISO(d));
  }

  function isOTDay(date){
    const d=parseISODate(date); if(!d) return false;
    const day=d.getDay();
    return day===0 || day===6 || isBerlinHoliday(d);
  }

  function absenceCovers(a,date){
    if(!a || a.status==='Abgelehnt') return false;
    const target=canonicalDate(date);
    const start=canonicalDate(a.startDate||a.date);
    const end=canonicalDate(a.endDate||a.date||a.startDate);
    return !!target&&!!start&&target>=start&&target<=end;
  }

  function minutes(t){const p=String(t||'00:00').split(':').map(Number);return (p[0]||0)*60+(p[1]||0)}
  function intervalFor(date,start,end){
    const base=parseISODate(date); if(!base) return null;
    const baseMs=base.getTime(),s=minutes(start),e=minutes(end);
    return {start:baseMs+s*60000,end:baseMs+e*60000+(e<=s?DAY_MS:0)};
  }
  function assignmentInterval(a){const t=typeof typeById==='function'?typeById(a.type):null;return intervalFor(a.date,a.start||t?.start,a.end||t?.end)}
  function proposedInterval(date,type){const t=typeof typeById==='function'?typeById(type):null;return t?intervalFor(date,t.start,t.end):null}
  function overlaps(a,b){return !!a&&!!b&&a.start<b.end&&b.start<a.end}
  function employeeHasConflict(employeeId,date,type,ignoreId=null){const proposed=proposedInterval(date,type);if(!proposed)return false;return assignments.some(a=>a.employeeId===employeeId&&a.id!==ignoreId&&overlaps(proposed,assignmentInterval(a)))}

  window.chooseType=function(t){
    if(typeof selectedType!=='undefined' && selectedType===t){selectedType=null;if(typeof renderLibrary==='function')renderLibrary();if(typeof renderPlanEmployeePool==='function')renderPlanEmployeePool();if(typeof showSaveToast==='function')showSaveToast('Schichtauswahl aufgehoben','Der Mitarbeiter-Pool zeigt wieder alle verfügbaren Mitarbeiter.');return;}
    if(typeof originalChooseType==='function')return originalChooseType(t);
    selectedType=t;if(typeof renderLibrary==='function')renderLibrary();
  };

  window.getSoll=function(date,type){if(type==='OT'&&!isOTDay(date))return 0;const key=canonicalDate(date)||date;return dailySoll?.[key]?.[type] ?? globalSoll?.[type] ?? 0;};
  window.absent=function(employeeId,date){return absences.some(a=>a.employeeId===employeeId&&absenceCovers(a,date));};
  window.isEligible=function(emp,type,date){if(!emp||emp.status!=='active')return false;if(!(emp.shifts||[]).includes(type))return false;if(type==='OT'&&!isOTDay(date))return false;if(window.absent(emp.id,date))return false;return !employeeHasConflict(emp.id,date,type);};

  function validateAssignment(employeeId,type,date){
    const normalizedDate=canonicalDate(date);
    const emp=employees.find(e=>e.id===employeeId),t=typeof typeById==='function'?typeById(type):null;
    if(!emp||!t)return {ok:false,msg:'Mitarbeiter oder Schichtvorlage wurde nicht gefunden.'};
    if(!normalizedDate)return {ok:false,msg:'Das ausgewählte Kalenderdatum konnte nicht erkannt werden.'};
    if(emp.status!=='active')return {ok:false,msg:'Dieser Mitarbeiter ist aktuell inaktiv.'};
    if(!(emp.shifts||[]).includes(type))return {ok:false,msg:`${emp.first} ${emp.last} ist für ${type} nicht freigegeben.`};
    if(type==='OT'&&!isOTDay(normalizedDate))return {ok:false,msg:'OT darf nur samstags, sonntags oder an gesetzlichen Feiertagen eingeplant werden.'};
    if(window.absent(emp.id,normalizedDate)){
      const a=absences.find(x=>x.employeeId===emp.id&&absenceCovers(x,normalizedDate));
      return {ok:false,msg:`${emp.first} ${emp.last} ist am ${normalizedDate} abwesend${a?.type?' ('+a.type+')':''}.`};
    }
    if(employeeHasConflict(emp.id,normalizedDate,type))return {ok:false,msg:`${emp.first} ${emp.last} hat in diesem Zeitraum bereits eine andere Schicht.`};
    return {ok:true,emp,t,date:normalizedDate};
  }

  window.assignEmployeeByDrop=function(employeeId,type,date){
    if(!type){alert('Bitte zuerst eine Schichtvorlage auswählen.');return;}
    const v=validateAssignment(employeeId,type,date);if(!v.ok){alert(v.msg);return;}
    assignments.push({id:'as'+Date.now(),date:v.date,type,employeeId:v.emp.id,start:v.t.start,end:v.t.end});
    if(typeof saveAll==='function')saveAll();if(typeof renderCalendar==='function')renderCalendar();if(typeof renderPlanEmployeePool==='function')renderPlanEmployeePool();if(typeof showSaveToast==='function')showSaveToast('Schicht erfolgreich zugewiesen',`${v.emp.first} ${v.emp.last} wurde am ${v.date} für ${type} eingeplant.`);
  };

  window.openAssign=function(type,date){
    if(!type){alert('Bitte zuerst eine Schichtvorlage auswählen.');return;}
    const normalizedDate=canonicalDate(date);if(!normalizedDate){alert('Das ausgewählte Kalenderdatum konnte nicht erkannt werden.');return;}
    if(type==='OT'&&!isOTDay(normalizedDate)){alert('OT darf nur samstags, sonntags oder an gesetzlichen Feiertagen eingeplant werden.');return;}
    const eligible=employees.filter(e=>window.isEligible(e,type,normalizedDate));if(!eligible.length){alert('Für diese Schicht ist aktuell kein verfügbarer, freigegebener Mitarbeiter vorhanden.');return;}
    const names=eligible.map((e,i)=>`${i+1}: ${e.first} ${e.last}`).join('\n');const pick=prompt(`Mitarbeiter für ${type} am ${normalizedDate} auswählen:\n\n${names}`,'1');if(pick===null)return;
    const idx=parseInt(pick,10)-1;if(idx<0||idx>=eligible.length)return;window.assignEmployeeByDrop(eligible[idx].id,type,normalizedDate);
  };

  window.editAssignment=function(id){
    const a=assignments.find(x=>x.id===id);if(!a)return;const t=typeById(a.type),emp=employees.find(e=>e.id===a.employeeId);if(!t||!emp)return;
    const s=prompt(`${t.id} · ${emp.first} ${emp.last}\nBeginn ändern:`,a.start||t.start);if(s===null)return;const e=prompt('Ende ändern:',a.end||t.end);if(e===null)return;
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(e)){alert('Bitte eine gültige Uhrzeit im Format HH:MM eingeben.');return;}
    const proposed=intervalFor(a.date,s,e);const conflict=assignments.some(x=>x.employeeId===a.employeeId&&x.id!==a.id&&overlaps(proposed,assignmentInterval(x)));if(conflict){alert(`${emp.first} ${emp.last} hat in diesem Zeitraum bereits eine andere Schicht.`);return;}
    if(confirm('Schicht speichern?\nOK = speichern, Abbrechen = Schicht löschen')){a.start=s;a.end=e;saveAll();renderCalendar();if(typeof renderPlanEmployeePool==='function')renderPlanEmployeePool();if(typeof showSaveToast==='function')showSaveToast('Schichtänderung gespeichert',`${t.id} für ${emp.first} ${emp.last}: ${s} – ${e}.`);}else{assignments=assignments.filter(x=>x.id!==id);saveAll();renderCalendar();if(typeof renderPlanEmployeePool==='function')renderPlanEmployeePool();if(typeof showSaveToast==='function')showSaveToast('Schicht entfernt',`${t.id} für ${emp.first} ${emp.last} wurde aus dem Dienstplan entfernt.`);}
  };

  window.SchichtFunkScheduleCore={isBerlinHoliday,isOTDay,absenceCovers,employeeHasConflict,validateAssignment,canonicalDate};
})();
