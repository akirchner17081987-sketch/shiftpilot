// Actual entry globe, actual WebGL surface, controlled animation clock and local assets.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'test-results/entry-globe-transform'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
(async()=>{
 const browser=await chromium.launch({headless:true});let checks=0;
 try{
  fs.mkdirSync(out,{recursive:true});
  for(const mode of ['normal','reduced','skip','missing-surface']){
   const page=await browser.newPage({viewport:{width:780,height:780},reducedMotion:mode==='reduced'?'reduce':'no-preference'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   let release;const gate=new Promise(resolve=>release=resolve);
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('earth-surface-original-v2.webp')){await gate;if(mode==='missing-surface')return route.abort();return route.fulfill({contentType:'image/webp',body:fs.readFileSync(path.join(root,'assets/earth-surface-original-v2.webp'))});}
    return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="de"><meta charset="utf-8"><style>body{margin:0;background:#04101b;color:#c7e3e3;font:15px system-ui;text-align:center}h1{font-size:24px;font-weight:500;margin:35px 0 5px}p{color:#8eb9bf}canvas{width:600px;height:600px;max-width:96vw;max-height:96vw;display:block;margin:auto}</style><div id="sfEntryOverlay"><h1>SchichtFunk</h1><p>Eine Welt entsteht.</p><canvas id="sfEntryGlobe"></canvas></div></html>'});
   });
   await page.goto('https://entry-globe.invalid/');
   await page.evaluate(()=>{
    window.clock=100;window.frames=new Map();let id=0;
    window.requestAnimationFrame=callback=>{frames.set(++id,callback);return id};window.cancelAnimationFrame=id=>frames.delete(id);
    window.advance=(count=1)=>{for(let i=0;i<count;i++){clock+=50;const pending=[...frames.values()];frames.clear();for(const callback of pending)callback(clock)}};
   });
   for(const f of ['location-map-engine-v1','globe-surface-v1','sf-entry-dive-v1','sf-entry-globe-v1'])await page.addScriptTag({content:read('assets/'+f+'.js')});
   await page.evaluate(()=>advance(5));
   assert.equal(await page.locator('#sfEntryOverlay').getAttribute('data-globe-phase'),'outline','unloaded texture retains the original globe');checks++;
   if(mode==='normal')await page.screenshot({path:path.join(out,'01-Grundform.png')});
   release();await page.evaluate(()=>SFGlobeSurface.prepare());
   await page.waitForTimeout(40);
   if(mode==='skip'){await page.evaluate(()=>document.getElementById('sfEntryOverlay').classList.add('sf-entry-skip-animation'));await page.waitForFunction(()=>document.getElementById('sfEntryOverlay').dataset.globePhase==='surface');checks++;}
   if(mode==='reduced'){
    await page.waitForFunction(()=>document.getElementById('sfEntryOverlay').dataset.globePhase==='surface');checks++;
    await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(25);
    assert.equal(await page.locator('#sfEntryOverlay').getAttribute('data-globe-phase'),'surface','changing motion preference does not replay the completed transformation');checks++;
   }
   if(mode==='normal'){
    await page.evaluate(()=>advance(18));
    assert.equal(await page.locator('#sfEntryOverlay').getAttribute('data-globe-phase'),'transforming','intermediate frames remain visible');checks++;
    await page.screenshot({path:path.join(out,'02-Transformation.png')});
    const smooth=await page.evaluate(()=>{
     const c=document.querySelector('canvas'),ctx=c.getContext('2d'),background=[4,16,27];let before=ctx.getImageData(0,0,c.width,c.height).data,max=0;
     // Compare visible colors over the actual background. Unpremultiplied RGB
     // in an almost transparent halo is not its displayed brightness.
     for(let i=0;i<36;i++){advance();const after=ctx.getImageData(0,0,c.width,c.height).data;let sum=0;for(let p=0;p<after.length;p+=4)for(let k=0;k<3;k++){const a=(after[p+k]*after[p+3]+background[k]*(255-after[p+3]))/255,b=(before[p+k]*before[p+3]+background[k]*(255-before[p+3]))/255;sum+=Math.abs(a-b);}max=Math.max(max,sum/(c.width*c.height*3));before=after;}
     return max;
    });
    assert.ok(smooth<3,'no hard frame switch or brightness flash: '+smooth);checks++;
    assert.equal(await page.locator('#sfEntryOverlay').getAttribute('data-globe-phase'),'surface');checks++;
    await page.screenshot({path:path.join(out,'03-Neue-Oberflaeche.png')});
    console.log('Maximum average RGB change per 50 ms frame: '+smooth.toFixed(4));
   }
   if(mode==='missing-surface'){await page.evaluate(()=>advance(70));assert.equal(await page.locator('#sfEntryOverlay').getAttribute('data-globe-phase'),'outline','a missing surface retains the usable original design');checks++;}
   assert.deepEqual(errors,[]);checks++;
   await page.evaluate(()=>document.getElementById('sfEntryOverlay').remove());await page.waitForTimeout(25);
   assert.equal(await page.evaluate(()=>frames.size),0,'removing the entry stops the animation');checks++;
   await page.close();
  }
  console.log('Entry globe transformation QA passed: '+checks+' checks; delayed texture, visible intermediate frames, smooth pixels, reduced motion, skip, missing surface and cleanup.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
