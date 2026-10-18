/* SchichtFunk regional cartography. Natural Earth geography: public domain.
   All assets are served locally. The palette is decorative; shading depicts real terrain. */
(function(){
 'use strict';
 if(window.SFRegionAtlas)return;
 let pending=null;
 function prepare(){
  if(!pending)pending=Promise.all([
   fetch('assets/region-atlas-data-v1.json?v=20261019-atlas1').then(r=>{if(!r.ok)throw Error('Atlas data');return r.json();}),
   new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src='assets/region-atlas-relief-v1.webp?v=20261019-atlas1';})
  ]).then(([data,image])=>({data,image})).catch(()=>{pending=null;return null;});
  return pending;
 }
 const collection=features=>({type:'FeatureCollection',features});
 function create(engine,options={}){
  const {d3}=engine;let atlas=null,disposed=false;
  prepare().then(value=>{if(!disposed){atlas=value;options.onReady?.();}});
  function render(ctx,projection,width,height,{reserved=[],top=70}={}){
   const data=atlas?.data,countries=data?collection(data.countries):engine.countries,path=d3.geoPath(projection,ctx);
   ctx.save();
   const water=ctx.createLinearGradient(0,0,width,height);water.addColorStop(0,'#153f50');water.addColorStop(.55,'#225969');water.addColorStop(1,'#153e51');ctx.fillStyle=water;ctx.fillRect(0,0,width,height);
   // Retain a truthful world outline when a future site is outside Central Europe.
   ctx.beginPath();path(engine.countries);ctx.fillStyle='#91ac94';ctx.fill();
   ctx.save();
   if(data){const b=data.bounds,a=projection([b[0],b[3]]),z=projection([b[2],b[1]]);ctx.beginPath();ctx.rect(a[0],a[1],z[0]-a[0],z[1]-a[1]);ctx.clip();ctx.fillStyle=water;ctx.fillRect(0,0,width,height);}
   ctx.beginPath();path(countries);ctx.fillStyle='#91ac94';ctx.fill();
   if(atlas){
    ctx.save();ctx.beginPath();path(countries);ctx.clip();
    const b=data.bounds,a=projection([b[0],b[3]]),z=projection([b[2],b[1]]);
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(atlas.image,a[0],a[1],z[0]-a[0],z[1]-a[1]);ctx.restore();
   }
   // Restrained borders leave relief and water visible, without a dense grid.
   for(const f of countries.features){const home=['DEU','AUT'].includes(f.properties.id);ctx.beginPath();path(f);ctx.strokeStyle=home?'#ebecd6c9':'#d2dfca70';ctx.lineWidth=home?1.2:.65;ctx.stroke();}
   if(data){
    const rivers=collection(data.rivers);ctx.beginPath();path(rivers);ctx.strokeStyle='#355d6099';ctx.lineWidth=2.3;ctx.stroke();ctx.beginPath();path(rivers);ctx.strokeStyle='#91c8ce';ctx.lineWidth=1.05;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
    ctx.beginPath();path(collection(data.lakes));ctx.fillStyle='#41818c';ctx.fill();ctx.strokeStyle='#9dd2d1a6';ctx.lineWidth=.55;ctx.stroke();
   }
   ctx.restore();
   // Subtle edge shading integrates the atlas into the existing dark hero.
   const shade=ctx.createLinearGradient(0,0,0,height);shade.addColorStop(0,'#051721a6');shade.addColorStop(.4,'#05172100');shade.addColorStop(.82,'#05172100');shade.addColorStop(1,'#05172166');ctx.fillStyle=shade;ctx.fillRect(0,0,width,height);
   const occupied=reserved.map(r=>({...r})),intersects=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
   function label(text,coords,{country=false,terrain=false}={}){
    const p=projection(coords);if(!p||p[0]<12||p[0]>width-12||p[1]<top||p[1]>height-36)return;
    ctx.font=(terrain?'italic ':country?'600 ':'500 ')+(country?12:width<520?10:11)+'px Inter,system-ui,sans-serif';
    ctx.letterSpacing=country?'2px':'0px';const size=ctx.measureText(text),w=size.width,h=country?17:15;
    const r={x:p[0]-(country||terrain?w/2:-6)-4,y:p[1]-h,width:w+8,height:h+7};
    if(r.x<10||r.x+r.width>width-10||occupied.some(b=>intersects(r,b)))return;
    occupied.push(r);ctx.textAlign=country||terrain?'center':'left';ctx.lineJoin='round';ctx.lineWidth=country?3:3.2;ctx.strokeStyle=country?'#36565188':'#c7d4b9bd';ctx.fillStyle=country?'#f8f1d4':terrain?'#405e56':'#193e40';
    const x=p[0]+(country||terrain?0:6);ctx.strokeText(text,x,p[1]);ctx.fillText(text,x,p[1]);
    if(!country&&!terrain){ctx.beginPath();ctx.arc(p[0],p[1]-3,1.7,0,Math.PI*2);ctx.fillStyle='#224f50';ctx.fill();}
   }
   label('DEUTSCHLAND',[10.4,50.55],{country:true});label('ÖSTERREICH',[width<520?12:14.1,47.25],{country:true});
   if(width>600){for(const [name,coords] of [['FRANKREICH',[3.2,48]],['TSCHECHIEN',[15.1,49.65]],['POLEN',[18.5,52]],['SCHWEIZ',[8,46.65]],['NIEDERLANDE',[5.1,52.5]]])label(name,coords,{country:true});}
   if(data)for(const city of data.cities)label(city.name,city.coords);
   label('Alpen',[11.3,46.8],{terrain:true});
   ctx.letterSpacing='0px';ctx.restore();return !!atlas;
  }
  return{render,dispose(){disposed=true;atlas=null;}};
 }
 window.SFRegionAtlas={create,prepare};
})();
