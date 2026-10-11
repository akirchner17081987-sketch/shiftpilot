const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('application scripts download without blocking the parser and each static module/style has one cascade position',()=>{
 const html=read('index.html'),scripts=[...html.matchAll(/<script([^>]*\bsrc="([^"]+)"[^>]*)>/g)],styles=[...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)];
 assert.ok(scripts.length>45);assert.ok(scripts.every(m=>/\bdefer\b/.test(m[1])));
 const paths=scripts.map(m=>m[2].split('?')[0]);assert.equal(new Set(paths).size,paths.length);
 const css=styles.map(m=>m[1].split('?')[0]);assert.equal(new Set(css).size,css.length);
 assert.ok(html.indexOf('SFPageReady=new Promise')<html.indexOf('assets/template-manager.js'));
 assert.ok(paths.indexOf('assets/help-center-content-v3.js')<paths.indexOf('assets/help-center-renderer-v2.js'));
 assert.ok(paths.indexOf('assets/help-center-guides-v1.js')<paths.indexOf('assets/help-center-renderer-v2.js'));
 assert.ok(paths.indexOf('assets/wish-planning-core-v1.js')<paths.indexOf('assets/staffing-simulator-core-v1.js'));
 assert.ok(paths.indexOf('assets/shift-handover-core-v1.js')<paths.indexOf('assets/shift-handover-v1.js'));
});
test('authentication waits for both base modules and the complete deferred page',async()=>{
 const scripts=[],calls=[];let ready;const pageReady=new Promise(r=>ready=r),document={scripts,createElement:()=>({}),body:{appendChild:s=>scripts.push(s)}};
 vm.runInNewContext(read('assets/conflict-plausibility-v1.js'),{window:{SFPageReady:pageReady,SFBackend:{init:()=>calls.push('init')}},document,location:{href:'https://schichtfunk.de/'},URL,console});
 scripts.forEach(s=>s.onload());assert.deepEqual(calls,[]);ready();await new Promise(r=>setImmediate(r));assert.deepEqual(calls,['init']);
});
function navigation(demo){const scripts=[],styles=[],document={getElementById:()=>null,querySelector:()=>null,addEventListener(){},createElement:()=>({setAttribute(){}}),head:{appendChild:n=>(n.rel?styles:scripts).push(n)}};vm.runInNewContext(read('assets/navigation-compat-v1.js'),{window:{},document,sessionStorage:{getItem:()=>demo?'active':null},setTimeout(){},console});return{scripts,styles}}
test('production does not request inactive demo-only modules',()=>{const {scripts}=navigation(false);assert.ok(scripts.length>15);assert.equal(scripts.filter(s=>/\/(demo-reset|demo-august|demo-datev|demo-qr)/.test(s.src)).length,0)});
test('active demos retain ordered demo data and the QR bridge before terminal integrations',()=>{const {scripts}=navigation(true),paths=scripts.map(s=>s.src);assert.equal(paths.filter(s=>/\/(demo-reset|demo-august|demo-datev|demo-qr)/.test(s)).length,4);assert.ok(paths.findIndex(s=>s.includes('demo-august'))<paths.findIndex(s=>s.includes('demo-datev')));assert.ok(paths.findIndex(s=>s.includes('demo-qr-local'))<paths.findIndex(s=>s.includes('supabase-qr-terminal-admin')));assert.ok(scripts.every(s=>s.async===false))});
test('demo injected scripts retain their position after the deferred application scripts',()=>{const s=read('demo.html'),chain=s.slice(s.indexOf("const loader='"),s.indexOf("';",s.indexOf("const loader='")));assert.ok(chain.includes('demo-marketplace-v1'));assert.equal([...chain.matchAll(/<script(.*?)src=/g)].filter(m=>!m[1].includes('defer')).length,0)});
test('QR terminal uses its single native module import and legal/completion pages load no application modules',()=>{const qr=read('qr-time.html');assert.equal([...qr.matchAll(/<script\b/g)].length,1);assert.match(qr,/<script type="module">/);for(const p of ['impressum.html','datenschutz.html','demo-abschluss.html'])assert.doesNotMatch(read(p),/conflict-plausibility|navigation-compat|supabase-auth-v1/)});
