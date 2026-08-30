// SchichtFunk – semantische Statusmeldungen V2
(function(){
  const base=window.showSaveToast;
  if(typeof base!=='function')return;
  if(!document.getElementById('sfStatusToastCss')){
    const s=document.createElement('style');s.id='sfStatusToastCss';s.textContent=`
      .save-toast.is-error{border-color:#8b3345;background:#351923;color:#ffd7dd}.save-toast.is-error .toast-icon{background:#ef5f76;color:#25070d}.save-toast.is-error small{color:#f1a4b1}
      .save-toast.is-warning{border-color:#855f27;background:#342716;color:#ffe3b3}.save-toast.is-warning .toast-icon{background:#f1ad43;color:#2b1903}.save-toast.is-warning small{color:#dfbd84}
      .save-toast.is-success{border-color:#1f6f5a;background:#0f2d26;color:#c9fff0}.save-toast.is-success .toast-icon{background:#22c995;color:#05261f}.save-toast.is-success small{color:#8edfc7}
    `;document.head.appendChild(s);
  }
  window.showSaveToast=function(title,text,variant){
    const value=String(variant||'').toLowerCase(),haystack=`${title||''} ${text||''}`.toLowerCase();
    const kind=value==='error'||/(fehlgeschlagen|fehler|nicht möglich|konnte nicht|permission denied|blockiert)/.test(haystack)?'error':value==='warning'||/(warnung|prüfen|offen|angepasst)/.test(haystack)?'warning':'success';
    const toast=document.getElementById('saveToast'),icon=toast?.querySelector('.toast-icon');
    toast?.classList.remove('is-success','is-warning','is-error');toast?.classList.add(`is-${kind}`);
    if(icon)icon.textContent=kind==='error'?'!':kind==='warning'?'⚠':'✓';
    return base(title,text);
  };
})();
