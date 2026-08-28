// SchichtFunk – Mitarbeiter-Einladung Kompatibilitätsfix V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(typeof B.createEmployeeInvite!=='function'||B.__employeeInviteCompatApplied)return;
  B.__employeeInviteCompatApplied=true;

  const original=B.createEmployeeInvite.bind(B);
  const employeeList=()=>{
    try{if(typeof employees!=='undefined'&&Array.isArray(employees))return employees}catch{}
    return Array.isArray(window.employees)?window.employees:[];
  };

  B.createEmployeeInvite=async function(employeeId){
    const list=employeeList();
    const employee=list.find(x=>String(x.id)===String(employeeId));
    if(!employee){
      alert('Der ausgewählte Mitarbeiter konnte nicht geladen werden. Bitte Seite neu laden und erneut auswählen.');
      return;
    }

    const hadOwn=Object.prototype.hasOwnProperty.call(window,'employees');
    const previous=window.employees;
    try{
      // Der ursprüngliche Einladungsworkflow erwartet window.employees.
      // Die bestehende SchichtFunk-Seite hält die Mitarbeiter jedoch in einer globalen Script-Variable.
      window.employees=list;
      return await original(employeeId);
    }catch(err){
      console.error('Mitarbeiterzugang konnte nicht eingerichtet werden:',err);
      alert(err?.message||'Mitarbeiterzugang konnte nicht eingerichtet werden.');
    }finally{
      if(hadOwn)window.employees=previous;
      else delete window.employees;
    }
  };
})();