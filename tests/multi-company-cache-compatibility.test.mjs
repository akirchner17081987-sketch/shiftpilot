import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../schichtfunk-sw.js',import.meta.url),'utf8');
function serviceWorker(){
  const handlers={},entries=new Map();let network=async()=>new Response('old');
  const cache={async put(req,res){entries.set(req.url,res)},async match(req){return entries.get(typeof req==='string'?new URL(req,'https://qa.invalid').href:req.url)?.clone()}};
  const self={location:{origin:'https://qa.invalid'},addEventListener:(type,handler)=>{handlers[type]=handler}};
  vm.runInNewContext(source,{self,caches:{open:async()=>cache},fetch:(...args)=>network(...args),URL,Request,Response,AbortController,setTimeout,clearTimeout});
  async function request(path){
    let response;const event={request:new Request('https://qa.invalid'+path),respondWith(value){response=value},waitUntil(){}};
    handlers.fetch(event);assert.ok(response,'request must be handled by service worker');return await response;
  }
  return {request,setNetwork(fn){network=fn}};
}
test('JS cache returns the latest successful network version, or the cached version on network failure',async()=>{
  const w=serviceWorker();let r=await w.request('/assets/portal.js?v=1');assert.equal(await r.text(),'old');
  w.setNetwork(async()=>{throw Error('offline')});r=await w.request('/assets/portal.js?v=1');assert.equal(await r.text(),'old');
  w.setNetwork(async()=>new Response('new'));r=await w.request('/assets/portal.js?v=1');assert.equal(await r.text(),'new');
  w.setNetwork(async()=>{throw Error('offline')});r=await w.request('/assets/portal.js?v=1');assert.equal(await r.text(),'new');
});
test('HTTP errors are returned, and private or no-store responses do not replace cached assets',async()=>{
  const w=serviceWorker();await w.request('/assets/portal.js?v=1');
  w.setNetwork(async()=>new Response('unavailable',{status:503}));let r=await w.request('/assets/portal.js?v=1');assert.equal(r.status,503);
  w.setNetwork(async()=>new Response('private',{headers:{'cache-control':'private, no-store'}}));r=await w.request('/assets/portal.js?v=1');assert.equal(await r.text(),'private');
  w.setNetwork(async()=>{throw Error('offline')});r=await w.request('/assets/portal.js?v=1');assert.equal(await r.text(),'old');
});
