// SchichtFunk – Veröffentlichungsdialog im App-Design V1
(function(){
  if(window.__sfPublishDialogDesignV1)return;window.__sfPublishDialogDesignV1=true;
  let patched=false;

  function css(){
    if(document.getElementById('sfPublishDesignCss'))return;
    const s=document.createElement('style');s.id='sfPublishDesignCss';s.textContent=`
      .sf-publish-design-backdrop{position:fixed;inset:0;z-index:26000;display:grid;place-items:center;padding:20px;background:rgba(2,7,13,.78);backdrop-filter:blur(7px)}
      .sf-publish-design-modal{width:min(560px,96vw);overflow:hidden;border:1px solid #29465f;border-radius:16px;background:linear-gradient(180deg,#0f1f30,#091522);color:#edf7ff;box-shadow:0 30px 100px rgba(0,0,0,.62)}
      .sf-publish-design-head{display:flex;gap:15px;align-items:flex-start;padding:22px 23px 18px;border-bottom:1px solid #21384d;background:linear-gradient(180deg,rgba(39,214,180,.07),transparent)}
      .sf-publish-design-icon{flex:none;width:44px;height:44px;display:grid;place-items:center;border:1px solid #26705f;border-radius:12px;background:#10342d;color:#60e5c4;font-size:22px;font-weight:900}
      .sf-publish-design-headcopy{min-width:0;flex:1}.sf-publish-design-eyebrow{color:#2ed9b8;font-size:10px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}
      .sf-publish-design-head h2{margin:5px 0 5px;font-size:21px;line-height:1.2}.sf-publish-design-head p{margin:0;color:#8fa6bc;font-size:12px;line-height:1.5}
      .sf-publish-design-x{flex:none;width:36px;height:36px;border:1px solid #2c465e;border-radius:9px;background:#102030;color:#a9bfd2;font-size:15px}
      .sf-publish-design-body{padding:20px 23px}.sf-publish-design-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:14px}
      .sf-publish-design-stat{padding:11px 12px;border:1px solid #294159;border-radius:10px;background:#0b1926}.sf-publish-design-stat small{display:block;color:#7891a8;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}.sf-publish-design-stat b{display:block;margin-top:5px;color:#f3f8ff;font-size:16px}
      .sf-publish-design-info{display:grid;grid-template-columns:24px 1fr;gap:10px;align-items:start;padding:13px 14px;border:1px solid #3f5d36;border-radius:10px;background:#16291e;color:#c8e8d2;font-size:12px;line-height:1.55}.sf-publish-design-info i{font-style:normal;color:#ffbd4f;font-size:17px;line-height:1.1}
      .sf-publish-design-info strong{display:block;margin-bottom:3px;color:#f0f7f3}.sf-publish-design-note{margin:13px 0 0;color:#8198ae;font-size:11px;line-height:1.5}
      .sf-publish-design-foot{display:flex;justify-content:flex-end;gap:9px;padding:16px 23px;border-top:1px solid #21384d;background:#091521}.sf-publish-design-foot button{min-height:40px;padding:9px 14px;border-radius:9px;font-size:12px;font-weight:800}
      .sf-publish-design-cancel{border:1px solid #2a455d;background:#0d1c2b;color:#b8cbe0}.sf-publish-design-confirm{border:1px solid #32daba;background:#2ed9b8;color:#05251e}.sf-publish-design-confirm:hover{background:#43e2c3}
      @media(max-width:560px){.sf-publish-design-summary{grid-template-columns:1fr}.sf-publish-design-head,.sf-publish-design-body,.sf-publish-design-foot{padding-left:17px;padding-right:17px}}
    `;document.head.appendChild(s);
  }

  function fmtDate(C,date){try{return C.fmt(date)}catch{return new Date(date+'T00:00:00').toLocaleDateString('de-DE')}}
  function weekKey(C){
    try{if(typeof weekStart!=='undefined'&&weekStart)return C.weekKey(C.iso(weekStart instanceof Date?weekStart:new Date(weekStart)))}catch{}
    const d=new Date(),day=d.getDay()||7;d.setDate(d.getDate()-day+1);return C.iso(d);
  }
  function weekDates(C,key){const start=new Date(key+'T12:00:00');return Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return C.iso(d)})}

  function openDialog(C,key){
    css();document.getElementById('sfPublishDesignDialog')?.remove();
    const dates=weekDates(C,key),weekAssignments=(typeof assignments!=='undefined'?assignments:[]).filter(a=>dates.includes(a.date));
    const affected=new Set(weekAssignments.map(a=>String(a.employeeId))).size;
    return new Promise(resolve=>{
      const back=document.createElement('div');back.id='sfPublishDesignDialog';back.className='sf-publish-design-backdrop';
      back.innerHTML=`<section class="sf-publish-design-modal" role="alertdialog" aria-modal="true" aria-labelledby="sfPublishDesignTitle"><header class="sf-publish-design-head"><div class="sf-publish-design-icon">✓</div><div class="sf-publish-design-headcopy"><div class="sf-publish-design-eyebrow">Dienstplan · Veröffentlichung</div><h2 id="sfPublishDesignTitle">Dienstplan veröffentlichen?</h2><p>${fmtDate(C,key)} bis ${fmtDate(C,dates[6])}</p></div><button type="button" class="sf-publish-design-x" aria-label="Schließen">✕</button></header><div class="sf-publish-design-body"><div class="sf-publish-design-summary"><div class="sf-publish-design-stat"><small>Zeitraum</small><b>1 Woche</b></div><div class="sf-publish-design-stat"><small>Schichten</small><b>${weekAssignments.length}</b></div><div class="sf-publish-design-stat"><small>Mitarbeiter</small><b>${affected}</b></div></div><div class="sf-publish-design-info"><i>!</i><div><strong>Was passiert nach der Veröffentlichung?</strong>Ab diesem Zeitpunkt werden spätere Änderungen über die Compliance-Prüfung verarbeitet und nachvollziehbar protokolliert.</div></div><p class="sf-publish-design-note">Veröffentlichte Schichten werden für die Mitarbeitenden sichtbar. Die bestehende Planungs- und Compliance-Logik bleibt unverändert.</p></div><footer class="sf-publish-design-foot"><button type="button" class="sf-publish-design-cancel">Abbrechen</button><button type="button" class="sf-publish-design-confirm">Jetzt veröffentlichen</button></footer></section>`;
      document.body.appendChild(back);
      const done=value=>{back.remove();resolve(value)};
      back.querySelector('.sf-publish-design-x').onclick=()=>done(false);
      back.querySelector('.sf-publish-design-cancel').onclick=()=>done(false);
      back.querySelector('.sf-publish-design-confirm').onclick=()=>done(true);
      back.onclick=e=>{if(e.target===back)done(false)};
      back.onkeydown=e=>{if(e.key==='Escape')done(false)};
      back.querySelector('.sf-publish-design-confirm').focus();
    });
  }

  function localPublish(C,key){
    const now=new Date().toISOString(),dates=weekDates(C,key);
    C.publications=C.publications||{};C.publications[key]={publishedAt:now,publishedBy:'Administrator'};
    if(typeof assignments!=='undefined')assignments.filter(a=>dates.includes(a.date)).forEach(a=>{a.publishedAt=a.publishedAt||now;a.version=a.version||1});
    C.audit?.('PLAN_PUBLISHED',key,{dates});C.refresh?.();C.updateScheduleControls?.();C.toast?.('Dienstplan veröffentlicht','Spätere Änderungen werden ab jetzt als Änderungsvorgang dokumentiert.');
  }

  function patch(){
    if(patched)return true;
    const C=window.SFCompliance,B=window.SFBackend||{};
    if(!C||typeof C.publishCurrentWeek!=='function')return false;
    const source=String(C.publishCurrentWeek);
    // Wait until the cloud publication wrapper has been loaded, so this patch is last.
    if(!source.includes('publish_schedule_week'))return false;
    const cloudPublish=C.publishCurrentWeek.bind(C);
    const redesigned=async function(){
      if(B.ready&&B.client)return cloudPublish();
      const key=weekKey(C);
      if(C.publications?.[key]?.publishedAt){C.toast?.('Dienstplan bereits veröffentlicht',new Date(C.publications[key].publishedAt).toLocaleString('de-DE'));return}
      if(!await openDialog(C,key))return;
      localPublish(C,key);
    };
    redesigned.__sfPublishDialogDesignV1=true;
    C.publishCurrentWeek=redesigned;window.spPublishCurrentWeek=redesigned;patched=true;return true;
  }

  function boot(){if(!patch())setTimeout(boot,120)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
