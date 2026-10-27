const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(require('node:path').join(__dirname,'..',p),'utf8');
const flush=()=>new Promise(r=>setImmediate(r));
function loader(role){
 const scripts=[],preloads=[],calls=[],timers=new Map();let timerId=0;
 const B={role,ready:false,boot:async()=>{B.ready=true;return 'booted'},init(){calls.push('init')},baseOpenApp(){calls.push('open')}};
 const document={scripts,createElement(){const node={remove(){const i=scripts.indexOf(node);if(i>=0)scripts.splice(i,1)}};return node},head:{appendChild:n=>preloads.push(n)},body:{appendChild:n=>scripts.push(n)}};
 vm.runInNewContext(read('assets/conflict-plausibility-v1.js'),{window:{SFBackend:B},document,location:{href:'https://schichtfunk.de/'},URL,console:{error(){}},setTimeout(fn){timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id)});
 const drain=async(from,to)=>{for(let i=from;i<to;i++){assert.ok(scripts[i],'script '+i+' is ready only after its predecessor');scripts[i].onload();await flush()}};
 return{B,scripts,preloads,calls,timers,drain};
}
test('base downloads preload together but execute in dependency order before initialization',async()=>{
 const e=loader('EMPLOYEE');assert.equal(e.preloads.length,57);assert.equal(e.scripts.length,1);assert.deepEqual(e.calls,[]);
 await e.drain(0,56);assert.deepEqual(e.calls,[]);await e.drain(56,57);assert.deepEqual(e.calls,['init']);assert.equal(await e.B.boot(),'booted');assert.equal(e.scripts.length,57);assert.ok(e.scripts.every(s=>s.async===false));
});
test('concurrent login and core requests share one complete boot and wait for all core dependencies',async()=>{
 const e=loader('OWNER');await e.drain(0,57);
 const modules=e.B.prepareManagerModules(),first=e.B.boot(),second=e.B.boot();assert.equal(first,second);await flush();assert.equal(e.scripts.length,58);
 let complete=false;first.then(()=>complete=true);await e.drain(57,68);assert.equal(complete,false);await e.drain(68,69);await modules;await first;assert.equal(complete,true);
});
test('workspaces load once on demand and time/report requests share their ordered group',async()=>{
 const e=loader('OWNER');await e.drain(0,57);const boot=e.B.boot();await flush();await e.drain(57,69);await boot;
 const p=e.B.ensureManagerViewModules('employees'),p2=e.B.ensureManagerViewModules('employees');assert.equal(p,p2);assert.equal(e.B.managerViewNeedsLoading('employees'),true);
 assert.ok(e.scripts[69].src.includes('supabase-personnel-file-observer-guard'));await e.drain(69,80);await p;assert.ok(e.scripts[70].src.includes('supabase-personnel-file-v1'));assert.equal(e.B.managerViewNeedsLoading('employees'),false);
 const t=e.B.ensureManagerViewModules('time'),r=e.B.ensureManagerViewModules('reports');assert.equal(t,r);assert.equal(t,e.B.ensureManagerViewModules('billing'));await e.drain(80,86);await t;await e.B.ensureManagerViewModules('reports');assert.equal(e.scripts.length,86);
});
test('one failed download is retried before any dependent module executes',async()=>{
 const e=loader('EMPLOYEE'),failed=e.scripts[0];failed.onerror();assert.equal(e.scripts.length,1);assert.notEqual(e.scripts[0],failed);await e.drain(0,57);assert.deepEqual(e.calls,['init']);
});
test('permanent base failure prevents authentication and does not run partially installed dependencies',async()=>{
 const e=loader('EMPLOYEE');e.scripts[0].onerror();e.scripts[0].onerror();await flush();assert.equal(e.scripts.length,0);assert.deepEqual(e.calls,[]);
});
test('a timed-out script cannot be inserted twice or allow authentication to continue',async()=>{
 const e=loader('EMPLOYEE');e.timers.values().next().value();await flush();assert.equal(e.scripts.length,1);assert.deepEqual(e.calls,[]);e.scripts[0].onload?.();await flush();assert.deepEqual(e.calls,[]);
});
test('a failed workspace stays blocked after its bounded retry and never installs dependent scripts',async()=>{
 const e=loader('OWNER');await e.drain(0,57);const boot=e.B.boot();await flush();await e.drain(57,69);await boot;
 const first=e.B.ensureManagerViewModules('employees'),assertion=assert.rejects(first,/Modul konnte nicht geladen/);e.scripts[69].onerror();e.scripts[69].onerror();await assertion;
 assert.equal(e.B.managerViewNeedsLoading('employees'),true);await assert.rejects(e.B.ensureManagerViewModules('employees'),/Modul konnte nicht geladen/);assert.equal(e.scripts.length,69);
});
test('time-only startup loads its own initial workspace and leaves personnel deferred',async()=>{
 const e=loader('TIME_TRACKING');await e.drain(0,57);const boot=e.B.boot();await flush();await e.drain(57,69);await e.drain(69,75);await boot;assert.equal(e.B.managerViewNeedsLoading('time'),false);assert.equal(e.scripts.some(s=>s.src.includes('supabase-personnel-file-v1')),false);
});
test('timezone conversion remains correct across midnight and DST without constructing a formatter for every duty',()=>{
 const s=read('assets/supabase-data-v1.js'),a=s.indexOf('  const localFormats='),b=s.indexOf('  const interval=',a);let count=0;
 const c={B:{},Intl:{DateTimeFormat:function(...args){count++;return new Intl.DateTimeFormat(...args)}},Date,Map};
 vm.runInNewContext(s.slice(a,b)+'\nthis.datePart=datePart;this.timePart=timePart;',c);
 for(let i=0;i<1000;i++){assert.equal(c.datePart('2026-10-24T22:30:00Z','Europe/Berlin'),'2026-10-25');assert.equal(c.timePart('2026-10-24T22:30:00Z','Europe/Berlin'),'00:30')}
 assert.equal(c.timePart('2026-10-25T00:30:00Z','Europe/Berlin'),'02:30');assert.equal(c.timePart('2026-10-25T01:30:00Z','Europe/Berlin'),'02:30');assert.equal(count,2);
 assert.equal(c.datePart('2026-10-24T22:30:00Z','UTC'),'2026-10-24');assert.equal(c.timePart('2026-10-24T22:30:00Z','UTC'),'22:30');assert.equal(count,4);
});
