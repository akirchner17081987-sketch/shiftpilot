import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../assets/sf-entry-globe-v1.js',import.meta.url),'utf8');
function harness({reduced=false,available=true}={}){
  let id=0,now=100,changed;const frames=new Map(),timers=new Map(),classes=new Set();
  const ctx=new Proxy({}, {get:(o,k)=>o[k]||(()=>k==='createRadialGradient'?{addColorStop(){}}:undefined),set:(o,k,v)=>(o[k]=v,true)});
  const canvas={dataset:{},getContext:()=>ctx,getBoundingClientRect:()=>({width:400})};
  const root={isConnected:true,dataset:{},classList:{contains:k=>classes.has(k)},parentNode:{}};
  const projection={rotate(){return this},translate(){return this},scale(){return this}};
  const window={devicePixelRatio:1,matchMedia:()=>({matches:reduced,addEventListener(){},removeEventListener(){}}),
    SFEntryDive:{prepare:()=>Promise.resolve({d3:{geoOrthographic:()=>({precision:()=>projection}),geoPath:()=>()=>{}},countries:{}})},
    SFGlobeSurface:{create:()=>({render:()=>available,dispose(){}})}};
  runInNewContext(source,{window,document:{hidden:false,getElementById:id=>id==='sfEntryOverlay'?root:canvas,createElement:()=>({...canvas}),addEventListener(){},removeEventListener(){}},
    ResizeObserver:class{observe(){}disconnect(){}},MutationObserver:class{constructor(fn){changed=fn}observe(){}disconnect(){}},
    setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id},clearTimeout:id=>timers.delete(id),
    requestAnimationFrame:fn=>{frames.set(++id,fn);return id},cancelAnimationFrame:id=>frames.delete(id)});
  return {root,window,frames,timers,success(){classes.add('sf-entry-success');changed()},
    async prepare(){[...timers.values()].find(x=>x.ms===0).fn();await Promise.resolve()},
    advance(n){for(let i=0;i<n;i++){now+=50;const callbacks=[...frames.values()];frames.clear();for(const fn of callbacks)fn(now)}},
    remove(){root.isConnected=false;changed()}};
}
test('auth completion cannot shorten or freeze the fixed globe dissolve',async()=>{
  const h=harness();await h.prepare();h.advance(36);
  assert.equal(h.root.dataset.globePhase,'transforming');
  let settled=false;h.window.SFEntryGlobePresentation.waitUntilSettled().then(()=>settled=true);
  h.success();assert.equal(h.root.dataset.globePhase,'transforming');
  h.advance(10);assert.equal(h.root.dataset.globePhase,'transforming');assert.equal(settled,false);
  h.advance(40);await Promise.resolve();assert.equal(h.root.dataset.globePhase,'surface');assert.equal(settled,true);
  h.remove();assert.equal(h.frames.size,0);
});
test('unavailable surface has a bounded presentation wait and retains the original globe',async()=>{
  const h=harness({available:false});await h.prepare();h.advance(100);
  let settled=false;h.window.SFEntryGlobePresentation.waitUntilSettled().then(()=>settled=true);
  [...h.timers.values()].find(x=>x.ms===4500).fn();await Promise.resolve();
  assert.equal(settled,true);assert.equal(h.root.dataset.globePhase,'outline');h.remove();
});
test('reduced motion presents the final globe immediately',async()=>{
  const h=harness({reduced:true});await h.prepare();assert.equal(h.root.dataset.globePhase,'surface');
  await h.window.SFEntryGlobePresentation.waitUntilSettled();assert.equal(h.frames.size,0);h.remove();
});
