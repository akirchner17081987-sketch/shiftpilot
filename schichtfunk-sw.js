// SchichtFunk – sicherer PWA App-Shell + Web Push Service Worker V3
const CACHE='schichtfunk-shell-v3';
const STATIC=[
  '/index.html',
  '/site.webmanifest',
  '/assets/schichtfunk-logo.svg',
  '/assets/schichtfunk-app-icon-192.png',
  '/assets/schichtfunk-app-icon-512.png',
  '/assets/schichtfunk-app-icon-maskable-512.png'
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>Promise.all(STATIC.map(url=>cache.add(url).catch(()=>null)))).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('schichtfunk-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

function mayCache(response){
  if(!response||!response.ok)return false;
  const cc=String(response.headers.get('cache-control')||'').toLowerCase();
  return !cc.includes('no-store')&&!cc.includes('private');
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  // Nie API-Antworten oder geheime QR-Terminal-URLs cachen.
  if(url.pathname.startsWith('/api/')||url.pathname==='/qr-time'||url.pathname==='/qr-time.html')return;

  if(request.mode==='navigate'){
    event.respondWith(fetch(request).catch(()=>caches.match('/index.html').then(r=>r||Response.error())));
    return;
  }

  const staticAsset=url.pathname.startsWith('/assets/')||url.pathname==='/site.webmanifest';
  if(!staticAsset)return;

  // Kritische Laufzeit-Integrationen immer zuerst aus dem Netz holen. So kann ein
  // installierter PWA-Cache keine Sicherheits-/Push-Korrektur auf dem Gerät verdecken.
  const networkFirst=/\/(navigation-compat-v1|employee-mobile-pwa-v1|push-notifications-v1)\.js$/.test(url.pathname);
  if(networkFirst){
    event.respondWith(caches.open(CACHE).then(async cache=>{
      try{
        const response=await fetch(request);
        if(mayCache(response))cache.put(request,response.clone());
        return response;
      }catch{
        return (await cache.match(request))||Response.error();
      }
    }));
    return;
  }

  event.respondWith(caches.open(CACHE).then(async cache=>{
    const cached=await cache.match(request);
    const refresh=fetch(request).then(response=>{
      if(mayCache(response))cache.put(request,response.clone());
      return response;
    }).catch(()=>null);
    if(cached){event.waitUntil(refresh);return cached}
    const network=await refresh;
    return network||Response.error();
  }));
});

self.addEventListener('push',event=>{
  let payload={};
  try{payload=event.data?.json?.()||{}}catch{try{payload={title:'SchichtFunk',body:event.data?.text?.()||''}}catch{payload={}}}
  const title=payload.title||'SchichtFunk';
  const options={
    body:payload.body||'Neue Benachrichtigung in SchichtFunk',
    icon:'/assets/schichtfunk-app-icon-192.png',
    badge:'/assets/schichtfunk-app-icon-192.png',
    tag:payload.tag||'schichtfunk-notification',
    renotify:true,
    data:{url:payload.url||'/#app'}
  };
  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||'/#app',self.location.origin).href;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async list=>{
    const existing=list.find(client=>{try{return new URL(client.url).origin===self.location.origin}catch{return false}});
    if(existing){try{await existing.navigate(target)}catch{}return existing.focus()}
    return self.clients.openWindow(target);
  }));
});
