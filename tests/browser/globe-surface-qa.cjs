// Original renderer with the real geographic engine; no account or external requests.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'test-results/globe-surface');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.setContent('<!doctype html><html lang="de"><meta charset="utf-8"><style>body{margin:0;background:#040d17;color:#e7f2f4;font-family:system-ui}header{position:absolute;left:56px;top:38px}small{color:#6ec8d2;letter-spacing:.13em}h1{font-size:32px;font-weight:500;margin:10px 0}p{color:#a7bdc8}canvas{display:block;width:1280px;height:900px}footer{position:absolute;bottom:35px;left:56px;color:#8ba4b4;font-size:13px}</style><header><small>SCHICHTFUNK · GESTALTUNGSENTWURF</small><h1>Eine eigene Perspektive.</h1><p>Oberfläche, Atmosphäre und Licht – direkt berechnet.</p></header><canvas id="earth" width="1280" height="900"></canvas><footer>Geografische Grundlage: Natural Earth · Darstellung ohne Satellitenbilder</footer></html>');
  for(const file of ['location-map-engine-v1.js','globe-surface-v1.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,'assets',file),'utf8')});
  const result=await page.evaluate(()=>{
   const engine=SFLocationMapEngine,ctx=document.querySelector('canvas').getContext('2d');
   const projection=engine.d3.geoOrthographic().rotate([-11,-32]).translate([780,466]).scale(366).precision(.15);
   const renderer=SFGlobeSurface.create(engine);if(!renderer)return {available:false};
   window.qaGlobe={renderer,projection,ctx};
   const start=performance.now();const rendered=renderer.render(ctx,projection,1280,900);
   const sample=geo=>{const p=projection(geo);return [...ctx.getImageData(Math.round(p[0]),Math.round(p[1]),1,1).data]};
   return {available:true,rendered,milliseconds:performance.now()-start,land:sample([10,51]),sea:sample([-25,35]),outside:[...ctx.getImageData(20,20,1,1).data]};
  });
  assert.equal(result.available,true,'the real WebGL shader compiles');assert.equal(result.rendered,true);
  assert.ok(result.land[1]>result.land[2],'Germany uses land synthesis');assert.ok(result.sea[2]>result.sea[1],'Atlantic uses ocean synthesis');assert.equal(result.outside[3],0,'background stays transparent');
  fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'SchichtFunk-Eigener-Globus.png')});
  // Detail view keeps the same geography while new frames and camera changes remain deterministic.
  const detail=await page.evaluate(()=>{
   const {renderer,projection,ctx}=qaGlobe;projection.rotate([-10.1,-50.15]).translate([640,450]).scale(3700);ctx.clearRect(0,0,1280,900);
   renderer.render(ctx,projection,1280,900);const first=ctx.canvas.toDataURL();ctx.clearRect(0,0,1280,900);renderer.render(ctx,projection,1280,900);
   const same=first===ctx.canvas.toDataURL();renderer.dispose();renderer.dispose();return {same,disposed:renderer.render(ctx,projection,1280,900)};
  });assert.equal(detail.same,true);assert.equal(detail.disposed,false);
  await page.screenshot({path:path.join(out,'SchichtFunk-Region.png')});
  const noGpu=await page.evaluate(()=>{const old=HTMLCanvasElement.prototype.getContext;try{HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'?null:old.call(this,type,...args)};return SFGlobeSurface.create(SFLocationMapEngine)===null;}finally{HTMLCanvasElement.prototype.getContext=old;}});
  assert.equal(noGpu,true,'missing GPU returns cleanly to the existing map');assert.deepEqual(errors,[]);assert.deepEqual(requests,[],'surface renderer makes no network requests');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({result,checks:10},null,2));console.log(JSON.stringify({checks:10,...result,output:out}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
