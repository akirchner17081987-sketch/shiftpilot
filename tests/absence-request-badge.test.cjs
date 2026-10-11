const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../assets/supabase-absence-manager-v2.js'),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function environment(){
  const nodes=new Map(),intervals=[],events={},queries=[],badge={textContent:'0',style:{display:'none'}},page={classList:{contains:()=>false},querySelector:()=>null,prepend(node){nodes.set(node.id,node)}};
  const element=()=>({dataset:{},classList:{toggle(){}},querySelectorAll:()=>[],remove(){nodes.delete(this.id)}});
  let response=async()=>({data:[]}),clock=100000,updates=0;
  const client={from(table){const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},order(){queries.push({table,filters});return response()}};return q}};
  const B={ready:false,companyId:'company-a',user:{id:'owner'},role:'OWNER',client,updateState(){updates++;return 'updated'}};
  const document={hidden:false,head:{appendChild(node){nodes.set(node.id,node)}},createElement:element,getElementById:id=>id==='view-absence'?page:nodes.get(id),querySelector:selector=>selector.includes('data-view="absence"')?badge:null,addEventListener(type,fn){events[type]=fn}};
  vm.runInNewContext(source,{window:{SFBackend:B},document,Date:class extends Date{static now(){return clock}},console:{error(){}},setTimeout(){},setInterval(fn){intervals.push(fn)}});
  return {B,badge,queries,nodes,events,setResponse(fn){response=fn},async tick(){intervals.forEach(fn=>fn());await settle()},advance(){clock+=61000},updates:()=>updates};
}
test('a login completed after initial timers still loads the absence counter on any page',async()=>{
  const e=environment();await e.tick();assert.equal(e.queries.length,0);
  e.B.ready=true;assert.equal(e.B.updateState(),'updated');await settle();
  assert.equal(e.updates(),1);assert.equal(e.queries.length,1);assert.equal(e.badge.style.display,'none');
  assert.deepEqual(e.queries[0].filters,[['company_id','company-a'],['request_source','EMPLOYEE'],['status','Beantragt']]);
});
test('only loaded open requests produce a badge; clearing requests hides it',async()=>{
  const e=environment();e.B.ready=true;e.setResponse(async()=>({data:[{id:'a',status:'Beantragt'},{id:'b',status:'Beantragt'}]}));
  await e.B.renderAbsenceManagerV2();assert.equal(e.badge.textContent,'2');assert.equal(e.badge.style.display,'inline-flex');assert.match(e.badge.title,/alle Zeiträume/);
  e.setResponse(async()=>({data:[]}));await e.B.renderAbsenceManagerV2();assert.equal(e.badge.style.display,'none');assert.equal(e.badge.textContent,'0');
});
test('pending responses cannot restore another company or signed-out user counter',async()=>{
  for(const change of [e=>e.B.companyId='company-b',e=>e.B.user={id:'other'},e=>e.B.ready=false,e=>e.B.role='TIME_TRACKING']){
    const e=environment();e.B.ready=true;let resolve;e.setResponse(()=>new Promise(r=>resolve=r));
    const pending=e.B.renderAbsenceManagerV2();change(e);e.B.updateState();
    resolve({data:[{id:'old',status:'Beantragt'}]});await pending;
    assert.equal(e.badge.style.display,'none');assert.equal(e.nodes.has('sfAbsenceManagerV2'),false);
  }
});
test('the counter refreshes outside the absence page without querying every timer tick',async()=>{
  const e=environment();e.B.ready=true;await e.B.renderAbsenceManagerV2();await e.tick();assert.equal(e.queries.length,1);
  e.setResponse(async()=>({data:[{id:'new',status:'Beantragt'}]}));e.advance();await e.tick();assert.equal(e.queries.length,2);assert.equal(e.badge.textContent,'1');
});
test('a failed refresh clears stale counts and retries without showing a fabricated result',async()=>{
  const e=environment();e.B.ready=true;e.setResponse(async()=>({data:[{id:'a',status:'Beantragt'}]}));await e.B.renderAbsenceManagerV2();
  e.setResponse(async()=>({error:new Error('offline')}));await e.B.renderAbsenceManagerV2();assert.equal(e.badge.style.display,'none');assert.equal(e.nodes.has('sfAbsenceManagerV2'),false);
  e.setResponse(async()=>({data:[]}));await e.tick();assert.equal(e.badge.style.display,'none');assert.equal(e.nodes.has('sfAbsenceManagerV2'),true);
});
