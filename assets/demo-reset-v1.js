// SchichtFunk – sicherer Demo-Reset V1
(function(){
  if(window.__sfDemoResetV1)return;window.__sfDemoResetV1=true;
  if(sessionStorage.getItem('sf_demo_session_v1')!=='active')return;

  const RESET_EXACT_KEYS=new Set([
    'sf_demo_marketplace_v1',
    'sf_demo_time_tracking_v2',
    'sf_demo_datev_v2',
    'sf_schedule_view_mode_v1'
  ]);
  const RESET_PREFIXES=['sf_demo_data_'];

  function ensureCss(){
    if(document.getElementById('sfDemoResetCss'))return;
    const s=document.createElement('style');s.id='sfDemoResetCss';s.textContent=`
      #sfDemoResetBtn{border-color:#6f5730!important;color:#ffd18b!important;background:#241d13!important}
      #sfDemoResetBtn:hover{border-color:#a47a37!important;background:#302417!important;color:#ffe1ad!important}
      .sf-demo-reset-backdrop{position:fixed;inset:0;z-index:31000;display:grid;place-items:center;padding:20px;background:rgba(2,7,13,.8);backdrop-filter:blur(7px)}
      .sf-demo-reset-modal{width:min(540px,96vw);overflow:hidden;border:1px solid #3b4f61;border-radius:16px;background:linear-gradient(180deg,#0f1f30,#091522);color:#edf7ff;box-shadow:0 30px 100px rgba(0,0,0,.64)}
      .sf-demo-reset-head{display:flex;gap:14px;align-items:flex-start;padding:22px 23px 18px;border-bottom:1px solid #21384d;background:linear-gradient(180deg,rgba(255,189,79,.08),transparent)}
      .sf-demo-reset-icon{flex:none;width:44px;height:44px;display:grid;place-items:center;border:1px solid #7b5a28;border-radius:12px;background:#302516;color:#ffd08b;font-size:22px}
      .sf-demo-reset-copy{flex:1;min-width:0}.sf-demo-reset-eyebrow{color:#ffbd4f;font-size:10px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}.sf-demo-reset-head h2{margin:5px 0 5px;font-size:21px}.sf-demo-reset-head p{margin:0;color:#8fa6bc;font-size:12px;line-height:1.5}
      .sf-demo-reset-x{flex:none;width:36px;height:36px;border:1px solid #2c465e;border-radius:9px;background:#102030;color:#a9bfd2}
      .sf-demo-reset-body{padding:20px 23px}.sf-demo-reset-info{padding:13px 14px;border:1px solid #315b53;border-radius:10px;background:#102721;color:#bce4d9;font-size:12px;line-height:1.55}.sf-demo-reset-info strong{display:block;margin-bottom:4px;color:#effaf7}
      .sf-demo-reset-list{margin:13px 0 0;padding:0;list-style:none;display:grid;gap:7px}.sf-demo-reset-list li{display:grid;grid-template-columns:20px 1fr;gap:7px;align-items:start;color:#9db1c4;font-size:11px;line-height:1.45}.sf-demo-reset-list i{font-style:normal;color:#55dfbd;font-weight:900}
      .sf-demo-reset-warning{margin-top:14px;padding:11px 12px;border-left:3px solid #ffbd4f;background:#211c14;color:#dcc69f;font-size:11px;line-height:1.5}
      .sf-demo-reset-foot{display:flex;justify-content:flex-end;gap:9px;padding:16px 23px;border-top:1px solid #21384d;background:#091521}.sf-demo-reset-foot button{min-height:40px;padding:9px 14px;border-radius:9px;font-size:12px;font-weight:800}
      .sf-demo-reset-cancel{border:1px solid #2a455d;background:#0d1c2b;color:#b8cbe0}.sf-demo-reset-confirm{border:1px solid #9d7434;background:#6d4d20;color:#fff1d5}.sf-demo-reset-confirm:hover{background:#825d28}
      @media(max-width:560px){.sf-demo-reset-head,.sf-demo-reset-body,.sf-demo-reset-foot{padding-left:17px;padding-right:17px}.sf-demo-reset-foot{flex-direction:column-reverse}.sf-demo-reset-foot button{width:100%}}
    `;document.head.appendChild(s);
  }

  function clearDemoState(){
    const keepSession=sessionStorage.getItem('sf_demo_session_v1');
    const keepBackup=sessionStorage.getItem('sf_demo_auth_backup_v1');
    for(let i=sessionStorage.length-1;i>=0;i--){
      const key=sessionStorage.key(i);if(!key)continue;
      if(RESET_EXACT_KEYS.has(key)||RESET_PREFIXES.some(prefix=>key.startsWith(prefix)))sessionStorage.removeItem(key);
    }
    if(keepSession)sessionStorage.setItem('sf_demo_session_v1',keepSession);
    if(keepBackup)sessionStorage.setItem('sf_demo_auth_backup_v1',keepBackup);
  }

  function resetNow(){
    clearDemoState();
    try{history.replaceState(null,'',location.pathname+'?demo=1#app')}catch{}
    location.reload();
  }

  function openDialog(){
    ensureCss();document.getElementById('sfDemoResetDialog')?.remove();
    const back=document.createElement('div');back.id='sfDemoResetDialog';back.className='sf-demo-reset-backdrop';
    back.innerHTML=`<section class="sf-demo-reset-modal" role="alertdialog" aria-modal="true" aria-labelledby="sfDemoResetTitle"><header class="sf-demo-reset-head"><div class="sf-demo-reset-icon">↻</div><div class="sf-demo-reset-copy"><div class="sf-demo-reset-eyebrow">Demo-Modus · Zurücksetzen</div><h2 id="sfDemoResetTitle">Demo auf Standard zurücksetzen?</h2><p>Der Demo-Nutzer beginnt anschließend wieder mit dem aktuellen Präsentations-Ausgangsstand.</p></div><button type="button" class="sf-demo-reset-x" aria-label="Schließen">✕</button></header><div class="sf-demo-reset-body"><div class="sf-demo-reset-info"><strong>Unsere Projektänderungen bleiben erhalten.</strong>Zurückgesetzt werden ausschließlich Daten und Aktionen dieser Demo-Sitzung. Produktivdaten, Quellcode, Funktionen und die aktuellen Schichtdefinitionen werden nicht verändert.</div><ul class="sf-demo-reset-list"><li><i>✓</i><span>Dienstplan, Mitarbeiteränderungen, Abwesenheiten und SOLL/IST zurück auf Demo-Standard</span></li><li><i>✓</i><span>Zeiterfassung, Marktplatz, DATEV-Demodaten und Compliance-/Veröffentlichungsstatus neu starten</span></li><li><i>✓</i><span>Aktuelle Produktfeatures wie O1S, QA und spätere Verbesserungen bleiben Bestandteil des neuen Demo-Standards</span></li></ul><div class="sf-demo-reset-warning">Nicht rückgängig zu machen: Änderungen, die der aktuelle Demo-Nutzer in dieser Demo-Sitzung vorgenommen hat, werden verworfen.</div></div><footer class="sf-demo-reset-foot"><button type="button" class="sf-demo-reset-cancel">Abbrechen</button><button type="button" class="sf-demo-reset-confirm">Demo jetzt zurücksetzen</button></footer></section>`;
    document.body.appendChild(back);
    const close=()=>back.remove();
    back.querySelector('.sf-demo-reset-x').onclick=close;
    back.querySelector('.sf-demo-reset-cancel').onclick=close;
    back.querySelector('.sf-demo-reset-confirm').onclick=resetNow;
    back.onclick=e=>{if(e.target===back)close()};
    back.onkeydown=e=>{if(e.key==='Escape')close()};
    back.querySelector('.sf-demo-reset-confirm').focus();
  }

  function ensureButton(){
    if(sessionStorage.getItem('sf_demo_session_v1')!=='active')return;
    ensureCss();
    const top=document.querySelector('.top-actions');if(!top)return;
    let btn=document.getElementById('sfDemoResetBtn');
    if(!btn){
      btn=document.createElement('button');btn.id='sfDemoResetBtn';btn.className='iconbtn';btn.type='button';btn.innerHTML='↻ Demo zurücksetzen';btn.title='Nur diese Demo-Sitzung auf den aktuellen Standard zurücksetzen';btn.onclick=openDialog;
      const exit=document.getElementById('sfDemoExitBtn');if(exit)top.insertBefore(btn,exit);else top.appendChild(btn);
    }
  }

  const observer=new MutationObserver(ensureButton);
  function boot(){ensureButton();if(document.body)observer.observe(document.body,{childList:true,subtree:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.sfResetDemo=openDialog;
})();
