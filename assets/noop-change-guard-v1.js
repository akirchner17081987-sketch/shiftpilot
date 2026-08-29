// SchichtFunk – Guard gegen inhaltsgleiche veröffentlichte Schichtänderungen V1
(function(){
  const C=window.SFCompliance;if(!C||typeof C.openChangeDrawer!=='function')return;
  if(C.__noopChangeGuard)return;C.__noopChangeGuard=true;

  const norm=s=>String(s??'').trim();
  const num=v=>Number(v||0);

  function isNoop(payload){
    if(!payload||payload.action!=='UPDATE'||!payload.assignment)return false;
    const a=payload.assignment;
    return norm(a.employeeId)===norm(payload.employeeId)
      && norm(a.type)===norm(payload.type)
      && norm(a.date)===norm(payload.date)
      && norm(a.start)===norm(payload.start)
      && norm(a.end)===norm(payload.end)
      && num(a.pause)===num(payload.pause)
      && norm(a.note)===norm(payload.note);
  }

  C.isNoopPublishedChange=isNoop;

  const original=C.openChangeDrawer.bind(C);
  C.openChangeDrawer=function(payload){
    if(isNoop(payload)){
      alert('Es wurden keine Änderungen vorgenommen.');
      C.toast?.('Keine Änderung','Die Schicht entspricht bereits vollständig der veröffentlichten Planung.');
      return false;
    }
    return original(payload);
  };
})();