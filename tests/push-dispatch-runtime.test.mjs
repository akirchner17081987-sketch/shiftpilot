import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';

const root=new URL('../',import.meta.url);
const source=fs.readFileSync(new URL('supabase/functions/push-dispatch/index.ts',root),'utf8');
const id='00000000-0000-4000-8000-000000000001';
const sub=(n,endpoint='https://fcm.example.invalid/')=>({id:n,endpoint:endpoint+n,p256dh:'fake',auth_key:'fake',user_agent:'Chrome'});
async function dispatch(options={}){
 const calls=[],marks=[],deleted=[];
 const notification={id,company_id:id,user_id:id,kind:'ABSENCE_CONFLICT',title:'Fiktiver Test',message:'Fiktive Nachricht',link_view:'employee-shifts',...options.notification};
 const admin={
  async rpc(name,args){calls.push({name,args});if(name==='server_get_push_config')return {data:[{webhook_secret:'test-secret',vapid_public_key:'fake',vapid_private_key:'fake',vapid_subject:'https://schichtfunk.de/'}]};if(name==='server_push_recipient_active')return {data:options.active!==false,error:options.accessError};if(name==='server_mark_push_dispatch')marks.push(args);return {data:true};},
  from(table){let removing=false;const q={select(){return q},eq(){return q},delete(){removing=true;return q},in(k,v){deleted.push(...v);return Promise.resolve({error:null})},maybeSingle(){return Promise.resolve({data:table==='notifications'?(options.missing?null:notification):table==='employees'?{id}:null})},then(resolve,reject){return Promise.resolve({data:table==='push_subscriptions'?(options.subs??[sub(1)]):[]}).then(resolve,reject)}};return q;}
 };
 const context={Response,Request,Headers,URL,Uint8Array,AbortSignal,crypto,btoa,console,Deno:{env:{get:()=>undefined}},withSupabase:(_,handler)=>req=>handler(req,{supabaseAdmin:admin}),generateVapidKeys:()=>({}),
  sendPushBatch:async(subs,payload,vapid,settings)=>{calls.push({provider:'legacy',subs,payload,settings});if(options.throwSend)throw new Error('provider down');return options.result??{delivered:subs.length,gone:[],failed:[]};},
  buildPushPayload:async(payload,subscription,vapid)=>{calls.push({provider:'apple',payload,subscription});return {headers:{},body:'encrypted-test'};},
  fetch:async(url,init)=>{calls.push({provider:'fetch',url,contentType:init.headers.get('content-type')});return new Response('',{status:options.appleStatus??201});}
 };
 const js=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'').replace('export default {fetch:handler};','globalThis.handler=handler;'));
 vm.runInNewContext(js,context);
 const response=await context.handler(new Request('https://example.invalid/',{method:options.method??'POST',headers:{'x-schichtfunk-push-secret':options.secret??'test-secret'},...((options.method??'POST')==='GET'?{}:{body:options.body??JSON.stringify({notification_id:id})})}));
 return {status:response.status,body:await response.json(),calls,marks,deleted};
}
test('dispatcher rejects missing secret, malformed payload and missing notification before delivery',async()=>{
 for(const [options,status] of [[{method:'GET'},405],[{secret:'wrong'},401],[{body:'{'},400],[{body:'{"notification_id":"wrong"}'},400],[{missing:true},404]]){const r=await dispatch(options);assert.equal(r.status,status);assert.equal(r.calls.filter(c=>c.provider).length,0);}
});
test('disabled/deleted/cross-company recipient gate prevents sends even with an old subscription',async()=>{
 const r=await dispatch({active:false});assert.equal(r.body.reason,'INACTIVE_ACCOUNT');assert.equal(r.marks[0].p_status,'SKIPPED');assert.equal(r.calls.filter(c=>c.provider).length,0);
 const denied=await dispatch({accessError:new Error('database unavailable')}).catch(error=>error);assert.match(denied.message,/database unavailable/);
});
test('active employee receives canonical route, high urgency and bounded provider timeouts',async()=>{
 const r=await dispatch();assert.equal(r.body.status,'SENT');const send=r.calls.find(c=>c.provider==='legacy');assert.equal(send.payload.url,'/?sf_push_view=employee-shifts#app');assert.equal(send.settings.urgency,'high');assert.equal(send.settings.timeoutMs,12000);assert.equal(send.settings.concurrency,20);assert.equal(r.marks[0].p_delivered,1);
});
test('no devices skips; expired subscriptions are removed; partial and failed sends are recorded',async()=>{
 assert.equal((await dispatch({subs:[]})).body.status,'SKIPPED');
 const expired=sub(2);let r=await dispatch({subs:[sub(1),expired],result:{delivered:1,gone:[expired.endpoint],failed:[]}});assert.equal(r.body.status,'SENT');assert.deepEqual(r.deleted,[expired.endpoint]);
 r=await dispatch({result:{delivered:1,gone:[],failed:[{endpoint:'fake',error:'503'}]}});assert.equal(r.body.status,'PARTIAL');assert.equal(r.marks[0].p_failed,1);
 r=await dispatch({throwSend:true});assert.equal(r.status,502);assert.equal(r.marks[0].p_status,'FAILED');
});
test('modern Apple uses declarative push; older Apple stays on standard payload',async()=>{
 const apple={...sub(2,'https://web.push.apple.com/'),'user_agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X)'};
 let r=await dispatch({subs:[sub(1),apple]});assert.equal(r.body.declarative,1);assert.equal(r.body.legacy,1);assert.equal(r.body.delivered,2);const payload=r.calls.find(c=>c.provider==='apple').payload;assert.equal(payload.data.web_push,8030);assert.equal(payload.data.notification.navigate,'https://schichtfunk.de/?sf_push_view=employee-shifts#app');assert.equal(r.calls.find(c=>c.provider==='fetch').contentType,'application/notification+json');
 r=await dispatch({subs:[{...apple,user_agent:apple.user_agent.replace('18_4','18_3')}]});assert.equal(r.body.legacy,1);assert.equal(r.body.declarative,0);
 r=await dispatch({subs:[apple],appleStatus:410});assert.equal(r.body.status,'SKIPPED');assert.equal(r.deleted.length,1);
});
test('service worker displays legacy and declarative notifications and reopens the app',async()=>{
 const listeners={},shown=[],opened=[];const self={location:{origin:'https://schichtfunk.de'},addEventListener:(name,fn)=>listeners[name]=fn,registration:{showNotification:async(...args)=>shown.push(args)},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
 vm.runInNewContext(fs.readFileSync(new URL('schichtfunk-sw.js',root),'utf8'),{self,URL});
 for(const data of [{title:'Test',body:'Nachricht',url:'/?sf_push_view=employee-shifts#app'},{web_push:8030,notification:{title:'Apple',body:'Nachricht',navigate:'https://schichtfunk.de/#app'}}]){let done;listeners.push({data:{json:()=>data},waitUntil:p=>done=p});await done;assert.equal(shown.at(-1)[1].body,'Nachricht');let click;listeners.notificationclick({notification:{close(){},data:shown.at(-1)[1].data},waitUntil:p=>click=p});await click;}
 assert.deepEqual(opened,['https://schichtfunk.de/?sf_push_view=employee-shifts#app','https://schichtfunk.de/#app']);
});
