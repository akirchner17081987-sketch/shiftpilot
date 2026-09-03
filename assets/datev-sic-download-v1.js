// SchichtFunk – DATEV LODAS Download-Endung .sic
(function(){
  if(window.__sfDatevSicDownloadV1)return;
  window.__sfDatevSicDownloadV1=true;

  function useSicExtension(anchor){
    if(!anchor)return;
    const name=String(anchor.getAttribute('download')||anchor.download||'');
    if(/^SchichtFunk_DATEV_LODAS_.+\.txt$/i.test(name)){
      const sic=name.replace(/\.txt$/i,'.sic');
      anchor.setAttribute('download',sic);
      anchor.download=sic;
    }
  }

  // Der bestehende Exporter erzeugt bereits den korrekten LODAS-ASCII-Inhalt.
  // Vor dem Browser-Download wird ausschließlich die Dateiendung auf .sic gesetzt.
  document.addEventListener('click',event=>{
    const anchor=event.target?.closest?.('a[download]');
    useSicExtension(anchor);
  },true);
})();
