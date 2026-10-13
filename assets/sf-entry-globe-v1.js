/* Decorative Earth; no authentication, telemetry or data requests. */
(function () {
  'use strict';
  const root = document.getElementById('sfEntryOverlay');
  const canvas = document.getElementById('sfEntryGlobe');
  if (!root || !canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Simplified geographic outlines, longitude/latitude. Dot spacing follows latitude.
  const land = [
    [[-168,65],[-145,71],[-125,70],[-110,76],[-83,72],[-61,56],[-64,47],[-80,25],[-97,16],[-106,23],[-117,32],[-126,48],[-150,58]],
    [[-97,20],[-88,21],[-82,9],[-77,8],[-84,16]],
    [[-73,59],[-48,60],[-20,76],[-38,84],[-60,81]],
    [[-81,12],[-70,10],[-59,6],[-48,-1],[-35,-8],[-41,-22],[-52,-34],[-67,-55],[-75,-47],[-70,-18],[-81,-4]],
    [[-10,36],[-9,44],[-1,49],[6,54],[6,59],[20,71],[31,70],[29,55],[41,47],[29,40],[22,36],[14,42],[2,42]],
    [[-17,36],[8,37],[30,31],[35,22],[51,12],[42,-2],[40,-16],[30,-34],[18,-35],[11,-19],[8,4],[-17,15]],
    [[28,70],[59,72],[95,77],[140,72],[179,66],[170,53],[143,45],[134,34],[122,23],[108,19],[104,1],[96,5],[90,22],[78,8],[67,25],[48,13],[36,30],[40,47]],
    [[113,-11],[134,-12],[143,-17],[153,-27],[146,-39],[129,-33],[115,-35],[112,-23]],
    [[47,-13],[50,-16],[47,-25],[44,-25],[43,-18]],
    [[130,31],[142,45],[145,42],[136,33]],
    [[95,5],[105,-6],[116,-9],[120,-6],[110,-2],[101,5]],
    [[120,-2],[131,-4],[142,-3],[153,-10],[141,-10],[129,-7]],
    [[166,-34],[178,-38],[170,-47],[166,-45]],
    [[-8,50],[1,51],[-3,59],[-7,57]],
    [[-24,63],[-13,64],[-15,67],[-23,67]]
  ];
  function inPolygon(lon, lat, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  const points = [], rad = Math.PI / 180;
  for (let lat = -57; lat <= 80; lat += 2.6) {
    const step = 2.6 / Math.cos(lat * rad);
    for (let lon = -180; lon < 180; lon += step) {
      const onLand = land.some(poly => inPolygon(lon, lat, poly));
      if (!onLand && Math.round((lon + 180) / step) % 3) continue;
      points.push({x: Math.cos(lat * rad) * Math.sin(lon * rad), y: -Math.sin(lat * rad), z: Math.cos(lat * rad) * Math.cos(lon * rad), land: onLand, phase: (lon * 13 + lat * 7) * rad});
    }
  }
  let size = 600, frame = 0, last = 0, angle = -.22, elapsed = 0, disposed = false;
  function resize() {
    size = Math.max(1, canvas.getBoundingClientRect().width);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  function draw() {
    const c = size / 2, r = size * .39;
    ctx.clearRect(0, 0, size, size);
    const atmosphere = ctx.createRadialGradient(c, c, r * .86, c, c, r * 1.15);
    atmosphere.addColorStop(0, 'rgba(17,132,167,0)');
    atmosphere.addColorStop(.52, 'rgba(26,194,218,.15)');
    atmosphere.addColorStop(.66, 'rgba(35,205,231,.4)');
    atmosphere.addColorStop(1, 'rgba(15,107,158,0)');
    ctx.fillStyle = atmosphere; ctx.beginPath(); ctx.arc(c, c, r * 1.15, 0, Math.PI * 2); ctx.fill();
    const ocean = ctx.createRadialGradient(c - r * .36, c - r * .4, 0, c, c, r);
    ocean.addColorStop(0, '#103948'); ocean.addColorStop(.7, '#08202c'); ocean.addColorStop(1, '#020d16');
    ctx.fillStyle = ocean; ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = 'rgba(71,192,210,.10)'; ctx.lineWidth = .7;
    for (const k of [-.75,-.4,0,.4,.75]) {
      ctx.beginPath(); ctx.ellipse(c, c + r * k, r * Math.sqrt(1 - k * k), r * .12, -.12, 0, Math.PI * 2); ctx.stroke();
    }
    const sin = Math.sin(angle), cos = Math.cos(angle);
    for (const p of points) {
      const x = p.x * cos + p.z * sin, z = p.z * cos - p.x * sin;
      if (z < 0) continue;
      const y = p.y * .985 - z * .17;
      const shimmer = motion.matches ? .65 : .55 + .45 * Math.sin(elapsed * .0015 + p.phase);
      const alpha = (.25 + z * .75) * (p.land ? .7 + shimmer * .3 : .22);
      ctx.fillStyle = p.land ? `rgba(92,239,226,${alpha})` : `rgba(72,147,181,${alpha})`;
      ctx.beginPath(); ctx.arc(c + x * r, c + y * r, p.land ? .85 + z * .5 : .65, 0, Math.PI * 2); ctx.fill();
      if (p.land && shimmer > .96 && z > .35) {
        ctx.fillStyle = `rgba(178,255,246,${z * .75})`;
        ctx.beginPath(); ctx.arc(c + x * r, c + y * r, 2.1, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(117,233,237,.46)'; ctx.lineWidth = .8;
    ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.stroke();
  }
  function dispose() {
    disposed = true; cancelAnimationFrame(frame); observer.disconnect(); resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', restart); motion.removeEventListener('change', restart);
  }
  function tick(now) {
    frame = 0;
    if (!root.isConnected || root.classList.contains('sf-entry-out')) { dispose(); return; }
    if (document.hidden || motion.matches) return;
    if (!last) last = now;
    const delta = now - last;
    if (delta >= 33) { elapsed += Math.min(delta, 100); angle += Math.min(delta, 100) * .000035; draw(); last = now; }
    frame = requestAnimationFrame(tick);
  }
  function restart() {
    if (disposed) return;
    cancelAnimationFrame(frame); frame = 0; last = 0; draw();
    if (!document.hidden && !motion.matches) frame = requestAnimationFrame(tick);
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  const observer = new MutationObserver(() => { if (!root.isConnected || root.classList.contains('sf-entry-out')) dispose(); });
  observer.observe(root, {attributes:true, attributeFilter:['class']});
  observer.observe(root.parentNode, {childList:true});
  document.addEventListener('visibilitychange', restart); motion.addEventListener('change', restart);
  resize(); restart();
})();
