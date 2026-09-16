// SchichtFunk – verständliche, datensparsame Supabase-Auth-Fehler V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  const includes=(text,parts)=>parts.some(part=>text.includes(part));

  B.friendlyAuthError=function(error,fallback='Der Vorgang konnte nicht abgeschlossen werden. Bitte versuche es erneut.'){
    const code=String(error?.code||'').toLowerCase();
    const message=String(error?.message||'').toLowerCase();
    if(code==='weak_password'||includes(message,['weak password','password should','password must','pwned','leaked','compromised'])){
      return 'Dieses Passwort ist nicht sicher genug oder aus einem bekannten Datenleck bekannt. Bitte verwende ein neues, einzigartiges und längeres Passwort. Falls du dich nicht anmelden kannst, nutze „Passwort vergessen?“.';
    }
    if(code==='same_password'||includes(message,['same password','different password'])){
      return 'Das neue Passwort muss sich vom bisherigen Passwort unterscheiden.';
    }
    if(code==='reauthentication_needed'||includes(message,['reauthentication','reauthenticate','nonce'])){
      return 'Bitte bestätige deine Identität erneut und starte die Passwortänderung danach noch einmal.';
    }
    if(code==='over_request_rate_limit'||code==='over_email_send_rate_limit'||includes(message,['rate limit','too many requests'])){
      return 'Es gab zu viele Versuche. Bitte warte einige Minuten und versuche es anschließend erneut.';
    }
    if(code==='invalid_credentials'||includes(message,['invalid login credentials'])){
      return 'E-Mail-Adresse oder Passwort ist nicht korrekt.';
    }
    if(includes(message,['failed to fetch','network','load failed'])){
      return 'Die sichere Verbindung konnte nicht hergestellt werden. Bitte prüfe deine Internetverbindung und versuche es erneut.';
    }
    return fallback;
  };
})();
