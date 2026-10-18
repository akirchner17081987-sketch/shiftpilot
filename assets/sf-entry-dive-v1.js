/* Same-origin geographic animation. No authentication, geolocation, storage or service calls. */
(function () {
  'use strict';
  const root = document.getElementById('sfEntryOverlay');
  if (!root) return;
  let preparing = null, stopActive = null;
  function prepare() {
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
    const source = {x: sourceRect.x + sourceRect.width / 2 - rootRect.x,
      y: sourceRect.y + sourceRect.height / 2 - rootRect.y, radius: sourceRect.width * .39};
    const canvas = document.createElement('canvas');
    canvas.id = 'sfEntryDiveCanvas'; canvas.setAttribute('aria-hidden', 'true');
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    root.appendChild(canvas);
    const d3 = engine.d3, land = engine.countries;
    const projection = d3.geoOrthographic().clipAngle(90).precision(.4);
    const path = d3.geoPath(projection, ctx), grid = d3.geoGraticule10();
    // Rasterize published Natural Earth geometry once to sample the illuminated continents.
    const texture = document.createElement('canvas');texture.width = 720;texture.height = 360;
    const tc = texture.getContext('2d', {willReadFrequently:true});
    if (!tc) { canvas.remove(); return false; }
    const texProjection = d3.geoEquirectangular().scale(720 / (2 * Math.PI)).translate([360,180]);
    tc.fillStyle = '#fff';tc.beginPath();d3.geoPath(texProjection, tc)(land);tc.fill();
    const pixels = tc.getImageData(0,0,720,360).data, points = [];
    for (let lat = -58;lat < 81;lat += 1.9) {
      const step = 1.9 / Math.cos(lat * Math.PI / 180);
      for (let lon = -180;lon < 180;lon += step) {
        const xy = texProjection([lon,lat]);
        const row = Math.min(359,Math.max(0,Math.floor(xy[1]))), col = Math.min(719,Math.max(0,Math.floor(xy[0])));
        const onLand = pixels[(row * 720 + col) * 4 + 3] > 20;
        if (onLand || Math.round((lon + 180) / step) % 5 === 0) points.push({geo:[lon,lat],land:onLand,shine:(lon * 13 + lat * 7) * .01745});
      }
    }
    const target = site?.coordinates || null;
    let width = root.clientWidth, height = root.clientHeight, frame = 0, disposed = false, last = 0;
    const started = performance.now();
    const clamp = value => Math.max(0,Math.min(1,value));
    const ease = value => { value = clamp(value); return value * value * (3 - 2 * value); };
    function resize() {
      width = root.clientWidth;height = root.clientHeight;
      const ratio = Math.min(devicePixelRatio || 1,2);
      canvas.width = Math.round(width * ratio);canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio,0,0,ratio,0,0);
    }
    function draw(now) {
      const t = now - started, move = ease((t - 350) / 1900);
      const zoom = target ? ease((t - 2350) / 2800) : 0;
      const cx = source.x + (width * .5 - source.x) * move;
      const cy = source.y + (height * .46 - source.y) * move;
      const radius = Math.max(1,source.radius) * Math.exp(zoom * 3.45);
      const lon = 8 * (1 - move) + (target?.[0] || 8) * move;
      const lat = 21 * (1 - move) + (target?.[1] || 42) * move;
      const center = [lon,lat];
      projection.rotate([-lon,-lat,0]).translate([cx,cy]).scale(radius);
      ctx.clearRect(0,0,width,height);ctx.save();ctx.globalAlpha = 1 - ease((t - 4350) / 1450);
      const halo = ctx.createRadialGradient(cx,cy,radius * .75,cx,cy,radius * 1.25);
      halo.addColorStop(0,'#32b9b600');halo.addColorStop(.54,'#48dfd21c');halo.addColorStop(.7,'#48dfd238');halo.addColorStop(1,'#48dfd200');
      ctx.fillStyle = halo;ctx.beginPath();ctx.arc(cx,cy,radius * 1.25,0,Math.PI * 2);ctx.fill();
      const ocean = ctx.createRadialGradient(cx - radius * .3,cy - radius * .4,0,cx,cy,radius);
      ocean.addColorStop(0,'#103c49');ocean.addColorStop(.6,'#092831');ocean.addColorStop(1,'#020e17');
      ctx.fillStyle = ocean;ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI * 2);ctx.fill();
      ctx.save();ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI * 2);ctx.clip();
      ctx.beginPath();path(land);ctx.fillStyle = '#1c5e641c';ctx.fill();ctx.strokeStyle = '#6dd2ce32';ctx.lineWidth = .65;ctx.stroke();
      ctx.beginPath();path(grid);ctx.strokeStyle = '#75c0d41d';ctx.lineWidth = .6;ctx.stroke();
      for (const point of points) {
        const distance = d3.geoDistance(center,point.geo);
        if (distance > Math.PI / 2) continue;
        const xy = projection(point.geo);
        if (xy[0] < -6 || xy[0] > width + 6 || xy[1] < -6 || xy[1] > height + 6) continue;
        const z = Math.cos(distance), shimmer = .5 + .5 * Math.sin(now * .001 + point.shine);
        const alpha = (.24 + z * .68) * (point.land ? .55 + shimmer * .45 : .18);
        ctx.fillStyle = point.land ? `rgba(115,242,218,${alpha})` : `rgba(114,184,203,${alpha})`;
        const dot = (point.land ? .85 : .6) * Math.min(2.6,Math.sqrt(radius / Math.max(1,source.radius)));
        ctx.beginPath();ctx.arc(xy[0],xy[1],dot,0,Math.PI * 2);ctx.fill();
      }
      ctx.restore();ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI * 2);
      ctx.strokeStyle = '#7de9df66';ctx.lineWidth = .8;ctx.stroke();
      if (zoom < .4) {
        ctx.save();ctx.translate(cx,cy);ctx.rotate(-.3);ctx.beginPath();ctx.ellipse(0,0,radius * 1.16,radius * .3,0,0,Math.PI * 2);
        ctx.strokeStyle = `rgba(94,201,205,${.23 * (1 - zoom / .4)})`;ctx.lineWidth = .7;ctx.stroke();ctx.restore();
      }
      if (target && d3.geoDistance(center,target) < Math.PI / 2) {
        const pin = projection(target), pulse = (Math.sin(now * .002) + 1) / 2;
        ctx.save();ctx.shadowColor = '#8affe3';ctx.shadowBlur = 16;ctx.fillStyle = '#bdfff0';
        ctx.beginPath();ctx.arc(pin[0],pin[1],3 + zoom * 9,0,Math.PI * 2);ctx.fill();ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(123,255,224,${.6 - pulse * .3})`;ctx.lineWidth = 1;
        ctx.beginPath();ctx.arc(pin[0],pin[1],10 + pulse * 8 + zoom * 70,0,Math.PI * 2);ctx.stroke();
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
      if (!document.hidden && now - last >= 32) { draw(now);last = now; }
      if (now - started < 6000) frame = requestAnimationFrame(tick);
    }
    const observer = new ResizeObserver(resize);observer.observe(root);
    stopActive = () => { disposed = true;cancelAnimationFrame(frame);observer.disconnect();canvas.remove(); };
    resize();draw(started);frame = requestAnimationFrame(tick);
    return true;
  }
  function stop() { const stopCurrent = stopActive;stopActive = null;stopCurrent?.(); }
  window.SFEntryDive = {prepare,start,stop};
})();
