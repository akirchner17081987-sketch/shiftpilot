// SchichtFunk – automatische Demo-Sitzungsdauer V1
(function(){
  if(window.__sfDemoSessionV1)return;
  if(sessionStorage.getItem('sf_demo_session_v1')!=='active')return;
  window.__sfDemoSessionV1=true;

  const LAST_ACTIVITY_KEY='sf_demo_last_activity_v1';
  const DEFAULT_IDLE_MS=30*60*1000;
  const DEFAULT_WARNING_MS=5*60*1000;
  const LOCAL_TEST=/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const params=new URLSearchParams(location.search);
  const configuredIdle=LOCAL_TEST?Number(params.get('sf_demo_idle_ms')):0;
  const configuredWarning=LOCAL_TEST?Number(params.get('sf_demo_warn_ms')):0;
  const IDLE_MS=configuredIdle>=5000?configuredIdle:DEFAULT_IDLE_MS;
  const WARNING_MS=configuredWarning>=2000&&configuredWarning<IDLE_MS?configuredWarning:DEFAULT_WARNING_MS;
  let lastActivity=Number(sessionStorage.getItem(LAST_ACTIVITY_KEY))||Date.now();
  let lastRecorded=0;
  let interval=0;
  let absoluteAcknowledged=false;
  let ending=false;

  function absoluteExpiry(){
    const value=Date.parse(sessionStorage.getItem('sf_demo_expires_at_v1')||'');
    return Number.isFinite(value)?value:Infinity;
  }

  function state(now=Date.now()){
    const idleDeadline=lastActivity+IDLE_MS;
    const serverDeadline=absoluteExpiry();
    const deadline=Math.min(idleDeadline,serverDeadline);
    return {deadline,remaining:Math.max(0,deadline-now),reason:serverDeadline<=idleDeadline?'maximum':'idle'};
  }

  function formatTime(ms){
    const seconds=Math.max(0,Math.ceil(ms/1000));
    const minutes=Math.floor(seconds/60);
    const rest=seconds%60;
    return minutes?`${minutes}:${String(rest).padStart(2,'0')} Min.`:`${rest} Sek.`;
  }

  function ensureCss(){
    if(document.getElementById('sfDemoSessionCss'))return;
    const style=document.createElement('style');
    style.id='sfDemoSessionCss';
    style.textContent=`
      .sf-demo-session-backdrop{position:fixed;inset:0;z-index:90000;display:grid;place-items:center;padding:20px;background:rgba(1,8,14,.78);backdrop-filter:blur(8px)}
      .sf-demo-session-card{width:min(470px,100%);border:1px solid #31536a;border-radius:18px;background:linear-gradient(155deg,#0d2030,#081521);color:#edf7ff;padding:28px;box-shadow:0 30px 90px rgba(0,0,0,.55);font-family:Inter,system-ui,sans-serif}
      .sf-demo-session-icon{width:48px;height:48px;display:grid;place-items:center;margin-bottom:18px;border:1px solid #2b7566;border-radius:14px;background:#0d332c;color:#7ef0d7;font-size:24px}
      .sf-demo-session-card h2{margin:0 0 9px;font-size:25px;letter-spacing:-.02em}.sf-demo-session-card p{margin:0;color:#a8bdcf;font-size:14px;line-height:1.6}
      .sf-demo-session-time{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:20px 0;padding:14px 15px;border:1px solid #28485c;border-radius:11px;background:#07131e;color:#a8bdcf;font-size:12px}.sf-demo-session-time strong{color:#84ecd5;font-size:19px;font-variant-numeric:tabular-nums}
      .sf-demo-session-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}.sf-demo-session-actions button{min-height:42px;padding:9px 15px;border-radius:9px;font:800 13px Inter,system-ui,sans-serif;cursor:pointer}.sf-demo-session-end{border:1px solid #375066;background:#0b1824;color:#c6d5e2}.sf-demo-session-continue{border:0;background:linear-gradient(135deg,#23d5bd,#298cf0);color:#fff}
      @media(max-width:520px){.sf-demo-session-card{padding:23px}.sf-demo-session-actions{display:grid}.sf-demo-session-actions button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function hideWarning(){document.getElementById('sfDemoSessionWarning')?.remove()}

  function continueSession(reason){
    if(reason==='idle')touch(true);
    else absoluteAcknowledged=true;
    hideWarning();
  }

  function showWarning(current){
    ensureCss();
    let backdrop=document.getElementById('sfDemoSessionWarning');
    if(!backdrop){
      backdrop=document.createElement('div');
      backdrop.id='sfDemoSessionWarning';
      backdrop.className='sf-demo-session-backdrop';
      backdrop.setAttribute('role','alertdialog');
      backdrop.setAttribute('aria-modal','true');
      backdrop.setAttribute('aria-labelledby','sfDemoSessionTitle');
      backdrop.innerHTML=`<section class="sf-demo-session-card"><div class="sf-demo-session-icon">◷</div><h2 id="sfDemoSessionTitle">Demo-Sitzung endet bald</h2><p id="sfDemoSessionText"></p><div class="sf-demo-session-time"><span>Verbleibende Zeit</span><strong id="sfDemoSessionCountdown"></strong></div><div class="sf-demo-session-actions"><button type="button" class="sf-demo-session-end">Demo jetzt beenden</button><button type="button" class="sf-demo-session-continue"></button></div></section>`;
      document.body.appendChild(backdrop);
      backdrop.querySelector('.sf-demo-session-end').onclick=()=>end('manual');
      backdrop.querySelector('.sf-demo-session-continue').onclick=()=>continueSession(state().reason);
      backdrop.querySelector('.sf-demo-session-continue').focus();
    }
    const maximum=current.reason==='maximum';
    backdrop.querySelector('#sfDemoSessionText').textContent=maximum
      ?'Die maximale Sicherheitsdauer dieser Demo ist fast erreicht. Danach ist eine erneute Anmeldung erforderlich.'
      :'Es gab längere Zeit keine Bedienung. Möchten Sie die Demo-Sitzung fortsetzen?';
    backdrop.querySelector('.sf-demo-session-continue').textContent=maximum?'Bis zum Ablauf weiter':'Sitzung fortsetzen';
    backdrop.querySelector('#sfDemoSessionCountdown').textContent=formatTime(current.remaining);
  }

  function end(reason){
    if(ending)return;
    ending=true;clearInterval(interval);hideWarning();
    if(typeof window.sfExpireDemo==='function')window.sfExpireDemo(reason);
    else location.replace(`/demo?expired=${encodeURIComponent(reason)}`);
  }

  function tick(){
    const current=state();
    if(current.remaining<=0)return end(current.reason);
    const shouldWarn=current.remaining<=WARNING_MS&&!(current.reason==='maximum'&&absoluteAcknowledged&&current.remaining>60000);
    if(shouldWarn)showWarning(current);else hideWarning();
  }

  function touch(force=false){
    const now=Date.now();
    if(!force&&now-lastRecorded<1000)return;
    lastRecorded=now;lastActivity=now;absoluteAcknowledged=false;
    sessionStorage.setItem(LAST_ACTIVITY_KEY,String(now));
    if(document.getElementById('sfDemoSessionWarning')&&state(now).reason==='idle')hideWarning();
  }

  function start(){
    touch(true);
    ['pointerdown','keydown','touchstart','wheel'].forEach(type=>document.addEventListener(type,()=>touch(),{passive:true,capture:true}));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
    interval=setInterval(tick,1000);tick();
  }

  window.SFDemoSession={touch,getStatus:()=>state(),idleMinutes:IDLE_MS/60000,warningMinutes:WARNING_MS/60000};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
