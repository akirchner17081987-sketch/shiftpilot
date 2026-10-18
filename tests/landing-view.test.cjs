const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup({area='',demo=false,blocked=false}={}){
 const storage=new Map([['sf_active_view_v1','schedule'],['sf_workspace_state_v2',JSON.stringify({view:'schedule',personnelOpen:true,personnelTab:'private'})]]);if(demo)storage.set('sf_demo_session_v1','active');
 const timers=[],events={},calls=[];let active='schedule';
 const B={ready:false,role:'OWNER',pendingView:'overview',authDialog:mode=>calls.push(mode)};
 const nodes=new Map(['overview','schedule','employees','time'].map(v=>['view-'+v,{id:'view-'+v}]));
 const document={visibilityState:'visible',getElementById:id=>nodes.get(id)||null,querySelector:selector=>selector==='.view.active[id^="view-"]'?nodes.get('view-'+active):null,addEventListener:(name,fn)=>(events[name]||=[]).push(fn)};
 const context={SFBackend:B,document,URLSearchParams,location:{search:area?'?bereich='+area:''},sessionStorage:{getItem:key=>{if(blocked)throw Error('blocked');return storage.get(key)||null},setItem:(key,value)=>{if(blocked)throw Error('blocked');storage.set(key,value)}},setTimeout:fn=>timers.push(fn),setInterval(){},addEventListener:(name,fn)=>(events[name]||=[]).push(fn),switchView:view=>active=view,console,getComputedStyle:()=>({display:'grid'})};context.window=context;
 vm.createContext(context);for(const file of ['view-state-v1.js','workspace-state-v2.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets',file),'utf8'),context);
 return{B,storage,calls,context,active:()=>active,setActive:view=>active=view,emit:name=>(events[name]||[]).forEach(fn=>fn()),flush(){for(const fn of timers.splice(0))fn()}};
}
test('new management login replaces a saved planning view with Today before hydration',()=>{
 const h=setup();assert.equal(h.B.pendingView,'overview');assert.equal(h.storage.get('sf_active_view_v1'),'overview');
 assert.equal(JSON.parse(h.storage.get('sf_workspace_state_v2')).view,'overview');assert.equal(JSON.parse(h.storage.get('sf_workspace_state_v2')).personnelOpen,false);
 h.flush();h.emit('blur');h.B.workspaceState.restore();assert.equal(h.B.pendingView,'overview','the unready HTML planning view cannot overwrite the login landing');
});
test('tab focus and refresh within an active management session retain Planning',()=>{
 const h=setup();h.B.ready=true;h.setActive('overview');h.context.switchView('schedule');h.emit('blur');h.setActive('overview');h.emit('focus');h.flush();
 assert.equal(h.active(),'schedule');assert.equal(h.B.pendingView,'schedule');assert.equal(h.storage.get('sf_active_view_v1'),'schedule');
});
test('a new login on the same document starts on Today again',()=>{
 const h=setup();h.B.ready=true;h.context.switchView('employees');h.B.ready=false;h.B.authDialog('login');h.flush();
 assert.deepEqual(h.calls,['login']);assert.equal(h.B.pendingView,'overview');assert.equal(JSON.parse(h.storage.get('sf_workspace_state_v2')).view,'overview');
});
test('explicit time-account entry retains its intended route',()=>{const h=setup({area:'zeitkonto'});assert.equal(h.B.pendingView,'time');assert.equal(h.storage.get('sf_active_view_v1'),'time')});
test('employee workspace cannot overwrite management state with a hidden legacy view',()=>{const h=setup();h.B.ready=true;h.B.role='EMPLOYEE';h.flush();h.emit('blur');assert.equal(h.B.pendingView,'overview');assert.equal(h.storage.get('sf_active_view_v1'),'overview')});
test('local demo still restores its saved workspace',()=>{const h=setup({demo:true});assert.equal(h.B.pendingView,'schedule');assert.equal(h.storage.get('sf_active_view_v1'),'schedule')});
test('unavailable browser storage does not block the Today landing',()=>{const h=setup({blocked:true});assert.equal(h.B.pendingView,'overview');h.B.authDialog('login');assert.deepEqual(h.calls,['login'])});

test('the document load entry starts managers on Today and keeps explicit time-account links',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),start=html.indexOf("window.addEventListener('load',()=>{\n  if(location.hash!=='#app')return;"),end=html.indexOf('\n})',start)+3;
 assert.ok(start>0);for(const [area,expected] of [['','overview'],['verwaltung','overview'],['zeitkonto','time']]){
  const calls=[],storage=new Map([['sf_active_view_v1','schedule'],['sf_workspace_state_v2','{"view":"schedule"}']]);
  const context={window:{addEventListener:(_,callback)=>callback()},location:{hash:'#app',search:area?'?bereich='+area:''},URLSearchParams,sessionStorage:{getItem:key=>storage.get(key)||null},document:{getElementById:()=>({})},openApp:view=>calls.push(view)};
  vm.runInNewContext(html.slice(start,end),context);assert.deepEqual(calls,[expected]);
 }
});
