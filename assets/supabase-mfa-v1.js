// SchichtFunk – Supabase Authenticator MFA V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sixDigits=/^\d{6}$/;

  function css(){
    if(document.getElementById('sfMfaCss'))return;
    const s=document.createElement('style');s.id='sfMfaCss';s.textContent=`
      .sf-mfa-backdrop{position:fixed;inset:0;z-index:26000;display:grid;place-items:center;padding:18px;background:rgba(2,7,13,.9);backdrop-filter:blur(10px)}
      .sf-mfa-card{width:min(520px,96vw);overflow:hidden;border:1px solid #29455e;border-radius:17px;background:linear-gradient(180deg,#0e1c2b,#08131f);box-shadow:0 30px 90px rgba(0,0,0,.6)}
      .sf-mfa-head{padding:20px 22px 15px;border-bottom:1px solid #20364b}.sf-mfa-head h2{margin:4px 0}.sf-mfa-head p{margin:0;color:#8da4ba;font-size:12px;line-height:1.5}
      .sf-mfa-body{padding:18px 22px}.sf-mfa-field{display:grid;gap:6px;margin:12px 0}.sf-mfa-field label{font-size:11px;font-weight:800;color:#a7bbce}
      .sf-mfa-field input,.sf-mfa-field select{min-height:42px;box-sizing:border-box;border:1px solid #29445d;border-radius:9px;background:#081522;color:#fff;padding:9px 11px;font-size:16px}
      .sf-mfa-code{font-variant-numeric:tabular-nums;letter-spacing:.24em;text-align:center}.sf-mfa-qr{display:grid;place-items:center;margin:12px 0;padding:14px;border-radius:12px;background:#fff}.sf-mfa-qr img{width:min(260px,70vw);height:auto}
      .sf-mfa-secret{overflow-wrap:anywhere;border:1px solid #29445d;border-radius:9px;background:#07111d;padding:10px;color:#c9e5ff;font:12px ui-monospace,SFMono-Regular,Consolas,monospace}
      .sf-mfa-msg{display:none;margin-top:12px;padding:10px 12px;border-radius:9px;font-size:12px}.sf-mfa-msg.show{display:block}.sf-mfa-msg.bad{border:1px solid #7a2d3c;background:#321822;color:#ffadb8}.sf-mfa-msg.good{border:1px solid #216b59;background:#0e2d26;color:#84ebd0}
      .sf-mfa-list{display:grid;gap:8px}.sf-mfa-factor{display:flex;align-items:center;gap:10px;padding:11px;border:1px solid #29445d;border-radius:9px;background:#091624}.sf-mfa-factor div{min-width:0;flex:1}.sf-mfa-factor small{display:block;color:#8da4ba;margin-top:3px}
      .sf-mfa-foot{display:flex;justify-content:flex-end;gap:8px;padding:14px 22px;border-top:1px solid #20364b}@media(max-width:560px){.sf-mfa-foot{flex-direction:column-reverse}.sf-mfa-foot button{width:100%}}
    `;document.head.appendChild(s);
  }

  function shell(title,description){
    css();document.getElementById('sfMfaModal')?.remove();
    const m=document.createElement('div');m.id='sfMfaModal';m.className='sf-mfa-backdrop';
    m.innerHTML=`<div class="sf-mfa-card" role="dialog" aria-modal="true" aria-labelledby="sfMfaTitle"><header class="sf-mfa-head"><div class="eyebrow">KONTOSICHERHEIT</div><h2 id="sfMfaTitle">${esc(title)}</h2><p>${esc(description)}</p></header><div class="sf-mfa-body" id="sfMfaBody"></div><footer class="sf-mfa-foot" id="sfMfaFoot"></footer></div>`;
    document.body.appendChild(m);return m;
  }

  const close=()=>document.getElementById('sfMfaModal')?.remove();
  const say=(m,text,kind='bad')=>{const e=m.querySelector('#sfMfaMsg');if(e){e.className=`sf-mfa-msg show ${kind}`;e.textContent=text}};

  async function assurance(){
    const {data,error}=await B.client.auth.mfa.getAuthenticatorAssuranceLevel();
    if(error)throw error;return data;
  }

  async function allFactors(){
    const {data,error}=await B.client.auth.mfa.listFactors();
    if(error)throw error;
    return [...(data?.totp||[]),...(data?.phone||[])];
  }

  const factors=async()=>(await allFactors()).filter(x=>x.status==='verified');

  async function verifyCode(factorId,code){
    const challenge=await B.client.auth.mfa.challenge({factorId});
    if(challenge.error)throw challenge.error;
    const verify=await B.client.auth.mfa.verify({factorId,challengeId:challenge.data.id,code});
    if(verify.error)throw verify.error;
    return verify.data;
  }

  B.requireMfaChallenge=async function(){
    if(sessionStorage.getItem('sf_demo_session_v1')==='active')return true;
    if(B.__mfaChallengePromise)return B.__mfaChallengePromise;
    B.__mfaChallengePromise=(async()=>{
      const level=await assurance();
      if(level?.currentLevel!=='aal1'||level?.nextLevel!=='aal2')return true;
      const available=await factors();
      if(!available.length)throw new Error('Kein bestätigter Authenticator-Faktor gefunden.');
      return new Promise((resolve,reject)=>{
        const m=shell('Zweiten Faktor bestätigen','Öffne deine Authenticator-App und gib den aktuellen sechsstelligen Code ein.');
        const body=m.querySelector('#sfMfaBody'),foot=m.querySelector('#sfMfaFoot');
        body.innerHTML=`${available.length>1?`<div class="sf-mfa-field"><label for="sfMfaFactor">Authenticator</label><select id="sfMfaFactor">${available.map(x=>`<option value="${esc(x.id)}">${esc(x.friendly_name||'Authenticator')}</option>`).join('')}</select></div>`:''}<div class="sf-mfa-field"><label for="sfMfaCode">Sicherheitscode</label><input id="sfMfaCode" class="sf-mfa-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" autofocus></div><div id="sfMfaMsg" class="sf-mfa-msg" role="alert"></div>`;
        foot.innerHTML='<button class="ghost" id="sfMfaCancel" type="button">Abbrechen</button><button class="primary" id="sfMfaVerify" type="button">Sicher anmelden</button>';
        const input=m.querySelector('#sfMfaCode'),submit=m.querySelector('#sfMfaVerify');
        m.querySelector('#sfMfaCancel').onclick=async()=>{close();try{await B.client.auth.signOut({scope:'local'})}catch{}reject(new Error('Anmeldung abgebrochen.'))};
        const run=async()=>{const code=input.value.replace(/\s/g,'');if(!sixDigits.test(code))return say(m,'Bitte genau sechs Ziffern eingeben.');submit.disabled=true;try{const id=m.querySelector('#sfMfaFactor')?.value||available[0].id;await verifyCode(id,code);const confirmed=await assurance();if(confirmed?.currentLevel!=='aal2')throw new Error('Die sichere Sitzung konnte nicht bestätigt werden.');close();resolve(true)}catch(e){submit.disabled=false;input.select();say(m,e?.message||'Der Code konnte nicht bestätigt werden.')}};
        submit.onclick=run;input.onkeydown=e=>{if(e.key==='Enter')run()};setTimeout(()=>input.focus(),0);
      });
    })().finally(()=>{B.__mfaChallengePromise=null});
    return B.__mfaChallengePromise;
  };

  async function enroll(m){
    const body=m.querySelector('#sfMfaBody'),foot=m.querySelector('#sfMfaFoot');
    body.innerHTML='<div id="sfMfaMsg" class="sf-mfa-msg show good">Authenticator wird vorbereitet …</div>';foot.innerHTML='';
    let factorId=null,verified=false;
    try{
      for(const stale of (await allFactors()).filter(x=>x.factor_type==='totp'&&x.status!=='verified')){
        const removed=await B.client.auth.mfa.unenroll({factorId:stale.id});
        if(removed.error)throw removed.error;
      }
      const result=await B.client.auth.mfa.enroll({factorType:'totp',friendlyName:'SchichtFunk Authenticator'});
      if(result.error)throw result.error;factorId=result.data.id;
      body.innerHTML='<div class="sf-mfa-qr"><img id="sfMfaQr" alt="QR-Code für Authenticator-App"></div><p>Scanne den QR-Code mit deiner Authenticator-App. Falls das nicht möglich ist, trage den Schlüssel manuell ein:</p><div class="sf-mfa-secret" id="sfMfaSecret"></div><div class="sf-mfa-field"><label for="sfMfaEnrollCode">Ersten Sicherheitscode eingeben</label><input id="sfMfaEnrollCode" class="sf-mfa-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}"></div><div id="sfMfaMsg" class="sf-mfa-msg" role="alert"></div>';
      body.querySelector('#sfMfaQr').src=result.data.totp.qr_code;body.querySelector('#sfMfaSecret').textContent=result.data.totp.secret;
      foot.innerHTML='<button class="ghost" id="sfMfaEnrollCancel" type="button">Abbrechen</button><button class="primary" id="sfMfaEnrollVerify" type="button">Aktivieren</button>';
      const cleanup=async()=>{if(factorId&&!verified)try{await B.client.auth.mfa.unenroll({factorId})}catch{}};
      foot.querySelector('#sfMfaEnrollCancel').onclick=async()=>{await cleanup();close()};
      foot.querySelector('#sfMfaEnrollVerify').onclick=async e=>{const code=body.querySelector('#sfMfaEnrollCode').value.replace(/\s/g,'');if(!sixDigits.test(code))return say(m,'Bitte genau sechs Ziffern eingeben.');e.currentTarget.disabled=true;try{await verifyCode(factorId,code);verified=true;say(m,'Der Zwei-Faktor-Schutz ist jetzt aktiv.','good');setTimeout(()=>B.openMfaSettings(),700)}catch(x){e.currentTarget.disabled=false;say(m,x?.message||'Aktivierung fehlgeschlagen.')}};
    }catch(e){body.innerHTML='<div id="sfMfaMsg" class="sf-mfa-msg show bad"></div>';say(m,e?.message||'Authenticator konnte nicht eingerichtet werden.');foot.innerHTML='<button class="ghost" id="sfMfaClose" type="button">Schließen</button>';foot.querySelector('#sfMfaClose').onclick=close}
  }

  B.openMfaSettings=async function(){
    if(!B.ready||!B.client)return;
    const m=shell('Zwei-Faktor-Schutz','Verwalte bestätigte Authenticator-Apps für dein persönliches Konto.');
    const body=m.querySelector('#sfMfaBody'),foot=m.querySelector('#sfMfaFoot');body.innerHTML='<div id="sfMfaMsg" class="sf-mfa-msg show good">Sicherheitsstatus wird geladen …</div>';
    try{
      const available=await allFactors();
      body.innerHTML=`<div class="sf-mfa-list">${available.length?available.map(x=>`<div class="sf-mfa-factor"><div><b>${esc(x.friendly_name||'Authenticator')}</b><small>${x.status==='verified'?'Bestätigter zweiter Faktor':'Einrichtung noch nicht abgeschlossen'}</small></div><button class="ghost" data-mfa-remove="${esc(x.id)}" type="button">Entfernen</button></div>`).join(''):'<div class="sf-mfa-msg show bad">Noch kein Authenticator eingerichtet.</div>'}</div><div id="sfMfaMsg" class="sf-mfa-msg" role="alert"></div>`;
      foot.innerHTML='<button class="ghost" id="sfMfaClose" type="button">Schließen</button><button class="primary" id="sfMfaAdd" type="button">Authenticator hinzufügen</button>';
      foot.querySelector('#sfMfaClose').onclick=close;foot.querySelector('#sfMfaAdd').onclick=()=>enroll(m);
      body.querySelectorAll('[data-mfa-remove]').forEach(btn=>btn.onclick=async()=>{if(!confirm('Diesen Authenticator wirklich entfernen? Halte vorher einen weiteren Faktor bereit.'))return;btn.disabled=true;const result=await B.client.auth.mfa.unenroll({factorId:btn.dataset.mfaRemove});if(result.error){btn.disabled=false;say(m,result.error.message);return}await B.client.auth.refreshSession();B.openMfaSettings()});
    }catch(e){body.innerHTML='<div id="sfMfaMsg" class="sf-mfa-msg show bad"></div>';say(m,e?.message||'Sicherheitsstatus konnte nicht geladen werden.');foot.innerHTML='<button class="ghost" id="sfMfaClose" type="button">Schließen</button>';foot.querySelector('#sfMfaClose').onclick=close}
  };

  function wrapBoot(){
    if(typeof B.boot!=='function'){setTimeout(wrapBoot,25);return}
    if(B.boot.__mfaWrapped)return;
    const base=B.boot;
    const wrapped=async session=>{if(sessionStorage.getItem('sf_demo_session_v1')!=='active'){await B.requireMfaChallenge();const current=await B.client.auth.getSession();if(current.data?.session)session=current.data.session}return base(session)};
    wrapped.__mfaWrapped=true;B.boot=wrapped;
  }
  wrapBoot();
})();
