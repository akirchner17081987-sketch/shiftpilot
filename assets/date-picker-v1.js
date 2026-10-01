// SchichtFunk: gemeinsame Datumsauswahl. Die vorhandenen ISO-Felder bleiben die Datenquelle.
(function(){
  if(window.SFDatePicker)return;
  const MONTHS=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const DAYS=['Mo','Di','Mi','Do','Fr','Sa','So'];
  let owner=null,panel=null,year=0,month=0,mode='days',focusValue='',probe=null;
  const pad=n=>String(n).padStart(2,'0');
  const monthISO=(y,m)=>String(y).padStart(4,'0')+'-'+pad(m+1);
  const dateISO=(y,m,d)=>monthISO(y,m)+'-'+pad(d);
  const today=()=>{const d=new Date();return dateISO(d.getFullYear(),d.getMonth(),d.getDate())};
  function date(value){const parts=value.split('-').map(Number),d=new Date(0);d.setFullYear(parts[0],parts[1]-1,parts[2]||1);d.setHours(12,0,0,0);return d}
  function usable(input){return input instanceof HTMLInputElement&&['date','month'].includes(input.type)&&!input.matches(':disabled')&&!input.readOnly}
  function allowed(value){probe.min=owner.min;probe.max=owner.max;probe.step=owner.step;probe.value=value;return !!probe.value&&!probe.validity.rangeUnderflow&&!probe.validity.rangeOverflow&&!probe.validity.stepMismatch}
  function monthAllowed(y,m){
    if(y<1||y>9999)return false;
    if(owner.type==='month')return allowed(monthISO(y,m));
    for(let d=1;d<=new Date(y,m+1,0).getDate();d++)if(allowed(dateISO(y,m,d)))return true;
    return false;
  }
  function button(text,label,action){const b=document.createElement('button');b.type='button';b.textContent=text;b.setAttribute('aria-label',label);b.dataset.action=action;return b}
  function close(restore=true){
    if(!owner)return;
    const input=owner;owner=null;
    input.setAttribute('aria-expanded','false');
    if(typeof panel.hidePopover==='function'&&panel.matches(':popover-open'))panel.hidePopover();
    panel.hidden=true;
    if(restore&&input.isConnected&&!input.matches(':disabled'))input.focus({preventScroll:true});
  }
  function commit(value){
    if(!owner||!usable(owner)||(value&&!allowed(value)))return;
    const input=owner,changed=input.value!==value;
    input.value=value;close();
    window.SFDateMonthFormat?.refresh(input);
    if(changed){input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))}
  }
  function place(){
    if(!owner)return;
    const box=owner.getBoundingClientRect(),height=panel.offsetHeight,width=panel.offsetWidth;
    const viewport=window.visualViewport,top=viewport?.offsetTop||0,left=viewport?.offsetLeft||0;
    const vw=viewport?.width||window.innerWidth,vh=viewport?.height||window.innerHeight;
    panel.style.left=Math.max(left+8,Math.min(box.left,left+vw-width-8))+'px';
    const below=box.bottom+8,above=box.top-height-8;
    panel.style.top=Math.max(top+8,Math.min(below+height<=top+vh-8?below:above,top+vh-height-8))+'px';
  }
  function render(focusSelector){
    panel.replaceChildren();
    const head=document.createElement('header');head.className='sf-picker-head';
    const brand=document.createElement('span');brand.className='sf-picker-brand';brand.textContent='SCHICHTFUNK';
    const dismiss=button('×','Kalender schließen','close');dismiss.className='sf-picker-close';head.append(brand,dismiss);
    const nav=document.createElement('div');nav.className='sf-picker-nav';
    const prev=button('‹',mode==='days'?'Vorheriger Monat':'Vorheriges Jahr','prev');
    const next=button('›',mode==='days'?'Nächster Monat':'Nächstes Jahr','next');
    prev.disabled=year===1&&(mode!=='days'||month===0);next.disabled=year===9999&&(mode!=='days'||month===11);
    const title=button(mode==='days'?MONTHS[month]+' '+year:String(year),mode==='days'?'Monat und Jahr wählen':'Tagesauswahl anzeigen','months');
    title.className='sf-picker-title';title.id='sfPickerTitle';title.setAttribute('aria-live','polite');
    if(owner.type==='month'){title.textContent='Monat wählen';title.disabled=true}
    nav.append(prev,title,next);panel.append(head,nav);
    if(mode==='months'){
      const label=document.createElement('label');label.className='sf-picker-year-label';label.textContent='Jahr';
      const input=document.createElement('input');input.type='number';input.min='1';input.max='9999';input.value=String(year);input.dataset.action='year';input.setAttribute('aria-label','Jahr wählen');label.append(input);panel.append(label);
      const grid=document.createElement('div');grid.className='sf-picker-months';grid.setAttribute('aria-label','Monat wählen');
      MONTHS.forEach((name,m)=>{const value=monthISO(year,m),b=button(name,name+' '+year,'month');b.dataset.month=String(m);b.dataset.value=value;b.disabled=!monthAllowed(year,m);b.classList.toggle('selected',owner.value.slice(0,7)===value);b.setAttribute('aria-pressed',String(owner.value.slice(0,7)===value));grid.append(b)});panel.append(grid);
    }else{
      const weekdays=document.createElement('div');weekdays.className='sf-picker-weekdays';weekdays.setAttribute('aria-hidden','true');DAYS.forEach(name=>{const s=document.createElement('span');s.textContent=name;weekdays.append(s)});panel.append(weekdays);
      const grid=document.createElement('div');grid.className='sf-picker-days';grid.setAttribute('role','grid');grid.setAttribute('aria-labelledby','sfPickerTitle');
      const first=date(dateISO(year,month,1)),start=new Date(first);start.setDate(1-(first.getDay()+6)%7);
      const current=today();
      for(let row=0;row<6;row++){
        const line=document.createElement('div');line.setAttribute('role','row');
        for(let col=0;col<7;col++){
          const d=new Date(start);d.setDate(start.getDate()+row*7+col);
          const value=dateISO(d.getFullYear(),d.getMonth(),d.getDate());
          const b=button(String(d.getDate()),d.toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long',year:'numeric'}),'day');
          b.dataset.value=value;b.setAttribute('role','gridcell');b.setAttribute('aria-selected',String(value===owner.value));b.tabIndex=-1;
          b.disabled=d.getFullYear()<1||d.getFullYear()>9999||!allowed(value);
          b.classList.toggle('outside',d.getMonth()!==month);b.classList.toggle('selected',value===owner.value);
          if(value===current){b.classList.add('today');b.setAttribute('aria-current','date')}
          line.append(b);
        }
        grid.append(line);
      }
      const tabbable=Array.from(grid.querySelectorAll('button:not(:disabled)'));
      const initial=tabbable.find(b=>b.dataset.value===focusValue)||tabbable.find(b=>b.dataset.value===owner.value)||tabbable.find(b=>b.dataset.value===current)||tabbable.find(b=>b.dataset.value.slice(0,7)===monthISO(year,month));
      if(initial)initial.tabIndex=0;
      panel.append(grid);
    }
    const foot=document.createElement('footer');foot.className='sf-picker-foot';
    const clear=button('Leeren','Datum leeren','clear');clear.disabled=owner.required||!owner.value;
    const now=owner.type==='month'?today().slice(0,7):today(),current=button(owner.type==='month'?'Aktueller Monat':'Heute',owner.type==='month'?'Aktuellen Monat auswählen':'Heutiges Datum auswählen','today');
    current.disabled=!allowed(now);foot.append(clear,current);panel.append(foot);
    place();
    if(focusSelector)panel.querySelector(focusSelector)?.focus({preventScroll:true});
  }
  function changeMonth(delta){const offset=month+delta;const y=year+Math.floor(offset/12);if(y<1||y>9999)return;year=y;month=(offset%12+12)%12}
  function open(input){
    if(!usable(input)||!input.isConnected||!input.getClientRects().length)return false;
    if(owner===input&&!panel.hidden)return true;
    close(false);owner=input;probe=input.cloneNode(false);probe.removeAttribute('id');probe.removeAttribute('name');
    const base=input.value||input.min||today(),d=date(base);year=d.getFullYear();month=d.getMonth();focusValue=input.type==='date'?base:'';mode=input.type==='month'?'months':'days';
    if(!panel){
      panel=document.createElement('section');panel.id='sfDatePicker';panel.className='sf-date-picker';panel.hidden=true;
      panel.setAttribute('popover','manual');panel.setAttribute('role','dialog');panel.setAttribute('aria-label','SchichtFunk Datumsauswahl');document.body.append(panel);
      panel.addEventListener('click',event=>{
        const b=event.target.closest('button');if(!b||b.disabled)return;
        const action=b.dataset.action;
        if(action==='day')commit(b.dataset.value);
        else if(action==='month'){if(owner.type==='month')commit(b.dataset.value);else{month=Number(b.dataset.month);mode='days';render('[tabindex="0"]')}}
        else if(action==='close')close();
        else if(action==='clear')commit('');
        else if(action==='today')commit(owner.type==='month'?today().slice(0,7):today());
        else if(action==='months'){mode=mode==='days'?'months':'days';render(mode==='months'?'input':'[tabindex="0"]')}
        else if(action==='prev'||action==='next'){const delta=action==='prev'?-1:1;if(mode==='days')changeMonth(delta);else year=Math.min(9999,Math.max(1,year+delta));render('[data-action="'+action+'"]')}
      });
      panel.addEventListener('change',event=>{
        if(event.target.dataset.action!=='year')return;
        const value=Number(event.target.value);if(!Number.isInteger(value)||value<1||value>9999){event.target.value=String(year);return}year=value;render('input');
      });
    }
    // Ein modaler Dialog macht Elemente außerhalb seines DOM-Zweigs inert,
    // auch wenn der Kalender selbst die oberste Anzeigeebene verwendet.
    const host=input.closest('dialog[open]')||document.body;
    if(panel.parentElement!==host)host.append(panel);
    input.setAttribute('aria-haspopup','dialog');input.setAttribute('aria-controls',panel.id);input.setAttribute('aria-expanded','true');
    panel.hidden=false;
    if(typeof panel.showPopover==='function')panel.showPopover();
    render(mode==='days'?'[tabindex="0"]':'input');return true;
  }
  document.addEventListener('pointerdown',event=>{
    if(owner&&!panel.contains(event.target)&&event.target!==owner)close(false);
    if(event.button!==0||!usable(event.target))return;
    event.preventDefault();event.stopImmediatePropagation();open(event.target);
  },true);
  document.addEventListener('click',event=>{
    if(!usable(event.target))return;
    event.preventDefault();event.stopImmediatePropagation();open(event.target);
  },true);
  document.addEventListener('keydown',event=>{
    if(owner&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();return}
    if(usable(event.target)&&['Enter',' ','ArrowDown'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();open(event.target);return}
    if(!owner||!panel.contains(event.target))return;
    const b=event.target.closest('[data-action="day"]');
    if(!b)return;
    if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopImmediatePropagation();commit(b.dataset.value);return}
    const deltas={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};
    const d=date(b.dataset.value);let moved=false;
    if(event.key in deltas){d.setDate(d.getDate()+deltas[event.key]);moved=true}
    else if(event.key==='Home'||event.key==='End'){d.setDate(d.getDate()-(d.getDay()+6)%7+(event.key==='End'?6:0));moved=true}
    else if(event.key==='PageUp'||event.key==='PageDown'){
      const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+(event.key==='PageUp'?-1:1)*(event.shiftKey?12:1));const last=new Date(d);last.setMonth(last.getMonth()+1);last.setDate(0);d.setDate(Math.min(day,last.getDate()));moved=true;
    }
    if(!moved)return;
    event.preventDefault();event.stopImmediatePropagation();
    const value=dateISO(d.getFullYear(),d.getMonth(),d.getDate());if(d.getFullYear()<1||d.getFullYear()>9999||!allowed(value))return;
    year=d.getFullYear();month=d.getMonth();focusValue=value;render('[data-value="'+value+'"]');
  },true);
  document.addEventListener('focusin',event=>{if(owner&&event.target!==owner&&!panel.contains(event.target))close(false)},true);
  document.addEventListener('scroll',event=>{if(owner&&!panel.contains(event.target))place()},true);
  window.addEventListener('resize',place);window.visualViewport?.addEventListener('resize',place);window.visualViewport?.addEventListener('scroll',place);
  new MutationObserver(()=>{if(owner&&(!owner.isConnected||!usable(owner)||!owner.getClientRects().length))close(false)}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','readonly','hidden','class','style']});
  window.SFDatePicker={open,close};
})();
