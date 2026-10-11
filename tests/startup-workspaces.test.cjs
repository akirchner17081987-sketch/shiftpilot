const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const flush=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
function harness({demo=false,role='OWNER'}={}){
 const nodes=new Map(),events=[];
 function element(id){
  const classes=new Set(),attrs=new Map(),styles=new Map(),children=new Map();
  const e={id,isConnected:true,inert:false,textContent:'',classList:{add:(...a)=>a.forEach(c=>classes.add(c)),remove:(...a)=>a.forEach(c=>classes.delete(c)),contains:c=>classes.has(c)},style:{setProperty:(k,v)=>styles.set(k,v)},styles,attrs,children,
   setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),remove(){e.isConnected=false;nodes.delete(e.id)},
   querySelector(sel){if(!children.has(sel))children.set(sel,element(sel));return children.get(sel)},prepend(child){nodes.set(child.id,child)},appendChild(child){nodes.set(child.id,child)}};
  nodes.set(id,e);return e;
 }
 for(const id of ['appShell','content','sidebar','topbar','view-overview','landingPage','company-name'])element(id);
 const B={ready:false,role,client:{auth:{getSession:async()=>({data:{session:{user:{id:'alex'}}}})}},user:null,companyId:null,pendingView:'overview',
  showLoading:t=>events.push(['loading',t]),hideLoading:()=>events.push(['hide']),closeAuth:()=>events.push(['close-auth']),
  ensureCompany:async()=>{events.push(['company']);B.companyId='company-a'},importLegacy:async()=>{},clearLegacy:()=>{},installStoreBridge:()=>events.push(['store']),
  hydrate:async()=>{},hydrateTimeOnly:async()=>{},updateState:()=>{},baseOpenApp:view=>events.push(['open',view]),finishSignOut(){B.ready=false;B.user=null;B.companyId=null;nodes.get('appShell').style.setProperty('display','none')},
  installMfaRpcRetry(){},enforcePrivilegedMfaEnrollment:async()=>{},requireMfaChallenge:async()=>{events.push(['mfa'])}};
 const document={head:{appendChild:n=>nodes.set(n.id,n)},getElementById:id=>nodes.get(id)||null,createElement:()=>element('created-'+nodes.size),
  querySelector:sel=>sel==='#appShell .content'?nodes.get('content'):sel==='.company-card b'?nodes.get('company-name'):null,
  querySelectorAll:()=>['sidebar','topbar','view-overview'].map(id=>nodes.get(id))};
 const c={SFBackend:B,document,sessionStorage:{getItem:()=>demo?'active':null},location:{reload:()=>events.push(['reload'])},performance:{now:()=>100},console:{error:()=>{}},alert:t=>events.push(['alert']),setTimeout,clearTimeout,
  switchView:view=>events.push(['view',view]),showSaveToast:(...a)=>events.push(['toast',...a])};c.window=c;vm.createContext(c);
 vm.runInContext(read('assets/supabase-startup-v1.js'),c);
 const data=read('assets/supabase-data-v1.js');vm.runInContext('const B=SFBackend;'+data.slice(data.indexOf('  B.boot='),data.lastIndexOf('\n})();')),c);
 const mfa=read('assets/supabase-mfa-v1.js');vm.runInContext(mfa.slice(mfa.indexOf('  function wrapBoot(){'),mfa.lastIndexOf('\n})();')),c);
 B.installStartupNavigation();return{B,c,nodes,events};
}
test('the visible shell waits for MFA and membership, but does not wait for hydration',async()=>{
 const h=harness(),mfa=deferred(),data=deferred(),modules=deferred();
 h.B.requireMfaChallenge=()=>mfa.promise;h.B.hydrate=()=>data.promise;h.B.prepareManagerModules=()=>{h.events.push(['modules']);return modules.promise};
 const boot=h.B.boot({user:{id:'alex'}});await flush();assert.equal(h.B.shellReady,undefined);assert.equal(h.events.some(e=>e[0]==='company'),false);
 mfa.resolve();await flush();assert.equal(h.B.shellReady,true);assert.equal(h.B.ready,false);assert.equal(h.nodes.get('appShell').styles.get('display'),'grid');assert.equal(h.nodes.get('appShell').classList.contains('sf-startup-pending'),true);assert.equal(h.nodes.get('sidebar').inert,true);assert.equal(h.nodes.get('view-overview').inert,true);
 assert.ok(h.events.some(e=>e[0]==='modules'));data.resolve();await flush();assert.equal(h.B.ready,false,'Core modules must also finish');modules.resolve();await boot;
 assert.equal(h.B.ready,true);h.B.finishStartup();assert.equal(h.nodes.has('sfStartupStatus'),false);assert.equal(h.nodes.get('sidebar').inert,false);assert.equal(h.nodes.get('appShell').classList.contains('sf-startup-pending'),false);assert.equal(h.c.SFStartupMetrics.dataReadyMs,0);
});
test('no session, employee and local demo never get an early manager shell',()=>{
 for(const options of [{},{role:'EMPLOYEE'},{demo:true}]){const h=harness(options);if(options.role||options.demo){h.B.user={id:'alex'};h.B.companyId='company-a'}h.B.beginStartup();assert.equal(h.B.shellReady,undefined);assert.equal(h.nodes.has('sfStartupStatus'),false)}
});
test('bootstrap errors retain the protected loading surface and expose retry',async()=>{
 const h=harness();h.B.hydrate=async()=>{throw Error('offline')};await assert.rejects(h.B.boot({user:{id:'alex'}}),/offline/);
 assert.equal(h.B.ready,false);assert.equal(h.nodes.get('sidebar').inert,true);assert.equal(h.nodes.get('sfStartupStatus').querySelector('h2').textContent,'Daten konnten nicht geladen werden');
 h.nodes.get('sfStartupStatus').querySelector('[data-startup-reload]').onclick();assert.ok(h.events.some(e=>e[0]==='reload'));h.B.baseOpenApp('auto');assert.equal(h.events.some(e=>e[0]==='open'),false);
});
test('logout during bootstrap prevents late data from reopening the application',async()=>{
 const h=harness(),data=deferred();h.B.hydrate=()=>data.promise;const boot=h.B.boot({user:{id:'alex'}});await flush();assert.equal(h.B.shellReady,true);
 h.B.__explicitSignOut=true;h.B.finishSignOut(true);data.resolve();await boot;h.B.baseOpenApp('overview');assert.equal(h.B.ready,false);assert.equal(h.B.shellReady,false);assert.equal(h.events.some(e=>e[0]==='open'),false);assert.equal(h.nodes.get('appShell').styles.get('display'),'none');
});
test('only the most recent requested workspace opens after its scripts finish',async()=>{
 const h=harness(),personnel=deferred(),time=deferred();h.B.ready=true;h.B.user={id:'alex'};h.B.companyId='company-a';
 h.B.managerViewNeedsLoading=v=>['employees','time'].includes(v);h.B.ensureManagerViewModules=v=>v==='employees'?personnel.promise:time.promise;
 const p=h.c.switchView('employees'),t=h.c.switchView('time');personnel.resolve();await p;assert.equal(h.events.some(e=>e[0]==='view'),false);time.resolve();await t;assert.deepEqual(h.events.filter(e=>e[0]==='view'),[['view','time']]);assert.equal(h.nodes.has('sfStartupStatus'),false);
});
test('an immediately available view cancels an older lazy navigation',async()=>{
 const h=harness(),data=deferred();h.B.ready=true;h.B.user={id:'alex'};h.B.companyId='company-a';h.B.managerViewNeedsLoading=v=>v==='employees';h.B.ensureManagerViewModules=()=>data.promise;
 const p=h.c.switchView('employees');h.c.switchView('schedule');data.resolve();await p;assert.deepEqual(h.events.filter(e=>e[0]==='view'),[['view','schedule']]);
});
test('lazy completion cannot navigate after logout or a tenant change',async()=>{
 for(const action of ['logout','company']){const h=harness(),data=deferred();h.B.ready=true;h.B.user={id:'alex'};h.B.companyId='company-a';h.B.managerViewNeedsLoading=()=>true;h.B.ensureManagerViewModules=()=>data.promise;
 const p=h.c.switchView('employees');if(action==='logout')h.B.finishSignOut(true);else h.B.companyId='company-b';data.resolve();await p;assert.equal(h.events.some(e=>e[0]==='view'),false)}
});
test('a lazy module failure never opens an incomplete workspace and offers a page reload',async()=>{
 const h=harness();h.B.ready=true;h.B.user={id:'alex'};h.B.companyId='company-a';h.B.managerViewNeedsLoading=()=>true;h.B.ensureManagerViewModules=async()=>{throw Error('asset failed')};
 await h.c.switchView('time');assert.equal(h.events.some(e=>e[0]==='view'),false);assert.equal(h.nodes.get('sfStartupStatus').querySelector('h2').textContent,'Bereich konnte nicht geladen werden');
 h.nodes.get('sfStartupStatus').querySelector('[data-startup-reload]').onclick();assert.ok(h.events.some(e=>e[0]==='reload'));
 h.B.managerViewNeedsLoading=()=>false;h.c.switchView('schedule');assert.deepEqual(h.events.filter(e=>e[0]==='view'),[['view','schedule']]);assert.equal(h.nodes.has('sfStartupStatus'),false);
});
