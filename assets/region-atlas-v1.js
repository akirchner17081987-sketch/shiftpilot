/* SchichtFunk regional cartography. Natural Earth geography: public domain.
   All assets are served locally. The palette is decorative; shading depicts real terrain. */
(function(){
 'use strict';
 if(window.SFRegionAtlas)return;
 let pending=null;
 function prepare(){
  if(!pending)pending=Promise.all([
   fetch('assets/region-atlas-data-v1.json?v=20261019-atlas1').then(r=>{if(!r.ok)throw Error('Atlas data');return r.json();}),
   new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src='assets/region-atlas-night-v1.webp?v=20261019-night1';})
  ]).then(([data,image])=>({data,image})).catch(()=>{pending=null;return null;});
  return pending;
 }
 const collection=features=>({type:'FeatureCollection',features});
 function create(engine,options={}){
  const {d3}=engine,detailCanvas=document.createElement('canvas');let atlas=null,disposed=false;
  prepare().then(value=>{if(!disposed){atlas=value;options.onReady?.();}});
  function render(ctx,projection,width,height,{reserved=[],top=70}={}){
   const data=atlas?.data,countries=data?collection(data.countries):engine.countries,path=d3.geoPath(projection,ctx);
   ctx.save();
   const water=ctx.createLinearGradient(0,0,width,height);water.addColorStop(0,'#030c19');water.addColorStop(.55,'#061729');water.addColorStop(1,'#030e1d');ctx.fillStyle=water;ctx.fillRect(0,0,width,height);
   // Retain a truthful world outline when a future site is outside Central Europe.
   ctx.beginPath();path(engine.countries);ctx.fillStyle='#0f253f';ctx.fill();
   // Composite regional detail separately so the dataset bounds never form a hard seam.
   const output=ctx;detailCanvas.width=output.canvas.width;detailCanvas.height=output.canvas.height;
   ctx=detailCanvas.getContext('2d');ctx.setTransform(output.getTransform());ctx.save();path.context(ctx);
   if(data){const b=data.bounds,a=projection([b[0],b[3]]),z=projection([b[2],b[1]]);ctx.beginPath();ctx.rect(a[0],a[1],z[0]-a[0],z[1]-a[1]);ctx.clip();ctx.fillStyle=water;ctx.fillRect(0,0,width,height);}
   ctx.beginPath();path(countries);ctx.fillStyle='#0f253f';ctx.fill();
   if(atlas){
    ctx.save();ctx.beginPath();path(countries);ctx.clip();
    const b=data.bounds,a=projection([b[0],b[3]]),z=projection([b[2],b[1]]);
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(atlas.image,a[0],a[1],z[0]-a[0],z[1]-a[1]);ctx.restore();
   }
   // A stationary atmospheric light follows actual German and Austrian geography.
   for(const f of countries.features){
    const home=['DEU','AUT'].includes(f.properties.id);if(!home)continue;
    ctx.save();ctx.beginPath();path(f);ctx.clip();
    const center=projection([10.6,50]),radius=Math.max(170,projection.scale()*.085);
    const glow=ctx.createRadialGradient(center[0],center[1],0,center[0],center[1],radius);
    glow.addColorStop(0,'#10aec63d');glow.addColorStop(.6,'#0e829d25');glow.addColorStop(1,'#0d6f9c08');
    ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);ctx.restore();
   }
   // Country outlines provide the same restrained cyan rim as the night globe.
   ctx.save();ctx.beginPath();path(countries);ctx.strokeStyle='#249ed838';ctx.lineWidth=1.5;ctx.shadowColor='#168bdf';ctx.shadowBlur=5;ctx.stroke();ctx.restore();
   for(const f of countries.features){const home=['DEU','AUT'].includes(f.properties.id);ctx.beginPath();path(f);ctx.strokeStyle=home?'#8eeaf3c9':'#388ac275';ctx.lineWidth=home?1.15:.6;ctx.stroke();}
   if(data){
    const rivers=collection(data.rivers);ctx.beginPath();path(rivers);ctx.strokeStyle='#04101d70';ctx.lineWidth=2.3;ctx.stroke();ctx.beginPath();path(rivers);ctx.strokeStyle='#28658375';ctx.lineWidth=1.05;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
    ctx.beginPath();path(collection(data.lakes));ctx.fillStyle='#08233b';ctx.fill();ctx.strokeStyle='#3c8ea56b';ctx.lineWidth=.55;ctx.stroke();
   }
   ctx.restore();
   if(data){
    const b=data.bounds,a=projection([b[0],b[3]]),z=projection([b[2],b[1]]);
    // Fade all clipped geography and relief into the continuous world outline.
    ctx.globalCompositeOperation='destination-in';
    for(const [start,end,vertical] of [[a[0],z[0],false],[a[1],z[1],true]]){
     const feather=Math.min(.2,140/Math.max(1,end-start));
     const fade=vertical?ctx.createLinearGradient(0,start,0,end):ctx.createLinearGradient(start,0,end,0);
     fade.addColorStop(0,'#0000');fade.addColorStop(feather,'#000');fade.addColorStop(1-feather,'#000');fade.addColorStop(1,'#0000');
     ctx.fillStyle=fade;ctx.fillRect(0,0,width,height);
    }
    ctx.globalCompositeOperation='source-over';
   }
   ctx=output;path.context(ctx);ctx.drawImage(detailCanvas,0,0,width,height);
   const occupied=reserved.map(r=>({...r})),intersects=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
   function label(text,coords,{country=false,terrain=false}={}){
    const p=projection(coords);if(!p||p[0]<12||p[0]>width-12||p[1]<top||p[1]>height-36)return;
    ctx.font=(terrain?'italic ':country?'600 ':'500 ')+(country?12:width<520?10:11)+'px Inter,system-ui,sans-serif';
    ctx.letterSpacing=country?'2px':'0px';const size=ctx.measureText(text),w=size.width,h=country?17:15;
    const r={x:p[0]-(country||terrain?w/2:-6)-4,y:p[1]-h,width:w+8,height:h+7};
    if(r.x<10||r.x+r.width>width-10||occupied.some(b=>intersects(r,b)))return;
    occupied.push(r);ctx.textAlign=country||terrain?'center':'left';ctx.lineJoin='round';ctx.lineWidth=country?3:3.2;ctx.strokeStyle=country?'#03101df2':'#03101de6';ctx.fillStyle=country?'#e1f5ff':terrain?'#89b0c9':'#c0d9eb';
    const x=p[0]+(country||terrain?0:6);ctx.strokeText(text,x,p[1]);ctx.fillText(text,x,p[1]);
    if(!country&&!terrain){ctx.beginPath();ctx.arc(p[0],p[1]-3,1.7,0,Math.PI*2);ctx.fillStyle='#d9c79c';ctx.fill();}
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
