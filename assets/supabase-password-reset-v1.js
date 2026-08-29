// SchichtFunk – Passwort vergessen / Passwort zurücksetzen V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  const PROD='https://shiftpilot-two.vercel.app/';
  const RESET_PARAM='passwordReset';
  const recoveryHint=(()=>{
    try{
      const u=new URL(location.href);
      return u.searchParams.get(RESET_PARAM)==='1'||/\btype=recovery\b/i.test(location.hash||'');
    }catch{return false}
  })();
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function css(){
    if(document.getElementById('sfPasswordResetCss'))return;
    const s=document.createElement('style');
    s.id='sfPasswordResetCss';
    s.textContent=`
      .sf-forgot-row{display:flex;justify-content:flex-end;margin-top:-4px;margin-bottom:4px}
      .sf-forgot-link{border:0;background:transparent;color:#55ddc0;padding:3px 0;font-size:11px;font-weight:800;cursor:pointer}
      .sf-forgot-link:hover{text-decoration:underline;color:#7cf0d6}
      .sf-reset-backdrop{position:fixed;inset:0;z-index:25000;background:rgba(2,7,13,.88);backdrop-filter:blur(10px);display:grid;place-items:center;padding:18px}
      .sf-reset-card{width:min(470px,96vw);background:linear-gradient(180deg,#0d1b2a,#08131f);border:1px solid #29455e;border-radius:18px;box-shadow:0 30px 100px rgba(0,0,0,.6);overflow:hidden}
      .sf-reset-head{padding:22px 24px 16px;border-bottom:1px solid #20364b}
      .sf-reset-head h2{margin:4px 0;font-size:23px}.sf-reset-head p{margin:0;color:#8fa5bd;font-size:12px;line-height:1.5}
      .sf-reset-body{padding:20px 24px}.sf-reset-field{display:flex;flex-direction:column;gap:6px;margin:12px 0}
      .sf-reset-field label{font-size:11px;font-weight:800;color:#9eb3c9}.sf-reset-field input{background:#091624;border:1px solid #294159;color:#eef7ff;border-radius:10px;padding:11px 12px;outline:none}
      .sf-reset-msg{display:none;margin-top:12px;padding:10px 12px;border-radius:9px;font-size:12px;line-height:1.45}.sf-reset-msg.show{display:block}.sf-reset-msg.good{background:#0e2d26;border:1px solid #216b59;color:#84ebd0}.sf-reset-msg.bad{background:#321822;border:1px solid #7a2d3c;color:#ff9aa8}
      .sf-reset-foot{display:flex;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:1px solid #20364b}
      @media(max-width:520px){.sf-reset-foot{flex-direction:column-reverse}.sf-reset-foot button{width:100%}}
    `;
    document.head.appendChild(s);
  }

  function close(){document.getElementById('sfPasswordResetBackdrop')?.remove()}
  function cleanRecoveryUrl(){
    try{
      const u=new URL(location.href);
      u.searchParams.delete(RESET_PARAM);
      history.replaceState(null,'',u.pathname+(u.search||'')+'#app');
    }catch{}
  }

  function dialogShell(title,text,body,actions){
    css();close();
    const m=document.createElement('div');m.id='sfPasswordResetBackdrop';m.className='sf-reset-backdrop';
    m.innerHTML=`<div class="sf-reset-card"><div class="sf-reset-head"><div class="eyebrow">SCHICHTFUNK ZUGANG</div><h2>${esc(title)}</h2><p>${esc(text)}</p></div><div class="sf-reset-body">${body}<div id="sfResetMsg" class="sf-reset-msg"></div></div><div class="sf-reset-foot">${actions}</div></div>`;
    document.body.appendChild(m);return m;
  }

  B.passwordResetRequestDialog=function(prefill=''){
    B.closeAuth?.();
    const m=dialogShell('Passwort vergessen?','Gib die E-Mail-Adresse deines SchichtFunk-Kontos ein. Wir senden dir einen Link zum Festlegen eines neuen Passworts.',`<div class="sf-reset-field"><label>E-Mail</label><input id="sfResetEmail" type="email" autocomplete="email" value="${esc(prefill)}"></div>`,`<button class="ghost" id="sfResetCancel">Zurück</button><button class="primary" id="sfResetSend">Reset-Link senden</button>`);
    const msg=m.querySelector('#sfResetMsg');
    const say=(text,kind)=>{msg.textContent=text;msg.className='sf-reset-msg show '+kind};
    m.querySelector('#sfResetCancel').onclick=()=>{close();B.authDialog?.('login')};
    m.querySelector('#sfResetSend').onclick=async()=>{
      const email=m.querySelector('#sfResetEmail').value.trim();
      if(!email)return say('Bitte eine E-Mail-Adresse eingeben.','bad');
      try{
        B.showLoading?.('Reset-Link wird gesendet …');
        const {error}=await B.client.auth.resetPasswordForEmail(email,{redirectTo:PROD+'?'+RESET_PARAM+'=1#app'});
        if(error)throw error;
        B.hideLoading?.();
        say('Wenn für diese E-Mail ein SchichtFunk-Konto besteht, wurde ein Link zum Zurücksetzen des Passworts versendet. Bitte prüfe auch den Spam-Ordner.','good');
        m.querySelector('#sfResetSend').disabled=true;
        m.querySelector('#sfResetSend').textContent='✓ E-Mail angefordert';
      }catch(e){
        B.hideLoading?.();say(e?.message||String(e),'bad');
      }
    };
  };

  B.passwordResetNewDialog=function(){
    B.closeAuth?.();
    const m=dialogShell('Neues Passwort setzen','Lege jetzt ein neues Passwort mit mindestens 8 Zeichen fest.',`<div class="sf-reset-field"><label>Neues Passwort</label><input id="sfNewPassword" type="password" minlength="8" autocomplete="new-password"></div><div class="sf-reset-field"><label>Passwort wiederholen</label><input id="sfNewPassword2" type="password" minlength="8" autocomplete="new-password"></div>`,`<button class="primary" id="sfSaveNewPassword">Passwort speichern</button>`);
    const msg=m.querySelector('#sfResetMsg');
    const say=(text,kind)=>{msg.textContent=text;msg.className='sf-reset-msg show '+kind};
    m.querySelector('#sfSaveNewPassword').onclick=async()=>{
      const p1=m.querySelector('#sfNewPassword').value,p2=m.querySelector('#sfNewPassword2').value;
      if(p1.length<8)return say('Das neue Passwort muss mindestens 8 Zeichen haben.','bad');
      if(p1!==p2)return say('Die beiden Passwörter stimmen nicht überein.','bad');
      try{
        B.showLoading?.('Neues Passwort wird gespeichert …');
        const {error}=await B.client.auth.updateUser({password:p1});
        if(error)throw error;
        B.hideLoading?.();cleanRecoveryUrl();
        say('Dein Passwort wurde erfolgreich geändert.','good');
        const btn=m.querySelector('#sfSaveNewPassword');btn.textContent='Zur Anmeldung';btn.onclick=async()=>{
          try{await B.client.auth.signOut()}catch{}
          close();setTimeout(()=>B.authDialog?.('login'),100);
        };
      }catch(e){B.hideLoading?.();say(e?.message||String(e),'bad')}
    };
  };

  function enhanceLogin(){
    css();
    const modal=document.getElementById('sfAuthBackdrop');if(!modal)return;
    const pw=modal.querySelector('#sfPassword');if(!pw||modal.querySelector('.sf-forgot-row'))return;
    const field=pw.closest('.sf-auth-field');if(!field)return;
    const row=document.createElement('div');row.className='sf-forgot-row';row.innerHTML='<button type="button" class="sf-forgot-link">Passwort vergessen?</button>';
    field.insertAdjacentElement('afterend',row);
    row.querySelector('button').onclick=()=>B.passwordResetRequestDialog(modal.querySelector('#sfEmail')?.value||'');
  }

  const baseAuth=B.authDialog;
  if(typeof baseAuth==='function')B.authDialog=function(mode='login'){
    const r=baseAuth.apply(this,arguments);
    if(mode==='login')setTimeout(enhanceLogin,0);
    return r;
  };

  const baseInit=B.init;
  if(typeof baseInit==='function')B.init=async function(){
    const r=await baseInit.apply(this,arguments);
    if(recoveryHint)setTimeout(()=>B.passwordResetNewDialog(),60);
    return r;
  };

  css();
})();