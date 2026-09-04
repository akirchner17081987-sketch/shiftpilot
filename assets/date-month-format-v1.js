// SchichtFunk – zentrale Datums-/Monatslogik V1
(function(){
  if(window.__sfDateMonthFormatV1)return;window.__sfDateMonthFormatV1=true;

  const MONTHS=['Jan.','Feb.','Mär.','Apr.','Mai','Jun.','Jul.','Aug.','Sep.','Okt.','Nov.','Dez.'];
  const PICKER_ICON_HITBOX=40;

  function isPickerInput(input){
    return input instanceof HTMLInputElement&&(input.type==='month'||input.type==='date');
  }

  function formatMonthShort(value){
    const m=String(value||'').match(/^(\d{4})-(0[1-9]|1[0-2])$/);
    if(!m)return 'Monat wählen';
    return `${MONTHS[Number(m[2])-1]} ${m[1]}`;
  }

  function xmlEscape(value){
    return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  }

  function labelImage(text,disabled=false){
    const fill=disabled?'#8fa5ba':'#e5f0fb';
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="124" height="20" viewBox="0 0 124 20"><text x="0" y="14" fill="${fill}" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="12" font-weight="600">${xmlEscape(text)}</text></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  function sync(input){
    if(!(input instanceof HTMLInputElement)||input.type!=='month')return;
    const text=formatMonthShort(input.value);
    const signature=`${input.value}|${input.disabled?'1':'0'}`;
    if(input.dataset.sfMonthShortSignature===signature)return;
    input.dataset.sfMonthShortSignature=signature;
    input.dataset.sfMonthShort=text;
    input.style.setProperty('--sf-month-label-image',labelImage(text,input.disabled));
    input.classList.add('sf-month-shortened');
    if(!input.getAttribute('aria-label')&&!input.getAttribute('title'))input.setAttribute('title',text);
  }

  function syncAll(root=document){
    if(root instanceof HTMLInputElement&&root.type==='month')sync(root);
    root.querySelectorAll?.('input[type="month"]').forEach(sync);
  }

  function openNativePicker(input){
    if(!isPickerInput(input)||input.disabled||input.readOnly)return false;
    try{
      input.focus({preventScroll:true});
      if(typeof input.showPicker==='function'){
        input.showPicker();
        return true;
      }
    }catch(err){
      // Browser kann showPicker blockieren; dann übernimmt das native Standardverhalten.
    }
    return false;
  }

  // Das sichtbare türkisfarbene Kalender-Symbol ist ein CSS-Hintergrund.
  // Deshalb wird sein rechter 40px-Bereich zentral als echter Picker-Button behandelt.
  document.addEventListener('pointerdown',e=>{
    const input=e.target;
    if(!isPickerInput(input)||input.disabled||input.readOnly)return;
    const rect=input.getBoundingClientRect();
    if(e.clientX<rect.right-PICKER_ICON_HITBOX)return;
    if(openNativePicker(input)){
      e.preventDefault();
      e.stopPropagation();
    }
  },true);

  // Tastatur-/synthetische Klicks auf den rechten Symbolbereich bleiben als Fallback nutzbar.
  document.addEventListener('click',e=>{
    const input=e.target;
    if(!isPickerInput(input)||input.disabled||input.readOnly)return;
    if(e.detail===0)openNativePicker(input);
  },true);

  window.SFDateMonthFormat={
    monthNamesShort:[...MONTHS],
    formatMonthShort,
    openPicker:openNativePicker,
    refresh:syncAll
  };

  document.addEventListener('input',e=>{if(e.target?.matches?.('input[type="month"]'))sync(e.target)},true);
  document.addEventListener('change',e=>{if(e.target?.matches?.('input[type="month"]'))sync(e.target)},true);
  document.addEventListener('focusin',e=>{if(e.target?.matches?.('input[type="month"]'))sync(e.target)},true);

  const mo=new MutationObserver(records=>{
    records.forEach(r=>r.addedNodes.forEach(n=>{if(n.nodeType===1)syncAll(n)}));
  });
  mo.observe(document.documentElement,{childList:true,subtree:true});

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>syncAll(),{once:true});
  else syncAll();

  // Einige Module setzen Monatswerte programmgesteuert ohne change-Event.
  // Der leichte Abgleich hält die sichtbare Kurzform deshalb zuverlässig synchron.
  setInterval(()=>syncAll(),750);
})();
