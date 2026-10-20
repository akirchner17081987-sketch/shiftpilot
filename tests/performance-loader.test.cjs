const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(require('node:path').join(__dirname,'..',p),'utf8');
const flush=()=>new Promise(r=>setImmediate(r));
function loader(role){
 const scripts=[],calls=[],B={role,ready:false,boot:async()=>{B.ready=true;return 'booted'},init(){calls.push('init')},baseOpenApp(){calls.push('open')}};
 const document={scripts,createElement(){const node={remove(){const i=scripts.indexOf(node);if(i>=0)scripts.splice(i,1)}};return node},body:{appendChild(node){scripts.push(node)}}};
 vm.runInNewContext(read('assets/conflict-plausibility-v1.js'),{window:{SFBackend:B},document,location:{href:'https://schichtfunk.de/'},URL,console});
 return{B,scripts,calls};
}
test('authenticated data and required scripts can load concurrently without finishing early',async()=>{
 const e=loader('OWNER');e.scripts.slice().forEach(s=>s.onload());
 const modules=e.B.prepareManagerModules();assert.equal(e.scripts.length,69);
 const boot=e.B.boot();await flush();assert.equal(e.scripts.length,69,'The core request is shared');
 let complete=false;boot.then(()=>complete=true);await flush();assert.equal(complete,false);
 e.scripts.slice(57).forEach(s=>s.onload());await modules;await boot;assert.equal(complete,true);
});
test('concurrent login and token events share one complete boot',async()=>{
 const e=loader('OWNER');e.scripts.slice().forEach(s=>s.onload());
 const first=e.B.boot(),second=e.B.boot();assert.equal(first,second);
 await flush();assert.equal(e.scripts.length,69);e.scripts.slice(57).forEach(s=>s.onload());await first;
});
test('workspaces load once on demand, retain dependency order and share time/report requests',async()=>{
 const e=loader('OWNER');e.scripts.slice().forEach(s=>s.onload());const boot=e.B.boot();await flush();e.scripts.slice(57).forEach(s=>s.onload());await boot;
 const p=e.B.ensureManagerViewModules('employees'),p2=e.B.ensureManagerViewModules('employees');assert.equal(p,p2);assert.equal(e.scripts.length,80);
 assert.ok(e.scripts[69].src.includes('supabase-personnel-file-observer-guard'));assert.ok(e.scripts[70].src.includes('supabase-personnel-file-v1'));
 assert.equal(e.B.managerViewNeedsLoading('employees'),true);e.scripts.slice(69).forEach(s=>s.onload());await p;assert.equal(e.B.managerViewNeedsLoading('employees'),false);
 const t=e.B.ensureManagerViewModules('time'),r=e.B.ensureManagerViewModules('reports'),billing=e.B.ensureManagerViewModules('billing');assert.equal(t,r);assert.equal(t,billing);assert.equal(e.scripts.length,86);e.scripts.slice(80).forEach(s=>s.onload());await t;
 await e.B.ensureManagerViewModules('reports');assert.equal(e.scripts.length,86);assert.ok(e.scripts.every(s=>s.async===false));
});
test('a partially loaded workspace stays blocked until a fresh page can install all dependencies',async()=>{
 const e=loader('OWNER');e.scripts.slice().forEach(s=>s.onload());const boot=e.B.boot();await flush();e.scripts.slice(57).forEach(s=>s.onload());await boot;
 const first=e.B.ensureManagerViewModules('employees'),assertion=assert.rejects(first,/Modul konnte nicht geladen/);
 const group=e.scripts.slice(69);group[0].onerror();group.slice(1).forEach(s=>s.onload());await assertion;
 assert.equal(e.B.managerViewNeedsLoading('employees'),true);await assert.rejects(e.B.ensureManagerViewModules('employees'),/Modul konnte nicht geladen/);assert.equal(e.scripts.length,79,'No partially installed dependency group is reported as ready');
});
test('restored time-only accounts prepare their own initial workspace before boot returns',async()=>{
 const e=loader('TIME_TRACKING');e.scripts.slice().forEach(s=>s.onload());const boot=e.B.boot();await flush();e.scripts.slice(57).forEach(s=>s.onload());await flush();assert.equal(e.scripts.length,75);e.scripts.slice(69).forEach(s=>s.onload());await boot;
 assert.equal(e.B.managerViewNeedsLoading('time'),false);assert.equal(e.scripts.some(s=>s.src.includes('supabase-personnel-file-v1')),false);
});
test('module downloads start together with ordered execution and initialization waits for the entire base phase',async()=>{
 const e=loader('EMPLOYEE');assert.equal(e.scripts.length,57);assert.ok(e.scripts.every(s=>s.async===false));assert.deepEqual(e.calls,[]);
 e.scripts.slice(1).reverse().forEach(s=>s.onload());assert.deepEqual(e.calls,[]);e.scripts[0].onload();assert.deepEqual(e.calls,['init']);
 assert.equal(await e.B.boot(),'booted');assert.equal(e.scripts.length,57);
});
test('startup only waits for the core workspaces; personnel and time modules stay deferred',async()=>{
 const e=loader('OWNER');e.scripts.slice().forEach(s=>s.onload());const pending=e.B.boot();await flush();assert.equal(e.scripts.length,69);assert.ok(e.scripts.every(s=>s.async===false));
 e.scripts.slice(57,68).forEach(s=>s.onload());assert.deepEqual(e.calls,['init']);e.scripts[68].onload();assert.equal(await pending,'booted');assert.deepEqual(e.calls,['init']);
 assert.equal(e.scripts.some(s=>s.src.includes('supabase-personnel-file-v1')),false);assert.equal(e.scripts.some(s=>s.src.includes('datev-lodas-export')),false);
});
test('timezone conversion remains correct across midnight and DST without constructing a formatter for every duty',()=>{
 const s=read('assets/supabase-data-v1.js'),a=s.indexOf('  const localFormats='),b=s.indexOf('  const interval=',a);let count=0;
 const c={B:{},Intl:{DateTimeFormat:function(...args){count++;return new Intl.DateTimeFormat(...args)}},Date,Map};
 vm.runInNewContext(s.slice(a,b)+'\nthis.datePart=datePart;this.timePart=timePart;',c);
 for(let i=0;i<1000;i++){assert.equal(c.datePart('2026-10-24T22:30:00Z','Europe/Berlin'),'2026-10-25');assert.equal(c.timePart('2026-10-24T22:30:00Z','Europe/Berlin'),'00:30')}
 assert.equal(c.timePart('2026-10-25T00:30:00Z','Europe/Berlin'),'02:30');assert.equal(c.timePart('2026-10-25T01:30:00Z','Europe/Berlin'),'02:30');assert.equal(count,2);
 assert.equal(c.datePart('2026-10-24T22:30:00Z','UTC'),'2026-10-24');assert.equal(c.timePart('2026-10-24T22:30:00Z','UTC'),'22:30');assert.equal(count,4);
});
