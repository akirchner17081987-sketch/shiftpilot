import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
const html=fs.readFileSync(new URL('../qr-time.html',import.meta.url),'utf8');
const helper=fs.readFileSync(new URL('../assets/qr-pause-total-v1.js',import.meta.url),'utf8').replace(/^export /gm,'');
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^import .*;$/gm,'');
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve()};
function fixture(initial='READY'){
  const baseline=Date.parse('2026-10-06T04:00:00Z');let now=baseline,fail='',hang='',statusOffline=false,rejectAction=false;
  let server={ok:true,state:initial,name:'Fiktive Testperson',terminal_name:'Fiktiver Standort',started_at:initial==='READY'?null:new Date(now-5*3600000).toISOString(),ended_at:null,breaks:[]};
  const elements=new Map(),intervals=new Map(),timeouts=new Map(),events={},requests=[],saved=new Map();let timerId=0,punches=0;
  const get=id=>{if(!elements.has(id))elements.set(id,{hidden:id==='clock',disabled:false,value:'',textContent:'',className:'',handlers:{},addEventListener(event,fn){this.handlers[event]=fn},replaceChildren(){},append(){}});return elements.get(id)};
  class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
  const context=vm.createContext({document:{getElementById:get,createElement:()=>({append(){}}),addEventListener(name,fn){events[name]=fn},hidden:false},location:{search:'?t='+'e'.repeat(64)},URLSearchParams,Intl,Date:Clock,performance:{now:()=>now-baseline},AbortController,crypto:webcrypto,Uint8Array,
    setTimeout(fn,ms){const id=++timerId;timeouts.set(id,{fn,at:now+ms});return id},clearTimeout(id){timeouts.delete(id)},setInterval(fn){const id=++timerId;intervals.set(id,fn);return id},clearInterval(id){intervals.delete(id)},
    fetch:async(_url,options)=>{
      const body=JSON.parse(options.body);requests.push(body);const action=body.action;
      const reply=(data,status=200)=>({ok:status===200,status,json:async()=>data});
      if(action==='LOGIN')return reply({ok:true,sessionToken:'f'.repeat(64)});
      if(action===hang)return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('Aborted')),{once:true}));
      if(action==='STATUS'&&statusOffline)throw new TypeError('Fiktiv offline');
      if(rejectAction&&action!=='STATUS')return reply({ok:false,error:'Anmeldung abgelaufen. Bitte erneut anmelden'},401);
      if(action!=='STATUS'&&!saved.has(body.requestId)){
        punches++;const stamp=new Date(now).toISOString();saved.set(body.requestId,{action,stamp});
        if(action==='CLOCK_IN')server={...server,state:'RUNNING',started_at:stamp,ended_at:null,breaks:[]};
        if(action==='CLOCK_OUT')server={...server,state:'READY',ended_at:stamp};
        if(action==='BREAK_START'){server.state='BREAK';server.breaks.push({number:server.breaks.length+1,started_at:stamp,ended_at:null})}
        if(action==='BREAK_END'){server.state='RUNNING';server.breaks.at(-1).ended_at=stamp}
      }
      if(action===fail){fail='';throw new TypeError('Fiktiv: Antwort nach Speicherung verloren')}
      const stored=saved.get(body.requestId);
      return reply({...server,as_of:new Date(now).toISOString(),punched_at:action==='STATUS'?null:stored?.stamp,request_processed:!!stored,processed_action:stored?.action,processed_at:stored?.stamp});
    }});
  vm.runInContext(helper+'\n'+script,context);
  return{get,requests,punches:()=>punches,loss:x=>fail=x,hang:x=>hang=x,offline:x=>statusOffline=x,expire:()=>rejectAction=true,
    async click(id){await get(id).handlers.click();await flush()},async login(){get('personnel').value='FIKTIV';get('startDate').value='15012020';await get('login').handlers.submit({preventDefault(){}})},
    async advance(ms){now+=ms;for(const [id,t] of timeouts)if(t.at<=now){timeouts.delete(id);t.fn()}for(const fn of intervals.values())fn();await flush()},
    externalClose(){server={...server,state:'READY',ended_at:new Date(now).toISOString()}},async foreground(){events.visibilitychange();await flush()}};
}
test('lost clock-in response is confirmed from its exact request without a second punch',async()=>{
  const h=fixture();await h.login();h.loss('CLOCK_IN');await h.click('start');
  assert.equal(h.get('state').textContent,'Arbeitszeit läuft');assert.equal(h.get('start').hidden,true);assert.match(h.get('message').textContent,/gespeichert.*geprüft/);
  assert.equal(h.punches(),1);assert.equal(h.requests.at(-1).action,'STATUS');assert.equal(h.requests.at(-1).requestId,h.requests.at(-2).requestId);
});
test('lost clock-out response stops the attendance counter at the saved end',async()=>{
  const h=fixture('RUNNING');await h.login();h.loss('CLOCK_OUT');await h.click('end');await h.advance(60000);
  assert.equal(h.get('state').textContent,'Dienst beendet');assert.equal(h.get('attendanceTotal').textContent,'05:00:00');assert.equal(h.punches(),1);
});
test('unknown outcome blocks new punches, offers status and retry, and keeps logout usable',async()=>{
  const h=fixture();await h.login();h.loss('CLOCK_IN');h.offline(true);await h.click('start');
  assert.equal(h.get('state').textContent,'Buchungsstatus ungeklärt');assert.equal(h.get('start').disabled,true);assert.equal(h.get('retryBooking').hidden,false);assert.equal(h.get('logout').disabled,false);
  assert.doesNotMatch(h.get('message').textContent,/Uhr gespeichert/);
  const id=h.requests.find(r=>r.action==='CLOCK_IN').requestId;
  h.offline(false);await h.click('retryBooking');assert.equal(h.punches(),1);assert.equal(h.requests.at(-1).requestId,id);assert.equal(h.get('state').textContent,'Arbeitszeit läuft');
});
test('twenty-second timeout releases status/retry controls and never confirms an unanswered punch',async()=>{
  const h=fixture('RUNNING');await h.login();h.hang('CLOCK_OUT');const pending=h.click('end');await flush();await h.advance(20000);await pending;
  assert.equal(h.get('state').textContent,'Buchungsstatus ungeklärt');assert.equal(h.get('end').disabled,true);assert.equal(h.get('statusRefresh').disabled,false);assert.equal(h.get('logout').disabled,false);
  assert.equal(h.punches(),0);h.hang('');await h.click('retryBooking');assert.equal(h.punches(),1);assert.equal(h.get('state').textContent,'Dienst beendet');
});
test('a successful status read alone does not invent confirmation of an unprocessed request',async()=>{
  const h=fixture();await h.login();h.hang('CLOCK_IN');const pending=h.click('start');await flush();await h.advance(20000);await pending;
  assert.equal(h.get('start').disabled,true);assert.match(h.get('message').textContent,/noch nicht bestätigt/);assert.equal(h.get('retryBooking').hidden,false);
});
test('a later status retry confirms a stored punch and releases normal controls',async()=>{
  const h=fixture();await h.login();h.loss('CLOCK_IN');h.offline(true);await h.click('start');h.offline(false);await h.click('statusRefresh');
  assert.equal(h.get('pauseStart').disabled,false);assert.equal(h.get('retryBooking').hidden,true);assert.match(h.get('message').textContent,/gespeichert/);assert.equal(h.punches(),1);
});
test('expired login keeps its explanation and does not retry any punch',async()=>{
  const h=fixture('RUNNING');await h.login();h.expire();await h.click('pauseStart');
  assert.equal(h.get('clock').hidden,true);assert.match(h.get('message').textContent,/Anmeldung abgelaufen/);assert.equal(h.punches(),0);
});
test('foreground refresh stops a booking ended on another device',async()=>{
  const h=fixture('RUNNING');await h.login();h.externalClose();await h.foreground();await h.advance(60000);
  assert.equal(h.get('state').textContent,'Dienst beendet');assert.equal(h.get('attendanceTotal').textContent,'05:00:00');assert.equal(h.requests.at(-1).action,'STATUS');
});
test('logout aborts an in-flight request and late handlers cannot restore a clock view',async()=>{
  const h=fixture('RUNNING');await h.login();h.hang('CLOCK_OUT');const pending=h.click('end');await flush();await h.click('logout');await pending;
  assert.equal(h.get('clock').hidden,true);assert.equal(h.get('login').hidden,false);assert.equal(h.get('name').textContent,'');assert.equal(h.get('loginButton').disabled,false);
});
