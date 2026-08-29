// SchichtFunk – Guard gegen inhaltsgleiche veröffentlichte Schichtänderungen V2
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

  function injectCss(){
    if(document.getElementById('sfNoopChangeCss'))return;
    const s=document.createElement('style');
    s.id='sfNoopChangeCss';
    s.textContent=`
      .sf-noop-backdrop{position:fixed;inset:0;z-index:26000;background:rgba(2,7,13,.72);backdrop-filter:blur(6px);display:grid;place-items:center;padding:20px;animation:sfNoopFade .14s ease-out}
      .sf-noop-card{width:min(430px,94vw);background:linear-gradient(180deg,#0d1c2a 0%,#091522 100%);border:1px solid #29485f;border-radius:16px;box-shadow:0 28px 90px rgba(0,0,0,.55);overflow:hidden;animation:sfNoopPop .18s ease-out}
      .sf-noop-body{padding:24px 24px 20px;display:flex;gap:15px;align-items:flex-start}
      .sf-noop-icon{width:46px;height:46px;flex:0 0 46px;border-radius:13px;display:grid;place-items:center;background:#0d332b;border:1px solid #246e5d;color:#4ce0bd;font-size:24px;font-weight:900;box-shadow:inset 0 0 0 1px rgba(76,224,189,.06)}
      .sf-noop-copy{min-width:0;padding-top:1px}.sf-noop-copy .eyebrow{color:#40d9bc;font-size:10px;letter-spacing:.16em;font-weight:900;margin-bottom:6px}.sf-noop-copy h3{margin:0 0 7px;color:#f2f8fd;font-size:19px;line-height:1.2}.sf-noop-copy p{margin:0;color:#91a9bd;font-size:12px;line-height:1.55}
      .sf-noop-foot{display:flex;justify-content:flex-end;padding:14px 18px;border-top:1px solid #20364a;background:#08131f}
      .sf-noop-ok{min-width:118px;min-height:38px;border:1px solid #2bd8b6;background:#2bd8b6;color:#06261f;border-radius:9px;padding:8px 16px;font-weight:900;font-size:12px;cursor:pointer;transition:.15s ease}
      .sf-noop-ok:hover{background:#43e1c2;transform:translateY(-1px)}.sf-noop-ok:focus{outline:none;box-shadow:0 0 0 3px rgba(43,216,182,.18)}
      @keyframes sfNoopFade{from{opacity:0}to{opacity:1}}@keyframes sfNoopPop{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
      @media(max-width:520px){.sf-noop-body{padding:20px;gap:12px}.sf-noop-icon{width:42px;height:42px;flex-basis:42px}.sf-noop-copy h3{font-size:17px}.sf-noop-foot{padding:12px 16px}.sf-noop-ok{width:100%}}
    `;
    document.head.appendChild(s);
  }

  function showNoopDialog(){
    injectCss();
    document.getElementById('sfNoopChangeDialog')?.remove();
    const b=document.createElement('div');
    b.id='sfNoopChangeDialog';
    b.className='sf-noop-backdrop';
    b.innerHTML=`<div class="sf-noop-card" role="dialog" aria-modal="true" aria-labelledby="sfNoopTitle"><div class="sf-noop-body"><div class="sf-noop-icon">✓</div><div class="sf-noop-copy"><div class="eyebrow">SCHICHTFUNK PRÜFUNG</div><h3 id="sfNoopTitle">Keine Änderung erkannt</h3><p>Es wurden keine Änderungen vorgenommen. Die Schicht entspricht bereits vollständig der veröffentlichten Planung.</p></div></div><div class="sf-noop-foot"><button type="button" class="sf-noop-ok">Verstanden</button></div></div>`;
    const close=()=>{document.removeEventListener('keydown',onKey);b.remove()};
    const onKey=e=>{if(e.key==='Escape'||e.key==='Enter')close()};
    b.querySelector('.sf-noop-ok').onclick=close;
    b.addEventListener('click',e=>{if(e.target===b)close()});
    document.addEventListener('keydown',onKey);
    document.body.appendChild(b);
    setTimeout(()=>b.querySelector('.sf-noop-ok')?.focus(),0);
  }

  C.isNoopPublishedChange=isNoop;

  const original=C.openChangeDrawer.bind(C);
  C.openChangeDrawer=function(payload){
    if(isNoop(payload)){
      showNoopDialog();
      return false;
    }
    return original(payload);
  };
})();