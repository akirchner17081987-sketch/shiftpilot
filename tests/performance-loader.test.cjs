const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(require('node:path').join(__dirname,'..',p),'utf8');
const flush=()=>new Promise(r=>setImmediate(r));
function loader(role){
 const scripts=[],calls=[],B={role,ready:false,boot:async()=>{B.ready=true;return 'booted'},init(){calls.push('init')},baseOpenApp(){calls.push('open')}};
 const document={scripts,createElement(){return{}},body:{appendChild(node){scripts.push(node)}}};
 vm.runInNewContext(read('assets/conflict-plausibility-v1.js'),{window:{SFBackend:B},document,location:{href:'https://schichtfunk.de/'},URL,console});
 return{B,scripts,calls};
}
test('module downloads start together with ordered execution and initialization waits for the entire base phase',async()=>{
 const e=loader('EMPLOYEE');assert.equal(e.scripts.length,56);assert.ok(e.scripts.every(s=>s.async===false));assert.deepEqual(e.calls,[]);
 e.scripts.slice(1).reverse().forEach(s=>s.onload());assert.deepEqual(e.calls,[]);e.scripts[0].onload();assert.deepEqual(e.calls,['init']);
 assert.equal(await e.B.boot(),'booted');assert.equal(e.scripts.length,56);
});
test('manager phase starts only after authenticated boot and waits for all its downloads',async()=>{
 const e=loader('OWNER');e.scripts.slice().forEach(s=>s.onload());const pending=e.B.boot();await flush();assert.equal(e.scripts.length,85);assert.ok(e.scripts.every(s=>s.async===false));
 e.scripts.slice(56,84).forEach(s=>s.onload());assert.deepEqual(e.calls,['init']);e.scripts[84].onload();assert.equal(await pending,'booted');assert.deepEqual(e.calls,['init','open']);
});
test('timezone conversion remains correct across midnight and DST without constructing a formatter for every duty',()=>{
 const s=read('assets/supabase-data-v1.js'),a=s.indexOf('  const localFormats='),b=s.indexOf('  const interval=',a);let count=0;
 const c={B:{},Intl:{DateTimeFormat:function(...args){count++;return new Intl.DateTimeFormat(...args)}},Date,Map};
 vm.runInNewContext(s.slice(a,b)+'\nthis.datePart=datePart;this.timePart=timePart;',c);
 for(let i=0;i<1000;i++){assert.equal(c.datePart('2026-10-24T22:30:00Z','Europe/Berlin'),'2026-10-25');assert.equal(c.timePart('2026-10-24T22:30:00Z','Europe/Berlin'),'00:30')}
 assert.equal(c.timePart('2026-10-25T00:30:00Z','Europe/Berlin'),'02:30');assert.equal(c.timePart('2026-10-25T01:30:00Z','Europe/Berlin'),'02:30');assert.equal(count,2);
 assert.equal(c.datePart('2026-10-24T22:30:00Z','UTC'),'2026-10-24');assert.equal(c.timePart('2026-10-24T22:30:00Z','UTC'),'22:30');assert.equal(count,4);
});
