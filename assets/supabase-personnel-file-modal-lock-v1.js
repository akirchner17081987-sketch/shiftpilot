// SchichtFunk – Personalakte: Hauptfenster nicht durch Klick auf den Hintergrund schließen
(function(){
  if(window.__sfPersonnelModalLockV1)return;
  window.__sfPersonnelModalLockV1=true;
  document.addEventListener('click',function(event){
    const backdrop=event.target?.closest?.('.sf-pf-back');
    if(!backdrop)return;
    if(event.target===backdrop){
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  },true);
})();
