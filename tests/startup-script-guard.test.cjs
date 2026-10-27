const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('assets/startup-script-guard-v1.js','utf8');
function guard(saved=new Map()){
 const events={},timers=new Map();let reloads=0,id=0;
 const document={addEventListener(name,fn){events[name]=fn},getElementById(){return null}};
 const window={},location={origin:'https://schichtfunk.de',href:'https://schichtfunk.de/',reload(){reloads++}};
 vm.runInNewContext(source,{window,document,location,URL,Date,sessionStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},setTimeout:fn=>(timers.set(++id,fn),id),clearTimeout:n=>timers.delete(n)});
 return{api:window.SFStartupScripts,events,timers,reloads:()=>reloads};
}
function script(){const listeners={};return{tagName:'SCRIPT',src:'https://schichtfunk.de/assets/core.js',dataset:{},listeners,addEventListener:(n,f)=>listeners[n]=f,removeEventListener:n=>delete listeners[n]}}
test('an in-flight deferred script does not count as loaded just because its element exists',async()=>{
 const g=guard(),s=script();g.events.DOMContentLoaded();let done=false;const p=g.api.wait(s).then(()=>done=true);await Promise.resolve();assert.equal(done,false);g.events.load({target:s});s.listeners.load();await p;assert.equal(done,true);assert.equal(s.dataset.sfLoadState,'loaded');assert.equal(g.timers.size,0);
});
test('one cold script failure can reload once, but repeated failures or active workspaces cannot loop',()=>{
 const saved=new Map(),one=guard(saved);one.events.error({target:script()});assert.equal(one.reloads(),1);one.events.error({target:script()});assert.equal(one.reloads(),1);
 const two=guard(saved);two.events.error({target:script()});assert.equal(two.reloads(),0);assert.throws(()=>two.api.assertReady(),/unterbrochen/);
 const active=guard();active.events.DOMContentLoaded();active.events.error({target:script()});assert.equal(active.reloads(),0);
});
test('existing failed and unresponsive scripts reject instead of hanging the startup promise',async()=>{
 const g=guard(),failed=script();g.events.DOMContentLoaded();failed.dataset.sfLoadState='failed';await assert.rejects(g.api.wait(failed),/nicht geladen/);
 const slow=script(),p=g.api.wait(slow),rejected=assert.rejects(p,/antwortet nicht/);g.timers.values().next().value();await rejected;assert.equal(g.timers.size,0);
});

test('a deferred script that blocks DOM readiness exposes recovery after the startup deadline',()=>{const g=guard();g.timers.values().next().value();assert.throws(()=>g.api.assertReady(),/unterbrochen/);assert.equal(g.reloads(),0)});
