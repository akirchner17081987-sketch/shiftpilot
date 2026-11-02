// SchichtFunk – Supabase delete bridge V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  function err(title,e){console.error(title,e);if(typeof showSaveToast==='function')showSaveToast(title,e?.message||String(e));}

  if(typeof window.deleteEmployee==='function'&&!window.deleteEmployee.__sfCloudDelete){
    const base=window.deleteEmployee;
    const wrapped=async function(){
      const companyId=B.companyId,userId=B.user?.id;
      const localId=window.selectedEmployeeId;
      const employee=(window.employees||[]).find(e=>e.id===localId);
      const dbId=employee?._dbId||B.empDb?.get(String(localId))||null;
      const beforeCount=(window.employees||[]).length;
      const r=await base.apply(this,arguments);
      const deleted=(window.employees||[]).length<beforeCount;
      if(B.ready&&B.companyId===companyId&&B.user?.id===userId&&deleted&&dbId){
        (async()=>{
          try{
            // Zugehörige Entwürfe und Abwesenheiten sind im bestehenden UI bereits entfernt.
            // Veröffentlichte Schichten verhindern die Mitarbeiterlöschung absichtlich via FK.
            const q=await B.client.from('employees').delete().eq('id',dbId);
            if(q.error)throw q.error;
            B.empDb?.delete(String(localId));
          }catch(e){
            await window.SFDialog.alert('Der Mitarbeiter konnte in der Cloud nicht gelöscht werden.\n\nMöglicherweise existiert noch eine veröffentlichte Schicht. SchichtFunk lädt den sicheren Datenbankstand neu.');
            await B.hydrate?.().catch(x=>err('Cloud-Neuladen fehlgeschlagen',x));
          }
        })();
      }
      return r;
    };
    wrapped.__sfCloudDelete=true;
    window.deleteEmployee=wrapped;
    const btn=document.getElementById('deleteEmployeeBtn');if(btn)btn.onclick=wrapped;
  }

  // Schnelllöschung von Entwurfs-Schichten wird durch den regulären Cloud-Sync entfernt.
  // Veröffentlichte Schichten bleiben ausschließlich über den Change-Request/RPC-Pfad löschbar.
})();
