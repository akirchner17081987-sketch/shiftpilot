/* Orbit presentation for the employee portal. Existing views and actions own the data. */
(function () {
  'use strict';
  if (window.SFEmployeeOrbit) return;
  const groups = [
    {id:'home',label:'Übersicht',icon:'home',items:[['dashboard','Übersicht']]},
    {id:'duties',label:'Meine Dienste',icon:'calendar',items:[['shifts','Meine Schichten'],['disruptions','Ersatzanfragen'],['marketplace','Schicht-Marktplatz'],['handover','Schichtübergabe']]},
    {id:'requests',label:'Zeit & Anträge',icon:'clock',items:[['time','Arbeitszeit'],['changes','Schichtänderungen'],['swaps','Schichttausch'],['absences','Abwesenheiten'],['wishes','Wunschplanung']]},
    {id:'account',label:'Mein Konto',icon:'person',items:[['account','Stundenkonto'],['wage','Lohnvorschau'],['profile','Mein Profil']]}
  ];
  const paths = {
    home:'<path d="m3 10 9-7 9 7v10H3Zm6 10v-7h6v7"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    person:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    arrow:'<path d="m9 5 7 7-7 7"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>'
  };
  const icon = name => '<span class="sf-orbit-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+paths[name]+'</svg></span>';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let portal, dock, popup, openGroup, resize, queued=false, animations=[];
  const backend = () => window.SFBackend || {};
  const motion = () => { if(reduced.matches)return 'off';try{return localStorage.getItem('sf_orbit_motion_v1')||'full'}catch{return 'full'} };
  function close(restore=false) {
    const previous=openGroup;openGroup=null;
    animations.forEach(a=>a.cancel());animations=[];
    if(!popup)return;
    popup.classList.remove('is-open');popup.inert=true;popup.setAttribute('aria-hidden','true');
    dock.querySelectorAll('[aria-expanded]').forEach(b=>b.setAttribute('aria-expanded','false'));
    if(restore&&previous)dock.querySelector('[data-employee-orbit="'+previous.id+'"]')?.focus({preventScroll:true});
  }
  function position() {
    if(!openGroup||!portal?.isConnected)return;
    const anchor=dock.querySelector('[data-employee-orbit="'+openGroup.id+'"]').getBoundingClientRect(),bounds=dock.getBoundingClientRect();
    const width=Math.min(320,innerWidth-24),left=Math.max(12,Math.min(anchor.left+anchor.width/2-width/2,innerWidth-width-12));
    popup.style.width=width+'px';popup.style.left=left+'px';popup.style.bottom=Math.max(12,innerHeight-bounds.top+10)+'px';popup.style.maxHeight=Math.max(80,bounds.top-22)+'px';
    popup.style.setProperty('--orbit-pointer',Math.max(18,Math.min(anchor.left+anchor.width/2-left,width-18))+'px');
  }
  function navigate(view) {
    close();backend().employeePortalNavigate?.(view);
    requestAnimationFrame(()=>{const heading=portal?.querySelector(view==='dashboard'?'.sf-portal-welcome h1':'.sf-employee-view-head h1');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true})}});
    sync();
  }
  function syncCounts() {
    if(!popup||!openGroup)return;
    popup.querySelectorAll('[data-employee-orbit-view]').forEach(b=>{
      const view=b.dataset.employeeOrbitView,count=portal.querySelector('.sf-employee-tile [data-count-for="'+view+'"]')?.textContent||'0',badge=b.querySelector('.sf-employee-nav-count');
      if(badge.textContent!==count)badge.textContent=count;
      badge.hidden=count==='0';
      if(portal.dataset.sfPortalActive===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
    });
  }
  function reveal(group) {
    if(openGroup===group){close(true);return}
    close();openGroup=group;
    popup.querySelector('h2').textContent=group.label;
    const entries=popup.querySelector('.sf-orbit-entries');entries.replaceChildren();
    group.items.forEach(([view,label])=>{
      const button=document.createElement('button');button.type='button';button.className='sf-orbit-entry';button.dataset.employeeOrbitView=view;
      button.innerHTML=icon(group.icon)+'<span class="sf-orbit-entry-label">'+label+'</span><em class="sf-employee-nav-count"></em>'+icon('arrow');
      button.addEventListener('click',()=>navigate(view));entries.append(button);
    });
    syncCounts();popup.inert=false;popup.setAttribute('aria-hidden','false');popup.classList.add('is-open');
    dock.querySelector('[data-employee-orbit="'+group.id+'"]').setAttribute('aria-expanded','true');position();
    const mode=motion(),frame=popup.querySelector('.sf-orbit-motion-frame');
    if(mode!=='off'&&frame.animate)animations.push(frame.animate(mode==='subtle'?[{opacity:.5,transform:'translateY(6px)'},{opacity:1,transform:'none'}]:[
      {opacity:.1,transform:'perspective(750px) translateY(24px) rotateX(32deg) scale(.85)',filter:'blur(8px) brightness(1.6)'},
      {opacity:.9,transform:'perspective(750px) translateY(-2px) rotateX(-3deg) scale(1.015)',filter:'blur(0) brightness(1.2)',offset:.68},
      {opacity:1,transform:'none',filter:'blur(0) brightness(1)'}
    ],{duration:mode==='subtle'?320:1000,easing:'cubic-bezier(.2,.8,.2,1)'}));
    entries.querySelector('button')?.focus({preventScroll:true});
  }
  function sync() {
    if(!portal?.isConnected)return;
    const active=portal.dataset.sfPortalActive||'dashboard';
    groups.forEach(group=>{
      const button=dock.querySelector('[data-employee-orbit="'+group.id+'"]'),item=group.items.find(([view])=>view===active),detail=button.querySelector('small');
      button.classList.toggle('is-current',!!item);
      if(item)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');
      const label=item&&group.id!=='home'?item[1]:'';if(detail.textContent!==label)detail.textContent=label;detail.hidden=!label;
    });
    const theme=portal.querySelector('.sf-employee-theme'),light=document.documentElement.dataset.sfTheme==='light',label=light?'Zum dunklen Modus wechseln':'Zum hellen Modus wechseln';
    theme.textContent=light?'☾':'☀';theme.setAttribute('aria-label',label);theme.title=label;theme.setAttribute('aria-pressed',String(light));
    syncCounts();position();
  }
  function mount(next) {
    close();resize?.disconnect();portal=next;
    portal.classList.add('sf-employee-orbit');
    dock=document.createElement('nav');dock.className='sf-orbit-dock';dock.setAttribute('aria-label','Mitarbeiterportal Hauptnavigation');
    groups.forEach(group=>{
      const button=document.createElement('button');button.type='button';button.className='sf-orbit-category';button.dataset.employeeOrbit=group.id;
      button.innerHTML=icon(group.icon)+'<span class="sf-orbit-category-copy"><span>'+group.label+'</span><small hidden></small></span>';
      if(group.id!=='home'){button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','sfEmployeeOrbitPopup');button.innerHTML+=icon('arrow')}
      button.addEventListener('click',()=>group.id==='home'?navigate('dashboard'):reveal(group));dock.append(button);
    });
    popup=document.createElement('section');popup.id='sfEmployeeOrbitPopup';popup.className='sf-orbit-popup';popup.setAttribute('aria-labelledby','sfEmployeeOrbitTitle');popup.setAttribute('aria-hidden','true');popup.inert=true;
    popup.innerHTML='<div class="sf-orbit-motion-frame" aria-hidden="true"></div><header class="sf-orbit-popup-head"><h2 id="sfEmployeeOrbitTitle"></h2><button type="button" aria-label="Navigationsmenü schließen">'+icon('close')+'</button></header><div class="sf-orbit-entries"></div>';
    popup.querySelector('header button').addEventListener('click',()=>close(true));portal.append(dock,popup);
    const theme=document.createElement('button');theme.type='button';theme.className='sf-employee-theme';
    theme.addEventListener('click',()=>{window.SFManagerTheme?.apply(document.documentElement.dataset.sfTheme==='light'?'dark':'light',true);sync()});
    const top=portal.querySelector('.sf-portal-top');top.querySelector('#sfEmployeeLogout')?.before(theme);
    const measure=()=>{if(!portal?.isConnected)return;const height=top.getBoundingClientRect().height;portal.style.setProperty('--sf-employee-head',height+'px','important');position()};
    resize=new ResizeObserver(measure);resize.observe(top);resize.observe(dock);measure();sync();
  }
  function check() {
    queued=false;const next=document.getElementById('sfEmployeePortal');
    if(next&&next!==portal)mount(next);
    else if(!next&&portal){close();resize?.disconnect();portal=null;dock=null;popup=null}
    else if(next)syncCounts();
  }
  const observer=new MutationObserver(records=>{
    const routeChanged=records.some(r=>r.type==='attributes'&&r.attributeName==='data-sf-portal-active');
    if(routeChanged){close();sync()}
    if(!queued){queued=true;requestAnimationFrame(check)}
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-sf-portal-active']});
  document.addEventListener('pointerdown',event=>{if(openGroup&&!popup.contains(event.target)&&!dock.contains(event.target))close()});
  document.addEventListener('keydown',event=>{
    if(!openGroup)return;
    if(event.key==='Escape'){event.preventDefault();close(true)}
    else if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      const nodes=[...popup.querySelectorAll('button')],index=nodes.indexOf(document.activeElement);if(index<0)return;
      event.preventDefault();nodes[(index+(event.key==='ArrowDown'?1:-1)+nodes.length)%nodes.length].focus();
    }
  });
  document.addEventListener('focusin',event=>{if(openGroup&&!popup.contains(event.target)&&!dock.contains(event.target))close()});
  reduced.addEventListener('change',()=>{animations.forEach(a=>a.cancel());animations=[]});
  window.addEventListener('resize',position);window.addEventListener('schichtfunk:themechange',sync);
  window.addEventListener('schichtfunk:orbitmotionchange',()=>{animations.forEach(a=>a.cancel());animations=[]});
  window.SFEmployeeOrbit={sync};check();
})();
