/* Same-origin geographic animation. No authentication, geolocation, storage or service calls. */
(function () {
  'use strict';
  const root = document.getElementById('sfEntryOverlay');
  if (!root) return;
  let preparing = null, stopActive = null;
  let points = null;
  function fallbackPoints(engine) {
      const {d3,countries:land}=engine;
      if (points) return points;
    // Build the fallback points only if the GPU renderer is unavailable.
    const texture = document.createElement('canvas');texture.width = 720;texture.height = 360;
    const tc = texture.getContext('2d', {willReadFrequently:true});
    if (!tc) return [];
    const texProjection = d3.geoEquirectangular().scale(720 / (2 * Math.PI)).translate([360,180]);
    tc.fillStyle = '#fff';tc.beginPath();d3.geoPath(texProjection, tc)(land);tc.fill();
    const pixels = tc.getImageData(0,0,720,360).data; points = [];
    for (let lat = -58;lat < 81;lat += 1.9) {
      const step = 1.9 / Math.cos(lat * Math.PI / 180);
      for (let lon = -180;lon < 180;lon += step) {
        const xy = texProjection([lon,lat]);
        const row = Math.min(359,Math.max(0,Math.floor(xy[1]))), col = Math.min(719,Math.max(0,Math.floor(xy[0])));
        const onLand = pixels[(row * 720 + col) * 4 + 3] > 20;
        if (onLand || Math.round((lon + 180) / step) % 5 === 0) points.push({geo:[lon,lat],land:onLand,shine:(lon * 13 + lat * 7) * .01745});
      }
    }
      return points;
    }
  function prepare() {
    // Share the actual daily overview's night atlas, without delaying login.
    window.SFRegionAtlas?.prepare();
    if (window.SFLocationMapEngine) return Promise.resolve(window.SFLocationMapEngine);
    if (!preparing) preparing = new Promise(resolve => {
      const script = document.createElement('script');
      script.src = 'assets/location-map-engine-v1.js?v=20261016-horizon1';
      script.onload = () => resolve(window.SFLocationMapEngine || null);
      script.onerror = () => { script.remove(); preparing = null; resolve(null); };
      document.head.appendChild(script);
    });
    return preparing;
  }
  function start(site) {
    stop();
    const engine = window.SFLocationMapEngine;
    if (!engine?.d3 || !root.isConnected) return false;
    const old = document.getElementById('sfEntryGlobe');
    if (!old) return false;
    const sourceRect = old.getBoundingClientRect(), rootRect = root.getBoundingClientRect();
    const sourceLongitude = Number(old.dataset.longitude || 8);
    const source = {x: sourceRect.x + sourceRect.width / 2 - rootRect.x,
      y: sourceRect.y + sourceRect.height / 2 - rootRect.y, radius: sourceRect.width * .39};
    const canvas = document.createElement('canvas');
    canvas.id = 'sfEntryDiveCanvas'; canvas.setAttribute('aria-hidden', 'true');
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    root.appendChild(canvas);
    const d3 = engine.d3, land = engine.countries;
    const projection = d3.geoOrthographic().clipAngle(90).precision(.4);
    const surface=window.SFGlobeSurface?.create(engine,{maxPixels:600000,onReady(){if(!disposed)draw(performance.now());}});
    const path = d3.geoPath(projection, ctx), grid = d3.geoGraticule10();
    const target = site?.coordinates || null;
    // Unassigned accounts enter Germany; the country geometry supplies the camera center.
    const germany = land.features.find(feature => feature.properties?.id === 'DEU');
    const cameraTarget = target || (germany ? d3.geoCentroid(germany) : [10.5,51.1]);
    let width = root.clientWidth, height = root.clientHeight, frame = 0, disposed = false, last = 0;
    const atlasCanvas = document.createElement('canvas'), atlasContext = atlasCanvas.getContext('2d');
    const atlasProjection = d3.geoMercator().precision(.15);
    let atlasReady = false, atlasKey = '', atlasRevealAt = 3450, atlasSnapshot = null;
    const atlas = window.SFRegionAtlas?.create(engine, {onReady(ready) {
      atlasReady = !!ready;atlasRevealAt = Math.max(3450,performance.now() - started);
      if (!disposed && atlasReady) prepareAtlas();
    }});
    const started = performance.now();
    const clamp = value => Math.max(0,Math.min(1,value));
    const ease = value => { value = clamp(value); return value * value * (3 - 2 * value); };
    function resize() {
      width = root.clientWidth;height = root.clientHeight;
      const ratio = Math.min(devicePixelRatio || 1,2);
      canvas.width = Math.round(width * ratio);canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio,0,0,ratio,0,0);
      // Fixed dimensions throughout the animation keep the city lights stable.
      const atlasRatio = Math.min(ratio,Math.sqrt(2000000 / Math.max(1,width * height)));
      atlasCanvas.width = Math.max(1,Math.round(width * atlasRatio));atlasCanvas.height = Math.max(1,Math.round(height * atlasRatio));
      atlasContext?.setTransform(atlasRatio,0,0,atlasRatio,0,0);atlasKey = '';atlasSnapshot = null;
      if (atlasReady) prepareAtlas();
    }
    // Draw the shared map once, before it becomes visible. The same camera
    // then moves this prepared image continuously with the approaching globe.
    function prepareAtlas() {
      if (!atlas || !atlasContext || !atlasReady || !width || !height) return;
      const at = 3450, move = ease((at - 150) / 3300), zoom = ease((at - 850) / 4300);
      const x = source.x + (width * .5 - source.x) * move;
      const y = source.y + (height * .46 - source.y) * move;
      const lon = sourceLongitude * (1 - move) + cameraTarget[0] * move;
      const lat = 21 * (1 - move) + cameraTarget[1] * move;
      const radius = Math.max(1,source.radius) * Math.exp(zoom * 3.45);
      atlasProjection.center([lon,lat]).translate([x,y]).scale(radius * Math.cos(lat * Math.PI / 180));
      atlasContext.clearRect(0,0,width,height);
      atlas.render(atlasContext,atlasProjection,width,height,{top:35});
      atlasSnapshot = {scale:atlasProjection.scale(),anchor:atlasProjection([10,50])};
    }
    function draw(now) {
      const t = now - started, move = ease((t - 150) / 3300);
      // Every successful login dives into the globe; a workplace only determines the named destination.
      const zoom = ease((t - 850) / 4300);
      const cx = source.x + (width * .5 - source.x) * move;
      const cy = source.y + (height * .46 - source.y) * move;
      const radius = Math.max(1,source.radius) * Math.exp(zoom * 3.45);
      const lon = sourceLongitude * (1 - move) + cameraTarget[0] * move;
      const lat = 21 * (1 - move) + cameraTarget[1] * move;
      const center = [lon,lat];
      projection.rotate([-lon,-lat,0]).translate([cx,cy]).scale(radius);
      const atlasBlend = atlasReady && atlasContext ? ease((t - atlasRevealAt) / 1250) : 0;
      canvas.dataset.phase = atlasBlend >= 1 ? 'atlas' : atlasBlend > 0 ? 'transforming' : 'globe';
      canvas.dataset.atlasBlend = atlasBlend.toFixed(3);
      // Keep the finished map visible until the entry itself fades into the workspace.
      ctx.clearRect(0,0,width,height);ctx.save();
      if (atlasBlend < 1) {
      const originalSurface=surface?.render(ctx,projection,width,height,t);
      if(!originalSurface){
      const halo = ctx.createRadialGradient(cx,cy,radius * .75,cx,cy,radius * 1.25);
      halo.addColorStop(0,'#32b9b600');halo.addColorStop(.54,'#48dfd21c');halo.addColorStop(.7,'#48dfd238');halo.addColorStop(1,'#48dfd200');
      ctx.fillStyle = halo;ctx.beginPath();ctx.arc(cx,cy,radius * 1.25,0,Math.PI * 2);ctx.fill();
      const ocean = ctx.createRadialGradient(cx - radius * .3,cy - radius * .4,0,cx,cy,radius);
      ocean.addColorStop(0,'#103c49');ocean.addColorStop(.6,'#092831');ocean.addColorStop(1,'#020e17');
      ctx.fillStyle = ocean;ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI * 2);ctx.fill();
      ctx.save();ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI * 2);ctx.clip();
      ctx.beginPath();path(land);ctx.fillStyle = '#1c5e641c';ctx.fill();ctx.strokeStyle = '#6dd2ce32';ctx.lineWidth = .65;ctx.stroke();
      ctx.beginPath();path(grid);ctx.strokeStyle = '#75c0d41d';ctx.lineWidth = .6;ctx.stroke();
      for (const point of fallbackPoints(engine)) {
        const distance = d3.geoDistance(center,point.geo);
        if (distance > Math.PI / 2) continue;
        const xy = projection(point.geo);
        if (xy[0] < -6 || xy[0] > width + 6 || xy[1] < -6 || xy[1] > height + 6) continue;
        const z = Math.cos(distance), shimmer = .65;
        const alpha = (.24 + z * .68) * (point.land ? .55 + shimmer * .45 : .18);
        ctx.fillStyle = point.land ? `rgba(115,242,218,${alpha})` : `rgba(114,184,203,${alpha})`;
        const dot = (point.land ? .85 : .6) * Math.min(2.6,Math.sqrt(radius / Math.max(1,source.radius)));
        ctx.beginPath();ctx.arc(xy[0],xy[1],dot,0,Math.PI * 2);ctx.fill();
      }
      ctx.restore();ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI * 2);
      ctx.strokeStyle = '#7de9df66';ctx.lineWidth = .8;ctx.stroke();
      }else{ctx.beginPath();path(land);ctx.strokeStyle='#bce5dc3d';ctx.lineWidth=.65;ctx.stroke();}
      if (zoom < .4) {
        ctx.save();ctx.translate(cx,cy);ctx.rotate(-.3);ctx.beginPath();ctx.ellipse(0,0,radius * 1.16,radius * .3,0,0,Math.PI * 2);
        ctx.strokeStyle = `rgba(94,201,205,${.23 * (1 - zoom / .4)})`;ctx.lineWidth = .7;ctx.stroke();ctx.restore();
      }
      }
      if (atlasBlend > 0) {
        // The local scale of Mercator matches the zoomed sphere at its center.
        // Both the terrain and its labels come from the shared atlas renderer.
        atlasProjection.center(center).translate([cx,cy]).scale(radius * Math.cos(lat * Math.PI / 180));
        if (atlasSnapshot) {
          const anchor=atlasProjection([10,50]), ratio=atlasProjection.scale()/atlasSnapshot.scale;
          ctx.save();ctx.globalAlpha *= atlasBlend;
          ctx.translate(anchor[0],anchor[1]);ctx.scale(ratio,ratio);
          ctx.drawImage(atlasCanvas,-atlasSnapshot.anchor[0],-atlasSnapshot.anchor[1],width,height);ctx.restore();
        }
      }
      if (target && d3.geoDistance(center,target) < Math.PI / 2) {
        const globePin = projection(target), mapPin = atlasBlend ? atlasProjection(target) : globePin;
        const pin = globePin.map((value,index)=>value+(mapPin[index]-value)*atlasBlend), pulse = (Math.sin(now * .002) + 1) / 2;
        ctx.save();ctx.shadowColor = '#18d2ef';ctx.shadowBlur = 16;ctx.fillStyle = '#b5f5ff';
        ctx.beginPath();ctx.arc(pin[0],pin[1],(3 + zoom * 9) * (1 - atlasBlend) + 3.3 * atlasBlend,0,Math.PI * 2);ctx.fill();ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(24,210,239,${.6 - pulse * .3})`;ctx.lineWidth = 1;
        ctx.beginPath();ctx.arc(pin[0],pin[1],(10 + pulse * 8 + zoom * 70) * (1 - atlasBlend) + (10 + pulse * 6) * atlasBlend,0,Math.PI * 2);ctx.stroke();
        if (t > 1100 && t < 3750) {
          ctx.fillStyle = `rgba(203,246,238,${ease((t - 1100) / 550) * (1 - ease((t - 3250) / 500))})`;
          ctx.font = '12px Inter,system-ui,sans-serif';ctx.textAlign = 'left';ctx.fillText(site.name,pin[0] + 22,pin[1] - 15);
        }
        ctx.restore();
      }
      ctx.restore();
    }
    function tick(now) {
      if (disposed) return;
      if (!root.isConnected || !root.classList.contains('sf-entry-success')) { stop(); return; }
      if (!document.hidden) { draw(now);last = now; }
      if (now - started < 6000) frame = requestAnimationFrame(tick);
    }
    const observer = new ResizeObserver(resize);observer.observe(root);
    stopActive = () => { disposed = true;surface?.dispose();atlas?.dispose();atlasCanvas.width=atlasCanvas.height=1;cancelAnimationFrame(frame);observer.disconnect();canvas.remove(); };
    resize();draw(started);frame = requestAnimationFrame(tick);
    return true;
  }
  function stop() { const stopCurrent = stopActive;stopActive = null;stopCurrent?.(); }
  window.SFEntryDive = {prepare,start,stop};
  document.dispatchEvent(new Event('sf:entry-dive-ready'));
  // Prepare the fallback on an idle turn while the login remains interactive.
  const warmFallback=()=>prepare().then(engine=>{if(engine&&root.isConnected)fallbackPoints(engine);});
  if(window.requestIdleCallback)window.requestIdleCallback(warmFallback,{timeout:5000});
  else setTimeout(warmFallback,1200);
})();
