/* Geographic location overview. No sample metrics or employee records. */
(function(){
 'use strict';
 if(window.SFLocationMap)return;
 let enginePromise=null;
 function loadEngine(){
  if(window.SFLocationMapEngine)return Promise.resolve(window.SFLocationMapEngine);
  if(!enginePromise)enginePromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='assets/location-map-engine-v1.js?v=20261016-horizon1';script.onload=()=>resolve(window.SFLocationMapEngine);script.onerror=()=>{enginePromise=null;script.remove();reject(Error('Die Kartendaten konnten nicht geladen werden.'));};document.head.append(script);});
  return enginePromise;
 }
 function create(host,options){
 const root=document.createElement('section');root.className='sf-location-map';root.setAttribute('aria-label','Standorte und Tagesstatus');
 root.innerHTML="<div class=\"sf-scene\"><div class=\"sf-planet\"><canvas role=\"img\" aria-label=\"SchichtFunk-Globus mit geografischen Standortpositionen\"></canvas></div><svg class=\"sf-routes\" aria-hidden=\"true\"><g class=\"sf-route-group\"></g><g class=\"sf-anchors\"></g><g class=\"sf-label-lines\"></g><path class=\"sf-leader\"></path><g class=\"sf-signals\"></g></svg><span class=\"sf-current\">Alle Standorte</span><button type=\"button\" class=\"sf-view cursor-interaction\" aria-pressed=\"false\">Globus ansehen</button>\n<div class=\"sf-points\"></div>\n<section class=\"sf-popup\" id=\"sfOrbitSiteInfo\" role=\"dialog\" aria-modal=\"false\" aria-labelledby=\"sfLocationPopupTitle\" hidden>\n<header class=\"sf-pop-header\"><h3 id=\"sfLocationPopupTitle\">Standort</h3><button type=\"button\" class=\"sf-close cursor-interaction\" aria-label=\"Standortfenster schließen\">×</button></header>\n<div class=\"sf-pop-categories\" aria-label=\"Standortkategorien\">\n<button type=\"button\" class=\"sf-category cursor-interaction\" data-kind=\"present\" aria-pressed=\"false\" aria-controls=\"sfLocationMapDetail\"><span>Jetzt im Dienst</span><span class=\"sf-pop-value\">—</span><span class=\"sf-pop-arrow\" aria-hidden=\"true\">›</span></button>\n<button type=\"button\" class=\"sf-category cursor-interaction\" data-kind=\"open\" aria-pressed=\"false\" aria-controls=\"sfLocationMapDetail\"><span>Offene Positionen</span><span class=\"sf-pop-value\">—</span><span class=\"sf-pop-arrow\" aria-hidden=\"true\">›</span></button>\n<button type=\"button\" class=\"sf-category cursor-interaction\" data-kind=\"hints\" aria-pressed=\"false\" aria-controls=\"sfLocationMapDetail\"><span>Handlungsbedarf</span><span class=\"sf-pop-value\">—</span><span class=\"sf-pop-arrow\" aria-hidden=\"true\">›</span></button>\n</div><div class=\"sf-popup-note\"></div>\n</section></div>\n<div class=\"sf-map-footer\"><span class=\"sf-map-selection\" id=\"sfLocationMapDetail\" aria-live=\"polite\">Standorte werden geladen …</span><span class=\"sf-map-credits\">Natural Earth · <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\" rel=\"noopener noreferrer\">© OpenStreetMap</a></span></div>";
host.append(root);
 const scene=root.querySelector('.sf-scene'),canvas=root.querySelector('canvas'),ctx=canvas.getContext('2d');
 const svg=root.querySelector('.sf-routes'),routes=root.querySelector('.sf-route-group'),anchors=root.querySelector('.sf-anchors'),labelLines=root.querySelector('.sf-label-lines'),signals=root.querySelector('.sf-signals'),popup=root.querySelector('.sf-popup');
 root.querySelector('.sf-leader').remove();
 const floating=document.createElement('div');floating.className='sf-location-map sf-location-floating';floating.append(popup);(document.getElementById('appShell')||document.body).append(floating);
 const unmapped=document.createElement('div');unmapped.className='sf-unmapped-sites';unmapped.setAttribute('aria-label','Standorte ohne verifizierte Kartenposition');scene.append(unmapped);
 const definitions={present:'Jetzt im Dienst',coverage:'Offene Positionen',actions:'Handlungsbedarf'};
 // Preview control names map to the existing production KPI identifiers.
 popup.querySelector('[data-kind="open"]').dataset.kind='coverage';popup.querySelector('[data-kind="hints"]').dataset.kind='actions';
 let loadingEngine=false,engine=null,surface=null,d3=null,countries=null,projection=null,data=null,signature='',sites=[],selected='',opened='',fullGlobe=false,elapsed=0,last=0,raf=0,geometry=[],width=0,height=0,disposed=false,inView=true;
 const overlay=host.closest('.sf-orbit-hero')?.querySelector('.sf-orbit-hero-content');
 const buttons=new Map(),reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 const makeSvg=tag=>document.createElementNS('http://www.w3.org/2000/svg',tag);
 function getData(){return options.getData?.()||null;}
 function select(id){return options.select?.(id)!==false;}
 function hidePopup(restore){const previous=buttons.get(opened);opened='';popup.hidden=true;buttons.forEach(b=>b.setAttribute('aria-expanded','false'));if(restore)previous?.focus({preventScroll:true});}
 function showSite(id){if(opened===id){hidePopup();return;}opened=id;select(id);sync(true);}
 function createButton(site){
  const button=document.createElement('button');button.type='button';button.className='sf-point';button.dataset.orbitSite=site.id;button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','sfOrbitSiteInfo');
  const code=document.createElement('span'),name=document.createElement('span'),alert=document.createElement('span');code.className='sf-code';name.className='sf-location-name';alert.className='sf-alert-icon';alert.setAttribute('aria-hidden','true');alert.textContent='!';button.append(code,name,alert);
  button.addEventListener('click',event=>{showSite(site.id);if(event.detail===0&&!popup.hidden)popup.querySelector('.sf-category:not(:disabled)')?.focus();});buttons.set(site.id,button);root.querySelector('.sf-points').append(button);return button;
 }
 function renderSites(){
  const keep=new Set(data.sites.map(s=>s.id));buttons.forEach((button,id)=>{if(!keep.has(id)){button.remove();buttons.delete(id);}});anchors.replaceChildren();labelLines.replaceChildren();
  sites=data.sites.map((site,index)=>{
   const button=buttons.get(site.id)||createButton(site),geo=window.SFLocationGeo.resolve(site),code=site.code||site.name.slice(0,3).toUpperCase();
   button.querySelector('.sf-code').textContent=code;button.querySelector('.sf-location-name').textContent=site.name;button.querySelector('.sf-alert-icon').hidden=!site.actions;
   button.dataset.status=site.status;button.setAttribute('aria-label',site.name+' · '+site.label+(geo?'':' · Kartenposition nicht verifiziert'));button.setAttribute('aria-pressed',String(site.id===selected));button.setAttribute('aria-expanded',String(site.id===opened));
   const dot=makeSvg('circle'),halo=makeSvg('circle'),pulse=makeSvg('circle'),line=makeSvg('path');dot.setAttribute('r','3');halo.setAttribute('r','8');halo.setAttribute('class','sf-alert-ring');pulse.setAttribute('r','8');pulse.setAttribute('class','sf-select-pulse');
   dot.dataset.active=pulse.dataset.active=line.dataset.active=String(site.id===selected);halo.style.display=site.actions?'':'none';anchors.append(halo,pulse,dot);labelLines.append(line);
   const mapped=!!geo&&!!engine&&!!ctx;button.classList.toggle('sf-unmapped',!mapped);const parent=mapped?root.querySelector('.sf-points'):unmapped;if(button.parentElement!==parent)parent.append(button);
   return{...site,coords:geo,button,dot,halo,pulse,line,index};
  });
  unmapped.hidden=!sites.some(s=>!s.coords||!engine||!ctx);layout();renderPopup();
 }
function paintMap(){
 const ratio=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
 const path=d3.geoPath(projection,ctx),center=projection.translate(),radius=projection.scale();
 const originalSurface=surface?.render(ctx,projection,width,height);
 root.dataset.surface=originalSurface?'original':'fallback';
 if(!originalSurface){
 if(fullGlobe){const glow=ctx.createRadialGradient(center[0],center[1],radius*.95,center[0],center[1],radius*1.07);glow.addColorStop(0,'#3cb8d500');glow.addColorStop(.45,'#5adaec20');glow.addColorStop(1,'#3cb8d500');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);}
 ctx.beginPath();path({type:'Sphere'});const ocean=ctx.createRadialGradient(width*.45,height*.3,10,width*.55,height*.7,Math.max(width,height)*.8);ocean.addColorStop(0,'#0b293a');ocean.addColorStop(1,'#020c17');ctx.fillStyle=ocean;ctx.fill();ctx.save();ctx.clip();
 const graticule=d3.geoGraticule().step(fullGlobe?[30,30]:[2,2])();ctx.beginPath();path(graticule);ctx.strokeStyle='#7bcfe012';ctx.lineWidth=.6;ctx.stroke();
 for(const feature of countries.features){ctx.beginPath();path(feature);const home=['DEU','AUT'].includes(feature.properties.id);ctx.fillStyle=home?'#124155':'#0a2638';ctx.fill();ctx.strokeStyle=home?'#7cc8da8c':'#7cc8da33';ctx.lineWidth=home?.9:.65;ctx.stroke();}
 // The light pattern is clipped by the sourced land geometry, on the same projection as the pins.
 ctx.save();ctx.beginPath();path(countries);ctx.clip();
 const spacing=fullGlobe?4:5;
 for(let y=0;y<height;y+=spacing){for(let x=(Math.round(y/spacing)%2)*spacing/2;x<width;x+=spacing){const seed=Math.abs(Math.sin(x*12.9898+y*78.233));ctx.fillStyle=seed>.86?'#c2f0fa9c':'#4dc4d940';ctx.beginPath();ctx.arc(x,y,seed>.86?.8:.55,0,Math.PI*2);ctx.fill();}}
 ctx.restore();ctx.restore();
 if(fullGlobe){ctx.beginPath();path({type:'Sphere'});ctx.strokeStyle='#79d8e56b';ctx.lineWidth=1;ctx.stroke();}
 }else{
  for(const feature of countries.features){ctx.beginPath();path(feature);ctx.strokeStyle=['DEU','AUT'].includes(feature.properties.id)?'#d5ecdc90':'#c2dfd13d';ctx.lineWidth=['DEU','AUT'].includes(feature.properties.id)?.85:.5;ctx.stroke();}
 }
 // Country names support orientation without replacing the six site labels.
 if(!fullGlobe){
  ctx.save();ctx.font='500 11px Inter,system-ui,sans-serif';ctx.fillStyle='#bedee9d9';ctx.strokeStyle='#071a28d9';ctx.lineWidth=3;ctx.lineJoin='round';ctx.textAlign='center';
  for(const [name,coords] of [['DEUTSCHLAND',[10.3,49.75]],['ÖSTERREICH',[11.6,47.1]]]){
   const p=projection(coords),half=ctx.measureText(name).width/2;
   const x=Math.max(half+14,Math.min(width-half-14,p[0]));
   // Place Austria's name in the western part of the country, clear of the Bergheim label.
   const y=Math.max(55,Math.min(height-30,p[1]));
   ctx.strokeText(name,x,y);ctx.fillText(name,x,y);
  }
  ctx.restore();
 }

}
 function layout(){
  const bounds=scene.getBoundingClientRect();width=bounds.width;height=bounds.height;if(!width)return;
  if(!engine||!ctx){renderPopup();return;}
  const mapped=sites.filter(s=>s.coords),mobile=width<=520;
  // Header, filters and geography share one canvas. Reserve their measured height,
  // including wrapped titles, rather than relying on a fixed desktop offset.
  const header=overlay?Math.max(0,overlay.getBoundingClientRect().bottom-bounds.top):0;
  root.style.setProperty('--sf-map-controls-top',(header+8)+'px');
  const top=Math.max(80,header+76),bottom=Math.max(top+100,height-85),middle=(top+bottom)/2;
  const inset=mobile?78:Math.min(300,width*.22),left=inset,right=Math.max(left+1,width-inset);
  if(fullGlobe){
   // Let the desktop globe fill the shared hero behind the heading. The same
   // projection drives the land, site pins and callouts, so they stay aligned.
   const expanded=!!overlay&&width>760,space=height-header-80;
   const radius=expanded?Math.min(width*.43,(height-56)/2):Math.min(width*.43,space/2,300);
   const centerY=expanded?height/2:header+40+space/2;
   projection.scale(radius).translate([width/2,centerY]);
  }
  else if(mapped.length>1){projection.scale(1).translate([0,0]);projection.fitExtent([[left,top],[right,bottom]],{type:'MultiPoint',coordinates:mapped.map(s=>s.coords)});if(projection.scale()>4600){projection.scale(4600).translate([0,0]);const b=d3.geoPath(projection).bounds({type:'MultiPoint',coordinates:mapped.map(s=>s.coords)});projection.translate([width/2-(b[0][0]+b[1][0])/2,middle-(b[0][1]+b[1][1])/2]);}}
  else projection.scale(mobile?1700:3800).translate([width/2,middle]);
  svg.setAttribute('viewBox','0 0 '+width+' '+height);paintMap();
  const median=mapped.length?(Math.min(...mapped.map(s=>s.coords[0]))+Math.max(...mapped.map(s=>s.coords[0])))/2:10;
  const groups={left:mapped.filter(s=>s.coords[0]<median).sort((a,b)=>b.coords[1]-a.coords[1]),right:mapped.filter(s=>s.coords[0]>=median).sort((a,b)=>b.coords[1]-a.coords[1])};
  const labelY=new Map();
  for(const group of Object.values(groups)){
   let cursor=top;for(const site of group){const y=Math.max(cursor,Math.min(bottom-44,projection(site.coords)[1]-22));labelY.set(site.id,y);cursor=y+56;}
   cursor=bottom-44;for(const site of [...group].reverse()){const y=Math.min(cursor,labelY.get(site.id));labelY.set(site.id,y);cursor=y-56;}
  }
  for(const site of sites){
   if(!site.coords){site.dot.style.display=site.line.style.display=site.halo.style.display=site.pulse.style.display='none';site.position=null;continue;}
   const p=projection(site.coords);site.position={x:p[0],y:p[1]};for(const mark of [site.dot,site.halo,site.pulse]){mark.setAttribute('cx',p[0]);mark.setAttribute('cy',p[1]);}
   site.side=site.coords[0]<median?'left':'right';
   const labelTop=labelY.get(site.id);
   // Keep callouts close to the geography on wide monitors; no edge-to-edge lines.
   const projected=mapped.map(s=>projection(s.coords)[0]),labelWidth=site.button.getBoundingClientRect().width;
   const labelLeft=mobile?12:Math.max(20,Math.min(width/2-260,Math.min(...projected)-labelWidth-70));
   const labelRight=mobile?12:Math.max(20,Math.min(width/2-260,width-Math.max(...projected)-labelWidth-70));
   site.button.style.top=labelTop+'px';site.button.style.left=site.side==='left'?labelLeft+'px':'auto';site.button.style.right=site.side==='right'?labelRight+'px':'auto';
   const b=site.button.getBoundingClientRect(),x=(site.side==='left'?b.right:b.left)-bounds.left,y=b.top+b.height/2-bounds.top;
   site.line.setAttribute('d','M '+x+' '+y+' L '+(x+(site.side==='left'?10:-10))+' '+y+' L '+p[0]+' '+p[1]);
  }
  buildRoutes();positionPopup();
 }
 function buildRoutes(){
  routes.replaceChildren();signals.replaceChildren();geometry=[];const current=sites.find(s=>s.id===selected&&s.position);if(!current){syncMotion();return;}
  sites.filter(s=>s.id!==selected&&s.position).forEach((site,index)=>{const start=current.position,end=site.position,control={x:(start.x+end.x)/2,y:Math.min(start.y,end.y)-Math.min(35,Math.hypot(start.x-end.x,start.y-end.y)*.18)};
   const path=makeSvg('path');path.setAttribute('class','sf-route');path.setAttribute('d','M '+start.x+' '+start.y+' Q '+control.x+' '+control.y+' '+end.x+' '+end.y);routes.append(path);
   if(index%2===0){const dot=makeSvg('circle');dot.setAttribute('class','sf-signal');dot.setAttribute('r','1.7');signals.append(dot);geometry.push({start,control,end,dot,offset:index*.21});}
  });updateSignals();syncMotion();
 }
 function updateSignals(){for(const route of geometry){const t=(elapsed/6500+route.offset)%1,u=1-t;route.dot.setAttribute('cx',u*u*route.start.x+2*u*t*route.control.x+t*t*route.end.x);route.dot.setAttribute('cy',u*u*route.start.y+2*u*t*route.control.y+t*t*route.end.y);route.dot.style.opacity=options.motion?.()==='off'||reduced.matches?'0':String(Math.sin(t*Math.PI)*.75);}}
 function positionPopup(){
  if(popup.hidden)return;const site=sites.find(s=>s.id===opened);if(!site)return;
  const anchor=site.button.getBoundingClientRect(),popupWidth=window.innerWidth<=520?Math.min(244,window.innerWidth-96):244;popup.style.width=Math.max(180,popupWidth)+'px';
  const dockTop=Math.min(window.innerHeight,document.getElementById('sfOrbitDock')?.getBoundingClientRect().top||window.innerHeight);
  const headerBottom=Math.max(0,document.querySelector('#appShell>.topbar')?.getBoundingClientRect().bottom||0);
  const upper=headerBottom+8,lower=dockTop-12;
  popup.style.maxHeight=Math.max(120,lower-upper)+'px';
  const size=popup.getBoundingClientRect(),gap=10;
  const preferred=site.side==='left'?anchor.right+gap:anchor.left-size.width-gap;
  popup.style.left=Math.max(12,Math.min(window.innerWidth-size.width-12,preferred))+'px';
  popup.style.top=Math.max(upper,Math.min(lower-size.height,anchor.top-4))+'px';
 }
 function renderPopup(){
  const site=sites.find(s=>s.id===opened);popup.hidden=!site;buttons.forEach((button,id)=>button.setAttribute('aria-expanded',String(id===opened)));
  if(!site)return;popup.querySelector('#sfLocationPopupTitle').textContent=site.name;
  popup.querySelectorAll('[data-kind]').forEach(button=>{const key=button.dataset.kind,value=key==='coverage'?site.open:key==='actions'?site.actions:site.present;button.querySelector('.sf-pop-value').textContent=value==null?'–':String(value);button.disabled=key==='present'&&site.present==null;button.setAttribute('aria-label',definitions[key]+' · '+site.name+' · '+(value==null?'derzeit unbekannt':value));});
  popup.querySelector('.sf-popup-note').textContent='Datenstand '+new Intl.DateTimeFormat('de-DE',{timeZone:data.timezone,hour:'2-digit',minute:'2-digit'}).format(new Date(data.asOf))+' Uhr'+(!data.fresh?' · veraltet':'')+(site.coords?'':' · Kartenposition nicht verifiziert');positionPopup();
 }
 function sync(force=false){
  if(disposed)return;const current=getData();if(!current){reset();return;}
  const next=JSON.stringify(current);if(!force&&next===signature){syncMotion();return;}
  const changed=selected!==current.selected;data=current;signature=next;selected=current.selected||'';if(changed)opened=selected;
  root.querySelector('.sf-current').textContent=data.sites.find(s=>s.id===selected)?.name||'Alle '+data.sites.length+' Standorte';
  root.querySelector('.sf-map-selection').textContent=data.sites.find(s=>s.id===selected)?.address||'Standort auswählen · Orange (!) = Handlungsbedarf';ensureEngine();renderSites();
 }
 function reset(){if(!data&&signature==='unavailable'){syncMotion();return;}data=null;signature='unavailable';selected=opened='';sites=[];buttons.forEach(button=>button.remove());buttons.clear();for(const el of [anchors,routes,signals,labelLines])el.replaceChildren();geometry=[];popup.hidden=true;root.querySelector('.sf-current').textContent='Standortdaten nicht verfügbar';root.querySelector('.sf-map-selection').textContent='Standortdaten werden geladen …';ctx?.clearRect(0,0,canvas.width,canvas.height);syncMotion();}
 function running(){return !disposed&&root.isConnected&&inView&&!document.hidden&&!!data&&!!geometry.length&&!reduced.matches&&options.motion?.()!=='off'&&options.active?.()!==false;}
 function frame(time){raf=0;if(!running())return;if(!last)last=time;if(time-last>=50){elapsed+=Math.min(time-last,100);last=time;updateSignals();}raf=requestAnimationFrame(frame);}
 function syncMotion(){root.dataset.motion=floating.dataset.motion=options.motion?.()||'subtle';if(!running()){cancelAnimationFrame(raf);raf=0;last=0;}else if(!raf)raf=requestAnimationFrame(frame);}
 popup.querySelector('.sf-close').addEventListener('click',()=>hidePopup(true));
 popup.querySelectorAll('[data-kind]').forEach(button=>button.addEventListener('click',()=>{const id=opened;if(id&&options.open?.(id,button.dataset.kind)!==false)hidePopup();}));
 root.querySelector('.sf-view').addEventListener('click',()=>{fullGlobe=!fullGlobe;root.querySelector('.sf-view').textContent=fullGlobe?'Region vergrößern':'Globus ansehen';root.querySelector('.sf-view').setAttribute('aria-pressed',String(fullGlobe));layout();});
 const onKey=event=>{if(event.key==='Escape'&&!popup.hidden){event.preventDefault();event.stopPropagation();hidePopup(true);}};root.addEventListener('keydown',onKey);floating.addEventListener('keydown',onKey);
 canvas.addEventListener('click',event=>{const b=canvas.getBoundingClientRect(),x=event.clientX-b.left,y=event.clientY-b.top;const site=sites.filter(s=>s.position).sort((a,b)=>Math.hypot(a.position.x-x,a.position.y-y)-Math.hypot(b.position.x-x,b.position.y-y))[0];if(site&&Math.hypot(site.position.x-x,site.position.y-y)<22)showSite(site.id);else hidePopup();});
 const resize=new ResizeObserver(layout);resize.observe(scene);if(overlay)resize.observe(overlay);const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;syncMotion();}):null;observer?.observe(root);
 const onScroll=()=>{if(!popup.hidden)positionPopup();};document.addEventListener('scroll',onScroll,true);
 const onVisibility=()=>syncMotion();document.addEventListener('visibilitychange',onVisibility);reduced.addEventListener?.('change',onVisibility);
 function ensureEngine(){if(engine||loadingEngine)return;loadingEngine=true;loadEngine().then(value=>{if(disposed)return;engine=value;d3=value.d3;countries=value.countries;surface=window.SFGlobeSurface?.create(value);projection=d3.geoOrthographic().rotate([-10.1,-50.15]).precision(.15);sync(true);}).catch(error=>{loadingEngine=false;if(!disposed)root.querySelector('.sf-map-selection').textContent=error.message;});}
 return{sync,reset,dismissOutside(target){if(!root.contains(target)&&!popup.contains(target))hidePopup();},dispose(){disposed=true;surface?.dispose();cancelAnimationFrame(raf);resize.disconnect();observer?.disconnect();document.removeEventListener('visibilitychange',onVisibility);reduced.removeEventListener?.('change',onVisibility);document.removeEventListener('scroll',onScroll,true);floating.remove();root.remove();}};
 }
 window.SFLocationMap={create};
})();
