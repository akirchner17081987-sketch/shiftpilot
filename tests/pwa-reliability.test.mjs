import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Window} from 'happy-dom';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
function worker(){
  const listeners={},writes=[],stored=new Map(),requests=[];let offline=false,body='current',writeFailure=false,activated=0;
  const key=request=>typeof request==='string'?new URL(request,'https://schichtfunk.de').pathname:new URL(request.url).pathname;
  const cache={match:async request=>stored.get(key(request))?.clone(),put:async(request,response)=>{if(writeFailure)throw Error('quota');writes.push(key(request));stored.set(key(request),response);},addAll:async paths=>{for(const p of paths){assert.equal(p.cache,'reload');stored.set(key(p),new Response(key(p)));}}};
  const self={location:{origin:'https://schichtfunk.de'},addEventListener:(type,fn)=>listeners[type]=fn,skipWaiting:async()=>activated++};
  vm.runInNewContext(read('schichtfunk-sw.js'),{self,URL,Request,Response,AbortController,setTimeout,clearTimeout,caches:{open:async()=>cache},fetch:async(request,options)=>{requests.push({url:request.url,options});if(offline)throw Error('offline');return new Response(body,{headers:{'cache-control':'no-cache, no-store, must-revalidate'}})}});
  async function request(path,mode='cors'){
    let result;const background=[];
    listeners.fetch({request:{url:'https://schichtfunk.de'+path,method:'GET',mode},respondWith:value=>result=value,waitUntil:p=>background.push(p)});
    if(!result)return null;const response=await result;await Promise.all(background);return response;
  }
  return {listeners,stored,writes,requests,request,setOffline:value=>offline=value,setBody:value=>body=value,setWriteFailure:value=>writeFailure=value,get activated(){return activated;}};
}

test('manifest and release marker bypass old caches on every request',async()=>{
  const w=worker();
  for(const path of ['/site.webmanifest','/pwa-release.json']){
    w.stored.set(path,new Response('stale'));w.setBody('release-one');assert.equal(await (await w.request(path)).text(),'release-one');
    w.setBody('release-two');assert.equal(await (await w.request(path)).text(),'release-two');
  }
  assert.equal(w.writes.length,0);assert.ok(w.requests.every(r=>r.options.cache==='no-store'));
});
test('navigation never serves the obsolete app shell or caches a terminal URL',async()=>{
  const w=worker();w.stored.set('/index.html',new Response('obsolete app'));w.stored.set('/offline.html',new Response('offline help'));
  assert.equal(await (await w.request('/','navigate')).text(),'current');w.setOffline(true);
  for(const path of ['/','/?bereich=mitarbeiter','/qr-time?t=synthetic-terminal','/qr-time.html?t=synthetic-terminal'])assert.equal(await (await w.request(path,'navigate')).text(),'offline help');
  assert.equal(w.writes.length,0);assert.equal(await w.request('/api/private'),null);assert.equal(await w.request('/qr-time?t=synthetic-terminal'),null);
});
test('offline installation is complete before activation and excludes application HTML',async()=>{
  const w=worker();let pending;w.listeners.install({waitUntil:p=>pending=p});await pending;
  assert.equal(w.activated,1);for(const p of ['/offline.html','/assets/pwa-runtime-v1.css','/assets/pwa-runtime-v1.js'])assert.ok(w.stored.has(p));
  assert.equal(w.stored.has('/index.html'),false);assert.equal(w.stored.has('/site.webmanifest'),false);
});
test('an installed PWA fetches current mobile code and styles even for an unchanged asset URL',async()=>{
  const w=worker();
  for(const path of ['/assets/employee-mobile-pwa-polish-v2.js?v=old','/assets/sf-entry-access-v1.css?v=old']){
    w.stored.set(path.split('?')[0],new Response('stale'));assert.equal(await (await w.request(path)).text(),'current');
  }
  assert.ok(w.requests.every(r=>r.options.cache==='no-cache'));
});

function runtime({offline=false,offlinePage=false,path='/',version='a'.repeat(20)}={}){
  const dom=new Window({url:'https://schichtfunk.de'+path});
  dom.document.head.innerHTML='<meta name="sf-release" content="'+version+'">';
  if(offlinePage){dom.document.body.setAttribute('data-sf-offline-page','');dom.document.body.innerHTML='<p id="sfOfflineMessage"></p><button id="sfOfflineRetry">Erneut versuchen</button>';}
  const timers=[],intervals=[],calls=[];let remote=version,fail=false,hidden=false,reloads=0,replaces=0,registrations=0;
  const navigator={onLine:!offline,serviceWorker:{register:async()=>{registrations++;return {update:async()=>{}};}}};
  const window={isSecureContext:true,addEventListener:dom.addEventListener.bind(dom)};
  Object.defineProperty(dom.document,'hidden',{get:()=>hidden});
  vm.runInNewContext(read('assets/pwa-runtime-v1.js'),{window,document:dom.document,navigator,location:{pathname:path,reload(){reloads++},replace(){replaces++}},AbortController,Date,clearTimeout(){},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length},setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length},fetch:async(url,options)=>{calls.push({url,options});if(fail)throw Error('connection');return {ok:true,json:async()=>({version:remote})}}});
  return {dom,window,navigator,timers,intervals,calls,setRemote:value=>remote=value,setFailed:value=>fail=value,setHidden:value=>hidden=value,get reloads(){return reloads;},get replacements(){return replaces;},get registrations(){return registrations;}};
}
test('a release change offers reload without interrupting open work',async()=>{
  const r=runtime();await tick();assert.equal(r.dom.document.getElementById('sfPwaStatus').hidden,true);
  r.setRemote('b'.repeat(20));await r.window.SFPwaRuntime.check();
  const banner=r.dom.document.getElementById('sfPwaStatus');assert.equal(banner.dataset.mode,'update');assert.equal(r.reloads,0);assert.match(banner.textContent,/speichere offene Änderungen/);
  banner.querySelector('button').click();assert.equal(r.reloads,1);
  assert.ok(r.calls.every(c=>c.options.cache==='no-store'&&c.options.credentials==='omit'));
  await r.dom.happyDOM.close();
});
test('offline and unreachable states are visible globally; retry recovers and hidden apps do not poll',async()=>{
  const r=runtime();await tick();r.setFailed(true);await r.window.SFPwaRuntime.check();
  const banner=r.dom.document.getElementById('sfPwaStatus');assert.equal(banner.dataset.mode,'unreachable');
  r.navigator.onLine=false;r.dom.dispatchEvent(new r.dom.Event('offline'));assert.equal(banner.dataset.mode,'offline');
  r.navigator.onLine=true;r.setFailed(false);banner.querySelector('button').click();await tick();assert.equal(banner.dataset.mode,'online');
  r.setHidden(true);const count=r.calls.length;r.intervals.forEach(t=>t.fn());await tick();assert.equal(r.calls.length,count);
  await r.dom.happyDOM.close();
});
test('the offline screen retries the original URL without authentication, storage writes or polling',async()=>{
  const r=runtime({offline:true,offlinePage:true,path:'/qr-time'});assert.match(r.dom.document.getElementById('sfOfflineMessage').textContent,/offline/);
  assert.equal(r.calls.length,0);assert.equal(r.registrations,0);assert.equal(r.intervals.length,0);
  r.dom.document.getElementById('sfOfflineRetry').click();assert.equal(r.reloads,1);await r.dom.happyDOM.close();
});
test('an explicitly opened offline screen returns home for both clean and HTML routes',async()=>{
  for(const path of ['/offline','/offline.html']){
    const r=runtime({offlinePage:true,path});r.dom.document.getElementById('sfOfflineRetry').click();assert.equal(r.replacements,1);assert.equal(r.reloads,0);await r.dom.happyDOM.close();
  }
});
test('mobile layout reaches idle and network changes still update the existing banner',async()=>{
  const dom=new Window();dom.document.body.innerHTML='<div id="sfEmployeePortal" data-sf-portal-active="dashboard"><div class="sf-portal-top"></div><div class="sf-portal-main"><div class="sf-employee-dashboard"></div></div></div>';
  const frames=[],timers=[],intervals=[],events={};const navigator={onLine:true,standalone:true};let hidden=false;
  Object.defineProperty(dom.document,'hidden',{get:()=>hidden});
  const window={SFBackend:{role:'EMPLOYEE',ready:true},matchMedia:()=>({matches:true,addEventListener(){}}),addEventListener:(name,fn)=>events[name]=fn,innerHeight:844};
  vm.runInNewContext(read('assets/employee-mobile-pwa-polish-v2.js'),{window,document:dom.document,navigator,sessionStorage:{getItem:()=>null,setItem(){}},MutationObserver:dom.MutationObserver,getComputedStyle:dom.getComputedStyle.bind(dom),requestAnimationFrame:fn=>frames.push(fn),setTimeout:fn=>timers.push(fn),clearTimeout(){},setInterval:fn=>intervals.push(fn)});
  timers[0]();await tick();
  for(let i=0;i<6;i++){frames.splice(0).forEach(fn=>fn());await tick();}
  assert.equal(frames.length,0,'no perpetual animation-frame cycle');
  assert.equal(intervals.length,0,'mobile UI needs no idle polling');
  navigator.onLine=false;events.offline();assert.match(dom.document.querySelector('#sfEmployeeMobileNetwork span').textContent,/Offline/);
  for(let i=0;i<4;i++){await tick();frames.splice(0).forEach(fn=>fn());}await tick();assert.equal(frames.length,0);
  hidden=true;const copy=dom.document.querySelector('#sfEmployeeMobileNetwork span');navigator.onLine=true;intervals.forEach(fn=>fn());assert.match(copy.textContent,/Offline/);
  await dom.happyDOM.close();
});
test('save feedback is empty and hidden until an actual save, and clears after dismissal',()=>{
  const html=read('index.html');const dom=new Window();dom.document.body.innerHTML=html.slice(html.indexOf('<div id="saveToast"'),html.indexOf('<!-- REAL_DASHBOARD_PREVIEW_FUNCTIONS -->'));
  const toast=dom.document.getElementById('saveToast');assert.equal(toast.getAttribute('aria-hidden'),'true');assert.equal(dom.document.getElementById('saveToastTitle').textContent,'');
  let hide;const window={};
  const context={document:dom.document,window,clearTimeout(){},setTimeout:fn=>{hide=fn;}};vm.runInNewContext(html.match(/function showSaveToast\([^\n]+/)[0],context);
  context.showSaveToast('Gespeichert','Änderungen übernommen');assert.equal(toast.getAttribute('aria-hidden'),'false');assert.equal(dom.document.getElementById('saveToastTitle').textContent,'Gespeichert');hide();assert.equal(toast.getAttribute('aria-hidden'),'true');assert.equal(dom.document.getElementById('saveToastTitle').textContent,'');
});
